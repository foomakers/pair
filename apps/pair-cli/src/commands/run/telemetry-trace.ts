import { existsSync, readFileSync } from 'fs'
import { hostname } from 'os'
import {
  appendTelemetry,
  parseTelemetryLine,
  telemetryFile,
  type EngineObservation,
  type TelemetryKind,
  type TelemetryRecord,
} from './telemetry'
import { costOf, type Prices } from './telemetry-policy'

/** Envelope version. v1 = the legacy `stage`/`card` records, which carry no `schema`. */
export const TELEMETRY_SCHEMA = 2

const KEYS = [
  'run',
  'card',
  'epic',
  'pr',
  'branch',
  'step',
  'phase',
  'block',
  'round',
  'group',
  'engine',
  'model',
  'effort',
  'profile',
  'tier',
  'outcome',
  'cause',
] as const
export type EnvelopeKeys = { [K in (typeof KEYS)[number]]?: string | number | undefined }

/** C2: every v2 record carries every key (null when n/a); extras can never shadow them. */
export function envelope(
  head: { readonly kind: TelemetryKind; readonly id: string; readonly ts: number },
  keys: EnvelopeKeys,
  extra: Record<string, unknown> = {},
): TelemetryRecord {
  return {
    ...extra,
    schema: TELEMETRY_SCHEMA,
    id: head.id,
    kind: head.kind,
    ts: new Date(head.ts).toISOString(),
    ...Object.fromEntries(KEYS.map(k => [k, keys[k] ?? null])),
  } as TelemetryRecord
}

export interface StageInfo {
  readonly step: string
  readonly phase?: string | undefined
  readonly engine: string
  readonly model?: string | undefined
  readonly effort?: string | undefined
  readonly context?: string | undefined
  readonly retries: number
  /** The dispatch's own start time, so the v1 `stage` record and this pair share one clock read. */
  readonly startedAt?: number | undefined
  readonly worktree?: string | undefined
  /** Id of the v1 `stage` record written for this dispatch; the `end` supersedes it in card aggregation. */
  readonly legacyId?: string | undefined
}

export interface StageEnd {
  readonly outcome: string
  readonly cause?: string | undefined
  readonly signal?: string | undefined
  readonly observation?: EngineObservation | undefined
  /** The engine's own exit time; defaults to now. */
  readonly at?: number | undefined
}

export interface StageHandle {
  /** Writes the one `end`; a second call is a no-op. */
  close(end: StageEnd): void
}

export interface TraceInit {
  readonly root: string
  readonly run: string
  readonly card: string
  readonly epic?: string | undefined
  readonly branch?: string | undefined
  readonly profile: string
  readonly tier?: string | undefined
  readonly pr?: number | undefined
  /** C1 run context, allow-listed by the caller: never card text, prompts or secrets. */
  readonly context: Readonly<Record<string, unknown>>
  readonly prices: Prices
  readonly now?: () => number
}

const open = new Set<StageHandle & { readonly runKey: string }>()

/** AC-5: one `end` per stage still open when a signal or crash stops the process (synchronous append). */
export function closeOpenStages(cause: string, signal?: string): void {
  for (const handle of [...open]) handle.close({ outcome: 'failed', cause, signal })
}

type EventName = 'recovery-round' | 'park' | 'halt' | 'pr-opened'

export class Trace {
  private pr: number | undefined
  private events = 0
  private round: number | undefined

  constructor(private readonly init: TraceInit) {
    this.pr = init.pr
  }

  private now(): number {
    return (this.init.now ?? Date.now)()
  }

  private keys(
    s?: Partial<StageInfo>,
    outcome?: string,
    cause?: string,
    round: number | undefined = this.round,
  ): EnvelopeKeys {
    const { run, card, epic, branch, profile, tier } = this.init
    const { step, phase, engine, model, effort } = s ?? {}
    return {
      run,
      card,
      epic,
      pr: this.pr,
      branch,
      step,
      phase,
      round,
      engine,
      model,
      effort,
      profile,
      tier,
      outcome,
      cause,
    }
  }

  private write(record: TelemetryRecord): void {
    appendTelemetry(this.init.root, record)
  }

  /** AC-3: `recovery-round`, `park`, `halt`, `pr-opened`. */
  event(name: EventName, extra: Record<string, unknown> = {}, round?: number): void {
    const ts = this.now()
    const id = `${this.init.run}:${this.init.card}:${name}:${ts}.${this.events++}`
    this.write(
      envelope(
        { kind: 'event', id, ts },
        this.keys(undefined, undefined, undefined, round ?? this.round),
        {
          event: name,
          ...extra,
        },
      ),
    )
  }

  /** The round the resolver names for the next stage: carried as the `round` key until it changes. */
  observeRound(next: unknown): void {
    this.round = typeof next === 'number' ? next : undefined
  }

  /** The first PR number a resolve names is the publication; later records carry it as `pr`. */
  observePr(next: unknown): void {
    if (typeof next !== 'number' || this.pr !== undefined) return
    this.pr = next
    this.event('pr-opened', { prNumber: next })
  }

  /** AC-1: the `start` is written before the engine spawns. */
  start(s: StageInfo): StageHandle {
    const ts = s.startedAt ?? this.now()
    const seq = `${s.retries}.${ts}`
    const at = `${this.init.run}:${this.init.card}:${s.step}:${s.phase ?? ''}`
    const startId = `${at}:start:${seq}`
    this.write(
      envelope({ kind: 'start', id: startId, ts }, this.keys(s), {
        ...this.init.context,
        source: 'driver',
        stageContext: s.context ?? null,
        worktree: s.worktree ?? null,
        pid: process.pid,
        host: hostname(),
      }),
    )
    let closed = false
    const handle: StageHandle & { readonly runKey: string } = {
      runKey: this.init.run,
      close: end => {
        if (closed) return
        closed = true
        open.delete(handle)
        this.writeEnd({ at, seq, startId, startTs: ts }, s, end)
      },
    }
    open.add(handle)
    return handle
  }

  private writeEnd(
    ids: { at: string; seq: string; startId: string; startTs: number },
    s: StageInfo,
    end: StageEnd,
  ): void {
    const endTs = end.at ?? this.now()
    const tokens = end.observation?.tokens ?? 'not measured'
    const price = s.model === undefined ? undefined : this.init.prices[s.model]
    this.write(
      envelope(
        { kind: 'end', id: `${ids.at}:end:${ids.seq}`, ts: endTs },
        this.keys(s, end.outcome, end.cause),
        {
          startId: ids.startId,
          source: 'driver',
          signal: end.signal ?? null,
          legacyId: s.legacyId ?? null,
          durationMs: endTs - ids.startTs,
          tokens,
          sessionId: end.observation?.sessionId ?? 'not measured',
          stageContext: s.context ?? null,
          cost: costOf(tokens, price),
        },
      ),
    )
  }
}

export const createTrace = (init: TraceInit): Trace => new Trace(init)

function isDead(pid: number): boolean {
  try {
    process.kill(pid, 0)
    return false
  } catch (error) {
    return (error as NodeJS.ErrnoException).code === 'ESRCH'
  }
}

/**
 * AC-5: an orphan `start` (no `end`) whose pid is dead on THIS host gets one synthetic `end` `lost`, timed at
 * the stage's last record. A live pid or another host is untouched; a second sweep is a no-op (same id).
 */
export function sweepLostStages(root: string, host: string = hostname()): number {
  const path = telemetryFile(root)
  if (!existsSync(path)) return 0
  let records: TelemetryRecord[]
  try {
    records = readFileSync(path, 'utf8')
      .split('\n')
      .flatMap(line => parseTelemetryLine(line) ?? [])
  } catch {
    return 0
  }
  const ended = new Set(records.filter(r => r.kind === 'end').map(r => r['startId']))
  let swept = 0
  for (const start of records) {
    if (start.kind !== 'start' || ended.has(start.id)) continue
    const pid = start['pid']
    if (start['host'] !== host || typeof pid !== 'number' || !isDead(pid)) continue
    const same = (r: TelemetryRecord) =>
      r['run'] === start['run'] &&
      r['card'] === start['card'] &&
      r['step'] === start['step'] &&
      r['phase'] === start['phase']
    const last = Math.max(
      ...records
        .filter(same)
        .map(r => Date.parse(String(r['ts'])))
        .filter(Number.isFinite),
    )
    const keys = Object.fromEntries(KEYS.map(k => [k, start[k]])) as EnvelopeKeys
    appendTelemetry(
      root,
      envelope(
        { kind: 'end', id: start.id.replace(':start:', ':end:'), ts: last },
        { ...keys, outcome: 'failed', cause: 'lost' },
        {
          startId: start.id,
          durationMs: last - Date.parse(String(start['ts'])),
          tokens: 'not measured',
          cost: 'not measured',
        },
      ),
    )
    swept++
  }
  return swept
}

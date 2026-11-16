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
  kind: TelemetryKind,
  id: string,
  ts: number,
  keys: EnvelopeKeys,
  extra: Record<string, unknown> = {},
): TelemetryRecord {
  return {
    ...extra,
    schema: TELEMETRY_SCHEMA,
    id,
    kind,
    ts: new Date(ts).toISOString(),
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

export function createTrace(init: TraceInit) {
  const now = init.now ?? Date.now
  let pr = init.pr
  const keys = (s?: Partial<StageInfo>, outcome?: string, cause?: string): EnvelopeKeys => ({
    run: init.run,
    card: init.card,
    epic: init.epic,
    pr,
    branch: init.branch,
    step: s?.step,
    phase: s?.phase,
    engine: s?.engine,
    model: s?.model,
    effort: s?.effort,
    profile: init.profile,
    tier: init.tier,
    outcome,
    cause,
  })
  const write = (record: TelemetryRecord) => appendTelemetry(init.root, record)
  let events = 0
  const event = (
    name: 'recovery-round' | 'park' | 'halt' | 'pr-opened',
    extra: Record<string, unknown> = {},
  ): void => {
    const ts = now()
    write(
      envelope('event', `${init.run}:${init.card}:${name}:${ts}.${events++}`, ts, keys(), {
        event: name,
        ...extra,
      }),
    )
  }
  return {
    /** AC-3: `recovery-round`, `park`, `halt`, `pr-opened`. */
    event,
    /** The first PR number a resolve names is the publication; later records carry it as `pr`. */
    observePr(next: unknown): void {
      if (typeof next !== 'number' || pr !== undefined) return
      pr = next
      event('pr-opened', { prNumber: next })
    },
    /** AC-1: the `start` is written before the engine spawns. */
    start(s: StageInfo): StageHandle {
      const ts = s.startedAt ?? now()
      const seq = `${s.retries}.${ts}`
      const at = `${init.run}:${init.card}:${s.step}:${s.phase ?? ''}`
      const startId = `${at}:start:${seq}`
      write(
        envelope('start', startId, ts, keys(s), {
          ...init.context,
          stageContext: s.context ?? null,
          worktree: s.worktree ?? null,
          pid: process.pid,
          host: hostname(),
        }),
      )
      let closed = false
      const handle = {
        runKey: init.run,
        close(end: StageEnd): void {
          if (closed) return
          closed = true
          open.delete(handle)
          const endTs = now()
          const tokens = end.observation?.tokens ?? 'not measured'
          write(
            envelope('end', `${at}:end:${seq}`, endTs, keys(s, end.outcome, end.cause), {
              startId,
              signal: end.signal ?? null,
              legacyId: s.legacyId ?? null,
              durationMs: endTs - ts,
              tokens,
              sessionId: end.observation?.sessionId ?? 'not measured',
              stageContext: s.context ?? null,
              cost: costOf(tokens, s.model === undefined ? undefined : init.prices[s.model]),
            }),
          )
        },
      }
      open.add(handle)
      return handle
    },
  }
}

export type Trace = ReturnType<typeof createTrace>

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
      ...records.filter(same).map(r => Date.parse(String(r['ts']))).filter(Number.isFinite),
    )
    const { id, kind: _kind, schema: _schema, ts: _ts, ...rest } = start
    appendTelemetry(
      root,
      envelope(
        'end',
        id.replace(':start:', ':end:'),
        last,
        { ...(rest as EnvelopeKeys), outcome: 'failed', cause: 'lost' },
        { startId: id, durationMs: last - Date.parse(String(start['ts'])), tokens: 'not measured', cost: 'not measured' },
      ),
    )
    swept++
  }
  return swept
}

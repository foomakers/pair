import {
  appendTelemetry,
  cardTelemetryRecord,
  readCardStages,
  readRecords,
  type TelemetryRecord,
} from './telemetry'
import { envelope } from './telemetry-trace'

export interface ManualStepInput {
  readonly root: string
  /** Same switch as the driver (`telemetryEnabled`); false writes nothing. */
  readonly enabled: boolean
  readonly run?: string
  readonly card: string
  readonly pr?: number
  /** Step id of #652 (implement, green-fix, verify, ...). */
  readonly step: string
  readonly phase?: string
  readonly engine: string
  readonly model?: string
  readonly effort?: string
  readonly start: number
  readonly end: number
  /** Absent figures stay absent: never estimated. */
  readonly tokens?: { freshIn: number; cachedIn: number; out: number }
  readonly sessionId?: string
  readonly outcome?: string
}

/** AC-1: one in-session step as a v2 `start`/`end` pair with `source: manual`. Returns false on a write failure. */
export function recordManualStep(i: ManualStepInput): boolean {
  if (!i.enabled) return true
  const at = `${i.run ?? 'manual'}:${i.card}:${i.step}:${i.phase ?? ''}:manual`
  const keys = {
    run: i.run ?? 'manual',
    card: i.card,
    pr: i.pr,
    step: i.step,
    phase: i.phase,
    engine: i.engine,
    model: i.model,
    effort: i.effort,
  }
  const startId = `${at}:start:${i.start}`
  const records: TelemetryRecord[] = [
    envelope({ kind: 'start', id: startId, ts: i.start }, keys, { source: 'manual' }),
    envelope(
      { kind: 'end', id: `${at}:end:${i.start}`, ts: i.end },
      { ...keys, outcome: i.outcome ?? 'ok' },
      {
        source: 'manual',
        startId,
        durationMs: i.end - i.start,
        ...(i.tokens && { tokens: i.tokens }),
        ...(i.sessionId && { sessionId: i.sessionId }),
      },
    ),
  ]
  return records.map(r => appendTelemetry(i.root, r)).every(Boolean)
}

export interface ManualCardInput {
  readonly root: string
  readonly enabled: boolean
  readonly card: string
  /** True final state: review-approved, merged, parked... */
  readonly outcome: string
  readonly end: number
  readonly pr?: number
}

/** AC-2: the card record with the true outcome; it supersedes the card records written before it. */
export function finalizeManualCard(i: ManualCardInput): boolean {
  if (!i.enabled) return true
  const id = `${i.card}:manual:${i.outcome}`
  const prior = readRecords(i.root).filter(r => r.kind === 'card' && r['card'] === i.card)
  const last = prior.at(-1)
  const stages = readCardStages(i.root, i.card)
  const text = (key: string) => String(last?.[key] ?? 'not measured')
  const pr = typeof last?.['pr'] === 'number' ? last['pr'] : i.pr
  return appendTelemetry(i.root, {
    ...cardTelemetryRecord({
      id,
      card: i.card,
      run: last ? text('run') : 'manual',
      ...(pr !== undefined && { pr }),
      pairVersion: text('pairVersion'),
      workflowVersion: text('workflowVersion'),
      profile: text('profile'),
      outcome: i.outcome,
      supersedes: prior.map(r => r.id).filter(p => p !== id),
      start: i.end,
      end: i.end,
      stages,
      interventions: [],
    }),
    source: 'manual',
  })
}

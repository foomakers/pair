import { join } from 'node:path'
import {
  identityOf,
  TELEMETRY_FILE,
  writeAtomic,
  type EngineOutcome,
  type RunDirectory,
  type RunHost,
  type RunIdentity,
  type RunEndStatus,
  type StepLaunch,
  type FindingCounts,
} from '../engine'
import type { EscalationAction, KindName } from '../grammar'
import type { StepStatus } from '../kinds'
import type { Diagnosis } from '../diagnosis'
import { migrateTelemetryStatuses } from './legacy-status'

export { TELEMETRY_FILE }

/** The version of the record format of a run's `telemetry.jsonl` (ADR-033). Breaking changes raise it. */
export const TELEMETRY_SCHEMA = 2

/** Where a number comes from. Never a number without its origin. */
export type TokenSource = 'measured' | 'estimated' | 'unknown'

export interface TokenEntry {
  /** `null` when the source is `unknown`. */
  readonly value: number | null
  readonly source: TokenSource
}

/** `read`: fresh input; `cached`: input served from cache; `written`: output. */
export type TokenName = 'read' | 'cached' | 'written'
export type Tokens = Readonly<Record<TokenName, TokenEntry>>

/** The usage of one step, as an engine reports it. */
export type Usage = Readonly<Record<TokenName, number>>

const UNKNOWN: TokenEntry = { value: null, source: 'unknown' }

export const measured = (usage: Usage): Tokens => ({
  read: { value: usage.read, source: 'measured' },
  cached: { value: usage.cached, source: 'measured' },
  written: { value: usage.written, source: 'measured' },
})

const fromText = (text: string): TokenEntry => ({
  value: Math.ceil(text.length / 4),
  source: 'estimated',
})

/**
 * The fallback of a host that cannot measure: a quarter of the characters of the message sent to
 * the step and of the agent's final message. A lower bound: the text does not show file reads,
 * tool calls or reasoning, and nothing in it tells what the cache served.
 */
export const estimated = (sent: string, final: string): Tokens => ({
  read: fromText(sent),
  cached: UNKNOWN,
  written: fromText(final),
})

export type TelemetryHost = RunHost

export interface EscalationTelemetry {
  readonly status: EngineOutcome['status']
  readonly do: EscalationAction
}

/** One step execution or loop exhaustion. A re-executed step has one record per execution. */
export interface StepTelemetry extends RunIdentity {
  readonly type: 'step'
  readonly schema: typeof TELEMETRY_SCHEMA
  readonly step: string
  readonly kind: KindName | 'loop'
  readonly uses: string
  readonly host: TelemetryHost
  readonly engine: string
  readonly model?: string
  readonly effort?: string
  readonly startedAt: string
  readonly durationMs: number
  readonly tokens: Tokens
  /** Present when a token entry is estimated: how, and what the estimate does not see. */
  readonly estimate?: 'lower-bound-from-text'
  readonly status: StepStatus | 'exhausted' | 'skipped'
  readonly reason?: string
  readonly diagnosis?: Diagnosis
  readonly escalate?: EscalationTelemetry
  /** The execution number of this step in the run. */
  readonly attempt: number
  readonly round?: number
  readonly findingCounts?: FindingCounts | undefined
}

/** A sum of entries: an estimate when any summed entry is one. */
export interface TokenSum extends TokenEntry {
  /** The executions (`step#attempt`) whose entry is unknown: left out of the value, never counted as zero. */
  readonly unknown?: readonly string[]
}

/** The closing record of a run. Its totals count step executions, excluding loop exhaustion records. */
export interface RunTelemetry extends RunIdentity {
  readonly type: 'run'
  readonly schema: typeof TELEMETRY_SCHEMA
  readonly status: RunEndStatus
  readonly historical?: true
  readonly durationMs: number
  readonly tokens: Readonly<Record<TokenName, TokenSum>>
  /** The number of step executions. */
  readonly steps: number
}

/** What a host knows about one step execution or loop exhaustion. */
export interface StepExecution {
  readonly step: Pick<StepLaunch, 'id' | 'uses' | 'attempt' | 'round'> & {
    readonly kind: StepTelemetry['kind']
  }
  readonly host: TelemetryHost
  /** The engine, model and effort actually used. */
  readonly settings: {
    readonly engine: string
    readonly model?: string | undefined
    readonly effort?: string | undefined
  }
  readonly startedAt: Date
  readonly durationMs: number
  readonly tokens: Tokens
  readonly status: StepTelemetry['status']
  readonly reason?: string
  readonly diagnosis?: Diagnosis
  readonly escalate?: EscalationTelemetry
  readonly findingCounts?: FindingCounts | undefined
}

const fileOf = (run: RunDirectory): string => join(run.dir, TELEMETRY_FILE)

/** The step records of the run. A closing record is of a run that ended: it goes when the run moves again. */
function recordsOf(run: RunDirectory): (StepTelemetry | RunTelemetry)[] {
  if (!run.files.existsSync(fileOf(run))) return []
  return migrateTelemetryStatuses(run.files.readFileSync(fileOf(run)))
    .split('\n')
    .filter(line => line !== '')
    .map(line => JSON.parse(line) as StepTelemetry | RunTelemetry)
    .filter(record => record.type === 'step' || record.status === 'parked')
}

const stepsOf = (run: RunDirectory): StepTelemetry[] =>
  recordsOf(run).filter((record): record is StepTelemetry => record.type === 'step')

// An arbitrary line can be a prompt or an unlabelled credential. Keep only complete, known-safe
// messages in telemetry. The local run diagnosis still carries the original text for debugging.
const SAFE_DIAGNOSTICS = new Set([
  'Connection refused',
  'Connection reset by peer',
  'Permission denied',
  'No space left on device',
  'no terminal event in the engine stream (fail-closed: the exit code is never consulted)',
])

const safeDiagnostic = (text: string): string => (SAFE_DIAGNOSTICS.has(text) ? text : '[redacted]')

/** Render watchdog facts without forwarding detail that may contain engine text. */
function safeTimeout({ kind, timeoutSeconds }: Diagnosis) {
  if (timeoutSeconds === undefined || !Number.isFinite(timeoutSeconds) || timeoutSeconds <= 0)
    return undefined
  if (kind === 'timeout')
    return {
      timeoutSeconds,
      detail: `stalled: no terminal event within ${timeoutSeconds}s — the engine was stopped`,
    }
  if (kind === 'idle')
    return { timeoutSeconds, detail: `timed out (idle): no engine event for ${timeoutSeconds}s` }
  return undefined
}

function telemetryLine(record: StepTelemetry | RunTelemetry): string {
  if (record.type === 'run' || record.diagnosis === undefined) return JSON.stringify(record)
  const { kind, detail, exitCode, signal, elapsedMs, stderrTail } = record.diagnosis
  return JSON.stringify({
    ...record,
    diagnosis: {
      kind,
      ...(safeTimeout(record.diagnosis) ?? { detail: safeDiagnostic(detail) }),
      exitCode,
      signal,
      elapsedMs,
      stderrTail: stderrTail.map(safeDiagnostic),
    },
  })
}

const write = (run: RunDirectory, records: readonly (StepTelemetry | RunTelemetry)[]) =>
  writeAtomic(
    run.files,
    fileOf(run),
    records.map(record => `${telemetryLine(record)}\n`).join(''),
    {
      preserveMode: true,
    },
  )

function stepRecord(run: RunDirectory, execution: StepExecution): StepTelemetry {
  const { step, settings, tokens, reason, escalate, diagnosis, findingCounts } = execution
  const isEstimate = Object.values(tokens).some(entry => entry.source === 'estimated')
  return {
    type: 'step',
    schema: TELEMETRY_SCHEMA,
    ...identityOf(run),
    step: step.id,
    kind: step.kind,
    uses: step.uses,
    host: execution.host,
    engine: settings.engine,
    ...(settings.model !== undefined && { model: settings.model }),
    ...(settings.effort !== undefined && { effort: settings.effort }),
    startedAt: execution.startedAt.toISOString(),
    durationMs: execution.durationMs,
    tokens,
    ...(isEstimate && { estimate: 'lower-bound-from-text' as const }),
    status: execution.status,
    ...(reason !== undefined && { reason }),
    ...(diagnosis !== undefined && { diagnosis }),
    ...(escalate !== undefined && { escalate }),
    attempt: step.attempt,
    ...(step.round !== undefined && { round: step.round }),
    ...(findingCounts !== undefined && { findingCounts }),
  }
}

const attemptKey = (id: string, attempt: number, round?: number) =>
  JSON.stringify([id, attempt, round])

/** Appends a step record, or adds its escalation to a fault recovered before settlement. */
export async function recordStep(run: RunDirectory, execution: StepExecution): Promise<void> {
  const records = recordsOf(run)
  const steps = records.filter((row): row is StepTelemetry => row.type === 'step')
  const record = stepRecord(run, execution)
  if (record.diagnosis !== undefined) {
    const key = attemptKey(record.step, record.attempt, record.round)
    const existing = steps.find(
      row => row.diagnosis !== undefined && attemptKey(row.step, row.attempt, row.round) === key,
    )
    if (existing !== undefined) {
      const { escalate } = record
      if (escalate !== undefined && existing.escalate === undefined)
        await write(
          run,
          records.map(row => (row === existing ? { ...row, escalate } : row)),
        )
      return
    }
  }
  await write(run, [...records, record])
}

type RecoveredFault = Omit<StepExecution, 'durationMs' | 'tokens'> & { diagnosis: Diagnosis }

/** An interrupted process has measured elapsed time and no recoverable token measurement. */
export function recoveredExecution(fault: RecoveredFault): StepExecution {
  return {
    ...fault,
    durationMs: fault.diagnosis.elapsedMs,
    tokens: { read: UNKNOWN, cached: UNKNOWN, written: UNKNOWN },
  }
}

/** Backfills diagnoses saved before a telemetry write, keeping existing metered rows. */
export async function recordMissingFaultSteps(
  run: RunDirectory,
  faults: Iterable<RecoveredFault>,
  terminal?: RunEndStatus,
): Promise<void> {
  const recovered = [...faults]
  if (recovered.length === 0) return
  const steps = stepsOf(run)
  const recorded = new Set(
    steps
      .filter(row => row.diagnosis !== undefined)
      .map(row => attemptKey(row.step, row.attempt, row.round)),
  )
  const missing = recovered.filter(
    ({ step }) => !recorded.has(attemptKey(step.id, step.attempt, step.round)),
  )
  if (missing.length === 0 && terminal === undefined) return
  const retained = recordsOf(run)
  if (terminal === 'parked' && missing.length === 0 && retained.at(-1)?.type === 'run') return
  const repaired = [
    ...retained,
    ...missing.map(fault => stepRecord(run, recoveredExecution(fault))),
  ]
  await write(
    run,
    terminal === undefined
      ? repaired
      : [
          ...repaired,
          closingRecord(
            run,
            repaired.filter((row): row is StepTelemetry => row.type === 'step'),
            terminal,
          ),
        ],
  )
}

function sumOf(name: TokenName, steps: readonly StepTelemetry[]): TokenSum {
  const known = steps.map(step => step.tokens[name]).filter(entry => entry.value !== null)
  const unknown = steps
    .filter(step => step.tokens[name].value === null)
    .map(step => `${step.step}#${String(step.attempt)}`)
  const listed = unknown.length > 0 ? { unknown } : {}
  if (known.length === 0) return { ...UNKNOWN, ...listed }
  return {
    value: known.reduce((sum, entry) => sum + (entry.value ?? 0), 0),
    source: known.every(entry => entry.source === 'measured') ? 'measured' : 'estimated',
    ...listed,
  }
}

/** Writes a completed run's outcome and the totals of its step executions. */
export async function closeRun(run: RunDirectory, status: RunTelemetry['status']): Promise<void> {
  const steps = stepsOf(run)
  const records = recordsOf(run)
  if (status === 'parked' && records.at(-1)?.type === 'run') return
  await write(run, [...records, closingRecord(run, steps, status)])
}

function closingRecord(
  run: RunDirectory,
  steps: readonly StepTelemetry[],
  status: RunTelemetry['status'],
): RunTelemetry {
  const executions = steps.filter(step => step.kind !== 'loop')
  return {
    type: 'run',
    schema: TELEMETRY_SCHEMA,
    ...identityOf(run),
    status,
    durationMs: executions.reduce((sum, step) => sum + step.durationMs, 0),
    tokens: {
      read: sumOf('read', executions),
      cached: sumOf('cached', executions),
      written: sumOf('written', executions),
    },
    steps: executions.length,
  }
}

/**
 * A launch that writes no telemetry resumes a run an earlier launch closed: its closing record is
 * dropped, so the file never says `failed` (or `done`) for a run that went on without it.
 */
export async function reopenRun(run: RunDirectory): Promise<void> {
  if (run.files.existsSync(fileOf(run)))
    await write(
      run,
      recordsOf(run).map(record =>
        record.type === 'run' ? { ...record, historical: true } : record,
      ),
    )
}

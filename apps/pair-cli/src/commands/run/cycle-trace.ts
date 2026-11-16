import { hostname, platform } from 'os'
import { onInterrupt } from './interrupt'
import { version as pairVersion } from '../../index'
import type { CycleDriverContext, CycleDriverRequest } from './cycle-wiring'
import type { CycleOutcome, CycleStageResult } from './cycle'
import type { CycleScriptsBridge } from './cycle-scripts'
import { telemetryPrices } from './telemetry-policy'
import {
  closeOpenStages,
  createTrace,
  sweepLostStages,
  type StageHandle,
  type Trace,
} from './telemetry-trace'
import { envelope } from './telemetry-trace'
import { appendTelemetry, type TelemetryRecord } from './telemetry'

/** What the trace needs of a card's coordinates (structural: `Coordinates` is private to the wiring). */
export interface TraceCoordinates {
  readonly main: string
  readonly runId: string
  readonly cardId: string
  readonly epic?: string | undefined
  readonly branch: string
  readonly tier?: string | undefined
  readonly autonomy?: unknown
  readonly trace: { current?: Trace }
}

export const SUCCESS = new Set(['ready-for-merge', 'merged'])

/** AC-3: every granted recovery round is an event — one wrap covers every recovery site. */
export function tracedBridge(
  bridge: CycleScriptsBridge,
  trace: { current?: Trace },
): CycleScriptsBridge {
  return {
    ...bridge,
    recover: options => {
      const round = bridge.recover(options)
      if (round.allowed)
        trace.current?.event('recovery-round', {
          kind: options.kind,
          round: round.round,
          budget: round.budget,
        })
      return round
    },
  }
}

const stageTable = (ctx: CycleDriverContext): Record<string, unknown> =>
  Object.fromEntries(
    Object.entries(ctx.profile?.stages ?? {}).map(([step, s]) => [
      step,
      {
        engine: s.engine.value,
        model: s.model.resolved.id,
        effort: s.effort.value,
        context: s.context.value,
      },
    ]),
  )

const flagsOf = (ctx: CycleDriverContext, input: CycleDriverRequest): Record<string, unknown> => ({
  card: input.card,
  pr: input.pr ?? null,
  rounds: input.rounds ?? null,
  baseBranch: ctx.baseBranch,
  timeoutSeconds: ctx.timeoutSeconds ?? null,
  idleTimeoutSeconds: ctx.idleTimeoutSeconds ?? null,
})

/** C1, allow-listed: never card text, prompts or secrets. */
function runContext(
  ctx: CycleDriverContext,
  input: CycleDriverRequest,
  co: TraceCoordinates,
  shas: { base?: string | undefined; head?: string | undefined },
): Record<string, unknown> {
  return {
    command: 'pair run',
    flags: flagsOf(ctx, input),
    runEngine: ctx.engine.id,
    profileHash: ctx.profile?.hash ?? null,
    stages: stageTable(ctx),
    autonomy: co.autonomy ?? null,
    autoRecoveryRounds: input.budgets?.autoRecoveryRounds ?? null,
    baseSha: shas.base ?? null,
    headSha: shas.head ?? null,
    pairVersion,
    os: platform(),
    pid: process.pid,
    host: hostname(),
  }
}

export interface RunTrace {
  /** The run's end as an event (park / halt), then the handlers are removed. */
  finish(outcome: CycleOutcome): void
}

/**
 * Opens the run's trace, sweeps orphan `start`s as `lost`, and makes a signal or crash close every open stage
 * with ONE `end` before exit. Telemetry off ⇒ no trace and no handler.
 */
export function startTrace(
  ctx: CycleDriverContext,
  input: CycleDriverRequest,
  co: TraceCoordinates,
  shas: { base?: string | undefined; head?: string | undefined },
): RunTrace {
  if (ctx.telemetryEnabled !== true) return { finish: () => undefined }
  sweepLostStages(co.main)
  co.trace.current = createTrace({
    root: co.main,
    run: co.runId,
    card: co.cardId,
    epic: co.epic,
    branch: co.branch,
    profile: ctx.profile?.name ?? 'default',
    tier: co.tier,
    pr: input.pr,
    prices: telemetryPrices(co.main),
    context: runContext(ctx, input, co, shas),
  })
  const off = onInterrupt(signal => closeOpenStages('interrupted', signal))
  const crashed = () => closeOpenStages('crashed')
  // The monitor observes a crash without changing its default handling (a plain listener would swallow it).
  process.once('uncaughtExceptionMonitor', crashed)
  return {
    finish: outcome => {
      traceOutcome(co, outcome)
      off()
      process.removeListener('uncaughtExceptionMonitor', crashed)
    },
  }
}

/** AC-3: an awaiting-human stop is a park; any other non-success stop is a halt. */
function traceOutcome(co: TraceCoordinates, outcome: CycleOutcome): void {
  const { status } = outcome
  if (SUCCESS.has(status) || status === 'rounds-bound-reached' || status === 'other-run') return
  const park = status === 'awaiting-human' || status === 'needs-human'
  co.trace.current?.event(park ? 'park' : 'halt', { status, reason: outcome.reason ?? null })
}

/** C4: the cause the stage's own outcome already names; everything else is null (no guess). */
export function causeOf(result: CycleStageResult): string | undefined {
  if (result.stalled === true) return 'stalled'
  const status = result.final?.status
  return status === 'halted' || status === 'cancelled' ? status : undefined
}

export interface StageStart {
  readonly step: string
  readonly phase?: string | undefined
  readonly engine: string
  readonly model?: string | undefined
  readonly effort?: string | undefined
  readonly context?: string | undefined
  readonly retries: number
  readonly startedAt: number
  readonly legacyId: string
  readonly worktree?: string | undefined
}

export const openStage = (co: TraceCoordinates, stage: StageStart): StageHandle | undefined =>
  co.trace.current?.start({ ...stage, effort: stage.effort ?? 'default' })

/** The card record under the v2 envelope: the card's own numbers plus the C2 keys (which win over the extras). */
export function appendCardRecord(
  co: TraceCoordinates,
  card: TelemetryRecord,
  keys: { profile: string; pr?: number | undefined; outcome: string; cause?: string | undefined },
  end: number,
): void {
  appendTelemetry(
    co.main,
    envelope(
      { kind: 'card', id: card.id, ts: end },
      {
        run: co.runId,
        card: co.cardId,
        epic: co.epic,
        branch: co.branch,
        tier: co.tier,
        ...keys,
      },
      card,
    ),
  )
}

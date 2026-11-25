import { buildMessage, readResult, type InvocationStyle } from '../dispatch'
import {
  next,
  priorRefinement,
  record,
  stageSuccess,
  type RunDirectory,
  type RunFiles,
  type RunState,
  type StepLaunch,
} from '../engine'
import { confirmResult, hasResultFacts, unconfirmed, type ResultFacts } from '../engine/confirm'
import type { KindName } from '../grammar'
import type { CardFacts } from '../select'
import { kindByName, settle, type StepResult, type StepStatus } from '../kinds'
import {
  closeRun,
  reopenRun,
  estimated,
  measured,
  recordStep,
  type StepExecution,
  type TelemetryHost,
  type Usage,
} from '../telemetry'

/** One line of a run: a step that starts, or a step that ended with its result. */
export interface StepEvent {
  readonly step: string
  readonly kind: KindName
  readonly state: 'running' | 'skipped' | StepStatus
  readonly summary?: string
  readonly reason?: string
  readonly detail?: string
}

/**
 * What a host implements. The package decides what runs next and what its result means; the host
 * owns everything the package must not touch: processes, the worktree, the console.
 */
export interface WorkflowHost {
  /** The disk, for the run directory. */
  readonly files: RunFiles
  /** How the host's engine is told to run a skill. */
  readonly style: InvocationStyle
  /** A step whose engine is not the host's own: how that engine is told to run a skill. */
  readonly styleOf?: (stepId: string) => InvocationStyle
  /** The host's prompt-safety check. */
  readonly isSafeText: (value: string) => boolean
  /**
   * Launches the agent of one step in the run's worktree and resolves to its final message —
   * `undefined` when the agent died or timed out. Rejects when the run is interrupted: nothing is
   * recorded, the step stays `running` on disk and runs again at the next launch. A host whose engine
   * reports usage hands it to `meter`; the last call is the step's usage.
   */
  launch(
    step: StepLaunch,
    message: string,
    meter: (usage: Usage) => void,
  ): Promise<string | undefined>
  /** The card as it is now: what a step's `when` reads. Absent: a `when` on card facts matches. */
  card?(): Promise<CardFacts>
  /** Runs a step of a host kind (`gate`, `approval`, `merge`): the result it returns, no agent. */
  perform?(step: StepLaunch): Promise<unknown>
  /** Runs the `gates` of a step that ended `ok`: `undefined` when all pass, else the failed result. */
  runGates?(entries: readonly string[], step: StepLaunch): Promise<StepResult | undefined>
  /** The result's observable platform facts. */
  readResultFacts?(step: StepLaunch, result: StepResult): Promise<ResultFacts>
  /** Whether the observed board status shows that the Ready transition has already landed. */
  isReadyBoardStatus?(status: string | null): boolean
  /** Confirms the Ready transition before success becomes durable. */
  confirmReady?(): Promise<void>
  /** Sees every step start and every recorded result, in order. */
  report?(event: StepEvent): void
  transition?(event: StepEvent): Promise<void>
}

/** The settings a step launches with. */
export interface StepSettings {
  readonly engine: string
  readonly model?: string | undefined
  readonly effort?: string | undefined
}

/** Telemetry of a run, when it is on: absent, nothing is written and nothing else changes. */
export interface TelemetryOptions {
  readonly host: TelemetryHost
  /** What a step launches with: the configuration's resolution of its id. */
  readonly settings: (stepId: string) => StepSettings
  /** The clock. */
  readonly now?: () => Date
  /** Told once when a record cannot be written. */
  readonly warn?: (message: string) => void
}

export interface RunOutcome {
  readonly run: Exclude<RunState, 'running'>
  /** The last step this launch recorded. */
  readonly last?: StepEvent
}

/** What a step exchanged with its agent: the two texts, and the usage when the host measured it. */
interface Exchange {
  sent: string
  final: string
  usage?: Usage
  unmeasured?: boolean
}

/** The result of a step, unless it is `ok` and its `gates` are not all green. */
async function gated(
  host: WorkflowHost,
  step: StepLaunch,
  result: StepResult,
): Promise<StepResult> {
  if (result.status !== 'ok' || (step.gates ?? []).length === 0) return result
  if (host.runGates === undefined)
    return {
      status: 'failed',
      reason: 'no-executor',
      summary: 'the host cannot run the gates of a step',
    }
  return (await host.runGates(step.gates ?? [], step)) ?? result
}

type Confirmation = { result: StepResult; invalidatePendingSuccess?: boolean }

async function confirmed(
  host: WorkflowHost,
  run: RunDirectory,
  step: StepLaunch,
  result: StepResult,
): Promise<Confirmation> {
  if (result.status !== 'ok' || !hasResultFacts(step.kind)) return { result }
  const staged = step.pendingSuccess !== undefined
  if (host.readResultFacts === undefined)
    return { result: staged ? unconfirmed('the host cannot revalidate the staged result') : result }
  try {
    const facts = await host.readResultFacts(step, result)
    if (staged) return checkStagedResult({ host, run }, step, result, facts)
    const checked = confirmResult(step.kind, result, facts)
    return {
      result:
        checked.status === 'ok' && step.retryBoardStatus !== undefined
          ? confirmPriorRefinement(run, step, result, facts)
          : checked,
    }
  } catch (error) {
    return { result: unconfirmed((error as Error).message) }
  }
}

function checkStagedResult(
  { host, run }: { host: WorkflowHost; run: RunDirectory },
  step: StepLaunch,
  result: StepResult,
  facts: ResultFacts,
): Confirmation {
  const boardStatus = facts.card?.boardStatus
  const declaration =
    boardStatus !== undefined && host.isReadyBoardStatus?.(boardStatus)
      ? { ...result, boardStatus }
      : result
  const checked = confirmResult(step.kind, declaration, facts)
  if (checked.status === 'ok') return { result: confirmPriorRefinement(run, step, result, facts) }
  const observed = step.kind === 'implement' ? facts.head : facts.card
  return { result: checked, invalidatePendingSuccess: observed !== undefined }
}

function confirmPriorRefinement(
  run: RunDirectory,
  step: StepLaunch,
  result: StepResult,
  facts: ResultFacts,
): StepResult {
  if (step.kind !== 'plan-tasks' || facts.card === undefined) return result
  const refinement = priorRefinement(run, step.id)
  if (refinement === undefined) return result
  const checked = confirmResult(
    'refine-story',
    { ...result, ...refinement, boardStatus: facts.card.boardStatus },
    facts,
  )
  return checked.status === 'ok' ? result : checked
}

async function recordResult(
  host: WorkflowHost,
  run: RunDirectory,
  step: StepLaunch,
  { result, output, invalidatePendingSuccess }: Confirmation & { output?: string },
): Promise<StepResult> {
  let final = result
  if (step.pendingSuccess !== undefined && !host.confirmReady && result.status === 'ok')
    return record(run, step.id, unconfirmed('the host cannot confirm the Ready transition'))
  if (
    step.confirmReady &&
    host.confirmReady &&
    settle(kindByName[step.kind], result).status === 'ok'
  ) {
    await stageSuccess(run, step.id, result)
    try {
      await host.confirmReady()
    } catch (error) {
      final = unconfirmed((error as Error).message)
    }
  }
  return record(run, step.id, final, { output, invalidatePendingSuccess })
}

/** Launches the agent; a red gate sends the step back to it with the gate output, up to `GATE_RETRIES`. */
async function launchGated(
  host: WorkflowHost,
  run: RunDirectory,
  step: StepLaunch,
  sent: { message: string; exchange: Exchange },
): Promise<StepResult> {
  const { message, exchange } = sent
  const kind = kindByName[step.kind]
  let prompt = message
  for (let retry = 0; ; retry++) {
    exchange.sent += prompt
    let attemptUsage: Usage | undefined
    const final = await host.launch(step, prompt, usage => {
      attemptUsage = usage
    })
    if (attemptUsage !== undefined) {
      const prior = exchange.usage ?? { read: 0, cached: 0, written: 0 }
      exchange.usage = {
        read: prior.read + attemptUsage.read,
        cached: prior.cached + attemptUsage.cached,
        written: prior.written + attemptUsage.written,
      }
    } else exchange.unmeasured = true
    if (final === undefined)
      return record(run, step.id, {
        status: 'failed',
        reason: 'no-result',
        summary: 'the agent ended without a final message',
      })
    exchange.final += final
    const read = readResult(final, kind)
    const result = await gated(host, step, read)
    if (retry < GATE_RETRIES && read.status === 'ok' && result.reason?.startsWith('gate-failed'))
      prompt = `${message}\n\nThe host ran the quality gates after your last result and one is red. Fix it, then end your turn with the result block again.\n${(result.detail ?? result.summary).slice(-4000)}`
    else
      return recordResult(host, run, step, {
        ...(await confirmed(host, run, step, result)),
        output: final,
      })
  }
}

/** How many times a red gate sends the step back to its agent before the step fails. */
const GATE_RETRIES = 2

async function execute(
  host: WorkflowHost,
  run: RunDirectory,
  step: StepLaunch,
  exchange: Exchange = { sent: '', final: '' },
): Promise<StepResult> {
  if (step.pendingSuccess !== undefined)
    return recordResult(host, run, step, await confirmed(host, run, step, step.pendingSuccess))
  const kind = kindByName[step.kind]
  if (kind.host === true) {
    exchange.sent = JSON.stringify(step.with)
    const result: StepResult =
      host.perform === undefined
        ? {
            status: 'failed',
            reason: 'no-executor',
            summary: `the host cannot run a ${step.kind} step`,
          }
        : await gated(host, step, (await host.perform(step)) as StepResult)
    return recordResult(host, run, step, { result })
  }
  if (step.kind === 'refine-story' && step.with['mode'] !== 'autonomous')
    return record(run, step.id, {
      status: 'needs-human',
      reason: 'interactive-refinement',
      summary:
        'Run pair-process-refine-story in an interactive session or configure autonomous refinement.',
    })
  let message: string
  try {
    message = buildMessage(step, kind, {
      ...host,
      style: host.styleOf?.(step.id) ?? host.style,
    })
  } catch (error) {
    const summary = (error as Error).message
    return record(run, step.id, { status: 'failed', reason: 'unsafe-value', summary })
  }
  return launchGated(host, run, step, { message, exchange })
}

/**
 * The run's telemetry, when it is on. It never fails a run: the first write error is reported, and
 * the run goes on without it.
 */
function writerOf(run: RunDirectory, telemetry: TelemetryOptions) {
  let told = false
  const safe = async (write: Promise<void>): Promise<void> => {
    try {
      await write
    } catch (error) {
      if (!told)
        telemetry.warn?.(
          `telemetry was not written: ${(error as Error).message} — the run goes on without it`,
        )
      told = true
    }
  }
  return {
    now: telemetry.now ?? (() => new Date()),
    step: (execution: Omit<StepExecution, 'host' | 'settings'>) =>
      safe(
        recordStep(run, {
          ...execution,
          host: telemetry.host,
          settings: telemetry.settings(execution.step.id),
        }),
      ),
    close: (status: RunOutcome['run']) => safe(closeRun(run, status)),
  }
}

type Writer = ReturnType<typeof writerOf> | undefined

/** One step, timed and metered when telemetry is on. */
async function executeMetered(
  host: WorkflowHost,
  run: RunDirectory,
  step: StepLaunch,
  writer: Writer,
): Promise<StepResult> {
  if (writer === undefined) return execute(host, run, step)
  const startedAt = writer.now()
  const exchange: Exchange = { sent: '', final: '' }
  const result = await execute(host, run, step, exchange)
  const { sent, final, usage, unmeasured } = exchange
  await writer.step({
    step,
    startedAt,
    durationMs: writer.now().getTime() - startedAt.getTime(),
    // A host that cannot measure: the estimate from the two texts.
    tokens: usage === undefined || unmeasured ? estimated(sent, final) : measured(usage),
    status: result.status,
    ...(result.reason !== undefined && { reason: result.reason }),
  })
  return result
}

async function ended(
  state: RunState,
  last: StepEvent | undefined,
  writer: Writer,
): Promise<RunOutcome> {
  const outcome = state === 'running' ? 'failed' : state
  await writer?.close(outcome)
  return { run: outcome, ...(last !== undefined && { last }) }
}

/** The next step, reporting every step passed over because its `when` did not match. */
async function advance(host: WorkflowHost, run: RunDirectory) {
  const found = await next(run, host.card?.bind(host))
  for (const { id, kind } of found.skipped ?? [])
    host.report?.({
      step: id,
      kind,
      state: 'skipped',
      summary: 'skipped: when did not match',
    })
  return found
}

async function emitStep(host: WorkflowHost, event: StepEvent): Promise<void> {
  await host.transition?.(event)
  host.report?.(event)
}

/** The host loop over a started run: `next` → launch → `record`, until the run is no longer running. */
export async function runSteps(
  host: WorkflowHost,
  dir: string,
  telemetry?: TelemetryOptions,
): Promise<RunOutcome> {
  const run = { files: host.files, dir }
  const writer = telemetry && writerOf(run, telemetry)
  if (writer === undefined) await reopenRun(run).catch(() => undefined)
  let last: StepEvent | undefined
  for (;;) {
    const { ready, run: state } = await advance(host, run)
    const step = ready[0]
    if (state !== 'running' || step === undefined) return ended(state, last, writer)
    const launchEvent = { step: step.id, kind: step.kind, state: 'running' } as const
    await emitStep(host, launchEvent)
    const { status, summary, reason, detail } = await executeMetered(host, run, step, writer)
    last = {
      step: step.id,
      kind: step.kind,
      state: status,
      summary,
      ...(reason !== undefined && { reason }),
      ...(detail !== undefined && { detail }),
    }
    await emitStep(host, last)
  }
}

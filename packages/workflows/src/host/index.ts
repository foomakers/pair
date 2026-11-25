import { buildMessage, checkAgentResult, type InvocationStyle } from '../dispatch'
import {
  escalationCommentTarget,
  faultsOf,
  next,
  priorRefinement,
  record,
  recordFault,
  stageSuccess,
  type EngineOutcome,
  type RunDirectory,
  type RunEndStatus,
  type RunFiles,
  type RunState,
  type StepLaunch,
} from '../engine'
import { confirmResult, hasResultFacts, unconfirmed, type ResultFacts } from '../engine/confirm'
import { escalationAction, type Assignment, type CardState, type KindName } from '../grammar'
import { violations } from '../schema'
import type { Diagnosis, ProcessDiagnostics, StepFaults } from '../diagnosis'
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

export type AgentLaunchResult =
  | { readonly final: string; readonly process?: ProcessDiagnostics }
  | { readonly fault: Diagnosis }

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
   * Launches an agent in the run's worktree and resolves to its final message or a process fault.
   * Rejects when the run is interrupted: nothing is
   * recorded, the step stays `running` on disk and runs again at the next launch. A host whose engine
   * reports usage hands it to `meter`; the last call is the step's usage.
   */
  launch(
    step: StepLaunch,
    message: string,
    meter: (usage: Usage) => void,
  ): Promise<AgentLaunchResult>
  /** The card as it is now: what a step's `when` reads. Absent: a `when` on card facts matches. */
  card?(): Promise<CardFacts>
  /** Applies the step's directive before it starts. Returns a reason when the card is held. */
  assignCard?(assignment: Assignment): Promise<string | undefined>
  /** Upsert an escalation comment using its stable marker on the card. */
  commentOnCard?(comment: { card: string; marker: string; body: string }): Promise<void>
  /** Reports a failed escalation comment. */
  warn?(message: string): void
  /** Runs a step of a host kind (`gate`, `approval`, `merge`): the result it returns, no agent. */
  perform?(step: StepLaunch): Promise<unknown>
  /** Runs the `gates` of a step that ended `ok`: `undefined` when all pass, else the failed result. */
  runGates?(entries: readonly string[], step: StepLaunch): Promise<StepResult | undefined>
  /** The result's observable platform facts. */
  readResultFacts?(step: StepLaunch, result: StepResult): Promise<ResultFacts>
  /** Whether the observed board status has already reached the target macrostate. */
  isAtLeastBoardStatus?(status: string | null, target: CardState): boolean
  /** Confirms the board transition before success becomes durable. */
  confirmState?(target: CardState): Promise<void>
  /** Sees step starts, results and condition failures in order. */
  report?(event: StepEvent): void
  /** Applies board transitions. Without assignCard, the implementation skill handles its start state. */
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
  readonly run: RunEndStatus
  /** The last step result or condition failure from this launch. */
  readonly last?: StepEvent
  readonly faults?: readonly StepFaults[]
}

/** What a step exchanged with its agent: the two texts, and the usage when the host measured it. */
interface Exchange {
  step: StepLaunch
  sent: string
  final: string
  usage?: Usage
  diagnosis?: Diagnosis
}

type OnRetry = (result: StepResult) => Promise<void>

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
      result: checked.status === 'ok' ? confirmPriorRefinement(run, step, checked, facts) : checked,
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
    boardStatus !== undefined &&
    step.confirmState !== undefined &&
    host.isAtLeastBoardStatus?.(boardStatus, step.confirmState)
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
  if (step.kind !== 'plan-tasks' || step.confirmState !== 'Ready' || facts.card === undefined)
    return result
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
  if (step.pendingSuccess !== undefined && !host.confirmState && result.status === 'ok')
    return record(
      run,
      step.id,
      unconfirmed(`the host cannot confirm the ${step.confirmState} transition`),
    )
  if (
    step.confirmState !== undefined &&
    host.confirmState &&
    settle(kindByName[step.kind], result).status === 'ok'
  ) {
    await stageSuccess(run, step.id, result)
    try {
      await host.confirmState(step.confirmState)
    } catch (error) {
      final = unconfirmed((error as Error).message)
    }
  }
  return record(run, step.id, final, { output, invalidatePendingSuccess })
}

const NO_AGENT_RESULT: StepResult = {
  status: 'failed',
  reason: 'no-result',
  summary: 'the agent ended without a final message',
}

const assignmentAtStart = (step: StepLaunch): Assignment | undefined =>
  step.pendingSuccess === undefined ? step.assignment?.value : undefined

const starting = (step: StepLaunch): StepEvent => ({
  step: step.id,
  kind: step.kind,
  state: 'running',
})

type StepExecutionResult =
  | StepResult
  | { status: 'skipped'; summary: string; reason: 'card-held'; detail?: string }

async function execute(
  host: WorkflowHost,
  run: RunDirectory,
  exchange: Exchange,
  onRetry?: OnRetry,
): Promise<StepExecutionResult> {
  const { step } = exchange
  if (step.pendingSuccess !== undefined)
    return recordResult(host, run, step, await confirmed(host, run, step, step.pendingSuccess))
  const kind = kindByName[step.kind]
  const missing = violations(kind.inputs, step.inputs)
  if (missing.length > 0)
    return record(run, step.id, {
      status: 'failed',
      reason: 'invalid-input',
      summary: `The ${step.kind} step is missing valid inputs`,
      detail: missing.map(issue => issue.path.join('.') + ': ' + issue.problem).join('; '),
    })
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
      status: 'needs-decision',
      reason: 'interactive-refinement',
      summary:
        'Run pair-process-refine-story in an interactive session or configure autonomous refinement.',
    })
  return executeAgent(host, run, exchange, onRetry)
}

async function executeAgent(
  host: WorkflowHost,
  run: RunDirectory,
  exchange: Exchange,
  onRetry?: OnRetry,
): Promise<StepExecutionResult> {
  const { step } = exchange
  const kind = kindByName[step.kind]
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
  exchange.sent = message
  const reply = await launchWithRetries(host, run, exchange, onRetry)
  if ('fault' in reply) return record(run, step.id, faultResult(step, reply), reply.invalid?.final)
  const { result, final } = reply
  // Leave the step running on disk so the next invocation can retry it.
  if (step.kind === 'implement' && result.status === 'failed' && result.reason === 'card-held')
    return { ...result, status: 'skipped', reason: result.reason }
  const checked = await gated(host, step, result)
  return recordResult(host, run, step, {
    ...(await confirmed(host, run, step, checked)),
    output: final,
  })
}

type AgentReply =
  | { result: StepResult; final: string }
  | { fault: Diagnosis; invalid?: { result: StepResult; final: string } }

function faultResult(
  step: StepLaunch,
  reply: Extract<AgentReply, { fault: Diagnosis }>,
): StepResult {
  if (reply.invalid !== undefined) return reply.invalid.result
  const { kind, detail } = reply.fault
  if (kind === 'invalid-result') return { status: 'failed', reason: kind, summary: detail }
  if (step.retries === undefined) return NO_AGENT_RESULT
  return { status: 'blocked', reason: 'fault', summary: 'the agent process failed', detail }
}

function replyOf(launched: AgentLaunchResult, kind: KindName, elapsedMs: number): AgentReply {
  if ('fault' in launched) return launched
  const { final, process } = launched
  const { valid, result } = checkAgentResult(final, kindByName[kind])
  if (valid) return { result, final }
  return {
    fault: {
      ...(process ?? { exitCode: null, signal: null, elapsedMs, stderrTail: [] }),
      kind: 'invalid-result',
      detail: result.detail ?? result.summary,
    },
    invalid: { result, final },
  }
}

async function launchWithRetries(
  host: WorkflowHost,
  run: RunDirectory,
  exchange: Exchange,
  onRetry: OnRetry | undefined,
): Promise<AgentReply> {
  let remaining = exchange.step.retries ?? 0
  for (;;) {
    delete exchange.usage
    delete exchange.diagnosis
    const { step } = exchange
    const start = Date.now()
    const launched = await host.launch(step, exchange.sent, usage => {
      exchange.usage = usage
    })
    exchange.final = 'final' in launched ? launched.final : ''
    const reply = replyOf(launched, step.kind, Date.now() - start)
    if (!('fault' in reply)) return reply
    const next = await recordFault(run, step, reply.fault, remaining > 0)
    exchange.diagnosis = reply.fault
    if (remaining === 0) return reply
    await onRetry?.(faultResult(step, reply))
    remaining--
    exchange.step = next
  }
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
          settings:
            execution.step.kind === 'loop'
              ? { engine: 'pair' }
              : telemetry.settings(execution.step.id),
        }),
      ),
    close: (status: RunOutcome['run']) => safe(closeRun(run, status)),
  }
}

type Writer = ReturnType<typeof writerOf> | undefined

interface ObservedRun extends RunDirectory {
  readonly outcomes: EngineOutcome[]
}

function observedRun(files: RunFiles, dir: string): ObservedRun {
  const outcomes: EngineOutcome[] = []
  return { files, dir, outcomes, observeOutcome: outcome => outcomes.push(outcome) }
}

function escalationOf(outcome: EngineOutcome | undefined): Pick<StepExecution, 'escalate'> {
  if (outcome === undefined) return {}
  const action = escalationAction(outcome.rule)
  return action === undefined ? {} : { escalate: { status: outcome.status, do: action } }
}

async function commentOnEscalation(
  host: WorkflowHost,
  run: RunDirectory,
  outcome: EngineOutcome,
): Promise<void> {
  if (typeof outcome.rule !== 'object') return
  try {
    if (host.commentOnCard === undefined) throw new Error('the host does not support card comments')
    const body = outcome.rule.comment.replaceAll(
      '{reason}',
      () => outcome.reason ?? 'no reason given',
    )
    await host.commentOnCard({ ...(await escalationCommentTarget(run, outcome)), body })
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error)
    host.warn?.(`${outcome.id}: escalation comment was not written (${reason})`)
  }
}

async function flushOutcomes(host: WorkflowHost, run: ObservedRun, writer: Writer): Promise<void> {
  for (const outcome of run.outcomes.splice(0)) {
    await commentOnEscalation(host, run, outcome)
    if (writer === undefined || outcome.status !== 'exhausted') continue
    const { id, round, reason, status } = outcome
    await writer.step({
      step: { id, kind: 'loop', uses: '', attempt: round, round },
      startedAt: writer.now(),
      durationMs: 0,
      tokens: measured({ read: 0, cached: 0, written: 0 }),
      status,
      reason,
      ...escalationOf(outcome),
    })
  }
}

/** One step, timed and metered when telemetry is on. */
async function executeMetered(
  host: WorkflowHost,
  run: ObservedRun,
  step: StepLaunch,
  writer: Writer,
): Promise<StepExecutionResult> {
  const exchange: Exchange = { step, sent: '', final: '' }
  if (writer === undefined) return execute(host, run, exchange)
  let startedAt = writer.now()
  const report = async ({ status, reason }: StepExecutionResult, outcome?: EngineOutcome) => {
    const { sent, final, usage, diagnosis } = exchange
    const time = writer.now()
    await writer.step({
      step: exchange.step,
      startedAt,
      durationMs: time.getTime() - startedAt.getTime(),
      tokens: usage === undefined ? estimated(sent, final) : measured(usage),
      status,
      ...(reason !== undefined && { reason }),
      ...(diagnosis !== undefined && { diagnosis }),
      ...escalationOf(outcome),
    })
    startedAt = time
  }
  const result = await execute(host, run, exchange, fault => report(fault))
  await report(
    result,
    run.outcomes.find(outcome => outcome.id === step.id),
  )
  return result
}

async function ended(
  run: RunDirectory,
  state: RunState | RunEndStatus,
  last: StepEvent | undefined,
  writer: Writer,
): Promise<RunOutcome> {
  const outcome = state === 'running' ? 'failed' : state
  await writer?.close(outcome)
  const faults = faultsOf(run)
  return {
    run: outcome,
    ...(last !== undefined && { last }),
    ...(faults.length > 0 && { faults }),
  }
}

/** The next step, reporting every step passed over because its `when` did not match. */
async function advance(host: WorkflowHost, run: RunDirectory) {
  const found = await next(run, host.card?.bind(host), [], async step => {
    const assignment = assignmentAtStart(step)
    return assignment === undefined ? undefined : host.assignCard?.(assignment)
  })
  for (const { id, kind } of found.skipped ?? [])
    host.report?.({
      step: id,
      kind,
      state: 'skipped',
      summary: 'skipped: when did not match',
    })
  const { ready, run: state, held, blocked } = found
  if (held !== undefined) {
    const event: StepEvent = {
      step: held.id,
      kind: held.kind,
      state: 'skipped',
      summary: held.summary,
      reason: 'card-held',
    }
    host.report?.(event)
    return { ready, state: 'skipped' as const, event }
  }
  if (blocked === undefined) return { ready, state }
  const event: StepEvent = {
    step: blocked.id,
    kind: blocked.kind,
    state: 'failed',
    summary: 'could not evaluate when',
    reason: 'card-status-unavailable',
    detail: blocked.detail,
  }
  host.report?.(event)
  return { ready, state, event }
}

async function emitStep(host: WorkflowHost, event: StepEvent): Promise<void> {
  if (event.state !== 'skipped') await host.transition?.(event)
  host.report?.(event)
}

function implementationLaunch(host: WorkflowHost, step: StepLaunch): StepLaunch {
  const delegates = host.assignCard === undefined
  const { assignment } = step
  const options = { ...step.with }
  if (!delegates || assignment?.value === 'unassign') {
    options['assignee'] = 'none'
  } else if (assignment !== undefined && assignment.source !== 'default') {
    // Omitting the option uses the skill's claim without overriding an existing owner.
    if (assignment.value === 'me') delete options['assignee']
    else options['assignee'] = assignment.value
  }
  return {
    ...step,
    with: {
      ...options,
      ...(host.transition !== undefined && {
        'board-state': delegates ? (step.startState ?? 'none') : 'managed',
      }),
    },
  }
}

async function runStep(
  host: WorkflowHost,
  run: ObservedRun,
  step: StepLaunch,
  writer: Writer,
): Promise<StepEvent> {
  const implementing = step.kind === 'implement' && step.pendingSuccess === undefined
  const launch = implementing ? implementationLaunch(host, step) : step
  // The skill that claims the card also applies its start state before doing work.
  if (implementing && host.assignCard === undefined) {
    host.report?.({
      ...starting(step),
      ...(step.assignment?.value === 'unassign' && {
        summary:
          'Warning: unassign requires the assignCard host hook. Leaving assignment unchanged.',
      }),
    })
  } else await emitStep(host, starting(step))
  const { status, summary, reason, detail } = await executeMetered(host, run, launch, writer)
  await flushOutcomes(host, run, writer)
  const result = {
    step: step.id,
    kind: step.kind,
    state: status,
    summary,
    ...(reason !== undefined && { reason }),
    ...(detail !== undefined && { detail }),
  }
  await emitStep(host, result)
  return result
}

/** The host loop over a started run: `next` → launch → `record`, until the run is no longer running. */
export async function runSteps(
  host: WorkflowHost,
  dir: string,
  telemetry?: TelemetryOptions,
): Promise<RunOutcome> {
  const run = observedRun(host.files, dir)
  const writer = telemetry && writerOf(run, telemetry)
  if (writer === undefined) await reopenRun(run).catch(() => undefined)
  let last: StepEvent | undefined
  for (;;) {
    const { ready, state, event } = await advance(host, run)
    await flushOutcomes(host, run, writer)
    const step = ready[0]
    if (state !== 'running' || step === undefined) return ended(run, state, event ?? last, writer)
    last = await runStep(host, run, step, writer)
    if (last.state === 'skipped') return ended(run, 'skipped', last, writer)
  }
}

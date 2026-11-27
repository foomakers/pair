import { buildMessage, checkAgentResult, type InvocationStyle } from '../dispatch'
import {
  escalationCommentTarget,
  faultsOf,
  frozenWorkflow,
  next,
  priorRefinement,
  record,
  recordContextFallback,
  recordFault,
  stageSuccess,
  type EngineOutcome,
  type RunDirectory,
  type RunEndStatus,
  type RunFiles,
  type RunHost,
  type RunState,
  type StepLaunch,
  type StepExecutionIdentity,
  type Started,
} from '../engine'
import { confirmResult, hasResultFacts, unconfirmed, type ResultFacts } from '../engine/confirm'
import {
  addressedSteps,
  escalationAction,
  type Assignment,
  type CardState,
  type KindName,
} from '../grammar'
import { violations } from '../schema'
import type { Diagnosis, FaultAttempt, ProcessDiagnostics, StepFaults } from '../diagnosis'
import type { CardFacts, Filter } from '../select'
import { kindByName, settle, type StepResult, type StepStatus } from '../kinds'
import {
  closeRun,
  reopenRun,
  estimated,
  measured,
  recordMissingFaultSteps,
  recoveredExecution,
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

export type AgentLaunchResult = (
  | { readonly final: string; readonly process?: ProcessDiagnostics }
  | { readonly fault: Diagnosis }
  | { readonly sessionMissing: true }
) & {
  readonly model?: string | undefined
  readonly sessionId?: string | undefined
  readonly settings?: StepSettings
}

/**
 * What a host implements. The package decides what runs next and what its result means; the host
 * owns everything the package must not touch: processes, the worktree, the console.
 */
export interface WorkflowHost {
  /** The host that executes steps, when the caller identifies it. */
  readonly id?: RunHost
  /** The disk, for the run directory. */
  readonly files: RunFiles
  /** How the host's engine is told to run a skill. */
  readonly style: InvocationStyle
  /** A step whose engine is not the host's own: how that engine is told to run a skill. */
  readonly styleOf?: (stepId: string) => InvocationStyle
  /** Effective engine when this host can resume it. */
  readonly resumeEngineOf?: (stepId: string) => string | undefined
  readonly reportContextFallback?: (stepId: string, reason: string) => void
  /** Installed skill name for this step. */
  readonly skillOf?: (step: StepLaunch) => string
  /** The host's prompt-safety check. */
  readonly isSafeText: (value: string) => boolean
  /** How a headless host parks a step that needs the session conversation. */
  readonly parkInteractive?: StepResult & { readonly status: 'needs-decision' }
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
    resumeSessionId?: string,
  ): Promise<AgentLaunchResult>
  /** The card as it is now: what a step's `when` reads. Absent: a `when` on card facts matches. */
  card?(filter: Filter): Promise<CardFacts>
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
  origin?: FaultAttempt['origin']
  sent: string
  final: string
  usage?: Usage | undefined
  diagnosis?: Diagnosis
  model?: string | undefined
  identity?: StepExecutionIdentity
}

type TimedExchange = Omit<Exchange, 'step'> & { startedAt: Date }
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

const withHandoff = (result: StepResult, handoff: string | undefined): StepResult =>
  handoff === undefined ? result : { ...result, handoff }

async function recordResult(
  host: WorkflowHost,
  run: RunDirectory,
  step: StepLaunch,
  {
    result,
    output,
    execution = {},
    handoff = result.handoff,
    invalidatePendingSuccess,
  }: Confirmation & {
    output?: string
    execution?: StepExecutionIdentity
    handoff?: string | undefined
  },
): Promise<StepResult> {
  let final = result
  const identity = { host: host.id, ...execution }
  if (step.pendingSuccess !== undefined && !host.confirmState && result.status === 'ok')
    return record(
      run,
      step.id,
      withHandoff(
        unconfirmed(`the host cannot confirm the ${step.confirmState} transition`),
        handoff,
      ),
      {
        ...identity,
        attempt: step.attempt,
      },
    )
  if (
    step.confirmState !== undefined &&
    host.confirmState &&
    settle(kindByName[step.kind], result).status === 'ok'
  ) {
    await stageSuccess(run, step.id, result, identity)
    try {
      await host.confirmState(step.confirmState)
    } catch (error) {
      final = unconfirmed((error as Error).message)
    }
  }
  return record(run, step.id, withHandoff(final, handoff), {
    output,
    invalidatePendingSuccess,
    ...identity,
    attempt: step.attempt,
  })
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

/** The input failure, if any, before a local or delegated launch. */
export function stepInputFailure(step: StepLaunch): StepResult | undefined {
  const missing = violations(kindByName[step.kind].inputs, step.inputs)
  if (missing.length === 0) return undefined
  return {
    status: 'failed',
    reason: 'invalid-input',
    summary: `The ${step.kind} step is missing valid inputs`,
    detail: missing.map(issue => issue.path.join('.') + ': ' + issue.problem).join('; '),
  }
}

function recordExhausted(run: RunDirectory, step: StepLaunch, fault: FaultAttempt) {
  const { host = 'pair-run', model } = fault.origin ?? {}
  return record(run, step.id, faultResult(step.retries, { fault }), {
    host,
    model,
    attempt: step.attempt,
  })
}

async function execute(
  host: WorkflowHost,
  run: RunDirectory,
  exchange: Exchange,
  onRetry?: OnRetry,
): Promise<StepExecutionResult> {
  const { step } = exchange
  if (step.exhaustedFault !== undefined) {
    exchange.diagnosis = step.exhaustedFault
    return recordExhausted(run, step, step.exhaustedFault)
  }
  if (step.pendingSuccess !== undefined)
    return recordResult(host, run, step, {
      ...(await confirmed(host, run, step, step.pendingSuccess)),
      handoff: step.pendingSuccess.handoff,
    })
  if (step.interactive === true && host.parkInteractive !== undefined)
    return record(run, step.id, host.parkInteractive)
  const kind = kindByName[step.kind]
  const failure = stepInputFailure(step)
  if (failure !== undefined) return record(run, step.id, failure)
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
  const reply = await launchWithRetries(host, run, exchange, onRetry)
  const current = exchange.step
  if ('unsafe' in reply)
    return record(run, current.id, {
      status: 'failed',
      reason: 'unsafe-value',
      summary: reply.unsafe,
    })
  const execution = { ...exchange.identity, model: exchange.model }
  if ('fault' in reply)
    return record(run, current.id, faultResult(current.retries, reply), {
      output: reply.invalid?.final,
      host: host.id,
      ...execution,
      attempt: current.attempt,
    })
  return settleParsedResult(host, run, current, { ...reply, execution })
}

/** Settle the final message after a host's agent or conversation completes. */
export function settleAgentStep(
  host: WorkflowHost,
  run: RunDirectory,
  step: StepLaunch,
  { final, ...execution }: { final: string } & StepExecutionIdentity,
): Promise<StepExecutionResult> {
  const { result } = checkAgentResult(final, kindByName[step.kind])
  return settleParsedResult(host, run, step, { final, execution, result })
}

async function settleParsedResult(
  host: WorkflowHost,
  run: RunDirectory,
  step: StepLaunch,
  {
    final,
    execution,
    result,
  }: {
    final: string
    execution: StepExecutionIdentity
    result: StepResult
  },
): Promise<StepExecutionResult> {
  // Leave the step running on disk so the next invocation can retry it.
  if (step.kind === 'implement' && result.status === 'failed' && result.reason === 'card-held')
    return { ...result, status: 'skipped', reason: result.reason }
  const checked = await gated(host, step, result)
  return recordResult(host, run, step, {
    ...(await confirmed(host, run, step, checked)),
    output: final,
    execution,
    handoff: result.handoff,
  })
}

type AgentReply =
  | { result: StepResult; final: string }
  | { fault: Diagnosis; invalid?: { result: StepResult; final: string } }

function faultResult(
  retries: number | undefined,
  reply: Extract<AgentReply, { fault: Diagnosis }>,
): StepResult {
  if (reply.invalid !== undefined) return reply.invalid.result
  const { kind, detail } = reply.fault
  if (kind === 'invalid-result') return { status: 'failed', reason: kind, summary: detail }
  if (retries === undefined) return NO_AGENT_RESULT
  return { status: 'blocked', reason: 'fault', summary: 'the agent process failed', detail }
}

function replyOf(
  launched: Exclude<AgentLaunchResult, { sessionMissing: true }>,
  kind: KindName,
  elapsedMs: number,
): AgentReply {
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

interface AgentContext {
  sessionId?: string
  fallback?: string
}

function resumeContext(host: WorkflowHost, step: StepLaunch): AgentContext {
  if (step.context !== 'resume') return {}
  if (step.interrupted) return { fallback: 'the step was interrupted' }
  const previous = step.previousAgent
  if (previous === undefined) return { fallback: 'no preceding agent step' }
  if (previous.host !== host.id) return { fallback: 'the preceding step used another host' }
  const engine = host.resumeEngineOf?.(step.id)
  if (engine === undefined) return { fallback: 'the selected engine cannot resume' }
  if (previous.engine !== engine) return { fallback: 'the preceding step used a different engine' }
  if (!previous.sessionId || !/^[a-z0-9][a-z0-9_-]*$/i.test(previous.sessionId))
    return { fallback: 'the preceding step has no usable session ID' }
  return { sessionId: previous.sessionId }
}

async function reportFallback(
  host: WorkflowHost,
  run: RunDirectory,
  step: StepLaunch,
  reason: string,
) {
  await recordContextFallback(run, step, reason)
  host.reportContextFallback?.(step.id, reason)
}

async function launchInContext(
  host: WorkflowHost,
  run: RunDirectory,
  exchange: Exchange,
  context: AgentContext,
) {
  const { step } = exchange
  for (;;) {
    delete exchange.usage
    const { sessionId } = context
    try {
      const launch = { ...step }
      if (sessionId !== undefined) delete launch.handoff
      exchange.sent = buildMessage(launch, kindByName[step.kind], {
        ...host,
        style: host.styleOf?.(step.id) ?? host.style,
      })
    } catch (error) {
      return { unsafe: (error as Error).message }
    }
    const launched = await host.launch(
      step,
      exchange.sent,
      usage => {
        exchange.usage = usage
      },
      sessionId,
    )
    if (!('sessionMissing' in launched)) return launched
    if (sessionId === undefined)
      throw new Error('the host reported a missing session on a fresh launch')
    await reportFallback(host, run, step, 'the preceding session is unavailable')
    delete context.sessionId
  }
}

async function launchWithRetries(
  host: WorkflowHost,
  run: RunDirectory,
  exchange: Exchange,
  onRetry: OnRetry | undefined,
): Promise<AgentReply | { unsafe: string }> {
  const context = resumeContext(host, exchange.step)
  if (context.fallback !== undefined)
    await reportFallback(host, run, exchange.step, context.fallback)
  for (;;) {
    delete exchange.diagnosis
    const { step } = exchange
    const start = Date.now()
    const launched = await launchInContext(host, run, exchange, context)
    if ('unsafe' in launched) return launched
    exchange.model = launched.model
    exchange.identity = { engine: launched.settings?.engine, sessionId: launched.sessionId }
    exchange.final = 'final' in launched ? launched.final : ''
    const reply = replyOf(launched, step.kind, Date.now() - start)
    if (!('fault' in reply)) return reply
    const origin = faultOrigin(exchange.origin, launched)
    const next = await recordFault(run, step, reply.fault, origin)
    exchange.diagnosis = reply.fault
    if (next === undefined) return reply
    await onRetry?.(faultResult(step.retries, reply))
    exchange.step = next
  }
}

function faultOrigin(origin: Exchange['origin'], launched: AgentLaunchResult) {
  return (
    origin && {
      ...(launched.settings ?? origin),
      host: origin.host,
      ...(launched.model !== undefined && { model: launched.model }),
    }
  )
}

function recoveredOrigin(origin: FaultAttempt['origin']) {
  const { host = 'pair-run', engine = 'unknown', model, effort } = origin ?? {}
  return { host, settings: { engine, model, effort } }
}

function* recoverableFaults(run: RunDirectory, now: () => Date) {
  const faults = faultsOf(run)
  if (faults.length === 0) return
  const steps = new Map(addressedSteps(frozenWorkflow(run)).map(step => [step.id, step]))
  const recoveredAt = now()
  for (const { step: id, attempts } of faults) {
    const step = steps.get(id)
    if (step === undefined || step.kind === 'loop') continue
    const { kind, skill, retries } = step
    for (const { attempt, round, origin, ...diagnosis } of attempts) {
      const { status, reason } = faultResult(retries, { fault: diagnosis })
      yield {
        step: {
          id,
          kind,
          uses: skill ?? kindByName[kind].defaultSkill ?? '',
          attempt,
          ...(round !== undefined && { round }),
        },
        ...recoveredOrigin(origin),
        // The exact start time was not persisted alongside the diagnosis.
        startedAt: recoveredAt,
        status,
        ...(reason !== undefined && { reason }),
        diagnosis,
      }
    }
  }
}

function telemetryGuard(telemetry: TelemetryOptions) {
  let told = false
  return async (write: () => Promise<void>): Promise<void> => {
    try {
      await write()
    } catch (error) {
      if (!told)
        telemetry.warn?.(
          `telemetry was not written: ${(error as Error).message} — the run goes on without it`,
        )
      told = true
    }
  }
}

function recordExhaustedTelemetry(
  run: ObservedRun,
  { launch, fault }: { launch: StepLaunch; fault: FaultAttempt },
  result: StepExecutionResult,
  startedAt: Date,
) {
  return recordStep(
    run,
    recoveredExecution({
      step: launch,
      startedAt,
      status: result.status,
      diagnosis: fault,
      ...recoveredOrigin(fault.origin),
      ...(result.reason !== undefined && { reason: result.reason }),
      ...escalationOf(run.outcomes.find(outcome => outcome.id === launch.id)),
    }),
  )
}

function closeWithFaults(run: RunDirectory, status: RunEndStatus, now: () => Date) {
  const faults = [...recoverableFaults(run, now)]
  return faults.length === 0 ? closeRun(run, status) : recordMissingFaultSteps(run, faults, status)
}

/**
 * The run's telemetry, when it is on. It never fails a run: the first write error is reported, and
 * the run goes on without it.
 */
export function telemetryWriter(run: ObservedRun, telemetry: TelemetryOptions) {
  const safe = telemetryGuard(telemetry)
  const now = telemetry.now ?? (() => new Date())
  const step = (execution: Omit<StepExecution, 'host' | 'settings'>, model?: string) =>
    safe(() =>
      recordStep(run, {
        ...execution,
        host: telemetry.host,
        settings:
          execution.step.kind === 'loop'
            ? { engine: 'pair' }
            : { ...telemetry.settings(execution.step.id), ...(model !== undefined && { model }) },
      }),
    )
  return {
    now,
    host: telemetry.host,
    settings: telemetry.settings,
    reconcile: (terminal?: RunEndStatus) =>
      safe(() => recordMissingFaultSteps(run, recoverableFaults(run, now), terminal)),
    step,
    exhausted: (launch: StepLaunch, fault: FaultAttempt, result: StepExecutionResult) =>
      safe(() => recordExhaustedTelemetry(run, { launch, fault }, result, now())),
    execution: (
      launch: StepLaunch,
      result: StepExecutionResult,
      exchange: TimedExchange,
      endedAt = now(),
    ) =>
      step(
        {
          step: launch,
          startedAt: exchange.startedAt,
          durationMs: Math.max(0, endedAt.getTime() - exchange.startedAt.getTime()),
          tokens:
            exchange.usage === undefined
              ? estimated(exchange.sent, exchange.final)
              : measured(exchange.usage),
          ...(exchange.diagnosis !== undefined && { diagnosis: exchange.diagnosis }),
          status: result.status,
          ...(result.reason !== undefined && { reason: result.reason }),
          ...escalationOf(run.outcomes.find(outcome => outcome.id === launch.id)),
        },
        exchange.model,
      ),
    reopen: () => safe(() => reopenRun(run)),
    close: (status: RunOutcome['run']) => safe(() => closeWithFaults(run, status, now)),
  }
}

type Writer = ReturnType<typeof telemetryWriter> | undefined

/** Restore an interrupted terminal fault write without reopening the run or launching a step. */
export async function recoverTerminalFaults(status: Started['status'], writer: Writer) {
  if (writer === undefined || status === 'started' || status === 'resumed') return
  await writer.reconcile(status === 'complete' ? 'done' : status)
}

interface ObservedRun extends RunDirectory {
  readonly outcomes: EngineOutcome[]
}

export function observeRun(run: RunDirectory): ObservedRun {
  const outcomes: EngineOutcome[] = []
  return { ...run, outcomes, observeOutcome: outcome => outcomes.push(outcome) }
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

export async function flushOutcomes(
  host: WorkflowHost,
  run: ObservedRun,
  writer?: Writer,
): Promise<void> {
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
  const source = host.id ?? writer?.host
  const origin = source && { host: source, ...writer?.settings(step.id) }
  const exchange: Exchange = { step, origin, sent: '', final: '' }
  if (writer === undefined) return execute(host, run, exchange)
  if (step.exhaustedFault !== undefined) {
    const result = await execute(host, run, exchange)
    await writer.exhausted(step, step.exhaustedFault, result)
    return result
  }
  let startedAt = writer.now()
  const report = async (result: StepExecutionResult) => {
    const endedAt = writer.now()
    await writer.execution(exchange.step, result, { ...exchange, startedAt }, endedAt)
    startedAt = endedAt
  }
  const result = await execute(host, run, exchange, report)
  await report(result)
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
export async function advanceStep(
  host: WorkflowHost,
  run: RunDirectory,
  canStart?: (step: StepLaunch) => boolean,
  approval?: string,
) {
  const found = await next(run, host.card?.bind(host), [], {
    async check(step) {
      if (canStart?.(step) === false) return undefined
      const assignment = assignmentAtStart(step)
      return assignment === undefined ? undefined : host.assignCard?.(assignment)
    },
    approval,
  })
  for (const { id, kind } of found.skipped ?? [])
    host.report?.({
      step: id,
      kind,
      state: 'skipped',
      summary: 'skipped: when did not match',
    })
  const { run: state, held, blocked } = found
  if (held !== undefined) {
    const event: StepEvent = {
      step: held.id,
      kind: held.kind,
      state: 'skipped',
      summary: held.summary,
      reason: 'card-held',
    }
    host.report?.(event)
    return { ...found, state: 'skipped' as const, event }
  }
  if (blocked === undefined) return { ...found, state, event: undefined }
  const event: StepEvent = {
    step: blocked.id,
    kind: blocked.kind,
    state: 'failed',
    summary: 'could not evaluate when',
    reason: 'card-status-unavailable',
    detail: blocked.detail,
  }
  host.report?.(event)
  return { ...found, state, event }
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

export async function startStep(host: WorkflowHost, step: StepLaunch): Promise<StepLaunch> {
  if (step.exhaustedFault !== undefined) return step
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
  return launch
}

export async function endStep(
  host: WorkflowHost,
  step: StepLaunch,
  { status, summary, reason, detail }: StepExecutionResult,
): Promise<StepEvent> {
  const event: StepEvent = {
    step: step.id,
    kind: step.kind,
    state: status,
    summary,
    ...(reason !== undefined && { reason }),
    ...(detail !== undefined && { detail }),
  }
  await emitStep(host, event)
  return event
}

export async function runStep(
  host: WorkflowHost,
  run: ObservedRun,
  step: StepLaunch,
  writer?: Writer,
): Promise<StepEvent> {
  const launch = await startStep(host, step)
  const installed = host.skillOf ? { ...launch, uses: host.skillOf(launch) } : launch
  const result = await executeMetered(host, run, installed, writer)
  await flushOutcomes(host, run, writer)
  return endStep(host, step, result)
}

/** The host loop over a started run: `next` → launch → `record`, until the run is no longer running. */
export async function runSteps(
  host: WorkflowHost,
  dir: string,
  telemetry?: TelemetryOptions,
): Promise<RunOutcome> {
  const run = observeRun({ files: host.files, dir })
  const writer = telemetry && telemetryWriter(run, telemetry)
  if (writer === undefined) await reopenRun(run).catch(() => undefined)
  else await writer.reconcile()
  let last: StepEvent | undefined
  for (;;) {
    const { ready, state, event } = await advanceStep(host, run)
    await flushOutcomes(host, run, writer)
    const step = ready[0]
    if (state !== 'running' || step === undefined) return ended(run, state, event ?? last, writer)
    last = await runStep(host, run, step, writer)
    if (last.state === 'skipped') return ended(run, 'skipped', last, writer)
  }
}

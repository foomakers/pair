import { basename, join, resolve } from 'node:path'
import { configurationText, type Configuration } from '../configuration'
import { buildMessage } from '../dispatch'
import {
  FROZEN_WORKFLOW,
  STATE_FILE,
  completedRun,
  effectiveConfiguration,
  frozenWorkflow,
  pendingBoardStatus,
  pendingMergeClosure,
  record,
  requireState,
  start,
  stepSettled,
  writeAtomic,
  type RunDirectory,
  type RunState,
  type StepLaunch,
  type RunStateFile,
} from '../engine'
import { addressedSteps, CARD_STATES, type CardState, type Step, type Workflow } from '../grammar'
import {
  advanceStep,
  endStep,
  flushOutcomes,
  observeRun,
  runStep,
  settleAgentStep,
  startStep,
  stepInputFailure,
  telemetryWriter,
  type StepEvent,
} from '../host'
import { kindByName } from '../kinds'
import { effectiveSelection, type CardFacts } from '../select'
import { reopenRun, type Usage } from '../telemetry'
import { prepareReplayHead } from '../worktree'
import { runHostProcess } from '../worktree/host-process'
import {
  sessionBoardMacrostate,
  sessionCard,
  sessionCardStatus,
  sessionWorktree,
} from '../worktree/session'
import { acquireCardLock } from './card-lock'
import { withSessionLease, type SessionApproval, type SessionLease } from './run-lock'
import { sessionHost } from './session-host'
import { approvalQuestion, type ApprovalTarget } from './workflow-approval'
import { runWorkflowOperation, type Operation } from './workflow-facts'
import { workflowMerge } from './workflow-merge'
import { refreshReplayInputs } from './workflow-replay'
import { loadSessionProjectConfig, readMessage, readText, sessionFiles } from './session-files'
import { resolveWorkingPathOverride } from './working-area'
import {
  checkWorkflowConfiguration,
  controlStateScript,
  cycleScripts,
  effectiveSettings,
  isSafeText,
  readAdoption,
  sessionDefaultSkill,
  sessionInteractiveOf,
  workflowConfiguration,
  workflowDefinition,
  workflowName,
  workflowSummary,
  type Project,
} from './session-project'

export function sessionRun(main: string, runId: string): RunDirectory {
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]{0,199}$/.test(runId) || runId.includes('..'))
    throw new Error(`run-id-invalid: ${runId}`)
  return { dir: join(main, '.pair/working/runs', runId), files: sessionFiles }
}

type StartInput = { workflow: string; card: string; engine: string; config?: string | undefined }
type OpenInput = { runId: string; engine: string } | StartInput
type Definition = ReturnType<typeof workflowDefinition>

function startCoordinates(project: Project, input: StartInput) {
  const { card } = input
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]{0,199}$/.test(card) || card.includes('..'))
    throw new Error(`card-invalid: ${card}`)
  const runId = `${workflowName(input.workflow)}-${card}`
  const run = sessionRun(project.main, runId)
  if (run.files.existsSync(join(run.dir, STATE_FILE))) return { runId }
  const definition = workflowDefinition(project, input.workflow)
  return { runId: `${definition.workflow.name}-${card}`, definition }
}

type Card = ReturnType<typeof sessionCard>

function prepareSessionWorktree(project: Project, scripts: string, card: string, view?: Card) {
  return sessionWorktree(scripts, {
    main: project.main,
    story: card,
    title() {
      const title = (view ?? sessionCard(scripts, project.main, card)).title
      if (title === null) throw new Error(`card-unreadable: ${card} has no title`)
      return title
    },
    adoption: readAdoption(project),
  })
}

function checkSelection(
  project: Project,
  scripts: string,
  view: Card,
  {
    workflow,
    configuration,
    run,
  }: { workflow: Workflow; configuration: Configuration | undefined; run?: RunDirectory },
) {
  const filter = configuration?.select?.filter ?? workflow.select?.filter
  if (filter === undefined) return
  const facts =
    filter.assignee === undefined ? view : sessionCard(scripts, project.main, view.id, true)
  const selection = effectiveSelection(workflow.select, configuration?.select)
  const accepts = selection.needsStatus(facts)
    ? acceptsBoardStatus(project, facts, selection.accepts, { run, workflow: workflow.name })
    : selection.accepts(facts)
  if (!accepts)
    throw new Error(`not-applicable: card ${view.id} does not match the selection filter`)
}

function acceptsBoardStatus(
  project: Project,
  facts: Card,
  accepts: (facts: CardFacts) => boolean,
  saved: { run: RunDirectory | undefined; workflow: string },
): boolean {
  if (facts.boardError !== undefined) throw new Error(facts.boardError)
  const { main } = project
  const authority = controlStateScript(project)
  const status = sessionCardStatus(authority, main, facts)
  if (status !== null && accepts({ ...facts, status })) return true
  const previous = pendingSelectionStatus(authority, main, { ...facts, status }, saved)
  return previous != null && accepts({ ...facts, status: previous })
}

function pendingSelectionStatus(
  authority: string,
  main: string,
  view: Card & { status: CardState | null },
  { run, workflow }: { run: RunDirectory | undefined; workflow: string },
) {
  const { status, boardState } = view
  if (
    run === undefined ||
    status === null ||
    CARD_STATES.indexOf(status) < CARD_STATES.indexOf('Ready')
  )
    return
  // As in the CLI, the DoR can resolve to Ready while the board still reads Draft.
  const draft =
    status === 'Ready' &&
    boardState !== null &&
    sessionBoardMacrostate(authority, main, boardState) === 'Draft'
      ? boardState
      : undefined
  const previous = pendingBoardStatus(run, { card: view.id, workflow }, draft)
  return previous === undefined ? undefined : sessionBoardMacrostate(authority, main, previous)
}

async function startFresh(
  project: Project,
  run: RunDirectory,
  input: StartInput,
  definition: Definition,
) {
  const scripts = cycleScripts(project)
  const { card } = input
  const view = sessionCard(scripts, project.main, card)
  if (view.closed) throw new Error(`card-closed: ${card}`)
  const selected = workflowConfiguration(project, {
    workflow: definition.workflow.name,
    engine: input.engine,
    flag: input.config,
    labels: view.labels,
  })
  // The session engine describes this host. Other engines are handled at the step boundary.
  const configWarnings = checkWorkflowConfiguration(definition.workflow, selected)
  checkSelection(project, scripts, view, {
    workflow: definition.workflow,
    configuration: selected?.configuration,
  })
  const worktree = await prepareSessionWorktree(project, scripts, card, view)
  const started = await start(run, definition.source, {
    card,
    ...(selected !== undefined && {
      configuration: { text: configurationText(selected.configuration) },
      cardLabels: selected.cardLabels,
    }),
  })
  await writeAtomic(
    run.files,
    join(run.dir, 'sources.json'),
    JSON.stringify(definition.digests, null, 2),
  )
  return {
    ...started,
    warnings: [...definition.warnings, ...configWarnings, ...started.warnings],
    card,
    worktree,
  }
}

async function resumeSaved(
  project: Project,
  run: RunDirectory,
  input: OpenInput,
  definition: Definition | undefined,
) {
  const state = requireState(run)
  const { card } = state
  const workflow = state.workflow.name
  const expected = definition?.workflow.name
  if (
    'card' in input &&
    (input.card !== card || (expected ?? workflowName(input.workflow)) !== workflow)
  )
    throw new Error(
      `run-mismatch: ${basename(run.dir)} belongs to workflow ${workflow} on card ${card}`,
    )
  const file = join(run.dir, FROZEN_WORKFLOW)
  const source = { file, text: readText(file) }
  const configuration = effectiveConfiguration(run)
  if (completedRun(run, { card, workflow }))
    return { ...(await start(run, source, { card })), card, worktree: undefined }
  const scripts = cycleScripts(project)
  const view = sessionCard(scripts, project.main, card)
  const saved = frozenWorkflow(run)
  const operation: Operation = (action, card, data) =>
    runWorkflowOperation(runHostProcess, () => scripts, project.main, { action, card, data })
  if (view.closed)
    return finishSessionClosure(project.main, run, { card, state, workflow: saved }, operation)
  checkSelection(project, scripts, view, { workflow: saved, configuration, run })
  const replay = await refreshReplayInputs({ workflow: saved, state }, operation)
  const worktree = await prepareSessionWorktree(project, scripts, card, view)
  if (replay) await prepareReplayHead(worktree, replay.inputs.head, runHostProcess)
  return { ...(await start(run, source, { card, ...(replay && { replay }) })), card, worktree }
}

async function finishSessionClosure(
  main: string,
  run: RunDirectory,
  { card, state, workflow }: { card: string; state: RunStateFile; workflow: Workflow },
  operation: Operation,
) {
  const step = pendingMergeClosure(workflow, state)
  if (
    step === undefined ||
    (await operation('merge-resume', card, {
      pr: step.inputs['pr'],
      head: step.inputs['head'],
    })) !== true
  )
    throw new Error(`card-closed: ${card}`)
  const result = await record(run, step.id, await workflowMerge(operation, main, true)(step), {
    host: 'session',
  })
  return {
    card,
    status: result.status === 'ok' ? ('complete' as const) : ('failed' as const),
    warnings: [result.summary],
    worktree: undefined,
    telemetryWarning: undefined,
  }
}

function withCardSessionLease<T>(
  main: string,
  run: RunDirectory,
  input: { engine: string; card?: string } | { token: string },
  command: Parameters<typeof withSessionLease<T>>[2],
): Promise<T> {
  const config = loadSessionProjectConfig(main)
  const workingArea = resolve(main, resolveWorkingPathOverride(config))
  return withSessionLease(run.dir, input, async lease => {
    const card = ('card' in input && input.card) || requireState(run).card
    const outcome = acquireCardLock({
      workingArea,
      card,
      session: { runId: basename(run.dir), token: lease.token, runDirectory: run.dir },
    })
    if (outcome.kind === 'held') throw new Error(`card-locked: ${outcome.path}`)
    try {
      const result = await command(lease)
      if (result.stop) outcome.lock.release()
      return result
    } catch (error) {
      if ('engine' in input) outcome.lock.release()
      throw error
    }
  })
}

export async function openSession(project: Project, input: OpenInput) {
  const { runId, definition } =
    'card' in input
      ? startCoordinates(project, input)
      : { runId: input.runId, definition: undefined }
  const run = sessionRun(project.main, runId)
  const hasState = () => run.files.existsSync(join(run.dir, STATE_FILE))
  if ('card' in input) await run.files.mkdir(run.dir, { recursive: true })
  else if (!hasState()) throw new Error(`run-not-found: ${runId}`)

  return withCardSessionLease(
    project.main,
    run,
    { engine: input.engine, ...('card' in input && { card: input.card }) },
    async lease => {
      const opened =
        'card' in input && definition !== undefined && !hasState()
          ? await startFresh(project, run, input, definition)
          : await resumeSaved(project, run, input, definition)
      const workflow = frozenWorkflow(run)
      const config = effectiveConfiguration(run)
      if (opened.telemetryWarning !== undefined) lease.telemetryWarned = true
      if (opened.status === 'resumed') {
        const writer = sessionTelemetry(observeRun(run), workflow, config, lease)
        if (writer === undefined) await reopenRun(run).catch(() => undefined)
        else await writer.reopen()
      }
      return {
        ...(opened.worktree !== undefined && { worktree: opened.worktree }),
        result: {
          ...opened,
          ...workflowSummary(project, workflow, config, lease.engine),
          runId,
          lease: lease.token,
        },
      }
    },
  )
}

function sessionLaunch(project: Project, launch: StepLaunch, steps: readonly Step[]) {
  const step = steps.find(candidate => candidate.id === launch.id)
  if (step === undefined) throw new Error(`step-unknown: ${launch.id}`)
  return {
    step,
    resolved: {
      ...launch,
      uses: step.skill ?? sessionDefaultSkill(project, launch.uses),
      interactive: sessionInteractiveOf(launch),
    },
  }
}

const sessionMessage = (launch: StepLaunch, worktree: string | undefined) =>
  buildMessage(launch, kindByName[launch.kind], {
    style: 'instruction',
    isSafeText,
    worktree,
  })

function stepPacket(
  workflow: Workflow,
  configuration: Configuration | undefined,
  context: { readonly project: Project; readonly engine: string; readonly worktree?: string },
  launch: StepLaunch,
) {
  const { step, resolved } = sessionLaunch(context.project, launch, addressedSteps(workflow))
  return {
    ...resolved,
    worktree: context.worktree,
    settings: effectiveSettings(configuration, workflow, step, context.engine),
    message: sessionMessage(resolved, context.worktree),
  }
}

function sessionTelemetry(
  run: ReturnType<typeof observeRun>,
  workflow: Workflow,
  configuration: Configuration | undefined,
  lease: SessionLease,
) {
  if (configuration?.telemetry !== true) return undefined
  const steps = addressedSteps(workflow)
  const { engine } = lease
  return telemetryWriter(run, {
    host: 'session',
    settings(id) {
      const step = steps.find(candidate => candidate.id === id)
      const effort =
        step === undefined
          ? undefined
          : effectiveSettings(configuration, workflow, step, engine).effort
      return { engine, effort }
    },
    warn(message) {
      if (lease.telemetryWarned === true) return
      lease.telemetryWarned = true
      process.stderr.write(`Warning: ${message}\n`)
    },
  })
}

function sessionAnswer(value: string) {
  if (value === 'approve') return { verdict: 'approved' as const }
  if (value.startsWith('reject:') && value.slice(7).trim() !== '')
    return { verdict: 'rejected' as const, note: value.slice(7) }
  throw new Error('--answer must be approve or reject:<note>')
}

const approvalPrompt = ({ step, question, pr, head }: SessionApproval) => ({
  approval: { step, question },
  approvalTarget: { pr, head },
})

const needsHost = (step: StepLaunch) =>
  kindByName[step.kind].host === true ||
  step.pendingSuccess !== undefined ||
  stepInputFailure(step) !== undefined

type Selection = Awaited<ReturnType<typeof advanceStep>>
type SessionNext = Partial<ReturnType<typeof approvalPrompt>> & {
  run: RunState
  ready: readonly ReturnType<typeof stepPacket>[]
  events?: readonly StepEvent[]
  held?: Selection['held']
  blocked?: Selection['blocked']
}

function selectedResponse(selected: Selection, events: StepEvent[]): SessionNext {
  return {
    run: selected.held === undefined ? selected.run : 'parked',
    ready: [],
    events,
    held: selected.held,
    blocked: selected.blocked,
  }
}

function approvalResponse(
  result: StepEvent,
  step: StepLaunch,
  events: StepEvent[],
  target?: ApprovalTarget,
) {
  const waiting = result.state === 'needs-decision'
  const approval =
    waiting && target !== undefined
      ? { step: step.id, question: approvalQuestion(step), ...target }
      : undefined
  return {
    result: {
      run: waiting || result.state === 'blocked' ? ('parked' as const) : ('running' as const),
      ready: [],
      events,
      ...(approval !== undefined && approvalPrompt(approval)),
    },
    approval,
  }
}

type AdvanceInput = {
  project: Project
  run: ReturnType<typeof observeRun>
  lease: SessionLease
  answer: string | undefined
}

async function advanceSession(
  { project, run, lease, answer }: AdvanceInput,
  steps: ReturnType<typeof addressedSteps>,
  packet: (launch: StepLaunch) => ReturnType<typeof stepPacket>,
  writer: ReturnType<typeof sessionTelemetry>,
) {
  const parked = lease.approval
  const events: StepEvent[] = []
  let target: ApprovalTarget | undefined
  let runningOnHost = false
  const host = sessionHost(project, run, {
    onPark: approval => {
      target = approval
    },
    reply:
      answer !== undefined && parked !== undefined
        ? { step: parked.step, answer: sessionAnswer(answer), target: parked }
        : undefined,
    worktree: lease.worktree,
    steps,
  })
  host.report = event => {
    if (event.state !== 'running') events.push(event)
    else if (runningOnHost) process.stderr.write(`${JSON.stringify({ event })}\n`)
  }
  const canStart = (step: StepLaunch) =>
    needsHost(step) || packet(step).settings.engine === lease.engine
  const selected = await advanceStep(host, run, canStart, parked?.step)
  const launchStartedAt = writer?.now().getTime()
  await flushOutcomes(host, run, writer)
  const [step] = selected.ready
  if (step === undefined) return { result: selectedResponse(selected, events) }
  if (needsHost(step)) {
    runningOnHost = true
    const result = await runStep(host, run, step, writer)
    const definition = steps.find(candidate => candidate.id === step.id)
    if (definition !== undefined && stepSettled(definition, result.state))
      return { result: { run: 'running' as const, ready: [], events } }
    return approvalResponse(result, step, events, target)
  }
  const launch = canStart(step) ? await startStep(host, step) : step
  const result = { run: 'running' as const, ready: [packet(launch)], events }
  return { result, launch, launchStartedAt }
}

export async function nextSession(
  project: Project,
  run: RunDirectory,
  token: string,
  answer?: string,
) {
  return withCardSessionLease<SessionNext>(project.main, run, { token }, async lease => {
    if (answer !== undefined && lease.approval === undefined)
      throw new Error('The workflow must be parked at an approval shown in this session')
    if (lease.approval !== undefined && answer === undefined)
      return {
        result: { run: 'parked', ready: [], ...approvalPrompt(lease.approval) },
        approval: lease.approval,
      }

    const workflow = frozenWorkflow(run)
    const config = effectiveConfiguration(run)
    const packet = (launch: StepLaunch) =>
      stepPacket(workflow, config, { ...lease, project }, launch)
    if (lease.launch !== undefined)
      return {
        result: { run: 'running', ready: [packet(lease.launch)] },
        launch: lease.launch,
        launchStartedAt: lease.launchStartedAt,
      }
    const observed = observeRun(run)
    const writer = sessionTelemetry(observed, workflow, config, lease)
    const advanced = await advanceSession(
      { project, run: observed, lease, answer },
      addressedSteps(workflow),
      packet,
      writer,
    )
    const result: SessionNext = advanced.result
    if (result.run !== 'running')
      await writer?.close(result.held === undefined ? result.run : 'skipped')
    return advanced
  })
}

export async function recordSession(
  project: Project,
  run: RunDirectory,
  token: string,
  input: {
    step: string
    file: string
    attempt?: number | undefined
    model?: string | undefined
    usage?: Usage | undefined
  },
) {
  return withCardSessionLease(project.main, run, { token }, async lease => {
    const { launch } = lease
    const { step, file, model, attempt, usage } = input
    if (launch?.id !== step || launch.attempt !== (attempt ?? 1))
      throw new Error(`step-not-reserved: ${step} needs the attempt returned by next`)
    const workflow = frozenWorkflow(run)
    const config = effectiveConfiguration(run)
    const steps = addressedSteps(workflow)
    const host = sessionHost(project, run, {
      steps,
      worktree: lease.worktree,
    })
    const observed = observeRun(run)
    const writer = sessionTelemetry(observed, workflow, config, lease)
    const startedAt = new Date(lease.launchStartedAt ?? Date.now())
    const sent =
      writer === undefined
        ? ''
        : sessionMessage(sessionLaunch(project, launch, steps).resolved, lease.worktree)
    const final = readMessage(file)
    const result = await settleAgentStep(host, observed, launch, { final, model })
    await writer?.execution(launch, result, { sent, final, usage, startedAt, model })
    await flushOutcomes(host, observed, writer)
    await endStep(host, launch, result)
    if (result.status === 'skipped') await writer?.close('skipped')
    return { result }
  })
}

export async function renewSession(main: string, run: RunDirectory, token: string) {
  return withCardSessionLease(main, run, { token }, async lease => ({
    result: { renewed: true },
    ...(lease.launch !== undefined && { launch: lease.launch }),
    launchStartedAt: lease.launchStartedAt,
    approval: lease.approval,
  }))
}

export async function stopSession(main: string, run: RunDirectory, token: string) {
  return withCardSessionLease(main, run, { token }, async () => ({
    result: { stopped: true },
    stop: true,
  }))
}

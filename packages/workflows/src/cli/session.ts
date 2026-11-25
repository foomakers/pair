import { basename, join } from 'node:path'
import { configurationText, type Configuration } from '../configuration'
import { buildMessage } from '../dispatch'
import {
  FROZEN_WORKFLOW,
  STATE_FILE,
  completedRun,
  effectiveConfiguration,
  frozenWorkflow,
  requireState,
  start,
  stepSettled,
  writeAtomic,
  type RunDirectory,
  type RunState,
  type StepLaunch,
} from '../engine'
import { addressedSteps, type Workflow } from '../grammar'
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
import { reopenRun, type Usage } from '../telemetry'
import { prepareReplayHead } from '../worktree'
import { runHostProcess } from '../worktree/host-process'
import { sessionCard, sessionWorktree } from '../worktree/session'
import { withSessionLease, type SessionApproval, type SessionLease } from './run-lock'
import { sessionHost } from './session-host'
import { approvalQuestion, type ApprovalTarget } from './workflow-approval'
import { runWorkflowOperation } from './workflow-facts'
import { refreshReplayInputs } from './workflow-replay'
import { readMessage, readText, sessionFiles } from './session-files'
import {
  cycleScripts,
  effectiveSettings,
  isSafeText,
  readAdoption,
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
  return { ...started, warnings: [...definition.warnings, ...started.warnings], card, worktree }
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
  effectiveConfiguration(run) // Refuse an unreadable frozen file before touching the worktree.
  if (completedRun(run, { card, workflow }))
    return { ...(await start(run, source, { card })), card, worktree: undefined }
  const scripts = () => cycleScripts(project)
  const replay = await refreshReplayInputs(
    { workflow: frozenWorkflow(run), state },
    (action, card, data) =>
      runWorkflowOperation(runHostProcess, scripts, project.main, { action, card, data }),
  )
  const worktree = await prepareSessionWorktree(project, scripts(), card)
  if (replay) await prepareReplayHead(worktree, replay.inputs.head, runHostProcess)
  return { ...(await start(run, source, { card, ...(replay && { replay }) })), card, worktree }
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

  return withSessionLease(run.dir, { engine: input.engine }, async lease => {
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
        ...workflowSummary(workflow, config, lease.engine),
        runId,
        lease: lease.token,
      },
    }
  })
}

const sessionMessage = (launch: StepLaunch, worktree: string | undefined) =>
  buildMessage(launch, kindByName[launch.kind], { style: 'instruction', isSafeText, worktree })

function stepPacket(
  workflow: Workflow,
  configuration: Configuration | undefined,
  context: { readonly engine: string; readonly worktree?: string },
  launch: StepLaunch,
) {
  const step = addressedSteps(workflow).find(candidate => candidate.id === launch.id)
  if (step === undefined) throw new Error(`step-unknown: ${launch.id}`)
  return {
    ...launch,
    worktree: context.worktree,
    interactive: launch.interactive === true,
    settings: effectiveSettings(configuration, workflow, step, context.engine),
    message: sessionMessage(launch, context.worktree),
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
  }
  const canStart = (step: StepLaunch) =>
    needsHost(step) || packet(step).settings.engine === lease.engine
  const selected = await advanceStep(host, run, canStart, parked?.step)
  const launchStartedAt = writer?.now().getTime()
  await flushOutcomes(host, run, writer)
  const [step] = selected.ready
  if (step === undefined) return { result: selectedResponse(selected, events) }
  if (needsHost(step)) {
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
  return withSessionLease<SessionNext>(run.dir, { token }, async lease => {
    if (answer !== undefined && lease.approval === undefined)
      throw new Error('The workflow must be parked at an approval shown in this session')
    if (lease.approval !== undefined && answer === undefined)
      return {
        result: { run: 'parked', ready: [], ...approvalPrompt(lease.approval) },
        approval: lease.approval,
      }

    const workflow = frozenWorkflow(run)
    const config = effectiveConfiguration(run)
    const packet = (launch: StepLaunch) => stepPacket(workflow, config, lease, launch)
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
  return withSessionLease(run.dir, { token }, async lease => {
    const { launch } = lease
    const { step, file, model, attempt, usage } = input
    if (launch?.id !== step || launch.attempt !== (attempt ?? 1))
      throw new Error(`step-not-reserved: ${step} needs the attempt returned by next`)
    const workflow = frozenWorkflow(run)
    const config = effectiveConfiguration(run)
    const host = sessionHost(project, run, {
      steps: addressedSteps(workflow),
      worktree: lease.worktree,
    })
    const observed = observeRun(run)
    const writer = sessionTelemetry(observed, workflow, config, lease)
    const startedAt = new Date(lease.launchStartedAt ?? Date.now())
    const sent = writer === undefined ? '' : sessionMessage(launch, lease.worktree)
    const final = readMessage(file)
    const result = await settleAgentStep(host, observed, launch, { final, model })
    await writer?.execution(launch, result, { sent, final, usage, startedAt, model })
    await flushOutcomes(host, observed, writer)
    await endStep(host, launch, result)
    if (result.status === 'skipped') await writer?.close('skipped')
    return { result }
  })
}

export async function stopSession(run: RunDirectory, token: string) {
  return withSessionLease(run.dir, { token }, async () => ({
    result: { stopped: true },
    stop: true,
  }))
}

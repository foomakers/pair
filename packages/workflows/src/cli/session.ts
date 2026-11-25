import { join } from 'node:path'
import { settingsFor, type Configuration } from '../configuration'
import { buildMessage, readResult } from '../dispatch'
import {
  FROZEN_WORKFLOW,
  STATE_FILE,
  effectiveConfiguration,
  frozenWorkflow,
  identityOf,
  next,
  record,
  start,
  writeAtomic,
  type RunDirectory,
  type StepLaunch,
} from '../engine'
import { addressedSteps, type Step, type Workflow } from '../grammar'
import { interactiveOf, kindByName } from '../kinds'
import { sessionCard, sessionWorktree } from '../worktree/session'
import { withSessionLease } from './run-lock'
import { readMessage, readText, sessionFiles } from './session-files'
import {
  cycleScripts,
  isSafeText,
  readAdoption,
  workflowConfiguration,
  workflowDefinition,
  workflowName,
} from './session-project'

interface SessionProject {
  readonly cwd: string
  readonly main: string
  readonly scriptDir: string
}

export function sessionRun(main: string, runId: string): RunDirectory {
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]{0,199}$/.test(runId) || runId.includes('..'))
    throw new Error(`run-id-invalid: ${runId}`)
  return { dir: join(main, '.pair/working/runs', runId), files: sessionFiles }
}

function effectiveSettings(
  configuration: Configuration | undefined,
  workflow: Workflow,
  step: Step,
  engine: string,
) {
  return configuration === undefined
    ? { engine }
    : settingsFor(configuration, step, workflow.aliases)
}

type StartInput = { workflow: string; card: string; engine: string; config?: string | undefined }
type OpenInput = { runId: string; engine: string } | StartInput
type Definition = ReturnType<typeof workflowDefinition>

function startCoordinates(project: SessionProject, input: StartInput) {
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

function prepareSessionWorktree(
  project: SessionProject,
  scripts: string,
  card: string,
  view?: Card,
) {
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
  project: SessionProject,
  run: RunDirectory,
  input: StartInput,
  definition: Definition,
) {
  const scripts = cycleScripts(project)
  const { card } = input
  const view = sessionCard(scripts, project.main, card)
  if (view.closed) throw new Error(`card-closed: ${card}`)
  const configuration = workflowConfiguration(project, {
    workflow: definition.workflow.name,
    engine: input.engine,
    flag: input.config,
    labels: view.labels,
  })
  const worktree = await prepareSessionWorktree(project, scripts, card, view)
  const started = await start(run, definition.source, { card, ...configuration })
  await writeAtomic(
    run.files,
    join(run.dir, 'sources.json'),
    JSON.stringify(definition.digests, null, 2),
  )
  return { ...started, warnings: [...definition.warnings, ...started.warnings], card, worktree }
}

async function resumeSaved(
  project: SessionProject,
  run: RunDirectory,
  input: OpenInput,
  definition: Definition | undefined,
) {
  const { card, workflow, run: id } = identityOf(run)
  const expected = definition?.workflow.name
  if (
    'card' in input &&
    (input.card !== card || (expected ?? workflowName(input.workflow)) !== workflow)
  )
    throw new Error(`run-mismatch: ${id} belongs to workflow ${workflow} on card ${card}`)
  const file = join(run.dir, FROZEN_WORKFLOW)
  const text = readText(file)
  frozenWorkflow(run)
  effectiveConfiguration(run) // Refuse an unreadable frozen file before touching the worktree.
  const worktree = await prepareSessionWorktree(project, cycleScripts(project), card)
  return { ...(await start(run, { file, text }, { card })), card, worktree }
}

function startSummary(run: RunDirectory, engine: string) {
  const workflow = frozenWorkflow(run)
  const effective = effectiveConfiguration(run)
  return {
    workflow: workflow.name,
    configuration: effective?.name,
    steps: addressedSteps(workflow).flatMap(step =>
      step.kind === 'loop'
        ? []
        : [
            {
              id: step.id,
              kind: step.kind,
              skill: step.skill ?? kindByName[step.kind].defaultSkill,
              interactive: interactiveOf(step),
              settings: effectiveSettings(effective, workflow, step, engine),
            },
          ],
    ),
  }
}

export async function openSession(project: SessionProject, input: OpenInput) {
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
    return {
      worktree: opened.worktree,
      result: {
        ...opened,
        ...startSummary(run, lease.engine),
        runId,
        lease: lease.token,
      },
    }
  })
}

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
    message: buildMessage(launch, kindByName[launch.kind], {
      style: 'instruction',
      isSafeText,
      worktree: context.worktree,
    }),
  }
}

/** Session-specific host policy can hold the launch before the engine reserves it. */
function sessionHold(workflow: Workflow, launch: StepLaunch): string | undefined {
  const step = addressedSteps(workflow).find(candidate => candidate.id === launch.id)
  const cardCondition = Object.keys(step?.when ?? {}).some(key => key !== 'output' && key !== 'is')
  if (kindByName[launch.kind].host || launch.gates?.length || launch.confirmState || cardCondition)
    return 'This step needs a host operation. Resume with pair run.'
  return undefined
}

export async function nextSession(run: RunDirectory, token: string) {
  return withSessionLease(run.dir, { token }, async lease => {
    const workflow = frozenWorkflow(run)
    const config = effectiveConfiguration(run)
    const packet = (launch: StepLaunch) => stepPacket(workflow, config, lease, launch)
    if (lease.launch !== undefined)
      return {
        result: { run: 'running' as const, ready: [packet(lease.launch)] },
        launch: lease.launch,
      }

    const selected = await next(run, undefined, [], async launch => {
      const hold = sessionHold(workflow, launch)
      if (hold === undefined) packet(launch)
      return hold
    })
    const [launch] = selected.ready
    return {
      result: {
        ...selected,
        ...(selected.held !== undefined && { run: 'parked' as const }),
        ready: selected.ready.map(packet),
      },
      ...(launch !== undefined && { launch }),
    }
  })
}

export async function recordSession(
  run: RunDirectory,
  token: string,
  input: { step: string; file: string; attempt?: number | undefined; model?: string | undefined },
) {
  return withSessionLease(run.dir, { token }, async lease => {
    const { launch } = lease
    const { step, file, model, attempt } = input
    if (launch?.id !== step || launch.attempt !== (attempt ?? 1))
      throw new Error(`step-not-reserved: ${step} needs the attempt returned by next`)
    const output = readMessage(file)
    const value = readResult(output, kindByName[launch.kind])
    const result = await record(run, step, value, {
      output,
      host: 'session',
      model,
      attempt: launch.attempt,
    })
    return { result }
  })
}

export async function stopSession(run: RunDirectory, token: string) {
  return withSessionLease(run.dir, { token }, async () => ({
    result: { stopped: true },
    stop: true,
  }))
}

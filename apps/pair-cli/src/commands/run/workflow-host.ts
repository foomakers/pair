import { basename, extname, join, resolve } from 'path'
import type { FileSystemService } from '@pair/content-ops'
import {
  formatError,
  readGateRegistry,
  runSteps,
  settingsOf,
  start,
  validate,
  type RunOutcome,
  type StepEvent,
  type StepLaunch,
  type StepSettings,
  type Usage,
  type Workflow,
} from '@pair/workflows'
import { loadConfigWithOverrides } from '#config'
import type { Config } from '#registry'
import { getKnowledgeHubDatasetPath } from '#config/kb-resolver'
import type { RunCommandConfig, RunWorkflowRequest } from './parser'
import type { RunHandlerDependencies } from './run-context'
import {
  declaredEngine,
  declaredEngineModel,
  declaredRunIdleTimeout,
  resolveAutonomyFor,
  withRunAgentRunner,
} from './run-context'
import {
  assertEngineAvailable,
  describeEngineResolution,
  resolveEngine,
  type ExecutableProbe,
  type ResolvedEngine,
} from './resolve-engine'
import { createExecutableProbe } from './path-probe'
import { createSkillProbe } from './skill-probe'
import { isSafePromptText } from './prompt-safety'
import { acquireRunLock } from './run-lock'
import { isInterrupted, whileInterruptible } from './interrupt'
import { resolveIdleTimeout, spawnIteration, type SpawnIterationInput } from './spawn'
import { finalTextOf, type IterationResult } from './stream-reader'
import { observeEngineEvent, type EngineObservation } from './telemetry'
import { createConsoleSink, routeConsoleTo, type ConsoleSink } from './run-renderer'
import { mainCheckoutOrCwd, readRunnableCard, resolveBranch, runSetupCommand } from './cycle-wiring'
import {
  createCycleScriptsBridge,
  locateCycleScripts,
  readCycleDefaults,
  resolveCycleWorktreeRoot,
} from './cycle-scripts'

/**
 * `pair run <workflow> --card <id>` — the host of `@pair/workflows` (US-652).
 *
 * The package decides what runs next and what a result means; this module owns what the package
 * must not touch: the workflow file, the card, the engine process, the worktree, the lock, the console.
 */

export const WORKFLOWS_DIR = '.pair/adoption/tech/workflows'
const WAY_OF_WORKING = '.pair/adoption/tech/way-of-working.md'

/** Injected in tests: no real agent, tracker or git. */
export interface WorkflowHostDependencies {
  /** One agent process (shipped: `spawnIteration`). */
  readonly runIteration?: (input: SpawnIterationInput) => Promise<IterationResult>
  /** The card's title, or why it cannot be run (shipped: the PM adapter read). */
  readonly readCard?: typeof readRunnableCard
  /** Creates or reuses the card's worktree and returns its path (shipped: the cycle's own mechanism). */
  readonly prepareWorktree?: (input: WorktreeInput) => Promise<string>
  /** Whether an executable is on PATH (shipped: a PATH probe). */
  readonly engineAvailable?: ExecutableProbe
}

export interface WorktreeInput {
  readonly fs: FileSystemService
  readonly project: Config
  readonly cwd: string
  readonly main: string
  readonly card: string
  readonly title: string
}

interface Services {
  readonly fs: FileSystemService
  readonly deps: RunHandlerDependencies
}

interface Located {
  readonly file: string
  readonly text: string
}

/** A path if the argument is an existing file; else the adoption workflow; else the knowledge-base default. */
export function locateWorkflow(
  fs: FileSystemService,
  at: { readonly cwd: string; readonly main: string },
  name: string,
): Located {
  const adopted = join(at.main, WORKFLOWS_DIR, `${name}.yaml`)
  const candidates = [resolve(at.cwd, name), adopted]
  try {
    candidates.push(join(getKnowledgeHubDatasetPath(fs), WORKFLOWS_DIR, `${name}.yaml`))
  } catch {
    // no knowledge base beside this CLI: the two project locations are the only candidates
  }
  const file = candidates.find(path => fs.existsSync(path) && fs.statSync(path).isFile())
  if (file === undefined)
    throw new Error(
      `workflow-not-found: '${name}' is neither a workflow file nor a workflow name — ` +
        `looked for ${candidates.join(', ')}. Pass the path of a file, or add ${adopted}.`,
    )
  return { file, text: fs.readFileSync(file) }
}

/** The cycle's own worktree mechanism: `<worktree root>/<card>`, the card's branch, the setup command on a fresh one. */
async function cycleWorktree(input: WorktreeInput): Promise<string> {
  const location = locateCycleScripts(input.fs, input.project, input.cwd)
  const made = createCycleScriptsBridge(location, input.cwd).worktree({
    main: input.main,
    story: input.card,
    branch: resolveBranch(input.card, input.title, undefined, input.cwd),
    base: readCycleDefaults(location).baseBranch,
    worktreeRoot: resolveCycleWorktreeRoot(location, input.main, undefined),
  })
  const failed = made.created ? await runSetupCommand(input.main, made.path) : undefined
  if (failed !== undefined) throw new Error(`worktree-setup-failed: ${failed}`)
  return made.path
}

interface Resolved {
  readonly workflow: Workflow
  readonly source: Located
  readonly project: Config
  readonly engine: ResolvedEngine
  readonly main: string
  readonly cwd: string
}

/** Workflow, validation and engine: everything decided before the card is read or anything is launched. */
function resolveWorkflowRun(
  config: RunCommandConfig,
  request: RunWorkflowRequest,
  fs: FileSystemService,
): Resolved | undefined {
  const cwd = resolve(config.cwd ?? fs.currentWorkingDirectory())
  const main = mainCheckoutOrCwd(cwd)
  const project = loadConfigWithOverrides(fs, { projectRoot: cwd }).config
  const source = locateWorkflow(fs, { cwd, main }, request.name)
  const registry = join(main, WAY_OF_WORKING)
  const checked = validate(source.text, source.file, {
    skillExists: createSkillProbe(fs, project, cwd),
    gateKeys: Object.keys(
      readGateRegistry(fs.existsSync(registry) ? fs.readFileSync(registry) : ''),
    ),
    launchInputs: ['card'],
    isSafeText: isSafePromptText,
  })
  console.log(`pair run ${basename(source.file, extname(source.file))} — ${source.file}`)
  checked.warnings.forEach(warning => console.log(`  Warning: ${formatError(warning)}`))
  if (checked.workflow === undefined) {
    checked.errors.forEach(error => console.error(`  ${formatError(error)}`))
    console.error(`  Refused: ${String(checked.errors.length)} error(s); nothing was launched.`)
    return undefined
  }
  const engine = withRunAgentRunner(
    resolveEngine({ flag: config.engine, declared: declaredEngine(project) }),
    project,
  )
  console.log(`  ${describeEngineResolution(engine)}`)
  return { workflow: checked.workflow, source, project, engine, main, cwd }
}

/** What a recorded step says: its summary, then its reason and detail when it has them. */
function explain(event: StepEvent | undefined): string {
  if (event === undefined) return 'no step was recorded'
  const detail = event.detail === undefined ? '' : `: ${event.detail}`
  const reason = event.reason === undefined ? '' : ` (${event.reason}${detail})`
  return `${event.summary ?? ''}${reason}`
}

const stepLine = (event: StepEvent): string => `  ${event.step}: ${event.state} — ${explain(event)}`

interface Launch {
  readonly config: RunCommandConfig
  readonly resolved: Resolved
  readonly services: Services
  readonly worktree: string
}

/** What every step of the run launches with: its one engine and that engine's declared model. */
function runSettings(resolved: Resolved): StepSettings {
  const { id } = resolved.engine.engine
  return { engine: id, model: declaredEngineModel(resolved.project, id) }
}

/** One agent per step, in the card's worktree, on the run's one engine and model. */
function launcher(run: Launch) {
  const { config, resolved, services } = run
  const engine = resolved.engine.engine
  const settings = runSettings(resolved)
  const autonomyArgs = resolveAutonomyFor(engine, config, resolved.main, services.fs).args
  const idle = resolveIdleTimeout({
    flag: config.idleTimeoutSeconds,
    declared: declaredRunIdleTimeout(resolved.project, engine.id),
  })
  const runIteration = services.deps.workflow?.runIteration ?? spawnIteration
  return async (
    step: StepLaunch,
    message: string,
    meter: (usage: Usage) => void,
  ): Promise<string | undefined> => {
    let text: string | undefined
    let observed: EngineObservation = {}
    const result = await runIteration({
      engine,
      promptText: message,
      cwd: run.worktree,
      autonomyArgs,
      model: settingsOf(settings, step.id).model,
      timeoutSeconds: config.iterationTimeoutSeconds,
      idleTimeoutSeconds: idle.seconds,
      onEvent: payload => {
        text = finalTextOf(engine, payload) ?? text
        // The usage the engine reports, read by the per-engine parsers; none reported, none metered.
        observed = observeEngineEvent(observed, engine.id, payload)
        const { tokens } = observed
        if (typeof tokens === 'object')
          meter({ read: tokens.freshIn, cached: tokens.cachedIn, written: tokens.out })
      },
    })
    // An interrupted run records nothing: the step stays `running` on disk and runs again at the next launch.
    if (isInterrupted()) throw new Error('interrupted')
    if (result.outcome === 'success' && text !== undefined) return text
    console.log(`  ${step.id}: the agent ended with no result — ${result.detail}`)
    return undefined
  }
}

function resumeCommand(request: RunWorkflowRequest): string {
  const runId = request.runId === undefined ? '' : ` --run-id ${request.runId}`
  return `pair-cli run ${request.name} --card ${request.card}${runId}`
}

type Ending = (at: string, why: string, resume: string) => string

/** `failed` exits 1 with its reason; `parked` exits 0 with what is needed and the command that resumes it. */
const ENDINGS: Readonly<Record<RunOutcome['run'], { status: string; exit: number; line: Ending }>> =
  {
    done: { status: 'completed', exit: 0, line: () => 'done — every step is ok.' },
    failed: {
      status: 'failed',
      exit: 1,
      line: (at, why, resume) =>
        `failed at step ${at} — ${why}. Fix it, then resume with: ${resume}`,
    },
    parked: {
      status: 'awaiting-human',
      exit: 0,
      line: (at, why, resume) =>
        `parked at step ${at} — it needs a person: ${why}. Resume with: ${resume}`,
    },
  }

function conclude(outcome: RunOutcome, request: RunWorkflowRequest, sink: ConsoleSink): number {
  const ending = ENDINGS[outcome.run]
  const why = explain(outcome.last)
  sink.event({
    event: 'card-end',
    card: request.card,
    status: ending.status,
    ...(outcome.run !== 'done' && { reason: why }),
  })
  console.log(`  Run: ${ending.line(outcome.last?.step ?? '?', why, resumeCommand(request))}`)
  return ending.exit
}

interface Opened {
  readonly resolved: Resolved
  readonly request: RunWorkflowRequest
  readonly runDir: string
  readonly title: string
}

/** The steps, drawn on the run's console: the card line, one line per step outcome, the ending. */
async function runOnConsole(
  config: RunCommandConfig,
  opened: Opened,
  launch: ReturnType<typeof launcher>,
  fs: FileSystemService,
): Promise<number> {
  const { resolved, request, runDir } = opened
  const sink = createConsoleSink({
    out: process.stdout,
    err: process.stderr,
    mode: config.output ?? 'live',
    color: config.noColor !== true && process.env['NO_COLOR'] === undefined,
    plain: config.verbose !== true,
  })
  const restore = routeConsoleTo(sink)
  try {
    sink.event({ event: 'card-start', card: request.card, title: opened.title })
    const outcome = await runSteps(
      {
        files: fs,
        style: resolved.engine.engine.skillInvocationStyle,
        isSafeText: isSafePromptText,
        launch,
        report: event =>
          event.state === 'running'
            ? sink.event({ event: 'stage', card: request.card, stage: event.step })
            : console.log(stepLine(event)),
      },
      runDir,
      // Off unless the flag turns it on; the configuration key arrives with #672.
      config.telemetry === true
        ? {
            host: 'pair-run',
            settings: runSettings(resolved),
            warn: message => console.log(`  Warning: ${message}`),
          }
        : undefined,
    )
    return conclude(outcome, request, sink)
  } finally {
    sink.finish()
    restore()
  }
}

/** The run itself, under the lock: start or resume, the worktree, then the steps. */
async function drive(
  config: RunCommandConfig,
  opened: Opened,
  services: Services,
): Promise<number> {
  const { resolved, request, runDir } = opened
  const { fs, deps } = services
  const started = await start({ files: fs, dir: runDir }, resolved.source, {
    card: request.card,
    restart: request.restart,
  })
  started.warnings.forEach(warning => console.log(`  Warning: ${warning}`))
  console.log(`  Run dir: ${runDir} (${started.status})`)
  if (started.status === 'complete') {
    console.log('  Run: already complete — nothing to do. Pass --restart to start over.')
    return 0
  }
  const worktree = await (deps.workflow?.prepareWorktree ?? cycleWorktree)({
    fs,
    project: resolved.project,
    cwd: resolved.cwd,
    main: resolved.main,
    card: request.card,
    title: opened.title,
  })
  console.log(`  Worktree: ${worktree}`)
  return runOnConsole(config, opened, launcher({ config, resolved, services, worktree }), fs)
}

function printPlan(workflow: Workflow): void {
  workflow.steps.forEach((step, index) =>
    console.log(
      `  ${String(index + 1)}. ${step.id} — ${step.kind}${step.skill ? ` (${step.skill})` : ''}`,
    ),
  )
}

/** The refusals that need the tracker and PATH: a card that cannot be run, an engine that is not installed. Returns the card's title. */
async function preflight(resolved: Resolved, card: string, services: Services): Promise<string> {
  const read = await (services.deps.workflow?.readCard ?? readRunnableCard)(card, resolved.cwd)
  if (read === 'missing')
    throw new Error(
      `card-not-found: card ${card} cannot be read from the tracker; nothing was launched.`,
    )
  if (read === 'closed')
    throw new Error(`card-closed: card ${card} is closed; nothing was launched.`)
  assertEngineAvailable(
    resolved.engine,
    services.deps.workflow?.engineAvailable ?? createExecutableProbe(services.fs),
  )
  return read.title
}

export async function handleWorkflowRun(
  config: RunCommandConfig,
  request: RunWorkflowRequest,
  services: Services,
): Promise<number> {
  const { fs } = services
  const resolved = resolveWorkflowRun(config, request, fs)
  if (resolved === undefined) return 1
  printPlan(resolved.workflow)
  if (config.dryRun) {
    console.log('  Dry run: the workflow is valid; nothing was launched.')
    return 0
  }
  const title = await preflight(resolved, request.card, services)
  const runId = request.runId ?? `${resolved.workflow.name}-${request.card}`
  const runDir = join(resolved.main, '.pair/working/runs', runId)
  fs.mkdirSync(runDir, { recursive: true })
  const lock = acquireRunLock(runDir)
  if (lock.kind === 'run-locked') {
    const holder = lock.pid === undefined ? 'another process' : `pid ${String(lock.pid)}`
    console.error(
      `  run-locked: ${holder} on ${lock.host ?? 'this host'} is driving ${runDir}; nothing was launched.`,
    )
    return 1
  }
  try {
    return await whileInterruptible(
      () => lock.release(),
      () => drive(config, { resolved, request, runDir, title }, services),
    )
  } finally {
    lock.release()
  }
}

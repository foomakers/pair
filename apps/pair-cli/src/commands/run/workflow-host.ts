import { basename, extname, join, resolve } from 'path'
import { createHash } from 'crypto'
import type { FileSystemService } from '@pair/content-ops'
import {
  cardStateOf,
  completedRun,
  effectiveSelection,
  checkAgainstEngines,
  describeSettings,
  formatError,
  kindByName,
  addressedSteps,
  frozenConfiguration,
  parseFrozenConfiguration,
  parseWorkflow,
  readGateRegistry,
  readGateTargets,
  runSteps,
  settingsFor,
  start,
  validate,
  type CardState,
  type Configuration,
  type RunOutcome,
  type StepResult,
  type ResultFacts,
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
import { ghBoard } from './card-board'
import {
  MACROSTATES,
  readStateMapping,
  resolveMacrostate,
  type StateMapping,
} from './card-readiness'
import { createExecutableProbe } from './path-probe'
import { createSkillProbe } from './skill-probe'
import { ENGINES, isEngineId, type EngineDefinition } from './engines'
import { engineFacts, resolveConfiguration, type ConfigurationPlan } from './workflow-configuration'
import { isSafePromptText } from './prompt-safety'
import { acquireRunLock } from './run-lock'
import { acquireCardLock } from './card-lock'
import type { BatchOutcome } from './workflow-batch'
import { readWorkflowPrHead, readWorkflowCards, type WorkflowCard } from './workflow-facts'
import { isInterrupted, whileInterruptible } from './interrupt'
import { resolveIdleTimeout, spawnIteration, type SpawnIterationInput } from './spawn'
import { finalTextOf, type IterationResult } from './stream-reader'
import { observeEngineEvent, type EngineObservation } from './telemetry'
import { createConsoleSink, routeConsoleTo, type ConsoleSink } from './run-renderer'
import {
  mainCheckoutOrCwd,
  readCardFacts,
  readCard,
  readRunnableCard,
  resolveBranch,
  runSetupCommand,
} from './cycle-wiring'
import { performHostKind, runStepGates } from './workflow-kinds'
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
  readonly readSelection?: typeof readWorkflowCards
  readonly readResultFacts?: (step: StepLaunch, result: StepResult) => Promise<ResultFacts>
  /** Creates or reuses the card's worktree and returns its path (shipped: the cycle's own mechanism). */
  readonly prepareWorktree?: (input: WorktreeInput) => Promise<string>
  /** Whether an executable is on PATH (shipped: a PATH probe). */
  readonly engineAvailable?: ExecutableProbe
  /** Sets the card's board state to a board literal (shipped: `ghBoard`, the adopted GitHub Projects board). */
  readonly board?: {
    /** The card's current board literal; null when it has none. */
    getState(card: string): Promise<string | null>
    setState(card: string, boardState: string): Promise<void>
  }
}

export interface WorktreeInput {
  readonly fs: FileSystemService
  readonly project: Config
  readonly cwd: string
  readonly main: string
  readonly card: string
  readonly title: string
}

export interface Services {
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
  /** The configuration this run launches with, when one applies. */
  readonly configuration?: ConfigurationPlan
  readonly main: string
  readonly cwd: string
  readonly sources: Record<string, string>
}

/** The configuration of the run, its warnings and refusals printed; `undefined`: refused. */
function configure(
  config: RunCommandConfig,
  request: RunWorkflowRequest,
  services: Services,
  at: Pick<Resolved, 'cwd' | 'main' | 'project' | 'engine'> & { workflow: Workflow },
): { plan?: ConfigurationPlan } | undefined {
  const { fs } = services
  const outcome = resolveConfiguration({
    fs,
    cwd: at.cwd,
    main: at.main,
    project: at.project,
    workflow: at.workflow,
    flag: request.config,
    override: request.configOverride,
    engineFlag: config.engine,
    engine: at.engine.engine.id,
    probe: services.deps.workflow?.engineAvailable ?? createExecutableProbe(fs),
  })
  outcome.warnings.forEach(warning => console.log(`  Warning: ${warning}`))
  if (outcome.errors.length === 0) return outcome.plan ? { plan: outcome.plan } : {}
  outcome.errors.forEach(error => console.error(`  ${error}`))
  console.error(`  Refused: ${String(outcome.errors.length)} error(s); nothing was launched.`)
  return undefined
}

/** Serialize the expanded workflow for the engine's frozen source. */
function expandedSource(workflow: Workflow): string {
  const entries = (steps: Workflow['steps']): Record<string, unknown> =>
    Object.fromEntries(
      steps.map(({ id, steps: children, ...step }) => [
        id,
        { ...step, ...(children && { steps: entries(children) }) },
      ]),
    )
  const { version, name, description, aliases, select, steps } = workflow
  return `${JSON.stringify({ version, name, description, aliases, select, steps: entries(steps) }, null, 2)}\n`
}

function checkWorkflow(
  fs: Services['fs'],
  project: ReturnType<typeof loadConfigWithOverrides>['config'],
  { cwd, main, sources }: { cwd: string; main: string; sources: Record<string, string> },
  source: { text: string; file: string },
) {
  const registry = join(main, WAY_OF_WORKING)
  const registryText = fs.existsSync(registry) ? fs.readFileSync(registry) : ''
  return validate(source.text, source.file, {
    skillExists: createSkillProbe(fs, project, cwd),
    gateKeys: Object.keys(readGateRegistry(registryText)),
    gateTargets: Object.keys(readGateTargets(registryText)),
    launchInputs: ['card'],
    isSafeText: isSafePromptText,
    availableWorkflows: [
      join(main, WORKFLOWS_DIR),
      ...(() => {
        try {
          return [join(getKnowledgeHubDatasetPath(fs), WORKFLOWS_DIR)]
        } catch {
          return []
        }
      })(),
    ].flatMap(dir =>
      fs.existsSync(dir)
        ? fs
            .readdirSync(dir)
            .filter(entry => entry.isFile() && entry.name.endsWith('.yaml'))
            .map(entry => entry.name.slice(0, -5))
        : [],
    ),
    resolveWorkflow: name => {
      try {
        const included = locateWorkflow(fs, { cwd, main }, name)
        sources[included.file] = createHash('sha256').update(included.text).digest('hex')
        return included
      } catch {
        return undefined
      }
    },
  })
}

function resumeWorkflow(
  fs: Services['fs'],
  request: RunWorkflowRequest,
  source: Located,
  { main, sources }: { main: string; sources: Record<string, string> },
) {
  const original = parseWorkflow(source.text, source.file).workflow
  const runId =
    request.runId ??
    `${original?.name ?? basename(source.file, extname(source.file))}-${request.card}`
  const runDir = join(main, '.pair/working/runs', runId)
  const frozen = join(runDir, 'workflow.yaml')
  const manifest = join(runDir, 'sources.json')
  if (request.restart || !fs.existsSync(frozen) || !fs.existsSync(manifest)) return undefined
  const recorded = JSON.parse(fs.readFileSync(manifest)) as Record<string, string>
  for (const file of Object.keys(recorded)) {
    if (fs.existsSync(file))
      sources[file] = createHash('sha256').update(fs.readFileSync(file)).digest('hex')
  }
  return { ...parseWorkflow(fs.readFileSync(frozen), source.file, true), warnings: [] }
}

const hasExpansion = (workflow: Workflow) =>
  workflow.steps.some(
    step => step.id.includes('/') || step.steps?.some(child => child.id.includes('/')),
  )

function reportValidation(
  checked: ReturnType<typeof checkWorkflow> | NonNullable<ReturnType<typeof resumeWorkflow>>,
): void {
  checked.warnings.forEach(warning => console.log(`  Warning: ${formatError(warning)}`))
  if (checked.workflow !== undefined) return
  checked.errors.forEach(error => console.error(`  ${formatError(error)}`))
  console.error(`  Refused: ${String(checked.errors.length)} error(s); nothing was launched.`)
}

/** Workflow, validation and engine: everything decided before the card is read or anything is launched. */
export function resolveWorkflowRun(
  config: RunCommandConfig,
  request: RunWorkflowRequest,
  services: Services,
  resume = true,
): Resolved | undefined {
  const { fs } = services
  const cwd = resolve(config.cwd ?? fs.currentWorkingDirectory())
  const main = mainCheckoutOrCwd(cwd)
  const project = loadConfigWithOverrides(fs, { projectRoot: cwd }).config
  const source = locateWorkflow(fs, { cwd, main }, request.name)
  const sources: Record<string, string> = {
    [source.file]: createHash('sha256').update(source.text).digest('hex'),
  }
  const checked =
    (config.dryRun || !resume
      ? undefined
      : resumeWorkflow(fs, request, source, { main, sources })) ??
    checkWorkflow(fs, project, { cwd, main, sources }, source)
  console.log(`pair run ${basename(source.file, extname(source.file))} — ${source.file}`)
  reportValidation(checked)
  if (checked.workflow === undefined) return undefined
  const engine = withRunAgentRunner(
    resolveEngine({ flag: config.engine, declared: declaredEngine(project) }),
    project,
  )
  console.log(`  ${describeEngineResolution(engine)}`)
  const configured = configure(config, request, services, {
    cwd,
    main,
    project,
    workflow: checked.workflow,
    engine,
  })
  if (configured === undefined) return undefined
  return {
    workflow: checked.workflow,
    source: hasExpansion(checked.workflow)
      ? { ...source, text: expandedSource(checked.workflow) }
      : source,
    project,
    engine,
    ...(configured.plan && { configuration: configured.plan }),
    main,
    cwd,
    sources,
  }
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
  /** The run's frozen configuration; absent: the run's one engine and its declared model for every step. */
  readonly effective?: Configuration | undefined
}

/** What a step launches with: its configuration's resolution, or the run's own engine and declared model. */
function stepSettings(
  resolved: Resolved,
  effective: Configuration | undefined,
  step: { readonly id: string; readonly alias?: string },
): StepSettings {
  const { id } = resolved.engine.engine
  if (effective === undefined)
    return { engine: id, model: declaredEngineModel(resolved.project, id) }
  const { engine, model, effort } = settingsFor(effective, step, resolved.workflow.aliases)
  return { engine, model: model ?? declaredEngineModel(resolved.project, engine), effort }
}

/** The engine of a step: the run's own, or the one the configuration names for it. */
function engineOf(resolved: Resolved, id: string): EngineDefinition {
  return id === resolved.engine.engine.id || !isEngineId(id)
    ? resolved.engine.engine
    : withRunAgentRunner(resolveEngine({ flag: id }), resolved.project).engine
}

/** Per engine, once: its autonomy arguments (a workflow run is always autonomous; only an escalation stops it) and idle timeout. */
function policiesOf({ config, resolved, services }: Launch) {
  const policies = new Map<string, { autonomyArgs: readonly string[]; idle: number }>()
  return (engine: EngineDefinition) => {
    const known = policies.get(engine.id)
    if (known !== undefined) return known
    const made = {
      autonomyArgs: resolveAutonomyFor(
        engine,
        { ...config, autonomous: true },
        resolved.main,
        services.fs,
      ).args,
      idle: resolveIdleTimeout({
        flag: config.idleTimeoutSeconds,
        declared: declaredRunIdleTimeout(resolved.project, engine.id),
      }).seconds,
    }
    policies.set(engine.id, made)
    return made
  }
}

/** One agent per step, in the card's worktree, on the engine, model and effort its settings say. */
function launcher(run: Launch) {
  const { config, resolved, services } = run
  const policyOf = policiesOf(run)
  const runIteration = services.deps.workflow?.runIteration ?? spawnIteration
  return async (
    step: StepLaunch,
    message: string,
    meter: (usage: Usage) => void,
  ): Promise<string | undefined> => {
    const settings = stepSettings(resolved, run.effective, stepOf(resolved, step.id))
    const engine = engineOf(resolved, settings.engine)
    const { autonomyArgs, idle } = policyOf(engine)
    let text: string | undefined
    let observed: EngineObservation = {}
    const result = await runIteration({
      engine,
      promptText: message,
      cwd: run.worktree,
      autonomyArgs,
      model: settings.model,
      effort: settings.effort,
      timeoutSeconds: config.iterationTimeoutSeconds,
      idleTimeoutSeconds: idle,
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
  /** The run's frozen configuration (the copy on disk), when it has one. */
  readonly effective?: Configuration | undefined
  /** The card's worktree, where gate commands run. */
  readonly worktree?: string
  readonly report?: (outcome: BatchOutcome) => void
}

/** What the package asks of this host besides an agent: the card's facts, and the steps it runs itself. */
function hostKindsOf({ resolved, request, worktree }: Opened, { fs, deps }: Services) {
  const way = join(resolved.main, WAY_OF_WORKING)
  return {
    card: () => readCardFacts(request.card, resolved.cwd),
    readResultFacts:
      deps.workflow?.readResultFacts ??
      (async (step: StepLaunch, result: StepResult) => {
        if (step.kind === 'implement')
          return { head: await readWorkflowPrHead({ fs, ...resolved }, Number(result['pr'])) }
        const card = await readCard(request.card, resolved.cwd)
        return { card: { ...card, boardStatus: card.boardState } }
      }),
    perform: performHostKind(
      readGateRegistry(fs.existsSync(way) ? fs.readFileSync(way) : ''),
      worktree ?? resolved.cwd,
      readGateTargets(fs.existsSync(way) ? fs.readFileSync(way) : ''),
    ),
    runGates: runStepGates(
      readGateRegistry(fs.existsSync(way) ? fs.readFileSync(way) : ''),
      worktree ?? resolved.cwd,
      readGateTargets(fs.existsSync(way) ? fs.readFileSync(way) : ''),
    ),
  }
}

/** The step of the workflow with this id. */
const stepOf = (resolved: Resolved, id: string) =>
  addressedSteps(resolved.workflow).find(step => step.id === id) ?? { id, kind: 'generic' as const }

/** The engine the settings of a step name. */
const engineIdOf = (opened: Opened, id: string): keyof typeof ENGINES => {
  const named = stepSettings(opened.resolved, opened.effective, stepOf(opened.resolved, id)).engine
  return isEngineId(named) ? named : opened.resolved.engine.engine.id
}

/** The run's telemetry: the flag over the configuration's `telemetry` key; off when neither says. */
const telemetryOf = (config: RunCommandConfig, { resolved, effective }: Opened) =>
  (config.telemetry ?? effective?.telemetry) === true
    ? {
        host: 'pair-run' as const,
        settings: (id: string) => stepSettings(resolved, effective, stepOf(resolved, id)),
        warn: (message: string) => console.log(`  Warning: ${message}`),
      }
    : undefined

/** Which edge of a step an event is: it starts, or it ends ok. */
const whenOf = (state: StepEvent['state']) =>
  state === 'running' ? 'start' : state === 'ok' ? 'end' : undefined

/** True when the card's current board literal is the macrostate or ahead of it. */
const notAhead = (current: string | null, macrostate: CardState, mapping: StateMapping) => {
  const held = current === null ? undefined : resolveMacrostate(current, mapping)
  return held !== undefined && MACROSTATES.indexOf(held) >= MACROSTATES.indexOf(macrostate)
}

/** Sets the card's state through the board, by the adopted mapping; a failure is a warning, never a stop. */
async function setCardState(
  card: string,
  macrostate: CardState,
  resolved: Resolved,
  { fs, deps }: Services,
): Promise<void> {
  const literal = readStateMapping(fs, resolved.main)?.find(
    row => row.macrostate === macrostate,
  )?.boardState
  try {
    const board =
      deps.workflow?.board ??
      ghBoard(fs, locateCycleScripts(fs, resolved.project, resolved.cwd).scriptsDir, resolved.main)
    if (literal === undefined) throw new Error(`no board state maps to ${macrostate}`)
    // The state only moves forward: a step whose state is behind (or equal) sets nothing.
    if (notAhead(await board.getState(card), macrostate, readStateMapping(fs, resolved.main)))
      return
    await board.setState(card, literal)
    console.log(`  Card ${card}: state ${literal}`)
  } catch (error) {
    console.log(
      `  Warning: card state ${literal ?? macrostate} not set: ${(error as Error).message}`,
    )
  }
}

/** The ending of a run parked or failed on an exhausted loop, drawn on the console; undefined otherwise. */
function exhaustedEnding(
  { resolved, request, runDir }: Opened,
  outcome: RunOutcome,
  sink: ConsoleSink,
  fs: Services['fs'],
): number | undefined {
  const state = JSON.parse(fs.readFileSync(join(runDir, 'state.json'))) as {
    loops?: Record<string, { exhausted?: boolean }>
    steps: Record<string, { summary?: string; state: string }>
  }
  const exhausted = resolved.workflow.steps.find(step => state.loops?.[step.id]?.exhausted)
  if (exhausted === undefined || outcome.run === 'done') return undefined
  const last = state.steps[`${exhausted.id}/${exhausted.until}`]
  const why = `${state.steps[exhausted.id]?.summary}; last until: ${last?.state} — ${last?.summary}`
  sink.event({
    event: 'card-end',
    card: request.card,
    status: outcome.run === 'failed' ? 'failed' : 'awaiting-human',
    reason: why,
  })
  const flag = outcome.run === 'failed' ? '--restart' : '--more-rounds <n>'
  console.log(`  Run: ${why}. Resume with: ${resumeCommand(request)} ${flag}`)
  return outcome.run === 'failed' ? 1 : 0
}

function reportRunOutcome(opened: Opened, outcome: RunOutcome): void {
  opened.report?.({
    id: opened.request.card,
    outcome: outcome.run,
    ...(outcome.last && { lastStep: outcome.last.step, reason: explain(outcome.last) }),
  })
}

/** The steps, drawn on the run's console: the card line, one line per step outcome, the ending. */
async function runOnConsole(
  config: RunCommandConfig,
  opened: Opened,
  launch: ReturnType<typeof launcher>,
  services: Services,
): Promise<number> {
  const { fs } = services
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
        styleOf: id => ENGINES[engineIdOf(opened, id)].skillInvocationStyle,
        launch,
        ...hostKindsOf(opened, services),
        report: event => {
          if (event.state === 'running')
            sink.event({ event: 'stage', card: request.card, stage: event.step })
          else console.log(stepLine(event))
        },
        async transition(event) {
          const set = cardStateOf(stepOf(resolved, event.step))
          if (set !== undefined && set.when === whenOf(event.state))
            await setCardState(request.card, set.state, resolved, services)
        },
      },
      runDir,
      telemetryOf(config, opened),
    )
    reportRunOutcome(opened, outcome)
    return exhaustedEnding(opened, outcome, sink, fs) ?? conclude(outcome, request, sink)
  } finally {
    sink.finish()
    restore()
  }
}

/** The options `start` opens the run with. */
function startOptions({ resolved, request }: Opened) {
  return {
    card: request.card,
    restart: request.restart,
    reconfigure: request.reconfigure === true,
    ...(request.moreRounds !== undefined && {
      moreRounds: request.moreRounds,
      requestedBy: process.env['USER'] ?? 'unknown',
    }),
    ...(resolved.configuration && {
      configuration: {
        text: resolved.configuration.text,
        ...(resolved.configuration.override !== undefined && {
          override: resolved.configuration.override,
        }),
      },
    }),
  }
}

/** The exit code of a run that has nothing to launch, with its message; undefined when steps remain. */
function stopOf(status: string, request: Opened['request']): number | undefined {
  if (status === 'parked') {
    console.log(
      `  Run: loop reached max — resume with: ${resumeCommand(request)} --more-rounds <n>`,
    )
    return 0
  }
  if (status === 'failed') {
    console.log('  Run: loop exhausted and failed. Pass --restart to start over.')
    return 1
  }
  if (status === 'complete') {
    console.log('  Run: already complete — nothing to do. Pass --restart to start over.')
    return 0
  }
  return undefined
}

function recordSources(fs: FileSystemService, { runDir, resolved }: Opened, fresh: boolean): void {
  const sourcesFile = join(runDir, 'sources.json')
  if (fresh) {
    fs.writeFileSync(sourcesFile, JSON.stringify(resolved.sources, null, 2))
  } else if (fs.existsSync(sourcesFile)) {
    const frozen = JSON.parse(fs.readFileSync(sourcesFile)) as Record<string, string>
    if (JSON.stringify(frozen) !== JSON.stringify(resolved.sources)) {
      console.log('  Warning: included workflow sources changed since this run started.')
    }
  }
}

function reportStopped(opened: Opened, status: string): number | undefined {
  const stopped = stopOf(status, opened.request)
  if (stopped === undefined) return undefined
  opened.report?.({
    id: opened.request.card,
    outcome: status === 'complete' ? 'skipped' : status === 'parked' ? 'parked' : 'failed',
    reason: status === 'complete' ? 'workflow already complete' : 'loop exhausted',
  })
  return stopped
}

/** The run itself, under the lock: start or resume, the worktree, then the steps. */
async function drive(
  config: RunCommandConfig,
  opened: Opened,
  services: Services,
): Promise<number> {
  const { resolved, request, runDir } = opened
  const { fs, deps } = services
  const started = await start({ files: fs, dir: runDir }, resolved.source, startOptions(opened))
  recordSources(fs, opened, started.status === 'started')
  started.warnings.forEach(warning => console.log(`  Warning: ${warning}`))
  console.log(`  Run dir: ${runDir} (${started.status})`)
  const effective = readEffective(fs, runDir)
  printSettings(resolved, effective)
  probeUnchecked(
    resolved,
    effective,
    runDir,
    deps.workflow?.engineAvailable ?? createExecutableProbe(fs),
  )
  const stopped = reportStopped(opened, started.status)
  if (stopped !== undefined) return stopped
  const worktree = await (deps.workflow?.prepareWorktree ?? cycleWorktree)({
    fs,
    project: resolved.project,
    cwd: resolved.cwd,
    main: resolved.main,
    card: request.card,
    title: opened.title,
  })
  console.log(`  Worktree: ${worktree}`)
  return runOnConsole(
    config,
    { ...opened, effective, worktree },
    launcher({ config, resolved, services, worktree, effective }),
    services,
  )
}

/** Engines preflight did not probe on a resume: the run's own when no configuration was frozen, the frozen copy's when none resolved now. */
function probeUnchecked(
  resolved: Resolved,
  effective: Configuration | undefined,
  runDir: string,
  probe: ExecutableProbe,
): void {
  if (effective === undefined) {
    if (resolved.configuration !== undefined) assertEngineAvailable(resolved.engine, probe)
    return
  }
  if (resolved.configuration !== undefined) return
  const { errors } = checkAgainstEngines(effective, {
    file: join(runDir, 'configuration.yaml'),
    facts: engineFacts(resolved.project, probe),
    steps: resolved.workflow.steps,
    aliases: resolved.workflow.aliases,
  })
  if (errors.length > 0) throw new Error(errors.map(formatError).join('\n'))
}

/** The run's frozen configuration, read back from its copy: the copy wins over the source file (design §6). */
function readEffective(fs: FileSystemService, runDir: string): Configuration | undefined {
  const text = frozenConfiguration({ files: fs, dir: runDir })
  if (text === undefined) return undefined
  const path = join(runDir, 'configuration.yaml')
  const { configuration, errors } = parseFrozenConfiguration(text, path)
  if (configuration === undefined)
    throw new Error(`run-state-unreadable: ${path}: ${errors[0]?.problem ?? 'invalid'}`)
  return configuration
}

/** What every step launches with and where each value came from; or that no configuration applies. */
function printSettings(resolved: Resolved, effective: Configuration | undefined): void {
  if (effective === undefined) {
    const { id } = resolved.engine.engine
    console.log(`  Configuration: none applies — engine ${id}, its default model`)
    return
  }
  console.log(
    `  Configuration: ${effective.name}${resolved.configuration ? ` — ${resolved.configuration.source}` : ' — frozen copy'}`,
  )
  addressedSteps(resolved.workflow)
    .filter(step => step.kind !== 'loop')
    .forEach(step =>
      console.log(
        `    ${describeSettings(step.id, settingsFor(effective, step, resolved.workflow.aliases))}`,
      ),
    )
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
  // With a configuration, every engine it uses was already checked, before the card was read.
  if (resolved.configuration === undefined)
    assertEngineAvailable(
      resolved.engine,
      services.deps.workflow?.engineAvailable ?? createExecutableProbe(services.fs),
    )
  return read.title
}

function approvalQuestion(step: ReturnType<typeof addressedSteps>[number]): string {
  return step.kind === 'approval'
    ? ` question=${JSON.stringify(step.with?.['question'] ?? '(approval required)')}`
    : ''
}

function dryRunExecution(
  resolved: Resolved,
  step: ReturnType<typeof addressedSteps>[number],
): string {
  const host = step.kind === 'loop' || kindByName[step.kind].host === true
  const settings = host
    ? undefined
    : stepSettings(resolved, resolved.configuration?.configuration, step)
  return settings
    ? ` engine=${settings.engine} model=${settings.model ?? '(engine default)'}${settings.effort ? ` effort=${settings.effort}` : ''}`
    : ' host'
}

function dryRunExhaustion(step: ReturnType<typeof addressedSteps>[number]): string {
  return step.kind === 'loop'
    ? ` on-max=${step['on-max']}${step['on-max'] === 'escalate' ? ' (human escalation)' : ' (fails)'}`
    : ''
}

type BatchCard = {
  card: WorkflowCard
  report: (outcome: BatchOutcome) => void
  releases: Set<() => void>
}

function printWorkflowPreview(resolved: Resolved): number {
  addressedSteps(resolved.workflow).forEach(step => {
    const host = step.kind === 'loop' || kindByName[step.kind].host === true
    const skill = host ? undefined : (step.skill ?? kindByName[step.kind].defaultSkill)
    console.log(
      `  ${step.id}: ${step.kind}${skill ? ` skill=${skill}` : ''}${dryRunExecution(resolved, step)}${dryRunExhaustion(step)}${step.when ? ` when=${JSON.stringify(step.when)}` : ''}${approvalQuestion(step)}`,
    )
  })
  console.log('  Dry run: the workflow is valid; nothing was launched.')
  return 0
}

function configuredSelection(resolved: Resolved) {
  const workflow = resolved.workflow.select
  const configuration = resolved.configuration?.configuration.select
  return (configuration?.filter ?? workflow?.filter) === undefined
    ? undefined
    : effectiveSelection(workflow, configuration)
}

async function acceptsCard(
  resolved: Resolved,
  card: string,
  { fs, deps }: Services,
): Promise<boolean> {
  const selection = configuredSelection(resolved)
  if (selection === undefined) return true
  const { cards } = await (deps.workflow?.readSelection ?? readWorkflowCards)(
    { fs, ...resolved },
    { cards: [card] },
  )
  const found = cards[0]
  if (found?.error !== undefined) throw new Error(found.error)
  return found !== undefined && !found.closed && selection.accepts(found)
}

function completedWorkflow(
  fs: FileSystemService,
  runDir: string,
  request: RunWorkflowRequest,
  workflow: string,
): boolean {
  return (
    !request.restart && completedRun({ files: fs, dir: runDir }, { workflow, card: request.card })
  )
}

export async function handleWorkflowRun(
  config: RunCommandConfig,
  request: RunWorkflowRequest,
  services: Services,
  batch?: BatchCard,
): Promise<number> {
  const resolved = resolveWorkflowRun(config, request, services)
  if (resolved === undefined) return 1
  printPlan(resolved.workflow)
  if (config.dryRun) return printWorkflowPreview(resolved)
  const opened = await openCard(resolved, request, services, batch)
  return opened === undefined ? 0 : runWithCardLock(config, opened, services, batch?.releases)
}

async function openCard(
  resolved: Resolved,
  request: RunWorkflowRequest,
  services: Services,
  batch?: BatchCard,
): Promise<Opened | undefined> {
  const runId = request.runId ?? `${resolved.workflow.name}-${request.card}`
  const runDir = join(resolved.main, '.pair/working/runs', runId)
  if (
    batch === undefined &&
    completedWorkflow(services.fs, runDir, request, resolved.workflow.name)
  ) {
    console.log('  Run: already complete — nothing to do. Pass --restart to start over.')
    return undefined
  }
  if (batch === undefined && !(await acceptsCard(resolved, request.card, services))) {
    console.log(`  #${request.card}: not-applicable — selection filter`)
    return undefined
  }
  const title = batch?.card.title ?? (await preflight(resolved, request.card, services))
  return { resolved, request, runDir, title, ...(batch && { report: batch.report }) }
}

async function runWithCardLock(
  config: RunCommandConfig,
  opened: Opened,
  services: Services,
  releases?: Set<() => void>,
): Promise<number> {
  const { resolved, request } = opened
  const cardLock = (services.deps.acquireLock ?? acquireCardLock)({
    workingArea: join(resolved.main, '.pair/working'),
    card: request.card,
  })
  if (cardLock.kind !== 'acquired') {
    opened.report?.({ id: request.card, outcome: 'parked', reason: 'card already locked' })
    console.log(`  card-locked: ${cardLock.path}; nothing was launched.`)
    return 0
  }
  try {
    return await runLocked(config, opened, services, {
      releaseCard: cardLock.lock.release,
      releases,
    })
  } finally {
    cardLock.lock.release()
  }
}

async function runLocked(
  config: RunCommandConfig,
  opened: Opened,
  services: Services,
  { releaseCard, releases }: { releaseCard: () => void; releases: Set<() => void> | undefined },
): Promise<number> {
  const { runDir } = opened
  services.fs.mkdirSync(runDir, { recursive: true })
  const lock = acquireRunLock(runDir)
  if (lock.kind === 'run-locked') {
    const holder = lock.pid === undefined ? 'another process' : `pid ${String(lock.pid)}`
    console.error(
      `  run-locked: ${holder} on ${lock.host ?? 'this host'} is driving ${runDir}; nothing was launched.`,
    )
    return 1
  }
  const release = () => {
    lock.release()
    releaseCard()
  }
  const run = () => drive(config, opened, services)
  releases?.add(release)
  try {
    return await (releases === undefined ? whileInterruptible(release, run) : run())
  } finally {
    releases?.delete(release)
    release()
  }
}

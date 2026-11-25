import { savedRunState, savedWorkflow } from './workflow-saved-state'
import { prepareReplayHead, recoverWorktree } from './workflow-worktree'
import { basename, extname, join, resolve } from 'path'
import { createHash } from 'crypto'
import type { FileSystemService } from '@pair/content-ops'
import {
  cardStateOf,
  cardStateToConfirm,
  completedRun,
  effectiveSelection,
  escalationAction,
  checkAgainstEngines,
  describeSettings,
  formatError,
  hasConfigurationTiers,
  hasLegacyRunTelemetry,
  kindByName,
  addressedSteps,
  assignmentFor,
  effectiveConfiguration,
  migrateRunTelemetry,
  parseWorkflow,
  pendingMergeClosure,
  record,
  readGateRegistry,
  readGateTargets,
  runSteps,
  settingsFor,
  start,
  stepSettled,
  stoppedApproval,
  stoppedLoop,
  type AgentLaunchResult,
  type Assignment,
  type CardState,
  type Configuration,
  type Filter,
  type RunDirectory,
  type RunOutcome,
  type StepResult,
  type ResultFacts,
  type ResolvedAssignment,
  type StepEvent,
  type StepLaunch,
  type StepReplay,
  type StepSettings,
  type Usage,
  type Workflow,
  type WorkflowHost,
  type WorkflowsConfig,
} from '@pair/workflows'
import { loadConfigWithOverrides } from '#config'
import type { Config } from '#registry'
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
  readyBoardState,
  resolveCardReadiness,
  resolveMacrostate,
  type StateMapping,
} from './card-readiness'
import { createExecutableProbe } from './path-probe'
import { ENGINES, isEngineId, type EngineDefinition } from './engines'
import {
  engineFacts,
  resolveConfiguration,
  workflowTierErrors,
  type ConfigurationPlan,
} from './workflow-configuration'
import { isSafePromptText } from './prompt-safety'
import {
  WAY_OF_WORKING,
  checkWorkflow,
  locateWorkflow,
  reportValidation,
  type Located,
} from './workflow-source'
import { acquireRunLock } from './run-lock'
import { acquireCardLock } from './card-lock'
import type { BatchOutcome } from './workflow-batch'
import {
  matchesWorkflowCard,
  selectionBoardError,
  readWorkflowCard,
  readWorkflowPrHead,
  readWorkflowCards,
  type WorkflowCard,
} from './workflow-selection'
import { assignWorkflowCard, workflowFacts, workflowOperation } from './workflow-facts'
import { sectionBodies } from './policy-sections'
import { isInterrupted, whileInterruptible } from './interrupt'
import { resolveIdleTimeout, spawnIteration, type SpawnIterationInput } from './spawn'
import { finalTextOf, type IterationResult } from './stream-reader'
import { observeEngineEvent, type EngineObservation } from './telemetry'
import { createConsoleSink, routeConsoleTo, type ConsoleSink } from './run-renderer'
import { mainCheckoutOrCwd, readRunnableCard, resolveBranch, runSetupCommand } from './cycle-wiring'
import { performHostKind, runStepGates } from './workflow-kinds'
import { approvalPlatform, approvalRunner } from './workflow-approval'
import { workflowMerge } from './workflow-merge'
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

const RISK_MATRIX = '.pair/adoption/tech/risk-matrix.md'

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
    /** Resolves once the new state is confirmed. */
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

/** The cycle's own worktree mechanism: `<worktree root>/<card>`, the card's branch, the setup command on a fresh one. */
async function cycleWorktree(input: WorktreeInput): Promise<string> {
  const location = locateCycleScripts(input.fs, input.project, input.cwd)
  const bridge = createCycleScriptsBridge(location, input.cwd)
  const resolve = (pr?: number) => resolveBranch(input.card, input.title, pr, input.cwd)
  const made = await recoverWorktree(
    resolve(),
    branch =>
      bridge.worktree({
        main: input.main,
        story: input.card,
        branch,
        base: readCycleDefaults(location).baseBranch,
        worktreeRoot: resolveCycleWorktreeRoot(location, input.main, undefined),
      }),
    async () => {
      const platform = approvalPlatform((action, card, data) =>
        workflowOperation(() => location.scriptsDir, input.cwd, { action, card, data }),
      )
      return (await platform.target(input.card)).pr
    },
    resolve,
  )
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
  readonly cardLabels?: readonly string[] | undefined
  readonly main: string
  readonly cwd: string
  readonly sources: Record<string, string>
}

function reportConfigurationErrors(errors: readonly string[]): void {
  errors.forEach(error => console.error(`  ${error}`))
  console.error(`  Refused: ${String(errors.length)} error(s); nothing was launched.`)
}

export function workflowConfiguration(
  config: RunCommandConfig,
  request: RunWorkflowRequest,
  services: Services,
  at: Resolved,
) {
  const { fs } = services
  return resolveConfiguration({
    fs,
    cwd: at.cwd,
    main: at.main,
    project: at.project,
    workflow: at.workflow,
    labels: at.cardLabels,
    flag: request.config,
    override: request.configOverride,
    engineFlag: config.engine,
    engine: at.engine.engine.id,
    probe: services.deps.workflow?.engineAvailable ?? createExecutableProbe(fs),
  })
}

/** The configuration of the run, its warnings and refusals printed; `undefined`: refused. */
export function configureWorkflowRun(
  config: RunCommandConfig,
  request: RunWorkflowRequest,
  services: Services,
  at: Resolved,
): Resolved | undefined {
  const outcome = workflowConfiguration(config, request, services, at)
  outcome.warnings.forEach(warning => console.log(`  Warning: ${warning}`))
  if (outcome.errors.length > 0) {
    reportConfigurationErrors(outcome.errors)
    return undefined
  }
  return {
    ...at,
    ...(outcome.plan && { configuration: outcome.plan }),
  }
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
  const { version, name, description, aliases, select, assign, steps } = workflow
  return `${JSON.stringify({ version, name, description, aliases, select, assign, steps: entries(steps) }, null, 2)}\n`
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

/** Validate the workflow and tier declarations before looking up card labels. */
export function resolveWorkflowDefinition(
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
  const errors = workflowTierErrors({ fs, cwd, main, project })
  if (errors.length > 0) {
    reportConfigurationErrors(errors)
    return undefined
  }
  return {
    workflow: checked.workflow,
    source: hasExpansion(checked.workflow)
      ? { ...source, text: expandedSource(checked.workflow) }
      : source,
    project,
    engine,
    main,
    cwd,
    sources,
  }
}

export function usesTierLabels(
  resolved: Resolved,
  request: Pick<RunWorkflowRequest, 'config'>,
): boolean {
  return (
    request.config === undefined &&
    hasConfigurationTiers(
      resolved.project['workflows'] as WorkflowsConfig | undefined,
      resolved.workflow.name,
    )
  )
}

const workflowRunDir = (resolved: Resolved, request: RunWorkflowRequest) =>
  join(
    resolved.main,
    '.pair/working/runs',
    request.runId ?? `${resolved.workflow.name}-${request.card}`,
  )

export function frozenTierLabels(
  resolved: Resolved,
  request: RunWorkflowRequest,
  fs: FileSystemService,
) {
  const saved = savedRunState(request, workflowRunDir(resolved, request), fs)
  return saved?.workflow.name === resolved.workflow.name ? (saved.cardLabels ?? []) : undefined
}

/** Mapped routing resolves synchronously with the facts already read. */
export function resolveWorkflowRun(
  config: RunCommandConfig,
  request: RunWorkflowRequest,
  services: Services,
  { resume = true, card }: { resume?: boolean; card?: WorkflowCard } = {},
): Resolved | undefined {
  const resolved = resolveWorkflowDefinition(config, request, services, resume)
  if (resolved === undefined) return undefined
  const labels = usesTierLabels(resolved, request)
    ? (frozenTierLabels(resolved, request, services.fs) ?? card?.labels)
    : undefined
  return configureWorkflowRun(config, request, services, { ...resolved, cardLabels: labels })
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
  ): Promise<AgentLaunchResult> => {
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
    if (result.outcome === 'success' && text !== undefined) return { final: text }
    return {
      fault: {
        kind: result.outcome === 'success' ? 'no-result' : 'crash',
        detail: result.detail,
        exitCode: null,
        signal: null,
        elapsedMs: 0,
        stderrTail: [],
      },
    }
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
    skipped: {
      status: 'skipped',
      exit: 0,
      line: (at, why, resume) => `skipped at step ${at} — ${why}. Resume with: ${resume}`,
    },
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

function reportProcessFaults(outcome: RunOutcome): void {
  for (const { step, attempts } of outcome.faults ?? []) {
    for (const {
      attempt,
      round,
      kind,
      detail,
      exitCode,
      signal,
      elapsedMs,
      stderrTail,
    } of attempts) {
      const location = round === undefined ? step : `${step} round ${round}`
      const process = `exit=${exitCode ?? 'unknown'}, signal=${signal ?? 'none'}, elapsed=${elapsedMs}ms`
      console.log(
        `  Process fault — ${location} attempt ${attempt} (${kind}): ${detail} [${process}]`,
      )
      for (const line of stderrTail) console.log(`    stderr: ${line}`)
    }
  }
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
  readonly flagStep?: string
  readonly closureOnly?: true
  readonly telemetryWarned?: boolean
}

const NON_RISK_PROJECTIONS = new Set([
  'cost',
  'light',
  'security-relevance',
  'business-impact',
  'coupling-balance',
  'change-risk',
  'service-criticality',
])

function riskTagFamily(fs: FileSystemService, main: string): string | null | undefined {
  const path = join(main, RISK_MATRIX)
  if (!fs.existsSync(path)) return undefined
  const markdown = fs
    .readFileSync(path)
    .replace(/^[ \t]*(```|~~~)[\s\S]*?^[ \t]*\1[^\n]*$/gm, '')
    .replace(/<!--[\s\S]*?-->/g, '')
  const projections = sectionBodies(markdown, 'Tag Projection')
  if (projections.length > 1) return null
  const [projection] = projections
  const active = projection?.join('\n').match(/^Active:[ \t]*(.+)$/m)?.[1]
  if (active === undefined) return undefined
  const families = new Set(
    active
      .split(',')
      .map(family => family.trim())
      .filter(Boolean),
  )
  if (families.has('none')) return null
  if (families.has('risk')) return 'risk'
  const renamed = [...families].filter(family => !NON_RISK_PROJECTIONS.has(family))
  return renamed.length === 1 ? renamed[0]! : null
}

function hostCardFacts(resolved: Resolved, cardId: string, { fs, deps }: Services) {
  const readCard = () => readWorkflowCard({ fs, ...resolved }, cardId)
  const readResultFacts =
    deps.workflow?.readResultFacts ??
    (async (step: StepLaunch, result: StepResult): Promise<ResultFacts> => {
      if (step.kind === 'implement')
        return { head: await readWorkflowPrHead({ fs, ...resolved }, Number(result['pr'])) }
      const card = await readCard()
      if (card.boardError !== undefined) throw new Error(card.boardError)
      return { card: { ...card, boardStatus: card.boardState } }
    })
  return {
    async card() {
      const { labels, boardState, boardError } = await readCard()
      return {
        labels,
        ...(boardState !== null && { status: boardState }),
        ...(boardError !== undefined && { statusError: boardError }),
      }
    },
    async readResultFacts(step: StepLaunch, result: StepResult) {
      const facts = await readResultFacts(step, result)
      if (facts.card === undefined) return facts
      const family = riskTagFamily(fs, resolved.main)
      return family === undefined ? facts : { ...facts, riskTagFamily: family }
    },
  }
}

/** What the package asks of this host besides an agent: the card's facts, and the steps it runs itself. */
function hostKindsOf(
  { resolved, request, runDir, worktree, flagStep }: Opened,
  services: Services,
): Pick<
  WorkflowHost,
  'card' | 'readResultFacts' | 'assignCard' | 'commentOnCard' | 'warn' | 'perform' | 'runGates'
> {
  const { fs } = services
  const path = join(resolved.main, WAY_OF_WORKING)
  const way = fs.existsSync(path) ? fs.readFileSync(path) : ''
  const registry = readGateRegistry(way)
  const targets = readGateTargets(way)
  const cwd = worktree ?? resolved.cwd
  const scriptDir = () => locateCycleScripts(fs, resolved.project, resolved.cwd).scriptsDir
  const call = (action: string, card: string, data?: unknown) =>
    workflowOperation(scriptDir, resolved.cwd, { action, card, data })
  const gate = performHostKind(registry, cwd, targets, step =>
    workflowFacts(scriptDir, resolved.cwd, step),
  )
  const approval = approvalRunner(
    { dir: runDir, files: fs },
    approvalPlatform(call),
    flagStep !== undefined && request.flagAnswer !== undefined
      ? { step: flagStep, answer: request.flagAnswer }
      : undefined,
  )
  const merge = workflowMerge(call, resolved.main)
  return {
    ...hostCardFacts(resolved, request.card, services),
    assignCard: (assign: Assignment) =>
      assignWorkflowCard(scriptDir, resolved.cwd, request.card, assign),
    commentOnCard: async ({ card, marker, body }) => {
      await call('comment-on-card', card, { marker, body })
    },
    warn: (message: string) => console.log(`  Warning: ${message}`),
    perform: async (step: StepLaunch) => {
      if (step.kind !== 'approval' && step.kind !== 'merge') return gate(step)
      try {
        return await (step.kind === 'approval' ? approval(step) : merge(step))
      } catch (error) {
        return {
          status: 'failed',
          summary: `The host could not complete ${step.kind}`,
          reason: error instanceof Error ? error.message : String(error),
        }
      }
    },
    runGates: runStepGates(registry, cwd, targets),
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
const telemetryOf = (config: RunCommandConfig, { resolved, effective, telemetryWarned }: Opened) =>
  (config.telemetry ?? effective?.telemetry) === true
    ? {
        host: 'pair-run' as const,
        settings: (id: string) => stepSettings(resolved, effective, stepOf(resolved, id)),
        ...(!telemetryWarned && {
          warn: (message: string) => console.log(`  Warning: ${message}`),
        }),
      }
    : undefined

/** Which edge of a step an event is: it starts, or it ends ok. */
const whenOf = (state: StepEvent['state']) =>
  state === 'running' ? 'start' : state === 'ok' ? 'end' : undefined

/** True when the card's current board literal is the macrostate or ahead of it. */
const isAtLeast = (current: string | null, macrostate: CardState, mapping: StateMapping) => {
  const held = current === null ? undefined : resolveMacrostate(current, mapping)
  return held !== undefined && MACROSTATES.indexOf(held) >= MACROSTATES.indexOf(macrostate)
}

/** On a board without a Ready column, the current card must satisfy the Definition of Ready. */
async function confirmReadyByDefinition(
  card: string,
  mapping: StateMapping,
  resolved: Resolved,
  { fs, deps }: Services,
): Promise<void> {
  const { cards } = await (deps.workflow?.readSelection ?? readWorkflowCards)(
    { fs, ...resolved },
    { cards: [card] },
  )
  const found = cards.find(one => one.id === card)
  if (found?.error !== undefined) throw new Error(found.error)
  if (found === undefined || found.closed)
    throw new Error(`card ${card} is unavailable for Ready confirmation`)
  if (isAtLeast(found.boardState, 'Ready', mapping)) return
  const verdict = resolveCardReadiness(
    { ...found, boardState: found.boardState ?? undefined },
    mapping,
  )
  if (verdict.readiness === 'draft') throw new Error(verdict.explanation)
}

function boardStateTarget(state: CardState, mapping: StateMapping): string | undefined {
  if (state === 'Ready' && mapping === undefined) return readyBoardState(mapping)
  return mapping?.find(row => row.macrostate === state)?.boardState
}

/** Sets the card's state through the board by the adopted mapping. */
async function setCardState(
  card: string,
  macrostate: CardState,
  resolved: Resolved,
  { fs, deps }: Services,
): Promise<void> {
  const mapping = readStateMapping(fs, resolved.main)
  const literal = boardStateTarget(macrostate, mapping)
  if (macrostate === 'Ready' && literal === undefined)
    return confirmReadyByDefinition(card, mapping, resolved, { fs, deps })
  try {
    if (literal === undefined) throw new Error(`no board state maps to ${macrostate}`)
    const board =
      deps.workflow?.board ??
      ghBoard(fs, locateCycleScripts(fs, resolved.project, resolved.cwd).scriptsDir, resolved.main)
    // The state only moves forward: a step whose state is behind (or equal) sets nothing.
    if (isAtLeast(await board.getState(card), macrostate, mapping)) return
    await board.setState(card, literal)
    console.log(`  Card ${card}: state ${literal}`)
  } catch (error) {
    throw new Error(`card state ${literal ?? macrostate} not set: ${(error as Error).message}`)
  }
}

function cardTransitions({ request, resolved }: Opened, services: Services) {
  return {
    isAtLeastBoardStatus(status: string | null, target: CardState) {
      return isAtLeast(status, target, readStateMapping(services.fs, resolved.main))
    },
    async confirmState(target: CardState) {
      await setCardState(request.card, target, resolved, services)
    },
    async transition(event: StepEvent) {
      const step = stepOf(resolved, event.step)
      const set = cardStateOf(step)
      if (set === undefined || set.when !== whenOf(event.state) || cardStateToConfirm(step)) return
      try {
        await setCardState(request.card, set.state, resolved, services)
      } catch (error) {
        console.log(`  Warning: ${(error as Error).message}`)
      }
    },
  }
}

/** The ending of a run parked or failed on an exhausted loop, drawn on the console; undefined otherwise. */
function exhaustedEnding(
  { request, runDir }: Opened,
  outcome: RunOutcome,
  sink: ConsoleSink,
  fs: Services['fs'],
): number | undefined {
  if (outcome.run === 'done' || outcome.run === 'skipped') return undefined
  const saved = savedWorkflow({ card: request.card, restart: false }, runDir, fs)
  if (saved === undefined) return undefined
  const stopped = stoppedLoop(saved.workflow, saved.state)
  if (stopped?.run !== outcome.run) return undefined
  const { id, until } = stopped.step
  const last = saved.state.steps[`${id}/${until}`]
  const why = `${saved.state.steps[id]?.summary}; last until: ${last?.state} — ${last?.summary}`
  const { status, exit } = ENDINGS[stopped.run]
  sink.event({
    event: 'card-end',
    card: request.card,
    status,
    reason: why,
  })
  const flag = stopped.run === 'failed' ? '--restart' : '--more-rounds <n>'
  console.log(`  Run: ${why}. Resume with: ${resumeCommand(request)} ${flag}`)
  return exit
}

function reportRunOutcome(opened: Opened, outcome: RunOutcome): void {
  opened.report?.({
    id: opened.request.card,
    outcome: outcome.run,
    ...(outcome.run === 'skipped' &&
      outcome.last?.reason === 'card-held' && {
        skipReason: outcome.last.reason,
      }),
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
        ...cardTransitions(opened, services),
        report: event => {
          if (event.state === 'running')
            sink.event({ event: 'stage', card: request.card, stage: event.step })
          else console.log(stepLine(event))
        },
      },
      runDir,
      telemetryOf(config, opened),
    )
    reportRunOutcome(opened, outcome)
    reportProcessFaults(outcome)
    return exhaustedEnding(opened, outcome, sink, fs) ?? conclude(outcome, request, sink)
  } finally {
    sink.finish()
    restore()
  }
}

/** The options `start` opens the run with. */
function startOptions({ resolved, request }: Opened, replay?: StepReplay) {
  return {
    card: request.card,
    ...(resolved.cardLabels !== undefined && { cardLabels: resolved.cardLabels }),
    restart: request.restart,
    ...(replay !== undefined && { replay }),
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

function parkedApproval(opened: Opened, fs: FileSystemService): string | undefined {
  if (opened.request.flagAnswer === undefined) return undefined
  const saved = savedWorkflow(opened.request, opened.runDir, fs)
  if (saved === undefined) throw new Error('No parked workflow for this card')
  const parked = stoppedApproval(saved.workflow, saved.state)
  if (parked === undefined) throw new Error('The workflow must be parked at one approval step')
  return parked
}

async function refreshReplayInputs(
  opened: Opened,
  fs: FileSystemService,
): Promise<StepReplay | undefined> {
  const saved = savedWorkflow(opened.request, opened.runDir, fs)
  if (saved === undefined) return undefined
  const { workflow, state } = saved
  const { resolved, request } = opened
  const stopped = workflow.steps.find(step => !stepSettled(step, state.steps[step.id]?.state))
  const route = stopped?.['on-resume']
  if (stopped === undefined || route === undefined) return undefined
  const failure = state.steps[stopped.id]
  if (failure?.state !== 'failed' || failure.reason !== route.reason) return undefined
  const from = workflow.steps.findIndex(step => step.id === route.step)
  const pr = workflow.steps
    .slice(0, from)
    .reverse()
    .map(step => state.steps[step.id]?.outputs?.['pr'])
    .find(value => typeof value === 'number')
  if (pr === undefined) throw new Error('Cannot replay without the original workflow PR')
  const locate = () => locateCycleScripts(fs, resolved.project, resolved.cwd).scriptsDir
  const platform = approvalPlatform((action, card, data) =>
    workflowOperation(locate, resolved.cwd, { action, card, data }),
  )
  const current = await platform.target(request.card)
  if (current.pr !== pr) throw new Error('The workflow PR changed; start a new run for that PR')
  return { from: route.step, inputs: { head: current.head } }
}

function recordIncludeSources(
  fs: FileSystemService,
  runDir: string,
  sources: Readonly<Record<string, string>>,
  status: string,
): void {
  const sourcesFile = join(runDir, 'sources.json')
  if (status === 'started') {
    fs.writeFileSync(sourcesFile, JSON.stringify(sources, null, 2))
  } else if (fs.existsSync(sourcesFile)) {
    const frozen = JSON.parse(fs.readFileSync(sourcesFile)) as Record<string, string>
    if (JSON.stringify(frozen) !== JSON.stringify(sources)) {
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

async function finishClosure(opened: Opened, fs: FileSystemService): Promise<number> {
  const { resolved, runDir } = opened
  const step = await closureStep(opened, fs)
  if (!step) throw new Error('The closed card no longer has a resumable merge')
  const locate = () => locateCycleScripts(fs, resolved.project, resolved.cwd).scriptsDir
  const finish = workflowMerge(
    (action, card, data) => workflowOperation(locate, resolved.cwd, { action, card, data }),
    resolved.main,
    true,
  )
  const result = await record({ dir: runDir, files: fs }, step.id, await finish(step))
  console.log(`  Run: ${result.summary}`)
  return result.status === 'ok' ? 0 : 1
}

async function startOnConsole(opened: Opened, fs: FileSystemService, replay?: StepReplay) {
  const { resolved, runDir } = opened
  const started = await start(
    { files: fs, dir: runDir },
    resolved.source,
    startOptions(opened, replay),
  )
  recordIncludeSources(fs, runDir, resolved.sources, started.status)
  started.warnings.forEach(warning => console.log(`  Warning: ${warning}`))
  if (started.telemetryWarning !== undefined) console.log(`  Warning: ${started.telemetryWarning}`)
  console.log(`  Run dir: ${runDir} (${started.status})`)
  return started
}

/** The run itself, under the lock: start or resume, the worktree, then the steps. */
async function drive(
  config: RunCommandConfig,
  opened: Opened,
  services: Services,
): Promise<number> {
  const { resolved, request, runDir } = opened
  const { fs, deps } = services
  if (opened.closureOnly) return finishClosure(opened, fs)
  const flagStep = parkedApproval(opened, fs)
  const replay = await refreshReplayInputs(opened, fs)
  const prepare = () =>
    (deps.workflow?.prepareWorktree ?? cycleWorktree)({
      fs,
      project: resolved.project,
      cwd: resolved.cwd,
      main: resolved.main,
      card: request.card,
      title: opened.title,
    })
  const replayTree = replay && (await prepare())
  if (replay && replayTree) await prepareReplayHead(replayTree, String(replay.inputs['head']))
  const started = await startOnConsole(opened, fs, replay)
  const effective = effectiveConfiguration({ files: fs, dir: runDir })
  printSettings(resolved, effective)
  probeUnchecked(
    resolved,
    effective,
    runDir,
    deps.workflow?.engineAvailable ?? createExecutableProbe(fs),
  )
  const stopped = reportStopped(opened, started.status)
  if (stopped !== undefined) return stopped
  const worktree = replayTree ?? (await prepare())
  console.log(`  Worktree: ${worktree}`)
  return runOnConsole(
    config,
    {
      ...opened,
      effective,
      worktree,
      telemetryWarned: started.telemetryWarning !== undefined,
      ...(flagStep === undefined ? {} : { flagStep }),
    },
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

const describeAssignment = (assignment?: ResolvedAssignment): string =>
  assignment === undefined ? '' : ` assign=${assignment.value} (${assignment.source})`

/** What every step launches with and where each value came from; or that no configuration applies. */
function printSettings(resolved: Resolved, effective: Configuration | undefined): void {
  if (effective === undefined) {
    const { id } = resolved.engine.engine
    console.log(`  Configuration: none applies — engine ${id}, its default model`)
  } else {
    console.log(
      `  Configuration: ${effective.name}${resolved.configuration ? ` — ${resolved.configuration.source}` : ' — frozen copy'}`,
    )
  }
  addressedSteps(resolved.workflow)
    .filter(step => step.kind !== 'loop')
    .forEach(step => {
      const assignment = describeAssignment(assignmentFor(resolved.workflow, step, effective))
      const settings =
        effective &&
        describeSettings(step.id, settingsFor(effective, step, resolved.workflow.aliases))
      if (settings || assignment) console.log(`    ${settings ?? `${step.id}:`}${assignment}`)
    })
}

function printPlan(workflow: Workflow): void {
  workflow.steps.forEach((step, index) =>
    console.log(
      `  ${String(index + 1)}. ${step.id} — ${step.kind}${step.skill ? ` (${step.skill})` : ''}`,
    ),
  )
}

async function closureStep(
  opened: Omit<Opened, 'title'>,
  fs: FileSystemService,
): Promise<StepLaunch | undefined> {
  const saved = savedWorkflow(opened.request, opened.runDir, fs)
  if (saved === undefined) return undefined
  const step = pendingMergeClosure(saved.workflow, saved.state)
  if (!step) return undefined
  const { pr, head } = step.inputs
  const { resolved, request } = opened
  const scriptDir = () => locateCycleScripts(fs, resolved.project, resolved.cwd).scriptsDir
  const merged = await workflowOperation(scriptDir, resolved.cwd, {
    action: 'merge-resume',
    card: request.card,
    data: { pr, head },
  })
  return merged === true ? step : undefined
}

/** Resolve the card and allow a closed-card resume only to finish a confirmed merge. */
async function preflight(opened: Omit<Opened, 'title'>, services: Services): Promise<Opened> {
  const { resolved, request } = opened
  const { card } = request
  const read = await (services.deps.workflow?.readCard ?? readRunnableCard)(card, resolved.cwd)
  if (read === 'missing')
    throw new Error(
      `card-not-found: card ${card} cannot be read from the tracker; nothing was launched.`,
    )
  if (read === 'closed') {
    if (await closureStep(opened, services.fs))
      return { ...opened, title: `Card ${card}: finish post-merge closure`, closureOnly: true }
    throw new Error(`card-closed: card ${card} is closed; nothing was launched.`)
  }
  if (resolved.configuration === undefined)
    assertEngineAvailable(
      resolved.engine,
      services.deps.workflow?.engineAvailable ?? createExecutableProbe(services.fs),
    )
  return { ...opened, title: read.title }
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
  if (step.kind !== 'loop') return ''
  const action = escalationAction(step.escalate?.exhausted)
  if (action !== undefined) return ` exhausted=${action}`
  return ` on-max=${step['on-max']}${step['on-max'] === 'escalate' ? ' (human escalation)' : ' (fails)'}`
}

type BatchCard = {
  card: WorkflowCard
  report: (outcome: BatchOutcome) => void
  releases: Set<() => void>
}

type WorkflowRunRequest = RunWorkflowRequest & {
  readonly selectionFlags?: Filter
  readonly routedCard?: WorkflowCard
}

function printWorkflowPreview(resolved: Resolved): number {
  if (resolved.cardLabels !== undefined && resolved.configuration !== undefined) {
    const { configuration, source } = resolved.configuration
    console.log(`  Configuration: ${configuration.name} — ${source}`)
  }
  addressedSteps(resolved.workflow).forEach(step => {
    const host = step.kind === 'loop' || kindByName[step.kind].host === true
    const skill = host ? undefined : (step.skill ?? kindByName[step.kind].defaultSkill)
    const assignment =
      step.kind === 'loop'
        ? ''
        : describeAssignment(
            assignmentFor(resolved.workflow, step, resolved.configuration?.configuration),
          )
    console.log(
      `  ${step.id}: ${step.kind}${skill ? ` skill=${skill}` : ''}${dryRunExecution(resolved, step)}${assignment}${dryRunExhaustion(step)}${step.when ? ` when=${JSON.stringify(step.when)}` : ''}${approvalQuestion(step)}`,
    )
  })
  console.log('  Dry run: the workflow is valid; nothing was launched.')
  return 0
}

function configuredSelection(resolved: Resolved, selectionFlags: Filter = {}) {
  const workflow = resolved.workflow.select
  const configuration = resolved.configuration?.configuration.select
  return (configuration?.filter ?? workflow?.filter) === undefined &&
    Object.keys(selectionFlags).length === 0
    ? undefined
    : effectiveSelection(workflow, configuration, selectionFlags)
}

type ReadSelectionCard = () => Promise<WorkflowCard | undefined>
type CardSource = { read: ReadSelectionCard; batch: BatchCard | undefined }

function selectionCardReader(
  resolved: Resolved,
  card: string,
  { fs, deps }: Services,
): ReadSelectionCard {
  let reading: ReturnType<ReadSelectionCard> | undefined
  return () =>
    (reading ??= (deps.workflow?.readSelection ?? readWorkflowCards)(
      { fs, ...resolved },
      { cards: [card] },
    ).then(({ cards }) => cards[0]))
}

async function readTierLabels(
  card: string,
  read: () => Promise<Pick<WorkflowCard, 'labels' | 'error'> | undefined>,
): Promise<readonly string[]> {
  try {
    const found = await read()
    if (found === undefined) throw new Error('card facts unavailable')
    if (found.error !== undefined) throw new Error(found.error)
    return found.labels
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error)
    console.log(
      `  Warning: could not read labels for card ${card}: ${reason}. Using the fallback configuration.`,
    )
    return []
  }
}

async function runTierLabels(
  resolved: Resolved,
  request: WorkflowRunRequest,
  { fs, deps }: Services,
  { read, batch }: CardSource,
): Promise<readonly string[] | undefined> {
  if (!usesTierLabels(resolved, request)) return undefined
  // An explicit card's labels are usable without resolving the board's status mapping.
  const readLabels = deps.workflow?.readSelection
    ? read
    : () => readWorkflowCard({ fs, ...resolved }, request.card)
  return (
    frozenTierLabels(resolved, request, fs) ??
    (batch?.card ?? request.routedCard)?.labels ??
    (await readTierLabels(request.card, readLabels))
  )
}

async function acceptsCard(
  resolved: Resolved,
  request: WorkflowRunRequest,
  { runDir, fs, read }: { runDir: string; fs: FileSystemService; read: ReadSelectionCard },
): Promise<boolean> {
  const selection = configuredSelection(resolved, request.selectionFlags)
  if (selection === undefined) return true
  const found = await read()
  if (found === undefined) return false
  const error = found.error ?? selectionBoardError(found, selection)
  if (error !== undefined) throw new Error(error)
  const run = request.restart
    ? undefined
    : { files: fs, dir: runDir, workflow: resolved.workflow.name, main: resolved.main }
  return matchesWorkflowCard(found, selection.accepts, run)
}

/** Completed runs keep their outcome if optional telemetry needs a later retry. */
export async function migrateCompletedRunTelemetry(run: RunDirectory): Promise<void> {
  if (!hasLegacyRunTelemetry(run)) return
  try {
    const lock = acquireRunLock(run.dir)
    if (lock.kind !== 'acquired') return
    try {
      const warning = await migrateRunTelemetry(run)
      if (warning !== undefined) console.log(`  Warning: ${warning}`)
    } finally {
      lock.release()
    }
  } catch (error) {
    console.log(`  Warning: telemetry migration could not acquire the run lock: ${String(error)}`)
  }
}

export async function handleWorkflowRun(
  config: RunCommandConfig,
  request: WorkflowRunRequest,
  services: Services,
  batch?: BatchCard,
): Promise<number> {
  const definition = resolveWorkflowDefinition(config, request, services)
  if (definition === undefined) return 1
  const card = { read: selectionCardReader(definition, request.card, services), batch }
  const cardLabels = await runTierLabels(definition, request, services, card)
  const resolved = configureWorkflowRun(config, request, services, { ...definition, cardLabels })
  if (resolved === undefined) return 1
  printPlan(resolved.workflow)
  if (config.dryRun) return printWorkflowPreview(resolved)
  const opened = await openCard(resolved, request, services, card)
  return opened === undefined ? 0 : runWithCardLock(config, opened, services, batch?.releases)
}

async function openCard(
  resolved: Resolved,
  request: WorkflowRunRequest,
  services: Services,
  { read, batch }: CardSource,
): Promise<Opened | undefined> {
  const runDir = workflowRunDir(resolved, request)
  const run = { files: services.fs, dir: runDir }
  if (
    batch === undefined &&
    !request.restart &&
    request.flagAnswer === undefined &&
    completedRun(run, { workflow: resolved.workflow.name, card: request.card })
  ) {
    await migrateCompletedRunTelemetry(run)
    console.log('  Run: already complete — nothing to do. Pass --restart to start over.')
    return undefined
  }
  if (
    batch === undefined &&
    !(await acceptsCard(resolved, request, { runDir, fs: services.fs, read }))
  ) {
    console.log(`  #${request.card}: not-applicable — selection filter`)
    return undefined
  }
  const opened = { resolved, request, runDir }
  return batch === undefined
    ? preflight(opened, services)
    : { ...opened, title: batch.card.title, report: batch.report }
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

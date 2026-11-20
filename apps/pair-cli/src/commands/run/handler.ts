import { format } from 'util'
import { mkdirSync } from 'node:fs'
import { plainConsole, plainNote } from './plain-console'
import { join, resolve } from 'path'
import type { FileSystemService } from '@pair/content-ops'
import chalk from 'chalk'
import { isParallelRun, parseRunCommand, type RunCommandConfig } from './parser'
import { optionsOfArgv, runCardInProcess } from './parallel'
import { handleCardsRun } from './cards-entry'
import { assertEngineAvailable, describeEngineResolution, resolveEngine } from './resolve-engine'
import { createExecutableProbe } from './path-probe'
import {
  describeSkillResolution,
  resolveInvocation,
  type ResolvedInvocation,
} from './resolve-skill'
import { createPerimeter, describePerimeter, type Perimeter } from './perimeter'
import { describeMergePosture, describeParallelism } from './automation-policy'
import { describeApprovalPosture, filterDeliveryFor, selectionDeliveredBy } from './invocation'
import { mainCheckoutOrCwd, readCardClosedAt, readCardLabels } from './cycle-wiring'
import { withHostRetryContext } from './host-retry-audit'
import { acquireRunLock } from './run-lock'
import { readWorkingCleanup, sweepWorkingAreaAsync } from './working-cleanup'
import { POLICY_PATH } from './policy-sections'
import { describeDispatch, type DispatchDecision } from './dispatch'
import { driveRun } from './loop-driver'
import { whileInterruptible } from './interrupt'
import { effectiveSelection, resolveRunAutonomy, spawnAutonomyResolver } from './autonomy-policy'
import { enterCycleAtReview, handleSkipDecision } from './card-entry'
import { createCycleScriptsBridge, locateCycleScripts } from './cycle-scripts'
import {
  resolveOffCycleProfile,
  resolveWorkflowProfile,
  profileForTier,
  stageEngineIds,
  validateProfileRun,
} from './workflow-profile'
import { ENGINE_IDS, isEngineId } from './engines'
import { handleParallelRun } from './parallel-entry'
import {
  declaredEngine,
  declaredEngineBin,
  idleTimeoutForEngine,
  driveLockedCard,
  takeCardLock,
  resolveAutonomyFor,
  resolveContext,
  withRunAgentRunner,
  withResolvedCardSelection,
  type ResolvedRun,
  type RunContext,
  type RunHandlerDependencies,
} from './run-context'

/**
 * `pair-cli run` — loop mode (US-451) and tag-driven dispatch (US-217). A `--card` the dispatcher
 * skips is handed to the DoR fallback (`card-entry.ts`), which owns US-487's routing and reaches the
 * delivery-cycle coordinator (`cycle-entry.ts`); this module never decides a card's readiness.
 */

export type {
  IterationRunner,
  CardReadinessProbe,
  DriveCycleInput,
  DriveCycleResult,
  CycleDriver,
  RunHandlerDependencies,
} from './run-context'
export { isDorFallbackReason, ineligibleOverrideApplied, type DorFallbackGate } from './card-entry'

/**
 * The run's scope root — the DISPATCHED CARD whenever there is one, and nothing displaces it.
 *
 * Carried as a VALUE and rendered downstream under the routed workflow's own parameter name —
 * borrowed, never invented (D18): `--root` for `pair-loop`, `--story` for
 * `pair-process-refine-story`. `A dispatched card IS the run's scope` (ADR-024 item 7), so the
 * parser refuses `--root` alongside `--card` and the two are never both set here. The card is
 * still read FIRST, because this ordering is what makes the wrong outcome unreachable for a caller
 * that builds a config without going through the parser: an agent driven over a subtree nobody
 * locked, while the audit trail, the exclusive lock and the on-issue `DISPATCH-RECORD:` all name
 * the card that WAS dispatched.
 */
function scopeRoot(config: RunCommandConfig, dispatch?: DispatchDecision): string | undefined {
  return dispatch?.card ?? config.scope.root
}

/**
 * US-521 (r0-3): `## Autonomy` selection keys are borrowed exactly like `## Eligibility` — argument >
 * adoption per key, from the ONE shared resolution; a key the skill cannot carry is never invented.
 */
function perimeterFor(input: {
  config: RunCommandConfig
  context: RunContext
  cwd: string
  invocation: ResolvedInvocation
}): Perimeter {
  const { config, context, cwd, invocation } = input
  const selection = perimeterSelection(config, context, invocation)
  return createPerimeter({
    ...selection,
    filter: config.scope.filter,
    cwd,
    cwdDeclared: config.cwd !== undefined,
    requestedCap: config.maxIterations,
    policyCap: context.policy.maxIterations,
    invocationKind: invocation.kind,
    filterDelivery: filterDeliveryFor(invocation),
  })
}

function perimeterSelection(
  config: RunCommandConfig,
  context: RunContext,
  invocation: ResolvedInvocation,
) {
  const selection = context.autonomySelection
  const selectionDelivered = selectionDeliveredBy(invocation)
  const resolved = (key: 'root' | 'filter' | 'assignee' | 'status') =>
    effectiveSelection(selection, key)
  const delivered = (key: 'assignee' | 'status') =>
    selectionDelivered ? resolved(key)?.value : undefined
  return {
    root: scopeRoot(config, context.dispatch) ?? resolved('root')?.value,
    assignee: config.scope.assignee ?? delivered('assignee'),
    status: config.scope.status ?? delivered('status'),
    selectionDelivered,
    eligibility: resolved('filter')?.value ?? context.policy.eligibility,
    eligibilitySource: resolved('filter')?.source,
  }
}

/**
 * Everything is resolved BEFORE anything is spawned, and every resolution is printed: engine and
 * the level it came from (AC1), skill and any fallback (AC2), the perimeter (AC5), the autonomy
 * and trust posture (AC6), the borrowed policy and the declared parallelism limit (AC8/AC9).
 *
 * A refusal — no perimeter, an untrusted project, an engine with no confirmations and no
 * `--autonomous`, a malformed policy — happens here, so no iteration ever starts outside them.
 */
function resolveRun(
  config: RunCommandConfig,
  context: RunContext,
  cwd: string,
  services: { fs: FileSystemService; deps: RunHandlerDependencies },
): ResolvedRun {
  const { fs } = services
  const { policy } = context
  // On a routed run the WORKFLOW is the invocation: the card's tag chose it through the adoption
  // mapping, which is the whole point of tag-driven automation — the cascade never gets a say, and
  // `--skill`/`--prompt` were refused at parse time so there is nothing to arbitrate here.
  const invocation: ResolvedInvocation =
    context.dispatch?.kind === 'route'
      ? { kind: 'skill', name: context.dispatch.workflow, source: 'mapping' }
      : resolveInvocation(config.invocation, context.probe)
  const { selected, configured, engineDef } = resolveProfileEngine(
    { config, context, cwd, services },
    invocation,
  )
  const perimeter = perimeterFor({ config, context, cwd, invocation })
  const autonomy = resolveAutonomyFor(engineDef, config, cwd, fs)

  return {
    engine: { ...configured, engine: engineDef },
    ...(selected && { profile: { stage: selected.stage, table: selected.profile.table } }),
    ...(selected?.settings.model !== undefined && { model: selected.settings.model }),
    ...(selected?.settings.effort !== undefined && { effort: selected.settings.effort }),
    invocation,
    perimeter,
    policy,
    autonomy,
    ...(context.dispatch && { dispatch: context.dispatch }),
    auditPath: context.auditPath,
    idleTimeout: idleTimeoutForEngine(context, config, engineDef.id),
  }
}

function resolveProfileEngine(
  input: {
    config: RunCommandConfig
    context: RunContext
    cwd: string
    services: { fs: FileSystemService; deps: RunHandlerDependencies }
  },
  invocation: ResolvedInvocation,
) {
  const { config, context, cwd, services } = input
  const { fs, deps } = services
  const selected = resolveOffCycleProfile({
    fs,
    config: context.config,
    cwd,
    flags: config,
    invocation,
    tier: config.dispatch?.tags.find(tag => tag.startsWith('risk:')),
    resolve: deps.resolveWorkflowProfile,
  })
  validateRunSelection(selected, config, context)
  const wanted = selected?.settings.engine
  if (wanted !== undefined && !isEngineId(wanted))
    throw new Error(`profile-invalid: stages.${selected?.stage}.engine: unknown engine '${wanted}'`)
  const engine =
    wanted === undefined
      ? resolveEngine({ flag: config.engine, declared: declaredEngine(context.config) })
      : { ...resolveEngine({ flag: wanted }), source: 'workflow profile' as const }
  const configured = withRunAgentRunner(engine, context.config)
  const engineDef =
    selected === undefined
      ? configured.engine
      : assertEngineAvailable(configured, createExecutableProbe(fs), {
          fs,
          repoRoot: cwd,
          declaredBin: declaredEngineBin(context.config),
        })
  return { selected, configured, engineDef }
}

function validateRunSelection(
  selected: ReturnType<typeof resolveOffCycleProfile>,
  config: RunCommandConfig,
  context: RunContext,
): void {
  if (!selected) return
  stageEngineIds(selected.profile, ENGINE_IDS)
  validateProfileRun(selected.profile, {
    commandLine: config.profile !== undefined || config.workflowConfig !== undefined,
    ...(config.engine && { engineFlag: config.engine }),
    runEngine: config.engine ?? declaredEngine(context.config),
  })
}

function report(resolved: ResolvedRun, policyWarnings: readonly string[]): void {
  console.log(chalk.bold('pair-cli run'))
  if (resolved.dispatch) console.log(`  ${describeDispatch(resolved.dispatch)}`)
  console.log(`  ${describeEngineResolution(resolved.engine)}`)
  if (resolved.profile) {
    for (const line of resolved.profile.table) console.log(`  ${line}`)
    console.log(`  Active stage: ${resolved.profile.stage}`)
  }
  console.log(`  ${describeSkillResolution(resolved.invocation)}`)
  console.log(`  ${describePerimeter(resolved.perimeter)}`)
  for (const note of resolved.autonomy.notes) console.log(`  ${note}`)
  // Next to the autonomy notes, because it is the OTHER thing `--autonomous` decides (AC6): a run
  // whose composed skill will approve its own proposals unattended must say so before it spawns.
  const approval = describeApprovalPosture(resolved.invocation, resolved.autonomy.autonomous)
  if (approval !== undefined) console.log(`  ${approval}`)
  console.log(`  Policy: ${resolved.policy.source} · audit ${resolved.policy.auditLocation}`)
  console.log(`  ${describeParallelism(resolved.policy)}`)
  // Truthful per POLICY, not a blanket claim: with a tier under `## Auto-Advance` the invoked
  // skill may merge it itself, and saying "the gate stays human" there would be false.
  console.log(`  ${describeMergePosture(resolved.policy)}`)
  for (const warning of policyWarnings) console.log(chalk.yellow(`  ! ${warning}`))
}

/**
 * D1: an `--autonomous` `--card` run with NO `--card-tags` reads the card's live labels (an absent flag
 * is "nobody told us", not "no labels"). An unreadable tracker fails closed with its own message.
 * `--card-tags` (even empty) stays the explicit override.
 */
async function withLiveCardTags(
  config: RunCommandConfig,
  cwd: string,
  deps: RunHandlerDependencies,
): Promise<RunCommandConfig> {
  const request = config.dispatch
  if (!request || config.autonomous !== true || request.tagsObserved !== false) return config
  const labels = await (deps.readCardLabels ?? readCardLabels)(request.card, cwd)
  if (labels === undefined) {
    throw new Error(
      `could not read the labels of card ${request.card} from the tracker (\`gh issue view\` failed), ` +
        `so its eligibility cannot be decided — failing closed. Check \`gh auth status\`, or pass ` +
        `--card-tags to state the labels explicitly.`,
    )
  }
  const dispatch = Object.defineProperties(
    { ...request, tags: labels },
    {
      runId: { value: request.runId, enumerable: false },
      tagsObserved: { value: true, enumerable: false },
    },
  )
  return { ...config, dispatch }
}

/**
 * US-521 (r0-2): the autonomy policy is resolved and printed ONCE here, before the route is chosen: a
 * malformed one HALTs on every route before any card is touched. Downstream consumers receive this very
 * resolution (through the context and the injected resolver) instead of re-resolving it.
 */
async function resolveEntry(
  config: RunCommandConfig,
  fs: FileSystemService,
  cwd: string,
  callerDeps: RunHandlerDependencies,
): Promise<{ config: RunCommandConfig; context: RunContext; deps: RunHandlerDependencies }> {
  config = await withLiveCardTags(config, cwd, callerDeps)
  const base = resolveContext(config, fs, cwd, true)
  if (!config.dryRun) await sweepWorkingState(base.workingArea, fs, cwd, callerDeps)
  const selection = resolveRunAutonomy({
    resolver: callerDeps.resolveAutonomy ?? spawnAutonomyResolver,
    config,
    projectConfig: base.config,
    fs,
    cwd,
  })
  return {
    config,
    context: withResolvedCardSelection(base, config, selection),
    deps: {
      ...callerDeps,
      resolveAutonomy: () => selection,
      ...(base.profileSnapshot && {
        resolveWorkflowProfile: (_scripts, request) =>
          profileForTier(base.profileSnapshot!, request.tier),
      }),
    },
  }
}

/** US-576 AC7: at run start, drop the run state of cards Done longer than `## Working Cleanup` allows. */
async function sweepWorkingState(
  workingArea: string,
  fs: FileSystemService,
  cwd: string,
  deps: RunHandlerDependencies,
): Promise<void> {
  const policyFile = resolve(mainCheckoutOrCwd(cwd), POLICY_PATH)
  const policy = readWorkingCleanup(
    fs.existsSync(policyFile) ? fs.readFileSync(policyFile) : undefined,
  )
  const closedAt = deps.readCardClosedAt ?? readCardClosedAt
  const removed = await sweepWorkingAreaAsync({
    workingArea,
    policy,
    closedAt: card => closedAt(card, cwd),
    now: new Date(),
  })
  if (removed.length > 0)
    console.log(
      `  Working cleanup (${policy.text}): removed the run state of Done card(s) ${removed.map(id => `#${id}`).join(', ')}`,
    )
}

/** #568 B3: a dry run validates the profile too — the unknown name must not surface only at dispatch. */
function haltOnUnresolvedProfileInDryRun(
  {
    config,
    context,
    fs,
    cwd,
  }: { config: RunCommandConfig; context: RunContext; fs: FileSystemService; cwd: string },
  deps: RunHandlerDependencies,
): void {
  const flagged = config.profile !== undefined || config.workflowConfig !== undefined
  // --parallel resolves its own profile (parallel-entry)
  if (!config.dryRun || isParallelRun(config) || !flagged) return
  ;(deps.resolveWorkflowProfile ?? resolveWorkflowProfile)(
    locateCycleScripts(fs, context.config, cwd).scriptsDir,
    { root: cwd, profile: config.profile, workflowConfig: config.workflowConfig },
  )
}

/**
 * Handles `pair-cli run` — the execution adapter (US-451).
 *
 * Composes resolution → refusals → the re-invocation loop. The process logic stays in the skill:
 * this handler decides HOW to invoke, never WHAT to work on (BR1), and never merges (AC10).
 */
export async function handleRunCommand(
  rawConfig: RunCommandConfig,
  fs: FileSystemService,
  callerDeps: RunHandlerDependencies = {},
): Promise<number> {
  if (
    plainConsole({
      isTTY: process.stdout.isTTY,
      output: rawConfig.output,
      verbose: rawConfig.verbose,
    })
  )
    return await withPlainConsole(() => runCommand(rawConfig, fs, callerDeps))
  if (rawConfig.output !== 'json') return await runCommand(rawConfig, fs, callerDeps)
  // US-573 AC3: under --json stdout carries ONLY the NDJSON run events; every human line goes to stderr.
  const log = console.log
  console.log = console.error
  try {
    return await runCommand(rawConfig, fs, callerDeps)
  } finally {
    console.log = log
  }
}

/** A live terminal without --verbose: the driver's technical lines are hidden, a few become plain notes. */
async function withPlainConsole(run: () => Promise<number>): Promise<number> {
  const log = console.log
  console.log = (...args: unknown[]) => {
    const shown = plainNote(format(...args))
    if (shown !== undefined) log(shown)
  }
  try {
    return await run()
  } finally {
    console.log = log
  }
}

/** The loop drives each card's cycle in this process (no nested `pair-cli run`), unless a runner was injected. */
function withInProcessCards(
  deps: RunHandlerDependencies,
  fs: FileSystemService,
  callerDeps: RunHandlerDependencies,
): RunHandlerDependencies {
  const runCard = (args: readonly string[]) =>
    runCommand(
      parseRunCommand(optionsOfArgv(args) as Parameters<typeof parseRunCommand>[0]),
      fs,
      callerDeps,
    )
  return { ...deps, runCardProcess: deps.runCardProcess ?? runCardInProcess(runCard) }
}

/** The multi-card entries: `--cards` (ordered, serial passes) or the `--parallel` fan-out. */
async function runMulti(
  ctx: { config: RunCommandConfig; context: RunContext; fs: FileSystemService; cwd: string },
  deps: RunHandlerDependencies,
  fs: FileSystemService,
  callerDeps: RunHandlerDependencies,
): Promise<number> {
  if (ctx.config.cards === undefined)
    return await handleParallelRun(ctx, withInProcessCards(deps, fs, callerDeps))
  return await handleCardsRun({
    ...ctx,
    deps,
    runCard: config => runCommand(config, fs, callerDeps),
  })
}

async function runCommand(
  rawConfig: RunCommandConfig,
  fs: FileSystemService,
  callerDeps: RunHandlerDependencies,
): Promise<number> {
  const dispatch = rawConfig.dispatch
  if (!dispatch || rawConfig.telemetry !== true)
    return await runCommandInner(rawConfig, fs, callerDeps)
  const root = mainCheckoutOrCwd(resolve(rawConfig.cwd ?? fs.currentWorkingDirectory()))
  return await withHostRetryContext(
    { root, card: dispatch.card, run: dispatch.runId, enabled: rawConfig.telemetry === true },
    () => runCommandInner(rawConfig, fs, callerDeps),
  )
}
async function runResolvedCard({
  config,
  context,
  fs,
  cwd,
  deps,
}: {
  config: RunCommandConfig
  context: RunContext
  fs: FileSystemService
  cwd: string
  deps: RunHandlerDependencies
}): Promise<number> {
  const reviewCard = prEntryOnMappedRoute(config, context)
  if (reviewCard !== undefined) {
    return await enterCycleAtReview({ config, context, fs, cwd, card: reviewCard }, deps)
  }
  const resolved = resolveRun(config, context, cwd, { fs, deps })
  report(resolved, resolved.policy.warnings)
  if (config.dryRun) {
    console.log(chalk.dim('  Dry run: nothing was spawned.'))
    return 0
  }
  assertEngineAvailable(resolved.engine, createExecutableProbe(fs))
  return resolved.dispatch
    ? await driveDispatchedCard({ resolved, decision: resolved.dispatch, context, config }, deps)
    : await driveTrapped(resolved, config, deps)
}

async function runCommandInner(
  rawConfig: RunCommandConfig,
  fs: FileSystemService,
  callerDeps: RunHandlerDependencies,
): Promise<number> {
  // ABSOLUTE, always: the perimeter's directory is printed as the run's containment boundary and
  // probed against the engine's trust store, and `--cwd .` is neither legible as a boundary nor
  // comparable against an absolute trust-store key.
  const cwd = resolve(rawConfig.cwd ?? fs.currentWorkingDirectory())
  let entry: Awaited<ReturnType<typeof resolveEntry>>
  try {
    entry = await whileInterruptible(
      () => {},
      () => resolveEntry(rawConfig, fs, cwd, callerDeps),
    )
  } catch (error) {
    return parkHostEntry(error, { config: rawConfig, fs: fs, cwd: cwd, deps: callerDeps })
  }
  const { config, context, deps } = entry

  haltOnUnresolvedProfileInDryRun({ config, context, fs, cwd }, deps)
  // US-491: `--root --parallel N` — the fan-out mode, its own entry (the parser guarantees no card).
  const ctx = { config, context, fs, cwd }
  if (config.cards !== undefined || isParallelRun(config))
    return await runMulti(ctx, deps, fs, callerDeps)

  // Nothing to run on this card: report the decision and stop. This is a clean exit, never an
  // error — automation is opt-in per card (D21), so "no workflow applies here" is the shipped
  // answer for every card a team has not explicitly tagged.
  //
  // AC14 (US-487): `unmapped` / `no-mapping-declared` are no longer unconditionally "nothing
  // runs" — the card's OWN Definition-of-Ready macrostate now decides. Every OTHER skip reason
  // (`automation-off`, `ineligible`, `run-in-progress`) is unchanged.
  if (context.dispatch?.kind === 'skip') {
    try {
      return await handleSkipDecision(
        { config, context, fs, cwd, decision: context.dispatch },
        deps,
      )
    } catch (error) {
      return parkHostEntry(error, { config: config, fs: fs, cwd: cwd, deps: callerDeps })
    }
  }

  // AC2 (r0-2): `--pr` enters the cycle at review even on a card whose tag maps a workflow — the
  // mapping names what a card STARTS with, and a card with a PR has started. Never silently dropped.
  return await runResolvedCard({ config, context, fs, cwd, deps })
}
function hostParkContext(
  config: RunCommandConfig,
  fs: FileSystemService,
  cwd: string,
  deps: RunHandlerDependencies,
) {
  const dispatch = config.dispatch!
  const context = resolveContext(config, fs, cwd, true)
  const location = locateCycleScripts(fs, context.config, cwd)
  const selection = resolveRunAutonomy({
    resolver: deps.resolveAutonomy ?? spawnAutonomyResolver,
    config,
    projectConfig: context.config,
    fs,
    cwd,
  })
  const policy = {
    redRepairs: 3,
    greenRetries: 2,
    ...(selection?.policy.autoRecoveryRounds !== undefined && {
      autoRecoveryRounds: selection.policy.autoRecoveryRounds,
    }),
    ...(selection?.policy.maxFixRounds !== undefined && {
      maxFixRounds: selection.policy.maxFixRounds,
    }),
    ...(typeof dispatch.rounds === 'number' && { maxFixRounds: dispatch.rounds }),
  }
  return { context, location, policy }
}

function parkHostEntry(
  error: unknown,
  input: {
    config: RunCommandConfig
    fs: FileSystemService
    cwd: string
    deps: RunHandlerDependencies
  },
): number {
  const { config, fs, cwd, deps } = input
  const detail = error instanceof Error ? error.message : String(error)
  const dispatch = config.dispatch
  if (!detail.includes('host-transient:') || dispatch === undefined) throw error
  const { context, location, policy } = hostParkContext(config, fs, cwd, deps)
  const dir = join(mainCheckoutOrCwd(cwd), '.pair/working/runs', dispatch.runId, dispatch.card)
  const cardLock = takeCardLock(context, deps, dispatch.card)
  if (cardLock === undefined) return 0
  try {
    mkdirSync(dir, { recursive: true })
    const runLock = acquireRunLock(dir)
    if (runLock.kind !== 'acquired') {
      console.log(
        `  run-locked: ${dir} (pid ${String(runLock.pid ?? 'unknown')}, host ${runLock.host ?? 'unknown'})`,
      )
      return 1
    }
    try {
      const round = createCycleScriptsBridge(location, cwd).recover({
        dir,
        kind: 'stage-retry',
        detail: 'resolve:run host-transient',
        policy,
      })
      console.log(
        `  Recovery: host-transient — parked entry (round ${String(round.round)}/${String(round.budget)})`,
      )
      console.log('  Cycle status: awaiting-human (0 stage(s) dispatched)')
      console.log(`  Parked: ${detail}; resume token resolve:run:host-transient`)
      return 1
    } finally {
      runLock.release()
    }
  } finally {
    cardLock.release()
  }
}

/** US-573: a plain loop run, trapped so Ctrl+C finalizes the live lines and the audit's `loop-end interrupted`. */
async function driveTrapped(
  resolved: ResolvedRun,
  config: RunCommandConfig,
  deps: RunHandlerDependencies,
): Promise<number> {
  return await whileInterruptible(
    () => {},
    () => driveRun(resolved, config, deps),
  )
}

/** The routed card, when the invocation ALSO names a `--pr` (AC2 wins over the mapped workflow). */
function prEntryOnMappedRoute(config: RunCommandConfig, context: RunContext): string | undefined {
  if (context.dispatch?.kind !== 'route' || config.dispatch?.pr === undefined) return undefined
  return context.dispatch.card
}

/** One routed card and everything already resolved about it — one subject, not four arguments. */
interface DispatchedCard {
  readonly resolved: ResolvedRun
  readonly decision: DispatchDecision
  readonly context: RunContext
  readonly config: RunCommandConfig
}

/** A routed card: the shared locked + audited + interruptible run (`driveLockedCard`). */
async function driveDispatchedCard(
  card: DispatchedCard,
  deps: RunHandlerDependencies,
): Promise<number> {
  const { resolved, decision, context, config } = card
  return await driveLockedCard({ context, decision }, deps, () => driveRun(resolved, config, deps))
}

import { resolve } from 'path'
import type { FileSystemService } from '@pair/content-ops'
import chalk from 'chalk'
import type { RunCommandConfig } from './parser'
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
import { readCardLabels } from './cycle-wiring'
import { describeDispatch, type DispatchDecision } from './dispatch'
import { driveRun } from './loop-driver'
import { adoptionSelection, resolveRunAutonomy, spawnAutonomyResolver } from './autonomy-policy'
import { enterCycleAtReview, handleSkipDecision } from './card-entry'
import { refuseProfileOffCycle } from './workflow-profile'
import { handleParallelRun } from './parallel-entry'
import {
  declaredEngine,
  driveLockedCard,
  resolveAutonomyFor,
  resolveContext,
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
  const selection = context.autonomySelection
  const selectionDelivered = selectionDeliveredBy(invocation)
  const adopted = (key: 'assignee' | 'status') =>
    selectionDelivered ? adoptionSelection(selection, key) : undefined
  return createPerimeter({
    root: scopeRoot(config, context.dispatch) ?? adoptionSelection(selection, 'root'),
    filter: config.scope.filter,
    assignee: config.scope.assignee ?? adopted('assignee'),
    status: config.scope.status ?? adopted('status'),
    selectionDelivered,
    eligibility: adoptionSelection(selection, 'filter') ?? context.policy.eligibility,
    cwd,
    cwdDeclared: config.cwd !== undefined,
    requestedCap: config.maxIterations,
    policyCap: context.policy.maxIterations,
    invocationKind: invocation.kind,
    // Whether `--filter` can be HONOURED, and by whom, depends on the skill the cascade resolved,
    // so the check has to happen after skill resolution and before any spawn (round 1, finding 1).
    filterDelivery: filterDeliveryFor(invocation),
  })
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
  fs: FileSystemService,
): ResolvedRun {
  const { policy } = context
  // US-488: a routed card runs a mapped workflow — no cycle stage exists for a profile to configure.
  if (context.dispatch?.kind === 'route') {
    refuseProfileOffCycle(config, `the mapped workflow \`${context.dispatch.workflow}\``)
  }
  const engine = resolveEngine({ flag: config.engine, declared: declaredEngine(context.config) })
  // On a routed run the WORKFLOW is the invocation: the card's tag chose it through the adoption
  // mapping, which is the whole point of tag-driven automation — the cascade never gets a say, and
  // `--skill`/`--prompt` were refused at parse time so there is nothing to arbitrate here.
  const invocation: ResolvedInvocation =
    context.dispatch?.kind === 'route'
      ? { kind: 'skill', name: context.dispatch.workflow, source: 'mapping' }
      : resolveInvocation(config.invocation, context.probe)
  const perimeter = perimeterFor({ config, context, cwd, invocation })
  const autonomy = resolveAutonomyFor(engine.engine, config, cwd, fs)

  return {
    engine,
    invocation,
    perimeter,
    policy,
    autonomy,
    ...(context.dispatch && { dispatch: context.dispatch }),
  }
}

function report(resolved: ResolvedRun, policyWarnings: readonly string[]): void {
  console.log(chalk.bold('pair-cli run'))
  if (resolved.dispatch) console.log(`  ${describeDispatch(resolved.dispatch)}`)
  console.log(`  ${describeEngineResolution(resolved.engine)}`)
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
function withLiveCardTags(
  config: RunCommandConfig,
  cwd: string,
  deps: RunHandlerDependencies,
): RunCommandConfig {
  const request = config.dispatch
  if (!request || config.autonomous !== true || request.tagsObserved !== false) return config
  const labels = (deps.readCardLabels ?? readCardLabels)(request.card, cwd)
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
function resolveEntry(
  config: RunCommandConfig,
  fs: FileSystemService,
  cwd: string,
  callerDeps: RunHandlerDependencies,
): { config: RunCommandConfig; context: RunContext; deps: RunHandlerDependencies } {
  config = withLiveCardTags(config, cwd, callerDeps)
  const base = resolveContext(config, fs, cwd)
  const selection = resolveRunAutonomy({
    resolver: callerDeps.resolveAutonomy ?? spawnAutonomyResolver,
    config,
    projectConfig: base.config,
    fs,
    cwd,
  })
  return {
    config,
    context: { ...base, ...(selection && { autonomySelection: selection }) },
    deps: { ...callerDeps, resolveAutonomy: () => selection },
  }
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
  // ABSOLUTE, always: the perimeter's directory is printed as the run's containment boundary and
  // probed against the engine's trust store, and `--cwd .` is neither legible as a boundary nor
  // comparable against an absolute trust-store key.
  const cwd = resolve(rawConfig.cwd ?? fs.currentWorkingDirectory())
  const { config, context, deps } = resolveEntry(rawConfig, fs, cwd, callerDeps)

  // US-491: `--root --parallel N` — the fan-out mode, its own entry (the parser guarantees no card).
  if (config.parallel !== undefined) {
    return await handleParallelRun({ config, context, fs, cwd }, deps)
  }

  // Nothing to run on this card: report the decision and stop. This is a clean exit, never an
  // error — automation is opt-in per card (D21), so "no workflow applies here" is the shipped
  // answer for every card a team has not explicitly tagged.
  //
  // AC14 (US-487): `unmapped` / `no-mapping-declared` are no longer unconditionally "nothing
  // runs" — the card's OWN Definition-of-Ready macrostate now decides. Every OTHER skip reason
  // (`automation-off`, `ineligible`, `run-in-progress`) is unchanged.
  if (context.dispatch?.kind === 'skip') {
    return await handleSkipDecision({ config, context, fs, cwd, decision: context.dispatch }, deps)
  }

  // AC2 (r0-2): `--pr` enters the cycle at review even on a card whose tag maps a workflow — the
  // mapping names what a card STARTS with, and a card with a PR has started. Never silently dropped.
  const reviewCard = prEntryOnMappedRoute(config, context)
  if (reviewCard !== undefined) {
    return await enterCycleAtReview({ config, context, fs, cwd, card: reviewCard }, deps)
  }

  const resolved = resolveRun(config, context, cwd, fs)

  report(resolved, resolved.policy.warnings)

  if (config.dryRun) {
    console.log(chalk.dim('  Dry run: nothing was spawned.'))
    return 0
  }

  assertEngineAvailable(resolved.engine, createExecutableProbe(fs))

  return resolved.dispatch
    ? await driveDispatchedCard({ resolved, decision: resolved.dispatch, context, config }, deps)
    : await driveRun(resolved, config, deps)
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

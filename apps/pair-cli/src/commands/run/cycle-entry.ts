import type { FileSystemService } from '@pair/content-ops'
import chalk from 'chalk'
import type { RunCommandConfig, RunDispatchRequest } from './parser'
import { assertEngineAvailable, describeEngineResolution, resolveEngine } from './resolve-engine'
import { createExecutableProbe } from './path-probe'
import type { EngineDefinition } from './engines'
import type { DispatchSkipReason } from './dispatch'
import {
  locateAgentDefinitions,
  locateCycleScripts,
  CYCLE_WORKTREE_ROOT_DEFAULT,
  CYCLE_DISPATCH_CAP_DEFAULT,
  CYCLE_WORKFLOW_VERSION,
  CYCLE_BASE_BRANCH_DEFAULT,
} from './cycle-scripts'
import { createDefaultCycleDriver, mainCheckout } from './cycle-wiring'
import {
  declaredEngine,
  declaredEngineBin,
  declaredEngineModel,
  resolveAutonomyFor,
  type CycleDriver,
  type DriveCycleResult,
  type RunContext,
  type RunHandlerDependencies,
} from './run-context'

/**
 * The delivery-cycle entry of `pair-cli run --card` (US-487 AC1/AC10/AC11/AC12): a Ready card no
 * mapping routed is handed to this story's own cycle coordinator — resolve and print, then drive,
 * then report the status `resolve` reached. Nothing on this path ever merges.
 */

export interface CycleCoordinatorInput {
  readonly config: RunCommandConfig
  readonly context: RunContext
  readonly fs: FileSystemService
  readonly cwd: string
  readonly card: string
  readonly dorReason: DispatchSkipReason
}

/**
 * AC7: `--root`/`--filter` and a declared `## Max Parallelism` expectation are LOOP-MODE concerns,
 * refused only once the entry resolves to the cycle coordinator (never at parse time, so US-217's
 * own accepted --filter-alongside---card stays a zero-regression control for a ROUTE decision).
 */
function assertNoLoopModeConcerns(config: RunCommandConfig): void {
  if (config.scope.filter !== undefined) {
    throw new Error(
      `--filter cannot be combined with a --card entry that resolves to the delivery-cycle ` +
        `coordinator (Ready, no mapping): --filter is a loop-mode concern (pair-loop's own ` +
        `eligibility selector), and the cycle coordinator drives ONE story's own stages, never a ` +
        `filtered set of cards. Drop --filter, or map this card's tag to a workflow instead.`,
    )
  }
  // r0-3, then AC7's rewrite (2026-09-22). The review was right that the old `eligibility ===
  // undefined` guard matched nothing the AC said. Making the refusal unconditional — the literal
  // reading — then refused the coordinator on THIS repository, whose `automation.md` declares
  // `## Max Parallelism` for `pair-loop`. The letter of the AC made the feature unreachable for
  // every project that also runs a parallel loop.
  //
  // The distinction the AC was missing, and now states: `--root`/`--filter` above are arguments of
  // THIS invocation — someone is asking this run for something the cycle does not do. A declared
  // `## Max Parallelism` is a key in a shared policy file addressed to ANOTHER consumer. Refusing
  // on it conflates "a request made of me" with "a setting that exists for someone else", so it is
  // not refused. Loop mode reads the ceiling through `automation-policy`'s own parser, which is
  // where it belongs; the local textual probe this function used has no remaining caller and is gone.
}

/**
 * Why the cycle stopped, not just that it did.
 *
 * `resolve` already carries the answer — the refusal a phase returned, the budget it exhausted, the
 * detail it wrote — and dropping it left an operator with `failed-preparation` and nowhere to go
 * but reading handoff JSON by hand. That is the whole diagnostic surface of an unattended run.
 */
function reportCycleReason(next: DriveCycleResult['next']): void {
  if (!next || typeof next !== 'object') return
  const n = next as { reason?: unknown; refusal?: unknown; detail?: unknown; budget?: unknown }
  const parts = [
    n.reason !== undefined ? `reason ${String(n.reason)}` : undefined,
    n.refusal !== undefined ? `refusal ${String(n.refusal)}` : undefined,
    n.budget !== undefined ? `budget ${String(n.budget)}` : undefined,
  ].filter(Boolean)
  if (parts.length > 0) console.log(`  ${parts.join(' · ')}`)
  if (typeof n.detail === 'string' && n.detail.trim()) console.log(`  ${n.detail}`)
  const step = describeNextStep(next)
  if (step !== undefined) console.log(`  Next step: ${step}`)
}

/**
 * AC8: a bounded run "exits printing the `next` step" — the step, phase and round the bound
 * stopped before, so the operator can resume it. Only for a `next` that is a dispatchable step:
 * `done`/`blocked` are outcomes, already said by the status and reason above.
 */
function describeNextStep(next: object): string | undefined {
  const n = next as { step?: unknown; phase?: unknown; round?: unknown }
  if (typeof n.step !== 'string' || n.step === 'done' || n.step === 'blocked') return undefined
  return [
    n.step,
    n.phase !== undefined ? `phase ${String(n.phase)}` : undefined,
    n.round !== undefined ? `round ${String(n.round)}` : undefined,
  ]
    .filter(Boolean)
    .join(' · ')
}

/** AC10 — the whole transparency block: resolve and print, THEN act, before the first stage could spawn. */
function reportCycleEntry(input: {
  engine: ReturnType<typeof resolveEngine>
  dispatch: RunDispatchRequest
  card: string
  scriptsDir: string | undefined
  runDir: string
}): void {
  console.log(chalk.bold('pair-cli run'))
  console.log(`  ${describeEngineResolution(input.engine)}`)
  console.log(`  Delivery cycle: runId=${input.dispatch.runId} card=${input.card}`)
  console.log(`  Scripts: ${input.scriptsDir ?? '(resolved by the cycle driver)'}`)
  console.log(`  Run dir: ${input.runDir}`)
  console.log(`  Worktree root: ${CYCLE_WORKTREE_ROOT_DEFAULT}`)
  console.log(
    `  Rounds bound: ${input.dispatch.rounds ?? '(policy default: maxFixRounds)'} — rounds narrows, never widens it`,
  )
  console.log(`  Dispatch cap: ${CYCLE_DISPATCH_CAP_DEFAULT}`)
}

/** The executable this run will actually spawn: config, then PATH, then the repo's own bin. */
export function resolveEngineFor(
  engine: ReturnType<typeof resolveEngine>,
  context: RunContext,
  cwd: string,
  fs: FileSystemService,
): EngineDefinition {
  return assertEngineAvailable(engine, createExecutableProbe(fs), {
    fs,
    repoRoot: cwd,
    declaredBin: declaredEngineBin(context.config),
  })
}

/** The shipped driver: the pieces T-2/T-3/T-4 built, composed with this run's own resolved context. */
function productionCycleDriver(input: {
  engine: ReturnType<typeof resolveEngine>
  engineDef: EngineDefinition
  config: RunCommandConfig
  context: RunContext
  cwd: string
  fs: FileSystemService
  location: ReturnType<typeof locateCycleScripts> | undefined
}): CycleDriver {
  return createDefaultCycleDriver({
    engine: input.engineDef,
    cwd: input.cwd,
    fs: input.fs,
    location: input.location,
    // Trust and autonomy are decided about the directory the STAGE will actually run in — the main
    // checkout — not about the driver's own cwd. They differ whenever the command is invoked from a
    // worktree, and the check then answers a question nobody asked: pi refuses a story worktree it
    // has never seen, while the process it would have spawned was going to run somewhere trusted.
    autonomyArgs: resolveAutonomyFor(
      input.engineDef,
      input.config,
      mainCheckout(input.cwd),
      input.fs,
    ).args,
    timeoutSeconds: input.config.iterationTimeoutSeconds,
    workflowVersion: CYCLE_WORKFLOW_VERSION,
    baseBranch: CYCLE_BASE_BRANCH_DEFAULT,
    model: declaredEngineModel(input.context.config, input.engineDef.id),
  })
}

/**
 * Ready (DoR satisfied): this story's own delivery-cycle coordinator, never a prep skill and
 * never the loop-mode re-invocation machinery (AC9, AC12) — `driveCycle` reports a STATUS, and
 * nothing on this path ever merges.
 */
export async function enterCycleCoordinator(
  input: CycleCoordinatorInput,
  deps: RunHandlerDependencies,
): Promise<number> {
  const { config, context, fs, cwd, card } = input

  assertNoLoopModeConcerns(config)

  const engine = resolveEngine({ flag: config.engine, declared: declaredEngine(context.config) })
  const engineDef = resolveEngineFor(engine, context, cwd, fs)

  // AC11: HALTs skill-missing, naming pair-workflow-cycle, before anything is printed or spawned.
  //
  // Scoped to `no-mapping-declared` (no `## Workflows` at all — the project has not adopted
  // tag-driven dispatch): the round-2-repair AC14 witness proving the `unmapped` half of this same
  // fallback (a project WITH `## Workflows` declared, whose card just carries no matching tag)
  // reuses `dispatchFs()`'s fixture, which installs no `pair-workflow-cycle` skill either — that
  // fixture is shared with the tag-mapped-route tests above it, where the skill is irrelevant, so
  // scoping here to the branch AC11's OWN fixture actually exercises keeps that shared fixture's
  // other rows untouched. Flagged as a contract note: a real, unconfigured-vs-partially-configured
  // project could still reach `driveCycle` unchecked via the `unmapped` branch.
  // r0-4: located for BOTH fallback reasons, not just `no-mapping-declared`. `handleDorFallback`
  // reaches here for `unmapped` too (a project WITH `## Workflows` whose card carries no mapped
  // tag), and scoping the probe to one of them let that project reach `driveCycle` with the skill
  // absent — the very HALT AC11 exists to raise, skipped for half its own surface.
  const location = {
    ...locateCycleScripts(fs, context.config, cwd),
    agentsDir: locateAgentDefinitions(context.config, cwd),
  }

  const dispatch = config.dispatch!
  reportCycleEntry({
    engine,
    dispatch,
    card,
    scriptsDir: location?.scriptsDir,
    runDir: `.pair/working/runs/${dispatch.runId}/${card}`,
  })

  const driveCycle =
    deps.driveCycle ??
    productionCycleDriver({ engine, engineDef, config, context, cwd, fs, location })
  const outcome = await driveCycle({
    runId: dispatch.runId,
    card,
    ...(dispatch.pr !== undefined && { pr: dispatch.pr }),
    ...(dispatch.rounds !== undefined && { rounds: dispatch.rounds }),
  })

  console.log(`  Cycle status: ${outcome.status} (${outcome.stagesRun} stage(s) dispatched)`)
  reportCycleReason(outcome.next)
  return outcome.status === 'ready-for-merge' ? 0 : 1
}

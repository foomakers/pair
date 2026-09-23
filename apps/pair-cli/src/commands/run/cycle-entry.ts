import type { FileSystemService } from '@pair/content-ops'
import chalk from 'chalk'
import type { RunCommandConfig, RunDispatchRequest } from './parser'
import { assertEngineAvailable, describeEngineResolution, resolveEngine } from './resolve-engine'
import { createExecutableProbe } from './path-probe'
import type { EngineDefinition } from './engines'
import {
  locateAgentDefinitions,
  locateCycleScripts,
  readCycleDefaults,
  CYCLE_WORKTREE_ROOT_DEFAULT,
  CYCLE_DISPATCH_CAP_DEFAULT,
  type CycleDefaults,
  type CycleScriptsLocation,
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
}

/**
 * AC7: `--filter` passed on THIS invocation is a loop-mode request, refused once the entry resolves
 * to the cycle coordinator (never at parse time, so US-217's own accepted --filter-alongside---card
 * stays a zero-regression control for a ROUTE decision; `--root` is refused with `--card` by the
 * parser). A DECLARED `## Max Parallelism` is not refused — see below.
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
  shown: ShownDefaults
}): void {
  console.log(chalk.bold('pair-cli run'))
  console.log(`  ${describeEngineResolution(input.engine)}`)
  console.log(`  Delivery cycle: runId=${input.dispatch.runId} card=${input.card}`)
  console.log(`  Scripts: ${input.scriptsDir ?? '(resolved by the cycle driver)'}`)
  console.log(`  Run dir: ${input.runDir}`)
  console.log(`  Worktree root: ${input.shown.worktreeRoot}`)
  console.log(
    `  Rounds bound: ${input.dispatch.rounds ?? '(policy default: maxFixRounds)'} — rounds narrows, never widens it`,
  )
  console.log(`  Dispatch cap: ${input.shown.dispatchCap}`)
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

interface DriverInput {
  readonly engine: ReturnType<typeof resolveEngine>
  readonly engineDef: EngineDefinition
  readonly location: CycleScriptsLocation
}

type ShownDefaults = Pick<CycleDefaults, 'worktreeRoot' | 'dispatchCap'>

/**
 * The shipped driver: the pieces T-2/T-3/T-4 built, composed with this run's own resolved context.
 *
 * Its refusals come first and in this order, all before the transparency block is printed and
 * before anything spawns: the autonomy/trust posture (AC7), then the installed scripts' defaults
 * (`cycle-state-unreadable`, r0-10) — the version and base it dispatches with are the scripts'.
 */
function productionCycleDriver(
  entry: CycleCoordinatorInput,
  driver: DriverInput,
): { driveCycle: CycleDriver; shown: ShownDefaults } {
  const { config, context, cwd, fs } = entry
  // Trust and autonomy are decided about the directory the STAGE will actually run in — the main
  // checkout — not about the driver's own cwd. They differ whenever the command is invoked from a
  // worktree, and the check then answers a question nobody asked: pi refuses a story worktree it
  // has never seen, while the process it would have spawned was going to run somewhere trusted.
  const autonomyArgs = resolveAutonomyFor(driver.engineDef, config, mainCheckout(cwd), fs).args
  const defaults = readCycleDefaults(driver.location)
  const driveCycle = createDefaultCycleDriver({
    engine: driver.engineDef,
    cwd,
    fs,
    location: driver.location,
    autonomyArgs,
    timeoutSeconds: config.iterationTimeoutSeconds,
    workflowVersion: defaults.workflowVersion,
    baseBranch: defaults.baseBranch,
    model: declaredEngineModel(context.config, driver.engineDef.id),
  })
  return { driveCycle, shown: defaults }
}

/**
 * An INJECTED driver runs nothing installed, so an unreadable script is no refusal there: the
 * transparency block shows the installed values when they can be read, else the parity-pinned
 * mirrors (presentation only — no stage is ever dispatched from them).
 */
function shownDefaults(location: CycleScriptsLocation): ShownDefaults {
  try {
    return readCycleDefaults(location)
  } catch {
    return { worktreeRoot: CYCLE_WORKTREE_ROOT_DEFAULT, dispatchCap: CYCLE_DISPATCH_CAP_DEFAULT }
  }
}

function driverFor(
  entry: CycleCoordinatorInput,
  deps: RunHandlerDependencies,
  driver: DriverInput,
): { driveCycle: CycleDriver; shown: ShownDefaults } {
  if (deps.driveCycle !== undefined) {
    return { driveCycle: deps.driveCycle, shown: shownDefaults(driver.location) }
  }
  return productionCycleDriver(entry, driver)
}

/**
 * Ready (DoR satisfied): this story's own delivery-cycle coordinator, never a prep skill and
 * never the loop-mode re-invocation machinery (AC9, AC12) — `driveCycle` reports a STATUS, and
 * nothing on this path ever merges.
 *
 * Two halves, so every refusal (`--filter`, engine unavailable, `skill-missing`, the autonomy
 * posture) and the transparency block happen BEFORE the caller takes the lock and audits `start`:
 * a run that was never going to spawn posts no `DISPATCH-RECORD:` claiming it started (r1-1).
 * The returned function is the drive itself.
 */
export function prepareCycleCoordinator(
  input: CycleCoordinatorInput,
  deps: RunHandlerDependencies,
): () => Promise<number> {
  const { config, context, fs, cwd, card } = input

  assertNoLoopModeConcerns(config)

  const engine = resolveEngine({ flag: config.engine, declared: declaredEngine(context.config) })
  const engineDef = resolveEngineFor(engine, context, cwd, fs)

  // AC11: HALTs skill-missing, naming pair-workflow-cycle, before anything is printed or spawned —
  // for BOTH fallback reasons (`unmapped` and `no-mapping-declared`) and the `--pr` entry alike.
  const location: CycleScriptsLocation = {
    ...locateCycleScripts(fs, context.config, cwd),
    agentsDir: locateAgentDefinitions(context.config, cwd),
  }
  const { driveCycle, shown } = driverFor(input, deps, { engine, engineDef, location })

  const dispatch = config.dispatch!
  reportCycleEntry({
    engine,
    dispatch,
    card,
    scriptsDir: location.scriptsDir,
    runDir: `.pair/working/runs/${dispatch.runId}/${card}`,
    shown,
  })

  return async () => {
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
}

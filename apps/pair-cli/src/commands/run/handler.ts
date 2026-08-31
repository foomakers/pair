import { resolve } from 'path'
import type { FileSystemService } from '@pair/content-ops'
import chalk from 'chalk'
import { loadConfigWithOverrides, readEngineDeclaration } from '#config'
import type { Config } from '#registry'
import type { RunCommandConfig } from './parser'
import { assertEngineAvailable, describeEngineResolution, resolveEngine } from './resolve-engine'
import { createExecutableProbe } from './path-probe'
import { ENGINE_IDS, isEngineId, type EngineDefinition, type EngineId } from './engines'
import {
  describeSkillResolution,
  resolveInvocation,
  type ResolvedInvocation,
} from './resolve-skill'
import { createSkillProbe } from './skill-probe'
import { createPerimeter, describePerimeter, type Perimeter } from './perimeter'
import { resolveAutonomy, type AutonomyDecision } from './autonomy'
import { createProjectTrustProbe } from './trust-probe'
import {
  describeMergePosture,
  describeParallelism,
  readAutomationPolicy,
  type AutomationPolicy,
} from './automation-policy'
import { buildPromptText, describeApprovalPosture, filterDeliveryFor } from './invocation'
import { loopExitCode, runLoop, type IterationContext, type LoopOutcome } from './loop'
import { spawnIteration } from './spawn'
import type { IterationResult } from './stream-reader'
import { decideDispatch, describeDispatch, lockedSkip, type DispatchDecision } from './dispatch'
import type { SkillProbe } from './resolve-skill'
import { acquireCardLock, type LockAcquirer } from './card-lock'
import {
  appendAuditLine,
  auditRecordFor,
  dispatchRecordLine,
  renderAuditLine,
  resolveAuditPath,
  type AuditAppender,
  type AuditEvent,
} from './dispatch-audit'
import { resolveWorkingPathOverride } from '#registry'

/** Injected so the loop can be driven in tests without spawning an engine. */
export type IterationRunner = (input: {
  engine: EngineDefinition
  promptText: string
  cwd: string
  autonomyArgs: readonly string[]
  timeoutSeconds: number
}) => Promise<IterationResult>

export interface RunHandlerDependencies {
  runIteration?: IterationRunner
  /** The per-card concurrency guard. Injected so a test never touches a real working area. */
  acquireLock?: LockAcquirer
  /** The audit writer. Injected for the same reason — the trail is a real file, by design. */
  appendAudit?: AuditAppender
}

/**
 * The engine the project's own `pair.config.json` declares, if any.
 *
 * A malformed block THROWS rather than degrading to the default: an operator whose typo was
 * silently ignored would have no way to tell a working configuration from a broken one.
 */
function declaredEngine(config: Config): EngineId | undefined {
  const outcome = readEngineDeclaration(config, ENGINE_IDS)
  if (outcome.errors.length > 0) {
    throw new Error(`pair.config.json is invalid:\n  - ${outcome.errors.join('\n  - ')}`)
  }
  return isEngineId(outcome.engine) ? outcome.engine : undefined
}

interface ResolvedRun {
  engine: ReturnType<typeof resolveEngine>
  invocation: ResolvedInvocation
  perimeter: Perimeter
  policy: AutomationPolicy
  autonomy: AutonomyDecision
  /** Present only on a tag-driven run (US-217), and then always a `route` — a skip returns earlier. */
  dispatch?: DispatchDecision
}

/**
 * The policy, and the routing decision it implies for a `--card` run (US-217).
 *
 * Resolved FIRST and on its own, because a dispatch that routes nothing must cost nothing: a card
 * that is ineligible, unmapped, or covered by no declaration at all is reported and the run exits,
 * without resolving an invocation or a perimeter for work that is not going to happen.
 */
interface RunContext {
  config: Config
  probe: SkillProbe
  policy: AutomationPolicy
  dispatch?: DispatchDecision
  /** `<cwd>/<working_path>` — where the lock lives. */
  workingArea: string
  /** `<cwd>/<working_path>/<Audit Location>` — where every dispatch record is appended. */
  auditPath: string
}

function resolveContext(config: RunCommandConfig, fs: FileSystemService, cwd: string): RunContext {
  const loaded = loadConfigWithOverrides(fs, { projectRoot: cwd })
  // One probe per RUN, not per iteration: the installed skill set does not change mid-run.
  const probe = createSkillProbe(fs, loaded.config, cwd)
  const policy = readAutomationPolicy(fs, cwd)
  const dispatch =
    config.dispatch &&
    decideDispatch({
      card: config.dispatch.card,
      tags: config.dispatch.tags,
      eligibility: policy.eligibility,
      mapping: policy.workflows,
      isInstalled: probe,
    })

  const workingPath = resolveWorkingPathOverride(loaded.config)

  return {
    config: loaded.config,
    probe,
    policy,
    ...(dispatch && { dispatch }),
    workingArea: resolve(cwd, workingPath),
    auditPath: resolveAuditPath(cwd, workingPath, policy.auditLocation),
  }
}

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
  const engine = resolveEngine({ flag: config.engine, declared: declaredEngine(context.config) })
  // On a routed run the WORKFLOW is the invocation: the card's tag chose it through the adoption
  // mapping, which is the whole point of tag-driven automation — the cascade never gets a say, and
  // `--skill`/`--prompt` were refused at parse time so there is nothing to arbitrate here.
  const invocation: ResolvedInvocation =
    context.dispatch?.kind === 'route'
      ? { kind: 'skill', name: context.dispatch.workflow, source: 'mapping' }
      : resolveInvocation(config.invocation, context.probe)
  const perimeter = createPerimeter({
    root: scopeRoot(config, context.dispatch),
    filter: config.scope.filter,
    eligibility: policy.eligibility,
    cwd,
    cwdDeclared: config.cwd !== undefined,
    requestedCap: config.maxIterations,
    policyCap: policy.maxIterations,
    invocationKind: invocation.kind,
    // Whether `--filter` can be HONOURED, and by whom, depends on the skill the cascade resolved,
    // so the check has to happen after skill resolution and before any spawn (round 1, finding 1).
    filterDelivery: filterDeliveryFor(invocation),
  })
  const autonomy = resolveAutonomy({
    engine: engine.engine,
    autonomous: config.autonomous,
    approveProjectTrust: config.approveProjectTrust,
    cwd,
    isProjectTrusted: createProjectTrustProbe(fs),
  })

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
  console.log(chalk.bold('pair run'))
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
 * Handles `pair run` — the execution adapter (US-451).
 *
 * Composes resolution → refusals → the re-invocation loop. The process logic stays in the skill:
 * this handler decides HOW to invoke, never WHAT to work on (BR1), and never merges (AC10).
 */
export async function handleRunCommand(
  config: RunCommandConfig,
  fs: FileSystemService,
  deps: RunHandlerDependencies = {},
): Promise<number> {
  // ABSOLUTE, always: the perimeter's directory is printed as the run's containment boundary and
  // probed against the engine's trust store, and `--cwd .` is neither legible as a boundary nor
  // comparable against an absolute trust-store key.
  const cwd = resolve(config.cwd ?? fs.currentWorkingDirectory())
  const context = resolveContext(config, fs, cwd)

  // Nothing to run on this card: report the decision and stop. This is a clean exit, never an
  // error — automation is opt-in per card (D21), so "no workflow applies here" is the shipped
  // answer for every card a team has not explicitly tagged.
  if (context.dispatch?.kind === 'skip') {
    reportSkippedDispatch(context)
    if (!config.dryRun) recordSkip(context, deps, context.dispatch)
    return 0
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

/** One routed card and everything already resolved about it — one subject, not four arguments. */
interface DispatchedCard {
  readonly resolved: ResolvedRun
  readonly decision: DispatchDecision
  readonly context: RunContext
  readonly config: RunCommandConfig
}

/**
 * A routed card: locked, audited, driven, released — in that order, and the release is unconditional.
 *
 * The lock is taken AFTER every refusal has passed and BEFORE anything spawns, so a run that was
 * never going to start never parks a card, and a run that does start cannot be joined by the next
 * trigger in the burst.
 */
async function driveDispatchedCard(
  card: DispatchedCard,
  deps: RunHandlerDependencies,
): Promise<number> {
  const { resolved, decision, context, config } = card
  const acquisition = (deps.acquireLock ?? acquireCardLock)({
    workingArea: context.workingArea,
    card: decision.card,
  })
  if (acquisition.kind === 'held') {
    // The holder's own path and age, as the acquirer reported them — never re-derived here, so the
    // message names the directory this run actually probed.
    const skipped = lockedSkip(decision.card, acquisition)
    console.log(`  ${describeDispatch(skipped)}`)
    recordSkip(context, deps, skipped)
    return 0
  }

  // Whether the `start` record actually reached the trail — the fact that separates "this run
  // crashed" from "this run never began", which are the same `catch` and NOT the same report.
  let started = false
  try {
    record(context, deps, decision, { event: 'start' })
    started = true
    const outcome = await driveRun(resolved, config, deps)
    record(context, deps, decision, {
      event: 'end',
      outcome: outcome === 0 ? 'completed' : 'failed',
    })
    return outcome
  } catch (error) {
    // Every start gets an end, including this one. Without it the trail stops at `event=start` and
    // the operator reading it the next morning cannot tell a crashed run from one still in flight —
    // and the lock, released just below, offers no second signal either.
    recordCrash(context, deps, decision, { crash: error, started })
    throw error
  } finally {
    acquisition.lock.release()
  }
}

/** The re-invocation loop itself — identical whether the run was dispatched or invoked directly. */
async function driveRun(
  resolved: ResolvedRun,
  config: RunCommandConfig,
  deps: RunHandlerDependencies,
): Promise<number> {
  const outcome = await runLoop({
    maxIterations: resolved.perimeter.maxIterations,
    runIteration: context => driveIteration(resolved, config, context, deps),
    onIteration: entry =>
      console.log(
        `  Iteration ${entry.iteration}: ${entry.result.outcome} — ${entry.result.detail}`,
      ),
  })

  reportOutcome(outcome)
  return loopExitCode(outcome)
}

/**
 * The `skip` record, with the failure message the frequent path is owed.
 *
 * A skip is the commonest outcome on a board — every unmapped label edit, every ineligible card,
 * every trigger in a burst — and it is the case this feature promises costs nothing. Fail-closed is
 * still the posture (`appendAuditLine` throws by design: an undecided-but-unrecorded decision is
 * not a mode), but the bare `EACCES: … open '…/audit.md'` it raised named neither the card nor the
 * fact that nothing was spawned, so the operator was handed a filesystem error with no way back to
 * the adoption setting that produced it. Worded like `recordCrash`'s `!started` branch, because it
 * is the same fact: the destination is unwritable, and nothing ran.
 */
function recordSkip(
  context: RunContext,
  deps: RunHandlerDependencies,
  decision: DispatchDecision,
): void {
  try {
    record(context, deps, decision, { event: 'skip' })
  } catch (failure) {
    throw new Error(
      `The skip on card ${decision.card} could not be audited (${describeError(failure)}): ` +
        `nothing was spawned, so fix the audit destination before the next trigger fires`,
      { cause: failure },
    )
  }
}

/**
 * The `end` record a crash owes the trail — written so that neither failure can hide the other.
 *
 * `appendAuditLine` THROWS by design ("an unaudited run is not a mode"), so a working area whose
 * `## Audit Location` cannot be written raises a SECOND error from inside the handler's own catch.
 * Fail-closed is the intended posture — the run still fails — but the engine error is the one an
 * operator needs, and letting a bare `EACCES` replace it sends them to debug the wrong machine. So
 * the audit failure supersedes the plain rethrow and carries the run error with it: both in the
 * message, the original kept as `cause`.
 *
 * `started` is what keeps that message TRUE. The `start` record is the first thing written inside
 * the try, so an unwritable destination makes the start write the very thing that throws — and
 * reporting that as a crash asserts two things that did not happen: that a run crashed (no engine
 * process was ever spawned) and that the trail stops at `event=start` (no start line was ever
 * written; the file may not exist at all). An operator sent to reconcile a run that never happened
 * against a trail with no record of it debugs the wrong thing twice, so the two cases get two
 * messages — and when the start never landed there is no point attempting the `end` at the same
 * unwritable destination.
 */
function recordCrash(
  context: RunContext,
  deps: RunHandlerDependencies,
  decision: DispatchDecision,
  { crash, started }: { crash: unknown; started: boolean },
): void {
  if (!started) {
    throw new Error(
      `The dispatch of card ${decision.card} could not be audited ` +
        `(${describeError(crash)}): nothing was spawned and the trail carries no record of this ` +
        `run at all, so fix the audit destination before the next trigger fires`,
      { cause: crash },
    )
  }
  try {
    record(context, deps, decision, { event: 'end', outcome: 'crashed' })
  } catch (auditFailure) {
    throw new Error(
      `The run on card ${decision.card} crashed (${describeError(crash)}) and its \`end\` audit ` +
        `record could not be written (${describeError(auditFailure)}): the trail now stops at ` +
        `\`event=start\`, so fix the audit destination before reading it as a run still in flight`,
      { cause: crash },
    )
  }
}

function describeError(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

/**
 * Writes one dispatch record: to the audit file, and — for a `start` — to stdout as the line the
 * trigger's host adapter posts on the card (AC3). Never to the tracker: this process holds no
 * credentials for one, and that is the property that keeps the core host-agnostic.
 */
function record(
  context: RunContext,
  deps: RunHandlerDependencies,
  decision: DispatchDecision,
  { event, outcome }: { event: AuditEvent; outcome?: string },
): void {
  const entry = auditRecordFor(decision, event, ...(outcome !== undefined ? [{ outcome }] : []))
  ;(deps.appendAudit ?? appendAuditLine)(context.auditPath, renderAuditLine(entry))
  if (event === 'start') console.log(dispatchRecordLine(entry))
}

/**
 * One iteration: a FRESH engine process, given the perimeter and the borrowed policy parameters.
 *
 * The continue-token's iteration counter is carried forward exactly as `pair-loop` documents
 * (`--iteration <n+1>`), so a resumed run does not restart its own counter — nothing else crosses
 * the boundary between iterations.
 */
function driveIteration(
  resolved: ResolvedRun,
  config: RunCommandConfig,
  context: IterationContext,
  deps: RunHandlerDependencies,
): Promise<IterationResult> {
  const promptText = buildPromptText(resolved.engine.engine, resolved.invocation, {
    ...(resolved.perimeter.root !== undefined && { root: resolved.perimeter.root }),
    // Passed ONLY when the invocation actually carries it. `buildSkillArgs` would drop it anyway,
    // but relying on that is how a flag ends up looking effective while changing nothing: the
    // decision belongs where the perimeter recorded it (round 1, finding 1).
    ...(resolved.perimeter.filterDelivery === 'argument' &&
      resolved.perimeter.filter !== undefined && { filter: resolved.perimeter.filter }),
    ...(resolved.policy.stopPredicate !== undefined && {
      predicate: resolved.policy.stopPredicate,
    }),
    iteration: context.iteration,
    // ONE operator intent, two axes (US-464): `--autonomous` already governs the ENGINE's
    // permission posture; it governs the composed SKILL's approval round too, because "nobody is
    // watching this run" is the same fact in both places. Passed only when the posture is
    // autonomous — an absent `$approval` IS the `interactive` default (ADR-021), so the
    // non-autonomous path renders exactly the bytes it rendered before this story (AC2).
    ...(resolved.autonomy.autonomous && { approval: 'auto' as const }),
  })

  const run = deps.runIteration ?? spawnIteration
  return run({
    engine: resolved.engine.engine,
    promptText,
    cwd: resolved.perimeter.cwd,
    autonomyArgs: resolved.autonomy.args,
    timeoutSeconds: config.iterationTimeoutSeconds,
  })
}

/** The whole output of a run that routes nothing: the decision, the policy it came from, warnings. */
function reportSkippedDispatch(context: RunContext): void {
  console.log(chalk.bold('pair run'))
  console.log(`  ${describeDispatch(context.dispatch!)}`)
  console.log(`  Policy: ${context.policy.source} · audit ${context.policy.auditLocation}`)
  for (const warning of context.policy.warnings) console.log(chalk.yellow(`  ! ${warning}`))
  console.log(chalk.dim('  Nothing was spawned.'))
}

function reportOutcome(outcome: LoopOutcome): void {
  const reason = {
    'skill-reported-complete':
      'the skill reported itself finished (predicate satisfied, or nothing eligible)',
    'iteration-cap': 'the perimeter iteration cap was reached',
    'iteration-failed': 'an iteration failed (fail-closed: no terminal event counts as failed)',
  }[outcome.stopReason]

  const line = `  Stopped after ${outcome.iterations} iteration(s): ${reason}`
  console.log(outcome.stopReason === 'iteration-failed' ? chalk.red(line) : chalk.green(line))
}

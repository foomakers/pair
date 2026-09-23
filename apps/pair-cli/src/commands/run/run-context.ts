import { resolve } from 'path'
import type { FileSystemService } from '@pair/content-ops'
import chalk from 'chalk'
import { loadConfigWithOverrides, readEngineDeclaration } from '#config'
import { resolveWorkingPathOverride, type Config } from '#registry'
import type { RunCommandConfig } from './parser'
import type { resolveEngine } from './resolve-engine'
import { ENGINE_IDS, isEngineId, type EngineDefinition, type EngineId } from './engines'
import type { ResolvedInvocation, SkillProbe } from './resolve-skill'
import { createSkillProbe } from './skill-probe'
import type { Perimeter } from './perimeter'
import { resolveAutonomy, type AutonomyDecision } from './autonomy'
import { createProjectTrustProbe } from './trust-probe'
import { readAutomationPolicy, type AutomationPolicy } from './automation-policy'
import type { CardReadiness } from './cycle-scripts'
import type { IterationResult } from './stream-reader'
import { decideDispatch, describeDispatch, lockedSkip, type DispatchDecision } from './dispatch'
import { acquireCardLock, type CardLock, type LockAcquirer } from './card-lock'
import {
  appendAuditLine,
  auditRecordFor,
  dispatchRecordLine,
  renderAuditLine,
  resolveAuditPath,
  type AuditAppender,
  type AuditEvent,
} from './dispatch-audit'

/**
 * What every `run` entry shares — the resolved context, the injected collaborators, the engine
 * declarations, the autonomy posture and the audit writer. Owned here so the three entries
 * (loop mode and tag dispatch in `handler.ts`, the DoR fallback in `card-entry.ts`, the delivery
 * cycle in `cycle-entry.ts`) read one definition of each, never a copy.
 */

/** Injected so the loop can be driven in tests without spawning an engine. */
export type IterationRunner = (input: {
  engine: EngineDefinition
  promptText: string
  cwd: string
  autonomyArgs: readonly string[]
  timeoutSeconds: number
}) => Promise<IterationResult>

/** AC14: the card's readiness — the shipped probe is `createCardReadinessProbe` (`cycle-wiring.ts`). */
export type CardReadinessProbe = (card: string) => Promise<CardReadiness>

export interface DriveCycleInput {
  readonly runId: string
  readonly card: string
  readonly pr?: number
  readonly rounds?: number | 'max'
}

export interface DriveCycleResult {
  readonly status: string
  readonly stagesRun: number
  readonly next?: unknown
}

/** US-487: drives one story's delivery cycle to its next terminal state (or the `--rounds` bound). */
export type CycleDriver = (input: DriveCycleInput) => Promise<DriveCycleResult>

export interface RunHandlerDependencies {
  runIteration?: IterationRunner
  /** The per-card concurrency guard. Injected so a test never touches a real working area. */
  acquireLock?: LockAcquirer
  /** The audit writer. Injected for the same reason — the trail is a real file, by design. */
  appendAudit?: AuditAppender
  /** AC14: a card's readiness (via the adopted State Mapping); out-of-scope throws CardOutOfScopeError. */
  cardReadiness?: CardReadinessProbe
  /** AC1: drives the delivery-cycle coordinator for a Ready card with no mapped route. */
  driveCycle?: CycleDriver
}

export interface ResolvedRun {
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
export interface RunContext {
  config: Config
  probe: SkillProbe
  policy: AutomationPolicy
  dispatch?: DispatchDecision
  /** `<cwd>/<working_path>` — where the lock lives. */
  workingArea: string
  /** `<cwd>/<working_path>/<Audit Location>` — where every dispatch record is appended. */
  auditPath: string
}

export type SkipDecision = Extract<DispatchDecision, { kind: 'skip' }>

export function resolveContext(
  config: RunCommandConfig,
  fs: FileSystemService,
  cwd: string,
): RunContext {
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

/** `engine.bin` from `pair.config.json`: where THIS machine keeps each executable, when it must say. */
export function declaredEngineBin(config: Config): Readonly<Record<string, string>> | undefined {
  return readEngineDeclaration(config, ENGINE_IDS).bin
}

/** `engine.model`: the model this project pins for each engine, run-wide (per-stage is #488's). */
export function declaredEngineModel(config: Config, id: string): string | undefined {
  return readEngineDeclaration(config, ENGINE_IDS).model?.[id]
}

/**
 * The engine the project's own `pair.config.json` declares, if any.
 *
 * A malformed block THROWS rather than degrading to the default: an operator whose typo was
 * silently ignored would have no way to tell a working configuration from a broken one.
 */
export function declaredEngine(config: Config): EngineId | undefined {
  const outcome = readEngineDeclaration(config, ENGINE_IDS)
  if (outcome.errors.length > 0) {
    throw new Error(`pair.config.json is invalid:\n  - ${outcome.errors.join('\n  - ')}`)
  }
  return isEngineId(outcome.engine) ? outcome.engine : undefined
}

/** The autonomy/trust posture for one resolved engine — shared by every entry that spawns one. */
export function resolveAutonomyFor(
  engine: EngineDefinition,
  config: RunCommandConfig,
  cwd: string,
  fs: FileSystemService,
): AutonomyDecision {
  return resolveAutonomy({
    engine,
    autonomous: config.autonomous,
    approveProjectTrust: config.approveProjectTrust,
    cwd,
    isProjectTrusted: createProjectTrustProbe(fs),
  })
}

/**
 * The whole output of a run that routes nothing: the decision, the policy it came from, warnings.
 * `refined` is the decision the handler reached on top of the dispatcher's (AC15's ineligible skip).
 */
export function reportSkippedDispatch(context: RunContext, refined?: DispatchDecision): void {
  console.log(chalk.bold('pair run'))
  console.log(`  ${describeDispatch(context.dispatch!)}`)
  if (refined !== undefined) console.log(`  ${describeDispatch(refined)}`)
  console.log(`  Policy: ${context.policy.source} · audit ${context.policy.auditLocation}`)
  for (const warning of context.policy.warnings) console.log(chalk.yellow(`  ! ${warning}`))
  console.log(chalk.dim('  Nothing was spawned.'))
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
export function recordSkip(
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
export function recordCrash(
  context: RunContext,
  deps: RunHandlerDependencies,
  decision: DispatchDecision,
  { crash, started, workflow }: { crash: unknown; started: boolean; workflow?: string },
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
    record(context, deps, decision, {
      event: 'end',
      outcome: 'crashed',
      ...(workflow !== undefined && { workflow }),
    })
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
export function record(
  context: RunContext,
  deps: RunHandlerDependencies,
  decision: DispatchDecision,
  { event, outcome, workflow }: { event: AuditEvent; outcome?: string; workflow?: string },
): void {
  const entry = auditRecordFor(decision, event, {
    ...(outcome !== undefined && { outcome }),
    ...(workflow !== undefined && { workflow }),
  })
  ;(deps.appendAudit ?? appendAuditLine)(context.auditPath, renderAuditLine(entry))
  if (event === 'start') console.log(dispatchRecordLine(entry))
}

/**
 * The per-card lock every consumer that SPAWNS on a card takes (KB automation policy: one run per
 * card, a burst never yields a second). Held ⇒ the `run-in-progress` skip is reported and audited
 * here and `undefined` is returned: the caller spawns nothing. The holder's own path and age, as
 * the acquirer reported them — never re-derived, so the message names the directory actually probed.
 */
export function takeCardLock(
  context: RunContext,
  deps: RunHandlerDependencies,
  card: string,
): CardLock | undefined {
  const acquisition = (deps.acquireLock ?? acquireCardLock)({
    workingArea: context.workingArea,
    card,
  })
  if (acquisition.kind === 'acquired') return acquisition.lock
  const skipped = lockedSkip(card, acquisition)
  console.log(`  ${describeDispatch(skipped)}`)
  recordSkip(context, deps, skipped)
  return undefined
}

/** One card a run spawns on: the decision that led there, and the workflow it actually runs. */
export interface LockedCardRun {
  readonly context: RunContext
  readonly decision: DispatchDecision
  /** Named when the decision does not say it (the DoR fallback, the `--pr` entry) — see `auditRecordFor`. */
  readonly workflow?: string
}

/**
 * Every route that SPAWNS on a card, mapped or fallback: locked, audited, driven, released — in that
 * order, and the release is unconditional (KB automation policy: one run per card; every dispatch
 * leaves start + end in `## Audit Location`, and the start is the `DISPATCH-RECORD:` line the host
 * adapter posts). One implementation, so a fallback route can never again spawn with less than the
 * mapped route leaves behind (r1-1).
 *
 * The lock is taken AFTER every refusal has passed and BEFORE anything spawns, so a run that was
 * never going to start never parks a card, and a run that does start cannot be joined by the next
 * trigger in the burst.
 */
export async function driveLockedCard(
  subject: LockedCardRun,
  deps: RunHandlerDependencies,
  run: () => Promise<number>,
): Promise<number> {
  const { context, decision, workflow } = subject
  const named = workflow !== undefined ? { workflow } : {}
  const lock = takeCardLock(context, deps, decision.card)
  if (lock === undefined) return 0

  // Whether the `start` record actually reached the trail — the fact that separates "this run
  // crashed" from "this run never began", which are the same `catch` and NOT the same report.
  let started = false
  try {
    record(context, deps, decision, { event: 'start', ...named })
    started = true
    const outcome = await run()
    record(context, deps, decision, {
      event: 'end',
      outcome: outcome === 0 ? 'completed' : 'failed',
      ...named,
    })
    return outcome
  } catch (error) {
    // Every start gets an end, including this one. Without it the trail stops at `event=start` and
    // the operator reading it the next morning cannot tell a crashed run from one still in flight —
    // and the lock, released just below, offers no second signal either.
    recordCrash(context, deps, decision, { crash: error, started, ...named })
    throw error
  } finally {
    lock.release()
  }
}

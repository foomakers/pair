import type { FileSystemService } from '@pair/content-ops'
import chalk from 'chalk'
import type { RunCommandConfig } from './parser'
import { describeEngineResolution, resolveEngine } from './resolve-engine'
import type { ResolvedInvocation } from './resolve-skill'
import { createPerimeter } from './perimeter'
import { isEligibilityOffWarning, POLICY_PATH, type AutomationPolicy } from './automation-policy'
import type { CardReadiness } from './cycle-scripts'
import { CardUnreadableError, createCardReadinessProbe } from './cycle-wiring'
import { CardOutOfScopeError } from './card-readiness'
import { filterDeliveryFor } from './invocation'
import type { DispatchSkipReason } from './dispatch'
import { driveRun } from './loop-driver'
import { prepareCycleCoordinator, resolveEngineFor } from './cycle-entry'
import {
  declaredEngine,
  driveLockedCard,
  recordSkip,
  reportSkippedDispatch,
  resolveAutonomyFor,
  type ResolvedRun,
  type RunContext,
  type RunHandlerDependencies,
  type SkipDecision,
} from './run-context'

/**
 * The DoR-gated fallback of `pair-cli run --card` (US-487 AC14/AC15): what a `skip` from the tag
 * dispatcher becomes when no mapping matched — the eligibility gate first, then the card's own
 * Definition-of-Ready macrostate decides between a preparation skill and the delivery cycle.
 */

/**
 * AC14's fallback engages only where the ELIGIBILITY gate does not stand in its way.
 *
 * `decideDispatch` answers `no-mapping-declared` FIRST — before `## Eligibility` is read at all
 * (`dispatch.ts`: the `mapping === undefined` branch returns above the eligibility branch). So a
 * project that declares `## Eligibility` but no `## Workflows` would otherwise reach this fallback
 * for EVERY card, including one the eligibility label exists to keep out: BR3's invariant — "an
 * ineligible card is skipped BEFORE its tags are looked at, so the one declaration that keeps
 * business-critical work out of an unattended pipeline is never evaluated after the decision it
 * exists to bound" — would hold for tag dispatch and quietly not hold here.
 *
 * So the label is consulted before falling back, in the one case the dispatcher never got to — and
 * it is consulted where it MEANS something: `## Eligibility` bounds the UNATTENDED pipeline, and
 * `--autonomous` is this command's own explicit opt-in to being one. A run without it confirms (or
 * fails loudly) at every write, so it is supervised by construction and the label does not apply;
 * demanding it there would force a maintainer to assert labels the card does not carry.
 *
 * - `unmapped` — eligibility was already checked and PASSED upstream (it is evaluated before
 *   routing), so nothing is re-checked here.
 * - `no-mapping-declared`, not `--autonomous` — a supervised invocation. Fall back.
 * - `no-mapping-declared` with `--autonomous` — unattended: no `## Eligibility` declared means the
 *   project never opted into automation at all and the run proceeds; declared means the card must
 *   carry the label, exactly as it would have for any mapped workflow.
 * - `--approve-ineligible` — the operator overrides that last case for THIS run. A policy binds a
 *   pipeline, never the person who wrote it: someone who knows why this card is the exception must
 *   be able to say so, and carry the responsibility. It is per-invocation by construction — nothing
 *   is written, so the next run on the same card is bounded again — and it is announced, never
 *   silent, so the override appears in the output an unattended run is audited by.
 *
 * `automation-off`, `ineligible` and `run-in-progress` never reach this function.
 */
export interface DorFallbackGate {
  readonly reason: DispatchSkipReason
  readonly policy: AutomationPolicy
  /** The labels the trigger observed. Absent and empty are the same evidence: "it saw none". */
  readonly tags?: readonly string[] | undefined
  readonly autonomous: boolean
  readonly approveIneligible?: boolean
}

export function isDorFallbackReason(gate: DorFallbackGate): boolean {
  if (gate.reason === 'unmapped') return true
  if (gate.reason !== 'no-mapping-declared') return false
  if (!gate.autonomous || gate.approveIneligible === true) return true
  return (
    gate.policy.eligibility === undefined || (gate.tags ?? []).includes(gate.policy.eligibility)
  )
}

/** True only when `--approve-ineligible` is what decided the outcome — see the announcement below. */
export function ineligibleOverrideApplied(gate: DorFallbackGate): boolean {
  if (gate.reason !== 'no-mapping-declared') return false
  if (!gate.autonomous || gate.approveIneligible !== true) return false
  return (
    gate.policy.eligibility !== undefined && !(gate.tags ?? []).includes(gate.policy.eligibility)
  )
}

/**
 * The decision an UNATTENDED run on a label-less card gets when no `## Workflows` is declared:
 * `ineligible`, exactly as `decideDispatch` answers it once a mapping exists (AC15 "skips it as
 * ineligible") — so the trail reads `reason=ineligible`, and the override is named in the detail.
 */
function ineligibleSkip(gate: DorFallbackGate, context: RunContext): SkipDecision {
  const card = context.dispatch!.card
  return {
    kind: 'skip',
    card,
    reason: 'ineligible',
    detail:
      `card carries no \`${gate.policy.eligibility}\` label (\`## Eligibility\`), so this ` +
      `unattended (--autonomous) run skips it before reading it — pass --approve-ineligible to ` +
      `override for this run only`,
  }
}

/** One `unmapped` / `no-mapping-declared` skip and everything already resolved for it — one subject. */
export interface DorFallbackInput {
  readonly config: RunCommandConfig
  readonly context: RunContext
  readonly fs: FileSystemService
  readonly cwd: string
  readonly decision: SkipDecision
}

/** A `skip` from the dispatcher: the DoR fallback where the gate allows it, else the skip itself. */
export async function handleSkipDecision(
  input: DorFallbackInput,
  deps: RunHandlerDependencies,
): Promise<number> {
  const { config, context, decision } = input
  const gate = gateFor(decision.reason, context, config)
  if (isDorFallbackReason(gate)) return await handleDorFallback(input, deps)
  // AC15: `no-mapping-declared` refused by the eligibility gate IS an ineligible skip — said and
  // audited as one, never as the dispatcher's "no mapping declared" alone.
  const skipped = gate.reason === 'no-mapping-declared' ? ineligibleSkip(gate, context) : undefined
  reportSkippedDispatch(context, skipped)
  if (!config.dryRun) recordSkip(context, deps, skipped ?? decision)
  return 0
}

/** One gate value, built from the run's own state — never five positional arguments at a call site. */
function gateFor(
  reason: DispatchSkipReason,
  context: RunContext,
  config: RunCommandConfig,
): DorFallbackGate {
  return {
    reason,
    policy: context.policy,
    tags: config.dispatch?.tags,
    autonomous: config.autonomous === true,
    approveIneligible: config.approveIneligible === true,
  }
}

/**
 * An override nobody can see in the output is not an override, it is a silent exception: whoever
 * reads an unattended run's trail afterwards could not tell one from an ordinary run. Printed only
 * when the flag actually decided the outcome, so it never becomes noise on runs it changed nothing.
 */
function announceIneligibleOverride(
  card: string,
  context: RunContext,
  config: RunCommandConfig,
): void {
  if (!ineligibleOverrideApplied(gateFor('no-mapping-declared', context, config))) return
  console.log(
    chalk.yellow(
      `  Eligibility OVERRIDDEN for this run: card ${card} does not carry ` +
        `\`${context.policy.eligibility}\` (\`## Eligibility\`), and --approve-ineligible was passed. ` +
        `This authorization is not persisted — the next run on this card is bounded again.`,
    ),
  )
}

/**
 * AC14 — the DoR-gated fallback: `unmapped`/`no-mapping-declared` no longer means "nothing runs"
 * unconditionally. What happens NEXT is decided by the card's OWN Definition-of-Ready macrostate —
 * never presence/absence of a mapping alone, and never consulted at all when a route already
 * matched (Assumption 2).
 */
async function handleDorFallback(
  input: DorFallbackInput,
  deps: RunHandlerDependencies,
): Promise<number> {
  const { config, context, decision } = input

  if (config.dryRun) {
    reportSkippedDispatch(context)
    announceIneligibleOverride(decision.card, context, config)
    return 0
  }

  reportFallbackEntry(context, decision)
  announceIneligibleOverride(decision.card, context, config)

  // AC2 (r0-2): a `--pr` entry is fix & review on a PR that already exists — the cycle's own
  // `{verify, first, r0}`. The card's preparation state is not a question it asks, so a prep skill
  // can never displace it: the readiness probe is not even consulted.
  const entry = entryOf(input)
  if (config.dispatch?.pr !== undefined) return await enterCycleAtReview(entry, deps)

  const readiness = await readReadiness(input, deps)
  if (readiness === undefined) {
    recordSkip(context, deps, decision)
    return 0
  }
  const prep = PREP_ROUTES[readiness]
  if (prep === undefined) {
    console.log(
      `  Fallback: card ${decision.card} is Ready (Definition of Ready met) — entering the delivery cycle`,
    )
    return await enterCycle(entry, deps)
  }
  if (config.autonomous === true) return skipUnattendedPreparation(input, deps, prep)
  const drive = preparePrepSkill(
    { config, context, fs: input.fs, cwd: input.cwd, card: decision.card, ...prep },
    deps,
  )
  return await underCardLock(entry, deps, prep.skill, drive)
}

/** The card a `--card` entry spawns on, with everything resolved for it — one subject. */
export interface CardEntryInput {
  readonly config: RunCommandConfig
  readonly context: RunContext
  readonly fs: FileSystemService
  readonly cwd: string
  readonly card: string
}

function entryOf(input: DorFallbackInput): CardEntryInput {
  const { config, context, fs, cwd, decision } = input
  return { config, context, fs, cwd, card: decision.card }
}

/** Refusals and the transparency block first, then the lock + audit around the drive alone. */
async function enterCycle(entry: CardEntryInput, deps: RunHandlerDependencies): Promise<number> {
  const drive = prepareCycleCoordinator(entry, deps)
  return await underCardLock(entry, deps, CYCLE_WORKFLOW, drive)
}

/**
 * AC2 (r0-2): `--pr` is fix & review on a PR that already exists — the cycle's own
 * `{verify, first, r0}`, whatever else the card says. Its preparation state is not a question it
 * asks (the readiness probe is not consulted), and a mapped tag does not displace it either: the
 * tag names a workflow for a card to START, and a card with a PR has started. Never a silent drop.
 */
export async function enterCycleAtReview(
  entry: CardEntryInput,
  deps: RunHandlerDependencies,
): Promise<number> {
  const pr = entry.config.dispatch?.pr
  console.log(
    `  --pr ${pr}: fix & review on an existing PR enters the delivery cycle at its review stage; ` +
      `the card's preparation state and any mapped tag are not consulted (AC2)`,
  )
  if (entry.config.dryRun) {
    console.log(chalk.dim('  Dry run: nothing was spawned.'))
    return 0
  }
  return await enterCycle(entry, deps)
}

/** The workflow a cycle entry runs, as the audit trail and the `DISPATCH-RECORD:` name it. */
const CYCLE_WORKFLOW = 'pair-workflow-cycle'

/**
 * r0-4 / r1-1 / r1-2: every fallback route SPAWNS on the card, so it runs exactly as a mapped route
 * does (`driveLockedCard`): the per-card lock, the start + end audit records with the
 * `DISPATCH-RECORD:` line, and SIGTERM/SIGINT trapped. Held ⇒ `run-in-progress`, nothing spawned.
 */
async function underCardLock(
  entry: CardEntryInput,
  deps: RunHandlerDependencies,
  workflow: string,
  run: () => Promise<number>,
): Promise<number> {
  const decision = entry.context.dispatch!
  return await driveLockedCard({ context: entry.context, decision, workflow }, deps, run)
}

/**
 * AC14 as amended 2026-09-23 (r0-5): unattended runs never start a preparation skill. Refinement
 * and planning open with a human interview, and the KB automation policy never runs them without
 * one — so under `--autonomous` the route is SAID and skipped cleanly, and nothing is spawned.
 */
function skipUnattendedPreparation(
  input: DorFallbackInput,
  deps: RunHandlerDependencies,
  prep: { skill: string; label: string },
): number {
  console.log(
    `  Skipped: card ${input.decision.card} is ${prep.label} — needs a human: refinement/planning ` +
      `is interactive (${prep.skill} opens with a human interview), so an unattended ` +
      `(--autonomous) run never starts it. Run it without --autonomous, or refine the card first.`,
  )
  console.log(chalk.dim('  Nothing was spawned.'))
  recordSkip(input.context, deps, input.decision)
  return 0
}

/**
 * The card's readiness — or `undefined` for a clean skip, said and typed, never swallowed:
 *
 * - AC14-G1: no mapping is declared AND the tracker cannot be asked (`gh` absent or
 *   unauthenticated). That is the shipped default meeting a runner with no tracker access (the
 *   github-dispatch-adapter smoke), where the answer was always "nothing runs". Where a mapping IS
 *   declared (`unmapped`) the project opted into dispatch, so an unreadable card still fails closed.
 * - r0-1: the card's board state is out of scope — unmapped (canonical-states.md Reading rule 4:
 *   ignored, "the skill proceeds without error"), undeclared, or `Done`.
 *
 * A malformed `## State Mapping` is neither: it HALTs, as the schema requires.
 */
async function readReadiness(
  input: DorFallbackInput,
  deps: RunHandlerDependencies,
): Promise<CardReadiness | undefined> {
  const { decision, fs, cwd } = input
  try {
    return await (deps.cardReadiness ?? createCardReadinessProbe(fs, cwd))(decision.card)
  } catch (error) {
    if (!isCleanSkip(error, decision)) throw error
    console.log(`  Skipped: ${(error as Error).message}`)
    console.log(chalk.dim('  Nothing was spawned.'))
    return undefined
  }
}

function isCleanSkip(error: unknown, decision: SkipDecision): boolean {
  if (error instanceof CardOutOfScopeError) return true
  return decision.reason === 'no-mapping-declared' && error instanceof CardUnreadableError
}

/**
 * AC14: a no-mapping outcome that falls back is a ROUTE decision, not a skip — so it is reported
 * as the dispatch reason plus the fallback it takes, never "Nothing was spawned.", and it is never
 * audited `event=skip` (the one exception is the unreadable clean skip above, which IS one).
 */
function reportFallbackEntry(context: RunContext, decision: SkipDecision): void {
  console.log(chalk.bold('pair run'))
  const headline = decision.reason === 'no-mapping-declared' ? 'no mapping declared' : 'unmapped'
  console.log(
    `  Dispatch: card ${decision.card} · ${headline} — ${decision.detail} ⇒ falling back to the ` +
      `card's own Definition of Ready (AC14)`,
  )
  console.log(`  Policy: ${context.policy.source} · audit ${context.policy.auditLocation}`)
  for (const warning of fallbackWarnings(context, decision.card)) {
    console.log(chalk.yellow(`  ! ${warning}`))
  }
}

/**
 * r1-4: "automation is off … nothing is selected unattended" is true of SELECTION (loop mode, a
 * tag route) and false of what this entry does next — an explicit `--card` names its card, so with
 * no `## Eligibility` declared there is no label to require and the run proceeds (AC14; the
 * exception the KB states under `## Eligibility`). Said as what happens, never as its opposite.
 */
function fallbackWarnings(context: RunContext, card: string): string[] {
  const warnings = context.policy.warnings.filter(warning => !isEligibilityOffWarning(warning))
  if (warnings.length === context.policy.warnings.length) return warnings
  return [
    `no \`## Eligibility\` is declared (${POLICY_PATH}): nothing is SELECTED from the board ` +
      `unattended, but an explicit --card names its own card, so this run proceeds on card ${card} ` +
      `with no label to require (AC14). Declare \`## Eligibility\` to bound --autonomous card runs.`,
    ...warnings,
  ]
}

/** Draft / Ready-without-breakdown ⇒ the preparation skill that moves the card toward the cycle. */
const PREP_ROUTES: Partial<Record<CardReadiness, { skill: string; label: string }>> = {
  draft: { skill: 'pair-process-refine-story', label: 'Draft (Definition of Ready not met)' },
  'refined-no-breakdown': {
    skill: 'pair-process-plan-tasks',
    label: 'Ready without a task breakdown yet',
  },
}

interface PrepSkillInput {
  readonly config: RunCommandConfig
  readonly context: RunContext
  readonly fs: FileSystemService
  readonly cwd: string
  readonly card: string
  readonly skill: string
  readonly label: string
}

/**
 * Draft / Ready-without-breakdown (supervised): routed to the matching preparation skill. Resolved
 * and printed here — the engine refusal included — so nothing is audited for a run that cannot
 * start; the returned function is the drive the caller runs under the lock (r1-1).
 */
function preparePrepSkill(
  input: PrepSkillInput,
  deps: RunHandlerDependencies,
): () => Promise<number> {
  const { config, context, fs, cwd, card, skill, label } = input
  const engine = resolveEngine({ flag: config.engine, declared: declaredEngine(context.config) })
  const engineDef = resolveEngineFor(engine, context, cwd, fs)

  // Not `resolveInvocation`'s cascade (no `--skill`/`--prompt` was passed) and not a `## Workflows`
  // mapping either — the DoR grammar picked this skill, so `source: 'mapping'` is reused rather
  // than adding a THIRD source label to `resolve-skill.ts` (out of this story's own fixScope); its
  // own `describeSkillResolution` line is never printed for this path, the line below is.
  const invocation: ResolvedInvocation = { kind: 'skill', name: skill, source: 'mapping' }
  const perimeter = createPerimeter({
    root: card,
    filter: undefined,
    eligibility: context.policy.eligibility,
    cwd,
    cwdDeclared: config.cwd !== undefined,
    requestedCap: config.maxIterations,
    policyCap: context.policy.maxIterations,
    invocationKind: invocation.kind,
    filterDelivery: filterDeliveryFor(invocation),
  })
  const autonomy = resolveAutonomyFor(engine.engine, config, cwd, fs)
  const resolved: ResolvedRun = {
    engine: { ...engine, engine: engineDef },
    invocation,
    perimeter,
    policy: context.policy,
    autonomy,
  }

  console.log(chalk.bold('pair-cli run'))
  console.log(`  ${describeEngineResolution(resolved.engine)}`)
  console.log(`  Fallback: card ${card} is ${label} — routing to ${skill}`)

  return () => driveRun(resolved, config, deps)
}

import type { FileSystemService } from '@pair/content-ops'
import chalk from 'chalk'
import type { RunCommandConfig } from './parser'
import { describeEngineResolution, resolveEngine } from './resolve-engine'
import type { ResolvedInvocation } from './resolve-skill'
import { createPerimeter } from './perimeter'
import type { AutomationPolicy } from './automation-policy'
import type { CardReadiness } from './cycle-scripts'
import { CardUnreadableError, ghCardReadiness } from './cycle-wiring'
import { filterDeliveryFor } from './invocation'
import type { DispatchSkipReason } from './dispatch'
import { driveRun } from './loop-driver'
import { enterCycleCoordinator, resolveEngineFor } from './cycle-entry'
import {
  declaredEngine,
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
  const { config, context, fs, cwd, decision } = input

  if (config.dryRun) {
    reportSkippedDispatch(context)
    announceIneligibleOverride(decision.card, context, config)
    return 0
  }

  reportFallbackEntry(context, decision)
  announceIneligibleOverride(decision.card, context, config)

  const readiness = await readReadiness(decision, deps)
  if (readiness === undefined) {
    recordSkip(context, deps, decision)
    return 0
  }

  const prep = PREP_ROUTES[readiness]
  if (prep !== undefined) {
    return runPrepSkill({ config, context, fs, cwd, card: decision.card, ...prep }, deps)
  }
  console.log(
    `  Fallback: card ${decision.card} is Ready (Definition of Ready met) — entering the delivery cycle`,
  )
  return enterCycleCoordinator(
    { config, context, fs, cwd, card: decision.card, dorReason: decision.reason },
    deps,
  )
}

/**
 * The card's macrostate — or `undefined` for the ONE clean-skip class (AC14-G1): no mapping is
 * declared AND the tracker cannot be asked (`gh` absent or unauthenticated). That is the shipped
 * default meeting a runner with no tracker access (the github-dispatch-adapter smoke), where the
 * answer was always "nothing runs"; it is said, typed, never swallowed. Where a mapping IS
 * declared (`unmapped`) the project opted into dispatch, so an unreadable card still fails closed.
 */
async function readReadiness(
  decision: SkipDecision,
  deps: RunHandlerDependencies,
): Promise<CardReadiness | undefined> {
  try {
    return await (deps.cardReadiness ?? ghCardReadiness)(decision.card)
  } catch (error) {
    if (decision.reason !== 'no-mapping-declared' || !(error instanceof CardUnreadableError)) {
      throw error
    }
    console.log(`  Skipped: ${error.message}`)
    console.log(chalk.dim('  Nothing was spawned.'))
    return undefined
  }
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
  for (const warning of context.policy.warnings) console.log(chalk.yellow(`  ! ${warning}`))
}

/** Draft / Refined-without-breakdown ⇒ the preparation skill that moves the card toward Ready. */
const PREP_ROUTES: Partial<Record<CardReadiness, { skill: string; label: string }>> = {
  draft: { skill: 'pair-process-refine-story', label: 'Draft' },
  'refined-no-breakdown': {
    skill: 'pair-process-plan-tasks',
    label: 'Refined (no task breakdown yet)',
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

/** Draft / Refined-without-breakdown: routed to the matching preparation skill, ONE engine dispatch. */
async function runPrepSkill(input: PrepSkillInput, deps: RunHandlerDependencies): Promise<number> {
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
  console.log(
    `  Fallback: card ${card} is ${label} (Definition of Ready not met) — routing to ${skill}`,
  )

  return driveRun(resolved, config, deps)
}

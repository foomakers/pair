import { policyHalt, POLICY_PATH } from './policy-sections'
import { dispatchScopeParameterFor, DISPATCHABLE_WORKFLOWS } from './invocation'
import type { SkillProbe } from './resolve-skill'
import type { WorkflowMapping, WorkflowRoute } from './workflow-mapping'

/**
 * The tag-driven dispatcher (US-217 T-2) — the agnostic routing core.
 *
 * It answers ONE question: given a card, the labels a trigger observed on it, and the project's
 * policy, does anything run — and if so, which workflow? It is a pure function of those inputs plus
 * an installed-skill probe: it holds no host credentials, performs no network call, and knows
 * nothing about the tracker the trigger fired on. Adding a code host is a new thin adapter feeding
 * this function, never a change here.
 *
 * **Zero merit logic (D18).** Tags are compared with plain string equality — no tier ordering, no
 * family parsing, no classification criterion anywhere. The routing decision is entirely: does this
 * card carry the eligibility label, and which declared tag does it carry.
 *
 * **The order is normative** (`automation-policy.md` § Workflows): mapping → eligibility → routing.
 * An ineligible card is skipped BEFORE its tags are looked at, so the one declaration that keeps
 * business-critical work out of an unattended pipeline is never evaluated after the decision it
 * exists to bound.
 */

export interface DispatchRequest {
  /** The card the trigger fired on. */
  readonly card: string
  /** The labels the trigger observed on it — DATA from the host, never instructions. */
  readonly tags: readonly string[]
  /** `## Eligibility`'s label. Absent ⇒ automation is off (never widened to all cards). */
  readonly eligibility?: string | undefined
  /** `## Workflows`'s mapping. Absent ⇒ no workflow is available (opt-in, not an error). */
  readonly mapping?: WorkflowMapping | undefined
  /** Whether a workflow (a skill name) is installed — the same probe `--skill` resolution uses. */
  readonly isInstalled: SkillProbe
}

/** Why a card was not dispatched. Every value is REPORTED, never silently swallowed. */
export type DispatchSkipReason =
  | 'no-mapping-declared'
  | 'automation-off'
  | 'ineligible'
  | 'unmapped'
  | 'run-in-progress'

export type DispatchDecision =
  | {
      readonly kind: 'route'
      readonly card: string
      readonly tag: string
      readonly workflow: string
    }
  | {
      readonly kind: 'skip'
      readonly card: string
      readonly reason: DispatchSkipReason
      readonly detail: string
    }

/**
 * Decides what runs on one card. Throws (HALTs) rather than guessing — see the two routing-time
 * rules the schema states, both of which need something the policy file alone cannot answer.
 */
export function decideDispatch(request: DispatchRequest): DispatchDecision {
  const { card, mapping, eligibility } = request

  if (mapping === undefined) {
    return skip(card, 'no-mapping-declared', `${POLICY_PATH} declares no \`## Workflows\` section`)
  }
  // Fail-fast, before any per-card decision: a mapping naming a workflow nobody installed — or one
  // this driver cannot hand the card to — is broken configuration, and finding out only on the card
  // that happens to carry that tag would make the failure depend on which trigger fired first.
  assertWorkflowsInstalled(mapping, request.isInstalled)
  assertWorkflowsScopable(mapping)

  if (eligibility === undefined) {
    return skip(
      card,
      'automation-off',
      `${POLICY_PATH} declares no \`## Eligibility\`: the eligible set is empty, so nothing is dispatched`,
    )
  }
  // Eligibility BEFORE routing (BR3), and by the same plain string equality `pair-next --filter`
  // applies — an untagged card never matches, which is the fail-safe, not an accident.
  if (!request.tags.includes(eligibility)) {
    return skip(
      card,
      'ineligible',
      `card carries no \`${eligibility}\` label (\`## Eligibility\`), so it is skipped before routing`,
    )
  }

  const matched = mapping.routes.filter(route => request.tags.includes(route.tag))
  if (matched.length === 0) {
    return skip(
      card,
      'unmapped',
      'card carries no mapped tag — untagged is never automated, and there is no default workflow',
    )
  }

  const route = matched.length === 1 ? matched[0]! : resolveByPrecedence(card, matched, mapping)
  return { kind: 'route', card, tag: route.tag, workflow: route.workflow }
}

/** The one line an operator (or an audit reader) gets for every decision. */
export function describeDispatch(decision: DispatchDecision): string {
  if (decision.kind === 'route') {
    return `Dispatch: card ${decision.card} · tag ${decision.tag} ⇒ workflow ${decision.workflow}`
  }
  const headline =
    decision.reason === 'no-mapping-declared'
      ? 'no mapping declared'
      : `skipped (${decision.reason})`
  return `Dispatch: card ${decision.card} · ${headline} — ${decision.detail}`
}

function skip(card: string, reason: DispatchSkipReason, detail: string): DispatchDecision {
  return { kind: 'skip', card, reason, detail }
}

/** Who holds a card's lock, as the filesystem reported it — the path, and since when if known. */
export interface LockHolder {
  readonly path: string
  readonly since?: string | undefined
}

/**
 * The decision a trigger burst gets: another run holds this card, so this one does nothing.
 *
 * Skipped, never queued — the card is still tagged, so the next trigger picks it up on its own. It
 * is a `skip` like any other so it reports and audits through the same path; the reason it is built
 * here rather than in `decideDispatch` is that holding a lock is a fact about the filesystem, and
 * this module deliberately touches none.
 *
 * **The holder's AGE is part of the message**, because a lock has no timeout and nothing reaps it: a
 * run killed by SIGKILL, an OOM kill or a host job timeout leaves the directory behind, and every
 * later trigger on that card then skips, exits `0` and looks exactly like a healthy burst. An age
 * longer than a run can plausibly take is the one signal that separates the two, so it is printed
 * next to the directory an operator removes to clear it.
 */
export function lockedSkip(
  card: string,
  holder: LockHolder,
  now: Date = new Date(),
): DispatchDecision {
  const age = describeHold(holder.since, now)
  return skip(
    card,
    'run-in-progress',
    `another run already holds this card (${holder.path}${age}) — skipped, never queued behind it; ` +
      `if no run is alive, that lock is stale: delete the directory to clear it`,
  )
}

function describeHold(since: string | undefined, now: Date): string {
  if (since === undefined) return ''
  const held = now.getTime() - new Date(since).getTime()
  return Number.isNaN(held) ? '' : `, held ${humanDuration(held)} since ${since}`
}

function humanDuration(milliseconds: number): string {
  const minutes = Math.max(0, Math.floor(milliseconds / 60_000))
  if (minutes < 1) return 'under a minute'
  if (minutes < 60) return `${minutes}m`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h ${minutes % 60}m`
  return `${Math.floor(hours / 24)}d ${hours % 24}h`
}

/**
 * A declared workflow that is not installed ⇒ HALT with an adoption-fix message.
 *
 * Never a fall back to another workflow: running something other than the declared workflow is the
 * outcome no operator can debug, and on an unattended run nobody is watching to notice.
 */
function assertWorkflowsInstalled(mapping: WorkflowMapping, isInstalled: SkillProbe): void {
  for (const route of mapping.routes) {
    if (isInstalled(route.workflow)) continue
    policyHalt(
      `\`## Workflows\` maps \`${route.tag}\` to \`${route.workflow}\`, which is not installed — ` +
        `install it with \`pair install\`, or map the tag to a workflow this project has`,
    )
  }
}

/**
 * A declared workflow the driver cannot SCOPE to the card ⇒ HALT with an adoption-fix message.
 *
 * A dispatched card is the whole subject of the run (ADR-024), and it reaches the workflow as an
 * argument — under the name that workflow's own `## Arguments` table declares. For a workflow the
 * driver holds no declaration for there is no safe default: an unrecognised argument is not
 * rejected by an agent, it is ignored, and a skill that picks its own subject when unscoped then
 * runs on a card nobody tagged while the audit trail and the on-issue record both name the card
 * that WAS tagged. Refusing the mapping is the only outcome that keeps the trail true.
 *
 * Not the same check as `assertWorkflowsInstalled`: a workflow can be installed and still be one
 * this driver cannot address a card to.
 *
 * The mappable set is `DISPATCHABLE_WORKFLOWS` — the KB catalog as data — and NOT every skill the
 * driver happens to know an argument name for: `pair-next` is scopable by hand and still refused
 * here (it only prints a recommendation), and so is `pair-process-refine-story`, whose scoping
 * argument this driver knows exactly and whose steps require a human decision no unattended run has.
 *
 * So the refusal has TWO causes and TWO messages, because a maintainer fixes them differently: an
 * uncatalogued workflow is a mapping to change, an unscopable one is a catalog entry the driver has
 * no row for. Telling the first that "this driver has no declaration of how that workflow names the
 * card" would send them to add an argument row that already exists. The remedy list is rendered FROM
 * the set in both arms, so the message and the check cannot drift apart.
 */
function assertWorkflowsScopable(mapping: WorkflowMapping): void {
  for (const route of mapping.routes) {
    if (dispatchScopeParameterFor(route.workflow) !== undefined) continue
    const catalogued = [...DISPATCHABLE_WORKFLOWS].map(workflow => `\`${workflow}\``).join(', ')
    const remedy = `Map the tag to one of the workflows the catalog names (${catalogued})`
    if (!DISPATCHABLE_WORKFLOWS.has(route.workflow)) {
      policyHalt(
        `\`## Workflows\` maps \`${route.tag}\` to \`${route.workflow}\`, which the KB catalog ` +
          `does not name as mappable — a skill outside it is refused even when installed and even ` +
          `when this driver knows how to scope a card to it, because a dispatch takes the card's ` +
          `lock and posts a record on it for work nobody is watching. ${remedy}, or widen the ` +
          `catalog deliberately (see \`automation-policy.md\` § "The workflows a mapping can name")`,
      )
    }
    policyHalt(
      `\`## Workflows\` maps \`${route.tag}\` to \`${route.workflow}\`, and this driver has no ` +
        `declaration of how that workflow names the card it works on — so the dispatched card ` +
        `could not be passed to it, and the run would pick its own subject. ${remedy}, or give ` +
        `\`${route.workflow}\` its own scoping argument`,
    )
  }
}

/**
 * More than one mapped tag on one card: the declared `Precedence:` order decides, or nothing does.
 *
 * Absent precedence — or a precedence naming none of the tags this card carries — is a question for
 * a maintainer, not a tie for a consumer to break: two declared workflows both apply, and choosing
 * one silently would make the run's behaviour depend on line order in an adoption file.
 */
function resolveByPrecedence(
  card: string,
  matched: readonly WorkflowRoute[],
  mapping: WorkflowMapping,
): WorkflowRoute {
  const tags = matched.map(route => route.tag)
  const winner = mapping.precedence?.find(tag => tags.includes(tag))
  if (winner === undefined) {
    policyHalt(
      `card ${card} carries ${tags.length} mapped tags (${tags.join(', ')}), and \`## Workflows\` ` +
        `declares no \`Precedence:\` order covering them — declare one, rather than letting the ` +
        `dispatcher choose a workflow for you`,
    )
  }
  return matched.find(route => route.tag === winner)!
}

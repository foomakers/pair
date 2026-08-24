/**
 * The work perimeter (US-451 T-5) — the containment boundary of an unattended run.
 *
 * MANDATORY (AC5), and construct-or-fail: the object cannot exist in an invalid state, so no
 * code path can spawn an engine with a perimeter that was never declared. It is one of the two
 * ceilings that hold this story's cost at orange, and the primary mitigation for the
 * "autonomous loop with no confirmations" risk.
 *
 * It can only be NARROWED by flags, never WIDENED by configuration: the effective iteration
 * cap is `min(--max-iterations, policy max-iterations)`.
 */

export interface Perimeter {
  /** Scope root, passed on with `pair-next`'s own parameter name (ADR-017 §1). */
  readonly root?: string
  /** Label filter — from `--filter`, or borrowed from the policy's `## Eligibility`. */
  readonly filter?: string
  /** The directory every iteration runs in. */
  readonly cwd: string
  /** Hard cap on iterations — the backstop for a stop condition that never becomes true. */
  readonly maxIterations: number
  /** Which bound produced `maxIterations`; printed, so a surprising cap is visible. */
  readonly capSource: '--max-iterations' | 'tech/automation.md'
  /** Where `filter` came from, when there is one. */
  readonly filterSource?: '--filter' | 'tech/automation.md'
  /**
   * HOW the label reaches the selection, when there is one:
   *
   * - `argument` — the driver passes it to the skill (`pair-next --filter <tag>`);
   * - `read-by-skill` — the skill reads `## Eligibility` from `tech/automation.md` itself
   *   (`pair-loop`), so the driver passes nothing and only REPORTS the same value.
   *
   * Printed, because the two are not interchangeable: reporting a label as passed when the skill
   * is the one applying it is what let a flag look effective while changing nothing (round 1,
   * finding 1). A `--filter` that could only be reported is refused at construction instead.
   */
  readonly filterDelivery?: 'argument' | 'read-by-skill'
}

export interface PerimeterInput {
  root?: string | undefined
  /** `--filter`, if passed. */
  filter?: string | undefined
  /** The policy's `## Eligibility` label, if the adoption file declares one. */
  eligibility?: string | undefined
  /** The resolved working directory. */
  cwd: string
  /** Whether the working directory was DECLARED (`--cwd`) rather than inherited. */
  cwdDeclared: boolean
  /** `--max-iterations`, if passed. */
  requestedCap?: number | undefined
  /** The policy's `max-iterations` (its own fail-safe default applies upstream). */
  policyCap: number
  /** A verbatim prompt cannot carry scope parameters — see `createPerimeter`. */
  invocationKind: 'skill' | 'prompt'
  /**
   * Whether the resolved invocation declares `--filter` (`skillAcceptsFilter` in `invocation.ts`).
   * False ⇒ an explicit `--filter` is REFUSED rather than reported (round 1, finding 1).
   */
  skillAcceptsFilter: boolean
}

const MISSING_SCOPE_MESSAGE =
  'No work perimeter declared: pass --root <id> and/or --filter <tag>, or declare ' +
  '`## Eligibility` in .pair/adoption/tech/automation.md. A headless run refuses to start ' +
  'without a scope — every iteration must be bounded to cards you named.'

const MISSING_PROMPT_SCOPE_MESSAGE =
  'No work perimeter declared: a --prompt run cannot carry scope parameters, so it must ' +
  'declare its boundary explicitly with --cwd <dir>.'

const UNHONOURABLE_FILTER_MESSAGE =
  '--filter cannot be honoured by this invocation: the resolved skill declares no --filter ' +
  '(pair-loop reads `## Eligibility` from .pair/adoption/tech/automation.md itself, and a ' +
  '--prompt run carries no parameters at all). Accepting it here would print a label the run ' +
  'does not apply. Either drop --filter and let the policy decide, pass `--skill pair-next ' +
  '--filter <tag>` to scope the selector directly, or change `## Eligibility` in the policy file.'

/**
 * Builds the perimeter or FAILS — before any engine is spawned.
 *
 * Skill mode needs a scope: `--root`, `--filter`, or the policy's eligibility label (borrowed,
 * never invented). Prompt mode cannot be given scope parameters — the text is passed verbatim —
 * so its declared boundary is an explicit `--cwd`, which is what the iterations are confined to.
 *
 * An explicit `--filter` the invocation cannot carry is REFUSED here, not silently reported: a
 * perimeter line naming a label the run does not apply is worse than no line at all (round 1,
 * finding 1).
 */
export function createPerimeter(input: PerimeterInput): Perimeter {
  const filter = resolveFilter(input)
  assertScopeDeclared(input, filter.value)

  const cap = resolveCap(input)

  return {
    ...(input.root !== undefined && { root: input.root }),
    ...(filter.value !== undefined && { filter: filter.value }),
    ...(filter.source && { filterSource: filter.source }),
    ...(filter.delivery && { filterDelivery: filter.delivery }),
    cwd: input.cwd,
    maxIterations: cap.maxIterations,
    capSource: cap.source,
  }
}

/**
 * `--filter` first, then the policy's eligibility label — borrowed verbatim, never rewritten.
 *
 * The flag and the policy label are NOT symmetric: the flag asks the driver to pass a parameter,
 * so it can only be accepted by an invocation that declares one; the policy label is read by the
 * skill itself, so it is reported rather than passed and is honoured either way.
 */
function resolveFilter(input: PerimeterInput): {
  value?: string
  source?: Perimeter['filterSource']
  delivery?: Perimeter['filterDelivery']
} {
  if (input.filter !== undefined) {
    if (!input.skillAcceptsFilter) throw new Error(UNHONOURABLE_FILTER_MESSAGE)
    return { value: input.filter, source: '--filter', delivery: 'argument' }
  }
  if (input.eligibility !== undefined) {
    return {
      value: input.eligibility,
      source: 'tech/automation.md',
      delivery: input.skillAcceptsFilter ? 'argument' : 'read-by-skill',
    }
  }
  return {}
}

function assertScopeDeclared(input: PerimeterInput, filter: string | undefined): void {
  if (input.invocationKind === 'prompt') {
    if (!input.cwdDeclared) throw new Error(MISSING_PROMPT_SCOPE_MESSAGE)
    return
  }
  if (input.root === undefined && filter === undefined) throw new Error(MISSING_SCOPE_MESSAGE)
}

/**
 * A flag may only NARROW the policy's cap; configuration can never widen what a flag asked
 * for either. `min` is both halves of that rule in one expression.
 */
function resolveCap(input: PerimeterInput): {
  maxIterations: number
  source: Perimeter['capSource']
} {
  if (!Number.isInteger(input.policyCap) || input.policyCap <= 0) {
    throw new Error(
      `Invalid iteration cap from the automation policy: ${String(input.policyCap)} (must be a positive integer)`,
    )
  }
  return input.requestedCap !== undefined && input.requestedCap < input.policyCap
    ? { maxIterations: input.requestedCap, source: '--max-iterations' }
    : { maxIterations: input.policyCap, source: 'tech/automation.md' }
}

/**
 * The perimeter line printed before execution — what the run may touch, and nothing else.
 *
 * The label's wording follows its DELIVERY: `filter … passed to the skill` when the driver hands
 * it over, `eligibility … applied by the skill itself` when the skill reads the policy. One word
 * of difference, but it is the difference between a parameter and a report (round 1, finding 1).
 */
export function describePerimeter(perimeter: Perimeter): string {
  const label =
    perimeter.filterDelivery === 'read-by-skill'
      ? `eligibility ${perimeter.filter} (from ${perimeter.filterSource}, applied by the skill itself)`
      : `filter ${perimeter.filter} (from ${perimeter.filterSource}, passed to the skill)`
  const scope = [
    perimeter.root !== undefined ? `root ${perimeter.root}` : undefined,
    perimeter.filter !== undefined ? label : undefined,
  ]
    .filter(Boolean)
    .join(', ')
  return (
    `Perimeter: ${scope || 'cwd only (--prompt run)'} · cwd ${perimeter.cwd} · ` +
    `max ${perimeter.maxIterations} iteration(s) (from ${perimeter.capSource})`
  )
}

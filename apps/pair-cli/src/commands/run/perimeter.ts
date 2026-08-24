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
}

const MISSING_SCOPE_MESSAGE =
  'No work perimeter declared: pass --root <id> and/or --filter <tag>, or declare ' +
  '`## Eligibility` in .pair/adoption/tech/automation.md. A headless run refuses to start ' +
  'without a scope — every iteration must be bounded to cards you named.'

const MISSING_PROMPT_SCOPE_MESSAGE =
  'No work perimeter declared: a --prompt run cannot carry scope parameters, so it must ' +
  'declare its boundary explicitly with --cwd <dir>.'

/**
 * Builds the perimeter or FAILS — before any engine is spawned.
 *
 * Skill mode needs a scope: `--root`, `--filter`, or the policy's eligibility label (borrowed,
 * never invented). Prompt mode cannot be given scope parameters — the text is passed verbatim —
 * so its declared boundary is an explicit `--cwd`, which is what the iterations are confined to.
 */
export function createPerimeter(input: PerimeterInput): Perimeter {
  const filterSource = input.filter
    ? ('--filter' as const)
    : input.eligibility
      ? ('tech/automation.md' as const)
      : undefined
  const filter = input.filter ?? input.eligibility

  if (input.invocationKind === 'skill' && input.root === undefined && filter === undefined) {
    throw new Error(MISSING_SCOPE_MESSAGE)
  }
  if (input.invocationKind === 'prompt' && !input.cwdDeclared) {
    throw new Error(MISSING_PROMPT_SCOPE_MESSAGE)
  }

  if (!Number.isInteger(input.policyCap) || input.policyCap <= 0) {
    throw new Error(
      `Invalid iteration cap from the automation policy: ${String(input.policyCap)} (must be a positive integer)`,
    )
  }

  // A flag may only NARROW the policy's cap; configuration can never widen what a flag asked
  // for either. `min` is both halves of that rule in one expression.
  const [maxIterations, capSource]: [number, Perimeter['capSource']] =
    input.requestedCap !== undefined && input.requestedCap < input.policyCap
      ? [input.requestedCap, '--max-iterations']
      : [input.policyCap, 'tech/automation.md']

  return {
    ...(input.root !== undefined && { root: input.root }),
    ...(filter !== undefined && { filter }),
    ...(filterSource && { filterSource }),
    cwd: input.cwd,
    maxIterations,
    capSource,
  }
}

/** The perimeter line printed before execution — what the run may touch, and nothing else. */
export function describePerimeter(perimeter: Perimeter): string {
  const scope = [
    perimeter.root !== undefined ? `root ${perimeter.root}` : undefined,
    perimeter.filter !== undefined
      ? `filter ${perimeter.filter} (from ${perimeter.filterSource})`
      : undefined,
  ]
    .filter(Boolean)
    .join(', ')
  return (
    `Perimeter: ${scope || 'cwd only (--prompt run)'} · cwd ${perimeter.cwd} · ` +
    `max ${perimeter.maxIterations} iteration(s) (from ${perimeter.capSource})`
  )
}

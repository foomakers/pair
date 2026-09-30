/**
 * The `## Stop Predicate` evaluator — a pure port of `.claude/workflows/pair-loop.js`
 * `evaluateStopPredicate` (US-522 T-1). In loop mode the driver is the loop, so it evaluates the
 * predicate itself with exactly `pair-loop`'s rule; `stop-predicate.test.ts` holds the two in step.
 *
 * Snapshot fields are DATA: they are compared, never interpreted or rendered.
 */

export interface StopPredicate {
  readonly selector: string
  readonly condition: string
}

export interface PredicateCard {
  readonly id: string
  readonly tags: readonly string[]
  /** Canonical macrostate (through the state mapping). */
  readonly macrostate: string
}

export interface StopEvaluation {
  readonly satisfied: boolean
  readonly reason: string | null
}

const TAG_PREFIX = 'has-tag:'

/**
 * Splits an already-validated `<selector> ⇒ <condition>` line (see `automation-policy.ts`). No
 * validation here: `undefined` for a line without the arrow (e.g. `max-iterations: n`).
 */
export function parseStopCondition(line: string): StopPredicate | undefined {
  const match = /^(.+?)\s*⇒\s*(.+)$/.exec(line)
  return match ? { selector: match[1]!, condition: match[2]! } : undefined
}

/**
 * `snapshot` is already scoped to the predicate's selector by the caller's board query. Empty ⇒
 * satisfied (an unsatisfiable selector matches nothing); otherwise every card must hold every
 * `and`-joined condition (`has-tag:<label>` or an exact macrostate).
 */
export function evaluateStopPredicate(
  predicate: StopPredicate | undefined | null,
  snapshot: readonly PredicateCard[],
): StopEvaluation {
  if (!predicate) return { satisfied: false, reason: 'no predicate declared' }
  if (snapshot.length === 0) {
    return { satisfied: true, reason: 'unsatisfiable selector — matches nothing' }
  }
  const conditions = predicate.condition.split(/\s+and\s+/i).map(c => c.trim())
  const holds = (card: PredicateCard): boolean =>
    conditions.every(c =>
      c.startsWith(TAG_PREFIX) ? card.tags.includes(c.slice(TAG_PREFIX.length)) : card.macrostate === c,
    )
  return { satisfied: snapshot.every(holds), reason: null }
}

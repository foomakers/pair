import type { IterationResult } from './stream-reader'

/**
 * The re-invocation loop (US-451 T-9) — the story's core insight made executable.
 *
 * ADR-017 §4 already prescribes that a portable tool runs EXACTLY ONE eligible card per
 * invocation, writes its audit/checkpoint, then stops and reports a continue-token for the
 * caller to re-invoke. **This loop is that caller.** Nothing about fan-out is re-invented:
 * every iteration is a fresh process and therefore a fresh session, which is why context
 * isolation (ADR-017 §3) holds more strongly here than inside a subagent.
 *
 * The loop is PURE over its collaborators — it spawns nothing itself, so every stop reason is
 * testable without an engine. It carries NO state between iterations except the continue-token
 * the skill itself printed: no cached plan, no card list, no eligibility of its own (BR1, AC4).
 * And it constructs no merge: merge is the human gate, in every mode (AC10, BR3).
 */

export type StopReason =
  /** The skill reported itself finished (predicate satisfied, or nothing eligible): no token. */
  | 'skill-reported-complete'
  /** The perimeter's cap was reached — the backstop for a condition that never becomes true. */
  | 'iteration-cap'
  /** An iteration failed (including fail-closed: no terminal event). The loop stops, never retries. */
  | 'iteration-failed'

export interface IterationRecord {
  readonly iteration: number
  readonly result: IterationResult
}

export interface LoopOutcome {
  readonly iterations: number
  readonly stopReason: StopReason
  readonly records: readonly IterationRecord[]
}

export interface IterationContext {
  /** 1-based; forwarded to the skill as its own `--iteration` when it declares one. */
  readonly iteration: number
  /** The previous iteration's continue-token, when there was one. */
  readonly continueToken?: string
}

export interface LoopInput {
  /** The perimeter's hard cap (already narrowed against the policy). */
  readonly maxIterations: number
  /** Runs ONE iteration in a FRESH process and returns what its stream said. */
  readonly runIteration: (context: IterationContext) => Promise<IterationResult>
  /** Reporting hook — the loop prints nothing itself. */
  readonly onIteration?: (record: IterationRecord) => void
}

/**
 * Drives iterations until the skill reports itself finished, an iteration fails, or the cap is
 * reached.
 *
 * Conditions are re-evaluated by the SKILL, in a fresh process, on every iteration — so a card
 * that becomes eligible mid-run (labelled `risk:green` after the loop started) is picked up on
 * the next one. `pair-next` stays a selector, never a cached plan (ADR-017 §1, AC4).
 */
export async function runLoop(input: LoopInput): Promise<LoopOutcome> {
  const records: IterationRecord[] = []
  let continueToken: string | undefined

  for (let iteration = 1; iteration <= input.maxIterations; iteration += 1) {
    const result = await input.runIteration({
      iteration,
      ...(continueToken !== undefined && { continueToken }),
    })
    const record = { iteration, result }
    records.push(record)
    input.onIteration?.(record)

    if (result.outcome === 'failed') {
      return { iterations: iteration, stopReason: 'iteration-failed', records }
    }
    if (result.continueToken === undefined) {
      return { iterations: iteration, stopReason: 'skill-reported-complete', records }
    }
    continueToken = result.continueToken
  }

  return { iterations: records.length, stopReason: 'iteration-cap', records }
}

/** The exit code the loop's outcome maps to: only a failed iteration is a failure. */
export function loopExitCode(outcome: LoopOutcome): number {
  return outcome.stopReason === 'iteration-failed' ? 1 : 0
}

import type { CardOutcome } from './parallel'
import type { RootCandidate } from './root-plan'
import { evaluateStopPredicate, type PredicateCard, type StopPredicate } from './stop-predicate'
import type { Wait } from './wait'

/**
 * The watch loop core (US-522 T-6) — PURE sequencing over injected collaborators: no engine, no
 * timer, no filesystem. One iteration = one fresh selection + the existing plan/pool (`runBatch`);
 * this module owns only what wraps them: exclusion sets, the workable check, the stop checks
 * (predicate, cap), wait-or-exit and the exit code. It has no merit logic (D18): selection is
 * `pair-next`'s, the stop rule `pair-loop`'s, merge each card's own.
 */

export type StopReason =
  | 'stop predicate satisfied'
  | 'iteration cap'
  | 'nothing workable'
  | 'interrupted'
  | 'selection failed'

export type LockState =
  | { readonly kind: 'free' }
  | { readonly kind: 'held'; readonly path: string; readonly since?: string }

export interface LoopSelection {
  readonly candidates: readonly RootCandidate[]
  /** The Stop Predicate's board snapshot, from the same selection process. */
  readonly snapshot?: readonly PredicateCard[]
}

export interface SkippedCard {
  readonly id: string
  readonly reason: 'escalated' | 'locked' | 'already driven this run'
  readonly detail: string
}

export interface BatchResult {
  readonly outcomes: readonly CardOutcome[]
}

export interface IterationRecord {
  readonly iteration: number
  readonly cap: number
  readonly selected: number
  readonly skipped: readonly SkippedCard[]
  readonly outcomes: readonly CardOutcome[]
  readonly next:
    | { readonly kind: 'continue' }
    | { readonly kind: 'waiting'; readonly ms: number }
    | { readonly kind: 'stop'; readonly reason: StopReason }
}

export interface LoopResult {
  readonly reason: StopReason
  readonly iterations: number
  readonly exitCode: number
  /** The ids this run drove, in order. */
  readonly driven: readonly string[]
  /** The failure of a selection that stopped the loop. */
  readonly selectionError?: string
}

export interface WatchLoopConfig {
  readonly watch: boolean
  readonly intervalMs: number
  /** Effective iteration cap (>= 1). */
  readonly cap: number
  readonly predicate?: StopPredicate | undefined
}

export interface WatchLoopDeps {
  select(): Promise<LoopSelection>
  probeLock(card: RootCandidate): LockState
  runBatch(cards: readonly RootCandidate[]): Promise<BatchResult>
  wait: Wait
  isInterrupted(): boolean
  onIteration(record: IterationRecord): void
}

const INTERRUPTED_EXIT = 130
const FAILED = new Set(['failed', 'crashed'])

function describeLock(lock: Extract<LockState, { kind: 'held' }>): string {
  return `locked (${lock.path}${lock.since !== undefined ? `, since ${lock.since}` : ''})`
}

function classify(
  candidates: readonly RootCandidate[],
  driven: ReadonlySet<string>,
  probeLock: WatchLoopDeps['probeLock'],
): { workable: RootCandidate[]; skipped: SkippedCard[] } {
  const workable: RootCandidate[] = []
  const skipped: SkippedCard[] = []
  for (const card of candidates) {
    if (driven.has(card.id)) {
      skipped.push({ id: card.id, reason: 'already driven this run', detail: 'already driven this run' })
    } else if (card.escalated === true) {
      skipped.push({ id: card.id, reason: 'escalated', detail: 'escalated' })
    } else {
      const lock = probeLock(card)
      if (lock.kind === 'held') {
        skipped.push({ id: card.id, reason: 'locked', detail: describeLock(lock) })
      } else workable.push(card)
    }
  }
  return { workable, skipped }
}

function errorText(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

export async function runWatchLoop(
  config: WatchLoopConfig,
  deps: WatchLoopDeps,
): Promise<LoopResult> {
  const driven: string[] = []
  const drivenSet = new Set<string>()
  let anyFailed = false
  let iteration = 0

  const result = (reason: StopReason, extra: Partial<LoopResult> = {}): LoopResult => ({
    reason,
    iterations: iteration,
    exitCode: reason === 'interrupted' ? INTERRUPTED_EXIT : anyFailed || reason === 'selection failed' ? 1 : 0,
    driven,
    ...extra,
  })

  for (;;) {
    // No selection (and so no spawn) starts after a signal.
    if (deps.isInterrupted()) return result('interrupted')
    iteration++

    let selection: LoopSelection
    try {
      selection = await deps.select()
    } catch (error) {
      return result('selection failed', { selectionError: errorText(error) })
    }

    // The predicate is checked at every iteration boundary, the first included.
    const stop = config.predicate && evaluateStopPredicate(config.predicate, selection.snapshot ?? [])
    const { workable, skipped } = classify(selection.candidates, drivenSet, deps.probeLock)
    const satisfied = stop?.satisfied === true
    const outcomes = satisfied || workable.length === 0 ? [] : (await deps.runBatch(workable)).outcomes
    for (const outcome of outcomes) {
      if (!drivenSet.has(outcome.id)) {
        drivenSet.add(outcome.id)
        driven.push(outcome.id)
      }
      if (FAILED.has(outcome.outcome)) anyFailed = true
    }

    const record = { iteration, cap: config.cap, selected: selection.candidates.length, skipped, outcomes }
    const interrupted = deps.isInterrupted() || outcomes.some(o => o.outcome === 'interrupted')
    const idle = outcomes.length === 0
    const reason: StopReason | undefined = interrupted
      ? 'interrupted'
      : satisfied
        ? 'stop predicate satisfied'
        : iteration >= config.cap
          ? 'iteration cap'
          : idle && !config.watch
            ? 'nothing workable'
            : undefined
    if (reason !== undefined) {
      deps.onIteration({ ...record, next: { kind: 'stop', reason } })
      return result(reason)
    }
    // Work ran ⇒ the next iteration starts at once; idle (and --watch) ⇒ wait the interval.
    if (!idle) {
      deps.onIteration({ ...record, next: { kind: 'continue' } })
      continue
    }
    deps.onIteration({ ...record, next: { kind: 'waiting', ms: config.intervalMs } })
    if ((await deps.wait(config.intervalMs)) === 'interrupted') return result('interrupted')
  }
}

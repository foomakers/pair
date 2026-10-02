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
      skipped.push({
        id: card.id,
        reason: 'already driven this run',
        detail: 'already driven this run',
      })
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

interface LoopState {
  readonly driven: string[]
  readonly drivenSet: Set<string>
  anyFailed: boolean
  iteration: number
}

function absorb(state: LoopState, outcomes: readonly CardOutcome[]): void {
  for (const outcome of outcomes) {
    if (!state.drivenSet.has(outcome.id)) {
      state.drivenSet.add(outcome.id)
      state.driven.push(outcome.id)
    }
    if (FAILED.has(outcome.outcome)) state.anyFailed = true
  }
}

function stopReason(
  config: WatchLoopConfig,
  facts: { iteration: number; interrupted: boolean; satisfied: boolean; idle: boolean },
): StopReason | undefined {
  if (facts.interrupted) return 'interrupted'
  if (facts.satisfied) return 'stop predicate satisfied'
  if (facts.iteration >= config.cap) return 'iteration cap'
  return facts.idle && !config.watch ? 'nothing workable' : undefined
}

/** `satisfied`, or a selection that cannot be trusted: a predicate without its snapshot is never "empty". */
function predicateVerdict(
  config: WatchLoopConfig,
  selection: LoopSelection,
): { satisfied: boolean } | { unusable: string } {
  if (config.predicate === undefined) return { satisfied: false }
  if (selection.snapshot === undefined) {
    return { unusable: 'the selection carried no board snapshot for the Stop Predicate' }
  }
  return { satisfied: evaluateStopPredicate(config.predicate, selection.snapshot).satisfied }
}

type Step = { readonly done: LoopResult } | { readonly idle: boolean }

/** One iteration: select, check the predicate, classify, run, decide. */
async function iterate(
  config: WatchLoopConfig,
  deps: WatchLoopDeps,
  state: LoopState,
  finish: (reason: StopReason, extra?: Partial<LoopResult>) => LoopResult,
): Promise<Step> {
  let selection: LoopSelection
  try {
    selection = await deps.select()
  } catch (error) {
    return { done: finish('selection failed', { selectionError: errorText(error) }) }
  }
  // The predicate is checked at every iteration boundary, the first included.
  const verdict = predicateVerdict(config, selection)
  if ('unusable' in verdict) {
    return { done: finish('selection failed', { selectionError: verdict.unusable }) }
  }
  const { workable, skipped } = classify(selection.candidates, state.drivenSet, deps.probeLock)
  const outcomes =
    verdict.satisfied || workable.length === 0 ? [] : (await deps.runBatch(workable)).outcomes
  absorb(state, outcomes)

  const record = {
    iteration: state.iteration,
    cap: config.cap,
    selected: selection.candidates.length,
    skipped,
    outcomes,
  }
  const idle = outcomes.length === 0
  const reason = stopReason(config, {
    iteration: state.iteration,
    interrupted: deps.isInterrupted() || outcomes.some(o => o.outcome === 'interrupted'),
    satisfied: verdict.satisfied,
    idle,
  })
  if (reason !== undefined) {
    deps.onIteration({ ...record, next: { kind: 'stop', reason } })
    return { done: finish(reason) }
  }
  // Work ran => the next iteration starts at once; idle (and --watch) => wait the interval.
  deps.onIteration({
    ...record,
    next: idle ? { kind: 'waiting', ms: config.intervalMs } : { kind: 'continue' },
  })
  return { idle }
}

export async function runWatchLoop(
  config: WatchLoopConfig,
  deps: WatchLoopDeps,
): Promise<LoopResult> {
  const state: LoopState = { driven: [], drivenSet: new Set(), anyFailed: false, iteration: 0 }
  const finish = (reason: StopReason, extra: Partial<LoopResult> = {}): LoopResult => ({
    reason,
    iterations: state.iteration,
    exitCode:
      reason === 'interrupted'
        ? INTERRUPTED_EXIT
        : state.anyFailed || reason === 'selection failed'
          ? 1
          : 0,
    driven: state.driven,
    ...extra,
  })

  for (;;) {
    // No selection (and so no spawn) starts after a signal.
    if (deps.isInterrupted()) return finish('interrupted')
    state.iteration++
    const step = await iterate(config, deps, state, finish)
    if ('done' in step) return step.done
    if (step.idle && (await deps.wait(config.intervalMs)) === 'interrupted') {
      return finish('interrupted')
    }
  }
}

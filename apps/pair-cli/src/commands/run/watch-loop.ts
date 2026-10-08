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
  /** A throw outside selection (lock probe, plan, pool): raised by the driver, never returned here. */
  | 'iteration failed'

export type LockState =
  | { readonly kind: 'free' }
  /** The holder is dead on this host: workable — the card's own acquire reclaims it. */
  | { readonly kind: 'stale'; readonly path: string; readonly pid: number }
  | {
      readonly kind: 'held'
      readonly path: string
      readonly since?: string
      readonly pid?: number
      readonly alive?: boolean
    }

export interface LoopSelection {
  readonly candidates: readonly RootCandidate[]
  /** The Stop Predicate's board snapshot, from the same selection process. */
  readonly snapshot?: readonly PredicateCard[]
}

export interface SkippedCard {
  readonly id: string
  readonly reason:
    | 'escalated'
    | 'locked'
    | 'already driven this run'
    | 'retry budget exhausted'
    | 'durable failure'
  readonly detail: string
}

export interface RetriedCard {
  readonly id: string
  readonly attempt: number
  readonly budget: number
}

/** A failed card is retried this many times per run before it is excluded (KB default). */
export const DEFAULT_RETRY_BUDGET = 1

export interface BatchResult {
  readonly outcomes: readonly CardOutcome[]
}

export interface IterationRecord {
  readonly iteration: number
  readonly cap: number
  readonly selected: number
  readonly skipped: readonly SkippedCard[]
  /** Failed cards picked again this iteration: which retry of how many. */
  readonly retried?: readonly RetriedCard[]
  /** Cards whose stale lock (dead holder pid) the iteration will reclaim: which pid. */
  /** What the stop predicate was judged on (cards matched, how many hold), when one is declared. */
  readonly predicateEvidence?: string
  readonly reclaimed?: readonly { readonly id: string; readonly pid: number }[]
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
  /** Retries per failed card (default `DEFAULT_RETRY_BUDGET`). */
  readonly retryBudget?: number
}

export interface WatchLoopDeps {
  select(): Promise<LoopSelection>
  probeLock(card: RootCandidate): LockState
  runBatch(cards: readonly RootCandidate[]): Promise<BatchResult>
  wait: Wait
  isInterrupted(): boolean
  onIteration(record: IterationRecord): void
}

const NEEDS_REVIEW = 'needs-review'
const INTERRUPTED_EXIT = 130
const FAILED = new Set(['failed', 'crashed'])

function describeLock(lock: Extract<LockState, { kind: 'held' }>): string {
  const holder =
    lock.pid !== undefined
      ? `locked by pid ${lock.pid}${lock.alive === true ? ' (alive)' : ''}`
      : 'locked'
  return `${holder} (${lock.path}${lock.since !== undefined ? `, since ${lock.since}` : ''})`
}

/**
 * Only TERMINAL outcomes (completed: merged, parked, target reached) stay excluded for the run. A card
 * that failed is retried up to the budget, then excluded; a card reported escalated is skipped until its
 * escalation is cleared, and the failure that WAS the escalation does not burn the retry budget.
 */
function notePid(into: { id: string; pid: number }[], id: string, lock: LockState): void {
  if (lock.kind === 'stale') into.push({ id, pid: lock.pid })
}

/** Why a card is NOT driven this iteration before any lock is probed, or `undefined` when it may be. */
function skipFor(card: RootCandidate, state: LoopState, budget: number): SkippedCard | undefined {
  const durableStatus = state.durable.get(card.id)
  if (durableStatus !== undefined) {
    const detail = `durable failure: ${durableStatus} — not retried`
    return { id: card.id, reason: 'durable failure', detail }
  }
  if (state.drivenSet.has(card.id)) {
    const detail = 'already driven this run'
    return { id: card.id, reason: detail, detail }
  }
  if (card.escalated === true || (card.labels ?? []).includes(NEEDS_REVIEW)) {
    // US-523 AC7: a prepare escalation's `needs-review` label is read from the card's own labels — never
    // left to the selection process's judgement — so an escalated Draft card is not re-picked until a human acts.
    state.failures.delete(card.id)
    return { id: card.id, reason: 'escalated', detail: 'escalated' }
  }
  if ((state.failures.get(card.id) ?? 0) > budget) {
    const detail = `retry budget exhausted (${budget})`
    return { id: card.id, reason: 'retry budget exhausted', detail }
  }
  return undefined
}

function classify(
  candidates: readonly RootCandidate[],
  state: LoopState,
  budget: number,
  probeLock: WatchLoopDeps['probeLock'],
): {
  workable: RootCandidate[]
  skipped: SkippedCard[]
  retried: RetriedCard[]
  reclaimed: { id: string; pid: number }[]
} {
  const workable: RootCandidate[] = []
  const skipped: SkippedCard[] = []
  const retried: RetriedCard[] = []
  const reclaimed: { id: string; pid: number }[] = []
  for (const card of candidates) {
    const skip = skipFor(card, state, budget)
    if (skip !== undefined) {
      skipped.push(skip)
      continue
    }
    const lock = probeLock(card)
    if (lock.kind === 'held') {
      skipped.push({ id: card.id, reason: 'locked', detail: describeLock(lock) })
      continue
    }
    notePid(reclaimed, card.id, lock)
    workable.push(card)
    const failures = state.failures.get(card.id) ?? 0
    if (failures > 0) retried.push({ id: card.id, attempt: failures, budget })
  }
  return { workable, skipped, retried, reclaimed }
}

function errorText(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

interface LoopState {
  readonly driven: string[]
  readonly drivenSet: Set<string>
  readonly failures: Map<string, number>
  /** Cards whose failure was a DURABLE cycle terminal (a reported `failed-*`): reported and excluded, never retried. */
  readonly durable: Map<string, string>
  anyFailed: boolean
  iteration: number
}

function absorb(state: LoopState, outcomes: readonly CardOutcome[]): void {
  for (const outcome of outcomes) {
    if (!state.driven.includes(outcome.id)) state.driven.push(outcome.id)
    if (FAILED.has(outcome.outcome)) {
      state.anyFailed = true
      // AD: a failure that carries the cycle's own terminal status is DURABLE — its budgets are already spent inside the
      // cycle, so retrying repeats it. Only a failure with no cycle status (a crash, an engine/API error) is transient.
      // Escalation rule (both drivers): `escalated` (an autonomy gate fired, `needs-review`) is skipped while escalated and
      // re-picked once cleared — NOT durable, and it never burns the retry budget; `escalate` (the review/fix budget is spent,
      // a human decision is owed) IS durable.
      if (outcome.cycleStatus === 'escalated') continue
      if (outcome.cycleStatus !== undefined) state.durable.set(outcome.id, outcome.cycleStatus)
      else state.failures.set(outcome.id, (state.failures.get(outcome.id) ?? 0) + 1)
    } else {
      state.drivenSet.add(outcome.id)
    }
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
// The predicate is checked at every iteration boundary, the first included, BEFORE work starts.
function predicateVerdict(
  config: WatchLoopConfig,
  selection: LoopSelection,
): { satisfied: boolean; evidence?: string } | { unusable: string } {
  const { predicate } = config
  if (predicate === undefined) return { satisfied: false }
  const { snapshot } = selection
  if (snapshot === undefined) {
    return { unusable: 'the selection carried no board snapshot for the Stop Predicate' }
  }
  const label = `${predicate.selector} ⇒ ${predicate.condition}`
  // The selector's own tag, when it is one: every SELECTED card carrying it must be in the snapshot, or the
  // snapshot is not the board the predicate is about (it once omitted a red, not-Done card and read "satisfied").
  const tag = /^tag:(.+)$/.exec(predicate.selector)?.[1]
  const known = new Set(snapshot.map(card => card.id))
  const omitted =
    tag === undefined
      ? []
      : selection.candidates.filter(c => (c.labels ?? []).includes(tag) && !known.has(c.id))
  if (omitted.length > 0) {
    return {
      unusable: `the Stop Predicate snapshot omits ${omitted.map(c => `#${c.id}`).join(', ')}, selected and carrying ${tag} — it cannot be trusted`,
    }
  }
  // An empty snapshot confirms nothing: it is never read as "everything is done".
  if (snapshot.length === 0) {
    return {
      satisfied: false,
      evidence: `0 card(s) in the snapshot for ${label} — an empty board is never read as satisfied`,
    }
  }
  const { satisfied } = evaluateStopPredicate(predicate, snapshot)
  const holding = snapshot.filter(card => evaluateStopPredicate(predicate, [card]).satisfied).length
  return { satisfied, evidence: `${snapshot.length} card(s) match ${label}, ${holding} hold it` }
}

function baseRecord(
  config: WatchLoopConfig,
  state: LoopState,
  selection: LoopSelection,
  parts: {
    skipped: SkippedCard[]
    retried: RetriedCard[]
    reclaimed: { id: string; pid: number }[]
    outcomes: readonly CardOutcome[]
    evidence?: string | undefined
  },
) {
  return {
    iteration: state.iteration,
    cap: config.cap,
    selected: selection.candidates.length,
    skipped: parts.skipped,
    ...(parts.retried.length > 0 && { retried: parts.retried }),
    ...(parts.reclaimed.length > 0 && { reclaimed: parts.reclaimed }),
    outcomes: parts.outcomes,
    ...(parts.evidence !== undefined && { predicateEvidence: parts.evidence }),
  }
}

type Step = { readonly done: LoopResult } | { readonly idle: boolean }

/** A satisfied predicate means the goal is reached: no new work starts. Otherwise the workable cards run. */
async function runWorkable(
  deps: WatchLoopDeps,
  workable: readonly RootCandidate[],
  satisfied: boolean,
): Promise<readonly CardOutcome[]> {
  return satisfied || workable.length === 0 ? [] : (await deps.runBatch(workable)).outcomes
}

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
  const verdict = predicateVerdict(config, selection)
  if ('unusable' in verdict) {
    return { done: finish('selection failed', { selectionError: verdict.unusable }) }
  }
  const { workable, skipped, retried, reclaimed } = classify(
    selection.candidates,
    state,
    config.retryBudget ?? DEFAULT_RETRY_BUDGET,
    deps.probeLock,
  )
  const outcomes = await runWorkable(deps, workable, verdict.satisfied)
  absorb(state, outcomes)

  const record = baseRecord(config, state, selection, {
    skipped,
    retried,
    reclaimed,
    outcomes,
    evidence: verdict.evidence,
  })
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
  const state: LoopState = {
    driven: [],
    drivenSet: new Set(),
    failures: new Map(),
    durable: new Map(),
    anyFailed: false,
    iteration: 0,
  }
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

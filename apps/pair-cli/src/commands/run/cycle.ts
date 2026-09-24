/**
 * The pure stage loop — US-487 T-4.
 *
 * `resolve → (worktree) → packet → spawnStage → resolve`, over INJECTED collaborators: no engine,
 * no real script, exactly the shape `loop.ts` (US-451 T-9) is tested with, one level up — one
 * FRESH stage dispatch per cycle iteration instead of one fresh skill iteration.
 *
 * Zero merit logic here (D18/BR1): the loop never judges a stage's CONTENT, it only reacts to
 * `resolve`'s own `next` and to whether the handoff it reads back advanced.
 */

/** What `resolve()` answered — the durable cycle state's own shape, read verbatim. */
export interface CycleResolveResult {
  readonly status: string
  readonly next: {
    readonly step: string
    readonly phase?: string
    readonly round?: number
    readonly context?: string
    readonly reason?: string
    readonly [key: string]: unknown
  }
  /** `resolve`'s own operator-facing warnings (e.g. a `max-dispatches: N warn` breach) — relayed VERBATIM via `onNotice`, never re-derived. */
  readonly warnings?: readonly string[]
}

/** `spawnStage`'s own grammar — `stream-reader.ts`'s `'success' | 'failed'`, relayed, never invented. */
export interface CycleStageResult {
  readonly processOutcome: 'success' | 'failed'
  readonly detail?: string
  /** US-506 T-8 (AC12): the stage made no progress within its time bound and was stopped. */
  readonly stalled?: true
}

/** One dispatched stage, as logged to `onStage`/`appendAudit` once the NEXT resolve reveals whether it advanced. */
export interface CycleStageRecord {
  readonly step: string
  readonly phase?: string
  readonly processOutcome: 'success' | 'failed'
  readonly detail?: string
  readonly handoffAdvanced: boolean
  readonly stalled?: true
}

/** A `next` resolve actually answered — every dispatch and every stage record is keyed by one. */
export type CycleNext = CycleResolveResult['next']

/**
 * The statuses `resolve` answers WITHOUT a `next` (`cycle-state.mjs` `resolveState`: `incompatible`,
 * `invalid`, `other-run`) — its own `reason`, and for `other-run` the run id the cycle lives under.
 */
export interface CycleResolveStop {
  readonly status: string
  readonly reason?: string
  readonly runId?: string
  readonly next?: undefined
}

/** Everything `resolve` can answer: a `next` to act on, or a typed stop without one. */
export type CycleResolveAnswer = CycleResolveResult | CycleResolveStop

export interface CycleOutcome {
  readonly status: string
  readonly stagesRun: number
  readonly next?: CycleNext
}

export interface CyclePolicy {
  readonly deadDispatchRetries?: number
  readonly [key: string]: unknown
}

export interface RunCycleInput {
  readonly resolve: () => Promise<CycleResolveAnswer>
  readonly worktree: () => Promise<unknown>
  readonly packet: (next: CycleNext) => Promise<{
    readonly step: string
    readonly phase?: string | undefined
    readonly prompt: string
    readonly worktree: string
    readonly [key: string]: unknown
  }>
  readonly spawnStage: (packet: unknown) => Promise<CycleStageResult>
  readonly policy: CyclePolicy
  /** `--rounds` bound: a positive integer, `'max'` (unbounded) or omitted (policy default decides). */
  readonly rounds?: number | 'max'
  readonly onStage?: (record: CycleStageRecord) => void
  readonly onNotice?: (note: string) => void
  readonly appendAudit?: (record: CycleStageRecord) => void
}

/** The steps `cycle-dispatch.mjs packet` can render a prompt for; anything else is terminal. */
const DISPATCHABLE_STEPS = new Set(['prepare', 'validate', 'implement', 'green', 'verify'])

const sameNext = (a: unknown, b: unknown): boolean => JSON.stringify(a) === JSON.stringify(b)

/** Mutable loop bookkeeping — the ONE dispatch just spawned, and its dead-dispatch retry budget. */
interface LoopState {
  stagesRun: number
  dispatchedNext: CycleNext | null
  dispatchedResult: CycleStageResult | null
  retryCount: number
  reuseNoticeGiven: boolean
}

function buildStageRecord(
  dispatchedNext: CycleNext,
  dispatchedResult: CycleStageResult,
  handoffAdvanced: boolean,
): CycleStageRecord {
  return {
    step: dispatchedNext.step,
    ...(dispatchedNext.phase !== undefined && { phase: dispatchedNext.phase }),
    processOutcome: dispatchedResult.processOutcome,
    ...(dispatchedResult.detail !== undefined && { detail: dispatchedResult.detail }),
    handoffAdvanced,
    ...(dispatchedResult.stalled === true && { stalled: true as const }),
  }
}

interface StageObservers {
  readonly onStage: RunCycleInput['onStage']
  readonly appendAudit: RunCycleInput['appendAudit']
  readonly onNotice: RunCycleInput['onNotice']
}

/**
 * Logs the PREVIOUS dispatch (now that `next` reveals whether it advanced) and applies the
 * dead-dispatch retry budget. Returns a terminal outcome only when that budget is spent.
 */
function settlePreviousDispatch(
  state: LoopState,
  next: CycleNext,
  deadDispatchRetries: number,
  observers: StageObservers,
): CycleOutcome | null {
  const { onStage, appendAudit } = observers
  if (state.dispatchedNext === null) return null
  const handoffAdvanced = !sameNext(state.dispatchedNext, next)
  const record = buildStageRecord(state.dispatchedNext, state.dispatchedResult!, handoffAdvanced)
  onStage?.(record)
  appendAudit?.(record)

  if (handoffAdvanced) {
    state.retryCount = 0
    return null
  }
  if (state.retryCount >= deadDispatchRetries) {
    return { status: `failed-${state.dispatchedNext.step}`, stagesRun: state.stagesRun, next }
  }
  state.retryCount += 1
  // US-506 T-8 (AC12): a stall is resumed within the SAME budget as a dead dispatch. A process
  // realization has no session to resume, so the resume is a fresh dispatch of the same step.
  if (record.stalled === true)
    observers.onNotice?.(
      `Stage ${record.step}${record.phase ? `:${record.phase}` : ''} stalled (${record.detail ?? 'no progress'}) — ` +
        'resumed fresh: a process realization cannot resume a session (ADR-021 §2); ' +
        `retry ${state.retryCount} of ${deadDispatchRetries}.`,
    )
  return null
}

/** Whether `next` is beyond the `--rounds` bound — the run stops WITHOUT dispatching it. */
function roundsBoundReached(rounds: RunCycleInput['rounds'], next: CycleNext): boolean {
  return (
    rounds !== undefined &&
    rounds !== 'max' &&
    typeof next.round === 'number' &&
    next.round > rounds
  )
}

/** A terminal `next` (not one of the dispatchable steps), as the outcome it reports. */
function terminalOutcome(next: CycleNext, stagesRun: number): CycleOutcome {
  return {
    status: next.step === 'done' ? 'ready-for-merge' : String(next.reason ?? next.step),
    stagesRun,
    next,
  }
}

/** AC6: `next.context === 'reuse'` is treated as fresh, reported ONCE per run via `onNotice`. */
function noticeReuseOnce(
  state: LoopState,
  next: CycleNext,
  onNotice: RunCycleInput['onNotice'],
): void {
  if (next.context !== 'reuse' || state.reuseNoticeGiven) return
  onNotice?.(
    "This session cannot resume the previous stage's session — running fresh instead " +
      '(ADR-021 §2: a process realization degrades reuse to fresh).',
  )
  state.reuseNoticeGiven = true
}

/** The recovery a human actually has, per status that answers without a `next`. */
function recoveryFor(answer: CycleResolveStop): string | undefined {
  if (answer.status === 'incompatible') {
    return (
      'this run directory was written under an incompatible handoff schema — bind a NEW run ' +
      'directory to it with `cycle-state.mjs migrate-acknowledge --dir <new run dir> --legacy ' +
      '<this dir>`, then re-run with that --run-id'
    )
  }
  if (answer.status === 'other-run' && answer.runId !== undefined) {
    return `this story's cycle lives under run ${answer.runId} — re-run with --run-id ${answer.runId}`
  }
  return undefined
}

/**
 * `resolve` answered a status with NO `next` (`incompatible`, `invalid`, `other-run`): a typed
 * stop carrying resolve's own reason verbatim — never a dereference of the `next` it did not send.
 */
function stoppedWithoutNext(answer: CycleResolveStop, stagesRun: number): CycleOutcome {
  const detail = recoveryFor(answer)
  return {
    status: answer.status,
    stagesRun,
    next: {
      step: 'blocked',
      reason: answer.reason ?? `resolve answered ${answer.status} without a next step`,
      ...(detail !== undefined && { detail }),
    },
  }
}

/**
 * Drives one cycle to its next terminal state (or to the `--rounds` bound), one fresh dispatch at
 * a time. Never judges a stage's content, never merges (AC12: no branch of the outcome mapping —
 * or the collaborator surface above — can request one).
 */
export async function runCycle(input: RunCycleInput): Promise<CycleOutcome> {
  const { resolve, worktree, packet, spawnStage, policy, rounds, onNotice } = input
  const observers: StageObservers = {
    onStage: input.onStage,
    appendAudit: input.appendAudit,
    onNotice: input.onNotice,
  }
  const deadDispatchRetries = policy.deadDispatchRetries ?? 0
  const state: LoopState = {
    stagesRun: 0,
    dispatchedNext: null,
    dispatchedResult: null,
    retryCount: 0,
    reuseNoticeGiven: false,
  }

  for (;;) {
    const answer = await resolve()
    const next = answer.next
    for (const warning of (answer as CycleResolveResult).warnings ?? []) {
      observers.onNotice?.(warning)
    }
    if (next === undefined) {
      if (state.dispatchedNext !== null) {
        const record = buildStageRecord(state.dispatchedNext, state.dispatchedResult!, false)
        observers.onStage?.(record)
        observers.appendAudit?.(record)
      }
      return stoppedWithoutNext(answer as CycleResolveStop, state.stagesRun)
    }

    const settled = settlePreviousDispatch(state, next, deadDispatchRetries, observers)
    if (settled !== null) return settled

    if (!DISPATCHABLE_STEPS.has(next.step)) return terminalOutcome(next, state.stagesRun)
    if (roundsBoundReached(rounds, next)) {
      return { status: 'rounds-bound-reached', stagesRun: state.stagesRun, next }
    }

    noticeReuseOnce(state, next, onNotice)

    await worktree()
    const stagePacket = await packet(next)
    state.dispatchedResult = await spawnStage(stagePacket)
    state.stagesRun += 1
    state.dispatchedNext = next
  }
}

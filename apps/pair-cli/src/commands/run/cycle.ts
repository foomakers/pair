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
}

/** `spawnStage`'s own grammar — `stream-reader.ts`'s `'success' | 'failed'`, relayed, never invented. */
export interface CycleStageResult {
  readonly processOutcome: 'success' | 'failed'
  readonly detail?: string
}

/** One dispatched stage, as logged to `onStage`/`appendAudit` once the NEXT resolve reveals whether it advanced. */
export interface CycleStageRecord {
  readonly step: string
  readonly phase?: string
  readonly processOutcome: 'success' | 'failed'
  readonly detail?: string
  readonly handoffAdvanced: boolean
}

export interface CycleOutcome {
  readonly status: string
  readonly stagesRun: number
  readonly next?: CycleResolveResult['next']
}

export interface CyclePolicy {
  readonly deadDispatchRetries?: number
  readonly [key: string]: unknown
}

export interface RunCycleInput {
  readonly resolve: () => Promise<CycleResolveResult>
  readonly worktree: () => Promise<unknown>
  readonly packet: (next: CycleResolveResult['next']) => Promise<{
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
  dispatchedNext: CycleResolveResult['next'] | null
  dispatchedResult: CycleStageResult | null
  retryCount: number
  reuseNoticeGiven: boolean
}

function buildStageRecord(
  dispatchedNext: NonNullable<CycleResolveResult['next']>,
  dispatchedResult: CycleStageResult,
  handoffAdvanced: boolean,
): CycleStageRecord {
  return {
    step: dispatchedNext.step,
    ...(dispatchedNext.phase !== undefined && { phase: dispatchedNext.phase }),
    processOutcome: dispatchedResult.processOutcome,
    ...(dispatchedResult.detail !== undefined && { detail: dispatchedResult.detail }),
    handoffAdvanced,
  }
}

interface StageObservers {
  readonly onStage: RunCycleInput['onStage']
  readonly appendAudit: RunCycleInput['appendAudit']
}

/**
 * Logs the PREVIOUS dispatch (now that `next` reveals whether it advanced) and applies the
 * dead-dispatch retry budget. Returns a terminal outcome only when that budget is spent.
 */
function settlePreviousDispatch(
  state: LoopState,
  next: CycleResolveResult['next'],
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
  return null
}

/** Whether `next` is beyond the `--rounds` bound — the run stops WITHOUT dispatching it. */
function roundsBoundReached(rounds: RunCycleInput['rounds'], next: CycleResolveResult['next']): boolean {
  return (
    rounds !== undefined && rounds !== 'max' && typeof next.round === 'number' && next.round > rounds
  )
}

/** A terminal `next` (not one of the dispatchable steps), as the outcome it reports. */
function terminalOutcome(next: CycleResolveResult['next'], stagesRun: number): CycleOutcome {
  return {
    status: next.step === 'done' ? 'ready-for-merge' : String(next.reason ?? next.step),
    stagesRun,
    next,
  }
}

/** AC6: `next.context === 'reuse'` is treated as fresh, reported ONCE per run via `onNotice`. */
function noticeReuseOnce(
  state: LoopState,
  next: CycleResolveResult['next'],
  onNotice: RunCycleInput['onNotice'],
): void {
  if (next.context !== 'reuse' || state.reuseNoticeGiven) return
  onNotice?.(
    "This session cannot resume the previous stage's session — running fresh instead " +
      '(ADR-021 §2: a process realization degrades reuse to fresh).',
  )
  state.reuseNoticeGiven = true
}

/**
 * Drives one cycle to its next terminal state (or to the `--rounds` bound), one fresh dispatch at
 * a time. Never judges a stage's content, never merges (AC12: no branch of the outcome mapping —
 * or the collaborator surface above — can request one).
 */
export async function runCycle(input: RunCycleInput): Promise<CycleOutcome> {
  const { resolve, worktree, packet, spawnStage, policy, rounds, onNotice } = input
  const observers: StageObservers = { onStage: input.onStage, appendAudit: input.appendAudit }
  const deadDispatchRetries = policy.deadDispatchRetries ?? 0
  const state: LoopState = {
    stagesRun: 0,
    dispatchedNext: null,
    dispatchedResult: null,
    retryCount: 0,
    reuseNoticeGiven: false,
  }

  for (;;) {
    const { next } = await resolve()

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

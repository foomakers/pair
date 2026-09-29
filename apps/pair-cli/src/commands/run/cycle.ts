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
  /** US-490: the `merge` stage's answer — `cycle-merge.mjs`'s own JSON (`merged`, `cascaded`, `reason`), relayed verbatim. */
  readonly merge?: unknown
}

export interface CyclePolicy {
  readonly deadDispatchRetries?: number
  readonly [key: string]: unknown
}

/**
 * What one hook point answered — `cycle-hooks.mjs run`'s own shape, relayed (US-489). The blocking
 * vs logging semantics live in THAT shared executor; the loop only reacts to `halted`.
 */
export interface CycleHookResult {
  readonly halted?: { readonly command: string; readonly exitCode: number; readonly output: string }
  /** Failures of logging hooks (`post-*`, `on-halt`) — relayed via `onNotice`, never a stop. */
  readonly logged?: readonly string[]
}

/** The shared hook executor, as the loop sees it: one call per hook point, zero rules of its own. */
export interface CycleHooks {
  /** `cwd`: where the hook runs — REQUIRED for stage hooks (the story worktree; the bridge refuses without it), absent (main) only for `pre-cycle`/`post-cycle`/`on-halt`. */
  run(point: string, status?: string, cwd?: string): Promise<CycleHookResult>
}

export interface RunCycleInput {
  /** US-489: `## Cycle Hooks`, executed by the coordinator. Absent ⇒ no hook step attempted at all. */
  readonly hooks?: CycleHooks
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
  /**
   * US-490: runs the `merge` stage (a script, never an agent) for a `merge` next — `cycle-merge.mjs
   * check`, then `run`. Absent ⇒ `merge` is as terminal as any step this loop cannot dispatch.
   */
  readonly mergeStage?: (next: CycleNext, answer: CycleResolveAnswer) => Promise<CycleMergeOutcome>
  /** `--rounds` bound: a positive integer, `'max'` (unbounded) or omitted (policy default decides). */
  readonly rounds?: number | 'max'
  readonly onStage?: (record: CycleStageRecord) => void
  readonly onNotice?: (note: string) => void
  readonly appendAudit?: (record: CycleStageRecord) => void
}

/** What the merge collaborator reports: the outcome status, the stages it dispatched, and the script's own answer. */
export interface CycleMergeOutcome {
  readonly status: string
  readonly stagesRun: number
  readonly merge: unknown
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
  /** The story worktree, once created: where `pre-<stage>`/`post-<stage>` hooks run. */
  worktreePath: string | undefined
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

/** r1 r0-4: relays `resolve`'s own operator-facing `warnings[]` (e.g. a `max-dispatches` breach) verbatim, never re-derived. */
function relayWarnings(answer: CycleResolveAnswer, onNotice: RunCycleInput['onNotice']): void {
  for (const warning of (answer as CycleResolveResult).warnings ?? []) {
    onNotice?.(warning)
  }
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
 * A `next` this loop dispatches no agent stage for: `merge` runs through the injected `mergeStage`
 * (its dispatched stages added to the loop's own count); anything else is the terminal it names.
 */
async function terminalStep(
  input: RunCycleInput,
  state: LoopState,
  next: CycleNext,
  answer: CycleResolveAnswer,
): Promise<CycleOutcome> {
  const { mergeStage, hooks, onNotice } = input
  if (next.step !== 'merge' || mergeStage === undefined)
    return terminalOutcome(next, state.stagesRun)
  // US-489 x US-490: `merge` is a stage like the others — `pre-merge` (blocking) runs in the story
  // worktree before `check`; `post-merge` (logged) after `run`, i.e. only when the merge executed.
  state.worktreePath = worktreePathOf(await input.worktree())
  const halted = await runHookPoint(hooks, 'pre-merge', onNotice, { cwd: state.worktreePath })
  if (halted !== null) return hookFailure(halted, state.stagesRun)
  const merged = await mergeStage(next, answer)
  if (MERGE_RAN.has(merged.status))
    await runHookPoint(hooks, 'post-merge', onNotice, { cwd: state.worktreePath })
  return {
    status: merged.status,
    stagesRun: state.stagesRun + merged.stagesRun,
    next,
    merge: merged.merge,
  }
}

/** Merge-stage statuses where `run` executed (so `post-merge` is due). */
const MERGE_RAN = new Set(['merged', 'merged-closure-unfinished'])

/**
 * Drives one cycle to its next terminal state (or to the `--rounds` bound), one fresh dispatch at
 * a time. Never judges a stage's content. The only merge is the injected `mergeStage`
 * collaborator's (US-490: `cycle-merge.mjs` re-verifies its own conjunction) — never this loop.
 */
async function runCycleLoop(input: RunCycleInput): Promise<CycleOutcome> {
  const { resolve, packet, spawnStage, policy, onNotice, hooks } = input
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
    worktreePath: undefined,
  }

  for (;;) {
    const answer = await resolve()
    const next = answer.next
    relayWarnings(answer, onNotice)
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
    await runPostStageHook(state, next, hooks, onNotice)

    if (!DISPATCHABLE_STEPS.has(next.step)) return await terminalStep(input, state, next, answer)
    noticeReuseOnce(state, next, onNotice)
    const gated = await gateDispatch(state, next, input)
    if (gated !== null) return gated

    const stagePacket = await packet(next)
    state.dispatchedResult = await spawnStage(stagePacket)
    state.stagesRun += 1
    state.dispatchedNext = next
  }
}

/**
 * US-489 AC2: `post-<stage>` runs once the previous dispatch's handoff ADVANCED (`next` differs
 * from what was dispatched) — logged, never a stop. A dead dispatch runs no `post-*`.
 * (AC1's `pre-<stage>` runs inline before each dispatch; a non-zero exit HALTs there, so the stage
 * never runs and the hook's own output is what the operator reads.)
 */
async function runPostStageHook(
  state: LoopState,
  next: CycleNext,
  hooks: CycleHooks | undefined,
  onNotice: RunCycleInput['onNotice'],
): Promise<void> {
  if (state.dispatchedNext === null || sameNext(state.dispatchedNext, next)) return
  await runHookPoint(hooks, `post-${state.dispatchedNext.step}`, onNotice, {
    cwd: state.worktreePath,
  })
}

/**
 * What may stop a dispatch: the `--rounds` bound, then US-489 AC1's `pre-<stage>` hook — a HALT is
 * the cycle's `failed-hook` terminal. `null` ⇒ dispatch.
 */
async function gateDispatch(
  state: LoopState,
  next: CycleNext,
  input: RunCycleInput,
): Promise<CycleOutcome | null> {
  const { rounds, hooks, onNotice } = input
  if (roundsBoundReached(rounds, next)) {
    return { status: 'rounds-bound-reached', stagesRun: state.stagesRun, next }
  }
  // The stage's worktree exists BEFORE its `pre-<stage>` hook: the hook gates the tree the stage
  // will judge (the story worktree), never the main checkout.
  state.worktreePath = worktreePathOf(await input.worktree())
  const halted = await runHookPoint(hooks, `pre-${next.step}`, onNotice, {
    cwd: state.worktreePath,
  })
  return halted === null ? null : hookFailure(halted, state.stagesRun)
}

const worktreePathOf = (created: unknown): string | undefined => {
  const path = (created as { path?: unknown } | null | undefined)?.path
  return typeof path === 'string' ? path : undefined
}

type HaltedHook = { point: string; command: string; exitCode: number; output: string }

/**
 * Runs one hook point through the shared executor. Returns the HALT (blocking hooks only — the
 * executor decides that, never this loop) or `null`; relays logged failures via `onNotice`.
 * No `hooks` collaborator ⇒ nothing attempted, nothing said (AC6).
 */
async function runHookPoint(
  hooks: CycleHooks | undefined,
  point: string,
  onNotice: RunCycleInput['onNotice'],
  where: { status?: string | undefined; cwd?: string | undefined } = {},
): Promise<HaltedHook | null> {
  if (hooks === undefined) return null
  const result = await hooks.run(point, where.status, where.cwd)
  for (const line of result.logged ?? []) onNotice?.(line)
  return result.halted === undefined ? null : { point, ...result.halted }
}

/** A blocking hook's HALT as the cycle's own terminal: `failed-hook`, the command's output verbatim. */
function hookFailure(halted: HaltedHook, stagesRun: number): CycleOutcome {
  return {
    status: 'failed-hook',
    stagesRun,
    next: {
      step: 'blocked',
      reason: 'failed-hook',
      detail:
        `hook \`${halted.point}\` \`${halted.command}\` exited ${halted.exitCode}` +
        `${halted.output.length > 0 ? ` — output:\n${halted.output}` : ''}`,
    },
  }
}

/** Statuses that are an invocation ending, not the cycle reaching a terminal status. */
const NOT_TERMINAL = new Set(['rounds-bound-reached', 'incompatible', 'invalid', 'other-run'])
const isHalt = (status: string): boolean => status.startsWith('failed-') || status === 'escalate'

/**
 * Drives one cycle to its next terminal state (or to the `--rounds` bound). US-489: wraps the stage
 * loop in `## Cycle Hooks` — `pre-cycle` once before the first stage, `on-halt` on a `failed-*` /
 * `escalate` stop, `post-cycle` once after a terminal status; once per INVOCATION, never per round.
 */
export async function runCycle(input: RunCycleInput): Promise<CycleOutcome> {
  const { hooks, onNotice } = input
  const blocked = await runHookPoint(hooks, 'pre-cycle', onNotice)
  const outcome = blocked !== null ? hookFailure(blocked, 0) : await runCycleLoop(input)
  if (isHalt(outcome.status))
    await runHookPoint(hooks, 'on-halt', onNotice, { status: outcome.status })
  if (!NOT_TERMINAL.has(outcome.status)) {
    await runHookPoint(hooks, 'post-cycle', onNotice, { status: outcome.status })
  }
  return outcome
}

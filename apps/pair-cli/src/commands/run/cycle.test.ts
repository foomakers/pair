import { describe, it, expect, vi } from 'vitest'
import { runCycle, type CycleResolveResult, type CycleStageResult } from './cycle'

/**
 * US-487 T-4 — the pure stage loop: `resolve → (worktree) → packet → spawnStage → resolve`, over
 * FAKE collaborators — no engine, no real script, exactly the way `loop.ts` (US-451 T-9) is tested,
 * because this is the SAME shape one level up: one FRESH stage dispatch per cycle iteration instead
 * of one fresh skill iteration.
 *
 * Zero merit logic here either (D18/BR1): the loop never judges a stage's content, it only reacts to
 * `resolve`'s own `next` and to whether the handoff it reads back advanced.
 */

/** A `resolve` that returns a scripted sequence, one call at a time — the LAST value repeats. */
function scriptedResolve(sequence: CycleResolveResult[]) {
  let call = 0
  const fn = vi.fn(async (): Promise<CycleResolveResult> => {
    const result = sequence[Math.min(call, sequence.length - 1)]!
    call += 1
    return result
  })
  return fn
}

const worktree = vi.fn(async () => ({ path: '/worktrees/487' }))
const packet = vi.fn(async (next: CycleResolveResult['next']) => ({
  step: next.step,
  phase: next.phase,
  prompt: `prompt for ${next.step}:${next.phase}`,
  worktree: '/worktrees/487',
}))

const PREPARE_A0 = { step: 'prepare', mode: 'initial', phase: 'a0', attempt: 1, context: 'fresh' }
const VALIDATE_A0 = { step: 'validate', phase: 'a0', attempt: 1, context: 'fresh' }
const IMPLEMENT_A0 = { step: 'implement', phase: 'a0', attempt: 1, context: 'fresh' }
const DONE = { step: 'done', verdict: 'APPROVED' }
const BLOCKED_ESCALATE = { step: 'blocked', reason: 'escalate', detail: 'a human decision is owed' }

describe('runCycle (US-487 T-4)', () => {
  it('AC1: drives resolve → worktree → packet → spawnStage → resolve until a terminal step, one fresh dispatch per stage', async () => {
    // Three stages, not two: a two-stage chain cannot discriminate a loop that is general in the
    // number of stages from one that happens to dispatch twice. prepare → validate → implement.
    const resolve = scriptedResolve([
      { status: 'empty', next: PREPARE_A0 },
      { status: 'in-progress', next: VALIDATE_A0 },
      { status: 'in-progress', next: IMPLEMENT_A0 },
      { status: 'completed', next: DONE },
    ])
    const spawnStage = vi.fn(async (): Promise<CycleStageResult> => ({ processOutcome: 'success' }))

    const outcome = await runCycle({ resolve, worktree, packet, spawnStage, policy: {} })

    expect(resolve).toHaveBeenCalledTimes(4)
    expect(spawnStage).toHaveBeenCalledTimes(3)
    expect(outcome.status).toBe('ready-for-merge')
    expect(outcome.stagesRun).toBe(3)
  })

  it('AC9: a converged run directory (already terminal on the FIRST resolve) spawns nothing', async () => {
    const resolve = scriptedResolve([{ status: 'completed', next: DONE }])
    const spawnStage = vi.fn(async (): Promise<CycleStageResult> => ({ processOutcome: 'success' }))

    const outcome = await runCycle({ resolve, worktree, packet, spawnStage, policy: {} })

    expect(spawnStage).not.toHaveBeenCalled()
    expect(outcome.stagesRun).toBe(0)
    expect(outcome.status).toBe('ready-for-merge')
  })

  it('AC9 (T1-C1): a re-invocation over PARTIALLY-advanced disk state continues from the first incomplete step, never re-running the completed one', async () => {
    // Round 2 repair: distinct from the test above (already terminal on the FIRST call, zero
    // spawns). Here the run was killed mid-stage and re-invoked — `runCycle` re-calls `resolve`
    // fresh with NO cached state, so a second invocation whose first `resolve()` already reports
    // one stage advanced on disk (`prepare:a0` done, `validate:a0` next) must dispatch ONLY the
    // remaining stage. The real-SIGTERM/real-binary half of AC9's kill/resume property stays
    // T-6's own live canary (T1-C1's own stated scope); this is the pure loop's OWN resilience to
    // a second invocation, fully reproducible over fakes per T-4's own testing approach.
    const resolve = scriptedResolve([
      { status: 'in-progress', next: VALIDATE_A0 }, // prepare:a0 already advanced before this call
      { status: 'completed', next: DONE },
    ])
    const spawnStage = vi.fn(async (): Promise<CycleStageResult> => ({ processOutcome: 'success' }))

    const outcome = await runCycle({ resolve, worktree, packet, spawnStage, policy: {} })

    // Only the remaining stage (validate:a0) is dispatched — the already-advanced prepare:a0 is
    // never re-spawned.
    expect(spawnStage).toHaveBeenCalledTimes(1)
    expect(outcome.stagesRun).toBe(1)
    expect(outcome.status).toBe('ready-for-merge')
  })

  it('a blocked/escalate terminal is reported VERBATIM from resolve.next.reason, never re-derived', async () => {
    const resolve = scriptedResolve([
      { status: 'empty', next: PREPARE_A0 },
      { status: 'blocked', next: BLOCKED_ESCALATE },
    ])
    const spawnStage = vi.fn(async (): Promise<CycleStageResult> => ({ processOutcome: 'success' }))

    const outcome = await runCycle({ resolve, worktree, packet, spawnStage, policy: {} })

    expect(outcome.status).toBe('escalate')
  })

  it('AC4: a process outcome of "failed" with an ADVANCED handoff still continues (process ≠ stage outcome)', async () => {
    // The terminal event lied (or never arrived) but the handoff genuinely moved on — AC4's split:
    // stage outcome comes from `resolve`, not from the process outcome.
    const resolve = scriptedResolve([
      { status: 'empty', next: PREPARE_A0 },
      { status: 'in-progress', next: VALIDATE_A0 },
      { status: 'completed', next: DONE },
    ])
    // `processOutcome` carries `stream-reader.ts`'s OWN grammar (`'success' | 'failed'`, the
    // detail naming WHY) — cycle.ts never invents a third value, it only relays and logs it.
    const outcomes: CycleStageResult[] = [
      { processOutcome: 'failed', detail: 'no terminal event in the engine stream (fail-closed)' },
      { processOutcome: 'success', detail: 'terminal event matched (success)' },
    ]
    let i = 0
    const spawnStage = vi.fn(async (): Promise<CycleStageResult> => outcomes[i++]!)
    const onStage = vi.fn()

    const outcome = await runCycle({ resolve, worktree, packet, spawnStage, policy: {}, onStage })

    expect(outcome.status).toBe('ready-for-merge')
    expect(outcome.stagesRun).toBe(2)
    // The anomaly is LOGGED, not swallowed: the first stage's record carries both facts.
    expect(onStage).toHaveBeenCalledWith(
      expect.objectContaining({ processOutcome: 'failed', handoffAdvanced: true }),
    )
  })

  it('AC5: a not-advanced handoff is a dead dispatch — the SAME packet is spawned once more', async () => {
    // `resolve` returns the IDENTICAL `next` twice in a row (nothing published) before finally
    // advancing on the retry.
    const resolve = scriptedResolve([
      { status: 'empty', next: PREPARE_A0 },
      { status: 'empty', next: PREPARE_A0 }, // dead dispatch: same phase, same attempt
      { status: 'in-progress', next: VALIDATE_A0 }, // the retry advanced
      { status: 'completed', next: DONE },
    ])
    const spawnStage = vi.fn(async (): Promise<CycleStageResult> => ({ processOutcome: 'success' }))

    const outcome = await runCycle({
      resolve,
      worktree,
      packet,
      spawnStage,
      policy: { deadDispatchRetries: 1 },
    })

    // prepare:a0 dispatched twice (original + one retry), then validate:a0 once.
    expect(spawnStage).toHaveBeenCalledTimes(3)
    expect(outcome.status).toBe('ready-for-merge')
  })

  it('AC5: a SECOND not-advanced handoff (retry budget spent) ends the run failed-<step>, never a third dispatch', async () => {
    const resolve = scriptedResolve([
      { status: 'empty', next: PREPARE_A0 },
      { status: 'empty', next: PREPARE_A0 }, // 1st dead dispatch
      { status: 'empty', next: PREPARE_A0 }, // 2nd — retry budget (1) is spent
    ])
    const spawnStage = vi.fn(async (): Promise<CycleStageResult> => ({ processOutcome: 'success' }))

    const outcome = await runCycle({
      resolve,
      worktree,
      packet,
      spawnStage,
      policy: { deadDispatchRetries: 1 },
    })

    expect(spawnStage).toHaveBeenCalledTimes(2) // original + the ONE retry the policy allows
    expect(outcome.status).toBe('failed-prepare')
  })

  it("AC5: the retry budget is READ from cycle-state's policy, never a literal in this file (grep guard)", async () => {
    // A budget hardcoded in cycle.ts would silently diverge from the durable policy the in-session
    // coordinator already reads from `resolve` — the story's own AC5 wording. Proven by ACTUALLY
    // varying the injected policy and observing the retry count change, not by reading source.
    const resolveTwoRetries = scriptedResolve([
      { status: 'empty', next: PREPARE_A0 },
      { status: 'empty', next: PREPARE_A0 },
      { status: 'empty', next: PREPARE_A0 },
      { status: 'empty', next: PREPARE_A0 },
    ])
    const spawnStage = vi.fn(async (): Promise<CycleStageResult> => ({ processOutcome: 'success' }))

    const outcome = await runCycle({
      resolve: resolveTwoRetries,
      worktree,
      packet,
      spawnStage,
      policy: { deadDispatchRetries: 2 },
    })

    expect(spawnStage).toHaveBeenCalledTimes(3) // original + 2 retries this policy allows
    expect(outcome.status).toBe('failed-prepare')
  })

  it('AC6: next.context "reuse" is treated as fresh and reported once per run, never resumed as a session', async () => {
    const reuseNext = { ...PREPARE_A0, context: 'reuse' as const }
    const resolve = scriptedResolve([
      { status: 'in-progress', next: reuseNext },
      { status: 'in-progress', next: { ...VALIDATE_A0, context: 'reuse' as const } },
      { status: 'completed', next: DONE },
    ])
    const spawnStage = vi.fn(async (): Promise<CycleStageResult> => ({ processOutcome: 'success' }))
    const onStage = vi.fn()
    const notes: string[] = []

    await runCycle({
      resolve,
      worktree,
      packet,
      spawnStage,
      policy: {},
      onStage,
      onNotice: note => notes.push(note),
    })

    // Both `reuse` stages are still dispatched — as fresh processes, never skipped or resumed.
    expect(spawnStage).toHaveBeenCalledTimes(2)
    // Two stages both carried `context: reuse`, but the "cannot resume a session" notice is printed
    // ONCE for the whole run, not once per stage (ADR-021 §2: content is the implementer's wording,
    // the CONTRACT is "mentions the session cannot be resumed" and "says fresh runs instead").
    const reuseNotices = notes.filter(n => /session/i.test(n) && /fresh/i.test(n))
    expect(reuseNotices).toHaveLength(1)
  })

  it('AC8: --rounds 1 stops after one remediation round and reports the next step without spawning it', async () => {
    const ROUND_1_PREPARE = {
      step: 'prepare',
      mode: 'remediation',
      phase: 'r1-g1',
      round: 1,
      attempt: 1,
      context: 'fresh',
    }
    const ROUND_1_DONE_VERIFY = {
      step: 'verify',
      mode: 'fix',
      phase: 'r1-g1',
      round: 1,
      attempt: 1,
      context: 'fresh',
    }
    const ROUND_2_PREPARE = {
      step: 'prepare',
      mode: 'remediation',
      phase: 'r2-g1',
      round: 2,
      attempt: 1,
      context: 'fresh',
    }
    const resolve = scriptedResolve([
      { status: 'in-progress', next: ROUND_1_PREPARE },
      { status: 'in-progress', next: ROUND_1_DONE_VERIFY },
      { status: 'in-progress', next: ROUND_2_PREPARE }, // a second round becomes due
    ])
    const spawnStage = vi.fn(async (): Promise<CycleStageResult> => ({ processOutcome: 'success' }))

    const outcome = await runCycle({ resolve, worktree, packet, spawnStage, policy: {}, rounds: 1 })

    // round 1's two stages ran; round 2 never got a packet/spawn.
    expect(spawnStage).toHaveBeenCalledTimes(2)
    expect(outcome.status).not.toBe('ready-for-merge')
    expect(outcome.next).toMatchObject({ phase: 'r2-g1', round: 2 })
  })

  it('AC12: never constructs a merge — no branch of the outcome mapping can request one', async () => {
    // Structural, not a grep: every fake that COULD represent "merge" is absent from the collaborator
    // surface the loop is given (no `merge` function is even an accepted input), so a cycle that
    // converges cannot have called one.
    const resolve = scriptedResolve([{ status: 'completed', next: DONE }])
    const spawnStage = vi.fn(async (): Promise<CycleStageResult> => ({ processOutcome: 'success' }))
    const merge = vi.fn()

    const outcome = await runCycle({
      resolve,
      worktree,
      packet,
      spawnStage,
      policy: {},
      // @ts-expect-error — `merge` is not a recognised collaborator; the loop's own type has none.
      merge,
    })

    expect(outcome.status).toBe('ready-for-merge')
    // Offered one anyway, the loop never calls it.
    expect(merge).not.toHaveBeenCalled()
  })

  it('AC12: a `merge` step from resolve (#490, Auto-Advance) is reported, never dispatched by this driver', async () => {
    // `merge` is another story's stage: this driver exits at it as `resolve` reports it, with no
    // packet rendered and no engine process spawned for it.
    const resolve = scriptedResolve([
      { status: 'in-progress', next: { step: 'merge', phase: 'r1' } },
    ])
    const spawnStage = vi.fn(async (): Promise<CycleStageResult> => ({ processOutcome: 'success' }))
    const mergePacket = vi.fn(packet)

    const outcome = await runCycle({
      resolve,
      worktree,
      packet: mergePacket,
      spawnStage,
      policy: {},
    })

    expect(spawnStage).not.toHaveBeenCalled()
    expect(mergePacket).not.toHaveBeenCalled()
    expect(outcome.stagesRun).toBe(0)
    expect(outcome.next).toMatchObject({ step: 'merge' })
  })

  it('appends one audit line per stage dispatched, via the injected appender (never the engine map)', async () => {
    const resolve = scriptedResolve([
      { status: 'empty', next: PREPARE_A0 },
      { status: 'completed', next: DONE },
    ])
    const spawnStage = vi.fn(async (): Promise<CycleStageResult> => ({ processOutcome: 'success' }))
    const appendAudit = vi.fn()

    await runCycle({ resolve, worktree, packet, spawnStage, policy: {}, appendAudit })

    expect(appendAudit).toHaveBeenCalledTimes(1)
    expect(appendAudit.mock.calls[0]![0]).toEqual(
      expect.objectContaining({ step: 'prepare', phase: 'a0' }),
    )
  })
})

describe('runCycle — stall resume (US-506 T-8, AC12)', () => {
  const STALL: CycleStageResult = {
    processOutcome: 'failed',
    detail: 'stalled: no terminal event within 1800s — the engine was stopped',
    stalled: true,
  }

  it('a stalled stage whose handoff did not advance is resumed ONCE — fresh, since a process realization cannot resume a session — and says so', async () => {
    const resolve = scriptedResolve([
      { status: 'empty', next: IMPLEMENT_A0 },
      { status: 'empty', next: IMPLEMENT_A0 },
      { status: 'completed', next: DONE },
    ])
    const spawnStage = vi
      .fn(async (): Promise<CycleStageResult> => ({ processOutcome: 'success' }))
      .mockImplementationOnce(async () => STALL)
    const notices: string[] = []
    const stages: unknown[] = []
    const outcome = await runCycle({
      resolve,
      worktree,
      packet,
      spawnStage,
      policy: { deadDispatchRetries: 1 },
      onNotice: n => notices.push(n),
      onStage: r => stages.push(r),
    })
    expect(spawnStage).toHaveBeenCalledTimes(2)
    expect(outcome.status).toBe('ready-for-merge')
    expect(notices.some(n => /stalled/.test(n) && /resumed fresh/.test(n))).toBe(true)
    expect(stages[0]).toMatchObject({ step: 'implement', stalled: true, handoffAdvanced: false })
  })

  it("r1 r0-4: resolve's warnings[] (e.g. a max-dispatches warning) are relayed via onNotice, naming the count", async () => {
    const resolve = scriptedResolve([
      {
        status: 'in-progress',
        next: VALIDATE_A0,
        warnings: ['40 published handoff files exceed max-dispatches: 40 warn'],
      } as CycleResolveResult,
      { status: 'completed', next: DONE },
    ])
    const spawnStage = vi.fn(async (): Promise<CycleStageResult> => ({ processOutcome: 'success' }))
    const notes: string[] = []

    const outcome = await runCycle({
      resolve,
      worktree,
      packet,
      spawnStage,
      policy: {},
      onNotice: note => notes.push(note),
    })

    expect(outcome.status).toBe('ready-for-merge')
    expect(notes.some(n => /40/.test(n))).toBe(true)
  })

  it('a second failure ends `failed-<step>` — a stall resume and a dead-dispatch retry spend the SAME deadDispatchRetries budget', async () => {
    for (const second of [STALL, { processOutcome: 'success' } as CycleStageResult]) {
      const resolve = scriptedResolve([{ status: 'empty', next: IMPLEMENT_A0 }])
      const spawnStage = vi
        .fn(async (): Promise<CycleStageResult> => second)
        .mockImplementationOnce(async () => STALL)
      const outcome = await runCycle({
        resolve,
        worktree,
        packet,
        spawnStage,
        policy: { deadDispatchRetries: 1 },
      })
      expect(spawnStage).toHaveBeenCalledTimes(2)
      expect(outcome.status).toBe('failed-implement')
    }
  })
})

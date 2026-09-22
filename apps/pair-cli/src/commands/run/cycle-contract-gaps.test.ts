import { describe, it, expect, vi } from 'vitest'
import { runCycle, type CycleResolveResult, type CycleStageResult } from './cycle'
import { resolveAutonomy } from './autonomy'
import { ENGINES } from './engines'

/**
 * Two classes AC7 and AC8 declare that no test covered — found by the independent validator of
 * US-487's re-planned contract (finding CLASS-GAPS), not by the suites, which all asserted the
 * EXPLICIT form of each flag and never its absence.
 */

const worktree = vi.fn(async () => ({ path: '/worktrees/487' }))
const packet = vi.fn(async (next: CycleResolveResult['next']) => ({
  step: next.step,
  phase: next.phase,
  prompt: `prompt for ${next.step}:${next.phase}`,
  worktree: '/worktrees/487',
}))
const scriptedResolve = (answers: CycleResolveResult[]) => {
  let i = 0
  return vi.fn(async () => answers[Math.min(i++, answers.length - 1)]!)
}

describe('AC8 — `--rounds` omitted ⇒ the policy decides, never this driver', () => {
  it('does NOT stop at any round when --rounds is omitted: the budget belongs to cycle-state', async () => {
    // pair-cli holds no round budget of its own. With `--rounds` absent it dispatches whatever
    // `resolve` says is due, round after round, and stops only when `resolve` itself reports a
    // terminal state — which is how `maxFixRounds` manifests: cycle-state blocks, the driver obeys.
    // `--rounds 1` stopping at round 2 is covered by cycle.test.ts; this is its missing twin.
    const round = (n: number) => ({
      status: 'in-progress' as const,
      next: { step: 'green', phase: `r${n}-g1`, round: n, attempt: 1, context: 'fresh' as const },
    })
    const resolve = scriptedResolve([
      round(1),
      round(2),
      round(3),
      { status: 'blocked', next: { step: 'blocked', reason: 'escalate', budget: 'maxFixRounds' } },
    ] as CycleResolveResult[])
    const spawnStage = vi.fn(async (): Promise<CycleStageResult> => ({ processOutcome: 'success' }))

    const outcome = await runCycle({ resolve, worktree, packet, spawnStage, policy: {} })

    expect(spawnStage).toHaveBeenCalledTimes(3)
    expect(outcome.status).not.toBe('rounds-bound-reached')
  })
})

describe('AC7 — no `--autonomous` ⇒ a stage that must write fails loudly, never silently', () => {
  it("keeps the engine's own confirmations when --autonomous is absent", () => {
    // An engine that CAN confirm is handed no bypass: a headless write then fails at that stage
    // instead of proceeding unattended. The hang half of AC7 is spawn.test.ts's (closed stdin and
    // a wall-clock bound); this is the half that decides whether a write is permitted at all.
    const decision = resolveAutonomy({
      engine: ENGINES.claude,
      autonomous: false,
      approveProjectTrust: false,
      cwd: '/project',
      isProjectTrusted: () => true,
    })
    expect(decision.args).toEqual([])
  })

  it('refuses outright an engine that has no confirmations to keep', () => {
    // pi cannot confirm anything, so "keep confirmations" is not an option it has: without the
    // explicit opt-in the run is refused before any stage starts, rather than running unattended
    // by default.
    expect(() =>
      resolveAutonomy({
        engine: ENGINES.pi,
        autonomous: false,
        approveProjectTrust: false,
        cwd: '/project',
        isProjectTrusted: () => true,
      }),
    ).toThrow()
  })

  it('hands the bypass only on the explicit opt-in', () => {
    const decision = resolveAutonomy({
      engine: ENGINES.claude,
      autonomous: true,
      approveProjectTrust: false,
      cwd: '/project',
      isProjectTrusted: () => true,
    })
    expect(decision.args.length).toBeGreaterThan(0)
  })
})

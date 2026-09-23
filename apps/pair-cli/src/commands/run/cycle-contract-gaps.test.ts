import { describe, it, expect, vi, afterEach } from 'vitest'
import { execFileSync } from 'child_process'
import { mkdtempSync, realpathSync, rmSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { InMemoryFileSystemService } from '@pair/content-ops'
import type { CycleOutcome, CycleResolveResult, CycleStageResult, RunCycleInput } from './cycle'
import { resolveAutonomy } from './autonomy'
import { ENGINES } from './engines'
import { handleRunCommand, type IterationRunner } from './handler'
import { parseRunCommand } from './parser'
import { POLICY_PATH } from './automation-policy'
import type { LockAcquirer } from './card-lock'

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

// Loaded per test, not at module scope: the AC7 rows below prove behaviour that exists WITHOUT the
// cycle loop, and a static import would make their result depend on this module being present.
const runCycle = async (input: RunCycleInput): Promise<CycleOutcome> =>
  (await import('./cycle.js')).runCycle(input)

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

  it('`--rounds max` is no bound of its own either: round 2 is dispatched, the policy still decides', async () => {
    const round = (n: number) => ({
      status: 'in-progress' as const,
      next: { step: 'green', phase: `r${n}-g1`, round: n, attempt: 1, context: 'fresh' as const },
    })
    const resolve = scriptedResolve([
      round(1),
      round(2),
      { status: 'blocked', next: { step: 'blocked', reason: 'escalate', budget: 'maxFixRounds' } },
    ] as CycleResolveResult[])
    const spawnStage = vi.fn(async (): Promise<CycleStageResult> => ({ processOutcome: 'success' }))

    const outcome = await runCycle({
      resolve,
      worktree,
      packet,
      spawnStage,
      policy: {},
      rounds: 'max',
    })

    expect(spawnStage).toHaveBeenCalledTimes(2)
    expect(outcome.status).toBe('escalate')
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

describe('AC7 — the card-mode entry applies that same decision before any stage starts', () => {
  let repo: string | undefined
  afterEach(() => {
    vi.unstubAllEnvs()
    vi.restoreAllMocks()
    if (repo) rmSync(repo, { recursive: true, force: true })
    repo = undefined
  })

  it('refuses `run --card` on pi without --autonomous through the PRODUCTION driver, spawning nothing', async () => {
    // The controls above prove `resolveAutonomy` itself; this proves the card-mode branch goes
    // through it. No `driveCycle` is injected, so the handler builds its own production driver —
    // and that is where a missing autonomy check would let an unconfirmable engine start a stage
    // unattended. A real (empty) git repository, because the driver anchors on its main checkout.
    repo = realpathSync(mkdtempSync(join(tmpdir(), 'pair-card-autonomy-')))
    execFileSync('git', ['init', '-q'], { cwd: repo, stdio: 'ignore' })
    vi.stubEnv('PATH', `/bin:${process.env['PATH'] ?? ''}`)
    vi.spyOn(console, 'log').mockImplementation(() => {})

    const fs = new InMemoryFileSystemService(
      {
        [`${repo}/config.json`]: JSON.stringify({
          asset_registries: {
            skills: {
              source: '.skills',
              behavior: 'overwrite',
              description: 'skills',
              prefix: 'pair',
              targets: [{ path: '.claude/skills/', mode: 'canonical' }],
            },
          },
        }),
        // `unmapped` (a mapping declared, the eligible card carries no mapped tag, a Ready card): one of
        // the entries the AC14 DoR fallback routes to the delivery cycle.
        [`${repo}/${POLICY_PATH}`]:
          '## Eligibility\n\nrisk:green\n\n## Stop Predicate\n\ntag:risk:red ⇒ Done\nmax-iterations: 20\n\n## Workflows\n\nauto-dev ⇒ pair-loop\n',
        [`${repo}/.claude/skills/pair-loop/SKILL.md`]: '',
        [`${repo}/.claude/skills/pair-workflow-cycle/SKILL.md`]: '',
        [`${repo}/.claude/skills/pair-workflow-cycle/scripts/cycle-state.mjs`]: '',
        [`${repo}/.claude/skills/pair-workflow-cycle/scripts/cycle-dispatch.mjs`]: '',
        '/bin/pi': '',
      },
      repo,
      repo,
    )
    const spawned: unknown[] = []
    const runIteration: IterationRunner = async input => {
      spawned.push(input)
      return { outcome: 'success', detail: 'done' }
    }
    const acquireLock = (({ card }: { card: string }) => ({
      kind: 'acquired' as const,
      lock: { path: `/locks/${card}`, release: () => {} },
    })) as LockAcquirer

    await expect(
      handleRunCommand(parseRunCommand({ card: '218', cardTags: 'risk:green', engine: 'pi' }), fs, {
        runIteration,
        acquireLock,
        appendAudit: () => {},
        cardReadiness: async () => 'ready' as const,
      }),
    ).rejects.toThrow(/cannot run with confirmations active/)
    expect(spawned).toHaveLength(0)
  })
})

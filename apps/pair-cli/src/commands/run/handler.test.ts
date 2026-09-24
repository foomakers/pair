import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest'
import { chmodSync, mkdtempSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { InMemoryFileSystemService } from '@pair/content-ops'
import { handleRunCommand, type IterationRunner } from './handler'
import type { LockAcquirer } from './card-lock'
import { parseRunCommand } from './parser'
import { POLICY_PATH } from './automation-policy'
import type { IterationResult } from './stream-reader'

const cwd = '/project'
/** A PATH directory that exists only in the in-memory project — never on the real disk. */
const ENGINE_ONLY_BIN = '/pair-test-engines-only/bin'

const POLICY = `## Eligibility

risk:green

## Stop Predicate

tag:risk:red ⇒ Done
max-iterations: 20

## Max Parallelism

3
`

/**
 * A project with the CLI's base config, the skills registry, `pair-loop` installed and every
 * engine on PATH — so each test can be about the ONE thing it names.
 */
function projectFs(files: Record<string, string> = {}) {
  return new InMemoryFileSystemService(
    {
      [`${cwd}/config.json`]: JSON.stringify({
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
      [`${cwd}/.claude/skills/pair-loop/SKILL.md`]: '',
      '/bin/claude': '',
      '/bin/pi': '',
      '/bin/opencode': '',
      [`${ENGINE_ONLY_BIN}/claude`]: '',
      [`${ENGINE_ONLY_BIN}/pi`]: '',
      [`${ENGINE_ONLY_BIN}/opencode`]: '',
      ...files,
    },
    cwd,
    cwd,
  )
}

/** Records every iteration the handler drives, and returns scripted stream outcomes. */
function fakeRunner(results: IterationResult[]) {
  const calls: Array<Parameters<IterationRunner>[0]> = []
  const runner: IterationRunner = async input => {
    calls.push(input)
    return results[calls.length - 1] ?? { outcome: 'success', detail: 'done' }
  }
  return { calls, runner }
}

/** Captures the handler's pre-spawn report, so a test can assert what an operator would read. */
function captureLog() {
  const lines: string[] = []
  vi.spyOn(console, 'log').mockImplementation((...args: unknown[]) => {
    lines.push(args.map(String).join(' '))
  })
  return () => lines.join('\n')
}

/**
 * A `gh` that is on PATH but cannot read anything (unauthenticated), first on a real PATH so a
 * host `gh` can never answer instead — the hermetic stand-in for a hosted runner before `gh auth`.
 * The in-memory engine probe still finds `/bin/<engine>` behind it.
 */
function unauthenticatedGhOnPath(): void {
  const bin = mkdtempSync(join(tmpdir(), 'pair-no-gh-'))
  writeFileSync(
    join(bin, 'gh'),
    '#!/bin/sh\necho "To get started with GitHub CLI, please run:  gh auth login" >&2\nexit 4\n',
  )
  chmodSync(join(bin, 'gh'), 0o755)
  vi.stubEnv('PATH', `${bin}:/bin`)
}

/**
 * No `gh` anywhere on PATH: the only entry is a directory that exists solely in the in-memory
 * project (holding the engines), so the real `execFileSync('gh', …)` finds nothing (ENOENT) on any
 * host — a Linux `/bin` merged with `/usr/bin` could otherwise carry a real `gh`.
 */
function noGhOnPath(): void {
  vi.stubEnv('PATH', ENGINE_ONLY_BIN)
}

const ok = (continueToken?: string): IterationResult => ({
  outcome: 'success',
  detail: 'terminal event matched (success)',
  ...(continueToken !== undefined && { continueToken }),
})

describe('handleRunCommand — resolution reporting', () => {
  // Stubbed, not assigned: PATH is process-wide, and a leaked value would decide whether an
  // unrelated test in the same worker sees an engine as installed.
  beforeEach(() => vi.stubEnv('PATH', '/bin'))
  afterEach(() => {
    vi.unstubAllEnvs()
    vi.restoreAllMocks()
  })

  it('resolves the schema default with no flags and no pair.config.json (AC12)', async () => {
    const output = captureLog()

    await handleRunCommand(parseRunCommand({ root: '212', dryRun: true }), projectFs())

    expect(output()).toContain('(from schema default)')
  })

  it('prefers the engine declared in pair.config.json', async () => {
    const output = captureLog()
    const fs = projectFs({ [`${cwd}/pair.config.json`]: JSON.stringify({ engine: { id: 'pi' } }) })

    await handleRunCommand(
      parseRunCommand({ root: '212', dryRun: true, autonomous: true, approveProjectTrust: true }),
      fs,
    )

    expect(output()).toContain('Engine: pi — `pi --mode json` (from pair.config.json)')
  })

  it('lets --engine win over pair.config.json', async () => {
    const output = captureLog()
    const fs = projectFs({ [`${cwd}/pair.config.json`]: JSON.stringify({ engine: { id: 'pi' } }) })

    await handleRunCommand(parseRunCommand({ engine: 'opencode', root: '212', dryRun: true }), fs)

    expect(output()).toContain('(from --engine)')
  })

  it('refuses a malformed engine block rather than degrading to the default', async () => {
    captureLog()
    const fs = projectFs({
      [`${cwd}/pair.config.json`]: JSON.stringify({ engine: { id: 'opencde' } }),
    })

    await expect(handleRunCommand(parseRunCommand({ root: '212' }), fs)).rejects.toThrow(
      /engine\.id: unknown engine 'opencde'/,
    )
  })

  it('fails with an actionable message when the engine is not on PATH', async () => {
    captureLog()
    vi.stubEnv('PATH', '/empty')

    await expect(
      handleRunCommand(parseRunCommand({ engine: 'opencode', root: '212' }), projectFs()),
    ).rejects.toThrow(/Engine 'opencode' is not installed or not on PATH/)
  })

  it('states the perimeter, the borrowed policy and the parallelism limit before running', async () => {
    const output = captureLog()
    const fs = projectFs({ [`${cwd}/${POLICY_PATH}`]: POLICY })

    await handleRunCommand(parseRunCommand({ root: '212', maxIterations: '2', dryRun: true }), fs)

    const printed = output()
    // pair-loop READS `## Eligibility` itself, so the line says who applies the label — it does
    // not claim the driver passed a --filter (round 1, finding 1).
    expect(printed).toContain(
      'Perimeter: root 212, eligibility risk:green (from tech/automation.md, applied by the skill itself)',
    )
    expect(printed).toContain('max 2 iteration(s) (from --max-iterations)')
    expect(printed).toContain('policy declares max 3')
    // `## Auto-Advance` is absent in this fixture ⇒ (none) ⇒ every gate really is human.
    expect(printed).toContain('the driver never merges')
    expect(printed).toContain('(none)')
    expect(printed).not.toContain('the gate stays human')
  })

  it('normalises the perimeter directory to an absolute path (a boundary must be legible)', async () => {
    const output = captureLog()

    await handleRunCommand(
      parseRunCommand({ root: '212', cwd: '/project/./sub/..', dryRun: true }),
      projectFs(),
    )

    expect(output()).toContain('cwd /project ')
  })

  it('warns that automation is off when no policy file declares eligibility', async () => {
    const output = captureLog()

    await handleRunCommand(parseRunCommand({ root: '212', dryRun: true }), projectFs())

    expect(output()).toContain('automation is off')
  })
})

describe('handleRunCommand — refusals happen before any spawn', () => {
  beforeEach(() => vi.stubEnv('PATH', '/bin'))
  afterEach(() => {
    vi.unstubAllEnvs()
    vi.restoreAllMocks()
  })

  it('refuses to start without a perimeter, and spawns nothing (AC5)', async () => {
    vi.spyOn(console, 'log').mockImplementation(() => {})
    const { calls, runner } = fakeRunner([ok()])

    await expect(
      handleRunCommand(parseRunCommand({}), projectFs(), { runIteration: runner }),
    ).rejects.toThrow(/No work perimeter declared/)
    expect(calls).toHaveLength(0)
  })

  it('refuses an untrusted project on an engine whose trust is provisioned, spawning nothing (AC6)', async () => {
    vi.spyOn(console, 'log').mockImplementation(() => {})
    const { calls, runner } = fakeRunner([ok()])

    await expect(
      handleRunCommand(
        parseRunCommand({ engine: 'pi', root: '212', autonomous: true }),
        projectFs(),
        { runIteration: runner },
      ),
    ).rejects.toThrow(/does not trust this project/)
    expect(calls).toHaveLength(0)
  })

  it('refuses an engine with no confirmations unless --autonomous is explicit (AC6)', async () => {
    vi.spyOn(console, 'log').mockImplementation(() => {})
    const { calls, runner } = fakeRunner([ok()])

    await expect(
      handleRunCommand(parseRunCommand({ engine: 'pi', root: '212' }), projectFs(), {
        runIteration: runner,
      }),
    ).rejects.toThrow(/cannot run with confirmations active/)
    expect(calls).toHaveLength(0)
  })

  it('refuses --filter when the resolved skill declares none, spawning nothing (round 1, finding 1)', async () => {
    vi.spyOn(console, 'log').mockImplementation(() => {})
    // pair-loop is the installed cascade winner and declares no --filter: the flag would have been
    // accepted, dropped, and then PRINTED as the perimeter — a label the run does not apply.
    const fs = projectFs({ [`${cwd}/${POLICY_PATH}`]: POLICY })
    const { calls, runner } = fakeRunner([ok()])

    await expect(
      handleRunCommand(parseRunCommand({ filter: 'risk:yellow' }), fs, { runIteration: runner }),
    ).rejects.toThrow(/--filter cannot be honoured/)
    expect(calls).toHaveLength(0)
  })

  it('honours --filter for a skill that declares it, and passes it through', async () => {
    vi.spyOn(console, 'log').mockImplementation(() => {})
    const fs = projectFs({
      [`${cwd}/${POLICY_PATH}`]: POLICY,
      [`${cwd}/.claude/skills/pair-next/SKILL.md`]: '',
    })
    const { calls, runner } = fakeRunner([ok()])

    await handleRunCommand(
      parseRunCommand({ skill: 'pair-next', filter: 'risk:yellow', maxIterations: '1' }),
      fs,
      { runIteration: runner },
    )

    expect(calls[0]?.promptText).toBe('/pair-next --filter risk:yellow')
  })

  it('halts on a malformed policy before any spawn', async () => {
    vi.spyOn(console, 'log').mockImplementation(() => {})
    const fs = projectFs({
      [`${cwd}/${POLICY_PATH}`]: '## Eligibility\n\nrisk:green, risk:yellow\n',
    })
    const { calls, runner } = fakeRunner([ok()])

    await expect(
      handleRunCommand(parseRunCommand({ root: '212' }), fs, { runIteration: runner }),
    ).rejects.toThrow(/exactly one label/)
    expect(calls).toHaveLength(0)
  })

  /**
   * `$approval` end to end (US-464): `--autonomous` is ONE operator intent — "nobody is watching
   * this run" — and it must reach both axes it governs, the engine's permission posture and the
   * composed skill's approval round.
   */
  describe('threads --approval to a declaring skill under --autonomous', () => {
    const DECLARES = 'pair-capability-assess-stack'

    function withDeclaringSkill() {
      return projectFs({
        [`${cwd}/${POLICY_PATH}`]: POLICY,
        [`${cwd}/.claude/skills/${DECLARES}/SKILL.md`]: '',
      })
    }

    it('AC1: passes --approval auto in the prompt on an autonomous run', async () => {
      vi.spyOn(console, 'log').mockImplementation(() => {})
      const { calls, runner } = fakeRunner([ok()])

      await handleRunCommand(
        parseRunCommand({ skill: DECLARES, root: '212', maxIterations: '1', autonomous: true }),
        withDeclaringSkill(),
        { runIteration: runner },
      )

      expect(calls[0]?.promptText).toContain('--approval auto')
      // Both axes of the one flag, in the same run: the engine's posture AND the skill's round.
      expect(calls[0]?.autonomyArgs).not.toEqual([])
    })

    it('AC2: passes nothing on the non-autonomous path — byte-identical to pre-story', async () => {
      vi.spyOn(console, 'log').mockImplementation(() => {})
      const { calls, runner } = fakeRunner([ok()])

      await handleRunCommand(
        parseRunCommand({ skill: DECLARES, root: '212', filter: 'risk:green', maxIterations: '1' }),
        withDeclaringSkill(),
        { runIteration: runner },
      )

      // The WHOLE prompt, not merely "does not contain --approval": the no-drift guarantee is about
      // the rendered bytes, and an assertion on absence alone would pass while the rest shifted.
      expect(calls[0]?.promptText).toBe(`/${DECLARES} --root 212 --filter risk:green`)
      expect(calls[0]?.autonomyArgs).toEqual([])
    })

    it('AC3: passes nothing to a skill that declares no approval, even under --autonomous', async () => {
      vi.spyOn(console, 'log').mockImplementation(() => {})
      const fs = projectFs({ [`${cwd}/${POLICY_PATH}`]: POLICY })
      const { calls, runner } = fakeRunner([ok()])

      await handleRunCommand(
        parseRunCommand({ root: '212', maxIterations: '1', autonomous: true }),
        fs,
        { runIteration: runner },
      )

      // Resolved through the cascade to `pair-loop`, which declares no approval round.
      expect(calls[0]?.promptText).toBe(
        '/pair-loop --root 212 --predicate "tag:risk:red ⇒ Done" --iteration 1',
      )
    })

    it('AC6: the dry run states the posture before anything spawns', async () => {
      const output = captureLog()

      await handleRunCommand(
        parseRunCommand({ skill: DECLARES, root: '212', dryRun: true, autonomous: true }),
        withDeclaringSkill(),
      )

      expect(output()).toContain(
        `Approval: --approval auto will be passed (${DECLARES} declares it`,
      )
    })

    it('AC6: the dry run states the interactive default when not autonomous', async () => {
      const output = captureLog()

      await handleRunCommand(
        parseRunCommand({ skill: DECLARES, root: '212', dryRun: true }),
        withDeclaringSkill(),
      )

      expect(output()).toContain(`keeps its interactive default`)
    })

    it('AC6: says nothing about approval for a skill that declares none', async () => {
      const output = captureLog()

      await handleRunCommand(parseRunCommand({ root: '212', dryRun: true }), projectFs())

      expect(output()).not.toContain('Approval:')
    })
  })

  it('spawns nothing on a dry run', async () => {
    vi.spyOn(console, 'log').mockImplementation(() => {})
    const { calls, runner } = fakeRunner([ok()])

    const code = await handleRunCommand(
      parseRunCommand({ root: '212', dryRun: true }),
      projectFs(),
      {
        runIteration: runner,
      },
    )

    expect(code).toBe(0)
    expect(calls).toHaveLength(0)
  })
})

describe('handleRunCommand — driving the loop', () => {
  beforeEach(() => vi.stubEnv('PATH', '/bin'))
  afterEach(() => {
    vi.unstubAllEnvs()
    vi.restoreAllMocks()
  })

  it('drives fresh iterations with the perimeter and the borrowed parameters', async () => {
    vi.spyOn(console, 'log').mockImplementation(() => {})
    const fs = projectFs({ [`${cwd}/${POLICY_PATH}`]: POLICY })
    const { calls, runner } = fakeRunner([ok('pair-loop --root 212 --iteration 2'), ok()])

    const code = await handleRunCommand(parseRunCommand({ root: '212', maxIterations: '5' }), fs, {
      runIteration: runner,
    })

    expect(code).toBe(0)
    expect(calls).toHaveLength(2)
    // The multi-word predicate is QUOTED, as pair-loop's own SKILL.md renders it — the previous
    // expectation pinned the malformed spelling (round 1, finding 2).
    expect(calls[0]?.promptText).toBe(
      '/pair-loop --root 212 --predicate "tag:risk:red ⇒ Done" --iteration 1',
    )
    // And no --filter is passed to a skill that declares none, whatever the policy says.
    expect(calls[0]?.promptText).not.toContain('--filter')
    expect(calls[1]?.promptText).toContain('--iteration 2')
    expect(calls[0]?.cwd).toBe(cwd)
    // Confirmations active by default: no autonomy args reach the engine.
    expect(calls[0]?.autonomyArgs).toEqual([])
  })

  it('caps iterations at the perimeter, whatever the skill keeps reporting', async () => {
    vi.spyOn(console, 'log').mockImplementation(() => {})
    const fs = projectFs({ [`${cwd}/${POLICY_PATH}`]: POLICY })
    const { calls, runner } = fakeRunner([ok('t1'), ok('t2'), ok('t3'), ok('t4')])

    await handleRunCommand(parseRunCommand({ root: '212', maxIterations: '2' }), fs, {
      runIteration: runner,
    })

    expect(calls).toHaveLength(2)
  })

  it('reports a failed iteration with a non-zero exit code', async () => {
    vi.spyOn(console, 'log').mockImplementation(() => {})
    const { runner } = fakeRunner([{ outcome: 'failed', detail: 'no terminal event' }])

    const code = await handleRunCommand(parseRunCommand({ root: '212' }), projectFs(), {
      runIteration: runner,
    })

    expect(code).toBe(1)
  })

  it('passes an explicit --prompt through verbatim, bounded by its declared cwd (AC3)', async () => {
    vi.spyOn(console, 'log').mockImplementation(() => {})
    const { calls, runner } = fakeRunner([ok()])

    await handleRunCommand(
      parseRunCommand({ prompt: 'audit the backlog', cwd, maxIterations: '1' }),
      projectFs(),
      { runIteration: runner },
    )

    expect(calls[0]?.promptText).toBe('audit the backlog')
  })
})

// US-217 — tag-driven dispatch, end to end through the handler: the trigger's two facts in, a
// routed workflow (or a logged skip) out, and nothing spawned where nothing was declared. The lock
// and the audit writer are injected: both are real-filesystem primitives by design (atomic create,
// atomic append), and they have their own tests against a real temporary directory.
describe('handleRunCommand — tag-driven dispatch (US-217)', () => {
  const DISPATCH_POLICY = `${POLICY}
## Workflows

auto-dev ⇒ pair-loop
auto-plan ⇒ pair-process-plan-tasks
Precedence: auto-plan, auto-dev
`

  // r0-3 made the `## Max Parallelism` refusal unconditional in cycle mode, as AC7 states it. A
  // fixture that declares it can therefore no longer reach the coordinator — which is the point,
  // and is asserted on its own fixture below. The AC14 routing cases use this one instead: same
  // mapping, no loop-mode expectation to refuse.
  const DISPATCH_POLICY_NO_PARALLELISM = DISPATCH_POLICY.replace(/## Max Parallelism\n\n3\n/, '')

  const dispatchFs = (policy = DISPATCH_POLICY) =>
    projectFs({
      [`${cwd}/${POLICY_PATH}`]: policy,
      [`${cwd}/.claude/skills/pair-process-plan-tasks/SKILL.md`]: '',
      // r0-4 widened AC11's skill-missing HALT to BOTH fallback reasons, so the `unmapped` half of
      // AC14 now needs the cycle skill present like the `no-mapping-declared` half always did.
      // The HALT itself keeps its own fixture, which deliberately omits these.
      [`${cwd}/.claude/skills/pair-workflow-cycle/SKILL.md`]: '',
      [`${cwd}/.claude/skills/pair-workflow-cycle/scripts/cycle-state.mjs`]: '',
      [`${cwd}/.claude/skills/pair-workflow-cycle/scripts/cycle-dispatch.mjs`]: '',
    })

  /** Records what was audited, without touching a real working area. */
  function fakeAudit() {
    const entries: Array<{ path: string; line: string }> = []
    return { entries, append: (path: string, line: string) => entries.push({ path, line }) }
  }

  /** A lock that is either free or already held, and remembers acquire/release ordering. */
  function fakeLock(held = false) {
    const events: string[] = []
    const acquire: LockAcquirer = ({ card }) => {
      events.push(`acquire:${card}`)
      if (held) {
        return { kind: 'held', path: `/locks/${card}`, since: HELD_SINCE }
      }
      return {
        kind: 'acquired',
        lock: { path: `/locks/${card}`, release: () => events.push(`release:${card}`) },
      }
    }
    return { events, acquire }
  }

  /** Old enough that no run is plausibly still in flight — the stale-lock case, in one constant. */
  const HELD_SINCE = new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString()

  function deps(results: IterationResult[] = [ok()], held = false) {
    const { calls, runner } = fakeRunner(results)
    const audit = fakeAudit()
    const lock = fakeLock(held)
    return {
      calls,
      audit,
      lock,
      handler: { runIteration: runner, acquireLock: lock.acquire, appendAudit: audit.append },
    }
  }

  beforeEach(() => vi.stubEnv('PATH', '/bin'))
  afterEach(() => {
    vi.unstubAllEnvs()
    vi.restoreAllMocks()
  })

  it('routes an eligible, tagged card to its mapped workflow and runs it (AC1, AC3)', async () => {
    const output = captureLog()
    const { calls, handler } = deps()

    const code = await handleRunCommand(
      parseRunCommand({ card: '217', cardTags: 'auto-dev,risk:green' }),
      dispatchFs(),
      handler,
    )

    expect(code).toBe(0)
    expect(output()).toContain('tag auto-dev ⇒ workflow pair-loop')
    expect(calls).toHaveLength(1)
    // The card becomes the run's scope root — `pair-next`'s own parameter, borrowed, not invented.
    expect(calls[0]?.promptText).toContain('pair-loop')
    expect(calls[0]?.promptText).toContain('--root 217')
  })

  it('picks the workflow the declared precedence names on a card carrying two mapped tags', async () => {
    const output = captureLog()
    const { calls, handler } = deps()

    await handleRunCommand(
      parseRunCommand({ card: '217', cardTags: 'auto-dev,auto-plan,risk:green' }),
      dispatchFs(),
      handler,
    )

    expect(output()).toContain('workflow pair-process-plan-tasks')
    expect(calls[0]?.promptText).toContain('pair-process-plan-tasks')
  })

  it('runs NOTHING on a card carrying no mapped tag, and says why (AC2) — a Draft card (US-487 AC14 fallback: not yet Ready)', async () => {
    // US-487 AC14 changed what an `unmapped`/`no-mapping-declared` SKIP means: it is no longer
    // unconditionally "nothing runs" — the card's OWN readiness now decides. This fixture pins the
    // Draft sub-case, where US-217's original "nothing runs" claim still holds by a DIFFERENT
    // route: routed to the matching preparation skill instead, never silently dropped.
    const output = captureLog()
    const { calls, audit, handler } = deps()
    const cardReadiness = vi.fn(async () => 'draft' as const)

    const code = await handleRunCommand(
      parseRunCommand({ card: '218', cardTags: 'risk:green' }),
      dispatchFs(),
      { ...handler, cardReadiness },
    )

    expect(code).toBe(0)
    expect(cardReadiness).toHaveBeenCalledWith('218')
    expect(output()).toContain('pair-process-refine-story')
    expect(output()).toContain('Draft')
    // Routed to the preparation skill exactly as a mapped workflow would be — one engine dispatch,
    // never the delivery-cycle coordinator (AC14: "routed... instead of entering prepare").
    expect(calls).toHaveLength(1)
    expect(calls[0]?.promptText).toContain('pair-process-refine-story')
    // A route that spawns is never audited as a skip (a0 repair, AC14-G2).
    expect(audit.entries.some(entry => entry.line.includes('event=skip'))).toBe(false)
  })

  it('AC14: a Refined card with no task breakdown routes to pair-process-plan-tasks instead of entering prepare', async () => {
    const output = captureLog()
    const { calls, handler } = deps()
    const cardReadiness = vi.fn(async () => 'refined-no-breakdown' as const)

    await handleRunCommand(parseRunCommand({ card: '218', cardTags: 'risk:green' }), dispatchFs(), {
      ...handler,
      cardReadiness,
    })

    expect(output()).toContain('pair-process-plan-tasks')
    expect(calls[0]?.promptText).toContain('pair-process-plan-tasks')
  })

  it("AC14: a Ready card (DoR satisfied) with no mapping match starts THIS story's cycle coordinator, never a prep skill", async () => {
    const output = captureLog()
    const { handler } = deps()
    const cardReadiness = vi.fn(async () => 'ready' as const)
    const driveCycle = vi.fn(async () => ({ status: 'ready-for-merge', stagesRun: 3 }))

    const code = await handleRunCommand(
      parseRunCommand({ card: '218', cardTags: 'risk:green' }),
      dispatchFs(DISPATCH_POLICY_NO_PARALLELISM),
      { ...handler, cardReadiness, driveCycle },
    )

    expect(driveCycle).toHaveBeenCalledTimes(1)
    expect(code).toBe(0)
    expect(output()).not.toContain('pair-process-refine-story')
    expect(output()).not.toContain('pair-process-plan-tasks')
  })

  it('AC14: `## Workflows` declared and the card carries the mapped tag ⇒ US-217 wins unchanged, the cycle coordinator never starts', async () => {
    // Precedence, never presence/absence alone (Assumption 2 (a)): even a card that WOULD be Ready
    // is not consulted for readiness at all when a route already matched — the mapping wins outright.
    const { handler } = deps()
    const cardReadiness = vi.fn(async () => 'ready' as const)
    const driveCycle = vi.fn(async () => ({ status: 'ready-for-merge', stagesRun: 3 }))

    await handleRunCommand(
      parseRunCommand({ card: '217', cardTags: 'auto-dev,risk:green' }),
      dispatchFs(),
      { ...handler, cardReadiness, driveCycle },
    )

    expect(driveCycle).not.toHaveBeenCalled()
    expect(cardReadiness).not.toHaveBeenCalled()
  })

  it('runs nothing on a mapped but ineligible card, and logs the skip (BR3)', async () => {
    const output = captureLog()
    const { calls, audit, handler } = deps()

    await handleRunCommand(
      parseRunCommand({ card: '219', cardTags: 'auto-dev' }),
      dispatchFs(),
      handler,
    )

    expect(calls).toHaveLength(0)
    expect(output()).toContain('ineligible')
    expect(audit.entries[0]?.line).toContain('reason=ineligible')
  })

  it('exits cleanly with "no mapping declared" when the adoption declares no workflows (AC4) — Draft fallback (US-487 AC14)', async () => {
    const output = captureLog()
    const { calls, handler } = deps()
    const cardReadiness = vi.fn(async () => 'draft' as const)

    const code = await handleRunCommand(
      parseRunCommand({ card: '217', cardTags: 'auto-dev,risk:green' }),
      dispatchFs(POLICY),
      { ...handler, cardReadiness },
    )

    expect(code).toBe(0)
    expect(output()).toContain('no mapping declared')
    // Draft ⇒ routed to the preparation skill, exactly as the `unmapped` Draft case above — the
    // TWO skip reasons `no-mapping-declared` and `unmapped` share the SAME DoR-gated fallback
    // (AC14's second half applies to both).
    expect(calls).toHaveLength(1)
    expect(calls[0]?.promptText).toContain('pair-process-refine-story')
  })

  // The card-reading half of AC14 on the SHIPPED default — no `tech/automation.md` at all — and on a
  // present automation.md that declares no `## Workflows`: both are `no-mapping-declared`, neither
  // declares `## Eligibility`, so nothing stands in the fallback's way and a READABLE card is routed
  // by its own macrostate (maintainer decision 2026-09-22 (1): AC14 stands exactly as written).
  const cycleSkill = {
    [`${cwd}/.claude/skills/pair-workflow-cycle/SKILL.md`]: '',
    [`${cwd}/.claude/skills/pair-workflow-cycle/scripts/cycle-state.mjs`]: '',
    [`${cwd}/.claude/skills/pair-workflow-cycle/scripts/cycle-dispatch.mjs`]: '',
  }
  const noMappingProjects = [
    { name: 'NO automation.md at all (the shipped default)', files: {} },
    {
      name: '`## Workflows` absent from a PRESENT automation.md',
      files: { [`${cwd}/${POLICY_PATH}`]: '## Stop Predicate\n\ntag:risk:red ⇒ Done\n' },
    },
  ]

  for (const project of noMappingProjects) {
    it(`AC14 (${project.name}): a READABLE Ready card starts the delivery cycle — no mapping declared is not "card never read"`, async () => {
      captureLog()
      const { calls, handler } = deps()
      const cardReadiness = vi.fn(async () => 'ready' as const)
      const driveCycle = vi.fn(async () => ({ status: 'ready-for-merge', stagesRun: 1 }))

      const code = await handleRunCommand(
        parseRunCommand({ card: '217', cardTags: 'auto-dev' }),
        projectFs({ ...project.files, ...cycleSkill }),
        { ...handler, cardReadiness, driveCycle },
      )

      expect(code).toBe(0)
      expect(cardReadiness).toHaveBeenCalledWith('217')
      expect(driveCycle).toHaveBeenCalledTimes(1)
      expect(calls).toHaveLength(0)
    })
  }

  // AC14-G1 — the ONE class where AC14 and the DoD's "github-dispatch-adapter smoke unchanged" meet
  // (maintainer decision 2026-09-22 (1)): no mapping declared AND the card is UNREADABLE (`gh`
  // missing, or on PATH but unauthenticated) ⇒ a clean skip: exit 0, the reason printed, nothing
  // spawned, no DISPATCH-RECORD. The PRODUCTION readiness probe is used (no `cardReadiness`
  // injected), so the tracker call really happens and really fails.
  const unreadableTrackers = [
    { name: '`gh` on PATH but unauthenticated', arrange: () => unauthenticatedGhOnPath() },
    { name: 'no `gh` on PATH at all', arrange: () => noGhOnPath() },
  ]
  for (const project of noMappingProjects) {
    for (const tracker of unreadableTrackers) {
      it(`AC14-G1 (${project.name}, ${tracker.name}): the card is unreadable ⇒ a clean skip — exit 0, "no mapping declared" and card-unreadable printed, nothing spawned, no DISPATCH-RECORD`, async () => {
        tracker.arrange()
        const output = captureLog()
        const { calls, handler } = deps()
        const driveCycle = vi.fn(async () => ({ status: 'ready-for-merge', stagesRun: 1 }))

        const code = await handleRunCommand(
          parseRunCommand({ card: '217', cardTags: 'auto-dev' }),
          projectFs({ ...project.files, ...cycleSkill }),
          { ...handler, driveCycle },
        )

        expect(code).toBe(0)
        expect(output()).toContain('no mapping declared')
        // The reason is SAID, never swallowed: the skip names that the card could not be read.
        expect(output()).toContain('card-unreadable')
        expect(output()).not.toMatch(/^DISPATCH-RECORD:/m)
        expect(calls).toHaveLength(0)
        expect(driveCycle).not.toHaveBeenCalled()
      })
    }
  }

  // AC14-G1 × AC15 (a0 repair, mechanism `unreadable-under-declared-eligibility`): this repository's
  // own shape — `## Eligibility` declared WITHOUT `## Workflows` — is still `no-mapping-declared`.
  // Every AC15 gate state that lets the fallback READ the card (the label carried; label absent on a
  // SUPERVISED run; label absent + `--autonomous --approve-ineligible`) meets the same unreadable
  // tracker, and the answer is the same clean skip — never a card-unreadable throw (exit 1) just
  // because an eligibility label is declared.
  const eligibilityOnly = {
    [`${cwd}/${POLICY_PATH}`]: '## Eligibility\n\nrisk:green\n',
  }
  const readingGateStates = [
    {
      name: 'the card CARRIES the declared label (autonomous)',
      options: { card: '217', cardTags: 'risk:green', autonomous: true },
    },
    {
      name: 'label absent, SUPERVISED',
      options: { card: '217', cardTags: 'risk:red' },
    },
    {
      name: 'label absent, --autonomous --approve-ineligible',
      options: { card: '217', cardTags: 'risk:red', autonomous: true, approveIneligible: true },
    },
  ]
  for (const state of readingGateStates) {
    for (const tracker of unreadableTrackers) {
      it(`AC14-G1 (\`## Eligibility\` declared, no \`## Workflows\`; ${state.name}; ${tracker.name}): the card is unreadable ⇒ a clean skip — exit 0, "no mapping declared" and card-unreadable printed, nothing spawned, no DISPATCH-RECORD`, async () => {
        tracker.arrange()
        const output = captureLog()
        const { calls, handler } = deps()
        const driveCycle = vi.fn(async () => ({ status: 'ready-for-merge', stagesRun: 1 }))

        const code = await handleRunCommand(
          parseRunCommand(state.options),
          projectFs({ ...eligibilityOnly, ...cycleSkill }),
          { ...handler, driveCycle },
        )

        expect(code).toBe(0)
        expect(output()).toContain('no mapping declared')
        expect(output()).toContain('card-unreadable')
        expect(output()).not.toMatch(/^DISPATCH-RECORD:/m)
        expect(calls).toHaveLength(0)
        expect(driveCycle).not.toHaveBeenCalled()
      })
    }
  }

  it('AC14 (card unreadable under the fallback): a DECLARED mapping, an unmapped card and no reachable `gh` fail closed, typed card-unreadable — nothing spawned, never a guessed macrostate', async () => {
    // Where a mapping IS declared the fallback applies and needs the card's own macrostate. A
    // tracker that cannot be read is not "Draft" and not "Ready": the run refuses, naming why.
    unauthenticatedGhOnPath()
    captureLog()
    const { calls, handler } = deps()
    const driveCycle = vi.fn(async () => ({ status: 'ready-for-merge', stagesRun: 1 }))

    await expect(
      handleRunCommand(
        parseRunCommand({ card: '218', cardTags: 'risk:green' }),
        dispatchFs(DISPATCH_POLICY_NO_PARALLELISM),
        { ...handler, driveCycle },
      ),
    ).rejects.toThrow(/card-unreadable/)
    expect(calls).toHaveLength(0)
    expect(driveCycle).not.toHaveBeenCalled()
  })

  describe('AC14 — a fallback route reports which route and why, and is never reported or audited as a skip', () => {
    // Both no-mapping reasons reach the same DoR-gated fallback (AC14): `unmapped` (a mapping
    // declared, the eligible card carries no mapped tag) and `no-mapping-declared` (here: the shipped
    // default, no automation.md at all, so no `## Eligibility` stands in the way).
    const entries = [
      {
        reason: 'unmapped',
        printed: 'unmapped',
        tags: 'risk:green',
        fs: () => dispatchFs(DISPATCH_POLICY_NO_PARALLELISM),
      },
      {
        reason: 'no-mapping-declared',
        printed: 'no mapping declared',
        tags: '',
        fs: () =>
          projectFs({
            ...cycleSkill,
            [`${cwd}/.claude/skills/pair-process-plan-tasks/SKILL.md`]: '',
          }),
      },
    ]
    const routes = [
      { readiness: 'draft' as const, route: 'pair-process-refine-story' },
      { readiness: 'refined-no-breakdown' as const, route: 'pair-process-plan-tasks' },
    ]
    for (const entry of entries) {
      for (const { readiness, route } of routes) {
        it(`${entry.reason}, ${readiness} ⇒ ${route}: the route and the reason are printed; no "Nothing was spawned.", no skip record`, async () => {
          const output = captureLog()
          const { calls, audit, handler } = deps()

          const code = await handleRunCommand(
            parseRunCommand({ card: '218', cardTags: entry.tags }),
            entry.fs(),
            { ...handler, cardReadiness: async () => readiness },
          )

          expect(code).toBe(0)
          expect(calls).toHaveLength(1)
          expect(output()).toContain(route)
          expect(output()).toContain(entry.printed)
          expect(output()).toMatch(/Definition of Ready/)
          expect(output()).not.toContain('Nothing was spawned.')
          expect(audit.entries.some(line => line.line.includes('event=skip'))).toBe(false)
        })
      }

      it(`${entry.reason}, ready ⇒ the delivery cycle: the route and the reason are printed; no "Nothing was spawned.", no skip record`, async () => {
        const output = captureLog()
        const { audit, handler } = deps()
        const driveCycle = vi.fn(async () => ({ status: 'ready-for-merge', stagesRun: 1 }))

        const code = await handleRunCommand(
          parseRunCommand({ card: '218', cardTags: entry.tags }),
          entry.fs(),
          { ...handler, cardReadiness: async () => 'ready' as const, driveCycle },
        )

        expect(code).toBe(0)
        expect(driveCycle).toHaveBeenCalledTimes(1)
        expect(output()).toMatch(/delivery cycle/i)
        expect(output()).toContain(entry.printed)
        expect(output()).toMatch(/Ready/)
        expect(output()).not.toContain('Nothing was spawned.')
        expect(audit.entries.some(line => line.line.includes('event=skip'))).toBe(false)
      })
    }
  })

  it('HALTs before spawning when a mapped workflow is not installed', async () => {
    captureLog()
    const { calls, handler } = deps()
    const fs = projectFs({ [`${cwd}/${POLICY_PATH}`]: DISPATCH_POLICY })

    await expect(
      handleRunCommand(
        parseRunCommand({ card: '217', cardTags: 'auto-dev,risk:green' }),
        fs,
        handler,
      ),
    ).rejects.toThrow(/pair-process-plan-tasks.*not installed/s)
    expect(calls).toHaveLength(0)
  })

  it('resolves and prints the route under --dry-run, spawning nothing and writing nothing', async () => {
    const output = captureLog()
    const { calls, audit, lock, handler } = deps()

    await handleRunCommand(
      parseRunCommand({ card: '217', cardTags: 'auto-dev,risk:green', dryRun: true }),
      dispatchFs(),
      handler,
    )

    expect(output()).toContain('tag auto-dev ⇒ workflow pair-loop')
    expect(output()).toContain('(from the `## Workflows` mapping)')
    expect(calls).toHaveLength(0)
    expect(audit.entries).toHaveLength(0)
    expect(lock.events).toHaveLength(0)
  })

  describe('the audit trail (AC3)', () => {
    it('appends start and end records under the resolved audit location', async () => {
      captureLog()
      const { audit, handler } = deps()

      await handleRunCommand(
        parseRunCommand({ card: '217', cardTags: 'auto-dev,risk:green' }),
        dispatchFs(),
        handler,
      )

      expect(audit.entries.map(entry => entry.path)).toEqual([
        '/project/.pair/working/automation/loop-audit.md',
        '/project/.pair/working/automation/loop-audit.md',
      ])
      expect(audit.entries[0]?.line).toContain(
        'event=start card=217 tag=auto-dev workflow=pair-loop',
      )
      expect(audit.entries[1]?.line).toContain('event=end')
      expect(audit.entries[1]?.line).toContain('outcome=completed')
    })

    it('prints the DISPATCH-RECORD line a host adapter posts on the card', async () => {
      const output = captureLog()
      const { handler } = deps()

      await handleRunCommand(
        parseRunCommand({ card: '217', cardTags: 'auto-dev,risk:green' }),
        dispatchFs(),
        handler,
      )

      expect(output()).toMatch(/^DISPATCH-RECORD: .*event=start card=217/m)
    })

    it('records a failed run as such, rather than leaving the trail claiming it started', async () => {
      captureLog()
      const { audit, handler } = deps([{ outcome: 'failed', detail: 'no terminal event' }])

      await handleRunCommand(
        parseRunCommand({ card: '217', cardTags: 'auto-dev,risk:green' }),
        dispatchFs(),
        handler,
      )

      expect(audit.entries[1]?.line).toContain('outcome=failed')
    })
  })

  describe('the concurrency guard (never two runs on one card)', () => {
    it('skips a dispatch whose card is already locked, and spawns nothing', async () => {
      const output = captureLog()
      const { calls, audit, handler } = deps([ok()], true)

      const code = await handleRunCommand(
        parseRunCommand({ card: '217', cardTags: 'auto-dev,risk:green' }),
        dispatchFs(),
        handler,
      )

      expect(code).toBe(0)
      expect(calls).toHaveLength(0)
      expect(output()).toContain('run-in-progress')
      expect(audit.entries[0]?.line).toContain('reason=run-in-progress')
    })

    it('reports the holder the acquirer named, and how long it has held the card', async () => {
      // The path comes from the ACQUIRER, never re-derived at the call site: an operator chasing a
      // stale lock must be sent to the directory this run actually probed. The age is what tells
      // them it IS stale — a killed run leaves the lock behind and nothing ever reaps it.
      const output = captureLog()
      const { handler } = deps([ok()], true)

      await handleRunCommand(
        parseRunCommand({ card: '217', cardTags: 'auto-dev,risk:green' }),
        dispatchFs(),
        handler,
      )

      expect(output()).toContain('/locks/217')
      expect(output()).toMatch(/held 3h \d+m/)
      expect(output()).toMatch(/stale/)
    })

    it('takes the lock before spawning and releases it after the run', async () => {
      captureLog()
      const { lock, handler } = deps()

      await handleRunCommand(
        parseRunCommand({ card: '217', cardTags: 'auto-dev,risk:green' }),
        dispatchFs(),
        handler,
      )

      expect(lock.events).toEqual(['acquire:217', 'release:217'])
    })

    it('releases the lock even when the run throws — a crash must not park the card', async () => {
      captureLog()
      const { lock, audit, handler } = deps()
      const exploding: IterationRunner = () => Promise.reject(new Error('engine exploded'))

      await expect(
        handleRunCommand(
          parseRunCommand({ card: '217', cardTags: 'auto-dev,risk:green' }),
          dispatchFs(),
          { ...handler, runIteration: exploding },
        ),
      ).rejects.toThrow('engine exploded')
      expect(lock.events).toEqual(['acquire:217', 'release:217'])
      // ...and the TRAIL says so. A trail that stops at `event=start` reads identically to a run
      // still in flight, and the released lock leaves no second signal on the filesystem either —
      // so the operator reading it after an unattended night cannot tell the two apart.
      expect(audit.entries.map(entry => entry.line)).toEqual([
        expect.stringContaining('event=start card=217'),
        expect.stringContaining('event=end card=217'),
      ])
      expect(audit.entries[1]?.line).toContain('outcome=crashed')
    })

    it('keeps the crash visible when the `end` record itself cannot be written', async () => {
      // Both failures at once: the engine dies AND the audit file is unwritable (a full disk, a
      // `## Audit Location` pointing somewhere read-only). An unaudited run stays a hard failure —
      // but an operator handed only `EACCES: permission denied` would be debugging the wrong
      // machine, so the engine error is carried in the message and kept as the cause.
      captureLog()
      const { lock, handler } = deps()
      const exploding: IterationRunner = () => Promise.reject(new Error('engine exploded'))
      const crash = new Error('engine exploded')

      const failing = await handleRunCommand(
        parseRunCommand({ card: '217', cardTags: 'auto-dev,risk:green' }),
        dispatchFs(),
        {
          ...handler,
          runIteration: exploding,
          appendAudit: (_path, line) => {
            if (line.includes('event=end')) throw new Error('EACCES: audit file is read-only')
          },
        },
      ).catch((error: unknown) => error)

      expect(String(failing)).toContain('engine exploded')
      expect(String(failing)).toContain('EACCES')
      expect((failing as Error).cause).toBeInstanceOf(Error)
      expect(String((failing as Error).cause)).toContain(crash.message)
      // The lock is still released: a card parked by a double failure is the worst of both.
      expect(lock.events).toEqual(['acquire:217', 'release:217'])
    })

    it('reports an unwritable audit destination as a dispatch that never started, not as a crash', async () => {
      // The `start` record is the FIRST thing written, so a `## Audit Location` the process cannot
      // write (read-only mount, wrong ownership on a daemon box) makes the start write the thing
      // that throws. Reported as a crash it produced two false statements at once: that a run
      // crashed (no engine process was ever spawned) and that "the trail now stops at
      // `event=start`" (no start line was ever written — the file may not exist at all), sending
      // the operator to reconcile a run that never happened against a trail with no record of it.
      captureLog()
      const { calls, lock, handler } = deps()

      const failing = await handleRunCommand(
        parseRunCommand({ card: '217', cardTags: 'auto-dev,risk:green' }),
        dispatchFs(),
        {
          ...handler,
          appendAudit: () => {
            throw new Error("EACCES: permission denied, open '/ro/loop-audit.md'")
          },
        },
      ).catch((error: unknown) => error)

      expect(String(failing)).toContain('EACCES')
      expect(String(failing)).toContain('nothing was spawned')
      // The two false claims, named: neither may appear.
      expect(String(failing)).not.toContain('crashed')
      expect(String(failing)).not.toContain('event=start')
      // Nothing ran, and the card is left dispatchable for the next trigger.
      expect(calls).toHaveLength(0)
      expect(lock.events).toEqual(['acquire:217', 'release:217'])
    })
  })

  /**
   * The SKIP is the frequent path, and it had no message of its own.
   *
   * `start`/`end` were given worded failures above; the skip — the commonest outcome on a board,
   * and the one this feature promises "costs nothing" — wrote its record outside any try, so an
   * unwritable `## Audit Location` surfaced as a bare `EACCES: … open '…/audit.md'`: no card
   * number, no statement that nothing was spawned, no adoption-fix pointer. Fail-closed is kept
   * (an unaudited decision is not a mode) — what changes is that the operator is told which card,
   * that nothing ran, and where to fix it.
   */
  describe('an unauditable SKIP names the card, not just the filesystem', () => {
    const unwritable = (handler: Record<string, unknown>) => ({
      ...handler,
      appendAudit: () => {
        throw new Error("EACCES: permission denied, open '/ro/loop-audit.md'")
      },
    })

    it.each([
      ['unmapped', { card: '302', cardTags: '' }],
      ['ineligible', { card: '219', cardTags: 'auto-dev' }],
    ])('the pre-lock skip on an %s card', async (_reason, flags) => {
      captureLog()
      const { calls, handler } = deps()

      const failing = await handleRunCommand(
        parseRunCommand(flags),
        dispatchFs(),
        unwritable(handler),
      ).catch((error: unknown) => error)

      expect(String(failing)).toContain(`card ${flags.card}`)
      expect(String(failing)).toContain('could not be audited')
      expect(String(failing)).toContain('EACCES')
      expect(String(failing)).toContain('nothing was spawned')
      expect(String(failing)).toContain('audit destination')
      expect(calls).toHaveLength(0)
    })

    it('the lock-held skip, where a run IS in flight on the card', async () => {
      captureLog()
      const { calls, lock, handler } = deps([ok()], true)

      const failing = await handleRunCommand(
        parseRunCommand({ card: '217', cardTags: 'auto-dev,risk:green' }),
        dispatchFs(),
        unwritable(handler),
      ).catch((error: unknown) => error)

      expect(String(failing)).toContain('card 217')
      expect(String(failing)).toContain('could not be audited')
      expect(String(failing)).toContain('nothing was spawned')
      expect(calls).toHaveLength(0)
      // The holder's lock is NOT released by the run that failed to record its own skip.
      expect(lock.events).toEqual(['acquire:217'])
    })
  })
})

/**
 * US-487 — the delivery-cycle coordinator entry (`pair-cli run --card <id> [--pr] [--rounds]`),
 * reached exactly when AC14's discriminator lands on "start the cycle" (Ready, no mapping match).
 * `deps.driveCycle` is the SAME kind of seam `deps.runIteration` already is for loop mode: the
 * outermost collaborator a handler-level test can inject, so this suite proves WIRING (what the
 * handler decides to call, and what it prints before calling it) without re-proving `runCycle`'s
 * own state machine (that is `cycle.test.ts`'s job) or the script bridge (`cycle-scripts.test.ts`'s).
 */
/**
 * AC10's transparency block, one labelled line per value — engine AND where it came from, the skills
 * path the scripts were resolved from, the run directory, the worktree root, the runId, the
 * `--rounds` bound and the dispatch ceiling. US-514 T-3: the ceiling used to be
 * `cycle-state.mjs`'s own hard-coded `CAPS.dispatchesPerStory` (40); it is now `policy.maxDispatches`,
 * an ADOPTION value — `none` on every fixture in this file, none of which declares
 * `## Blocking Severities`.
 */
function assertTransparencyBlock(
  output: string,
  varying: { engine: RegExp; rounds: RegExp },
): void {
  expect(output).toMatch(varying.engine)
  expect(output).toMatch(/^\s*Scripts: \S*\.claude\/skills\/pair-workflow-cycle\/scripts\s*$/m)
  expect(output).toMatch(/^\s*Run dir: \S*\.pair\/working\/runs\/story-218\/218\s*$/m)
  expect(output).toMatch(/^\s*Worktree root: \S*pair-worktrees\s*$/m)
  expect(output).toMatch(/\brunId[=:]\s*story-218\b/)
  expect(output).toMatch(varying.rounds)
  expect(output).toMatch(/^\s*Dispatch ceiling: none\s*$/m)
}

describe('handleRunCommand — the delivery-cycle coordinator entry (US-487)', () => {
  // Carries neither `## Workflows` nor `## Eligibility`: a project that never opted into automation
  // at all, which is the case AC14's DoR fallback is FOR (the command is being typed by a human).
  // Keeping `## Eligibility` here while passing `cardTags: ''` would make every case below assert
  // that an INELIGIBLE card reaches the delivery cycle — the hole `dor-fallback-eligibility.test.ts`
  // exists to close, and not a property any test in this block is about.
  // `## Max Parallelism` is deliberately absent too: `assertNoLoopModeConcerns` refuses a policy
  // that declares it without `## Eligibility`, and the refusal has its own test below (`maxParallelismFs`).
  const NO_MAPPING_POLICY = `## Stop Predicate

tag:risk:red ⇒ Done
max-iterations: 20
`

  const cycleFs = () =>
    projectFs({
      [`${cwd}/${POLICY_PATH}`]: NO_MAPPING_POLICY,
      [`${cwd}/.claude/skills/pair-workflow-cycle/SKILL.md`]: '',
      [`${cwd}/.claude/skills/pair-workflow-cycle/scripts/cycle-state.mjs`]: '',
      [`${cwd}/.claude/skills/pair-workflow-cycle/scripts/cycle-dispatch.mjs`]: '',
    })

  function readyDeps() {
    const { calls, runner } = fakeRunner([ok()])
    const audit = {
      entries: [] as Array<{ path: string; line: string }>,
      append: (p: string, l: string) => audit.entries.push({ path: p, line: l }),
    }
    const lock = {
      acquire: (({ card }: { card: string }) => ({
        kind: 'acquired' as const,
        lock: { path: `/locks/${card}`, release: () => {} },
      })) as LockAcquirer,
    }
    const cardReadiness = vi.fn(async () => 'ready' as const)
    const driveCycle = vi.fn(async () => ({ status: 'ready-for-merge', stagesRun: 1 }))
    return {
      calls,
      audit,
      driveCycle,
      handler: {
        runIteration: runner,
        acquireLock: lock.acquire,
        appendAudit: audit.append,
        cardReadiness,
        driveCycle,
      },
    }
  }

  beforeEach(() => vi.stubEnv('PATH', '/bin'))
  afterEach(() => {
    vi.unstubAllEnvs()
    vi.restoreAllMocks()
  })

  it('AC10: prints the transparency block (engine, skills path, run dir, worktree root, runId, rounds bound, dispatch cap) before the FIRST spawn', async () => {
    const output = captureLog()
    const { handler, driveCycle } = readyDeps()
    driveCycle.mockImplementation(async () => {
      // The transparency block must already be on the console by the time the cycle would spawn
      // its first stage — "resolve and print, then act" (AC10, mirrors #451 AC1).
      // a0 repair (AC10-W1): each of the SEVEN values on its own labelled line, so removing any
      // one line fails this row — a bare `toContain('claude')` was satisfied by the scripts path.
      assertTransparencyBlock(output(), {
        engine: /^\s*Engine: claude\b.*\(from schema default\)\s*$/m,
        rounds: /^\s*Rounds bound: .*maxFixRounds/m,
      })
      return { status: 'ready-for-merge', stagesRun: 1 }
    })

    await handleRunCommand(parseRunCommand({ card: '218', cardTags: '' }), cycleFs(), handler)

    expect(driveCycle).toHaveBeenCalledTimes(1)
  })

  it('AC10: the engine line names where the engine came from, and the rounds line the explicit bound (--engine pi --rounds 1)', async () => {
    const output = captureLog()
    const { handler, driveCycle } = readyDeps()
    driveCycle.mockImplementation(async () => {
      assertTransparencyBlock(output(), {
        engine: /^\s*Engine: pi\b.*\(from --engine\)\s*$/m,
        rounds: /^\s*Rounds bound: 1\b/m,
      })
      return { status: 'ready-for-merge', stagesRun: 1 }
    })

    await handleRunCommand(
      parseRunCommand({
        card: '218',
        cardTags: '',
        engine: 'pi',
        rounds: '1',
        autonomous: true,
      }),
      cycleFs(),
      handler,
    )

    expect(driveCycle).toHaveBeenCalledTimes(1)
  })

  describe('AC12/AC8 — every non-merge terminal status is a non-zero exit that says why (a0 repair, AC12-G2)', () => {
    const stops = [
      {
        name: 'failed-prepare (dead dispatch, retry spent)',
        outcome: {
          status: 'failed-prepare',
          stagesRun: 2,
          next: { step: 'prepare', mode: 'initial', phase: 'a0', attempt: 1 },
        },
        printed: ['failed-prepare'],
      },
      {
        name: 'escalate (resolve blocked, a human decision owed)',
        outcome: {
          status: 'escalate',
          stagesRun: 3,
          next: {
            step: 'blocked',
            reason: 'escalate',
            detail: 'r1-g1 needs a maintainer decision on finding F-3',
          },
        },
        printed: ['escalate', 'r1-g1 needs a maintainer decision on finding F-3'],
      },
      {
        name: 'incompatible (legacy run directory)',
        outcome: {
          status: 'incompatible',
          stagesRun: 0,
          next: {
            step: 'blocked',
            reason: 'schemaVersion 2 != 3 in a0-red-spec',
            detail:
              'legacy run directory — bind a new one with cycle-state.mjs migrate-acknowledge',
          },
        },
        printed: ['incompatible', 'schemaVersion 2 != 3 in a0-red-spec', 'migrate-acknowledge'],
      },
    ]
    for (const stop of stops) {
      it(`${stop.name}: exit non-zero, the status and resolve's own reason printed verbatim`, async () => {
        const output = captureLog()
        const { handler, driveCycle } = readyDeps()
        driveCycle.mockImplementation(async () => stop.outcome as never)

        const code = await handleRunCommand(
          parseRunCommand({ card: '218', cardTags: '' }),
          cycleFs(),
          handler,
        )

        expect(code).not.toBe(0)
        for (const text of stop.printed) expect(output()).toContain(text)
      })
    }

    it('rounds-bound-reached (--rounds 1): exit non-zero, printing the NEXT step the bound stopped before (AC8)', async () => {
      const output = captureLog()
      const { handler, driveCycle } = readyDeps()
      driveCycle.mockImplementation(
        async () =>
          ({
            status: 'rounds-bound-reached',
            stagesRun: 4,
            next: { step: 'green', mode: 'remediation', phase: 'r2-g1', round: 2, attempt: 1 },
          }) as never,
      )

      const code = await handleRunCommand(
        parseRunCommand({ card: '218', cardTags: '', rounds: '1' }),
        cycleFs(),
        handler,
      )

      expect(code).not.toBe(0)
      expect(output()).toContain('rounds-bound-reached')
      // AC8: "exits printing the `next` step" — the step and the phase it would have dispatched.
      expect(output()).toMatch(/\bgreen\b/)
      expect(output()).toContain('r2-g1')
    })

    it('ready-for-merge is the one zero exit (control)', async () => {
      captureLog()
      const { handler } = readyDeps()

      const code = await handleRunCommand(
        parseRunCommand({ card: '218', cardTags: '' }),
        cycleFs(),
        handler,
      )

      expect(code).toBe(0)
    })
  })

  it('AC1/AC9: --run-id defaults to story-<id>, and reaches the cycle driver as the run identity', async () => {
    const { handler, driveCycle } = readyDeps()

    await handleRunCommand(parseRunCommand({ card: '218', cardTags: '' }), cycleFs(), handler)

    expect(driveCycle).toHaveBeenCalledWith(
      expect.objectContaining({ runId: 'story-218', card: '218' }),
    )
  })

  it('AC8: an explicit --rounds is carried to the cycle driver, never widened past it', async () => {
    const { handler, driveCycle } = readyDeps()

    await handleRunCommand(
      parseRunCommand({ card: '218', cardTags: '', rounds: '1' }),
      cycleFs(),
      handler,
    )

    expect(driveCycle).toHaveBeenCalledWith(expect.objectContaining({ rounds: 1 }))
  })

  it('AC2: an explicit --pr is carried to the cycle driver, so the FIRST dispatched stage is verify, never prepare', async () => {
    // Round 2 repair: AC2's own interaction ("--pr flag -> resolve --entry pr -> first dispatched
    // stage is verify, never prepare") was only proven at the SCRIPT layer (AC2-C1/AC2-W1,
    // `cycle-scripts.test.ts`) — nothing proved `handler.ts`'s card-mode branch actually threads
    // the parsed `--pr` value into `driveCycle`, unlike AC8's `--rounds` and AC1/AC9's `runId`.
    const { handler, driveCycle } = readyDeps()

    await handleRunCommand(
      parseRunCommand({ card: '218', cardTags: '', pr: '42' }),
      cycleFs(),
      handler,
    )

    expect(driveCycle).toHaveBeenCalledWith(expect.objectContaining({ pr: 42 }))
  })

  it('AC7: a DECLARED `## Max Parallelism` does NOT block the coordinator — it addresses pair-loop, not this run', async () => {
    // Rewritten 2026-09-22 with AC7 itself. Review finding r0-3 was right that the old guard
    // (`eligibility === undefined`) matched nothing the AC said; making the refusal unconditional —
    // the literal reading — then refused the coordinator on THIS repository, whose automation.md
    // declares `## Max Parallelism` for pair-loop. The letter of the AC made the feature
    // unreachable for every project that also runs a parallel loop.
    //
    // The distinction AC7 now draws: `--root`/`--filter` are arguments of THIS invocation, so
    // whoever passes one is asking this run for something the cycle does not do. A declared
    // `## Max Parallelism` is a key in a shared policy file addressed to ANOTHER consumer.
    captureLog()
    const { handler, driveCycle } = readyDeps()
    const maxParallelismFs = projectFs({
      [`${cwd}/${POLICY_PATH}`]: '## Max Parallelism\n\n3\n',
      [`${cwd}/.claude/skills/pair-workflow-cycle/SKILL.md`]: '',
      [`${cwd}/.claude/skills/pair-workflow-cycle/scripts/cycle-state.mjs`]: '',
      [`${cwd}/.claude/skills/pair-workflow-cycle/scripts/cycle-dispatch.mjs`]: '',
    })

    await handleRunCommand(
      parseRunCommand({ card: '218', cardTags: '' }),
      maxParallelismFs,
      handler,
    )

    expect(driveCycle).toHaveBeenCalledTimes(1)
  })

  it('AC7: --filter alongside --card is REFUSED once the card resolves to cycle-coordinator mode (Ready, no mapping) — a loop-mode concern', async () => {
    captureLog()
    const { handler, driveCycle } = readyDeps()

    await expect(
      handleRunCommand(
        parseRunCommand({ card: '218', cardTags: '', filter: 'risk:green' }),
        cycleFs(),
        handler,
      ),
    ).rejects.toThrow(/--filter/)
    expect(driveCycle).not.toHaveBeenCalled()
  })

  it('AC11: HALTs skill-missing, naming pair-workflow-cycle, when the entry resolves to cycle mode but the skill is not installed', async () => {
    captureLog()
    const { handler } = readyDeps()
    const fsWithoutSkill = projectFs({ [`${cwd}/${POLICY_PATH}`]: NO_MAPPING_POLICY })

    await expect(
      handleRunCommand(parseRunCommand({ card: '218', cardTags: '' }), fsWithoutSkill, handler),
    ).rejects.toThrow(/skill-missing.*pair-workflow-cycle/s)
  })

  it('AC9: a converged run reports "done" via the SAME driveCycle seam and spawns no NEW loop iteration', async () => {
    const { calls, handler, driveCycle } = readyDeps()
    driveCycle.mockImplementation(async () => ({ status: 'ready-for-merge', stagesRun: 0 }))

    const code = await handleRunCommand(
      parseRunCommand({ card: '218', cardTags: '' }),
      cycleFs(),
      handler,
    )

    expect(code).toBe(0)
    expect(calls).toHaveLength(0) // loop-mode's own `runIteration` is never touched by cycle mode
  })

  it('AC12: never merges — the handler holds no merge-capable collaborator on the cycle-entry path', async () => {
    const { handler, driveCycle } = readyDeps()

    await handleRunCommand(parseRunCommand({ card: '218', cardTags: '' }), cycleFs(), handler)

    // Structural: `deps` accepted by `handleRunCommand` carries no merge seam at all (see
    // `RunHandlerDependencies` — `driveCycle` returns a STATUS, never an action), so a converged
    // cycle cannot have called one.
    // `driveCycle` is an ASYNC mock: `toHaveReturnedWith` would compare against the Promise it
    // returns and pass for any resolved value. `toHaveResolvedWith` is what discriminates here.
    expect(driveCycle).toHaveResolvedWith(expect.objectContaining({ status: 'ready-for-merge' }))
  })
})

import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest'
import { InMemoryFileSystemService } from '@pair/content-ops'
import { handleRunCommand, type IterationRunner } from './handler'
import type { LockAcquirer } from './card-lock'
import { parseRunCommand } from './parser'
import { POLICY_PATH } from './automation-policy'
import type { IterationResult } from './stream-reader'

const cwd = '/project'

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
auto-refine ⇒ pair-process-refine-story
Precedence: auto-refine, auto-dev
`

  const dispatchFs = (policy = DISPATCH_POLICY) =>
    projectFs({
      [`${cwd}/${POLICY_PATH}`]: policy,
      [`${cwd}/.claude/skills/pair-process-refine-story/SKILL.md`]: '',
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
      if (held) return undefined
      return { path: `/locks/${card}`, release: () => events.push(`release:${card}`) }
    }
    return { events, acquire }
  }

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
      parseRunCommand({ card: '217', cardTags: 'auto-dev,auto-refine,risk:green' }),
      dispatchFs(),
      handler,
    )

    expect(output()).toContain('workflow pair-process-refine-story')
    expect(calls[0]?.promptText).toContain('pair-process-refine-story')
  })

  it('runs NOTHING on a card carrying no mapped tag, and says why (AC2)', async () => {
    const output = captureLog()
    const { calls, audit, handler } = deps()

    const code = await handleRunCommand(
      parseRunCommand({ card: '218', cardTags: 'risk:green' }),
      dispatchFs(),
      handler,
    )

    expect(code).toBe(0)
    expect(calls).toHaveLength(0)
    expect(output()).toContain('no mapped tag')
    expect(audit.entries[0]?.line).toContain('event=skip')
    expect(audit.entries[0]?.line).toContain('reason=unmapped')
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

  it('exits cleanly with "no mapping declared" when the adoption declares no workflows (AC4)', async () => {
    const output = captureLog()
    const { calls, handler } = deps()

    const code = await handleRunCommand(
      parseRunCommand({ card: '217', cardTags: 'auto-dev,risk:green' }),
      dispatchFs(POLICY),
      handler,
    )

    expect(code).toBe(0)
    expect(calls).toHaveLength(0)
    expect(output()).toContain('no mapping declared')
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
    ).rejects.toThrow(/pair-process-refine-story.*not installed/s)
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
      const { lock, handler } = deps()
      const exploding: IterationRunner = () => Promise.reject(new Error('engine exploded'))

      await expect(
        handleRunCommand(
          parseRunCommand({ card: '217', cardTags: 'auto-dev,risk:green' }),
          dispatchFs(),
          { ...handler, runIteration: exploding },
        ),
      ).rejects.toThrow('engine exploded')
      expect(lock.events).toEqual(['acquire:217', 'release:217'])
    })
  })
})

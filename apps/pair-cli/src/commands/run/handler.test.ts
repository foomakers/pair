import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest'
import { InMemoryFileSystemService } from '@pair/content-ops'
import { handleRunCommand, type IterationRunner } from './handler'
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

  function captureLog() {
    const lines: string[] = []
    vi.spyOn(console, 'log').mockImplementation((...args: unknown[]) => {
      lines.push(args.map(String).join(' '))
    })
    return () => lines.join('\n')
  }

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
    expect(printed).toContain('Perimeter: root 212, filter risk:green (from tech/automation.md)')
    expect(printed).toContain('max 2 iteration(s) (from --max-iterations)')
    expect(printed).toContain('policy declares max 3')
    expect(printed).toContain('Merge: never performed by the driver')
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
    expect(calls[0]?.promptText).toBe(
      '/pair-loop --root 212 --predicate tag:risk:red ⇒ Done --iteration 1',
    )
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

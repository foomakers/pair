import { describe, it, expect, vi, afterEach } from 'vitest'
import { InMemoryFileSystemService } from '@pair/content-ops'
import { handleRunCommand } from './handler'
import { parseRunCommand } from './parser'

const cwd = '/project'

/**
 * A project whose base `config.json` exists (the CLI's own, always loaded) plus whatever the
 * test wants on top — including, or deliberately excluding, a `pair.config.json`.
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
      // The cascade's preferred skill is installed, so these tests exercise engine resolution.
      [`${cwd}/.claude/skills/pair-loop/SKILL.md`]: '',
      ...files,
    },
    cwd,
    cwd,
  )
}

describe('handleRunCommand — resolution reporting', () => {
  afterEach(() => vi.restoreAllMocks())

  function captureLog() {
    const lines: string[] = []
    vi.spyOn(console, 'log').mockImplementation((...args: unknown[]) => {
      lines.push(args.map(String).join(' '))
    })
    return () => lines.join('\n')
  }

  it('resolves the schema default with no flags and no pair.config.json (AC12)', async () => {
    const output = captureLog()
    // Every executable is present, so availability is not what this test is about.
    const fs = projectFs({ '/bin/claude': '', '/bin/pi': '', '/bin/opencode': '' })
    process.env['PATH'] = '/bin'

    await handleRunCommand(parseRunCommand({}), fs)

    expect(output()).toContain('(from schema default)')
  })

  it('prefers the engine declared in pair.config.json', async () => {
    const output = captureLog()
    const fs = projectFs({
      [`${cwd}/pair.config.json`]: JSON.stringify({ engine: { id: 'pi' } }),
      '/bin/pi': '',
    })
    process.env['PATH'] = '/bin'

    await handleRunCommand(parseRunCommand({}), fs)

    expect(output()).toContain('Engine: pi — `pi --mode json` (from pair.config.json)')
  })

  it('lets --engine win over pair.config.json', async () => {
    const output = captureLog()
    const fs = projectFs({
      [`${cwd}/pair.config.json`]: JSON.stringify({ engine: { id: 'pi' } }),
      '/bin/opencode': '',
    })
    process.env['PATH'] = '/bin'

    await handleRunCommand(parseRunCommand({ engine: 'opencode' }), fs)

    expect(output()).toContain('(from --engine)')
  })

  it('refuses a malformed engine block rather than degrading to the default', async () => {
    captureLog()
    const fs = projectFs({
      [`${cwd}/pair.config.json`]: JSON.stringify({ engine: { id: 'opencde' } }),
    })

    await expect(handleRunCommand(parseRunCommand({}), fs)).rejects.toThrow(
      /engine\.id: unknown engine 'opencde'/,
    )
  })

  it('fails with an actionable message when the engine is not on PATH', async () => {
    captureLog()
    const fs = projectFs()
    process.env['PATH'] = '/empty'

    await expect(handleRunCommand(parseRunCommand({ engine: 'pi' }), fs)).rejects.toThrow(
      /Engine 'pi' is not installed or not on PATH/,
    )
  })
})

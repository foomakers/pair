import { describe, it, expect, vi, afterEach } from 'vitest'
import { InMemoryFileSystemService } from '@pair/content-ops'
import type { CommandConfig } from '../index'

/**
 * US-488: `--profile` / `--workflow-config` (reserved by US-487 r0-8/AC11) are REAL now — accepted
 * with `--card`, refused without it, never commander's generic `unknown option`. Driven as argv through the
 * REAL registered `run` command (`runCli` builds commander from `runCommandMetadata`), because a
 * parser test with an options object cannot see a flag commander never registered. Only
 * `dispatchCommand` is replaced — no handler, no engine, no `gh`.
 */

const dispatched: CommandConfig[] = []

vi.mock('../dispatcher', async importOriginal => {
  const actual = await importOriginal<typeof import('../dispatcher')>()
  return {
    ...actual,
    dispatchCommand: async (config: CommandConfig) => {
      dispatched.push(config)
    },
  }
})

describe('pair-cli run — --profile / --workflow-config through the registered command (US-488)', () => {
  afterEach(() => {
    dispatched.length = 0
    vi.restoreAllMocks()
  })

  /** Everything the operator would read: stdout, stderr and a thrown error, joined. */
  const runArgv = async (args: string[]): Promise<string> => {
    const said: string[] = []
    const keep = (...a: unknown[]) => void said.push(a.map(String).join(' '))
    const { runCli } = await import('../../cli.js')
    vi.spyOn(console, 'log').mockImplementation(keep)
    vi.spyOn(console, 'error').mockImplementation(keep)
    vi.spyOn(process.stderr, 'write').mockImplementation(chunk => {
      said.push(String(chunk))
      return true
    })
    const fs = new InMemoryFileSystemService({}, '/project', '/project')
    try {
      await runCli(['node', 'pair-cli', 'run', ...args], {
        fs,
        httpClient: { get: vi.fn(), request: vi.fn() } as never,
      })
    } catch (error) {
      said.push(error instanceof Error ? error.message : String(error))
    }
    return said.join('\n')
  }

  for (const flag of ['--profile', '--workflow-config']) {
    it(`run --card 1 ${flag} x reaches the dispatcher — neither "unknown option" nor "reserved"`, async () => {
      const output = await runArgv(['--card', '1', flag, 'x'])

      expect(output).not.toMatch(/unknown option|reserved/i)
      expect(dispatched).toHaveLength(1)
      expect(dispatched[0]).toMatchObject(
        flag === '--profile' ? { profile: 'x' } : { workflowConfig: 'x' },
      )
    })

    it(`run --skill s ${flag} x (no --card) is refused naming the flag and --card`, async () => {
      const output = await runArgv(['--skill', 'pair-next', flag, 'x'])

      expect(output).toContain(flag)
      expect(output).toContain('--card')
      expect(dispatched).toHaveLength(0)
    })
  }
})

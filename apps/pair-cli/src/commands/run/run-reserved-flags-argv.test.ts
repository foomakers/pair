import { describe, it, expect, vi, afterEach } from 'vitest'
import { InMemoryFileSystemService } from '@pair/content-ops'
import type { CommandConfig } from '../index'

/**
 * US-487 review r0-8 (AC11): `--profile` / `--workflow-config` are RESERVED until #488 — refused
 * with a pointer to #488, never commander's generic `unknown option`. Driven as argv through the
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

describe('pair-cli run — reserved #488 flags through the registered command (r0-8, AC11)', () => {
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
    it(`run --card 1 ${flag} x is refused naming #488, never "unknown option"`, async () => {
      const output = await runArgv(['--card', '1', flag, 'x'])

      expect(output).not.toMatch(/unknown option/i)
      expect(output).toContain('#488')
      expect(dispatched).toHaveLength(0)
    })
  }
})

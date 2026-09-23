import { describe, it, expect, vi, afterEach } from 'vitest'
import { InMemoryFileSystemService } from '@pair/content-ops'
import type { CommandConfig } from '../index'

/**
 * US-487 a0 repair (rejection row AC15-W3, mechanism `run-flag-registration`) — the USER-FACING
 * flag grammar of the cycle-coordinator options, driven as argv through the REAL registered `run`
 * command: `runCli` builds commander from `runCommandMetadata` exactly as the shipped binary does,
 * normalizes the kebab-case keys and hands them to `parseRunCommand`. Every other AC2/AC8/AC15 row
 * calls `parseRunCommand` with an options OBJECT, so a renamed flag in `metadata.ts`
 * (`--approve-ineligible` → `--approve-inelig`, `--rounds <n|max>` → `--roundz <n|max>`) would leave
 * them green while `pair-cli run --card N --autonomous --approve-ineligible` could no longer reach
 * the AC15 override. Only `dispatchCommand` is replaced — by a recorder — so no handler runs, no
 * engine, no `gh`, no network: the property under test is argv → parsed config.
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

describe('pair-cli run — the cycle-coordinator flags through the registered command (US-487 AC2, AC8, AC15)', () => {
  afterEach(() => {
    dispatched.length = 0
    vi.restoreAllMocks()
  })

  const runArgv = async (args: string[]) => {
    const { runCli } = await import('../../cli.js')
    vi.spyOn(console, 'log').mockImplementation(() => {})
    vi.spyOn(console, 'error').mockImplementation(() => {})
    vi.spyOn(process.stderr, 'write').mockImplementation(() => true)
    const fs = new InMemoryFileSystemService({}, '/project', '/project')
    await runCli(['node', 'pair-cli', 'run', ...args], {
      fs,
      httpClient: { get: vi.fn(), request: vi.fn() } as never,
    })
  }

  it('run --card 7 --pr 12 --rounds 1 --autonomous --approve-ineligible reaches the parser as one card dispatch', async () => {
    await runArgv([
      '--card',
      '7',
      '--pr',
      '12',
      '--rounds',
      '1',
      '--autonomous',
      '--approve-ineligible',
    ])

    expect(dispatched).toHaveLength(1)
    const config = dispatched[0] as unknown as Record<string, unknown>
    expect(config).toMatchObject({
      command: 'run',
      autonomous: true,
      approveIneligible: true,
      dispatch: { card: '7', pr: 12, rounds: 1 },
    })
  })

  it('run --card 7 --rounds max carries the literal max bound (AC8)', async () => {
    await runArgv(['--card', '7', '--rounds', 'max'])

    expect(dispatched).toHaveLength(1)
    expect(dispatched[0]).toMatchObject({
      command: 'run',
      autonomous: false,
      approveIneligible: false,
      dispatch: { card: '7', rounds: 'max' },
    })
  })
})

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

  it('US-491: run --root 66 --parallel 3 reaches the parser as the fan-out mode', async () => {
    await runArgv(['--root', '66', '--parallel', '3', '--autonomous'])

    expect(dispatched).toHaveLength(1)
    expect(dispatched[0]).toMatchObject({
      command: 'run',
      parallel: 3,
      scope: { root: '66' },
      autonomous: true,
    })
  })

  it('US-522: run --filter PIPPO --assignee @me --parallel 2 --watch --interval 10m reaches the parser as the watch loop', async () => {
    await runArgv([
      '--filter',
      'PIPPO',
      '--assignee',
      '@me',
      '--parallel',
      '2',
      '--watch',
      '--interval',
      '10m',
      '--autonomous',
    ])

    expect(dispatched).toHaveLength(1)
    expect(dispatched[0]).toMatchObject({
      command: 'run',
      parallel: 2,
      watch: true,
      interval: { text: '10m', seconds: 600 },
      scope: { filter: 'PIPPO', assignee: '@me' },
    })
  })

  it('US-522: --no-watch reaches the parser as watch=false; neither flag leaves watch absent', async () => {
    await runArgv(['--root', '66', '--parallel', '2', '--no-watch'])
    await runArgv(['--root', '66', '--parallel', '2'])

    expect(dispatched[0]).toMatchObject({ watch: false })
    expect(dispatched[1]).not.toHaveProperty('watch')
  })

  /**
   * US-522 r1 (finding r0-1, AC14) — `--watch` and `--no-watch` together are a contradiction, refused
   * at parse time whatever their order: commander folds both into one `watch` key (last one wins), so
   * only the registered command — not an options object — can witness the pair. Nothing is dispatched.
   */
  for (const [label, pair] of [
    ['--watch --no-watch', ['--watch', '--no-watch']],
    ['--no-watch --watch', ['--no-watch', '--watch']],
  ] as const) {
    it(`US-522 r0-1: ${label} is refused naming both flags; nothing is dispatched (AC14)`, async () => {
      const outcome = await runArgv(['--filter', 'X', '--parallel', '1', ...pair]).then(
        () => undefined,
        (error: unknown) => error,
      )

      expect(dispatched).toHaveLength(0)
      expect(outcome).toBeInstanceOf(Error)
      const message = (outcome as Error).message
      expect(message).toMatch(/--watch\b(?!-)/)
      expect(message).toContain('--no-watch')
    })
  }

  it('US-522 r0-1 control: a repeated --watch is not a contradiction and still reaches the parser as watch=true', async () => {
    await runArgv(['--filter', 'X', '--parallel', '1', '--watch', '--watch'])

    expect(dispatched).toHaveLength(1)
    expect(dispatched[0]).toMatchObject({ watch: true })
  })
})

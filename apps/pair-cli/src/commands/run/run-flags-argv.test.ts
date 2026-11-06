import { describe, it, expect, vi, afterEach } from 'vitest'
import { InMemoryFileSystemService } from '@pair/content-ops'
import type { CommandConfig } from '../index'
import { handleRunCommand, type RunHandlerDependencies } from './handler'
import { readFileSync } from 'fs'
import { resolve } from 'path'
import { describeLoopValues, resolveLoopValues } from './loop-report'

/**
 * US-487 a0 repair (rejection row AC15-W3, mechanism `run-flag-registration`) — the USER-FACING
 * flag grammar of the cycle-coordinator options, driven as argv through the REAL registered `run`
 * command: `runCli` builds commander from `runCommandMetadata` exactly as the shipped binary does,
 * normalizes the kebab-case keys and hands them to `parseRunCommand`. Every other AC2/AC8/AC15 row
 * calls `parseRunCommand` with an options OBJECT, so a renamed flag in `metadata.ts`
 * (`--approve-ineligible` → `--approve-inelig`, `--rounds <n|max>` → `--roundz <n|max>`) would leave
 * them green while `pair-cli run --card N --autonomous --approve-ineligible` could no longer reach
 * the AC15 override. `dispatchCommand` records configs; US-593 also invokes the real handler
 * with engine/card boundaries stubbed. No engine, `gh` or network is used.
 */

const pathBefore = process.env['PATH']
const dispatched: CommandConfig[] = []
let handlerEntry: ((config: CommandConfig) => Promise<void>) | undefined

vi.mock('../dispatcher', async importOriginal => {
  const actual = await importOriginal<typeof import('../dispatcher')>()
  return {
    ...actual,
    dispatchCommand: async (config: CommandConfig) => {
      dispatched.push(config)
      await handlerEntry?.(config)
    },
  }
})

describe('pair-cli run — the cycle-coordinator flags through the registered command (US-487 AC2, AC8, AC15)', () => {
  afterEach(() => {
    dispatched.length = 0
    handlerEntry = undefined
    process.env['PATH'] = pathBefore
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

  it('US-593: registered argv omission reaches the real handler and adopted pool', async () => {
    process.env['PATH'] = '/bin'
    const lines: string[] = []
    const audit: string[] = []
    const live: Array<Record<string, unknown>> = []
    const started: string[] = []
    let active = 0
    let peak = 0
    const fs = new InMemoryFileSystemService(
      {
        '/project/config.json': JSON.stringify({ asset_registries: {} }),
        '/project/.claude/skills/pair-workflow-cycle/SKILL.md': '',
        '/project/.pair/adoption/tech/automation.md':
          '## Eligibility\n\nrisk:green\n\n## Max Parallelism\n\n3',
        '/bin/claude': '',
      },
      '/project',
      '/project',
    )
    const deps: RunHandlerDependencies = {
      readPrereqState: () => ({ blocked: false, prerequisites: [] }),
      selectCandidates: async () =>
        Array.from({ length: 5 }, (_, i) => ({
          id: String(i + 1),
          title: `Card ${i + 1}`,
          branch: `feature/card-${i + 1}`,
          tier: 'risk:green',
          labels: ['risk:green'],
          mutexResources: [],
          prerequisites: [],
        })),
      acquireLock: ({ card }) => ({
        kind: 'acquired',
        lock: { path: `/locks/${card}`, release: () => {} },
      }),
      runCardProcess: async ({ card }) => {
        started.push(card.id)
        active++
        peak = Math.max(peak, active)
        await new Promise(r => setTimeout(r, 2))
        active--
        return { exitCode: 0, signal: null }
      },
      appendAudit: (_path, line) => void audit.push(line),
      runAudit: (_path, line) => void live.push(JSON.parse(line)),
      resolveAutonomy: () => ({
        ok: true,
        active: true,
        policy: {
          until: 'pr',
          prepare: { mode: 'always' },
          merge: { mode: 'never', has: [], lacks: [] },
        },
        effective: { filter: { value: '*', source: 'preset full' } },
        lines: [],
        warnings: [],
        errors: [],
        translated: {},
      }),
    }
    handlerEntry = async config => {
      vi.spyOn(console, 'log').mockImplementation(
        (...args: unknown[]) => void lines.push(args.map(String).join(' ')),
      )
      vi.spyOn(process.stdout, 'write').mockImplementation(() => true)
      expect(
        await handleRunCommand(config as Parameters<typeof handleRunCommand>[0], fs, deps),
      ).toBe(0)
    }
    await runArgv([
      '--root',
      '66',
      '--preset',
      'full',
      '--autonomous',
      '--watch',
      '--max-iterations',
      '1',
    ])
    expect(started.sort()).toEqual(['1', '2', '3', '4', '5'])
    expect(peak).toBe(3)
    expect(dispatched[0]).not.toHaveProperty('parallel')
    expect(lines.join('\n')).toMatch(/Effective parallelism: 3[^\n]*## Max Parallelism/)
    for (const event of ['batch', 'loop-start']) {
      const line = audit.find(l => l.includes(`event=${event}`))
      expect(line).toContain('parallel=3')
      expect(line).toContain('parallel-source=## Max Parallelism')
    }
    expect(live[0]).toMatchObject({
      event: 'loop-start',
      detail: { policy: { parallel: 3, parallelSource: '## Max Parallelism' } },
    })
  })

  for (const value of ['0', '1.5']) {
    it(`US-593: registered --parallel ${value} refuses positive-integer grammar`, async () => {
      await expect(runArgv(['--root', '66', '--parallel', value])).rejects.toThrow(
        /--parallel.*positive integer/,
      )
      expect(dispatched).toEqual([])
    })
  }

  it('US-593: registered standalone --interval refuses before dispatch', async () => {
    await expect(runArgv(['--root', '66', '--interval', '60s'])).rejects.toThrow(
      '--interval requires --watch',
    )
    expect(dispatched).toEqual([])
  })

  it('US-593: registered watch interval preserves supported grammar', async () => {
    await runArgv(['--root', '66', '--watch', '--interval', '60s'])
    expect(dispatched[0]).toMatchObject({
      watch: true,
      interval: { text: '60s', seconds: 60 },
    })
  })

  it('US-593: registered --no-watch keeps parallel absent', async () => {
    await runArgv(['--root', '66', '--no-watch'])
    expect(dispatched[0]).toMatchObject({ watch: false })
    expect(dispatched[0]).not.toHaveProperty('parallel')
  })

  it('US-593: ordinary --root keeps parallel absent', async () => {
    await runArgv(['--root', '66'])
    expect(dispatched[0]).toMatchObject({ scope: { root: '66' } })
    expect(dispatched[0]).not.toHaveProperty('parallel')
  })

  it('US-593: CLI reference states the omission inheritance relation', () => {
    const docs = readFileSync(
      resolve(__dirname, '../../../../website/content/docs/reference/cli/commands.mdx'),
      'utf8',
    )
    const row = docs.split('\n').find(line => /^\| `--parallel/.test(line))
    expect(row).toMatch(
      /omitt?ed[^|]*(?:inherit|use)[^|]*(?:adopt|## Max Parallelism)[^|]*(?:otherwise|else|absent)[^|]*(?:KB|default)[^|]*1/i,
    )
    expect(row).not.toMatch(/ignor|does not (?:inherit|use)|never (?:inherit|use)/i)
  })

  it('US-593: registered help states adoption before KB default', async () => {
    const { runCli } = await import('../../cli.js')
    const output: string[] = []
    vi.spyOn(process.stdout, 'write').mockImplementation(chunk => {
      output.push(String(chunk))
      return true
    })
    await expect(
      runCli(['node', 'pair-cli', 'run', '--help'], {
        fs: new InMemoryFileSystemService({}, '/project', '/project'),
        httpClient: { get: vi.fn(), request: vi.fn() } as never,
      }),
    ).rejects.toMatchObject({ code: 'commander.helpDisplayed' })
    const text = output.join(' ').replace(/\s+/g, ' ')
    const { runCommandMetadata } = await import('./metadata.js')
    const description = runCommandMetadata.options.find(option =>
      option.flags.includes('--parallel'),
    )!.description
    expect(text).toContain(description.replace(/\s+/g, ' '))
    expect(description).toMatch(
      /omitt?ed.*(?:inherit|use).*(?:adopt|## Max Parallelism).*(?:otherwise|else|absent).*(?:KB|default).*1/i,
    )
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

  it('V: --predicate reaches the parsed config through the registered command (argv -> config -> loop value + header)', async () => {
    await runArgv([
      '--parallel',
      '2',
      '--watch',
      '--root',
      '1',
      '--predicate',
      'tag:surface:cli ⇒ Done',
    ])
    expect(dispatched).toHaveLength(1)
    const config = dispatched[0] as unknown as Parameters<typeof resolveLoopValues>[0]
    expect(config.predicate).toBe('tag:surface:cli ⇒ Done')
    const policy = { stopPredicate: 'tag:risk:red ⇒ Done' } as Parameters<
      typeof resolveLoopValues
    >[1]
    const values = resolveLoopValues(config, policy)
    expect(values.predicate).toEqual({ value: 'tag:surface:cli ⇒ Done', source: '--predicate' })
    expect(describeLoopValues(values, {}, 2, 3).join('\n')).toMatch(
      /stop predicate: tag:surface:cli ⇒ Done \(--predicate\)/,
    )
  })
})

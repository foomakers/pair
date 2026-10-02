import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { InMemoryFileSystemService } from '@pair/content-ops'
import type { RootCandidate } from './root-plan'
import type { SelectionAnswer } from './root-select'
import type { WaitOutcome } from './wait'

/**
 * US-522 T-8 — the watch loop end to end through the REAL handler: fake `pair-next` selection (scripted
 * per iteration), fake `run --card` children, a fake wait on a recorded queue (no real timer), and a real
 * temporary working area for the lock probes and the signal cases. `interrupt.ts` is process-global, so
 * every case imports a FRESH module graph.
 */

const POLICY = (extra = '') =>
  `## Eligibility\n\nrisk:green\n\n## Max Parallelism\n\n3\n\n## Stop Predicate\n\n${extra}max-iterations: 6\n`
const EXIT_CODE = { SIGTERM: 143, SIGINT: 130 } as const

const card = (id: string, extra: Partial<RootCandidate> = {}): RootCandidate => ({
  id,
  title: `Card ${id}`,
  branch: `feature/US-${id}-x`,
  tier: 'risk:green',
  labels: ['risk:green'],
  mutexResources: [],
  prerequisites: [],
  escalated: false,
  ...extra,
})

let root: string
const PATH_BEFORE = process.env['PATH']

beforeEach(() => {
  root = realpathSync(mkdtempSync(join(tmpdir(), 'pair-522-loop-')))
  vi.resetModules()
})

afterEach(() => {
  vi.restoreAllMocks()
  process.env['PATH'] = PATH_BEFORE
  process.removeAllListeners('SIGTERM')
  process.removeAllListeners('SIGINT')
  rmSync(root, { recursive: true, force: true })
})

const lockDir = (): string => join(root, '.pair/working/automation/locks')
const locks = (): string[] => (existsSync(lockDir()) ? readdirSync(lockDir()) : [])

interface Run {
  readonly code: Promise<number>
  readonly stdout: string[]
  readonly audit: string[]
  readonly started: string[]
  readonly selections: () => number
  readonly waits: number[]
  readonly releaseWait: (outcome?: WaitOutcome) => void
  readonly exited: Promise<number>
  readonly atExit: () => { locks: string[]; audit: string[] } | undefined
}

interface Options {
  flags?: Record<string, unknown>
  policy?: string
  /** One answer per iteration; the last repeats. An Error is a selection failure. */
  script: Array<SelectionAnswer | Error>
  /** `true`: each wait blocks until `releaseWait`. Otherwise it elapses at once. */
  blockWait?: boolean
  /** Children block until killed by the test (for the batch-signal case). */
  blockChildren?: boolean
  exits?: Record<string, number>
  heldLock?: string
  /** Runs inside every wait — e.g. another owner freeing a lock between iterations. */
  onWait?: () => void
}

async function start(options: Options): Promise<Run> {
  const { handleRunCommand } = await import('./handler.js')
  const { parseRunCommand } = await import('./parser.js')
  const { POLICY_PATH } = await import('./automation-policy.js')
  const { acquireCardLock } = await import('./card-lock.js')
  process.env['PATH'] = '/bin'
  const stdout: string[] = []
  vi.spyOn(console, 'log').mockImplementation(
    (...a: unknown[]) => void stdout.push(a.map(String).join(' ')),
  )
  vi.spyOn(console, 'error').mockImplementation(() => {})
  const audit: string[] = []
  const started: string[] = []
  const waits: number[] = []
  let selections = 0
  let pendingWait: ((o: WaitOutcome) => void) | undefined
  let atExit: { locks: string[]; audit: string[] } | undefined
  let resolveExit: (code: number) => void = () => {}
  const exited = new Promise<number>(r => (resolveExit = r))
  vi.spyOn(process, 'exit').mockImplementation(((code: number) => {
    atExit = { locks: locks(), audit: [...audit] }
    resolveExit(code)
  }) as never)
  if (options.heldLock !== undefined) {
    mkdirSync(join(lockDir(), options.heldLock), { recursive: true })
    writeFileSync(
      join(lockDir(), options.heldLock, 'holder.json'),
      JSON.stringify({ acquiredAt: 'T0' }),
    )
  }
  const fs = new InMemoryFileSystemService(
    {
      [`${root}/config.json`]: JSON.stringify({ asset_registries: {} }),
      '/bin/claude': '',
      [`${root}/${POLICY_PATH}`]: options.policy ?? POLICY(),
    },
    root,
    root,
  )
  const code = handleRunCommand(
    parseRunCommand({ cwd: root, autonomous: true, parallel: '2', ...options.flags }),
    fs,
    {
      selectAnswer: async () => {
        const entry = options.script[Math.min(selections, options.script.length - 1)]!
        selections++
        if (entry instanceof Error) throw entry
        return entry
      },
      acquireLock: acquireCardLock,
      runCardProcess: async ({ card: c }) => {
        started.push(c.id)
        if (options.blockChildren) await new Promise(() => {})
        return { exitCode: options.exits?.[c.id] ?? 0, signal: null }
      },
      appendAudit: (_path: string, line: string) => void audit.push(line),
      wait: ms => {
        waits.push(ms)
        options.onWait?.()
        return options.blockWait
          ? new Promise<WaitOutcome>(r => (pendingWait = r))
          : Promise.resolve<WaitOutcome>('elapsed')
      },
    },
  )
  return {
    code,
    stdout,
    audit,
    started,
    selections: () => selections,
    waits,
    releaseWait: outcome => pendingWait?.(outcome ?? 'elapsed'),
    exited,
    atExit: () => atExit,
  }
}

const answer = (...cards: RootCandidate[]): SelectionAnswer => ({ candidates: cards })
const events = (audit: string[]): string[] => audit.map(l => /event=([\w-]+)/.exec(l)![1]!)
const until = async (p: () => boolean): Promise<void> => {
  for (let i = 0; i < 500 && !p(); i++) await new Promise(r => setTimeout(r, 10))
  expect(p()).toBe(true)
}

describe('US-522 — the watch loop through the handler', () => {
  it('AC1/AC6/AC11: re-selects each iteration, never re-drives a card, one line + one audit line per iteration', async () => {
    const run = await start({
      flags: { maxIterations: '9' },
      script: [answer(card('1')), answer(card('1'), card('2')), answer()],
    })
    expect(await run.code).toBe(0)
    expect(run.started).toEqual(['1', '2'])
    expect(run.selections()).toBe(3)
    const lines = run.stdout.filter(l => l.startsWith('  Iteration '))
    expect(lines).toEqual([
      '  Iteration 1/6: selected 1 · skipped none · ran #1 completed · next iteration',
      '  Iteration 2/6: selected 2 · skipped #1 already driven this run · ran #2 completed · next iteration',
      '  Iteration 3/6: selected 0 · skipped none · ran none · stopping: nothing workable',
    ])
    expect(events(run.audit)).toEqual([
      'loop-start',
      'batch',
      'iteration',
      'batch',
      'iteration',
      'iteration',
      'loop-end',
    ])
    expect(run.audit.at(-1)).toMatch(/event=loop-end reason=nothing workable iterations=3 exit=0$/)
  })

  it('AC12: prints every effective value with its source before any selection, under --dry-run too', async () => {
    const run = await start({
      flags: { watch: true, interval: '2m', filter: 'PIPPO', assignee: '@me', dryRun: true },
      script: [answer()],
    })
    expect(await run.code).toBe(0)
    const text = run.stdout.join('\n')
    expect(text).toContain('watch: on (--watch)')
    expect(text).toContain('interval: 2m (--interval)')
    expect(text).toContain('max-iterations: 6 — ## Stop Predicate max-iterations 6')
    expect(text).toContain('parallel: --parallel 2 · ## Max Parallelism 3')
    expect(text).toContain('filter: PIPPO (--filter)')
    expect(text).toContain('assignee: @me (--assignee)')
    expect(text).toContain('Scope: pair-next --filter PIPPO --assignee @me')
    expect(run.selections()).toBe(0)
    expect(run.started).toEqual([])
    expect(run.audit).toEqual([])
  })

  it('AC2: --parallel without --root or --filter, and with none in the policy, is refused before any spawn', async () => {
    const run = await start({
      policy: '## Max Parallelism\n\n3\n',
      script: [answer(card('1'))],
    })
    await expect(run.code).rejects.toThrow(/--root.*--filter/)
    expect(run.selections()).toBe(0)
  })

  it('AC2: --root omitted with --filter selects by filter alone', async () => {
    const run = await start({ flags: { filter: 'PIPPO' }, script: [answer(card('1'))] })
    expect(await run.code).toBe(0)
    expect(run.stdout.some(l => l.includes('Scope: pair-next --filter PIPPO'))).toBe(true)
    expect(run.audit[0]).toMatch(/event=batch root=\(none\)/)
  })

  it('AC4/AC5: escalated and locked cards are skipped and reported; the locked one runs once free', async () => {
    const run = await start({
      flags: { watch: true, interval: '1m' },
      heldLock: '3',
      // Card 3's other owner finishes while the loop idles between iterations.
      onWait: () => rmSync(join(lockDir(), '3'), { recursive: true, force: true }),
      script: [
        answer(card('1', { escalated: true }), card('2'), card('3')),
        answer(card('1', { escalated: true }), card('3')),
        answer(card('1', { escalated: true }), card('3')),
        answer(card('1', { escalated: true })),
      ],
    })
    expect(await run.code).toBe(0)
    expect(run.started).toEqual(['2', '3'])
    const first = run.stdout.find(l => l.startsWith('  Iteration 1/'))!
    expect(first).toContain('#1 escalated')
    expect(first).toMatch(/#3 locked \(.*\/3, since T0\)/)
    expect(run.stdout.filter(l => l.includes('#1 escalated')).length).toBeGreaterThanOrEqual(2)
  })

  it('AC7/AC9: idle under --watch waits the interval and re-selects; idle polls count toward the cap', async () => {
    const run = await start({
      flags: { watch: true, interval: '90s', maxIterations: '3' },
      script: [answer()],
    })
    expect(await run.code).toBe(0)
    expect(run.waits).toEqual([90_000, 90_000])
    expect(run.selections()).toBe(3)
    expect(run.audit.at(-1)).toMatch(/reason=iteration cap iterations=3 exit=0/)
  })

  it('AC8: the stop predicate stops the run from the same selection answer', async () => {
    const run = await start({
      policy: POLICY('tag:risk:red ⇒ Done\n'),
      flags: { watch: true },
      script: [
        { candidates: [card('1')], snapshot: [{ id: '9', tags: [], macrostate: 'Ready' }] },
        { candidates: [card('2')], snapshot: [{ id: '9', tags: [], macrostate: 'Done' }] },
      ],
    })
    expect(await run.code).toBe(0)
    expect(run.started).toEqual(['1'])
    expect(run.audit.at(-1)).toMatch(/reason=stop predicate satisfied iterations=2/)
  })

  it('AC12/edge: a failed selection stops the loop with exit 1, names the iteration, never retries', async () => {
    const run = await start({
      flags: { watch: true },
      script: [answer(card('1')), new Error('engine down'), answer(card('2'))],
    })
    expect(await run.code).toBe(1)
    expect(run.selections()).toBe(2)
    expect(run.stdout.join('\n')).toContain(
      'Loop stopped at iteration 2: selection failed — engine down',
    )
    expect(run.audit.at(-1)).toMatch(
      /event=loop-end reason=selection failed iterations=2 exit=1 detail=engine down/,
    )
  })

  it('exit 1 when any card failed, whatever the stop reason', async () => {
    const run = await start({
      flags: { maxIterations: '2' },
      exits: { '1': 1 },
      script: [answer(card('1'))],
    })
    expect(await run.code).toBe(1)
  })

  describe('AC10: Ctrl-C / SIGTERM', () => {
    for (const signal of ['SIGINT', 'SIGTERM'] as const) {
      it(`${signal} during the --watch wait: no new selection, loop-end written, exit ${EXIT_CODE[signal]}`, async () => {
        const run = await start({ flags: { watch: true }, blockWait: true, script: [answer()] })
        await until(() => run.waits.length === 1)
        process.emit(signal as never, signal as never)
        expect(await run.exited).toBe(EXIT_CODE[signal])
        expect(run.selections()).toBe(1)
        expect(run.atExit()!.audit.at(-1)).toMatch(
          new RegExp(
            `event=loop-end reason=interrupted iterations=1 exit=0 detail=the driver received ${signal}`,
          ),
        )
        expect(run.atExit()!.locks).toEqual([])
      })

      it(`${signal} during a batch: the resource locks the driver holds are released, batch + loop-end written`, async () => {
        const run = await start({
          flags: { watch: true },
          blockChildren: true,
          script: [answer(card('1', { mutexResources: ['skill:a'] }))],
        })
        await until(() => run.started.length === 1 && locks().some(n => n.startsWith('mutex-')))
        process.emit(signal as never, signal as never)
        expect(await run.exited).toBe(EXIT_CODE[signal])
        const at = run.atExit()!
        expect(at.locks).toEqual([])
        expect(events(at.audit)).toEqual(['loop-start', 'batch', 'loop-end'])
        expect(at.audit[1]).toMatch(/1:interrupted/)
      })
    }
  })
})

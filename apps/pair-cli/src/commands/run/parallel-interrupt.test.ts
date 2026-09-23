import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { existsSync, mkdtempSync, readdirSync, realpathSync, rmSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { InMemoryFileSystemService } from '@pair/content-ops'
import type { RootCandidate } from './root-plan'

/**
 * US-491 review r0-1 — SIGTERM/SIGINT on `run --root --parallel` must release every mutex-resource
 * lock the driver holds BEFORE the driver exits: `card-lock` has no stale reclaim, so a lock that
 * outlives the driver parks every later `--parallel` run on that resource until a human removes it.
 *
 * The real handler, the real `acquireCardLock` over a throwaway directory and the real
 * `spawnCardProcess` — its child is a stub `run --card` (a node script, never an engine) that, like
 * #487's handler, traps the signal and exits 128 + signal. Only the `pair-next` selection and the
 * audit writer are injected. The oracle is the lock directory at the moment `process.exit` is called.
 *
 * `interrupt.ts` is process-global (a signal is delivered to the process), so every case imports a
 * FRESH module graph: an interruption in one case must not leave `isInterrupted()` set for the next.
 */

const POLICY = '## Eligibility\n\nrisk:green\n\n## Max Parallelism\n\n3\n'
const EXIT_CODE = { SIGTERM: 143, SIGINT: 130 } as const
type Signal = keyof typeof EXIT_CODE

const card = (id: string, mutexResources: string[]): RootCandidate => ({
  id,
  title: `Card ${id}`,
  branch: `feature/US-${id}-x`,
  tier: 'risk:green',
  labels: ['risk:green'],
  mutexResources,
  prerequisites: [],
})

let root: string
const ARGV1 = process.argv[1]
const PATH_BEFORE = process.env['PATH']

beforeEach(() => {
  root = realpathSync(mkdtempSync(join(tmpdir(), 'pair-491-interrupt-')))
  vi.resetModules()
})

afterEach(() => {
  vi.restoreAllMocks()
  process.argv[1] = ARGV1 as string
  process.env['PATH'] = PATH_BEFORE
  delete process.env['STUB_CARD_EXIT_NOW']
  process.removeAllListeners('SIGTERM')
  process.removeAllListeners('SIGINT')
  for (const pid of childPids()) {
    try {
      process.kill(pid, 'SIGKILL')
    } catch {
      // already gone
    }
  }
  rmSync(root, { recursive: true, force: true })
})

const lockDir = (): string => join(root, '.pair/working/automation/locks')
const mutexLocks = (): string[] =>
  existsSync(lockDir()) ? readdirSync(lockDir()).filter(name => name.startsWith('mutex-')) : []
const readyDir = (): string => join(root, 'ready')
const childPids = (): number[] =>
  existsSync(readyDir()) ? readdirSync(readyDir()).map(Number) : []

/** A `run --card` child: traps SIGTERM/SIGINT, announces itself, exits 128 + signal on a signal. */
function writeStubChild(): string {
  const stub = join(root, 'stub-card.cjs')
  writeFileSync(
    stub,
    [
      "const fs = require('fs')",
      "const { spawn } = require('child_process')",
      "process.on('SIGTERM', () => setTimeout(() => process.exit(143), 30))",
      "process.on('SIGINT', () => setTimeout(() => process.exit(130), 30))",
      `fs.mkdirSync(${JSON.stringify(readyDir())}, { recursive: true })`,
      "if (process.env['STUB_CARD_EXIT_NOW'] === '1') {",
      `  fs.writeFileSync(${JSON.stringify(readyDir())} + '/' + process.pid, '')`,
      '  process.exit(0)',
      '}',
      // The engine this card started: it inherits the card's stdout/stderr, so the card's own
      // 'exit' comes BEFORE its streams close — the order #487's real child produces. The driver
      // must not wait for 'close' to release what it holds.
      "const engine = spawn(process.execPath, ['-e', 'setTimeout(() => {}, 3000)'], { stdio: ['ignore', 'inherit', 'inherit'] })",
      `fs.writeFileSync(${JSON.stringify(readyDir())} + '/' + engine.pid, '')`,
      `fs.writeFileSync(${JSON.stringify(readyDir())} + '/' + process.pid, '')`,
      'setInterval(() => {}, 1000)',
    ].join('\n'),
  )
  return stub
}

async function until(predicate: () => boolean, ms: number): Promise<boolean> {
  const deadline = Date.now() + ms
  while (Date.now() < deadline) {
    if (predicate()) return true
    await new Promise(resolve => setTimeout(resolve, 20))
  }
  return predicate()
}

interface Batch {
  readonly finished: Promise<number>
  readonly exited: Promise<number>
  readonly locksAtExit: () => string[] | undefined
  readonly audit: string[]
  readonly auditAtExit: () => string[] | undefined
}

async function startBatch(candidates: RootCandidate[], parallel: string): Promise<Batch> {
  const { handleRunCommand } = await import('./handler.js')
  const { parseRunCommand } = await import('./parser.js')
  const { POLICY_PATH } = await import('./automation-policy.js')
  const { acquireCardLock } = await import('./card-lock.js')
  const { spawnCardProcess } = await import('./parallel.js')
  process.argv[1] = writeStubChild()
  process.env['PATH'] = '/bin'
  vi.spyOn(console, 'log').mockImplementation(() => {})
  vi.spyOn(console, 'error').mockImplementation(() => {})
  let locksAtExit: string[] | undefined
  let auditAtExit: string[] | undefined
  const audit: string[] = []
  let resolveExit: (code: number) => void = () => {}
  const exited = new Promise<number>(resolve => (resolveExit = resolve))
  vi.spyOn(process, 'exit').mockImplementation(((code: number) => {
    locksAtExit = mutexLocks()
    auditAtExit = [...audit]
    resolveExit(code)
  }) as never)
  const fs = new InMemoryFileSystemService(
    {
      [`${root}/config.json`]: JSON.stringify({ asset_registries: {} }),
      '/bin/claude': '',
      [`${root}/${POLICY_PATH}`]: POLICY,
    },
    root,
    root,
  )
  const finished = handleRunCommand(
    parseRunCommand({ root: '66', parallel, autonomous: true, cwd: root }),
    fs,
    {
      selectCandidates: async () => candidates,
      acquireLock: acquireCardLock,
      runCardProcess: spawnCardProcess,
      appendAudit: (_path: string, line: string) => void audit.push(line),
    },
  )
  return {
    finished,
    exited,
    locksAtExit: () => locksAtExit,
    audit,
    auditAtExit: () => auditAtExit,
  }
}

async function interrupt(batch: Batch, signal: Signal, children: number): Promise<number> {
  const up = await until(() => childPids().length >= children * 2, 15_000)
  expect(up, 'the stub card children never started').toBe(true)
  process.emit(signal as never, signal as never)
  return await batch.exited
}

describe('r0-1: an interrupted --parallel driver releases every mutex lock before it exits', () => {
  for (const signal of ['SIGTERM', 'SIGINT'] as const) {
    it(`r1-g1-W-${signal}: ${signal} while a card holding a mutex resource runs ⇒ no mutex-* lock remains at process.exit`, async () => {
      const batch = await startBatch([card('1', ['skill:a'])], '2')
      await until(() => mutexLocks().length === 1, 15_000)
      expect(mutexLocks(), 'precondition: the running card holds its resource lock').toHaveLength(1)

      const code = await interrupt(batch, signal, 1)

      expect(code).toBe(EXIT_CODE[signal])
      expect(batch.locksAtExit(), 'mutex lock(s) outlived the driver').toEqual([])
    }, 30_000)
  }

  it('r1-g1-I-multi: SIGTERM with two running cards, one holding two resources ⇒ all three mutex locks released at process.exit', async () => {
    const batch = await startBatch(
      [card('1', ['skill:a', 'apps/x/src/y.ts']), card('2', ['skill:b'])],
      '2',
    )
    await until(() => mutexLocks().length === 3, 15_000)
    expect(mutexLocks(), 'precondition: three resource locks held').toHaveLength(3)

    const code = await interrupt(batch, 'SIGTERM', 2)

    expect(code).toBe(143)
    expect(batch.locksAtExit(), 'mutex lock(s) outlived the driver').toEqual([])
  }, 30_000)

  it('r1-g1-C-queued: SIGTERM while a resource-free card runs and a resource-holding card is still queued ⇒ no mutex lock was ever taken', async () => {
    const batch = await startBatch([card('1', []), card('2', ['skill:q'])], '1')

    const code = await interrupt(batch, 'SIGTERM', 1)

    expect(code).toBe(143)
    expect(batch.locksAtExit()).toEqual([])
  }, 30_000)

  it('r1-g1-C-audit: the interrupted batch still records ONE batch audit line naming the running card interrupted', async () => {
    const batch = await startBatch([card('1', ['skill:a'])], '2')

    await interrupt(batch, 'SIGTERM', 1)

    const atExit = batch.auditAtExit() ?? []
    expect(atExit).toHaveLength(1)
    expect(atExit[0]).toMatch(/event=batch root=66 /)
    expect(atExit[0]).toMatch(/outcomes=1:interrupted\(/)
  }, 30_000)

  it('r1-g1-C-clean: no signal — the card completes and its mutex locks are released by the run itself', async () => {
    process.env['STUB_CARD_EXIT_NOW'] = '1'
    const batch = await startBatch([card('1', ['skill:a', 'skill:b'])], '2')

    const code = await batch.finished

    expect(code).toBe(0)
    expect(childPids(), 'the card child ran').toHaveLength(1)
    expect(mutexLocks()).toEqual([])
    expect(batch.locksAtExit(), 'process.exit is never called on a clean run').toBeUndefined()
  }, 30_000)

  it("r1-g1-C-foreign: SIGTERM releases ONLY the locks this driver acquired — a lock held by another run (an unrelated resource, and a planned card's resource that made it skip) survives", async () => {
    const { acquireCardLock } = await import('./card-lock.js')
    const { resourceLockId } = await import('./parallel.js')
    const workingArea = join(root, '.pair/working')
    const foreign = ['skill:z', 'skill:h'].map(resource => {
      const outcome = acquireCardLock({ workingArea, card: resourceLockId(resource) })
      expect(outcome.kind, `precondition: the test holds ${resource}`).toBe('acquired')
      return resourceLockId(resource)
    })
    const batch = await startBatch([card('1', ['skill:a']), card('2', ['skill:h'])], '2')
    const own = resourceLockId('skill:a')
    await until(() => mutexLocks().includes(own), 15_000)
    expect(mutexLocks(), 'precondition: own lock + both foreign locks held').toHaveLength(3)

    const code = await interrupt(batch, 'SIGTERM', 1)

    expect(code).toBe(143)
    expect(
      [...(batch.locksAtExit() ?? [])].sort(),
      "the driver must release its own lock and never another run's",
    ).toEqual([...foreign].sort())
  }, 30_000)
})

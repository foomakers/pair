import { describe, it, expect, vi, afterEach } from 'vitest'
import { existsSync, mkdtempSync, rmSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { acquireCardLock, LOCK_DIRECTORY, type LockAcquirer } from './card-lock'
import { parseRunCommand } from './parser'
import type { RootCandidate } from './root-plan'
import {
  acquireResourceLocks,
  batchExitCode,
  buildCardProcessArgs,
  outcomeOfExit,
  prefixLine,
  renderBatchAuditLine,
  resourceLockId,
  runPlannedCard,
  runPool,
  spawnCardProcess,
  type CardOutcome,
  type CardProcessRunner,
} from './parallel'

const card = (id: string, extra: Partial<RootCandidate> = {}): RootCandidate => ({
  id,
  title: `Card ${id}`,
  branch: `feature/US-${id}-x`,
  tier: 'risk:green',
  labels: [],
  mutexResources: [],
  prerequisites: [],
  ...extra,
})

const ok = (id: string): CardOutcome => ({ id, outcome: 'completed', detail: 'exit 0' })

function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>(r => (resolve = r))
  return { promise, resolve }
}

const poolDefaults = {
  notStarted: (id: string): CardOutcome => ({ id, outcome: 'interrupted', detail: 'not started' }),
  onWorkerError: (id: string, error: unknown): CardOutcome => ({
    id,
    outcome: 'crashed',
    detail: String(error),
  }),
}

describe('runPool — AC2 concurrency bound, AC4 partial-batch isolation', () => {
  it('never runs more than `limit` workers at once, and starts the next when a slot frees', async () => {
    let inFlight = 0
    let peak = 0
    const gates = new Map(['1', '2', '3', '4', '5'].map(id => [id, deferred<void>()]))
    const started: string[] = []

    const pool = runPool({
      items: ['1', '2', '3', '4', '5'],
      limit: 2,
      worker: async id => {
        inFlight += 1
        peak = Math.max(peak, inFlight)
        started.push(id)
        await gates.get(id)!.promise
        inFlight -= 1
        return ok(id)
      },
      ...poolDefaults,
    })

    await Promise.resolve()
    expect(started).toEqual(['1', '2'])
    gates.get('2')!.resolve()
    await new Promise(r => setTimeout(r, 0))
    expect(started).toEqual(['1', '2', '3'])
    for (const gate of gates.values()) gate.resolve()

    expect((await pool).map(o => o.id)).toEqual(['1', '2', '3', '4', '5'])
    expect(peak).toBe(2)
  })

  it('edge --parallel 1: strictly sequential, one process at a time', async () => {
    const order: string[] = []
    await runPool({
      items: ['a', 'b', 'c'],
      limit: 1,
      worker: async id => {
        order.push(`start:${id}`)
        await new Promise(r => setTimeout(r, 1))
        order.push(`end:${id}`)
        return ok(id)
      },
      ...poolDefaults,
    })
    expect(order).toEqual(['start:a', 'end:a', 'start:b', 'end:b', 'start:c', 'end:c'])
  })

  it('a worker that throws becomes that card’s outcome; every sibling still runs (AC4)', async () => {
    const outcomes = await runPool({
      items: ['1', '2', '3'],
      limit: 3,
      worker: async id => {
        if (id === '2') throw new Error('boom')
        return ok(id)
      },
      ...poolDefaults,
    })
    expect(outcomes).toEqual([
      ok('1'),
      { id: '2', outcome: 'crashed', detail: 'Error: boom' },
      ok('3'),
    ])
  })

  it('once signalled, no NEW card starts; the not-started ones are reported, never dropped', async () => {
    let signalled = false
    const outcomes = await runPool({
      items: ['1', '2', '3'],
      limit: 1,
      mayStart: () => !signalled,
      worker: async id => {
        signalled = true
        return ok(id)
      },
      ...poolDefaults,
    })
    expect(outcomes.map(o => o.outcome)).toEqual(['completed', 'interrupted', 'interrupted'])
  })

  it('an empty plan starts nothing', async () => {
    const worker = vi.fn()
    expect(await runPool({ items: [], limit: 3, worker, ...poolDefaults })).toEqual([])
    expect(worker).not.toHaveBeenCalled()
  })
})

describe('outcomeOfExit / batchExitCode', () => {
  it.each([
    [{ exitCode: 0, signal: null }, 'completed', 'exit 0'],
    [{ exitCode: 1, signal: null }, 'failed', 'exit 1'],
    [{ exitCode: null, signal: 'SIGKILL' }, 'crashed', 'killed by SIGKILL'],
    [{ exitCode: null, signal: null, error: 'ENOENT' }, 'crashed', 'spawn failed: ENOENT'],
  ])('%j ⇒ %s', (exit, outcome, detail) => {
    expect(outcomeOfExit('7', exit)).toEqual({ id: '7', outcome, detail })
  })

  it('a partial batch exits 1 when any card failed or crashed, 0 otherwise', () => {
    expect(batchExitCode([ok('1'), { id: '2', outcome: 'skipped', detail: '' }])).toBe(0)
    expect(batchExitCode([ok('1'), { id: '2', outcome: 'failed', detail: 'exit 1' }])).toBe(1)
    expect(batchExitCode([{ id: '2', outcome: 'crashed', detail: '' }])).toBe(1)
  })
})

describe('buildCardProcessArgs — each card is exactly #487’s run --card (AC2)', () => {
  it('forwards the card, its observed labels and the operator’s own opt-ins verbatim', () => {
    const config = parseRunCommand({
      root: '66',
      parallel: '3',
      engine: 'pi',
      autonomous: true,
      approveProjectTrust: true,
      iterationTimeout: '90',
    })
    expect(
      buildCardProcessArgs(config, card('491', { labels: ['user story', 'risk:green'] }), '/p'),
    ).toEqual([
      'run',
      '--card',
      '491',
      '--card-tags',
      'user story,risk:green',
      '--engine',
      'pi',
      '--cwd',
      '/p',
      '--autonomous',
      '--approve-project-trust',
      '--iteration-timeout',
      '90',
    ])
  })

  it('adds no opt-in the operator did not pass, and no --card-tags for an unlabelled card', () => {
    const args = buildCardProcessArgs(
      parseRunCommand({ root: '66', parallel: '2' }),
      card('5'),
      '/p',
    )
    expect(args).toEqual(['run', '--card', '5', '--cwd', '/p', '--iteration-timeout', '1800'])
    expect(args).not.toContain('--root')
    expect(args).not.toContain('--parallel')
  })

  it('the argv it builds parses back as one card dispatch (never a second fan-out)', () => {
    const args = buildCardProcessArgs(
      parseRunCommand({ root: '66', parallel: '2', autonomous: true }),
      card('5', { labels: ['a', 'b'] }),
      '/p',
    )
    const options: Record<string, unknown> = {}
    for (let i = 1; i < args.length; i += 1) {
      const flag = args[i]!.replace(/^--/, '').replace(/-([a-z])/g, (_, c: string) =>
        c.toUpperCase(),
      )
      const value = args[i + 1]
      if (value === undefined || value.startsWith('--')) options[flag] = true
      else {
        options[flag] = value
        i += 1
      }
    }
    const parsed = parseRunCommand(options)
    expect(parsed.dispatch).toEqual({ card: '5', tags: ['a', 'b'] })
    expect(parsed.parallel).toBeUndefined()
  })
})

describe('prefixLine', () => {
  it('prefixes a card’s output with its id, but leaves DISPATCH-RECORD lines verbatim', () => {
    expect(prefixLine('7', 'hello')).toBe('  [#7] hello')
    expect(prefixLine('7', 'DISPATCH-RECORD: x event=start card=7')).toBe(
      'DISPATCH-RECORD: x event=start card=7',
    )
  })
})

describe('AC3 — card-lock guards the mutex resources across processes', () => {
  let area: string | undefined
  afterEach(() => {
    if (area) rmSync(area, { recursive: true, force: true })
    area = undefined
  })

  it('keys a resource by digest, as a safe card-lock id', () => {
    expect(resourceLockId('apps/pair-cli/src/x.ts')).toMatch(/^mutex-[0-9a-f]{16}$/)
    expect(resourceLockId('a')).not.toBe(resourceLockId('b'))
  })

  it('a resource another process holds (the REAL card-lock) skips the card, reported, spawning nothing', async () => {
    area = mkdtempSync(join(tmpdir(), 'pair-491-'))
    const other = acquireCardLock({ workingArea: area, card: resourceLockId('skill:a') })
    expect(other.kind).toBe('acquired')
    const runCardProcess = vi.fn<CardProcessRunner>()

    const outcome = await runPlannedCard({
      card: card('10', { mutexResources: ['skill:b', 'skill:a'] }),
      config: parseRunCommand({ root: '66', parallel: '2' }),
      cwd: area,
      workingArea: area,
      acquireLock: acquireCardLock,
      runCardProcess,
    })

    expect(outcome.outcome).toBe('skipped')
    expect(outcome.detail).toContain('mutex resource skill:a is held by another run')
    expect(runCardProcess).not.toHaveBeenCalled()
    // All or nothing: the resource it did take first is released again.
    expect(existsSync(join(area, LOCK_DIRECTORY, resourceLockId('skill:b')))).toBe(false)
    if (other.kind === 'acquired') other.lock.release()
  })

  it('holds every resource for the life of the card process and releases them after — even on failure', async () => {
    area = mkdtempSync(join(tmpdir(), 'pair-491-'))
    const lockPath = join(area, LOCK_DIRECTORY, resourceLockId('file:x'))
    let heldDuringRun = false
    const outcome = await runPlannedCard({
      card: card('11', { mutexResources: ['file:x'] }),
      config: parseRunCommand({ root: '66', parallel: '2' }),
      cwd: area,
      workingArea: area,
      acquireLock: acquireCardLock,
      runCardProcess: async () => {
        heldDuringRun = existsSync(lockPath)
        return { exitCode: 3, signal: null }
      },
      now: () => 't',
    })
    expect(heldDuringRun).toBe(true)
    expect(existsSync(lockPath)).toBe(false)
    expect(outcome).toEqual({
      id: '11',
      outcome: 'failed',
      detail: 'exit 3',
      startedAt: 't',
      endedAt: 't',
    })
  })

  it('never takes the CARD’s own lock — that is the child run --card’s (it would skip itself)', () => {
    const acquireLock = vi.fn<LockAcquirer>(() => ({
      kind: 'acquired',
      lock: { path: 'p', release: () => {} },
    }))
    acquireResourceLocks({
      card: card('12', { mutexResources: ['r'] }),
      workingArea: '/w',
      acquireLock,
    })
    expect(acquireLock.mock.calls.map(([request]) => request.card)).toEqual([resourceLockId('r')])
  })
})

describe('renderBatchAuditLine — AC6, one line per batch in the trail’s own key=value shape', () => {
  it('records start time, the cards attempted and each card’s outcome', () => {
    const line = renderBatchAuditLine({
      at: '2026-09-23T10:05:00.000Z',
      startedAt: '2026-09-23T10:00:00.000Z',
      root: '66',
      requested: 3,
      effective: 2,
      outcomes: [ok('10'), { id: '13', outcome: 'failed', detail: 'exit 1' }],
      excluded: [{ id: '11' }],
    })
    expect(line).toBe(
      '2026-09-23T10:05:00.000Z event=batch root=66 started=2026-09-23T10:00:00.000Z parallel=3 ' +
        'effective=2 attempted=10,13 outcomes=10:completed(exit 0),13:failed(exit 1) excluded=11',
    )
    expect(line).not.toContain('\n')
  })

  it('says (none) rather than leaving a field empty', () => {
    const line = renderBatchAuditLine({
      at: 'a',
      startedAt: 's',
      root: '66',
      requested: 3,
      effective: 0,
      outcomes: [],
      excluded: [],
    })
    expect(line).toContain('attempted=(none) outcomes=(none) excluded=(none)')
  })
})

describe('spawnCardProcess — a genuinely separate OS process (a stub CLI, never a real engine)', () => {
  let dir: string | undefined
  const argv1 = process.argv[1]
  afterEach(() => {
    process.argv[1] = argv1!
    vi.restoreAllMocks()
    if (dir) rmSync(dir, { recursive: true, force: true })
    dir = undefined
  })

  it('re-invokes the running entry point with the run --card argv, relays its output and reports its exit', async () => {
    dir = mkdtempSync(join(tmpdir(), 'pair-491-cli-'))
    const stub = join(dir, 'stub-cli.cjs')
    writeFileSync(
      stub,
      [
        "console.log('args=' + JSON.stringify(process.argv.slice(2)))",
        "console.log('DISPATCH-RECORD: t event=start card=9')",
        "console.error('warn line')",
        'process.exit(2)',
      ].join('\n'),
    )
    process.argv[1] = stub
    const lines: string[] = []
    vi.spyOn(console, 'log').mockImplementation((line: string) => void lines.push(line))

    const exit = await spawnCardProcess({ card: card('9'), args: ['run', '--card', '9'], cwd: dir })

    expect(exit).toEqual({ exitCode: 2, signal: null })
    expect(lines).toContain('  [#9] args=["run","--card","9"]')
    expect(lines).toContain('DISPATCH-RECORD: t event=start card=9')
    expect(lines).toContain('  [#9] warn line')
  })

  it('a crashed card process (killed) is reported by its signal', async () => {
    dir = mkdtempSync(join(tmpdir(), 'pair-491-cli-'))
    const stub = join(dir, 'stub-cli.cjs')
    writeFileSync(stub, "process.kill(process.pid, 'SIGKILL')")
    process.argv[1] = stub
    vi.spyOn(console, 'log').mockImplementation(() => {})

    const exit = await spawnCardProcess({ card: card('9'), args: [], cwd: dir })

    expect(outcomeOfExit('9', exit)).toEqual({
      id: '9',
      outcome: 'crashed',
      detail: 'killed by SIGKILL',
    })
  })
})

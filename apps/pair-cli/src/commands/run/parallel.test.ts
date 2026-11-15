import { describe, it, expect, vi, afterEach } from 'vitest'
import { InMemoryFileSystemService } from '@pair/content-ops'
import { handleRunCommand } from './handler'
import { existsSync, mkdtempSync, rmSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join, posix, win32 } from 'path'
import { acquireCardLock, LOCK_DIRECTORY, type LockAcquirer } from './card-lock'
import { parseRunCommand } from './parser'
import type { RootCandidate } from './root-plan'
import { parsePrepareResult } from './card-prepare'
import {
  acquireResourceLocks,
  batchExitCode,
  buildCardProcessArgs,
  outcomeOfExit,
  optionsOfArgv,
  prefixLine,
  renderBatchAuditLine,
  resourceLockId,
  runCardInProcess,
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
  it('queues a mutex conflict until its holder finishes, while independent work uses the other slot', async () => {
    const gate = deferred<void>()
    const started: string[] = []
    const pool = runPool({
      items: ['589', '598', '600'],
      limit: 2,
      resources: id => (id === '600' ? [] : ['pair-capability-publish-pr']),
      worker: async id => {
        started.push(id)
        if (id === '589') await gate.promise
        return ok(id)
      },
      ...poolDefaults,
    })
    await new Promise(r => setTimeout(r, 0))
    expect(started).toEqual(['589', '600'])
    gate.resolve()
    expect((await pool).map(o => o.id)).toEqual(['589', '598', '600'])
    expect(started).toEqual(['589', '600', '598'])
  })
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

  it('releases a mutex when a worker throws before returning a promise', async () => {
    const outcomes = await runPool({
      items: ['1', '2'],
      limit: 2,
      resources: () => ['shared'],
      worker: id => {
        if (id === '1') throw new Error('boom')
        return Promise.resolve(ok(id))
      },
      ...poolDefaults,
    })
    expect(outcomes).toEqual([{ id: '1', outcome: 'crashed', detail: 'Error: boom' }, ok('2')])
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

  it('US-523: the prepare outcome the card process printed rides on the card outcome (and on nothing else)', () => {
    expect(outcomeOfExit('7', { exitCode: 1, signal: null, prepare: 'escalated' })).toEqual({
      id: '7',
      outcome: 'failed',
      detail: 'exit 1',
      prepare: 'escalated',
    })
    expect(outcomeOfExit('7', { exitCode: 0, signal: null, prepare: 'needs-human' })).toMatchObject(
      {
        outcome: 'completed',
        prepare: 'needs-human',
      },
    )
  })

  it('US-592 AC-1/2: a clean preparation skip keeps its reason; a nonzero exit remains failed', () => {
    expect(
      outcomeOfExit('7', { exitCode: 0, signal: null, skipReason: 'prepare-needs-human' }),
    ).toEqual({
      id: '7',
      outcome: 'skipped',
      detail: 'prepare-needs-human',
    })
    expect(
      outcomeOfExit('7', { exitCode: 2, signal: null, skipReason: 'prepare-needs-human' }).outcome,
    ).toBe('failed')
  })

  it('US-523: only an exact PREPARE-RESULT line parses', () => {
    expect(parsePrepareResult('PREPARE-RESULT: prepared')).toBe('prepared')
    expect(parsePrepareResult('PREPARE-RESULT: needs-human')).toBe('needs-human')
    for (const line of ['PREPARE-RESULT: bogus', 'prepared', '  PREPARE-RESULT: prepared', ''])
      expect(parsePrepareResult(line)).toBeUndefined()
  })

  it('a partial batch exits 1 when any card failed or crashed, 0 otherwise', () => {
    expect(batchExitCode([ok('1'), { id: '2', outcome: 'skipped', detail: '' }])).toBe(0)
    expect(batchExitCode([ok('1'), { id: '2', outcome: 'failed', detail: 'exit 1' }])).toBe(1)
    expect(batchExitCode([{ id: '2', outcome: 'crashed', detail: '' }])).toBe(1)
  })
})

describe('buildCardProcessArgs — each card is exactly #487’s run --card (AC2)', () => {
  it('AC-24: forwards an explicit telemetry flag to each card and parses the off form', () => {
    const base = parseRunCommand({ root: '605', parallel: '1' })
    expect(buildCardProcessArgs({ ...base, telemetry: true }, card('645'), '/repo')).toContain(
      '--telemetry',
    )
    const off = buildCardProcessArgs({ ...base, telemetry: false }, card('645'), '/repo')
    expect(off).toContain('--no-telemetry')
    expect(optionsOfArgv(off)['telemetry']).toBe(false)
  })
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
    expect(args).toEqual(['run', '--card', '5', '--cwd', '/p'])
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

  it.each([
    ['darwin', posix],
    ['linux', posix],
    ['win32', win32],
  ] as const)(
    'platform %s (darwin, linux, win32): a resource lock id is one valid directory segment',
    (_platform, path) => {
      // `skill:a` or `C:\\x` as a raw directory name is invalid on win32 (`:` reserved) and a
      // path-separated resource would nest directories — the digest key avoids both everywhere.
      for (const resource of [
        'skill:a',
        'apps/pair-cli/src/x.ts',
        'apps\\pair-cli\\x.ts',
        'C:\\x',
      ]) {
        const id = resourceLockId(resource)
        expect(path.basename(path.join('locks', id))).toBe(id)
        expect(id).not.toMatch(/[<>:"/\\|?*]/)
      }
    },
  )

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
        'effective=2 attempted=10,13 outcomes=10:completed(exit 0),13:failed(exit 1) excluded=11 excludedReasons=(none)'.replace(
          '(none)',
          encodeURIComponent('[{"id":"11","reason":""}]'),
        ),
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
    expect(line).toContain(
      'attempted=(none) outcomes=(none) excluded=(none) excludedReasons=(none)',
    )
  })
})

describe('renderBatchAuditLine — AC4, reasons reconstructable', () => {
  it('round-trips multiline/special-character reasons next to the ids', () => {
    const reason = 'blocked by #9 (a b="c"\nd, e=f)'
    const line = renderBatchAuditLine({
      at: 'a',
      startedAt: 's',
      root: '66',
      requested: 1,
      effective: 1,
      outcomes: [],
      excluded: [{ id: '11', reason }],
    })
    expect(line).not.toContain('\n')
    expect(line).toContain(' excluded=11 ')
    const token = line.split(' ').find(t => t.startsWith('excludedReasons='))!
    expect(JSON.parse(decodeURIComponent(token.slice('excludedReasons='.length)))).toEqual([
      { id: '11', reason },
    ])
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

  it('US-523: the PREPARE-RESULT line the card process prints is carried on its exit, and still relayed', async () => {
    dir = mkdtempSync(join(tmpdir(), 'pair-523-cli-'))
    const stub = join(dir, 'stub-cli.cjs')
    writeFileSync(stub, "console.log('PREPARE-RESULT: escalated')\nprocess.exit(1)")
    process.argv[1] = stub
    const lines: string[] = []
    vi.spyOn(console, 'log').mockImplementation((line: string) => void lines.push(line))

    const exit = await spawnCardProcess({ card: card('9'), args: [], cwd: dir })

    expect(exit).toEqual({ exitCode: 1, signal: null, prepare: 'escalated' })
    expect(lines).toContain('  [#9] PREPARE-RESULT: escalated')
  })

  it('US-592 AC-1: carries the card skip marker from the child', async () => {
    dir = mkdtempSync(join(tmpdir(), 'pair-592-cli-'))
    const stub = join(dir, 'stub-cli.cjs')
    writeFileSync(stub, "console.log('CARD-SKIP: prepare-needs-human')\nprocess.exit(0)")
    process.argv[1] = stub
    vi.spyOn(console, 'log').mockImplementation(() => {})

    expect(await spawnCardProcess({ card: card('9'), args: [], cwd: dir })).toEqual({
      exitCode: 0,
      signal: null,
      skipReason: 'prepare-needs-human',
    })
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

describe('US-573 AC5: timeouts forwarded to each child card only when passed', () => {
  it('--idle-timeout and --iteration-timeout travel verbatim', () => {
    const args = buildCardProcessArgs(
      parseRunCommand({ root: '66', parallel: '2', idleTimeout: '600', iterationTimeout: '7200' }),
      card('5'),
      '/p',
    )
    expect(args.slice(-4)).toEqual(['--iteration-timeout', '7200', '--idle-timeout', '600'])
  })
})

describe('US-573 AC2: the pool reports each card live — start, relayed stages, end', () => {
  it('card-start before the process, the child events relayed, card-end with its cycle status', async () => {
    const area = mkdtempSync(join(tmpdir(), 'pair-573-'))
    const events: unknown[] = []
    const runCardProcess: CardProcessRunner = async ({ onEvent }) => {
      onEvent?.({ event: 'stage', card: 'ENG-4', stage: 'review' })
      return { exitCode: 0, signal: null, cycleStatus: 'ready-for-merge' }
    }
    await runPlannedCard({
      card: card('ENG-4', { title: 'Linear card' }),
      config: parseRunCommand({ root: '66', parallel: '2' }),
      cwd: area,
      workingArea: area,
      acquireLock: acquireCardLock,
      runCardProcess,
      onEvent: e => events.push(e),
    })
    expect(events).toEqual([
      { event: 'card-start', card: 'ENG-4', title: 'Linear card' },
      { event: 'stage', card: 'ENG-4', stage: 'review' },
      { event: 'card-end', card: 'ENG-4', status: 'ready-for-merge' },
    ])
  })

  it('a crashed card ends failed with its reason', async () => {
    const area = mkdtempSync(join(tmpdir(), 'pair-573-'))
    const events: unknown[] = []
    await runPlannedCard({
      card: card('9'),
      config: parseRunCommand({ root: '66', parallel: '2' }),
      cwd: area,
      workingArea: area,
      acquireLock: acquireCardLock,
      runCardProcess: async () => ({ exitCode: null, signal: 'SIGKILL' }),
      onEvent: e => events.push(e),
    })
    expect(events.at(-1)).toEqual({
      event: 'card-end',
      card: '9',
      status: 'failed (crashed)',
      reason: 'killed by SIGKILL',
    })
  })

  // US-592 AC-3, PR #635 r0-2: both outcomes must come from scheduled cards.
  describe.each([
    { scheduling: 'sequential', limit: 1, resources: [] },
    { scheduling: 'shared mutex', limit: 2, resources: ['shared-scope'] },
  ])('US-592 r0-2 $scheduling', ({ limit, resources }) => {
    it.each([
      {
        name: 'completed descendant',
        exit: { exitCode: 0, signal: null },
        outcome: 'completed',
        detail: 'exit 0',
        status: 'completed',
        batchExit: 0,
      },
      {
        name: 'all-skipped batch',
        exit: { exitCode: 0, signal: null, skipReason: 'prepare-needs-human' },
        outcome: 'skipped',
        detail: 'prepare-needs-human',
        status: 'skipped',
        batchExit: 0,
      },
      {
        name: 'failed descendant control',
        exit: { exitCode: 2, signal: null },
        outcome: 'failed',
        detail: 'exit 2',
        status: 'failed (failed)',
        batchExit: 1,
      },
      {
        name: 'crashed descendant control',
        exit: { exitCode: null, signal: 'SIGKILL' },
        outcome: 'crashed',
        detail: 'killed by SIGKILL',
        status: 'failed (crashed)',
        batchExit: 1,
      },
    ])('$name', async testCase => {
      const area = mkdtempSync(join(tmpdir(), 'pair-592-pool-'))
      const events: unknown[] = []
      const runCardProcess = vi.fn<CardProcessRunner>(async ({ card }) =>
        card.id === '9'
          ? { exitCode: 0, signal: null, skipReason: 'prepare-needs-human' }
          : testCase.exit,
      )
      try {
        const outcomes = await runPool({
          items: ['9', '10'],
          limit,
          resources: () => resources,
          worker: id =>
            runPlannedCard({
              card: card(id, { mutexResources: resources }),
              config: parseRunCommand({ root: '9', parallel: String(limit) }),
              cwd: area,
              workingArea: area,
              acquireLock: acquireCardLock,
              runCardProcess,
              onEvent: event => events.push(event),
            }),
          ...poolDefaults,
        })
        expect(runCardProcess.mock.calls.map(([input]) => input.card.id)).toEqual(['9', '10'])
        expect(outcomes.map(({ id, outcome, detail }) => ({ id, outcome, detail }))).toEqual([
          { id: '9', outcome: 'skipped', detail: 'prepare-needs-human' },
          { id: '10', outcome: testCase.outcome, detail: testCase.detail },
        ])
        expect(events).toEqual([
          { event: 'card-start', card: '9', title: 'Card 9' },
          { event: 'card-end', card: '9', status: 'skipped', reason: 'prepare-needs-human' },
          { event: 'card-start', card: '10', title: 'Card 10' },
          {
            event: 'card-end',
            card: '10',
            status: testCase.status,
            ...(testCase.outcome !== 'completed' && { reason: testCase.detail }),
          },
        ])
        const audit = renderBatchAuditLine({
          at: 't',
          startedAt: 't',
          root: '9',
          requested: limit,
          effective: limit,
          outcomes,
          excluded: [],
        })
        expect(audit).toContain('attempted=9,10 ')
        expect(audit).toContain(
          `outcomes=9:skipped(prepare-needs-human),10:${testCase.outcome}(${testCase.detail})`,
        )
        expect(batchExitCode(outcomes)).toBe(testCase.batchExit)
      } finally {
        rmSync(area, { recursive: true, force: true })
      }
    })
  })
})

describe('US-592 r0-1', () => {
  it.each(
    [
      {
        runner: 'in-process',
        caseName: 'conflicting skip and delivered cycle',
        lines: ['CARD-SKIP: prepare-needs-human', '  Cycle status: ready-for-merge'],
        exitCode: 0,
        outcome: 'completed',
        detail: 'exit 0',
        status: 'ready-for-merge',
        batchExit: 0,
      },
      {
        runner: 'child',
        caseName: 'conflicting skip and delivered cycle',
        lines: ['CARD-SKIP: prepare-needs-human', '  Cycle status: ready-for-merge'],
        exitCode: 0,
        outcome: 'completed',
        detail: 'exit 0',
        status: 'ready-for-merge',
        batchExit: 0,
      },
      ...(['in-process', 'child'] as const).flatMap(runner => [
        {
          runner,
          caseName: `control: delivered ${runner} without a skip marker completes the batch`,
          lines: ['  Cycle status: ready-for-merge'],
          exitCode: 0,
          outcome: 'completed',
          detail: 'exit 0',
          status: 'ready-for-merge',
          batchExit: 0,
        },
        {
          runner,
          caseName: `control: clean ${runner} skip reaches card-end and audit`,
          lines: ['CARD-SKIP: prepare-needs-human'],
          exitCode: 0,
          outcome: 'skipped',
          detail: 'prepare-needs-human',
          status: 'skipped',
          batchExit: 0,
        },
        {
          runner,
          caseName: `control: nonzero ${runner} exit with skip marker`,
          lines: ['CARD-SKIP: prepare-needs-human'],
          exitCode: 2,
          outcome: 'failed',
          detail: 'exit 2',
          status: 'failed (failed)',
          batchExit: 1,
        },
      ]),
      {
        runner: 'child',
        caseName: 'control: child skip marker followed by a signal remains crashed',
        lines: ['CARD-SKIP: prepare-needs-human'],
        exitCode: null,
        outcome: 'crashed',
        detail: 'killed by SIGKILL',
        status: 'failed (crashed)',
        batchExit: 1,
      },
    ].map(testCase => [`US-592 r0-1 ${testCase.caseName} (${testCase.runner})`, testCase] as const),
  )('%s', async (_name, testCase) => {
    const area = mkdtempSync(join(tmpdir(), 'pair-592-r0-1-'))
    const originalEntry = process.argv[1]
    const events: unknown[] = []
    try {
      const stub = join(area, 'stub-cli.cjs')
      writeFileSync(
        stub,
        [
          ...testCase.lines.map(line => `console.log(${JSON.stringify(line)})`),
          testCase.exitCode === null
            ? "process.kill(process.pid, 'SIGKILL')"
            : `process.exit(${testCase.exitCode})`,
        ].join('\n'),
      )
      process.argv[1] = stub
      vi.spyOn(console, 'log').mockImplementation(() => {})
      const runCardProcess =
        testCase.runner === 'child'
          ? spawnCardProcess
          : runCardInProcess(async () => {
              for (const line of testCase.lines) console.log(line)
              return testCase.exitCode!
            })
      const outcome = await runPlannedCard({
        card: card('9'),
        config: parseRunCommand({ root: '9', parallel: '1' }),
        cwd: area,
        workingArea: area,
        acquireLock: acquireCardLock,
        runCardProcess: async input => {
          const exit = await runCardProcess(input)
          expect
            .soft(exit.skipReason)
            .toBe(
              testCase.lines.includes('CARD-SKIP: prepare-needs-human')
                ? 'prepare-needs-human'
                : undefined,
            )
          return exit
        },
        onEvent: event => events.push(event),
      })
      expect
        .soft(outcome)
        .toMatchObject({ id: '9', outcome: testCase.outcome, detail: testCase.detail })
      expect.soft(events.at(-1)).toEqual({
        event: 'card-end',
        card: '9',
        status: testCase.status,
        ...(testCase.status !== 'ready-for-merge' && { reason: testCase.detail }),
      })
      expect
        .soft(
          renderBatchAuditLine({
            at: 't',
            startedAt: 't',
            root: '9',
            requested: 1,
            effective: 1,
            outcomes: [outcome],
            excluded: [],
          }),
        )
        .toContain(`outcomes=9:${testCase.outcome}(${testCase.detail})`)
      expect(batchExitCode([outcome])).toBe(testCase.batchExit)
    } finally {
      process.argv[1] = originalEntry!
      vi.restoreAllMocks()
      rmSync(area, { recursive: true, force: true })
    }
  })
})

// US-592 AC-3 / PR #635 r0-2: preserve descendants at every batch consumer and admission rule.
const descendantCases = [
  {
    name: 'completed',
    exit: { exitCode: 0, signal: null },
    outcome: 'completed',
    detail: 'exit 0',
    status: 'completed',
    batchExit: 0,
  },
  {
    name: 'skipped',
    exit: { exitCode: 0, signal: null, skipReason: 'prepare-needs-human' },
    outcome: 'skipped',
    detail: 'prepare-needs-human',
    status: 'skipped',
    batchExit: 0,
  },
  {
    name: 'failed',
    exit: { exitCode: 2, signal: null },
    outcome: 'failed',
    detail: 'exit 2',
    status: 'failed (failed)',
    batchExit: 1,
  },
  {
    name: 'crashed',
    exit: { exitCode: null, signal: 'SIGKILL' },
    outcome: 'crashed',
    detail: 'killed by SIGKILL',
    status: 'failed (crashed)',
    batchExit: 1,
  },
] as const

function descendantRunner(testCase: (typeof descendantCases)[number], overlap: boolean) {
  const descendantStarted = deferred<void>()
  const rootEnded = deferred<void>()
  const order: string[] = []
  const runCardProcess = vi.fn<CardProcessRunner>(async ({ card }) => {
    order.push(`start:${card.id}`)
    if (card.id === '9') {
      if (overlap) await descendantStarted.promise
      return { exitCode: 0, signal: null, skipReason: 'prepare-needs-human' }
    }
    descendantStarted.resolve()
    if (overlap) await rootEnded.promise
    return testCase.exit
  })
  const onEnd = (id: string) => {
    order.push(`end:${id}`)
    if (id === '9') rootEnded.resolve()
  }
  return { runCardProcess, onEnd, order }
}

function expectDescendantAudit(audit: string, testCase: (typeof descendantCases)[number]) {
  expect(audit).toContain('attempted=9,10 ')
  expect(audit).toContain(
    `outcomes=9:skipped(prepare-needs-human),10:${testCase.outcome}(${testCase.detail})`,
  )
}

describe('US-592 r0-2 unconstrained parallel', () => {
  it.each(descendantCases)(
    '$name descendant retains its result with overlapping workers',
    async testCase => {
      const area = mkdtempSync(join(tmpdir(), 'pair-592-uncontended-'))
      const events: unknown[] = []
      const h = descendantRunner(testCase, true)
      try {
        const outcomes = await runPool({
          items: ['9', '10'],
          limit: 2,
          resources: () => [],
          ...poolDefaults,
          worker: id =>
            runPlannedCard({
              card: card(id),
              config: parseRunCommand({ root: '9', parallel: '2' }),
              cwd: area,
              workingArea: area,
              acquireLock: acquireCardLock,
              runCardProcess: h.runCardProcess,
              onEvent: event => {
                events.push(event)
                if (event.event === 'card-end') h.onEnd(event.card!)
              },
            }),
        })
        expect(h.runCardProcess.mock.calls.map(([input]) => input.card.id)).toEqual(['9', '10'])
        expect(h.order).toEqual(['start:9', 'start:10', 'end:9', 'end:10'])
        expect(outcomes.map(({ id, outcome, detail }) => ({ id, outcome, detail }))).toEqual([
          { id: '9', outcome: 'skipped', detail: 'prepare-needs-human' },
          { id: '10', outcome: testCase.outcome, detail: testCase.detail },
        ])
        expect(events).toEqual([
          { event: 'card-start', card: '9', title: 'Card 9' },
          { event: 'card-start', card: '10', title: 'Card 10' },
          { event: 'card-end', card: '9', status: 'skipped', reason: 'prepare-needs-human' },
          {
            event: 'card-end',
            card: '10',
            status: testCase.status,
            ...(testCase.outcome !== 'completed' && { reason: testCase.detail }),
          },
        ])
        expectDescendantAudit(
          renderBatchAuditLine({
            at: 't',
            startedAt: 't',
            root: '9',
            requested: 2,
            effective: 2,
            outcomes,
            excluded: [],
          }),
          testCase,
        )
        expect(batchExitCode(outcomes)).toBe(testCase.batchExit)
      } finally {
        rmSync(area, { recursive: true, force: true })
      }
    },
  )
})

describe.each([
  { scheduling: 'sequential', limit: 1, resources: [], overlap: false },
  { scheduling: 'shared-mutex', limit: 2, resources: ['shared-scope'], overlap: false },
  { scheduling: 'unconstrained', limit: 2, resources: [], overlap: true },
])('US-592 r0-2 CLI $scheduling', ({ limit, resources, overlap }) => {
  describe.each([false, true])('watch=%s', watch => {
    it.each(descendantCases)(
      '$name descendant reaches handler output, events, audit and exit',
      async testCase => {
        const area = mkdtempSync(join(tmpdir(), 'pair-592-cli-'))
        const previousPath = process.env['PATH']
        const h = descendantRunner(testCase, overlap)
        const audit: string[] = []
        const events: Array<{ event: string; card?: string; detail: Record<string, unknown> }> = []
        const output: string[] = []
        const selectCandidates = vi.fn(async () =>
          ['9', '10'].map(id =>
            card(id, { macrostate: 'Ready', labels: ['risk:green'], mutexResources: resources }),
          ),
        )
        try {
          process.env['PATH'] = area
          vi.spyOn(console, 'log').mockImplementation((...args: unknown[]) => {
            output.push(args.map(String).join(' '))
          })
          vi.spyOn(process.stdout, 'write').mockImplementation(chunk => {
            output.push(String(chunk))
            return true
          })
          const fs = new InMemoryFileSystemService(
            {
              [`${area}/config.json`]: JSON.stringify({ asset_registries: {} }),
              [`${area}/claude`]: '',
              [`${area}/.claude/skills/pair-workflow-cycle/SKILL.md`]: '',
              [`${area}/.pair/adoption/tech/automation.md`]:
                '## Eligibility\n\nrisk:green\n\n## Max Parallelism\n\n2',
            },
            area,
            area,
          )
          const code = await handleRunCommand(
            parseRunCommand({
              root: '9',
              parallel: String(limit),
              autonomous: true,
              watch,
              ...(watch && { maxIterations: '1' }),
            }),
            fs,
            {
              selectCandidates,
              readPrereqState: () => ({ blocked: false, prerequisites: [] }),
              runCardProcess: h.runCardProcess,
              acquireLock: acquireCardLock,
              appendAudit: (_path, line) => {
                audit.push(line)
              },
              runAudit: (_path, line) => {
                const event = JSON.parse(line) as (typeof events)[number]
                events.push(event)
                if (event.event === 'card-end') h.onEnd(event.card!)
              },
              wait: async () => {
                throw new Error('one-iteration batch must not wait')
              },
            },
          )
          expect(selectCandidates).toHaveBeenCalledTimes(1)
          expect(h.runCardProcess.mock.calls.map(([input]) => input.card.id)).toEqual(['9', '10'])
          expect(h.order).toEqual(
            overlap
              ? ['start:9', 'start:10', 'end:9', 'end:10']
              : ['start:9', 'end:9', 'start:10', 'end:10'],
          )
          expect(
            events.filter(event => event.event === 'card-start').map(event => event.card),
          ).toEqual(['9', '10'])
          expect(
            events
              .filter(event => event.event === 'card-end')
              .map(event => ({
                card: event.card,
                status: event.detail['status'],
                reason: event.detail['reason'],
              })),
          ).toEqual([
            { card: '9', status: 'skipped', reason: 'prepare-needs-human' },
            {
              card: '10',
              status: testCase.status,
              reason: testCase.outcome === 'completed' ? undefined : testCase.detail,
            },
          ])
          const batches = audit.filter(line => line.includes('event=batch'))
          expect(batches).toHaveLength(1)
          expectDescendantAudit(batches[0]!, testCase)
          expect(output.join('')).toContain('#9: skipped — prepare-needs-human')
          expect(output.join('')).toContain(`#10: ${testCase.outcome} — ${testCase.detail}`)
          expect(audit.some(line => line.includes('event=loop-end'))).toBe(watch)
          expect(code).toBe(testCase.batchExit)
        } finally {
          vi.restoreAllMocks()
          process.env['PATH'] = previousPath
          rmSync(area, { recursive: true, force: true })
        }
      },
    )
  })
})

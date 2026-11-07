import { describe, it, expect, vi, afterEach } from 'vitest'
import { InMemoryFileSystemService } from '@pair/content-ops'
import { handleRunCommand, type RunHandlerDependencies } from './handler'
import { parseRunCommand } from './parser'
import { POLICY_PATH } from './automation-policy'
import type { LockAcquirer } from './card-lock'
import { resolveMaxParallelism, type RootCandidate } from './root-plan'
import type { CardProcessExit, CardProcessRunner } from './parallel'
import { parseCandidates } from './root-select'

/** US-575 AC6: the deterministic prerequisite state, faked from each fixture card's own prerequisites. */
const prereqsOf = (candidates: readonly RootCandidate[]) => (id: string) => {
  const listed = candidates.find(c => c.id === id)?.prerequisites ?? []
  return {
    blocked: listed.some(p => !p.merged),
    prerequisites: listed.map(p => ({
      id: p.id,
      state: p.merged ? 'merged' : 'open',
      ...(!p.merged && { reason: 'not merged' }),
    })),
  }
}

/**
 * US-491 — `pair-cli run --root <id> --parallel N` end to end through the real handler, with the
 * two process boundaries stubbed: the `pair-next` selection (an engine process) and each
 * `run --card` child. Nothing real is spawned; the audit writer and the lock are injected.
 */

const cwd = '/project'

const policy = (maxParallelism: string, extra = '') => `## Eligibility

risk:green

## Max Parallelism

${maxParallelism}
${extra}`

function projectFs(policyText?: string) {
  return new InMemoryFileSystemService(
    {
      [`${cwd}/config.json`]: JSON.stringify({ asset_registries: {} }),
      '/bin/claude': '',
      '/bin/pi': '',
      [`${cwd}/.claude/skills/pair-workflow-cycle/SKILL.md`]: '',
      ...(policyText !== undefined && { [`${cwd}/${POLICY_PATH}`]: policyText }),
    },
    cwd,
    cwd,
  )
}

const card = (id: string, extra: Partial<RootCandidate> = {}): RootCandidate => ({
  id,
  title: `Card ${id}`,
  branch: `feature/US-${id}-x`,
  tier: 'risk:green',
  macrostate: 'Ready',
  labels: ['risk:green'],
  mutexResources: [],
  prerequisites: [],
  ...extra,
})

function captureLog() {
  const lines: string[] = []
  vi.spyOn(console, 'log').mockImplementation((...args: unknown[]) => {
    lines.push(args.map(String).join(' '))
  })
  return lines
}

const freeLock: LockAcquirer = ({ card: id }) => ({
  kind: 'acquired',
  lock: { path: `/locks/${id}`, release: () => {} },
})

function harness(candidates: RootCandidate[], exits: Record<string, CardProcessExit> = {}) {
  const audit: Array<{ path: string; line: string }> = []
  const started: string[] = []
  let inFlight = 0
  let peak = 0
  const runCardProcess = vi.fn<CardProcessRunner>(async ({ card: c }) => {
    inFlight += 1
    peak = Math.max(peak, inFlight)
    started.push(c.id)
    await new Promise(r => setTimeout(r, 2))
    inFlight -= 1
    return exits[c.id] ?? { exitCode: 0, signal: null }
  })
  const selectCandidates = vi.fn(async (_input?: unknown) => candidates)
  const deps: RunHandlerDependencies = {
    runAudit: () => {},
    readPrereqState: prereqsOf(candidates),
    selectCandidates,
    runCardProcess,
    acquireLock: freeLock,
    appendAudit: (path, line) => void audit.push({ path, line }),
  }
  return { deps, audit, started, runCardProcess, selectCandidates, peak: () => peak }
}

const PATH_BEFORE = process.env['PATH']

afterEach(() => {
  vi.restoreAllMocks()
  process.env['PATH'] = PATH_BEFORE
})

describe('run --root --parallel — AC1 plan printed before dispatch', () => {
  it('prints the plan, every exclusion and why, and the effective limit naming what bound it, before any card starts', async () => {
    process.env['PATH'] = '/bin'
    const lines = captureLog()
    const h = harness([
      card('10', { mutexResources: ['skill:a'] }),
      card('11', { mutexResources: ['skill:a'] }),
      card('12', { prerequisites: [{ id: '10', merged: false }] }),
      card('13'),
      card('14'),
    ])
    let firstStartLine = -1
    h.runCardProcess.mockImplementation(async () => {
      if (firstStartLine < 0) firstStartLine = lines.length
      return { exitCode: 0, signal: null }
    })

    const code = await handleRunCommand(
      parseRunCommand({ root: '66', parallel: '2', autonomous: true }),
      projectFs(policy('3')),
      h.deps,
    )

    expect(code).toBe(0)
    const before = lines.slice(0, firstStartLine).join('\n')
    expect(before).toContain('Plan: Run (4): #10, #11, #13, #14')
    expect(before).toContain('Excluded #12: blocked by #10 (not merged)')
    expect(before).toContain(
      'Effective parallelism: 2 = min(dependency-allowed 4, --parallel 2 [overrides ## Max Parallelism 3]) — bound by --parallel',
    )
  })

  it('edge: --parallel above the dependency-allowed count — the smaller value, reported', async () => {
    process.env['PATH'] = '/bin'
    const lines = captureLog()
    const h = harness([card('1'), card('2')])
    await handleRunCommand(
      parseRunCommand({ root: '66', parallel: '9', autonomous: true }),
      projectFs(policy('5')),
      h.deps,
    )
    expect(lines.join('\n')).toContain('Effective parallelism: 2')
    expect(lines.join('\n')).toContain('bound by dependency-allowed')
  })
})

describe('run --root --parallel — AC2 each card is its own run --card process, at most the limit at once', () => {
  it('US-611: selection → plan → pool prioritizes Review #589, then drains Ready #598', async () => {
    process.env['PATH'] = '/bin'
    const lines = captureLog()
    const candidates = parseCandidates(
      JSON.stringify({
        candidates: [
          card('598', { macrostate: 'Ready', mutexResources: ['pair-capability-publish-pr'] }),
          card('589', { macrostate: 'Review', mutexResources: ['pair-capability-publish-pr'] }),
          card('600', { macrostate: 'In Progress' }),
        ],
      }),
    )
    const h = harness(candidates)
    let release!: () => void
    const held = new Promise<void>(resolve => {
      release = resolve
    })
    h.runCardProcess.mockImplementation(async ({ card: c }) => {
      h.started.push(c.id)
      if (c.id === '589') await held
      return { exitCode: 0, signal: null }
    })
    const running = handleRunCommand(
      parseRunCommand({ root: '605', parallel: '2', autonomous: true }),
      projectFs(policy('2')),
      h.deps,
    )
    await new Promise(resolve => setTimeout(resolve, 0))
    expect(h.started).toEqual(['589', '600'])
    expect(lines.join('\n')).toContain('Plan: Run (3): #589, #600, #598')
    release()
    expect(await running).toBe(0)
    expect(h.started).toEqual(['589', '600', '598'])
    expect(h.audit[0]!.line).toContain('attempted=589,600,598')
  })

  it('US-611: explicit order beats adoption and is reported in the audit', async () => {
    process.env['PATH'] = '/bin'
    const lines = captureLog()
    const h = harness([card('589', { macrostate: 'Review' }), card('598', { macrostate: 'Ready' })])
    expect(
      await handleRunCommand(
        parseRunCommand({
          root: '605',
          parallel: '1',
          stateOrder: 'Ready,Review,In Progress',
          autonomous: true,
        }),
        projectFs(policy('2', '\n## Delivery State Order\n\nReview,In Progress,Ready\n')),
        h.deps,
      ),
    ).toBe(0)
    expect(h.started).toEqual(['598', '589'])
    expect(lines.join('\n')).toContain('Ready → Review → In Progress → Draft (--state-order)')
    expect(h.audit[0]!.line).toContain('state-order-source=--state-order')
  })
  it('runs every planned card through the pool at the explicitly requested limit', async () => {
    process.env['PATH'] = '/bin'
    captureLog()
    const h = harness([card('1'), card('2'), card('3'), card('4'), card('5')])

    await handleRunCommand(
      parseRunCommand({ root: '66', parallel: '4', autonomous: true }),
      projectFs(policy('2')),
      h.deps,
    )

    expect(h.started.sort()).toEqual(['1', '2', '3', '4', '5'])
    expect(h.peak()).toBe(4)
    expect(h.audit.find(e => e.line.includes('event=batch'))?.line).toContain(
      'parallel-source=--parallel',
    )
    const call = h.runCardProcess.mock.calls[0]![0]
    expect(call.args.slice(0, 3)).toEqual(['run', '--card', call.card.id])
    expect(call.args).toContain('--autonomous')
    expect(call.cwd).toBe(cwd)
  })

  it('edge --parallel 1: one run --card at a time, the whole plan still runs', async () => {
    process.env['PATH'] = '/bin'
    captureLog()
    const h = harness([card('1'), card('2'), card('3')])
    await handleRunCommand(
      parseRunCommand({ root: '66', parallel: '1', autonomous: true }),
      projectFs(policy('3')),
      h.deps,
    )
    expect(h.started).toEqual(['1', '2', '3'])
    expect(h.peak()).toBe(1)
  })

  it('selects through pair-next --root exactly once, with the policy eligibility and the resolved engine', async () => {
    process.env['PATH'] = '/bin'
    captureLog()
    const h = harness([card('1')])
    await handleRunCommand(
      parseRunCommand({
        root: '66',
        parallel: '2',
        autonomous: true,
        approveProjectTrust: true,
        engine: 'pi',
      }),
      projectFs(policy('3')),
      h.deps,
    )
    expect(h.selectCandidates).toHaveBeenCalledTimes(1)
    expect(h.selectCandidates.mock.calls[0]).toMatchObject([
      { root: '66', eligibility: 'risk:green', cwd, engine: { id: 'pi' } },
    ])
  })

  it('relays full-preset eligibility to selection and card children over legacy green', async () => {
    process.env['PATH'] = '/bin'
    captureLog()
    const h = harness([card('1', { tier: 'risk:red', labels: ['risk:red'] })])
    h.deps.resolveAutonomy = () => ({
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
    })
    await handleRunCommand(
      parseRunCommand({ root: '66', parallel: '2', autonomous: true, preset: 'full' }),
      projectFs(policy('3')),
      h.deps,
    )
    expect(h.selectCandidates.mock.calls[0]?.[0]).toMatchObject({ eligibility: '*' })
    expect(h.runCardProcess.mock.calls[0]?.[0].args).toContain('--eligibility-filter')
    expect(h.runCardProcess.mock.calls[0]?.[0].args).toContain('*')
  })
})

describe('run --root --parallel — AC4 partial-batch isolation', () => {
  it('one card failing and one crashing never abort the others; every outcome is reported; exit 1', async () => {
    process.env['PATH'] = '/bin'
    const lines = captureLog()
    const h = harness([card('1'), card('2'), card('3'), card('4')], {
      '2': { exitCode: 1, signal: null },
      '3': { exitCode: null, signal: 'SIGTERM' },
    })

    const code = await handleRunCommand(
      parseRunCommand({ root: '66', parallel: '2', autonomous: true }),
      projectFs(policy('3')),
      h.deps,
    )

    expect(code).toBe(1)
    expect(h.started.sort()).toEqual(['1', '2', '3', '4'])
    const text = lines.join('\n')
    expect(text).toContain('#1: completed — exit 0')
    expect(text).toContain('#2: failed — exit 1')
    expect(text).toContain('#3: crashed — killed by SIGTERM')
    expect(text).toContain('#4: completed — exit 0')
  })

  it('a card process runner that throws is that card’s crash, not the batch’s', async () => {
    process.env['PATH'] = '/bin'
    captureLog()
    const h = harness([card('1'), card('2')])
    h.runCardProcess.mockImplementation(async ({ card: c }) => {
      if (c.id === '1') throw new Error('spawn exploded')
      return { exitCode: 0, signal: null }
    })
    const code = await handleRunCommand(
      parseRunCommand({ root: '66', parallel: '2', autonomous: true }),
      projectFs(policy('3')),
      h.deps,
    )
    expect(code).toBe(1)
    expect(h.audit[0]!.line).toContain('outcomes=1:crashed(spawn exploded),2:completed(exit 0)')
  })
})

describe('run --root --parallel — AC6 aggregated audit', () => {
  it('appends ONE batch line to ## Audit Location: start time, cards attempted, per-card outcome', async () => {
    process.env['PATH'] = '/bin'
    captureLog()
    const h = harness([card('1'), card('2', { prerequisites: [{ id: '9', merged: false }] })], {
      '1': { exitCode: 1, signal: null },
    })

    await handleRunCommand(
      parseRunCommand({ root: '66', parallel: '2', autonomous: true }),
      projectFs(policy('3', '\n## Audit Location\n\nautomation/fanout.md\n')),
      h.deps,
    )

    expect(h.audit).toHaveLength(1)
    expect(h.audit[0]!.path).toBe(`${cwd}/.pair/working/automation/fanout.md`)
    expect(h.audit[0]!.line).toMatch(
      /^\S+ event=batch root=66 started=\S+ parallel=2 effective=1 attempted=1 outcomes=1:failed\(exit 1\) excluded=2 excludedReasons=\S+ parallel-source=--parallel state-order=Review,In_Progress,Ready state-order-source=default$/,
    )
  })
})

describe('US-575 AC6: prerequisite state comes from the deterministic script, never the selection', () => {
  it('a card the selection calls ready but whose prerequisite is parked is excluded `blocked by #<id> (<reason>)`; an unreadable state fails closed', async () => {
    process.env['PATH'] = '/bin'
    const lines = captureLog()
    // The selection claims every prerequisite merged — the script says otherwise, and wins.
    const h = harness([
      card('1', { prerequisites: [{ id: '9', merged: true }] }),
      card('2'),
      card('3'),
    ])
    h.deps.readPrereqState = id => {
      if (id === '3') throw new Error('gh: HTTP 502')
      return id === '1'
        ? {
            blocked: true,
            prerequisites: [{ id: '9', state: 'parked', reason: 'parked (needs-review)' }],
            blockedBy: { id: '9', reason: 'parked (needs-review)' },
          }
        : { blocked: false, prerequisites: [] }
    }

    await handleRunCommand(
      parseRunCommand({ root: '66', parallel: '2', autonomous: true }),
      projectFs(policy('3')),
      h.deps,
    )

    expect(h.started).toEqual(['2'])
    expect(lines.join('\n')).toContain('Excluded #1: blocked by #9 (parked (needs-review))')
    expect(lines.join('\n')).toContain(
      'Excluded #3: blocked by #3 (prerequisites unreadable: gh: HTTP 502)',
    )
  })
})

describe('run --root --parallel — edges that are not errors', () => {
  it('--root resolving to zero cards: "nothing to do", exit 0, nothing spawned', async () => {
    process.env['PATH'] = '/bin'
    const lines = captureLog()
    const h = harness([])
    const code = await handleRunCommand(
      parseRunCommand({ root: '66', parallel: '2', autonomous: true }),
      projectFs(policy('3')),
      h.deps,
    )
    expect(code).toBe(0)
    expect(lines.join('\n')).toContain('Nothing to do: pair-next --root 66 selected no card')
    expect(h.runCardProcess).not.toHaveBeenCalled()
  })

  it('every card excluded: "nothing eligible to run concurrently", exit 0, batch line still written', async () => {
    process.env['PATH'] = '/bin'
    const lines = captureLog()
    const h = harness([card('1', { tier: 'risk:red' })])
    const code = await handleRunCommand(
      parseRunCommand({ root: '66', parallel: '2', autonomous: true }),
      projectFs(policy('3')),
      h.deps,
    )
    expect(code).toBe(0)
    expect(lines.join('\n')).toContain('Nothing eligible to run concurrently')
    expect(h.runCardProcess).not.toHaveBeenCalled()
    expect(h.audit[0]!.line).toContain('attempted=(none)')
  })

  it('--dry-run resolves and prints, runs no selection and spawns nothing', async () => {
    process.env['PATH'] = '/bin'
    const lines = captureLog()
    const h = harness([card('1')])
    const code = await handleRunCommand(
      parseRunCommand({ root: '66', parallel: '2', autonomous: true, dryRun: true }),
      projectFs(policy('3')),
      h.deps,
    )
    expect(code).toBe(0)
    expect(h.selectCandidates).not.toHaveBeenCalled()
    expect(h.runCardProcess).not.toHaveBeenCalled()
    expect(lines.join('\n')).toContain('Scope: pair-next --root 66 --filter risk:green')
  })

  it('engine missing (PATH with no engine directory at all): refused before the selection spawns', async () => {
    process.env['PATH'] = '/nonexistent-pair-491'
    captureLog()
    const h = harness([card('1')])
    await expect(
      handleRunCommand(
        parseRunCommand({ root: '66', parallel: '2', autonomous: true }),
        projectFs(policy('3')),
        h.deps,
      ),
    ).rejects.toThrow(/could not be located|not on PATH/)
    expect(h.selectCandidates).not.toHaveBeenCalled()
  })
})

describe('run --root --parallel — AC5 no batch-level merge logic', () => {
  it('the fan-out modules construct no merge command', async () => {
    const { readFileSync } = await import('fs')
    const { join } = await import('path')
    for (const file of ['parallel.ts', 'parallel-entry.ts', 'root-plan.ts', 'root-select.ts']) {
      const source = readFileSync(join(__dirname, file), 'utf-8')
      expect(source, file).not.toMatch(/gh pr merge|'merge'|"merge"/)
    }
  })
})

describe('US-573: the pool writes its card events to the live JSONL audit', () => {
  it('loop-start first, then card-start/card-end per card, then loop-end', async () => {
    process.env['PATH'] = '/bin'
    captureLog()
    vi.spyOn(process.stdout, 'write').mockImplementation(() => true)
    const h = harness([card('1'), card('ENG-2')], {
      'ENG-2': { exitCode: 1, signal: null, cycleStatus: 'failed-verify' },
    })
    const lines: Array<Record<string, unknown>> = []
    await handleRunCommand(
      parseRunCommand({ root: '66', parallel: '2', autonomous: true }),
      projectFs(policy('2')),
      {
        ...h.deps,
        runAudit: (_path, line) => void lines.push(JSON.parse(line) as Record<string, unknown>),
      },
    )
    expect(lines[0]).toMatchObject({ event: 'loop-start', detail: { root: cwd } })
    expect(
      lines
        .filter(l => l['event'] === 'card-end')
        .map(l => [l['card'], (l['detail'] as { status: string }).status])
        .sort(),
    ).toEqual([
      ['1', 'completed'],
      ['ENG-2', 'failed-verify'],
    ])
    expect(lines.at(-1)).toMatchObject({ event: 'loop-end', detail: { status: 'halted' } })
  })
})

describe('US-590 r0-1: shared-mutex cards at --parallel 1 run serially, in order, one child at a time', () => {
  const shared = (id: string) => card(id, { mutexResources: ['skill:a'] })

  it('every shared-mutex card runs in selection order with at most one active child', async () => {
    process.env['PATH'] = '/bin'
    const lines = captureLog()
    const h = harness([shared('1'), shared('2'), shared('3')])
    const code = await handleRunCommand(
      parseRunCommand({ root: '66', parallel: '1', autonomous: true }),
      projectFs(policy('3')),
      h.deps,
    )
    expect(code).toBe(0)
    expect(h.started).toEqual(['1', '2', '3'])
    expect(h.peak()).toBe(1)
    expect(lines.join('\n')).not.toContain('Excluded #')
  })

  it('a failing card in the serial chain never aborts the next; exit 1', async () => {
    process.env['PATH'] = '/bin'
    captureLog()
    const h = harness([shared('1'), shared('2'), shared('3')], {
      '2': { exitCode: 1, signal: null },
    })
    const code = await handleRunCommand(
      parseRunCommand({ root: '66', parallel: '1', autonomous: true }),
      projectFs(policy('3')),
      h.deps,
    )
    expect(code).toBe(1)
    expect(h.started).toEqual(['1', '2', '3'])
    expect(h.peak()).toBe(1)
  })
})

describe('US-590 r0-2: the audited excludedReasons equal the plan’s own exclusion reasons', () => {
  it('decoded excludedReasons match the printed plan exclusions, id for id', async () => {
    process.env['PATH'] = '/bin'
    const lines = captureLog()
    const h = harness([
      card('1', { mutexResources: ['skill:a'] }),
      card('2', { mutexResources: ['skill:a'] }),
      card('3', { prerequisites: [{ id: '9', merged: false }] }),
    ])
    await handleRunCommand(
      parseRunCommand({ root: '66', parallel: '2', autonomous: true }),
      projectFs(policy('3', '\n## Audit Location\n\nautomation/fanout.md\n')),
      h.deps,
    )
    const planned = lines
      .flatMap(l => l.split('\n'))
      .map(l => /^ +Excluded #(\S+): (.+)$/.exec(l))
      .filter((m): m is RegExpExecArray => m !== null)
      .map(m => ({ id: m[1]!, reason: m[2]! }))
    expect(planned.length).toBe(1)
    const encoded = /(?:^| )excludedReasons=(\S+)(?= |$)/.exec(h.audit[0]!.line)![1]!
    expect(JSON.parse(decodeURIComponent(encoded))).toEqual(planned)
  })
})

describe('US-593 omitted argument precedence through the handler', () => {
  function adoptionRun(count = 5, text = policy('3')) {
    process.env['PATH'] = '/bin'
    const lines = captureLog()
    vi.spyOn(process.stdout, 'write').mockImplementation(() => true)
    const h = harness(Array.from({ length: count }, (_, i) => card(String(i + 1))))
    const live: Array<Record<string, unknown>> = []
    h.deps.runAudit = (_path, line) => void live.push(JSON.parse(line))
    h.deps.resolveAutonomy = () => ({
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
    })
    return {
      ...h,
      lines,
      live,
      fs: projectFs(text + '\n\n## Stop Predicate\n\nmax-iterations: 1\n'),
    }
  }

  function assertAdoption(h: ReturnType<typeof adoptionRun>, loop = false) {
    expect(h.started.slice().sort()).toEqual(['1', '2', '3', '4', '5'])
    expect(h.peak()).toBe(3)
    expect(h.lines.join('\n')).toMatch(/Effective parallelism: 3[^\n]*## Max Parallelism/)
    const batch = h.audit.find(e => e.line.includes('event=batch'))?.line
    expect(batch).toContain('parallel=3')
    expect(batch).toContain('effective=3')
    expect(batch).toContain('parallel-source=## Max Parallelism')
    expect(h.live[0]).toMatchObject({
      event: 'loop-start',
      detail: { policy: { parallel: 3, parallelSource: '## Max Parallelism' } },
    })
    if (loop) {
      const start = h.audit.find(e => e.line.includes('event=loop-start'))?.line
      expect(start).toContain('parallel=3')
      expect(start).toContain('max-parallelism=3')
      expect(start).toContain('parallel-source=## Max Parallelism')
    }
  }

  it('inherits adopted parallelism when full preset omits --parallel', async () => {
    const h = adoptionRun()
    await handleRunCommand(
      parseRunCommand({
        root: '66',
        preset: 'full',
        autonomous: true,
        watch: true,
        maxIterations: '1',
      }),
      h.fs,
      h.deps,
    )
    assertAdoption(h, true)
    expect(h.selectCandidates.mock.calls[0]?.[0]).toMatchObject({ eligibility: '*' })
    for (const [call] of h.runCardProcess.mock.calls) expect(call.args).toContain('*')
  })

  const cases = [
    ['--watch', { watch: true }],
    ['--watch + --interval', { watch: true, interval: '60s' }],
    ['--predicate', { predicate: 'tag:ready ⇒ Done' }],
    ['--preset', { preset: 'full' }],
    ['--until', { until: 'pr' }],
    ['--prepare', { prepare: 'always' }],
    ['--merge', { merge: 'never' }],
  ] as const
  for (const [flag, options] of cases) {
    it(`omitted --parallel under ${flag}`, async () => {
      const h = adoptionRun()
      const watching = 'watch' in options
      await handleRunCommand(
        parseRunCommand({
          root: '66',
          autonomous: true,
          ...options,
          ...(watching && { maxIterations: '1' }),
        }),
        h.fs,
        h.deps,
      )
      assertAdoption(h, watching)
      if (!watching) {
        expect(h.selectCandidates).toHaveBeenCalledTimes(1)
        expect(h.audit.filter(e => e.line.includes('event=batch'))).toHaveLength(1)
        expect(h.audit.some(e => e.line.includes('event=loop-start'))).toBe(false)
      }
    })
  }

  it('standalone --interval requires --watch before handler dispatch', () => {
    expect(() => parseRunCommand({ root: '66', interval: '60s' })).toThrow(
      '--interval requires --watch',
    )
  })

  it('omitted --parallel with --no-watch', async () => {
    const h = adoptionRun()
    await handleRunCommand(
      parseRunCommand({ root: '66', watch: false, autonomous: true }),
      h.fs,
      h.deps,
    )
    assertAdoption(h)
    expect(h.selectCandidates).toHaveBeenCalledTimes(1)
    expect(h.audit.filter(e => e.line.includes('event=batch'))).toHaveLength(1)
    expect(h.audit.some(e => e.line.includes('event=loop-start'))).toBe(false)
  })

  it('fewer eligible cards than the adopted cap', async () => {
    const h = adoptionRun(2)
    await handleRunCommand(
      parseRunCommand({ root: '66', preset: 'full', autonomous: true }),
      h.fs,
      h.deps,
    )
    expect(h.started).toEqual(['1', '2'])
    expect(h.peak()).toBe(2)
    expect(h.lines.join('\n')).toMatch(/Effective parallelism: 2[^\n]*bound by dependency-allowed/)
  })

  it('omitted --parallel uses the policy default', async () => {
    const h = adoptionRun(5, '## Eligibility\n\nrisk:green\n')
    const config = parseRunCommand({ root: '66', preset: 'full', autonomous: true })
    await handleRunCommand(config, h.fs, h.deps)
    expect(h.peak()).toBe(1)
    expect(h.started).toHaveLength(5)
    expect(h.lines.join('\n')).toContain('KB default')
    expect(h.live[0]).toMatchObject({
      detail: { policy: { parallel: 1, parallelSource: 'KB default' } },
    })
    expect(config.parallel).toBeUndefined()
  })

  it('omitted --parallel uses the single-tier adoption override', async () => {
    const h = adoptionRun(5, policy('3', 'risk:green: 2'))
    await handleRunCommand(
      parseRunCommand({ root: '66', preset: 'full', autonomous: true }),
      h.fs,
      h.deps,
    )
    expect(h.peak()).toBe(2)
    expect(h.started).toHaveLength(5)
    expect(h.lines.join('\n')).toMatch(/Effective parallelism: 2[^\n]*risk:green/)
    expect(h.audit.find(e => e.line.includes('event=batch'))?.line).toContain(
      'parallel-source=## Max Parallelism risk:green',
    )
  })

  it('mixed tiers use the global policy cap', () => {
    const limits = { global: 3, perTier: { 'risk:green': 2, 'risk:red': 1 } }
    expect(resolveMaxParallelism(limits, ['risk:green'])).toBe(2)
    expect(resolveMaxParallelism(limits, ['risk:green', 'risk:red'])).toBe(3)
  })

  it('ordinary --root without a loop flag', async () => {
    const h = adoptionRun()
    const config = parseRunCommand({ root: '66' })
    await expect(handleRunCommand(config, h.fs, h.deps)).rejects.toThrow(
      /skill|invocation|installed/i,
    )
    expect(config.parallel).toBeUndefined()
    expect(h.selectCandidates).not.toHaveBeenCalled()
    expect(h.started).toEqual([])
    expect(h.audit).toEqual([])
  })
})

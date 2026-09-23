import { describe, it, expect, vi, afterEach } from 'vitest'
import { InMemoryFileSystemService } from '@pair/content-ops'
import { handleRunCommand, type RunHandlerDependencies } from './handler'
import { parseRunCommand } from './parser'
import { POLICY_PATH } from './automation-policy'
import type { LockAcquirer } from './card-lock'
import type { RootCandidate } from './root-plan'
import type { CardProcessExit, CardProcessRunner } from './parallel'

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
  const selectCandidates = vi.fn(async () => candidates)
  const deps: RunHandlerDependencies = {
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
    expect(before).toContain('Plan: Run (3): #10, #13, #14')
    expect(before).toContain('Excluded #11: mutex conflict on skill:a')
    expect(before).toContain('Excluded #12: blocked by #10 (not merged)')
    expect(before).toContain(
      'Effective parallelism: 2 = min(dependency-allowed 3, ## Max Parallelism 3, --parallel 2) — bound by --parallel',
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
  it('runs every planned card through the pool and never exceeds min(D, ## Max Parallelism, N)', async () => {
    process.env['PATH'] = '/bin'
    captureLog()
    const h = harness([card('1'), card('2'), card('3'), card('4'), card('5')])

    await handleRunCommand(
      parseRunCommand({ root: '66', parallel: '4', autonomous: true }),
      projectFs(policy('2')),
      h.deps,
    )

    expect(h.started.sort()).toEqual(['1', '2', '3', '4', '5'])
    expect(h.peak()).toBe(2)
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
      /^\S+ event=batch root=66 started=\S+ parallel=2 effective=1 attempted=1 outcomes=1:failed\(exit 1\) excluded=2$/,
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

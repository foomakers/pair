import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { InMemoryFileSystemService } from '@pair/content-ops'
import { handleRunCommand } from './handler'
import { parseRunCommand } from './parser'
import { classify } from './cards-run'
import { runPlannedCard, type CardProcessExit } from './parallel'
import * as interrupt from './interrupt'

let root: string
beforeEach(() => {
  root = realpathSync(mkdtempSync(join(tmpdir(), 'pair-classify-')))
  vi.stubEnv('PATH', '/bin')
})
afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllEnvs()
  rmSync(root, { recursive: true, force: true })
})

const groups = [
  { id: 'target', statuses: ['merged', 'ready-for-merge', 'target-ready'], end: 'at-target' },
  {
    id: 'human',
    statuses: ['escalated', 'escalate', 'needs-human', 'merge-parked', 'merged-closure-unfinished'],
    end: 'terminal',
  },
  { id: 'notfound', statuses: ['not-found'], end: 'terminal' },
  { id: 'prefix', statuses: ['failed-implement', 'failed-future', 'failed-'], end: 'terminal' },
  { id: 'gate', statuses: ['gate-red'], end: 'terminal' },
  {
    id: 'plain',
    statuses: [
      'rounds-bound-reached',
      'failed',
      'xfailed-implement',
      'FAILED-implement',
      'unknown',
      '',
    ],
    end: 'retryable',
  },
  { id: 'absent', statuses: [undefined], end: 'retryable' },
] as const

const forms: ReadonlyArray<{
  id: string
  exit: CardProcessExit
  detail: string
}> = [
  { id: 'completed', exit: { exitCode: 0, signal: null }, detail: 'exit 0' },
  { id: 'failed', exit: { exitCode: 1, signal: null }, detail: 'exit 1' },
  {
    id: 'error',
    exit: { exitCode: null, signal: null, error: 'fixture spawn error' },
    detail: 'spawn failed: fixture spawn error',
  },
  { id: 'signal', exit: { exitCode: null, signal: 'SIGKILL' }, detail: 'killed by SIGKILL' },
  {
    id: 'interrupted',
    exit: { exitCode: 1, signal: null },
    detail: 'the driver was signalled',
  },
  {
    id: 'detail',
    exit: { exitCode: 1, signal: null, needsHuman: 'fixture decision' },
    detail: 'needs-human: fixture decision',
  },
]

async function invoke(
  first: CardProcessExit,
  { signalled = false, cards = '1,2', closed = false } = {},
) {
  const calls: string[] = []
  const output: string[] = []
  const audit: string[] = []
  let peers = 0
  const interrupted = vi.spyOn(interrupt, 'isInterrupted').mockReturnValue(false)
  const closedAt = vi.fn((id: string) => (closed && id === '1' ? new Date(0) : null))
  vi.spyOn(console, 'log').mockImplementation((...args: unknown[]) => {
    output.push(args.join(' '))
  })
  const fs = new InMemoryFileSystemService(
    { [join(root, 'config.json')]: JSON.stringify({ asset_registries: {} }) },
    root,
    root,
  )
  const code = await handleRunCommand(
    parseRunCommand({ cwd: root, autonomous: true, cards, maxIterations: 3 }),
    fs,
    {
      readCardClosedAt: closedAt,
      runCardProcess: async ({ card }) => {
        calls.push(card.id)
        if (card.id === '1') {
          interrupted.mockReturnValue(signalled)
          return first
        }
        peers += 1
        const dir = join(root, '.pair/working/runs/story-2/2')
        mkdirSync(dir, { recursive: true })
        writeFileSync(join(dir, 'a0-implement-phase.json'), '{}')
        return {
          exitCode: peers === 1 ? 1 : 0,
          signal: null,
          cycleStatus: peers === 1 ? 'rounds-bound-reached' : 'ready-for-merge',
        }
      },
      appendAudit: (_path, line) => void audit.push(line),
    },
  )
  return { code, calls, closedAt, output: output.join('\n'), audit: audit.join('\n') }
}

const cases = groups.flatMap(group =>
  forms.flatMap(form =>
    group.statuses.map(status => ({
      row: `I1-${group.id}-${form.id}`,
      status,
      form,
      end:
        group.end === 'retryable' && ['completed', 'detail'].includes(form.id)
          ? 'terminal'
          : group.end,
    })),
  ),
)

describe('r1-g1 handler status by representation partitions', () => {
  it.each(cases)('$row: $status', async ({ status, form, end }) => {
    const first = { ...form.exit, ...(status !== undefined && { cycleStatus: status }) }
    const result = await invoke(first, { signalled: form.id === 'interrupted' })
    const reason = status === undefined ? form.detail : `${status} (${form.detail})`
    expect(result.output).toContain(`#1: ${end} — ${reason}`)
    expect(result.audit).toContain(`1:${end}`)
    if (form.id === 'interrupted') {
      expect(result.calls).toEqual(['1'])
      expect(result.output).toContain('#2: retryable — interrupted')
      expect(result.output).toContain('Stop: interrupted')
      expect(result.code).toBe(1)
      return
    }
    expect(result.calls).toEqual(end === 'retryable' ? ['1', '2', '1', '2'] : ['1', '2', '2'])
    expect(result.output).toContain('#2: at-target')
    expect(result.output).toContain('Passes: 2')
    expect(result.code).toBe(end === 'at-target' ? 0 : 1)
  })

  it.each([2, null])('I1-exit-complement: nonzero/null exit %s is unfinished', async exitCode => {
    const result = await invoke({ exitCode, signal: null })
    expect(result.calls).toEqual(['1', '2', '1', '2'])
    expect(result.output).toContain(`#1: retryable — exit ${String(exitCode)}`)
    expect(result.code).toBe(1)
  })

  it('I1-skipped: real mutex refusal produces a terminal outcome without calling the runner', async () => {
    const runner = vi.fn()
    const release = vi.fn()
    const outcome = await runPlannedCard({
      card: {
        id: '1',
        title: '',
        branch: '',
        tier: '',
        mutexResources: ['shared'],
        prerequisites: [],
      },
      config: parseRunCommand({ cwd: root, autonomous: true, cards: '1,2' }),
      cwd: root,
      workingArea: root,
      acquireLock: () => ({ kind: 'held', path: join(root, 'held'), alive: true, pid: 42 }),
      runCardProcess: runner,
      heldLocks: new Set([release]),
    })
    expect(runner).not.toHaveBeenCalled()
    expect(release).not.toHaveBeenCalled()
    expect(outcome.outcome).toBe('skipped')
    expect(outcome.cycleStatus).toBeUndefined()
    expect(classify(outcome)).toEqual({ id: '1', end: 'terminal', reason: outcome.detail })
  })
})

describe('r1-g1 terminal lifetime', () => {
  it.each([
    { id: 'R1', closed: false, calls: ['1'], end: 'terminal — gate-red (exit 0)', code: 1 },
    { id: 'R2', closed: true, calls: [], end: 'at-target — already at target', code: 0 },
  ])(
    '$id: next invocation reads durable closed=$closed again',
    async ({ closed, calls, end, code }) => {
      // exit 0 already terminates at the base; this isolates restart from the exit-1 defect.
      const gate = { exitCode: 0, signal: null, cycleStatus: 'gate-red' }
      const first = await invoke(gate, { cards: '1' })
      expect(first.calls).toEqual(['1'])
      expect(first.closedAt).toHaveBeenCalledWith('1', root)
      expect(first.output).toContain('#1: terminal — gate-red (exit 0)')
      expect(first.code).toBe(1)
      const next = await invoke(gate, { cards: '1', closed })
      expect(next.closedAt).toHaveBeenCalledWith('1', root)
      expect(next.calls).toEqual(calls)
      expect(next.output).toContain(`#1: ${end}`)
      expect(next.code).toBe(code)
    },
  )
})

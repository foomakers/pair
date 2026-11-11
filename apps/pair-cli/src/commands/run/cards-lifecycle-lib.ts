import { afterEach, beforeEach, expect, vi } from 'vitest'
import {
  existsSync,
  symlinkSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { InMemoryFileSystemService } from '@pair/content-ops'
import { handleRunCommand } from './handler'
import { parseRunCommand } from './parser'
import type { CardProcessExit } from './parallel'
export let root: string
export const mapping = `## State Mapping

| Board State | Macrostate |
| --- | --- |
| Inbox | Draft |
| Planned | Ready |
| Building | In Progress |
| Checking | Review |
| Finished | Done |
`
export const retry: CardProcessExit = {
  exitCode: 1,
  signal: null,
  cycleStatus: 'rounds-bound-reached',
}
export const prepared: CardProcessExit = { exitCode: 0, signal: null, prepare: 'prepared' }
export const target: CardProcessExit = { exitCode: 0, signal: null, cycleStatus: 'ready-for-merge' }
export interface Card {
  number: number
  title: string
  body: string
  labels: { name: string }[]
  state: string
  stateReason: string | null
  closedAt: string | null
  projectItems: { status: { name: string } }[]
}
export const board = (name = 'Inbox'): Card => ({
  number: 12,
  title: 'Card',
  body: '**Status**: Inbox',
  labels: [],
  state: 'OPEN',
  stateReason: null,
  closedAt: null,
  projectItems: [{ status: { name } }],
})
export const closed = () => ({
  ...board('Finished'),
  state: 'CLOSED',
  stateReason: 'COMPLETED',
  closedAt: '2026-01-01T00:00:00Z',
})
export type Tracker = {
  cards: Record<string, Card | ReturnType<typeof closed> | null>
  prs: object[]
}
export const save = (state: Tracker) =>
  writeFileSync(join(root, 'tracker.json'), JSON.stringify(state))

beforeEach(() => {
  root = realpathSync(mkdtempSync(join(tmpdir(), 'pair-lifecycle-')))
  const bin = join(root, 'bin')
  mkdirSync(bin)
  const stub = readFileSync(join(__dirname, '__fixtures__/cards-lifecycle-gh.cjs'), 'utf8')
  writeFileSync(join(bin, 'gh'), `#!${process.execPath}\n${stub}`, { mode: 0o755 })
  vi.stubEnv('PATH', `${bin}:/usr/bin:/bin`)
  vi.stubEnv('PAIR_CARDS_FIXTURE', root)
  vi.stubEnv('PAIR_GH_BIN', join(bin, 'gh'))
  symlinkSync(process.execPath, join(bin, 'node'))
  mkdirSync(join(root, '.pair/adoption/tech'), { recursive: true })
  writeFileSync(join(root, '.pair/adoption/tech/way-of-working.md'), mapping)
})
afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllEnvs()
  rmSync(root, { recursive: true, force: true })
})

export function handoff(id: string, phase = 'a0', skill = 'implement-phase') {
  const dir = join(root, '.pair/working/runs', `story-${id}`, id)
  mkdirSync(dir, { recursive: true })
  writeFileSync(
    join(dir, `${phase}-${skill}.json`),
    JSON.stringify({
      run: `story-${id}`,
      story: id,
      phase,
      skill,
      status: 'ok',
      inputHead: 'a'.repeat(40),
      outputHead: 'b'.repeat(40),
      schemaVersion: 3,
      workflowVersion: '4.0.1',
      attempt: 1,
    }),
  )
}

export async function invoke(
  state: Tracker,
  step: (id: string, n: number) => CardProcessExit,
  { cards = '12,15,9', cap = 4 } = {},
) {
  save(state)
  const calls: string[] = []
  const counts = new Map<string, number>()
  const output: string[] = []
  const audit: string[] = []
  vi.spyOn(console, 'log').mockImplementation((...args: unknown[]) => {
    output.push(args.join(' '))
  })
  const fs = new InMemoryFileSystemService(
    {
      [join(root, 'config.json')]: JSON.stringify({ asset_registries: {} }),
      [join(root, '.pair/adoption/tech/way-of-working.md')]: readFileSync(
        join(root, '.pair/adoption/tech/way-of-working.md'),
        'utf8',
      ),
    },
    root,
    root,
  )
  const code = await handleRunCommand(
    parseRunCommand({ cwd: root, autonomous: true, cards, maxIterations: cap }),
    fs,
    {
      runCardProcess: async ({ card }) => {
        calls.push(card.id)
        const n = (counts.get(card.id) ?? 0) + 1
        counts.set(card.id, n)
        const result = step(card.id, n)
        save(state)
        return result
      },
      appendAudit: (_path, line) => {
        audit.push(line)
      },
    },
  )
  expect(existsSync(join(root, 'unexpected.txt'))).toBe(false)
  return { code, calls, output: output.join('\n'), audit: audit.join('\n') }
}
export const initial = (): Tracker => ({
  cards: { 12: board(), 15: board(), 9: closed() },
  prs: [],
})
export const pr = (isDraft: boolean) => ({
  number: 42,
  title: 'Card 12',
  body: 'Closes #12',
  state: 'OPEN',
  isDraft,
  headRefName: 'feature/US-12-card',
  headRefOid: 'a'.repeat(40),
  baseRefName: 'main',
  url: 'https://example.invalid/pull/42',
  labels: [{ name: 'pr-state:to-be-reviewed' }],
  reviewDecision: 'REVIEW_REQUIRED',
  statusCheckRollup: [],
  mergedAt: null,
  closingIssuesReferences: [{ number: 12 }],
})

export async function boardAdvance(
  first: CardProcessExit,
  before: string,
  after: string,
  cards = '12,15,9',
) {
  const state = initial()
  state.cards['12'] = board(before)
  return invoke(
    state,
    (id, n) => {
      if (n > 1) return target
      if (id === '12') {
        state.cards[id] = board(after)
        return first
      }
      return retry
    },
    { cards },
  )
}

export type PrState = 'absent' | 'draft' | 'review' | 'rejected' | 'ready' | 'merged' | 'closed'
const statusGroups = [
  { statuses: ['merged', 'ready-for-merge', 'target-ready'], end: 'at-target' },
  {
    statuses: [
      'escalated',
      'escalate',
      'needs-human',
      'merge-parked',
      'merged-closure-unfinished',
      'gate-red',
      'not-found',
      'failed-implement',
      'failed-future',
      'failed-',
    ],
    end: 'terminal',
  },
  {
    statuses: [
      'rounds-bound-reached',
      'failed',
      'xfailed-implement',
      'FAILED-implement',
      'unknown',
      '',
      undefined,
    ],
    end: 'retryable',
  },
] as const
const exitForms: { id: string; exit: CardProcessExit }[] = [
  { id: 'zero', exit: { exitCode: 0, signal: null } },
  { id: 'nonzero', exit: { exitCode: 1, signal: null } },
  { id: 'null', exit: { exitCode: null, signal: null } },
  { id: 'error', exit: { exitCode: null, signal: null, error: 'offline engine error' } },
  { id: 'signal', exit: { exitCode: null, signal: 'SIGKILL' } },
  { id: 'detail', exit: { exitCode: 1, signal: null, needsHuman: 'fixture decision' } },
]
export const preparedCases = statusGroups.flatMap(group =>
  group.statuses.flatMap(status =>
    exitForms.map(form => ({
      id: `${group.end}-${form.id}-${status === undefined ? 'absent' : status || 'empty'}`,
      exit: {
        ...form.exit,
        prepare: 'prepared' as const,
        ...(status !== undefined && { cycleStatus: status }),
      },
      status,
      expected: group.end === 'retryable' && form.id === 'detail' ? 'terminal' : group.end,
    })),
  ),
)

export async function preparedHandlerCase(c: (typeof preparedCases)[number]) {
  const state = initial()
  const result = await invoke(
    state,
    (id, n) => {
      if (id === '12') return c.exit
      if (n > 1) return target
      handoff(id)
      return retry
    },
    { cards: '12,15' },
  )
  expect(result.calls).toEqual(
    c.expected === 'retryable' ? ['12', '15', '12', '15'] : ['12', '15', '15'],
  )
  expect(result.output).toContain(`#12: ${c.expected}`)
  expect(result.code).toBe(c.expected === 'at-target' ? 0 : 1)
}

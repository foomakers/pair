import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import {
  existsSync,
  cpSync,
  symlinkSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from 'fs'
import { tmpdir } from 'os'
import { join, resolve } from 'path'
import { spawnSync } from 'child_process'
import { InMemoryFileSystemService } from '@pair/content-ops'
import { handleRunCommand } from './handler'
import { parseRunCommand } from './parser'
import { classify, runCardList } from './cards-run'
import { readCardClosedAt, readCardDocumentViaGh } from './cycle-wiring'
import { parseStateMapping, resolveMacrostate } from './card-readiness'
import { runCardInProcess, outcomeOfExit } from './parallel'
import type { CardProcessExit } from './parallel'
import type { RunHandlerDependencies } from './run-context'
// @ts-expect-error — shipped script has no TypeScript declaration
import { decide as prepareDecide } from '../../../../../packages/knowledge-hub/dataset/.skills/workflow/cycle/scripts/cycle-prepare.mjs'

let root: string
const mapping = `## State Mapping

| Board State | Macrostate |
| --- | --- |
| Inbox | Draft |
| Planned | Ready |
| Building | In Progress |
| Checking | Review |
| Finished | Done |
`
const retry: CardProcessExit = { exitCode: 1, signal: null, cycleStatus: 'rounds-bound-reached' }
const prepared: CardProcessExit = { exitCode: 0, signal: null, prepare: 'prepared' }
const target: CardProcessExit = { exitCode: 0, signal: null, cycleStatus: 'ready-for-merge' }
interface Card {
  number: number
  title: string
  body: string
  labels: { name: string }[]
  state: string
  stateReason: string | null
  closedAt: string | null
  projectItems: { status: { name: string } }[]
}
const board = (name = 'Inbox'): Card => ({
  number: 12,
  title: 'Card',
  body: '**Status**: Inbox',
  labels: [],
  state: 'OPEN',
  stateReason: null,
  closedAt: null,
  projectItems: [{ status: { name } }],
})
const closed = () => ({
  ...board('Finished'),
  state: 'CLOSED',
  stateReason: 'COMPLETED',
  closedAt: '2026-01-01T00:00:00Z',
})
type Tracker = { cards: Record<string, Card | ReturnType<typeof closed> | null>; prs: object[] }
const save = (state: Tracker) => writeFileSync(join(root, 'tracker.json'), JSON.stringify(state))

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

function handoff(id: string, phase = 'a0', skill = 'implement-phase') {
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

async function invoke(
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
const initial = (): Tracker => ({ cards: { 12: board(), 15: board(), 9: closed() }, prs: [] })
const pr = (isDraft: boolean) => ({
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

async function boardAdvance(
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

const advanceCases = [
  ['W1', 'Inbox', 'Planned'],
  ['W2', 'Planned', 'Building'],
  ['W3', 'Building', 'Checking'],
] as const
it.each(advanceCases)(
  '%s: mapped board-only advance retries unfinished in order',
  async (_id, before, after) => {
    const result = await boardAdvance(retry, before, after)
    expect(result.calls).toEqual(['12', '15', '12', '15'])
    expect(result.output).toContain('Passes: 2')
    expect(result.output).toContain('#9: at-target')
    expect(result.code).toBe(0)
  },
)
it('W4: successful board-only preparation stays eligible with a retryable peer', async () => {
  const result = await boardAdvance(prepared, 'Inbox', 'Planned')
  expect(result.calls).toEqual(['12', '15', '12', '15'])
  expect(result.output).toContain('Stop: all-at-target')
  expect(result.audit).toContain('12:at-target,15:at-target,9:at-target')
  expect(result.code).toBe(0)
})
it('W5: prepared card after its peer keeps original order', async () => {
  const result = await boardAdvance(prepared, 'Inbox', 'Planned', '15,12,9')
  expect(result.calls).toEqual(['15', '12', '15', '12'])
  expect(result.code).toBe(0)
})
it('W6: successful preparation remains retryable when only the peer advances', async () => {
  const result = await invoke(initial(), (id, n) => {
    if (n > 1) return target
    if (id === '15') {
      handoff(id)
      return retry
    }
    return prepared
  })
  expect(result.calls).toEqual(['12', '15', '12', '15'])
  expect(result.code).toBe(0)
})
it('W7: prepared with no durable progress stops as unfinished, not terminal', async () => {
  const result = await invoke(initial(), () => prepared, { cards: '12' })
  expect(result.calls).toEqual(['12'])
  expect(result.output).toContain('#12: retryable')
  expect(result.output).toContain('Stop: no-progress')
  expect(result.code).toBe(1)
})
it('W8: board progress is visible even with existing later cycle handoffs', async () => {
  handoff('12', 'r9', 'review-phase')
  const result = await boardAdvance(retry, 'Inbox', 'Planned')
  expect(result.calls).toEqual(['12', '15', '12', '15'])
  expect(result.code).toBe(0)
})
it.each([
  ['W9', false],
  ['W10', true],
] as const)('%s: PR-only creation or draft-to-open counts as progress', async (_id, draft) => {
  const state = initial()
  state.cards['12'] = board('Checking')
  if (draft) state.prs = [pr(true)]
  const result = await invoke(
    state,
    (_card, n) => {
      if (n > 1) return target
      state.prs = [pr(false)]
      return retry
    },
    { cards: '12' },
  )
  expect(result.calls).toEqual(['12', '12'])
  expect(result.output).toContain('Passes: 2')
  expect(result.code).toBe(0)
})
it('W11: durable completion after running wins over an unfinished process result', async () => {
  const state = initial()
  const result = await invoke(
    state,
    id => {
      state.cards[id] = closed()
      return retry
    },
    { cards: '12' },
  )
  expect(result.calls).toEqual(['12'])
  expect(result.output).toContain('#12: at-target')
  expect(result.output).toContain('Stop: all-at-target')
  expect(result.code).toBe(0)
})
it('W12: a board-only Done card is already at target on restart', async () => {
  const state = initial()
  state.cards['12'] = board('Finished')
  const result = await invoke(state, () => target, { cards: '12' })
  expect(result.calls).toEqual([])
  expect(result.output).toContain('#12: at-target')
  expect(result.code).toBe(0)
})

it('C1: unchanged state ignores optimistic engine text and stops', async () => {
  const result = await invoke(
    initial(),
    () => {
      console.log('Finished preparation; board advanced; PR approved')
      return retry
    },
    { cards: '12' },
  )
  expect(result.calls).toEqual(['12'])
  expect(result.output).toContain('Stop: no-progress')
  expect(result.code).toBe(1)
})
it('C2: a real cycle handoff advances an unfinished card without board changes', async () => {
  const result = await invoke(
    initial(),
    (id, n) => {
      if (n > 1) return target
      handoff(id)
      return retry
    },
    { cards: '12' },
  )
  expect(result.calls).toEqual(['12', '12'])
  expect(result.code).toBe(0)
})
it.each(['needs-human', 'escalated', 'failed'] as const)(
  'C3-%s: non-successful prepare outcomes stay terminal',
  async prepare => {
    const result = await invoke(initial(), (id, n) => {
      if (id === '12') return { exitCode: 0, signal: null, prepare }
      if (n > 1) return target
      handoff(id)
      return retry
    })
    expect(result.calls).toEqual(['12', '15', '15'])
    expect(result.output).toContain('#12: terminal')
    expect(result.code).toBe(1)
  },
)
it.each(['gate-red', 'escalated', 'merge-parked'] as const)(
  'C4-%s: terminal status wins over prepared and board advance',
  async cycleStatus => {
    const result = await boardAdvance({ ...prepared, cycleStatus }, 'Inbox', 'Planned')
    expect(result.calls.filter(id => id === '12')).toEqual(['12'])
    expect(result.output).toContain('#12: terminal')
    expect(result.code).toBe(1)
  },
)
it('C5: unreadable card cannot manufacture completion or progress', async () => {
  const state = initial()
  state.cards['12'] = null
  const result = await invoke(state, () => ({ ...retry, cycleStatus: 'not-found' }), {
    cards: '12',
  })
  expect(result.calls.length).toBeLessThanOrEqual(1)
  expect(result.output).not.toContain('#12: at-target')
  expect(result.code).toBe(1)
})
it('C6: unknown board state and unrelated PR changes cannot advance a card', async () => {
  const state = initial()
  state.cards['12'] = board('Outside')
  const result = await invoke(
    state,
    () => {
      state.cards['12'] = board('Removed')
      state.prs = [
        { ...pr(false), body: 'Closes #999', closingIssuesReferences: [{ number: 999 }] },
      ]
      return retry
    },
    { cards: '12' },
  )
  expect(result.calls).toEqual(['12'])
  expect(result.output).toContain('Stop: no-progress')
  expect(result.code).toBe(1)
})
it('C7: unchanged PR lifecycle with a new commit is not progress', async () => {
  const state = initial()
  state.cards['12'] = board('Checking')
  state.prs = [pr(false)]
  const result = await invoke(
    state,
    () => {
      state.prs = [{ ...pr(false), headRefOid: 'b'.repeat(40) }]
      return retry
    },
    { cards: '12' },
  )
  expect(result.calls).toEqual(['12'])
  expect(result.output).toContain('Stop: no-progress')
})
it('B1: board progress still respects the one-pass cap', async () => {
  const state = initial()
  const result = await invoke(
    state,
    id => {
      state.cards[id] = board('Planned')
      return retry
    },
    { cards: '12', cap: 1 },
  )
  expect(result.calls).toEqual(['12'])
  expect(result.output).toContain('Stop: pass-cap')
  expect(result.code).toBe(1)
})
it('B2: successful prepare with one-pass cap remains unfinished', async () => {
  const state = initial()
  const result = await invoke(
    state,
    id => {
      state.cards[id] = board('Planned')
      return prepared
    },
    { cards: '12', cap: 1 },
  )
  expect(result.calls).toEqual(['12'])
  expect(result.output).toContain('#12: retryable')
  expect(result.output).toContain('Stop: pass-cap')
  expect(result.code).toBe(1)
})
it('I1: same-root restart re-reads completed and unfinished cards', async () => {
  const state = initial()
  const first = await invoke(state, () => retry, { cards: '12,15' })
  expect(first.calls).toEqual(['12', '15'])
  state.cards['12'] = closed()
  state.cards['15'] = board('Planned')
  const second = await invoke(state, () => target, { cards: '12,15' })
  expect(second.calls).toEqual(['15'])
  expect(second.output).toContain('#12: at-target')
  expect(second.code).toBe(0)
})
it('I2: regression then recovery below the high-water state cannot buy a fourth pass', async () => {
  const ranks: Record<string, number> = { 12: 3, 15: 0 }
  const calls: string[] = []
  let pass = 0
  const report = await runCardList({
    cards: ['12', '15'],
    maxPasses: 6,
    readRank: id => ranks[id]!,
    atTarget: () => false,
    interrupted: () => false,
    runCard: async id => {
      calls.push(id)
      if (id === '12') {
        pass += 1
        ranks[id] = [4, 2, 4][pass - 1]!
      } else ranks[id] = [1, 2, 2][pass - 1]!
      return {
        outcome: { id, outcome: 'failed', detail: 'exit 1', cycleStatus: 'rounds-bound-reached' },
      }
    },
  })
  expect(calls).toEqual(['12', '15', '12', '15', '12', '15'])
  expect(report.passes).toBe(3)
  expect(report.stop).toBe('no-progress')
})

it('C8: a board regression is not forward progress', async () => {
  const result = await boardAdvance(retry, 'Checking', 'Planned', '12')
  expect(result.calls).toEqual(['12'])
  expect(result.output).toContain('Stop: no-progress')
  expect(result.code).toBe(1)
})
it('I3: durable board regression and recovery do not extend the run', async () => {
  const state = initial()
  const result = await invoke(
    state,
    (id, n) => {
      const stages =
        id === '12' ? ['Checking', 'Planned', 'Checking'] : ['Planned', 'Building', 'Building']
      state.cards[id] = board(stages[n - 1] ?? 'Building')
      return retry
    },
    { cards: '12,15', cap: 5 },
  )
  expect(result.calls).toEqual(['12', '15', '12', '15', '12', '15'])
  expect(result.output).toContain('Passes: 3')
  expect(result.output).toContain('Stop: no-progress')
  expect(result.code).toBe(1)
})

function installed() {
  cpSync(
    resolve(__dirname, '../../../../../.claude/skills/pair-workflow-cycle/scripts'),
    join(root, '.claude/skills/pair-workflow-cycle/scripts'),
    { recursive: true },
  )
}

it.each(['board', 'prepare', 'completion'] as const)(
  'G1-%s: installed adapter reaches list decisions',
  async kind => {
    installed()
    const state = initial()
    save(state)
    const script = join(root, '.claude/skills/pair-workflow-cycle/scripts/cycle-state.mjs')
    const read = spawnSync(process.execPath, [script, 'card', '--story', '12'], {
      cwd: root,
      encoding: 'utf8',
      timeout: 5000,
    })
    expect(read.status).toBe(0)
    expect(JSON.parse(read.stdout)).toMatchObject({ boardState: 'Inbox' })
    expect(JSON.parse(read.stdout)).not.toHaveProperty('projectItems')
    const result = await invoke(
      state,
      (_id, n) => {
        if (n > 1) return target
        state.cards['12'] = kind === 'completion' ? closed() : board('Planned')
        return kind === 'prepare' ? prepared : retry
      },
      { cards: '12' },
    )
    expect(result.calls).toEqual(kind === 'completion' ? ['12'] : ['12', '12'])
    expect(result.output).toContain('#12: at-target')
    expect(result.code).toBe(0)
  },
)

const boardCases = [
  { id: 'canonical-default', map: '', from: 'Draft', to: 'Ready', forward: true },
  { id: 'canonical-mapped', map: mapping, from: 'Draft', to: 'Ready', forward: true },
  { id: 'case', map: mapping, from: 'iNbOx', to: 'pLaNnEd', forward: true },
  {
    id: 'alias',
    map: mapping + '| Queued | Ready |\n',
    from: 'Planned',
    to: 'Queued',
    forward: false,
  },
  { id: 'canonical-alias', map: mapping, from: 'Planned', to: 'Ready', forward: false },
  { id: 'unmapped', map: mapping, from: 'Outside', to: 'Removed', forward: false },
  { id: 'known-to-unmapped', map: mapping, from: 'Checking', to: 'Removed', forward: false },
  { id: 'case-only', map: mapping, from: 'Planned', to: 'PLANNED', forward: false },
  { id: 'body', map: mapping, from: 'Inbox', to: 'Planned', forward: true },
  { id: 'stale-body', map: mapping, from: 'Inbox', to: 'Inbox', forward: false },
] as const
for (const adapter of ['fallback', 'installed'] as const) {
  it.each(boardCases)(`G3-${adapter}-$id: resolved macrostate governs progress`, async c => {
    if (adapter === 'installed') installed()
    writeFileSync(join(root, '.pair/adoption/tech/way-of-working.md'), c.map)
    const state = initial()
    const make = (label: string): Card =>
      c.id === 'body'
        ? { ...board(), projectItems: [], body: `**Status**: ${label}` }
        : {
            ...board(label),
            body: c.id === 'stale-body' ? '**Status**: Finished' : '**Status**: Inbox',
          }
    state.cards['12'] = make(c.from)
    save(state)
    expect(readCardDocumentViaGh('12', root).boardState).toBe(c.from)
    const map = parseStateMapping(c.map)
    const before = resolveMacrostate(c.from, map)
    const after = resolveMacrostate(c.to, map)
    if (c.forward) expect([before, after]).toEqual(['Draft', 'Ready'])
    else if (c.id === 'unmapped') expect([before, after]).toEqual([undefined, undefined])
    else if (c.id === 'known-to-unmapped') expect([before, after]).toEqual(['Review', undefined])
    else expect(before).toBe(after)
    const result = await invoke(
      state,
      (_id, n) => {
        if (n > 1) return target
        state.cards['12'] = make(c.to)
        return retry
      },
      { cards: '12' },
    )
    expect(result.calls).toEqual(c.forward ? ['12', '12'] : ['12'])
    expect(result.output).toContain(c.forward ? 'Stop: all-at-target' : 'Stop: no-progress')
    expect(result.code).toBe(c.forward ? 0 : 1)
  })
}

const closures = [
  {
    id: 'not-planned',
    state: 'CLOSED',
    reason: 'NOT_PLANNED',
    at: '2026-01-01T00:00:00Z',
    valid: false,
  },
  { id: 'missing-date', state: 'CLOSED', reason: 'COMPLETED', at: null, valid: false },
  { id: 'invalid-date', state: 'CLOSED', reason: 'COMPLETED', at: 'not-a-date', valid: false },
  {
    id: 'open-with-date',
    state: 'OPEN',
    reason: 'COMPLETED',
    at: '2026-01-01T00:00:00Z',
    valid: false,
  },
  {
    id: 'completed',
    state: 'CLOSED',
    reason: 'COMPLETED',
    at: '2026-01-01T00:00:00Z',
    valid: true,
  },
  {
    id: 'legacy-null-reason',
    state: 'CLOSED',
    reason: null,
    at: '2026-01-01T00:00:00Z',
    valid: true,
  },
] as const
for (const adapter of ['fallback', 'installed'] as const) {
  it.each(closures)(`G4-${adapter}-$id: closure evidence before and after execution`, async c => {
    if (adapter === 'installed') installed()
    const state = initial()
    const evidence = { ...board('Building'), state: c.state, stateReason: c.reason, closedAt: c.at }
    state.cards['12'] = evidence
    save(state)
    expect(readCardClosedAt('12', root) instanceof Date).toBe(c.valid)
    const before = await invoke(state, () => retry, { cards: '12' })
    expect(before.calls).toEqual(c.valid ? [] : ['12'])
    expect(before.code).toBe(c.valid ? 0 : 1)
    state.cards['12'] = board('Building')
    const after = await invoke(
      state,
      () => {
        state.cards['12'] = evidence
        return retry
      },
      { cards: '12' },
    )
    expect(after.calls).toEqual(['12'])
    expect(after.output).toContain(c.valid ? '#12: at-target' : '#12: retryable')
    expect(after.code).toBe(c.valid ? 0 : 1)
  })
  it(`G4-${adapter}-done: new mapped Done ends without a second invocation`, async () => {
    if (adapter === 'installed') installed()
    const state = initial()
    const result = await invoke(
      state,
      () => {
        state.cards['12'] = board('Finished')
        return retry
      },
      { cards: '12' },
    )
    expect(result.calls).toEqual(['12'])
    expect(result.output).toContain('#12: at-target')
    expect(result.code).toBe(0)
  })
}

// AC6/AC7: explicit human/terminal or global-halt evidence retains precedence.
it.each(['gate-red', 'needs-human', 'merged-closure-unfinished'])(
  'G4-precedence-%s: durable completion does not erase a terminal result',
  async cycleStatus => {
    const state = initial()
    const result = await invoke(
      state,
      () => {
        state.cards['12'] = closed()
        return { ...prepared, cycleStatus }
      },
      { cards: '12' },
    )
    expect(result.calls).toEqual(['12'])
    expect(result.output).toContain('#12: terminal')
    expect(result.code).toBe(1)
  },
)
it('G4-precedence-halt: completion cannot erase a safety-required halt', async () => {
  const state = initial()
  const result = await invoke(
    state,
    () => {
      state.cards['12'] = closed()
      save(state)
      throw new Error('perimeter refused')
    },
    { cards: '12,15' },
  )
  expect(result.calls).toEqual(['12'])
  expect(result.output).toContain('Stop: halt')
  expect(result.code).toBe(1)
})

type PrState = 'absent' | 'draft' | 'review' | 'rejected' | 'ready' | 'merged' | 'closed'
function prs(stage: PrState) {
  if (stage === 'absent') return []
  const label =
    { rejected: 'not-approved', ready: 'ready-to-merge' }[stage as 'rejected' | 'ready'] ??
    'to-be-reviewed'
  return [
    {
      ...pr(stage === 'draft'),
      state: stage === 'merged' ? 'MERGED' : stage === 'closed' ? 'CLOSED' : 'OPEN',
      labels: [{ name: 'risk:yellow' }, { name: `pr-state:${label}` }],
      reviewDecision:
        stage === 'ready'
          ? 'APPROVED'
          : stage === 'rejected'
            ? 'CHANGES_REQUESTED'
            : 'REVIEW_REQUIRED',
      statusCheckRollup: [
        {
          __typename: 'StatusContext',
          context: 'pair-review',
          state: stage === 'ready' ? 'SUCCESS' : stage === 'rejected' ? 'FAILURE' : 'PENDING',
        },
      ],
      mergedAt: stage === 'merged' ? '2026-01-01T00:00:00Z' : null,
      closedAt: null,
    },
  ]
}
const prTransitions: ReadonlyArray<{ id: string; from: PrState; to: PrState; forward: boolean }> = [
  { id: 'creation-draft', from: 'absent', to: 'draft', forward: true },
  { id: 'draft-review', from: 'draft', to: 'review', forward: true },
  { id: 'approval', from: 'review', to: 'ready', forward: true },
  { id: 'rejection-repaired', from: 'rejected', to: 'ready', forward: true },
  { id: 'merge', from: 'ready', to: 'merged', forward: true },
  { id: 'rejected', from: 'review', to: 'rejected', forward: false },
  { id: 'closed-unmerged', from: 'review', to: 'closed', forward: false },
  { id: 'lost-approval', from: 'ready', to: 'review', forward: false },
  { id: 'back-to-draft', from: 'review', to: 'draft', forward: false },
  { id: 'pr-disappears', from: 'review', to: 'absent', forward: false },
  { id: 'rejection-cleared-only', from: 'rejected', to: 'review', forward: false },
]
it.each(prTransitions)(
  'G2-$id: independent PR transition below existing cycle evidence',
  async c => {
    const state = initial()
    state.cards['12'] = board('Checking')
    state.prs = prs(c.from)
    handoff('12', 'r9', 'review-phase')
    const result = await invoke(
      state,
      (_id, n) => {
        if (n > 1) return target
        state.prs = prs(c.to)
        return retry
      },
      { cards: '12' },
    )
    expect(result.calls).toEqual(c.forward ? ['12', '12'] : ['12'])
    expect(result.output).toContain(c.forward ? 'Stop: all-at-target' : 'Stop: no-progress')
    expect(result.code).toBe(c.forward ? 0 : 1)
  },
)
it.each(['absent', 'draft', 'review', 'rejected', 'ready', 'merged', 'closed'] as const)(
  'G2-unchanged-%s: unchanged PR state buys no pass',
  async stage => {
    const state = initial()
    state.prs = prs(stage)
    const result = await invoke(state, () => retry, { cards: '12' })
    expect(result.calls).toEqual(['12'])
    expect(result.output).toContain('Stop: no-progress')
    expect(result.code).toBe(1)
  },
)
it('G2-high-water: PR regression and recovery buy no extra pass', async () => {
  const state = initial()
  state.prs = prs('review')
  const stages: PrState[] = ['ready', 'rejected', 'ready']
  const result = await invoke(
    state,
    (id, n) => {
      if (id === '12') state.prs = prs(stages[n - 1] ?? 'ready')
      else if (n < 3) handoff('15', n === 1 ? 'a0' : 'r1', 'implement-phase')
      return retry
    },
    { cards: '12,15', cap: 5 },
  )
  expect(result.calls).toEqual(['12', '15', '12', '15', '12', '15'])
  expect(result.output).toContain('Stop: no-progress')
})
it('G2-wrong-card: another card approval cannot advance this card', async () => {
  const state = initial()
  state.prs = prs('review')
  const result = await invoke(
    state,
    () => {
      state.prs = [
        {
          ...prs('ready')[0],
          number: 99,
          body: 'Closes #112',
          closingIssuesReferences: [{ number: 112 }],
        },
      ]
      return retry
    },
    { cards: '12' },
  )
  expect(result.calls).toEqual(['12'])
  expect(result.output).toContain('Stop: no-progress')
})

function gh(args: string[]) {
  return spawnSync(join(root, 'bin/gh'), args, { cwd: root, encoding: 'utf8', timeout: 3000 })
}
it('G6-fields: requested fields are the only evidence returned', () => {
  const state = initial()
  state.cards['12'] = closed()
  state.prs = prs('ready')
  save(state)
  expect(JSON.parse(gh(['issue', 'view', '12', '--json', 'title']).stdout)).toEqual({
    title: 'Card',
  })
  expect(JSON.parse(gh(['pr', 'view', '42', '--json', 'number']).stdout)).toEqual({ number: 42 })
})
it.each([
  ['unknown-issue', ['issue', 'view', '999', '--json', 'state,closedAt']],
  ['unknown-pr', ['pr', 'view', '999', '--json', 'state,mergedAt']],
  ['wrong-repo', ['issue', 'view', '12', '--json', 'state', '--repo', 'wrong/repo']],
  ['unknown-field', ['issue', 'view', '12', '--json', 'boardState']],
  ['no-fields', ['issue', 'view', '12']],
  ['write', ['issue', 'close', '12']],
  ['unsupported-filter', ['pr', 'list', '--author', 'somebody', '--json', 'number']],
  ['unsupported-search', ['pr', 'list', '--search', 'anything', '--json', 'number']],
  ['unsupported-jq', ['pr', 'view', '42', '--json', 'state', '-q', '.state']],
] as const)('G6-%s: malformed or wrong-scope requests yield no evidence', (_id, args) => {
  save({ ...initial(), prs: prs('ready') })
  const result = gh([...args])
  expect(result.status).not.toBe(0)
  expect(result.stdout).toBe('')
})
it('G6-filter: lifecycle, association, branch, base and limit constrain PR lists', () => {
  save({
    ...initial(),
    prs: [
      ...prs('review'),
      { ...prs('merged')[0], number: 43 },
      { ...prs('closed')[0], number: 44 },
    ],
  })
  const list = (...args: string[]) =>
    JSON.parse(gh(['pr', 'list', '--json', 'number', ...args]).stdout)
  expect(list()).toEqual([{ number: 42 }])
  expect(list('--state', 'merged')).toEqual([{ number: 43 }])
  expect(list('--state', 'closed')).toEqual([{ number: 44 }])
  expect(list('--state', 'all', '--limit', '2')).toEqual([{ number: 42 }, { number: 43 }])
  expect(list('--head', 'other')).toEqual([])
  expect(list('--base', 'other')).toEqual([])
  expect(list('--search', '#112 in:body')).toEqual([])
  expect(list('--search', '#12 in:body')).toEqual([{ number: 42 }])
  expect(JSON.parse(gh(['pr', 'view', '43', '--json', 'number,state']).stdout)).toEqual({
    number: 43,
    state: 'MERGED',
  })
})

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
const preparedCases = statusGroups.flatMap(group =>
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
it.each(preparedCases)('G5-pure-$id: prepared obeys target and terminal partitions', c => {
  const outcome = {
    ...outcomeOfExit('12', c.exit),
    prepare: 'prepared' as const,
    ...(c.status !== undefined && { cycleStatus: c.status }),
  }
  expect(classify(outcome).end).toBe(c.expected)
})
it.each(preparedCases)('G5-handler-$id: prepared partitions survive handler wiring', async c => {
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
})
it('G5-skipped: prepared does not defeat a lock/ineligibility skip', () => {
  expect(
    classify({ id: '12', outcome: 'skipped', detail: 'locked', prepare: 'prepared' }).end,
  ).toBe('terminal')
})
it.each(['target-ready', 'needs-human', 'rounds-bound-reached', undefined])(
  'G5-relay-%s: PREPARE-RESULT and cycle status survive the actual in-process relay',
  async cycleStatus => {
    const runner = runCardInProcess(async () => {
      console.log('PREPARE-RESULT: prepared')
      if (cycleStatus !== undefined) console.log(`  Cycle status: ${cycleStatus}`)
      return 0
    })
    const exit = await runner({
      card: { id: '12', title: '', branch: '', tier: '', mutexResources: [], prerequisites: [] },
      args: [],
      cwd: root,
    })
    expect(exit).toEqual({
      exitCode: 0,
      signal: null,
      prepare: 'prepared',
      ...(cycleStatus !== undefined && { cycleStatus }),
    })
    const result = await invoke(
      initial(),
      (id, n) => {
        if (id === '12') return exit
        if (n > 1) return target
        handoff(id)
        return retry
      },
      { cards: '12,15' },
    )
    const end =
      cycleStatus === 'target-ready'
        ? 'at-target'
        : cycleStatus === 'needs-human'
          ? 'terminal'
          : 'retryable'
    expect(result.output).toContain(`#12: ${end}`)
    expect(result.calls).toEqual(
      end === 'retryable' ? ['12', '15', '12', '15'] : ['12', '15', '15'],
    )
  },
)

it('G5-engine-boundary: real preparation and in-process entry relay their result', async () => {
  const state = initial()
  save(state)
  const output: string[] = []
  const prompts: string[] = []
  const cycles: string[] = []
  vi.spyOn(console, 'log').mockImplementation((...args: unknown[]) => {
    output.push(args.join(' '))
  })
  // Engine discovery is virtual; execution is injected. PATH contains only the offline gh and node.
  vi.stubEnv('PATH', join(root, 'bin'))
  const skills = [
    'pair-process-refine-story',
    'pair-process-plan-tasks',
    'pair-workflow-cycle',
    'pair-loop',
  ]
  const files: Record<string, string> = {
    [join(root, 'config.json')]: JSON.stringify({
      asset_registries: {
        skills: {
          source: '.skills',
          behavior: 'overwrite',
          description: 'skills',
          prefix: 'pair',
          targets: [{ path: '.claude/skills/', mode: 'canonical' }],
        },
      },
    }),
    [join(root, '.pair/adoption/tech/way-of-working.md')]: mapping,
    [join(root, 'bin/claude')]: '',
  }
  for (const skill of skills) files[join(root, '.claude/skills', skill, 'SKILL.md')] = ''
  for (const script of ['cycle-state.mjs', 'cycle-dispatch.mjs', 'autonomy-policy.mjs'])
    files[join(root, '.claude/skills/pair-workflow-cycle/scripts', script)] = ''
  const gate = { mode: 'never', has: [], lacks: [] }
  const deps: RunHandlerDependencies = {
    runIteration: async input => {
      prompts.push(input.promptText)
      return { outcome: 'success', detail: 'offline engine' }
    },
    resolveAutonomy: () => ({
      ok: true,
      active: true,
      policy: { until: 'pr', prepare: gate, merge: gate },
      effective: {},
      lines: [],
      warnings: [],
      errors: [],
      translated: {},
    }),
    cardReadiness: async () => (cycles.length === 0 ? 'draft' : 'ready'),
    driveCycle: async ({ card }) => {
      cycles.push(card)
      return {
        status: cycles.length === 1 ? 'rounds-bound-reached' : 'ready-for-merge',
        stagesRun: 0,
      }
    },
    prepare: {
      bridge: {
        prepareDecide,
        prepareComplete: () => {
          state.cards['12'] = board('Planned')
          save(state)
          return { completed: true }
        },
        prepareEscalate: () => {
          throw new Error('unexpected escalation')
        },
        bindHosts: () => ({ action: 'bound', binding: { pmTool: 'github', codeHost: 'github' } }),
      },
      readLabels: () => [],
      readBody: () => '## Assumptions\n\n- Resolved\n',
      hooks: { run: async () => ({}) },
    },
    appendAudit: () => {},
    runAudit: () => {},
  }
  const code = await handleRunCommand(
    parseRunCommand({ cwd: root, cards: '12', autonomous: true, maxIterations: 3 }),
    new InMemoryFileSystemService(files, root, root),
    deps,
  )
  expect(prompts).toHaveLength(2)
  expect(prompts[0]).toContain('pair-process-refine-story')
  expect(prompts[1]).toContain('pair-process-plan-tasks')
  expect(output.join('\n')).toContain('PREPARE-RESULT: prepared')
  expect(cycles).toEqual(['12', '12'])
  expect(code).toBe(0)
})

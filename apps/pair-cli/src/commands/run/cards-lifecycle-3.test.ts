import { expect, it } from 'vitest'
import { join } from 'path'
import { spawnSync } from 'child_process'
import {
  root,
  retry,
  target,
  board,
  closed,
  save,
  handoff,
  invoke,
  initial,
  pr,
  PrState,
} from './cards-lifecycle-lib'
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

// US-642 AC-1/2/4/5: transition and audit share one state decision table.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { decideBoardState, applyBoardState, auditCards, stateMapping, updateEpicBody } from '../../skills/pair-workflow-cycle/scripts/board-sync.mjs'

test('AC-1/2: PR and issue facts select every supported board outcome', () => {
  const rows = [
    [{ pr: 'merged', issue: 'OPEN' }, { status: 'Done', close: 'merged' }],
    [{ pr: 'merged', issue: 'CLOSED', reason: 'COMPLETED' }, { status: 'Done', close: null }],
    [{ pr: 'closed-unmerged', issue: 'OPEN' }, { status: 'Not planned', close: 'unmerged' }],
    [{ pr: 'open', issue: 'OPEN' }, { status: 'Review', close: null }],
    [{ pr: 'open', issue: 'CLOSED', reason: 'NOT_PLANNED' }, { status: 'Not planned', close: null }],
    [{ pr: 'none', issue: 'CLOSED', reason: 'COMPLETED' }, { status: 'Done', close: null }],
    [{ pr: 'none', issue: 'CLOSED', reason: 'NOT_PLANNED' }, { status: 'Not planned', close: null }],
    [{ pr: 'none', issue: 'OPEN', member: false }, { status: 'Todo', close: null }],
    [{ pr: 'none', issue: 'OPEN', member: true }, { status: null, close: null }],
  ]
  for (const [facts, expected] of rows) assert.deepEqual(decideBoardState(facts), expected, JSON.stringify(facts))
  assert.deepEqual(decideBoardState({ pr: 'unknown', issue: 'OPEN' }), { gap: 'pr-state-unreadable' })
  assert.deepEqual(decideBoardState({ pr: 'none', issue: 'MYSTERY' }), { gap: 'issue-state-unreadable' })
})

test('AC-4/6: adopted State Mapping supplies actual board labels', () => {
  const text = '## State Mapping\n\n| Board State | Macrostate |\n| --- | --- |\n| Queue | Draft |\n| Inspect | Review |\n| Shipped | Done |\n'
  assert.deepEqual(stateMapping(text), { Draft: 'Queue', Review: 'Inspect', Done: 'Shipped' })
  assert.deepEqual(stateMapping(''), { Draft: 'Draft', Ready: 'Ready', 'In Progress': 'In Progress', Review: 'Review', Done: 'Done' })
})

test('AC-1/5: apply adds membership before status, then a repeated run writes nothing', () => {
  const calls = []
  let state = { issueState: 'OPEN', issueReason: null, boardState: null, member: false }
  const pm = {
    cardState: () => state,
    ensureBoardMembership: () => { calls.push('member'); state = { ...state, member: true }; return { confirmed: true } },
    setBoardState: ({ state: wanted }) => { calls.push(`status:${wanted}`); state = { ...state, boardState: wanted }; return { confirmed: true } },
    closeCard: () => { throw Error('unexpected close') },
  }
  assert.equal(applyBoardState({ pm, id: '42', pr: 'open', mapping: { Review: 'Inspect' } }).confirmed, true)
  assert.deepEqual(calls, ['member', 'status:Inspect'])
  assert.equal(applyBoardState({ pm, id: '42', pr: 'open', mapping: { Review: 'Inspect' } }).confirmed, true)
  assert.deepEqual(calls, ['member', 'status:Inspect'])
})

test('AC-6: a minimal board without Review confirms membership and reports a skip', () => {
  const calls = []
  let member = false
  const pm = {
    cardState: () => ({ issueState: 'OPEN', issueReason: null, boardState: null, member }),
    ensureBoardMembership: () => { calls.push('member'); member = true; return { confirmed: true } },
    setBoardState: () => { throw Error('no Review option') },
  }
  assert.deepEqual(applyBoardState({ pm, id: '42', pr: 'open', mapping: { Draft: 'Todo', Done: 'Done' } }), { confirmed: true, expected: null, actions: ['membership'], skipped: 'no-review-state' })
  assert.deepEqual(calls, ['member'])
})

test('AC-6: an unmapped Done state reports a gap before closing a merged story', () => {
  const pm = {
    cardState: () => ({ issueState: 'OPEN', issueReason: null, boardState: 'Review', member: true }),
    closeCard: () => { throw Error('should not close') },
  }
  assert.deepEqual(applyBoardState({ pm, id: '42', pr: 'merged', mapping: { Review: 'Inspect' } }), { confirmed: false, gaps: ['state-unmapped:Done'] })
})

test('AC-2: report-only lists drift, apply repairs it, rerun lists none', () => {
  const cards = new Map([
    ['1', { issueState: 'OPEN', issueReason: null, boardState: 'Todo', member: true }],
    ['2', { issueState: 'OPEN', issueReason: null, boardState: null, member: false }],
  ])
  const calls = []
  const pm = {
    listCards: () => [...cards.keys()].map(id => ({ id })),
    cardState: ({ id }) => cards.get(id),
    ensureBoardMembership: ({ id }) => { calls.push(`member:${id}`); cards.set(id, { ...cards.get(id), member: true }); return { confirmed: true } },
    setBoardState: ({ id, state }) => { calls.push(`state:${id}:${state}`); cards.set(id, { ...cards.get(id), boardState: state }); return { confirmed: true } },
  }
  const code = { linkedPr: ({ id }) => id === '1' ? 'open' : 'none' }
  const input = { pm, code, mapping: { Draft: 'Todo', Review: 'Review' } }
  assert.deepEqual(auditCards(input), { mismatches: [{ id: '1', actual: 'Todo', expected: 'Review' }, { id: '2', actual: null, expected: 'Todo' }], gaps: [] })
  assert.deepEqual(calls, [])
  assert.equal(auditCards({ ...input, apply: true }).mismatches.length, 2)
  assert.deepEqual(calls, ['state:1:Review', 'member:2', 'state:2:Todo'])
  assert.deepEqual(auditCards(input), { mismatches: [], gaps: [] })
})

test('AC-3: epic content lists each sub-issue and ticks closed children idempotently', () => {
  const before = '# Epic\n\n## Sub-Issues\n\n- [ ] #42 — first\n'
  const children = [{ id: '42', closed: true }, { id: '43', closed: false }]
  const after = updateEpicBody(before, children)
  assert.match(after, /- \[x\] #42 — first/)
  assert.match(after, /- \[ \] #43/)
  assert.equal(updateEpicBody(after, children), after)
  assert.match(updateEpicBody('# Epic\n', children), /## Sub-Issues\n\n- \[x\] #42\n- \[ \] #43/)
  const adjacent = updateEpicBody('## Sub-Issues\n\n- [ ] #420\n', [{ id: '42', closed: true }, { id: '420', closed: false }])
  assert.match(adjacent, /- \[ \] #420/)
  assert.match(adjacent, /- \[x\] #42(?:\n|$)/)
})

test('AC-3: applying a merged fact checks DoD and syncs the existing epic', () => {
  let body = '## Definition of Done Checklist\n\n- [ ] shipped\n'
  let state = { issueState: 'OPEN', issueReason: null, boardState: 'Review', member: true }
  const calls = []
  const pm = {
    cardState: () => state,
    closeCard: () => { calls.push('close'); state = { ...state, issueState: 'CLOSED', issueReason: 'COMPLETED' }; return { confirmed: true } },
    readCard: () => ({ body }),
    updateCard: ({ body: next }) => { calls.push('dod'); body = next },
    syncEpic: () => { calls.push('epic'); return { confirmed: true } },
    setBoardState: ({ state: next }) => { calls.push('board'); state = { ...state, boardState: next }; return { confirmed: true } },
  }
  assert.equal(applyBoardState({ pm, id: '42', pr: 'merged' }).confirmed, true)
  assert.deepEqual(calls, ['close', 'dod', 'epic', 'board'])
  assert.match(body, /- \[x\] shipped/)
})

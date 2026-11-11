import { expect, it } from 'vitest'
import { runCardList } from './cards-run'
import {
  retry,
  prepared,
  target,
  board,
  closed,
  handoff,
  invoke,
  initial,
  pr,
  boardAdvance,
} from './cards-lifecycle-lib'
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

import { expect, it } from 'vitest'
import {
  initial,
  retry,
  target,
  installed,
  conclude,
  invoke,
  expectProgress,
  ready,
  incomplete,
  associations,
} from './cards-review-progress-lib'
for (const reader of ['fallback', 'installed'] as const) {
  it.each(['REVIEW_REQUIRED', '', null, 'CHANGES_REQUESTED', 'APPROVED'])(
    `P-${reader}-%s: actual Pair conclusion advances without a native vote`,
    async decision => {
      if (reader === 'installed') installed()
      const state = initial()
      state.prs[0]!.reviewDecision = decision
      const result = await invoke(state, (_id, n) => {
        if (n > 1) return target
        const out = conclude(state)
        expect(out.check.state).toBe('success')
        expect(state.prs[0]!.labels).toEqual([{ name: 'pr-state:ready-to-merge' }])
        expect(state.prs[0]!.statusCheckRollup).toEqual([
          { context: 'pair-review', state: 'SUCCESS' },
        ])
        return retry
      })
      expectProgress(result, true)
    },
  )
  it(`P-${reader}-rejection-repaired: actual Pair rejection can advance to approval`, async () => {
    if (reader === 'installed') installed()
    const state = initial()
    conclude(state, 'changes-requested')
    const result = await invoke(state, (_id, n) => {
      if (n > 1) return target
      conclude(state)
      return retry
    })
    expectProgress(result, true)
  })
  it.each(incomplete)(
    `N-${reader}-$id: incomplete or adverse review evidence does not advance`,
    async ({ status, hasCheck, hasLabel, context }) => {
      if (reader === 'installed') installed()
      const state = initial()
      const result = await invoke(state, (_card, n) => {
        if (n > 1) return target
        state.prs[0]!.reviewDecision = 'APPROVED'
        state.prs[0]!.labels = hasLabel ? [{ name: 'pr-state:ready-to-merge' }] : []
        state.prs[0]!.statusCheckRollup = hasCheck ? [{ context, state: status }] : []
        return retry
      })
      expectProgress(result, false)
    },
  )
  it.each(associations)(
    `A-${reader}-$id: only owned PR advancement belongs to the card`,
    async c => {
      if (reader === 'installed') installed()
      const state = initial()
      state.prs[0]!.closingIssuesReferences = c.refs === null ? null : [...c.refs]
      state.prs[0]!.body = c.body
      // Native APPROVED isolates association from the separate Pair-conclusion defect.
      state.prs[0]!.reviewDecision = 'APPROVED'
      const result = await invoke(state, (_id, n) => {
        if (n > 1) return target
        ready(state)
        return retry
      })
      expectProgress(result, c.advances)
    },
  )
  it(`I-${reader}-unrelated-conclude: Pair conclusion cannot advance an unrelated mentioned card`, async () => {
    if (reader === 'installed') installed()
    const state = initial()
    state.prs[0]!.closingIssuesReferences = []
    state.prs[0]!.body = 'Related context #12'
    const result = await invoke(state, (_id, n) => {
      if (n > 1) return target
      conclude(state)
      return retry
    })
    expectProgress(result, false)
  })
}

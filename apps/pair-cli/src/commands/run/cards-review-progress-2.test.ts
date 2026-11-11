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
} from './cards-review-progress-lib'
for (const reader of ['fallback', 'installed'] as const) {
  const prefix = reader === 'installed' ? 'installed-' : ''
  it.each(['draft', 'closed', 'merged'])(
    `S-${prefix}%s: PR state constrains progress`,
    async kind => {
      if (reader === 'installed') installed()
      const state = initial()
      state.prs[0]!.reviewDecision = 'APPROVED'
      if (kind === 'draft') state.prs[0]!.isDraft = true
      if (kind === 'closed') state.prs[0]!.state = 'CLOSED'
      const result = await invoke(state, (_id, n) => {
        if (n > 1) return target
        ready(state)
        if (kind === 'merged') {
          state.prs[0]!.state = 'MERGED'
          state.prs[0]!.mergedAt = '2026-01-01T00:00:00Z'
        }
        return retry
      })
      expectProgress(result, kind === 'merged')
    },
  )
  it(`T-${prefix}rejected: actual changes-requested conclusion does not advance`, async () => {
    if (reader === 'installed') installed()
    const state = initial()
    const result = await invoke(state, () => {
      conclude(state, 'changes-requested')
      return retry
    })
    expectProgress(result, false)
  })
  it(`T-${prefix}replay: already published Pair conclusion and restart do not manufacture progress`, async () => {
    if (reader === 'installed') installed()
    const state = initial()
    conclude(state)
    for (let restart = 0; restart < 2; restart++) {
      const result = await invoke(state, () => {
        expect(conclude(state).action).toBe('unchanged')
        return retry
      })
      expectProgress(result, false)
    }
  })
  it(`T-${prefix}cap: actual Pair progress respects the pass cap`, async () => {
    if (reader === 'installed') installed()
    const state = initial()
    const result = await invoke(
      state,
      () => {
        conclude(state)
        return retry
      },
      '12',
      1,
    )
    expect(result.calls).toEqual(['12'])
    expect(result.output).toContain('Stop: pass-cap')
    expect(result.code).toBe(1)
  })
  it.each(['gate-red', 'needs-human', 'escalated'])(
    `T-${prefix}%s: Pair conclusion cannot bypass terminal or human state`,
    async cycleStatus => {
      if (reader === 'installed') installed()
      const state = initial()
      const result = await invoke(state, () => {
        conclude(state)
        return { ...retry, cycleStatus }
      })
      expect(result.calls).toEqual(['12'])
      expect(result.output).toContain('#12: terminal')
      expect(result.code).toBe(1)
    },
  )
  it(`T-${prefix}high-water: Pair regression and recovery cannot buy another pass`, async () => {
    if (reader === 'installed') installed()
    const state = initial()
    state.cards['15']!.projectItems = [{ status: { name: 'Draft' } }]
    const result = await invoke(
      state,
      (id, n) => {
        if (id === '15') {
          state.cards['15']!.projectItems = [
            { status: { name: n === 1 ? 'Ready' : 'In Progress' } },
          ]
          return retry
        }
        conclude(state, n === 2 ? 'changes-requested' : 'approved')
        return retry
      },
      '12,15',
    )
    expect(result.calls).toEqual(['12', '15', '12', '15', '12', '15'])
    expect(result.output).toContain('Stop: no-progress')
    expect(result.code).toBe(1)
  })
}

import { expect, it } from 'vitest'
import { initial, retry, target, installed, conclude, invoke } from './cards-review-progress-lib'
const completions = [
  {
    id: 'invalid-date',
    done: false,
    patch: { state: 'CLOSED', stateReason: 'COMPLETED', closedAt: 'not-a-date' },
  },
  {
    id: 'legacy-null-reason',
    done: true,
    patch: { state: 'CLOSED', stateReason: null, closedAt: '2026-01-01T00:00:00Z' },
  },
  { id: 'done', done: true, patch: { projectItems: [{ status: { name: 'Finished' } }] } },
  {
    id: 'closed',
    done: true,
    patch: { state: 'CLOSED', stateReason: 'COMPLETED', closedAt: '2026-01-01T00:00:00Z' },
  },
  {
    id: 'not-planned',
    done: false,
    patch: { state: 'CLOSED', stateReason: 'NOT_PLANNED', closedAt: '2026-01-01T00:00:00Z' },
  },
  {
    id: 'missing-date',
    done: false,
    patch: { state: 'CLOSED', stateReason: 'COMPLETED', closedAt: null },
  },
  {
    id: 'open-date',
    done: false,
    patch: { state: 'OPEN', stateReason: 'COMPLETED', closedAt: '2026-01-01T00:00:00Z' },
  },
] as const
for (const reader of ['fallback', 'installed'] as const) {
  it.each(completions)(
    `L-${reader}-$id: completion is live at the later card dispatch`,
    async c => {
      if (reader === 'installed') installed()
      const state = initial()
      const result = await invoke(
        state,
        id => {
          if (id === '12') Object.assign(state.cards['15']!, c.patch)
          return target
        },
        '12,15',
      )
      expect(result.calls).toEqual(c.done ? ['12'] : ['12', '15'])
      expect(result.output).toContain('Stop: all-at-target')
      expect(result.code).toBe(0)
      if (c.done) expect(result.output).toContain('#15: at-target — already at target')
    },
  )
  it(`L-${reader}-interaction: Pair progress and peer completion retry only the unfinished owner`, async () => {
    if (reader === 'installed') installed()
    const state = initial()
    const result = await invoke(
      state,
      (id, n) => {
        if (id === '12' && n === 1) {
          state.cards['15']!.projectItems = [{ status: { name: 'Finished' } }]
          conclude(state)
          return retry
        }
        return target
      },
      '12,15',
    )
    expect(result.calls).toEqual(['12', '12'])
    expect(result.output).toContain('#15: at-target — already at target')
    expect(result.code).toBe(0)
    const restarted = await invoke(state, () => target, '12,15')
    expect(restarted.calls).toEqual(['12'])
  })
}

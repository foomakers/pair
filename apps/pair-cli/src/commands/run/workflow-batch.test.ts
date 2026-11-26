import { describe, expect, it, vi } from 'vitest'
import { scheduleWorkflowCards } from './workflow-batch'

describe('workflow scheduling (#678 AC-4, AC-5, AC-6)', () => {
  it('resumes a parked card once its checkpoint becomes ready while its peer is active', async () => {
    vi.useFakeTimers()
    try {
      const cards = [
        { id: '750', prerequisites: [] },
        { id: '757', prerequisites: [] },
        { id: '756', prerequisites: [] },
        { id: '758', prerequisites: ['757'] },
      ]
      let ready = false
      const launches: string[] = []
      let finish!: () => void
      const peer = new Promise<void>(resolve => {
        finish = resolve
      })
      const running = scheduleWorkflowCards(
        cards,
        2,
        new Map(),
        async ({ id }) => {
          launches.push(id)
          if (id === '750') await peer
          return { id, outcome: id === '757' && !ready ? 'parked' : 'done' }
        },
        {
          intervalMs: 30_000,
          watches: result => result.id === '757' && result.outcome === 'parked',
          ready: () => ready,
        },
      )
      await vi.advanceTimersByTimeAsync(30_000)
      expect(launches).toEqual(['750', '757', '756'])
      ready = true
      await vi.advanceTimersByTimeAsync(60_000)
      expect(launches).toEqual(['750', '757', '756', '757', '758'])
      finish()
      expect((await running).map(result => result.outcome)).toEqual([
        'done',
        'done',
        'done',
        'done',
      ])
    } finally {
      vi.useRealTimers()
    }
  })
  it('fills slots in order and releases a dependent only after success', async () => {
    const launches: string[] = []
    const finish = new Map<string, () => void>()
    let announceDependent!: () => void
    const dependentStarted = new Promise<void>(resolve => {
      announceDependent = resolve
    })
    const cards = [
      { id: '12', prerequisites: ['9'] },
      { id: '9', prerequisites: [] },
      { id: '10', prerequisites: [] },
      { id: '11', prerequisites: ['10'] },
    ]
    const running = scheduleWorkflowCards(cards, 2, new Map(), async ({ id }) => {
      launches.push(id)
      if (id === '12') announceDependent()
      await new Promise<void>(resolve => finish.set(id, resolve))
      return { id, outcome: id === '10' ? 'failed' : 'done' }
    })
    await Promise.resolve()
    expect(launches).toEqual(['9', '10'])
    finish.get('9')?.()
    finish.get('10')?.()
    await dependentStarted
    finish.get('12')?.()
    expect((await running).map(card => [card.id, card.outcome])).toEqual([
      ['12', 'done'],
      ['9', 'done'],
      ['10', 'failed'],
      ['11', 'waiting'],
    ])
  })

  it('skips a completed card and starts its dependent', async () => {
    const prior = new Map([['9', { id: '9', outcome: 'skipped' as const }]])
    const cards = [
      { id: '12', prerequisites: ['9'] },
      { id: '9', prerequisites: [] },
    ]
    const launched: string[] = []
    const result = await scheduleWorkflowCards(cards, 1, prior, async ({ id }) => {
      launched.push(id)
      return { id, outcome: 'done' }
    })
    expect(launched).toEqual(['12'])
    expect(result.map(card => card.outcome)).toEqual(['done', 'skipped'])
  })
})

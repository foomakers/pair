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
        {
          limit: 2,
          polling: {
            intervalMs: 30_000,
            watches: result => result.id === '757' && result.outcome === 'parked',
            ready: () => ready,
          },
        },
        new Map(),
        async ({ id }) => {
          launches.push(id)
          if (id === '750') await peer
          return { id, outcome: id === '757' && !ready ? 'parked' : 'done' }
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
    const running = scheduleWorkflowCards(cards, { limit: 2 }, new Map(), async ({ id }) => {
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

  it('refreshes pending dependencies after completion before starting the next card', async () => {
    const cards = [
      { id: '10', prerequisites: ['9'] },
      { id: '9', prerequisites: [] },
      { id: '11', prerequisites: [] },
    ]
    const launches: string[] = []
    const refreshDependencies = vi.fn(async (ids: readonly string[]) =>
      ids.map(id => ({ id, prerequisites: id === '10' ? ['11'] : [] })),
    )
    await scheduleWorkflowCards(
      cards,
      { limit: 1, refreshDependencies },
      new Map(),
      async ({ id }) => {
        launches.push(id)
        return { id, outcome: 'done' }
      },
    )
    expect(launches).toEqual(['9', '11', '10'])
    expect(refreshDependencies.mock.calls).toEqual([[['10', '11']], [['10']]])
  })

  it('starts a waiting card in the original batch when its external dependency closes', async () => {
    vi.useFakeTimers()
    try {
      const launch = vi.fn(async ({ id }: { id: string }) => ({ id, outcome: 'done' as const }))
      const readClosed = vi.fn().mockResolvedValueOnce([]).mockResolvedValueOnce(['742'])
      const refreshDependencies = vi.fn(async () => [{ id: '756', prerequisites: ['742'] }])
      const batch = scheduleWorkflowCards(
        [{ id: '756', prerequisites: ['742'] }],
        { limit: 1, refreshDependencies, external: { intervalMs: 30_000, readClosed } },
        new Map(),
        launch,
      )
      await vi.advanceTimersByTimeAsync(0)
      expect(launch).not.toHaveBeenCalled()
      expect(readClosed.mock.calls).toEqual([[['742']]])
      expect(refreshDependencies).not.toHaveBeenCalled()
      await vi.advanceTimersByTimeAsync(30_000)
      expect((await batch)[0]?.outcome).toBe('done')
      expect(refreshDependencies).toHaveBeenCalledExactlyOnceWith(['756'])
      expect(launch).toHaveBeenCalledOnce()
    } finally {
      vi.useRealTimers()
    }
  })

  it('skips a completed card and starts its dependent', async () => {
    const prior = new Map([['9', { id: '9', outcome: 'skipped' as const }]])
    const cards = [
      { id: '12', prerequisites: ['9'] },
      { id: '9', prerequisites: [] },
    ]
    const launched: string[] = []
    const result = await scheduleWorkflowCards(cards, { limit: 1 }, prior, async ({ id }) => {
      launched.push(id)
      return { id, outcome: 'done' }
    })
    expect(launched).toEqual(['12'])
    expect(result.map(card => card.outcome)).toEqual(['done', 'skipped'])
  })
})

it('reconciles an externally completed failure and starts its dependent without relaunching it', async () => {
  vi.useFakeTimers()
  try {
    const cards = [
      { id: '750', prerequisites: [] },
      { id: '757', prerequisites: [] },
      { id: '758', prerequisites: ['757'] },
    ]
    let externallyCompleted = false
    let finish!: () => void
    const peer = new Promise<void>(resolve => {
      finish = resolve
    })
    const launched: string[] = []
    const running = scheduleWorkflowCards(
      cards,
      {
        limit: 2,
        polling: {
          intervalMs: 30_000,
          watches: result => result.id === '757' && result.outcome === 'failed',
          keepsAlive: () => false,
          ready: () => false,
          refresh: result =>
            externallyCompleted && result.id === '757'
              ? { id: result.id, outcome: 'done' }
              : undefined,
        },
      },
      new Map(),
      async ({ id }) => {
        launched.push(id)
        if (id === '750') await peer
        return { id, outcome: id === '757' ? 'failed' : 'done' }
      },
    )
    await vi.advanceTimersByTimeAsync(30_000)
    expect(launched).toEqual(['750', '757'])
    externallyCompleted = true
    await vi.advanceTimersByTimeAsync(30_000)
    expect(launched).toEqual(['750', '757', '758'])
    finish()
    expect((await running).map(result => result.outcome)).toEqual(['done', 'done', 'done'])
  } finally {
    vi.useRealTimers()
  }
})

it('keeps a recoverable gate waiting without using a slot and retries it when ready', async () => {
  vi.useFakeTimers()
  try {
    let ready = false
    const launches: string[] = []
    const cards = ['757', '750'].map(id => ({ id, prerequisites: [] }))
    const running = scheduleWorkflowCards(
      cards,
      {
        limit: 1,
        polling: {
          intervalMs: 30_000,
          watches: result => result.outcome === 'failed',
          keepsAlive: result => result.id === '757',
          ready: async () => ready,
        },
      },
      new Map(),
      async ({ id }) => {
        launches.push(id)
        return { id, outcome: id === '757' && !ready ? 'failed' : 'done' }
      },
    )
    await vi.advanceTimersByTimeAsync(30_000)
    expect(launches).toEqual(['757', '750'])
    ready = true
    await vi.advanceTimersByTimeAsync(30_000)
    expect(launches).toEqual(['757', '750', '757'])
    expect((await running).map(result => result.outcome)).toEqual(['done', 'done'])
  } finally {
    vi.useRealTimers()
  }
})

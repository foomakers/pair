import { describe, expect, it } from 'vitest'
import { scheduleWorkflowCards } from './workflow-batch'

describe('workflow scheduling (#678 AC-4, AC-5, AC-6)', () => {
  it('fills slots in order and releases a dependent only after success', async () => {
    const launches: string[] = []
    const finish = new Map<string, () => void>()
    const cards = [
      { id: '12', prerequisites: ['9'] },
      { id: '9', prerequisites: [] },
      { id: '10', prerequisites: [] },
      { id: '11', prerequisites: ['10'] },
    ]
    const running = scheduleWorkflowCards(cards, 2, new Map(), async ({ id }) => {
      launches.push(id)
      await new Promise<void>(resolve => finish.set(id, resolve))
      return { id, outcome: id === '10' ? 'failed' : 'done' }
    })
    await Promise.resolve()
    expect(launches).toEqual(['9', '10'])
    finish.get('9')?.()
    finish.get('10')?.()
    while (!finish.has('12')) await Promise.resolve()
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

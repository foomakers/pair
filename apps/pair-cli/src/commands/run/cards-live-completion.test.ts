import { expect, it } from 'vitest'
import { runCardList, type CardsRunInput } from './cards-run'

async function scenario(reader: string, timing: string, cards = ['12', '15']) {
  let done = timing === 'initial'
  const calls: string[] = []
  const counts = new Map<string, number>()
  const atTarget = (id: string) => id === cards[1] && done
  const rank = (id: string) => counts.get(id) ?? 0
  const input: CardsRunInput = {
    cards,
    maxPasses: 3,
    readRank: rank,
    atTarget,
    ...(reader === 'async' && {
      readState: async (id: string) => ({ progress: rank(id), atTarget: atTarget(id) }),
    }),
    interrupted: () => false,
    runCard: async id => {
      calls.push(id)
      const n = (counts.get(id) ?? 0) + 1
      counts.set(id, n)
      const completionPass: Record<string, number> = { first: 1, later: 2 }
      if (id === cards[0] && n === completionPass[timing]) done = true
      const retry = timing === 'later' && n === 1
      return {
        outcome: {
          id,
          outcome: retry ? 'failed' : 'completed',
          detail: retry ? 'exit 1' : 'exit 0',
          cycleStatus: retry ? 'rounds-bound-reached' : 'target-ready',
        },
      }
    },
  }
  return { calls, report: await runCardList(input) }
}
for (const reader of ['async', 'sync']) {
  it.each(['first', 'later', 'initial', 'unfinished'])(
    `D-${reader}-%s: eligibility is read at dispatch`,
    async timing => {
      const result = await scenario(reader, timing)
      const expected: Record<string, string[]> = {
        first: ['12'],
        later: ['12', '15', '12'],
        initial: ['12'],
        unfinished: ['12', '15'],
      }
      expect(result.calls).toEqual(expected[timing])
      expect(result.report.stop).toBe('all-at-target')
      if (timing !== 'unfinished')
        expect(result.report.cards[1]).toMatchObject({
          id: '15',
          end: 'at-target',
          reason: 'already at target',
        })
    },
  )
  it(`D-${reader}-reverse: live completion respects user order`, async () => {
    const result = await scenario(reader, 'first', ['15', '12'])
    expect(result.calls).toEqual(['15'])
    expect(result.report.cards.map(card => card.id)).toEqual(['15', '12'])
    expect(result.report.cards[1]!.reason).toBe('already at target')
  })
}

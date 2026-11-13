import { describe, it, expect } from 'vitest'
import { mkdirSync, mkdtempSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import {
  cardsExitCode,
  classify,
  readCardRank,
  renderCardsReport,
  runCardList,
  type CardsCardRunner,
} from './cards-run'
import type { CardOutcome } from './parallel'

const out = (id: string, o: Partial<CardOutcome> = {}): CardOutcome => ({
  id,
  outcome: 'failed',
  detail: 'exit 1',
  ...o,
})

/** A fake runner: per card, a script of outcomes (one per run) and the rank it leaves behind. */
function harness(
  script: Record<string, Array<{ o: Partial<CardOutcome>; rank?: number; halt?: string }>>,
) {
  const ranks = new Map<string, number>()
  const runs: string[] = []
  const calls = new Map<string, number>()
  const runCard: CardsCardRunner = async id => {
    runs.push(id)
    const n = calls.get(id) ?? 0
    calls.set(id, n + 1)
    const step = script[id]![Math.min(n, script[id]!.length - 1)]!
    if (step.rank !== undefined) ranks.set(id, step.rank)
    return { outcome: out(id, step.o), ...(step.halt && { halt: step.halt }) }
  }
  const drive = (cards: string[], maxPasses = 5, atTarget: string[] = []) =>
    runCardList({
      cards,
      maxPasses,
      runCard,
      readRank: id => ranks.get(id) ?? 0,
      atTarget: id => atTarget.includes(id),
      interrupted: () => false,
    })
  return { drive, runs }
}

const done = {
  o: { outcome: 'completed' as const, detail: 'exit 0', cycleStatus: 'ready-for-merge' },
  rank: 50,
}
const unfinished = (rank: number) => ({ o: { cycleStatus: 'rounds-bound-reached' }, rank })

describe('runCardList', () => {
  it('AC1/AC3: runs in the given order; an unfinished retryable card does not stop the next', async () => {
    const h = harness({ 12: [unfinished(10), done], 15: [done], 9: [done] })
    const report = await h.drive(['12', '15', '9'])
    expect(h.runs).toEqual(['12', '15', '9', '12'])
    expect(report.stop).toBe('all-at-target')
    expect(cardsExitCode(report)).toBe(0)
  })

  it('AC4: pass 2 retries only the unfinished cards, in original order', async () => {
    const h = harness({
      1: [unfinished(10), unfinished(20), done],
      2: [done],
      3: [unfinished(10), unfinished(20), done],
    })
    await h.drive(['1', '2', '3'])
    expect(h.runs).toEqual(['1', '2', '3', '1', '3', '1', '3'])
  })

  it('AC5: a full pass without progress stops, each remaining card with its reason', async () => {
    const h = harness({ 1: [unfinished(10), unfinished(10)], 2: [done] })
    const report = await h.drive(['1', '2'])
    expect(report.stop).toBe('no-progress')
    expect(report.passes).toBe(2)
    expect(report.cards[0]).toMatchObject({ id: '1', end: 'retryable' })
    expect(report.cards[0]!.reason).toContain('rounds-bound-reached')
    expect(cardsExitCode(report)).toBe(1)
  })

  it('r1-5: a peer completed during the pass counts as progress (peer skipped, retryable card retried)', async () => {
    const ranks = new Map<string, number>()
    const done15 = new Set<string>()
    const runs: string[] = []
    let n12 = 0
    const report = await runCardList({
      cards: ['12', '15'],
      maxPasses: 5,
      runCard: async id => {
        runs.push(id)
        if (id === '12' && n12++ === 0) {
          done15.add('15')
          ranks.set('15', 50)
          return { outcome: out('12', { cycleStatus: 'rounds-bound-reached' }) }
        }
        done15.add(id)
        return { outcome: out(id, done.o) }
      },
      readRank: id => ranks.get(id) ?? 0,
      atTarget: id => done15.has(id),
      interrupted: () => false,
    })
    expect(runs).toEqual(['12', '12'])
    expect(report.stop).toBe('all-at-target')
  })

  it('r1-5 control: a card already at target at run start is no progress', async () => {
    const h = harness({ 1: [unfinished(10), unfinished(10)], 2: [done] })
    const report = await h.drive(['1', '2'], 5, ['2'])
    expect(report.stop).toBe('no-progress')
  })

  it('oscillation: regress then recover is no progress', async () => {
    const h = harness({ 1: [unfinished(20), unfinished(10), unfinished(20), done] })
    const report = await h.drive(['1'])
    expect(report.stop).toBe('no-progress')
    expect(report.passes).toBe(2)
  })

  it('pass cap stops even with progress', async () => {
    const h = harness({ 1: [unfinished(10), unfinished(20), unfinished(30)] })
    const report = await h.drive(['1'], 2)
    expect(report.stop).toBe('pass-cap')
    expect(report.passes).toBe(2)
  })

  it.each(['escalated', 'merge-parked', 'failed-implement', 'needs-human', 'not-found'])(
    'AC6: %s is terminal: not retried, does not block the others',
    async status => {
      const h = harness({
        1: [{ o: { cycleStatus: status }, rank: 10 }],
        2: [unfinished(10), done],
      })
      const report = await h.drive(['1', '2'])
      expect(h.runs).toEqual(['1', '2', '2'])
      expect(report.cards[0]!.end).toBe('terminal')
      expect(report.cards[1]!.end).toBe('at-target')
      expect(cardsExitCode(report)).toBe(1)
    },
  )

  it('AC7: a global halt stops immediately; the rest is not run', async () => {
    const h = harness({ 1: [{ o: {}, halt: 'untrusted project' }], 2: [done] })
    const report = await h.drive(['1', '2'])
    expect(h.runs).toEqual(['1'])
    expect(report.stop).toBe('halt')
    expect(report.cards[1]!.reason).toContain('global halt')
  })

  it('AC8: a card already at target is skipped, never run', async () => {
    const h = harness({ 1: [done], 2: [done] })
    const report = await h.drive(['1', '2'], 5, ['1'])
    expect(h.runs).toEqual(['2'])
    expect(report.cards[0]).toMatchObject({ end: 'at-target', reason: 'already at target' })
  })

  it('AC9: report lists per-card outcome, pass count and stop reason', async () => {
    const h = harness({ 1: [done] })
    const text = renderCardsReport(await h.drive(['1'])).join('\n')
    expect(text).toContain('#1: at-target')
    expect(text).toContain('Passes: 1')
    expect(text).toContain('Stop: all-at-target')
  })

  it('an interrupted run stops after the current card, resumable', async () => {
    const h = harness({ 1: [unfinished(10)], 2: [done] })
    let calls = 0
    const report = await runCardList({
      cards: ['1', '2'],
      maxPasses: 5,
      runCard: async id => {
        calls += 1
        return { outcome: out(id, { cycleStatus: 'rounds-bound-reached' }) }
      },
      readRank: () => 0,
      atTarget: () => false,
      interrupted: () => calls >= 1,
    })
    expect(report.stop).toBe('interrupted')
    expect(calls).toBe(1)
    void h
  })
})

describe('classify', () => {
  it.each([
    [{ outcome: 'completed', detail: 'exit 0', cycleStatus: 'merged' }, 'at-target'],
    [{ outcome: 'completed', detail: 'exit 0' }, 'terminal'],
    [{ outcome: 'skipped', detail: 'mutex held' }, 'terminal'],
    [{ outcome: 'failed', detail: 'needs-human: budget' }, 'terminal'],
    [{ outcome: 'crashed', detail: 'killed by SIGKILL' }, 'retryable'],
    [{ outcome: 'failed', detail: 'exit 1' }, 'retryable'],
  ] as const)('%j → %s', (o, end) => {
    expect(classify(out('1', o)).end).toBe(end)
  })
})

describe('readCardRank', () => {
  it('reads the latest round and stage from the durable handoffs', () => {
    const main = mkdtempSync(join(tmpdir(), 'rank-'))
    expect(readCardRank(main, '7')).toBe(0)
    const dir = join(main, '.pair/working/runs/story-7/7')
    mkdirSync(dir, { recursive: true })
    writeFileSync(join(dir, 'a0-implement-phase.json'), '{}')
    const first = readCardRank(main, '7')
    writeFileSync(join(dir, 'r1-g1-red-spec.attempt-2.json'), '{}')
    const second = readCardRank(main, '7')
    writeFileSync(join(dir, 'r1-review-phase.json'), '{}')
    expect(first).toBeGreaterThan(0)
    expect(second).toBeGreaterThan(first)
    expect(readCardRank(main, '7')).toBeGreaterThan(second)
  })
})

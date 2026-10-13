import { describe, it, expect } from 'vitest'
import type { CardOutcome } from './parallel'
import type { RootCandidate } from './root-plan'
import {
  runWatchLoop,
  type IterationRecord,
  type LockState,
  type LoopSelection,
  type WatchLoopConfig,
  type WatchLoopDeps,
} from './watch-loop'

const card = (id: string, extra: Partial<RootCandidate> = {}): RootCandidate => ({
  id,
  title: `Card ${id}`,
  branch: '',
  tier: 'risk:green',
  labels: ['risk:green'],
  mutexResources: [],
  prerequisites: [],
  escalated: false,
  ...extra,
})

const outcome = (id: string, kind: CardOutcome['outcome'] = 'completed'): CardOutcome => ({
  id,
  outcome: kind,
  detail: kind,
})

interface Harness {
  deps: WatchLoopDeps
  selections: number
  batches: string[][]
  waits: number[]
  records: IterationRecord[]
  interrupt(): void
}

/** `script` is one selection per iteration; the last entry repeats. Outcomes default to completed. */
function harness(
  script: Array<LoopSelection | Error>,
  options: {
    locks?: Record<string, LockState>
    outcomes?: (ids: string[]) => CardOutcome[]
    waitOutcome?: 'elapsed' | 'interrupted'
    interruptAfterBatch?: boolean
  } = {},
): Harness {
  let interrupted = false
  const h: Harness = {
    selections: 0,
    batches: [],
    waits: [],
    records: [],
    interrupt: () => {
      interrupted = true
    },
    deps: undefined as never,
  }
  h.deps = {
    select: async () => {
      const entry = script[Math.min(h.selections, script.length - 1)]!
      h.selections++
      if (entry instanceof Error) throw entry
      return entry
    },
    probeLock: c => options.locks?.[c.id] ?? { kind: 'free' },
    runBatch: async cards => {
      const ids = cards.map(c => c.id)
      h.batches.push(ids)
      if (options.interruptAfterBatch) interrupted = true
      return { outcomes: options.outcomes ? options.outcomes(ids) : ids.map(id => outcome(id)) }
    },
    wait: async ms => {
      h.waits.push(ms)
      if (options.waitOutcome === 'interrupted') interrupted = true
      return options.waitOutcome ?? 'elapsed'
    },
    isInterrupted: () => interrupted,
    onIteration: r => h.records.push(r),
  }
  return h
}

const config = (extra: Partial<WatchLoopConfig> = {}): WatchLoopConfig => ({
  watch: false,
  intervalMs: 600_000,
  cap: 5,
  ...extra,
})

const sel = (...cards: RootCandidate[]): LoopSelection => ({ candidates: cards })

describe('runWatchLoop (US-522 T-6)', () => {
  it('AC1: re-selects every iteration and never caches the candidate list', async () => {
    const h = harness([sel(card('1')), sel(card('2')), sel()])
    const r = await runWatchLoop(config(), h.deps)
    expect(h.selections).toBe(3)
    expect(h.batches).toEqual([['1'], ['2']])
    expect(r).toMatchObject({
      reason: 'nothing workable',
      iterations: 3,
      exitCode: 0,
      driven: ['1', '2'],
    })
  })

  it('AC6 (I): a card that reached a terminal outcome is excluded afterwards, and reported', async () => {
    const h = harness([sel(card('1')), sel(card('1'), card('2')), sel(card('1'))], {
      outcomes: ids => ids.map(id => outcome(id, 'completed')),
    })
    const r = await runWatchLoop(config(), h.deps)
    expect(h.batches).toEqual([['1'], ['2']])
    expect(h.records[1]!.skipped).toEqual([
      { id: '1', reason: 'already driven this run', detail: 'already driven this run' },
    ])
    expect(r.exitCode).toBe(0)
  })

  it('US-523 AC7: a card labelled needs-review (a prepare escalation) is skipped as escalated even when the selection says escalated:false', async () => {
    const h = harness([
      sel(card('1', { labels: ['needs-review'], escalated: false }), card('2')),
      sel(card('1', { labels: ['needs-review'], escalated: false })),
    ])
    await runWatchLoop(config(), h.deps)
    expect(h.batches).toEqual([['2']])
    expect(h.records[0]!.skipped).toEqual([{ id: '1', reason: 'escalated', detail: 'escalated' }])
    expect(h.records[1]!.skipped).toEqual([{ id: '1', reason: 'escalated', detail: 'escalated' }])
  })

  it('US-523 AC7: once a human removes needs-review the card is workable again', async () => {
    const h = harness([
      sel(card('1', { labels: ['needs-review'] }), card('2')),
      sel(card('1', { labels: [] })),
    ])
    await runWatchLoop(config(), h.deps)
    expect(h.batches).toEqual([['2'], ['1']])
  })

  it('US-523 A7: a card whose prepare needs a human (`always`) is driven once and never re-attempted this run — no spin', async () => {
    const h = harness([sel(card('1')), sel(card('1')), sel(card('1'))], {
      outcomes: ids => ids.map(id => ({ ...outcome(id), prepare: 'needs-human' as const })),
    })
    const r = await runWatchLoop(config({ cap: 10 }), h.deps)
    expect(h.batches).toEqual([['1']])
    expect(r.reason).toBe('nothing workable')
    expect(r.exitCode).toBe(0)
  })

  it('AC4: an escalated card is not started, is reported, and stays skipped while the selection says so', async () => {
    const h = harness([
      sel(card('1', { escalated: true }), card('2')),
      sel(card('1', { escalated: true })),
    ])
    const r = await runWatchLoop(config(), h.deps)
    expect(h.batches).toEqual([['2']])
    expect(h.records[0]!.skipped).toEqual([{ id: '1', reason: 'escalated', detail: 'escalated' }])
    expect(h.records[1]!.skipped[0]!.reason).toBe('escalated')
    expect(r.reason).toBe('nothing workable')
  })

  it('AC5: a locked card is skipped with its path and age, and picked up once the lock is free', async () => {
    const locks: Record<string, LockState> = {
      '1': { kind: 'held', path: '/w/locks/1', since: 'T0' },
    }
    const h = harness([sel(card('1')), sel(card('1')), sel()])
    const base = h.deps.probeLock
    let calls = 0
    h.deps = {
      ...h.deps,
      probeLock: c => {
        calls++
        return calls === 1 ? locks[c.id]! : base(c)
      },
    }
    const r = await runWatchLoop(config({ watch: true, cap: 3 }), h.deps)
    expect(h.records[0]!.skipped).toEqual([
      { id: '1', reason: 'locked', detail: 'locked (/w/locks/1, since T0)' },
    ])
    expect(h.batches).toEqual([['1']])
    expect(r.driven).toEqual(['1'])
  })

  it('AC7: idle under --watch waits the interval then re-selects; work starts the next at once', async () => {
    const h = harness([sel(), sel(card('1')), sel(), sel()])
    const r = await runWatchLoop(config({ watch: true, cap: 4, intervalMs: 90_000 }), h.deps)
    expect(h.waits).toEqual([90_000, 90_000])
    expect(h.records.map(x => x.next.kind)).toEqual(['waiting', 'continue', 'waiting', 'stop'])
    expect(r).toMatchObject({ reason: 'iteration cap', iterations: 4 })
  })

  it('AC7: every candidate escalated or locked counts as idle', async () => {
    const h = harness([sel(card('1', { escalated: true }), card('2'))], {
      locks: { '2': { kind: 'held', path: '/p' } },
    })
    const r = await runWatchLoop(config({ watch: true, cap: 2 }), h.deps)
    expect(h.batches).toEqual([])
    expect(h.waits).toHaveLength(1)
    expect(r.reason).toBe('iteration cap')
  })

  it('AC7: idle without --watch exits 0, nothing workable, with no wait', async () => {
    const h = harness([sel()])
    const r = await runWatchLoop(config(), h.deps)
    expect(h.waits).toEqual([])
    expect(r).toMatchObject({ reason: 'nothing workable', exitCode: 0, iterations: 1 })
  })

  it('AC9: the cap counts idle polls', async () => {
    const h = harness([sel()])
    const r = await runWatchLoop(config({ watch: true, cap: 3 }), h.deps)
    expect(r).toMatchObject({ reason: 'iteration cap', iterations: 3, exitCode: 0 })
    expect(h.waits).toHaveLength(2)
  })

  it('AC9: a cap of 1 runs exactly one iteration', async () => {
    const h = harness([sel(card('1')), sel(card('2'))])
    const r = await runWatchLoop(config({ cap: 1 }), h.deps)
    expect(r).toMatchObject({ reason: 'iteration cap', iterations: 1 })
    expect(h.batches).toEqual([['1']])
  })

  describe('AC8: the stop predicate', () => {
    const predicate = { selector: 'tag:risk:red', condition: 'Done' }
    const done = (id: string) => ({ id, tags: [], macrostate: 'Done' })
    const open = (id: string) => ({ id, tags: [], macrostate: 'Ready' })

    it('satisfied at iteration 1: stops before any work', async () => {
      const h = harness([{ candidates: [card('1')], snapshot: [done('9')] }])
      const r = await runWatchLoop(config({ predicate }), h.deps)
      expect(h.batches).toEqual([])
      expect(r).toMatchObject({ reason: 'stop predicate satisfied', iterations: 1 })
    })

    it('R: an empty snapshot is NEVER read as satisfied (an unconfirmed board is not a finished one)', async () => {
      const h = harness([
        { candidates: [card('1')], snapshot: [] },
        { candidates: [card('1')], snapshot: [] },
      ])
      const r = await runWatchLoop(config({ predicate, cap: 2 }), h.deps)
      expect(r.reason).not.toBe('stop predicate satisfied')
      expect(h.batches).toEqual([['1']])
    })

    it('R: a snapshot that omits a selected card carrying the selector tag is unusable (#262 red, not Done, was missing)', async () => {
      const red = card('262', { labels: ['risk:red'], tier: 'risk:red' })
      const h = harness([{ candidates: [card('482'), red], snapshot: [done('9')] }])
      const r = await runWatchLoop(config({ predicate }), h.deps)
      expect(r).toMatchObject({ reason: 'selection failed', exitCode: 1 })
      expect(r.selectionError).toMatch(/#262/)
      expect(h.batches).toEqual([])
    })

    it('R: a red card that is not Done keeps the predicate unsatisfied, and the selected workable cards run', async () => {
      const red = card('262', { labels: ['risk:red'], tier: 'risk:red' })
      const h = harness([
        { candidates: [card('482'), red], snapshot: [open('262')] },
        { candidates: [card('482'), red], snapshot: [open('262')] },
      ])
      const r = await runWatchLoop(config({ predicate, cap: 2 }), h.deps)
      expect(r.reason).not.toBe('stop predicate satisfied')
      expect(h.batches[0]).toEqual(['482', '262'])
    })

    it('R: the stop line carries the evidence (cards matched, all holding)', async () => {
      const h = harness([{ candidates: [], snapshot: [done('9'), done('8')] }])
      await runWatchLoop(config({ predicate }), h.deps)
      expect(h.records[0]!.predicateEvidence).toMatch(/2 card\(s\).*tag:risk:red ⇒ Done/)
    })

    it('satisfied at iteration k: the earlier iterations worked', async () => {
      const h = harness([
        { candidates: [card('1')], snapshot: [open('1')] },
        { candidates: [card('2')], snapshot: [open('2')] },
        { candidates: [], snapshot: [done('1'), done('2')] },
      ])
      const r = await runWatchLoop(config({ predicate, cap: 9 }), h.deps)
      expect(h.batches).toEqual([['1'], ['2']])
      expect(r).toMatchObject({ reason: 'stop predicate satisfied', iterations: 3 })
    })

    it('a missing snapshot with a predicate fails the selection (never read as empty = satisfied)', async () => {
      const h = harness([sel(card('1'))])
      const r = await runWatchLoop(config({ predicate }), h.deps)
      expect(r).toMatchObject({ reason: 'selection failed', exitCode: 1 })
      expect(h.batches).toEqual([])
    })
  })

  it('selection failure stops with exit 1, names the iteration, and is never retried', async () => {
    const h = harness([sel(card('1')), new Error('boom')])
    const r = await runWatchLoop(config({ watch: true, cap: 9 }), h.deps)
    expect(h.selections).toBe(2)
    expect(r).toMatchObject({
      reason: 'selection failed',
      iterations: 2,
      exitCode: 1,
      selectionError: 'boom',
    })
  })

  describe('AC10: signals', () => {
    it('during the wait: no new selection starts, exit 130', async () => {
      const h = harness([sel()], { waitOutcome: 'interrupted' })
      const r = await runWatchLoop(config({ watch: true, cap: 9 }), h.deps)
      expect(h.selections).toBe(1)
      expect(r).toMatchObject({ reason: 'interrupted', exitCode: 130 })
    })

    it('during a batch: the loop stops after it, no wait, no new selection', async () => {
      const h = harness([sel(card('1')), sel(card('2'))], { interruptAfterBatch: true })
      const r = await runWatchLoop(config({ watch: true, cap: 9 }), h.deps)
      expect(h.selections).toBe(1)
      expect(h.waits).toEqual([])
      expect(r).toMatchObject({ reason: 'interrupted', exitCode: 130 })
    })

    it('an interrupted card outcome stops the loop', async () => {
      const h = harness([sel(card('1')), sel(card('2'))], {
        outcomes: ids => ids.map(id => outcome(id, 'interrupted')),
      })
      expect((await runWatchLoop(config({ cap: 9 }), h.deps)).reason).toBe('interrupted')
    })

    it('already interrupted before the first selection: nothing starts', async () => {
      const h = harness([sel(card('1'))])
      h.interrupt()
      const r = await runWatchLoop(config(), h.deps)
      expect(h.selections).toBe(0)
      expect(r.iterations).toBe(0)
    })
  })

  it('exit-code matrix: a failed card anywhere makes it 1 for every stop reason; clean runs are 0', async () => {
    const failing = harness([sel(card('1')), sel()], {
      outcomes: ids => ids.map(id => outcome(id, 'crashed')),
    })
    expect((await runWatchLoop(config(), failing.deps)).exitCode).toBe(1)
    const skipped = harness([sel(card('1')), sel()], {
      outcomes: ids => ids.map(id => outcome(id, 'skipped')),
    })
    expect((await runWatchLoop(config(), skipped.deps)).exitCode).toBe(0)
  })

  it('a card the plan did not run (no outcome) stays selectable and is not counted driven', async () => {
    const h = harness([sel(card('1')), sel(card('1')), sel(card('1'))], { outcomes: () => [] })
    const r = await runWatchLoop(config({ watch: true, cap: 3 }), h.deps)
    expect(h.batches).toEqual([['1'], ['1'], ['1']])
    expect(r.driven).toEqual([])
    expect(h.waits).toHaveLength(2)
  })
})

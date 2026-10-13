import { describe, it, expect, vi, afterEach } from 'vitest'
import type { CardOutcome } from './parallel'
import type { RootCandidate } from './root-plan'
import { runWatchLoop, type IterationRecord, type LoopSelection } from './watch-loop'
import {
  describeLoopValues,
  describeMergeLine,
  iterationFields,
  renderIterationLine,
} from './loop-report'
import { createDefaultCycleDriver } from './cycle-wiring'

const card = (id: string, extra: Partial<RootCandidate> = {}): RootCandidate => ({
  id,
  title: `C${id}`,
  branch: 'b',
  tier: 'risk:green',
  labels: [],
  mutexResources: [],
  prerequisites: [],
  escalated: false,
  ...extra,
})
const out = (id: string, kind: CardOutcome['outcome']): CardOutcome => ({
  id,
  outcome: kind,
  detail: kind,
})
const sel = (...c: RootCandidate[]): LoopSelection => ({ candidates: c })

function run(
  script: LoopSelection[],
  kinds: (id: string, n: number) => CardOutcome['outcome'],
  retryBudget?: number,
) {
  let i = 0
  const batches: string[][] = []
  const records: IterationRecord[] = []
  const attempts: Record<string, number> = {}
  const result = runWatchLoop(
    {
      watch: true,
      intervalMs: 1,
      cap: script.length,
      ...(retryBudget !== undefined && { retryBudget }),
    },
    {
      select: async () => script[Math.min(i++, script.length - 1)]!,
      probeLock: () => ({ kind: 'free' }),
      runBatch: async cards => {
        batches.push(cards.map(c => c.id))
        return {
          outcomes: cards.map(c =>
            out(c.id, kinds(c.id, (attempts[c.id] = (attempts[c.id] ?? 0) + 1))),
          ),
        }
      },
      wait: async () => 'elapsed',
      isInterrupted: () => false,
      onIteration: r => void records.push(r),
    },
  )
  return { result, batches, records }
}

describe('I: only terminal outcomes stay excluded', () => {
  it('merged (completed) is never re-picked', async () => {
    const r = run([sel(card('1')), sel(card('1')), sel(card('1'))], () => 'completed')
    await r.result
    expect(r.batches).toEqual([['1']])
    expect(r.records[1]!.skipped[0]!.reason).toBe('already driven this run')
  })

  it('failed is retried once by default, then excluded: retry budget exhausted', async () => {
    const r = run([sel(card('1')), sel(card('1')), sel(card('1')), sel(card('1'))], () => 'failed')
    await r.result
    expect(r.batches).toEqual([['1'], ['1']])
    expect(r.records[1]!.retried).toEqual([{ id: '1', attempt: 1, budget: 1 }])
    expect(r.records[2]!.skipped[0]).toMatchObject({ id: '1', reason: 'retry budget exhausted' })
    expect(renderIterationLine(r.records[1]!, '1m')).toMatch(/retried #1 \(retry 1 of 1\)/)
    expect(renderIterationLine(r.records[2]!, '1m')).toMatch(/#1 retry budget exhausted/)
    expect(iterationFields(r.records[1]!)).toContainEqual(['retried', '1:1/1'])
  })

  it('a failure then success stops retrying', async () => {
    const r = run([sel(card('1')), sel(card('1')), sel(card('1'))], (_, n) =>
      n === 1 ? 'failed' : 'completed',
    )
    await r.result
    expect(r.batches).toEqual([['1'], ['1']])
  })

  it('--retry budget 0 means no retry', async () => {
    const r = run([sel(card('1')), sel(card('1'))], () => 'failed', 0)
    await r.result
    expect(r.batches).toEqual([['1']])
  })

  it('escalated -> cleared -> re-picked (and the failure that was the escalation does not burn the budget)', async () => {
    const r = run(
      [sel(card('1')), sel(card('1', { escalated: true })), sel(card('1')), sel(card('1'))],
      (_, n) => (n === 1 ? 'failed' : 'completed'),
    )
    await r.result
    expect(r.batches).toEqual([['1'], ['1']])
    expect(r.records[1]!.skipped[0]!.reason).toBe('escalated')
    expect(r.records[2]!.retried ?? []).toEqual([])
  })

  it('the loop header prints the retry budget', () => {
    const lines = describeLoopValues(
      {
        watch: { value: 'off', source: 'KB default' },
        interval: { value: '1m', source: 'KB default', ms: 1 },
        cap: { value: 1, bound: 'x' },
        loopMode: true,
      } as never,
      {},
      2,
      3,
    )
    expect(lines.join('\n')).toMatch(/retry budget: 1 per failed card/)
  })
})

describe('G: the stage line flags a missing final result', () => {
  afterEach(() => vi.restoreAllMocks())
  it('exported formatter says so only for a not-advanced success without final', async () => {
    const { finalPart } = await import('./cycle-wiring.js')
    const base = { step: 'implement', processOutcome: 'success' as const, handoffAdvanced: false }
    expect(finalPart(base)).toMatch(/no final result/)
    expect(finalPart({ ...base, handoffAdvanced: true })).toBe('')
    expect(finalPart({ ...base, processOutcome: 'failed' })).toBe('')
    expect(
      finalPart({ ...base, final: { status: 'failed', reason: 'x', next: { step: 'blocked' } } }),
    ).toBe(' — final: status=failed reason=x next=blocked')
  })
  it('keeps createDefaultCycleDriver exported', () => {
    expect(typeof createDefaultCycleDriver).toBe('function')
  })
})

describe('R: the loop header states the stop predicate with its source and the order', () => {
  const values = (predicate: unknown) =>
    describeLoopValues(
      {
        watch: { value: 'on', source: '--watch' },
        interval: { value: '1m', source: 'KB default', ms: 1 },
        cap: { value: 1, bound: 'x' },
        loopMode: true,
        predicate,
      } as never,
      {},
      2,
      3,
    ).join('\n')
  it('argument', () =>
    expect(values({ value: 'tag:risk:red ⇒ Done', source: '--predicate' })).toMatch(
      /stop predicate: tag:risk:red ⇒ Done \(--predicate\)/,
    ))
  it('adoption and none, plus the evaluation order', () => {
    expect(values({ value: 'root ⇒ Done', source: '## Stop Predicate' })).toMatch(
      /\(## Stop Predicate\)/,
    )
    const none = values(undefined)
    expect(none).toMatch(/stop predicate: \(none\)/)
    expect(none).toMatch(/checked at each iteration boundary, before work/i)
  })
})

describe('AD: only TRANSIENT failures are retried; a durable cycle terminal is reported and excluded', () => {
  const durable = (id: string, status: string): CardOutcome => ({
    id,
    outcome: 'failed',
    detail: 'exit 1',
    cycleStatus: status,
  })

  it('failed-contract (cycle status reported) is NOT retried and is excluded with its reason', async () => {
    const batches: string[][] = []
    const records: IterationRecord[] = []
    await runWatchLoop(
      { watch: true, intervalMs: 1, cap: 3 },
      {
        select: async () => sel(card('1')),
        probeLock: () => ({ kind: 'free' }),
        runBatch: async cards => (
          batches.push(cards.map(c => c.id)),
          { outcomes: [durable('1', 'failed-contract')] }
        ),
        wait: async () => 'elapsed',
        isInterrupted: () => false,
        onIteration: r => void records.push(r),
      },
    )
    expect(batches).toEqual([['1']])
    const skip = records[1]!.skipped[0]!
    expect(skip).toMatchObject({ id: '1', reason: 'durable failure' })
    expect(skip.detail).toMatch(/failed-contract/)
    expect(renderIterationLine(records[1]!, '1m')).toMatch(
      /#1 durable failure: failed-contract — not retried/,
    )
  })

  it('a crash / no cycle status (engine or API error before the cycle reported) is transient: retried within the budget', async () => {
    const batches: string[][] = []
    await runWatchLoop(
      { watch: true, intervalMs: 1, cap: 4 },
      {
        select: async () => sel(card('1')),
        probeLock: () => ({ kind: 'free' }),
        runBatch: async cards => (
          batches.push(cards.map(c => c.id)),
          { outcomes: [out('1', 'crashed')] }
        ),
        wait: async () => 'elapsed',
        isInterrupted: () => false,
        onIteration: () => {},
      },
    )
    expect(batches).toEqual([['1'], ['1']])
  })

  it('A2: `Cycle status: escalated` (an autonomy gate fired) is NOT durable — skipped while the selection reports it escalated, re-picked once cleared, and never burns the retry budget; `escalate` (a human decision owed) IS durable', async () => {
    const run = async (status: string) => {
      const batches: string[][] = []
      let i = 0
      await runWatchLoop(
        { watch: true, intervalMs: 1, cap: 4 },
        {
          select: async () => {
            i++
            // iteration 2: still escalated per the selection; 3+: cleared
            return sel(card('1', { escalated: i === 2 }), card('2'))
          },
          probeLock: () => ({ kind: 'free' }),
          runBatch: async cards => {
            batches.push(cards.map(c => c.id))
            return {
              outcomes: cards.map(c => ({
                id: c.id,
                outcome:
                  c.id === '1' && batches.length === 1
                    ? ('failed' as const)
                    : ('completed' as const),
                detail: 'x',
                ...(c.id === '1' && batches.length === 1 && { cycleStatus: status }),
              })),
            }
          },
          wait: async () => 'elapsed',
          isInterrupted: () => false,
          onIteration: () => {},
        },
      )
      return batches
    }
    expect(await run('escalated')).toEqual([['1', '2'], ['1']])
    expect(await run('escalate')).toEqual([['1', '2']])
  })
})

describe('A5: the merge header says the gate is NOT evaluated when the effective `until` is not merged', () => {
  const policy = { autoAdvance: '(none)' } as never
  const merge: Array<[string, string]> = [['merge', 'when; has: risk:red (argument)']]
  it('until pr (forwarded or the default) ⇒ the merge gate is never evaluated', () => {
    expect(describeMergeLine(policy, [...merge, ['until', 'pr (argument)']], 'pr')).toMatch(
      /is not evaluated/i,
    )
    expect(describeMergeLine(policy, merge, 'pr')).toMatch(/is not evaluated/i)
  })
  it('until merged ⇒ each card merges per its gate', () => {
    const line = describeMergeLine(policy, [...merge, ['until', 'merged (argument)']], 'merged')
    expect(line).toMatch(/each card merges per its gate/)
    expect(line).not.toMatch(/not evaluated/i)
  })
})

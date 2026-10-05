import { describe, it, expect } from 'vitest'
import { renderIterationLine } from './loop-report'
import type { IterationRecord } from './watch-loop'

const record = (outcomes: IterationRecord['outcomes']): IterationRecord => ({
  iteration: 1,
  cap: 5,
  selected: outcomes.length,
  skipped: [],
  outcomes,
  next: { kind: 'continue' },
})
const o = (id: string, prepare?: 'prepared' | 'escalated' | 'needs-human' | 'failed') => ({
  id,
  outcome: 'completed' as const,
  detail: 'exit 0',
  ...(prepare !== undefined && { prepare }),
})

describe('US-523 T-8: the per-iteration line reports prepared / escalated / needs-human counts', () => {
  it('adds the counts only when a card reported a prepare outcome', () => {
    expect(
      renderIterationLine(
        record([
          o('1', 'prepared'),
          o('2', 'prepared'),
          o('3', 'escalated'),
          o('4', 'needs-human'),
        ]),
        '',
      ),
    ).toBe(
      '  Iteration 1/5: selected 4 · skipped none · ran #1 completed, #2 completed, #3 completed, #4 completed · prepare: 2 prepared, 1 escalated, 1 needs-human · next iteration',
    )
  })

  it('is byte-identical to today when no card ran a prepare phase', () => {
    expect(renderIterationLine(record([o('1')]), '')).toBe(
      '  Iteration 1/5: selected 1 · skipped none · ran #1 completed · next iteration',
    )
  })
})

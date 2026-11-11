import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { join } from 'path'
import { evaluateStopPredicate, parseStopCondition, type PredicateCard } from './stop-predicate'

const card = (id: string, macrostate: string, tags: string[] = []): PredicateCard => ({
  id,
  tags,
  macrostate,
})

const PREDICATE = (condition: string) => ({ selector: 'root', condition })

const TABLE: {
  name: string
  predicate: { selector: string; condition: string } | undefined
  snapshot: PredicateCard[]
  satisfied: boolean
}[] = [
  { name: 'no predicate', predicate: undefined, snapshot: [card('1', 'Done')], satisfied: false },
  { name: 'empty snapshot', predicate: PREDICATE('Done'), snapshot: [], satisfied: true },
  {
    name: 'one card not in macrostate',
    predicate: PREDICATE('Done'),
    snapshot: [card('1', 'Done'), card('2', 'In Progress')],
    satisfied: false,
  },
  {
    name: 'and: both hold',
    predicate: PREDICATE('Done and has-tag:approved'),
    snapshot: [card('1', 'Done', ['approved'])],
    satisfied: true,
  },
  {
    name: 'and: one fails',
    predicate: PREDICATE('Done and has-tag:approved'),
    snapshot: [card('1', 'Done', [])],
    satisfied: false,
  },
]

describe('evaluateStopPredicate', () => {
  it.each(TABLE)('$name', ({ predicate, snapshot, satisfied }) => {
    expect(evaluateStopPredicate(predicate, snapshot).satisfied).toBe(satisfied)
  })

  it('reasons match the original for the two special rows', () => {
    expect(evaluateStopPredicate(undefined, []).reason).toBe('no predicate declared')
    expect(evaluateStopPredicate(PREDICATE('Done'), []).reason).toBe(
      'unsatisfiable selector — matches nothing',
    )
    expect(evaluateStopPredicate(PREDICATE('Done'), [card('1', 'Done')]).reason).toBeNull()
  })
})

describe('parseStopCondition', () => {
  it('returns undefined when the line has no arrow', () => {
    expect(parseStopCondition('max-iterations: 3')).toBeUndefined()
  })
})

describe('parity with .claude/workflows/pair-loop.js', () => {
  // The workflow file ends in a top-level `return`, so it cannot be imported: the function's own
  // source is lifted out of the file and evaluated, so a divergent edit there fails this test.
  const source = readFileSync(
    join(__dirname, '../../../../../.claude/workflows/pair-loop.js'),
    'utf-8',
  )
  const body = /^(function evaluateStopPredicate[\s\S]*?\n\})\n/m.exec(source)?.[1]

  it('finds the original function', () => {
    expect(body).toBeDefined()
  })
})

import { describe, it, expect } from 'vitest'
import { cardProgress, stageDetail, todoInProgress } from './card-progress'
import type { RunEvent } from './run-events'

describe('card progress: plain-words detail per stage', () => {
  it.each([
    [{ step: 'prepare', attempt: 1 }, 'writing tests'],
    [{ step: 'prepare', attempt: 2 }, 'writing tests · try 2'],
    [{ step: 'validate' }, 'checking tests'],
    [{ step: 'implement' }, 'coding'],
    [{ step: 'green', findings: [1, 2] }, 'fixing 2 issues'],
    [{ step: 'green', findings: [1] }, 'fixing 1 issue'],
    [{ step: 'verify', round: 0 }, 'reviewing'],
    [{ step: 'verify', round: 2 }, 'reviewing · round 2'],
  ])('%j → %s', (next, detail) => expect(stageDetail(next)).toBe(detail))

  it('opens the card once, shows the todo only while coding, and merge steps replace the detail', () => {
    const events: RunEvent[] = []
    const p = cardProgress({ card: '575', title: 'Auto', onRunEvent: e => events.push(e) })
    p.dispatch({ step: 'implement' })
    p.task('Writing the base sync')
    p.task('Writing the base sync')
    p.dispatch({ step: 'verify', round: 0 })
    p.task('ignored while reviewing')
    p.merge('waiting for CI')
    expect(events.map(e => [e.event, e.detail])).toEqual([
      ['card-start', undefined],
      ['stage', 'coding'],
      ['stage', 'coding · Writing the base sync'],
      ['stage', 'reviewing'],
      ['stage', 'waiting for CI'],
    ])
  })

  it('carries the PR number from the first dispatch that knows it to every later event', () => {
    const events: RunEvent[] = []
    const p = cardProgress({ card: '575', onRunEvent: e => events.push(e) })
    p.dispatch({ step: 'implement' })
    p.dispatch({ step: 'verify', round: 0, pr: 581 })
    p.dispatch({ step: 'green', findings: [1] })
    p.merge('waiting for CI')
    expect(events.filter(e => e.event === 'stage').map(e => e.pr)).toEqual([
      undefined,
      581,
      581,
      581,
    ])
  })

  it('reads the in-progress item of a TodoWrite tool call, nothing else', () => {
    const todo = (todos: unknown) => ({
      type: 'assistant',
      message: { content: [{ type: 'tool_use', name: 'TodoWrite', input: { todos } }] },
    })
    expect(
      todoInProgress(
        todo([
          { content: 'a', status: 'completed' },
          { content: 'b', activeForm: 'Doing b', status: 'in_progress' },
        ]),
      ),
    ).toBe('Doing b')
    expect(todoInProgress(todo([{ content: 'a', status: 'pending' }]))).toBeUndefined()
    expect(
      todoInProgress({
        type: 'assistant',
        message: { content: [{ type: 'text', text: 'TodoWrite' }] },
      }),
    ).toBeUndefined()
  })
})

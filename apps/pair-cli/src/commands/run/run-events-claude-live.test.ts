import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { join } from 'path'
import { readIterationOutcome, toLines } from './stream-reader'
import { ENGINES } from './engines'
import type { RunEvent } from './run-events'

const read = async (content: string, options?: { maxFixRounds?: number }): Promise<RunEvent[]> => {
  const events: RunEvent[] = []
  await readIterationOutcome(
    toLines(
      (async function* () {
        yield content
      })(),
    ),
    ENGINES.claude,
    undefined,
    e => events.push(e),
    options,
  )
  return events
}

const fixture = () =>
  readFileSync(join(__dirname, '__fixtures__', 'claude-live-workflow-progress.jsonl'), 'utf-8')

const withoutRepeats = (stages: string[]) => stages.filter((s, i) => s !== stages[i - 1])

const stagesOf = (events: RunEvent[], card: string) =>
  withoutRepeats(events.filter(e => e.card === card && e.event === 'stage').map(e => e.stage!))

const endsOf = (events: RunEvent[], card: string) =>
  events.filter(e => e.card === card && e.event === 'card-end').map(e => e.status)

const DONE = ['merged', 'completed']

const progressLine = (...labels: string[]) =>
  JSON.stringify({
    type: 'system',
    subtype: 'task_progress',
    workflow_progress: labels.map((label, i) => ({
      type: 'workflow_agent',
      index: i + 1,
      label,
      agentId: `a${i}`,
    })),
  })

const resultLine = (result: string, error = false) =>
  JSON.stringify({
    type: 'result',
    subtype: error ? 'error_during_execution' : 'success',
    is_error: error,
    result,
  })

const stream = (...lines: string[]) => `${lines.join('\n')}\n`

// r0-3 (recorded live, claude 2.x, 2026-10-23): a background Workflow's log() never reaches
// `claude -p` stream-json; its agents' labels do, live, in system/task_progress.workflow_progress.
describe('claude live stream (recorded fixture, r0-3)', () => {
  it('r2-6-w2: with no run policy the max is unknown — stages are [implement, review, fix 1/?, merge]', async () => {
    const events = await read(fixture())
    expect(events.filter(e => e.card === '573')[0]?.event).toBe('card-start')
    expect(stagesOf(events, '573')).toEqual(['implement', 'review', 'fix 1/?', 'merge'])
  })

  it('r2-6-w3: the run policy maxFixRounds 10 reaches the claude path — fix 1/10', async () => {
    const events = await read(fixture(), { maxFixRounds: 10 })
    expect(stagesOf(events, '573')).toEqual(['implement', 'review', 'fix 1/10', 'merge'])
  })

  it('r2-7-w1: a card opened from progress is closed at iteration end with the explicit unknown status', async () => {
    const events = (await read(fixture())).filter(e => e.card === '573')
    expect(events.at(-1)?.event).toBe('card-end')
    expect(endsOf(events, '573')).toEqual(['unknown'])
  })

  it('r2-7-w2: a readable workflow result names the card status it returned', async () => {
    const returned = JSON.stringify({
      workflowVersion: '4.0.1',
      batch: [{ id: '573', status: 'ready-for-merge' }],
      note: '1/1 cards advanced (1 ready-for-merge)',
    })
    const events = await read(stream(progressLine('implement:#573'), resultLine(returned)))
    expect(endsOf(events, '573')).toEqual(['ready-for-merge'])
  })

  // pair-loop.js (the default `pair run` skill) returns { iterations, log: [{ iteration, id, status }] }.
  const loopReturn = JSON.stringify({
    iterations: 1,
    log: [{ iteration: 0, id: '573', status: 'ready-for-merge' }],
  })

  it('r2-7-w5: the pair-loop return log[].{id,status} names the card status', async () => {
    const events = await read(stream(progressLine('implement:#573'), resultLine(loopReturn)))
    expect(endsOf(events, '573')).toEqual(['ready-for-merge'])
  })

  it('r2-7-w6: a return JSON quoted inside prose reads like the bare JSON', async () => {
    const prose = `Il workflow è terminato senza errori e il risultato è \`${loopReturn}\`.`
    const events = await read(stream(progressLine('implement:#573'), resultLine(prose)))
    expect(endsOf(events, '573')).toEqual(['ready-for-merge'])
  })

  it('r2-7-w3: an error terminal closes the progress-opened card with a non-done status', async () => {
    const events = await read(stream(progressLine('implement:#573'), resultLine('boom', true)))
    const ends = endsOf(events, '573')
    expect(ends).toHaveLength(1)
    expect(DONE).not.toContain(ends[0])
  })

  it('r2-7-w4: a stream cut before any terminal event still closes the card, never as done', async () => {
    const events = await read(stream(progressLine('implement:#573')))
    const ends = endsOf(events, '573')
    expect(ends).toHaveLength(1)
    expect(DONE).not.toContain(ends[0])
  })

  it('r2-7-c1: a card the workflow already ended is not closed a second time', async () => {
    const end = 'PAIR_EVENT {"event":"card-end","card":"573","status":"merged"}'
    const events = await read(stream(progressLine('implement:#573'), resultLine(end)))
    expect(endsOf(events, '573')).toEqual(['merged'])
  })

  it('r2-7-i1: with two progress-opened cards, only the one the workflow did not end is closed', async () => {
    const end = 'PAIR_EVENT {"event":"card-end","card":"573","status":"merged"}'
    const events = await read(
      stream(progressLine('implement:#573', 'implement:#574'), resultLine(end)),
    )
    expect(endsOf(events, '573')).toEqual(['merged'])
    expect(endsOf(events, '574')).toEqual(['unknown'])
  })
})

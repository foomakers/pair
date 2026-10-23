import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { join } from 'path'
import { readIterationOutcome, toLines } from './stream-reader'
import { ENGINES, type EngineId } from './engines'
import { parseRunEvent, type RunEvent } from './run-events'

async function eventsOf(name: string, engine: EngineId) {
  const content = readFileSync(join(__dirname, '__fixtures__', name), 'utf-8')
  const chunks = (async function* () {
    for (let index = 0; index < content.length; index += 50) yield content.slice(index, index + 50)
  })()
  const events: RunEvent[] = []
  const result = await readIterationOutcome(toLines(chunks), ENGINES[engine], undefined, e =>
    events.push(e),
  )
  return { events, result }
}

const EXPECTED = [
  ['loop-start', undefined],
  ['iteration', undefined],
  ['card-start', 'ENG-12'],
  ['stage', 'ENG-12'],
  ['stage', 'ENG-12'],
  ['card-end', 'ENG-12'],
  ['loop-end', undefined],
]

describe('run events — one typed source per engine stream (US-573 AC1)', () => {
  it.each([
    ['claude-workflow-events.jsonl', 'claude'],
    ['codex-workflow-events.jsonl', 'codex'],
    ['pi-workflow-events.jsonl', 'pi'],
  ] as const)('%s maps to the expected event sequence, once each', async (fixture, engine) => {
    const { events } = await eventsOf(fixture, engine)
    expect(events.map(e => [e.event, e.card])).toEqual(EXPECTED)
    expect(events.find(e => e.event === 'stage' && e.stage === 'review')?.pr).toBe(41)
    expect(events.at(-1)?.status).toBe('completed')
  })

  it('keeps a non-numeric card id unchanged and coerces a numeric one to its string', () => {
    expect(parseRunEvent('{"event":"card-start","card":"ENG-12"}')?.card).toBe('ENG-12')
    expect(parseRunEvent('{"event":"card-start","card":573}')?.card).toBe('573')
  })

  it('refuses an unknown event, a non-object body and a card that is neither string nor number', () => {
    expect(parseRunEvent('{"event":"teleport"}')).toBeUndefined()
    expect(parseRunEvent('[1,2]')).toBeUndefined()
    expect(parseRunEvent('{"event":"stage","card":{"x":1}}')).toBeUndefined()
    expect(parseRunEvent('{not json')).toBeUndefined()
  })

  it('skips and COUNTS malformed event bodies and unparseable stream lines — never fatal', async () => {
    const { events, result } = await eventsOf('claude-malformed-events.jsonl', 'claude')
    expect(events.map(e => e.card)).toEqual(['9'])
    expect(result.outcome).toBe('success')
    expect(result.skippedLines).toBe(4)
  })

  it('an engine stream with no event at all reports zero run events (the degrade signal)', async () => {
    const { events, result } = await eventsOf('claude-success.jsonl', 'claude')
    expect(events).toEqual([])
    expect(result.runEvents ?? 0).toBe(0)
  })
})

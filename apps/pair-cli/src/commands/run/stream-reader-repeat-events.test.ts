import { describe, it, expect } from 'vitest'
import { readIterationOutcome } from './stream-reader'
import { ENGINES, type EngineId } from './engines'
import { runEventLine, type RunEvent } from './run-events'

/** One claude tool_result stream event carrying ONE workflow log line. */
const toolResult = (event: Record<string, unknown>) =>
  JSON.stringify({
    type: 'user',
    message: {
      role: 'user',
      content: [{ type: 'tool_result', tool_use_id: 't1', content: runEventLine(event) }],
    },
  })

const RESULT = JSON.stringify({
  type: 'result',
  subtype: 'success',
  is_error: false,
  result: 'done',
})

/** One claude tool_result stream event whose content carries the SAME line in two text blocks. */
const toolResultTwice = (event: Record<string, unknown>) =>
  JSON.stringify({
    type: 'user',
    message: {
      role: 'user',
      content: [
        {
          type: 'tool_result',
          tool_use_id: 't1',
          content: [
            { type: 'text', text: runEventLine(event) },
            { type: 'text', text: runEventLine(event) },
          ],
        },
      ],
    },
  })

/** The claude terminal result whose final text re-quotes `event`. */
const resultQuoting = (event: Record<string, unknown>) =>
  JSON.stringify({
    type: 'result',
    subtype: 'success',
    is_error: false,
    result: `LOOP RUN done\n${runEventLine(event)}`,
  })

const codexItem = (event: Record<string, unknown>) =>
  JSON.stringify({
    type: 'item.completed',
    item: {
      id: 'i1',
      type: 'command_execution',
      command: 'pair-loop',
      aggregated_output: runEventLine(event),
      exit_code: 0,
    },
  })

const piMessage = (event: Record<string, unknown>) =>
  JSON.stringify({
    type: 'message_end',
    message: {
      role: 'assistant',
      stopReason: 'endTurn',
      content: [{ type: 'text', text: runEventLine(event) }],
    },
  })

const piAssistant = (event: Record<string, unknown>) => ({
  role: 'assistant',
  stopReason: 'endTurn',
  content: [{ type: 'text', text: runEventLine(event) }],
})

/** pi 0.84.3 re-quotes a message's content in turn_end (message + toolResults) after message_end. */
const piTurnEnd = (event: Record<string, unknown>) =>
  JSON.stringify({ type: 'turn_end', message: piAssistant(event), toolResults: [] })

/** pi 0.84.3 agent_end carries every message of the run again. */
const piAgentEnd = (events: Record<string, unknown>[]) =>
  JSON.stringify({ type: 'agent_end', messages: events.map(piAssistant), willRetry: false })

async function read(lines: string[], engine: EngineId = 'claude') {
  const events: RunEvent[] = []
  const stream = (async function* () {
    yield* lines
  })()
  const result = await readIterationOutcome(stream, ENGINES[engine], undefined, e => events.push(e))
  return { events, result }
}

describe('r0-1: a re-entered stage or a repeated card-end is a new event, not a duplicate', () => {
  it('W-r0-1a: review re-entered after fix 1/3 with an identical body is relayed again', async () => {
    const { events, result } = await read([
      toolResult({ event: 'stage', card: '9', stage: 'implement' }),
      toolResult({ event: 'stage', card: '9', stage: 'review', pr: 9 }),
      toolResult({ event: 'stage', card: '9', stage: 'fix 1/3', pr: 9 }),
      toolResult({ event: 'stage', card: '9', stage: 'review', pr: 9 }),
      RESULT,
    ])
    expect(events.map(e => e.stage)).toEqual(['implement', 'review', 'fix 1/3', 'review'])
    expect(result.runEvents).toBe(4)
  })

  it('W-r0-1b: an identical card-start/card-end in a later loop iteration is relayed again', async () => {
    const { events, result } = await read([
      toolResult({ event: 'loop-start' }),
      toolResult({ event: 'iteration', iteration: 0 }),
      toolResult({ event: 'card-start', card: '7', title: 't' }),
      toolResult({ event: 'card-end', card: '7', status: 'failed', reason: 'x' }),
      toolResult({ event: 'iteration', iteration: 1 }),
      toolResult({ event: 'card-start', card: '7', title: 't' }),
      toolResult({ event: 'card-end', card: '7', status: 'failed', reason: 'x' }),
      toolResult({ event: 'loop-end', status: 'completed', reason: 'done' }),
      RESULT,
    ])
    expect(events.map(e => e.event)).toEqual([
      'loop-start',
      'iteration',
      'card-start',
      'card-end',
      'iteration',
      'card-start',
      'card-end',
      'loop-end',
    ])
    expect(result.runEvents).toBe(8)
  })

  it('C-r0-1a: distinct stage bodies are each relayed once, in order', async () => {
    const { events } = await read([
      toolResult({ event: 'stage', card: '9', stage: 'implement' }),
      toolResult({ event: 'stage', card: '9', stage: 'review', pr: 9 }),
      RESULT,
    ])
    expect(events.map(e => e.stage)).toEqual(['implement', 'review'])
  })
})

describe('r0-1: the re-entry rule holds on every engine channel, not only claude tool_result', () => {
  it('W-r0-1d: codex — review re-entered in a later item.completed is relayed again', async () => {
    const { events, result } = await read(
      [
        codexItem({ event: 'stage', card: '9', stage: 'review', pr: 9 }),
        codexItem({ event: 'stage', card: '9', stage: 'fix 1/3', pr: 9 }),
        codexItem({ event: 'stage', card: '9', stage: 'review', pr: 9 }),
        JSON.stringify({ type: 'turn.completed', usage: { input_tokens: 1 } }),
      ],
      'codex',
    )
    expect(events.map(e => e.stage)).toEqual(['review', 'fix 1/3', 'review'])
    expect(result.runEvents).toBe(3)
  })

  it('W-r0-1e: pi — review re-entered in a later message_end is relayed again', async () => {
    const { events, result } = await read(
      [
        piMessage({ event: 'stage', card: '9', stage: 'review', pr: 9 }),
        piMessage({ event: 'stage', card: '9', stage: 'fix 1/3', pr: 9 }),
        piMessage({ event: 'stage', card: '9', stage: 'review', pr: 9 }),
        JSON.stringify({ type: 'agent_end', messages: [], willRetry: false }),
        JSON.stringify({ type: 'agent_settled' }),
      ],
      'pi',
    )
    expect(events.map(e => e.stage)).toEqual(['review', 'fix 1/3', 'review'])
    expect(result.runEvents).toBe(3)
  })
})

describe('r0-1: pi re-quotes each message in later aggregate events (turn_end, agent_end)', () => {
  it('C-r0-1e: pi — one stage in message_end, turn_end and agent_end is relayed once', async () => {
    const review = { event: 'stage', card: '9', stage: 'review', pr: 9 }
    const { events, result } = await read(
      [
        piMessage(review),
        piTurnEnd(review),
        piAgentEnd([review]),
        JSON.stringify({ type: 'agent_settled' }),
      ],
      'pi',
    )
    expect(events.map(e => e.stage)).toEqual(['review'])
    expect(result.runEvents).toBe(1)
  })

  it('W-r0-1f: pi — review, fix 1/3, review each re-quoted by turn_end and agent_end are relayed 3 times', async () => {
    const review = { event: 'stage', card: '9', stage: 'review', pr: 9 }
    const fix = { event: 'stage', card: '9', stage: 'fix 1/3', pr: 9 }
    const { events, result } = await read(
      [
        piMessage(review),
        piTurnEnd(review),
        piMessage(fix),
        piTurnEnd(fix),
        piMessage(review),
        piTurnEnd(review),
        piAgentEnd([review, fix, review]),
        JSON.stringify({ type: 'agent_settled' }),
      ],
      'pi',
    )
    expect(events.map(e => e.stage)).toEqual(['review', 'fix 1/3', 'review'])
    expect(result.runEvents).toBe(3)
  })
})

describe('r0-1: a body quoted twice in ONE event, or re-quoted in the final text, stays one event', () => {
  it('C-r0-1c: a card-end re-quoted in the claude result text is relayed once', async () => {
    const end = { event: 'card-end', card: '7', status: 'merged', pr: 7 }
    const { events, result } = await read([toolResult(end), resultQuoting(end)])
    expect(events.map(e => [e.event, e.card])).toEqual([['card-end', '7']])
    expect(result.runEvents).toBe(1)
  })

  it('W-r0-1c: a re-entered review re-quoted in the result text is relayed for the re-entry only', async () => {
    const { events, result } = await read([
      toolResult({ event: 'stage', card: '9', stage: 'review', pr: 9 }),
      toolResult({ event: 'stage', card: '9', stage: 'fix 1/3', pr: 9 }),
      toolResult({ event: 'stage', card: '9', stage: 'review', pr: 9 }),
      resultQuoting({ event: 'stage', card: '9', stage: 'review', pr: 9 }),
    ])
    expect(events.map(e => e.stage)).toEqual(['review', 'fix 1/3', 'review'])
    expect(result.runEvents).toBe(3)
  })

  it('C-r0-1d: the same stage line in two fields of one tool_result is relayed once', async () => {
    const { events, result } = await read([
      toolResultTwice({ event: 'stage', card: '9', stage: 'review', pr: 9 }),
      RESULT,
    ])
    expect(events.map(e => e.stage)).toEqual(['review'])
    expect(result.runEvents).toBe(1)
  })
})

/** The whole run as PAIR_EVENT lines in ONE string: review, fix 1/3, review. */
const REENTERED = [
  { event: 'stage', card: '9', stage: 'review', pr: 9 },
  { event: 'stage', card: '9', stage: 'fix 1/3', pr: 9 },
  { event: 'stage', card: '9', stage: 'review', pr: 9 },
]
const reenteredText = REENTERED.map(e => runEventLine(e)).join('\n')

describe("r0-1: a stage re-entered WITHIN one decoded event's multi-line text is relayed again", () => {
  it('W-r0-1g: claude — one tool_result string carrying review, fix 1/3, review', async () => {
    const { events, result } = await read([
      JSON.stringify({
        type: 'user',
        message: {
          role: 'user',
          content: [{ type: 'tool_result', tool_use_id: 't1', content: reenteredText }],
        },
      }),
      RESULT,
    ])
    expect(events.map(e => e.stage)).toEqual(['review', 'fix 1/3', 'review'])
    expect(result.runEvents).toBe(3)
  })

  it('W-r0-1h: codex — one item.completed aggregated_output carrying review, fix 1/3, review', async () => {
    const { events, result } = await read(
      [
        JSON.stringify({
          type: 'item.completed',
          item: {
            id: 'i1',
            type: 'command_execution',
            command: 'pair-loop',
            aggregated_output: reenteredText,
            exit_code: 0,
          },
        }),
        JSON.stringify({ type: 'turn.completed', usage: { input_tokens: 1 } }),
      ],
      'codex',
    )
    expect(events.map(e => e.stage)).toEqual(['review', 'fix 1/3', 'review'])
    expect(result.runEvents).toBe(3)
  })

  it('W-r0-1i: pi — one message_end text carrying review, fix 1/3, review, re-quoted by turn_end and agent_end', async () => {
    const message = {
      role: 'assistant',
      stopReason: 'endTurn',
      content: [{ type: 'text', text: reenteredText }],
    }
    const { events, result } = await read(
      [
        JSON.stringify({ type: 'message_end', message }),
        JSON.stringify({ type: 'turn_end', message, toolResults: [] }),
        JSON.stringify({ type: 'agent_end', messages: [message], willRetry: false }),
        JSON.stringify({ type: 'agent_settled' }),
      ],
      'pi',
    )
    expect(events.map(e => e.stage)).toEqual(['review', 'fix 1/3', 'review'])
    expect(result.runEvents).toBe(3)
  })
})

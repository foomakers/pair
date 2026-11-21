import { describe, expect, it } from 'vitest'
import { ENGINES } from './engines'
import { finalTextOf } from './stream-reader'

/** US-652 (AC-4): the agent's final message, as one decoded stream event carries it. */
describe('finalTextOf', () => {
  it.each([
    [
      "claude's terminal event carries the final text",
      'claude',
      { type: 'result', subtype: 'success', result: 'the final message' },
      'the final message',
    ],
    [
      "codex's agent message is the final text",
      'codex',
      { type: 'item.completed', item: { type: 'agent_message', text: 'the final message' } },
      'the final message',
    ],
    [
      "codex's terminal event carries none",
      'codex',
      { type: 'turn.completed', usage: {} },
      undefined,
    ],
    [
      'an event that is neither carries none',
      'claude',
      { type: 'assistant', message: { content: 'working' } },
      undefined,
    ],
  ] as const)('%s', (_name, engine, payload, text) => {
    expect(finalTextOf(ENGINES[engine], payload)).toBe(text)
  })
})

import { expect, it } from 'vitest'
import { ENGINES } from './engines'
import { runStage } from './stage-runner'

it('AC-1: stage runner captures usage and session without dropping the progress callback', async () => {
  const seen: unknown[] = []
  const result = await runStage({
    engine: ENGINES.codex,
    packet: { step: 'implement', worktree: '/tmp', prompt: 'probe' },
    autonomyArgs: [],
    model: 'model-a',
    onEvent: payload => seen.push(payload),
    runIteration: async input => {
      input.onEvent?.({ type: 'thread.started', thread_id: 'thread-1' })
      input.onEvent?.({
        type: 'turn.completed',
        usage: {
          input_tokens: 9,
          cached_input_tokens: 3,
          output_tokens: 2,
          reasoning_output_tokens: 1,
        },
      })
      return { outcome: 'success', detail: 'done' }
    },
  })
  expect(seen).toHaveLength(2)
  expect(result.telemetry).toEqual({
    sessionId: 'thread-1',
    tokens: { freshIn: 6, cachedIn: 3, out: 2, reasoning: 1 },
  })
})

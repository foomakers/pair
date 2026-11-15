// #645 r0-2 / AC-1: provider-exclusive input; optional reasoning is an output subset.
import type { Tokens } from '../telemetry'
export const usageEvent = (engine: string, usage: Record<string, unknown>) =>
  engine === 'pi'
    ? { type: 'message_end', message: { role: 'assistant', usage } }
    : { type: 'result', usage }
export const baseUsage = (engine: string): Record<string, unknown> =>
  engine === 'pi'
    ? { input: 5, cacheWrite: 0, cacheRead: 20, output: 3 }
    : {
        input_tokens: 5,
        cache_creation_input_tokens: 0,
        cache_read_input_tokens: 20,
        output_tokens: 3,
      }
export interface UsageCase {
  id: string
  engine: string
  events: unknown[]
  expected: Tokens
  runner?: { expected: Tokens; eventIndexes: number[] }
}
export const cases: UsageCase[] = []
const plain = { freshIn: 5, cachedIn: 20, out: 3, reasoning: 'not measured' } as const
for (const engine of ['claude', 'pi']) {
  const field = engine === 'pi' ? 'cacheWrite' : 'cache_creation_input_tokens'
  for (const [name, write, expected] of [
    ['positive', 100, { ...plain, freshIn: 105 }],
    ['zero', 0, plain],
    ['absent', undefined, plain],
    ['negative', -1, 'not measured'],
    ['fractional', 0.5, 'not measured'],
    ['string', '100', 'not measured'],
    ['null', null, 'not measured'],
    ['unsafe', Number.MAX_SAFE_INTEGER + 1, 'not measured'],
  ] as const) {
    cases.push({
      id: `r0-2-${engine}-write-${name}`,
      engine,
      events: [usageEvent(engine, { ...baseUsage(engine), [field]: write })],
      expected,
    })
  }
  cases.push({ id: `r0-2-${engine}-no-usage`, engine, events: [{}], expected: 'not measured' })
  const required =
    engine === 'pi'
      ? ['input', 'cacheRead', 'output']
      : ['input_tokens', 'cache_read_input_tokens', 'output_tokens']
  for (const missing of required) {
    cases.push({
      id: `r0-2-${engine}-missing-${missing}`,
      engine,
      events: [usageEvent(engine, { ...baseUsage(engine), [missing]: undefined })],
      expected: 'not measured',
    })
  }
}
for (const [name, reasoning, expected] of [
  ['positive', 4, 4],
  ['zero', 0, 0],
  ['absent', undefined, 'not measured'],
  ['negative', -1, 'not measured'],
  ['fractional', 0.5, 'not measured'],
  ['string', '4', 'not measured'],
  ['null', null, 'not measured'],
  ['unsafe', Number.MAX_SAFE_INTEGER + 1, 'not measured'],
] as const) {
  cases.push({
    id: `r0-2-pi-reasoning-${name}`,
    engine: 'pi',
    events: [usageEvent('pi', { ...baseUsage('pi'), output: 7, reasoning })],
    expected: { ...plain, out: 7, reasoning: expected },
  })
}
for (const [name, first, second, expected] of [
  ['measured', 4, 2, 6],
  ['zero', 0, 0, 0],
  ['missing-first', undefined, 4, 'not measured'],
  ['missing-second', 4, undefined, 'not measured'],
] as const) {
  cases.push({
    id: `r0-2-pi-sum-${name}`,
    engine: 'pi',
    events: [first, second].map(reasoning =>
      usageEvent('pi', { ...baseUsage('pi'), cacheWrite: 100, output: 7, reasoning }),
    ),
    expected: { freshIn: 210, cachedIn: 40, out: 14, reasoning: expected },
  })
}
cases.push(
  {
    id: 'r0-2-claude-replacement',
    engine: 'claude',
    events: [
      usageEvent('claude', { ...baseUsage('claude'), cache_creation_input_tokens: 100 }),
      usageEvent('claude', baseUsage('claude')),
    ],
    expected: plain,
    // The reader returns at the first result; only the direct observer sees replacement.
    runner: { expected: { ...plain, freshIn: 105 }, eventIndexes: [0] },
  },
  {
    id: 'r0-2-pi-user',
    engine: 'pi',
    events: [{ type: 'message_end', message: { role: 'user', usage: baseUsage('pi') } }],
    expected: 'not measured',
  },
  {
    id: 'r0-2-pi-update',
    engine: 'pi',
    events: [{ type: 'message_update', message: { role: 'assistant', usage: baseUsage('pi') } }],
    expected: 'not measured',
  },
  {
    id: 'r0-2-codex-inclusive',
    engine: 'codex',
    events: [
      usageEvent('codex', {
        input_tokens: 125,
        cached_input_tokens: 20,
        output_tokens: 7,
        reasoning_output_tokens: 4,
      }),
    ],
    expected: { freshIn: 105, cachedIn: 20, out: 7, reasoning: 4 },
  },
  {
    id: 'r0-2-codex-invalid',
    engine: 'codex',
    events: [usageEvent('codex', { input_tokens: 5, cached_input_tokens: 20, output_tokens: 7 })],
    expected: 'not measured',
  },
  {
    id: 'r0-2-opencode',
    engine: 'opencode',
    events: [usageEvent('claude', baseUsage('claude'))],
    expected: 'not measured',
  },
)

// The retention split is already part of cacheWrite, never additional consumption.
cases.push({
  id: 'r0-2-pi-retention-subset',
  engine: 'pi',
  events: [usageEvent('pi', { ...baseUsage('pi'), cacheWrite: 100, cacheWrite1h: 60 })],
  expected: { ...plain, freshIn: 105 },
})
for (const engine of ['claude', 'pi']) {
  const fresh = engine === 'pi' ? 'input' : 'input_tokens'
  const write = engine === 'pi' ? 'cacheWrite' : 'cache_creation_input_tokens'
  cases.push({
    id: `r0-2-${engine}-invalid-after-valid`,
    engine,
    events: [
      usageEvent(engine, baseUsage(engine)),
      usageEvent(engine, { ...baseUsage(engine), [fresh]: 8, [write]: -1 }),
    ],
    expected: plain,
    // Claude's second result is unreachable in the reader; retention is observer-only.
    ...(engine === 'claude' && { runner: { expected: plain, eventIndexes: [0] } }),
  })
  const zero = Object.fromEntries(Object.keys(baseUsage(engine)).map(field => [field, 0]))
  cases.push({
    id: `r0-2-${engine}-all-zero`,
    engine,
    events: [usageEvent(engine, zero)],
    expected: { freshIn: 0, cachedIn: 0, out: 0, reasoning: 'not measured' },
  })
}

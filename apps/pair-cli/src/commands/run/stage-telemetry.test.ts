import { afterEach, beforeAll, expect, it } from 'vitest'
import { execFileSync } from 'child_process'
import { mkdtempSync, rmSync } from 'fs'
import { tmpdir } from 'os'
import { join, resolve } from 'path'
import {
  type EngineObservation,
  appendTelemetry,
  observeEngineEvent,
  readTelemetry,
} from './telemetry'
import { ENGINES } from './engines'
import { runStage } from './stage-runner'
import { readIterationOutcome } from './stream-reader'
import { driveSessionStream } from './__fixtures__/session-telemetry-driver'

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

// #645 r0-8 / AC-1: emitted identity is the oracle, never inferred from usage or event ids.
const sessionId = '12345678-1234-4234-8234-123456789abc'
let header: Record<string, unknown>
let usage: Record<string, unknown>
const tokens = { freshIn: 4, cachedIn: 7, out: 2, reasoning: 'not measured' } as const
const roots: string[] = []
beforeAll(() => {
  const output = execFileSync(
    process.execPath,
    [join(__dirname, '__fixtures__/pi-session-header.mjs')],
    {
      cwd: resolve(__dirname, '../../../../..'),
      encoding: 'utf8',
      timeout: 10000,
    },
  )
  const events = output
    .trim()
    .split('\n')
    .map(line => JSON.parse(line))
  ;[header, usage] = events
  expect(usage).toMatchObject({
    type: 'message_end',
    message: { role: 'assistant', usage: { input: 4, cacheRead: 7, output: 2 } },
  })
  expect(header).toMatchObject({ type: 'session', id: sessionId })
})
afterEach(() => roots.splice(0).forEach(root => rmSync(root, { recursive: true, force: true })))

const piStage = (events: readonly unknown[]) =>
  runStage({
    engine: ENGINES.pi,
    packet: { step: 'implement', phase: 'a0', worktree: '/fixture', prompt: 'probe' },
    autonomyArgs: [],
    runIteration: input =>
      readIterationOutcome(
        (async function* () {
          for (const event of events) yield JSON.stringify(event)
        })(),
        input.engine,
        input.onEvent,
      ),
  })

// r0-8-session-state-cross-product: identity absent/different/same x usage absent/measured.
it.each([
  ['empty', {}],
  ['tokens-only', { tokens }],
  ['identity-only', { sessionId: 'prior' }],
  ['identity-and-tokens', { sessionId: 'prior', tokens }],
  ['same-identity', { sessionId }],
  ['same-identity-and-tokens', { sessionId, tokens }],
] as const)(
  'r0-8-observer: header over %s preserves usage through replay and accumulation',
  (_name, prior) => {
    const previous = prior as EngineObservation
    const accepted = observeEngineEvent(previous, 'pi', header)
    expect(accepted).toEqual({ sessionId, tokens: previous.tokens ?? 'not measured' })
    const replayed = observeEngineEvent(accepted, 'pi', header)
    expect(replayed).toEqual(accepted)
    const measured = observeEngineEvent(replayed, 'pi', usage)
    const expected = previous.tokens
      ? { freshIn: 8, cachedIn: 14, out: 4, reasoning: 'not measured' }
      : tokens
    expect(measured).toEqual({ sessionId, tokens: expected })
    expect(observeEngineEvent(measured, 'pi', { type: 'message_end', id: 'unrelated' })).toEqual(
      measured,
    )
  },
)

it.each([
  ['success', 'empty'],
  ['failed', 'empty'],
  ['success', 'prior'],
  ['failed', 'prior'],
] as const)(
  'r0-8-stage-%s-%s: producer header and measured usage survive production driver serialization',
  async (outcome, state) => {
    const events = [header, usage, { type: 'message_end', id: 'unrelated' }]
    if (state === 'prior') events.unshift({ sessionId: 'prior' }, usage)
    if (outcome === 'success') events.push({ type: 'agent_settled' })
    const root = mkdtempSync(join(tmpdir(), 'pair-session-645-'))
    roots.push(root)
    await driveSessionStream(root, 'pi', events)
    const saved = readTelemetry(root, 'session-probe', '645').filter(r => r.kind === 'stage')
    expect(saved).toHaveLength(1)
    expect(saved[0]).toMatchObject({
      sessionId,
      tokens:
        state === 'prior'
          ? { freshIn: 8, cachedIn: 14, out: 4, reasoning: 'not measured' }
          : tokens,
      engine: 'pi',
      outcomeClass: outcome === 'success' ? 'ok' : 'failed',
      durationMs: 10,
    })
    appendTelemetry(root, saved[0]!)
    expect(
      readTelemetry(root, 'session-probe', '645').filter(r => r.kind === 'stage'),
    ).toHaveLength(1)
  },
)

it.each([
  ['unrelated', { type: 'message_end', id: 'unrelated' }],
  ['missing', { type: 'session' }],
  ['null', { type: 'session', id: null }],
  ['numeric', { type: 'session', id: 123 }],
  ['array', []],
  ['null-event', null],
])('r0-8-control-invalid-%s: invalid event preserves prior session', async (_name, event) => {
  const result = await piStage([{ sessionId: 'prior' }, event])
  expect(result.telemetry?.sessionId).toBe('prior')
})

it('r0-8-control-unrelated: an event id alone cannot establish a Pi session', async () => {
  const result = await piStage([{ type: 'message_end', id: 'unrelated' }])
  expect(result.telemetry?.sessionId).toBeUndefined()
})

it('r0-8-control-empty: no events means no measured observation', async () => {
  const result = await piStage([])
  expect(result.telemetry).toBeUndefined()
})

it.each([
  ['codex', { type: 'thread.started', thread_id: 'codex-thread' }, 'codex-thread'],
  ['claude', { type: 'system', session_id: 'claude-session' }, 'claude-session'],
] as const)(
  'r0-8-control-engine-%s: Pi header cannot replace another engine identity',
  (engine, event, expected) => {
    const prior = observeEngineEvent({}, engine, event)
    expect(observeEngineEvent(prior, engine, header).sessionId).toBe(expected)
  },
)

it('r0-8-control-engine-opencode: Pi id does not create an OpenCode session', () => {
  expect(observeEngineEvent({}, 'opencode', header).sessionId).toBeUndefined()
})

// r0-8-driver-wiring: every other engine crosses the shared production wiring boundary.
it.each([
  ['codex', { type: 'thread.started', thread_id: 'codex-thread' }, 'codex-thread'],
  ['claude', { type: 'system', session_id: 'claude-session' }, 'claude-session'],
  ['opencode', {}, 'not measured'],
] as const)(
  'r0-8-driver-control-%s: Pi header cannot replace another engine identity',
  async (engine, event, expected) => {
    const root = mkdtempSync(join(tmpdir(), 'pair-session-645-'))
    roots.push(root)
    await driveSessionStream(root, engine, [event, header, usage])
    const saved = readTelemetry(root, 'session-probe', '645').filter(r => r.kind === 'stage')
    expect(saved).toHaveLength(1)
    expect(saved[0]).toMatchObject({
      engine,
      sessionId: expected,
      tokens: 'not measured',
      outcomeClass: 'failed',
    })
  },
)

import { afterEach, expect, it } from 'vitest'
import { mkdtempSync, readFileSync, rmSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { appendTelemetry, observeEngineEvent, stageTelemetryRecord } from './telemetry'

const dirs: string[] = []
afterEach(() => dirs.splice(0).forEach(dir => rmSync(dir, { recursive: true, force: true })))

it('AC-1: preserves codex session, model and measured token fields', () => {
  let observed = observeEngineEvent({}, 'codex', { type: 'thread.started', thread_id: 'thread-1' })
  observed = observeEngineEvent(observed, 'codex', {
    type: 'turn.completed',
    usage: {
      input_tokens: 100,
      cached_input_tokens: 30,
      output_tokens: 12,
      reasoning_output_tokens: 4,
    },
  })
  expect(observed).toEqual({
    sessionId: 'thread-1',
    tokens: { freshIn: 70, cachedIn: 30, out: 12, reasoning: 4 },
  })
})

it('AC-1: unknown usage remains not measured for claude and pi', () => {
  expect(observeEngineEvent({}, 'claude', { type: 'system', session_id: 'claude-1' })).toEqual({
    sessionId: 'claude-1',
    tokens: 'not measured',
  })
  expect(observeEngineEvent({}, 'pi', { sessionId: 'pi-1' })).toEqual({
    sessionId: 'pi-1',
    tokens: 'not measured',
  })
})

it('AC-1: uses claude aggregate usage and sums pi assistant messages', () => {
  expect(
    observeEngineEvent({}, 'claude', {
      type: 'result',
      usage: {
        input_tokens: 5,
        cache_read_input_tokens: 20,
        output_tokens: 3,
      },
    }).tokens,
  ).toEqual({ freshIn: 5, cachedIn: 20, out: 3, reasoning: 'not measured' })
  const first = observeEngineEvent({}, 'pi', {
    type: 'message_end',
    message: {
      role: 'assistant',
      usage: { input: 4, cacheRead: 7, output: 2 },
    },
  })
  expect(
    observeEngineEvent(first, 'pi', {
      type: 'message_end',
      message: {
        role: 'assistant',
        usage: { input: 3, cacheRead: 1, output: 5 },
      },
    }).tokens,
  ).toEqual({ freshIn: 7, cachedIn: 8, out: 7, reasoning: 'not measured' })
})

it('AC-1: a successful reviewed stage is ok', () => {
  const record = stageTelemetryRecord({
    id: 'r:641:verify',
    card: '641',
    step: 'verify',
    start: 0,
    end: 1,
    previousEnd: 0,
    engine: 'codex',
    processOutcome: 'success',
    finalStatus: 'reviewed',
    retries: 0,
    observation: {},
  })
  expect(record['outcomeClass']).toBe('ok')
})

it('AC-1/2: writes each stage and terminal card once, keeping interventions and failure cause', () => {
  const root = mkdtempSync(join(tmpdir(), 'pair-telemetry-'))
  dirs.push(root)
  const stage = {
    kind: 'stage' as const,
    id: 'run-1:641:implement:a0:1',
    card: '641',
    start: 10,
    end: 20,
  }
  const card = {
    kind: 'card' as const,
    id: 'run-1:641',
    card: '641',
    outcome: 'failed',
    cause: 'gate-red',
    interventions: [{ kind: 'reset', who: 'maintainer', reason: 'policy' }],
  }
  appendTelemetry(root, stage)
  appendTelemetry(root, stage)
  appendTelemetry(root, card)
  appendTelemetry(root, card)
  const records = readFileSync(join(root, '.pair/working/telemetry/records.jsonl'), 'utf8')
    .trim()
    .split('\n')
    .map(line => JSON.parse(line))
  expect(records).toEqual([stage, card])
})

it('AC-1: a stage record carries timing, engine, model, outcome, retries and overhead', () => {
  expect(
    stageTelemetryRecord({
      id: 'r:641:implement:a0:1',
      card: '641',
      step: 'implement',
      phase: 'a0',
      start: 100,
      end: 130,
      previousEnd: 90,
      engine: 'codex',
      model: 'model-a',
      processOutcome: 'success',
      finalStatus: 'ok',
      retries: 1,
      observation: { sessionId: 'thread-1', tokens: 'not measured' },
    }),
  ).toEqual({
    kind: 'stage',
    id: 'r:641:implement:a0:1',
    card: '641',
    step: 'implement',
    phase: 'a0',
    start: 100,
    end: 130,
    durationMs: 30,
    driverOverheadMs: 10,
    engine: 'codex',
    model: 'model-a',
    sessionId: 'thread-1',
    tokens: 'not measured',
    outcomeClass: 'ok',
    retries: 1,
  })
})

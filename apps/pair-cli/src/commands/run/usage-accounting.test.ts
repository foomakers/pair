import { afterEach, beforeAll, expect, it } from 'vitest'
import { execFileSync } from 'child_process'
import { mkdtempSync, rmSync } from 'fs'
import { tmpdir } from 'os'
import { join, resolve } from 'path'
import {
  appendTelemetry,
  cardTelemetryRecord,
  observeEngineEvent,
  readTelemetry,
  stageTelemetryRecord,
  type EngineObservation,
} from './telemetry'
import { readTelemetryRecords, renderTelemetryReport, summarizeTelemetry } from './telemetry-report'
import { ENGINES, type EngineId } from './engines'
import { runStage } from './stage-runner'
import { readIterationOutcome } from './stream-reader'
import { driveSessionStream } from './__fixtures__/session-telemetry-driver'
import { cases, baseUsage, usageEvent } from './__fixtures__/usage-cases'

// #645 r0-2 / AC-1, AC-3. Expectations calculated from producer accounting before execution.
it.each(cases.map(row => [row.id, row] as const))(
  '%s',
  async (_id, { engine, events, expected, runner }) => {
    const observation = events.reduce<EngineObservation>(
      (prior, event) => observeEngineEvent(prior, engine, event),
      {},
    )
    expect.soft(observation.tokens).toEqual(expected)
    const received: unknown[] = []
    const result = await runStage({
      engine: ENGINES[engine as EngineId],
      packet: { step: 'implement', phase: 'a0', worktree: '/fixture', prompt: 'probe' },
      autonomyArgs: [],
      onEvent: event => received.push(event),
      runIteration: input =>
        readIterationOutcome(
          (async function* () {
            for (const event of events) yield JSON.stringify(event)
          })(),
          input.engine,
          input.onEvent,
        ),
    })
    if (runner) expect(received).toEqual(runner.eventIndexes.map(index => events[index]))
    expect(result.telemetry?.tokens).toEqual(runner?.expected ?? expected)
  },
)

let piEvent: unknown
beforeAll(() => {
  const lines = execFileSync(
    process.execPath,
    [join(__dirname, '__fixtures__/usage-authority.mjs')],
    { cwd: resolve(__dirname, '../../../../..'), encoding: 'utf8', timeout: 10000 },
  )
    .trim()
    .split('\n')
    .map(line => JSON.parse(line))
  expect(lines[0].usage).toMatchObject({
    inputTokens: 5,
    cacheWriteTokens: 100,
    cacheReadTokens: 20,
    outputTokens: 3,
    totalTokens: 128,
    accounting: 'anthropic-exclusive-input',
  })
  piEvent = lines.find(event => event.type === 'message_end')
  expect(piEvent).toMatchObject({
    message: {
      usage: {
        input: 5,
        cacheWrite: 100,
        cacheRead: 20,
        output: 7,
        reasoning: 4,
        totalTokens: 132,
      },
    },
  })
})
const roots: string[] = []
afterEach(() => roots.splice(0).forEach(root => rmSync(root, { recursive: true, force: true })))

function successfulStage(engine: string) {
  return stageTelemetryRecord({
    id: 'success',
    run: 'session-probe',
    card: '645',
    step: 'implement',
    start: 0,
    end: 1,
    previousEnd: 0,
    engine,
    processOutcome: 'success',
    finalStatus: 'ok',
    retries: 0,
    observation: observeEngineEvent(
      {},
      engine,
      usageEvent(engine, {
        ...baseUsage(engine),
        ...(engine === 'pi' ? { output: 7 } : { output_tokens: 7 }),
      }),
    ),
  })
}

it.each([
  ['claude', 128, 0.8, 'not measured'],
  ['pi', 132, 33 / 41, 4],
] as const)(
  'r0-2-pipeline-%s',
  async (engine, total, share, reasoning) => {
    const root = mkdtempSync(join(tmpdir(), 'pair-usage-645-'))
    roots.push(root)
    const event =
      engine === 'pi'
        ? piEvent
        : usageEvent('claude', { ...baseUsage('claude'), cache_creation_input_tokens: 100 })
    await driveSessionStream(root, engine, [event])
    const saved = readTelemetry(root, 'session-probe', '645')
    expect(saved).toHaveLength(1)
    expect
      .soft(saved[0])
      .toMatchObject({ tokens: { freshIn: 105, cachedIn: 20, out: total - 125, reasoning } })
    const success = successfulStage(engine)
    appendTelemetry(root, success)
    const card = cardTelemetryRecord({
      id: 'terminal',
      card: '645',
      run: 'session-probe',
      pairVersion: '0.5.2',
      workflowVersion: '4.0.1',
      profile: 'fixture',
      engine,
      outcome: 'done',
      start: 0,
      end: 100,
      stages: [...saved, success],
      interventions: [],
    })
    expect.soft(card['tokens']).toMatchObject({ freshIn: 110, cachedIn: 40, out: total - 118 })
    appendTelemetry(root, card)
    const summary = summarizeTelemetry(readTelemetryRecords(root))
    expect.soft(summary[engine]?.wastedTokenShare).toEqual({ mean: share, median: share, sd: 0 })
    const line = `wastedTokenShare: mean ${share.toFixed(2)}, median ${share.toFixed(2)}, sd 0.00`
    expect.soft(renderTelemetryReport(summary)).toContain(line)
    const cli = execFileSync(
      process.execPath,
      ['-r', 'ts-node/register/transpile-only', join(__dirname, 'telemetry-report.ts'), root],
      { cwd: resolve(__dirname, '../../..'), encoding: 'utf8', timeout: 10000 },
    )
    expect.soft(cli).toContain(line)
  },
  15000,
)

it.each([
  ['claude', 'missing'],
  ['pi', 'missing'],
  ['claude', 'zero'],
  ['pi', 'zero'],
] as const)(
  'r0-2-pipeline-control-%s-%s',
  async (engine, kind) => {
    const root = mkdtempSync(join(tmpdir(), 'pair-usage-control-'))
    roots.push(root)
    const zero = Object.fromEntries(Object.keys(baseUsage(engine)).map(field => [field, 0]))
    await driveSessionStream(root, engine, [kind === 'missing' ? {} : usageEvent(engine, zero)])
    const records = readTelemetryRecords(root)
    const stage = records.find(record => record.kind === 'stage')
    expect(stage?.['tokens']).toEqual(
      kind === 'missing'
        ? 'not measured'
        : { freshIn: 0, cachedIn: 0, out: 0, reasoning: 'not measured' },
    )
    expect(records.find(record => record.kind === 'card')?.['tokens']).toEqual(
      kind === 'missing' ? 'not measured' : { freshIn: 0, cachedIn: 0, out: 0 },
    )
    expect(summarizeTelemetry(records)[engine]?.wastedTokenShare).toBe('not measured')
  },
  15000,
)

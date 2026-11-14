import { expect, it } from 'vitest'
import { summarizeTelemetry, renderTelemetryReport } from './telemetry-report'
import type { TelemetryRecord } from './telemetry'

const card = (id: string, rounds: number, wallMs: number): TelemetryRecord => ({
  kind: 'card',
  id,
  card: id,
  run: id,
  engine: 'codex',
  rounds,
  wallMs,
  activeMs: wallMs / 2,
  idleMs: wallMs / 2,
})
const stage = (id: string, outcomeClass: string, freshIn: number): TelemetryRecord => ({
  kind: 'stage',
  id,
  card: id,
  engine: 'codex',
  step: 'verify',
  durationMs: 10,
  outcomeClass,
  tokens: { freshIn, cachedIn: 0, out: 0, reasoning: 0 },
})

it('AC-3: empty and unmeasured cohorts are explicit', () => {
  expect(renderTelemetryReport(summarizeTelemetry([]))).toContain('not measured')
  const report = summarizeTelemetry([
    card('a', 1, 100),
    {
      kind: 'stage',
      id: 'a:s',
      card: 'a',
      engine: 'codex',
      step: 'verify',
      durationMs: 10,
      outcomeClass: 'ok',
      tokens: 'not measured',
    },
  ])
  expect(report['codex']?.wastedTokenShare).toBe('not measured')
})

it('AC-3: one and many cards report mean, median and population deviation by engine', () => {
  const records = [
    card('a', 1, 100),
    card('b', 2, 200),
    card('c', 3, 300),
    stage('a:s', 'ok', 10),
    stage('b:s', 'rejected', 10),
    stage('c:s', 'ok', 20),
  ]
  const report = summarizeTelemetry(records)
  expect(report['codex']?.rounds).toEqual({ mean: 2, median: 2, sd: Math.sqrt(2 / 3) })
  expect(report['codex']?.wallMs).toEqual({ mean: 200, median: 200, sd: Math.sqrt(20000 / 3) })
  expect(report['codex']?.wastedTokenShare).toBe(0.25)
  expect(report['codex']?.stages['verify']).toEqual({ mean: 10, median: 10, sd: 0 })
  expect(summarizeTelemetry([card('a', 1, 100)])['codex']?.rounds).toEqual({
    mean: 1,
    median: 1,
    sd: 0,
  })
})

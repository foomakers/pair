import { expect, it } from 'vitest'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { summarizeTelemetry, renderTelemetryReport, readTelemetryRecords } from './telemetry-report'
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
  card: id.split(':')[0],
  run: id.split(':')[0],
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
  expect(report['codex']?.wastedTokenShare).toEqual({
    mean: 1 / 3,
    median: 0,
    sd: Math.sqrt(2 / 9),
  })
  expect(report['codex']?.stages['verify']).toEqual({ mean: 10, median: 10, sd: 0 })
  expect(summarizeTelemetry([card('a', 1, 100)])['codex']?.rounds).toEqual({
    mean: 1,
    median: 1,
    sd: 0,
  })
})

it('AC-3: only terminal cards contribute stage time and token waste', () => {
  const summary = summarizeTelemetry([
    { ...card('done', 1, 100), run: 'run-done' },
    { ...stage('done:verify', 'ok', 10), card: 'done', run: 'run-done' },
    { ...stage('pending:verify', 'rejected', 100), card: 'pending', run: 'run-pending' },
  ])
  expect(summary['codex']?.stages['verify']).toEqual({ mean: 10, median: 10, sd: 0 })
  expect(summary['codex']?.wastedTokenShare).toEqual({ mean: 0, median: 0, sd: 0 })
})

it('AC-3: a profile stage using another engine keeps its own timing cohort', () => {
  const summary = summarizeTelemetry([
    card('done', 1, 100),
    { ...stage('done:verify', 'ok', 10), engine: 'claude' },
  ])
  expect(summary['claude']?.rounds).toBe('not measured')
  expect(summary['claude']?.stages['verify']).toEqual({ mean: 10, median: 10, sd: 0 })
  expect(summary['claude']?.wastedTokenShare).toEqual({ mean: 0, median: 0, sd: 0 })
})

it('AC-3: report keeps valid records after an interrupted JSONL write', () => {
  const root = mkdtempSync(join(tmpdir(), 'pair-report-'))
  try {
    const dir = join(root, '.pair/working/telemetry')
    mkdirSync(dir, { recursive: true })
    writeFileSync(
      join(dir, 'records.jsonl'),
      `{bad\nnull\n42\n[]\n${JSON.stringify(card('done', 1, 100))}\n`,
    )
    expect(readTelemetryRecords(root)).toEqual([card('done', 1, 100)])
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

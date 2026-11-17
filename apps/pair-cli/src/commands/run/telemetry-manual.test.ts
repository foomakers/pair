import { afterEach, expect, it } from 'vitest'
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { finalizeManualCard, recordManualStep } from './telemetry-manual'
import { summarizeTelemetry } from './telemetry-report'
import { appendTelemetry, parseTelemetryLine, telemetryFile } from './telemetry'

const dirs: string[] = []
afterEach(() => dirs.splice(0).forEach(d => rmSync(d, { recursive: true, force: true })))
const root = () => {
  const d = mkdtempSync(join(tmpdir(), 'tm-'))
  dirs.push(d)
  return d
}
const lines = (r: string) =>
  readFileSync(telemetryFile(r), 'utf8')
    .split('\n')
    .flatMap(l => parseTelemetryLine(l) ?? [])
const step = (r: string, over = {}) => ({
  root: r,
  enabled: true,
  card: '594',
  pr: 665,
  step: 'implement',
  phase: 'a0',
  engine: 'claude',
  model: 'opus',
  effort: 'high',
  start: Date.parse('2026-11-17T07:50:00Z'),
  end: Date.parse('2026-11-17T08:30:00Z'),
  tokens: { freshIn: 10, cachedIn: 5, out: 2 },
  sessionId: 's1',
  ...over,
})

it('AC-1: appends v2 start/end pair with source manual linked to card and PR', () => {
  const r = root()
  recordManualStep(step(r))
  const [start, end] = lines(r)
  expect(start).toMatchObject({ kind: 'start', schema: 2, source: 'manual', card: '594', pr: 665 })
  expect(end).toMatchObject({
    kind: 'end',
    source: 'manual',
    step: 'implement',
    phase: 'a0',
    engine: 'claude',
    model: 'opus',
    effort: 'high',
    durationMs: 40 * 60_000,
    sessionId: 's1',
    tokens: { freshIn: 10, cachedIn: 5, out: 2 },
  })
})

it('AC-4: telemetry off writes nothing', () => {
  const r = root()
  recordManualStep(step(r, { enabled: false }))
  finalizeManualCard({ root: r, enabled: false, card: '594', outcome: 'review-approved', end: 1 })
  expect(() => readFileSync(telemetryFile(r))).toThrow()
})

it('AC-5: missing tokens and session stay absent, never estimated', () => {
  const r = root()
  recordManualStep(step(r, { tokens: undefined, sessionId: undefined }))
  const end = lines(r)[1]!
  expect('tokens' in end).toBe(false)
  expect('sessionId' in end).toBe(false)
})

it('edge: re-run of the same manual step is deduped', () => {
  const r = root()
  recordManualStep(step(r))
  recordManualStep(step(r))
  expect(lines(r)).toHaveLength(2)
})

it('edge: unwritable telemetry file never throws', () => {
  const r = root()
  mkdirSync(join(r, '.pair/working/telemetry'), { recursive: true })
  chmodSync(join(r, '.pair/working/telemetry'), 0o500)
  expect(() => recordManualStep(step(r))).not.toThrow()
  chmodSync(join(r, '.pair/working/telemetry'), 0o700)
})

const driverEnd = (r: string, start: number, end: number) =>
  appendTelemetry(r, {
    kind: 'end',
    schema: 2,
    id: `story-594:594:implement:a0:end:${start}`,
    ts: new Date(end).toISOString(),
    card: '594',
    run: 'story-594',
    step: 'implement',
    engine: 'codex',
    outcome: 'ok',
    durationMs: end - start,
    tokens: { freshIn: 1, cachedIn: 1, out: 1 },
  })
const T0 = Date.parse('2026-11-17T07:00:00Z')

it('AC-2: mixed card is superseded with true outcome, spend split by source', () => {
  const r = root()
  driverEnd(r, T0, T0 + 600_000)
  appendTelemetry(r, {
    kind: 'card',
    id: 'story-594:594',
    card: '594',
    run: 'story-594',
    outcome: 'failed-contract',
    pairVersion: '1',
    workflowVersion: '4',
    profile: 'codex-medium',
  })
  recordManualStep(step(r, { start: T0 + 1_200_000, end: T0 + 1_800_000 }))
  finalizeManualCard({
    root: r,
    enabled: true,
    card: '594',
    outcome: 'review-approved',
    end: T0 + 2_400_000,
  })
  const card = lines(r).filter(x => x.kind === 'card' && x['outcome'] === 'review-approved')[0]!
  expect(card).toMatchObject({
    run: 'story-594',
    profile: 'codex-medium',
    supersedes: ['story-594:594'],
    wallMs: 2_400_000,
    activeMs: 1_200_000,
    idleMs: 1_200_000,
    bySource: {
      driver: { activeMs: 600_000, wallMs: 600_000, idleMs: 0 },
      manual: { activeMs: 600_000, wallMs: 600_000, idleMs: 0 },
    },
  })
})

it('AC-2/AC-3: card with no driver run is created by the manual path; manual-only', () => {
  const r = root()
  recordManualStep(step(r, { start: T0, end: T0 + 300_000 }))
  finalizeManualCard({ root: r, enabled: true, card: '594', outcome: 'merged', end: T0 + 300_000 })
  const card = lines(r).find(x => x.kind === 'card')!
  expect(card).toMatchObject({
    outcome: 'merged',
    activeMs: 300_000,
    bySource: { manual: { activeMs: 300_000 } },
  })
  expect(card['bySource']).not.toHaveProperty('driver')
})

it('edge: overlap of driver and manual is not double-counted in wall or active', () => {
  const r = root()
  driverEnd(r, T0, T0 + 600_000)
  recordManualStep(step(r, { start: T0 + 300_000, end: T0 + 900_000 }))
  finalizeManualCard({ root: r, enabled: true, card: '594', outcome: 'parked', end: T0 + 900_000 })
  const card = lines(r).find(x => x.kind === 'card')!
  expect(card).toMatchObject({ wallMs: 900_000, activeMs: 900_000, idleMs: 0 })
})

it('AC-6: superseded driver card is not counted twice in the report', () => {
  const base = { kind: 'card', card: '594', run: 'story-594', engine: 'codex', rounds: 1 }
  const records = [
    { ...base, id: 'a', outcome: 'failed-contract', wallMs: 5 },
    { ...base, id: 'b', outcome: 'review-approved', wallMs: 9, supersedes: ['a'] },
  ] as never
  expect(summarizeTelemetry(records)['codex']?.wallMs).toEqual({ mean: 9, median: 9, sd: 0 })
})

it('AC-6: legacy v1 stage and v2 end without source read as driver', () => {
  const r = root()
  writeFileSync(join(r, 'x'), '')
  appendTelemetry(r, {
    kind: 'stage',
    id: 'v1',
    card: '9',
    run: 'story-9',
    step: 'implement',
    start: T0,
    end: T0 + 1000,
    durationMs: 1000,
    engine: 'claude',
  })
  finalizeManualCard({ root: r, enabled: true, card: '9', outcome: 'merged', end: T0 + 1000 })
  const card = lines(r).find(x => x.kind === 'card')!
  expect(card['bySource']).toMatchObject({ driver: { activeMs: 1000 } })
})

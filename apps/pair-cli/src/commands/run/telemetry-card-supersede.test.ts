import { afterEach, expect, it } from 'vitest'
import { mkdtempSync, readFileSync, rmSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { finalizeManualCard, recordManualStep } from './telemetry-manual'
import { summarizeTelemetry } from './telemetry-report'
import { appendTelemetry, parseTelemetryLine, telemetryFile } from './telemetry'

const dirs: string[] = []
afterEach(() => dirs.splice(0).forEach(d => rmSync(d, { recursive: true, force: true })))
const root = () => {
  const d = mkdtempSync(join(tmpdir(), 'tcs-'))
  dirs.push(d)
  return d
}
const records = (r: string) =>
  readFileSync(telemetryFile(r), 'utf8')
    .split('\n')
    .flatMap(l => parseTelemetryLine(l) ?? [])
const live = (r: string, card: string) => {
  const all = records(r)
  const replaced = new Set(
    all.flatMap(x => (Array.isArray(x['supersedes']) ? x['supersedes'] : [])),
  )
  return all.filter(x => x.kind === 'card' && x['card'] === card && !replaced.has(x.id))
}
const T0 = Date.parse('2026-11-17T07:00:00Z')
const step = (r: string, name: string, phase: string, [start, end]: [number, number]) =>
  recordManualStep({
    root: r,
    enabled: true,
    card: '594',
    pr: 665,
    step: name,
    phase,
    engine: 'claude',
    start: T0 + start * 1000,
    end: T0 + end * 1000,
  })
const park = (r: string, end: number) =>
  finalizeManualCard({
    root: r,
    enabled: true,
    card: '594',
    outcome: 'parked',
    end: T0 + end * 1000,
  })

it('r0-2 witness: parked, more manual steps, parked again leaves one live card with the latest spend', () => {
  const r = root()
  step(r, 'implement', 'a0', [0, 60])
  park(r, 60)
  step(r, 'green-fix', 'r1-g1', [120, 300])
  park(r, 300)
  const cards = live(r, '594')
  expect(cards).toHaveLength(1)
  expect(cards[0]).toMatchObject({ activeMs: 240_000, dispatches: 2 })
})

it('r0-2 control: an identical finalize re-run is deduped', () => {
  const r = root()
  step(r, 'implement', 'a0', [0, 60])
  park(r, 60)
  park(r, 60)
  expect(records(r).filter(x => x.kind === 'card')).toHaveLength(1)
})

it('r0-2 control: finalize merged sharing its end with an earlier parked supersedes it', () => {
  const r = root()
  step(r, 'implement', 'a0', [0, 60])
  park(r, 60)
  finalizeManualCard({
    root: r,
    enabled: true,
    card: '594',
    outcome: 'merged',
    end: T0 + 60_000,
  })
  const cards = live(r, '594')
  expect(cards).toHaveLength(1)
  expect(cards[0]).toMatchObject({ outcome: 'merged' })
})

it('r0-3 witness: manual card then driver card for one card is counted once, as the later one', () => {
  const r = root()
  step(r, 'implement', 'a0', [0, 60])
  park(r, 60)
  appendTelemetry(r, {
    kind: 'card',
    id: 'story-594b:594',
    card: '594',
    run: 'story-594b',
    engine: 'claude',
    outcome: 'review-approved',
    wallMs: 99,
  } as never)
  expect(summarizeTelemetry(records(r))['claude']?.wallMs).toEqual({ mean: 99, median: 99, sd: 0 })
})

it('r0-3 control: cards of different card ids are both counted', () => {
  const base = { kind: 'card', run: 'x', engine: 'claude' }
  const all = [
    { ...base, id: 'a', card: '594', wallMs: 10 },
    { ...base, id: 'b', card: '595', wallMs: 20 },
  ] as never
  expect(summarizeTelemetry(all)['claude']?.wallMs).toEqual({ mean: 15, median: 15, sd: 5 })
})

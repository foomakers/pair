import { existsSync, readFileSync } from 'fs'
import { parseTelemetryLine, telemetryFile, type TelemetryRecord } from './telemetry'

type Measure = { mean: number; median: number; sd: number } | 'not measured'

interface EngineSummary {
  rounds: Measure
  wallMs: Measure
  activeMs: Measure
  idleMs: Measure
  stages: Record<string, Measure>
  wastedTokenShare: Measure
}

const number = (value: unknown): number | undefined =>
  typeof value === 'number' && Number.isFinite(value) ? value : undefined

function measure(values: readonly unknown[]): Measure {
  if (values.length === 0 || values.some(value => number(value) === undefined))
    return 'not measured'
  const sorted = (values as number[]).slice().sort((a, b) => a - b)
  const mean = sorted.reduce((sum, value) => sum + value, 0) / sorted.length
  const middle = Math.floor(sorted.length / 2)
  const median = sorted.length % 2 ? sorted[middle]! : (sorted[middle - 1]! + sorted[middle]!) / 2
  const sd = Math.sqrt(sorted.reduce((sum, value) => sum + (value - mean) ** 2, 0) / sorted.length)
  return { mean, median, sd }
}

function tokenCount(stage: TelemetryRecord): number | undefined {
  const tokens = stage['tokens']
  if (typeof tokens !== 'object' || tokens === null) return undefined
  const values = tokens as Record<string, unknown>
  const fresh = number(values['freshIn'])
  const cached = number(values['cachedIn'])
  const out = number(values['out'])
  return fresh === undefined || cached === undefined || out === undefined
    ? undefined
    : fresh + cached + out
}

function wastedShare(stages: readonly TelemetryRecord[]): number | undefined {
  if (stages.length === 0) return undefined
  let wasted = 0
  let total = 0
  for (const stage of stages) {
    const tokens = tokenCount(stage)
    if (tokens === undefined) return undefined
    total += tokens
    if (stage['outcomeClass'] !== 'ok') wasted += tokens
  }
  return total > 0 ? wasted / total : undefined
}

function stageMeasures(stages: readonly TelemetryRecord[]): Record<string, Measure> {
  const names = new Set(
    stages.map(stage => stage['step']).filter((step): step is string => typeof step === 'string'),
  )
  return Object.fromEntries(
    [...names].map(name => [
      name,
      measure(stages.filter(stage => stage['step'] === name).map(stage => stage['durationMs'])),
    ]),
  )
}

/** Population statistics over recorded cards; an incomplete field is never estimated. */
export function summarizeTelemetry(
  records: readonly TelemetryRecord[],
): Record<string, EngineSummary> {
  const engines = new Set(
    records.map(record => record['engine']).filter((id): id is string => typeof id === 'string'),
  )
  const result: Record<string, EngineSummary> = {}
  const terminalCards = records.filter(record => record.kind === 'card')
  for (const engine of engines) {
    const cards = terminalCards.filter(record => record['engine'] === engine)
    const stages = records.filter(
      record =>
        record.kind === 'stage' &&
        record['engine'] === engine &&
        terminalCards.some(
          card => card['card'] === record['card'] && card['run'] === record['run'],
        ),
    )
    if (cards.length === 0 && stages.length === 0) continue
    const stageCards = terminalCards.filter(card =>
      stages.some(stage => stage['card'] === card['card'] && stage['run'] === card['run']),
    )
    const wasteShares = stageCards.map(card =>
      wastedShare(
        stages.filter(stage => stage['card'] === card['card'] && stage['run'] === card['run']),
      ),
    )
    result[engine] = {
      rounds: measure(cards.map(card => card['rounds'])),
      wallMs: measure(cards.map(card => card['wallMs'])),
      activeMs: measure(cards.map(card => card['activeMs'])),
      idleMs: measure(cards.map(card => card['idleMs'])),
      stages: stageMeasures(stages),
      wastedTokenShare: measure(wasteShares),
    }
  }
  return result
}

const fmt = (value: Measure | number | 'not measured'): string =>
  typeof value === 'object'
    ? `mean ${value.mean.toFixed(2)}, median ${value.median.toFixed(2)}, sd ${value.sd.toFixed(2)}`
    : typeof value === 'number'
      ? value.toFixed(4)
      : value

export function renderTelemetryReport(summary: Record<string, EngineSummary>): string {
  if (Object.keys(summary).length === 0) return 'No cards: not measured'
  return Object.entries(summary)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([engine, values]) =>
      [
        engine,
        `  rounds: ${fmt(values.rounds)}`,
        `  wallMs: ${fmt(values.wallMs)}`,
        `  activeMs: ${fmt(values.activeMs)}`,
        `  idleMs: ${fmt(values.idleMs)}`,
        ...Object.entries(values.stages)
          .sort(([a], [b]) => a.localeCompare(b))
          .map(([stage, time]) => `  ${stage}Ms: ${fmt(time)}`),
        `  wastedTokenShare: ${fmt(values.wastedTokenShare)}`,
      ].join('\n'),
    )
    .join('\n')
}

export function readTelemetryRecords(root: string): TelemetryRecord[] {
  const file = telemetryFile(root)
  if (!existsSync(file)) return []
  try {
    return readFileSync(file, 'utf8')
      .split('\n')
      .flatMap(line => parseTelemetryLine(line) ?? [])
  } catch {
    return []
  }
}

if (require.main === module) {
  process.stdout.write(
    `${renderTelemetryReport(summarizeTelemetry(readTelemetryRecords(process.argv[2] ?? process.cwd())))}\n`,
  )
}

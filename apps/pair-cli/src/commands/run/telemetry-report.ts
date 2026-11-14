import { existsSync, readFileSync } from 'fs'
import { join } from 'path'
import { parseTelemetryLine, type TelemetryRecord } from './telemetry'

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
    const names = new Set(
      stages.map(stage => stage['step']).filter((step): step is string => typeof step === 'string'),
    )
    const stageMeasures = Object.fromEntries(
      [...names].map(name => [
        name,
        measure(stages.filter(stage => stage['step'] === name).map(stage => stage['durationMs'])),
      ]),
    )
    const stageCards = terminalCards.filter(card =>
      stages.some(stage => stage['card'] === card['card'] && stage['run'] === card['run']),
    )
    const wasteShares = stageCards.map(card => {
      let wasted = 0
      let total = 0
      const cardStages = stages.filter(
        stage => stage['card'] === card['card'] && stage['run'] === card['run'],
      )
      if (cardStages.length === 0) return undefined
      for (const stage of cardStages) {
        const raw = stage['tokens']
        const tokens =
          typeof raw === 'object' && raw !== null ? (raw as Record<string, unknown>) : undefined
        const fresh = number(tokens?.['freshIn'])
        const cached = number(tokens?.['cachedIn'])
        const output = number(tokens?.['out'])
        if (fresh === undefined || cached === undefined || output === undefined) return undefined
        const count = fresh + cached + output
        total += count
        if (stage['outcomeClass'] !== 'ok') wasted += count
      }
      return total > 0 ? wasted / total : undefined
    })
    result[engine] = {
      rounds: measure(cards.map(card => card['rounds'])),
      wallMs: measure(cards.map(card => card['wallMs'])),
      activeMs: measure(cards.map(card => card['activeMs'])),
      idleMs: measure(cards.map(card => card['idleMs'])),
      stages: stageMeasures,
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
  const file = join(root, '.pair', 'working', 'telemetry', 'records.jsonl')
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

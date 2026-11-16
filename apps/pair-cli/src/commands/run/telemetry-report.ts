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
    if (stage['step'] === 'merge') continue // deterministic: no engine usage to waste
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
    // v2 cards carry no top-level engine: a card belongs to every engine that ran one of its stages.
    const cards = terminalCards.filter(
      record =>
        record['engine'] === engine ||
        (Array.isArray(record['stageRecords']) &&
          record['stageRecords'].some(stage => (stage as { engine?: unknown }).engine === engine)),
    )
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

export const VIEWS = ['run', 'runner', 'model', 'step', 'epic', 'engine'] as const
export type View = (typeof VIEWS)[number]

interface Group {
  stages: number
  inProgress: number
  interrupted: number
  lost: number
  durationMs: number
  tokens: number | 'not measured'
  cost: number | 'not measured'
}

const FIELD: Record<Exclude<View, 'engine'> | 'card', string> = {
  card: 'card',
  run: 'run',
  runner: 'engine',
  model: 'model',
  step: 'step',
  epic: 'epic',
}

/** v1 `stage` and v2 `end` are both ended stages (an `end` supersedes the `stage` of its dispatch); a `start` with no `end` is in progress. */
function stageRows(records: readonly TelemetryRecord[]): Array<TelemetryRecord & { open?: true }> {
  const ended = new Set(records.filter(r => r.kind === 'end').map(r => r['startId']))
  const superseded = new Set(records.filter(r => r.kind === 'end').map(r => r['legacyId']))
  const epics = new Map(records.filter(r => r['epic'] != null).map(r => [r['card'], r['epic']]))
  return records.flatMap(r => {
    const epic = r['epic'] ?? epics.get(r['card'])
    if (r.kind === 'end' || (r.kind === 'stage' && !superseded.has(r.id))) return [{ ...r, epic }]
    return r.kind === 'start' && !ended.has(r.id) ? [{ ...r, epic, open: true as const }] : []
  })
}

const newGroup = (): Group => ({
  stages: 0,
  inProgress: 0,
  interrupted: 0,
  lost: 0,
  durationMs: 0,
  tokens: 0,
  cost: 0,
})

interface Sums {
  tokens: number[]
  cost: number[]
  unmeasured: [boolean, boolean]
}

function addRow(group: Group, sum: Sums, row: TelemetryRecord & { open?: true }): void {
  group.stages++
  if (row.open) {
    group.inProgress++
    sum.unmeasured = [true, true]
    return
  }
  if (row['cause'] === 'lost') group.lost++
  if (row['cause'] === 'interrupted') group.interrupted++
  group.durationMs += number(row['durationMs']) ?? 0
  const tokens = tokenCount(row)
  const cost = number(row['cost'])
  if (tokens === undefined) sum.unmeasured[0] = true
  else sum.tokens.push(tokens)
  if (cost === undefined) sum.unmeasured[1] = true
  else sum.cost.push(cost)
}

/** Per-card by default; `--by run|runner|model|step|epic` regroup the SAME records. Unmeasured stays `not measured`. */
export function groupTelemetry(
  records: readonly TelemetryRecord[],
  by: Exclude<View, 'engine'> | 'card' = 'card',
): Record<string, Group> {
  const groups: Record<string, Group> = {}
  const sums: Record<string, Sums> = {}
  for (const row of stageRows(records)) {
    const key = String(row[FIELD[by]] ?? 'none')
    const group = (groups[key] ??= newGroup())
    const sum = (sums[key] ??= { tokens: [], cost: [], unmeasured: [false, false] })
    addRow(group, sum, row)
  }
  const total = (values: number[]) => values.reduce((a, b) => a + b, 0)
  for (const [key, group] of Object.entries(groups)) {
    const sum = sums[key]!
    group.tokens = sum.unmeasured[0] ? 'not measured' : total(sum.tokens)
    group.cost = sum.unmeasured[1] ? 'not measured' : total(sum.cost)
  }
  return groups
}

export function renderGroups(groups: Record<string, Group>): string {
  if (Object.keys(groups).length === 0) return 'No stages: not measured'
  return Object.entries(groups)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(
      ([key, g]) =>
        `${key}\n  stages: ${g.stages} (in progress ${g.inProgress}, interrupted ${g.interrupted}, lost ${g.lost})` +
        `\n  durationMs: ${g.durationMs}\n  tokens: ${g.tokens}\n  cost: ${g.cost}`,
    )
    .join('\n')
}

const engineView = (records: readonly TelemetryRecord[]) =>
  renderTelemetryReport(summarizeTelemetry([...records]))

/**
 * Default: per card (stage-level, incl. in-progress/interrupted/lost), then the legacy per-engine cohorts
 * (existing readers keep their lines). `--by engine` is the cohorts alone; every other view is stage-level.
 */
export function renderView(records: readonly TelemetryRecord[], by?: View): string {
  if (by === 'engine') return engineView(records)
  const groups = renderGroups(groupTelemetry(records, by))
  return by === undefined ? `${groups}\n${engineView(records)}` : groups
}

if (require.main === module) {
  const args = process.argv.slice(2)
  const at = args.indexOf('--by')
  const by = at < 0 ? undefined : (args[at + 1] as View | undefined) ?? ''
  if (by !== undefined && !VIEWS.includes(by as View)) {
    process.stderr.write(`--by: expected one of ${VIEWS.join(', ')}\n`)
    process.exit(1)
  }
  const root =
    args.find((a, i) => !a.startsWith('--') && i !== (at < 0 ? -1 : at + 1)) ?? process.cwd()
  process.stdout.write(`${renderView(readTelemetryRecords(root), by as View | undefined)}\n`)
}

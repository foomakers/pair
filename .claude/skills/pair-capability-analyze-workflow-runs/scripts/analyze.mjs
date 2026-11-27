#!/usr/bin/env node
// analyze.mjs — the numbers of pair-capability-analyze-workflow-runs (#697). Same files, same numbers.
// Usage: node analyze.mjs <cost|time|passes|compare|trend> [--runs <dir>] [--run <id>] [--card <id>]
//          [--workflow <name>] [--prices <file.json>] [--by card|workflow]
// Reads `<runs>/*/telemetry.jsonl` (default `.pair/working/runs`), migrating legacy step statuses. JSON on stdout.
// Exit: 0 answered · 2 usage or unreadable input (the cause on stderr, no numbers).
// Rules: every number carries its `source` (measured | estimated | unknown); a sum with an estimated
// entry is an estimate; unknown entries are listed, never counted as zero; values of different
// sources are never compared; cost is never invented — no price row, "not calculated".
// Prices: `{ "<model>": { "read": n, "cached": n, "written": n } }`, per million tokens, kept by hand.
// Dependency-free.
import { randomUUID } from 'node:crypto'
import { chmodSync, closeSync, existsSync, mkdirSync, openSync, readFileSync, readdirSync, realpathSync, renameSync, rmSync, statSync, unlinkSync, writeFileSync } from 'node:fs'
import { hostname } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const QUESTIONS = ['cost', 'time', 'passes', 'compare', 'trend', 'convergence']
const TOKENS = ['read', 'cached', 'written']
const NOT_CALCULATED = 'not calculated'
/** The record format this script reads (ADR-033). */
const SCHEMAS = [1, 2]

function deadLocalOwner(note) {
  try {
    const { pid, host } = JSON.parse(note)
    if (!Number.isInteger(pid) || pid <= 0 || host !== hostname()) return false
    process.kill(pid, 0)
    return false
  } catch (error) {
    return error.code === 'ESRCH'
  }
}

/** Coordinate with pair run's run-lock.ts before removing a dead owner's lock. */
function reclaimLock(lock, create) {
  const seen = readFileSync(lock, 'utf8')
  if (!deadLocalOwner(seen)) return
  const guard = `${lock}.reclaim`
  try {
    mkdirSync(guard)
  } catch (error) {
    if (error.code !== 'EEXIST' || Date.now() - statSync(guard).mtimeMs < 60_000) throw error
    rmSync(guard, { recursive: true, force: true })
    mkdirSync(guard)
  }
  try {
    if (readFileSync(lock, 'utf8') !== seen) return
    unlinkSync(lock)
    create()
  } finally {
    rmSync(guard, { recursive: true, force: true })
  }
}

/** Use the same lock as pair run so migration cannot replace a writer's newer telemetry. */
function persistMigration(file, original, migrated) {
  const lock = join(dirname(file), 'run.lock')
  let ownerFd
  const create = () => { ownerFd = openSync(lock, 'wx') }
  try {
    try {
      create()
    } catch (error) {
      if (error.code !== 'EEXIST') throw error
      reclaimLock(lock, create)
    }
    if (ownerFd === undefined) return
    writeFileSync(ownerFd, JSON.stringify({ pid: process.pid, host: hostname(), startedAt: new Date().toISOString() }))
    if (readFileSync(file, 'utf8') !== original) return
    const temp = `${file}.${randomUUID()}.tmp`
    try {
      const mode = statSync(file).mode & 0o777
      writeFileSync(temp, migrated, { flag: 'wx', mode })
      chmodSync(temp, mode)
      renameSync(temp, file)
    } finally {
      rmSync(temp, { force: true })
    }
  } catch (error) {
    if (ownerFd !== undefined || error.code !== 'EEXIST') console.error(`analyze: could not migrate ${file}: ${error.message}`)
  } finally {
    if (ownerFd !== undefined) {
      try {
        closeSync(ownerFd)
      } finally {
        rmSync(lock, { force: true })
      }
    }
  }
}

function parse(file) {
  const original = readFileSync(file, 'utf8')
  const records = []
  const migrated = original.split('\n').map((line, index) => {
    if (line === '') return line
    let record
    try {
      record = JSON.parse(line)
    } catch (error) {
      throw new Error(`${file}:${index + 1}: ${error.message}`)
    }
    if (!SCHEMAS.includes(record.schema)) throw new Error(`${file}:${index + 1}: schema ${record.schema} is not read by this script (reads ${SCHEMAS.join(', ')})`)
    records.push(record)
    if (record.type !== 'step' || record.status !== 'needs-human') return line
    record.status = 'needs-decision'
    return JSON.stringify(record) + (line.endsWith('\r') ? '\r' : '')
  }).join('\n')
  if (migrated !== original) persistMigration(file, original, migrated)
  return records
}

/** The runs under `dir` that hold step records, in name order: identity, outcome (`open` when not closed) and steps. */
export function readRuns(dir, only = {}) {
  return readdirSync(dir, { withFileTypes: true })
    .filter(entry => entry.isDirectory() && existsSync(join(dir, entry.name, 'telemetry.jsonl')))
    .map(entry => entry.name)
    // A run is named by its directory: `--run` leaves the others unread, so one that cannot be read does not stop it.
    .filter(name => only.run === undefined || name === only.run)
    .sort()
    .flatMap(name => {
      const records = parse(join(dir, name, 'telemetry.jsonl'))
      const steps = records.filter(record => record.type === 'step')
      if (steps.length === 0) return []
      const { run, workflow, card } = steps[0]
      const status = records.findLast(record => record.type === 'run')?.status ?? 'open'
      let segment = []
      const parks = []
      for (const record of records) {
        if (record.type === 'step') segment.push(record)
        if (record.type === 'run') {
          if (record.status === 'parked') {
            const cause = segment.findLast(step => ['blocked', 'needs-decision', 'exhausted'].includes(step.status) && step.escalate?.do !== 'continue')
            if (cause) parks.push({ step: cause.step, reason: cause.reason })
          }
          segment = []
        }
      }
      return [{ run, workflow, card, status, steps, parks }]
    })
    .filter(one => ['run', 'card', 'workflow'].every(key => only[key] === undefined || one[key] === only[key]))
}

const clocked = value => ({ value, source: 'measured' })
const at = step => `${step.step}#${step.attempt}`
const total = values => values.reduce((sum, value) => sum + value, 0)

/** The sum of one token entry over step records. */
function sumOf(name, steps) {
  const known = steps.map(step => step.tokens[name]).filter(entry => entry.value !== null)
  const unknown = steps.filter(step => step.tokens[name].value === null).map(at)
  const listed = unknown.length > 0 ? { unknown } : {}
  if (known.length === 0) return { value: null, source: 'unknown', ...listed }
  const source = known.every(entry => entry.source === 'measured') ? 'measured' : 'estimated'
  return { value: total(known.map(entry => entry.value)), source, ...listed }
}

const tokensOf = steps => Object.fromEntries(TOKENS.map(name => [name, sumOf(name, steps)]))
const durationOf = steps => clocked(total(steps.map(step => step.durationMs)))

/** Price units (tokens × price per million) of a step: undefined without a price row, with a row missing the price of a known entry, or without any known entry. */
function unitsOf(step, prices) {
  const row = prices?.[step.model]
  const known = TOKENS.filter(name => step.tokens[name].value !== null)
  if (row === undefined || known.length === 0) return undefined
  if (known.some(name => typeof row[name] !== 'number')) return undefined
  return {
    units: total(known.map(name => step.tokens[name].value * row[name])),
    measured: TOKENS.every(name => step.tokens[name].source === 'measured'),
  }
}

/** A cost with its origin, or "not calculated" as soon as one step has no price. */
function costOf(steps, prices) {
  const priced = steps.map(step => unitsOf(step, prices))
  if (priced.some(one => one === undefined)) return NOT_CALCULATED
  // A token entry that is unknown is left out of the cost, never counted as zero: the cost says which steps.
  const unknown = steps.filter(step => TOKENS.some(name => step.tokens[name].value === null)).map(at)
  return {
    value: Number((total(priced.map(one => one.units)) / 1e6).toFixed(6)),
    source: priced.every(one => one.measured) ? 'measured' : 'estimated',
    ...(unknown.length > 0 && { unknown }),
  }
}

const identityOf = ({ run, workflow, card, status }) => ({ run, workflow, card, status })

const cost = (runs, { prices }) => ({
  runs: runs.map(one => ({
    ...identityOf(one),
    steps: one.steps.map(step => ({
      step: step.step,
      attempt: step.attempt,
      kind: step.kind,
      engine: step.engine,
      ...(step.model !== undefined && { model: step.model }),
      tokens: step.tokens,
      ...(step.estimate !== undefined && { estimate: step.estimate }),
      cost: costOf([step], prices),
    })),
    total: { tokens: tokensOf(one.steps), cost: costOf(one.steps, prices) },
  })),
})

/** `steps` grouped by `key`, in key order. */
function groupBy(steps, key) {
  const groups = new Map()
  for (const step of steps) groups.set(step[key], [...(groups.get(step[key]) ?? []), step])
  return [...groups.entries()].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
}

const time = runs => ({
  runs: runs.map(one => {
    const slowest = one.steps.reduce((slow, step) => (step.durationMs > slow.durationMs ? step : slow))
    return {
      ...identityOf(one),
      steps: one.steps.map(step => ({
        step: step.step,
        attempt: step.attempt,
        kind: step.kind,
        durationMs: clocked(step.durationMs),
      })),
      kinds: groupBy(one.steps, 'kind').map(([kind, steps]) => ({
        kind,
        executions: steps.length,
        durationMs: durationOf(steps),
      })),
      slowest: { step: slowest.step, attempt: slowest.attempt, durationMs: clocked(slowest.durationMs) },
      durationMs: durationOf(one.steps),
    }
  }),
})

const passes = runs => ({
  runs: runs.map(one => ({
    ...identityOf(one),
    steps: groupBy(one.steps, 'step').map(([step, steps]) => ({
      step,
      executions: steps.length,
      statuses: steps.map(each => each.status),
    })),
    executions: one.steps.length,
  })),
})

/** What a run launched its steps with: host, engine, model and effort — one entry per distinct combination. */
const configurationOf = steps =>
  [...new Set(steps.map(step => `${step.host} ${[step.engine, step.model, step.effort].filter(Boolean).join('/')}`))].join(' + ')

/** The lowest and the highest of one figure across runs — refused when the figures differ in origin or hold unknown entries. */
function compared(rows, pick) {
  const figures = rows.map(row => ({ run: row.run, ...pick(row) }))
  const sources = [...new Set(figures.map(one => (one.unknown === undefined ? one.source : 'unknown')))].sort()
  if (sources.length > 1 || sources[0] === 'unknown') return { refused: sources.join(' against ') }
  const ordered = [...figures].sort((a, b) => a.value - b.value)
  const [lowest, highest] = [ordered[0], ordered.at(-1)]
  return { source: sources[0], lowest: lowest.run, highest: highest.run, difference: highest.value - lowest.value }
}

function compare(runs, { prices, by = 'card' }) {
  const rows = runs.map(one => ({
    ...identityOf(one),
    configuration: configurationOf(one.steps),
    steps: one.steps.filter(step => step.kind !== 'loop').length,
    parks: one.parks,
    durationMs: durationOf(one.steps),
    tokens: tokensOf(one.steps),
    cost: costOf(one.steps, prices),
  }))
  const groups = groupBy(rows, by)
  return {
    by,
    groups: groups
      .filter(([, members]) => members.length > 1)
      .map(([key, members]) => ({
        [by]: key,
        runs: members,
        comparison: {
          durationMs: compared(members, row => row.durationMs),
          ...Object.fromEntries(TOKENS.map(name => [name, compared(members, row => row.tokens[name])])),
        },
      })),
    // Alone in their group: nothing to compare them with. In name order, like the runs.
    single: groups.filter(([, members]) => members.length === 1).map(([, [member]]) => member.run).sort(),
  }
}

/** Median and range of sorted values. */
function stats(values) {
  const middle = values.length >> 1
  return {
    median: values.length % 2 === 1 ? values[middle] : (values[middle - 1] + values[middle]) / 2,
    min: values[0],
    max: values.at(-1),
    n: values.length,
  }
}

/** Median and range of figures, per origin when both are present; a figure with unknown entries is left out and counted. */
function spread(figures) {
  const known = figures.filter(one => one.value !== null && one.unknown === undefined)
  const values = known.map(one => one.value).sort((a, b) => a - b)
  const left = figures.length - known.length
  const unknown = left > 0 ? { unknown: left } : {}
  if (values.length === 0) return { median: null, min: null, max: null, n: 0, source: 'unknown', ...unknown }
  const [measured, estimated] = ['measured', 'estimated'].map(source => known.filter(one => one.source === source).map(one => one.value).sort((a, b) => a - b))
  // Measured and estimated values are never put in one figure: each origin has its own.
  if (measured.length > 0 && estimated.length > 0) return { measured: stats(measured), estimated: stats(estimated), ...unknown }
  return { ...stats(values), source: estimated.length > 0 ? 'estimated' : 'measured', ...unknown }
}

const spreadOf = groups => ({
  durationMs: spread(groups.map(durationOf)),
  tokens: Object.fromEntries(TOKENS.map(name => [name, spread(groups.map(steps => sumOf(name, steps)))])),
})

const trend = runs => ({
  workflows: groupBy(runs, 'workflow').map(([workflow, members]) => ({
    workflow,
    runs: members.length,
    ...spreadOf(members.map(one => one.steps)),
  })),
  kinds: groupBy(runs.flatMap(one => one.steps), 'kind').map(([kind, steps]) => ({
    kind,
    executions: steps.length,
    ...spreadOf(steps.map(step => [step])),
  })),
})

const convergence = runs => {
  const cards = runs.flatMap(({ run, card, workflow, steps }) => {
    const reviews = steps.filter(step => step.kind === 'review' && step.findingCounts)
    if (!reviews.length) return []
    const rounds = reviews.map((step, index) => ({ round: step.round ?? index + 1, ...step.findingCounts }))
    let lastRound = reviews[0].round
    const pairs = reviews.slice(1).map((review, index) => {
      const previous = reviews[index]
      const reset = review.round != null && lastRound != null && review.round <= lastRound
      if (review.round != null) lastRound = review.round
      const between = steps.slice(steps.indexOf(previous) + 1, steps.indexOf(review))
      return { review, previous, reset, fixed: !reset && between.some(step => step.kind === 'fix') }
    })
    return [{
      run, card, workflow, rounds,
      loopRounds: reviews.filter(step => step.round != null).length,
      growth: pairs.some(({ review, previous, reset }) => !reset && (review.findingCounts.blockingOpen ?? review.findingCounts.open) > (previous.findingCounts.blockingOpen ?? previous.findingCounts.open)),
      newAfterFix: total(pairs.filter(pair => pair.fixed).map(pair => pair.review.findingCounts.new)),
    }]
  })
  const loops = cards.filter(card => card.loopRounds > 0)
  return { cards, meanRounds: loops.length ? total(loops.map(card => card.loopRounds)) / loops.length : null }
}

const ANSWERS = { cost, time, passes, compare, trend, convergence }

function notesOf(runs) {
  const sessions = runs.filter(one => one.steps.some(step => step.host === 'session')).map(one => one.run)
  if (sessions.length === 0) return []
  return [
    `session runs (${sessions.join(', ')}): \`cached\` is unknown there and the other tokens are lower-bound estimates from text — an efficiency comparison needs \`pair-cli run\``,
  ]
}

/** The answer to one question over `runs` (from `readRuns`). `options`: `prices`, and `by` for `compare`. */
export function answer(question, runs, options = {}) {
  return { question, ...ANSWERS[question](runs, options), notes: notesOf(runs) }
}

function main(argv) {
  const arg = key => {
    const index = argv.indexOf(key)
    return index >= 0 ? argv[index + 1] : undefined
  }
  const [question] = argv
  const by = arg('--by')
  if (!QUESTIONS.includes(question) || (by !== undefined && by !== 'card' && by !== 'workflow')) {
    console.error(
      `usage: analyze.mjs <${QUESTIONS.filter(one => one !== 'convergence').join('|')}> (also: convergence) [--runs <dir>] [--run <id>] [--card <id>] [--workflow <name>] [--prices <file.json>] [--by card|workflow]`,
    )
    return 2
  }
  try {
    const only = { run: arg('--run'), card: arg('--card'), workflow: arg('--workflow') }
    const runs = readRuns(arg('--runs') ?? '.pair/working/runs', only)
    const file = arg('--prices')
    const prices = file === undefined ? undefined : JSON.parse(readFileSync(file, 'utf8'))
    console.log(JSON.stringify(answer(question, runs, { prices, ...(by !== undefined && { by }) }), null, 2))
    return 0
  } catch (error) {
    console.error(`analyze: ${error.message}`)
    return 2
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === realpathSync(process.argv[1])) process.exitCode = main(process.argv.slice(2))

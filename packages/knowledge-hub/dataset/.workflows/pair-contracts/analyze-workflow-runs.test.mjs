// Tests for analyze.mjs — the deterministic script of pair-capability-analyze-workflow-runs (#697 AC-6, AC-7).
// It reads `runs/*/telemetry.jsonl` and answers cost, time, passes, compare and trend: every number
// with its origin, a sum with an estimated entry an estimate, measured never compared with estimated.
// RUNS FROM `.claude/workflows` ONLY (see word-limits.test.mjs): execute via `pnpm workflows:test`.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, utimesSync, writeFileSync } from 'node:fs'
import { hostname, tmpdir } from 'node:os'
import { join } from 'node:path'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

import { answer, readRuns } from '../../skills/pair-capability-analyze-workflow-runs/scripts/analyze.mjs'

const CLI = fileURLToPath(new URL('../../skills/pair-capability-analyze-workflow-runs/scripts/analyze.mjs', import.meta.url))

const entry = (value, source) => ({ value, source })
const measured = (read, cached, written) => ({ read: entry(read, 'measured'), cached: entry(cached, 'measured'), written: entry(written, 'measured') })
const fromText = (read, written) => ({ read: entry(read, 'estimated'), cached: entry(null, 'unknown'), written: entry(written, 'estimated') })

/** A step record as `@pair/workflows` writes it. */
const step = (run, id, over = {}) => ({
  type: 'step', schema: 1, run, workflow: 'quick', card: '627', step: id, kind: id, uses: `pair-process-${id}`,
  host: 'pair-run', engine: 'claude', model: 'claude-fable-5-2', startedAt: '2026-11-21T10:00:00.000Z',
  durationMs: 60_000, tokens: measured(100, 1000, 10), status: 'ok', attempt: 1, ...over,
})
const closing = (run, status = 'done') => ({ type: 'run', schema: 1, run, workflow: 'quick', card: '627', status })

/** A runs directory holding one `telemetry.jsonl` per run. */
function runsDir(runs) {
  const dir = mkdtempSync(join(tmpdir(), 'analyze-runs-'))
  for (const [id, records] of Object.entries(runs)) {
    mkdirSync(join(dir, id))
    if (records !== null) writeFileSync(join(dir, id, 'telemetry.jsonl'), records.map(record => `${JSON.stringify(record)}\n`).join(''))
  }
  return dir
}

// A run measured by `pair run`: implement failed once, ran again, then review.
const MEASURED = [
  step('quick-627', 'implement', { status: 'failed', reason: 'quality-gate', durationMs: 90_000, tokens: measured(1000, 20_000, 100) }),
  step('quick-627', 'implement', { attempt: 2, durationMs: 30_000, tokens: measured(2000, 30_000, 200) }),
  step('quick-627', 'review', { durationMs: 45_000, tokens: measured(500, 10_000, 50) }),
  closing('quick-627'),
]
// The same card on a host that cannot measure.
const ESTIMATED = [
  step('session-627', 'implement', { host: 'session', durationMs: 50_000, tokens: fromText(40, 8), estimate: 'lower-bound-from-text' }),
  closing('session-627', 'failed'),
]
const PRICES = { 'claude-fable-5-2': { read: 10, cached: 1, written: 50 } }
const ask = (question, runs, options = {}) => answer(question, readRuns(runsDir(runs)), options)

test('cost: tokens per step and in total, each with its origin, and the cost from the price table', () => {
  const [run] = ask('cost', { 'quick-627': MEASURED }, { prices: PRICES }).runs
  assert.deepEqual(run.steps.map(one => [one.step, one.attempt, one.tokens.read, one.cost]), [
    // 1000 × 10 + 20000 × 1 + 100 × 50 = 35000 per million
    ['implement', 1, entry(1000, 'measured'), entry(0.035, 'measured')],
    ['implement', 2, entry(2000, 'measured'), entry(0.06, 'measured')],
    ['review', 1, entry(500, 'measured'), entry(0.0175, 'measured')],
  ])
  assert.deepEqual(run.total, {
    tokens: { read: entry(3500, 'measured'), cached: entry(60_000, 'measured'), written: entry(350, 'measured') },
    cost: entry(0.1125, 'measured'),
  })
  assert.deepEqual([run.run, run.workflow, run.card, run.status], ['quick-627', 'quick', '627', 'done'])
})

test('cost: an estimated entry makes the sum and the cost estimates; unknown entries are listed, not counted as zero', () => {
  const mixed = [step('mixed-627', 'implement'), step('mixed-627', 'review', { tokens: fromText(40, 8), estimate: 'lower-bound-from-text' })]
  const [run] = ask('cost', { 'mixed-627': mixed }, { prices: PRICES }).runs
  assert.deepEqual(run.total.tokens, {
    read: entry(140, 'estimated'),
    cached: { ...entry(1000, 'measured'), unknown: ['review#1'] },
    written: entry(18, 'estimated'),
  })
  // review: 40 × 10 + 8 × 50 = 800 per million, cached left out
  // The cost leaves the unknown entry out, and says which step it is (#672 AC-10).
  assert.deepEqual(run.steps[1].cost, { ...entry(0.0008, 'estimated'), unknown: ['review#1'] })
  assert.equal(run.total.cost.source, 'estimated')
  assert.equal(run.status, 'open', 'a run without a closing record is not closed')
})

test('cost: no price table, an empty one, no row for the model, or a row missing a token price → tokens reported, cost "not calculated" (AC-7)', () => {
  for (const options of [{}, { prices: {} }, { prices: { 'another-model': PRICES['claude-fable-5-2'] } }, { prices: { 'claude-fable-5-2': { read: 1 } } }]) {
    const [run] = ask('cost', { 'quick-627': MEASURED }, options).runs
    assert.deepEqual(run.steps.map(one => one.cost), ['not calculated', 'not calculated', 'not calculated'])
    assert.equal(run.total.cost, 'not calculated')
    assert.deepEqual(run.total.tokens.read, entry(3500, 'measured'))
  }
})

test('time: duration per step and per kind, the slowest step and the total', () => {
  const [run] = ask('time', { 'quick-627': MEASURED }).runs
  assert.deepEqual(run.steps, [
    { step: 'implement', attempt: 1, kind: 'implement', durationMs: entry(90_000, 'measured') },
    { step: 'implement', attempt: 2, kind: 'implement', durationMs: entry(30_000, 'measured') },
    { step: 'review', attempt: 1, kind: 'review', durationMs: entry(45_000, 'measured') },
  ])
  assert.deepEqual(run.kinds, [
    { kind: 'implement', executions: 2, durationMs: entry(120_000, 'measured') },
    { kind: 'review', executions: 1, durationMs: entry(45_000, 'measured') },
  ])
  assert.deepEqual(run.slowest, { step: 'implement', attempt: 1, durationMs: entry(90_000, 'measured') })
  assert.deepEqual(run.durationMs, entry(165_000, 'measured'))
})

test('passes: executions per step, re-executions included, with the outcome of each', () => {
  const [run] = ask('passes', { 'quick-627': MEASURED }).runs
  assert.deepEqual(run.steps, [
    { step: 'implement', executions: 2, statuses: ['failed', 'ok'] },
    { step: 'review', executions: 1, statuses: ['ok'] },
  ])
  assert.equal(run.executions, 3)
})

test('#728 AC-3 F1: passes migrates a legacy step on first read', t => {
  const legacy = step('quick-627', 'implement', { schema: 2, status: 'needs-human', reason: 'needs-human' })
  const dir = runsDir({ 'quick-627': [legacy, MEASURED[1], closing('quick-627', 'parked')] })
  t.after(() => rmSync(dir, { recursive: true, force: true }))
  const file = join(dir, 'quick-627', 'telemetry.jsonl')
  const analyze = () => spawnSync(process.execPath, [CLI, 'passes', '--runs', dir], { encoding: 'utf8' })
  const first = analyze()
  assert.equal(first.status, 0, first.stderr)
  assert.deepEqual(JSON.parse(first.stdout).runs[0].steps[0].statuses, ['needs-decision', 'ok'])
  const expected = [{ ...legacy, status: 'needs-decision' }, MEASURED[1], closing('quick-627', 'parked')]
    .map(record => `${JSON.stringify(record)}\n`).join('')
  assert.equal(readFileSync(file, 'utf8'), expected)

  utimesSync(file, 1, 1)
  const before = statSync(file).mtimeMs
  assert.equal(analyze().stdout, first.stdout)
  assert.equal(readFileSync(file, 'utf8'), expected)
  assert.equal(statSync(file).mtimeMs, before)
})

test('#728 AC-3 F4: a failed lock write leaves migration retryable', t => {
  const dir = runsDir({ 'quick-627': [step('quick-627', 'implement', { status: 'needs-human' })] })
  t.after(() => rmSync(dir, { recursive: true, force: true }))
  const file = join(dir, 'quick-627', 'telemetry.jsonl')
  const lock = join(dir, 'quick-627', 'run.lock')
  const original = readFileSync(file, 'utf8')
  const args = [CLI, 'passes', '--runs', dir]
  const first = spawnSync('/bin/bash', ['-c', 'trap "" XFSZ && ulimit -f 0 && exec "$@"', 'bash', process.execPath, ...args], { encoding: 'utf8' })
  assert.equal(first.status, 0, first.stderr)
  assert.match(first.stderr, /EFBIG/)
  assert.deepEqual(JSON.parse(first.stdout).runs[0].steps[0].statuses, ['needs-decision'])
  assert.equal(readFileSync(file, 'utf8'), original)
  assert.equal(existsSync(lock), false)

  const retry = spawnSync(process.execPath, args, { encoding: 'utf8' })
  assert.equal(retry.status, 0, retry.stderr)
  assert.equal(JSON.parse(readFileSync(file, 'utf8')).status, 'needs-decision')
})

test('#728 AC-3 F4: analysis preserves a live run holder’s lock', t => {
  const dir = runsDir({ 'quick-627': [step('quick-627', 'implement', { status: 'needs-human' })] })
  t.after(() => rmSync(dir, { recursive: true, force: true }))
  const lock = join(dir, 'quick-627', 'run.lock')
  const file = join(dir, 'quick-627', 'telemetry.jsonl')
  const holder = JSON.stringify({ pid: process.pid, host: hostname(), startedAt: new Date().toISOString() })
  writeFileSync(lock, holder)

  assert.deepEqual(answer('passes', readRuns(dir)).runs[0].steps[0].statuses, ['needs-decision'])
  assert.equal(readFileSync(lock, 'utf8'), holder)
  assert.equal(JSON.parse(readFileSync(file, 'utf8')).status, 'needs-human')
})

test('compare: the runs of a card side by side; measured against estimated is refused, never compared silently', () => {
  const { groups } = ask('compare', { 'quick-627': MEASURED, 'session-627': ESTIMATED })
  assert.equal(groups.length, 1)
  const [{ card, runs, comparison }] = groups
  assert.equal(card, '627')
  assert.deepEqual(runs.map(one => [one.run, one.configuration, one.tokens.read]), [
    ['quick-627', 'pair-run claude/claude-fable-5-2', entry(3500, 'measured')],
    ['session-627', 'session claude/claude-fable-5-2', entry(40, 'estimated')],
  ])
  assert.deepEqual(comparison.read, { refused: 'estimated against measured' })
  assert.deepEqual(comparison.written, { refused: 'estimated against measured' })
  assert.deepEqual(comparison.cached, { refused: 'measured against unknown' })
  assert.deepEqual(comparison.durationMs, { source: 'measured', lowest: 'session-627', highest: 'quick-627', difference: 115_000 })
})

test('compare: values of the same origin are compared, by workflow when asked', () => {
  const cheaper = [step('cheap-628', 'implement', { card: '628', model: 'claude-haiku-5-5', tokens: measured(900, 100, 10) })]
  const { groups, single } = ask('compare', { 'quick-627': MEASURED, 'cheap-628': cheaper }, { by: 'workflow' })
  assert.equal(groups[0].workflow, 'quick')
  assert.deepEqual(groups[0].comparison.read, { source: 'measured', lowest: 'cheap-628', highest: 'quick-627', difference: 2600 })
  assert.deepEqual(single, [])
  // By card each run is alone: nothing to compare, and it is said.
  assert.deepEqual(ask('compare', { 'quick-627': MEASURED, 'cheap-628': cheaper }).single, ['cheap-628', 'quick-627'])
})

test('trend: median and range per workflow and per kind; measured and estimated values are never put in one figure', () => {
  const third = [step('third-629', 'implement', { card: '629', durationMs: 10_000, tokens: measured(100, 0, 1) })]
  const { workflows, kinds } = ask('trend', { 'quick-627': MEASURED, 'session-627': ESTIMATED, 'third-629': third })
  assert.deepEqual(workflows, [{
    workflow: 'quick',
    runs: 3,
    durationMs: { median: 50_000, min: 10_000, max: 165_000, n: 3, source: 'measured' },
    tokens: {
      read: { measured: { median: 1800, min: 100, max: 3500, n: 2 }, estimated: { median: 40, min: 40, max: 40, n: 1 } },
      cached: { median: 30_000, min: 0, max: 60_000, n: 2, source: 'measured', unknown: 1 },
      written: { measured: { median: 175.5, min: 1, max: 350, n: 2 }, estimated: { median: 8, min: 8, max: 8, n: 1 } },
    },
  }])
  assert.deepEqual(kinds.map(one => [one.kind, one.executions, one.durationMs.median, one.tokens.read]), [
    ['implement', 4, 40_000, { measured: { median: 1000, min: 100, max: 2000, n: 3 }, estimated: { median: 40, min: 40, max: 40, n: 1 } }],
    ['review', 1, 45_000, { median: 500, min: 500, max: 500, n: 1, source: 'measured' }],
  ])
})

test('notes: a session run says cached is unknown there and that an efficiency comparison needs pair run', () => {
  assert.deepEqual(ask('cost', { 'quick-627': MEASURED }).notes, [])
  assert.deepEqual(ask('cost', { 'session-627': ESTIMATED }).notes, [
    'session runs (session-627): `cached` is unknown there and the other tokens are lower-bound estimates from text — an efficiency comparison needs `pair-cli run`',
  ])
})

test('readRuns: only directories with a telemetry file, in name order, narrowed by run, card and workflow', () => {
  const dir = runsDir({ 'quick-627': MEASURED, 'b-off': null, 'a-628': [step('a-628', 'implement', { card: '628', workflow: 'full' })] })
  assert.deepEqual(readRuns(dir).map(one => one.run), ['a-628', 'quick-627'])
  assert.deepEqual(readRuns(dir, { card: '628' }).map(one => one.run), ['a-628'])
  assert.deepEqual(readRuns(dir, { workflow: 'quick' }).map(one => one.run), ['quick-627'])
  assert.deepEqual(readRuns(dir, { run: 'quick-627' }).map(one => one.run), ['quick-627'])
})

test('readRuns: --run names one run, so an unreadable other run under --runs does not stop it (#672 AC-10)', () => {
  const dir = runsDir({ 'quick-627': MEASURED, 'bad-1': MEASURED })
  writeFileSync(join(dir, 'bad-1', 'telemetry.jsonl'), '{"type":"step"\n')
  assert.deepEqual(readRuns(dir, { run: 'quick-627' }).map(one => one.run), ['quick-627'])
  assert.throws(() => readRuns(dir), /telemetry\.jsonl:1/)
})

test('CLI: same files, same numbers — JSON on stdout, the price table read from --prices', () => {
  const dir = runsDir({ 'quick-627': MEASURED })
  writeFileSync(join(dir, 'prices.json'), JSON.stringify(PRICES))
  const run = () => spawnSync(process.execPath, [CLI, 'cost', '--runs', dir, '--prices', join(dir, 'prices.json'), '--card', '627'], { encoding: 'utf8' })
  const first = run()
  assert.equal(first.status, 0, first.stderr)
  assert.equal(JSON.parse(first.stdout).runs[0].total.cost.value, 0.1125)
  assert.equal(run().stdout, first.stdout)
})

test('readRuns: a record of a schema this script does not read is refused, naming file, line and version', () => {
  const dir = runsDir({ 'quick-627': [{ ...MEASURED[0], schema: 99 }] })
  assert.throws(() => readRuns(dir), /telemetry\.jsonl:1: schema 99 is not read by this script \(reads 1, 2\)/)
})

test('readRuns: a record of schema 2 (round field) is read', () => {
  const dir = runsDir({ 'quick-627': [{ ...MEASURED[0], schema: 2 }] })
  assert.doesNotThrow(() => readRuns(dir))
})

test('CLI: unknown question, missing runs directory or a broken record → exit 2 with the cause, never numbers', () => {
  const broken = runsDir({ 'quick-627': MEASURED })
  writeFileSync(join(broken, 'quick-627', 'telemetry.jsonl'), '{"type":"step"\n')
  for (const [args, cause] of [
    [['price', '--runs', broken], /usage: analyze\.mjs <cost\|time\|passes\|compare\|trend>/],
    [['cost', '--runs', join(broken, 'missing')], /analyze: .*missing/],
    [['cost', '--runs', broken], /analyze: .*telemetry\.jsonl:1/],
  ]) {
    const result = spawnSync(process.execPath, [CLI, ...args], { encoding: 'utf8' })
    assert.equal(result.status, 2)
    assert.match(result.stderr, cause)
    assert.equal(result.stdout, '')
  }
})

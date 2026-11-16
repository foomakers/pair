// #661: v2 envelope (start/end/event/card), cost, interruption, lost sweep, card totals, report views.
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { afterEach, expect, it } from 'vitest'
import {
  appendTelemetry,
  cardTelemetryRecord,
  parseTelemetryLine,
  telemetryFile,
  type TelemetryRecord,
} from './telemetry'
import { costOf, telemetryPrices } from './telemetry-policy'
import { renderView, groupTelemetry } from './telemetry-report'
import { closeOpenStages, createTrace, envelope, sweepLostStages } from './telemetry-trace'

const roots: string[] = []
const tmp = () => {
  const root = mkdtempSync(join(tmpdir(), 'pair-661-'))
  roots.push(root)
  return root
}
afterEach(() => roots.splice(0).forEach(r => rmSync(r, { recursive: true, force: true })))

const records = (root: string): TelemetryRecord[] =>
  readFileSync(telemetryFile(root), 'utf8')
    .split('\n')
    .flatMap(line => parseTelemetryLine(line) ?? [])

const KEYS = [
  'schema',
  'id',
  'ts',
  'run',
  'card',
  'epic',
  'pr',
  'branch',
  'step',
  'phase',
  'block',
  'round',
  'group',
  'engine',
  'model',
  'effort',
  'profile',
  'tier',
  'outcome',
  'cause',
]
const trace = (root: string, now: () => number, prices = {}) =>
  createTrace({
    root,
    run: 'r1',
    card: '661',
    profile: 'p',
    context: { command: 'pair run' },
    prices,
    now,
  })
const info = {
  step: 'implement',
  phase: 'a0',
  engine: 'codex',
  model: 'm1',
  effort: 'high',
  retries: 0,
}
const tokens = {
  freshIn: 1_000_000,
  cachedIn: 2_000_000,
  out: 500_000,
  reasoning: 'not measured' as const,
}

it('AC-1/2/6: start precedes end; both carry every key; end has outcome, duration, tokens, cost', () => {
  const root = tmp()
  let t = 1000
  const handle = trace(root, () => (t += 500), { m1: { fresh: 2, cached: 1, out: 8 } }).start(info)
  handle.close({ outcome: 'ok', observation: { tokens } })
  const [start, end] = records(root)
  expect([start!.kind, end!.kind]).toEqual(['start', 'end'])
  for (const r of [start!, end!]) expect(Object.keys(r)).toEqual(expect.arrayContaining(KEYS))
  expect(start).toMatchObject({ schema: 2, pid: process.pid, command: 'pair run', phase: 'a0' })
  expect(end).toMatchObject({
    outcome: 'ok',
    cause: null,
    durationMs: 500,
    tokens,
    startId: start!.id,
  })
  // 1M fresh × $2 + 2M cached × $1 + 0.5M out × $8
  expect(end!['cost']).toBe(8)
})

it('AC-6: re-closing a stage appends nothing; an identical id is a no-op', () => {
  const root = tmp()
  const handle = trace(root, () => 1).start(info)
  handle.close({ outcome: 'ok' })
  handle.close({ outcome: 'failed', cause: 'crashed' })
  appendTelemetry(root, records(root)[0]!)
  expect(records(root).map(r => r.kind)).toEqual(['start', 'end'])
})

it.each([
  ['priced', 'm1', { fresh: 1, cached: 1, out: 1 }, 3.5],
  ['unpriced model', 'm2', { fresh: 1, cached: 1, out: 1 }, 'not measured'],
  ['unmeasured tokens', 'm1', { fresh: 1, cached: 1, out: 1 }, 'not measured'],
])('AC-4: cost %s', (name, model, price, expected) => {
  const t = name === 'unmeasured tokens' ? 'not measured' : tokens
  expect(costOf(t, model === 'm1' ? price : undefined)).toBe(expected)
})

it('AC-4: malformed or absent price table ⇒ no prices', () => {
  const root = tmp()
  expect(telemetryPrices(root)).toEqual({})
  mkdirSync(join(root, '.pair/adoption/tech'), { recursive: true })
  const md = (json: string) => `## Telemetry\n- enabled: true\n\n\`\`\`json\n${json}\n\`\`\`\n`
  writeFileSync(join(root, '.pair/adoption/tech/automation.md'), md('{ nope'))
  expect(telemetryPrices(root)).toEqual({})
  writeFileSync(
    join(root, '.pair/adoption/tech/automation.md'),
    md('{"prices":{"m":{"fresh":1,"cached":0.1,"out":5},"bad":{"fresh":"x"}}}'),
  )
  expect(telemetryPrices(root)).toEqual({ m: { fresh: 1, cached: 0.1, out: 5 } })
})

it('AC-3: events carry keys, and later records carry the PR', () => {
  const root = tmp()
  const tr = trace(root, () => 5)
  tr.event('recovery-round', { round: 1 })
  tr.observePr(651)
  tr.observePr(700)
  tr.start(info).close({ outcome: 'ok' })
  const all = records(root)
  expect(all.filter(r => r.kind === 'event').map(r => [r['event'], r['pr']])).toEqual([
    ['recovery-round', null],
    ['pr-opened', 651],
  ])
  expect(all.at(-1)!['pr']).toBe(651)
})

it('AC-5: a signal closes every open stage with one interrupted end carrying the signal', () => {
  const root = tmp()
  const tr = trace(root, () => 9)
  tr.start(info)
  tr.start({ ...info, step: 'verify' })
  closeOpenStages('interrupted', 'SIGTERM')
  closeOpenStages('interrupted', 'SIGTERM')
  const ends = records(root).filter(r => r.kind === 'end')
  expect(ends).toHaveLength(2)
  expect(ends[0]).toMatchObject({ cause: 'interrupted', signal: 'SIGTERM', outcome: 'failed' })
})

const orphan = (root: string, over: Record<string, unknown>) =>
  appendTelemetry(
    root,
    envelope(
      { kind: 'start', id: 'r1:661:implement:a0:start:0.1000', ts: 1000 },
      { run: 'r1', card: '661', step: 'implement', phase: 'a0' },
      over,
    ),
  )

it('AC-5: orphan start with a dead pid on this host ⇒ one lost end at the stage last record; idempotent', () => {
  const root = tmp()
  orphan(root, { pid: 2 ** 22 + 12345, host: 'h' })
  expect(sweepLostStages(root, 'h')).toBe(1)
  expect(sweepLostStages(root, 'h')).toBe(0)
  const end = records(root).find(r => r.kind === 'end')!
  expect(end).toMatchObject({ cause: 'lost', outcome: 'failed', ts: new Date(1000).toISOString() })
})

it.each([
  ['live pid', { pid: process.pid, host: 'h' }],
  ['other host', { pid: 2 ** 22 + 12345, host: 'other' }],
])('AC-5: %s is left untouched', (_name, over) => {
  const root = tmp()
  orphan(root, over)
  expect(sweepLostStages(root, 'h')).toBe(0)
  expect(records(root).filter(r => r.kind === 'end')).toHaveLength(0)
})

const end = (card: string, run: string, over: Record<string, unknown> = {}): TelemetryRecord => ({
  kind: 'end',
  id: `${run}:${card}:${String(over['engine'])}:${String(over['cause'])}`,
  schema: 2,
  ts: '2026-01-01T00:00:10.000Z',
  run,
  card,
  epic: '605',
  step: 'implement',
  phase: 'a0',
  engine: 'codex',
  model: 'm1',
  effort: 'high',
  outcome: 'ok',
  cause: null,
  durationMs: 10,
  tokens: { freshIn: 1, cachedIn: 1, out: 1, reasoning: 'not measured' },
  cost: 1,
  ...over,
})

it('AC-7: the card lists each stage and totals per runner and per model across runs; no single engine', () => {
  const stages = [
    end('661', 'r1', { engine: 'codex', model: 'm1' }),
    end('661', 'r2', { engine: 'claude', model: 'm2' }),
    end('661', 'r2', {
      engine: 'claude',
      model: 'm2',
      cause: 'interrupted',
      tokens: 'not measured',
      cost: 'not measured',
    }),
  ]
  const card = cardTelemetryRecord({
    id: 'r2:661',
    card: '661',
    run: 'r2',
    pairVersion: 'v',
    workflowVersion: 'w',
    profile: 'p',
    outcome: 'merged',
    start: 0,
    end: 100,
    stages,
    interventions: [],
  })
  expect(card['engine']).toBeUndefined()
  expect(card['stageRecords']).toHaveLength(3)
  expect(card['byRunner']).toMatchObject({
    codex: { stages: 1, tokens: { freshIn: 1 }, cost: 1 },
    claude: { stages: 2, tokens: 'not measured', cost: 'not measured' },
  })
  expect(Object.keys(card['byModel'] as object).sort()).toEqual(['m1', 'm2'])
})

const legacy: TelemetryRecord = {
  kind: 'stage',
  id: 'old:9:implement:a0:1:0',
  run: 'old',
  card: '9',
  step: 'implement',
  engine: 'codex',
  durationMs: 7,
  outcomeClass: 'ok',
  tokens: { freshIn: 1, cachedIn: 0, out: 0, reasoning: 0 },
}

it('AC-8: per-card default includes in-progress, interrupted and lost; legacy stage counts as an end', () => {
  const start: TelemetryRecord = {
    ...end('661', 'r3', { engine: 'codex', model: 'm1' }),
    kind: 'start',
    id: 'r3:start',
  }
  const groups = groupTelemetry([
    end('661', 'r1', { engine: 'codex', model: 'm1' }),
    end('661', 'r1', { engine: 'codex', model: 'm1', cause: 'interrupted' }),
    end('661', 'r1', { engine: 'codex', model: 'm1', cause: 'lost' }),
    start,
    legacy,
  ])
  expect(groups['661']).toMatchObject({
    stages: 4,
    inProgress: 1,
    interrupted: 1,
    lost: 1,
    tokens: 'not measured',
  })
  expect(groups['9']).toMatchObject({ stages: 1, durationMs: 7, tokens: 1, cost: 'not measured' })
})

it.each([
  ['run', ['r1', 'r2']],
  ['runner', ['claude', 'codex']],
  ['model', ['m1', 'm2']],
  ['step', ['implement']],
  ['epic', ['605']],
] as const)('AC-8: --by %s regroups the same records', (view, keys) => {
  const groups = groupTelemetry(
    [
      end('661', 'r1', { engine: 'codex', model: 'm1' }),
      end('661', 'r2', { engine: 'claude', model: 'm2' }),
    ],
    view,
  )
  expect(Object.keys(groups).sort()).toEqual([...keys])
})

it('AC-8: --by engine keeps the legacy per-engine cohort view', () => {
  expect(renderView([], 'engine')).toContain('not measured')
})

it.each([
  ['linux', '/r/.pair/working/telemetry/records.jsonl'],
  ['darwin', '/r/.pair/working/telemetry/records.jsonl'],
  ['win32', '\\r\\.pair\\working\\telemetry\\records.jsonl'],
] as const)(
  'v2 records file path per platform (linux, darwin posix; win32 backslash): %s',
  (platform, expected) => {
    expect(telemetryFile('/r', platform)).toBe(expected)
  },
)

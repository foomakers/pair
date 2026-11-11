import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import {
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'fs'
import { join, resolve } from 'path'
import { tmpdir } from 'os'
import { spawnSync } from 'child_process'
import { InMemoryFileSystemService } from '@pair/content-ops'
import { handleRunCommand } from './handler'
import { parseRunCommand } from './parser'
import type { CardProcessExit } from './parallel'

// Real CLI/adapter subprocesses need headroom when the full quality gate runs concurrently.
vi.setConfig({ testTimeout: 30000 })

let root: string
const repository = resolve(__dirname, '../../../../..')
const reviewScript = join(
  repository,
  '.claude/skills/pair-workflow-review-phase/scripts/pr-state.mjs',
)
const mapping =
  'Github Projects is adopted for project management.\n\n## State Mapping\n\n| Board State | Macrostate |\n| --- | --- |\n| Checking | Review |\n| Finished | Done |\n'
const card = () => ({
  number: 12,
  title: 'Card',
  body: '',
  labels: [],
  state: 'OPEN',
  stateReason: null as string | null,
  closedAt: null as string | null,
  projectItems: [{ status: { name: 'Checking' } }],
})
const pr = () => ({
  number: 42,
  title: 'Card 12',
  body: 'Closes #12',
  state: 'OPEN',
  isDraft: false,
  headRefOid: 'a'.repeat(40),
  labels: [{ name: 'pr-state:to-be-reviewed' }],
  reviewDecision: 'REVIEW_REQUIRED' as string | null,
  statusCheckRollup: [] as { context: string; state: string }[],
  mergedAt: null as string | null,
  closingIssuesReferences: [{ number: 12 }] as { number: number }[] | null,
})
type Tracker = { cards: Record<string, ReturnType<typeof card>>; prs: ReturnType<typeof pr>[] }
const initial = (): Tracker => ({
  cards: { 12: card(), 15: { ...card(), number: 15 } },
  prs: [pr()],
})
const save = (state: Tracker) => writeFileSync(join(root, 'tracker.json'), JSON.stringify(state))
const load = (): Tracker => JSON.parse(readFileSync(join(root, 'tracker.json'), 'utf8'))
const retry: CardProcessExit = { exitCode: 1, signal: null, cycleStatus: 'rounds-bound-reached' }
const target: CardProcessExit = { exitCode: 0, signal: null, cycleStatus: 'target-ready' }

beforeEach(() => {
  root = realpathSync(mkdtempSync(join(tmpdir(), 'pair-review-progress-')))
  const bin = join(root, 'bin')
  mkdirSync(bin)
  writeFileSync(
    join(bin, 'gh'),
    `#!${process.execPath}\n${readFileSync(join(__dirname, '__fixtures__/cards-review-gh.cjs'), 'utf8')}`,
    { mode: 0o755 },
  )
  symlinkSync(process.execPath, join(bin, 'node'))
  vi.stubEnv('PATH', `${bin}:/usr/bin:/bin`)
  vi.stubEnv('PAIR_GH_BIN', join(bin, 'gh'))
  vi.stubEnv('PAIR_REVIEW_FIXTURE', root)
  mkdirSync(join(root, '.pair/adoption/tech'), { recursive: true })
  writeFileSync(join(root, '.pair/adoption/tech/way-of-working.md'), mapping)
})
afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllEnvs()
  rmSync(root, { recursive: true, force: true })
})
function installed() {
  cpSync(
    join(repository, '.claude/skills/pair-workflow-cycle/scripts'),
    join(root, '.claude/skills/pair-workflow-cycle/scripts'),
    { recursive: true },
  )
}
function conclude(state: Tracker, verdict = 'approved') {
  save(state)
  const result = spawnSync(
    process.execPath,
    [
      reviewScript,
      'conclude',
      '--pr',
      '42',
      '--sha',
      state.prs[0]!.headRefOid,
      '--verdict',
      verdict,
      '--repo',
      'fixture/repo',
    ],
    { cwd: root, encoding: 'utf8', timeout: 5000 },
  )
  expect(result.status, result.stdout + result.stderr).toBe(0)
  const out = JSON.parse(result.stdout)
  expect(out.check.published).toBe(true)
  expect(out.label.confirmed).toBe(true)
  const after = load()
  expect(after.prs[0]!.reviewDecision).toBe(state.prs[0]!.reviewDecision)
  state.prs = after.prs
  return out
}
async function invoke(
  state: Tracker,
  step: (id: string, count: number) => CardProcessExit,
  cards = '12',
  cap = 4,
) {
  save(state)
  const calls: string[] = []
  const counts = new Map<string, number>()
  const output: string[] = []
  const audit: string[] = []
  vi.spyOn(console, 'log').mockImplementation((...args: unknown[]) => {
    output.push(args.join(' '))
  })
  const files = {
    [join(root, 'config.json')]: JSON.stringify({ asset_registries: {} }),
    [join(root, '.pair/adoption/tech/way-of-working.md')]: mapping,
  }
  const code = await handleRunCommand(
    parseRunCommand({ cwd: root, cards, autonomous: true, maxIterations: cap }),
    new InMemoryFileSystemService(files, root, root),
    {
      runCardProcess: async ({ card: selected }) => {
        calls.push(selected.id)
        const n = (counts.get(selected.id) ?? 0) + 1
        counts.set(selected.id, n)
        const result = step(selected.id, n)
        save(state)
        return result
      },
      appendAudit: (_path, line) => {
        audit.push(line)
      },
    },
  )
  expect(existsSync(join(root, 'unexpected.txt'))).toBe(false)
  return { code, calls, output: output.join('\n'), audit: audit.join('\n') }
}
function expectProgress(result: Awaited<ReturnType<typeof invoke>>, advances: boolean) {
  expect(result.calls).toEqual(advances ? ['12', '12'] : ['12'])
  expect(result.code).toBe(advances ? 0 : 1)
  expect(result.output).toContain(`Stop: ${advances ? 'all-at-target' : 'no-progress'}`)
  expect(result.audit).toContain(`12:${advances ? 'at-target' : 'retryable'}`)
}
function ready(state: Tracker) {
  const selected = state.prs[0]!
  selected.labels = [{ name: 'pr-state:ready-to-merge' }]
  selected.statusCheckRollup = [{ context: 'pair-review', state: 'SUCCESS' }]
}
const incomplete = (
  [
    ['label-only', 'SUCCESS', false, true, 'pair-review'],
    ['check-only', 'SUCCESS', true, false, 'pair-review'],
    ['native-only', 'SUCCESS', false, false, 'pair-review'],
    ['pending', 'PENDING', true, true, 'pair-review'],
    ['failure', 'FAILURE', true, true, 'pair-review'],
    ['error', 'ERROR', true, true, 'pair-review'],
    ['unknown', 'UNKNOWN', true, true, 'pair-review'],
    ['other-context', 'SUCCESS', true, true, 'build'],
  ] as const
).map(([id, status, hasCheck, hasLabel, context]) => ({ id, status, hasCheck, hasLabel, context }))
const associations = [
  { id: 'matching', refs: [{ number: 12 }], body: '', advances: true },
  { id: 'multiple', refs: [{ number: 15 }, { number: 12 }], body: '', advances: true },
  { id: 'other-overrides', refs: [{ number: 15 }], body: 'Related context #12', advances: false },
  { id: 'empty-mention', refs: [], body: 'Related context #12', advances: false },
  { id: 'absent-mention', refs: null, body: 'Related context #12', advances: false },
  { id: 'empty-body', refs: [], body: '', advances: false },
  { id: 'numeric-collision', refs: [], body: 'Closes #120', advances: false },
] as const
for (const reader of ['fallback', 'installed'] as const) {
  it.each(['REVIEW_REQUIRED', '', null, 'CHANGES_REQUESTED', 'APPROVED'])(
    `P-${reader}-%s: actual Pair conclusion advances without a native vote`,
    async decision => {
      if (reader === 'installed') installed()
      const state = initial()
      state.prs[0]!.reviewDecision = decision
      const result = await invoke(state, (_id, n) => {
        if (n > 1) return target
        const out = conclude(state)
        expect(out.check.state).toBe('success')
        expect(state.prs[0]!.labels).toEqual([{ name: 'pr-state:ready-to-merge' }])
        expect(state.prs[0]!.statusCheckRollup).toEqual([
          { context: 'pair-review', state: 'SUCCESS' },
        ])
        return retry
      })
      expectProgress(result, true)
    },
  )
  it(`P-${reader}-rejection-repaired: actual Pair rejection can advance to approval`, async () => {
    if (reader === 'installed') installed()
    const state = initial()
    conclude(state, 'changes-requested')
    const result = await invoke(state, (_id, n) => {
      if (n > 1) return target
      conclude(state)
      return retry
    })
    expectProgress(result, true)
  })
  it.each(incomplete)(
    `N-${reader}-$id: incomplete or adverse review evidence does not advance`,
    async ({ status, hasCheck, hasLabel, context }) => {
      if (reader === 'installed') installed()
      const state = initial()
      const result = await invoke(state, (_card, n) => {
        if (n > 1) return target
        state.prs[0]!.reviewDecision = 'APPROVED'
        state.prs[0]!.labels = hasLabel ? [{ name: 'pr-state:ready-to-merge' }] : []
        state.prs[0]!.statusCheckRollup = hasCheck ? [{ context, state: status }] : []
        return retry
      })
      expectProgress(result, false)
    },
  )
  it.each(associations)(
    `A-${reader}-$id: only owned PR advancement belongs to the card`,
    async c => {
      if (reader === 'installed') installed()
      const state = initial()
      state.prs[0]!.closingIssuesReferences = c.refs === null ? null : [...c.refs]
      state.prs[0]!.body = c.body
      // Native APPROVED isolates association from the separate Pair-conclusion defect.
      state.prs[0]!.reviewDecision = 'APPROVED'
      const result = await invoke(state, (_id, n) => {
        if (n > 1) return target
        ready(state)
        return retry
      })
      expectProgress(result, c.advances)
    },
  )
  it(`I-${reader}-unrelated-conclude: Pair conclusion cannot advance an unrelated mentioned card`, async () => {
    if (reader === 'installed') installed()
    const state = initial()
    state.prs[0]!.closingIssuesReferences = []
    state.prs[0]!.body = 'Related context #12'
    const result = await invoke(state, (_id, n) => {
      if (n > 1) return target
      conclude(state)
      return retry
    })
    expectProgress(result, false)
  })
}

for (const reader of ['fallback', 'installed'] as const) {
  const prefix = reader === 'installed' ? 'installed-' : ''
  it.each(['draft', 'closed', 'merged'])(
    `S-${prefix}%s: PR state constrains progress`,
    async kind => {
      if (reader === 'installed') installed()
      const state = initial()
      state.prs[0]!.reviewDecision = 'APPROVED'
      if (kind === 'draft') state.prs[0]!.isDraft = true
      if (kind === 'closed') state.prs[0]!.state = 'CLOSED'
      const result = await invoke(state, (_id, n) => {
        if (n > 1) return target
        ready(state)
        if (kind === 'merged') {
          state.prs[0]!.state = 'MERGED'
          state.prs[0]!.mergedAt = '2026-01-01T00:00:00Z'
        }
        return retry
      })
      expectProgress(result, kind === 'merged')
    },
  )
  it(`T-${prefix}rejected: actual changes-requested conclusion does not advance`, async () => {
    if (reader === 'installed') installed()
    const state = initial()
    const result = await invoke(state, () => {
      conclude(state, 'changes-requested')
      return retry
    })
    expectProgress(result, false)
  })
  it(`T-${prefix}replay: already published Pair conclusion and restart do not manufacture progress`, async () => {
    if (reader === 'installed') installed()
    const state = initial()
    conclude(state)
    for (let restart = 0; restart < 2; restart++) {
      const result = await invoke(state, () => {
        expect(conclude(state).action).toBe('unchanged')
        return retry
      })
      expectProgress(result, false)
    }
  })
  it(`T-${prefix}cap: actual Pair progress respects the pass cap`, async () => {
    if (reader === 'installed') installed()
    const state = initial()
    const result = await invoke(
      state,
      () => {
        conclude(state)
        return retry
      },
      '12',
      1,
    )
    expect(result.calls).toEqual(['12'])
    expect(result.output).toContain('Stop: pass-cap')
    expect(result.code).toBe(1)
  })
  it.each(['gate-red', 'needs-human', 'escalated'])(
    `T-${prefix}%s: Pair conclusion cannot bypass terminal or human state`,
    async cycleStatus => {
      if (reader === 'installed') installed()
      const state = initial()
      const result = await invoke(state, () => {
        conclude(state)
        return { ...retry, cycleStatus }
      })
      expect(result.calls).toEqual(['12'])
      expect(result.output).toContain('#12: terminal')
      expect(result.code).toBe(1)
    },
  )
  it(`T-${prefix}high-water: Pair regression and recovery cannot buy another pass`, async () => {
    if (reader === 'installed') installed()
    const state = initial()
    state.cards['15']!.projectItems = [{ status: { name: 'Draft' } }]
    const result = await invoke(
      state,
      (id, n) => {
        if (id === '15') {
          state.cards['15']!.projectItems = [
            { status: { name: n === 1 ? 'Ready' : 'In Progress' } },
          ]
          return retry
        }
        conclude(state, n === 2 ? 'changes-requested' : 'approved')
        return retry
      },
      '12,15',
    )
    expect(result.calls).toEqual(['12', '15', '12', '15', '12', '15'])
    expect(result.output).toContain('Stop: no-progress')
    expect(result.code).toBe(1)
  })
}

const completions = [
  {
    id: 'invalid-date',
    done: false,
    patch: { state: 'CLOSED', stateReason: 'COMPLETED', closedAt: 'not-a-date' },
  },
  {
    id: 'legacy-null-reason',
    done: true,
    patch: { state: 'CLOSED', stateReason: null, closedAt: '2026-01-01T00:00:00Z' },
  },
  { id: 'done', done: true, patch: { projectItems: [{ status: { name: 'Finished' } }] } },
  {
    id: 'closed',
    done: true,
    patch: { state: 'CLOSED', stateReason: 'COMPLETED', closedAt: '2026-01-01T00:00:00Z' },
  },
  {
    id: 'not-planned',
    done: false,
    patch: { state: 'CLOSED', stateReason: 'NOT_PLANNED', closedAt: '2026-01-01T00:00:00Z' },
  },
  {
    id: 'missing-date',
    done: false,
    patch: { state: 'CLOSED', stateReason: 'COMPLETED', closedAt: null },
  },
  {
    id: 'open-date',
    done: false,
    patch: { state: 'OPEN', stateReason: 'COMPLETED', closedAt: '2026-01-01T00:00:00Z' },
  },
] as const
for (const reader of ['fallback', 'installed'] as const) {
  it.each(completions)(
    `L-${reader}-$id: completion is live at the later card dispatch`,
    async c => {
      if (reader === 'installed') installed()
      const state = initial()
      const result = await invoke(
        state,
        id => {
          if (id === '12') Object.assign(state.cards['15']!, c.patch)
          return target
        },
        '12,15',
      )
      expect(result.calls).toEqual(c.done ? ['12'] : ['12', '15'])
      expect(result.output).toContain('Stop: all-at-target')
      expect(result.code).toBe(0)
      if (c.done) expect(result.output).toContain('#15: at-target — already at target')
    },
  )
  it(`L-${reader}-interaction: Pair progress and peer completion retry only the unfinished owner`, async () => {
    if (reader === 'installed') installed()
    const state = initial()
    const result = await invoke(
      state,
      (id, n) => {
        if (id === '12' && n === 1) {
          state.cards['15']!.projectItems = [{ status: { name: 'Finished' } }]
          conclude(state)
          return retry
        }
        return target
      },
      '12,15',
    )
    expect(result.calls).toEqual(['12', '12'])
    expect(result.output).toContain('#15: at-target — already at target')
    expect(result.code).toBe(0)
    const restarted = await invoke(state, () => target, '12,15')
    expect(restarted.calls).toEqual(['12'])
  })
}

const fixtureScopes = [
  { id: 'default', args: [], expected: [42] },
  { id: 'all', args: ['--state', 'all'], expected: [42] },
  { id: 'open', args: ['--state', 'open'], expected: [42] },
  { id: 'merged', args: ['--state', 'merged'], expected: [] },
  { id: 'closed', args: ['--state', 'closed'], expected: [] },
  { id: 'repo', args: ['--repo', 'fixture/repo'], expected: [42] },
  { id: 'repo-short', args: ['-R', 'fixture/repo'], expected: [42] },
  { id: 'head', args: ['--head', 'feature/12'], expected: [42] },
  { id: 'wrong-head', args: ['--head', 'other'], expected: [] },
  { id: 'base', args: ['--base', 'main'], expected: [42] },
  { id: 'wrong-base', args: ['--base', 'other'], expected: [] },
  { id: 'limit', args: ['--limit', '1'], expected: [42] },
]
it.each(fixtureScopes)('G6-$id: scoped fixture reads filter evidence', ({ args, expected }) => {
  const state = initial()
  Object.assign(state.prs[0]!, { headRefName: 'feature/12', baseRefName: 'main' })
  save(state)
  const result = spawnSync(
    process.execPath,
    [
      join(__dirname, '__fixtures__/cards-review-gh.cjs'),
      'pr',
      'list',
      ...args,
      '--json',
      'number,state',
    ],
    { encoding: 'utf8', timeout: 5000 },
  )
  expect(result.status, result.stderr).toBe(0)
  const rows = JSON.parse(result.stdout) as { number: number; state: string }[]
  expect(rows.map(row => row.number)).toEqual(expected)
  for (const row of rows) expect(Object.keys(row)).toEqual(['number', 'state'])
})
const refusedScopes = [
  { id: 'wrong-repo', args: ['--repo', 'other/repo'] },
  { id: 'wrong-repo-short', args: ['-R', 'other/repo'] },
  { id: 'search', args: ['--search', 'unrelated'] },
  { id: 'unknown-option', args: ['--author', 'other'] },
  { id: 'jq', args: ['--jq', '.[]'] },
  { id: 'invalid-state', args: ['--state', 'bogus'] },
  { id: 'missing-value', args: ['--head'] },
  { id: 'duplicate', args: ['--state', 'all', '--state', 'open'] },
  { id: 'invalid-limit', args: ['--limit', '0'] },
  { id: 'unknown-field', args: ['--json', 'unsupported'] },
  { id: 'empty-fields', args: ['--json', ''] },
]
it.each(refusedScopes)('G6-$id: unsupported fixture reads refuse evidence', ({ args }) => {
  save(initial())
  const fields = args.includes('--json') ? [] : ['--json', 'number,state']
  const result = spawnSync(
    process.execPath,
    [join(__dirname, '__fixtures__/cards-review-gh.cjs'), 'pr', 'list', ...args, ...fields],
    { encoding: 'utf8', timeout: 5000 },
  )
  expect(result.status).not.toBe(0)
  expect(result.stdout).toBe('')
  expect(result.stderr).toContain('unsupported offline gh request')
})

it.each([
  { id: 'unknown-issue', args: ['issue', 'view', '99', '--json', 'number'] },
  { id: 'no-fields', args: ['pr', 'list'] },
  { id: 'write', args: ['pr', 'edit', '42', '--json', 'number'] },
])('G6-$id: unsupported command supplies no evidence', ({ args }) => {
  save(initial())
  const result = spawnSync(
    process.execPath,
    [join(__dirname, '__fixtures__/cards-review-gh.cjs'), ...args],
    { encoding: 'utf8', timeout: 5000 },
  )
  expect(result.status).not.toBe(0)
  expect(result.stdout).toBe('')
  expect(result.stderr).toContain('unsupported offline gh request')
})
it('G6-combined-limit: filters precede limit and projection', () => {
  const state = initial()
  state.prs = [
    { ...pr(), number: 40, state: 'CLOSED' },
    { ...pr(), number: 42 },
    { ...pr(), number: 43 },
  ]
  save(state)
  const result = spawnSync(
    process.execPath,
    [
      join(__dirname, '__fixtures__/cards-review-gh.cjs'),
      'pr',
      'list',
      '--repo',
      'fixture/repo',
      '--state',
      'open',
      '--limit',
      '1',
      '--json',
      'number',
    ],
    { encoding: 'utf8', timeout: 5000 },
  )
  expect(result.status, result.stderr).toBe(0)
  expect(JSON.parse(result.stdout)).toEqual([{ number: 42 }])
})

// Model a busy suite at the offline transport boundary, without changing lifecycle behavior.
for (const reader of ['fallback', 'installed'] as const) {
  it.each([0, 250])(
    `B-${reader}-%i: slow tracker reads retain lifecycle assertions`,
    async delay => {
      if (reader === 'installed') installed()
      const gh = join(root, 'bin/gh')
      const transport = readFileSync(gh, 'utf8')
      writeFileSync(
        gh,
        transport.replace(
          '\n',
          `\nif (process.argv[2] === 'issue') Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ${delay});\n`,
        ),
      )
      const started = Date.now()
      const result = await invoke(initial(), () => retry)
      expectProgress(result, false)
      expect(Date.now() - started).toBeGreaterThanOrEqual(delay * 2)
    },
  )
}

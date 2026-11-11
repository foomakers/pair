import { expect, it } from 'vitest'
import { readFileSync, writeFileSync } from 'fs'
import { join } from 'path'
import { spawnSync } from 'child_process'
import {
  root,
  pr,
  initial,
  save,
  retry,
  installed,
  invoke,
  expectProgress,
} from './cards-review-progress-lib'
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

it.each(['darwin', 'linux'] as const)(
  'G6-pr-view: answers merged state of a known PR (platform %s)',
  platform => {
    const state = initial()
    state.prs = [{ ...pr(), number: 42, mergedAt: '2026-01-01T00:00:00Z' }]
    save(state)
    const run = (n: string) =>
      spawnSync(
        process.execPath,
        [
          join(__dirname, '__fixtures__/cards-review-gh.cjs'),
          'pr',
          'view',
          n,
          '--json',
          'mergedAt',
        ],
        { encoding: 'utf8', timeout: 5000, env: { ...process.env, PAIR_TEST_PLATFORM: platform } },
      )
    expect(JSON.parse(run('42').stdout)).toEqual({ mergedAt: '2026-01-01T00:00:00Z' })
    expect(run('99').status).not.toBe(0)
  },
)

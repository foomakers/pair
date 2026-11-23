import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { workflowFacts } from './workflow-facts'

const scripts = join(__dirname, '../../../../../.claude/skills/pair-workflow-cycle/scripts')
const sha = 'a'.repeat(40)
let dir: string
const pr = (number: number) => ({
  number,
  body: 'Refs: #726',
  state: 'open',
  head: { repo: { full_name: 'foomakers/pair' } },
  base: { repo: { full_name: 'foomakers/pair' } },
})

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'pair-workflow-facts-'))
  const bin = join(dir, 'fake-gh')
  writeFileSync(
    bin,
    `#!/usr/bin/env node
const a = process.argv.slice(2)
const json = value => console.log(JSON.stringify(value))
if (a.some(v => v.includes('/pulls?state=all'))) console.log(process.env.PAIR_TEST_PULLS)
else if (a[0] === 'pr' && a[1] === 'view') console.log('${sha}')
else if (a[0] === 'issue' && a[2] === '726') console.log('## Dependencies\\n\\n**Prerequisite Stories**: #42')
else if (a[0] === 'issue' && a[2] === '42') json(JSON.parse(process.env.PAIR_TEST_CARD))
else if (a.some(v => v.includes('/check-runs'))) json({check_runs: JSON.parse(process.env.PAIR_TEST_CHECKS)})
else if (a.some(v => v.includes('/status'))) json({statuses: []})
else throw Error('Unexpected GH call: '+a.join(' '))
`,
    { mode: 0o700 },
  )
  vi.stubEnv('PAIR_GH_BIN', bin)
  vi.stubEnv('PAIR_TEST_PULLS', JSON.stringify([pr(735)]))
  vi.stubEnv('PAIR_TEST_CHECKS', '[]')
  vi.stubEnv('PAIR_TEST_CARD', JSON.stringify({ state: 'OPEN' }))
})

afterEach(() => {
  vi.unstubAllEnvs()
  rmSync(dir, { recursive: true, force: true })
})

const facts = (cwd: string) =>
  workflowFacts(() => scripts, cwd, {
    id: 'gate',
    kind: 'gate',
    uses: '',
    with: {},
    attempt: 1,
    inputs: { card: '726', reviewedHead: sha },
  })

it('uses the linked GitHub PR head and the prior review handoff (#726 T-1)', async () => {
  await expect(facts(dir).head()).resolves.toBe(sha)
  await expect(facts(dir).reviewedHead()).resolves.toBe(sha)
})

it('refuses multiple linked PRs and names them (#726 T-1)', async () => {
  vi.stubEnv('PAIR_TEST_PULLS', JSON.stringify([pr(735), pr(736)]))
  await expect(facts(dir).head()).rejects.toThrow(/#735, #736/)
})

it.each([
  [[], 'pending'],
  [[{ name: 'tests', status: 'in_progress' }], 'pending'],
  [[{ name: 'tests', status: 'completed', conclusion: 'success' }], 'green'],
  [[{ name: 'tests', status: 'completed', conclusion: 'failure' }], 'red'],
])(
  'classifies CI from the actual head without assuming absent checks are green (#726 T-2)',
  async (rows, expected) => {
    vi.stubEnv('PAIR_TEST_CHECKS', JSON.stringify(rows))
    await expect(facts(dir).ci()).resolves.toBe(expected)
  },
)

it('counts only a successful pair-review signal on the current head (#726 T-3)', async () => {
  vi.stubEnv(
    'PAIR_TEST_CHECKS',
    JSON.stringify([{ name: 'pair-review', status: 'completed', conclusion: 'success' }]),
  )
  await expect(facts(dir).reviewApproved()).resolves.toBe(true)
  vi.stubEnv('PAIR_TEST_CHECKS', '[]')
  await expect(facts(dir).reviewApproved()).resolves.toBe(false)
})

it('keeps an open prerequisite blocked until the tracker confirms completion (#726 T-4)', async () => {
  await expect(facts(dir).openPrerequisites()).resolves.toEqual(['42'])
  vi.stubEnv('PAIR_TEST_CARD', JSON.stringify({ state: 'CLOSED', stateReason: 'COMPLETED' }))
  await expect(facts(dir).openPrerequisites()).resolves.toEqual([])
})

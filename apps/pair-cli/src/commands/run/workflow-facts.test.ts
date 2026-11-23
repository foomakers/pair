import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { workflowFacts, workflowOperation } from './workflow-facts'
import { approvalPlatform } from './workflow-approval'

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
else if (a[0] === 'pr' && a[1] === 'view') console.log(process.env.PAIR_TEST_HEAD ?? '${sha}')
else if(a[0] === 'repo' && a[1] === 'view') console.log('foomakers/pair')
else if (a[0] === 'api' && a[1] === 'user') json(JSON.parse(process.env.PAIR_TEST_ACTOR))
else if (a.some(v => v.endsWith('/pulls/735'))) json({number:735,head:{sha:'${sha}',ref:'feature/US-726-test'},user:{login:'author'},draft:process.env.PAIR_TEST_DRAFT==='true'})
else if (a.some(v => v.includes('/collaborators/'))) json({permission: a.some(v => v.includes('/maintainer/')) ? 'write' : 'read'})
else if (a.some(v => v.includes('/reviews'))) console.log(process.env.PAIR_TEST_REVIEWS)
else if (a.some(v => v.endsWith('/issues/726/comments'))) console.log(process.env.PAIR_TEST_COMMENTS)
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
  vi.stubEnv('PAIR_TEST_ACTOR', JSON.stringify({ login: 'reader', type: 'User' }))
  vi.stubEnv('PAIR_TEST_COMMENTS', '[]')
  vi.stubEnv('PAIR_TEST_REVIEWS', '[]')
  vi.stubEnv('PAIR_TEST_CARD', JSON.stringify({ state: 'OPEN' }))
})

afterEach(() => {
  vi.unstubAllEnvs()
  rmSync(dir, { recursive: true, force: true })
})

const facts = (cwd: string, checks: string[] = []) =>
  workflowFacts(() => scripts, cwd, {
    id: 'gate',
    kind: 'gate',
    uses: '',
    with: { checks },
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

it('refuses facts from a replacement head after the head check (#726 AC-2)', async () => {
  const gate = facts(dir, ['head-unchanged', 'ci-green', 'review-approved'])
  await expect(gate.head()).resolves.toBe(sha)
  vi.stubEnv('PAIR_TEST_HEAD', 'b'.repeat(40))
  await expect(gate.ci()).rejects.toThrow(/head moved/i)
  await expect(gate.reviewApproved()).rejects.toThrow(/head moved/i)
})

it('keeps an open prerequisite blocked until the tracker confirms completion (#726 T-4)', async () => {
  await expect(facts(dir).openPrerequisites()).resolves.toEqual(['42'])
  vi.stubEnv('PAIR_TEST_CARD', JSON.stringify({ state: 'CLOSED', stateReason: 'COMPLETED' }))
  await expect(facts(dir).openPrerequisites()).resolves.toEqual([])
})

it('ignores self, app, stale and read-only approvals, and counts a fresh authorized native review (#726 AC-3)', async () => {
  const at = '2026-11-23T08:01:00Z'
  const user = (login: string) => ({ login, type: 'User' })
  const comment = (login: string, when = at) => ({
    user: user(login),
    created_at: when,
    updated_at: when,
    body: '/approve',
  })
  vi.stubEnv(
    'PAIR_TEST_COMMENTS',
    JSON.stringify([
      comment('author'),
      comment('reader'),
      comment('maintainer', '2026-11-23T07:59:00Z'),
      { ...comment('maintainer'), performed_via_github_app: { id: 12 } },
    ]),
  )
  vi.stubEnv(
    'PAIR_TEST_REVIEWS',
    JSON.stringify([
      { user: user('maintainer'), submitted_at: at, state: 'APPROVED', commit_id: 'b'.repeat(40) },
      { user: user('maintainer'), submitted_at: at, state: 'APPROVED', commit_id: sha },
    ]),
  )
  const approvals = approvalPlatform((action, card, data) =>
    workflowOperation(() => scripts, dir, { action, card, data }),
  )
  await expect(
    approvals.answers(
      '726',
      { pr: 735, head: sha, since: '2026-11-23T08:00:00Z', notified: true },
      { verdict: 'approved' },
    ),
  ).resolves.toEqual([{ channel: 'review', login: 'maintainer', verdict: 'approved' }])
})

it('accepts a fresh authorized card comment and a flag by the authenticated writer (#726 T-9/10)', async () => {
  const at = '2026-11-23T08:01:00Z'
  const park = { pr: 735, head: sha, since: '2026-11-23T08:00:00Z', notified: true }
  vi.stubEnv(
    'PAIR_TEST_COMMENTS',
    JSON.stringify([
      {
        user: { login: 'maintainer', type: 'User' },
        created_at: at,
        updated_at: at,
        body: '/reject Fix the gate',
      },
    ]),
  )
  const approvals = approvalPlatform((action, card, data) =>
    workflowOperation(() => scripts, dir, { action, card, data }),
  )
  await expect(approvals.answers('726', park)).resolves.toEqual([
    { channel: 'comment', login: 'maintainer', verdict: 'rejected', note: 'Fix the gate' },
  ])
  vi.stubEnv('PAIR_TEST_COMMENTS', '[]')
  vi.stubEnv('PAIR_TEST_ACTOR', JSON.stringify({ login: 'maintainer', type: 'User' }))
  await expect(approvals.answers('726', park, { verdict: 'approved' })).resolves.toEqual([
    { channel: 'flag', login: 'maintainer', verdict: 'approved' },
  ])
})

it('refuses to merge a draft or a moved head before any mutation (#726 T-12)', async () => {
  const payload = { pr: 735, head: 'b'.repeat(40), approvedBy: 'maintainer', root: dir }
  const merge = (data: typeof payload) =>
    workflowOperation(() => scripts, dir, { action: 'merge', card: '726', data })
  await expect(merge(payload)).resolves.toMatchObject({ status: 'failed', reason: 'head-moved' })
  vi.stubEnv('PAIR_TEST_DRAFT', 'true')
  await expect(merge({ ...payload, head: sha })).resolves.toMatchObject({
    status: 'failed',
    reason: 'pr-is-draft',
  })
})

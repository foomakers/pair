import { runChecks } from '@pair/workflows'
import { spawnSync } from 'node:child_process'
import { join } from 'node:path'
import { beforeEach, expect, it, vi } from 'vitest'
import { workflowFacts, workflowOperation } from './workflow-facts'
import { runHostProcess } from './host-process'
import { approvalPlatform } from './workflow-approval'

const scripts = join(__dirname, '../../../../../.claude/skills/pair-workflow-cycle/scripts')
const sha = 'a'.repeat(40)
const dir = '/project'
const adoptionPath = join(dir, '.pair/adoption/tech/way-of-working.md')
let adoption: string | undefined
const pr = (number: number) => ({
  number,
  body: 'Refs: #726',
  state: 'open',
  head: { repo: { full_name: 'foomakers/pair' } },
  base: { repo: { full_name: 'foomakers/pair' } },
})

vi.mock('node:child_process', () => ({ spawnSync: vi.fn() }))
vi.mock('node:fs', async importOriginal => ({
  ...(await importOriginal<typeof import('node:fs')>()),
  readdirSync: () => ['github.mjs'],
  realpathSync: (path: string) => path,
  existsSync: (path: string) => path === adoptionPath && adoption !== undefined,
  readFileSync: (path: string) => {
    if (path === adoptionPath && adoption !== undefined) return adoption
    throw new Error('Unexpected filesystem read: ' + path)
  },
}))
vi.mock('./host-process', () => ({ runHostProcess: vi.fn() }))

const ok = (stdout: string) => ({ status: 0, stdout, stderr: '' })
const json = (value: unknown) => ok(JSON.stringify(value))
const httpError = (status: number) => ({ status: 1, stdout: '', stderr: `gh: HTTP ${status}` })
const fixture = {
  pulls: [pr(735)],
  head: sha,
  checks: [] as object[],
  statuses: [] as object[],
  required: 404 as
    | number
    | { contexts?: string[]; checks?: { context: string; app_id?: number }[] },
  branchProtected: false,
  rules: [] as object[],
  machine: '',
  actor: { login: 'reader', type: 'User' },
  comments: [] as object[],
  reviews: [] as object[],
  card: { state: 'OPEN' } as { state: string; stateReason?: string },
  draft: false,
  solo: 'false',
}
let github: typeof fixture
const transport = vi.mocked(spawnSync)

function respondChecks(endpoint: string) {
  if (endpoint.endsWith('/branches/release%2Fnext/protection/required_status_checks'))
    return typeof github.required === 'number' ? httpError(github.required) : json(github.required)
  if (endpoint.includes('/rules/branches/release%2Fnext?')) return json(github.rules)
  if (endpoint.endsWith('/branches/release%2Fnext'))
    return json({ protected: github.branchProtected })
  if (endpoint.includes('/actions/variables?')) return ok(github.machine)
  const commit = `/commits/${github.head}`
  if (endpoint.includes(commit + '/check-runs')) return json({ check_runs: github.checks })
  if (endpoint.includes(commit + '/status')) return json({ statuses: github.statuses })
  throw new Error('Unexpected GitHub endpoint: ' + endpoint)
}

function respondApi(endpoint: string) {
  if (endpoint === 'user') return json(github.actor)
  if (endpoint.includes('/pulls?state=all')) return json(github.pulls)
  if (endpoint.endsWith('/pulls/735'))
    return json({
      number: 735,
      head: { sha: github.head, ref: 'feature/US-726-test' },
      base: { ref: 'release/next' },
      user: { login: 'author' },
      draft: github.draft,
    })
  if (endpoint.includes('/collaborators/'))
    return json({ permission: /\/(maintainer|author)\//.test(endpoint) ? 'write' : 'read' })
  if (endpoint.includes('/reviews?')) return json(github.reviews)
  if (endpoint.endsWith('/issues/726/comments')) return json(github.comments)
  return respondChecks(endpoint)
}

function respond(args: readonly string[]) {
  switch (args.slice(0, 2).join(' ')) {
    case 'pr view':
      return ok(github.head)
    case 'repo view':
      return ok('foomakers/pair')
    case 'pr merge':
      return ok('')
    case 'variable get':
      return ok(args[2] === 'PAIR_SOLO_APPROVAL_TOKEN' ? github.solo : 'maintainer')
    case 'issue view':
      return args[2] === '726'
        ? ok('## Dependencies\n\n**Prerequisite Stories**: #42')
        : json(github.card)
    default:
      if (args[0] === 'api')
        return respondApi(args[1] === '--paginate' ? String(args[2]) : String(args[1]))
      throw new Error('Unexpected GH call: ' + args.join(' '))
  }
}

function soloPolicy(bin: string, args: readonly string[], options: unknown) {
  expect(bin).toBe('bash')
  expect(args.slice(-2)).toEqual([github.head, 'author'])
  const { input } = options as { input: string }
  const [candidate] = JSON.parse(input) as { body: string; user: { login: string } }[]
  return ok(candidate?.body === '/approve ' + github.head ? candidate.user.login : '')
}

beforeEach(() => {
  adoption = undefined
  github = { ...fixture }
  transport.mockReset().mockImplementation((bin, args, options) => {
    if (!Array.isArray(args)) throw new Error('Missing argv for ' + bin)
    const result = bin === 'gh' ? respond(args) : soloPolicy(bin, args, options)
    return { ...result, pid: 1, signal: null, output: [] }
  })
  vi.mocked(runHostProcess).mockImplementation(async (bin, args, cwd) => {
    expect(bin).toBe(process.execPath)
    expect(args[0]).toBe(join(scripts, 'workflow-facts.mjs'))
    const originalArgv = process.argv
    const originalExitCode = process.exitCode
    const pwd = vi.spyOn(process, 'cwd').mockReturnValue(cwd)
    const stdout = vi.spyOn(console, 'log').mockImplementation(() => undefined)
    const stderr = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    try {
      process.argv = [bin, ...args]
      process.exitCode = 0
      vi.resetModules()
      // @ts-expect-error The installed script is JavaScript.
      await import('../../../../../.claude/skills/pair-workflow-cycle/scripts/workflow-facts.mjs')
      return {
        status: Number(process.exitCode),
        stdout: stdout.mock.calls.flat().join('\n'),
        stderr: stderr.mock.calls.flat().join('\n'),
      }
    } finally {
      process.argv = originalArgv
      process.exitCode = originalExitCode
      pwd.mockRestore()
      stdout.mockRestore()
      stderr.mockRestore()
    }
  })
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
  github.pulls = [pr(735), pr(736)]
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
    github.checks = rows
    await expect(facts(dir).ci()).resolves.toBe(expected)
  },
)

it('counts only a successful pair-review signal on the current head (#726 T-3)', async () => {
  github.checks = [{ name: 'pair-review', status: 'completed', conclusion: 'success' }]
  await expect(facts(dir).reviewApproved()).resolves.toBe(true)
  github.checks = []
  await expect(facts(dir).reviewApproved()).resolves.toBe(false)
})

it('refuses facts from a replacement head after the head check (#726 AC-2)', async () => {
  const gate = facts(dir, ['head-unchanged', 'ci-green', 'review-approved'])
  await expect(gate.head()).resolves.toBe(sha)
  github.head = 'b'.repeat(40)
  await expect(gate.ci()).rejects.toThrow(/head moved/i)
  await expect(gate.reviewApproved()).rejects.toThrow(/head moved/i)
})

it('keeps an open prerequisite blocked until the tracker confirms completion (#726 T-4)', async () => {
  await expect(facts(dir).openPrerequisites()).resolves.toEqual(['42'])
  github.card = { state: 'CLOSED', stateReason: 'COMPLETED' }
  await expect(facts(dir).openPrerequisites()).resolves.toEqual([])
})

it('ignores self, app, stale and read-only approvals, and counts a fresh authorized native review (#726 AC-3)', async () => {
  const at = '2026-11-23T08:01:00Z'
  const user = (login: string) => ({ login, type: 'User' })
  const comment = (login: string, when = at) => ({
    user: user(login),
    created_at: when,
    updated_at: when,
    body: '/approve #735 ' + sha,
  })
  github.comments = [
    comment('author'),
    comment('reader'),
    comment('maintainer', '2026-11-23T07:59:00Z'),
    { ...comment('maintainer'), performed_via_github_app: { id: 12 } },
  ]
  github.reviews = [
    { user: user('maintainer'), submitted_at: at, state: 'APPROVED', commit_id: 'b'.repeat(40) },
    { user: user('maintainer'), submitted_at: at, state: 'APPROVED', commit_id: sha },
  ]
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
  github.comments = [
    {
      user: { login: 'maintainer', type: 'User' },
      created_at: at,
      updated_at: at,
      body: '/reject #735 ' + sha + ' Fix the gate',
    },
  ]
  const approvals = approvalPlatform((action, card, data) =>
    workflowOperation(() => scripts, dir, { action, card, data }),
  )
  await expect(approvals.answers('726', park)).resolves.toEqual([
    { channel: 'comment', login: 'maintainer', verdict: 'rejected', note: 'Fix the gate' },
  ])
  github.comments = []
  github.actor = { login: 'maintainer', type: 'User' }
  await expect(approvals.answers('726', park, { verdict: 'approved' })).resolves.toEqual([
    { channel: 'flag', login: 'maintainer', verdict: 'approved' },
  ])
})

it('refuses to merge a draft or a moved head before any mutation (#726 T-12)', async () => {
  const payload = { pr: 735, head: 'b'.repeat(40), approvedBy: 'maintainer', root: dir }
  const merge = (data: typeof payload) =>
    workflowOperation(() => scripts, dir, { action: 'merge', card: '726', data })
  await expect(merge(payload)).resolves.toMatchObject({ status: 'failed', reason: 'head-moved' })
  github.draft = true
  await expect(merge({ ...payload, head: sha })).resolves.toMatchObject({
    status: 'failed',
    reason: 'pr-is-draft',
  })
})

it('accepts only a current-head approval token from the author when solo approval is enabled (#726 AC-3)', async () => {
  const at = '2026-11-23T08:01:00Z'
  const comment = (body: string) => ({
    user: { login: 'author', type: 'User' },
    author_association: 'OWNER',
    created_at: at,
    updated_at: at,
    body,
  })
  const approvals = approvalPlatform((action, card, data) =>
    workflowOperation(() => scripts, dir, { action, card, data }),
  )
  const park = { pr: 735, head: sha, since: '2026-11-23T08:00:00Z', notified: true }
  github.actor = { login: 'author', type: 'User' }
  github.comments = [comment('/approve ' + sha)]
  await expect(approvals.answers('726', park)).resolves.toEqual([])
  github.solo = 'True'
  github.comments = [comment('/approve ' + 'b'.repeat(40)), comment('> /approve ' + sha)]
  await expect(approvals.answers('726', park, { verdict: 'approved' })).resolves.toEqual([])
  github.comments = [comment('/approve ' + sha)]
  await expect(approvals.answers('726', park)).resolves.toEqual([
    { channel: 'comment', login: 'author', verdict: 'approved', note: sha },
  ])
})

it.each([undefined, '**Review identity**: `user`\n'])(
  'excludes the repository machine account across adoption drift (%s, #726 AC-3)',
  async declaration => {
    adoption = declaration
    github.machine = 'maintainer'
    github.actor = { login: 'maintainer', type: 'User' }
    const approvals = approvalPlatform((action, card, data) =>
      workflowOperation(() => scripts, dir, { action, card, data }),
    )
    const park = { pr: 735, head: sha, since: '2026-11-23T08:00:00Z', notified: true }
    await expect(approvals.answers('726', park, { verdict: 'approved' })).resolves.toEqual([])
    await expect(
      workflowOperation(() => scripts, dir, {
        action: 'merge',
        card: '726',
        data: { pr: 735, head: sha, approvedBy: 'maintainer', root: dir },
      }),
    ).resolves.toMatchObject({ reason: 'approval-no-longer-authorized' })
  },
)

it('rechecks the solo token at merge and requests the exact approved head (#726 AC-3/4)', async () => {
  const at = '2026-11-23T08:01:00Z'
  github.comments = [
    {
      user: { login: 'author', type: 'User' },
      author_association: 'OWNER',
      created_at: at,
      updated_at: at,
      body: '/approve ' + sha,
    },
  ]
  const merge = () =>
    workflowOperation(() => scripts, dir, {
      action: 'merge',
      card: '726',
      data: { pr: 735, head: sha, approvedBy: 'author', root: dir },
    })
  const mergeCall = () =>
    transport.mock.calls.find(
      ([, args]) => Array.isArray(args) && args[0] === 'pr' && args[1] === 'merge',
    )?.[1]
  await expect(merge()).resolves.toMatchObject({ reason: 'approval-no-longer-authorized' })
  expect(mergeCall()).toBeUndefined()
  github.solo = 'true'
  await expect(merge()).resolves.toMatchObject({ reason: 'merge-not-confirmed' })
  expect(mergeCall()).toEqual(['pr', 'merge', '735', '--squash', '--match-head-commit', sha])
})

const check = (name: string, conclusion = 'success') => ({ name, status: 'completed', conclusion })

it.each([
  {
    name: 'missing required context',
    required: { contexts: ['build', 'test'] },
    checks: [check('build')],
    expected: 'pending',
  },
  {
    name: 'all required contexts passed',
    required: {
      contexts: ['build'],
      checks: [
        { context: 'test' },
        { context: 'pair-review' },
        { context: 'pair-explicit-approval' },
      ],
    },
    checks: [
      check('build'),
      check('test'),
      check('optional', 'failure'),
      check('pair-review', 'failure'),
    ],
    expected: 'green',
  },
  {
    name: 'required failure',
    required: { contexts: ['build', 'test'] },
    checks: [check('build', 'failure')],
    expected: 'red',
  },
  {
    name: 'required check skipped',
    required: { contexts: ['build'] },
    checks: [check('build', 'skipped')],
    expected: 'red',
  },
  {
    name: 'no mechanical evidence',
    required: 404,
    checks: [check('pair-review')],
    expected: 'pending',
  },
])('uses the target base inventory for $name (726-ac1-ci-required-contexts)', async row => {
  github.required = row.required
  github.checks = row.checks
  await expect(facts(dir, ['head-unchanged', 'ci-green']).ci()).resolves.toBe(row.expected)
})

it.each(['classic', 'ruleset'] as const)(
  'requires CI from the configured %s publisher (#726 AC-1)',
  async source => {
    const context = 'build'
    if (source === 'classic')
      github.required = { contexts: [context], checks: [{ context, app_id: 17 }] }
    else
      github.rules = [
        {
          type: 'required_status_checks',
          parameters: {
            required_status_checks: [{ context, integration_id: 17 }],
          },
        },
      ]
    github.checks = [{ ...check(context), app: { id: 88 } }]
    github.statuses = [{ context, state: 'success' }]
    await expect(facts(dir).ci()).resolves.toBe('pending')
    github.checks.unshift({ ...check(context, 'failure'), app: { id: 17 } })
    await expect(facts(dir).ci()).resolves.toBe('red')
    github.checks[0] = { ...check(context), app: { id: 17 } }
    await expect(facts(dir).ci()).resolves.toBe('green')
  },
)

it('waits only to the deadline when a required CI context never reports (#726 AC-1)', async () => {
  github.required = { contexts: ['build', 'test'] }
  github.checks = [check('build')]
  let now = 0
  await expect(
    runChecks(['ci-green'], facts(dir), {
      timeoutMinutes: 1,
      now: () => now,
      sleep: async ms => {
        now += ms
      },
    }),
  ).resolves.toMatchObject({ status: 'failed', reason: 'ci-timeout' })

  github.statuses = [{ context: 'test', state: 'success' }]
  await expect(facts(dir).ci()).resolves.toBe('green')
})

it.each([401, 403, 404])(
  'refuses an unreadable requirement inventory (%s, #726 AC-1)',
  async status => {
    github.required = status
    github.branchProtected = true
    github.checks = [check('build')]
    await expect(facts(dir, ['ci-green']).ci()).rejects.toThrow('HTTP ' + status)
  },
)

it('ignores late comments without a matching target and accepts a matching approval (726-ac3-comment-head-binding)', async () => {
  const park = { pr: 735, head: sha, since: '2026-11-23T08:00:00Z', notified: true }
  const at = '2026-11-23T08:01:00Z'
  const comment = (body: string) => ({
    user: { login: 'maintainer', type: 'User' },
    created_at: at,
    updated_at: at,
    body,
  })
  const approvals = approvalPlatform((action, card, data) =>
    workflowOperation(() => scripts, dir, { action, card, data }),
  )
  github.comments = [
    comment('/approve'),
    comment('/approve ' + sha),
    comment('/approve #736 ' + sha),
    comment('/approve #735 ' + 'b'.repeat(40)),
    comment('/reject #735 ' + 'b'.repeat(40) + ' Earlier head'),
  ]
  await expect(approvals.answers('726', park)).resolves.toEqual([])
  github.comments.push(comment('/approve #735 ' + sha + ' Good to merge'))
  await expect(approvals.answers('726', park)).resolves.toEqual([
    { channel: 'comment', login: 'maintainer', verdict: 'approved', note: 'Good to merge' },
  ])
})

it('refuses closure of an open PR before attempting a merge (#726 AC-4)', async () => {
  await expect(
    workflowOperation(() => scripts, dir, {
      action: 'merge',
      card: '726',
      data: { pr: 735, head: sha, approvedBy: 'maintainer', root: dir, closureOnly: true },
    }),
  ).resolves.toMatchObject({ reason: 'merge-not-confirmed' })
  expect(
    transport.mock.calls.some(
      ([, args]) => Array.isArray(args) && args[0] === 'pr' && args[1] === 'merge',
    ),
  ).toBe(false)
})

it.each([
  [735, 'head-moved'],
  [736, 'pr-changed'],
] as const)('preserves the answer-read mismatch for PR %s (#726 AC-4)', async (pr, reason) => {
  github.head = 'b'.repeat(40)
  await expect(
    workflowOperation(() => scripts, dir, {
      action: 'approval-answers',
      card: '726',
      data: { pr, head: sha, since: '2026-11-23T08:00:00Z' },
    }),
  ).resolves.toEqual({ reason })
})

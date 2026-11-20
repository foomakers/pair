import childProcess from 'node:child_process'
import { syncBuiltinESMExports } from 'node:module'
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { expect, it, vi } from 'vitest'
import repairRows from './fixtures/host-pm-recovery-repair.json'

// #601 AC1/AC4, r0-3: real adapters and subprocesses; only host binaries and time are fake.
const root = resolve(__dirname, '../../../../..')
const stages = ['cycle', 'red-spec', 'red-verify', 'implement-phase', 'green-fix', 'review-phase']
const copies = stages.flatMap(stage => [
  {
    name: `dataset-${stage}`,
    scripts: `packages/knowledge-hub/dataset/.skills/workflow/${stage}/scripts`,
  },
  { name: `installed-${stage}`, scripts: `.claude/skills/pair-workflow-${stage}/scripts` },
])
type Host = 'azure-devops' | 'linear'
type Reply = { stdout: string; stderr: string; code: number; headers?: Record<string, string> }
type Case = {
  id: string
  host: Host
  operation: string
  replies: Reply[]
  attempts: number
  delays: number[]
  value?: unknown
  kind?: string
  elapsedPerCall?: number
  oversleep?: boolean
  native?: boolean
  requireHeader?: boolean
  expectedTimeouts?: number[]
  expectedElapsed?: number
}
const hosts: Host[] = ['azure-devops', 'linear']
const sha = 'a'.repeat(40)
const issue = {
  id: 'uuid-601',
  identifier: 'ENG-601',
  description: 'fixture body',
  title: 'fixture',
  url: 'https://linear.app/fixture/issue/ENG-601',
  team: { id: 'team', key: 'ENG' },
  state: { name: 'Ready', type: 'unstarted' },
  labels: { nodes: [] },
}
const wi = {
  id: 601,
  fields: {
    'System.Description': 'fixture body',
    'System.Title': 'fixture',
    'System.State': 'Ready',
  },
  url: 'https://dev.azure.com/fixture/project/_apis/wit/workItems/601',
}
const ok = (stdout: string): Reply => ({ stdout, stderr: '', code: 0 })
const json = (value: unknown) => ok(JSON.stringify(value))
const gql = (data: unknown, status = 200) => ok(`${JSON.stringify({ data })}\n${status}`)
const transport = (stderr: string): Reply => ({ stdout: '', stderr, code: 1 })
const http = (host: Host, status: number): Reply =>
  host === 'linear' ? ok(`{}\n${status}`) : transport(`HTTP ${status}`)
const good = (host: Host) => (host === 'linear' ? gql({ issue }) : json(wi))
const limited = ok('{"errors":[{"message":"limited","extensions":{"code":"RATELIMITED"}}]}\n200')
const cases: Case[] = []
function add(host: Host, id: string, replies: Reply[], expected: Partial<Case> = {}) {
  cases.push({
    host,
    id: `${host}-${id}`,
    operation: 'readCard',
    replies,
    attempts: 1,
    delays: [],
    ...expected,
  })
}
for (const host of hosts) {
  add(host, 'success', [good(host)], { value: { body: 'fixture body' } })
  for (const status of [429, 500, 503, 599]) {
    add(host, `http-${status}-recover`, [http(host, status), good(host)], {
      attempts: 2,
      delays: [1000],
      value: { body: 'fixture body' },
    })
    add(host, `http-${status}-exhaust`, [http(host, status)], {
      attempts: 4,
      delays: [1000, 2000, 4000],
      kind: 'transient-exhausted',
    })
  }
  for (const diagnostic of ['ECONNRESET', 'EAI_AGAIN', 'ETIMEDOUT']) {
    add(host, `${diagnostic}-recover`, [transport(diagnostic), good(host)], {
      attempts: 2,
      delays: [1000],
      value: { body: 'fixture body' },
    })
  }
  for (const status of [400, 401, 403, 404, 422])
    add(host, `permanent-${status}`, [http(host, status), good(host)], { kind: 'failed' })
  add(host, 'unknown', [transport('unrecognized failure'), good(host)], { kind: 'failed' })
  add(host, 'transient-then-permanent', [http(host, 503), http(host, 403), good(host)], {
    attempts: 2,
    delays: [1000],
    kind: 'failed',
  })
  add(
    host,
    'retry-after-fits',
    [
      host === 'linear'
        ? { ...http(host, 429), headers: { 'Retry-After': '2' } }
        : transport('HTTP 429 Retry-After: 2'),
      good(host),
    ],
    {
      attempts: 2,
      delays: [2000],
      value: { body: 'fixture body' },
      native: host === 'linear',
      requireHeader: host === 'linear',
    },
  )
  add(host, 'retry-after-exceeds', [transport('HTTP 429 Retry-After: 31'), good(host)], {
    kind: 'transient-exhausted',
  })
  add(host, 'elapsed-budget', [transport('HTTP 503'), good(host)], {
    kind: 'transient-exhausted',
    elapsedPerCall: 29_500,
  })
  add(host, 'late-wake', [transport('HTTP 503'), good(host)], {
    kind: 'transient-exhausted',
    delays: [1000],
    oversleep: true,
  })
  for (const failure of ['reset', 'http-503', 'http-429']) {
    const response =
      failure === 'reset' ? transport('ECONNRESET') : http(host, Number(failure.slice(5)))
    add(host, `update-${failure}`, [response, good(host)], {
      operation: 'updateCard',
      kind: 'transient-exhausted',
    })
  }
  add(host, 'malformed-success', [ok(host === 'linear' ? 'not json\n200' : 'not json')], {
    kind: 'invalid-json',
  })
}
add('linear', 'raw-http-503', [ok('upstream unavailable\n503'), good('linear')], {
  attempts: 2,
  delays: [1000],
  value: { body: 'fixture body' },
})
add('linear', 'graphql-limit-recover', [limited, good('linear')], {
  attempts: 2,
  delays: [1000],
  value: { body: 'fixture body' },
})
add('linear', 'graphql-limit-exhaust', [limited], {
  attempts: 4,
  delays: [1000, 2000, 4000],
  kind: 'transient-exhausted',
})
add('linear', 'graphql-permanent', [ok('{"errors":[{"message":"invalid query"}]}\n200')], {
  kind: 'failed',
})
add('linear', 'update-graphql-limit', [limited], {
  operation: 'updateCard',
  kind: 'transient-exhausted',
})

// All distinct Azure command/HTTP intent grammars; GraphQL query vs mutation uses HTTP POST.
const boundaryReads = [
  {
    host: 'azure-devops' as Host,
    operation: 'listCards',
    reply: json([{ id: 601 }]),
    value: [{ id: '601' }],
  },
  {
    host: 'azure-devops' as Host,
    operation: 'prHead',
    reply: json({ lastMergeSourceCommit: { commitId: sha } }),
    value: sha,
  },
  { host: 'azure-devops' as Host, operation: 'linkedPr', reply: json([]), value: 'none' },
  {
    host: 'azure-devops' as Host,
    operation: 'readLabels',
    reply: json({ value: [{ name: 'risk:red' }] }),
    value: ['risk:red'],
  },
  {
    host: 'azure-devops' as Host,
    operation: 'deleteBranchAbsent',
    reply: json([]),
    value: { deleted: false, gone: true },
  },
  {
    host: 'linear' as Host,
    operation: 'listCards',
    reply: gql({ issues: { nodes: [], pageInfo: { hasNextPage: false } } }),
    value: [],
  },
  {
    host: 'linear' as Host,
    operation: 'findCards',
    reply: gql({ issues: { nodes: [] } }),
    value: [],
  },
]
for (const row of boundaryReads)
  add(row.host, `intent-${row.operation}`, [http(row.host, 503), row.reply], {
    operation: row.operation,
    attempts: 2,
    delays: [1000],
    value: row.value,
  })
for (const operation of ['createCard', 'merge', 'mergePinned'])
  add('azure-devops', `intent-${operation}`, [transport('ECONNRESET')], {
    operation,
    kind: 'transient-exhausted',
  })
add(
  'linear',
  'intent-createCard',
  [gql({ teams: { nodes: [{ id: 'team' }] } }), transport('ECONNRESET')],
  { operation: 'createCard', attempts: 2, kind: 'transient-exhausted' },
)
for (const method of ['POST', 'DELETE'])
  add(
    'azure-devops',
    `intent-${method}`,
    [
      json({ value: method === 'POST' ? [] : [{ name: 'pr-state:not-approved' }] }),
      transport('ECONNRESET'),
    ],
    {
      operation: 'setPrState',
      attempts: 2,
      value: {
        applied: 'pr-state:ready-to-merge',
        removed: [],
        confirmed: false,
        error: expect.stringContaining('host-transient:'),
      },
    },
  )
add(
  'azure-devops',
  'intent-deleteBranch',
  [json([{ name: 'refs/heads/fixture', objectId: sha }]), transport('ECONNRESET')],
  { operation: 'deleteBranch', attempts: 2, kind: 'transient-exhausted' },
)
for (const host of hosts)
  add(
    host,
    'update-success',
    [host === 'linear' ? gql({ issueUpdate: { success: true } }) : json(wi)],
    { operation: 'updateCard', value: { id: host === 'linear' ? 'ENG-601' : '601' } },
  )

const marker = '<!-- pair:601-r0-3 -->'
for (const state of ['confirmed', 'absent', 'ambiguous', 'mismatch']) {
  const full = `${marker}\ntext`
  const hit = {
    id: 'comment-1',
    url: 'https://linear.app/comment/1',
    body: state === 'mismatch' ? `${marker}\nother` : full,
  }
  const nodes =
    state === 'absent' ? [] : state === 'ambiguous' ? [hit, { ...hit, id: 'comment-2' }] : [hit]
  add(
    'linear',
    `comment-${state}`,
    [
      gql({ issue: { ...issue, comments: { nodes: [] } } }),
      gql({ issue }),
      http('linear', 503),
      gql({ issue: { ...issue, comments: { nodes } } }),
    ],
    {
      operation: 'commentOnCard',
      attempts: 4,
      ...(state === 'confirmed'
        ? { value: { action: 'created', id: hit.id, url: hit.url, marker } }
        : { kind: 'transient-exhausted' }),
    },
  )
}

// Query prerequisites, page boundaries and reconciliation reads retain read intent.
add(
  'linear',
  'create-prerequisite-recover',
  [
    http('linear', 503),
    gql({ teams: { nodes: [{ id: 'team' }] } }),
    gql({
      issueCreate: {
        success: true,
        issue: { identifier: 'ENG-602', url: 'https://linear.app/issue/ENG-602' },
      },
    }),
  ],
  {
    operation: 'createCard',
    attempts: 3,
    delays: [1000],
    value: { number: 'ENG-602', url: 'https://linear.app/issue/ENG-602' },
  },
)
add(
  'linear',
  'pagination-recover',
  [
    gql({
      issues: {
        nodes: [{ identifier: 'ENG-601', description: '## Story Statement' }],
        pageInfo: { hasNextPage: true, endCursor: 'page1' },
      },
    }),
    http('linear', 503),
    gql({
      issues: {
        nodes: [{ identifier: 'ENG-602', description: '## Story Statement' }],
        pageInfo: { hasNextPage: false },
      },
    }),
  ],
  {
    operation: 'listCards',
    attempts: 3,
    delays: [1000],
    value: [{ id: 'ENG-601' }, { id: 'ENG-602' }],
  },
)
add(
  'linear',
  'comment-readback-recover',
  [
    gql({ issue: { ...issue, comments: { nodes: [] } } }),
    gql({ issue }),
    http('linear', 503),
    http('linear', 503),
    gql({
      issue: {
        ...issue,
        comments: {
          nodes: [
            { id: 'comment-1', url: 'https://linear.app/comment/1', body: `${marker}\ntext` },
          ],
        },
      },
    }),
  ],
  {
    operation: 'commentOnCard',
    attempts: 5,
    delays: [1000],
    value: { action: 'created', id: 'comment-1', url: 'https://linear.app/comment/1', marker },
  },
)
add('azure-devops', 'intent-findCards', [http('azure-devops', 503), json([])], {
  operation: 'findCards',
  attempts: 2,
  delays: [1000],
  value: [],
})
add('azure-devops', 'intent-listComments', [http('azure-devops', 503), json({ value: [] })], {
  operation: 'listComments',
  attempts: 2,
  delays: [1000],
  value: [],
})

// Repair of verifier counterexamples: #601 AC1 aggregate budget and AC4 unsafe replay.
cases.push(...(repairRows as Case[]))

const quote = (s: string) => `'${s.replaceAll("'", "'\\''")}'`
function fixture(replies: Reply[]) {
  const dir = mkdtempSync(join(tmpdir(), 'pair-pm-recovery-'))
  const bin = join(dir, 'host')
  writeFileSync(join(dir, 'count'), '0')
  const emit = (r: Reply) =>
    `printf '%s' ${quote(r.stdout)}; printf '%s' ${quote(r.stderr)} >&2; exit ${r.code}`
  writeFileSync(
    bin,
    `#!/bin/sh\nread n < ${quote(join(dir, 'count'))}\nn=$((n+1))\nprintf '%s' "$n" > ${quote(join(dir, 'count'))}\nprintf '%s\\n' "$@" > ${quote(dir)}/args-$n\ncase "$1" in -sS) /bin/cat > ${quote(dir)}/input-$n ;; esac\ncase "$n" in\n${replies.map((r, i) => `${i + 1}) ${emit(r)} ;;`).join('\n')}\n*) ${emit(replies[replies.length - 1]!)} ;;\nesac\n`,
  )
  if (replies.some(reply => reply.headers)) headerFixture(bin, dir, replies)
  chmodSync(bin, 0o755)
  writeFileSync(join(dir, 'gh'), '#!/bin/sh\nexit 91\n')
  chmodSync(join(dir, 'gh'), 0o755)
  return { dir, bin }
}

function readHeaderCount(dir: string) {
  try {
    return readFileSync(join(dir, 'headers-delivered'), 'utf8')
  } catch {
    return '0'
  }
}
function headerResponse(reply: Reply) {
  const at = reply.stdout.lastIndexOf('\n')
  const status = reply.stdout.slice(at + 1)
  const headers = `HTTP/1.1 ${status} Fixture\r\n${Object.entries(reply.headers ?? {})
    .map(([key, value]) => `${key}: ${value}\r\n`)
    .join('')}\r\n`
  const retryAfter = reply.headers?.['Retry-After'] ?? ''
  const headerJson = JSON.stringify(
    Object.fromEntries(
      Object.entries(reply.headers ?? {}).map(([key, value]) => [key.toLowerCase(), [value]]),
    ),
  )
  return `headers=${quote(headers)}
if [ "$include" = 1 ]; then printf '%s' "$headers"; delivered=1; fi
if [ -n "$dump" ]; then
  if [ "$dump" = - ]; then printf '%s' "$headers"; else printf '%s' "$headers" > "$dump"; fi
  delivered=1
fi
case "$format" in *'%header{'*|*'%{header_json}'*) delivered=1 ;; esac
replace '%{http_code}' ${quote(status)}
replace '%{response_code}' ${quote(status)}
replace '%header{retry-after}' ${quote(retryAfter)}
replace '%header{Retry-After}' ${quote(retryAfter)}
replace '%{header_json}' ${quote(headerJson)}
if [ "$delivered" = 1 ]; then printf '%s' "$n" > "$dir/headers-delivered"; fi
printf '%s' ${quote(reply.stdout.slice(0, at))}
printf '%b' "$format"
printf '%s' ${quote(reply.stderr)} >&2
exit ${reply.code}`
}
function headerFixture(bin: string, dir: string, replies: Reply[]) {
  writeFileSync(
    bin,
    `#!/bin/sh
dir=${quote(dir)}
read n < "$dir/count"
n=$((n+1))
printf '%s' "$n" > "$dir/count"
printf '%s\\n' "$@" > "$dir/args-$n"
/bin/cat > "$dir/input-$n"
dump=''; include=0; format=''; delivered=0
while [ "$#" -gt 0 ]; do
  case "$1" in
    -D|--dump-header) shift; dump=$1 ;;
    --dump-header=*) dump=\${1#--dump-header=} ;;
    -i|--include) include=1 ;;
    -w|--write-out) shift; format=$1 ;;
  esac
  shift
done
replace() {
  case "$format" in *"$1"*) format="\${format%%"$1"*}$2\${format#*"$1"}" ;; esac
}
case "$n" in
${replies.map((reply, i) => `${i + 1}) ${headerResponse(reply)} ;;`).join('\n')}
*) ${headerResponse(replies[replies.length - 1]!)} ;;
esac
`,
  )
}

type Adapter = Record<string, (...args: unknown[]) => unknown>
function call(adapter: Adapter, row: Case) {
  const id = row.host === 'linear' ? 'ENG-601' : '601'
  if (row.operation === 'readCard') return adapter['readCard']!(id)
  if (row.operation === 'deleteBranchAbsent')
    return adapter['deleteBranch']!({ branch: 'fixture', repo: 'project/repo' })
  if (row.operation === 'mergePinned')
    return adapter['merge']!({ pr: 682, repo: 'project/repo', headSha: sha })
  return adapter[row.operation]!({
    id,
    body: 'text',
    title: 'title',
    repo: 'project/repo',
    pr: 682,
    label: 'pr-state:ready-to-merge',
    branch: 'fixture',
    marker,
    search: 'fixture',
  })
}
async function runAdapter(scripts: string, row: Case) {
  const { default: definition } = await import(
    pathToFileURL(resolve(root, scripts, `host/${row.host}.mjs`)).href
  )
  const f = fixture(row.replies)
  const delays: number[] = []
  const timeouts: number[] = []
  const requests: string[] = []
  let elapsed = 0
  let attempts = 0
  const native =
    row.native ||
    ['success', 'http-503-recover', 'http-503-exhaust', 'update-reset', 'permanent-403'].some(
      id => row.id === `${row.host}-${id}`,
    )
  vi.stubEnv('LINEAR_API_KEY', 'fixture-not-a-secret')
  vi.stubEnv('PATH', `${f.dir}:/usr/bin:/bin`)
  vi.spyOn(Date, 'now').mockImplementation(() => elapsed)
  vi.spyOn(Atomics, 'wait').mockImplementation((_array, _index, _value, ms) => {
    delays.push(Number(ms))
    elapsed += row.oversleep ? 30_001 : Number(ms)
    return 'timed-out'
  })
  const spawn = childProcess.spawnSync
  vi.spyOn(childProcess, 'spawnSync').mockImplementation((...args: Parameters<typeof spawn>) => {
    if (args[0] === 'git') return spawn(...args)
    requests.push(String((args[2] as { input?: string })?.input ?? ''))
    const reply = row.replies[Math.min(attempts++, row.replies.length - 1)]!
    const result = native
      ? spawn(...args)
      : ({
          pid: 1,
          output: [null, reply.stdout, reply.stderr],
          stdout: reply.stdout,
          stderr: reply.stderr,
          status: reply.code,
          signal: null,
        } as ReturnType<typeof spawn>)
    if (args[0] !== 'git') {
      timeouts.push(Number((args[2] as { timeout?: number })?.timeout))
      elapsed += row.elapsedPerCall ?? 0
    }
    return result
  })
  syncBuiltinESMExports()
  vi.spyOn(process.stderr, 'write').mockReturnValue(true)
  let value: unknown
  let error: unknown
  try {
    const adapter = definition.instantiate({
      azBin: f.bin,
      curlBin: f.bin,
      team: 'ENG',
      wayOfWorking: '',
    })
    try {
      value = call(adapter, row)
    } catch (caught) {
      error = caught
    }
    return {
      value,
      error,
      delays,
      timeouts,
      attempts,
      requests,
      elapsed,
      headerDelivered: Number(readHeaderCount(f.dir)),
    }
  } finally {
    vi.restoreAllMocks()
    syncBuiltinESMExports()
    vi.unstubAllEnvs()
    rmSync(f.dir, { recursive: true, force: true })
  }
}
it.each(copies.flatMap(copy => cases.map(row => ({ ...copy, ...row }))))(
  'r0-3 $id $name',
  async row => {
    const result = await runAdapter(row.scripts, row)
    expect(result.attempts).toBe(row.attempts)
    expect(result.delays).toEqual(row.delays)
    if (row.operation === 'commentOnCard')
      expect(
        result.requests.filter(input => JSON.parse(input).query.startsWith('mutation ')),
      ).toHaveLength(1)
    if (row.kind) expect(result.error).toMatchObject({ kind: row.kind })
    else {
      expect(result.error).toBeUndefined()
      expect(result.value).toEqual(row.value)
    }
    expect(result.timeouts.every(ms => ms > 0 && ms <= 30_000)).toBe(true)
    if (row.requireHeader) expect(result.headerDelivered).toBeGreaterThan(0)
    if (row.expectedTimeouts) expect(result.timeouts).toEqual(row.expectedTimeouts)
    if (row.expectedElapsed !== undefined) expect(result.elapsed).toBe(row.expectedElapsed)
    if (row.operation === 'updateCard') expect(result.requests).toHaveLength(1)
    if (row.attempts === 4 && row.delays.length === 3 && !row.expectedTimeouts)
      expect(result.timeouts).toEqual([30_000, 29_000, 27_000, 23_000])
  },
)

// Real cycle-state consumers; all host traffic remains inside the executable fixture.
it.each(
  copies.flatMap(copy =>
    hosts.flatMap(host =>
      ['card', 'ac-hash'].flatMap(operation =>
        ['recover', 'exhaust'].map(outcome => ({ ...copy, host, operation, outcome })),
      ),
    ),
  ),
)('r0-3 CLI $host $operation $outcome $name', row => {
  const f = fixture(
    row.outcome === 'recover'
      ? [transport('HTTP 503 Retry-After: 0'), good(row.host)]
      : [transport('HTTP 503 Retry-After: 31')],
  )
  const adoption = join(f.dir, '.pair/adoption/tech')
  mkdirSync(adoption, { recursive: true })
  writeFileSync(
    join(adoption, 'way-of-working.md'),
    `- \`pm-tool\`: \`${row.host}\`\n- \`linear-team\`: \`ENG\`\n`,
  )
  const runDir = join(f.dir, '.pair/working/runs/probe', row.host === 'linear' ? 'ENG-601' : '601')
  mkdirSync(runDir, { recursive: true })
  try {
    const r = childProcess.spawnSync(
      process.execPath,
      [
        resolve(root, row.scripts, 'cycle-state.mjs'),
        row.operation,
        '--story',
        row.host === 'linear' ? 'ENG-601' : '601',
        '--dir',
        runDir,
      ],
      {
        cwd: f.dir,
        encoding: 'utf8',
        timeout: 5000,
        env: {
          ...process.env,
          PATH: `${f.dir}:/usr/bin:/bin`,
          PAIR_AZ_BIN: f.bin,
          PAIR_CURL_BIN: f.bin,
          PAIR_GH_BIN: join(f.dir, 'gh'),
          LINEAR_API_KEY: 'fixture-not-a-secret',
        },
      },
    )
    expect(r.error).toBeUndefined()
    const body = JSON.parse(r.stdout)
    if (row.outcome === 'recover') {
      expect(r.status).toBe(0)
      expect(r.stderr).toContain('outcome=retry')
      expect(r.stderr).toContain('outcome=recovered')
      expect(body).toMatchObject(
        row.operation === 'card'
          ? { body: 'fixture body' }
          : { acHash: expect.stringMatching(/^sha256:[a-f0-9]{64}$/) },
      )
      expect(Number(readFileSync(join(f.dir, 'count'), 'utf8'))).toBe(2)
    } else {
      expect(JSON.stringify(body)).toContain('host-transient:')
      expect(Number(readFileSync(join(f.dir, 'count'), 'utf8'))).toBe(1)
    }
  } finally {
    rmSync(f.dir, { recursive: true, force: true })
  }
})

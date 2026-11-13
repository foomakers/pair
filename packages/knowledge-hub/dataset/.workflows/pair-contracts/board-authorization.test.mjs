// r0-1: #642 Maintainer Decision — board-sync authorization (2026-11-13).
// Execute the shipped workflow shell. Only the privileged CLI/gh boundaries are stubs.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, writeFileSync, mkdirSync, mkdtempSync, rmSync, symlinkSync, existsSync } from 'node:fs'
import { join, dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { tmpdir } from 'node:os'
import { spawn, spawnSync } from 'node:child_process'
import { createRequire } from 'node:module'
import { runInNewContext } from 'node:vm'

let root = dirname(fileURLToPath(import.meta.url))
while (!existsSync(join(root, 'pnpm-workspace.yaml'))) root = dirname(root)
const { parse } = createRequire(join(root, 'packages/knowledge-hub/package.json'))('yaml')
const cases = JSON.parse(readFileSync(new URL('./board-authorization.rows.json', import.meta.url), 'utf8'))
const workflows = ['.github/workflows/pair-board-sync.yml', 'packages/knowledge-hub/dataset/.github/workflows/pair-board-sync.yml']
const events = [
  ['opened', false, 'open'], ['reopened', false, 'open'],
  ['ready_for_review', false, 'open'], ['closed', false, 'closed-unmerged'], ['closed', true, 'merged'],
]
const jq = spawnSync('/usr/bin/which', ['jq'], { encoding: 'utf8' }).stdout.trim()
assert.ok(jq, 'jq is required to execute workflow shell')

function evaluate(value, context) {
  if (typeof value !== 'string') return value
  const expression = value.replace(/^\$\{\{\s*|\s*\}\}$/g, '')
  return runInNewContext(expression, { ...context, success: () => true, always: () => true, contains: (a, b) => a.includes(b), fromJSON: JSON.parse, toJSON: JSON.stringify }, { timeout: 100 })
}
function expand(value, context) {
  return String(value).replace(/\$\{\{([\s\S]*?)\}\}/g, (_, expression) => String(evaluate(expression, context) ?? ''))
}
function stub(directory, name, body) {
  writeFileSync(join(directory, name), `#!${process.execPath}\n${body}\n`, { mode: 0o755 })
}
function shell(command, args, options) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { ...options, stdio: 'ignore' })
    child.once('error', reject)
    child.once('close', status => resolve({ status }))
  })
}
function logs(path) {
  return existsSync(path) ? readFileSync(path, 'utf8').trim().split('\n').filter(Boolean).map(JSON.parse) : []
}
function eventFor(row, action, merged) {
  const base = { id: 100, full_name: row.repo ?? 'acme/project' }
  return {
    action, number: 77, repository: base,
    sender: row.missingSender ? {} : { login: row.sender ?? 'event-sender', type: 'User' },
    pull_request: {
      number: 77, state: action === 'closed' ? 'closed' : 'open', merged,
      body: row.body ?? 'Closes #42', title: row.title ?? 'Update feature',
      author_association: row.association ?? 'NONE', user: { login: 'privileged-author', type: 'User' },
      head: { ref: row.branch ?? 'feature/work', repo: row.missingHead ? null : row.fork ? { id: 200, full_name: 'outsider/project', fork: true } : base, sha: '1'.repeat(40) },
      base: { ref: 'main', repo: row.missingBase ? null : base, sha: '2'.repeat(40) },
    },
  }
}
function setup(directory, row, event) {
  const bin = join(directory, 'bin')
  mkdirSync(bin)
  symlinkSync(jq, join(bin, 'jq'))
  for (const command of ['cat', 'grep', 'sed', 'tr', 'cut', 'head', 'tail']) symlinkSync(`/usr/bin/${command}`, join(bin, command))
  writeFileSync(join(bin, 'node'), `#!/bin/bash
case "$1" in
  */board-transition.mjs)
    jq -cn --argjson readBefore "$([ -s "$PROBE_READS" ] && echo true || echo false)" --args '{kind:"transition",readBefore:$readBefore,args:$ARGS.positional}' -- "$@" >> "$PROBE_WRITES"
    echo '{"confirmed":true}' ;;
  -e|--eval|-p|--print) exec ${JSON.stringify(process.execPath)} "$@" ;;
  *) echo 'Unexpected node invocation' >&2; exit 97 ;;
esac
`, { mode: 0o755 })
  stub(bin, 'gh', `
const { appendFileSync } = require('node:fs');
const { spawnSync } = require('node:child_process');
const args = process.argv.slice(2);
const endpoint = args.find(a => /repos\\//.test(a));
const method = args.findIndex(a => a === '-X' || a === '--method');
if (args[0] !== 'api' || (method >= 0 && args[method + 1] !== 'GET') || endpoint !== process.env.PROBE_ENDPOINT) {
  appendFileSync(process.env.PROBE_WRITES, JSON.stringify({ kind: 'unexpected-gh', args }) + '\\n');
  process.exit(96);
}
appendFileSync(process.env.PROBE_READS, JSON.stringify(args) + '\\n');
const row = JSON.parse(process.env.PROBE_ROW);
if (row.apiError) process.exit(1);
const payload = row.malformed ? 'not-json' : JSON.stringify(row.role === null ? {} : { permission: row.role, role_name: row.role, user: { login: row.sender ?? 'event-sender' } });
const filterAt = args.findIndex(a => a === '--jq' || a === '-q');
if (filterAt >= 0) {
  const r = spawnSync(${JSON.stringify(jq)}, ['-r', args[filterAt + 1]], { input: payload, encoding: 'utf8', timeout: 1000 });
  process.stdout.write(r.stdout ?? ''); process.exit(r.status ?? 95);
}
process.stdout.write(payload);
`)
  writeFileSync(join(directory, 'event.json'), JSON.stringify(event))
  writeFileSync(join(directory, 'output'), '')
  writeFileSync(join(directory, 'environment'), '')
  return {
    PATH: bin, HOME: directory, TMPDIR: directory,
    GITHUB_EVENT_PATH: join(directory, 'event.json'), GITHUB_EVENT_NAME: 'pull_request_target',
    GITHUB_REPOSITORY: event.repository.full_name, GITHUB_ACTOR: event.sender.login ?? '',
    GITHUB_OUTPUT: join(directory, 'output'), GITHUB_ENV: join(directory, 'environment'),
    GITHUB_WORKSPACE: directory, GH_TOKEN: 'fake-project-token', REPO: event.repository.full_name,
    PROBE_ENDPOINT: `repos/${event.repository.full_name}/collaborators/${event.sender.login}/permission`,
    PROBE_WRITES: join(directory, 'writes'), PROBE_READS: join(directory, 'reads'), PROBE_ROW: JSON.stringify(row),
  }
}
async function runWorkflow(workflow, row, action, merged) {
  const directory = mkdtempSync(join(tmpdir(), 'pair-board-auth-'))
  try {
    const event = eventFor(row, action, merged)
    const env = setup(directory, row, event)
    const context = { github: { event, event_name: 'pull_request_target', repository: event.repository.full_name, actor: event.sender.login ?? '', token: 'fake-token' }, secrets: { PAIR_PROJECT_TOKEN: 'fake-project-token' }, env, steps: {} }
    const doc = parse(readFileSync(resolve(root, workflow), 'utf8'))
    assert.deepEqual(doc.on.pull_request_target.types, ['opened', 'reopened', 'ready_for_review', 'closed'])
    let status = 0
    for (const job of Object.values(doc.jobs)) {
      if (job.if && !evaluate(job.if, context)) continue
      for (const step of job.steps) {
        if (step.if && !evaluate(step.if, context)) continue
        if (step.uses) {
          assert.match(step.uses, /^actions\/checkout@/, 'unsupported action needs a real executable boundary test')
          assert.ok(!step.with?.ref || expand(step.with.ref, context) === 'main', 'never checkout PR-controlled code')
          continue
        }
        assert.ok(step.run, 'workflow step must be executable')
        const localEnv = { ...env, ...Object.fromEntries(Object.entries(step.env ?? {}).map(([key, value]) => [key, expand(value, context)])) }
        const result = await shell('/bin/bash', ['--noprofile', '--norc', '-eo', 'pipefail', '-c', expand(step.run, context)], { cwd: directory, env: localEnv, encoding: 'utf8', timeout: 5000 })
        status = result.status ?? 98
        if (status !== 0) break
        if (step.id) context.steps[step.id] = { outputs: Object.fromEntries(readFileSync(env.GITHUB_OUTPUT, 'utf8').split('\n').filter(Boolean).map(line => [line.slice(0, line.indexOf('=')), line.slice(line.indexOf('=') + 1)])) }
        Object.assign(env, Object.fromEntries(readFileSync(env.GITHUB_ENV, 'utf8').split('\n').filter(Boolean).map(line => [line.slice(0, line.indexOf('=')), line.slice(line.indexOf('=') + 1)])))
      }
      if (status !== 0) break
    }
    return { status, writes: logs(env.PROBE_WRITES), reads: logs(env.PROBE_READS) }
  } finally { rmSync(directory, { recursive: true, force: true }) }
}
test('board authorization', { concurrency: 4 }, async suite => {
  await Promise.all(cases.map(row => suite.test(row.id, async () => {
    const mismatches = []
    for (const workflow of workflows) for (const [action, merged, state] of (row.allStates ? events : [events[3]])) {
      // A second fresh execution proves restart/replay must reauthorize this event.
      for (let replay = 0; replay < (row.replay ? 2 : 1); replay++) {
        const current = row.revoke && replay === 1 ? { ...row, role: 'read', allow: false } : row
        const result = await runWorkflow(workflow, current, action, merged)
        const expected = current.allow ? [{ kind: 'transition', story: String(current.story ?? 42), state, repo: current.repo ?? 'acme/project' }] : []
        const writes = result.writes.map(write => write.kind === 'transition' ? {
          kind: write.kind, story: write.args[write.args.indexOf('--story') + 1],
          state: write.args[write.args.indexOf('--pr-state') + 1], repo: write.args[write.args.indexOf('--repo') + 1],
        } : write)
        try {
          assert.equal(result.status, 0, 'unauthorized events must be a successful no-op')
          assert.deepEqual(writes, expected, 'privileged effects must match authorization and event state')
          if (row.bindIdentities && current.allow) assert.ok(result.reads.length > 0, 'event sender permission must be read')
          if (row.bindIdentities) assert.ok(result.reads.every(args => args.includes(`repos/${current.repo ?? 'acme/project'}/collaborators/${current.sender ?? 'event-sender'}/permission`)), 'lookup must bind event repository and sender')
          if (row.requireLookup || (row.bindIdentities && current.allow)) assert.ok(result.writes.every(write => write.readBefore === true), 'sender permission must be read server-side before writes')
        } catch (error) { mismatches.push({ workflow, action, merged, replay, actual: result, expected, message: error.message }) }
      }
    }
    assert.deepEqual(mismatches, [], JSON.stringify(mismatches))
  })))
})

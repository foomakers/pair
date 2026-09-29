// US-489 T-2 — the shared `## Cycle Hooks` executor, run for real: real shell commands, a real
// temp repo root, the real script both coordinators spawn. Run via `pnpm workflows:test`.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, writeFileSync, readFileSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { STEPS } from '../../skills/pair-workflow-cycle/scripts/cycle-state.mjs'
import {
  parseCycleHooks,
  runHooks,
  hookKeysFor,
  STAGE_IDS,
} from '../../skills/pair-workflow-cycle/scripts/cycle-hooks.mjs'

const SCRIPT = fileURLToPath(new URL('../../skills/pair-workflow-cycle/scripts/cycle-hooks.mjs', import.meta.url))
const md = lines => `# Automation\n\n## Cycle Hooks\n\n${lines.join('\n')}\n\n## Other\n\n- \`pre-verify\`: \`echo not-mine\`\n`
const tmp = () => mkdtempSync(join(tmpdir(), 'us489-'))
const cli = (args, cwd) => JSON.parse(spawnSync(process.execPath, [SCRIPT, ...args], { cwd, encoding: 'utf8' }).stdout)

test('AC3: stage ids are derived from cycle-state STEPS, hook names are the pattern', () => {
  assert.deepEqual(STAGE_IDS, STEPS.filter(s => s !== 'done' && s !== 'blocked'))
  const keys = hookKeysFor(STAGE_IDS)
  for (const id of STEPS.filter(s => s !== 'done' && s !== 'blocked')) assert.ok(keys.includes(`pre-${id}`) && keys.includes(`post-${id}`))
  // a future stage (merge, #490) works with no schema change
  const { hooks, warnings } = parseCycleHooks(md(['- `pre-merge`: `echo m`']), { stageIds: [...STAGE_IDS, 'merge'] })
  assert.deepEqual(hooks, { 'pre-merge': ['echo m'] })
  assert.deepEqual(warnings, [])
})

test('AC6: absent section or absent file ⇒ no hooks, no warning, nothing run', () => {
  assert.deepEqual(parseCycleHooks('## Eligibility\n\nrisk:green\n'), { hooks: {}, warnings: [] })
  const dir = tmp()
  assert.deepEqual(cli(['load', join(dir, 'missing.md')]), { hooks: {}, warnings: [] })
  const r = cli(['run', join(dir, 'missing.md'), '--point', 'pre-verify', '--cwd', dir])
  assert.deepEqual(r.ran, [])
  assert.equal(r.halted, undefined)
})

test('a section-scoped read: a hook-looking bullet in another section or a fence is not a declaration', () => {
  const doc = '## Cycle Hooks\n\n```markdown\n- `pre-verify`: `echo fenced`\n```\n\n- `post-verify`: `echo real`\n\n## Other\n\n- `pre-verify`: `echo other`\n'
  assert.deepEqual(parseCycleHooks(doc).hooks, { 'post-verify': ['echo real'] })
})

test('AC1: pre-* runs in the repo root, in order; first non-zero HALTs with verbatim output and the rest do not run', () => {
  const dir = tmp()
  const doc = join(dir, 'automation.md')
  writeFileSync(doc, md(['- `pre-verify`: `pwd > ran-in.txt; echo first >> order.txt`', '- `pre-verify`: `echo boom-out; echo boom-err 1>&2; exit 3`', '- `pre-verify`: `echo third >> order.txt`']))
  const r = cli(['run', doc, '--point', 'pre-verify', '--cwd', dir])
  assert.equal(r.mode, 'blocking')
  assert.equal(r.halted.exitCode, 3)
  assert.equal(r.halted.output, 'boom-out\nboom-err\n')
  assert.equal(r.ran.length, 2)
  assert.equal(readFileSync(join(dir, 'order.txt'), 'utf8'), 'first\n')
  assert.ok(readFileSync(join(dir, 'ran-in.txt'), 'utf8').trim().endsWith(dir.split('/').pop()))
})

test('AC2: post-* failure is logged, never halts, and later commands still run', () => {
  const dir = tmp()
  const doc = join(dir, 'automation.md')
  writeFileSync(doc, md(['- `post-implement`: `echo bad; exit 2`', '- `post-implement`: `echo ok > second.txt`']))
  const r = cli(['run', doc, '--point', 'post-implement', '--cwd', dir])
  assert.equal(r.mode, 'logging')
  assert.equal(r.halted, undefined)
  assert.equal(r.ran.length, 2)
  assert.equal(r.logged.length, 1)
  assert.match(r.logged[0], /post-implement.*exited 2.*bad/)
  assert.ok(existsSync(join(dir, 'second.txt')))
})

test('missing executable on PATH is a non-zero exit: HALT for pre-*, logged for post-*/on-halt', () => {
  const dir = tmp()
  const doc = join(dir, 'automation.md')
  writeFileSync(doc, md(['- `pre-cycle`: `definitely-not-a-command-489`', '- `on-halt`: `definitely-not-a-command-489`']))
  const pre = cli(['run', doc, '--point', 'pre-cycle', '--cwd', dir])
  assert.notEqual(pre.halted.exitCode, 0)
  const halt = cli(['run', doc, '--point', 'on-halt', '--status', 'failed-verify', '--cwd', dir])
  assert.equal(halt.halted, undefined)
  assert.equal(halt.logged.length, 1)
})

test('AC5: on-halt runs on failed-* and escalate, never on ready-for-merge', () => {
  const dir = tmp()
  const doc = join(dir, 'automation.md')
  writeFileSync(doc, md(['- `on-halt`: `echo x >> halts.txt`']))
  for (const status of ['failed-implement', 'failed-hook', 'escalate']) assert.equal(cli(['run', doc, '--point', 'on-halt', '--status', status, '--cwd', dir]).ran.length, 1, status)
  for (const status of ['ready-for-merge', 'rounds-bound-reached', undefined]) {
    const r = cli(['run', doc, '--point', 'on-halt', ...(status ? ['--status', status] : []), '--cwd', dir])
    assert.equal(r.skipped, true, String(status))
    assert.deepEqual(r.ran, [])
  }
  assert.equal(readFileSync(join(dir, 'halts.txt'), 'utf8'), 'x\nx\nx\n')
})

test('a typo\'d key is a load-time WARNING, never a HALT, and never fires', () => {
  const { hooks, warnings } = parseCycleHooks(md(['- `pre-verfy`: `echo typo`', '- `pre-verify`: `echo ok`']))
  assert.deepEqual(hooks, { 'pre-verify': ['echo ok'] })
  assert.equal(warnings.length, 1)
  assert.match(warnings[0], /unrecognized hook key `pre-verfy`/)
})

test('runHooks is pure over {hooks, point}: injected exec, unknown point throws', () => {
  const calls = []
  const exec = c => (calls.push(c), { exitCode: c === 'b' ? 1 : 0, output: '' })
  const r = runHooks({ hooks: { 'post-cycle': ['a', 'b', 'c'] }, point: 'post-cycle', cwd: '/x', exec })
  assert.deepEqual(calls, ['a', 'b', 'c'])
  assert.equal(r.logged.length, 1)
  assert.throws(() => runHooks({ hooks: {}, point: 'pre-nonsense', cwd: '/x', exec }), /unknown hook point/)
})

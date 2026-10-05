// US-489 AC9 (finding r1-3) — the per-hook timeout of the ONE shared `## Cycle Hooks` executor,
// run for real: real `sh -c` commands, a real temp root, the real CLI both coordinators spawn.
// Grammar under contract: a `- \`timeout\`: \`<seconds>\`` bullet inside `## Cycle Hooks`; a
// non-negative integer, `0` = no timeout; absent ⇒ the documented default; every `run` answer
// carries the effective `timeout` (seconds). Short timeouts (1–2 s) and `sleep` keep it fast.
// Enforcement path under contract: `parseCycleHooks(md).timeout` is the declared value (absent ⇒
// undefined); `runHooks({ hooks, point, cwd, status, timeout, exec })` resolves the effective
// seconds ONCE (undefined ⇒ the default D, `0` stays 0) and calls `exec(command, cwd, seconds)`
// for EVERY command with that same value — the timeout is per command, never a per-point budget;
// `shellExec(command, cwd, seconds)` arms a kill after `seconds` (`0` ⇒ no timer, never remapped).
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, writeFileSync, readFileSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { parseCycleHooks, runHooks, shellExec } from '../../skills/pair-workflow-cycle/scripts/cycle-hooks.mjs'

const SCRIPT = fileURLToPath(new URL('../../skills/pair-workflow-cycle/scripts/cycle-hooks.mjs', import.meta.url))
const POLICY_REL = '.pair/knowledge/guidelines/collaboration/automation/automation-policy.md'
const POLICIES = {
  mirror: fileURLToPath(new URL(`../../../${POLICY_REL}`, import.meta.url)),
  dataset: fileURLToPath(new URL(`../../../packages/knowledge-hub/dataset/${POLICY_REL}`, import.meta.url)),
}
const SKILLS = {
  installed: fileURLToPath(new URL('../../skills/pair-workflow-cycle/SKILL.md', import.meta.url)),
  dataset: fileURLToPath(new URL('../../../packages/knowledge-hub/dataset/.skills/workflow/cycle/SKILL.md', import.meta.url)),
}
const TIMED_OUT = /time(d)?[ -]?out/i

const doc = lines => {
  const dir = mkdtempSync(join(tmpdir(), 'us489-to-'))
  const file = join(dir, 'automation.md')
  writeFileSync(file, `# Automation\n\n## Cycle Hooks\n\n${lines.join('\n')}\n\n## Other\n\n- \`post-verify\`: \`echo not-mine\`\n`)
  return { dir, file }
}
const cli = (args, cwd) => {
  const r = spawnSync(process.execPath, [SCRIPT, ...args], { cwd, encoding: 'utf8' })
  return { status: r.status, out: JSON.parse(r.stdout) }
}
const timed = fn => {
  const t0 = Date.now()
  const value = fn()
  return { value, ms: Date.now() - t0 }
}
const alive = pid => {
  try {
    process.kill(pid, 0)
    return true
  } catch {
    return false
  }
}
const reap = pid => {
  try {
    process.kill(pid, 'SIGKILL')
  } catch {
    // already gone
  }
}
// A killed hook must never reach its last step: `slow(name)` records its pid (= its process-group
// id, the hook runs detached) then sleeps 10 s before touching `<name>.done`. `settled` waits (no
// wall-clock assertion) until that group is gone, then reports whether the step was reached.
const slow = (name, pre = '') => `${pre}echo $$ > ${name}.pid; sleep 10; touch ${name}.done`
const groupAlive = pid => {
  try {
    process.kill(-pid, 0)
    return true
  } catch {
    return false
  }
}
const settled = (dir, name) => {
  const pid = Number(readFileSync(join(dir, `${name}.pid`), 'utf8').trim())
  const deadline = Date.now() + 30000
  while (groupAlive(pid) && Date.now() < deadline) spawnSync('sleep', ['0.1'])
  if (groupAlive(pid)) reap(-pid)
  return existsSync(join(dir, `${name}.done`))
}
const sectionOf = (markdown, heading) => {
  const start = markdown.indexOf(`\n## ${heading}`)
  const end = markdown.indexOf('\n## ', start + 1)
  return start < 0 ? '' : markdown.slice(start, end < 0 ? undefined : end)
}

// ── default + override ─────────────────────────────────────────────────────────────────────────
test('TO-W1 default: no `timeout` bullet ⇒ the run answer carries a positive integer default, the same the schema documents in both KB copies', () => {
  const { dir, file } = doc(['- `post-implement`: `true`'])
  const { out } = cli(['run', file, '--point', 'post-implement', '--cwd', dir])
  assert.ok(Number.isInteger(out.timeout) && out.timeout > 0, `default timeout: ${JSON.stringify(out)}`)
  const absent = cli(['run', join(dir, 'missing.md'), '--point', 'pre-verify', '--cwd', dir]).out
  assert.equal(absent.timeout, out.timeout, 'an absent policy file gets the same default')
  for (const [name, path] of Object.entries(POLICIES)) {
    const section = sectionOf(readFileSync(path, 'utf8'), 'Cycle Hooks')
    assert.ok(section.includes('`timeout`'), `${name}: ## Cycle Hooks documents the \`timeout\` key`)
    assert.match(section, new RegExp(`\\b${out.timeout}\\b`), `${name}: documents the default ${out.timeout}`)
    assert.ok(section.includes('`0`'), `${name}: documents that \`0\` disables the timeout`)
  }
})

test('TO-W2 override: `timeout: 1` is a known key (no warning) and the run answer carries 1', () => {
  const { dir, file } = doc(['- `timeout`: `1`', '- `post-implement`: `true`'])
  const load = cli(['load', file])
  assert.equal(load.status, 0)
  assert.deepEqual(load.out.warnings, [], 'a declared timeout is not an unrecognized hook key')
  assert.deepEqual(load.out.hooks, { 'post-implement': ['true'] })
  assert.equal(cli(['run', file, '--point', 'post-implement', '--cwd', dir]).out.timeout, 1)
})

test('TO-W3 override honoured, not hardcoded: `timeout: 2` kills a `sleep 4` pre-verify at ~2 s, not at 1 s and not at 4 s', () => {
  const { dir, file } = doc(['- `timeout`: `2`', '- `pre-verify`: `sleep 4`'])
  const { value, ms } = timed(() => cli(['run', file, '--point', 'pre-verify', '--cwd', dir]).out)
  assert.ok(value.halted, JSON.stringify(value))
  assert.notEqual(value.halted.exitCode, 0)
  assert.match(value.halted.output, TIMED_OUT)
  assert.ok(ms >= 1800, `elapsed ${ms} ms`)
})

test('TO-C1 control: a hook shorter than the override completes with exit 0', () => {
  const { dir, file } = doc(['- `timeout`: `3`', '- `pre-verify`: `sleep 1; echo done`'])
  const r = cli(['run', file, '--point', 'pre-verify', '--cwd', dir]).out
  assert.equal(r.halted, undefined)
  assert.equal(r.ran[0].exitCode, 0)
})

test('TO-C2 section-scoped: a `timeout` bullet outside `## Cycle Hooks` or inside a fence is not the override', () => {
  const dir = mkdtempSync(join(tmpdir(), 'us489-to-'))
  const file = join(dir, 'automation.md')
  writeFileSync(file, '# A\n\n## Cycle Hooks\n\n```markdown\n- `timeout`: `1`\n```\n\n- `pre-verify`: `sleep 2`\n\n## Other\n\n- `timeout`: `1`\n')
  const r = cli(['run', file, '--point', 'pre-verify', '--cwd', dir]).out
  assert.equal(r.halted, undefined, JSON.stringify(r))
  assert.equal(r.ran[0].exitCode, 0)
})

// ── kill on expiry, by hook type ───────────────────────────────────────────────────────────────
test('TO-W4 pre-*: expiry HALTs, non-zero, the timeout named, later pre-* commands not run', () => {
  const { dir, file } = doc(['- `timeout`: `1`', `- \`pre-verify\`: \`${slow('h')}\``, '- `pre-verify`: `touch second.txt`'])
  const value = cli(['run', file, '--point', 'pre-verify', '--cwd', dir]).out
  assert.equal(value.mode, 'blocking')
  assert.ok(value.halted, JSON.stringify(value))
  assert.notEqual(value.halted.exitCode, 0)
  assert.match(value.halted.output, TIMED_OUT)
  assert.equal(existsSync(join(dir, 'second.txt')), false)
  assert.equal(settled(dir, 'h'), false, 'the hook was killed, never ran to completion')
})

test('TO-W5 post-*: expiry is logged naming the timeout, never a HALT, and the next command still runs', () => {
  const { dir, file } = doc(['- `timeout`: `1`', `- \`post-implement\`: \`${slow('h')}\``, '- `post-implement`: `touch second.txt`'])
  const value = cli(['run', file, '--point', 'post-implement', '--cwd', dir]).out
  assert.equal(value.halted, undefined)
  assert.equal(value.ran.length, 2)
  assert.notEqual(value.ran[0].exitCode, 0)
  assert.equal(value.logged.length, 1)
  assert.match(value.logged[0], /post-implement/)
  assert.match(value.logged[0], TIMED_OUT)
  assert.ok(existsSync(join(dir, 'second.txt')))
  assert.equal(settled(dir, 'h'), false, 'the hook was killed, never ran to completion')
})

test('TO-W6 on-halt: expiry is logged naming the timeout, never a HALT', () => {
  const { dir, file } = doc(['- `timeout`: `1`', `- \`on-halt\`: \`${slow('h')}\``])
  const value = cli(['run', file, '--point', 'on-halt', '--status', 'failed-verify', '--cwd', dir]).out
  assert.equal(value.halted, undefined)
  assert.equal(value.logged.length, 1)
  assert.match(value.logged[0], TIMED_OUT)
  assert.equal(settled(dir, 'h'), false, 'the hook was killed, never ran to completion')
})

test('TO-W7 process group: the grandchild a hook spawned is dead when the timed-out hook returns', () => {
  const { dir, file } = doc(['- `timeout`: `1`', '- `pre-verify`: `sleep 6 >/dev/null 2>&1 & echo $! > child.pid; wait`'])
  const value = cli(['run', file, '--point', 'pre-verify', '--cwd', dir]).out
  const pid = Number(readFileSync(join(dir, 'child.pid'), 'utf8').trim())
  try {
    assert.ok(value.halted, JSON.stringify(value))
    assert.match(value.halted.output, TIMED_OUT)
    const deadline = Date.now() + 1000
    while (alive(pid) && Date.now() < deadline) spawnSync('sleep', ['0.05'])
    assert.equal(alive(pid), false, `grandchild ${pid} survived the timeout`)
  } finally {
    if (alive(pid)) reap(pid)
  }
})

// ── disabling ──────────────────────────────────────────────────────────────────────────────────
test('TO-W8 `timeout: 0` is a known key and the run answer says 0 (disabled)', () => {
  const { dir, file } = doc(['- `timeout`: `0`', '- `post-implement`: `true`'])
  assert.deepEqual(cli(['load', file]).out.warnings, [])
  assert.equal(cli(['run', file, '--point', 'post-implement', '--cwd', dir]).out.timeout, 0)
})

test('TO-C3 `timeout: 0`: a `sleep 2` pre-verify runs to completion, exit 0, never killed', () => {
  const { dir, file } = doc(['- `timeout`: `0`', '- `pre-verify`: `sleep 2; echo finished`'])
  const r = cli(['run', file, '--point', 'pre-verify', '--cwd', dir]).out
  assert.equal(r.halted, undefined, JSON.stringify(r))
  assert.equal(r.ran[0].exitCode, 0)
})

// ── validation ─────────────────────────────────────────────────────────────────────────────────
for (const [id, value] of [['TO-W9', '-5'], ['TO-W10', '1.5'], ['TO-W11', 'abc']]) {
  test(`${id} malformed \`timeout: ${value}\` is a load-time error naming the value; run executes nothing`, () => {
    const { dir, file } = doc([`- \`timeout\`: \`${value}\``, '- `pre-verify`: `touch ran.txt`'])
    const load = cli(['load', file])
    assert.notEqual(load.status, 0)
    assert.equal(typeof load.out.error, 'string', JSON.stringify(load.out))
    assert.ok(load.out.error.includes(value), load.out.error)
    assert.match(load.out.error, /timeout/)
    const run = cli(['run', file, '--point', 'pre-verify', '--cwd', dir])
    assert.notEqual(run.status, 0)
    assert.ok(String(run.out.error).includes(value), JSON.stringify(run.out))
    assert.equal(existsSync(join(dir, 'ran.txt')), false)
  })
}

test('TO-C4 control: a well-formed large integer (`600`) loads with exit 0 and no error', () => {
  const { file } = doc(['- `timeout`: `600`', '- `pre-verify`: `true`'])
  const load = cli(['load', file])
  assert.equal(load.status, 0)
  assert.equal(load.out.error, undefined)
})

// ── the in-session coordinator surfaces the load error before any stage ────────────────────────
test('TO-S1 both SKILL.md copies: the Cycle hooks step names the timeout and HALTs on a load `error` before the first stage', () => {
  for (const [name, path] of Object.entries(SKILLS)) {
    const text = readFileSync(path, 'utf8')
    const start = text.indexOf('**Cycle hooks (US-489).**')
    const paragraph = text.slice(start, text.indexOf('\n\n', start))
    assert.ok(start >= 0, name)
    assert.match(paragraph, /`timeout`/, `${name}: names the \`timeout\` key`)
    assert.match(paragraph, /`error`[^.]*\b(HALT|halts?|stops?)\b/i, `${name}: a load \`error\` HALTs`)
    assert.match(paragraph, /`error`[^.]*before (the first|any) (stage|`resolve`)/i, `${name}: the load \`error\` HALT comes before any stage`)
  }
})

// ── the effective timeout that is ENFORCED equals the one reported (rejection TO-W1 / M1) ──────
test('TO-E1 effective timeout: exec receives D when absent, 0 for `0`, 1 for `1` — equal to the CLI run answer on the same policy', () => {
  const cases = [
    ['absent', ['- `pre-verify`: `a`', '- `pre-verify`: `b`']],
    ['zero', ['- `timeout`: `0`', '- `pre-verify`: `a`', '- `pre-verify`: `b`']],
    ['one', ['- `timeout`: `1`', '- `pre-verify`: `a`', '- `pre-verify`: `b`']],
  ]
  const received = {}
  for (const [name, lines] of cases) {
    const { dir, file } = doc(lines)
    const { hooks, timeout } = parseCycleHooks(readFileSync(file, 'utf8'))
    const seen = []
    const exec = (command, cwd, seconds) => (seen.push(seconds), { exitCode: 0, output: '' })
    runHooks({ hooks, point: 'pre-verify', cwd: dir, timeout, exec })
    assert.equal(seen.length, 2, name)
    assert.equal(seen[0], seen[1], `${name}: every command gets the same per-command timeout`)
    const answered = cli(['run', file, '--point', 'post-cycle', '--cwd', dir]).out.timeout
    assert.equal(seen[0], answered, `${name}: enforced ${seen[0]} vs reported ${answered}`)
    received[name] = seen[0]
  }
  assert.ok(Number.isInteger(received.absent) && received.absent > 0, `absent ⇒ default D, got ${received.absent}`)
  assert.equal(received.zero, 0, '`0` is never remapped to the default')
  assert.equal(received.one, 1)
})

test('TO-E2 effective timeout at shellExec: seconds=1 kills a `sleep 4` (non-zero, timeout named); seconds=0 lets `sleep 2` exit 0', () => {
  const dir = mkdtempSync(join(tmpdir(), 'us489-to-'))
  const killed = shellExec(slow('h'), dir, 1)
  assert.notEqual(killed.exitCode, 0, JSON.stringify(killed))
  assert.match(killed.output, TIMED_OUT)
  assert.equal(settled(dir, 'h'), false, 'the hook was killed, never ran to completion')
  const free = shellExec('sleep 2; echo finished', dir, 0)
  assert.equal(free.exitCode, 0, JSON.stringify(free))
})

// ── per command, never a per-point budget (rejection TO-W5 / M2) ───────────────────────────────
test('TO-C5 per-command: `timeout: 3` + two `pre-verify` `sleep 2` (sum 4 s > 3) halts nothing, both exit 0', () => {
  const { dir, file } = doc(['- `timeout`: `3`', '- `pre-verify`: `sleep 2`', '- `pre-verify`: `sleep 2`'])
  const r = cli(['run', file, '--point', 'pre-verify', '--cwd', dir]).out
  assert.equal(r.halted, undefined, JSON.stringify(r))
  assert.equal(r.ran.length, 2)
  assert.deepEqual(r.ran.map(x => x.exitCode), [0, 0])
})

// ── the group kill ends a hook that ignores SIGTERM ────────────────────────────────────────────
test('TO-W12 a hook ignoring SIGTERM (`trap "" TERM`) is still ended on expiry: halted, timeout named', () => {
  const { dir, file } = doc(['- `timeout`: `1`', `- \`pre-verify\`: \`${slow('h', "trap '' TERM; ")}\``])
  const value = cli(['run', file, '--point', 'pre-verify', '--cwd', dir]).out
  assert.ok(value.halted, JSON.stringify(value))
  assert.notEqual(value.halted.exitCode, 0)
  assert.match(value.halted.output, TIMED_OUT)
  assert.equal(settled(dir, 'h'), false, 'the hook was killed, never ran to completion')
})

// Run: node --test scripts/dev/rtk-review-hook.test.mjs
// Contract (r2-g1): the PreToolUse hook never rewrites command text (rtk resolves through the
// SessionStart PATH entry) and forwards ONLY rtk's hookSpecificOutput.updatedInput, never a
// permission decision or any other field, whatever shape rtk prints.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, mkdirSync, writeFileSync, chmodSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve, dirname } from 'node:path'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const HOOK = resolve(dirname(fileURLToPath(import.meta.url)), 'rtk-review-hook.mjs')
// a fake rtk: `rtk hook claude` prints `stdout` and exits `code`; it never reaches a real rtk
const fake = (stdout, code = 0) => `#!${process.execPath}
require('node:fs').readFileSync(0)
process.stdout.write(${JSON.stringify(stdout)})
process.exit(${code})
`
const project = (stdout, code) => {
  const root = mkdtempSync(join(tmpdir(), 'rtkhook-'))
  if (stdout !== undefined) {
    mkdirSync(join(root, '.tools/bin'), { recursive: true })
    writeFileSync(join(root, '.tools/bin/rtk'), fake(stdout, code))
    chmodSync(join(root, '.tools/bin/rtk'), 0o755)
  }
  return root
}
const run = (root, input) =>
  spawnSync('node', [HOOK], {
    input: JSON.stringify(input),
    encoding: 'utf-8',
    // no PATH entry for rtk: the hook finds the repo-local binary itself
    env: { PATH: dirname(process.execPath), CLAUDE_PROJECT_DIR: root },
  })
const bash = (extra = {}) => ({ tool_name: 'Bash', tool_input: { command: 'git diff' }, ...extra })
const reviewer = bash({ agent_type: 'pair-reviewer' })
const rtkOut = hookSpecificOutput => JSON.stringify({ hookSpecificOutput })
const only = updatedInput => ({ hookSpecificOutput: { hookEventName: 'PreToolUse', updatedInput } })
// rtk's updatedInput must come out byte-identical (same keys, same order, same command text)
const assertForwarded = (r, updatedInput) => {
  assert.equal(r.status, 0)
  const got = JSON.parse(r.stdout).hookSpecificOutput.updatedInput
  assert.equal(JSON.stringify(got), JSON.stringify(updatedInput))
}
const rewrite = command => rtkOut({ hookEventName: 'PreToolUse', updatedInput: { command } })

test('r0-2-w1 quoted argument containing rtk: updatedInput byte-identical', () => {
  const command = 'rtk git log --grep "switch to rtk for review"'
  assertForwarded(run(project(rewrite(command)), reviewer), { command })
})

test('r0-2-w2 unquoted argument rtk: updatedInput byte-identical', () => {
  const command = 'rtk grep -rn rtk scripts'
  assertForwarded(run(project(rewrite(command)), reviewer), { command })
})

test('r0-2-w3 rtk after newline, env assignment and reserved word: updatedInput byte-identical', () => {
  const command = 'GIT_PAGER=cat rtk git log\nif true; then rtk ls; fi'
  assertForwarded(run(project(rewrite(command)), reviewer), { command })
})

test('r0-2-w4 command-position rtk after &&: updatedInput byte-identical (no absolute-path rewrite)', () => {
  const command = 'rtk git diff && rtk ls'
  assertForwarded(run(project(rewrite(command)), reviewer), { command })
})

test('r0-2-i1 updatedInput extra fields and key order forwarded as rtk printed them', () => {
  const updatedInput = {
    description: 'd',
    command: 'rtk git status',
    timeout: 5000,
    run_in_background: false,
  }
  assertForwarded(
    run(project(rtkOut({ hookEventName: 'PreToolUse', updatedInput })), reviewer),
    updatedInput,
  )
})

test('r0-2-c1 command without rtk: updatedInput byte-identical', () => {
  const command = 'git status --short'
  assertForwarded(run(project(rewrite(command)), reviewer), { command })
})

test('r0-3-w1 permissionDecision allow + reason + updatedInput: only updatedInput forwarded', () => {
  const updatedInput = { command: 'rtk git diff' }
  const out = rtkOut({
    hookEventName: 'PreToolUse',
    permissionDecision: 'allow',
    permissionDecisionReason: 'RTK auto-rewrite',
    updatedInput,
  })
  const r = run(project(out), reviewer)
  assert.equal(r.status, 0)
  assert.deepEqual(JSON.parse(r.stdout), only(updatedInput))
})

test('r0-3-w2 permissionDecision allow without updatedInput: empty stdout', () => {
  const r = run(
    project(rtkOut({ hookEventName: 'PreToolUse', permissionDecision: 'allow' })),
    reviewer,
  )
  assert.equal(r.status, 0)
  assert.equal(r.stdout, '')
})

test('r0-3-w3 permissionDecision deny / ask + updatedInput: decision never forwarded', () => {
  const updatedInput = { command: 'rtk ls' }
  for (const permissionDecision of ['deny', 'ask']) {
    const r = run(
      project(rtkOut({ hookEventName: 'PreToolUse', permissionDecision, updatedInput })),
      reviewer,
    )
    assert.equal(r.status, 0)
    assert.deepEqual(JSON.parse(r.stdout), only(updatedInput))
  }
})

test('r0-3-w4 top-level fields next to hookSpecificOutput: only updatedInput forwarded', () => {
  const updatedInput = { command: 'rtk git diff' }
  const out = JSON.stringify({
    continue: false,
    stopReason: 's',
    suppressOutput: true,
    systemMessage: 'm',
    decision: 'approve',
    hookSpecificOutput: { hookEventName: 'PreToolUse', permissionDecision: 'allow', updatedInput },
  })
  const r = run(project(out), reviewer)
  assert.equal(r.status, 0)
  assert.deepEqual(JSON.parse(r.stdout), only(updatedInput))
})

test('r0-3-w5 legacy top-level decision without hookSpecificOutput: empty stdout', () => {
  const r = run(project(JSON.stringify({ decision: 'approve', reason: 'r' })), reviewer)
  assert.equal(r.status, 0)
  assert.equal(r.stdout, '')
})

test('r0-3-b1 updatedInput not a plain object (string, array, null) with allow: empty stdout', () => {
  for (const updatedInput of ['rtk git diff', ['rtk'], null]) {
    const out = rtkOut({ hookEventName: 'PreToolUse', permissionDecision: 'allow', updatedInput })
    const r = run(project(out), reviewer)
    assert.equal(r.status, 0)
    assert.equal(r.stdout, '')
  }
})

test('r0-3-i1 allow + quoted rtk argument: exact shape, command byte-identical', () => {
  const updatedInput = { command: 'rtk git commit -m "use rtk now" && rtk ls' }
  const out = rtkOut({ hookEventName: 'PreToolUse', permissionDecision: 'allow', updatedInput })
  const r = run(project(out), reviewer)
  assert.equal(r.status, 0)
  assert.equal(r.stdout && JSON.stringify(JSON.parse(r.stdout)), JSON.stringify(only(updatedInput)))
})

for (const [name, stdout, code] of [
  ['rtk prints nothing', '', 0],
  ['rtk exits non-zero', rewrite('rtk ls'), 1],
  ['rtk prints non-JSON', 'not json', 0],
]) {
  test(`r0-3-c1 ${name}: empty stdout, exit 0`, () => {
    const r = run(project(stdout, code), reviewer)
    assert.equal(r.status, 0)
    assert.equal(r.stdout, '')
  })
}

for (const [name, extra] of [
  ['no agent_type (main session / pair-cli run stage)', {}],
  ['another agent_type', { agent_type: 'pair-implementer' }],
]) {
  test(`${name}: no-op`, () => {
    const r = run(project(rewrite('rtk git diff')), bash(extra))
    assert.equal(r.status, 0)
    assert.equal(r.stdout, '')
  })
}

test('pair-reviewer but rtk absent: no-op', () => {
  const r = run(project(), reviewer)
  assert.equal(r.status, 0)
  assert.equal(r.stdout, '')
})

test('malformed stdin: no-op, exit 0', () => {
  const r = spawnSync('node', [HOOK], {
    input: 'nope',
    encoding: 'utf-8',
    env: { PATH: dirname(process.execPath), CLAUDE_PROJECT_DIR: project(rewrite('rtk git diff')) },
  })
  assert.equal(r.status, 0)
  assert.equal(r.stdout, '')
})

// Run: node --test scripts/dev/rtk-review-hook.test.mjs
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, mkdirSync, writeFileSync, chmodSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve, dirname } from 'node:path'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const HOOK = resolve(dirname(fileURLToPath(import.meta.url)), 'rtk-review-hook.mjs')
// a fake rtk: records that it ran and rewrites the command like `rtk hook claude` does
const FAKE = `#!/bin/sh
cat >/dev/null
echo '{"hookSpecificOutput":{"hookEventName":"PreToolUse","permissionDecision":"allow","updatedInput":{"command":"rtk git diff && rtk ls"}}}'
`
const project = withRtk => {
  const root = mkdtempSync(join(tmpdir(), 'rtkhook-'))
  if (withRtk) {
    mkdirSync(join(root, '.tools/bin'), { recursive: true })
    writeFileSync(join(root, '.tools/bin/rtk'), FAKE)
    chmodSync(join(root, '.tools/bin/rtk'), 0o755)
  }
  return root
}
const run = (root, input) =>
  spawnSync('node', [HOOK], {
    input: JSON.stringify(input),
    encoding: 'utf-8',
    // no PATH entry for rtk: the hook must never depend on it
    env: { PATH: dirname(process.execPath), CLAUDE_PROJECT_DIR: root },
  })
const bash = (extra = {}) => ({ tool_name: 'Bash', tool_input: { command: 'git diff' }, ...extra })

test('pair-reviewer + rtk installed: rewrites to the absolute rtk path', () => {
  const root = project(true)
  const r = run(root, bash({ agent_type: 'pair-reviewer' }))
  assert.equal(r.status, 0)
  const cmd = JSON.parse(r.stdout).hookSpecificOutput.updatedInput.command
  assert.equal(cmd, `'${join(root, '.tools/bin/rtk')}' git diff && '${join(root, '.tools/bin/rtk')}' ls`)
})

for (const [name, extra] of [
  ['no agent_type (main session / pair-cli run stage)', {}],
  ['another agent_type', { agent_type: 'pair-implementer' }],
]) {
  test(`${name}: no-op`, () => {
    const r = run(project(true), bash(extra))
    assert.equal(r.status, 0)
    assert.equal(r.stdout, '')
  })
}

test('pair-reviewer but rtk absent: no-op', () => {
  const r = run(project(false), bash({ agent_type: 'pair-reviewer' }))
  assert.equal(r.status, 0)
  assert.equal(r.stdout, '')
})

test('malformed stdin: no-op, exit 0', () => {
  const r = spawnSync('node', [HOOK], { input: 'nope', encoding: 'utf-8', env: { PATH: dirname(process.execPath), CLAUDE_PROJECT_DIR: project(true) } })
  assert.equal(r.status, 0)
  assert.equal(r.stdout, '')
})

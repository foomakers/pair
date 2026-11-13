import { SCRIPT, POLICY_REL, POLICIES, SKILLS, TIMED_OUT, doc, cli, timed, alive, reap, slow, groupAlive, settled, sectionOf, test, assert, mkdtempSync, writeFileSync, readFileSync, existsSync, tmpdir, join, spawnSync, fileURLToPath, parseCycleHooks, runHooks, shellExec } from './cycle-hooks-timeout-lib.mjs'

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

test('TO-C3 `timeout: 0`: a `sleep 2` pre-verify runs to completion, exit 0, never killed', () => {
  const { dir, file } = doc(['- `timeout`: `0`', '- `pre-verify`: `sleep 2; echo finished`'])
  const r = cli(['run', file, '--point', 'pre-verify', '--cwd', dir]).out
  assert.equal(r.halted, undefined, JSON.stringify(r))
  assert.equal(r.ran[0].exitCode, 0)
})

test('TO-W12 a hook ignoring SIGTERM (`trap "" TERM`) is still ended on expiry: halted, timeout named', () => {
  const { dir, file } = doc(['- `timeout`: `1`', `- \`pre-verify\`: \`${slow('h', "trap '' TERM; ")}\``])
  const value = cli(['run', file, '--point', 'pre-verify', '--cwd', dir]).out
  assert.ok(value.halted, JSON.stringify(value))
  assert.notEqual(value.halted.exitCode, 0)
  assert.match(value.halted.output, TIMED_OUT)
  assert.equal(settled(dir, 'h'), false, 'the hook was killed, never ran to completion')
})

import { SCRIPT, POLICY_REL, POLICIES, SKILLS, TIMED_OUT, doc, cli, timed, alive, reap, slow, groupAlive, settled, sectionOf, test, assert, mkdtempSync, writeFileSync, readFileSync, existsSync, tmpdir, join, spawnSync, fileURLToPath, parseCycleHooks, runHooks, shellExec } from './cycle-hooks-timeout-lib.mjs'

test('TO-W3 override honoured, not hardcoded: `timeout: 2` kills a `sleep 4` pre-verify at ~2 s, not at 1 s and not at 4 s', () => {
  const { dir, file } = doc(['- `timeout`: `2`', '- `pre-verify`: `sleep 4`'])
  const { value, ms } = timed(() => cli(['run', file, '--point', 'pre-verify', '--cwd', dir]).out)
  assert.ok(value.halted, JSON.stringify(value))
  assert.notEqual(value.halted.exitCode, 0)
  assert.match(value.halted.output, TIMED_OUT)
  assert.ok(ms >= 1800, `elapsed ${ms} ms`)
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

test('TO-E2 effective timeout at shellExec: seconds=1 kills a `sleep 4` (non-zero, timeout named); seconds=0 lets `sleep 2` exit 0', () => {
  const dir = mkdtempSync(join(tmpdir(), 'us489-to-'))
  const killed = shellExec(slow('h'), dir, 1)
  assert.notEqual(killed.exitCode, 0, JSON.stringify(killed))
  assert.match(killed.output, TIMED_OUT)
  assert.equal(settled(dir, 'h'), false, 'the hook was killed, never ran to completion')
  const free = shellExec('sleep 2; echo finished', dir, 0)
  assert.equal(free.exitCode, 0, JSON.stringify(free))
})

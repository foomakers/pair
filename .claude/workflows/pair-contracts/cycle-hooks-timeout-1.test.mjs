import { SCRIPT, POLICY_REL, POLICIES, SKILLS, TIMED_OUT, doc, cli, timed, alive, reap, slow, groupAlive, settled, sectionOf, test, assert, mkdtempSync, writeFileSync, readFileSync, existsSync, tmpdir, join, spawnSync, fileURLToPath, parseCycleHooks, runHooks, shellExec } from './cycle-hooks-timeout-lib.mjs'

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

test('TO-W6 on-halt: expiry is logged naming the timeout, never a HALT', () => {
  const { dir, file } = doc(['- `timeout`: `1`', `- \`on-halt\`: \`${slow('h')}\``])
  const value = cli(['run', file, '--point', 'on-halt', '--status', 'failed-verify', '--cwd', dir]).out
  assert.equal(value.halted, undefined)
  assert.equal(value.logged.length, 1)
  assert.match(value.logged[0], TIMED_OUT)
  assert.equal(settled(dir, 'h'), false, 'the hook was killed, never ran to completion')
})

test('TO-W8 `timeout: 0` is a known key and the run answer says 0 (disabled)', () => {
  const { dir, file } = doc(['- `timeout`: `0`', '- `post-implement`: `true`'])
  assert.deepEqual(cli(['load', file]).out.warnings, [])
  assert.equal(cli(['run', file, '--point', 'post-implement', '--cwd', dir]).out.timeout, 0)
})

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

test('TO-C5 per-command: `timeout: 3` + two `pre-verify` `sleep 2` (sum 4 s > 3) halts nothing, both exit 0', () => {
  const { dir, file } = doc(['- `timeout`: `3`', '- `pre-verify`: `sleep 2`', '- `pre-verify`: `sleep 2`'])
  const r = cli(['run', file, '--point', 'pre-verify', '--cwd', dir]).out
  assert.equal(r.halted, undefined, JSON.stringify(r))
  assert.equal(r.ran.length, 2)
  assert.deepEqual(r.ran.map(x => x.exitCode), [0, 0])
})

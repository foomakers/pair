const assert = require('node:assert/strict')
const { spawnSync } = require('node:child_process')
const { mkdtempSync, rmSync } = require('node:fs')
const { tmpdir } = require('node:os')
const path = require('node:path')
const test = require('node:test')

const root = path.resolve(__dirname, '../../..')
const scratch = mkdtempSync(path.join(tmpdir(), 'pair-run-card-omission-'))
let result
try {
  result = spawnSync('bash', ['-x', 'scripts/smoke-tests/scenarios/run-card.sh'], {
    cwd: root,
    env: {
      ...process.env,
      INIT_CWD: '',
      REPO_ROOT: root,
      TMP_DIR: scratch,
      TEST_BINARY: `node ${path.join(root, 'apps/pair-cli/dist/cli.js')}`,
    },
    encoding: 'utf8',
    timeout: 180_000,
    maxBuffer: 4 * 1024 * 1024,
  })
} finally {
  rmSync(scratch, { recursive: true, force: true })
}
const output = `${result.stdout ?? ''}${result.stderr ?? ''}`

test('run-card smoke accepts omitted --parallel at the real CLI boundary', () => {
  assert.ifError(result.error)
  assert.equal(result.status, 0, output)
  assert.match(output, /delivery-cycle coordinator entry\) Passed/)
})

test('run-card retains watch, SIGINT, concurrency and card refusal controls', () => {
  assert.ifError(result.error)
  assert.match(output, /Parallel: 1 \(KB default\)/)
  assert.match(output, /Loop interrupted by SIGINT/)
  assert.ok((output.match(/\+ return 130/g) ?? []).length >= 2, output)
  assert.match(output, /watch: on \(--watch\)/)
  assert.match(output, /\[PASS\].*waiting/)
  assert.match(output, /\[PASS\].*--watch belongs to the loop/)
  assert.match(output, /\[PASS\].*Requested: --parallel 2/)
  const errors = output.split('\n').filter(line => line.includes('[FAIL]'))
  assert.ok(
    errors.every(line => line.includes('Requested: --parallel 1')),
    output,
  )
})

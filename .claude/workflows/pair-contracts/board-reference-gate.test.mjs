// #642 r1-g3-gap1: the dev-script gate must run the sealed board-reference suite
// in its sandbox, while retaining the existing hook and CI wiring controls.
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { existsSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../../..')
const pkg = join(root, 'packages/dev-tools')
const require = createRequire(join(pkg, 'package.json'))
const vitest = join(dirname(require.resolve('vitest/package.json')), 'vitest.mjs')
const cases = [
  ['r1-g3-gap1-isolated', ['r0-1-w5']],
  ['r1-g3-gap1-wiring', ['r0-1-w1', 'r0-1-w2', 'r0-1-b1']],
  ['r1-g3-gap1-hook-control', ['r0-1-w3', 'r0-1-c1']],
  ['r1-g3-gap1-session-control', ['r0-1-w4', 'r0-1-c2']],
]
const selected = cases.filter(([id]) => !process.argv[2] || process.argv[2] === id)
assert.ok(selected.length, 'selector must name an executable row')
for (const [id, selectors] of selected) {
  test(id, () => {
    const bin = mkdtempSync(join(tmpdir(), 'board-gate-'))
    const trap = join(bin, 'unexpected-host-call')
    try {
      symlinkSync(process.execPath, join(bin, 'node'))
      for (const name of ['gh', 'codex', 'claude', 'pi', 'opencode'])
        writeFileSync(
          join(bin, name),
          `#!${process.execPath}\nrequire('node:fs').writeFileSync(${JSON.stringify(trap)}, ${JSON.stringify(name)}); process.exit(97)\n`,
          { mode: 0o755 },
        )
      const result = spawnSync(
        process.execPath,
        [
          vitest,
          'run',
          'src/quality-gates/dev-scripts-gate.test.ts',
          '--reporter=json',
          '-t',
          selectors.join('|'),
        ],
        {
          cwd: pkg,
          env: { PATH: `${bin}:/usr/bin:/bin`, HOME: bin, CI: 'true' },
          encoding: 'utf8',
          // Allow up to three selected Vitest tests at 180s each plus runner overhead.
          timeout: 600_000,
          maxBuffer: 4 * 1024 * 1024,
        },
      )
      assert.equal(existsSync(trap), false, 'no real host or engine call is permitted')
      assert.equal(result.error, undefined, result.error?.message)
      assert.equal(result.status, 0, result.stdout + result.stderr)
      const report = JSON.parse(result.stdout)
      const assertions = report.testResults.flatMap(suite => suite.assertionResults)
      for (const selector of selectors) {
        const matches = assertions.filter(row => row.title.startsWith(`${selector} `))
        assert.equal(matches.length, 1, `${selector} must execute exactly once`)
        assert.equal(matches[0].status, 'passed', `${selector} must pass`)
      }
    } finally {
      rmSync(bin, { recursive: true, force: true })
    }
  })
}

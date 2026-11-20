import { cpSync, mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import assert from 'node:assert/strict'

const root = process.cwd()
const temp = mkdtempSync(join(tmpdir(), 'whole-index-probe-'))
const paths = [
  '.claude/skills/pair-workflow-red-verify/scripts',
  '.claude/workflows/pair-contracts/red-snapshot-lib.mjs',
  'packages/knowledge-hub/dataset/.skills/workflow/red-verify/scripts',
  'packages/knowledge-hub/src/conformance/fixtures/red-snapshot-push-regression.mjs',
]
const fixture = paths[3]
try {
  for (const path of paths) {
    mkdirSync(dirname(join(temp, path)), { recursive: true })
    cpSync(resolve(root, path), join(temp, path), { recursive: true })
  }
  assert.equal(spawnSync('git', ['init', '-q'], { cwd: temp }).status, 0)
  const run = () =>
    spawnSync(
      process.execPath,
      ['--test', '--test-reporter', 'tap', '--test-name-pattern', 'r5-g2 .* staged', fixture],
      { cwd: temp, encoding: 'utf8', timeout: 30000 },
    )
  const current = run()
  assert.equal(current.status, 0, current.stdout + current.stderr)
  assert.match(current.stdout, /# pass 4\b/)
  for (const path of [paths[0], paths[2]]) {
    const file = join(temp, path, 'red-snapshot.mjs')
    const original = readFileSync(file, 'utf8')
    const old =
      "`chore: remove the transient RED manifest (${trailer[2]}, phase ${trailer[3]})`, '--', manifest"
    assert.equal(original.split(old).length, 2)
    writeFileSync(
      file,
      original.replace(
        old,
        '`chore: remove the transient RED manifest (${trailer[2]}, phase ${trailer[3]})`',
      ),
    )
  }
  const mutant = run()
  assert.equal(mutant.status, 1, mutant.stdout + mutant.stderr)
  assert.match(mutant.stdout, /# fail 4\b/)
  for (const representation of ['installed', 'dataset']) {
    for (const entry of ['function', 'cli']) {
      assert.match(
        mutant.stdout,
        new RegExp(`not ok \\d+ - r5-g2 ${representation} ${entry} staged`),
      )
    }
  }
  assert.match(mutant.stdout, /export const o = 42/)
  process.stdout.write('PASS current 4 staged witnesses; whole-index regression 4 detected\n')
} finally {
  rmSync(temp, { recursive: true, force: true })
}

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { spawnSync } from 'node:child_process'

const testFile = 'packages/knowledge-hub/src/conformance/fixtures/red-snapshot-r5-witness.mjs'
const sources = {
  dataset: 'packages/knowledge-hub/dataset/.skills/workflow/red-verify/scripts/red-snapshot.mjs',
  installed: '.claude/skills/pair-workflow-red-verify/scripts/red-snapshot.mjs',
}
const cases = [
  [
    'r0-1',
    "git(['hash-object', '--path', FORMAT_IGNORE, '--', FORMAT_IGNORE], cwd)",
    "git(['hash-object', '--no-filters', '--', FORMAT_IGNORE], cwd)",
  ],
  ['r4-6', 'existsSync(ignorePath) && statSync(ignorePath).isFile()', 'existsSync(ignorePath)'],
]

for (const [finding, before, after] of cases)
  for (const [representation, source] of Object.entries(sources))
    for (const entry of ['function', 'cli']) {
      test(`${finding}: ${representation} ${entry} detects the isolated regression`, t => {
        const cwd = mkdtempSync(join(tmpdir(), 'red-r5-mutant-'))
        t.after(() => rmSync(cwd, { recursive: true, force: true }))
        assert.equal(spawnSync('git', ['init', '-q', cwd]).status, 0)
        for (const path of [
          '.claude/skills/pair-workflow-red-verify',
          '.claude/workflows/pair-contracts',
          'packages/knowledge-hub/dataset/.skills/workflow/red-verify/scripts',
        ]) {
          mkdirSync(join(cwd, path, '..'), { recursive: true })
          cpSync(resolve(path), join(cwd, path), { recursive: true })
        }
        mkdirSync(join(cwd, testFile, '..'), { recursive: true })
        cpSync(resolve(testFile), join(cwd, testFile))
        const script = join(cwd, source)
        const content = readFileSync(script, 'utf8')
        assert.ok(content.includes(before))
        writeFileSync(script, content.replace(before, after))
        const bin = join(cwd, 'bin')
        mkdirSync(bin)
        writeFileSync(join(bin, 'gh'), '#!/bin/sh\nexit 99\n', { mode: 0o755 })
        const env = { ...process.env, PATH: `${bin}:${process.env.PATH}` }
        delete env.NODE_TEST_CONTEXT
        const result = spawnSync(
          process.execPath,
          [
            '--test',
            '--test-name-pattern',
            `${finding}: ${representation} ${entry} ${finding === 'r0-1' ? 'retries a locked seal with crlf' : 'refuses an unrelated directory'}`,
            testFile,
          ],
          { cwd, encoding: 'utf8', env, timeout: 30000 },
        )
        assert.equal(result.status, 1, result.stderr)
        assert.match(result.stdout, new RegExp(`✖ ${finding}: ${representation} ${entry}`))
        assert.match(
          result.stdout,
          finding === 'r0-1' ? /AssertionError/ : /Unable to hash|AssertionError/,
        )
        const control = spawnSync(
          process.execPath,
          ['--test', '--test-name-pattern', `${representation} ${entry} clean control`, testFile],
          { cwd, encoding: 'utf8', env, timeout: 30000 },
        )
        assert.equal(control.status, 0, control.stdout + control.stderr)
        assert.match(control.stdout, /pass 1/)
      })
    }

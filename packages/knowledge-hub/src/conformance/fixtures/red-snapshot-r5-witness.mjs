import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { spawnSync } from 'node:child_process'
import { pathToFileURL } from 'node:url'

const { repo, git, write, redContract, PR, PHASE } = await import(
  pathToFileURL(resolve('.claude/workflows/pair-contracts/red-snapshot-lib.mjs'))
)
const sources = [
  [
    'dataset',
    'packages/knowledge-hub/dataset/.skills/workflow/red-verify/scripts/red-snapshot.mjs',
  ],
  ['installed', '.claude/skills/pair-workflow-red-verify/scripts/red-snapshot.mjs'],
]

function invokeCli(cli, { base, contractPath, cwd }) {
  const args = [
    cli,
    'seal',
    '--pr',
    PR,
    '--phase',
    PHASE,
    '--base',
    base,
    '--contract',
    contractPath,
    '--cwd',
    cwd,
    '--static-gates',
    '[]',
  ]
  return JSON.parse(spawnSync(process.execPath, args, { encoding: 'utf8' }).stdout)
}

for (const [representation, path] of sources) {
  const cli = resolve(path)
  const { seal, verify } = await import(pathToFileURL(cli))
  for (const entry of ['function', 'cli'])
    for (const state of ['missing', 'lf', 'crlf']) {
      test(`r0-1: ${representation} ${entry} retries a locked seal with ${state} ignore`, t => {
        const { cwd } = repo()
        t.after(() => rmSync(cwd, { recursive: true, force: true }))
        if (state !== 'missing') {
          write(cwd, '.gitattributes', `.prettierignore text eol=${state}\n`)
          write(cwd, '.prettierignore', state === 'crlf' ? 'dist\r\n' : 'dist\n')
          git(cwd, 'add', '.gitattributes', '.prettierignore')
          git(cwd, 'commit', '-q', '--no-verify', '-m', 'attributes')
        }
        const base = git(cwd, 'rev-parse', 'HEAD')
        const { contractPath } = redContract(cwd)
        const witness = readFileSync(join(cwd, 'test/a.test.js'))
        const args = { pr: PR, phase: PHASE, base, contractPath, cwd }
        const hook = join(cwd, '.git/hooks/prepare-commit-msg')
        writeFileSync(hook, '#!/bin/sh\ntouch .git/index.lock\nexit 1\n', { mode: 0o755 })
        assert.throws(() => seal(args))
        rmSync(join(cwd, '.git/index.lock'))
        rmSync(hook)
        const out = entry === 'function' ? seal(args) : invokeCli(cli, args)
        assert.equal(out.sealed, true, JSON.stringify(out))
        assert.equal(git(cwd, 'rev-parse', 'HEAD^'), base)
        assert.deepEqual(readFileSync(join(cwd, 'test/a.test.js')), witness)
        assert.equal(verify({ pr: PR, phase: PHASE, base, cwd }).verified, true)
        assert.equal(
          git(cwd, 'status', '--porcelain', '--untracked-files=all'),
          '?? .pair/working/red-draft.json',
        )
      })
    }

  for (const entry of ['function', 'cli'])
    test(`r4-6: ${representation} ${entry} refuses an unrelated directory as dirty without altering it`, t => {
      const { cwd, base } = repo()
      t.after(() => rmSync(cwd, { recursive: true, force: true }))
      const { contractPath } = redContract(cwd)
      const witness = readFileSync(join(cwd, 'test/a.test.js'))
      write(cwd, '.prettierignore/unrelated.txt', 'keep\n')
      const out =
        entry === 'function'
          ? seal({ pr: PR, phase: PHASE, base, contractPath, cwd })
          : JSON.parse(
              spawnSync(
                process.execPath,
                [
                  cli,
                  'seal',
                  '--pr',
                  PR,
                  '--phase',
                  PHASE,
                  '--base',
                  base,
                  '--contract',
                  contractPath,
                  '--cwd',
                  cwd,
                  '--static-gates',
                  '[]',
                ],
                { encoding: 'utf8' },
              ).stdout,
            )
      assert.equal(out.sealed, false)
      assert.equal(out.reason, 'dirty-outside-contract')
      assert.ok(out.paths.includes('.prettierignore/unrelated.txt'))
      assert.equal(git(cwd, 'rev-parse', 'HEAD'), base)
      assert.equal(readFileSync(join(cwd, '.prettierignore/unrelated.txt'), 'utf8'), 'keep\n')
      assert.deepEqual(readFileSync(join(cwd, 'test/a.test.js')), witness)
    })
}

for (const [representation, path] of sources) {
  const cli = resolve(path)
  const { seal, verify } = await import(pathToFileURL(cli))
  for (const entry of ['function', 'cli'])
    for (const scenario of ['clean', 'unrelated-staged']) {
      test(`r0-1: ${representation} ${entry} ${scenario} control`, t => {
        const { cwd, base } = repo()
        t.after(() => rmSync(cwd, { recursive: true, force: true }))
        const { contractPath } = redContract(cwd)
        const args = { pr: PR, phase: PHASE, base, contractPath, cwd }
        const witness = readFileSync(join(cwd, 'test/a.test.js'))
        if (scenario === 'unrelated-staged') {
          const hook = join(cwd, '.git/hooks/prepare-commit-msg')
          writeFileSync(hook, '#!/bin/sh\ntouch .git/index.lock\nexit 1\n', { mode: 0o755 })
          assert.throws(() => seal(args))
          rmSync(join(cwd, '.git/index.lock'))
          rmSync(hook)
          write(cwd, '.prettierignore', 'user-owned\n')
          git(cwd, 'add', '.prettierignore')
        }
        const result = entry === 'function' ? seal(args) : invokeCli(cli, args)
        assert.deepEqual(readFileSync(join(cwd, 'test/a.test.js')), witness)
        if (scenario === 'clean') {
          assert.equal(result.sealed, true, JSON.stringify(result))
          assert.equal(git(cwd, 'rev-parse', 'HEAD^'), base)
          assert.equal(verify({ pr: PR, phase: PHASE, base, cwd }).verified, true)
        } else {
          assert.equal(result.reason, 'dirty-outside-contract')
          assert.equal(git(cwd, 'rev-parse', 'HEAD'), base)
          assert.equal(git(cwd, 'show', ':.prettierignore'), 'user-owned')
        }
      })
    }
}

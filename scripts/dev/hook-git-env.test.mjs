// Run: node --test scripts/dev/hook-git-env.test.mjs
// Git exports GIT_DIR / GIT_INDEX_FILE to the hooks it runs from a linked worktree. Every test fixture the
// hooks reach (vitest, node --test, smoke) that spawns `git init` in a temp dir under that environment
// re-initialises the REAL repository instead (core.bare=true). The hooks scrub the family once, before
// anything runs — this pins it for every hook: a stubbed `pnpm` plays the fixture.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
const clean = Object.fromEntries(Object.entries(process.env).filter(([k]) => !k.startsWith('GIT_')))
const git = (cwd, ...args) => spawnSync('git', args, { cwd, env: clean, encoding: 'utf8' })

for (const hook of ['pre-commit', 'pre-push']) {
  test(`${hook}: a fixture's git init under the hook's inherited GIT_DIR never touches the repository`, () => {
    const t = mkdtempSync(join(tmpdir(), 'hook-env-'))
    const main = join(t, 'main')
    mkdirSync(main)
    git(main, 'init', '-q', '-b', 'main')
    git(
      main,
      '-c',
      'user.name=t',
      '-c',
      'user.email=t@t',
      'commit',
      '-q',
      '--allow-empty',
      '-m',
      'i',
    )
    git(main, 'worktree', 'add', '-q', join(t, 'wt'), '-b', 'b')
    // pre-commit is differential: stage a .ts file so the fixture `pnpm` runs
    writeFileSync(join(t, 'wt', 'a.ts'), '')
    git(join(t, 'wt'), 'add', 'a.ts')
    // the hook as husky runs it, its husky.sh stubbed; `pnpm` is the fixture
    const hooks = join(t, 'hooks')
    mkdirSync(join(hooks, '_'), { recursive: true })
    writeFileSync(join(hooks, '_', 'husky.sh'), '')
    writeFileSync(join(hooks, hook), readFileSync(join(REPO, '.husky', hook)))
    const bin = join(t, 'bin')
    mkdirSync(bin)
    const fixture = join(t, 'fixture')
    writeFileSync(
      join(bin, 'pnpm'),
      `#!/bin/sh\nmkdir -p "${fixture}" && cd "${fixture}" && git init -q\n`,
    )
    chmodSync(join(bin, 'pnpm'), 0o755)
    const gitDir = join(main, '.git', 'worktrees', 'wt')
    const r = spawnSync('sh', [join(hooks, hook)], {
      cwd: join(t, 'wt'),
      env: {
        ...clean,
        PATH: `${bin}:${process.env.PATH}`,
        GIT_DIR: gitDir,
        GIT_INDEX_FILE: join(gitDir, 'index'),
      },
      encoding: 'utf8',
    })
    assert.equal(r.status, 0, r.stderr)
    assert.ok(existsSync(join(fixture, '.git')), 'the fixture initialised its own repository')
    assert.notEqual(git(main, 'config', 'core.bare').stdout.trim(), 'true')
  })
}

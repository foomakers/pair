import { test } from 'node:test'
import assert from 'node:assert/strict'
import { execFileSync, spawnSync } from 'node:child_process'
import { mkdtempSync, writeFileSync, mkdirSync, rmSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'

// INC-13: review includes committed PR changes after push; push remains differential.
test('review and push gates select their respective bases after push', () => {
  const dir = mkdtempSync(join(tmpdir(), 'pair-gate-'))
  try {
    const git = (...args) => execFileSync('git', args, { cwd: dir, stdio: 'pipe' }).toString().trim()
    git('init', '-b', 'main')
    git('config', 'user.email', 'test@example.com')
    git('config', 'user.name', 'Test')
    writeFileSync(join(dir, 'file'), 'base')
    git('add', '.')
    git('commit', '-m', 'base')
    git('update-ref', 'refs/remotes/origin/main', git('rev-parse', 'HEAD'))
    git('checkout', '-b', 'feature')
    writeFileSync(join(dir, 'file'), 'change')
    git('commit', '-am', 'change')
    git('update-ref', 'refs/remotes/origin/feature', git('rev-parse', 'HEAD'))
    git('config', 'remote.origin.fetch', '+refs/heads/*:refs/remotes/origin/*')
    git('config', 'branch.feature.remote', 'origin')
    git('config', 'branch.feature.merge', 'refs/heads/feature')
    const bin = join(dir, 'bin')
    mkdirSync(bin)
    writeFileSync(join(bin, 'turbo'), '#!/bin/sh\nprintf "%s\\n" "$PAIR_PUSH_BASE" > "$GATE_CAPTURE"\n', { mode: 0o755 })
    writeFileSync(join(bin, 'pnpm'), '#!/bin/sh\nif [ "$1" = gate:push ]; then exec sh -c "$PUSH_SCRIPT"; fi\n', { mode: 0o755 })
    const scripts = JSON.parse(readFileSync(resolve('package.json'), 'utf8')).scripts
    const capture = join(dir, 'base')
    const env = { ...process.env, PATH: `${bin}:${process.env.PATH}`, GATE_CAPTURE: capture, PUSH_SCRIPT: scripts['gate:push'] }
    const run = script => {
      const result = spawnSync('sh', ['-c', script], { cwd: dir, env, encoding: 'utf8' })
      assert.equal(result.status, 0, result.stderr)
      return readFileSync(capture, 'utf8').trim()
    }
    assert.equal(run(scripts['gate:push']), git('rev-parse', 'HEAD'))
    const reviewBase = run(scripts['gate:review'])
    assert.equal(reviewBase, git('rev-parse', 'origin/main'))
    assert.equal(git('diff', '--name-only', reviewBase, 'HEAD'), 'file')
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

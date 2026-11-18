import { fileURLToPath } from 'node:url'
import {
  test,
  assert,
  repo,
  git,
  write,
  redContract,
  seal,
  pushSnapshot,
  verifyChain,
  PR,
  PHASE,
  CLI,
  mkdtempSync,
  tmpdir,
  join,
  rmSync,
  writeFileSync,
  spawnSync,
} from '../../../../../.claude/workflows/pair-contracts/red-snapshot-lib.mjs'

const datasetCli = fileURLToPath(
  new URL('../../../dataset/.skills/workflow/red-verify/scripts/red-snapshot.mjs', import.meta.url),
)
const dataset = await import(datasetCli)
for (const representation of ['installed', 'dataset']) {
  for (const entry of ['function', 'cli']) {
    for (const scenario of ['retry', 'staged', 'clean']) {
      test(`r5-g2 ${representation} ${entry} ${scenario}: publish a clean test-only seal`, t => {
        const { cwd, base } = repo()
        const remote = mkdtempSync(join(tmpdir(), 'red-remote-'))
        t.after(() => {
          rmSync(cwd, { recursive: true, force: true })
          rmSync(remote, { recursive: true, force: true })
        })
        git(remote, 'init', '-q', '--bare', '-b', 'main')
        git(cwd, 'remote', 'add', 'origin', remote)
        git(cwd, 'push', '-q', 'origin', 'main:refs/heads/story')
        const { contractPath } = redContract(cwd, {
          fixScope: { owner: 'test', mode: 'test', allowedPaths: [] },
        })
        const result = seal({ pr: PR, phase: PHASE, base, contractPath, cwd })
        assert.equal(result.sealed, true, JSON.stringify(result))
        const push = makePush({ entry, representation, result, cwd })
        if (scenario === 'retry') {
          const hook = join(cwd, '.git/hooks/prepare-commit-msg')
          writeFileSync(hook, '#!/bin/sh\nexit 1\n', { mode: 0o755 })
          assert.equal(push().pushed, false)
          assert.equal(git(remote, 'rev-parse', 'refs/heads/story'), base)
          rmSync(hook)
        } else if (scenario === 'staged') {
          write(cwd, 'src/other.js', 'export const o = 42\n')
          git(cwd, 'add', '--', 'src/other.js')
        }
        checkPublication({ push, remote, cwd, scenario, base, result, t })
      })
    }
  }
}

function checkPublication({ push, remote, cwd, scenario, base, result, t }) {
  const out = push()
  const remoteHead = git(remote, 'rev-parse', 'refs/heads/story')
  if (scenario === 'clean') assert.equal(out.pushed, true)
  if (scenario === 'staged') assert.equal(git(cwd, 'show', ':src/other.js'), 'export const o = 42')
  if (!out.pushed) {
    assert.equal(remoteHead, base)
    return
  }
  assert.equal(git(remote, 'rev-parse', `${remoteHead}^`), result.snapshot)
  assert.equal(git(remote, 'ls-tree', '--name-only', remoteHead, result.manifest), '')
  assert.equal(git(remote, 'show', `${remoteHead}:src/other.js`), 'export const o = 0')
  if (scenario === 'clean') assert.equal(push().pushed, true)
  const clone = mkdtempSync(join(tmpdir(), 'red-clone-'))
  t.after(() => rmSync(clone, { recursive: true, force: true }))
  git(clone, 'clone', '-q', '-b', 'story', remote, '.')
  const chain = verifyChain({ pr: PR, base, cwd: clone, expectContract: true })
  assert.equal(chain.verified, true, JSON.stringify(chain))
}

function makePush({ entry, representation, result, cwd }) {
  return () => {
    if (entry === 'function') {
      try {
        return (representation === 'dataset' ? dataset.pushSnapshot : pushSnapshot)({
          snapshot: result.snapshot,
          branch: 'story',
          cwd,
        })
      } catch {
        return { pushed: false }
      }
    }
    const run = spawnSync(
      process.execPath,
      [
        representation === 'dataset' ? datasetCli : CLI,
        'push',
        '--snapshot',
        result.snapshot,
        '--branch',
        'story',
        '--cwd',
        cwd,
      ],
      { encoding: 'utf8' },
    )
    return run.status === 0 ? JSON.parse(run.stdout) : { pushed: false }
  }
}

import assert from 'node:assert/strict'
import { cpSync, mkdtempSync, mkdirSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { spawnSync } from 'node:child_process'

const root = resolve(import.meta.dirname, '../../..')
const work = mkdtempSync(join(tmpdir(), 'pair-postbuild-'))
try {
  const packageRoot = join(work, 'apps/pair-cli')
  mkdirSync(join(packageRoot, 'dist'), { recursive: true })
  cpSync(join(root, 'apps/pair-cli/package.json'), join(packageRoot, 'package.json'))
  cpSync(
    join(root, 'apps/pair-cli/scripts/postbuild.js'),
    join(packageRoot, 'scripts/postbuild.js'),
  )
  const source = 'packages/knowledge-hub/dataset/.skills/next/control-state.mjs'
  const installed = join(work, source)
  mkdirSync(resolve(installed, '..'), { recursive: true })
  cpSync(join(root, source), installed)
  const result = spawnSync(process.execPath, [join(packageRoot, 'scripts/postbuild.js')], {
    encoding: 'utf8',
    timeout: 30_000,
  })
  assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`)
  assert.deepEqual(
    readFileSync(join(packageRoot, 'dist/assets/control-state.mjs')),
    readFileSync(installed),
  )
  console.log('pass: postbuild copied authoritative resolver into built CLI')
} finally {
  rmSync(work, { recursive: true, force: true })
}

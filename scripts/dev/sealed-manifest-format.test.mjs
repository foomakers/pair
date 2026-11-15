// Run: node --test scripts/dev/sealed-manifest-format.test.mjs
// A sealed RED manifest (`.pair/red-snapshots/*.json`) is machine-written JSON the seal excludes through
// the repo-root `.prettierignore` (red-snapshot.mjs seal writes that entry). The prettier wrappers pass
// explicit `--ignore-path`s, which replace prettier's default lookup — so the root file must be one of
// them, from the repo root AND from a package directory, or a formatter run rewrites the sealed bytes.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
const BIN = join(REPO, 'tools/prettier-config/bin')
const env = Object.fromEntries(Object.entries(process.env).filter(([k]) => !k.startsWith('GIT_')))
// JSON.stringify layout prettier would collapse (`"a": ["x", "y"]`): a formatter run WOULD change it.
const MANIFEST = '{\n  "a": [\n    "x",\n    "y"\n  ]\n}\n'

const workspace = () => {
  const root = mkdtempSync(join(tmpdir(), 'sealed-fmt-'))
  spawnSync('git', ['init', '-q'], { cwd: root, env })
  writeFileSync(join(root, '.prettierignore'), '.pair/red-snapshots/\n')
  writeFileSync(join(root, '.prettierrc.json'), '{}\n')
  mkdirSync(join(root, '.pair/red-snapshots'), { recursive: true })
  writeFileSync(join(root, '.pair/red-snapshots/pr-1-r1-g1.json'), MANIFEST)
  mkdirSync(join(root, 'pkg'))
  writeFileSync(join(root, 'pkg/package.json'), '{ "name": "pkg" }\n')
  return root
}

for (const [label, sub, path] of [
  ['repo root', '.', '.pair/red-snapshots/pr-1-r1-g1.json'],
  ['package directory', 'pkg', '../.pair/red-snapshots/pr-1-r1-g1.json'],
]) {
  test(`prettier wrappers leave a sealed manifest untouched from the ${label}`, () => {
    const root = workspace()
    const check = spawnSync('sh', [join(BIN, 'prettier-check.sh'), path], {
      cwd: join(root, sub),
      env,
      encoding: 'utf8',
    })
    assert.equal(check.status, 0, check.stdout + check.stderr)
    spawnSync('sh', [join(BIN, 'prettier-fix.sh'), path], {
      cwd: join(root, sub),
      env,
      encoding: 'utf8',
    })
    assert.equal(readFileSync(join(root, '.pair/red-snapshots/pr-1-r1-g1.json'), 'utf8'), MANIFEST)
  })
}

// #646 r1-g1-gap1: a sealed manifest excluded by the repo's .prettierignore
// must neither block the format gate nor be rewritten by its fix companion.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import {
  mkdtempSync,
  mkdirSync,
  writeFileSync,
  readFileSync,
  rmSync,
  copyFileSync,
  symlinkSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const repo = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
const manifest = '.pair/red-snapshots/pr-653-r1-g1.json'
const raw = '{"sealed":true}'
const formatted = '{ "sealed": true }\n'

function run(command, args, cwd) {
  const result = spawnSync(command, args, { cwd, encoding: 'utf8', timeout: 10000 })
  assert.ifError(result.error)
  return result
}

function fixture(t, ignore = '.pair/red-snapshots/\n', git = true) {
  const root = mkdtempSync(join(tmpdir(), 'pair manifest format '))
  t.after(() => rmSync(root, { recursive: true, force: true }))
  if (git) assert.equal(run('git', ['init', '-q', root], root).status, 0)
  mkdirSync(join(root, dirname(manifest)), { recursive: true })
  mkdirSync(join(root, 'pkg'), { recursive: true })
  if (ignore !== null) writeFileSync(join(root, '.prettierignore'), ignore)
  writeFileSync(join(root, manifest), raw)
  writeFileSync(join(root, 'ordinary.json'), formatted)
  return root
}

function wrapper(mode, cwd, paths) {
  return run(join(repo, `tools/prettier-config/bin/prettier-${mode}.sh`), paths, cwd)
}

for (const mode of ['check', 'fix']) {
  for (const location of ['root', 'nested']) {
    test(`r1-g1-gap1-${location}-${mode}`, t => {
      const root = fixture(t)
      const cwd = location === 'root' ? root : join(root, 'pkg')
      const result = wrapper(mode, cwd, [relative(cwd, join(root, manifest))])
      assert.equal(result.status, 0, result.stdout + result.stderr)
      assert.equal(readFileSync(join(root, manifest), 'utf8'), raw, 'sealed bytes preserved')
    })
  }

  test(`r1-g1-gap1-gate-${mode}`, t => {
    const root = fixture(t)
    const result = run(
      join(repo, 'scripts/format-lib/run-format.sh'),
      [mode, 'prettier', 'json'],
      root,
    )
    assert.equal(result.status, 0, result.stdout + result.stderr)
    assert.equal(readFileSync(join(root, manifest), 'utf8'), raw, 'gate preserves sealed bytes')
  })

  test(`r1-g1-gap1-glob-${mode}`, t => {
    const root = fixture(t)
    const result = wrapper(mode, root, [])
    assert.equal(result.status, 0, result.stdout + result.stderr)
    assert.equal(readFileSync(join(root, manifest), 'utf8'), raw, 'glob preserves sealed bytes')
  })

  test(`r1-g1-gap1-shared-${mode}`, t => {
    const root = fixture(t)
    const config = join(root, 'tools/prettier-config')
    mkdirSync(join(config, 'bin'), { recursive: true })
    mkdirSync(join(config, 'dist'), { recursive: true })
    for (const file of [
      'bin/prettier-check.sh',
      'bin/prettier-fix.sh',
      'bin/_ignore-args.sh',
      '.prettierignore',
    ]) {
      copyFileSync(join(repo, 'tools/prettier-config', file), join(config, file))
    }
    symlinkSync(join(repo, 'tools/prettier-config/node_modules'), join(config, 'node_modules'))
    writeFileSync(join(config, 'dist/ignored.json'), raw)
    const result = run(join(config, `bin/prettier-${mode}.sh`), ['dist/ignored.json'], config)
    assert.equal(result.status, 0, result.stdout + result.stderr)
    assert.equal(readFileSync(join(config, 'dist/ignored.json'), 'utf8'), raw)
  })

  test(`r1-g1-gap1-local-gitignore-${mode}`, t => {
    const root = fixture(t)
    const cwd = join(root, 'pkg')
    writeFileSync(join(cwd, '.gitignore'), 'local.json\n')
    writeFileSync(join(cwd, 'local.json'), raw)
    const result = wrapper(mode, cwd, ['local.json'])
    assert.equal(result.status, 0, result.stdout + result.stderr)
    assert.equal(readFileSync(join(cwd, 'local.json'), 'utf8'), raw)
  })

  test(`r1-g1-gap1-invalid-${mode}`, t => {
    const root = fixture(t)
    writeFileSync(join(root, 'ordinary.json'), '{')
    const result = wrapper(mode, root, ['ordinary.json'])
    assert.equal(result.status, 2, result.stdout + result.stderr)
    assert.equal(readFileSync(join(root, 'ordinary.json'), 'utf8'), '{')
  })

  for (const [label, ignore] of [
    ['absent', null],
    ['empty', ''],
  ]) {
    test(`r1-g1-gap1-${label}-${mode}`, t => {
      const root = fixture(t, ignore)
      const result = wrapper(mode, root, [manifest])
      assert.equal(result.status, mode === 'check' ? 1 : 0, result.stdout + result.stderr)
      assert.equal(readFileSync(join(root, manifest), 'utf8'), mode === 'check' ? raw : formatted)
    })
  }

  test(`r1-g1-gap1-neighbor-${mode}`, t => {
    const root = fixture(t)
    writeFileSync(join(root, 'ordinary.json'), raw)
    const result = wrapper(mode, root, ['ordinary.json'])
    assert.equal(result.status, mode === 'check' ? 1 : 0, result.stdout + result.stderr)
    assert.equal(
      readFileSync(join(root, 'ordinary.json'), 'utf8'),
      mode === 'check' ? raw : formatted,
    )
  })

  test(`r1-g1-gap1-gitignore-${mode}`, t => {
    const root = fixture(t)
    writeFileSync(join(root, '.gitignore'), 'ordinary.json\n')
    writeFileSync(join(root, 'ordinary.json'), raw)
    const result = wrapper(mode, root, ['ordinary.json'])
    assert.equal(result.status, 0, result.stdout + result.stderr)
    assert.equal(readFileSync(join(root, 'ordinary.json'), 'utf8'), raw)
  })

  test(`r1-g1-gap1-nongit-${mode}`, t => {
    const root = fixture(t, null, false)
    const result = wrapper(mode, root, [manifest])
    assert.equal(result.status, mode === 'check' ? 1 : 0, result.stdout + result.stderr)
    assert.equal(readFileSync(join(root, manifest), 'utf8'), mode === 'check' ? raw : formatted)
  })
}

// Rejection r1-g1-gap1-ignore-coexistence: each ignore source must survive
// composition with the repository exclusion in the SAME formatter invocation.
for (const source of ['shared', 'root-git', 'package-git']) {
  for (const mode of ['check', 'fix']) {
    test(`r1-g1-gap1-coexist-${source}-${mode}`, t => {
      const root = fixture(t)
      const config = join(root, 'tools/prettier-config')
      mkdirSync(join(config, 'bin'), { recursive: true })
      mkdirSync(join(config, 'dist'), { recursive: true })
      for (const file of [
        'bin/prettier-check.sh',
        'bin/prettier-fix.sh',
        'bin/_ignore-args.sh',
        '.prettierignore',
      ]) {
        copyFileSync(join(repo, 'tools/prettier-config', file), join(config, file))
      }
      symlinkSync(join(repo, 'tools/prettier-config/node_modules'), join(config, 'node_modules'))
      const cwd = { shared: config, 'root-git': root, 'package-git': join(root, 'pkg') }[source]
      const excluded = join(cwd, source === 'shared' ? 'dist/ignored.json' : 'ignored.json')
      if (source !== 'shared') writeFileSync(join(cwd, '.gitignore'), 'ignored.json\n')
      writeFileSync(excluded, raw)
      const sealed = join(root, manifest)
      const result = run(
        join(config, `bin/prettier-${mode}.sh`),
        [relative(cwd, sealed), relative(cwd, excluded)],
        cwd,
      )
      assert.equal(result.status, 0, result.stdout + result.stderr)
      assert.equal(readFileSync(sealed, 'utf8'), raw, 'repository exclusion preserves sealed bytes')
      assert.equal(readFileSync(excluded, 'utf8'), raw, `${source} exclusion preserves its bytes`)
    })
  }
}

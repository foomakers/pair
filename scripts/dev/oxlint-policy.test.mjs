import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { delimiter, dirname, join, resolve } from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'

const root = fileURLToPath(new URL('../../', import.meta.url))
const runner = join(root, 'tools/oxlint-config/bin/oxlint.mjs')

function workspace(t, configPath, overrides = {}) {
  const cwd = mkdtempSync(join(tmpdir(), 'pair-oxlint-'))
  t.after(() => rmSync(cwd, { recursive: true, force: true }))
  const config = JSON.parse(readFileSync(join(root, configPath), 'utf8'))
  config.extends = config.extends.map(path => join(root, dirname(configPath), path))
  writeFileSync(join(cwd, '.oxlintrc.json'), JSON.stringify({ ...config, ...overrides }))
  return cwd
}

function lint(cwd, ...args) {
  return lintCommand(cwd, runner, ...args)
}

function lintCommand(cwd, command, ...args) {
  const result = runLint(cwd, command, ...args)
  assert.equal(result.stderr, '')
  const { diagnostics } = JSON.parse(result.stdout)
  return { diagnostics, status: result.status }
}

function runLint(cwd, command, ...args) {
  return spawnSync(command, args, {
    cwd,
    encoding: 'utf8',
    env: {
      ...process.env,
      PAIR_LINT_REPORT: args.some(arg => /^--format(?:=|$)/.test(arg)) ? '' : 'json',
    },
  })
}

test('#693 AC-2 preserves package lint scope and check/fix behavior', t => {
  const cwd = workspace(t, 'apps/pair-cli/.oxlintrc.json')
  const typed = 'export const value: any = 1\n'
  const fixable = 'export let value = 1\n'
  mkdirSync(join(cwd, 'nested/dist'), { recursive: true })
  mkdirSync(join(cwd, 'generated'))
  writeFileSync(join(cwd, '.gitignore'), 'tracked.ts\ngenerated/\n')
  writeFileSync(join(cwd, 'tracked.ts'), typed)
  writeFileSync(join(cwd, 'generated/untracked.ts'), 'debugger\n')
  writeFileSync(join(cwd, 'ignored.vue'), '<script>const x = ;</script>')
  writeFileSync(join(cwd, 'ignored.svelte'), '<script>const x = ;</script>')
  writeFileSync(join(cwd, 'ignored.astro'), '---\nconst x = ;\n---')
  writeFileSync(join(cwd, 'nested/dist/covered.ts'), typed)
  writeFileSync(join(cwd, 'ignored.config.ts'), typed)
  writeFileSync(join(cwd, 'fixable.ts'), fixable)
  for (const args of [['init', '-q'], ['add', '-f', 'tracked.ts']]) {
    assert.equal(spawnSync('git', args, { cwd }).status, 0)
  }

  const check = lint(cwd, '--workspace')
  assert.equal(check.status, 1)
  assert.deepEqual(check.diagnostics.map(item => item.filename).sort(), ['fixable.ts', 'generated/untracked.ts', 'nested/dist/covered.ts', 'tracked.ts'])
  assert.equal(readFileSync(join(cwd, 'fixable.ts'), 'utf8'), fixable)
  assert.equal(lint(cwd, 'tracked.ts').status, 1)
  assert.equal(lint(cwd, join(cwd, 'tracked.ts')).status, 1)
  for (const file of ['ignored.config.ts', 'ignored.vue', 'ignored.svelte', 'ignored.astro']) {
    const direct = lint(cwd, file)
    assert.equal(direct.status, 0, file)
    assert.deepEqual(direct.diagnostics.map(({ filename, severity }) => [filename, severity]), [[file, 'warning']])
  }

  const fix = lint(cwd, '--workspace', '--fix')
  assert.equal(fix.status, 1)
  assert.deepEqual(fix.diagnostics.map(item => item.filename).sort(), ['generated/untracked.ts', 'nested/dist/covered.ts', 'tracked.ts'])
  assert.equal(readFileSync(join(cwd, 'fixable.ts'), 'utf8'), 'export const value = 1\n')
  assert.equal(readFileSync(join(cwd, 'tracked.ts'), 'utf8'), typed)
  assert.equal(readFileSync(join(cwd, 'ignored.config.ts'), 'utf8'), typed)
  assert.equal(lint(cwd, '--workspace', '--fix').diagnostics.length, 3)
  assert.equal(readFileSync(join(cwd, 'fixable.ts'), 'utf8'), 'export const value = 1\n')
})

test('#693 R5 checks selection before autofix with readable and unreadable excludes', async t => {
  const cwd = workspace(t, 'apps/pair-cli/.oxlintrc.json', {
    extends: [],
    rules: { 'eslint/prefer-const': 'error' },
  })
  const excluded = join(cwd, 'dist')
  const output = 'dist/deep/excluded.ts'
  const included = 'nested/dist/covered.ts'
  const staged = 'staged.ts'
  const ignored = 'staged.config.ts'
  const files = [included, staged, ignored, output]
  const source = 'export let value = 1\n'
  const fixedSource = 'export const value = 1\n'
  mkdirSync(join(excluded, 'deep'), { recursive: true })
  mkdirSync(join(cwd, 'nested/dist'), { recursive: true })
  mkdirSync(join(cwd, 'empty'))
  for (const file of files) writeFileSync(join(cwd, file), source)
  writeFileSync(join(cwd, '.gitignore'), `${staged}\n`)
  for (const args of [['init', '-q'], ['add', '-f', staged, ignored]]) {
    assert.equal(spawnSync('git', args, { cwd }).status, 0)
  }
  const index = spawnSync('git', ['diff', '--cached', '--name-only', '-z'], { cwd, encoding: 'utf8' })
  assert.equal(index.status, 0)
  const stagedPaths = index.stdout.split('\0').filter(Boolean)
  assert.deepEqual(stagedPaths, [ignored, staged])

  const allowEmpty = '--no-error-on-unmatched-pattern'
  const defaultFiles = [included, staged]
  const cases = [
    { name: 'package defaults', args: ['--config', '.oxlintrc.json'], selected: defaultFiles, package: true },
    { name: 'direct defaults', args: [], selected: defaultFiles },
    { name: 'workspace directory', args: ['.'], selected: defaultFiles },
    { name: 'broad glob', args: ['**/*.ts'], selected: defaultFiles },
    { name: 'brace glob', args: ['{dist,nested}/**/*.ts'], selected: [included] },
    { name: 'permitted file', args: [included], selected: [included] },
    { name: 'staged operands', args: stagedPaths, selected: [staged], warning: ignored },
    { name: 'unmatched glob', args: [allowEmpty, 'empty/*.ts', 'nested'], selected: [included] },
    { name: 'explicit excluded directory', args: [allowEmpty, 'dist', 'nested'], selected: [included], explicit: true },
    { name: 'explicit excluded glob', args: [allowEmpty, 'dist/**/*.ts', 'nested'], selected: [included], explicit: true },
    { name: 'explicit brace glob', args: [allowEmpty, 'dist/deep/{excluded,missing}.ts', 'nested'], selected: [included], explicit: true },
    { name: 'glob after staged operands', args: [allowEmpty, ...stagedPaths, 'dist/deep/**/*.ts', 'nested'], selected: defaultFiles, warning: ignored, explicit: true },
  ]
  const modes = process.getuid?.() === 0 ? [0o700] : [0o700, 0o000]
  for (const mode of modes) {
    for (const { name, args, selected, warning, explicit, package: packageLint } of cases) {
      for (const fix of [false, true]) {
        await t.test(`${mode ? 'readable' : 'unreadable'} / ${name} / ${fix ? 'fix' : 'check'}`, () => {
          for (const file of files) writeFileSync(join(cwd, file), source)
          chmodSync(excluded, mode)
          const command = packageLint ? join(dirname(runner), fix ? 'lint-fix.sh' : 'lint.sh') : runner
          const flags = fix && !packageLint ? ['--fix'] : []
          let result
          try {
            if (!mode) assert.throws(() => readdirSync(excluded), { code: 'EACCES' })
            result = runLint(cwd, command, ...flags, ...args)
          } finally {
            chmodSync(excluded, 0o700)
          }

          const denied = !mode && explicit
          if (denied) {
            assert.equal(result.status, 2)
            assert.match(result.stderr, /EACCES.*dist/)
            assert.equal(result.stdout, '')
          } else {
            assert.equal(result.status, fix ? 0 : 1)
            assert.equal(result.stderr, '')
            const expected = fix ? [] : selected.map(file => [file, 'error'])
            if (warning) expected.push([warning, 'warning'])
            const { diagnostics } = JSON.parse(result.stdout)
            assert.deepEqual(diagnostics.map(({ filename, severity }) => [filename, severity]).sort(), expected.sort())
          }
          for (const file of files) {
            const expected = fix && !denied && selected.includes(file) ? fixedSource : source
            assert.equal(readFileSync(join(cwd, file), 'utf8'), expected, file)
          }
        })
      }
    }
  }
})

test('#693 R5 checks sources inside directories with excluded file extensions', t => {
  const cwd = workspace(t, 'apps/pair-cli/.oxlintrc.json')
  const source = 'export let value = 1\n'
  const selected = 'folder.mts/nested.cts/components.jsx/covered.ts'
  mkdirSync(dirname(join(cwd, selected)), { recursive: true })
  writeFileSync(join(cwd, selected), source)
  writeFileSync(join(cwd, 'folder.mts/ignored.mts'), source)
  assert.equal(spawnSync('git', ['init', '-q'], { cwd }).status, 0)
  assert.equal(spawnSync('git', ['add', selected], { cwd }).status, 0)
  for (const args of [['--workspace'], [selected]]) {
    const check = lint(cwd, ...args)
    assert.deepEqual(check.diagnostics.map(d => [d.filename, d.code]), [[selected, 'eslint-js(prefer-const)']])
    assert.equal(check.status, 1)
  }
  assert.equal(lint(cwd, '--workspace', '--fix').status, 0)
  assert.equal(readFileSync(join(cwd, selected), 'utf8'), 'export const value = 1\n')
  assert.equal(readFileSync(join(cwd, 'folder.mts/ignored.mts'), 'utf8'), source)
})

const discoveryErrors = [['dangling', 'ENOENT'], ['loop', 'ELOOP'], ['directory link', 'EISDIR'], ['external directory link', 'EISDIR']]
if (process.getuid?.() !== 0) discoveryErrors.push(['unreadable', 'EACCES'])
for (const [name, code] of discoveryErrors) {
  test(`#693 R5 package fix fails before writing when discovery encounters a ${name} source`, t => {
    const cwd = workspace(t, 'apps/pair-cli/.oxlintrc.json')
    const source = 'export let value = 1\n'
    const ordinary = join(cwd, 'ordinary.ts')
    writeFileSync(ordinary, source)
    if (code === 'EACCES') {
      const dir = join(cwd, 'included')
      mkdirSync(dir)
      chmodSync(dir, 0)
    } else if (code === 'EISDIR') {
      const target = name === 'directory link' ? join(cwd, 'target') : `${cwd}-target`
      mkdirSync(target)
      t.after(() => rmSync(target, { recursive: true, force: true }))
      symlinkSync(target, join(cwd, 'broken.ts'), 'dir')
    } else {
      symlinkSync(name === 'loop' ? 'broken.ts' : 'missing', join(cwd, 'broken.ts'))
    }
    const result = runLint(cwd, join(dirname(runner), 'lint-fix.sh'))
    if (code === 'EACCES') chmodSync(join(cwd, 'included'), 0o700)
    assert.equal(result.status, 2)
    assert.ok(result.stderr.includes(code))
    assert.equal(readFileSync(ordinary, 'utf8'), source)
  })
}

if (process.getuid?.() !== 0) {
  test('#693 R5 validates selected source readability before fixing any sibling', t => {
    const cwd = workspace(t, 'apps/pair-cli/.oxlintrc.json')
    const source = 'export let value = 1\n'
    const sibling = join(cwd, 'sibling.ts')
    const blocked = join(cwd, 'blocked.ts')
    const ignored = join(cwd, 'ignored.config.ts')
    for (const file of [blocked, sibling, ignored]) writeFileSync(file, source)
    chmodSync(blocked, 0)
    chmodSync(ignored, 0)
    try {
      assert.throws(() => readFileSync(blocked), { code: 'EACCES' })
      for (const args of [['--workspace', '--fix'], ['--fix', 'sibling.ts', blocked], ['--fix', 'blocked.ts', 'sibling.ts']]) {
        const result = runLint(cwd, runner, ...args)
        assert.equal(result.status, 2)
        assert.match(result.stderr, /EACCES.*blocked\.ts/)
        assert.equal(readFileSync(sibling, 'utf8'), source)
      }
      chmodSync(blocked, 0o600)
      assert.equal(lint(cwd, '--workspace', '--fix').status, 0)
      assert.equal(readFileSync(sibling, 'utf8'), 'export const value = 1\n')
    } finally {
      chmodSync(blocked, 0o600)
      chmodSync(ignored, 0o600)
    }
    assert.equal(readFileSync(ignored, 'utf8'), source)
  })

  test('#693 R5 reports fix write failures as operational errors', t => {
    const cwd = workspace(t, 'apps/pair-cli/.oxlintrc.json')
    const file = join(cwd, 'readonly.ts')
    const sibling = join(cwd, 'sibling.ts')
    const source = 'export let value = 1\n'
    writeFileSync(file, source)
    chmodSync(file, 0o444)
    try {
      for (const flags of [[], ['--format', 'json'], ['--silent']]) {
        writeFileSync(sibling, source)
        const result = runLint(cwd, runner, '--workspace', '--fix', ...flags)
        assert.equal(result.status, 2)
        if (!flags.includes('--silent')) assert.match(result.stdout, /Failed to write file .*readonly\.ts/)
        assert.equal(readFileSync(sibling, 'utf8'), 'export const value = 1\n')
        assert.equal(readFileSync(file, 'utf8'), source)
      }
    } finally {
      chmodSync(file, 0o600)
    }
    writeFileSync(file, 'export const value = 1\n')
    chmodSync(file, 0o444)
    assert.equal(lint(cwd, '--workspace', '--fix').status, 0)
  })

  test('#693 R13 preserves the selected native reporter on a write failure', t => {
    const cwd = workspace(t, 'apps/pair-cli/.oxlintrc.json')
    const blocked = join(cwd, 'blocked.ts')
    writeFileSync(blocked, 'export let value = 1\n')
    chmodSync(blocked, 0o444)
    const native = join(root, 'tools/oxlint-config/node_modules/.bin/oxlint')
    const stable = text => text.replace(/^Finished in .*$/gm, '').trim()
    for (const format of ['github', 'checkstyle', 'junit', 'gitlab', 'sarif', 'stylish', 'unix', 'agent', 'default']) {
      const args = ['--fix', '--format', format, 'blocked.ts']
      const expected = runLint(cwd, native, ...args)
      assert.equal(expected.status, 1, format)
      const result = runLint(cwd, runner, ...args)
      assert.equal(result.status, 2, format)
      assert.equal(stable(result.stdout), stable(expected.stdout), format)
      assert.equal(result.stderr, expected.stderr, format)
    }
  })

  test('#693 R12 a transient native write failure survives a subsequent permission change', t => {
    const cwd = workspace(t, 'apps/pair-cli/.oxlintrc.json')
    const file = join(cwd, 'blocked.ts')
    const sibling = join(cwd, 'sibling.ts')
    const source = 'export let value = 1\n'
    writeFileSync(file, source)
    writeFileSync(sibling, source)
    chmodSync(file, 0o444)
    mkdirSync(join(cwd, 'dist'))
    const release = join(cwd, 'dist/release.cjs')
    // Release the real file as soon as the native fix returns, before the adapter observes its result.
    writeFileSync(release, `
      const child = require('node:child_process')
      const nativeSpawn = child.spawnSync
      child.spawnSync = (command, args, options) => {
        const result = nativeSpawn(command, args, options)
        if (args.includes('--fix')) require('node:fs').chmodSync('blocked.ts', 0o600)
        return result
      }
      require('node:module').syncBuiltinESMExports()
    `)
    const result = runLint(cwd, process.execPath, '--require', release, runner, '--workspace', '--fix')
    assert.equal(result.status, 2)
    const { diagnostics } = JSON.parse(result.stdout)
    assert.ok(diagnostics.some(d => d.message.includes('Failed to write file') && d.message.includes('blocked.ts')))
    assert.equal(readFileSync(file, 'utf8'), source)
    assert.equal(readFileSync(sibling, 'utf8'), 'export const value = 1\n')
  })
}

test('#693 R5 ignores broken links excluded by the workspace policy', t => {
  const cwd = workspace(t, 'apps/pair-cli/.oxlintrc.json')
  for (const name of ['ignored.config.ts', 'ignored.mts', 'ignored.vue']) symlinkSync('missing', join(cwd, name))
  writeFileSync(join(cwd, 'ordinary.ts'), 'export let value = 1\n')
  assert.equal(lint(cwd, '--workspace', '--fix').status, 0)
  assert.equal(readFileSync(join(cwd, 'ordinary.ts'), 'utf8'), 'export const value = 1\n')
})

test('#693 R5 rejects default discovery when only ignored files exist', t => {
  const cwd = workspace(t, 'apps/pair-cli/.oxlintrc.json')
  for (const name of ['README.md', 'ignored.mts', 'ignored.config.ts']) writeFileSync(join(cwd, name), '')
  for (const args of [[], ['--workspace'], ['--workspace', '--fix']]) {
    const empty = runLint(cwd, runner, ...args)
    assert.equal(empty.status, 2)
  }
  writeFileSync(join(cwd, 'clean.ts'), 'export const value = 1\n')
  assert.deepEqual(lint(cwd, '--workspace'), { status: 0, diagnostics: [] })
})

test('#693 R11 source-empty website package scripts succeed on check and fix', t => {
  const cwd = workspace(t, 'apps/website/.oxlintrc.json')
  const website = join(root, 'apps/website')
  const { scripts } = JSON.parse(readFileSync(join(website, 'package.json'), 'utf8'))
  writeFileSync(join(cwd, 'package.json'), JSON.stringify({ private: true, scripts }))
  const ignored = join(cwd, 'ignored.mts')
  writeFileSync(ignored, 'export let value = 1\n')
  const env = { ...process.env, PATH: join(website, 'node_modules/.bin') + delimiter + process.env.PATH }
  for (const task of ['lint', 'lint:fix']) {
    const result = spawnSync('pnpm', ['--silent', 'run', task], { cwd, env, encoding: 'utf8' })
    assert.equal(result.status, 0, result.stderr)
    assert.equal(readFileSync(ignored, 'utf8'), 'export let value = 1\n')
  }
})

test('#693 R14 preserves native file-list and timings debug modes with an explicit fix reporter', t => {
  const cwd = workspace(t, 'apps/pair-cli/.oxlintrc.json')
  const file = join(cwd, 'file.ts')
  const source = 'export let value = 1\n'
  for (const debug of ['files', 'timings']) {
    writeFileSync(file, source)
    const result = runLint(cwd, runner, '--fix', '--format=json', `--debug=${debug}`, 'file.ts')
    assert.equal(result.status, 0, result.stderr)
    if (debug === 'files') {
      assert.match(result.stdout, /file\.ts/)
      assert.equal(readFileSync(file, 'utf8'), source)
    } else {
      assert.deepEqual(JSON.parse(result.stdout).diagnostics, [])
      assert.equal(readFileSync(file, 'utf8'), 'export const value = 1\n')
    }
  }
})

test('#693 CLI ignore patterns exclude matching source-name directory links before validation', t => {
  const cwd = workspace(t, 'apps/pair-cli/.oxlintrc.json')
  const source = join(cwd, 'sibling.ts')
  mkdirSync(join(cwd, 'target'))
  symlinkSync('target', join(cwd, 'linked.ts'), 'dir')
  writeFileSync(source, 'export let value = 1\n')
  assert.equal(lint(cwd, '--fix', '--ignore-pattern=link*.ts', '.').status, 0)
  assert.equal(readFileSync(source, 'utf8'), 'export const value = 1\n')
})

if (process.getuid?.() !== 0) {
  test('#693 quiet structured reports keep filesystem errors and suppress unrelated warnings', t => {
    const cwd = workspace(t, 'apps/pair-cli/.oxlintrc.json')
    const blocked = join(cwd, 'blocked.ts')
    writeFileSync(blocked, 'export let value = 1\n')
    chmodSync(blocked, 0o444)
    writeFileSync(join(cwd, 'warn.ts'), 'export const other = void 0\n')
    const result = lint(cwd, '--workspace', '--fix', '--quiet', '--format=json', '-W', 'no-void')
    assert.equal(result.status, 2)
    assert.deepEqual(result.diagnostics.map(d => d.severity), ['error'])
  })
}

test('#693 R3 fix mode fails on an error introduced by an applied fix', t => {
  const cwd = workspace(t, 'apps/pair-cli/.oxlintrc.json')
  const path = join(cwd, 'array.ts')
  writeFileSync(path, 'Array();\n')
  const fixed = lint(cwd, '--workspace', '--fix')
  assert.equal(readFileSync(path, 'utf8'), '[];\n')
  assert.equal(fixed.status, 1)
  assert.deepEqual(fixed.diagnostics.map(item => item.code), ['eslint(no-unused-expressions)'])
})

test('#693 R5 direct lint restores Git-ignored files within the requested directory', t => {
  const cwd = workspace(t, 'apps/pair-cli/.oxlintrc.json')
  mkdirSync(join(cwd, 'src/generated'), { recursive: true })
  writeFileSync(join(cwd, '.gitignore'), 'generated/\noutside.ts\n')
  writeFileSync(join(cwd, 'src/clean.ts'), 'export const value = 1\n')
  writeFileSync(join(cwd, 'src/generated/tracked.ts'), 'debugger;\n')
  writeFileSync(join(cwd, 'outside.ts'), 'debugger;\n')
  for (const args of [['init', '-q'], ['add', '-f', 'src/generated/tracked.ts']]) {
    assert.equal(spawnSync('git', args, { cwd }).status, 0)
  }

  for (const path of ['src', join(cwd, 'src')]) {
    const check = lint(cwd, path)
    assert.equal(check.status, 1)
    assert.deepEqual(check.diagnostics.map(item => resolve(cwd, item.filename)), [join(cwd, 'src/generated/tracked.ts')])
  }
})

test('#693 R5 direct lint warns about explicit ignored files without a warning limit', t => {
  const cwd = workspace(t, 'apps/pair-cli/.oxlintrc.json')
  const vue = '<script>const x = ;</script>'
  writeFileSync(join(cwd, 'vitest.config.ts'), 'debugger;\n')
  writeFileSync(join(cwd, 'Widget.vue'), vue)

  for (const args of [['--format', 'json', 'vitest.config.ts'], ['--fix', 'Widget.vue']]) {
    const check = lint(cwd, ...args)
    assert.equal(check.status, 0)
    assert.deepEqual(check.diagnostics.map(({ filename, severity }) => [filename, severity]), [
      [args.at(-1), 'warning'],
    ])
  }
  assert.deepEqual(lint(cwd, '--quiet', 'vitest.config.ts'), { diagnostics: [], status: 0 })
  assert.equal(readFileSync(join(cwd, 'Widget.vue'), 'utf8'), vue)
})

test('#693 R5 direct lint rejects a missing path', t => {
  const cwd = workspace(t, 'apps/pair-cli/.oxlintrc.json')
  writeFileSync(join(cwd, 'clean.ts'), 'export const value = 1\n')
  for (const paths of [['missing.ts'], ['clean.ts', 'missing.ts']]) {
    const missing = spawnSync(process.execPath, [runner, '--format=json', ...paths], { cwd, encoding: 'utf8' })
    assert.equal(missing.status, 2)
    assert.match(missing.stderr, /missing\.ts/)
  }
})

for (const files of [['vitest.config.ts'], ['vitest.config.ts', 'clean.ts']]) {
  test(`#693 R5 explicit ignored files count toward the warning limit with ${files.join(', ')}`, t => {
    const cwd = workspace(t, 'apps/pair-cli/.oxlintrc.json')
    writeFileSync(join(cwd, 'vitest.config.ts'), 'debugger;\n')
    writeFileSync(join(cwd, 'clean.ts'), 'export const value = 1\n')
    const check = lint(cwd, '--format', 'json', '--max-warnings', '0', ...files)
    assert.equal(check.status, 1)
    assert.deepEqual(check.diagnostics.map(({ filename, severity }) => [filename, severity]), [
      ['vitest.config.ts', 'warning'],
    ])
  })
}

test('#693 R5 the warning limit combines ignored files and lint warnings', t => {
  const cwd = workspace(t, 'apps/pair-cli/.oxlintrc.json')
  writeFileSync(join(cwd, 'vitest.config.ts'), 'debugger;\n')
  writeFileSync(join(cwd, 'warn.ts'), 'export const value = void 0\n')
  const warn = ['-W', 'no-void', '--max-warnings=1']
  const native = lint(cwd, ...warn, 'warn.ts')
  assert.equal(native.status, 0)
  assert.deepEqual(native.diagnostics.map(({ severity }) => severity), ['warning'])
  const ignored = ['vitest.config.ts', './vitest.config.ts']
  const allowed = lint(cwd, '--max-warnings=1', ...ignored)
  assert.equal(allowed.status, 0)
  assert.equal(allowed.diagnostics.length, 1)

  const overLimit = lint(cwd, '--quiet', ...warn, ...ignored, 'warn.ts')
  assert.deepEqual(overLimit, { status: 1, diagnostics: [] })
})

test('#693 R5 quoted patterns lint matching files and honor excludes', t => {
  const cwd = workspace(t, 'apps/pair-cli/.oxlintrc.json')
  mkdirSync(join(cwd, 'src/nested'), { recursive: true })
  writeFileSync(join(cwd, '.gitignore'), 'src/tracked.cjs\n')
  for (const file of ['src/tracked.cjs', 'src/nested/extra.cjs', 'src/outside.js', 'vitest.config.ts', 'literal[1].ts']) {
    writeFileSync(join(cwd, file), 'debugger;\n')
  }
  for (const args of [['init', '-q'], ['add', '-f', 'src/tracked.cjs']]) {
    assert.equal(spawnSync('git', args, { cwd }).status, 0)
  }
  writeFileSync(join(cwd, 'src/clean.js'), 'console.log("clean");\n')
  assert.deepEqual(lint(cwd, '--max-warnings=0', 'src/clean*.js'), { status: 0, diagnostics: [] })

  const check = lint(cwd, '--format', 'json', '--max-warnings=0', 'src/*.cjs', '*.ts', 'literal[1].ts')
  assert.equal(check.status, 1)
  assert.deepEqual(check.diagnostics.map(({ filename, severity }) => [filename, severity]).sort(), [
    ['literal[1].ts', 'error'],
    ['src/tracked.cjs', 'error'],
  ])
})

test('#693 R5 quoted patterns select file symlinks without walking directory symlinks', t => {
  const cwd = workspace(t, 'apps/pair-cli/.oxlintrc.json')
  mkdirSync(join(cwd, 'src'))
  mkdirSync(join(cwd, 'outside'))
  writeFileSync(join(cwd, 'src/clean.cjs'), 'module.exports = 1\n')
  writeFileSync(join(cwd, 'outside/target.cjs'), 'debugger;\n')
  symlinkSync('../outside/target.cjs', join(cwd, 'src/link.cjs'))
  symlinkSync('../outside', join(cwd, 'src/linked-dir'), 'dir')

  for (const input of ['src/link.cjs', 'src/*.cjs', 'src/**/*.cjs']) {
    const check = lint(cwd, input)
    assert.equal(check.status, 1, input)
    assert.deepEqual(check.diagnostics.map(({ filename, code }) => [filename, code]), [
      ['src/link.cjs', 'eslint(no-debugger)'],
    ], input)
  }
})

for (const [name, selection] of [
  ['directory', ['src']],
  ['quoted glob', ['src/**/*.ts']],
  ['default', []],
  ['package', []],
]) {
  test(`#693 R5 ${name} selection skips nested directory links in check and fix mode`, t => {
    const cwd = workspace(t, 'apps/pair-cli/.oxlintrc.json')
    const source = 'export let value = 1\n'
    mkdirSync(join(cwd, 'src'))
    mkdirSync(join(cwd, 'dist'))
    const target = join(cwd, 'dist/target.ts')
    writeFileSync(target, source)
    writeFileSync(join(cwd, 'src/selected.ts'), source)
    symlinkSync('../dist', join(cwd, 'src/linked-dir'), 'dir')

    const check = name === 'package'
      ? lintCommand(cwd, join(dirname(runner), 'lint.sh'))
      : lint(cwd, ...selection)
    const fixed = name === 'package'
      ? lintCommand(cwd, join(dirname(runner), 'lint-fix.sh'))
      : lint(cwd, '--fix', ...selection)
    assert.equal(readFileSync(target, 'utf8'), source)
    assert.equal(check.status, 1)
    assert.deepEqual(check.diagnostics.map(({ filename }) => filename), ['src/selected.ts'])
    assert.equal(fixed.status, 0)
    assert.equal(readFileSync(join(cwd, 'src/selected.ts'), 'utf8'), 'export const value = 1\n')
  })
}

test('#693 R5 an explicitly selected in-workspace directory link remains lintable', t => {
  const cwd = workspace(t, 'apps/pair-cli/.oxlintrc.json')
  const source = 'export let value = 1\n'
  mkdirSync(join(cwd, 'real/nested-target'), { recursive: true })
  writeFileSync(join(cwd, 'real/target.ts'), source)
  writeFileSync(join(cwd, 'real/nested-target/other.ts'), source)
  symlinkSync('real', join(cwd, 'alias'), 'dir')
  symlinkSync('../real/nested-target', join(cwd, 'real/nested-alias'), 'dir')

  assert.deepEqual(lint(cwd, '--no-error-on-unmatched-pattern', 'alias/**/*.ts'), {
    status: 0, diagnostics: [],
  })
  const workspaceAlias = `${cwd}-alias`
  symlinkSync(cwd, workspaceAlias, 'dir')
  t.after(() => rmSync(workspaceAlias, { force: true }))
  symlinkSync('.', join(cwd, 'nested-workspace-alias'), 'dir')
  assert.equal(lint(cwd, join(workspaceAlias, 'real/**/*.ts')).diagnostics.length, 2)
  assert.deepEqual(lint(cwd, '--no-error-on-unmatched-pattern', join(workspaceAlias, 'nested-workspace-alias/real/**/*.ts')), {
    status: 0, diagnostics: [],
  })
  assert.deepEqual(lint(cwd, 'alias').diagnostics.map(({ filename }) => filename).sort(), [
    'alias/nested-target/other.ts', 'alias/target.ts',
  ])
  assert.equal(lint(cwd, '--fix', 'alias').status, 0)
  assert.equal(readFileSync(join(cwd, 'real/target.ts'), 'utf8'), 'export const value = 1\n')
})

test('#693 R5 fix keeps workspace sibling fixtures outside every selection', t => {
  const cwd = workspace(t, 'apps/pair-cli/.oxlintrc.json')
  const sibling = mkdtempSync(`${cwd}-sibling-`)
  t.after(() => rmSync(sibling, { recursive: true, force: true }))
  const target = join(sibling, 'target.ts')
  const source = 'export let value = 1\n'
  writeFileSync(join(cwd, 'clean.ts'), 'export const value = 1\n')
  symlinkSync(target, join(cwd, 'linked-file.ts'))
  symlinkSync(sibling, join(cwd, 'linked-dir'), 'dir')

  for (const selection of [
    ['linked-file.ts', 'linked-dir', 'linked-dir/target.ts', target, sibling],
    ['linked-dir/**/*.ts', `${sibling}/*.ts`, '*.ts'],
    ['.'],
    [],
  ]) {
    const args = ['--no-error-on-unmatched-pattern', ...selection]
    writeFileSync(target, source)
    const check = lint(cwd, ...args)
    const fixed = lint(cwd, '--fix', ...args)
    assert.equal(readFileSync(target, 'utf8'), source, args.join(' '))
    assert.deepEqual(check, { status: 0, diagnostics: [] }, args.join(' '))
    assert.deepEqual(fixed, { status: 0, diagnostics: [] }, args.join(' '))
  }
  assert.deepEqual(lintCommand(cwd, join(dirname(runner), 'lint-fix.sh')), { status: 0, diagnostics: [] })
  assert.equal(readFileSync(target, 'utf8'), source)
})

test('#693 R5 an allowed empty selection leaves other workspace files alone', t => {
  const cwd = workspace(t, 'apps/pair-cli/.oxlintrc.json')
  mkdirSync(join(cwd, 'empty'))
  const file = join(cwd, 'other.ts')
  const source = 'export let value = 1\n'
  writeFileSync(file, source)

  assert.deepEqual(lint(cwd, '--fix', '--no-error-on-unmatched-pattern', 'empty/*.ts'), {
    status: 0, diagnostics: [],
  })
  assert.equal(readFileSync(file, 'utf8'), source)
})

for (const [name, input] of [
  ['empty directory', 'empty'],
  ['excluded directory', 'dist'],
  ['unmatched pattern', 'src/*.cjs'],
  ['excluded pattern', 'dist/*.ts'],
]) {
  test(`#693 R5 rejects an ${name} alongside a lintable file`, t => {
    const cwd = workspace(t, 'apps/pair-cli/.oxlintrc.json')
    mkdirSync(join(cwd, 'empty'))
    mkdirSync(join(cwd, 'dist'))
    writeFileSync(join(cwd, 'dist/excluded.ts'), 'debugger;\n')
    writeFileSync(join(cwd, 'clean.ts'), 'export const value = 1\n')

    const result = spawnSync(process.execPath, [runner, '--format', 'json', input, 'clean.ts'], {
      cwd, encoding: 'utf8',
    })
    assert.equal(result.status, 2)
    assert.ok(result.stderr.includes(input))
    assert.deepEqual(lint(cwd, '--no-error-on-unmatched-pattern', input, 'clean.ts'), {
      status: 0, diagnostics: [],
    })
  })
}

for (const [name, source, expected, status] of [
  ['negative zero comparison', 'export const isPositive = x => x > -0\n', 'export const isPositive = x => x > -0\n', 1],
  ['script var', 'var x = 1; console.log(x)\n', 'const x = 1; console.log(x)\n', 0],
  ['reassigned var', 'var x = 1; x++; console.log(x)\n', 'let x = 1; x++; console.log(x)\n', 0],
  ['loop binding', 'for (var x of [1]) { console.log(x) }\n', 'for (const x of [1]) { console.log(x) }\n', 0],
  ['referenced before declaration', 'console.log(x); var x = 1\n', 'console.log(x); var x = 1\n', 1],
]) {
  test(`#693 R4 preserves ESLint fix behavior for ${name}`, t => {
    const cwd = workspace(t, 'apps/pair-cli/.oxlintrc.json')
    const file = join(cwd, 'fixture.js')
    writeFileSync(file, source)
    const fixed = lint(cwd, '--workspace', '--fix')
    assert.deepEqual([readFileSync(file, 'utf8'), fixed.status], [expected, status])
  })
}

test('#693 R4 empty object destructuring retains its error after the accepted const fix', t => {
  const cwd = workspace(t, 'apps/pair-cli/.oxlintrc.json')
  const file = join(cwd, 'empty.js')
  writeFileSync(file, 'var {} = foo\n')
  for (const flags of [['--fix'], [], ['--fix']]) {
    const result = lint(cwd, '--workspace', ...flags)
    assert.equal(result.status, 1)
    assert.deepEqual(result.diagnostics.map(d => [d.code, d.severity]), [['eslint(no-empty-pattern)', 'error']])
    assert.equal(readFileSync(file, 'utf8'), 'const {} = foo\n')
  }
})

for (const [name, source] of [
  ['a hoisted call before initialization', 'function run() { print(); var n = 1; function print() { console.log(n) } }\nrun()\n'],
  ['a catch-shadowed declaration', 'try { JSON.parse("invalid") } catch (n) { var n = 2; console.log(n) }\nconsole.log(n)\n'],
]) {
  test(`#693 R4 reports no-var without rewriting ${name}`, t => {
    const cwd = workspace(t, 'apps/pair-cli/.oxlintrc.json')
    const file = join(cwd, 'fixture.js')
    writeFileSync(file, source)
    const fixed = lint(cwd, '--workspace', '--fix')
    assert.equal(readFileSync(file, 'utf8'), source)
    assert.equal(fixed.status, 1)
    assert.ok(fixed.diagnostics.some(item => item.code === 'eslint(no-var)' && item.severity === 'error'))
  })
}

test('#693 AC-1 preserves TypeScript assertions and enforces unsafe optional chaining', t => {
  const cwd = workspace(t, 'apps/pair-cli/.oxlintrc.json')
  writeFileSync(join(cwd, 'asserted.ts'), 'export const assert = (r?: { prop: string }) => (r?.prop as string).startsWith("a")\n')
  writeFileSync(join(cwd, 'unsafe.ts'), 'export const unsafe = (r?: { fn: () => void }) => (r?.fn)()\n')
  const check = lint(cwd, '--workspace')
  assert.equal(check.status, 1)
  assert.deepEqual(check.diagnostics.map(item => [item.filename, item.code]), [
    ['unsafe.ts', 'eslint-js(no-unsafe-optional-chaining)'],
  ])
})

const controls = JSON.parse(readFileSync(join(root, 'docs/engineering/lint-migration-693-cases.json'), 'utf8'))
for (const [profile, configPath, extension] of [
  ['base', 'apps/pair-cli/.oxlintrc.json', 'ts'],
  ['react', 'apps/website/.oxlintrc.json', 'tsx'],
]) {
  test(`#693 AC-1 replays the ${profile} rule inventory`, t => {
    const cwd = workspace(t, configPath)
    const fixtures = controls.filter(control => control.profile === profile)
    assert.ok(fixtures.length > 0)
    const filename = (index, fixture) => `${index}-${fixture}.${extension}`
    for (const [index, control] of fixtures.entries()) {
      writeFileSync(join(cwd, filename(index, 'clean')), control.clean)
      writeFileSync(join(cwd, filename(index, 'violation')), control.violation)
    }

    const check = lint(cwd, '--workspace')
    assert.equal(check.status, 1)
    for (const [index, control] of fixtures.entries()) {
      const matchesRule = item => control.parser
        ? item.message === control.parser && item.severity === 'error'
        : item.code === control.rule
      const matches = check.diagnostics.filter(matchesRule)
      assert.ok(!matches.some(item => item.filename === filename(index, 'clean')), control.before)
      assert.ok(matches.some(item => item.filename === filename(index, 'violation') && item.severity === control.severity), control.before)
    }
  })
}

test('#693 invalid native options precede discovery and cannot consume a discovered source', t => {
  const cwd = workspace(t, 'apps/pair-cli/.oxlintrc.json')
  const native = join(root, 'tools/oxlint-config/node_modules/.bin/oxlint')
  const file = join(cwd, 'sibling.ts')
  const source = 'export let value = 1\n'
  for (const populated of [false, true]) {
    if (populated) writeFileSync(file, source)
    for (const option of ['--ignore-path', '--format', '--config', '--format=bad', '--debug=bad', '--fix', '--fix=true']) {
      const args = ['--fix', option]
      const reference = runLint(cwd, native, ...args)
      const actual = runLint(cwd, runner, ...args)
      assert.deepEqual([actual.status, actual.stderr], [reference.status, reference.stderr], option)
      if (populated) assert.equal(readFileSync(file, 'utf8'), source)
    }
  }
})

if (process.getuid?.() !== 0) {
  test('#693 supported ignores prune invalid links and unreadable directories before validation', t => {
    const cwd = workspace(t, 'apps/pair-cli/.oxlintrc.json')
    const file = join(cwd, 'sibling.ts')
    const source = 'export let value = 1\n'
    mkdirSync(join(cwd, 'hidden'))
    writeFileSync(join(cwd, 'hidden/input.ts'), source)
    mkdirSync(join(cwd, 'target'))
    symlinkSync('target', join(cwd, 'dir.ts'))
    symlinkSync('missing', join(cwd, 'missing.ts'))
    writeFileSync(join(cwd, 'ignores.txt'), 'hidden/\ndir.ts\nmissing.ts\n')
    chmodSync(join(cwd, 'hidden'), 0)
    try {
      for (const args of [['--ignore-path', 'ignores.txt'], ['--ignore-pattern=hidden/', '--ignore-pattern=dir.ts', '--ignore-pattern=missing.ts']]) {
        writeFileSync(file, source)
        assert.equal(lint(cwd, '--fix', ...args, '.').status, 0)
        assert.equal(readFileSync(file, 'utf8'), 'export const value = 1\n')
      }
    } finally {
      chmodSync(join(cwd, 'hidden'), 0o700)
    }
    assert.equal(readFileSync(join(cwd, 'hidden/input.ts'), 'utf8'), source)
  })

  test('#693 file-list debug does not read or rewrite selected source', t => {
    const cwd = workspace(t, 'apps/pair-cli/.oxlintrc.json')
    const blocked = join(cwd, 'blocked.ts')
    const sibling = join(cwd, 'sibling.ts')
    writeFileSync(blocked, 'debugger\n')
    writeFileSync(sibling, 'export let value = 1\n')
    chmodSync(blocked, 0)
    const args = ['--debug=files', '--fix', 'blocked.ts', 'sibling.ts']
    const expected = runLint(cwd, join(root, 'tools/oxlint-config/node_modules/.bin/oxlint'), ...args)
    const actual = runLint(cwd, runner, ...args)
    assert.equal(actual.status, expected.status, actual.stderr)
    assert.deepEqual(actual.stdout.trim().split('\n').sort(), expected.stdout.trim().split('\n').sort())
    assert.equal(readFileSync(sibling, 'utf8'), 'export let value = 1\n')
  })
}

test('#693 unix output keeps a marker-like sourced diagnostic at exit one', t => {
  const cwd = workspace(t, 'apps/pair-cli/.oxlintrc.json')
  writeFileSync(join(cwd, ':0:0:real.ts'), 'debugger\n')
  const result = runLint(cwd, runner, '--fix', '--format=unix', ':0:0:real.ts')
  assert.equal(result.status, 1, result.stdout)
  assert.match(result.stdout, /real\.ts/)
})

test('#693 anchored exclusions from a nested ignore file apply to selected logical names', t => {
  const cwd = workspace(t, 'apps/pair-cli/.oxlintrc.json')
  mkdirSync(join(cwd, 'config'))
  mkdirSync(join(cwd, 'target'))
  symlinkSync('../target', join(cwd, 'config/inside.ts'))
  writeFileSync(join(cwd, 'config/ignore'), '/inside.ts\n')
  writeFileSync(join(cwd, 'sibling.ts'), 'export let value = 1\n')
  const result = runLint(cwd, runner, '--fix', '--ignore-path', 'config/ignore', '.')
  assert.equal(result.status, 0, result.stderr)
  assert.equal(readFileSync(join(cwd, 'sibling.ts'), 'utf8'), 'export const value = 1\n')
})

test('#693 broad globs select source links before resolving their targets', t => {
  const cwd = workspace(t, 'apps/pair-cli/.oxlintrc.json')
  const sibling = join(cwd, 'sibling.ts')
  const source = 'export let value = 1\n'
  writeFileSync(sibling, source)
  symlinkSync('missing', join(cwd, 'linked.txt'))
  const args = ['--fix', '**/*', 'sibling.ts']
  assert.equal(lint(cwd, ...args).status, 0)
  assert.equal(readFileSync(sibling, 'utf8'), 'export const value = 1\n')
  writeFileSync(sibling, source)
  symlinkSync('missing', join(cwd, 'linked.ts'))
  const result = runLint(cwd, runner, ...args)
  assert.equal(result.status, 2)
  assert.match(result.stderr, /ENOENT.*linked\.ts/)
  assert.equal(readFileSync(sibling, 'utf8'), source)
})

test('#693 deny-warnings counts a synthesized ignored-file warning', t => {
  const cwd = workspace(t, 'apps/pair-cli/.oxlintrc.json')
  writeFileSync(join(cwd, 'ignored.config.ts'), 'debugger\n')
  writeFileSync(join(cwd, 'clean.ts'), 'export const clean = 1\n')
  for (const quiet of [[], ['--quiet']]) {
    const flags = ['--deny-warnings', ...quiet]
    const ignored = lint(cwd, ...flags, 'ignored.config.ts', 'clean.ts')
    assert.equal(ignored.status, 1)
    assert.equal(ignored.diagnostics.length, quiet.length ? 0 : 1)
    assert.equal(lint(cwd, ...flags, 'clean.ts').status, 0)
  }
})

if (process.getuid?.() !== 0) {
  test('#693 explicit CLI ignores prune unreadable collection roots before access', t => {
    const cwd = workspace(t, 'apps/pair-cli/.oxlintrc.json')
    const sibling = join(cwd, 'sibling.ts')
    const hidden = join(cwd, 'hidden')
    const source = 'export let value = 1\n'
    mkdirSync(join(hidden, 'deep'), { recursive: true })
    writeFileSync(join(hidden, 'deep/a.ts'), source)
    writeFileSync(join(cwd, 'rules'), 'hidden/\n')
    chmodSync(hidden, 0)
    try {
      for (const flags of [['--ignore-pattern=hidden/'], ['--ignore-path=rules']]) {
        for (const operand of ['hidden', 'hidden/**/*.ts', 'hidden/deep/**/*.ts']) {
          writeFileSync(sibling, source)
          const result = runLint(cwd, runner, '--fix', '--no-error-on-unmatched-pattern', ...flags, operand, 'sibling.ts')
          assert.equal(result.status, 0, result.stderr)
          assert.equal(readFileSync(sibling, 'utf8'), 'export const value = 1\n')
        }
      }
      writeFileSync(sibling, source)
      const included = runLint(cwd, runner, '--fix', '--no-error-on-unmatched-pattern', 'hidden/**/*.ts', 'sibling.ts')
      assert.equal(included.status, 2)
      assert.match(included.stderr, /EACCES/)
      assert.equal(readFileSync(sibling, 'utf8'), source)
    } finally {
      chmodSync(hidden, 0o700)
    }
  })
}


test('#693 direct nested ignore files retain Pair explicit-operand selection', t => {
  const cwd = workspace(t, 'apps/pair-cli/.oxlintrc.json')
  mkdirSync(join(cwd, 'sub'))
  writeFileSync(join(cwd, 'sub/rules'), '/match.ts\n')
  const source = 'export let value = 1\n'
  for (const name of ['match.ts', 'sub/match.ts', 'sibling.ts']) writeFileSync(join(cwd, name), source)
  assert.equal(lint(cwd, '--fix', '--ignore-path=sub/rules', '.').status, 0)
  assert.equal(readFileSync(join(cwd, 'match.ts'), 'utf8'), source)
  assert.equal(readFileSync(join(cwd, 'sub/match.ts'), 'utf8'), source)
  assert.equal(readFileSync(join(cwd, 'sibling.ts'), 'utf8'), 'export const value = 1\n')
})

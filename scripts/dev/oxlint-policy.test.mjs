import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'

const root = fileURLToPath(new URL('../../', import.meta.url))
const runner = join(root, 'tools/oxlint-config/bin/oxlint.mjs')

function workspace(t, configPath) {
  const cwd = mkdtempSync(join(tmpdir(), 'pair-oxlint-'))
  t.after(() => rmSync(cwd, { recursive: true, force: true }))
  const config = JSON.parse(readFileSync(join(root, configPath), 'utf8'))
  config.extends = config.extends.map(path => join(root, dirname(configPath), path))
  writeFileSync(join(cwd, '.oxlintrc.json'), JSON.stringify(config))
  return cwd
}

function lint(cwd, ...args) {
  return lintCommand(cwd, runner, ...args)
}

function lintCommand(cwd, command, ...args) {
  const result = spawnSync(command, args, {
    cwd,
    encoding: 'utf8',
    env: {
      ...process.env,
      PAIR_LINT_REPORT: args.some(arg => /^--format(?:=|$)/.test(arg)) ? '' : 'json',
    },
  })
  assert.equal(result.stderr, '')
  const { diagnostics } = JSON.parse(result.stdout)
  return { diagnostics, status: result.status }
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
    ['linked-file.ts'], ['linked-dir'], ['linked-dir/target.ts'], ['linked-dir/**/*.ts'],
    [target], [sibling], [`${sibling}/*.ts`],
    ['*.ts'], ['.'], [],
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

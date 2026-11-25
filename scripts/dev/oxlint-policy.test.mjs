import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
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
  const result = spawnSync(process.execPath, [runner, ...args], {
    cwd,
    encoding: 'utf8',
    env: { ...process.env, PAIR_LINT_REPORT: 'json' },
  })
  assert.equal(result.stderr, '')
  const { diagnostics } = JSON.parse(result.stdout)
  return { diagnostics, status: result.status }
}

test('#693 AC-2 preserves tracked lint scope and check/fix behavior', t => {
  const cwd = workspace(t, 'apps/pair-cli/.oxlintrc.json')
  const typed = 'export const value: any = 1\n'
  const fixable = 'export let value = 1\n'
  mkdirSync(join(cwd, 'nested/dist'), { recursive: true })
  writeFileSync(join(cwd, '.gitignore'), 'tracked.ts\n')
  writeFileSync(join(cwd, 'tracked.ts'), typed)
  writeFileSync(join(cwd, 'nested/dist/covered.ts'), typed)
  writeFileSync(join(cwd, 'ignored.config.ts'), typed)
  writeFileSync(join(cwd, 'fixable.ts'), fixable)
  for (const args of [['init', '-q'], ['add', '-f', 'tracked.ts']]) {
    assert.equal(spawnSync('git', args, { cwd }).status, 0)
  }

  const check = lint(cwd, '--workspace')
  assert.equal(check.status, 1)
  assert.deepEqual(check.diagnostics.map(item => item.filename).sort(), ['fixable.ts', 'nested/dist/covered.ts', 'tracked.ts'])
  assert.equal(readFileSync(join(cwd, 'fixable.ts'), 'utf8'), fixable)
  assert.equal(lint(cwd, 'tracked.ts').status, 1)
  assert.equal(lint(cwd, join(cwd, 'tracked.ts')).status, 1)
  assert.equal(lint(cwd, 'ignored.config.ts').status, 0)

  const fix = lint(cwd, '--workspace', '--fix')
  assert.equal(fix.status, 1)
  assert.deepEqual(fix.diagnostics.map(item => item.filename).sort(), ['nested/dist/covered.ts', 'tracked.ts'])
  assert.equal(readFileSync(join(cwd, 'fixable.ts'), 'utf8'), 'export const value = 1\n')
  assert.equal(readFileSync(join(cwd, 'tracked.ts'), 'utf8'), typed)
  assert.equal(readFileSync(join(cwd, 'ignored.config.ts'), 'utf8'), typed)
  assert.equal(lint(cwd, '--workspace', '--fix').diagnostics.length, 2)
  assert.equal(readFileSync(join(cwd, 'fixable.ts'), 'utf8'), 'export const value = 1\n')
})

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

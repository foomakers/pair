#!/usr/bin/env node
import { spawnSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'

const require = createRequire(import.meta.url)
const cli = join(dirname(require.resolve('oxlint/package.json')), 'bin/oxlint')
const extensions = ['*.js', '*.mjs', '*.cjs', '*.jsx', '*.ts', '*.tsx']

// Explicit paths restore the files Git ignores during Oxlint's directory walk.
function gitIgnoredFiles() {
  const ignored = spawnSync('git', [
    'ls-files', '--cached', '--others', '--ignored', '--exclude-standard', '--deduplicate', '-z',
    '--', ...extensions, ':(glob,exclude)**/node_modules/**',
  ])
  if (ignored.status !== 0) {
    const error = ignored.stderr?.toString() || ignored.error?.message
    if (error?.includes('not a git repository')) return []
    throw Error(error || 'Could not list Git-ignored lint files')
  }
  return ignored.stdout.toString().split('\0').filter(file => file && existsSync(file))
}

const args = process.argv.slice(2)
const options = []
for (const pattern of ['*.vue', '*.svelte', '*.astro']) options.push('--ignore-pattern', pattern)
if (args[0] === '--workspace') {
  args.shift()
  options.push('--no-error-on-unmatched-pattern')
  args.push('.', ...gitIgnoredFiles().map(file => `./${file}`))
} else if (args.length && args.every(arg => existsSync(arg))) {
  options.push('--no-error-on-unmatched-pattern')
}
if (process.env.PAIR_LINT_REPORT === 'json') args.push('--format', 'json')

function runLint(args, stdio) {
  const result = spawnSync(process.execPath, [cli, ...options, ...args], {
    stdio,
    maxBuffer: 64 * 1024 * 1024,
  })
  if (result.error) throw result.error
  return result
}

const fixFlags = new Set(['--fix', '--fix-suggestions', '--fix-dangerously'])
const checkArgs = args.filter(arg => !fixFlags.has(arg))
if (checkArgs.length === args.length) {
  process.exitCode = runLint(args, 'inherit').status ?? 2
} else {
  const capture = ['inherit', 'pipe', 'pipe']
  let fixed = runLint(args, capture)
  // A no-var fix can leave prefer-const to be applied on a second pass.
  if ((fixed.status === 0 || fixed.status === 1) && fixed.stderr.length === 0) {
    fixed = runLint(args, capture)
  }
  process.stderr.write(fixed.stderr)
  if (fixed.status !== 0) {
    process.stdout.write(fixed.stdout)
    process.exitCode = fixed.status ?? 2
  } else {
    // Oxlint can report success before evaluating errors introduced by a fix.
    process.exitCode = runLint(checkArgs, 'inherit').status ?? 2
  }
}

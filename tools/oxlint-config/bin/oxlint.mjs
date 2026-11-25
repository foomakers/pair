#!/usr/bin/env node
import { spawnSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'

const require = createRequire(import.meta.url)
const cli = join(dirname(require.resolve('oxlint/package.json')), 'bin/oxlint')
const extensions = ['*.js', '*.mjs', '*.cjs', '*.jsx', '*.ts', '*.tsx']

// Oxlint skips gitignored files during directory traversal. Explicit paths let
// tracked files retain their previous lint coverage, including in worktrees.
function ignoredTrackedFiles() {
  const tracked = spawnSync('git', ['ls-files', '--cached', '--deduplicate', '-z', '--', ...extensions])
  if (tracked.status !== 0) {
    const error = tracked.stderr?.toString() ?? tracked.error?.message
    if (error?.includes('not a git repository')) return []
    throw Error(error || 'Could not list tracked lint files')
  }
  if (!tracked.stdout.length) return []

  const ignored = spawnSync('git', ['check-ignore', '--no-index', '-z', '--stdin'], {
    input: tracked.stdout,
  })
  if (ignored.status === 1) return []
  if (ignored.status !== 0) throw Error(ignored.stderr?.toString() || 'Could not read git ignores')
  return ignored.stdout.toString().split('\0').filter(file => file && existsSync(file))
}

const args = process.argv.slice(2)
const options = []
if (args[0] === '--workspace') {
  args.shift()
  options.push('--no-error-on-unmatched-pattern')
  args.push('.', ...ignoredTrackedFiles().map(file => `./${file}`))
} else if (args.length && args.every(arg => existsSync(arg))) {
  options.push('--no-error-on-unmatched-pattern')
}
if (process.env.PAIR_LINT_REPORT === 'json') args.push('--format', 'json')
const lint = spawnSync(process.execPath, [cli, ...options, ...args], {
  stdio: 'inherit',
})
if (lint.error) throw lint.error
process.exitCode = lint.status ?? 2

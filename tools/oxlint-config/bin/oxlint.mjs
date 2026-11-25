#!/usr/bin/env node
import { spawnSync } from 'node:child_process'
import { existsSync, statSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, isAbsolute, join } from 'node:path'
import { parseArgs } from 'node:util'

const require = createRequire(import.meta.url)
const cli = join(dirname(require.resolve('oxlint/package.json')), 'bin/oxlint')
const extensions = ['*.js', '*.mjs', '*.cjs', '*.jsx', '*.ts', '*.tsx']

// Explicit paths restore the files Git ignores during Oxlint's directory walk.
function gitIgnoredFiles(directory) {
  const ignored = spawnSync('git', [
    '-C', directory, 'ls-files', '--cached', '--others', '--ignored', '--exclude-standard', '--deduplicate', '-z',
    '--', ...extensions, ':(glob,exclude)**/node_modules/**',
  ])
  if (ignored.status !== 0) {
    const error = ignored.stderr?.toString() || ignored.error?.message
    if (error?.includes('not a git repository')) return []
    throw Error(error || 'Could not list Git-ignored lint files')
  }
  return ignored.stdout.toString().split('\0').filter(Boolean).map(file => join(directory, file))
    .filter(existsSync).map(file => isAbsolute(file) ? file : `./${file}`)
}

// Oxlint's value-taking options must not be counted as file operands.
const argumentOptions = {
  config: { type: 'string', short: 'c' },
  allow: { type: 'string', short: 'A' },
  warn: { type: 'string', short: 'W' },
  deny: { type: 'string', short: 'D' },
  format: { type: 'string', short: 'f' },
  help: { type: 'boolean', short: 'h' },
  version: { type: 'boolean', short: 'V' },
  ...Object.fromEntries([
    'tsconfig', 'ignore-path', 'ignore-pattern', 'max-warnings', 'debug', 'threads',
    'report-unused-disable-directives-severity',
  ].map(name => [name, { type: 'string' }])),
}
const nonLintOptions = ['help', 'version', 'init', 'print-config', 'rules', 'lsp']
const fixFlags = ['fix', 'fix-suggestions', 'fix-dangerously']
const args = process.argv.slice(2)
const workspace = args[0] === '--workspace'
if (workspace) args.shift()
const { positionals, tokens, values } = parseArgs({
  args, options: argumentOptions, strict: false, allowPositionals: true, tokens: true,
})
const options = ['*.vue', '*.svelte', '*.astro'].flatMap(pattern => ['--ignore-pattern', pattern])
if (process.env.PAIR_LINT_REPORT === 'json' && !('format' in values)) options.push('--format', 'json')
const lintsFiles = !nonLintOptions.some(name => name in values)

function lintPaths() {
  if (!lintsFiles) return []
  if ((workspace || positionals.length) && !values['no-error-on-unmatched-pattern']) {
    options.push('--no-error-on-unmatched-pattern')
  }
  const directories = positionals.filter(path => statSync(path, { throwIfNoEntry: false })?.isDirectory())
  if (workspace || !positionals.length) directories.push('.')
  const restored = [...new Set(directories.flatMap(gitIgnoredFiles))]
  // Supplying only restored file paths would replace Oxlint's implicit directory walk.
  return workspace || (!positionals.length && restored.length) ? ['.', ...restored] : restored
}

function runLint(args, stdio) {
  const result = spawnSync(process.execPath, [cli, ...options, ...args], {
    stdio,
    maxBuffer: 64 * 1024 * 1024,
  })
  if (result.error) throw result.error
  return result
}

function runFix(args, checkArgs) {
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

const missing = lintsFiles && !workspace && !values['no-error-on-unmatched-pattern']
  && positionals.find(path => !existsSync(path))
if (missing) {
  process.stderr.write(`No files found to lint at ${JSON.stringify(missing)}.\n`)
  process.exitCode = 1
} else {
  const paths = lintPaths()
  const fixIndices = new Set(tokens.filter(token => token.kind === 'option' && fixFlags.includes(token.name)).map(token => token.index))
  if (fixIndices.size) {
    runFix([...args, ...paths], [...args.filter((_, index) => !fixIndices.has(index)), ...paths])
  } else {
    process.exitCode = runLint([...args, ...paths], 'inherit').status ?? 2
  }
}

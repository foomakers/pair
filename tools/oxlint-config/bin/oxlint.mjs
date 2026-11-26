#!/usr/bin/env node
import { spawnSync } from 'node:child_process'
import { existsSync, statSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, isAbsolute, join, resolve } from 'node:path'
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
const selectionOptions = [
  'config', 'ignore-path', 'ignore-pattern', 'no-ignore', 'disable-nested-config', 'no-error-on-unmatched-pattern',
]
const capture = ['inherit', 'pipe', 'pipe']
const args = process.argv.slice(2)
const workspace = args[0] === '--workspace'
if (workspace) args.shift()
const { positionals, tokens, values } = parseArgs({
  args, options: argumentOptions, strict: false, allowPositionals: true, tokens: true,
})
const options = ['*.vue', '*.svelte', '*.astro'].flatMap(pattern => ['--ignore-pattern', pattern])
if (process.env.PAIR_LINT_REPORT === 'json' && !('format' in values)) options.push('--format', 'json')
const lintsFiles = !nonLintOptions.some(name => name in values)

function defaultLintPaths() {
  const directories = positionals.filter(path => statSync(path, { throwIfNoEntry: false })?.isDirectory())
  directories.push('.')
  const restored = [...new Set(directories.flatMap(gitIgnoredFiles))]
  // Supplying only restored file paths would replace Oxlint's implicit directory walk.
  return workspace || restored.length ? ['.', ...restored] : []
}

function runLint(args, stdio) {
  const result = spawnSync(process.execPath, [cli, ...options, ...args], {
    stdio,
    maxBuffer: 64 * 1024 * 1024,
  })
  if (result.error) throw result.error
  return result
}

function tokenArgs(token) {
  return args.slice(token.index, token.index + (token.inlineValue === false ? 2 : 1))
}

function selectionError(path) {
  process.stderr.write(`No files found to lint at ${JSON.stringify(path)}.\n`)
  process.exitCode = 2
}

function matchingFiles(glob, pattern) {
  // Keep file symlinks under their matched paths without descending into directory symlinks.
  return glob.sync(pattern, {
    dot: true, followSymbolicLinks: false, onlyFiles: false, objectMode: true,
    ignore: ['**/.git/**', '**/node_modules/**'],
  }).filter(({ dirent, path }) => dirent.isFile()
    || (dirent.isSymbolicLink() && statSync(path, { throwIfNoEntry: false })?.isFile()))
    .map(({ path }) => path)
}

function prepareDirectLint() {
  const glob = require('fast-glob')
  const strictSelection = !values['no-error-on-unmatched-pattern']
  const selectionArgs = tokens.filter(token => token.kind === 'option' && selectionOptions.includes(token.name))
    .flatMap(tokenArgs)
  const maxArg = values['max-warnings']
  const max = Number(maxArg)
  const maxTokens = tokens.filter(token => token.kind === 'option' && token.name === 'max-warnings')
  const countIgnored = maxTokens.length === 1 && /^\+?\d+$/.test(maxArg) && Number.isSafeInteger(max)
  const reportIgnored = !('debug' in values) && (maxTokens.length === 0 || countIgnored)
  const replacements = new Map()
  const ignored = new Map()

  for (const token of tokens.filter(token => token.kind === 'positional')) {
    const path = token.value
    const stat = statSync(path, { throwIfNoEntry: false })
    const directory = stat?.isDirectory()
    const pattern = !stat && glob.isDynamicPattern(path)
    const collection = directory || pattern
    if (!stat && !pattern && strictSelection) return selectionError(path)

    const paths = pattern ? matchingFiles(glob, path) : [path]
    if (directory) paths.push(...gitIgnoredFiles(path))
    // Prefix relative paths so filenames beginning with a dash stay operands.
    const operands = paths.map(file => isAbsolute(file) || file.startsWith('./') ? file : `./${file}`)
    // An unmatched operand prevents Oxlint from falling back to the whole cwd.
    replacements.set(token.index, operands.length ? operands : [path])

    if (collection ? !strictSelection : !reportIgnored || !stat?.isFile()) continue
    if (!operands.length) return selectionError(path)
    // Ask Oxlint to apply its ignore rules without linting or writing files.
    const selection = runLint(['--debug=files', ...selectionArgs, ...operands], capture)
    if (selection.status !== 0) return finishLint(selection)
    if (selection.stdout.length) continue
    if (collection) return selectionError(path)
    const absolute = resolve(path)
    if (!ignored.has(absolute)) ignored.set(absolute, path)
  }

  const remainingWarnings = countIgnored ? max - ignored.size : Infinity
  if (countIgnored && ignored.size) {
    const [token] = maxTokens
    replacements.set(token.index, [`--max-warnings=${Math.max(0, remainingWarnings)}`])
    if (token.inlineValue === false) replacements.set(token.index + 1, [])
  }
  return {
    replacements,
    warnings: [...ignored.values()].map(filename => ({
      filename, severity: 'warning', message: 'File ignored by lint configuration or unsupported file type.', labels: [],
    })),
    overLimit: remainingWarnings < 0,
  }
}

function finishLint(result, warnings = [], overLimit = false) {
  process.exitCode = result.status === 0 && overLimit ? 1 : result.status ?? 2
  if (result.stderr) process.stderr.write(result.stderr)
  if (result.stderr?.length || values.quiet || values.silent) warnings = []
  if (warnings.length && (values.format ?? process.env.PAIR_LINT_REPORT) === 'json') {
    let report
    try {
      report = JSON.parse(result.stdout)
    } catch {
      // Preserve native output if Oxlint could not produce a JSON report.
    }
    if (Array.isArray(report?.diagnostics)) {
      report.diagnostics.push(...warnings)
      process.stdout.write(JSON.stringify(report) + '\n')
      return
    }
  }
  if (result.stdout) process.stdout.write(result.stdout)
  for (const { filename, message } of warnings) process.stderr.write(`${JSON.stringify(filename)}: warning: ${message}\n`)
}

function runFix(args, checkArgs, stdio) {
  let fixed = runLint(args, capture)
  // A no-var fix can leave prefer-const to be applied on a second pass.
  if ((fixed.status === 0 || fixed.status === 1) && fixed.stderr.length === 0) {
    fixed = runLint(args, capture)
  }
  if (fixed.status !== 0) return fixed
  process.stderr.write(fixed.stderr)
  // Oxlint can report success before evaluating errors introduced by a fix.
  return runLint(checkArgs, stdio)
}

function main() {
  const direct = lintsFiles && !workspace && positionals.length > 0
  if (lintsFiles && (workspace || direct) && !values['no-error-on-unmatched-pattern']) {
    options.push('--no-error-on-unmatched-pattern')
  }
  const prepared = direct ? prepareDirectLint() : {}
  if (!prepared) return
  const { replacements, warnings, overLimit } = prepared
  const paths = lintsFiles && !direct ? defaultLintPaths() : []
  const fixIndices = new Set(tokens.filter(token => token.kind === 'option' && fixFlags.includes(token.name)).map(token => token.index))
  const lintArgs = (check = false) => [
    ...args.flatMap((arg, index) => check && fixIndices.has(index) ? [] : replacements?.get(index) ?? [arg]),
    ...paths,
  ]
  const stdio = warnings?.length ? capture : 'inherit'
  const result = fixIndices.size ? runFix(lintArgs(), lintArgs(true), stdio) : runLint(lintArgs(), stdio)
  finishLint(result, warnings, overLimit)
}

main()

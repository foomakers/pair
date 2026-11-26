#!/usr/bin/env node
import { spawnSync } from 'node:child_process'
import { lstatSync, readFileSync, readdirSync, realpathSync, statSync } from 'node:fs'
import { createRequire } from 'node:module'
import { basename, dirname, extname, isAbsolute, join, normalize, relative, resolve, sep } from 'node:path'
import { parseArgs } from 'node:util'

const require = createRequire(import.meta.url)
const cli = join(dirname(require.resolve('oxlint/package.json')), 'bin/oxlint')
const glob = require('fast-glob')
const ignore = require('ignore')
const { parse: parseJsonc } = require('jsonc-parser')
const workspaceRoot = realpathSync.native('.')
const sourcePattern = '**/*.{js,mjs,cjs,jsx,ts,mts,cts,tsx,vue,svelte,astro}'
// An impossible operand keeps an empty selection from starting Oxlint's default walk.
const emptySelection = join(cli, 'no-files')

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
const excludeDirectory = lintsFiles ? directoryExclusions() : () => false

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

function realPath(path) {
  try {
    return realpathSync.native(path)
  } catch (error) {
    if (!['ENOENT', 'ENOTDIR', 'ELOOP'].includes(error.code)) throw error
  }
}

function isWithin(root, path) {
  if (!path) return false
  const fromRoot = relative(root, path)
  return fromRoot !== '..' && !fromRoot.startsWith(`..${sep}`) && !isAbsolute(fromRoot)
}

function directoryExclusions() {
  const candidates = values.config ? [values.config] : ['.oxlintrc.json', '.oxlintrc.jsonc']
  for (const candidate of candidates) {
    if (!['.json', '.jsonc'].includes(extname(candidate))) break
    const file = resolve(candidate)
    let config
    try {
      const errors = []
      config = parseJsonc(readFileSync(file, 'utf8'), errors, { allowTrailingComma: true })
      if (errors.length) break
    } catch (error) {
      if (error.code === 'ENOENT') continue
      break
    }

    const patterns = config?.ignorePatterns
    // Leave negated patterns to Oxlint: a descendant can be explicitly re-included.
    if (!Array.isArray(patterns) || patterns.some(pattern => typeof pattern !== 'string' || pattern.startsWith('!'))) break
    const matcher = ignore({ ignorecase: false }).add(patterns)
    const root = dirname(file)
    return path => path !== root && isWithin(root, path) && matcher.ignores(`${relative(root, path).split(sep).join('/')}/`)
  }
  // Oxlint reports configuration errors and handles any other config formats.
  return () => false
}

function operandTarget(path) {
  try {
    return realPath(path)
  } catch (error) {
    // A static prefix inside an excluded directory may be unreadable before globbing starts.
    if (error.code !== 'EACCES' || !excludeDirectory(dirname(resolve(path)))) throw error
  }
}

function isWalkDirectory(path, root) {
  const target = realPath(path)
  if (!isWithin(root, target)) return false
  if (path === target) return true
  // Allow aliases above the workspace (such as /var on macOS).
  let directory = path
  for (let actual = target; actual !== root; actual = dirname(actual)) {
    if (basename(directory) !== basename(actual) || !lstatSync(directory, { throwIfNoEntry: false })?.isDirectory()) {
      return false
    }
    directory = dirname(directory)
  }
  if (directory === root) return true
  if (realPath(directory) !== root) return false
  // The alias must enter the workspace here, without having already crossed it.
  while (directory !== dirname(directory)) {
    directory = dirname(directory)
    if (isWithin(root, realPath(directory))) return false
  }
  return true
}

function matchingFiles(pattern, directory = '.', root = workspaceRoot) {
  // Select files explicitly to retain Git-ignored sources and keep Oxlint from walking directories.
  return glob.sync(pattern, {
    cwd: root, dot: true, followSymbolicLinks: false, onlyFiles: false, objectMode: true,
    ignore: ['**/.git/**', '**/node_modules/**'],
    // fast-glob can start directly at a pattern's static directory prefix.
    fs: {
      readdirSync(dir, options) {
        const selectedDir = resolve(directory, relative(root, dir))
        if (excludeDirectory(selectedDir) || !isWalkDirectory(dir, root)) return []
        if (!isWithin(workspaceRoot, selectedDir) && excludeDirectory(realPath(selectedDir))) return []
        return readdirSync(dir, options)
      },
    },
  }).flatMap(({ dirent, path }) => {
    if (!dirent.isFile() && !dirent.isSymbolicLink()) return []
    const file = isAbsolute(path) ? normalize(path) : join(directory, path)
    const target = realPath(file)
    if (!isWithin(workspaceRoot, target) || !isWalkDirectory(dirname(resolve(root, path)), root)) return []
    return dirent.isFile() || statSync(target, { throwIfNoEntry: false })?.isFile() ? [file] : []
  })
}

function asOperand(file) {
  // Prefix relative paths so filenames beginning with a dash stay operands.
  return isAbsolute(file) ? file : `./${file}`
}

function prepareExplicitLint() {
  const strictSelection = !workspace && !values['no-error-on-unmatched-pattern']
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
    const file = normalize(path)
    const target = operandTarget(path)
    const inWorkspace = isWithin(workspaceRoot, target) && (path === file || realPath(file) === target)
    const stat = inWorkspace ? statSync(target, { throwIfNoEntry: false }) : undefined
    const directory = stat?.isDirectory()
    const pattern = !target && glob.isDynamicPattern(path)
    const collection = directory || pattern
    let paths = []
    if (directory) paths = matchingFiles(sourcePattern, file, target)
    else if (pattern) paths = matchingFiles(path)
    else if (stat?.isFile()) paths = [file]
    const operands = paths.map(asOperand)
    replacements.set(token.index, operands)
    if (!operands.length && strictSelection) return selectionError(path)

    if (collection ? !strictSelection : !reportIgnored || !stat?.isFile()) continue
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
  const explicit = lintsFiles && positionals.length > 0
  if (lintsFiles && (workspace || explicit) && !values['no-error-on-unmatched-pattern']) {
    options.push('--no-error-on-unmatched-pattern')
  }
  const prepared = explicit ? prepareExplicitLint() : {}
  if (!prepared) return
  const { replacements, warnings, overLimit } = prepared
  const paths = lintsFiles && !explicit ? matchingFiles(sourcePattern).map(asOperand) : []
  const selected = explicit
    ? tokens.some(token => token.kind === 'positional' && replacements.get(token.index).length)
    : paths.length > 0
  if (lintsFiles && !selected) paths.push(emptySelection)
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

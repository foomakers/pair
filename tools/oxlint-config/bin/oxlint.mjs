#!/usr/bin/env node
import { spawnSync } from 'node:child_process'
import { accessSync, constants, lstatSync, readFileSync, readdirSync, realpathSync, statSync } from 'node:fs'
import { createRequire } from 'node:module'
import { basename, dirname, extname, isAbsolute, join, normalize, relative, resolve, sep } from 'node:path'
import { parseArgs, stripVTControlCharacters } from 'node:util'

const require = createRequire(import.meta.url)
const cli = join(dirname(require.resolve('oxlint/package.json')), 'bin/oxlint')
const glob = require('fast-glob')
const ignore = require('ignore')
const { parse: parseJsonc } = require('jsonc-parser')
const workspaceRoot = realpathSync.native('.')
const sourceExtensions = ['js', 'mjs', 'cjs', 'jsx', 'ts', 'mts', 'cts', 'tsx']
const sourcePattern = `**/*.{${sourceExtensions.join(',')}}`
const frameworkExtensions = ['.vue', '.svelte', '.astro']
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
const domainLint = workspace && args[0] === '--pair-domain'
if (domainLint) args.shift()
const { positionals, tokens, values } = parseArgs({
  args, options: argumentOptions, strict: false, allowPositionals: true, tokens: true,
})
const selectionArgs = tokens.filter(token => token.kind === 'option' && selectionOptions.includes(token.name))
  .flatMap(tokenArgs)
const options = frameworkExtensions.flatMap(extension => ['--ignore-pattern', `*${extension}`])
const jsonByDefault = process.env.PAIR_LINT_REPORT === 'json' && !('format' in values)
const lintsFiles = !nonLintOptions.some(name => name in values)
const maxWarningTokens = tokens.filter(
  token => token.kind === 'option' && token.name === 'max-warnings',
)
const maxWarnings = Number(values['max-warnings'])
const hasWarningBudget =
  maxWarningTokens.length === 1 &&
  /^\+?\d+$/.test(values['max-warnings']) &&
  Number.isSafeInteger(maxWarnings)
let byConfig
let byCli

function isExcluded(path, directory = true) {
  return byConfig(path, directory) || byCli(path, directory)
}

function runLint(args, stdio) {
  const format = jsonByDefault ? ['--format=json'] : []
  const result = spawnSync(process.execPath, [cli, ...options, ...format, ...args], {
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

function configExclusions() {
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
    if (!Array.isArray(patterns) || patterns.some(pattern => typeof pattern !== 'string')) break
    // A file-extension exclusion followed by its directory exception never prunes that directory.
    // Leave more general re-inclusions to Oxlint, which may select an excluded directory's descendants.
    const mayPrune = patterns.every((pattern, index) => !pattern.startsWith('!')
      || (pattern.endsWith('/') && pattern === `!${patterns[index - 1]}/`))
    if (!mayPrune) break
    const matcher = ignore({ ignorecase: false }).add(patterns)
    const root = dirname(file)
    return (path, directory = true) => {
      if (path === root || !isWithin(root, path)) return false
      const name = relative(root, path).split(sep).join('/')
      return matcher.ignores(directory ? `${name}/` : name)
    }
  }
  // Oxlint reports configuration errors and handles any other config formats.
  return () => false
}

function cliExclusions() {
  if (values['no-ignore']) return () => false
  const cliPatterns = tokens.filter(token => token.kind === 'option' && token.name === 'ignore-pattern')
    .map(token => token.value)
  const cliRules = ignore({ ignorecase: false }).add(cliPatterns)
  const fileRules = ignore({ ignorecase: false })
  const ignorePath = values['ignore-path']
  const ignoreRoot = ignorePath ? dirname(resolve(ignorePath)) : workspaceRoot
  if (ignorePath) {
    try {
      fileRules.add(readFileSync(ignorePath, 'utf8'))
    } catch {
      // A missing or inaccessible ignore file is handled by the native command.
    }
  }
  return (path, directory = true) => {
    if (path === workspaceRoot || !isWithin(workspaceRoot, path)) return false
    const logicalName = root => relative(root, path).split(sep).join('/') + (directory ? '/' : '')
    const cliMatch = cliRules.test(logicalName(workspaceRoot))
    if (cliMatch.ignored || cliMatch.unignored) return cliMatch.ignored
    if (path === ignoreRoot) return false
    return fileRules.ignores(logicalName(isWithin(ignoreRoot, path) ? ignoreRoot : workspaceRoot))
  }
}

function operandTarget(path) {
  try {
    return realPath(path)
  } catch (error) {
    // Let glob roots be validated separately from an inaccessible excluded file operand.
    if (error.code !== 'EACCES' || !isExcluded(dirname(resolve(path)))) throw error
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

function validateGlobRoot(pattern) {
  // Brace expansion can choose directories without explicitly naming a walk root.
  const [task] = glob.generateTasks(pattern, { braceExpansion: false })
  if (!task) return
  const base = resolve(task.base)
  if (byCli(base)) return
  if (isWalkDirectory(base, workspaceRoot) && statSync(base, { throwIfNoEntry: false })?.isDirectory()) {
    accessSync(base, constants.R_OK)
  }
}

function checkReadable(file) {
  if (values.debug === 'files') return
  try {
    accessSync(file, constants.R_OK)
  } catch (error) {
    // An explicit ignored source still gets its usual ignored-file warning.
    const selected = runLint(['--debug=files', ...selectionArgs, asOperand(file)], capture)
    if (selected.status !== 0 || selected.stdout.length) throw error
  }
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
        if (isExcluded(selectedDir) || !isWalkDirectory(dir, root)) return []
        if (!isWithin(workspaceRoot, selectedDir) && isExcluded(realPath(selectedDir))) return []
        return readdirSync(dir, options)
      },
    },
  }).flatMap(({ dirent, path }) => {
    if (!dirent.isFile() && !dirent.isSymbolicLink()) return []
    const file = isAbsolute(path) ? normalize(path) : join(directory, path)
    if (isExcluded(resolve(file), false) || frameworkExtensions.includes(extname(file))) return []
    if (dirent.isSymbolicLink() && !sourceExtensions.includes(extname(file).slice(1))) return []
    // Broken included links abort discovery before Oxlint can modify any selected source.
    const target = realpathSync.native(file)
    if (!isWalkDirectory(dirname(resolve(root, path)), root)) return []
    if (dirent.isSymbolicLink()) {
      const stat = statSync(target)
      if (stat.isDirectory()) {
        throw Object.assign(new Error(`EISDIR: expected a source file at ${file}`), { code: 'EISDIR' })
      }
      if (!stat.isFile()) return []
    }
    if (!isWithin(workspaceRoot, target)) return []
    checkReadable(file)
    return [file]
  })
}

function asOperand(file) {
  // Prefix relative paths so filenames beginning with a dash stay operands.
  return isAbsolute(file) ? file : `./${file}`
}

function prepareExplicitLint() {
  const strictSelection = !workspace && !values['no-error-on-unmatched-pattern']
  const reportIgnored = !('debug' in values) && (maxWarningTokens.length === 0 || hasWarningBudget)
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
    if (directory && !byCli(resolve(file))) {
      accessSync(target, constants.R_OK)
      paths = matchingFiles(sourcePattern, file, target)
    } else if (pattern) {
      validateGlobRoot(path)
      paths = matchingFiles(path)
    } else if (stat?.isFile()) {
      checkReadable(file)
      paths = [file]
    }
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

  return {
    replacements,
    warnings: [...ignored.values()].map(filename => ({
      filename, severity: 'warning', message: 'File ignored by lint configuration or unsupported file type.', labels: [],
    })),
  }
}

function finishLint(result, diagnostics = [], extraFailure = false) {
  process.exitCode = result.status === 0 && extraFailure ? 1 : result.status ?? 2
  if (result.stderr) process.stderr.write(result.stderr)
  if (result.stderr?.length || values.silent) diagnostics = []
  if (values.quiet) diagnostics = diagnostics.filter(diagnostic => diagnostic.severity === 'error')
  if (diagnostics.length && (values.format ?? process.env.PAIR_LINT_REPORT) === 'json') {
    let report
    try {
      report = JSON.parse(result.stdout)
    } catch {
      // Preserve native output if Oxlint could not produce a JSON report.
    }
    if (Array.isArray(report?.diagnostics)) {
      report.diagnostics.push(...diagnostics)
      process.stdout.write(JSON.stringify(report) + '\n')
      return
    }
  }
  if (result.stdout) process.stdout.write(result.stdout)
  for (const { filename, code, severity, message, labels } of diagnostics) {
    const span = labels[0]?.span
    const location = span ? `${filename}:${span.line}:${span.column}` : JSON.stringify(filename)
    process.stderr.write(`${location}: ${severity}: ${code ? `${code}: ` : ''}${message}\n`)
  }
}

async function checkDomain(paths) {
  const configPath = values.config ?? '.oxlintrc.json'
  const errors = []
  const config = parseJsonc(readFileSync(configPath, 'utf8'), errors, { allowTrailingComma: true })
  if (errors.length) throw new Error(`${configPath}: invalid lint configuration`)
  const rule = 'pair-domain/no-explicit-nullish-domain-types'
  const pilot = config.overrides?.find(override => Object.hasOwn(override.rules ?? {}, rule))
  if (!pilot) return []
  const setting = pilot.rules[rule]
  const severity = Array.isArray(setting) ? setting[0] : setting
  if (severity === 'off' || severity === 'allow') return []
  const configDir = dirname(resolve(configPath))
  const allowlist = new Set(
    glob.sync(pilot.files, { cwd: configDir, absolute: true, followSymbolicLinks: false }),
  )
  const files = [...new Set(paths.map(path => resolve(path)))]
    .filter(path => allowlist.has(path) && !isExcluded(path, false))
    .map(path => relative(workspaceRoot, path))
  if (!files.length) return []
  const { checkNullableDomainProperties } = await import('../domain-checker.mjs')
  return checkNullableDomainProperties(values.tsconfig ?? 'tsconfig.json', files).map(
    ({ filename, code, property, span, message }) => ({
      filename,
      code,
      severity: severity === 'error' || severity === 'deny' ? 'error' : 'warning',
      message: message ?? `Remove the resolved null or undefined from ${property} and model absence as a separate variant.`,
      labels: [{ span }],
    }),
  )
}

// The pinned native reporters represent filesystem errors without a source location.
// Classify that record in the caller's actual output, retaining its original bytes.
function hasOperationalError(stdout) {
  const format = values.format ?? (jsonByDefault ? 'json' : 'default')
  const output = stripVTControlCharacters(stdout.toString())
  if (['json', 'sarif', 'gitlab'].includes(format)) {
    try {
      const report = JSON.parse(output)
      if (format === 'json') return report.diagnostics.some(d => d.severity === 'error' && !d.filename && !d.code)
      if (format === 'gitlab') return report.some(d => !d.location.path && !d.check_name)
      return report.runs.some(run => run.invocations?.some(invocation =>
        invocation.toolConfigurationNotifications?.some(notification => notification.level === 'error')))
    } catch {
      return true
    }
  }
  const locationless = {
    agent: /^<unknown>: error:/m,
    github: /^::error title=oxlint::/m,
    stylish: /^\s*0:0\s+error\s/m,
    unix: /^:0:0:  \[Warning\]$/m,
    junit: /<testsuite name=""/,
    checkstyle: /<file name="">/,
    // The default format can select agent output in a non-interactive shell.
    default: /^(?:<unknown>: error:|\s*[x×] Failed to (?:open|write) file )/m,
  }
  return locationless[format]?.test(output) ?? false
}

function runFix(fixArgs, checkArgs, stdio) {
  // A no-var fix can leave prefer-const for a second pass. Observe each writing pass
  // before retrying. An operational failure ends the command in its original reporter.
  for (let pass = 0; pass < 2; pass++) {
    const fixed = runLint(fixArgs, capture)
    if (fixed.status === 0 && !fixed.stderr.length) continue
    if (fixed.status !== 1 || fixed.stderr.length) return fixed
    if (hasOperationalError(fixed.stdout)) {
      fixed.status = 2
      if (values.silent) fixed.stdout = Buffer.alloc(0)
      return fixed
    }
  }
  return runLint(checkArgs, stdio)
}

async function main() {
  if (lintsFiles) {
    // Validate the original argv before discovery can append a missing option value or mask an error.
    const nativeOptions = tokens.filter(token => token.kind === 'option')
    const [first] = nativeOptions
    if (nativeOptions.length > 1 || (first && (!fixFlags.includes(first.name) || first.value !== undefined))) {
      const operandIndices = new Set(tokens.filter(token => token.kind !== 'option').map(token => token.index))
      const optionsOnly = args.filter((_, index) => !operandIndices.has(index))
      const parsed = runLint(['--print-config', ...optionsOnly], capture)
      if (parsed.status !== 0) return finishLint(parsed)
    }
    byConfig = configExclusions()
    byCli = cliExclusions()
  }
  const explicit = lintsFiles && positionals.length > 0
  if (lintsFiles && (workspace || explicit) && !values['no-error-on-unmatched-pattern']) {
    options.push('--no-error-on-unmatched-pattern')
  }
  let prepared
  let paths = []
  try {
    prepared = explicit ? prepareExplicitLint() : {}
    if (lintsFiles && !explicit) {
      paths = matchingFiles(sourcePattern).map(asOperand)
      if (!paths.length && !values['no-error-on-unmatched-pattern']) return selectionError('.')
    }
  } catch (error) {
    if (!['EACCES', 'EPERM', 'ENOENT', 'ENOTDIR', 'ELOOP', 'EISDIR'].includes(error.code)) throw error
    process.stderr.write(`${error.message}\n`)
    process.exitCode = 2
    return
  }
  if (!prepared) return
  const { replacements = new Map(), warnings = [] } = prepared
  const selected = explicit ? [...replacements.values()].flat() : paths
  let diagnostics = warnings
  if (domainLint && lintsFiles && selected.length && !('debug' in values)) {
    try {
      diagnostics = [...warnings, ...(await checkDomain(selected))]
    } catch (error) {
      process.stderr.write(`Domain lint could not load the project: ${error.message}\n`)
      process.exitCode = 2
      return
    }
  }
  if (lintsFiles && !selected.length) paths.push(emptySelection)
  const warningCount = diagnostics.filter(diagnostic => diagnostic.severity === 'warning').length
  const remainingWarnings = hasWarningBudget ? maxWarnings - warningCount : Infinity
  if (hasWarningBudget && warningCount) {
    const [token] = maxWarningTokens
    replacements.set(token.index, [`--max-warnings=${Math.max(0, remainingWarnings)}`])
    if (token.inlineValue === false) replacements.set(token.index + 1, [])
  }
  const extraFailure =
    diagnostics.some(diagnostic => diagnostic.severity === 'error') ||
    remainingWarnings < 0 ||
    (values['deny-warnings'] && warningCount > 0)
  const fixIndices = new Set(tokens.filter(token => token.kind === 'option' && fixFlags.includes(token.name)).map(token => token.index))
  // Capture even a silent fix internally so its real operational status survives.
  const silent = new Set(tokens.filter(token => token.kind === 'option' && token.name === 'silent' && token.value === undefined)
    .map(token => token.index))
  const lintArgs = omit => [
    ...args.flatMap((arg, index) => omit?.has(index) ? [] : replacements?.get(index) ?? [arg]),
    ...paths,
  ]
  const stdio = diagnostics.length ? capture : 'inherit'
  const result = fixIndices.size && values.debug !== 'files'
    ? runFix(lintArgs(silent), lintArgs(fixIndices), stdio)
    : runLint(lintArgs(), stdio)
  finishLint(result, diagnostics, extraFailure)
}

await main()

import { execFileSync, spawnSync } from 'node:child_process'
import { existsSync, lstatSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, relative, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import glob from 'fast-glob'
import { checkNullableDomainProperties } from './domain-checker.mjs'
import plugin from './domain-plugin.mjs'

const baselinePath = 'tools/oxlint-config/domain-baseline.json'
const suppressionPath = 'packages/dev-tools/src/quality-gates/legacy-typescript-suppressions.json'
const reviewedBase = 'e2dac9e3b5b303636e9f4cabf793abca0f08cbc4'
const bootstrap = new Map([
  [baselinePath, 'adaa425d7d869a17462d7f22f2c9197f2f9760d6'],
  [suppressionPath, '8cf338628a2cb41866ceec2ba2aa11932cf4dde8'],
])
const legacy = new Map([
  [
    'packages/content-ops/src/http/download-manager.ts',
    ['WriteOptions', 'ProgressReporterContext'],
  ],
  ['packages/content-ops/src/http/resume-manager.ts', ['DownloadContext', 'ResumeDecision']],
])
const oxlint = join(
  dirname(fileURLToPath(import.meta.resolve('oxlint/package.json'))),
  'bin/oxlint',
)
const pluginFile = fileURLToPath(new URL('./domain-plugin.mjs', import.meta.url))

const git = (...args) => execFileSync('git', args, { encoding: 'utf8' })
const read = path => JSON.parse(readFileSync(path, 'utf8'))
const key = (file, rule, identity) => JSON.stringify([file, rule, identity])

function renames(ref) {
  const fields = git(
    'diff',
    '--name-status',
    '-z',
    '--find-renames',
    ref,
    '--',
    'apps',
    'packages',
  ).split('\0')
  const result = new Map()
  for (let i = 0; i < fields.length - 1; ) {
    const status = fields[i++]
    const original = fields[i++]
    if (status.startsWith('R')) result.set(original, fields[i++])
  }
  return result
}

function readPrevious(base, path, current) {
  const prior = spawnSync('git', ['show', `${base}:${path}`], { encoding: 'utf8' })
  if (prior.status === 0) return JSON.parse(prior.stdout)
  if (prior.error) throw prior.error
  const initial = git('hash-object', '--', path).trim()
  if (initial === bootstrap.get(path)) return current
  throw new Error(`${path}: the reviewed baseline is required when the base has no snapshot`)
}

function counts(entries) {
  const result = new Map()
  for (const entry of entries) result.set(entry, (result.get(entry) ?? 0) + 1)
  return result
}

function consume(inventory, entry) {
  const quantity = inventory.get(entry)
  if (!quantity) return false
  if (quantity === 1) inventory.delete(entry)
  else inventory.set(entry, quantity - 1)
  return true
}

function entries(snapshot, currentPath) {
  return Object.entries(snapshot).flatMap(([file, rules]) =>
    Object.entries(rules).flatMap(([rule, names]) =>
      names.map(name => key(currentPath(file), rule, name)),
    ),
  )
}

function authoredModel(file) {
  const source = /^(?:apps|packages)\/[^/]+\/src\/(.+\.(?:ts|tsx|mts|cts))$/.exec(file)?.[1]
  if (
    !source ||
    /(?:^|\/)(?:adapters?|boundaries|dtos?|fixtures|generated|tests?|node_modules|dist|build|dataset)\//.test(
      source,
    )
  )
    return false
  if (/\.(?:d|generated|dto|adapter|spec|test)\.[cm]?tsx?$/.test(source)) return false
  return (
    /(?:^|\/)(?:domain|models?)\//.test(source) || /[.-](?:domain|model)\.[cm]?tsx?$/.test(source)
  )
}

function syntaxFindings(configPath, files, domainSymbols) {
  const rules = Object.fromEntries(
    Object.keys(plugin.rules).map(rule => [
      `pair-domain/${rule}`,
      domainSymbols ? ['error', { domainSymbols }] : 'error',
    ]),
  )
  writeFileSync(
    configPath,
    JSON.stringify({
      categories: { correctness: 'off' },
      jsPlugins: [{ name: 'pair-domain', specifier: pluginFile }],
      rules,
    }),
  )
  const result = spawnSync(
    process.execPath,
    [oxlint, '--config', configPath, '--disable-nested-config', '--format=json', ...files],
    {
      encoding: 'utf8',
      maxBuffer: 16 * 1024 * 1024,
    },
  )
  if (result.error) throw result.error
  let diagnostics
  try {
    diagnostics = JSON.parse(result.stdout).diagnostics
  } catch {
    /* Missing structured output is an operational failure. */
  }
  if (
    result.stderr ||
    ![0, 1].includes(result.status) ||
    !Array.isArray(diagnostics) ||
    (result.status === 1 && !diagnostics.length) ||
    diagnostics.some(item => !item.filename || !item.code || !item.labels?.[0]?.span)
  ) {
    throw new Error(`Oxlint could not check ${files.join(', ')}\n${result.stderr || result.stdout}`)
  }
  return diagnostics.map(({ filename, code, message, labels }) => ({
    filename: relative(process.cwd(), resolve(filename)).split(sep).join('/'),
    code: code.replace(/^pair-domain\((.+)\)$/, 'pair-domain/$1'),
    property: /^(?:Make |Remove null or undefined from )(.+?) (?:required on |and model )/.exec(
      message,
    )?.[1],
    span: labels[0].span,
    message,
  }))
}

function projectFor(file) {
  for (let dir = dirname(resolve(file)); dir !== dirname(dir); dir = dirname(dir)) {
    const config = join(dir, 'tsconfig.json')
    if (existsSync(config)) return config
  }
  throw new Error(`${file}: no TypeScript project for domain lint`)
}

export function checkDomainRatchet() {
  const base = git('merge-base', 'HEAD', 'origin/main').trim()
  const files = new Set(
    git('ls-files', '-z', '--cached', '--others', '--exclude-standard', '--', 'apps', 'packages')
      .split('\0')
      .filter(file => file && lstatSync(file, { throwIfNoEntry: false })?.isFile()),
  )
  const moves = renames(base)
  const anchor = spawnSync('git', ['cat-file', '-e', `${reviewedBase}^{commit}`])
  if (anchor.status === 0 && reviewedBase !== base) {
    for (const [old, moved] of renames(reviewedBase)) if (!moves.has(old)) moves.set(old, moved)
  }
  const currentPath = file => (files.has(file) ? file : (moves.get(file) ?? file))
  const snapshot = read(baselinePath)
  const priorEntries = counts(entries(readPrevious(base, baselinePath, snapshot), currentPath))
  const currentEntries = entries(snapshot, currentPath)
  const errors = currentEntries
    .filter(entry => !consume(priorEntries, entry))
    .map(entry => `domain baseline cannot grow: ${JSON.parse(entry).join(' ')}`)
  const suppressions = read(suppressionPath)
  const priorSuppressions = counts(readPrevious(base, suppressionPath, suppressions))
  for (const entry of suppressions) {
    if (!consume(priorSuppressions, entry))
      errors.push(`legacy suppression baseline cannot grow: ${entry}`)
  }

  const scopes = new Map(
    [...legacy]
      .map(([file, symbols]) => [currentPath(file), symbols])
      .filter(([file]) => files.has(file)),
  )
  const pilotDir = 'packages/content-ops'
  const pilot = read(`${pilotDir}/.oxlintrc.json`).overrides.find(override =>
    Object.hasOwn(override.rules ?? {}, 'pair-domain/no-explicit-nullish-domain-types'),
  )
  const pilotFiles = new Set(glob.sync(pilot.files.map(file => `${pilotDir}/${file}`)))
  const dedicated = [...files].filter(
    file => authoredModel(file) && !scopes.has(file) && !pilotFiles.has(file),
  )
  const temp = mkdtempSync(join(tmpdir(), 'pair-domain-ratchet-'))
  const findings = []
  try {
    const config = join(temp, '.oxlintrc.json')
    for (const [file, symbols] of scopes) findings.push(...syntaxFindings(config, [file], symbols))
    if (dedicated.length) findings.push(...syntaxFindings(config, dedicated))
  } finally {
    rmSync(temp, { recursive: true, force: true })
  }
  const byProject = new Map()
  for (const file of [...scopes.keys(), ...dedicated]) {
    const project = projectFor(file)
    const group = byProject.get(project) ?? []
    group.push(file)
    byProject.set(project, group)
  }
  for (const [project, group] of byProject) {
    findings.push(...checkNullableDomainProperties(project, group, scopes))
  }
  const remaining = counts(currentEntries)
  for (const { filename, code, property, span, message } of findings) {
    if (!consume(remaining, key(filename, code, property))) {
      errors.push(
        `${filename}:${span.line}:${span.column}: ${code}: ${message ?? `Resolved nullish property ${property}.`}`,
      )
    }
  }
  for (const entry of remaining.keys())
    errors.push(`retire fixed domain baseline entry: ${JSON.parse(entry).join(' ')}`)
  return { errors, baselined: currentEntries.length, checked: scopes.size + dedicated.length }
}

import { join, posix } from 'path'
import { FileSystemService, isValidFlattenDepth, resolvesWithinSync } from '@pair/content-ops'
import {
  Config,
  extractRegistries,
  validateAllRegistries,
  resolveWorkingPathOverride,
} from '#registry'

/** What reading a named source KB's own declaration produced (US-396). */
export interface SourceDeclarationOutcome {
  /** The source's registry declaration was merged in (below the consumer's overrides). */
  applied: boolean
  /** Registries the source declares that this CLI has no definition for — never installed. */
  unknownRegistries: string[]
  /** The source shipped a config that could not be used; the consumer resolution stands. */
  warning?: string
}

export interface LoadConfigOptions {
  customConfigPath?: string
  projectRoot?: string
  skipBaseConfig?: boolean
  /**
   * Layer 3 is the project's OWN `pair.config.json` only — no `config.json` fallback.
   * Set by install/update, where `projectRoot` is the directory being installed into: a
   * file named `config.json` there is far too common to be assumed a Pair config.
   */
  projectConfigOnly?: boolean
  /**
   * Root of an explicitly named source KB (`--source`). Its own `pair.config.json` is
   * honoured, so a maintainer's declared namespacing applies without the consuming
   * project copying anything (US-396 AC3). Absent for the default source.
   */
  sourceRoot?: string
}

export interface LoadedConfig {
  config: Config
  /**
   * The resolution CHAIN that produced `config`, weakest first, joined by ` < ` — e.g.
   * `pair-cli config.json < source KB declaration: /acme-kb < pair.config.json`.
   *
   * Diagnostic, not behavioural: nothing branches on it. It was a last-writer-wins label
   * before the four-layer model, which described the resolution wrongly in exactly the
   * case that model is about — a source declaration overwritten by the project layer read
   * as if the declaration had never applied. Install and update print it (once, when a
   * source KB declaration actually applied), so a KB maintainer can see whether their
   * declaration was honoured instead of inferring it from installed directory names.
   */
  source: string
  /** Present only when a `sourceRoot` was named. */
  sourceDeclaration?: SourceDeclarationOutcome
}

/**
 * Loads the CLI configuration with optional overrides.
 *
 * Precedence, weakest first: base CLI config < **source KB declaration** < consuming
 * project `pair.config.json` < explicit `--config`. The source declares, the consumer
 * overrides — stated once here, and documented in the external-KB guide.
 *
 * Layer 2 is trusted with a strictly bounded set of fields (`SOURCE_DECLARABLE_FIELDS`):
 * it is remote content, so it never decides where the install writes.
 */
export function loadConfigWithOverrides(
  fsService: FileSystemService,
  options: LoadConfigOptions = {},
): LoadedConfig {
  const { sourceRoot, skipBaseConfig } = options
  const base = skipBaseConfig
    ? { config: { asset_registries: {} } as Config, source: 'empty' }
    : loadBaseConfig(fsService)

  if (!sourceRoot) return layerOverrides(fsService, base, options)

  const declared = readSourceDeclaration(
    fsService,
    sourceRoot,
    Object.keys(base.config.asset_registries ?? {}),
  )
  const { layered, declaration } = resolveWithDeclaration(fsService, base, declared, options)
  return { ...layered, sourceDeclaration: summarizeDeclaration(declaration, layered.config) }
}

/**
 * Applies the declaration, then checks the RESOLVED configuration as a whole — and backs
 * the declaration out entirely if it is what made the result invalid.
 *
 * The per-field guards drop a field that is malformed on its own. They cannot see a field
 * that is well-formed but incoherent with the layer beneath it: `flattenDepth: 2` over a
 * registry whose `flatten` is false is a valid positive integer AND a hard validation
 * error (`flattenDepth requires flatten: true`). Install validates the merged config and
 * THROWS, so one such typo in a third-party KB aborted the consumer's install with an
 * error naming the consumer's own registry — a source's bad config must never do that
 * (US-396 edge case, review round 3).
 *
 * The fall-back is deliberately all-or-nothing here rather than per field: a declaration
 * that does not resolve is not partially trustworthy, and half-applying it is the one
 * outcome the story rules out explicitly. It backs out what the declaration CONTRIBUTES,
 * not the record of what it DECLARED — `declaredNames` survives, so the registries this
 * CLI has no definition for are still reported skipped and still counted in the announced
 * total (US-396 review round 5).
 *
 * A result that is invalid WITHOUT the declaration too means the consumer's own
 * configuration is broken. The declaration is kept and the command reports the real
 * errors — blaming the source there would send the user to a file that is fine.
 */
function resolveWithDeclaration(
  fsService: FileSystemService,
  base: { config: Config; source: string },
  declaration: SourceDeclaration,
  options: LoadConfigOptions,
): { layered: { config: Config; source: string }; declaration: SourceDeclaration } {
  const withDeclaration = layerOverrides(
    fsService,
    applyDeclaration(base, declaration, options.sourceRoot),
    options,
  )
  if (!contributesAnything(declaration.config)) return { layered: withDeclaration, declaration }

  const check = validateConfig(withDeclaration.config)
  if (check.valid) return { layered: withDeclaration, declaration }

  const withoutDeclaration = layerOverrides(fsService, base, options)
  if (!validateConfig(withoutDeclaration.config).valid) {
    return { layered: withDeclaration, declaration }
  }

  return {
    layered: withoutDeclaration,
    declaration: {
      config: null,
      // What the source DECLARED survives the back-out; only what it CONTRIBUTES is
      // dropped. `declaredNames` feeds the `skipped — declared by source, unknown to this
      // CLI` lines and the announced registry total, and a registry this CLI cannot
      // install is unknown whether or not the rest of the declaration validated.
      declaredNames: declaration.declaredNames,
      warning:
        `Ignoring the source KB's pair.config.json (${join(options.sourceRoot!, 'pair.config.json')}): ` +
        `it makes the resolved registry configuration invalid (${check.errors.join('; ')})`,
    },
  }
}

/** The source KB's own declaration sits directly above the base config, below the consumer. */
function applyDeclaration(
  base: { config: Config; source: string },
  declaration: SourceDeclaration,
  sourceRoot: string | undefined,
): { config: Config; source: string } {
  // A declaration whose every field was dropped contributes nothing AND must not appear
  // in the chain: the chain is what tells a maintainer their declaration was honoured.
  if (!declaration.config || !contributesAnything(declaration.config)) return base
  return {
    config: mergeConfigs(base.config, declaration.config),
    source: `${base.source} < source KB declaration: ${sourceRoot}`,
  }
}

/** Consumer layers, weakest first: project `pair.config.json`, then an explicit `--config`. */
function layerOverrides(
  fsService: FileSystemService,
  start: { config: Config; source: string },
  options: LoadConfigOptions,
): { config: Config; source: string } {
  const { customConfigPath, projectRoot = fsService.rootModuleDirectory() } = options
  let { config, source } = start

  const pairApplied = applyPairConfigIfExists(fsService, config, projectRoot, {
    // The base config is not a project override of itself: when the project root IS the
    // module dir (the released layout), re-merging `config.json` here would silently undo
    // the source KB's declaration applied just above.
    ...(options.skipBaseConfig
      ? {}
      : { alreadyLoaded: baseConfigPath(fsService.rootModuleDirectory()) }),
    ...(options.projectConfigOnly && { pairConfigOnly: true }),
  })
  if (pairApplied) {
    config = pairApplied.config
    source = `${source} < pair.config.json`
  }

  if (customConfigPath) {
    config = mergeWithCustomConfig(fsService, config, customConfigPath)
    source = `${source} < custom config: ${customConfigPath}`
  }

  return { config, source }
}

/** At least one registry entry survived the allowlist with at least one field. */
function contributesAnything(config: Config | null): boolean {
  if (!config) return false
  return Object.values(config.asset_registries ?? {}).some(
    entry => Object.keys(entry as object).length > 0,
  )
}

/**
 * `applied` means the declaration CHANGED the resolution, not that a parseable file was
 * found. A KB whose whole declaration is dropped by the allowlist (one stating only
 * `targets`, say) would otherwise be told `Configuration: … < source KB declaration: /kb`
 * — the one line a maintainer reads to confirm their declaration was honoured, reporting
 * success in exactly the case where nothing of it survived (US-396 review round 3).
 */
function summarizeDeclaration(
  declaration: SourceDeclaration,
  resolved: Config,
): SourceDeclarationOutcome {
  return {
    applied: contributesAnything(declaration.config),
    // A name the consumer went on to declare itself is deliberate, not unknown.
    unknownRegistries: declaration.declaredNames.filter(
      name => !(name in (resolved.asset_registries ?? {})),
    ),
    ...(declaration.warning && { warning: declaration.warning }),
  }
}

/**
 * The ONLY fields a source KB may contribute (US-396, layer 2).
 *
 * Layer 2 is the one layer whose content the consuming project does not control: it is
 * shipped by a remote, third-party KB. So it may describe its own CONTENT and its own
 * NAMESPACING, never WHERE the install writes — `targets`, `target_path`, `behavior`,
 * `working_path` and every other top-level key are dropped, not merged. Without this,
 * `resolveTarget` would join a source-declared path onto the project root and a KB could
 * write anywhere on the machine.
 *
 * `include` is deliberately NOT on this list, even though it reads like content
 * description. For a `mirror` registry, `buildCopyOptions` (`registry/operations.ts:220`)
 * uses `include` to scope MIRROR-CLEANUP OWNERSHIP: which target folders get deleted when
 * absent from the source. That is a WRITE decision, not a content one — a source
 * declaring `{"include":[]}` widened cleanup ownership to the registry's entire target
 * (verified: it deleted a consumer's `.github/ISSUE_TEMPLATE` and `.github/workflows` on
 * `pair-cli update`), and a source declaring a narrower `include` than the base registry
 * still moves which of the CONSUMER's own files are liable to deletion (US-396 review
 * round 2, escalated from round 3's Critical). `exclude` stays: it only ever NARROWS what
 * a mirror deletes, never widens it, so it cannot reach this failure mode.
 *
 * Two of the honoured fields are still paths and are therefore CONTAINED, not merely
 * allowed: `prefix` must be a single path segment, and `source` must stay inside the KB
 * (see `FIELD_GUARDS`). Read side and write side are both bounded by the KB root.
 */
const SOURCE_DECLARABLE_FIELDS = [
  'source',
  'exclude',
  'flatten',
  'flattenDepth',
  'description',
  'prefix',
] as const

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/**
 * `prefix` becomes a directory name; `source` and `description` are echoed on a single
 * terminal line by `registryStart` and similar reporters. A declared value that survives
 * shape/containment checks is not yet safe: a C0/C1 control character in it can move the
 * cursor, erase a line, or forge output the operator reads to judge whether an install
 * from a THIRD-PARTY KB went well (US-396 review round 6) — or, for `prefix`, land in a
 * path a line-oriented script (e.g. `ls`) then misreads. A loop, not a control-character
 * regex literal: this repo's code-hygiene gate flags every linter-suppression comment
 * with no exception mechanism, and a loop needs none. Unlike the display-only sanitizer
 * in `@pair/content-ops` (which keeps `\t`/`\n` as real formatting), a config-declared
 * value is a path segment or a single report line — ANY control character, `\n`/`\r`
 * included, invalidates it outright rather than being escaped for display.
 */
function hasControlCharacters(value: string): boolean {
  for (const char of value) {
    const code = char.codePointAt(0) ?? 0
    if (code <= 0x1f || (code >= 0x7f && code <= 0x9f)) return true
  }
  return false
}

/** What `readSourceDeclaration` returns: the honoured subset, plus what to report. */
interface SourceDeclaration {
  config: Config | null
  declaredNames: string[]
  warning?: string
}

/** What a field guard may consult beyond the value: the KB it was declared in. */
interface GuardContext {
  fsService: FileSystemService
  sourceRoot: string
}

type FieldGuard = (value: unknown, ctx: GuardContext) => boolean

/**
 * `prefix` becomes a path segment (`${prefix}-${dir}`), so a source-declared one may not
 * carry a separator or a traversal — that would be `targets` by another name.
 */
function isSafePrefix(value: unknown): boolean {
  return (
    typeof value === 'string' &&
    value.length > 0 &&
    !/[/\\]/.test(value) &&
    !value.includes('..') &&
    !hasControlCharacters(value)
  )
}

function isStringArray(value: unknown): boolean {
  return Array.isArray(value) && value.every(item => typeof item === 'string')
}

/**
 * `source` is where the CLI READS from: `resolveRegistryPaths` does
 * `resolve(datasetRoot, config.source)`, so an absolute path replaces the KB root outright
 * and a `..` walks out of it — a source-declared one would turn `pair-cli install --source`
 * into "copy arbitrary local files into the consumer's repository" (SSH keys land in a
 * tree the user commits). Layer 2 describes its OWN content, so the path must stay inside
 * the KB: relative, and still inside after normalisation (`a/../../b` included).
 *
 * Lexically contained is NOT contained. `fs.stat` follows symlinks, so a KB shipping
 * `leak -> ../../../.ssh` and declaring `"source": "leak"` passed every name-based check
 * — nothing about `leak` escapes anything — and the copier then read the victim's
 * directory into the repository they commit and push. The name check stays (it rejects
 * the obvious cases without touching the disk); the decision is the PHYSICAL one
 * (US-396 review round 3).
 *
 * A declared path that does not exist is contained: there is nothing to dereference, and
 * a registry the KB does not actually ship is reported as skipped, not refused.
 */
function isContainedSource(value: unknown, ctx: GuardContext): boolean {
  if (typeof value !== 'string' || value.length === 0) return false
  if (hasControlCharacters(value)) return false
  // Covers POSIX (`/etc`), Windows drive (`C:\Users`) and UNC/backslash roots alike.
  if (/^([a-zA-Z]:)?[/\\]/.test(value)) return false
  const normalized = posix.normalize(value.replace(/\\/g, '/'))
  if (normalized === '..' || normalized.startsWith('../')) return false
  return resolvesWithinSync(ctx.fsService, join(ctx.sourceRoot, normalized), ctx.sourceRoot)
}

/**
 * Per-field checks, one per declarable field — TOTAL, not partial, so adding a field to
 * `SOURCE_DECLARABLE_FIELDS` cannot compile until its guard is stated.
 *
 * A field that fails its guard is DROPPED (the layer beneath supplies the value), never
 * coerced: a KB does not get a second guess at a path. The two path-shaped fields are
 * CONTAINED; the rest are TYPE-checked, which is not decoration — the merged config is
 * validated with a hard throw, so `"include": "*.md"` (string, not array) shipped by any
 * third-party KB aborted the consumer's whole install with an error naming the CONSUMER's
 * registry (US-396 review round 3).
 */
const FIELD_GUARDS: Record<(typeof SOURCE_DECLARABLE_FIELDS)[number], FieldGuard> = {
  source: isContainedSource,
  exclude: isStringArray,
  flatten: value => typeof value === 'boolean',
  flattenDepth: value => isValidFlattenDepth(value),
  description: value =>
    typeof value === 'string' && value.length > 0 && !hasControlCharacters(value),
  prefix: isSafePrefix,
}

/** Keeps only the declarable fields of one registry entry; anything else is dropped. */
function honouredFields(entry: unknown, ctx: GuardContext): Record<string, unknown> {
  if (!isPlainObject(entry)) return {}
  const kept: Record<string, unknown> = {}
  for (const field of SOURCE_DECLARABLE_FIELDS) {
    if (!(field in entry)) continue
    if (!FIELD_GUARDS[field](entry[field], ctx)) continue
    kept[field] = entry[field]
  }
  return kept
}

/**
 * `declaredNames` reaches the terminal verbatim — `unknownRegistries` names print via
 * `registrySkipped` in the install summary. A registry KEY carrying a control character
 * is the same forged-output risk `hasControlCharacters` exists for on `prefix` /
 * `source` / `description` (US-396 review round 6), just on a field with no allowlist
 * guard of its own because it is never merged into the config — it is dropped here,
 * before any reporting path sees it, rather than escaped for display.
 */
function declaredRegistryNames(registries: Record<string, unknown>): string[] {
  return Object.keys(registries).filter(name => !hasControlCharacters(name))
}

/**
 * Reads a source KB's own `pair.config.json`.
 *
 * A malformed source config never aborts the install and is never half-applied: the
 * consumer's resolution stands and the caller reports the warning. "Malformed" covers
 * anything that is not a JSON object with an object `asset_registries` — a valid-JSON
 * `null`, string or array declares nothing usable and must not report itself as applied.
 * Registries the source declares that this CLI has no definition for are held back
 * (reported as skipped by the install summary) rather than installed on the strength of
 * the source's word alone.
 */
function readSourceDeclaration(
  fsService: FileSystemService,
  sourceRoot: string,
  knownRegistries: string[],
): SourceDeclaration {
  const declarationPath = join(sourceRoot, 'pair.config.json')
  if (!fsService.existsSync(declarationPath)) {
    return { config: null, declaredNames: [] }
  }

  const ignore = (reason: string) => ({
    config: null,
    declaredNames: [],
    warning: `Ignoring the source KB's pair.config.json (${declarationPath}): ${reason}`,
  })

  let declared: unknown
  try {
    declared = JSON.parse(fsService.readFileSync(declarationPath))
  } catch (err) {
    return ignore(String(err))
  }

  if (!isPlainObject(declared)) return ignore('not a JSON object')
  const registries = declared['asset_registries'] ?? {}
  if (!isPlainObject(registries)) return ignore('asset_registries is not an object')

  const declaredNames = declaredRegistryNames(registries)
  const known = declaredNames.filter(name => knownRegistries.includes(name))
  // Partial by design: a declaration states the few fields it wants, and `mergeConfigs`
  // lays them over the base entry field by field.
  const honoured = Object.fromEntries(
    known.map(name => [name, honouredFields(registries[name], { fsService, sourceRoot })]),
  ) as unknown as Config['asset_registries']
  const applicable: Config = { asset_registries: honoured }

  // Declared something this CLI knows, and not one field of it survived: say so. Silence
  // here is what let a wholly-discarded declaration read as honoured. A name the CLI does
  // not know is NOT this case — it already has its own `skipped` reason.
  if (known.length > 0 && !contributesAnything(applicable)) {
    return {
      config: applicable,
      declaredNames,
      warning:
        `The source KB's pair.config.json (${declarationPath}) declares no field this CLI ` +
        `honours; the consumer's resolution stands`,
    }
  }
  return { config: applicable, declaredNames }
}

function baseConfigPath(currentDir: string) {
  return join(currentDir, 'config.json')
}

/**
 * Loads the internal base configuration from the module directory.
 */
function loadBaseConfig(fsService: FileSystemService): { config: Config; source: string } {
  const appConfigPath = baseConfigPath(fsService.rootModuleDirectory())
  try {
    if (fsService.existsSync(appConfigPath)) {
      const appConfigContent = fsService.readFileSync(appConfigPath)
      return { config: JSON.parse(appConfigContent) as Config, source: 'pair-cli config.json' }
    } else {
      throw new Error(`Config file not found in pair-cli. expected path: ${appConfigPath}`)
    }
  } catch (err) {
    throw new Error(`Failed to load base config: ${String(err)}`)
  }
}

function applyPairConfigIfExists(
  fsService: FileSystemService,
  baseConfig: Config,
  projectRoot: string,
  options: { alreadyLoaded?: string; pairConfigOnly?: boolean } = {},
): { config: Config } | null {
  const pairConfigPath = join(projectRoot, 'pair.config.json')
  const configJsonPath = join(projectRoot, 'config.json')

  // Try pair.config.json first, then fall back to config.json — unless that config.json is
  // the base config this resolution already started from, or the caller pointed us at a
  // real project root, where `config.json` is a name any tool may own.
  const fallbackAllowed =
    !options.pairConfigOnly &&
    fsService.existsSync(configJsonPath) &&
    configJsonPath !== options.alreadyLoaded
  const configPath = fsService.existsSync(pairConfigPath)
    ? pairConfigPath
    : fallbackAllowed
      ? configJsonPath
      : null

  if (configPath) {
    try {
      const pairConfigContent = fsService.readFileSync(configPath)
      const pairConfig = JSON.parse(pairConfigContent)
      return { config: mergeConfigs(baseConfig, pairConfig) }
    } catch {
      console.warn(`Warning: Failed to load ${configPath}, continuing with base config`)
    }
  }
  return null
}

function mergeWithCustomConfig(
  fsService: FileSystemService,
  baseConfig: Config,
  customConfigPath: string,
): Config {
  try {
    const customConfigContent = fsService.readFileSync(customConfigPath)
    const customConfig = JSON.parse(customConfigContent)
    return mergeConfigs(baseConfig, customConfig)
  } catch (err) {
    throw new Error(`Failed to load custom config file ${customConfigPath}: ${String(err)}`)
  }
}

/**
 * Performs a deep-ish merge of configurations, specifically handling the asset_registries map correctly.
 */
function mergeConfigs(baseConfig: Config, overrideConfig: Config): Config {
  const merged = { ...baseConfig }

  if (overrideConfig.asset_registries) {
    merged.asset_registries = { ...merged.asset_registries }

    Object.entries(overrideConfig.asset_registries).forEach(([registryName, registryConfig]) => {
      if (typeof registryConfig === 'object' && registryConfig !== null) {
        merged.asset_registries[registryName] = {
          ...merged.asset_registries[registryName],
          ...registryConfig,
        }
      }
    })
  }

  Object.keys(overrideConfig).forEach(key => {
    if (key !== 'asset_registries') {
      merged[key] = (overrideConfig as Record<string, unknown>)[key]
    }
  })

  return merged
}

/**
 * Validates the provided configuration object.
 */
export function validateConfig(config: unknown): { valid: boolean; errors: string[] } {
  const registries = extractRegistries(config)
  const workingPath = resolveWorkingPathOverride(config)
  return validateAllRegistries(registries, workingPath)
}

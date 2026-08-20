import { join } from 'path'
import { FileSystemService } from '@pair/content-ops'
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

  const declaration = sourceRoot
    ? readSourceDeclaration(fsService, sourceRoot, Object.keys(base.config.asset_registries ?? {}))
    : null

  const layered = layerOverrides(
    fsService,
    applyDeclaration(base, declaration, sourceRoot),
    options,
  )
  if (!declaration) return layered
  return { ...layered, sourceDeclaration: summarizeDeclaration(declaration, layered.config) }
}

/** The source KB's own declaration sits directly above the base config, below the consumer. */
function applyDeclaration(
  base: { config: Config; source: string },
  declaration: { config: Config | null } | null,
  sourceRoot: string | undefined,
): { config: Config; source: string } {
  if (!declaration?.config) return base
  return {
    config: mergeConfigs(base.config, declaration.config),
    source: `source KB declaration: ${sourceRoot}`,
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
    source = 'pair.config.json'
  }

  if (customConfigPath) {
    config = mergeWithCustomConfig(fsService, config, customConfigPath)
    source = `custom config: ${customConfigPath}`
  }

  return { config, source }
}

function summarizeDeclaration(
  declaration: { config: Config | null; declaredNames: string[]; warning?: string },
  resolved: Config,
): SourceDeclarationOutcome {
  return {
    applied: declaration.config !== null,
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
 */
const SOURCE_DECLARABLE_FIELDS = [
  'source',
  'include',
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
 * `prefix` becomes a path segment (`${prefix}-${dir}`), so a source-declared one may not
 * carry a separator or a traversal — that would be `targets` by another name.
 */
function isSafePrefix(value: unknown): boolean {
  return (
    typeof value === 'string' && value.length > 0 && !/[/\\]/.test(value) && !value.includes('..')
  )
}

/** Keeps only the declarable fields of one registry entry; anything else is dropped. */
function honouredFields(entry: unknown): Record<string, unknown> {
  if (!isPlainObject(entry)) return {}
  const kept: Record<string, unknown> = {}
  for (const field of SOURCE_DECLARABLE_FIELDS) {
    if (!(field in entry)) continue
    if (field === 'prefix' && !isSafePrefix(entry[field])) continue
    kept[field] = entry[field]
  }
  return kept
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
): { config: Config | null; declaredNames: string[]; warning?: string } {
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

  const declaredNames = Object.keys(registries)
  // Partial by design: a declaration states the few fields it wants, and `mergeConfigs`
  // lays them over the base entry field by field.
  const honoured = Object.fromEntries(
    declaredNames
      .filter(name => knownRegistries.includes(name))
      .map(name => [name, honouredFields(registries[name])]),
  ) as unknown as Config['asset_registries']
  const applicable: Config = { asset_registries: honoured }
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

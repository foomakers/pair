import { join, dirname, basename, sep } from 'path'
import { Behavior, FileSystemService, fileSystemService } from '@pair/content-ops'

// Define proper types for configuration
export interface RegistryConfig {
  source?: string
  behavior: Behavior
  target_path: string
  description: string
  include?: string[]
}

export interface Config {
  asset_registries: Record<string, RegistryConfig>
  default_target_folders?: Record<string, string>
  folders_to_include?: Record<string, string[]>
  [key: string]: unknown
}

function findUpForCandidate(
  fsService: FileSystemService,
  startDir: string,
  candidateRelPath: string,
  maxDepth = 10,
): string | null {
  const diagEnv = process.env['PAIR_DIAG']
  const DIAG = diagEnv === '1' || diagEnv === 'true'

  let dir = startDir
  for (let i = 0; i < maxDepth; i++) {
    const candidatePath = join(dir, candidateRelPath)
    if (DIAG) {
      // Derive a small label for diagnostics from the candidateRelPath
      const label = candidateRelPath.includes('node_modules') ? 'node_modules' : 'monorepo'
      console.error(
        `[diag] checking ${label} candidate: ${candidatePath} exists=${fsService.existsSync(
          candidatePath,
        )}`,
      )
    }
    if (fsService.existsSync(candidatePath)) return candidatePath
    const parentDir = dirname(dir)
    if (parentDir === dir) break
    dir = parentDir
  }
  return null
}

function findPackageJsonPath(fsService: FileSystemService, currentDir: string = __dirname): string {
  // Look for monorepo package first, then node_modules package, walking up
  const monorepoPkgJson = 'packages/knowledge-hub/package.json'
  const nodeModulesPkgJson = 'node_modules/@pair/knowledge-hub/package.json'

  const monorepoResult = findUpForCandidate(fsService, currentDir, monorepoPkgJson)
  if (monorepoResult) return monorepoResult

  const nodeModulesResult = findUpForCandidate(fsService, currentDir, nodeModulesPkgJson)
  if (nodeModulesResult) return nodeModulesResult

  throw new Error(
    `Unable to find @pair/knowledge-hub package. Ensure the package is available in the workspace and installed.`,
  )
}

function resolveReleaseDatasetPath(
  fsService: FileSystemService,
  currentDir: string,
): string | null {
  const diagEnv = process.env['PAIR_DIAG']
  const DIAG = diagEnv === '1' || diagEnv === 'true'

  const releaseDatasetPath = join(currentDir, '..', 'dataset')
  const bundleDatasetPath = join(currentDir, 'dataset')

  if (DIAG)
    console.error(
      `[diag] checking release dataset at: ${releaseDatasetPath} exists=${fsService.existsSync(
        releaseDatasetPath,
      )}`,
    )
  if (DIAG)
    console.error(
      `[diag] checking bundle dataset at: ${bundleDatasetPath} exists=${fsService.existsSync(
        bundleDatasetPath,
      )}`,
    )

  if (fsService.existsSync(releaseDatasetPath)) return releaseDatasetPath
  if (fsService.existsSync(bundleDatasetPath)) return bundleDatasetPath
  return null
}

export function getKnowledgeHubDatasetPath(
  fsService: FileSystemService = fileSystemService,
  currentDir: string = __dirname,
): string {
  const diagEnv = process.env['PAIR_DIAG']
  const DIAG = diagEnv === '1' || diagEnv === 'true'

  if (DIAG) console.error(`[diag] getKnowledgeHubDatasetPath currentDir=${currentDir}`)
  if (DIAG) console.error(`[diag] isInRelease=${isInRelease(currentDir)}`)

  if (isInRelease(currentDir)) {
    const resolved = resolveReleaseDatasetPath(fsService, currentDir)
    if (resolved) return resolved

    // Keep the error message compatible with existing tests which expect
    // the primary release dataset path in the message.
    const releaseDatasetPath = join(currentDir, '..', 'dataset')
    throw new Error(`Dataset not found in release bundle at: ${releaseDatasetPath}`)
  }

  // In monorepo/development, find via node_modules or monorepo packages
  const pkgPath = findPackageJsonPath(fsService, currentDir)
  const datasetPath = join(dirname(pkgPath), 'dataset')
  if (DIAG)
    console.error(
      `[diag] resolved monorepo dataset path: ${datasetPath} exists=${fsService.existsSync(
        datasetPath,
      )}`,
    )
  return datasetPath
}

/**
 * Load configuration with cascade override priority:
 * 1. Command line registry overrides (highest priority)
 * 2. Custom config file (--config option)
 * 3. pair.config in project root
 * 4. knowledge-hub config.json (lowest priority)
 */
export function loadConfigWithOverrides(
  fsService: FileSystemService = fileSystemService,
  options: { customConfigPath?: string; projectRoot?: string } = {},
): { config: Config; source: string } {
  const { customConfigPath, projectRoot = process.cwd() } = options

  // Start with the base config (either local app config or knowledge-hub)
  let { config, source } = loadBaseConfig(fsService)
  // Apply pair.config if present in the project root
  const pairApplied = applyPairConfigIfExists(fsService, config, projectRoot)
  if (pairApplied) {
    config = pairApplied.config
    source = 'pair.config.json'
  }

  // Merge custom config file when provided
  if (customConfigPath) {
    config = mergeWithCustomConfig(fsService, config, customConfigPath)
    source = `custom config: ${customConfigPath}`
  }

  // No programmatic registry overrides supported; return merged config

  return { config, source }
}

export function isInRelease(currentDir: string = __dirname): boolean {
  // Robust detection: true when currentDir is the bundle-cli folder itself
  // or when it contains the bundle-cli segment (with separators).
  try {
    if (basename(currentDir) === 'bundle-cli') return true
    const needle = `${sep}bundle-cli${sep}`
    return currentDir.includes(needle)
  } catch {
    return false
  }
}

function baseConfigPath() {
  return join(__dirname, '..', 'config.json')
}

function loadBaseConfig(fsService: FileSystemService): { config: Config; source: string } {
  const appConfigPath = baseConfigPath()
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
): { config: Config } | null {
  const pairConfigPath = join(projectRoot, 'pair.config.json')
  if (fsService.existsSync(pairConfigPath)) {
    try {
      const pairConfigContent = fsService.readFileSync(pairConfigPath)
      const pairConfig = JSON.parse(pairConfigContent)
      return { config: mergeConfigs(baseConfig, pairConfig) }
    } catch {
      // Log and continue with base config
      console.warn('Warning: Failed to load pair.config.json, continuing with base config')
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
 * Merge two configuration objects, with second config overriding first
 */
function mergeConfigs(baseConfig: Config, overrideConfig: Config): Config {
  const merged = { ...baseConfig }

  if (overrideConfig.asset_registries) {
    merged.asset_registries = { ...merged.asset_registries }

    // Override existing registries and add new ones
    Object.entries(overrideConfig.asset_registries).forEach(([registryName, registryConfig]) => {
      if (typeof registryConfig === 'object' && registryConfig !== null) {
        merged.asset_registries[registryName] = {
          ...merged.asset_registries[registryName],
          ...registryConfig,
        }
      }
    })
  }

  // Override other top-level properties
  Object.keys(overrideConfig).forEach(key => {
    if (key !== 'asset_registries') {
      merged[key] = overrideConfig[key]
    }
  })

  return merged
}

/**
 * Programmatic registry overrides were removed. Configuration is loaded from
 * (in order) a custom config file, pair.config.json in the project root, and
 * finally the packaged knowledge-hub config.json.
 */

/**
 * Validate the asset registry configuration
 */
export function validateConfig(config: unknown): { valid: boolean; errors: string[] } {
  const errors: string[] = []

  // Basic config validation
  const basicValidation = validateBasicConfigStructure(config)
  if (!basicValidation.valid) {
    return basicValidation
  }

  const configObj = config as Record<string, unknown>
  const registries = configObj['asset_registries'] as Record<string, unknown>

  // Validate each registry
  for (const [registryName, registry] of Object.entries(registries)) {
    const registryErrors = validateSingleRegistry(registryName, registry)
    errors.push(...registryErrors)
  }

  return { valid: errors.length === 0, errors }
}

/**
 * Validate basic config structure
 */
function validateBasicConfigStructure(config: unknown): { valid: boolean; errors: string[] } {
  const errors: string[] = []

  if (!config || typeof config !== 'object') {
    errors.push('Config must be a valid object')
    return { valid: false, errors }
  }

  const configObj = config as Record<string, unknown>

  if (!configObj['asset_registries'] || typeof configObj['asset_registries'] !== 'object') {
    errors.push('Config must have asset_registries object')
    return { valid: false, errors }
  }

  return { valid: true, errors }
}

/**
 * Validate a single registry configuration
 */
function validateSingleRegistry(registryName: string, registry: unknown): string[] {
  const errors: string[] = []

  if (!registry || typeof registry !== 'object') {
    errors.push(`Registry '${registryName}' must be a valid object`)
    return errors
  }

  const reg = registry as Record<string, unknown>
  const validBehaviors: Behavior[] = ['overwrite', 'add', 'mirror', 'skip']

  // Validate behavior
  if (!reg['behavior'] || !validBehaviors.includes(reg['behavior'] as Behavior)) {
    errors.push(
      `Registry '${registryName}' has invalid behavior '${
        reg['behavior']
      }'. Must be one of: ${validBehaviors.join(', ')}`,
    )
  }

  // Validate target_path
  if (!reg['target_path'] || typeof reg['target_path'] !== 'string') {
    errors.push(`Registry '${registryName}' must have a valid target_path string`)
  }

  // Validate include array
  const includeErrors = validateRegistryInclude(registryName, reg['include'])
  errors.push(...includeErrors)

  // Validate description
  if (!reg['description'] || typeof reg['description'] !== 'string') {
    errors.push(`Registry '${registryName}' must have a valid description string`)
  }

  return errors
}

/**
 * Validate registry include configuration
 */
function validateRegistryInclude(registryName: string, include: unknown): string[] {
  const errors: string[] = []

  if (include !== undefined) {
    if (!Array.isArray(include)) {
      errors.push(`Registry '${registryName}' include must be an array of strings`)
    } else {
      for (const item of include as unknown[]) {
        if (typeof item !== 'string') {
          errors.push(`Registry '${registryName}' include array must contain only strings`)
          break
        }
      }
    }
  }

  return errors
}

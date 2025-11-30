import { join, dirname } from 'path'
import { Behavior, FileSystemService } from '@pair/content-ops'
import { isKBCached, ensureKBAvailable } from './kb-manager'

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

const knowledgePkgJson = 'packages/knowledge-hub/package.json'
const knowledgeNodeModulesPkgJson = 'node_modules/@pair/knowledge-hub/package.json'

function getPackageJsonPath(fsService: FileSystemService, currentDir: string): string | null {
  const checkExists = (path: string) => fsService.existsSync(path)
  const findCandidate = (path: string) =>
    checkExists(join(currentDir, path)) ? join(currentDir, path) : null
  const monorepoResult = findCandidate(knowledgePkgJson)
  if (monorepoResult) return monorepoResult

  const nodeModulesResult = findCandidate(knowledgeNodeModulesPkgJson)
  return nodeModulesResult
}

function findPackageJsonPath(fsService: FileSystemService, currentDir: string): string {
  const nodeModulesResult = getPackageJsonPath(fsService, currentDir)
  if (nodeModulesResult) {
    return nodeModulesResult
  }
  throw new Error(
    `Unable to find @pair/knowledge-hub package. Ensure the package is available in the workspace and installed.`,
  )
}

/**
 * Check if a directory contains a valid @pair/pair-cli package with bundle-cli
 */
function isValidManualPairCliPackage(
  fsService: FileSystemService,
  dirPath: string,
  diag: boolean,
): boolean {
  const candidatePath = join(dirPath, 'package.json')

  if (!fsService.existsSync(candidatePath)) {
    return false
  }

  try {
    const content = fsService.readFileSync(candidatePath)
    const pkg = JSON.parse(content)

    // Check if this is the @pair/pair-cli package
    if (pkg.name === '@pair/pair-cli') {
      // Also check if bundle-cli directory exists
      const bundleCliPath = join(dirPath, 'bundle-cli')
      if (fsService.existsSync(bundleCliPath)) {
        if (diag) {
          console.error(`[diag] Found @pair/pair-cli package with bundle-cli at: ${dirPath}`)
        }
        return true
      }
    }
  } catch {
    // Ignore parse errors, continue searching
  }

  return false
}

/**
 * Perform breadth-first search to find a directory containing a valid manual pair-cli package
 * Explores both parent directories and common subdirectories
 */
function breadthFirstSearchManualPackage(
  fsService: FileSystemService,
  startDir: string,
  diag: boolean,
): string | null {
  const queue: string[] = [startDir]
  const visited = new Set<string>()
  let depth = 0
  const maxDepth = 10

  while (queue.length > 0 && depth < maxDepth) {
    const levelSize = queue.length

    if (diag) {
      console.error(`[diag] BFS level ${depth}, checking ${levelSize} directories`)
    }

    // Process all directories at current level
    for (let i = 0; i < levelSize; i++) {
      const currentDir = queue.shift()!

      if (visited.has(currentDir)) {
        continue
      }
      visited.add(currentDir)

      if (diag) {
        console.error(`[diag] Checking directory: ${currentDir}`)
      }

      // Check if this directory contains the valid package
      if (isValidManualPairCliPackage(fsService, currentDir, diag)) {
        return currentDir
      }

      // Add parent and common subdirectories to queue
      addNextLevelDirectories(fsService, queue, visited, currentDir)
    }

    depth++
  }

  return null
}

/**
 * Add parent directory and common subdirectories to the BFS queue
 */
function addNextLevelDirectories(
  fsService: FileSystemService,
  queue: string[],
  visited: Set<string>,
  currentDir: string,
): void {
  // Common subdirectories where pair-cli might be installed
  const commonSubDirs = ['libs', 'tools', 'bin', 'cli', 'pair-cli']

  // Add parent directory to queue for next level
  const parentDir = dirname(currentDir)
  if (parentDir !== currentDir && !visited.has(parentDir)) {
    queue.push(parentDir)
  }

  // Add common subdirectories to queue for next level
  for (const subDir of commonSubDirs) {
    const subDirPath = join(currentDir, subDir)
    if (fsService.existsSync(subDirPath) && !visited.has(subDirPath)) {
      queue.push(subDirPath)
    }
  }
}

/**
 * Navigate up the directory tree to find a package.json with name "@pair/pair-cli"
 * that also has a bundle-cli directory using breadth-first search
 */
export function findManualPairCliPackage(
  fsService: FileSystemService,
  startDir: string,
): string | null {
  const diagEnv = process.env['PAIR_DIAG']
  const DIAG = diagEnv === '1' || diagEnv === 'true'

  const foundDir = breadthFirstSearchManualPackage(fsService, startDir, DIAG)

  if (foundDir) {
    return foundDir
  }

  if (DIAG) console.error(`[diag] No @pair/pair-cli package found with bundle-cli directory`)
  return null
}

/**
 * Check if there's an NPM-installed @foomakers/pair-cli package with bundle-cli directory
 * @param fsService - File system service
 * @param repoRoot - Repository root directory
 * @returns Path to the @foomakers/pair-cli package.json if found with bundle-cli, null otherwise
 */
export function findNpmReleasePackage(
  fsService: FileSystemService,
  repoRoot: string,
): string | null {
  const diagEnv = process.env['PAIR_DIAG']
  const DIAG = diagEnv === '1' || diagEnv === 'true'

  //const pairCliPath = join(repoRoot, 'node_modules', '@foomakers', 'pair-cli')
  const pairCliPath = repoRoot
  const packageJsonPath = join(pairCliPath, 'package.json')
  const bundleCliPath = join(pairCliPath, 'bundle-cli')

  if (DIAG) {
    logNpmPackageCheck(fsService, packageJsonPath, bundleCliPath)
  }

  // Check if both package.json and bundle-cli directory exist
  if (!fsService.existsSync(packageJsonPath) || !fsService.existsSync(bundleCliPath)) {
    if (DIAG)
      console.error(`[diag] NPM @foomakers/pair-cli package or bundle-cli directory not found`)
    return null
  }

  return validateNpmPackage(fsService, packageJsonPath, pairCliPath, DIAG)
}

/**
 * Log diagnostic information about NPM package check
 */
function logNpmPackageCheck(
  fsService: FileSystemService,
  packageJsonPath: string,
  bundleCliPath: string,
): void {
  console.error(
    `[diag] Checking NPM package at: ${packageJsonPath} exists=${fsService.existsSync(
      packageJsonPath,
    )}`,
  )
  console.error(
    `[diag] Checking bundle-cli at: ${bundleCliPath} exists=${fsService.existsSync(bundleCliPath)}`,
  )
}

/**
 * Validate that the package.json contains the correct @foomakers/pair-cli package
 */
function validateNpmPackage(
  fsService: FileSystemService,
  packageJsonPath: string,
  pairCliPath: string,
  diag: boolean,
): string | null {
  try {
    const content = fsService.readFileSync(packageJsonPath)
    const pkg = JSON.parse(content)
    const isValidPackage = pkg.name === '@foomakers/pair-cli'

    if (diag) {
      if (isValidPackage) {
        console.error(`[diag] Found valid NPM @foomakers/pair-cli package at: ${pairCliPath}`)
      } else {
        console.error(
          `[diag] Package at ${packageJsonPath} has name '${pkg.name}', expected '@foomakers/pair-cli'`,
        )
      }
    }

    return isValidPackage ? packageJsonPath.replace('/package.json', '') : null
  } catch (error) {
    if (diag)
      console.error(`[diag] Error reading/parsing package.json at ${packageJsonPath}: ${error}`)
    return null
  }
}

export function getKnowledgeHubDatasetPath(fsService: FileSystemService): string {
  const currentDir = fsService.rootModuleDirectory()
  const diagEnv = process.env['PAIR_DIAG']
  const DIAG = diagEnv === '1' || diagEnv === 'true'

  if (DIAG) console.error(`[diag] getKnowledgeHubDatasetPath currentDir=${currentDir}`)
  if (DIAG) console.error(`[diag] isInRelease=${isInRelease(fsService, currentDir)}`)

  if (isInRelease(fsService, currentDir)) {
    const npmPackage = findNpmReleasePackage(fsService, currentDir)

    if (npmPackage) {
      return join(npmPackage, 'bundle-cli', 'dataset')
    }
    const manualPackage = findManualPairCliPackage(fsService, currentDir)
    if (manualPackage) {
      return join(manualPackage, 'bundle-cli', 'dataset')
    }
    throw new Error(`Release bundle not found inside: ${currentDir}`)
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
 * Get knowledge hub dataset path with KB manager fallback
 * @param fsService File system service
 * @param version CLI version for KB download
 * @param isKBCachedFn Optional KB cache check function (for testing)
 * @param ensureKBAvailableFn Optional KB ensure function (for testing)
 * @returns Path to dataset directory
 */
/* eslint-disable complexity */
export async function getKnowledgeHubDatasetPathWithFallback(
  fsService: FileSystemService,
  version: string,
  isKBCachedFn: typeof isKBCached = isKBCached,
  ensureKBAvailableFn: typeof ensureKBAvailable = ensureKBAvailable,
  customUrl?: string,
): Promise<string> {
  const currentDir = fsService.rootModuleDirectory()
  const diagEnv = process.env['PAIR_DIAG']
  const DIAG = diagEnv === '1' || diagEnv === 'true'

  if (DIAG) console.error(`[diag] getKnowledgeHubDatasetPathWithFallback currentDir=${currentDir}`)

  // Try local dataset first
  try {
    const localDatasetPath = getKnowledgeHubDatasetPath(fsService)
    if (fsService.existsSync(localDatasetPath)) {
      if (DIAG) console.error(`[diag] Using local dataset: ${localDatasetPath}`)
      return localDatasetPath
    }
  } catch (err) {
    if (DIAG) console.error(`[diag] Local dataset not found: ${String(err)}`)
  }

  // Fallback to KB manager
  if (DIAG) console.error(`[diag] Checking KB cache for version ${version}`)
  const cached = await isKBCachedFn(version, fsService)

  if (!cached) {
    if (DIAG) console.error(`[diag] KB not cached, downloading...`)
  }

  const kbPath = await ensureKBAvailableFn(version, {
    fs: fsService,
    ...(customUrl && { customUrl }),
  })
  const datasetPath = join(kbPath, 'dataset')

  if (DIAG) console.error(`[diag] Using KB dataset: ${datasetPath}`)
  return datasetPath
}

/**
 * Load configuration with cascade override priority:
 * 1. Command line registry overrides (highest priority)
 * 2. Custom config file (--config option)
 * 3. pair.config in project root
 * 4. pair-cli config.json (lowest priority)
 */
export function loadConfigWithOverrides(
  fsService: FileSystemService,
  options: { customConfigPath?: string; projectRoot?: string } = {},
): { config: Config; source: string } {
  const { customConfigPath, projectRoot = fsService.rootModuleDirectory() } = options
  // Start with the base config (either local app config or pair-cli)
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

export function isInRelease(fsService: FileSystemService, currentDir: string): boolean {
  return getPackageJsonPath(fsService, currentDir) === null

  // // Robust detection: true when currentDir is the bundle-cli folder itself
  // // or when it contains the bundle-cli segment (with separators).
  // try {
  //   if (basename(currentDir) === 'bundle-cli') return true
  //   const needle = `${sep}bundle-cli${sep}`
  //   return currentDir.includes(needle)
  // } catch {
  //   return false
  // }
}

function baseConfigPath(currentDir: string) {
  return join(currentDir, 'config.json')
}

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

export const calculatePathType = async (fsService: FileSystemService, path: string) => {
  const stat = await fsService.stat(path)
  return stat.isDirectory() ? 'dir' : 'file'
}

export function calculatePaths(
  fsService: FileSystemService,
  datasetRoot: string,
  absTarget: string,
  source?: string,
) {
  const fullSourcePath = fsService.resolve(datasetRoot, source || '.')
  const cwd = fsService.currentWorkingDirectory()

  const fullTargetPath = fsService.resolve(cwd, absTarget)

  const effectiveMonorepoRoot = fsService.currentWorkingDirectory()
  const canUseRelativePaths =
    fullSourcePath.startsWith(effectiveMonorepoRoot) &&
    fullTargetPath.startsWith(effectiveMonorepoRoot)
  const relativeSourcePath = canUseRelativePaths
    ? fullSourcePath.replace(effectiveMonorepoRoot + '/', '')
    : undefined
  const relativeTargetPath = canUseRelativePaths
    ? fullTargetPath.replace(effectiveMonorepoRoot + '/', '')
    : undefined

  return {
    fullSourcePath,
    cwd,
    monorepoRoot: effectiveMonorepoRoot,
    relativeSourcePath,
    fullTargetPath,
    relativeTargetPath,
  }
}

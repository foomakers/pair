import { join, dirname } from 'path'
import {
  Behavior,
  FileSystemService,
  HttpClientService,
  NodeHttpClientService,
} from '@pair/content-ops'
import { isKBCached, ensureKBAvailable } from './kb-manager'

import {
  isInRelease,
  findNpmReleasePackage,
  findManualPairCliPackage,
  findPackageJsonPath,
} from './env-utils'

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

async function tryLocalDatasetPath(
  fsService: FileSystemService,
  DIAG: boolean,
): Promise<string | null> {
  try {
    const localDatasetPath = getKnowledgeHubDatasetPath(fsService)
    if (fsService.existsSync(localDatasetPath)) {
      if (DIAG) console.error(`[diag] Using local dataset: ${localDatasetPath}`)
      return localDatasetPath
    }
  } catch (err) {
    if (DIAG) console.error(`[diag] Local dataset not found: ${String(err)}`)
  }
  return null
}

async function downloadKBIfNeeded(options: {
  version: string
  fsService: FileSystemService
  httpClient: HttpClientService
  customUrl?: string
  isKBCachedFn: typeof isKBCached
  ensureKBAvailableFn: typeof ensureKBAvailable
  DIAG: boolean
}): Promise<string> {
  const { version, fsService, httpClient, customUrl, isKBCachedFn, ensureKBAvailableFn, DIAG } =
    options

  if (DIAG) console.error(`[diag] Checking KB cache for version ${version}`)
  const cached = await isKBCachedFn(version, fsService)

  if (!cached && DIAG) {
    console.error(`[diag] KB not cached, downloading...`)
  }

  const kbPath = await ensureKBAvailableFn(version, {
    httpClient,
    fs: fsService,
    ...(customUrl && { customUrl }),
  })
  return join(kbPath, 'dataset')
}

export async function getKnowledgeHubDatasetPathWithFallback(options: {
  fsService: FileSystemService
  httpClient?: HttpClientService
  version: string
  isKBCachedFn?: typeof isKBCached
  ensureKBAvailableFn?: typeof ensureKBAvailable
  customUrl?: string
}): Promise<string> {
  const {
    fsService,
    httpClient = new NodeHttpClientService(),
    version,
    isKBCachedFn = isKBCached,
    ensureKBAvailableFn = ensureKBAvailable,
    customUrl,
  } = options
  const currentDir = fsService.rootModuleDirectory()
  const diagEnv = process.env['PAIR_DIAG']
  const DIAG = diagEnv === '1' || diagEnv === 'true'

  if (DIAG) console.error(`[diag] getKnowledgeHubDatasetPathWithFallback currentDir=${currentDir}`)

  const localPath = await tryLocalDatasetPath(fsService, DIAG)
  if (localPath) return localPath

  const datasetPath = await downloadKBIfNeeded({
    version,
    fsService,
    httpClient,
    ...(customUrl !== undefined && { customUrl }),
    isKBCachedFn,
    ensureKBAvailableFn,
    DIAG,
  })
  if (DIAG) console.error(`[diag] Using KB dataset: ${datasetPath}`)
  return datasetPath
}

export function loadConfigWithOverrides(
  fsService: FileSystemService,
  options: { customConfigPath?: string; projectRoot?: string } = {},
): { config: Config; source: string } {
  const { customConfigPath, projectRoot = fsService.rootModuleDirectory() } = options
  let { config, source } = loadBaseConfig(fsService)
  const pairApplied = applyPairConfigIfExists(fsService, config, projectRoot)
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
      merged[key] = overrideConfig[key]
    }
  })

  return merged
}

export function validateConfig(config: unknown): { valid: boolean; errors: string[] } {
  const errors: string[] = []
  const basicValidation = validateBasicConfigStructure(config)
  if (!basicValidation.valid) {
    return basicValidation
  }

  const configObj = config as Record<string, unknown>
  const registries = configObj['asset_registries'] as Record<string, unknown>

  for (const [registryName, registry] of Object.entries(registries)) {
    const registryErrors = validateSingleRegistry(registryName, registry)
    errors.push(...registryErrors)
  }

  return { valid: errors.length === 0, errors }
}

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

function validateSingleRegistry(registryName: string, registry: unknown): string[] {
  const errors: string[] = []

  if (!registry || typeof registry !== 'object') {
    errors.push(`Registry '${registryName}' must be a valid object`)
    return errors
  }

  const reg = registry as Record<string, unknown>
  const validBehaviors: Behavior[] = ['overwrite', 'add', 'mirror', 'skip']

  if (!reg['behavior'] || !validBehaviors.includes(reg['behavior'] as Behavior)) {
    errors.push(
      `Registry '${registryName}' has invalid behavior '${
        reg['behavior']
      }'. Must be one of: ${validBehaviors.join(', ')}`,
    )
  }

  if (!reg['target_path'] || typeof reg['target_path'] !== 'string') {
    errors.push(`Registry '${registryName}' must have a valid target_path string`)
  }

  const includeErrors = validateRegistryInclude(registryName, reg['include'])
  errors.push(...includeErrors)

  if (!reg['description'] || typeof reg['description'] !== 'string') {
    errors.push(`Registry '${registryName}' must have a valid description string`)
  }

  return errors
}

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

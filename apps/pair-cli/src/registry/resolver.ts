import {
  FileSystemService,
  Behavior,
  HttpClientService,
  NodeHttpClientService,
} from '@pair/content-ops'
import { join, dirname } from 'path'
import {
  isInRelease,
  findNpmReleasePackage,
  findManualPairCliPackage,
  findPackageJsonPath,
} from '../env-utils'
import { isKBCached, ensureKBAvailable } from '../kb-manager'

/**
 * Unified configuration for an individual asset registry.
 */
export interface RegistryConfig {
  source?: string
  behavior: Behavior
  target_path: string
  description: string
  include?: string[]
}

/**
 * The root CLI configuration structure.
 */
export interface Config {
  asset_registries: Record<string, RegistryConfig>
  default_target_folders?: Record<string, string>
  folders_to_include?: Record<string, string[]>
  [key: string]: unknown
}

/**
 * Extracts and normalizes asset registries from a configuration object.
 * Supports both 'asset_registries' and legacy 'dataset_registries' fields.
 */
export function extractRegistries(config: unknown): Record<string, RegistryConfig> {
  const cfg = config as Config
  const registries =
    cfg?.asset_registries || (config as Record<string, unknown>)?.['dataset_registries'] || {}
  return registries as Record<string, RegistryConfig>
}

/**
 * Calculates the final target path for a registry.
 * Uses the registry's target_path if defined, otherwise falls back to the registry name.
 */
export function resolveTarget(
  name: string,
  config: RegistryConfig,
  fs: FileSystemService,
  baseTarget?: string,
): string {
  const relativePath = config.target_path || name
  return baseTarget ? fs.resolve(baseTarget, relativePath) : fs.resolve(relativePath)
}

/**
 * Resolves both source and target absolute paths for a registry.
 */
export function resolveRegistryPaths(params: {
  name: string
  config: RegistryConfig
  datasetRoot: string
  fs: FileSystemService
  baseTarget?: string
}): { source: string; target: string } {
  const { name, config, datasetRoot, fs, baseTarget } = params

  // Source is always relative to the dataset root
  const source = fs.resolve(datasetRoot, name)
  const target = resolveTarget(name, config, fs, baseTarget)

  return { source, target }
}

/**
 * Specialized iterator to process all registries with an async handler.
 */
export async function forEachRegistry<T>(
  registries: Record<string, RegistryConfig>,
  handler: (name: string, config: RegistryConfig, index: number) => Promise<T>,
): Promise<T[]> {
  const results: T[] = []
  const entries = Object.entries(registries)

  for (let i = 0; i < entries.length; i++) {
    const entry = entries[i]
    if (entry) {
      const [name, config] = entry
      results.push(await handler(name, config, i))
    }
  }

  return results
}

/**
 * Resolves the absolute path to the knowledge hub dataset directory.
 */
export function getKnowledgeHubDatasetPath(fsService: FileSystemService): string {
  const currentDir = fsService.rootModuleDirectory()
  const DIAGONAL_ENV = process.env['PAIR_DIAG']
  const DIAG = DIAGONAL_ENV === '1' || DIAGONAL_ENV === 'true'

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
  customUrl?: string | undefined
  isKBCachedFn?: typeof isKBCached
  ensureKBAvailableFn?: typeof ensureKBAvailable
  DIAG: boolean
}): Promise<string> {
  const {
    version,
    fsService,
    httpClient,
    customUrl,
    DIAG,
    isKBCachedFn = isKBCached,
    ensureKBAvailableFn = ensureKBAvailable,
  } = options

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

/**
 * Resolves the KB dataset path with automatic fallback to remote download if not found locally.
 */
export async function getKnowledgeHubDatasetPathWithFallback(options: {
  fsService: FileSystemService
  httpClient?: HttpClientService
  version: string
  customUrl?: string
  isKBCachedFn?: typeof isKBCached
  ensureKBAvailableFn?: typeof ensureKBAvailable
}): Promise<string> {
  const {
    fsService,
    httpClient = new NodeHttpClientService(),
    version,
    customUrl,
    isKBCachedFn = isKBCached,
    ensureKBAvailableFn = ensureKBAvailable,
  } = options
  const diagEnv = process.env['PAIR_DIAG']
  const DIAG = diagEnv === '1' || diagEnv === 'true'

  const localPath = await tryLocalDatasetPath(fsService, DIAG)
  if (localPath) return localPath

  return downloadKBIfNeeded({
    version,
    fsService,
    httpClient,
    customUrl,
    isKBCachedFn,
    ensureKBAvailableFn,
    DIAG,
  })
}

import { join, dirname, resolve } from 'path'
import { FileSystemService, HttpClientService, validateKBStructure } from '@pair/content-ops'
import {
  isInRelease,
  findNpmReleasePackage,
  findManualPairCliPackage,
  findPackageJsonPath,
} from './discovery'
import { isKBCached, ensureKBAvailable } from '#kb-manager'
import { installKBFromLocalZip } from '#kb-manager/kb-installer'
import { isDiagEnabled } from '#diagnostics'

/**
 * Resolves the absolute path to the knowledge hub dataset directory.
 */
export function getKnowledgeHubDatasetPath(fsService: FileSystemService): string {
  const currentDir = fsService.rootModuleDirectory()
  const DIAG = isDiagEnabled()

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
  httpClient: HttpClientService
  version: string
  customUrl?: string
  isKBCachedFn?: typeof isKBCached
  ensureKBAvailableFn?: typeof ensureKBAvailable
}): Promise<string> {
  const {
    fsService,
    httpClient,
    version,
    customUrl,
    isKBCachedFn = isKBCached,
    ensureKBAvailableFn = ensureKBAvailable,
  } = options
  const DIAG = isDiagEnabled()

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

/** Config shape accepted by resolveDatasetRoot — union of install/update config fields. */
export type DatasetResolvableConfig =
  | { resolution: 'default' }
  | { resolution: 'remote'; url: string }
  | { resolution: 'local'; path: string }

/** Options accepted by resolveDatasetRoot. */
export interface DatasetResolveOptions {
  cliVersion?: string | undefined
  httpClient?: HttpClientService | undefined
  progressWriter?: { write(s: string): void } | undefined
  isTTY?: boolean | undefined
}

async function resolveLocalDataset(
  fs: FileSystemService,
  path: string,
  version: string,
): Promise<string> {
  const resolved = resolve(fs.currentWorkingDirectory(), path)
  if (path.endsWith('.zip')) {
    return installKBFromLocalZip(version, resolved, fs)
  }
  if (!fs.existsSync(resolved)) {
    throw new Error(`KB source path not found: ${resolved}`)
  }
  const valid = await validateKBStructure(resolved, fs)
  if (!valid) {
    throw new Error(`Invalid KB structure at: ${resolved}`)
  }
  return resolved
}

/**
 * Resolves the dataset root path based on a command config's resolution strategy.
 * Supports default (local monorepo), remote (download with fallback), and local (directory or .zip).
 */
export async function resolveDatasetRoot(
  fs: FileSystemService,
  config: DatasetResolvableConfig,
  options?: DatasetResolveOptions,
): Promise<string> {
  const version = options?.cliVersion || '0.0.0'

  switch (config.resolution) {
    case 'default':
      return getKnowledgeHubDatasetPath(fs)

    case 'remote': {
      if (!options?.httpClient) {
        throw new Error('Remote resolution requires httpClient')
      }
      return getKnowledgeHubDatasetPathWithFallback({
        fsService: fs,
        httpClient: options.httpClient,
        version,
        customUrl: config.url,
      })
    }

    case 'local':
      return resolveLocalDataset(fs, config.path, version)
  }
}

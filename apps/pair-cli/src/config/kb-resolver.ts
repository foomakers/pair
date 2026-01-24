import { join, dirname } from 'path'
import { FileSystemService, HttpClientService, NodeHttpClientService } from '@pair/content-ops'
import {
  isInRelease,
  findNpmReleasePackage,
  findManualPairCliPackage,
  findPackageJsonPath,
} from './discovery'
import { isKBCached, ensureKBAvailable } from '#kb-manager'
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

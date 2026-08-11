import { join, dirname } from 'path'
import { FileSystemService, HttpClientService, validateKBStructure } from '@pair/content-ops'
import { findPackageJsonPath } from './discovery'
import {
  isKBCached,
  ensureKBAvailable,
  installKBFromGit,
  installKBFromLocalZip,
  localKBSource,
} from '#kb-manager'
import { isDiagEnabled } from '#diagnostics'

/**
 * Resolves the absolute path to the knowledge hub dataset directory.
 */
export function getKnowledgeHubDatasetPath(fsService: FileSystemService): string {
  const currentDir = fsService.rootModuleDirectory()
  const DIAG = isDiagEnabled()

  if (DIAG) console.error(`[diag] getKnowledgeHubDatasetPath currentDir=${currentDir}`)

  // In monorepo/development, find via node_modules or monorepo packages.
  // In release context this throws, tryMonorepoDatasetPath catches → download kicks in.
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

async function tryMonorepoDatasetPath(
  fsService: FileSystemService,
  DIAG: boolean,
): Promise<string | null> {
  try {
    const localDatasetPath = getKnowledgeHubDatasetPath(fsService)
    if (fsService.existsSync(localDatasetPath)) {
      if (DIAG) console.error(`[diag] Using monorepo dataset: ${localDatasetPath}`)
      return localDatasetPath
    }
  } catch (err) {
    if (DIAG) console.error(`[diag] Monorepo dataset not found: ${String(err)}`)
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
  return kbPath
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

  const localPath = await tryMonorepoDatasetPath(fsService, DIAG)
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
  | { resolution: 'default'; skipVerify?: boolean }
  | { resolution: 'remote'; url: string; skipVerify?: boolean }
  | { resolution: 'git'; url: string }
  | { resolution: 'local'; path: string; skipVerify?: boolean }

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
  skipVerify = false,
): Promise<string> {
  // ZIP-vs-directory is classified in ONE place (`localKBSource`), so this dispatch and
  // the cache slot the installer writes can never disagree — `KB.ZIP` included (US-395).
  // A ZIP is extracted into its own cache slot; a DIRECTORY is used IN PLACE — no copy,
  // no slot, so edits to it are picked up by the next install.
  const source = localKBSource(path, fs)
  const resolved = source.path
  if (source.kind === 'zip') {
    return installKBFromLocalZip(version, resolved, fs, skipVerify)
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

async function resolveDefaultDataset(
  fs: FileSystemService,
  version: string,
  httpClient?: HttpClientService,
): Promise<string> {
  if (httpClient) {
    return getKnowledgeHubDatasetPathWithFallback({
      fsService: fs,
      httpClient,
      version,
    })
  }
  const localPath = await tryMonorepoDatasetPath(fs, isDiagEnabled())
  if (localPath) return localPath
  throw new Error(
    'Knowledge base dataset not found locally and no network client available. ' +
      'Use --source <path> to provide a local KB directory or .zip file.',
  )
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
      return resolveDefaultDataset(fs, version, options?.httpClient)

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

    case 'git':
      // Pure dispatch: the git slot's lifecycle lives in kb-manager, with every other
      // source form's (US-395 review round 2).
      return installKBFromGit(config.url, fs)

    case 'local':
      return resolveLocalDataset(fs, config.path, version, config.skipVerify)
  }
}

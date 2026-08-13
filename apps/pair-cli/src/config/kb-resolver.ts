import { join, dirname } from 'path'
import { FileSystemService, HttpClientService, validateKBStructure } from '@pair/content-ops'
import { findPackageJsonPath } from './discovery'
import {
  cachedOfficialKBPath,
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

  // Probed ONLY under PAIR_DIAG: the answer feeds a `[diag]` line and nothing else —
  // `ensureKBAvailable` inspects the slot itself and is called either way. Unconditionally
  // it costs two existsSync + readFile + JSON.parse on the hot path of every command that
  // reaches the fallback resolver, in exchange for no behaviour.
  if (DIAG) {
    console.error(`[diag] Checking KB cache for version ${version}`)
    if (!(await isKBCachedFn(version, fsService))) {
      console.error(`[diag] KB not cached, downloading...`)
    }
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

  // The monorepo shortcut is the fallback for the DEFAULT source only. An explicit
  // `--url` names a source, and a named source always reaches identity resolution (AC4):
  // resolving it to the local monorepo dataset would ignore what the user typed with no
  // warning — the same class of surprise as the slot contamination this story fixes, and
  // the reason the `--url` path used to be exercisable only in a released binary
  // (`--source` and `--git` are honoured in a checkout; this one was the odd one out).
  if (!customUrl) {
    const localPath = await tryMonorepoDatasetPath(fsService, DIAG)
    if (localPath) return localPath
  }

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
  /**
   * `false` when the caller passed `--no-kb`. The pre-flight already honours the flag, but it is
   * only ONE of the two readers: the command path resolves its dataset independently through
   * `resolveDatasetRoot`, so without this the flag skipped the warm fetch and the command
   * downloaded anyway — the flag's help text, the CLI reference and the ADL all promise a skip.
   */
  kb?: boolean | undefined
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
  kb?: boolean,
): Promise<string> {
  // `--no-kb` means "use what is already here", not "download quietly". Resolve from the
  // bundled dataset or an already-populated cache slot, and if neither exists say so with the
  // two ways out — rather than fetching the KB the user just refused.
  if (kb === false) {
    const bundled = await tryMonorepoDatasetPath(fs, isDiagEnabled())
    if (bundled) return bundled
    const cached = await cachedOfficialKBPath(version, fs)
    if (cached) return cached
    throw new Error(
      `--no-kb was passed, so no KB was downloaded, and none is available locally ` +
        `(no dataset bundled with the CLI, and no cached KB for version ${version}). ` +
        `Either drop --no-kb to fetch it, or name a local KB with --source <path>.`,
    )
  }

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
  const httpClient = options?.httpClient
  const kb = options?.kb

  switch (config.resolution) {
    case 'default':
      return resolveDefaultDataset(fs, version, httpClient, kb)

    case 'remote': {
      if (!httpClient) {
        throw new Error('Remote resolution requires httpClient')
      }
      return getKnowledgeHubDatasetPathWithFallback({
        fsService: fs,
        httpClient,
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

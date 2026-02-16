import type { FileSystemService, HttpClientService, RetryOptions } from '@pair/content-ops'
import { detectSourceType, SourceType } from '@pair/content-ops'
import { join } from 'path'
import { type ProgressWriter } from '@pair/content-ops/http'
import cacheManager from './cache-manager'
import urlUtils from './url-utils'
import {
  installKB,
  installKBFromLocalDirectory,
  installKBFromLocalZip,
  type InstallerDeps,
} from './kb-installer'

export interface KBManagerDeps {
  httpClient: HttpClientService
  fs: FileSystemService
  progressWriter?: ProgressWriter
  isTTY?: boolean
  customUrl?: string
  retryOptions?: RetryOptions
  skipVerify?: boolean
}

// Internal: use cacheManager directly. Public re-exports live in the kb-manager index.
const getCachedKBPath = cacheManager.getCachedKBPath
const isKBCached = cacheManager.isKBCached

function buildInstallerDeps(deps: KBManagerDeps): InstallerDeps {
  const result: InstallerDeps = {
    httpClient: deps.httpClient,
  }
  if (deps.progressWriter) result.progressWriter = deps.progressWriter
  if (typeof deps.isTTY !== 'undefined') result.isTTY = deps.isTTY

  return result
}

export async function ensureKBAvailable(version: string, deps: KBManagerDeps): Promise<string> {
  const fs = deps.fs
  const cachePath = getCachedKBPath(version)
  const cached = await isKBCached(version, fs)

  if (cached) {
    // Prefer returning dataset root when .pair exists so callers can resolve
    // registry paths like `dataset`/`knowledge` correctly.
    const datasetRoot = fs.existsSync(join(cachePath, '.pair'))
      ? join(cachePath, '.pair')
      : cachePath
    return datasetRoot
  }

  const sourceUrl = deps.customUrl || urlUtils.buildGithubReleaseUrl(version)
  const installerDeps = buildInstallerDeps(deps)

  // Check if source is a local path instead of a remote URL
  const sourceType = detectSourceType(sourceUrl, fs)
  if (sourceType !== SourceType.REMOTE_URL) {
    if (sourceUrl.endsWith('.zip')) {
      // Local ZIP file
      return await installKBFromLocalZip(version, sourceUrl, fs, deps.skipVerify)
    } else {
      // Local directory
      return await installKBFromLocalDirectory(version, sourceUrl, fs)
    }
  }

  // Remote URL - use standard download
  return installKB(version, cachePath, sourceUrl, {
    fs,
    ...installerDeps,
    ...(deps.retryOptions ? { retryOptions: deps.retryOptions } : {}),
  })
}

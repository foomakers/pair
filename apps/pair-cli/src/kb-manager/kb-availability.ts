import type { FileSystemService, HttpClientService, RetryOptions } from '@pair/content-ops'
import { detectSourceType, SourceType } from '@pair/content-ops'

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

  if (!deps.customUrl) {
    const cached = await isKBCached(version, fs)
    if (cached) {
      return cachePath
    }
  }

  const hadCache = deps.customUrl ? await cacheManager.backupCachedKB(version, fs) : false

  try {
    const result = await installFromSource(version, cachePath, deps)
    if (hadCache) await cacheManager.removeBackupKB(version, fs)
    return result
  } catch (err) {
    if (hadCache) await cacheManager.restoreCachedKB(version, fs)
    throw err
  }
}

async function installFromSource(
  version: string,
  cachePath: string,
  deps: KBManagerDeps,
): Promise<string> {
  const sourceUrl = deps.customUrl || urlUtils.buildGithubReleaseUrl(version)
  const installerDeps = buildInstallerDeps(deps)
  const fs = deps.fs

  // Check if source is a local path instead of a remote URL
  const sourceType = detectSourceType(sourceUrl, fs)
  if (sourceType !== SourceType.REMOTE_URL) {
    if (sourceUrl.endsWith('.zip')) {
      return installKBFromLocalZip(version, sourceUrl, fs, deps.skipVerify)
    }
    return installKBFromLocalDirectory(version, sourceUrl, fs)
  }

  // Remote URL - use standard download
  return installKB(version, cachePath, sourceUrl, {
    fs,
    ...installerDeps,
    ...(deps.retryOptions ? { retryOptions: deps.retryOptions } : {}),
  })
}

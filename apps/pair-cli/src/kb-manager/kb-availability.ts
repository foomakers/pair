import type { FileSystemService, HttpClientService, RetryOptions } from '@pair/content-ops'
import { detectSourceType, logger as log, SourceType } from '@pair/content-ops'

import { type ProgressWriter } from '@pair/content-ops/http'
import cacheManager, { type KBSource } from './cache-manager'
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

/**
 * Identity of the KB this call installs — the official KB when no `customUrl` is given,
 * otherwise the custom source itself. The slot follows the identity, so an external
 * source can never occupy the official KB's slot (US-395).
 */
function resolveSource(version: string, deps: KBManagerDeps): KBSource {
  const sourceUrl = deps.customUrl
  if (!sourceUrl) return cacheManager.officialSource(version)
  if (detectSourceType(sourceUrl, deps.fs) === SourceType.REMOTE_URL) {
    return { kind: 'remote', url: sourceUrl }
  }
  return cacheManager.localKBSource(sourceUrl, deps.fs)
}

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
  const source = resolveSource(version, deps)
  const cachePath = cacheManager.getSourceCachePath(source)

  if (!deps.customUrl) {
    const state = await cacheManager.inspectSlot(source, fs)
    if (state.status === 'ready') return cachePath
    if (state.status === 'contaminated') {
      // AC5: a slot polluted by an earlier `--source` install is never served — it is
      // discarded and re-fetched, so users self-heal without knowing ~/.pair/kb exists.
      log.warn(
        `Cached KB at ${cachePath} belongs to "${state.found}", not "${state.expected}" — discarding it and re-downloading.`,
      )
      await cacheManager.purgeSlot(source, fs)
    }
  }

  const hadCache = deps.customUrl ? await cacheManager.backupCachedKB(source, fs) : false

  try {
    const result = await installFromSource(version, cachePath, deps)
    if (hadCache) await cacheManager.removeBackupKB(source, fs)
    return result
  } catch (err) {
    if (hadCache) await cacheManager.restoreCachedKB(source, fs)
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

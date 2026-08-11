import type { FileSystemService, HttpClientService, RetryOptions } from '@pair/content-ops'
import { detectSourceType, logger as log, SourceType } from '@pair/content-ops'

import { type ProgressWriter } from '@pair/content-ops/http'
import cacheManager from './cache-manager'
import { getSourceCachePath, localKBSource, officialSource, type KBSource } from './cache-slot-key'
import urlUtils from './url-utils'
import { installKB, installKBFromLocalZip, type InstallerDeps } from './kb-installer'

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
 *
 * A local ZIP is accepted (its slot is its resolved path); a local DIRECTORY is not, and
 * that is a real boundary rather than a missing case: a directory source is read in place
 * by `resolveDatasetRoot`, never fetched into a slot, so there is nothing here to make
 * "available". Rejecting it keeps the two layers from disagreeing silently.
 */
function resolveSource(version: string, deps: KBManagerDeps): KBSource {
  const sourceUrl = deps.customUrl
  if (!sourceUrl) return officialSource(version)
  if (detectSourceType(sourceUrl, deps.fs) === SourceType.REMOTE_URL) {
    return { kind: 'remote', url: sourceUrl }
  }
  const local = localKBSource(sourceUrl, deps.fs)
  if (local.kind === 'directory') {
    throw new Error(
      `A local KB directory is used in place, not cached: ${local.path}. ` +
        'Resolve it with resolveDatasetRoot({ resolution: "local" }) instead of ensureKBAvailable.',
    )
  }
  return local
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
  const cachePath = getSourceCachePath(source)

  if (!deps.customUrl) {
    const state = await cacheManager.inspectSlot(source, fs)
    if (state.status === 'ready') return cachePath
    if (state.status === 'contaminated') {
      // AC5: a slot polluted by an earlier `--source` install is never served — it is
      // replaced and re-fetched, so users self-heal without knowing the cache exists.
      log.warn(
        `Cached KB at ${cachePath} belongs to "${state.found}", not "${state.expected}" — discarding it and re-downloading.`,
      )
    }
  }

  // The slot is set ASIDE, never deleted, before it is rewritten — for a contaminated
  // official slot as much as for a custom source. A failing re-fetch (offline, 5xx, proxy)
  // must leave the user with the cache they had, not with no cache at all.
  const hadCache = await cacheManager.backupCachedKB(source, fs)

  try {
    const result = await installFromSource(version, source, cachePath, deps)
    if (hadCache) await cacheManager.removeBackupKB(source, fs)
    return result
  } catch (err) {
    if (hadCache) await cacheManager.restoreCachedKB(source, fs)
    throw err
  }
}

async function installFromSource(
  version: string,
  source: KBSource,
  cachePath: string,
  deps: KBManagerDeps,
): Promise<string> {
  const installerDeps = buildInstallerDeps(deps)
  const fs = deps.fs

  // Dispatch on the ALREADY-RESOLVED identity, never on a second look at the raw string:
  // the slot a source owns and the installer it is routed to must agree (US-395).
  if (source.kind === 'zip') return installKBFromLocalZip(version, source.path, fs, deps.skipVerify)

  const downloadUrl =
    source.kind === 'remote' ? source.url : urlUtils.buildGithubReleaseUrl(version)
  return installKB(version, cachePath, downloadUrl, {
    fs,
    ...installerDeps,
    ...(deps.retryOptions ? { retryOptions: deps.retryOptions } : {}),
  })
}

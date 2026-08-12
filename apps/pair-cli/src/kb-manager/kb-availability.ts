import type { FileSystemService, HttpClientService, RetryOptions } from '@pair/content-ops'
import { detectSourceType, logger as log, SourceType } from '@pair/content-ops'

import { type ProgressWriter } from '@pair/content-ops/http'
import cacheManager from './cache-manager'
import { getSourceCachePath, localKBSource, officialSource, type KBSource } from './cache-slot-key'
import urlUtils from './url-utils'
import {
  installKB,
  installKBFromGit,
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
        'Pass it as `--source <dir>` rather than `--url`.',
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

  let result: string
  try {
    result = await installFromSource(version, source, cachePath, deps)
  } catch (err) {
    // The restore is a cleanup, and a cleanup must not replace the diagnosis it follows:
    // an EBUSY/EPERM here would surface instead of "Network error downloading KB… check
    // connectivity" or the 404 carrying the manual-download URL, and the user would lose
    // the only actionable message they had. The ORIGINAL error is always the one rethrown.
    if (hadCache) await cacheManager.restoreCachedKB(source, fs)
    throw err
  }

  // OUTSIDE the try on purpose: the catch RESTORES the backup, so a cleanup failure inside
  // it would delete the KB just installed correctly and reinstate the previous slot — the
  // contaminated one, in the AC5 self-heal above. (`removeBackupKB` is best-effort too;
  // this is the structural half of the same invariant.)
  if (hadCache) await cacheManager.removeBackupKB(source, fs)
  return result
}

async function installFromSource(
  version: string,
  source: KBSource,
  cachePath: string,
  deps: KBManagerDeps,
): Promise<string> {
  const installerDeps = buildInstallerDeps(deps)
  const fs = deps.fs

  const download = (downloadUrl: string): Promise<string> =>
    installKB(version, cachePath, downloadUrl, {
      fs,
      ...installerDeps,
      ...(deps.retryOptions ? { retryOptions: deps.retryOptions } : {}),
    })

  // Dispatch on the ALREADY-RESOLVED identity, never on a second look at the raw string:
  // the slot a source owns and the installer it is routed to must agree (US-395). The
  // switch is EXHAUSTIVE and the `never` default is the point of it — the earlier
  // "zip, else download" shape sent any future `KBSource` kind to the OFFICIAL KB's
  // release zip, written into that source's slot: a cross-source write with no signal.
  switch (source.kind) {
    case 'zip':
      return installKBFromLocalZip(version, source.path, fs, deps.skipVerify)
    case 'remote':
      return download(source.url)
    case 'official':
      return download(urlUtils.buildGithubReleaseUrl(version))
    case 'git':
      return installKBFromGit(source.url, fs)
    default: {
      const unreachable: never = source
      throw new Error(`Unhandled KB source kind: ${JSON.stringify(unreachable)}`)
    }
  }
}

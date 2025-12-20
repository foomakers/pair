import type { FileSystemService } from '@pair/content-ops'
import { fileSystemService, detectSourceType, SourceType } from '@pair/content-ops'
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
  fs: FileSystemService
  extract?: (zipPath: string, targetPath: string) => Promise<void>
  progressWriter?: ProgressWriter
  isTTY?: boolean
  customUrl?: string
}

// Internal: use cacheManager directly. Public re-exports live in the kb-manager index.
const getCachedKBPath = cacheManager.getCachedKBPath
const isKBCached = cacheManager.isKBCached

function buildInstallerDeps(deps?: KBManagerDeps): InstallerDeps | undefined {
  if (!deps) return undefined

  const result: InstallerDeps = {}
  if (deps.extract) result.extract = deps.extract
  if (deps.progressWriter) result.progressWriter = deps.progressWriter
  if (typeof deps.isTTY !== 'undefined') result.isTTY = deps.isTTY

  if (Object.keys(result).length === 0) return undefined
  return result
}

export async function ensureKBAvailable(version: string, deps?: KBManagerDeps): Promise<string> {
  const fs = deps?.fs || fileSystemService
  const cachePath = getCachedKBPath(version)
  const cached = await isKBCached(version, fs)

  if (cached) return cachePath

  const sourceUrl = deps?.customUrl || urlUtils.buildGithubReleaseUrl(version)
  const installerDeps = buildInstallerDeps(deps)

  // Check if source is a local path instead of a remote URL
  const sourceType = detectSourceType(sourceUrl)
  if (sourceType !== SourceType.REMOTE_URL) {
    if (sourceUrl.endsWith('.zip')) {
      // Local ZIP file
      await installKBFromLocalZip(version, sourceUrl, fs)
    } else {
      // Local directory
      await installKBFromLocalDirectory(version, sourceUrl, fs)
    }
    return cachePath
  }

  // Remote URL - use standard download
  return installKB(version, cachePath, sourceUrl, { fs, ...installerDeps })
}

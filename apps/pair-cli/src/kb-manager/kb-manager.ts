import type { FileSystemService } from '@pair/content-ops'
import { type ProgressWriter } from './progress-reporter'
import cacheManager from './cache-manager'
import urlUtils from './url-utils'
import { installKB, type InstallerDeps } from './kb-installer'

export interface KBManagerDeps {
  fs?: FileSystemService
  extract?: (zipPath: string, targetPath: string) => Promise<void>
  progressWriter?: ProgressWriter
  isTTY?: boolean
  customUrl?: string
}

/**
 * Get the cache path for a specific KB version
 * @param version Version string (with or without leading 'v')
 * @returns Absolute path to KB cache directory
 */
export const getCachedKBPath = cacheManager.getCachedKBPath
export const isKBCached = cacheManager.isKBCached

/**
 * Ensure KB is available, downloading if necessary
 * @param version Version string
 * @param deps Optional dependencies (fs, extract) for testing
 * @returns Path to KB cache directory
 */
function buildInstallerDeps(deps?: KBManagerDeps): InstallerDeps | undefined {
  if (!deps) return undefined

  const result: InstallerDeps = {}
  if (deps.fs) result.fs = deps.fs
  if (deps.extract) result.extract = deps.extract
  if (deps.progressWriter) result.progressWriter = deps.progressWriter
  if (typeof deps.isTTY !== 'undefined') result.isTTY = deps.isTTY

  // If no installer-specific deps were provided, return undefined to allow
  // callers to rely on defaults and keep the installKB signature simple.
  if (Object.keys(result).length === 0) return undefined
  return result
}

export async function ensureKBAvailable(version: string, deps?: KBManagerDeps): Promise<string> {
  const cachePath = getCachedKBPath(version)
  const cached = await isKBCached(version, deps?.fs)

  if (cached) return cachePath

  const downloadUrl = deps?.customUrl || urlUtils.buildGithubReleaseUrl(version)
  const installerDeps = buildInstallerDeps(deps)

  return installKB(version, cachePath, downloadUrl, installerDeps)
}

import type { FileSystemService } from '@pair/content-ops'
import { fileSystemService } from '@pair/content-ops'
import { type ProgressWriter } from './progress-reporter'
import cacheManager from './cache-manager'
import urlUtils from './url-utils'
import { installKB, type InstallerDeps } from './kb-installer'

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

  const downloadUrl = deps?.customUrl || urlUtils.buildGithubReleaseUrl(version)
  const installerDeps = buildInstallerDeps(deps)

  return installKB(version, cachePath, downloadUrl, { fs, ...installerDeps })
}

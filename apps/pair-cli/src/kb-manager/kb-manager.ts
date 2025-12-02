import { join } from 'path'
import { tmpdir } from 'os'
import type { FileSystemService } from '@pair/content-ops'
import { type ProgressWriter } from './progress-reporter'
import { downloadFile } from './download-manager'
import cacheManager from './cache-manager'
import extractZip from './zip-extractor'
import checksumManager from './checksum-manager'
import urlUtils from './url-utils'
import formatDownloadError from './error-formatter'

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
export async function ensureKBAvailable(version: string, deps?: KBManagerDeps): Promise<string> {
  const cachePath = getCachedKBPath(version)
  const cached = await isKBCached(version, deps?.fs)

  if (cached) {
    return cachePath
  }

  return downloadAndInstallKB(version, cachePath, deps)
}

/* eslint-disable max-lines-per-function, complexity */
async function downloadAndInstallKB(
  version: string,
  cachePath: string,
  deps?: KBManagerDeps,
): Promise<string> {
  const fs = deps?.fs
  const extract = deps?.extract || extractZip
  const cleanVersion = version.startsWith('v') ? version.slice(1) : version

  console.log(`KB not found, downloading v${version} from GitHub...`)

  const downloadUrl = deps?.customUrl || urlUtils.buildGithubReleaseUrl(version)
  const zipPath = join(tmpdir(), `kb-${cleanVersion}.zip`)

  try {
    await cacheManager.ensureCacheDirectory(cachePath, fs)
    await downloadFile(downloadUrl, zipPath, {
      fs,
      progressWriter: deps?.progressWriter,
      isTTY: deps?.isTTY,
    })

    // Validate checksum if available
    const check = await checksumManager.validateFileWithRemoteChecksum(downloadUrl, zipPath, fs)
    if (!check.isValid) {
      throw new Error(
        `Checksum validation failed: expected=${check.expectedChecksum} actual=${check.actualChecksum}`,
      )
    }

    await extract(zipPath, cachePath)
    await cacheManager.cleanupZip(zipPath, fs)

    console.log(`✅ KB v${cleanVersion} installed at ${cachePath}`)
    return cachePath
  } catch (error) {
    await cacheManager.cleanupZip(zipPath, fs)
    const err = error as Error
    const msg = (err.message || '').toLowerCase()
    let operation: 'download' | 'extract' | 'checksum' | undefined = 'download'
    if (msg.includes('checksum') || msg.includes('sha256')) operation = 'checksum'
    else if (msg.includes('extract') || msg.includes('zip') || msg.includes('corrupt'))
      operation = 'extract'

    const lower = (err.message || '').toLowerCase()

    // Preserve original messages for HTTP, network, extraction and checksum errors
    if (
      lower.includes('kb v') ||
      lower.includes('access denied') ||
      lower.includes('http') ||
      lower.includes('network error') ||
      lower.includes('corrupted zip') ||
      lower.includes('invalid zip') ||
      lower.includes('checksum')
    ) {
      throw err
    }

    const formatted = formatDownloadError(err, {
      url: downloadUrl,
      filePath: zipPath,
      operation,
      version,
    })

    const e = new Error(formatted.message)
    throw e
  }
}
/* eslint-enable max-lines-per-function, complexity */

import { join } from 'path'
import { tmpdir } from 'os'
import type { FileSystemService } from '@pair/content-ops'
import { downloadFile } from './download-manager'
import cacheManager from './cache-manager'
import extractZip from './zip-extractor'
import checksumManager from './checksum-manager'
import formatDownloadError from './error-formatter'
import { announceDownload, announceSuccess } from './download-ui'

export interface InstallerDeps {
  fs?: FileSystemService
  extract?: (zipPath: string, targetPath: string) => Promise<void>
  progressWriter?: { write(s: string): void }
  isTTY?: boolean
}

async function doInstallSteps(
  downloadUrl: string,
  zipPath: string,
  cachePath: string,
  deps?: InstallerDeps,
): Promise<void> {
  const fs = deps?.fs
  const extract = deps?.extract || extractZip

  await downloadFile(downloadUrl, zipPath, {
    fs,
    progressWriter: deps?.progressWriter,
    isTTY: deps?.isTTY,
  })

  const check = await checksumManager.validateFileWithRemoteChecksum(downloadUrl, zipPath, deps?.fs)
  if (!check.isValid) {
    throw new Error(
      `Checksum validation failed: expected=${check.expectedChecksum} actual=${check.actualChecksum}`,
    )
  }

  await extract(zipPath, cachePath)
  await cacheManager.cleanupZip(zipPath, deps?.fs)
}

function shouldPreserveError(err: Error): boolean {
  const lower = (err.message || '').toLowerCase()
  return (
    lower.includes('kb v') ||
    lower.includes('access denied') ||
    lower.includes('http') ||
    lower.includes('network error') ||
    lower.includes('corrupted zip') ||
    lower.includes('invalid zip') ||
    lower.includes('checksum')
  )
}

export async function installKB(
  version: string,
  cachePath: string,
  downloadUrl: string,
  deps?: InstallerDeps,
): Promise<string> {
  const fs = deps?.fs
  const cleanVersion = version.startsWith('v') ? version.slice(1) : version
  const zipPath = join(tmpdir(), `kb-${cleanVersion}.zip`)

  announceDownload(version, downloadUrl)

  await cacheManager.ensureCacheDirectory(cachePath, fs)

  try {
    await doInstallSteps(downloadUrl, zipPath, cachePath, deps)
    announceSuccess(cleanVersion, cachePath)
    return cachePath
  } catch (error) {
    await cacheManager.cleanupZip(zipPath, fs)
    const err = error as Error
    if (shouldPreserveError(err)) throw err

    const formatted = formatDownloadError(err, {
      url: downloadUrl,
      filePath: zipPath,
      version,
    })

    throw new Error(formatted.message)
  }
}

export default { installKB }

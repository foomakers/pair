import { join } from 'path'
import { tmpdir } from 'os'
import type { FileSystemService, HttpClientService, RetryOptions } from '@pair/content-ops'
import {
  cleanupFile,
  validateKBStructure,
  normalizeExtractedKB,
  copyDirectoryContents,
} from '@pair/content-ops'
import { downloadWithRetry } from './download-manager'
import cacheManager from './cache-manager'
import checksumManager from './checksum-manager'
import formatDownloadError from './error-formatter'
import { announceDownload, announceSuccess } from './download-ui'

export interface InstallerDeps {
  httpClient: HttpClientService
  progressWriter?: { write(s: string): void }
  isTTY?: boolean
}

async function doInstallSteps(
  downloadUrl: string,
  zipPath: string,
  cachePath: string,
  options: {
    fs: FileSystemService
    httpClient: HttpClientService
    progressWriter?: { write(s: string): void }
    isTTY?: boolean
    retryOptions?: RetryOptions
  },
): Promise<void> {
  const { fs, httpClient, progressWriter, isTTY, retryOptions } = options

  await downloadWithRetry(
    downloadUrl,
    zipPath,
    {
      httpClient,
      fs,
      progressWriter,
      isTTY,
    },
    retryOptions,
  )

  const check = await checksumManager.validateFileWithRemoteChecksum(
    downloadUrl,
    zipPath,
    httpClient,
    fs,
  )
  if (!check.isValid) {
    throw new Error(
      `Checksum validation failed: expected=${check.expectedChecksum} actual=${check.actualChecksum}`,
    )
  }

  await fs.extractZip(zipPath, cachePath)
  await cleanupFile(zipPath, fs)
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
    lower.includes('checksum') ||
    lower.includes('invalid kb structure')
  )
}

interface InstallOptions {
  fs: FileSystemService
  httpClient: HttpClientService
  progressWriter?: { write(s: string): void }
  isTTY?: boolean
  retryOptions?: RetryOptions
}

export async function installKB(
  version: string,
  cachePath: string,
  downloadUrl: string,
  options: InstallOptions,
): Promise<string> {
  const cleanVersion = version.startsWith('v') ? version.slice(1) : version
  const zipPath = join(tmpdir(), `kb-${cleanVersion}.zip`)

  announceDownload(version, downloadUrl)

  const { fs } = options
  await cacheManager.ensureCacheDirectory(cachePath, fs)

  try {
    await doInstallSteps(downloadUrl, zipPath, cachePath, options)
    announceSuccess(cleanVersion, cachePath)
    // Prefer to return the dataset root when .pair exists inside cache so callers
    // resolve registries like 'knowledge' correctly (datasetRoot/knowledge)
    const datasetRoot = fs.existsSync(join(cachePath, '.pair'))
      ? join(cachePath, '.pair')
      : cachePath
    return datasetRoot
  } catch (error) {
    await cleanupFile(zipPath, fs)
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

export async function installKBFromLocalDirectory(
  version: string,
  dirPath: string,
  fs: FileSystemService,
): Promise<string> {
  const cachePath = cacheManager.getCachedKBPath(version)

  // Resolve relative paths using injectable cwd
  const resolvedDirPath = dirPath.startsWith('/')
    ? dirPath
    : join(fs.currentWorkingDirectory(), dirPath)

  // Validate directory exists
  if (!fs.existsSync(resolvedDirPath)) {
    throw new Error(`Directory not found: ${resolvedDirPath}`)
  }

  await cacheManager.ensureCacheDirectory(cachePath, fs)

  try {
    await copyDirectoryContents(fs, resolvedDirPath, cachePath)

    // Validate KB structure
    const kbStructureValid = await validateKBStructure(cachePath, fs)
    if (!kbStructureValid) {
      throw new Error('Invalid KB structure')
    }

    announceSuccess(version, cachePath)
    // If the extracted/copy result contains a .pair directory, return that as the
    // dataset root so callers resolve registries correctly
    const datasetRoot = fs.existsSync(join(cachePath, '.pair'))
      ? join(cachePath, '.pair')
      : cachePath
    return datasetRoot
  } catch (error) {
    const err = error as Error
    if (shouldPreserveError(err)) throw err
    throw new Error(`Failed to install KB from local directory: ${err.message}`)
  }
}


// Helper: finalize installation, normalize and return dataset root
async function finalizeZipInstall(
  version: string,
  cachePath: string,
  fs: FileSystemService,
): Promise<string> {
  const ok = await normalizeExtractedKB(cachePath, fs)
  if (!ok) throw new Error('Invalid KB structure')

  announceSuccess(version, cachePath)
  return fs.existsSync(join(cachePath, '.pair')) ? join(cachePath, '.pair') : cachePath
}

export async function installKBFromLocalZip(
  version: string,
  zipPath: string,
  fs: FileSystemService,
  skipVerify = false,
): Promise<string> {
  const cachePath = cacheManager.getCachedKBPath(version)

  // Resolve relative paths
  const resolvedZipPath = zipPath.startsWith('/') ? zipPath : join(process.cwd(), zipPath)

  // Validate ZIP file exists
  if (!fs.existsSync(resolvedZipPath)) {
    throw new Error(`ZIP file not found: ${resolvedZipPath}`)
  }

  // Verify package integrity (unless skipped)
  if (!skipVerify) {
    const { verifyPackage } = await import('../commands/kb-verify/verify-package.js')
    const result = await verifyPackage(resolvedZipPath, fs)
    if (!result.valid) {
      throw new Error(
        `Package verification failed:\n${result.errors.join('\n')}\n\nUse --skip-verify to bypass verification.`,
      )
    }
    const { logger: log } = await import('@pair/content-ops')
    log.info('Package verification passed')
  } else {
    const { logger: log } = await import('@pair/content-ops')
    log.warn('Skipping package verification (--skip-verify)')
  }

  await cacheManager.ensureCacheDirectory(cachePath, fs)

  try {
    await fs.extractZip(resolvedZipPath, cachePath)
    return await finalizeZipInstall(version, cachePath, fs)
  } catch (error) {
    const err = error as Error
    if (shouldPreserveError(err)) throw err
    throw new Error(`Failed to install KB from local ZIP: ${err.message}`)
  }
}

export default { installKB, installKBFromLocalZip, installKBFromLocalDirectory }

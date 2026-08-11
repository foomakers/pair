import { join } from 'path'
import { tmpdir } from 'os'
import type { FileSystemService, HttpClientService, RetryOptions } from '@pair/content-ops'
import { cleanupFile, normalizeExtractedKB } from '@pair/content-ops'
import { downloadWithRetry } from './download-manager'
import cacheManager from './cache-manager'
import { getSourceCachePath, resolveSourcePath, type KBSource } from './cache-slot-key'
import { cloneGitRepo } from './git-clone'
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
    return cachePath
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

/**
 * Clones a git source into the slot its URL owns.
 *
 * The slot lifecycle (purge → create → populate) lives HERE, with every other source
 * form's, instead of in the config layer: slot mechanics duplicated outside the module
 * that owns slots is exactly the shape that produced the contamination US-395 fixes.
 */
export async function installKBFromGit(url: string, fs: FileSystemService): Promise<string> {
  const source: KBSource = { kind: 'git', url }
  const cachePath = getSourceCachePath(source)

  // Replace the slot wholesale so files from a previous clone cannot linger
  await cacheManager.purgeSlot(source, fs)
  await cacheManager.ensureCacheDirectory(cachePath, fs)

  cloneGitRepo(url, cachePath)
  // The dataset is what we cache; the clone's history is not.
  await fs.rm(join(cachePath, '.git'), { recursive: true, force: true })
  return cachePath
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
  return cachePath
}

export async function installKBFromLocalZip(
  version: string,
  zipPath: string,
  fs: FileSystemService,
  skipVerify = false,
): Promise<string> {
  // Slot keyed by source identity, never by CLI version: an external ZIP must not land
  // in the official KB's slot (US-395). The caller has already classified this path as a
  // ZIP (`localKBSource`); the slot derives from the same resolved path, so both sides
  // land on the same slot.
  const resolvedZipPath = resolveSourcePath(zipPath, fs)
  const source: KBSource = { kind: 'zip', path: resolvedZipPath }
  const cachePath = getSourceCachePath(source)

  // Validate ZIP file exists
  if (!fs.existsSync(resolvedZipPath)) {
    throw new Error(`ZIP file not found: ${resolvedZipPath}`)
  }

  // Verify package integrity (unless skipped)
  const { logger: log } = await import('@pair/content-ops')
  if (!skipVerify) {
    const { verifyPackage } = await import('../commands/kb-verify/verify-package.js')
    const result = await verifyPackage(resolvedZipPath, fs)
    if (!result.valid) {
      throw new Error(
        `Package verification failed:\n${result.errors.join('\n')}\n\nUse --skip-verify to bypass verification.`,
      )
    }
    log.info('Package verification passed')
  } else {
    log.warn('Skipping package verification (--skip-verify)')
  }

  // Replace the slot wholesale so files from a previous install cannot linger
  await cacheManager.purgeSlot(source, fs)
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

export default { installKB, installKBFromLocalZip, installKBFromGit }

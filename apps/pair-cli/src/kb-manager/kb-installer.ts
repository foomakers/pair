import { join } from 'path'
import { tmpdir } from 'os'
import type { FileSystemService, HttpClientService, RetryOptions } from '@pair/content-ops'
import { cleanupFile, normalizeExtractedKB } from '@pair/content-ops'
import { downloadWithRetry } from './download-manager'
import cacheManager from './cache-manager'
import { downloadStagingName, getSourceCachePath, type KBSource } from './cache-slot-key'
import { zipKBSource } from './zip-source'
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

  await extractIntoSlot(zipPath, cachePath, fs)
  await cleanupFile(zipPath, fs)
}

/**
 * Extraction is ATOMIC (#428): the archive is unpacked into a `<slot>.tmp-<pid>` stage and
 * renamed onto the slot whole, so a concurrent process never reads a half-written slot. The
 * unwrap runs on the stage for the same reason.
 */
async function extractIntoSlot(
  zipPath: string,
  cachePath: string,
  fs: FileSystemService,
): Promise<void> {
  await cacheManager.writeSlotAtomically(cachePath, fs, async stage => {
    await fs.extractZip(zipPath, stage)
    // UNWRAP a ZIP whose content sits under a single root directory, exactly as the local-ZIP
    // path does: `installKB` serves the official download AND `--url <remote zip>`, and an
    // external KB packaged that way otherwise yields a dataset root one level too high.
    // Unwrap only — a `false` result is NOT raised as an error here: this path has never
    // validated the downloaded structure, and turning a structure check into a hard failure
    // on the official download is a behaviour change with no defect behind it (the local-ZIP
    // path does throw, because its caller handed us the archive and can fix it).
    await normalizeExtractedKB(stage, fs)
  })
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
  // Staged under a name keyed by the SOURCE, never by the CLI version alone: this function
  // serves both the official release and `--url <remote zip>`, and a shared staging file
  // lets one source's bytes reach another's install through the resume logic (which decides
  // to resume from `<staging>.partial`'s size alone). See `downloadStagingName`.
  const zipPath = join(tmpdir(), downloadStagingName(version, downloadUrl))

  announceDownload(version, downloadUrl)

  const { fs } = options

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
 * The slot lifecycle lives HERE, with every other source form's, instead of in the config
 * layer: slot mechanics duplicated outside the module that owns slots is exactly the shape
 * that produced the contamination US-395 fixes.
 *
 * The old clone is SET ASIDE, not purged, before the new one is fetched — the invariant
 * the ADL states for every network-fetched source. `cloneGitRepo` additionally deletes the
 * destination when git fails, so a purge-first version left an offline user with an empty
 * slot where a working clone had been.
 *
 * The clone itself lands in the atomic stage (#428): git writes file-by-file, so cloning
 * straight into the slot exposed a half-written tree to every concurrent reader. The stage
 * also gives git the empty destination it requires, and the swap replaces the slot
 * wholesale (files from a previous clone cannot linger).
 */
export async function installKBFromGit(url: string, fs: FileSystemService): Promise<string> {
  const source: KBSource = { kind: 'git', url }
  const cachePath = getSourceCachePath(source)

  const hadCache = await cacheManager.backupCachedKB(source, fs)

  try {
    await cacheManager.writeSlotAtomically(cachePath, fs, async stage => {
      cloneGitRepo(url, stage)
      // The dataset is what we cache; the clone's history is not.
      await fs.rm(join(stage, '.git'), { recursive: true, force: true })
    })
  } catch (err) {
    // `restoreCachedKB` is best-effort by contract: a fs error inside this cleanup must not
    // replace the actionable clone failure ("Git clone failed: network unreachable") that
    // brought us here. The ORIGINAL error is the one rethrown.
    if (hadCache) await cacheManager.restoreCachedKB(source, fs)
    throw err
  }

  // OUTSIDE the try: the catch RESTORES the set-aside clone, so a cleanup failure there
  // would delete the clone that just succeeded and put the stale one back.
  if (hadCache) await cacheManager.removeBackupKB(source, fs)
  return cachePath
}

export async function installKBFromLocalZip(
  version: string,
  zipPath: string,
  fs: FileSystemService,
  skipVerify = false,
): Promise<string> {
  // Slot keyed by source identity, never by CLI version: an external ZIP must not land
  // in the official KB's slot (US-395). The identity is the archive's CONTENT (#429):
  // `zipKBSource` resolves the path AND hashes the bytes, so the same archive copied to
  // two directories lands on ONE slot and two different archives can never share one.
  // (It also throws the canonical "ZIP file not found" when the path does not exist.)
  const source = await zipKBSource(zipPath, fs)
  const resolvedZipPath = source.path
  const cachePath = getSourceCachePath(source)

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

  try {
    // Atomic populate (#428): extraction and the structure check both run on the stage,
    // and the slot is replaced WHOLE by the swap — which is also what keeps files from a
    // previous install of this source from lingering (the purge-first sequence this
    // replaces exposed an empty-then-half-written slot to concurrent readers).
    await cacheManager.writeSlotAtomically(cachePath, fs, async stage => {
      await fs.extractZip(resolvedZipPath, stage)
      const ok = await normalizeExtractedKB(stage, fs)
      if (!ok) throw new Error('Invalid KB structure')
    })
    announceSuccess(version, cachePath)
    return cachePath
  } catch (error) {
    const err = error as Error
    if (shouldPreserveError(err)) throw err
    throw new Error(`Failed to install KB from local ZIP: ${err.message}`)
  }
}

export default { installKB, installKBFromLocalZip, installKBFromGit }

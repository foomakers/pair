import { join } from 'path'
import { tmpdir } from 'os'
import type { FileSystemService, HttpClientService } from '@pair/content-ops'
import { extractZip, cleanupFile, NodeHttpClientService } from '@pair/content-ops'
import { downloadFile } from './download-manager'
import cacheManager from './cache-manager'
import checksumManager from './checksum-manager'
import formatDownloadError from './error-formatter'
import { announceDownload, announceSuccess } from './download-ui'

export interface InstallerDeps {
  httpClient: HttpClientService
  extract?: (zipPath: string, targetPath: string) => Promise<void>
  progressWriter?: { write(s: string): void }
  isTTY?: boolean
}

async function doInstallSteps(
  downloadUrl: string,
  zipPath: string,
  cachePath: string,
  options: {
    fs: FileSystemService
    httpClient?: HttpClientService
    progressWriter?: { write(s: string): void }
    isTTY?: boolean
    extract?: (zipPath: string, targetPath: string) => Promise<void>
  },
): Promise<void> {
  const {
    fs,
    httpClient = new NodeHttpClientService(),
    progressWriter,
    isTTY,
    extract: customExtract,
  } = options
  const extract = customExtract || extractZip

  await downloadFile(downloadUrl, zipPath, {
    httpClient,
    fs,
    progressWriter,
    isTTY,
  })

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

  await extract(zipPath, cachePath)
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

function buildInstallOptions(options: {
  fs: FileSystemService
  httpClient?: HttpClientService
  progressWriter?: { write(s: string): void }
  isTTY?: boolean
  extract?: (zipPath: string, targetPath: string) => Promise<void>
}): {
  fs: FileSystemService
  httpClient?: HttpClientService
  progressWriter?: { write(s: string): void }
  isTTY?: boolean
  extract?: (zipPath: string, targetPath: string) => Promise<void>
} {
  const result: {
    fs: FileSystemService
    httpClient?: HttpClientService
    progressWriter?: { write(s: string): void }
    isTTY?: boolean
    extract?: (zipPath: string, targetPath: string) => Promise<void>
  } = { fs: options.fs }
  if (options.httpClient) result.httpClient = options.httpClient
  if (options.progressWriter) result.progressWriter = options.progressWriter
  if (options.isTTY) result.isTTY = options.isTTY
  if (options.extract) result.extract = options.extract
  return result
}

export async function installKB(
  version: string,
  cachePath: string,
  downloadUrl: string,
  options: {
    fs: FileSystemService
    httpClient?: HttpClientService
    progressWriter?: { write(s: string): void }
    isTTY?: boolean
    extract?: (zipPath: string, targetPath: string) => Promise<void>
  },
): Promise<string> {
  const cleanVersion = version.startsWith('v') ? version.slice(1) : version
  const zipPath = join(tmpdir(), `kb-${cleanVersion}.zip`)

  announceDownload(version, downloadUrl)

  const { fs } = options
  await cacheManager.ensureCacheDirectory(cachePath, fs)

  try {
    const installOptions = buildInstallOptions(options)
    await doInstallSteps(downloadUrl, zipPath, cachePath, installOptions)
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

async function copyDirectoryInMemory(
  fs: FileSystemService,
  sourceDir: string,
  targetDir: string,
): Promise<void> {
  // Ensure target directory exists
  await fs.mkdir(targetDir, { recursive: true })

  // Read all entries in the source directory
  const entries = await fs.readdir(sourceDir)

  // Process each entry
  for (const entry of entries) {
    const sourcePath = join(sourceDir, entry.name)
    const targetPath = join(targetDir, entry.name)

    if (entry.isDirectory()) {
      // Recursively copy subdirectory
      await copyDirectoryInMemory(fs, sourcePath, targetPath)
    } else {
      // Copy file
      const content = await fs.readFile(sourcePath)
      await fs.writeFile(targetPath, content)
    }
  }
}

async function validateKBStructure(cachePath: string, fs: FileSystemService): Promise<boolean> {
  // Check for .pair directory or AGENTS.md at the root of cachePath
  const hasPairDir = fs.existsSync(join(cachePath, '.pair'))
  const hasAgentsMd = fs.existsSync(join(cachePath, 'AGENTS.md'))
  const hasManifestJson = fs.existsSync(join(cachePath, 'manifest.json'))

  // If we have a .pair dir or AGENTS.md it's valid
  if (hasPairDir || hasAgentsMd) return true

  // If there's a manifest.json, ensure there are other files present too (manifest alone is not enough)
  if (hasManifestJson) {
    try {
      const entries = await fs.readdir(cachePath)
      // If there's any non-hidden entry other than manifest.json, consider it valid
      return entries.some(e => e.name !== 'manifest.json' && !e.name.startsWith('.'))
    } catch {
      return false
    }
  }

  return false
}

/**
 * Checks if a directory contains a single subdirectory (common in ZIP extractions)
 * and returns that subdirectory path if it contains valid KB structure
 */
async function findKBStructureInSubdirectories(
  cachePath: string,
  fs: FileSystemService,
): Promise<string | null> {
  try {
    const entries = await fs.readdir(cachePath)
    // Filter out files and hidden directories
    const dirs = entries.filter(e => e.isDirectory() && !e.name.startsWith('.'))

    // If there's exactly one directory, check if it has KB structure
    if (dirs.length === 1) {
      const subDir = join(cachePath, dirs[0]!.name)
      if (await validateKBStructure(subDir, fs)) {
        return subDir
      }
    }

    // Check if there's a .zip-temp directory (created by package command)
    const zipTempDir = entries.find(e => e.isDirectory() && e.name === '.zip-temp')
    if (zipTempDir) {
      const subDir = join(cachePath, zipTempDir.name)
      if (await validateKBStructure(subDir, fs)) {
        return subDir
      }
    }
  } catch {
    // If we can't read the directory, return null
  }
  return null
}

/**
 * Moves all contents from source directory to target directory
 */
async function moveDirectoryContents(
  sourceDir: string,
  targetDir: string,
  fs: FileSystemService,
): Promise<void> {
  const entries = await fs.readdir(sourceDir)

  for (const entry of entries) {
    const sourcePath = join(sourceDir, entry.name)
    const targetPath = join(targetDir, entry.name)

    // Move the entry (copy then delete for cross-device safety)
    if (entry.isDirectory()) {
      await fs.mkdir(targetPath, { recursive: true })
      await moveDirectoryContents(sourcePath, targetPath, fs)
      await fs.rm(sourcePath, { recursive: true, force: true })
    } else {
      const content = await fs.readFile(sourcePath)
      await fs.writeFile(targetPath, content)
      await fs.unlink(sourcePath)
    }
  }
}

// Debug helper: log directory entries when running tests or debug mode
async function logDirEntriesIfDebug(
  pathToLog: string,
  fsService: FileSystemService,
  label: string,
) {
  try {
    if (process.env['NODE_ENV'] === 'test' || process.env['DEBUG'] || process.env['PAIR_DIAG']) {
      const entries = await fsService.readdir(pathToLog)
      const names = entries.map(e => (e && e.name ? e.name : String(e)))

      // Use unified logger for debug output
      const { logger } = await import('@pair/content-ops')
      logger.debug(`[debug] ${label} ${pathToLog}`, names)
    }
  } catch {
    // ignore logging failures
  }
}

/**
 * Normalize the extracted cache path to ensure KB structure exists at the root.
 * Returns true if the cachePath contains a valid KB after normalization.
 */
async function normalizeExtractedKB(cachePath: string, fs: FileSystemService): Promise<boolean> {
  // Initial validation
  let kbStructureValid = await validateKBStructure(cachePath, fs)
  if (kbStructureValid) return true

  await logDirEntriesIfDebug(cachePath, fs, 'normalizeExtractedKB entries:')

  // If not valid at root, try to find a single subdirectory that contains the KB
  const subDirWithKB = await findKBStructureInSubdirectories(cachePath, fs)
  if (subDirWithKB) {
    await moveDirectoryContents(subDirWithKB, cachePath, fs)
    await fs.rm(subDirWithKB, { recursive: true, force: true })
    return true
  }

  // Final attempt: re-validate (covers manifest + other files case)
  kbStructureValid = await validateKBStructure(cachePath, fs)
  return kbStructureValid
}

export async function installKBFromLocalDirectory(
  version: string,
  dirPath: string,
  fs: FileSystemService,
): Promise<string> {
  const cachePath = cacheManager.getCachedKBPath(version)

  // Resolve relative paths
  const resolvedDirPath = dirPath.startsWith('/') ? dirPath : join(process.cwd(), dirPath)

  // Validate directory exists
  if (!fs.existsSync(resolvedDirPath)) {
    throw new Error(`Directory not found: ${resolvedDirPath}`)
  }

  await cacheManager.ensureCacheDirectory(cachePath, fs)

  try {
    // Copy directory contents recursively
    // For in-memory filesystem, implement manual copy
    await copyDirectoryInMemory(fs, resolvedDirPath, cachePath)

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

// Helper: perform extract using the proper extract call for in-memory tests
async function performExtractForZip(
  resolvedZipPath: string,
  cachePath: string,
  fs: FileSystemService,
  extractFn: (zipPath: string, targetPath: string, fsArg?: FileSystemService) => Promise<void>,
): Promise<void> {
  if (fs && fs.constructor && fs.constructor.name === 'InMemoryFileSystemService') {
    await extractFn(resolvedZipPath, cachePath, fs)
  } else {
    await extractFn(resolvedZipPath, cachePath)
  }
}

// Helper: finalize installation, normalize and return dataset root
async function finalizeZipInstall(
  version: string,
  cachePath: string,
  fs: FileSystemService,
): Promise<string> {
  await logDirEntriesIfDebug(cachePath, fs, 'after extract entries:')
  const ok = await normalizeExtractedKB(cachePath, fs)
  await logDirEntriesIfDebug(cachePath, fs, 'final entries at')
  if (await fs.existsSync(join(cachePath, '.pair'))) {
    await logDirEntriesIfDebug(join(cachePath, '.pair'), fs, '.pair entries:')
  }
  if (!ok) throw new Error('Invalid KB structure')

  announceSuccess(version, cachePath)
  return fs.existsSync(join(cachePath, '.pair')) ? join(cachePath, '.pair') : cachePath
}

export async function installKBFromLocalZip(
  version: string,
  zipPath: string,
  fs: FileSystemService,
): Promise<string> {
  const extract = extractZip
  const cachePath = cacheManager.getCachedKBPath(version)

  // Resolve relative paths
  const resolvedZipPath = zipPath.startsWith('/') ? zipPath : join(process.cwd(), zipPath)

  // Validate ZIP file exists
  if (!fs.existsSync(resolvedZipPath)) {
    throw new Error(`ZIP file not found: ${resolvedZipPath}`)
  }

  await cacheManager.ensureCacheDirectory(cachePath, fs)

  try {
    await performExtractForZip(resolvedZipPath, cachePath, fs, extract)
    return await finalizeZipInstall(version, cachePath, fs)
  } catch (error) {
    const err = error as Error
    if (shouldPreserveError(err)) throw err
    throw new Error(`Failed to install KB from local ZIP: ${err.message}`)
  }
}

export default { installKB, installKBFromLocalZip, installKBFromLocalDirectory }

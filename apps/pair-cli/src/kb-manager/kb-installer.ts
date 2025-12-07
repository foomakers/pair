import { join } from 'path'
import { tmpdir } from 'os'
import type { FileSystemService } from '@pair/content-ops'
import { extractZip, fileSystemService, cleanupFile } from '@pair/content-ops'
import { downloadFile } from './download-manager'
import cacheManager from './cache-manager'
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
  options: { fs: FileSystemService; deps?: InstallerDeps },
): Promise<void> {
  const { fs, deps } = options
  const extract = deps?.extract || extractZip

  await downloadFile(downloadUrl, zipPath, {
    fs,
    progressWriter: deps?.progressWriter,
    isTTY: deps?.isTTY,
  })

  const check = await checksumManager.validateFileWithRemoteChecksum(downloadUrl, zipPath, fs)
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

export async function installKB(
  version: string,
  cachePath: string,
  downloadUrl: string,
  deps?: InstallerDeps,
): Promise<string> {
  const fs = deps?.fs || fileSystemService
  const cleanVersion = version.startsWith('v') ? version.slice(1) : version
  const zipPath = join(tmpdir(), `kb-${cleanVersion}.zip`)

  announceDownload(version, downloadUrl)

  await cacheManager.ensureCacheDirectory(cachePath, fs)

  try {
    const options: { fs: FileSystemService; deps?: InstallerDeps } = { fs }
    if (deps) options.deps = deps
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

function validateKBStructure(cachePath: string, fs: FileSystemService): boolean {
  const hasPairDir = fs.existsSync(join(cachePath, '.pair'))
  const hasAgentsMd = fs.existsSync(join(cachePath, 'AGENTS.md'))

  return hasPairDir || hasAgentsMd
}

export async function installKBFromLocalDirectory(
  version: string,
  dirPath: string,
  deps?: InstallerDeps,
): Promise<string> {
  const fs = deps?.fs || fileSystemService
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
    const kbStructureValid = validateKBStructure(cachePath, fs)
    if (!kbStructureValid) {
      throw new Error('Invalid KB structure')
    }

    announceSuccess(version, cachePath)
    return cachePath
  } catch (error) {
    const err = error as Error
    if (shouldPreserveError(err)) throw err
    throw new Error(`Failed to install KB from local directory: ${err.message}`)
  }
}

export async function installKBFromLocalZip(
  version: string,
  zipPath: string,
  deps?: InstallerDeps,
): Promise<string> {
  const fs = deps?.fs || fileSystemService
  const extract = deps?.extract || extractZip
  const cachePath = cacheManager.getCachedKBPath(version)

  // Resolve relative paths
  const resolvedZipPath = zipPath.startsWith('/') ? zipPath : join(process.cwd(), zipPath)

  // Validate ZIP file exists
  if (!fs.existsSync(resolvedZipPath)) {
    throw new Error(`ZIP file not found: ${resolvedZipPath}`)
  }

  await cacheManager.ensureCacheDirectory(cachePath, fs)

  try {
    await extract(resolvedZipPath, cachePath, fs)

    // Validate KB structure
    const kbStructureValid = validateKBStructure(cachePath, fs)
    if (!kbStructureValid) {
      throw new Error('Invalid KB structure')
    }

    announceSuccess(version, cachePath)
    return cachePath
  } catch (error) {
    const err = error as Error
    if (shouldPreserveError(err)) throw err
    throw new Error(`Failed to install KB from local ZIP: ${err.message}`)
  }
}

export default { installKB, installKBFromLocalZip, installKBFromLocalDirectory }

import { join, relative, dirname } from 'path'
import type { Dirent } from 'fs'
import { FileSystemService } from './file-system-service'
import { Behavior, normalizeKey, resolveBehavior } from '../ops/behavior'
import { logger } from '../observability'

/**
 * Clean up a file, ignoring errors if file doesn't exist
 * @param filePath - Path to file to delete
 * @param fs - Filesystem service
 */
export async function cleanupFile(filePath: string, fs: FileSystemService): Promise<void> {
  try {
    if (fs.existsSync(filePath)) {
      await fs.unlink(filePath)
    }
  } catch {
    // Ignore cleanup errors
  }
}

export async function copyFileHelper(
  fileService: FileSystemService,
  oldPath: string,
  newPath: string,
  behavior: Behavior = 'overwrite',
): Promise<void> {
  return logger.time(async () => {
    // For 'add' behavior, check if destination already exists
    if (behavior === 'add') {
      try {
        await fileService.stat(newPath)
        // File already exists, skip
        return
      } catch {
        // File doesn't exist, proceed with copy
      }
    }

    const content = await fileService.readFile(oldPath)
    await fileService.mkdir(dirname(newPath), { recursive: true })
    await fileService.writeFile(newPath, content)
  }, 'copyFileHelper')
}

export type CopyDirContext = {
  fileService: FileSystemService
  oldDir: string
  newDir: string
  folderBehavior?: Record<string, Behavior>
  defaultBehavior: Behavior
  datasetRoot: string
  /** Absolute destination paths to hard-skip, regardless of behavior. */
  excludePaths?: string[]
}

/**
 * True if `candidate` equals, or lies within, one of `excludePaths`.
 * Used to hard-exclude operational areas (e.g. `.pair/working/`) from copy and
 * mirror-cleanup traversals, independent of registry/behavior configuration.
 * On case-insensitive filesystems (macOS/Windows) the comparison is
 * case-folded so a `working_path` override differing only in case still matches.
 * @param platform - OS platform (defaults to process.platform), injectable for tests.
 */
export function isPathExcluded(
  candidate: string,
  excludePaths?: string[],
  platform: string = process.platform,
): boolean {
  if (!excludePaths || excludePaths.length === 0) return false
  const foldCase = platform === 'darwin' || platform === 'win32'
  const normalize = (p: string) => {
    const stripped = p.replace(/\\/g, '/').replace(/\/+$/, '')
    return foldCase ? stripped.toLowerCase() : stripped
  }
  const normalizedCandidate = normalize(candidate)
  return excludePaths.some(excluded => {
    const normalizedExcluded = normalize(excluded)
    return (
      normalizedCandidate === normalizedExcluded ||
      normalizedCandidate.startsWith(normalizedExcluded + '/')
    )
  })
}

export async function copyDirHelper(context: CopyDirContext): Promise<void> {
  const { fileService, oldDir, newDir } = context

  return logger.time(async () => {
    await fileService.mkdir(newDir, { recursive: true })
    const entries = await fileService.readdir(oldDir)
    for (const entry of entries) {
      await copyDirEntry(entry, context)
    }
  }, 'copyDirHelper')
}

async function destinationExists(fileService: FileSystemService, path: string): Promise<boolean> {
  try {
    await fileService.stat(path)
    return true
  } catch {
    return false
  }
}

/**
 * Copies (or recurses into) a single directory entry, honoring exclusion,
 * behavior resolution, and the 'add'/'skip' short-circuits.
 */
async function copyDirEntry(entry: Dirent, context: CopyDirContext): Promise<void> {
  const {
    fileService,
    oldDir,
    newDir,
    folderBehavior,
    defaultBehavior,
    datasetRoot,
    excludePaths,
  } = context
  const oldEntry = join(oldDir, entry.name)
  const newEntry = join(newDir, entry.name)

  if (isPathExcluded(newEntry, excludePaths)) {
    logger.info(`Skipping excluded path: ${newEntry}`)
    return
  }

  // Determine behavior for this entry
  const relPath = datasetRoot ? normalizeKey(relative(datasetRoot, oldEntry)) : entry.name
  const entryBehavior = resolveBehavior(relPath, folderBehavior, defaultBehavior)

  if (entryBehavior === 'skip') return
  if (entryBehavior === 'add' && (await destinationExists(fileService, newEntry))) return

  if (entry.isDirectory()) {
    const recursiveContext: CopyDirContext = {
      fileService,
      oldDir: oldEntry,
      newDir: newEntry,
      defaultBehavior,
      datasetRoot,
    }
    if (folderBehavior) {
      recursiveContext.folderBehavior = folderBehavior
    }
    if (excludePaths) {
      recursiveContext.excludePaths = excludePaths
    }
    await copyDirHelper(recursiveContext)
  } else {
    await copyFileHelper(fileService, oldEntry, newEntry, entryBehavior)
  }
}

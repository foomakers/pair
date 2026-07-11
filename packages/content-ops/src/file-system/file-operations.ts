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
}

/**
 * Normalizes a path for case-fold-aware containment comparison: forward-slash
 * separators, no leading/trailing slashes, lowercased on case-insensitive
 * filesystems (macOS/Windows). The single normalization primitive behind the
 * config-validation overlap check (working-area, relative paths). Stripping the
 * leading slash is safe for the absolute-path case because both operands are
 * normalized the same way before comparison.
 * @param platform - OS platform (defaults to process.platform), injectable for tests.
 */
export function normalizePathForCompare(p: string, platform: string = process.platform): string {
  const stripped = p.replace(/\\/g, '/').replace(/^\/+/, '').replace(/\/+$/, '')
  return platform === 'darwin' || platform === 'win32' ? stripped.toLowerCase() : stripped
}

/**
 * True if `candidate` equals, or lies within, `containerPath`. Both paths must
 * share the same base (both absolute, or both relative). Comparison is by
 * normalized path segments, case-folded per platform. Shared primitive used by
 * the working-area overlap validation (D14).
 * @param platform - OS platform (defaults to process.platform), injectable for tests.
 */
export function isWithinPath(
  candidate: string,
  containerPath: string,
  platform: string = process.platform,
): boolean {
  const a = normalizePathForCompare(candidate, platform)
  const b = normalizePathForCompare(containerPath, platform)
  return a === b || a.startsWith(b + '/')
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
 * Copies (or recurses into) a single directory entry, honoring behavior
 * resolution and the 'add'/'skip' short-circuits.
 */
async function copyDirEntry(entry: Dirent, context: CopyDirContext): Promise<void> {
  const { fileService, oldDir, newDir, folderBehavior, defaultBehavior, datasetRoot } = context
  const oldEntry = join(oldDir, entry.name)
  const newEntry = join(newDir, entry.name)

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
    await copyDirHelper(recursiveContext)
  } else {
    await copyFileHelper(fileService, oldEntry, newEntry, entryBehavior)
  }
}

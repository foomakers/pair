/**
 * KB structure validation and normalization utilities.
 * Validates that a directory contains a valid Knowledge Base structure
 * and normalizes extracted archives to ensure KB is at the root level.
 */

import { join } from 'path'
import type { FileSystemService } from './file-system-service'

/**
 * Validates that a directory contains a valid KB structure.
 * A valid KB has a .pair directory, an AGENTS.md file, or a manifest.json with other files.
 */
export async function validateKBStructure(
  cachePath: string,
  fs: FileSystemService,
): Promise<boolean> {
  const hasPairDir = fs.existsSync(join(cachePath, '.pair'))
  const hasAgentsMd = fs.existsSync(join(cachePath, 'AGENTS.md'))
  const hasManifestJson = fs.existsSync(join(cachePath, 'manifest.json'))

  if (hasPairDir || hasAgentsMd) return true

  if (hasManifestJson) {
    try {
      const entries = await fs.readdir(cachePath)
      return entries.some(e => e.name !== 'manifest.json' && !e.name.startsWith('.'))
    } catch {
      return false
    }
  }

  return false
}

/**
 * Checks if a directory contains a single subdirectory with valid KB structure.
 * Common in ZIP extractions where content is nested inside a single folder.
 */
export async function findKBStructureInSubdirectories(
  cachePath: string,
  fs: FileSystemService,
): Promise<string | null> {
  try {
    const entries = await fs.readdir(cachePath)
    const dirs = entries.filter(e => e.isDirectory() && !e.name.startsWith('.'))

    if (dirs.length === 1) {
      const subDir = join(cachePath, dirs[0]!.name)
      if (await validateKBStructure(subDir, fs)) {
        return subDir
      }
    }

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
 * Moves all contents from source directory to target directory.
 * Uses copy-then-delete for cross-device safety.
 */
export async function moveDirectoryContents(
  sourceDir: string,
  targetDir: string,
  fs: FileSystemService,
): Promise<void> {
  const entries = await fs.readdir(sourceDir)

  for (const entry of entries) {
    const sourcePath = join(sourceDir, entry.name)
    const targetPath = join(targetDir, entry.name)

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

/**
 * Copies all contents from source directory to target directory recursively.
 */
export async function copyDirectoryContents(
  fs: FileSystemService,
  sourceDir: string,
  targetDir: string,
): Promise<void> {
  await fs.mkdir(targetDir, { recursive: true })

  const entries = await fs.readdir(sourceDir)

  for (const entry of entries) {
    const sourcePath = join(sourceDir, entry.name)
    const targetPath = join(targetDir, entry.name)

    if (entry.isDirectory()) {
      await copyDirectoryContents(fs, sourcePath, targetPath)
    } else {
      const content = await fs.readFile(sourcePath)
      await fs.writeFile(targetPath, content)
    }
  }
}

/**
 * Normalize the extracted cache path to ensure KB structure exists at the root.
 * If KB content is nested inside a single subdirectory, moves it up.
 * Returns true if the cachePath contains a valid KB after normalization.
 */
export async function normalizeExtractedKB(
  cachePath: string,
  fs: FileSystemService,
): Promise<boolean> {
  let kbStructureValid = await validateKBStructure(cachePath, fs)
  if (kbStructureValid) return true

  const subDirWithKB = await findKBStructureInSubdirectories(cachePath, fs)
  if (subDirWithKB) {
    await moveDirectoryContents(subDirWithKB, cachePath, fs)
    await fs.rm(subDirWithKB, { recursive: true, force: true })
    return true
  }

  kbStructureValid = await validateKBStructure(cachePath, fs)
  return kbStructureValid
}

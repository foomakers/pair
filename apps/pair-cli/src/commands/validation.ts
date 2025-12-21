/**
 * Validation utilities for install/update commands
 * Target emptiness checks, conflict detection, path validation
 */

import type { FileSystemService } from '@pair/content-ops'

/**
 * Check if a target directory is empty or doesn't exist
 * @param targetPath Path to check
 * @param fsService FileSystemService
 * @returns { empty: boolean, exists: boolean }
 */
export async function checkTargetEmptiness(
  targetPath: string,
  fsService: FileSystemService,
): Promise<{ empty: boolean; exists: boolean }> {
  try {
    const stat = await fsService.stat(targetPath)
    if (!stat.isDirectory?.()) {
      return { empty: false, exists: true }
    }

    const entries = await fsService.readdir(targetPath)
    return { empty: entries.length === 0, exists: true }
  } catch {
    // Directory doesn't exist
    return { empty: true, exists: false }
  }
}

/**
 * Ensure target directory is empty (required for installation)
 * @param targetPath Path to check
 * @param fsService FileSystemService
 * @returns { valid: boolean, error?: string }
 */
export async function ensureTargetIsEmpty(
  targetPath: string,
  fsService: FileSystemService,
): Promise<{ valid: boolean; error?: string }> {
  const { empty, exists } = await checkTargetEmptiness(targetPath, fsService)

  if (exists && !empty) {
    return {
      valid: false,
      error: `target directory '${targetPath}' is not empty. Please remove existing content or choose a different target.`,
    }
  }

  return { valid: true }
}

/**
 * Detect overlapping target paths across multiple registries
 * Prevents installation of registries with conflicting target directories
 * @param targets Map of registry name to target path
 * @returns { overlapping: string[] }
 */
export function detectOverlappingTargets(targets: Record<string, string>): {
  overlapping: string[]
} {
  const overlapping: string[] = []
  const paths = Object.entries(targets)

  for (let i = 0; i < paths.length; i++) {
    const entry1 = paths[i]
    if (!entry1) continue
    const [name1, path1] = entry1
    for (let j = i + 1; j < paths.length; j++) {
      const entry2 = paths[j]
      if (!entry2) continue
      const [name2, path2] = entry2

      // Check if paths are the same or one contains the other
      if (path1 === path2) {
        overlapping.push(`registries '${name1}' and '${name2}' have same target: ${path1}`)
      } else if (path1.startsWith(path2 + '/') || path2.startsWith(path1 + '/')) {
        overlapping.push(
          `registry targets overlap: '${name1}' (${path1}) and '${name2}' (${path2})`,
        )
      }
    }
  }

  return { overlapping }
}

/**
 * Check multiple targets for emptiness
 * Used in install to validate all targets before proceeding
 * @param targets Map of registry name to target path
 * @param fsService FileSystemService
 * @returns { valid: boolean, errors: Array<{ registry: string, error: string }> }
 */
export async function checkTargetsEmptiness(
  targets: Record<string, string>,
  fsService: FileSystemService,
): Promise<{ valid: boolean; errors: Array<{ registry: string; error: string }> }> {
  const errors: Array<{ registry: string; error: string }> = []

  for (const [registryName, targetPath] of Object.entries(targets)) {
    const result = await ensureTargetIsEmpty(targetPath, fsService)
    if (!result.valid && result.error) {
      errors.push({ registry: registryName, error: result.error })
    }
  }

  return { valid: errors.length === 0, errors }
}

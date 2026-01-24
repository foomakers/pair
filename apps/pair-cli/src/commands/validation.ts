import { detectSourceType, SourceType, type FileSystemService } from '@pair/content-ops'

interface CommandOptions {
  source?: string
  offline?: boolean
}

/**
 * Validate command options for consistency
 */
export function validateCommandOptions(_command: string, options: CommandOptions): void {
  const { source, offline } = options

  // Validate source not empty
  if (source !== undefined && source === '') {
    throw new Error('Source path/URL cannot be empty')
  }

  // Validate offline mode requirements
  if (offline) {
    if (!source) {
      throw new Error('Offline mode requires explicit --source with local path')
    }
    const sourceType = detectSourceType(source)
    if (sourceType === SourceType.REMOTE_URL) {
      throw new Error('Cannot use --offline with remote URL source')
    }
  }
}

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

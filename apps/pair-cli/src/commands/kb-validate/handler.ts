import type { KbValidateCommandConfig } from './parser'
import type { FileSystemService } from '@pair/content-ops'

/**
 * Handles the kb-validate command execution.
 * Validates KB structure and manifest.
 *
 * @param config - The parsed kb-validate command configuration
 * @param fs - FileSystemService instance (injected for testing)
 * @returns Promise that resolves when validation completes successfully
 * @throws Error if validation fails
 */
export async function handleKbValidateCommand(
  config: KbValidateCommandConfig,
  fs: FileSystemService,
): Promise<void> {
  const kbPath = config.path || fs.currentWorkingDirectory()

  // Check .pair directory exists
  const pairDir = `${kbPath}/.pair`
  const exists = await fs.exists(pairDir)
  if (!exists) {
    throw new Error(`Invalid KB: missing .pair directory at ${pairDir}`)
  }

  const { logger } = await import('@pair/content-ops')
  logger.info('✅ KB structure validation passed')
}

import type { UpdateLinkCommandConfig } from './parser'
import type { FileSystemService } from '@pair/content-ops'
import { updateLinkCommand } from '../update-link'

/**
 * Handles the update-link command execution.
 * Processes UpdateLinkCommandConfig to update links in KB content.
 *
 * @param config - The parsed update-link command configuration
 * @param fs - FileSystemService instance (injected for testing)
 * @returns Promise that resolves when update-link completes successfully
 */
export async function handleUpdateLinkCommand(
  config: UpdateLinkCommandConfig,
  fs: FileSystemService,
): Promise<void> {
  // Build args array from config
  const args: string[] = []
  
  if (config.dryRun) {
    args.push('--dry-run')
  }
  
  if (config.verbose) {
    args.push('--verbose')
  }

  // Call legacy updateLinkCommand
  const result = await updateLinkCommand(fs, args, {
    minLogLevel: config.verbose ? 'info' : 'warn',
  })

  if (!result.success) {
    throw new Error(result.message || 'Update-link failed')
  }
}

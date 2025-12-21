import type { UpdateCommandConfig } from './parser'
import { updateCommand } from '../update'
import type { FileSystemService } from '@pair/content-ops'

/**
 * Handles the update command execution.
 * Processes UpdateCommandConfig to update KB content from various sources.
 *
 * @param config - The parsed update command configuration
 * @param fs - FileSystemService instance (injected for testing)
 * @returns Promise that resolves when update completes successfully
 * @throws Error if update fails
 */
export async function handleUpdateCommand(
  config: UpdateCommandConfig,
  fs: FileSystemService,
): Promise<void> {
  // Map new config to legacy updateCommand parameters
  const args: string[] = []
  const options: Record<string, unknown> = {}

  switch (config.resolution) {
    case 'default':
      // No URL - use default dataset
      break
    case 'remote':
      // Remote URL
      options['url'] = config.url
      break
    case 'local':
      // Local path (ZIP or directory)
      options['url'] = config.path
      options['offline'] = config.offline
      break
  }

  const result = await updateCommand(fs, args, options)
  
  if (!result || !result.success) {
    throw new Error(result?.message || 'Update failed')
  }
}

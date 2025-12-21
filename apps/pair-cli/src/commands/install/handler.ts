import type { InstallCommandConfig } from './parser'
import { installCommand } from '../install'
import type { FileSystemService } from '@pair/content-ops'

/**
 * Handles the install command execution.
 * Processes InstallCommandConfig to install KB content from various sources.
 *
 * @param config - The parsed install command configuration
 * @param fs - FileSystemService instance (injected for testing)
 * @returns Promise that resolves when installation completes successfully
 * @throws Error if installation fails
 */
export async function handleInstallCommand(
  config: InstallCommandConfig,
  fs: FileSystemService,
): Promise<void> {
  // Map new config to legacy installCommand parameters
  let source: string | undefined
  const options: Record<string, unknown> = {}

  // Pass kb flag from config
  options['kb'] = config.kb

  switch (config.resolution) {
    case 'default':
      // No source - use default KB resolution with useDefaults
      source = undefined
      options['useDefaults'] = true
      break
    case 'remote':
      // Remote URL
      source = config.url
      options['useDefaults'] = true
      break
    case 'local':
      // Local path (ZIP or directory)
      source = config.path
      options['offline'] = config.offline
      options['useDefaults'] = true
      break
  }

  // Call legacy installCommand with mapped parameters
  const result = await installCommand(fs, source ? [source] : [], options)

  if (!result || !result.success) {
    throw new Error(result?.message || 'Installation failed')
  }
}

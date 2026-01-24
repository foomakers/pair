import type { ValidateConfigCommandConfig } from './parser'
import type { FileSystemService } from '@pair/content-ops'
import { loadConfigWithOverrides } from '../../config'
import { extractRegistries, validateAllRegistries } from '../../registry'

/**
 * Handles the validate-config command execution.
 * Processes ValidateConfigCommandConfig to validate configuration files.
 *
 * @param config - The parsed validate-config command configuration
 * @param fs - FileSystemService instance (injected for testing)
 * @returns Promise that resolves when validation completes successfully
 * @throws Error if validation fails
 */
export async function handleValidateConfigCommand(
  config: ValidateConfigCommandConfig,
  fs: FileSystemService,
): Promise<void> {
  // Load config (either from custom path or default)
  const projectRoot = fs.currentWorkingDirectory()
  const result = loadConfigWithOverrides(fs, {
    ...(config.config && { customConfigPath: config.config }),
    projectRoot,
  })

  // Validate the config
  const registries = extractRegistries(result.config)
  const validation = validateAllRegistries(registries)

  if (!validation.valid) {
    const errorMessages = validation.errors.join('\n  - ')
    throw new Error(`Configuration validation failed:\n  - ${errorMessages}`)
  }
}

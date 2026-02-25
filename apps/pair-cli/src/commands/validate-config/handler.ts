import type { ValidateConfigCommandConfig } from './parser'
import type { FileSystemService } from '@pair/content-ops'
import chalk from 'chalk'
import { loadConfigWithOverrides } from '#config'
import { extractRegistries, validateAllRegistries, type RegistryConfig } from '#registry'

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

  // Validate the config - if a custom config is provided, validate only that config
  // without merging with base config (to catch errors in the user's config)
  let registries: Record<string, RegistryConfig>
  if (config.config) {
    // For custom config, read and validate only that config file
    const customConfigContent = fs.readFileSync(config.config)
    const customConfig = JSON.parse(customConfigContent) as {
      asset_registries?: Record<string, RegistryConfig>
    }
    registries = customConfig.asset_registries || {}
  } else {
    registries = extractRegistries(result.config)
  }

  const validation = validateAllRegistries(registries)

  if (!validation.valid) {
    const errorMessages = validation.errors.join('\n  - ')
    throw new Error(`Configuration validation failed:\n  - ${errorMessages}`)
  }

  const regCount = Object.keys(registries).length
  console.log(chalk.green(`✓ Configuration valid (${regCount} registries)`))
}

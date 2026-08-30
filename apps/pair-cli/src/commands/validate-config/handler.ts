import type { ValidateConfigCommandConfig } from './parser'
import type { FileSystemService } from '@pair/content-ops'
import chalk from 'chalk'
import { loadConfigWithOverrides, readEngineDeclaration } from '#config'
import { ENGINE_IDS } from '../run/engines'
import {
  extractRegistries,
  validateAllRegistries,
  resolveWorkingPathOverride,
  type RegistryConfig,
} from '#registry'

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
  let workingPathSource: unknown
  if (config.config) {
    // For custom config, read and validate only that config file
    const customConfigContent = fs.readFileSync(config.config)
    const customConfig = JSON.parse(customConfigContent) as {
      asset_registries?: Record<string, RegistryConfig>
      working_path?: string
    }
    registries = customConfig.asset_registries || {}
    workingPathSource = customConfig
  } else {
    registries = extractRegistries(result.config)
    workingPathSource = result.config
  }

  const workingPath = resolveWorkingPathOverride(workingPathSource)
  const validation = validateAllRegistries(registries, workingPath)

  // The optional `engine` block (US-451) is validated in the SAME pass as the registries, and
  // its errors are reported the same way: a malformed block must be a validation failure here
  // rather than a surprise at `pair-cli run` time. An ABSENT block adds nothing — delta-only.
  const engineBlock = readEngineDeclaration(workingPathSource, ENGINE_IDS)
  const errors = [...validation.errors, ...engineBlock.errors]

  if (errors.length > 0) {
    const errorMessages = errors.join('\n  - ')
    throw new Error(`Configuration validation failed:\n  - ${errorMessages}`)
  }

  const regCount = Object.keys(registries).length
  const engineNote = engineBlock.engine ? `, engine: ${engineBlock.engine}` : ''
  console.log(chalk.green(`✓ Configuration valid (${regCount} registries${engineNote})`))
}

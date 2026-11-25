import type { ValidateConfigCommandConfig } from './parser'
import type { FileSystemService } from '@pair/content-ops'
import { checkWorkflowTiers } from '@pair/workflows'
import chalk from 'chalk'
import { loadConfigWithOverrides, readEngineDeclaration, readRunDeclaration } from '#config'
import { mainCheckoutOrCwd } from '../run/cycle-wiring'
import { ENGINE_IDS } from '../run/engines'
import { locateConfiguration } from '../run/workflow-configuration'
import {
  extractRegistries,
  validateAllRegistries,
  resolveWorkingPathOverride,
  type Config,
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

  // A custom file is validated on its own so the base cannot mask its errors.
  const declaration = config.config
    ? (JSON.parse(fs.readFileSync(config.config)) as Config)
    : result.config
  const registries = config.config
    ? declaration.asset_registries || {}
    : extractRegistries(declaration)
  const workingPath = resolveWorkingPathOverride(declaration)
  const validation = validateAllRegistries(registries, workingPath)

  // The optional `engine` block (US-451) is validated in the SAME pass as the registries, and
  // its errors are reported the same way: a malformed block must be a validation failure here
  // rather than a surprise at `pair-cli run` time. An ABSENT block adds nothing — delta-only.
  const engineBlock = readEngineDeclaration(declaration, ENGINE_IDS)
  const runBlock = readRunDeclaration(declaration, ENGINE_IDS)
  let main: string | undefined
  const tierErrors = checkWorkflowTiers(declaration['workflows'], name => {
    main ??= mainCheckoutOrCwd(projectRoot)
    return locateConfiguration(fs, name, { cwd: projectRoot, main }) !== undefined
  })
  const errors = [...validation.errors, ...engineBlock.errors, ...runBlock.errors, ...tierErrors]

  if (errors.length > 0) {
    const errorMessages = errors.join('\n  - ')
    throw new Error(`Configuration validation failed:\n  - ${errorMessages}`)
  }

  const regCount = Object.keys(registries).length
  const engineNote = engineBlock.engine ? `, engine: ${engineBlock.engine}` : ''
  console.log(chalk.green(`✓ Configuration valid (${regCount} registries${engineNote})`))
}

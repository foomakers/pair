import type { PackageCommandConfig } from './parser'
import type { FileSystemService } from '@pair/content-ops'
import type { PackageOptions } from '../package'
import { executePackage } from '../package'

/**
 * Handles the package command execution.
 * Processes PackageCommandConfig to create KB packages.
 *
 * @param config - The parsed package command configuration
 * @param fs - FileSystemService instance (injected for testing)
 * @returns Promise that resolves when packaging completes successfully
 * @throws Error if packaging fails
 */
export async function handlePackageCommand(
  config: PackageCommandConfig,
  fs: FileSystemService,
): Promise<void> {
  // Map config to package options
  const options: PackageOptions = {}

  if (config.output) options['output'] = config.output
  if (config.sourceDir) options['sourceDir'] = config.sourceDir
  if (config.name) options['name'] = config.name
  if (config.version) options['version'] = config.version
  if (config.description) options['description'] = config.description
  if (config.author) options['author'] = config.author
  options['verbose'] = config.verbose

  await executePackage(options, fs)
}

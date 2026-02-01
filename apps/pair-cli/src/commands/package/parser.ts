/**
 * Configuration for package command
 */
export interface PackageCommandConfig {
  command: 'package'
  output?: string
  sourceDir?: string
  name?: string
  version?: string
  description?: string
  author?: string
  logLevel?: string
}

interface ParsePackageOptions {
  output?: string
  sourceDir?: string
  name?: string
  version?: string
  pkgVersion?: string
  description?: string
  author?: string
  logLevel?: string
}

/**
 * Parse package command options into PackageCommandConfig.
 *
 * Extracts package metadata and output configuration from CLI options.
 * Sets default values for logging options and optional metadata fields.
 *
 * @param options - Raw CLI options from Commander.js
 * @returns Typed PackageCommandConfig with package metadata
 */
function buildPackageConfig(options: ParsePackageOptions): Omit<PackageCommandConfig, 'command'> {
  // Support both --pkg-version (CLI) and version (programmatic) for package version
  const pkgVersion = options.pkgVersion || options.version
  const { output, sourceDir, name, description, author, logLevel } = options

  return {
    ...(output && { output }),
    ...(sourceDir && { sourceDir }),
    ...(name && { name }),
    ...(pkgVersion && { version: pkgVersion }),
    ...(description && { description }),
    ...(author && { author }),
    ...(logLevel && { logLevel }),
  }
}

export function parsePackageCommand(
  options: ParsePackageOptions,
  args: string[] = [],
): PackageCommandConfig {
  if (args.length > 0) {
    throw new Error(`Command 'package' does not accept positional arguments: ${args.join(', ')}`)
  }

  return {
    command: 'package',
    ...buildPackageConfig(options),
  }
}

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
  verbose: boolean
}

interface ParsePackageOptions {
  output?: string
  sourceDir?: string
  name?: string
  version?: string
  description?: string
  author?: string
  verbose?: boolean
}

/**
 * Parse package command options into PackageCommandConfig.
 * 
 * Extracts package metadata and output configuration from CLI options.
 * Sets default values for verbose flag and optional metadata fields.
 * 
 * @param options - Raw CLI options from Commander.js
 * @returns Typed PackageCommandConfig with package metadata
 */
export function parsePackageCommand(options: ParsePackageOptions): PackageCommandConfig {
  const { output, sourceDir, name, version, description, author, verbose = false } = options

  return {
    command: 'package',
    ...(output && { output }),
    ...(sourceDir && { sourceDir }),
    ...(name && { name }),
    ...(version && { version }),
    ...(description && { description }),
    ...(author && { author }),
    verbose,
  }
}

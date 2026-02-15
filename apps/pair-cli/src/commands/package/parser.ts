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
  layout?: 'source' | 'target'
  skipRegistries?: string[]
  root?: string
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
  layout?: string
  skipRegistries?: string
  root?: string
}

/**
 * Validates layout option value
 */
function validateLayoutOption(layout: string | undefined): 'source' | 'target' | undefined {
  if (layout !== undefined && layout !== 'source' && layout !== 'target') {
    throw new Error(`Invalid layout '${layout}'. Must be 'source' or 'target'`)
  }
  return layout as 'source' | 'target' | undefined
}

/**
 * Parses comma-separated skipRegistries option
 */
function parseSkipRegistriesOption(skipRegistries: string | undefined): string[] | undefined {
  if (skipRegistries === undefined) return undefined
  const parsed = skipRegistries.split(',').filter(s => s.trim().length > 0)
  return parsed
}

/**
 * Builds metadata config section
 */
function buildMetadataConfig(options: ParsePackageOptions): Partial<PackageCommandConfig> {
  const pkgVersion = options.pkgVersion || options.version
  return {
    ...(options.output && { output: options.output }),
    ...(options.sourceDir && { sourceDir: options.sourceDir }),
    ...(options.name && { name: options.name }),
    ...(pkgVersion && { version: pkgVersion }),
    ...(options.description && { description: options.description }),
    ...(options.author && { author: options.author }),
    ...(options.logLevel && { logLevel: options.logLevel }),
  }
}

/**
 * Builds validation config section
 */
function buildValidationConfig(options: ParsePackageOptions): Partial<PackageCommandConfig> {
  const validatedLayout = validateLayoutOption(options.layout)
  const parsedSkipRegistries = parseSkipRegistriesOption(options.skipRegistries)

  return {
    ...(validatedLayout && { layout: validatedLayout }),
    ...(parsedSkipRegistries !== undefined && { skipRegistries: parsedSkipRegistries }),
    ...(options.root && { root: options.root }),
  }
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
  return {
    ...buildMetadataConfig(options),
    ...buildValidationConfig(options),
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

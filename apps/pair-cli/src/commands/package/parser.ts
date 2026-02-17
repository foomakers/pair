import { validateLayoutOption, parseSkipRegistriesOption } from '#registry'

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
  interactive: boolean
  tags: string[]
  license: string
}

function defaultInteractiveFields(): Pick<
  PackageCommandConfig,
  'interactive' | 'tags' | 'license'
> {
  return { interactive: false, tags: [], license: 'MIT' }
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
  interactive?: boolean
  tags?: string
  license?: string
}

/**
 * Builds metadata config section
 */
function parseTags(raw?: string): string[] {
  if (!raw) return []
  return raw
    .split(',')
    .map(t => t.trim())
    .filter(Boolean)
}

function buildCoreMetadata(options: ParsePackageOptions): Partial<PackageCommandConfig> {
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

function buildInteractiveConfig(
  options: ParsePackageOptions,
): Pick<PackageCommandConfig, 'interactive' | 'tags' | 'license'> {
  const defaults = defaultInteractiveFields()
  return {
    interactive: options.interactive ?? defaults.interactive,
    tags: options.tags ? parseTags(options.tags) : defaults.tags,
    license: options.license ?? defaults.license,
  }
}

function buildMetadataConfig(options: ParsePackageOptions): Omit<PackageCommandConfig, 'command'> {
  return {
    ...defaultInteractiveFields(),
    ...buildCoreMetadata(options),
    ...buildInteractiveConfig(options),
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

import { validateLayoutOption, parseSkipRegistriesOption } from '#registry'
import { parseTagsInput } from './input-validators'
import {
  validateDistributionPolicy,
  parseComplianceTags,
  type DistributionPolicy,
} from './org-validators'

/**
 * Configuration for package command
 */
export interface PackageCommandConfig {
  command: 'package'
  config?: string
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
  org?: boolean
  orgName?: string
  team?: string
  department?: string
  approver?: string
  compliance?: string[]
  distribution?: DistributionPolicy
}

function defaultInteractiveFields(): Pick<
  PackageCommandConfig,
  'interactive' | 'tags' | 'license'
> {
  return { interactive: false, tags: [], license: 'MIT' }
}

interface ParsePackageOptions {
  config?: string
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
  org?: boolean
  orgName?: string
  team?: string
  department?: string
  approver?: string
  compliance?: string
  distribution?: string
}

function buildCoreMetadata(options: ParsePackageOptions): Partial<PackageCommandConfig> {
  const pkgVersion = options.pkgVersion || options.version
  return {
    ...(options.config && { config: options.config }),
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
    tags: options.tags ? parseTagsInput(options.tags) : defaults.tags,
    license: options.license ?? defaults.license,
  }
}

function buildOrgConfig(options: ParsePackageOptions): Partial<PackageCommandConfig> {
  if (!options.org) return {}

  return {
    org: true,
    ...(options.orgName && { orgName: options.orgName }),
    ...(options.team && { team: options.team }),
    ...(options.department && { department: options.department }),
    ...(options.approver && { approver: options.approver }),
    ...(options.compliance && { compliance: parseComplianceTags(options.compliance) }),
    ...(options.distribution && {
      distribution: validateDistributionPolicy(options.distribution),
    }),
  }
}

function buildMetadataConfig(options: ParsePackageOptions): Omit<PackageCommandConfig, 'command'> {
  return {
    ...defaultInteractiveFields(),
    ...buildCoreMetadata(options),
    ...buildInteractiveConfig(options),
    ...buildOrgConfig(options),
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

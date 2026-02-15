/**
 * Configuration for kb-validate command
 */
export interface KbValidateCommandConfig {
  command: 'kb-validate'
  path?: string
  layout?: 'source' | 'target'
  strict?: boolean
  ignoreConfig?: boolean
  skipRegistries?: string[]
}

interface ParseKbValidateOptions {
  path?: string
  layout?: string
  strict?: boolean
  ignoreConfig?: boolean
  skipRegistries?: string
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
 * Parse kb-validate command options into KbValidateCommandConfig.
 *
 * Extracts KB path for validation. If not provided, uses current directory.
 *
 * @param options - Raw CLI options from Commander.js
 * @returns Typed KbValidateCommandConfig with optional KB path
 */
export function parseKbValidateCommand(
  options: ParseKbValidateOptions,
  args: string[] = [],
): KbValidateCommandConfig {
  if (args.length > 0) {
    throw new Error(
      `Command 'kb-validate' does not accept positional arguments: ${args.join(', ')}`,
    )
  }

  const { path, layout, strict, ignoreConfig, skipRegistries } = options

  const validatedLayout = validateLayoutOption(layout)
  const parsedSkipRegistries = parseSkipRegistriesOption(skipRegistries)

  return {
    command: 'kb-validate',
    ...(path && { path }),
    ...(validatedLayout && { layout: validatedLayout }),
    ...(strict !== undefined && { strict }),
    ...(ignoreConfig !== undefined && { ignoreConfig }),
    ...(parsedSkipRegistries !== undefined && { skipRegistries: parsedSkipRegistries }),
  }
}

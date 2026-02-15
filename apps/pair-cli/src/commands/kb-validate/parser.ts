import { validateLayoutOption, parseSkipRegistriesOption } from '#registry'

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

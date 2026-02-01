/**
 * Configuration for validate-config command
 */
export interface ValidateConfigCommandConfig {
  command: 'validate-config'
  config?: string
}

interface ParseValidateConfigOptions {
  config?: string
}

/**
 * Parse validate-config command options into ValidateConfigCommandConfig.
 *
 * Extracts custom config path if provided, otherwise uses default.
 *
 * @param options - Raw CLI options from Commander.js
 * @returns Typed ValidateConfigCommandConfig with optional custom config path
 */
export function parseValidateConfigCommand(
  options: ParseValidateConfigOptions,
  args: string[] = [],
): ValidateConfigCommandConfig {
  if (args.length > 0) {
    throw new Error(
      `Command 'validate-config' does not accept positional arguments: ${args.join(', ')}`,
    )
  }
  const { config } = options

  return {
    command: 'validate-config',
    ...(config && { config }),
  }
}

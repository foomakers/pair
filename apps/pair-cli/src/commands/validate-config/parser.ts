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
): ValidateConfigCommandConfig {
  const { config } = options

  return {
    command: 'validate-config',
    ...(config && { config }),
  }
}

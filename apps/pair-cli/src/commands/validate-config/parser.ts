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
 * Parse validate-config command options into ValidateConfigCommandConfig
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

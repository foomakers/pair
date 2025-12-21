/**
 * Configuration for kb-validate command
 */
export interface KbValidateCommandConfig {
  command: 'kb-validate'
  path?: string
}

interface ParseKbValidateOptions {
  path?: string
}

/**
 * Parse kb-validate command options into KbValidateCommandConfig
 */
export function parseKbValidateCommand(
  options: ParseKbValidateOptions,
): KbValidateCommandConfig {
  const { path } = options

  return {
    command: 'kb-validate',
    ...(path && { path }),
  }
}

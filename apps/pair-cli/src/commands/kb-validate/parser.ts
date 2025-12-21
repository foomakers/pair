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
 * Parse kb-validate command options into KbValidateCommandConfig.
 *
 * Extracts KB path for validation. If not provided, uses current directory.
 *
 * @param options - Raw CLI options from Commander.js
 * @returns Typed KbValidateCommandConfig with optional KB path
 */
export function parseKbValidateCommand(options: ParseKbValidateOptions): KbValidateCommandConfig {
  const { path } = options

  return {
    command: 'kb-validate',
    ...(path && { path }),
  }
}

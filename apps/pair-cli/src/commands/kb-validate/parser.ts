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
export function parseKbValidateCommand(
  options: ParseKbValidateOptions,
  args: string[] = [],
): KbValidateCommandConfig {
  if (args.length > 0) {
    throw new Error(
      `Command 'kb-validate' does not accept positional arguments: ${args.join(', ')}`,
    )
  }
  const { path } = options

  return {
    command: 'kb-validate',
    ...(path && { path }),
  }
}

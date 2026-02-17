/**
 * Configuration for kb-info command
 */
export interface KbInfoCommandConfig {
  command: 'kb-info'
  packagePath: string
  json: boolean
}

export interface ParseKbInfoOptions {
  json?: boolean
}

/**
 * Parse kb-info command arguments.
 * Options shape matches Commander.js parsed output (same pattern as kb-verify).
 */
export function parseKbInfoCommand(
  options: ParseKbInfoOptions,
  args: string[] = [],
): KbInfoCommandConfig {
  const packagePath = args[0]
  if (!packagePath) {
    throw new Error('Package path is required. Usage: pair kb-info <package-path>')
  }

  return {
    command: 'kb-info',
    packagePath,
    json: options.json ?? false,
  }
}

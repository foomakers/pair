/**
 * Configuration for kb-info command
 */
export interface KbInfoCommandConfig {
  command: 'kb-info'
  packagePath: string
  json: boolean
}

interface ParseKbInfoOptions {
  json?: boolean
}

/**
 * Parse kb-info command arguments
 * @param options - Commander parsed options
 * @param args - Positional arguments (packagePath)
 * @returns Validated command configuration
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

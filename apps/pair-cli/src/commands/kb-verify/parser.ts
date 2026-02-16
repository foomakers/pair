/**
 * Configuration for kb-verify command
 */
export interface KbVerifyCommandConfig {
  command: 'kb-verify'
  packagePath: string
  json: boolean
}

interface ParseKbVerifyOptions {
  json?: boolean
}

/**
 * Parse kb-verify command arguments
 * @param options - Commander parsed options
 * @param args - Positional arguments (packagePath)
 * @returns Validated command configuration
 */
export function parseKbVerifyCommand(
  options: ParseKbVerifyOptions,
  args: string[] = [],
): KbVerifyCommandConfig {
  const packagePath = args[0]
  if (!packagePath) {
    throw new Error('Package path is required. Usage: pair kb-verify <package-path>')
  }

  return {
    command: 'kb-verify',
    packagePath,
    json: options.json ?? false,
  }
}

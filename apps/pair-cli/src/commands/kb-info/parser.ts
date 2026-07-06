/**
 * Configuration for kb-info command in package-display mode
 * (`pair kb-info <package-path>` — reads a KB package ZIP's manifest).
 */
export interface KbInfoPackageCommandConfig {
  command: 'kb-info'
  mode: 'package'
  packagePath: string
  json: boolean
}

/**
 * Configuration for kb-info command in version-check mode
 * (`pair kb-info` with no package path — compares installed vs current KB version).
 */
export interface KbInfoVersionCheckCommandConfig {
  command: 'kb-info'
  mode: 'version-check'
  json: boolean
  source?: string
}

export type KbInfoCommandConfig = KbInfoPackageCommandConfig | KbInfoVersionCheckCommandConfig

export interface ParseKbInfoOptions {
  json?: boolean
  source?: string
}

/**
 * Parse kb-info command arguments.
 * Options shape matches Commander.js parsed output (same pattern as kb-verify).
 *
 * - `pair kb-info <package-path>` — package-display mode (reads a KB package ZIP)
 * - `pair kb-info [--source <path|url>]` — version-check mode (installed vs current)
 */
export function parseKbInfoCommand(
  options: ParseKbInfoOptions,
  args: string[] = [],
): KbInfoCommandConfig {
  const packagePath = args[0]
  const json = options.json ?? false

  if (!packagePath) {
    return {
      command: 'kb-info',
      mode: 'version-check',
      json,
      ...(options.source && { source: options.source }),
    }
  }

  return {
    command: 'kb-info',
    mode: 'package',
    packagePath,
    json,
  }
}

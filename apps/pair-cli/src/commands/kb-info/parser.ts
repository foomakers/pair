import { namedSource } from '#config/cli'

/**
 * Configuration for kb-info command in package-display mode
 * (`pair-cli kb-info <package-path>` — reads a KB package ZIP's manifest).
 */
export interface KbInfoPackageCommandConfig {
  command: 'kb-info'
  mode: 'package'
  packagePath: string
  json: boolean
}

/**
 * Configuration for kb-info command in version-check mode
 * (`pair-cli kb-info` with no package path — compares installed vs current KB version).
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
  /** Program-level `--url`; used as the source when `--source` is absent (see `namedSource`). */
  url?: string
}

/**
 * Parse kb-info command arguments.
 * Options shape matches Commander.js parsed output (same pattern as kb-verify).
 *
 * - `pair-cli kb-info <package-path>` — package-display mode (reads a KB package ZIP)
 * - `pair-cli kb-info [--source <path|url>]` — version-check mode (installed vs current);
 *   the program-level `--url` stands in for `--source` when it is absent
 */
export function parseKbInfoCommand(
  options: ParseKbInfoOptions,
  args: string[] = [],
): KbInfoCommandConfig {
  const packagePath = args[0]
  const json = options.json ?? false

  if (!packagePath) {
    // The version reported must be the version of the source the user NAMED — the
    // program-level `--url` included, or kb-info would report the official KB while
    // `pair-cli install --url <mirror>` installs the mirror's (US-395).
    const source = namedSource(options)
    return {
      command: 'kb-info',
      mode: 'version-check',
      json,
      ...(source && { source }),
    }
  }

  return {
    command: 'kb-info',
    mode: 'package',
    packagePath,
    json,
  }
}

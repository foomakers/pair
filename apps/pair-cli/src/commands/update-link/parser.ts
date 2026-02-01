/**
 * Configuration for update-link command
 */
export interface UpdateLinkCommandConfig {
  command: 'update-link'
  url?: string
  absolute?: boolean
  dryRun: boolean
  logLevel?: string
  target?: string
}

interface ParseUpdateLinkOptions {
  url?: string
  absolute?: boolean
  dryRun?: boolean
  logLevel?: string
}

/**
 * Parse update-link command options into UpdateLinkCommandConfig.
 *
 * Processes link validation and update flags for KB content.
 * Defaults: absolute=false, dryRun=false, logLevel not set by default
 *
 * @param options - Raw CLI options from Commander.js
 * @param args - Positional arguments from Commander.js
 * @returns Typed UpdateLinkCommandConfig with dry-run and verbosity settings
 */
export function parseUpdateLinkCommand(
  options: ParseUpdateLinkOptions,
  args: string[] = [],
): UpdateLinkCommandConfig {
  const { url, absolute = false, dryRun = false, logLevel } = options
  const target = args[0]

  return {
    command: 'update-link',
    ...(url && { url }),
    ...(absolute && { absolute }),
    dryRun,
    ...(logLevel && { logLevel }),
    ...(target && { target }),
  }
}

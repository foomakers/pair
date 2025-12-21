/**
 * Configuration for update-link command
 */
export interface UpdateLinkCommandConfig {
  command: 'update-link'
  url?: string
  absolute?: boolean
  dryRun: boolean
  verbose: boolean
}

interface ParseUpdateLinkOptions {
  url?: string
  absolute?: boolean
  dryRun?: boolean
  verbose?: boolean
}

/**
 * Parse update-link command options into UpdateLinkCommandConfig.
 *
 * Processes link validation and update flags for KB content.
 * Defaults: absolute=false, dryRun=false, verbose=false
 *
 * @param options - Raw CLI options from Commander.js
 * @returns Typed UpdateLinkCommandConfig with dry-run and verbosity settings
 */
export function parseUpdateLinkCommand(options: ParseUpdateLinkOptions): UpdateLinkCommandConfig {
  const { url, absolute = false, dryRun = false, verbose = false } = options

  return {
    command: 'update-link',
    ...(url && { url }),
    ...(absolute && { absolute }),
    dryRun,
    verbose,
  }
}

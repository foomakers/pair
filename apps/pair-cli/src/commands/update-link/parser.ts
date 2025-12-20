/**
 * Configuration for update-link command
 */
export interface UpdateLinkCommandConfig {
  command: 'update-link'
  url?: string
  dryRun: boolean
  verbose: boolean
}

interface ParseUpdateLinkOptions {
  url?: string
  dryRun?: boolean
  verbose?: boolean
}

/**
 * Parse update-link command options into UpdateLinkCommandConfig
 */
export function parseUpdateLinkCommand(options: ParseUpdateLinkOptions): UpdateLinkCommandConfig {
  const { url, dryRun = false, verbose = false } = options

  return {
    command: 'update-link',
    ...(url && { url }),
    dryRun,
    verbose,
  }
}

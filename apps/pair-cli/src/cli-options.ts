/**
 * CLI options validation utilities
 */

export interface CliOptions {
  url?: string
  kb: boolean
}

/**
 * Validates CLI option combinations
 * @param options - Parsed CLI options
 * @throws Error if invalid option combination detected
 */
export function validateCliOptions(options: CliOptions): void {
  // Check for conflicting --url and --no-kb flags
  if (options.url && options.kb === false) {
    throw new Error('Cannot use --url and --no-kb together. Use --url to specify a custom KB source, or --no-kb to skip KB download entirely.')
  }
}

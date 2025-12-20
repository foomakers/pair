/**
 * Detect whether a source string is a remote URL or local path
 */
export function detectSourceType(source: string): 'remote' | 'local' {
  if (source.startsWith('http://') || source.startsWith('https://')) {
    return 'remote'
  }
  return 'local'
}

interface CommandOptions {
  source?: string
  offline?: boolean
}

/**
 * Validate command options for consistency
 */
export function validateCommandOptions(_command: string, options: CommandOptions): void {
  const { source, offline } = options

  // Validate source not empty
  if (source !== undefined && source === '') {
    throw new Error('Source path/URL cannot be empty')
  }

  // Validate offline mode requirements
  if (offline) {
    if (!source) {
      throw new Error('Offline mode requires explicit --source with local path')
    }
    if (detectSourceType(source) === 'remote') {
      throw new Error('Cannot use --offline with remote URL source')
    }
  }
}

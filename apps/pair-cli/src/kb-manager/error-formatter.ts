/**
 * Enhanced error formatting for KB download operations
 * Provides user-friendly error messages with actionable suggestions
 */

export interface ErrorContext {
  url?: string
  filePath?: string
  operation?: 'download' | 'extract' | 'checksum'
  version?: string
}

export interface FormattedError {
  message: string
  suggestion: string
  code?: string
}

export class KBDownloadError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly suggestion: string,
    public readonly context?: Record<string, unknown>,
  ) {
    super(message)
    this.name = 'KBDownloadError'
  }
}

/**
 * Format error with user-friendly message and actionable suggestion
 */
function formatConnectionError(errorMsg: string, context: ErrorContext): FormattedError | null {
  if (errorMsg.includes('econnrefused')) {
    return {
      message: `Network connection failed: Unable to reach ${context.url || 'server'}`,
      suggestion:
        'Check your internet connection and try again. If behind a proxy, verify proxy settings.',
      code: 'NETWORK_ERROR',
    }
  }

  if (errorMsg.includes('etimedout')) {
    return {
      message: `Connection timed out while accessing ${context.url || 'server'}`,
      suggestion: 'Network is slow or server is unavailable. Wait a moment and retry the download.',
      code: 'TIMEOUT_ERROR',
    }
  }

  if (errorMsg.includes('enotfound') || errorMsg.includes('getaddrinfo')) {
    return {
      message: `Could not resolve hostname: ${context.url || 'unknown'}`,
      suggestion: 'Check your DNS settings and internet connection. Verify the URL is correct.',
      code: 'DNS_ERROR',
    }
  }

  return null
}

function formatNotFoundError(errorMsg: string, context: ErrorContext): FormattedError | null {
  if (errorMsg.includes('404') || errorMsg.includes('not found')) {
    const version = context.version || extractVersionFromUrl(context.url)
    return {
      message: `File not found: The requested KB version ${
        version ? `(${version}) ` : ''
      }does not exist at ${context.url || 'server'}`,
      suggestion:
        'Check version exists in GitHub releases: https://github.com/foomakers/pair/releases',
      code: 'NOT_FOUND',
    }
  }

  return null
}

function formatFilesystemError(errorMsg: string, context: ErrorContext): FormattedError | null {
  if (errorMsg.includes('eacces') || errorMsg.includes('permission denied')) {
    return {
      message: `Permission denied: Cannot write to ${context.filePath || 'file'}`,
      suggestion:
        'Check file permissions or try running with appropriate privileges. Verify the target directory is writable.',
      code: 'PERMISSION_ERROR',
    }
  }

  if (errorMsg.includes('enospc') || errorMsg.includes('no space')) {
    return {
      message: `No disk space available to save ${context.filePath || 'file'}`,
      suggestion:
        'Free up disk space and retry the download. KB requires approximately 10MB of space.',
      code: 'DISK_FULL',
    }
  }

  return null
}

function formatOperationError(errorMsg: string, context: ErrorContext): FormattedError | null {
  if (context.operation === 'extract' || errorMsg.includes('extract')) {
    return {
      message: `Extraction failed: Could not extract ${context.filePath || 'archive'}`,
      suggestion: 'File may be corrupted. Delete the file and retry the download.',
      code: 'EXTRACT_ERROR',
    }
  }

  if (context.operation === 'checksum' || errorMsg.includes('checksum')) {
    return {
      message: `File integrity check failed: ${
        context.filePath || 'Downloaded file'
      } checksum mismatch`,
      suggestion: `Delete ${
        context.filePath || 'the file'
      } and retry the download. File may have been corrupted during transfer.`,
      code: 'CHECKSUM_ERROR',
    }
  }

  return null
}

export function formatDownloadError(error: Error, context: ErrorContext): FormattedError {
  const errorMsg = error.message.toLowerCase()

  const connectionError = formatConnectionError(errorMsg, context)
  if (connectionError) return connectionError

  const notFoundError = formatNotFoundError(errorMsg, context)
  if (notFoundError) return notFoundError

  const filesystemError = formatFilesystemError(errorMsg, context)
  if (filesystemError) return filesystemError

  const operationError = formatOperationError(errorMsg, context)
  if (operationError) return operationError

  return {
    message: `${error.message}${context.url ? `\nURL: ${context.url}` : ''}${
      context.filePath ? `\nFile: ${context.filePath}` : ''
    }`,
    suggestion:
      'Run with PAIR_DIAG=1 for detailed diagnostics. If the issue persists, report at: https://github.com/foomakers/pair/issues',
    code: 'UNKNOWN_ERROR',
  }
}

/**
 * Extract version from GitHub release URL
 */
function extractVersionFromUrl(url?: string): string | null {
  if (!url) return null
  const match = url.match(/\/releases\/download\/(v[\d.]+)\//)
  return match?.[1] ?? null
}

import { describe, it, expect } from 'vitest'
import { formatDownloadError, KBDownloadError } from './error-formatter'

// Helper: format error and check expectations
function testErrorFormat(
  errorMsg: string,
  context: Parameters<typeof formatDownloadError>[1],
  checks: { message?: string[]; suggestion?: string[] },
) {
  const error = new Error(errorMsg)
  const formatted = formatDownloadError(error, context)

  checks.message?.forEach(text => expect(formatted.message).toContain(text))
  checks.suggestion?.forEach(text => expect(formatted.suggestion).toContain(text))
}

describe('Error Formatter - Network Errors', () => {
  it('formats connection refused error', () => {
    testErrorFormat(
      'connect ECONNREFUSED',
      { url: 'https://example.com/file.zip' },
      {
        message: ['Network connection failed', 'https://example.com/file.zip'],
        suggestion: ['Check your internet connection'],
      },
    )
  })

  it('formats timeout error', () => {
    testErrorFormat(
      'ETIMEDOUT',
      { url: 'https://example.com/file.zip' },
      {
        message: ['Connection timed out'],
        suggestion: ['retry'],
      },
    )
  })

  it('formats DNS resolution error', () => {
    testErrorFormat(
      'getaddrinfo ENOTFOUND',
      { url: 'https://example.com/file.zip' },
      {
        message: ['Could not resolve hostname'],
        suggestion: ['DNS'],
      },
    )
  })

  it('formats 404 not found error', () => {
    testErrorFormat(
      'HTTP 404',
      { url: 'https://github.com/org/repo/v1.0.0/kb.zip' },
      {
        message: ['File not found', 'v1.0.0'],
        suggestion: ['Check version exists'],
      },
    )
  })
})

describe('Error Formatter - Filesystem Errors', () => {
  it('formats permission denied error', () => {
    testErrorFormat(
      'EACCES: permission denied',
      { filePath: '/path/to/file.zip' },
      {
        message: ['Permission denied', '/path/to/file.zip'],
        suggestion: ['Check file permissions'],
      },
    )
  })

  it('formats disk full error', () => {
    testErrorFormat(
      'ENOSPC: no space left on device',
      { filePath: '/path/to/file.zip' },
      {
        message: ['No disk space'],
        suggestion: ['Free up disk space'],
      },
    )
  })

  it('formats extraction error', () => {
    testErrorFormat(
      'Failed to extract',
      { operation: 'extract', filePath: '/tmp/kb.zip' },
      { message: ['Extraction failed', '/tmp/kb.zip'], suggestion: ['corrupted'] },
    )
  })
})

describe('Error Formatter - Checksum Errors', () => {
  it('formats checksum mismatch error', () => {
    testErrorFormat(
      'Checksum validation failed',
      { operation: 'checksum', filePath: '/tmp/kb.zip' },
      { message: ['File integrity check failed'], suggestion: ['Delete', 'retry'] },
    )
  })
})

describe('Error Formatter - Generic Errors', () => {
  it('formats unknown error with context', () => {
    testErrorFormat(
      'Something went wrong',
      { url: 'https://example.com/file.zip', filePath: '/tmp/file.zip' },
      {
        message: ['Something went wrong', 'https://example.com/file.zip'],
        suggestion: ['PAIR_DIAG=1'],
      },
    )
  })

  it('formats error without context', () => {
    const error = new Error('Generic error')
    const formatted = formatDownloadError(error, {})

    expect(formatted.message).toContain('Generic error')
    expect(formatted.suggestion).toBeDefined()
  })
})

describe('Error Formatter - KBDownloadError', () => {
  it('creates network error', () => {
    const error = new KBDownloadError(
      'Network connection failed',
      'NETWORK_ERROR',
      'Check your internet connection and try again',
    )

    expect(error.name).toBe('KBDownloadError')
    expect(error.code).toBe('NETWORK_ERROR')
    expect(error.suggestion).toContain('internet connection')
  })

  it('includes context in error', () => {
    const error = new KBDownloadError('Download failed', 'DOWNLOAD_ERROR', 'Retry the download', {
      url: 'https://example.com',
      attempt: 1,
    })

    expect(error.context).toEqual({ url: 'https://example.com', attempt: 1 })
  })
})

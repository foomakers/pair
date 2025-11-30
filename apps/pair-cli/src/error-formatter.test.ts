import { describe, it, expect } from 'vitest'
import { formatDownloadError, KBDownloadError } from './error-formatter'

describe('Error Formatter', () => {
  describe('Network Errors', () => {
    it('formats connection refused error', () => {
      const error = new Error('connect ECONNREFUSED')
      const formatted = formatDownloadError(error, { url: 'https://example.com/file.zip' })
      
      expect(formatted.message).toContain('Network connection failed')
      expect(formatted.message).toContain('https://example.com/file.zip')
      expect(formatted.suggestion).toContain('Check your internet connection')
    })

    it('formats timeout error', () => {
      const error = new Error('ETIMEDOUT')
      const formatted = formatDownloadError(error, { url: 'https://example.com/file.zip' })
      
      expect(formatted.message).toContain('Connection timed out')
      expect(formatted.suggestion).toContain('retry')
    })

    it('formats DNS resolution error', () => {
      const error = new Error('getaddrinfo ENOTFOUND')
      const formatted = formatDownloadError(error, { url: 'https://example.com/file.zip' })
      
      expect(formatted.message).toContain('Could not resolve hostname')
      expect(formatted.suggestion).toContain('DNS')
    })

    it('formats 404 not found error', () => {
      const error = new Error('HTTP 404')
      const formatted = formatDownloadError(error, { url: 'https://github.com/org/repo/v1.0.0/kb.zip' })
      
      expect(formatted.message).toContain('File not found')
      expect(formatted.message).toContain('v1.0.0')
      expect(formatted.suggestion).toContain('Check version exists')
    })
  })

  describe('Filesystem Errors', () => {
    it('formats permission denied error', () => {
      const error = new Error('EACCES: permission denied')
      const formatted = formatDownloadError(error, { filePath: '/path/to/file.zip' })
      
      expect(formatted.message).toContain('Permission denied')
      expect(formatted.message).toContain('/path/to/file.zip')
      expect(formatted.suggestion).toContain('Check file permissions')
    })

    it('formats disk full error', () => {
      const error = new Error('ENOSPC: no space left on device')
      const formatted = formatDownloadError(error, { filePath: '/path/to/file.zip' })
      
      expect(formatted.message).toContain('No disk space')
      expect(formatted.suggestion).toContain('Free up disk space')
    })

    it('formats extraction error', () => {
      const error = new Error('Failed to extract')
      const formatted = formatDownloadError(error, { 
        operation: 'extract',
        filePath: '/tmp/kb.zip' 
      })
      
      expect(formatted.message).toContain('Extraction failed')
      expect(formatted.message).toContain('/tmp/kb.zip')
      expect(formatted.suggestion).toContain('corrupted')
    })
  })

  describe('Checksum Errors', () => {
    it('formats checksum mismatch error', () => {
      const error = new Error('Checksum validation failed')
      const formatted = formatDownloadError(error, { 
        operation: 'checksum',
        filePath: '/tmp/kb.zip'
      })
      
      expect(formatted.message).toContain('File integrity check failed')
      expect(formatted.suggestion).toContain('Delete')
      expect(formatted.suggestion).toContain('retry')
    })
  })

  describe('Generic Errors', () => {
    it('formats unknown error with context', () => {
      const error = new Error('Something went wrong')
      const formatted = formatDownloadError(error, { 
        url: 'https://example.com/file.zip',
        filePath: '/tmp/file.zip'
      })
      
      expect(formatted.message).toContain('Something went wrong')
      expect(formatted.message).toContain('https://example.com/file.zip')
      expect(formatted.suggestion).toContain('PAIR_DIAG=1')
    })

    it('formats error without context', () => {
      const error = new Error('Generic error')
      const formatted = formatDownloadError(error, {})
      
      expect(formatted.message).toContain('Generic error')
      expect(formatted.suggestion).toBeDefined()
    })
  })

  describe('KBDownloadError', () => {
    it('creates network error', () => {
      const error = new KBDownloadError(
        'Network connection failed',
        'NETWORK_ERROR',
        'Check your internet connection and try again'
      )
      
      expect(error.name).toBe('KBDownloadError')
      expect(error.code).toBe('NETWORK_ERROR')
      expect(error.suggestion).toContain('internet connection')
    })

    it('includes context in error', () => {
      const error = new KBDownloadError(
        'Download failed',
        'DOWNLOAD_ERROR',
        'Retry the download',
        { url: 'https://example.com', attempt: 1 }
      )
      
      expect(error.context).toEqual({ url: 'https://example.com', attempt: 1 })
    })
  })
})

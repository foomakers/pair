import { describe, it, expect } from 'vitest'
import { validateKBUrl, isValidHttpUrl } from './url-validator'

describe('URL Validation', () => {
  describe('isValidHttpUrl', () => {
    it('accepts valid HTTP URLs', () => {
      expect(isValidHttpUrl('http://example.com/kb.zip')).toBe(true)
    })

    it('accepts valid HTTPS URLs', () => {
      expect(isValidHttpUrl('https://example.com/kb.zip')).toBe(true)
    })

    it('rejects file:// protocol', () => {
      expect(isValidHttpUrl('file:///path/to/kb.zip')).toBe(false)
    })

    it('rejects ftp:// protocol', () => {
      expect(isValidHttpUrl('ftp://example.com/kb.zip')).toBe(false)
    })

    it('rejects invalid URL format', () => {
      expect(isValidHttpUrl('not-a-url')).toBe(false)
    })

    it('rejects empty string', () => {
      expect(isValidHttpUrl('')).toBe(false)
    })
  })

  describe('validateKBUrl', () => {
    it('returns valid URL unchanged', () => {
      const url = 'https://example.com/kb.zip'
      expect(validateKBUrl(url)).toBe(url)
    })

    it('throws error for invalid protocol', () => {
      expect(() => validateKBUrl('file:///path/kb.zip')).toThrow('Invalid URL protocol')
      expect(() => validateKBUrl('file:///path/kb.zip')).toThrow('Only http:// and https://')
    })

    it('throws error for malformed URL', () => {
      expect(() => validateKBUrl('not-a-url')).toThrow('Invalid URL format')
    })

    it('provides helpful error message', () => {
      expect(() => validateKBUrl('ftp://example.com/kb.zip')).toThrow(
        'Invalid URL protocol: ftp:. Only http:// and https:// are allowed.',
      )
    })
  })
})

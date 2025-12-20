import { describe, it, expect } from 'vitest'
import { detectSourceType, validateCommandOptions } from './helpers'

describe('detectSourceType', () => {
  it('detects http URLs as remote', () => {
    expect(detectSourceType('http://example.com/kb.zip')).toBe('remote')
  })

  it('detects https URLs as remote', () => {
    expect(detectSourceType('https://example.com/kb.zip')).toBe('remote')
  })

  it('detects absolute paths as local', () => {
    expect(detectSourceType('/absolute/path/to/kb')).toBe('local')
  })

  it('detects relative paths as local', () => {
    expect(detectSourceType('./relative/path')).toBe('local')
    expect(detectSourceType('../parent/path')).toBe('local')
  })

  it('detects plain names as local', () => {
    expect(detectSourceType('kb-folder')).toBe('local')
  })
})

describe('validateCommandOptions', () => {
  describe('install command', () => {
    it('allows offline with local source', () => {
      expect(() => {
        validateCommandOptions('install', {
          source: '/local/kb',
          offline: true,
        })
      }).not.toThrow()
    })

    it('throws when offline without source', () => {
      expect(() => {
        validateCommandOptions('install', { offline: true })
      }).toThrow('Offline mode requires explicit --source with local path')
    })

    it('throws when offline with remote URL', () => {
      expect(() => {
        validateCommandOptions('install', {
          source: 'https://example.com/kb.zip',
          offline: true,
        })
      }).toThrow('Cannot use --offline with remote URL source')
    })

    it('throws when source is empty', () => {
      expect(() => {
        validateCommandOptions('install', { source: '' })
      }).toThrow('Source path/URL cannot be empty')
    })
  })

  describe('update command', () => {
    it('validates same rules as install', () => {
      expect(() => {
        validateCommandOptions('update', { offline: true })
      }).toThrow('Offline mode requires explicit --source with local path')
    })
  })
})

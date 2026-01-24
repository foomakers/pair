import { describe, it, expect } from 'vitest'
import { validateCommandOptions, checkTargetEmptiness } from './validation'
import { createTestFs } from '../test-utils'

describe('command validation - validateCommandOptions', () => {
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
})

describe('fs validation - checkTargetEmptiness', () => {
  it('returns empty if directory does not exist', async () => {
    const fs = createTestFs({}, {}, '/test')
    const result = await checkTargetEmptiness('/test/missing', fs)
    expect(result.empty).toBe(true)
    expect(result.exists).toBe(false)
  })

  it('returns empty if directory is empty', async () => {
    const fs = createTestFs({}, {}, '/test')
    await fs.mkdir('/test/empty', { recursive: true })
    const result = await checkTargetEmptiness('/test/empty', fs)
    expect(result.empty).toBe(true)
    expect(result.exists).toBe(true)
  })

  it('returns not empty if directory has files', async () => {
    const fs = createTestFs({}, { '/test/full/file.txt': 'hi' }, '/test')
    const result = await checkTargetEmptiness('/test/full', fs)
    expect(result.empty).toBe(false)
    expect(result.exists).toBe(true)
  })
})

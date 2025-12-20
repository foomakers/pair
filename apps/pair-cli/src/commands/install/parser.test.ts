import { describe, it, expect } from 'vitest'
import { parseInstallCommand } from './parser'

describe('parseInstallCommand', () => {
  describe('default resolution', () => {
    it('creates InstallCommandConfig with default resolution when no options provided', () => {
      const config = parseInstallCommand({})

      expect(config).toEqual({
        command: 'install',
        resolution: 'default',
        offline: false,
      })
    })
  })

  describe('remote source', () => {
    it('creates InstallCommandConfig with remote URL source', () => {
      const config = parseInstallCommand({
        source: 'https://example.com/kb.zip',
      })

      expect(config).toEqual({
        command: 'install',
        resolution: 'remote',
        url: 'https://example.com/kb.zip',
        offline: false,
      })
    })

    it('handles http URLs', () => {
      const config = parseInstallCommand({
        source: 'http://example.com/kb.zip',
      })

      expect(config.resolution).toBe('remote')
      expect(config.url).toBe('http://example.com/kb.zip')
    })
  })

  describe('local source', () => {
    it('creates InstallCommandConfig with local path', () => {
      const config = parseInstallCommand({
        source: '/absolute/path/to/kb',
      })

      expect(config).toEqual({
        command: 'install',
        resolution: 'local',
        path: '/absolute/path/to/kb',
        offline: false,
      })
    })

    it('handles relative paths', () => {
      const config = parseInstallCommand({
        source: './relative/path',
      })

      expect(config.resolution).toBe('local')
      expect(config.path).toBe('./relative/path')
    })
  })

  describe('offline mode', () => {
    it('creates offline config with local source', () => {
      const config = parseInstallCommand({
        source: '/local/kb',
        offline: true,
      })

      expect(config).toEqual({
        command: 'install',
        resolution: 'local',
        path: '/local/kb',
        offline: true,
      })
    })

    it('throws error when offline without source', () => {
      expect(() => {
        parseInstallCommand({ offline: true })
      }).toThrow('Offline mode requires explicit --source with local path')
    })

    it('throws error when offline with remote URL', () => {
      expect(() => {
        parseInstallCommand({
          source: 'https://example.com/kb.zip',
          offline: true,
        })
      }).toThrow('Cannot use --offline with remote URL source')
    })
  })

  describe('validation', () => {
    it('throws error when source is empty string', () => {
      expect(() => {
        parseInstallCommand({ source: '' })
      }).toThrow('Source path/URL cannot be empty')
    })
  })
})

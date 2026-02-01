import { describe, it, expect } from 'vitest'
import { parseUpdateCommand } from './parser'

describe('parseUpdateCommand', () => {
  describe('default resolution', () => {
    it('creates UpdateCommandConfig with default resolution', () => {
      const config = parseUpdateCommand({})

      expect(config).toEqual({
        command: 'update',
        kb: true,
        resolution: 'default',
        offline: false,
      })
    })
  })

  describe('remote source', () => {
    it('creates UpdateCommandConfig with remote URL', () => {
      const config = parseUpdateCommand({
        source: 'https://example.com/kb.zip',
      })

      expect(config).toEqual({
        command: 'update',
        kb: true,
        resolution: 'remote',
        url: 'https://example.com/kb.zip',
        offline: false,
      })
    })
  })

  describe('local source', () => {
    it('creates UpdateCommandConfig with local path', () => {
      const config = parseUpdateCommand({
        source: '/local/kb',
      })

      expect(config).toEqual({
        command: 'update',
        kb: true,
        resolution: 'local',
        path: '/local/kb',
        offline: false,
      })
    })
  })

  describe('offline mode', () => {
    it('creates offline config with local source', () => {
      const config = parseUpdateCommand({
        source: './kb',
        offline: true,
      })

      expect(config.offline).toBe(true)
    })

    it('throws error when offline without source', () => {
      expect(() => {
        parseUpdateCommand({ offline: true })
      }).toThrow('Offline mode requires explicit --source with local path')
    })
  })
})

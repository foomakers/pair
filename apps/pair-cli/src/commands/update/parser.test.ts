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

  describe('git source', () => {
    it('creates UpdateCommandConfig with git HTTPS URL', () => {
      const config = parseUpdateCommand({
        source: 'https://github.com/org/repo.git',
      })

      expect(config).toEqual({
        command: 'update',
        kb: true,
        resolution: 'git',
        url: 'https://github.com/org/repo.git',
        offline: false,
      })
    })

    it('handles git@ SSH URL', () => {
      const config = parseUpdateCommand({
        source: 'git@github.com:org/repo.git',
      })

      expect(config.resolution).toBe('git')
    })

    it('throws error when offline with git source', () => {
      expect(() => {
        parseUpdateCommand({
          source: 'git@github.com:org/repo.git',
          offline: true,
        })
      }).toThrow('Cannot use --offline with git repository source')
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

  describe('validation', () => {
    it('throws on unsupported ftp:// protocol', () => {
      expect(() => {
        parseUpdateCommand({ source: 'ftp://example.com/kb.zip' })
      }).toThrow('Unsupported source protocol')
    })
  })
})

/**
 * US-395 review round 12 — same rule as install: a program-level `--url` names the source
 * when the command names none, so `pair-cli update --url <mirror>` updates from the mirror
 * instead of silently updating from the official KB.
 */
describe('US-395: the program-level --url names the source when --source does not', () => {
  it('resolves a remote --url as a remote source', () => {
    const config = parseUpdateCommand({ url: 'https://mirror.internal/kb.zip' })

    expect(config).toEqual({
      command: 'update',
      kb: true,
      resolution: 'remote',
      url: 'https://mirror.internal/kb.zip',
      offline: false,
    })
  })

  it('lets an explicit --source outrank --url', () => {
    const config = parseUpdateCommand({
      source: '/local/kb',
      url: 'https://mirror.internal/kb.zip',
    })

    expect(config.resolution).toBe('local')
  })
})

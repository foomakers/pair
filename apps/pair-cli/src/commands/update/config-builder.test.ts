import { describe, it, expect, beforeEach } from 'vitest'
import { InMemoryFileSystemService } from '@pair/content-ops'
import { buildUpdateOptions } from './config-builder'
import type { UpdateCommandConfig } from './parser'

describe('update config-builder', () => {
  let fsService: InMemoryFileSystemService

  beforeEach(async () => {
    fsService = new InMemoryFileSystemService({}, '/workspace/pair', '/workspace/pair')
  })

  describe('buildUpdateOptions', () => {
    it('builds options for remote config', () => {
      const config: UpdateCommandConfig = {
        command: 'update',
        resolution: 'remote',
        url: 'https://example.com/kb.zip',
      }

      const result = buildUpdateOptions(config, fsService)

      expect(result).toEqual({
        source: 'https://example.com/kb.zip',
        offlineMode: false,
      })
    })

    it('builds options for local config with offline mode', () => {
      const config: UpdateCommandConfig = {
        command: 'update',
        resolution: 'local',
        path: '/local/kb',
        offline: true,
      }

      const result = buildUpdateOptions(config, fsService)

      expect(result).toEqual({
        source: '/local/kb',
        offlineMode: true,
      })
    })

    it('builds options for default config in monorepo', async () => {
      await fsService.writeFile('/workspace/pair/packages/knowledge-hub/package.json', '{}')

      const config: UpdateCommandConfig = {
        command: 'update',
        resolution: 'default',
      }

      const result = buildUpdateOptions(config, fsService)

      expect(result.source).toContain('knowledge-hub/dataset')
      expect(result.offlineMode).toBe(false)
    })

    it('builds options for default config outside monorepo', () => {
      const config: UpdateCommandConfig = {
        command: 'update',
        resolution: 'default',
      }

      const result = buildUpdateOptions(config, fsService)

      expect(result).toEqual({
        source: '',
        offlineMode: false,
      })
    })
  })
})

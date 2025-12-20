import { describe, it, expect, beforeEach } from 'vitest'
import { InMemoryFileSystemService } from '@pair/content-ops'
import { buildInstallOptions } from './config-builder'
import { isInPairMonorepo } from '../helpers'
import type { InstallCommandConfig } from './parser'

describe('install config-builder', () => {
  let fsService: InMemoryFileSystemService

  beforeEach(async () => {
    fsService = new InMemoryFileSystemService({}, '/workspace/pair', '/workspace/pair')
  })

  describe('isInPairMonorepo', () => {
    it('returns true when packages/knowledge-hub/package.json exists', async () => {
      await fsService.writeFile('/workspace/pair/packages/knowledge-hub/package.json', '{}')

      expect(isInPairMonorepo(fsService)).toBe(true)
    })

    it('returns false when packages/knowledge-hub/package.json does not exist', () => {
      expect(isInPairMonorepo(fsService)).toBe(false)
    })
  })

  describe('buildInstallOptions', () => {
    it('builds options for remote config', () => {
      const config: InstallCommandConfig = {
        command: 'install',
        resolution: 'remote',
        url: 'https://example.com/kb.zip',
      }

      const result = buildInstallOptions(config, fsService)

      expect(result).toEqual({
        source: 'https://example.com/kb.zip',
        offlineMode: false,
      })
    })

    it('builds options for local config with offline mode', () => {
      const config: InstallCommandConfig = {
        command: 'install',
        resolution: 'local',
        path: '/local/kb',
        offline: true,
      }

      const result = buildInstallOptions(config, fsService)

      expect(result).toEqual({
        source: '/local/kb',
        offlineMode: true,
      })
    })

    it('builds options for local config without offline mode', () => {
      const config: InstallCommandConfig = {
        command: 'install',
        resolution: 'local',
        path: './kb',
        offline: false,
      }

      const result = buildInstallOptions(config, fsService)

      expect(result).toEqual({
        source: './kb',
        offlineMode: false,
      })
    })

    it('builds options for default config in monorepo', async () => {
      await fsService.writeFile('/workspace/pair/packages/knowledge-hub/package.json', '{}')

      const config: InstallCommandConfig = {
        command: 'install',
        resolution: 'default',
      }

      const result = buildInstallOptions(config, fsService)

      expect(result.source).toContain('knowledge-hub/dataset')
      expect(result.offlineMode).toBe(false)
    })

    it('builds options for default config outside monorepo', () => {
      const config: InstallCommandConfig = {
        command: 'install',
        resolution: 'default',
      }

      const result = buildInstallOptions(config, fsService)

      expect(result).toEqual({
        source: '',
        offlineMode: false,
      })
    })
  })
})

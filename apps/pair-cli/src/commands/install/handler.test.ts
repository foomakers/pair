import { describe, expect, beforeEach, vi, test } from 'vitest'
import { handleInstallCommand } from './handler'
import type { InstallCommandConfig } from './parser'
import { createTestFileSystem } from '../../test-utils'
import type { InMemoryFileSystemService } from '@pair/content-ops'

// Mock config-utils and command-utils
vi.mock('../../config-utils', () => ({
  loadConfigWithOverrides: vi.fn(() => ({
    config: {
      asset_registries: {
        'test-registry': {
          source: 'test-source',
          behavior: 'mirror',
          target_path: '.test-install-target',
          description: 'Test registry',
        },
      },
    },
    source: 'test-config-source',
  })),
  getKnowledgeHubDatasetPath: vi.fn(() => '/test-dataset'),
  getKnowledgeHubDatasetPathWithFallback: vi.fn().mockResolvedValue('/test-dataset-fallback'),
  calculatePathType: vi.fn(),
}))

vi.mock('../../kb-manager/kb-installer', () => ({
  installKBFromLocalZip: vi.fn().mockResolvedValue('/test-local-zip-cache'),
}))

vi.mock('../command-utils', () => ({
  createLogger: vi.fn(() => ({
    logs: [],
    pushLog: vi.fn(),
  })),
  parseTargetAndSource: vi.fn(),
  doCopyAndUpdateLinks: vi.fn().mockResolvedValue(undefined),
  applyLinkTransformation: vi.fn().mockResolvedValue(undefined),
  ensureDir: vi.fn().mockResolvedValue(undefined),
}))

describe('handleInstallCommand - direct implementation', () => {
  let fs: InMemoryFileSystemService

  beforeEach(() => {
    fs = createTestFileSystem()
    vi.clearAllMocks()
  })

  describe('default resolution', () => {
    test('installs from default dataset root', async () => {
      const config: InstallCommandConfig = {
        command: 'install',
        resolution: 'default',
        kb: true,
        offline: false,
      }

      await expect(handleInstallCommand(config, fs)).resolves.not.toThrow()

      const { doCopyAndUpdateLinks } = await import('../command-utils')
      expect(doCopyAndUpdateLinks).toHaveBeenCalled()
    })
  })

  describe('remote resolution', () => {
    test('handles remote URL source', async () => {
      const config: InstallCommandConfig = {
        command: 'install',
        resolution: 'remote',
        url: 'https://example.com/kb.zip',
        offline: false,
        kb: true,
      }

      await expect(handleInstallCommand(config, fs)).resolves.not.toThrow()
    })
  })

  describe('local resolution', () => {
    test('handles local path source', async () => {
      const config: InstallCommandConfig = {
        command: 'install',
        resolution: 'local',
        path: '/path/to/kb.zip',
        offline: false,
        kb: true,
      }

      await expect(handleInstallCommand(config, fs)).resolves.not.toThrow()
    })
  })

  describe('link style transformation', () => {
    test('applies link transformation when specified', async () => {
      const config: InstallCommandConfig = {
        command: 'install',
        resolution: 'default',
        kb: true,
        offline: false,
      }

      await expect(
        handleInstallCommand(config, fs, { linkStyle: 'relative' }),
      ).resolves.not.toThrow()

      const { applyLinkTransformation } = await import('../command-utils')
      expect(applyLinkTransformation).toHaveBeenCalledWith(
        fs,
        { linkStyle: 'relative' },
        expect.any(Function),
        'install',
      )
    })
  })

  describe('error handling', () => {
    test('throws on invalid registry configuration', async () => {
      const { loadConfigWithOverrides } = await import('../../config-utils')
      vi.mocked(loadConfigWithOverrides).mockReturnValueOnce({
        config: {
          asset_registries: {},
        },
        source: 'empty-config',
      })

      const config: InstallCommandConfig = {
        command: 'install',
        resolution: 'default',
        kb: true,
        offline: false,
      }

      await expect(handleInstallCommand(config, fs)).rejects.toThrow(/asset_registries/)
    })
  })
})

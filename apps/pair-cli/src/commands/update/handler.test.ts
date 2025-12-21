import { describe, expect, beforeEach, vi, test } from 'vitest'
import { handleUpdateCommand } from './handler'
import type { UpdateCommandConfig } from './parser'
import { createTestFileSystem } from '../test-utils'
import type { InMemoryFileSystemService } from '@pair/content-ops'

// Mock config-utils and command-utils
vi.mock('../../config-utils', () => ({
  loadConfigWithOverrides: vi.fn(() => ({
    config: {
      asset_registries: {
        'test-registry': {
          source: 'test-source',
          behavior: 'mirror',
          target_path: '.test-update-target',
          description: 'Test registry',
        },
      },
    },
  })),
  getKnowledgeHubDatasetPath: vi.fn(() => '/test-dataset'),
  calculatePathType: vi.fn(),
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

vi.mock('../backup', () => ({
  handleBackupRollback: vi.fn().mockResolvedValue(undefined),
  buildRegistryBackupConfig: vi.fn(() => ({ 'test-registry': '/test-update-target' })),
}))

describe('handleUpdateCommand - direct implementation', () => {
  let fs: InMemoryFileSystemService

  beforeEach(() => {
    fs = createTestFileSystem()
    vi.clearAllMocks()
  })

  describe('default resolution', () => {
    test('updates from default dataset root', async () => {
      const config: UpdateCommandConfig = {
        command: 'update',
        resolution: 'default',
        kb: true,
      }

      await expect(handleUpdateCommand(config, fs)).resolves.not.toThrow()

      const { doCopyAndUpdateLinks } = await import('../command-utils')
      expect(doCopyAndUpdateLinks).toHaveBeenCalled()
    })
  })

  describe('remote resolution', () => {
    test('handles remote URL source', async () => {
      const config: UpdateCommandConfig = {
        command: 'update',
        resolution: 'remote',
        url: 'https://example.com/kb.zip',
        offline: false,
        kb: true,
      }

      await expect(handleUpdateCommand(config, fs)).resolves.not.toThrow()
    })
  })

  describe('local resolution', () => {
    test('handles local path source', async () => {
      const config: UpdateCommandConfig = {
        command: 'update',
        resolution: 'local',
        path: '/path/to/kb.zip',
        offline: false,
        kb: true,
      }

      await expect(handleUpdateCommand(config, fs)).resolves.not.toThrow()
    })
  })

  describe('link style transformation', () => {
    test('applies link transformation when specified', async () => {
      const config: UpdateCommandConfig = {
        command: 'update',
        resolution: 'default',
        kb: true,
      }

      await expect(
        handleUpdateCommand(config, fs, { linkStyle: 'relative' }),
      ).resolves.not.toThrow()

      const { applyLinkTransformation } = await import('../command-utils')
      expect(applyLinkTransformation).toHaveBeenCalledWith(
        fs,
        { linkStyle: 'relative' },
        expect.any(Function),
        'update',
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
      })

      const config: UpdateCommandConfig = {
        command: 'update',
        resolution: 'default',
        kb: true,
      }

      await expect(handleUpdateCommand(config, fs)).rejects.toThrow(/asset registries/)
    })
  })
})

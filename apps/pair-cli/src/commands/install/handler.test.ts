import { describe, expect, beforeEach, vi } from 'vitest'
import { handleInstallCommand } from './handler'
import type { InstallCommandConfig } from './parser'
import { createTestFileSystem } from '../test-utils'
import type { InMemoryFileSystemService } from '@pair/content-ops'

// Mock legacy installCommand
vi.mock('../install', () => ({
  installCommand: vi.fn().mockResolvedValue({ success: true }),
}))

describe('handleInstallCommand - unit tests with mocked legacy command', () => {
  let fs: InMemoryFileSystemService

  beforeEach(() => {
    fs = createTestFileSystem()
    vi.clearAllMocks()
  })

  describe('config to legacy args mapping', () => {
    test('maps default resolution to useDefaults flag', async () => {
      const config: InstallCommandConfig = {
        command: 'install',
        kb: true,
        resolution: 'default',
      }

      await handleInstallCommand(config, fs)

      const { installCommand } = await import('../install')
      expect(installCommand).toHaveBeenCalledWith(
        fs, // filesystem first
        [], // args (empty for default)
        expect.objectContaining({
          kb: true,
          useDefaults: true,
        }),
      )
    })

    test('maps remote URL to source parameter', async () => {
      const config: InstallCommandConfig = {
        command: 'install',
        kb: true,
        resolution: 'remote',
        url: 'https://example.com/kb.zip',
        offline: false,
      }

      await handleInstallCommand(config, fs)

      const { installCommand } = await import('../install')
      expect(installCommand).toHaveBeenCalledWith(
        fs,
        ['https://example.com/kb.zip'],
        expect.objectContaining({
          kb: true,
          useDefaults: true,
        }),
      )
    })

    test('maps local source to source parameter', async () => {
      const config: InstallCommandConfig = {
        command: 'install',
        kb: true,
        resolution: 'local',
        source: '/path/to/kb.zip',
      }

      await handleInstallCommand(config, fs)

      const { installCommand } = await import('../install')
      expect(installCommand).toHaveBeenCalledWith(
        fs,
        [],
        expect.objectContaining({
          kb: true,
        }),
      )
    })

    test('preserves kb flag', async () => {
      const config: InstallCommandConfig = {
        command: 'install',
        kb: false,
        resolution: 'default',
      }

      await handleInstallCommand(config, fs)

      const { installCommand } = await import('../install')
      expect(installCommand).toHaveBeenCalledWith(
        fs,
        [],
        expect.objectContaining({
          kb: false,
        }),
      )
    })
  })
})

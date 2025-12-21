import { describe, expect, beforeEach, vi } from 'vitest'
import { handleUpdateCommand } from './handler'
import type { UpdateCommandConfig } from './parser'
import { createTestFileSystem } from '../test-utils'
import type { InMemoryFileSystemService } from '@pair/content-ops'

// Mock legacy updateCommand
vi.mock('../update', () => ({
  updateCommand: vi.fn().mockResolvedValue({ success: true }),
}))

describe('handleUpdateCommand - unit tests with mocked legacy command', () => {
  let fs: InMemoryFileSystemService

  beforeEach(() => {
    fs = createTestFileSystem()
    vi.clearAllMocks()
  })

  describe('config to legacy args mapping', () => {
    test('maps default resolution to useDefaults flag', async () => {
      const config: UpdateCommandConfig = {
        command: 'update',
        kb: true,
        resolution: 'default',
      }

      await handleUpdateCommand(config, fs)

      const { updateCommand } = await import('../update')
      expect(updateCommand).toHaveBeenCalledWith(
        fs,
        [],
        expect.objectContaining({
          kb: true,
          useDefaults: true,
        }),
      )
    })

    test('maps remote URL to args array', async () => {
      const config: UpdateCommandConfig = {
        command: 'update',
        kb: true,
        resolution: 'remote',
        url: 'https://example.com/kb.zip',
        offline: false,
      }

      await handleUpdateCommand(config, fs)

      const { updateCommand } = await import('../update')
      expect(updateCommand).toHaveBeenCalledWith(
        fs,
        [],
        expect.objectContaining({
          kb: true,
          url: 'https://example.com/kb.zip',
          useDefaults: true,
        }),
      )
    })

    test('maps local source to args array', async () => {
      const config: UpdateCommandConfig = {
        command: 'update',
        kb: true,
        resolution: 'local',
        source: '/path/to/kb.zip',
      }

      await handleUpdateCommand(config, fs)

      const { updateCommand } = await import('../update')
      expect(updateCommand).toHaveBeenCalledWith(
        fs,
        [],
        expect.objectContaining({
          kb: true,
        }),
      )
    })

    test('preserves kb flag', async () => {
      const config: UpdateCommandConfig = {
        command: 'update',
        kb: false,
        resolution: 'default',
      }

      await handleUpdateCommand(config, fs)

      const { updateCommand } = await import('../update')
      expect(updateCommand).toHaveBeenCalledWith(
        fs,
        [],
        expect.objectContaining({
          kb: false,
        }),
      )
    })

    test('maps targets array to args', async () => {
      const config: UpdateCommandConfig = {
        command: 'update',
        kb: true,
        resolution: 'targets',
        targets: ['github:.github', 'adoption:.pair'],
      }

      await handleUpdateCommand(config, fs)

      const { updateCommand } = await import('../update')
      expect(updateCommand).toHaveBeenCalledWith(
        fs,
        [],
        expect.objectContaining({
          kb: true,
        }),
      )
    })
  })
})

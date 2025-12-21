import { describe, expect, beforeEach, vi } from 'vitest'
import { handleUpdateLinkCommand } from './handler'
import type { UpdateLinkCommandConfig } from './parser'
import { createTestFileSystem } from '../test-utils'
import type { InMemoryFileSystemService } from '@pair/content-ops'

// Mock legacy updateLinkCommand
vi.mock('../update-link', () => ({
  updateLinkCommand: vi.fn().mockResolvedValue({ success: true }),
}))

describe('handleUpdateLinkCommand - unit tests with mocked legacy command', () => {
  let fs: InMemoryFileSystemService

  beforeEach(() => {
    fs = createTestFileSystem()
    vi.clearAllMocks()
  })

  describe('config to legacy args mapping', () => {
    test('maps default config to empty args', async () => {
      const config: UpdateLinkCommandConfig = {
        command: 'update-link',
        dryRun: false,
        verbose: false,
      }

      await handleUpdateLinkCommand(config, fs)

      const { updateLinkCommand } = await import('../update-link')
      expect(updateLinkCommand).toHaveBeenCalledWith(
        fs,
        [],
        expect.objectContaining({
          minLogLevel: 'warn',
        }),
      )
    })

    test('maps dryRun flag to args', async () => {
      const config: UpdateLinkCommandConfig = {
        command: 'update-link',
        dryRun: true,
        verbose: false,
      }

      await handleUpdateLinkCommand(config, fs)

      const { updateLinkCommand } = await import('../update-link')
      expect(updateLinkCommand).toHaveBeenCalledWith(fs, ['--dry-run'], expect.any(Object))
    })

    test('maps verbose flag to args and options', async () => {
      const config: UpdateLinkCommandConfig = {
        command: 'update-link',
        dryRun: false,
        verbose: true,
      }

      await handleUpdateLinkCommand(config, fs)

      const { updateLinkCommand } = await import('../update-link')
      expect(updateLinkCommand).toHaveBeenCalledWith(
        fs,
        ['--verbose'],
        expect.objectContaining({
          minLogLevel: 'info',
        }),
      )
    })

    test('maps both flags', async () => {
      const config: UpdateLinkCommandConfig = {
        command: 'update-link',
        dryRun: true,
        verbose: true,
      }

      await handleUpdateLinkCommand(config, fs)

      const { updateLinkCommand } = await import('../update-link')
      expect(updateLinkCommand).toHaveBeenCalledWith(
        fs,
        ['--dry-run', '--verbose'],
        expect.objectContaining({
          minLogLevel: 'info',
        }),
      )
    })

    test('throws on legacy command failure', async () => {
      const { updateLinkCommand } = await import('../update-link')
      vi.mocked(updateLinkCommand).mockResolvedValueOnce({ success: false, message: 'Test error' })

      const config: UpdateLinkCommandConfig = {
        command: 'update-link',
        dryRun: false,
        verbose: false,
      }

      await expect(handleUpdateLinkCommand(config, fs)).rejects.toThrow('Test error')
    })
  })
})

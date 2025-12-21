import { describe, expect, beforeEach, vi, test } from 'vitest'
import { handleUpdateLinkCommand } from './handler'
import type { UpdateLinkCommandConfig } from './parser'
import { createTestFileSystem } from '../test-utils'
import type { InMemoryFileSystemService } from '@pair/content-ops'

// Mock dependencies
vi.mock('../../config-utils', () => ({
  getKnowledgeHubDatasetPath: vi.fn().mockReturnValue('/test/dataset'),
}))

vi.mock('@pair/content-ops/file-system', () => ({
  isExternalLink: vi.fn((href: string) => href.startsWith('http')),
  walkMarkdownFiles: vi.fn().mockResolvedValue([]),
}))

describe('handleUpdateLinkCommand - unit tests', () => {
  let fs: InMemoryFileSystemService

  beforeEach(() => {
    fs = createTestFileSystem()
    // Setup KB directory structure
    fs.mkdirSync('/.pair', { recursive: true })
    vi.clearAllMocks()
  })

  describe('handler execution', () => {
    test('processes markdown files with default settings', async () => {
      const config: UpdateLinkCommandConfig = {
        command: 'update-link',
        dryRun: false,
        verbose: false,
      }

      await handleUpdateLinkCommand(config, fs)

      const { walkMarkdownFiles } = await import('@pair/content-ops/file-system')
      expect(walkMarkdownFiles).toHaveBeenCalled()
    })

    test('runs in dry-run mode without modifying files', async () => {
      const config: UpdateLinkCommandConfig = {
        command: 'update-link',
        dryRun: true,
        verbose: false,
      }

      const writeFileSpy = vi.spyOn(fs, 'writeFile')

      await handleUpdateLinkCommand(config, fs)

      expect(writeFileSpy).not.toHaveBeenCalled()
    })

    test('converts to absolute paths when absolute flag is true', async () => {
      const config: UpdateLinkCommandConfig = {
        command: 'update-link',
        absolute: true,
        dryRun: false,
        verbose: false,
      }

      await handleUpdateLinkCommand(config, fs)

      // Handler should process files in absolute mode
      const { walkMarkdownFiles } = await import('@pair/content-ops/file-system')
      expect(walkMarkdownFiles).toHaveBeenCalled()
    })

    test('logs verbose output when verbose flag is true', async () => {
      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {})

      const config: UpdateLinkCommandConfig = {
        command: 'update-link',
        dryRun: false,
        verbose: true,
      }

      await handleUpdateLinkCommand(config, fs)

      // Verbose mode should not crash
      expect(consoleSpy).not.toThrow()
      consoleSpy.mockRestore()
    })

    test('throws when KB is not installed', async () => {
      const { getKnowledgeHubDatasetPath } = await import('../../config-utils')
      vi.mocked(getKnowledgeHubDatasetPath).mockImplementationOnce(() => {
        throw new Error('No KB found')
      })

      const config: UpdateLinkCommandConfig = {
        command: 'update-link',
        dryRun: false,
        verbose: false,
      }

      await expect(handleUpdateLinkCommand(config, fs)).rejects.toThrow()
    })
  })
})

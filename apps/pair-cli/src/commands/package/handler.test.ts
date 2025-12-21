import { describe, expect, beforeEach, vi } from 'vitest'
import { handlePackageCommand } from './handler'
import type { PackageCommandConfig } from './parser'
import { createTestFileSystem } from '../test-utils'
import type { InMemoryFileSystemService } from '@pair/content-ops'

// Mock legacy executePackage
vi.mock('../package', () => ({
  executePackage: vi.fn().mockResolvedValue(undefined),
}))

describe('handlePackageCommand - unit tests with mocked legacy command', () => {
  let fs: InMemoryFileSystemService

  beforeEach(() => {
    fs = createTestFileSystem()
    vi.clearAllMocks()
  })

  describe('config to legacy options mapping', () => {
    test('maps minimal config', async () => {
      const config: PackageCommandConfig = {
        command: 'package',
        verbose: false,
      }

      await handlePackageCommand(config, fs)

      const { executePackage } = await import('../package')
      expect(executePackage).toHaveBeenCalledWith(
        expect.objectContaining({
          verbose: false,
        }),
        fs,
      )
    })

    test('maps all options', async () => {
      const config: PackageCommandConfig = {
        command: 'package',
        output: '/output/kb.zip',
        sourceDir: '/source',
        name: 'my-kb',
        version: '1.0.0',
        description: 'Test KB',
        author: 'Test Author',
        verbose: true,
      }

      await handlePackageCommand(config, fs)

      const { executePackage } = await import('../package')
      expect(executePackage).toHaveBeenCalledWith(
        expect.objectContaining({
          output: '/output/kb.zip',
          sourceDir: '/source',
          name: 'my-kb',
          version: '1.0.0',
          description: 'Test KB',
          author: 'Test Author',
          verbose: true,
        }),
        fs,
      )
    })

    test('maps partial options', async () => {
      const config: PackageCommandConfig = {
        command: 'package',
        output: '/custom/output.zip',
        verbose: true,
      }

      await handlePackageCommand(config, fs)

      const { executePackage } = await import('../package')
      expect(executePackage).toHaveBeenCalledWith(
        expect.objectContaining({
          output: '/custom/output.zip',
          verbose: true,
        }),
        fs,
      )
    })
  })
})

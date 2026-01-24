import { describe, expect, beforeEach, vi, test } from 'vitest'
import { handlePackageCommand } from './handler'
import type { PackageCommandConfig } from './parser'
import { createTestFileSystem } from '../../test-utils'
import type { InMemoryFileSystemService } from '@pair/content-ops'

// Mock handler dependencies
vi.mock('../../config-utils', () => ({
  loadConfigWithOverrides: vi.fn().mockReturnValue({
    config: {
      asset_registries: {
        'test-registry': {
          source: 'test-source',
          behavior: 'mirror',
          target_path: '.pair',
          description: 'Test registry',
        },
      },
    },
    source: 'test-config-source',
  }),
}))

vi.mock('./validators', () => ({
  validatePackageStructure: vi.fn().mockResolvedValue({ valid: true, errors: [] }),
}))

vi.mock('./metadata', () => ({
  generateManifestMetadata: vi.fn().mockReturnValue({
    name: 'test-package',
    version: '1.0.0',
    created_at: '2025-12-21',
  }),
}))

vi.mock('./zip-creator', () => ({
  createPackageZip: vi.fn().mockResolvedValue(undefined),
}))

describe('handlePackageCommand - unit tests', () => {
  let fs: InMemoryFileSystemService

  beforeEach(() => {
    fs = createTestFileSystem()
    // Mock stat to return file size for created ZIP
    fs.stat = vi.fn().mockResolvedValue({ size: 1024 })
    vi.clearAllMocks()
  })

  describe('handler execution', () => {
    test('executes with minimal config', async () => {
      const config: PackageCommandConfig = {
        command: 'package',
        verbose: false,
      }

      await handlePackageCommand(config, fs)

      const { createPackageZip } = await import('./zip-creator')
      expect(createPackageZip).toHaveBeenCalled()
    })

    test('passes all metadata to manifest generator', async () => {
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

      const { generateManifestMetadata } = await import('./metadata')
      expect(generateManifestMetadata).toHaveBeenCalledWith(
        ['test-source'],
        expect.objectContaining({
          name: 'my-kb',
          version: '1.0.0',
          description: 'Test KB',
          author: 'Test Author',
        }),
      )
    })

    test('uses custom output path when provided', async () => {
      const config: PackageCommandConfig = {
        command: 'package',
        output: '/custom/output.zip',
        verbose: true,
      }

      await handlePackageCommand(config, fs)

      const { createPackageZip } = await import('./zip-creator')
      expect(createPackageZip).toHaveBeenCalledWith(
        expect.objectContaining({
          outputPath: '/custom/output.zip',
        }),
        fs,
      )
    })
  })
})

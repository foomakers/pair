import { describe, it, expect, vi, beforeEach } from 'vitest'
import { InMemoryFileSystemService } from '../test-utils/in-memory-fs'
import { SyncOptions } from './SyncOptions'

// Mock dependencies
vi.mock('../observability', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    time: vi.fn((fn: () => Promise<unknown>) => fn()),
  },
  createMirrorConstraintError: vi.fn(),
  createError: vi.fn((error: { message: string; type: string; source: string; target: string }) => {
    const err = new Error(error.message) as Error & { type: string; source: string; target: string }
    err.type = error.type
    err.source = error.source
    err.target = error.target
    return err
  }),
}))

vi.mock('../file-system/file-validations', () => ({
  validatePaths: vi.fn(),
}))

vi.mock('./behavior', () => ({
  validateMirrorConstraints: vi.fn(),
}))

vi.mock('./link-batch-processor', () => ({
  processPathSubstitution: vi.fn(),
}))

// Import after mocks
import {
  setupPathOperation,
  determineFinalDestination,
  updateMarkdownLinks,
  handleMirrorCleanup,
  validateSubfolderOperation,
  bulkUpdateMarkdownLinks,
  DEFAULT_CONCURRENCY_LIMIT,
} from './path-operation-helpers'
import { logger } from '../observability'
import { processPathSubstitution } from './link-batch-processor'

// Shared setup for tests
let fileService: InMemoryFileSystemService

beforeEach(() => {
  fileService = new InMemoryFileSystemService({}, '/', '/')
  vi.clearAllMocks()

  // Mock fileService methods
  vi.spyOn(fileService, 'mkdir')
  vi.spyOn(fileService, 'rm')
  vi.spyOn(fileService, 'readdir')

  // Reset logger mocks
  vi.mocked(logger.info).mockClear()
  vi.mocked(logger.warn).mockClear()
})

describe('setupPathOperation', () => {
  it('should return skip result when source and target are the same', () => {
    const result = setupPathOperation('same.md', 'same.md', '/dataset')

    expect(result.shouldSkip).toBe(true)
    expect(result.normSource).toBe('same.md')
    expect(result.normTarget).toBe('same.md')
  })

  it('should normalize path separators', () => {
    const result = setupPathOperation('source\\file.md', 'target\\file.md', '/dataset')

    expect(result.normSource).toBe('source/file.md')
    expect(result.normTarget).toBe('target/file.md')
  })
})

describe('setupPathOperation - behavior options', () => {
  it('should use default behavior when not specified', () => {
    const result = setupPathOperation('source.md', 'target.md', '/dataset')

    expect(result.defaultBehavior).toBe('overwrite')
  })
})

describe('setupPathOperation - custom options', () => {
  it('should use provided behavior options', () => {
    const options: SyncOptions = {
      defaultBehavior: 'add',
      folderBehavior: { folder: 'mirror' },
    }

    const result = setupPathOperation('source.md', 'target.md', '/dataset', options)

    expect(result.defaultBehavior).toBe('add')
    expect(result.folderBehavior).toEqual({ folder: 'mirror' })
  })

  it('should return proper paths and options', () => {
    const options: SyncOptions = { defaultBehavior: 'skip' }
    const result = setupPathOperation('source.md', 'target.md', '/dataset', options)

    expect(result.shouldSkip).toBe(false)
    expect(result.srcPath).toBe('/dataset/source.md')
    expect(result.destPath).toBe('/dataset/target.md')
    expect(result.opts).toBe(options)
  })
})

describe('determineFinalDestination - file operations', () => {
  it('should return destination path when target is a file', async () => {
    fileService = new InMemoryFileSystemService(
      {
        '/dataset/target.md': 'content',
      },
      '/',
      '/',
    )

    const result = await determineFinalDestination(
      fileService,
      '/dataset/target.md',
      'source.md',
      'target.md',
    )

    expect(result).toBe('/dataset/target.md')
  })
})

describe('determineFinalDestination - directory operations', () => {
  it('should append filename when target is a directory', async () => {
    fileService = new InMemoryFileSystemService(
      {
        '/dataset/target/': '',
      },
      '/',
      '/',
    )

    const result = await determineFinalDestination(
      fileService,
      '/dataset/target',
      'source.md',
      'target',
    )

    expect(result).toBe('/dataset/target/source.md')
  })
})

describe('determineFinalDestination - directory creation', () => {
  it('should create parent directories and return path for .md files', async () => {
    const result = await determineFinalDestination(
      fileService,
      '/dataset/new/path/file.md',
      'source.md',
      'new/path/file.md',
    )

    expect(result).toBe('/dataset/new/path/file.md')
    expect(fileService.mkdir).toHaveBeenCalledWith('/dataset/new/path', { recursive: true })
  })
})

describe('determineFinalDestination - non-md file creation', () => {
  it('should create directory and append filename for non-.md files', async () => {
    const result = await determineFinalDestination(
      fileService,
      '/dataset/new/path',
      'source.txt',
      'new/path',
    )

    expect(result).toBe('/dataset/new/path/source.txt')
    expect(fileService.mkdir).toHaveBeenCalledWith('/dataset/new/path', { recursive: true })
  })
})

describe('updateMarkdownLinks - file operations', () => {
  beforeEach(() => {
    vi.mocked(processPathSubstitution).mockResolvedValue({
      totalFiles: 1,
      processedFiles: 1,
      totalLinksUpdated: 2,
      totalReplacementsApplied: 2,
      byKind: { 'markdown-link': 2 },
      errors: [],
    })
  })

  it('should update links for file operations', async () => {
    await updateMarkdownLinks({
      fileService,
      source: 'source.md',
      target: 'target.md',
      datasetRoot: '/dataset',
      finalDest: '/dataset/target.md',
      isDirectory: false,
      options: undefined,
    })

    expect(processPathSubstitution).toHaveBeenCalledWith({
      datasetRoot: '/dataset',
      oldBase: 'source.md',
      newBase: 'target.md',
      config: { concurrencyLimit: DEFAULT_CONCURRENCY_LIMIT },
      fileService,
    })
  })
})

describe('updateMarkdownLinks - directory operations', () => {
  beforeEach(() => {
    vi.mocked(processPathSubstitution).mockResolvedValue({
      totalFiles: 1,
      processedFiles: 1,
      totalLinksUpdated: 2,
      totalReplacementsApplied: 2,
      byKind: { 'markdown-link': 2 },
      errors: [],
    })
  })

  it('should update links for directory operations', async () => {
    await updateMarkdownLinks({
      fileService,
      source: 'source',
      target: 'target',
      datasetRoot: '/dataset',
      finalDest: '/dataset/target',
      isDirectory: true,
      options: undefined,
    })

    expect(processPathSubstitution).toHaveBeenCalledWith({
      datasetRoot: '/dataset',
      oldBase: 'source/',
      newBase: 'target/',
      config: { concurrencyLimit: DEFAULT_CONCURRENCY_LIMIT },
      fileService,
    })
  })
})

describe('updateMarkdownLinks - options', () => {
  beforeEach(() => {
    vi.mocked(processPathSubstitution).mockResolvedValue({
      totalFiles: 1,
      processedFiles: 1,
      totalLinksUpdated: 2,
      totalReplacementsApplied: 2,
      byKind: { 'markdown-link': 2 },
      errors: [],
    })
  })

  it('should use custom concurrency limit', async () => {
    const options: SyncOptions = { concurrencyLimit: 5 }

    await updateMarkdownLinks({
      fileService,
      source: 'source.md',
      target: 'target.md',
      datasetRoot: '/dataset',
      finalDest: '/dataset/target.md',
      isDirectory: false,
      options,
    })

    expect(processPathSubstitution).toHaveBeenCalledWith({
      datasetRoot: '/dataset',
      oldBase: 'source.md',
      newBase: 'target.md',
      config: { concurrencyLimit: 5 },
      fileService,
    })
  })
})

describe('handleMirrorCleanup', () => {
  it('should remove extraneous files in destination', async () => {
    fileService = new InMemoryFileSystemService(
      {
        '/dataset/src/file1.md': 'content1',
        '/dataset/src/file2.md': 'content2',
        '/dataset/dest/file1.md': 'old1',
        '/dataset/dest/extra.md': 'to remove',
      },
      '/',
      '/',
    )

    await handleMirrorCleanup(fileService, '/dataset/src', '/dataset/dest')

    // Check that extra.md was removed
    await expect(fileService.exists('/dataset/dest/extra.md')).resolves.toBe(false)
    // Check that file1.md still exists
    await expect(fileService.exists('/dataset/dest/file1.md')).resolves.toBe(true)
  })

  it('should handle empty destination directory', async () => {
    fileService = new InMemoryFileSystemService(
      {
        '/dataset/src/file1.md': 'content1',
      },
      '/',
      '/',
    )

    await handleMirrorCleanup(fileService, '/dataset/src', '/dataset/dest')

    // No files should be removed since destination is empty
    await expect(fileService.exists('/dataset/dest/extra.md')).resolves.toBe(false)
  })
})

describe('handleMirrorCleanup - error handling', () => {
  it('should handle source directory read errors gracefully', async () => {
    fileService = new InMemoryFileSystemService(
      {
        '/dataset/dest/extra.md': 'to remove',
      },
      '/',
      '/',
    )

    // Mock readdir to throw for source
    const originalReaddir = fileService.readdir.bind(fileService)
    fileService.readdir = vi.fn().mockImplementation(async (path: string) => {
      if (path === '/dataset/src') {
        throw new Error('Source not found')
      }
      return originalReaddir(path)
    })

    // Should not throw and should still remove extra.md
    await expect(
      handleMirrorCleanup(fileService, '/dataset/src', '/dataset/dest'),
    ).resolves.not.toThrow()
    await expect(fileService.exists('/dataset/dest/extra.md')).resolves.toBe(false)
  })

  it('should handle destination directory read errors gracefully', async () => {
    fileService = new InMemoryFileSystemService(
      {
        '/dataset/src/file1.md': 'content1',
      },
      '/',
      '/',
    )

    // Mock readdir to throw for destination
    const originalReaddir = fileService.readdir.bind(fileService)
    fileService.readdir = vi.fn().mockImplementation(async (path: string) => {
      if (path === '/dataset/dest') {
        throw new Error('Dest not found')
      }
      return originalReaddir(path)
    })

    // Should not throw
    await expect(
      handleMirrorCleanup(fileService, '/dataset/src', '/dataset/dest'),
    ).resolves.not.toThrow()
  })
})

describe('validateSubfolderOperation', () => {
  it('should not throw for valid operations', () => {
    expect(() => {
      validateSubfolderOperation({
        srcPath: '/dataset/src',
        destPath: '/dataset/dest',
        normSource: 'src',
        normTarget: 'dest',
        operation: 'copy',
      })
    }).not.toThrow()
  })

  it('should throw for invalid subfolder copy operations', () => {
    expect(() => {
      validateSubfolderOperation({
        srcPath: '/dataset/src',
        destPath: '/dataset/src/sub',
        normSource: 'src',
        normTarget: 'src/sub',
        operation: 'copy',
      })
    }).toThrow('Cannot copy a folder into one of its own subfolders. Aborting.')
  })

  it('should throw for invalid subfolder move operations', () => {
    expect(() => {
      validateSubfolderOperation({
        srcPath: '/dataset/src',
        destPath: '/dataset/src/sub',
        normSource: 'src',
        normTarget: 'src/sub',
        operation: 'move',
      })
    }).toThrow('Cannot move a folder into one of its own subfolders. Aborting.')
  })

  it('should handle edge cases with relative paths', () => {
    expect(() => {
      validateSubfolderOperation({
        srcPath: '/dataset/src',
        destPath: '/dataset/src',
        normSource: 'src',
        normTarget: 'src',
        operation: 'copy',
      })
    }).not.toThrow()
  })
})

describe('bulkUpdateMarkdownLinks', () => {
  beforeEach(() => {
    vi.mocked(processPathSubstitution).mockResolvedValue({
      totalFiles: 2,
      processedFiles: 2,
      totalLinksUpdated: 3,
      totalReplacementsApplied: 3,
      byKind: { 'markdown-link': 3 },
      errors: [],
    })
  })

  it('should call processPathSubstitution with correct parameters', async () => {
    const result = await bulkUpdateMarkdownLinks({
      fileService,
      oldBase: 'old/path',
      newBase: 'new/path',
      datasetRoot: '/dataset',
      concurrencyLimit: 5,
    })

    expect(processPathSubstitution).toHaveBeenCalledWith({
      datasetRoot: '/dataset',
      oldBase: 'old/path',
      newBase: 'new/path',
      config: { concurrencyLimit: 5 },
      fileService,
    })
    expect(result.processedFiles).toBe(2)
    expect(result.totalLinksUpdated).toBe(3)
  })
})

describe('bulkUpdateMarkdownLinks - configuration', () => {
  beforeEach(() => {
    vi.mocked(processPathSubstitution).mockResolvedValue({
      totalFiles: 2,
      processedFiles: 2,
      totalLinksUpdated: 3,
      totalReplacementsApplied: 3,
      byKind: { 'markdown-link': 3 },
      errors: [],
    })
  })

  it('should use default concurrency limit when not specified', async () => {
    await bulkUpdateMarkdownLinks({
      fileService,
      oldBase: 'old',
      newBase: 'new',
      datasetRoot: '/dataset',
    })

    expect(processPathSubstitution).toHaveBeenCalledWith({
      datasetRoot: '/dataset',
      oldBase: 'old',
      newBase: 'new',
      config: { concurrencyLimit: DEFAULT_CONCURRENCY_LIMIT },
      fileService,
    })
  })

  it('should log results when files are processed', async () => {
    await bulkUpdateMarkdownLinks({
      fileService,
      oldBase: 'old',
      newBase: 'new',
      datasetRoot: '/dataset',
    })

    expect(logger.info).toHaveBeenCalledWith('✅ Links updated: 3 (in 2 files)')
  })
})

describe('bulkUpdateMarkdownLinks - edge cases', () => {
  beforeEach(() => {
    vi.mocked(processPathSubstitution).mockResolvedValue({
      totalFiles: 0,
      processedFiles: 0,
      totalLinksUpdated: 0,
      totalReplacementsApplied: 0,
      byKind: {},
      errors: [],
    })
  })

  it('should not log results when no files are processed', async () => {
    await bulkUpdateMarkdownLinks({
      fileService,
      oldBase: 'old',
      newBase: 'new',
      datasetRoot: '/dataset',
    })

    expect(logger.info).not.toHaveBeenCalledWith(expect.stringContaining('Links updated'))
  })
})

describe('bulkUpdateMarkdownLinks - error handling', () => {
  beforeEach(() => {
    vi.mocked(processPathSubstitution).mockResolvedValue({
      totalFiles: 0,
      processedFiles: 0,
      totalLinksUpdated: 0,
      totalReplacementsApplied: 0,
      byKind: {},
      errors: [],
    })
  })

  it('should handle errors from processPathSubstitution', async () => {
    vi.mocked(processPathSubstitution).mockResolvedValue({
      totalFiles: 1,
      processedFiles: 1,
      totalLinksUpdated: 1,
      totalReplacementsApplied: 1,
      byKind: { 'markdown-link': 1 },
      errors: [
        { file: 'file1.md', error: 'Parse error' },
        { file: 'file2.md', error: 'Link not found' },
      ],
    })

    const result = await bulkUpdateMarkdownLinks({
      fileService,
      oldBase: 'old',
      newBase: 'new',
      datasetRoot: '/dataset',
    })

    expect(result.errors).toHaveLength(2)
    expect(result.errors[0]).toEqual({ file: 'file1.md', error: 'Parse error' })
    expect(result.errors[1]).toEqual({ file: 'file2.md', error: 'Link not found' })
  })

  it('should handle processing errors', async () => {
    vi.mocked(processPathSubstitution).mockRejectedValue(new Error('Processing failed'))

    await expect(
      bulkUpdateMarkdownLinks({
        fileService,
        oldBase: 'old',
        newBase: 'new',
        datasetRoot: '/dataset',
      }),
    ).rejects.toThrow('Processing failed')
  })
})

describe('DEFAULT_CONCURRENCY_LIMIT', () => {
  it('should have the correct default value', () => {
    expect(DEFAULT_CONCURRENCY_LIMIT).toBe(10)
  })
})

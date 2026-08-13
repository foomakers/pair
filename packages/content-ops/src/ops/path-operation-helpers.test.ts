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

// Only the constraint validator is stubbed. `resolveBehavior`/`normalizeKey` are pure and
// are what the cleanup uses to decide ownership — stubbing them would make the ownership
// tests below assert against a fiction instead of against the resolution the copy step runs.
vi.mock('./behavior', async () => {
  const actual = await vi.importActual<typeof import('./behavior')>('./behavior')
  return { ...actual, validateMirrorConstraints: vi.fn() }
})

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
      flatten: false,
      targets: [],
    }

    const result = setupPathOperation('source.md', 'target.md', '/dataset', options)

    expect(result.defaultBehavior).toBe('add')
    expect(result.folderBehavior).toEqual({ folder: 'mirror' })
  })

  it('should return proper paths and options', () => {
    const options: SyncOptions = { defaultBehavior: 'skip', flatten: false, targets: [] }
    const result = setupPathOperation('source.md', 'target.md', '/dataset', options)

    expect(result.shouldSkip).toBe(false)
    expect(result.srcPath).toBe('/dataset/source.md')
    expect(result.destPath).toBe('/dataset/target.md')
    expect(result.options).toBe(options)
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
    const options: SyncOptions = { concurrencyLimit: 5, flatten: false, targets: [] }

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

  // ── Recursive cleanup (#426, absorbed into #393) ──────────────────────────
  // The comparison used to stop at the TOP level: a directory present on both sides was
  // kept and never looked inside, so a file removed from the dataset survived every
  // `pair update` forever. Measured cost: two how-to guides deleted from the dataset in
  // #246 were still installed ~5 months later and were advertised by `.pair/llms.txt`,
  // so agents were pointed at guides the KB no longer ships.
  it('removes a stale file NESTED under a directory that exists on both sides', async () => {
    fileService = new InMemoryFileSystemService(
      {
        '/dataset/src/how-to/01-keep.md': 'keep',
        '/dataset/dest/how-to/01-keep.md': 'keep',
        '/dataset/dest/how-to/04-orphan.md': 'stale',
      },
      '/',
      '/',
    )

    await handleMirrorCleanup(fileService, '/dataset/src', '/dataset/dest')

    await expect(fileService.exists('/dataset/dest/how-to/04-orphan.md')).resolves.toBe(false)
    await expect(fileService.exists('/dataset/dest/how-to/01-keep.md')).resolves.toBe(true)
  })

  it('does not blow away a directory present on BOTH sides', async () => {
    fileService = new InMemoryFileSystemService(
      {
        '/dataset/src/how-to/01-keep.md': 'keep',
        '/dataset/dest/how-to/01-keep.md': 'keep',
      },
      '/',
      '/',
    )

    await handleMirrorCleanup(fileService, '/dataset/src', '/dataset/dest')

    // The shared directory must survive as a directory, with its shared content intact.
    await expect(fileService.exists('/dataset/dest/how-to')).resolves.toBe(true)
    await expect(fileService.exists('/dataset/dest/how-to/01-keep.md')).resolves.toBe(true)
  })

  it('removes a stale file nested TWO levels deep', async () => {
    fileService = new InMemoryFileSystemService(
      {
        '/dataset/src/a/b/keep.md': 'keep',
        '/dataset/dest/a/b/keep.md': 'keep',
        '/dataset/dest/a/b/orphan.md': 'stale',
      },
      '/',
      '/',
    )

    await handleMirrorCleanup(fileService, '/dataset/src', '/dataset/dest')

    await expect(fileService.exists('/dataset/dest/a/b/orphan.md')).resolves.toBe(false)
    await expect(fileService.exists('/dataset/dest/a/b/keep.md')).resolves.toBe(true)
  })

  it('still removes a top-level entry absent from the source (unchanged behaviour)', async () => {
    fileService = new InMemoryFileSystemService(
      {
        '/dataset/src/keep.md': 'keep',
        '/dataset/dest/keep.md': 'keep',
        '/dataset/dest/gone/nested.md': 'stale',
      },
      '/',
      '/',
    )

    await handleMirrorCleanup(fileService, '/dataset/src', '/dataset/dest')

    await expect(fileService.exists('/dataset/dest/gone/nested.md')).resolves.toBe(false)
    await expect(fileService.exists('/dataset/dest/keep.md')).resolves.toBe(true)
  })

  // ── Ownership: "a target-only path the registry does not own is left untouched" ──
  // Recursion made the delete path reach the whole shared tree, so it must know what the
  // copy step knows: `exclude` (the subtree is treated as if it were never in the source)
  // and per-entry `folderBehavior` (`add`/`skip` — where target-only files are the point).
  // Deleting more than the copy would install is the failure mode these pin.
  it('leaves a target-only entry under an EXCLUDED source subtree untouched', async () => {
    fileService = new InMemoryFileSystemService(
      {
        '/dataset/src/keep.md': 'keep',
        '/dataset/dest/keep.md': 'keep',
        '/dataset/dest/vendor/theirs.md': 'not ours',
      },
      '/',
      '/',
    )

    await handleMirrorCleanup(fileService, '/dataset/src', '/dataset/dest', {
      exclude: ['vendor'],
      excludeRoot: '/dataset/src',
      datasetRoot: '/dataset',
      defaultBehavior: 'overwrite',
    })

    await expect(fileService.exists('/dataset/dest/vendor/theirs.md')).resolves.toBe(true)
  })

  it('does not descend into an excluded subtree present on both sides', async () => {
    fileService = new InMemoryFileSystemService(
      {
        '/dataset/src/vendor/a.md': 'a',
        '/dataset/dest/vendor/a.md': 'a',
        '/dataset/dest/vendor/theirs.md': 'not ours',
      },
      '/',
      '/',
    )

    await handleMirrorCleanup(fileService, '/dataset/src', '/dataset/dest', {
      exclude: ['vendor'],
      excludeRoot: '/dataset/src',
      datasetRoot: '/dataset',
      defaultBehavior: 'overwrite',
    })

    await expect(fileService.exists('/dataset/dest/vendor/theirs.md')).resolves.toBe(true)
  })

  it('leaves a target-only entry whose resolved behavior is `add` untouched', async () => {
    fileService = new InMemoryFileSystemService(
      {
        '/dataset/src/keep.md': 'keep',
        '/dataset/dest/keep.md': 'keep',
        '/dataset/dest/local/notes.md': 'authored by the adopter',
      },
      '/',
      '/',
    )

    await handleMirrorCleanup(fileService, '/dataset/src', '/dataset/dest', {
      datasetRoot: '/dataset',
      defaultBehavior: 'overwrite',
      folderBehavior: { 'src/local': 'add' },
    })

    await expect(fileService.exists('/dataset/dest/local/notes.md')).resolves.toBe(true)
  })

  it('leaves a target-only entry whose resolved behavior is `skip` untouched', async () => {
    fileService = new InMemoryFileSystemService(
      {
        '/dataset/src/keep.md': 'keep',
        '/dataset/dest/keep.md': 'keep',
        '/dataset/dest/local/notes.md': 'authored by the adopter',
      },
      '/',
      '/',
    )

    await handleMirrorCleanup(fileService, '/dataset/src', '/dataset/dest', {
      datasetRoot: '/dataset',
      defaultBehavior: 'overwrite',
      folderBehavior: { 'src/local': 'skip' },
    })

    await expect(fileService.exists('/dataset/dest/local/notes.md')).resolves.toBe(true)
  })

  it('leaves a NESTED target-only file untouched when its resolved behavior is `add`', async () => {
    fileService = new InMemoryFileSystemService(
      {
        '/dataset/src/shared/keep.md': 'keep',
        '/dataset/dest/shared/keep.md': 'keep',
        '/dataset/dest/shared/adopter.md': 'authored by the adopter',
      },
      '/',
      '/',
    )

    await handleMirrorCleanup(fileService, '/dataset/src', '/dataset/dest', {
      datasetRoot: '/dataset',
      defaultBehavior: 'overwrite',
      folderBehavior: { 'src/shared/adopter.md': 'add' },
    })

    await expect(fileService.exists('/dataset/dest/shared/adopter.md')).resolves.toBe(true)
    await expect(fileService.exists('/dataset/dest/shared/keep.md')).resolves.toBe(true)
  })

  it('still removes an orphan the registry DOES own when an ownership context is given', async () => {
    fileService = new InMemoryFileSystemService(
      {
        '/dataset/src/how-to/01-keep.md': 'keep',
        '/dataset/dest/how-to/01-keep.md': 'keep',
        '/dataset/dest/how-to/04-orphan.md': 'stale',
      },
      '/',
      '/',
    )

    await handleMirrorCleanup(fileService, '/dataset/src', '/dataset/dest', {
      exclude: ['vendor'],
      excludeRoot: '/dataset/src',
      datasetRoot: '/dataset',
      defaultBehavior: 'overwrite',
      folderBehavior: { src: 'mirror' },
    })

    await expect(fileService.exists('/dataset/dest/how-to/04-orphan.md')).resolves.toBe(false)
    await expect(fileService.exists('/dataset/dest/how-to/01-keep.md')).resolves.toBe(true)
  })
})

describe('handleMirrorCleanup - error handling', () => {
  // ── A FAILED source read is not an EMPTY source ─────────────────────────────
  // The walk is recursive and the target side is a real adopter's working tree, so
  // `readdir(src).catch(() => [])` is the worst possible default: every owned entry of
  // the target reads as "absent from the source" and is removed recursively, announced
  // as `⚠️ Mirror: removed … (not in the source)` — an IO fault reported as a dataset
  // retirement. Only ENOENT actually says something about the mirror ("the source is
  // gone, so the target goes too"); EACCES/EPERM/EIO/EMFILE — or an error carrying no
  // errno at all — say only that we do not know, and cleanup must abstain.
  const errnoError = (code: string) => Object.assign(new Error(`${code}: readdir failed`), { code })

  /** Make `readdir` reject for exactly one path, otherwise behave normally. */
  const failReaddirFor = (path: string, error: Error) => {
    const originalReaddir = fileService.readdir.bind(fileService)
    fileService.readdir = vi.fn().mockImplementation(async (p: string) => {
      if (p === path) throw error
      return originalReaddir(p)
    })
  }

  it('still removes a target entry when the source is genuinely absent (ENOENT)', async () => {
    fileService = new InMemoryFileSystemService({ '/dataset/dest/extra.md': 'to remove' }, '/', '/')
    vi.spyOn(fileService, 'rm')
    failReaddirFor('/dataset/src', errnoError('ENOENT'))

    await expect(
      handleMirrorCleanup(fileService, '/dataset/src', '/dataset/dest'),
    ).resolves.not.toThrow()

    await expect(fileService.exists('/dataset/dest/extra.md')).resolves.toBe(false)
  })

  it('leaves the target intact and warns when the source cannot be READ (EACCES)', async () => {
    fileService = new InMemoryFileSystemService({ '/dataset/dest/extra.md': 'keep' }, '/', '/')
    vi.spyOn(fileService, 'rm')
    failReaddirFor('/dataset/src', errnoError('EACCES'))

    await expect(
      handleMirrorCleanup(fileService, '/dataset/src', '/dataset/dest'),
    ).resolves.not.toThrow()

    await expect(fileService.exists('/dataset/dest/extra.md')).resolves.toBe(true)
    expect(fileService.rm).not.toHaveBeenCalled()
    expect(logger.warn).toHaveBeenCalledWith(
      'Mirror: skipped cleanup of /dataset/dest — could not read source /dataset/src (EACCES)',
    )
  })

  it('treats a read failure carrying NO errno as unreadable, not as an empty source', async () => {
    fileService = new InMemoryFileSystemService({ '/dataset/dest/extra.md': 'keep' }, '/', '/')
    failReaddirFor('/dataset/src', new Error('Source not found'))

    await handleMirrorCleanup(fileService, '/dataset/src', '/dataset/dest')

    await expect(fileService.exists('/dataset/dest/extra.md')).resolves.toBe(true)
    expect(logger.warn).toHaveBeenCalledWith(
      'Mirror: skipped cleanup of /dataset/dest — could not read source /dataset/src (unknown)',
    )
  })

  it('skips only the unreadable directory and keeps cleaning the rest of the tree', async () => {
    fileService = new InMemoryFileSystemService(
      {
        '/dataset/src/keep.md': 'keep',
        '/dataset/src/how-to/01-live.md': 'live',
        '/dataset/dest/keep.md': 'keep',
        '/dataset/dest/how-to/01-live.md': 'live',
        '/dataset/dest/how-to/99-stale.md': 'orphan under the unreadable directory',
        '/dataset/dest/ORPHAN.md': 'orphan under a readable directory',
      },
      '/',
      '/',
    )
    failReaddirFor('/dataset/src/how-to', errnoError('EIO'))

    await handleMirrorCleanup(fileService, '/dataset/src', '/dataset/dest')

    // Unreadable subtree: untouched, including the entry that LOOKS like an orphan.
    await expect(fileService.exists('/dataset/dest/how-to/99-stale.md')).resolves.toBe(true)
    await expect(fileService.exists('/dataset/dest/how-to/01-live.md')).resolves.toBe(true)
    // Readable sibling scope: cleaned exactly as before.
    await expect(fileService.exists('/dataset/dest/ORPHAN.md')).resolves.toBe(false)
    await expect(fileService.exists('/dataset/dest/keep.md')).resolves.toBe(true)
    expect(logger.warn).toHaveBeenCalledWith(
      'Mirror: skipped cleanup of /dataset/dest/how-to — could not read source /dataset/src/how-to (EIO)',
    )
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

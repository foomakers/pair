import { describe, it, expect, vi } from 'vitest'
import {
  processFilesWithLinkReplacements,
  processDirectoryWithLinkReplacements,
  processPathSubstitution,
  processNormalization,
  createSemaphore,
} from './link-batch-processor'
import { InMemoryFileSystemService } from '../test-utils/in-memory-fs'

describe('processFilesWithLinkReplacements - concurrency', () => {
  it('should process multiple files concurrently', async () => {
    const fileService = new InMemoryFileSystemService(
      {
        '/dataset/file1.md': 'This is a [link](page.md).',
        '/dataset/file2.md': 'Another [link](page.md).',
        '/dataset/page.md': '# Page',
      },
      '/',
      '/',
    )

    const generateReplacements = vi.fn().mockResolvedValue([
      {
        line: 1,
        oldHref: 'page.md',
        newHref: 'new-page.md',
        start: 10,
        end: 21,
      },
    ])

    const config = {
      docsFolders: [],
      datasetRoot: '/dataset',
      exclusionList: [],
      concurrencyLimit: 2,
    }

    const result = await processFilesWithLinkReplacements(
      ['/dataset/file1.md', '/dataset/file2.md'],
      generateReplacements,
      config,
      fileService,
    )

    expect(result.totalFiles).toBe(2)
    expect(result.processedFiles).toBe(2)
    expect(result.totalReplacementsApplied).toBe(2)
    expect(result.errors).toHaveLength(0)
  })
})

describe('processFilesWithLinkReplacements - errors', () => {
  it('should handle file processing errors', async () => {
    const fileService = new InMemoryFileSystemService(
      {
        '/dataset/file1.md': 'This is a [link](page.md).',
      },
      '/',
      '/',
    )

    const generateReplacements = vi.fn().mockRejectedValue(new Error('Processing error'))

    const config = {
      docsFolders: [],
      datasetRoot: '/dataset',
      exclusionList: [],
    }

    const result = await processFilesWithLinkReplacements(
      ['/dataset/file1.md'],
      generateReplacements,
      config,
      fileService,
    )

    expect(result.totalFiles).toBe(1)
    expect(result.processedFiles).toBe(0)
    expect(result.errors).toHaveLength(1)
    expect(result.errors[0].error).toBe('Error: Processing error')
  })
})

describe('processDirectoryWithLinkReplacements', () => {
  it('should process all markdown files in directory', async () => {
    const fileService = new InMemoryFileSystemService(
      {
        '/dataset/file1.md': 'This is a [link](page.md).',
        '/dataset/file2.md': 'Another [link](other.md).',
        '/dataset/page.md': '# Page',
        '/dataset/other.md': '# Other Page',
        '/dataset/readme.txt': 'Not a markdown file',
      },
      '/',
      '/',
    )

    const generateReplacements = vi.fn().mockResolvedValue([])

    const config = {
      docsFolders: [],
      datasetRoot: '/dataset',
      exclusionList: [],
    }

    const result = await processDirectoryWithLinkReplacements(
      '/dataset',
      generateReplacements,
      config,
      fileService,
    )

    expect(result.totalFiles).toBe(4) // All .md files
    expect(result.processedFiles).toBe(4)
  })
})

describe('processPathSubstitution', () => {
  it('should perform path substitution on all files', async () => {
    const fileService = new InMemoryFileSystemService(
      {
        '/dataset/file1.md': 'This is a [link](old/path/page.md).',
        '/dataset/file2.md': 'Another [link](old/path/other.md).',
        '/dataset/old/path/page.md': '# Page',
        '/dataset/old/path/other.md': '# Other Page',
      },
      '/',
      '/',
    )

    const result = await processPathSubstitution({
      datasetRoot: '/dataset',
      oldBase: 'old/path',
      newBase: 'new/path',
      config: { concurrencyLimit: 2 },
      fileService,
    })

    expect(result.totalFiles).toBe(4)
    expect(result.processedFiles).toBe(4)
    expect(result.totalReplacementsApplied).toBe(2)
  })
})

describe('processNormalization', () => {
  it('should normalize links in all files', async () => {
    const fileService = new InMemoryFileSystemService(
      {
        '/dataset/docs/file1.md': 'This is a [link](../page.md).',
        '/dataset/docs/file2.md': 'Another [link](../other.md).',
        '/dataset/page.md': '# Page',
        '/dataset/other.md': '# Other Page',
      },
      '/',
      '/',
    )

    const config = {
      docsFolders: ['docs'],
      datasetRoot: '/dataset',
      exclusionList: [],
      concurrencyLimit: 2,
    }

    const result = await processNormalization('/dataset', config, fileService)

    expect(result.totalFiles).toBe(4)
    expect(result.processedFiles).toBe(4)
  })
})

describe('createSemaphore', () => {
  it('should control concurrency with semaphore', async () => {
    const semaphore = createSemaphore(2)
    let running = 0
    let maxRunning = 0

    const task = async () => {
      const release = await semaphore.acquire()
      running++
      maxRunning = Math.max(maxRunning, running)
      await new Promise(resolve => setTimeout(resolve, 10))
      running--
      release()
    }

    const tasks = Array.from({ length: 5 }, () => task())
    await Promise.all(tasks)

    expect(maxRunning).toBeLessThanOrEqual(2)
  })

  it('should handle semaphore run method', async () => {
    const semaphore = createSemaphore(1)
    let executed = false

    await semaphore.run(async () => {
      executed = true
      return 'result'
    })

    expect(executed).toBe(true)
  })
})

describe('error handling', () => {
  it('should collect errors from failed file processing', async () => {
    const fileService = new InMemoryFileSystemService(
      {
        '/dataset/file1.md': 'This is a [link](page.md).',
        '/dataset/file2.md': 'Another [link](other.md).',
      },
      '/',
      '/',
    )

    // Create a custom fileService that throws error for file2
    const originalReadFile = fileService.readFile.bind(fileService)
    fileService.readFile = async (file: string) => {
      if (file === '/dataset/file2.md') {
        throw new Error('File read error')
      }
      return originalReadFile(file)
    }

    const generateReplacements = vi.fn().mockResolvedValue([])

    const config = {
      docsFolders: [],
      datasetRoot: '/dataset',
      exclusionList: [],
    }

    const result = await processFilesWithLinkReplacements(
      ['/dataset/file1.md', '/dataset/file2.md'],
      generateReplacements,
      config,
      fileService,
    )

    expect(result.totalFiles).toBe(2)
    expect(result.processedFiles).toBe(1) // Only file1 should succeed
    expect(result.errors).toHaveLength(1)
    expect(result.errors[0].file).toBe('/dataset/file2.md')
    expect(result.errors[0].error).toBe('Error: File read error')
  })
})

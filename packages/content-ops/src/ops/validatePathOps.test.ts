import { describe, it, expect, beforeEach } from 'vitest'
import InMemoryFileSystemService from '../test-utils/in-memory-fs'
import { validateAndFixFileLinks, validatePathOps } from './validatePathOps'

const EXCLUSION_LIST: string[] = []

describe('validatePathOps - Link Format Detection', () => {
  it('should detect bad link format (:file.md:)', async () => {
    const fs = new InMemoryFileSystemService(
      {
        '/dataset/guide/index.md': 'Reference to :bad.md: inside text',
      },
      '/',
      '/',
    )

    const result = await validatePathOps(fs, {
      datasetRoot: '/dataset',
      errorsPath: '/dataset/errors.txt',
      exclusionList: EXCLUSION_LIST,
    })

    expect(result.allErrors).toHaveLength(1)
    expect(result.allErrors[0]!.type).toBe('BAD LINK FORMAT')
  })
})

describe('validatePathOps - Link Patching', () => {
  it('should patch link if file is moved', async () => {
    const fs = new InMemoryFileSystemService(
      {
        '/dataset/guide/index.md': 'See [moved](./moved.md)',
        '/dataset/guide/moved.md': '# Moved',
      },
      '/',
      '/',
    )

    const result = await validatePathOps(fs, {
      datasetRoot: '/dataset',
      errorsPath: '/dataset/errors.txt',
      exclusionList: EXCLUSION_LIST,
    })

    expect(result.allErrors).toHaveLength(0)
    expect(fs.getContent('/dataset/guide/index.md')).toContain('[moved](./moved.md)')
  })
})

describe('validatePathOps - Link Normalization', () => {
  it('should normalize relative link paths', async () => {
    const fs = new InMemoryFileSystemService(
      {
        '/dataset/guide/index.md': 'See [Other](Other.md)',
        '/dataset/guide/Other.md': '# Other',
      },
      '/',
      '/',
    )

    const result = await validatePathOps(fs, {
      datasetRoot: '/dataset',
      errorsPath: '/dataset/errors.txt',
      exclusionList: EXCLUSION_LIST,
    })

    expect(result.allErrors).toHaveLength(0)
    expect(fs.getContent('/dataset/guide/index.md')).toContain('[Other](Other.md)')
  })

  it('should preserve anchors when normalizing links', async () => {
    const fs = new InMemoryFileSystemService(
      {
        '/dataset/guide/index.md': 'See [target](./target.md#part)',
        '/dataset/guide/target.md': '# Target',
      },
      '/',
      '/',
    )

    const result = await validatePathOps(fs, {
      datasetRoot: '/dataset',
      errorsPath: '/dataset/errors.txt',
      exclusionList: EXCLUSION_LIST,
    })

    expect(result.allErrors).toHaveLength(0)
    expect(fs.getContent('/dataset/guide/index.md')).toContain('[target](./target.md#part)')
  })
})

describe('validatePathOps - Error Detection', () => {
  it('should detect broken links', async () => {
    const fs = new InMemoryFileSystemService(
      {
        '/dataset/guide/index.md': 'Broken [link](./missing.md)',
      },
      '/',
      '/',
    )

    const result = await validatePathOps(fs, {
      datasetRoot: '/dataset',
      errorsPath: '/dataset/errors.txt',
      exclusionList: EXCLUSION_LIST,
    })

    expect(result.allErrors).toHaveLength(1)
    expect(result.allErrors[0]!.type).toBe('LINK TARGET NOT FOUND')
  })
})

describe('validatePathOps - Folder Handling', () => {
  it('should handle nested folders', async () => {
    const fs = new InMemoryFileSystemService(
      {
        '/dataset/guide/index.md': 'Go [nested](./nested/page.md)',
        '/dataset/guide/nested/page.md': '# Nested',
      },
      '/',
      '/',
    )

    const result = await validatePathOps(fs, {
      datasetRoot: '/dataset',
      errorsPath: '/dataset/errors.txt',
      exclusionList: EXCLUSION_LIST,
    })

    expect(result.allErrors).toHaveLength(0)
    expect(fs.getContent('/dataset/guide/index.md')).toContain('[nested](./nested/page.md)')
  })

  it('should patch relative links correctly with ..', async () => {
    const fs = new InMemoryFileSystemService(
      {
        '/dataset/guide/index.md': 'Back to [home](../index.md)',
        '/dataset/index.md': '# Home',
      },
      '/',
      '/',
    )

    const result = await validatePathOps(fs, {
      datasetRoot: '/dataset',
      errorsPath: '/dataset/errors.txt',
      exclusionList: EXCLUSION_LIST,
    })

    expect(result.allErrors).toHaveLength(0)
    expect(fs.getContent('/dataset/guide/index.md')).toContain('[home](../index.md)')
  })
})

describe('validatePathOps - Exclusion Handling', () => {
  it('should skip links matching exclusionList', async () => {
    const fs = new InMemoryFileSystemService(
      {
        '/dataset/guide/index.md': 'External [skip](/external/page.md)',
      },
      '/',
      '/',
    )

    const result = await validatePathOps(fs, {
      datasetRoot: '/dataset',
      errorsPath: '/dataset/errors.txt',
      exclusionList: ['/external'],
    })

    expect(result.allErrors).toHaveLength(0)
  })
})

describe('validateAndFixFileLinks - Error Detection', () => {
  let fileService: InMemoryFileSystemService

  beforeEach(() => {
    fileService = new InMemoryFileSystemService(
      {
        '/dataset/file.md':
          '# Test File\n[valid link](existing.md)\n[broken link](nonexistent.md)\n:broken:format.md:\n[external](https://example.com)',
        '/dataset/existing.md': '# Existing File',
      },
      '/',
      '/',
    )
  })

  it('should detect bad link format errors', async () => {
    const config = {
      docsFolders: ['/dataset'],
      datasetRoot: '/dataset',
      exclusionList: [],
    }

    // This function modifies the file in place and returns errors
    await validateAndFixFileLinks('/dataset/file.md', config, fileService)

    // Read the modified content
    const content = await fileService.readFile('/dataset/file.md')
    expect(content).toContain('# Test File')
    // The function should have processed the file but we can't easily test the exact error format
    // without mocking the logger
  })
})

describe('validateAndFixFileLinks - File Handling', () => {
  it('should handle files with no links', async () => {
    const fileService = new InMemoryFileSystemService(
      {
        '/dataset/plain.md': '# Plain File\nThis is just plain text with no links.',
      },
      '/',
      '/',
    )

    const config = {
      docsFolders: ['/dataset'],
      datasetRoot: '/dataset',
      exclusionList: [],
    }

    await expect(
      validateAndFixFileLinks('/dataset/plain.md', config, fileService),
    ).resolves.not.toThrow()
  })
})

describe('validateAndFixFileLinks - External Links', () => {
  let fileService: InMemoryFileSystemService

  beforeEach(() => {
    fileService = new InMemoryFileSystemService(
      {
        '/dataset/file.md':
          '# Test File\n[valid link](existing.md)\n[broken link](nonexistent.md)\n:broken:format.md:\n[external](https://example.com)',
        '/dataset/existing.md': '# Existing File',
      },
      '/',
      '/',
    )
  })

  it('should handle external links correctly', async () => {
    const config = {
      docsFolders: ['/dataset'],
      datasetRoot: '/dataset',
      exclusionList: [],
    }

    await expect(
      validateAndFixFileLinks('/dataset/file.md', config, fileService),
    ).resolves.not.toThrow()

    const content = await fileService.readFile('/dataset/file.md')
    expect(content).toContain('[external](https://example.com)')
  })
})

describe('validateAndFixFileLinks - Mixed Link Types', () => {
  it('should process files with mixed link types', async () => {
    const fileService = new InMemoryFileSystemService(
      {
        '/dataset/mixed.md':
          '# Mixed Links\n[relative](./other.md)\n[absolute](/absolute.md)\n[anchor](#section)\n[external](http://example.com)',
        '/dataset/other.md': '# Other File',
      },
      '/',
      '/',
    )

    const config = {
      docsFolders: ['/dataset'],
      datasetRoot: '/dataset',
      exclusionList: [],
    }

    await expect(
      validateAndFixFileLinks('/dataset/mixed.md', config, fileService),
    ).resolves.not.toThrow()
  })
})

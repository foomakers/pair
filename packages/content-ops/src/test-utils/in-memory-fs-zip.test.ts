import { describe, it, expect } from 'vitest'
import { InMemoryFileSystemService } from './in-memory-fs'

describe('InMemoryFileSystemService - ZIP operations', () => {
  it('should create and extract ZIP from single file', async () => {
    const fs = new InMemoryFileSystemService(
      {
        '/project/file.txt': 'content',
      },
      '/project',
      '/project',
    )

    await fs.createZip(['/project/file.txt'], '/project/archive.zip')

    expect(fs.existsSync('/project/archive.zip')).toBe(true)

    await fs.extractZip('/project/archive.zip', '/project/extracted')

    expect(fs.existsSync('/project/extracted/file.txt')).toBe(true)
    expect(await fs.readFile('/project/extracted/file.txt')).toBe('content')
  })

  it('should create and extract ZIP from directory', async () => {
    const fs = new InMemoryFileSystemService(
      {
        '/project/src/index.ts': 'export {}',
        '/project/src/utils.ts': 'export const util = 1',
        '/project/src/nested/deep.ts': 'deep file',
      },
      '/project',
      '/project',
    )

    await fs.createZip(['/project/src'], '/project/bundle.zip')

    expect(fs.existsSync('/project/bundle.zip')).toBe(true)

    await fs.extractZip('/project/bundle.zip', '/project/output')

    expect(fs.existsSync('/project/output/index.ts')).toBe(true)
    expect(fs.existsSync('/project/output/utils.ts')).toBe(true)
    expect(fs.existsSync('/project/output/nested/deep.ts')).toBe(true)
    expect(await fs.readFile('/project/output/index.ts')).toBe('export {}')
    expect(await fs.readFile('/project/output/nested/deep.ts')).toBe('deep file')
  })

  it('should create ZIP from multiple sources', async () => {
    const fs = new InMemoryFileSystemService(
      {
        '/project/README.md': '# Project',
        '/project/src/index.ts': 'export {}',
        '/project/config.json': '{}',
      },
      '/project',
      '/project',
    )

    await fs.createZip(
      ['/project/README.md', '/project/config.json', '/project/src'],
      '/project/package.zip',
    )

    await fs.extractZip('/project/package.zip', '/project/unpacked')

    expect(fs.existsSync('/project/unpacked/README.md')).toBe(true)
    expect(fs.existsSync('/project/unpacked/config.json')).toBe(true)
    expect(fs.existsSync('/project/unpacked/index.ts')).toBe(true)
  })

  it('should throw error when extracting non-existent ZIP', async () => {
    const fs = new InMemoryFileSystemService({}, '/project', '/project')

    await expect(fs.extractZip('/project/missing.zip', '/project/out')).rejects.toThrow(
      'ZIP file not found',
    )
  })

  it('should handle empty directory in ZIP', async () => {
    const fs = new InMemoryFileSystemService(
      {
        '/project/src/file.ts': 'content',
      },
      '/project',
      '/project',
    )

    await fs.createZip(['/project/src'], '/project/archive.zip')
    await fs.extractZip('/project/archive.zip', '/project/restored')

    expect(fs.existsSync('/project/restored/file.ts')).toBe(true)
    expect(await fs.readFile('/project/restored/file.ts')).toBe('content')
  })
})

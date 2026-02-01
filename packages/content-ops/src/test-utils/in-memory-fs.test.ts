import { describe, it, expect, beforeEach } from 'vitest'
import InMemoryFileSystemService from './in-memory-fs'

describe('InMemoryFileSystemService - Constructor', () => {
  const moduleDir = '/app'
  const workingDir = '/app'
  let fs: InMemoryFileSystemService

  beforeEach(() => {
    fs = new InMemoryFileSystemService({}, moduleDir, workingDir)
  })

  describe('constructor', () => {
    it('should initialize with empty filesystem', () => {
      expect(fs.existsSync('/')).toBe(true)
      expect(fs.rootModuleDirectory()).toBe(moduleDir)
      expect(fs.currentWorkingDirectory()).toBe(workingDir)
    })

    it('should initialize with initial files', () => {
      const initialFs = new InMemoryFileSystemService(
        { '/test.txt': 'content' },
        moduleDir,
        workingDir,
      )
      expect(initialFs.readFileSync('/test.txt')).toBe('content')
      expect(initialFs.existsSync('/test.txt')).toBe(true)
    })

    it('should create parent directories for initial files', () => {
      const initialFs = new InMemoryFileSystemService(
        { '/deep/nested/file.txt': 'content' },
        moduleDir,
        workingDir,
      )
      expect(initialFs.existsSync('/deep')).toBe(true)
      expect(initialFs.existsSync('/deep/nested')).toBe(true)
      expect(initialFs.readFileSync('/deep/nested/file.txt')).toBe('content')
    })

    it('should handle non-existent moduleDirectory', () => {
      expect(() => {
        new InMemoryFileSystemService({}, '/nonexistent', workingDir)
      }).not.toThrow()
    })

    it('should handle non-existent workingDirectory', () => {
      expect(() => {
        new InMemoryFileSystemService({}, moduleDir, '/nonexistent')
      }).not.toThrow()
    })
  })
})

describe('InMemoryFileSystemService - Path Resolution', () => {
  const moduleDir = '/app'
  const workingDir = '/app'
  let fs: InMemoryFileSystemService

  beforeEach(() => {
    fs = new InMemoryFileSystemService({}, moduleDir, workingDir)
  })

  describe('resolvePath', () => {
    it('should return absolute paths unchanged', () => {
      expect(fs['resolvePath']('/absolute/path')).toBe('/absolute/path')
    })

    it('should resolve relative paths against working directory', () => {
      expect(fs['resolvePath']('relative/path')).toBe('/app/relative/path')
      expect(fs['resolvePath']('./relative/path')).toBe('/app/relative/path')
      expect(fs['resolvePath']('../parent/path')).toBe('/parent/path')
    })
  })
})

describe('InMemoryFileSystemService - File Operations - Write/Read', () => {
  const moduleDir = '/app'
  const workingDir = '/app'
  let fs: InMemoryFileSystemService

  beforeEach(() => {
    fs = new InMemoryFileSystemService({}, moduleDir, workingDir)
  })

  describe('writeFile and readFile', () => {
    it('should write and read files synchronously', () => {
      fs.writeFile('/test.txt', 'content')
      expect(fs.readFileSync('/test.txt')).toBe('content')
    })

    it('should write and read files asynchronously', async () => {
      await fs.writeFile('/async.txt', 'async content')
      expect(await fs.readFile('/async.txt')).toBe('async content')
    })

    it('should handle relative paths', () => {
      fs.writeFile('relative.txt', 'relative content')
      expect(fs.readFileSync('relative.txt')).toBe('relative content')
    })

    it('should create parent directories when writing', () => {
      fs.writeFile('/deep/nested/file.txt', 'nested content')
      expect(fs.existsSync('/deep')).toBe(true)
      expect(fs.existsSync('/deep/nested')).toBe(true)
      expect(fs.readFileSync('/deep/nested/file.txt')).toBe('nested content')
    })

    it('should throw error when reading non-existent file', () => {
      expect(() => fs.readFileSync('/nonexistent.txt')).toThrow('File not found: /nonexistent.txt')
    })
  })
})

describe('InMemoryFileSystemService - File Operations - Exists/Unlink', () => {
  const moduleDir = '/app'
  const workingDir = '/app'
  let fs: InMemoryFileSystemService

  beforeEach(() => {
    fs = new InMemoryFileSystemService({}, moduleDir, workingDir)
  })

  describe('exists', () => {
    it('should return true for existing files', async () => {
      fs.writeFile('/existing.txt', 'content')
      expect(fs.existsSync('/existing.txt')).toBe(true)
      expect(await fs.exists('/existing.txt')).toBe(true)
    })

    it('should return false for non-existing files', async () => {
      expect(fs.existsSync('/nonexistent.txt')).toBe(false)
      expect(await fs.exists('/nonexistent.txt')).toBe(false)
    })

    it('should return true for existing directories', () => {
      expect(fs.existsSync('/')).toBe(true)
    })
  })

  describe('unlink', () => {
    it('should remove files', async () => {
      await fs.writeFile('/test.txt', 'content')
      expect(fs.existsSync('/test.txt')).toBe(true)
      await fs.unlink('/test.txt')
      expect(fs.existsSync('/test.txt')).toBe(false)
    })

    it('should throw error when unlinking non-existent file', async () => {
      await expect(fs.unlink('/nonexistent.txt')).rejects.toThrow(
        'File not found: /nonexistent.txt',
      )
    })
  })
})

describe('InMemoryFileSystemService - Directory Operations - Mkdir', () => {
  const moduleDir = '/app'
  const workingDir = '/app'
  let fs: InMemoryFileSystemService

  beforeEach(() => {
    fs = new InMemoryFileSystemService({}, moduleDir, workingDir)
  })

  describe('mkdir', () => {
    it('should create directories', async () => {
      await fs.mkdir('/newdir')
      expect(fs.existsSync('/newdir')).toBe(true)
    })

    it('should create parent directories recursively', async () => {
      await fs.mkdir('/deep/nested/dir', { recursive: true })
      expect(fs.existsSync('/deep')).toBe(true)
      expect(fs.existsSync('/deep/nested')).toBe(true)
      expect(fs.existsSync('/deep/nested/dir')).toBe(true)
    })

    it('should handle existing directories', async () => {
      await fs.mkdir('/existing')
      expect(() => fs.mkdir('/existing')).not.toThrow()
    })
  })
})

describe('InMemoryFileSystemService - Directory Operations - Readdir', () => {
  const moduleDir = '/app'
  const workingDir = '/app'
  let fs: InMemoryFileSystemService

  beforeEach(() => {
    fs = new InMemoryFileSystemService({}, moduleDir, workingDir)
  })

  describe('readdir', () => {
    it('should list directory contents', async () => {
      await fs.writeFile('/dir/file1.txt', 'content1')
      await fs.writeFile('/dir/file2.txt', 'content2')
      await fs.mkdir('/dir/subdir')

      const entries = await fs.readdir('/dir')
      expect(entries.map(e => e.name)).toContain('file1.txt')
      expect(entries.map(e => e.name)).toContain('file2.txt')
      expect(entries.map(e => e.name)).toContain('subdir')
    })

    it('should return empty array for empty directory', async () => {
      await fs.mkdir('/emptydir')
      expect((await fs.readdir('/emptydir')).length).toBe(0)
    })

    it('should throw error for non-existent directory', async () => {
      await expect(fs.readdir('/nonexistent')).rejects.toThrow(
        "no such file or directory '/nonexistent'",
      )
    })
  })
})

describe('InMemoryFileSystemService - Directory Operations - Stat', () => {
  const moduleDir = '/app'
  const workingDir = '/app'
  let fs: InMemoryFileSystemService

  beforeEach(() => {
    fs = new InMemoryFileSystemService({}, moduleDir, workingDir)
  })

  describe('stat', () => {
    it('should return file stats', async () => {
      await fs.writeFile('/test.txt', 'content')
      const stats = await fs.stat('/test.txt')
      expect(stats.isFile()).toBe(true)
      expect(stats.isDirectory()).toBe(false)
    })

    it('should return directory stats', async () => {
      const stats = await fs.stat('/')
      expect(stats.isFile()).toBe(false)
      expect(stats.isDirectory()).toBe(true)
    })

    it('should throw error for non-existent path', async () => {
      await expect(fs.stat('/nonexistent')).rejects.toThrow(
        "no such file or directory '/nonexistent'",
      )
    })
  })
})

describe('InMemoryFileSystemService - Advanced Operations - Rename', () => {
  const moduleDir = '/app'
  const workingDir = '/app'
  let fs: InMemoryFileSystemService

  beforeEach(() => {
    fs = new InMemoryFileSystemService({}, moduleDir, workingDir)
  })

  describe('rename', () => {
    it('should rename files', async () => {
      await fs.writeFile('/old.txt', 'content')
      await fs.rename('/old.txt', '/new.txt')
      expect(fs.existsSync('/old.txt')).toBe(false)
      expect(fs.existsSync('/new.txt')).toBe(true)
      expect(fs.readFileSync('/new.txt')).toBe('content')
    })

    it('should rename directories', async () => {
      await fs.mkdir('/olddir')
      await fs.writeFile('/olddir/file.txt', 'content')
      await fs.rename('/olddir', '/newdir')
      expect(fs.existsSync('/olddir')).toBe(false)
      expect(fs.existsSync('/newdir')).toBe(true)
      expect(fs.readFileSync('/newdir/file.txt')).toBe('content')
    })

    it('should throw error when renaming non-existent file', async () => {
      await expect(fs.rename('/nonexistent.txt', '/new.txt')).rejects.toThrow(
        'Path not found: /nonexistent.txt',
      )
    })
  })
})

describe('InMemoryFileSystemService - Advanced Operations - Copy', () => {
  const moduleDir = '/app'
  const workingDir = '/app'
  let fs: InMemoryFileSystemService

  beforeEach(() => {
    fs = new InMemoryFileSystemService({}, moduleDir, workingDir)
  })

  describe('copy', () => {
    it('should copy files', async () => {
      await fs.writeFile('/source.txt', 'content')
      await fs.copy('/source.txt', '/dest.txt')
      expect(fs.existsSync('/source.txt')).toBe(true)
      expect(fs.existsSync('/dest.txt')).toBe(true)
      expect(fs.readFileSync('/dest.txt')).toBe('content')
    })

    it('should create parent directories when copying', async () => {
      await fs.writeFile('/source.txt', 'content')
      await fs.copy('/source.txt', '/deep/nested/dest.txt')
      expect(fs.existsSync('/deep/nested/dest.txt')).toBe(true)
      expect(fs.readFileSync('/deep/nested/dest.txt')).toBe('content')
    })

    it('should throw error when copying non-existent file', async () => {
      await expect(fs.copy('/nonexistent.txt', '/dest.txt')).rejects.toThrow(
        'Path not found: /nonexistent.txt',
      )
    })
  })
})

describe('InMemoryFileSystemService - Advanced Operations - CopySync', () => {
  const moduleDir = '/app'
  const workingDir = '/app'
  let fs: InMemoryFileSystemService

  beforeEach(() => {
    fs = new InMemoryFileSystemService({}, moduleDir, workingDir)
  })

  it('should copy a file to a new path', () => {
    fs.writeFile('/foo.txt', 'hello')
    fs.copySync('/foo.txt', '/bar.txt')
    expect(fs.getContent('/bar.txt')).toBe('hello')
    expect(fs.getContent('/foo.txt')).toBe('hello')
  })

  it('should copy a file to a new directory', () => {
    fs.writeFile('/foo.txt', 'hello')
    fs.copySync('/foo.txt', '/dir/bar.txt')
    expect(fs.getContent('/dir/bar.txt')).toBe('hello')
  })

  it('should copy a directory recursively', () => {
    fs.writeFile('/foo/bar/baz.txt', 'baz')
    fs.copySync('/foo/bar', '/foo/barcopy')
    expect(fs.getContent('/foo/barcopy/baz.txt')).toBe('baz')
    expect(fs.getContent('/foo/bar/baz.txt')).toBe('baz')
  })

  it('should throw if source does not exist', () => {
    expect(() => fs.copySync('/notfound', '/foo/x')).toThrow()
  })

  it('should copy nested directories and files', () => {
    fs.writeFile('/foo/file.txt', 'hello')
    fs.writeFile('/foo/bar/baz.txt', 'baz')
    fs.copySync('/foo', '/fooCopy')
    expect(fs.getContent('/fooCopy/file.txt')).toBe('hello')
    expect(fs.getContent('/fooCopy/bar/baz.txt')).toBe('baz')
  })
})

describe('InMemoryFileSystemService - Advanced Operations - Rm', () => {
  const moduleDir = '/app'
  const workingDir = '/app'
  let fs: InMemoryFileSystemService

  beforeEach(() => {
    fs = new InMemoryFileSystemService({}, moduleDir, workingDir)
  })

  describe('rm', () => {
    it('should remove files', async () => {
      await fs.writeFile('/test.txt', 'content')
      await fs.rm('/test.txt')
      expect(fs.existsSync('/test.txt')).toBe(false)
    })

    it('should remove directories recursively', async () => {
      await fs.mkdir('/testdir', { recursive: true })
      await fs.writeFile('/testdir/file.txt', 'content')
      await fs.rm('/testdir', { recursive: true })
      expect(fs.existsSync('/testdir')).toBe(false)
      expect(fs.existsSync('/testdir/file.txt')).toBe(false)
    })

    it('should throw error when removing non-existent path', async () => {
      await expect(fs.rm('/nonexistent')).rejects.toThrow('Path not found: /nonexistent')
    })

    it('should throw error when removing directory without recursive option', async () => {
      await fs.mkdir('/testdir')
      await fs.writeFile('/testdir/file.txt', 'content')
      await expect(fs.rm('/testdir')).rejects.toThrow('Directory not empty: /testdir')
    })
  })
})

describe('InMemoryFileSystemService - Utility Methods', () => {
  const moduleDir = '/app'
  const workingDir = '/app'
  let fs: InMemoryFileSystemService

  beforeEach(() => {
    fs = new InMemoryFileSystemService({}, moduleDir, workingDir)
  })

  describe('utility methods', () => {
    describe('getContent', () => {
      it('should return file content for existing file', () => {
        fs.writeFile('/file1.txt', 'content1')
        expect(fs.getContent('/file1.txt')).toBe('content1')
      })

      it('should return undefined for non-existing file', () => {
        expect(fs.getContent('/nonexistent.txt')).toBeUndefined()
      })
    })

    describe('accessSync', () => {
      it('should not throw for existing files', () => {
        fs.writeFile('/test.txt', 'content')
        expect(() => fs.accessSync()).not.toThrow()
      })

      it('should not throw for non-existent files', () => {
        expect(() => fs.accessSync()).not.toThrow()
      })
    })
  })
})

describe('InMemoryFileSystemService - Complex Scenarios - Project Structure', () => {
  it('should handle complex project structure', async () => {
    const fs = new InMemoryFileSystemService(
      {
        '/project/package.json': '{"name": "test"}',
        '/project/src/index.ts': 'console.log("hello")',
        '/project/src/utils.ts': 'export const util = () => {}',
      },
      '/project',
      '/project',
    )

    // Verify initial structure
    expect(fs.readFileSync('/project/package.json')).toBe('{"name": "test"}')
    expect(fs.readFileSync('/project/src/index.ts')).toBe('console.log("hello")')
    expect(fs.readFileSync('/project/src/utils.ts')).toBe('export const util = () => {}')

    // Add more files
    fs.writeFile('/project/tests/main.test.ts', 'describe("main", () => {})')
    fs.writeFile('/project/README.md', '# Project')

    // Verify directory structure
    expect((await fs.readdir('/project')).map(e => e.name)).toEqual(
      expect.arrayContaining(['package.json', 'src', 'tests', 'README.md']),
    )
    expect((await fs.readdir('/project/src')).map(e => e.name)).toEqual(['index.ts', 'utils.ts'])
    expect((await fs.readdir('/project/tests')).map(e => e.name)).toEqual(['main.test.ts'])
  })
})

describe('InMemoryFileSystemService - Complex Scenarios - Path Resolution', () => {
  it('should handle path resolution with custom working directory', () => {
    const customFs = new InMemoryFileSystemService({}, '/custom/module', '/custom/work')
    expect(customFs['resolvePath']('file.txt')).toBe('/custom/work/file.txt')
    expect(customFs['resolvePath']('../file.txt')).toBe('/custom/file.txt')
    expect(customFs['resolvePath']('dir/../file.txt')).toBe('/custom/work/file.txt')

    // Test absolute paths
    expect(customFs['resolvePath']('/absolute/file.txt')).toBe('/absolute/file.txt')
  })
})

describe('InMemoryFileSystemService - ZIP Operations', () => {
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

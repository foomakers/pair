import { describe, it, expect, beforeEach } from 'vitest'
import { copyFileHelper, copyDirHelper } from './file-operations'
import { InMemoryFileSystemService } from '../test-utils/in-memory-fs'

let fileService: InMemoryFileSystemService

beforeEach(() => {
  fileService = new InMemoryFileSystemService({
    '/source.txt': 'source content',
    '/existing.txt': 'existing content',
  })
})

describe('copyFileHelper', () => {
  it('should copy file with overwrite behavior', async () => {
    await copyFileHelper(fileService, '/source.txt', '/target.txt', 'overwrite')

    const content = await fileService.readFile('/target.txt')
    expect(content).toBe('source content')
  })

  it('should copy file with add behavior when target does not exist', async () => {
    await copyFileHelper(fileService, '/source.txt', '/new.txt', 'add')

    const content = await fileService.readFile('/new.txt')
    expect(content).toBe('source content')
  })

  it('should skip copying with add behavior when target exists', async () => {
    await copyFileHelper(fileService, '/source.txt', '/existing.txt', 'add')

    const content = await fileService.readFile('/existing.txt')
    expect(content).toBe('existing content') // Should remain unchanged
  })

  it('should create parent directories when copying', async () => {
    await copyFileHelper(fileService, '/source.txt', '/deep/nested/target.txt', 'overwrite')

    const content = await fileService.readFile('/deep/nested/target.txt')
    expect(content).toBe('source content')
  })
})

describe('copyFileHelper - errors', () => {
  it('should throw error when source file does not exist', async () => {
    await expect(
      copyFileHelper(fileService, '/nonexistent.txt', '/target.txt', 'overwrite'),
    ).rejects.toThrow()
  })
})

describe('copyDirHelper - basic copy', () => {
  beforeEach(() => {
    fileService = new InMemoryFileSystemService({
      '/source/dir/file1.txt': 'file1 content',
      '/source/dir/file2.txt': 'file2 content',
      '/source/dir/nested/file3.txt': 'file3 content',
    })
  })

  it('should copy directory recursively', async () => {
    await copyDirHelper({
      fileService,
      oldDir: '/source/dir',
      newDir: '/target/dir',
      defaultBehavior: 'overwrite',
      datasetRoot: '/',
    })

    const file1 = await fileService.readFile('/target/dir/file1.txt')
    const file2 = await fileService.readFile('/target/dir/file2.txt')
    const file3 = await fileService.readFile('/target/dir/nested/file3.txt')

    expect(file1).toBe('file1 content')
    expect(file2).toBe('file2 content')
    expect(file3).toBe('file3 content')
  })
})

describe('copyDirHelper - add behavior', () => {
  beforeEach(() => {
    fileService = new InMemoryFileSystemService({
      '/source/dir/file1.txt': 'file1 content',
      '/source/dir/file2.txt': 'file2 content',
      '/source/dir/nested/file3.txt': 'file3 content',
    })
  })

  it('should handle add behavior for directories', async () => {
    // First copy with overwrite
    await copyDirHelper({
      fileService,
      oldDir: '/source/dir',
      newDir: '/target/dir',
      defaultBehavior: 'overwrite',
      datasetRoot: '/',
    })

    // Modify a file in target
    await fileService.writeFile('/target/dir/file1.txt', 'modified content')

    // Try to copy again with add behavior
    await copyDirHelper({
      fileService,
      oldDir: '/source/dir',
      newDir: '/target/dir',
      defaultBehavior: 'add',
      datasetRoot: '/',
    })

    // File should remain modified (not overwritten)
    const content = await fileService.readFile('/target/dir/file1.txt')
    expect(content).toBe('modified content')
  })
})

describe('copyDirHelper - error cases', () => {
  it('should throw error when source directory does not exist', async () => {
    await expect(
      copyDirHelper({
        fileService,
        oldDir: '/nonexistent',
        newDir: '/target',
        defaultBehavior: 'overwrite',
        datasetRoot: '/',
      }),
    ).rejects.toThrow()
  })
})

import { describe, it, expect } from 'vitest'
import { validatePaths, validateSourceExists } from './file-validations'
import { InMemoryFileSystemService } from '../test-utils/in-memory-fs'

describe('validatePaths', () => {
  it('should allow valid paths within dataset root', () => {
    expect(() => {
      validatePaths({
        source: 'source.md',
        target: 'target.md',
        srcPath: '/dataset/source.md',
        destPath: '/dataset/target.md',
        datasetRoot: '/dataset',
      })
    }).not.toThrow()
  })

  it('should throw error when source escapes dataset root', () => {
    expect(() => {
      validatePaths({
        source: '../outside.md',
        target: 'target.md',
        srcPath: '/outside.md',
        destPath: '/dataset/target.md',
        datasetRoot: '/dataset',
      })
    }).toThrow('Source or target escapes the dataset root')
  })

  it('should throw error when target escapes dataset root', () => {
    expect(() => {
      validatePaths({
        source: 'source.md',
        target: '../outside.md',
        srcPath: '/dataset/source.md',
        destPath: '/outside.md',
        datasetRoot: '/dataset',
      })
    }).toThrow('Source or target escapes the dataset root')
  })

  it('should allow same source and target (no-op)', () => {
    expect(() => {
      validatePaths({
        source: 'same.md',
        target: 'same.md',
        srcPath: '/dataset/same.md',
        destPath: '/dataset/same.md',
        datasetRoot: '/dataset',
      })
    }).not.toThrow()
  })
})

describe('validateSourceExists', () => {
  it('should return stats for existing file', async () => {
    const fileService = new InMemoryFileSystemService(
      {
        '/dataset/file.md': '# Test',
      },
      '/',
      '/',
    )

    const stats = await validateSourceExists(fileService, '/dataset/file.md')
    expect(stats).toBeDefined()
    expect(stats.isFile()).toBe(true)
  })

  it('should throw error for non-existent file', async () => {
    const fileService = new InMemoryFileSystemService({}, '/', '/')

    await expect(validateSourceExists(fileService, '/dataset/nonexistent.md')).rejects.toThrow(
      'Source does not exist',
    )
  })
})

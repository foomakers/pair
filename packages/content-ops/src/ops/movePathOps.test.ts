import { describe, it, expect, beforeEach } from 'vitest'
import { movePathOps } from './movePathOps'
import {
  TEST_SETUP,
  TEST_ASSERTIONS,
  TEST_FILE_STRUCTURES,
  InMemoryFileSystemService,
} from '../test-utils'

describe('movePathOps', () => {
  let fileService: InMemoryFileSystemService

  beforeEach(() => {
    fileService = TEST_SETUP.createBasicSetup()
  })

  it('should move a file and update links', async () => {
    const result = await movePathOps({
      fileService,
      source: 'source.md',
      target: 'moved.md',
      datasetRoot: '/dataset',
    })

    TEST_ASSERTIONS.assertSuccessfulOperation(result)
    await TEST_ASSERTIONS.assertFileExists(
      fileService,
      '/dataset/moved.md',
      '# Source File\n[link](target.md)',
    )
    await TEST_ASSERTIONS.assertFileDoesNotExist(fileService, '/dataset/source.md')
  })

  it('should update links in other files when moving', async () => {
    const result = await movePathOps({
      fileService,
      source: 'source.md',
      target: 'moved.md',
      datasetRoot: '/dataset',
    })

    TEST_ASSERTIONS.assertSuccessfulOperation(result)
    await TEST_ASSERTIONS.assertFileContains(fileService, '/dataset/other.md', '[link](moved.md)')
  })
})

describe('movePathOps - directory operations', () => {
  let fileService: InMemoryFileSystemService

  beforeEach(() => {
    fileService = TEST_SETUP.createBasicSetup()
  })

  it('should move a directory and update links', async () => {
    fileService = TEST_SETUP.createDirectorySetup()
    const result = await movePathOps({
      fileService,
      source: 'folder',
      target: 'moved-folder',
      datasetRoot: '/dataset',
    })

    TEST_ASSERTIONS.assertSuccessfulOperation(result)
    await TEST_ASSERTIONS.assertFileExists(
      fileService,
      '/dataset/moved-folder/file1.md',
      '# File 1',
    )
    await TEST_ASSERTIONS.assertFileDoesNotExist(fileService, '/dataset/folder')
  })
})

describe('movePathOps - error cases', () => {
  let fileService: InMemoryFileSystemService

  beforeEach(() => {
    fileService = TEST_SETUP.createBasicSetup()
  })

  it('should throw error for nonexistent source', async () => {
    await expect(
      movePathOps({
        fileService,
        source: 'nonexistent.md',
        target: 'target.md',
        datasetRoot: '/dataset',
      }),
    ).rejects.toThrow()
  })

  it('should respect behavior options', async () => {
    fileService = new InMemoryFileSystemService(TEST_FILE_STRUCTURES.existingTarget, '/', '/')

    const result = await movePathOps({
      fileService,
      source: 'source.md',
      target: 'target.md',
      datasetRoot: '/dataset',
      options: {
        defaultBehavior: 'add',
      },
    })

    TEST_ASSERTIONS.assertSuccessfulOperation(result)
    await TEST_ASSERTIONS.assertFileExists(fileService, '/dataset/target.md', '# Existing Target')
    // With 'add' behavior, if target exists, operation should be skipped, so source should still exist
    await TEST_ASSERTIONS.assertFileExists(fileService, '/dataset/source.md', '# Source')
  })
})

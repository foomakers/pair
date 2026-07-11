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
  it('should throw INVALID_PATH error for absolute source and target paths', async () => {
    await expect(
      movePathOps({
        fileService,
        source: '/dataset/kb/source.md',
        target: '/project/kb/copied.md',
        datasetRoot: '/dataset',
      }),
    ).rejects.toThrow('Source and target paths must be relative, not absolute')
  })

  it('should not remove excluded destination-only entries during mirror cleanup', async () => {
    // Mirrors copyPathOps' behavior: excludePaths must reach handleMirrorCleanup
    // so operational areas (e.g. .pair/working) survive a mirror move (D14).
    fileService = new InMemoryFileSystemService(
      {
        '/dataset/folder/file1.md': '# File 1',
        '/dataset/moved-folder/working/checkpoint.md': 'DO NOT TOUCH',
      },
      '/dataset',
      '/dataset',
    )

    await movePathOps({
      fileService,
      source: 'folder',
      target: 'moved-folder',
      datasetRoot: '/dataset',
      options: {
        defaultBehavior: 'mirror',
        flatten: false,
        targets: [],
        excludePaths: ['/dataset/moved-folder/working'],
      },
    })

    await TEST_ASSERTIONS.assertFileExists(
      fileService,
      '/dataset/moved-folder/file1.md',
      '# File 1',
    )
    await TEST_ASSERTIONS.assertFileExists(
      fileService,
      '/dataset/moved-folder/working/checkpoint.md',
      'DO NOT TOUCH',
    )
  })

  it('should not move an entry whose destination is excluded (per-entry guard, D14)', async () => {
    fileService = new InMemoryFileSystemService(
      {
        '/dataset/folder/keep.md': '# Keep',
        '/dataset/folder/working/checkpoint.md': 'DO NOT MOVE',
      },
      '/dataset',
      '/dataset',
    )

    await movePathOps({
      fileService,
      source: 'folder',
      target: 'moved-folder',
      datasetRoot: '/dataset',
      options: {
        defaultBehavior: 'overwrite',
        flatten: false,
        targets: [],
        excludePaths: ['/dataset/moved-folder/working'],
      },
    })

    await TEST_ASSERTIONS.assertFileExists(fileService, '/dataset/moved-folder/keep.md', '# Keep')
    await TEST_ASSERTIONS.assertFileDoesNotExist(
      fileService,
      '/dataset/moved-folder/working/checkpoint.md',
    )
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
        flatten: false,
        targets: [],
      },
    })

    TEST_ASSERTIONS.assertSuccessfulOperation(result)
    await TEST_ASSERTIONS.assertFileExists(fileService, '/dataset/target.md', '# Existing Target')
    // With 'add' behavior, if target exists, operation should be skipped, so source should still exist
    await TEST_ASSERTIONS.assertFileExists(fileService, '/dataset/source.md', '# Source')
  })
})

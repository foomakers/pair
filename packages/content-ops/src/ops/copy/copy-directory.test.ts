import { describe, it, beforeEach, expect } from 'vitest'
import { copyPathOps } from './copyPathOps'
import { TEST_SETUP, TEST_ASSERTIONS, InMemoryFileSystemService } from '../../test-utils'
import { defaultSyncOptions } from '../SyncOptions'

describe('handleDirectoryCopy (via copyPathOps, no naming transforms)', () => {
  let fileService: InMemoryFileSystemService

  beforeEach(() => {
    fileService = TEST_SETUP.createBasicSetup()
  })

  it('should copy a directory and update links', async () => {
    fileService = TEST_SETUP.createDirectorySetup()
    const result = await copyPathOps({
      fileService,
      source: 'folder',
      target: 'copied-folder',
      datasetRoot: '/dataset',
    })

    TEST_ASSERTIONS.assertSuccessfulOperation(result)
    await TEST_ASSERTIONS.assertFileExists(
      fileService,
      '/dataset/copied-folder/file1.md',
      '# File 1',
    )
  })

  // The mirror cleanup runs before the copy and, since #393, descends the shared tree.
  // It must be given the SAME ownership context the copy honors, or it deletes what the
  // copy would never have installed. This pins the wiring end to end, not just the helper.
  it('mirror cleanup leaves an EXCLUDED target subtree untouched while removing real orphans', async () => {
    fileService = new InMemoryFileSystemService(
      {
        '/dataset/kb/keep.md': '# keep',
        '/dataset/kb/how-to/01-keep.md': '# how-to keep',
        '/dataset/installed/keep.md': '# keep',
        '/dataset/installed/how-to/01-keep.md': '# how-to keep',
        '/dataset/installed/how-to/04-orphan.md': '# stale',
        '/dataset/installed/vendor/theirs.md': '# not ours',
      },
      '/',
      '/',
    )

    await copyPathOps({
      fileService,
      source: 'kb',
      target: 'installed',
      datasetRoot: '/dataset',
      options: {
        ...defaultSyncOptions(),
        folderBehavior: { kb: 'mirror' },
        exclude: ['vendor'],
      },
    })

    // Excluded subtree: the copy treats it as if it were never in the source, so cleanup
    // must not own it either — even though it is absent from the source side.
    await expect(fileService.exists('/dataset/installed/vendor/theirs.md')).resolves.toBe(true)
    // A genuine orphan nested under a shared directory still goes.
    await expect(fileService.exists('/dataset/installed/how-to/04-orphan.md')).resolves.toBe(false)
    await expect(fileService.exists('/dataset/installed/how-to/01-keep.md')).resolves.toBe(true)
  })
})

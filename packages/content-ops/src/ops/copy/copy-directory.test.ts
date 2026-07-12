import { describe, it, beforeEach } from 'vitest'
import { copyPathOps } from './copyPathOps'
import { TEST_SETUP, TEST_ASSERTIONS, InMemoryFileSystemService } from '../../test-utils'

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
})

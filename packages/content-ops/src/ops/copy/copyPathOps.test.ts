import { describe, it, expect, beforeEach } from 'vitest'
import { copyPathOps } from './copyPathOps'
import { TEST_SETUP, InMemoryFileSystemService } from '../../test-utils'

// copyPathOps' own dispatch-level concerns: top-level path validation and
// source-existence checks that happen before it routes to handleFileCopy /
// handleDirectoryCopy / copyDirectoryWithTransforms. Behavior owned by those
// sub-modules is tested in their own co-located test files.
describe('copyPathOps - dispatch', () => {
  let fileService: InMemoryFileSystemService

  beforeEach(() => {
    fileService = TEST_SETUP.createBasicSetup()
  })

  it('should throw INVALID_PATH error for absolute source and target paths', async () => {
    await expect(
      copyPathOps({
        fileService,
        source: '/dataset/kb/source.md',
        target: '/project/kb/copied.md',
        datasetRoot: '/dataset',
      }),
    ).rejects.toThrow('Source and target paths must be relative, not absolute')
  })

  it('should throw error for nonexistent source', async () => {
    await expect(
      copyPathOps({
        fileService,
        source: 'nonexistent.md',
        target: 'target.md',
        datasetRoot: '/dataset',
      }),
    ).rejects.toThrow()
  })
})

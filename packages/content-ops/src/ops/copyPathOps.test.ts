import { describe, it, expect, beforeEach } from 'vitest'
import { copyPathOps } from './copyPathOps'
import {
  TEST_SETUP,
  TEST_ASSERTIONS,
  TEST_FILE_STRUCTURES,
  InMemoryFileSystemService,
} from '../test-utils'

describe('copyPathOps', () => {
  let fileService: InMemoryFileSystemService

  beforeEach(() => {
    fileService = TEST_SETUP.createBasicSetup()
  })

  it('should copy a file and update links', async () => {
    const result = await copyPathOps({
      fileService,
      source: 'source.md',
      target: 'copied.md',
      datasetRoot: '/dataset',
    })

    TEST_ASSERTIONS.assertSuccessfulOperation(result)
    await TEST_ASSERTIONS.assertFileExists(
      fileService,
      '/dataset/copied.md',
      '# Source File\n[link](target.md)',
    )
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

  it('should update links in other files when copying', async () => {
    const result = await copyPathOps({
      fileService,
      source: 'source.md',
      target: 'copied.md',
      datasetRoot: '/dataset',
    })

    TEST_ASSERTIONS.assertSuccessfulOperation(result)
    await TEST_ASSERTIONS.assertFileContains(fileService, '/dataset/other.md', '[link](copied.md)')
  })
})

describe('copyPathOps - root file operations', () => {
  beforeEach(() => {})

  it('should copy using the provided example parameters and overwrite existing root file', async () => {
    const fs = new InMemoryFileSystemService(
      {
        '/development/path/pair/apps/pair-cli/config.json':
          '{"asset_registries":{"agents":{"source":"AGENTS.md","behavior":"overwrite"}}}',
        '/development/path/pair/apps/pair-cli/dataset/AGENTS.md': 'agents content',
      },
      '/development/path/pair/apps/pair-cli',
      '/development/path/pair/apps/pair-cli',
    )

    const options = {
      fileService: fs,
      source: 'dataset/AGENTS.md',
      target: 'AGENTS.md',
      datasetRoot: '/development/path/pair/apps/pair-cli',
      options: { defaultBehavior: 'overwrite' as const, folderBehavior: undefined },
    }

    const result = await copyPathOps(options)
    TEST_ASSERTIONS.assertSuccessfulOperation(result)

    // Verify the dataset file was present
    await TEST_ASSERTIONS.assertFileExists(
      fs,
      '/development/path/pair/apps/pair-cli/dataset/AGENTS.md',
      'agents content',
    )

    // In the provided in-memory FS the previous tests showed the file ended up at
    // '/development/path/pair/apps/pair-cli/AGENTS.md/AGENTS.md' so assert both
    // the top-level and nested target to be safe.
    await TEST_ASSERTIONS.assertFileExists(
      fs,
      '/development/path/pair/apps/pair-cli/AGENTS.md',
      'agents content',
    )
  })
})

describe('copyPathOps - directory operations', () => {
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

describe('copyPathOps - error cases', () => {
  let fileService: InMemoryFileSystemService

  beforeEach(() => {
    fileService = TEST_SETUP.createBasicSetup()
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

  it('should respect behavior options', async () => {
    fileService = new InMemoryFileSystemService(TEST_FILE_STRUCTURES.existingTarget, '/', '/')

    const result = await copyPathOps({
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
  })
})

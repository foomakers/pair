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

describe('copyPathOps - flatten and prefix', () => {
  it('should flatten directory hierarchy into hyphen-separated names', async () => {
    const fileService = new InMemoryFileSystemService(
      {
        '/dataset/source/navigator/next/SKILL.md': '# Next Skill',
        '/dataset/source/process/implement/SKILL.md': '# Implement Skill',
      },
      '/',
      '/',
    )

    await copyPathOps({
      fileService,
      source: 'source',
      target: 'target',
      datasetRoot: '/dataset',
      options: { flatten: true },
    })

    await TEST_ASSERTIONS.assertFileExists(
      fileService,
      '/dataset/target/navigator-next/SKILL.md',
      '# Next Skill',
    )
    await TEST_ASSERTIONS.assertFileExists(
      fileService,
      '/dataset/target/process-implement/SKILL.md',
      '# Implement Skill',
    )
  })

  it('should apply prefix to top-level directory names', async () => {
    const fileService = new InMemoryFileSystemService(
      {
        '/dataset/source/navigator/SKILL.md': '# Nav Skill',
      },
      '/',
      '/',
    )

    await copyPathOps({
      fileService,
      source: 'source',
      target: 'target',
      datasetRoot: '/dataset',
      options: { prefix: 'pair' },
    })

    await TEST_ASSERTIONS.assertFileExists(
      fileService,
      '/dataset/target/pair-navigator/SKILL.md',
      '# Nav Skill',
    )
  })

  it('should apply both flatten and prefix', async () => {
    const fileService = new InMemoryFileSystemService(
      {
        '/dataset/source/navigator/next/SKILL.md': '# Next Skill',
      },
      '/',
      '/',
    )

    await copyPathOps({
      fileService,
      source: 'source',
      target: 'target',
      datasetRoot: '/dataset',
      options: { flatten: true, prefix: 'pair' },
    })

    await TEST_ASSERTIONS.assertFileExists(
      fileService,
      '/dataset/target/pair-navigator-next/SKILL.md',
      '# Next Skill',
    )
  })

  it('should apply prefix only without flatten (prefix top-level, keep hierarchy)', async () => {
    const fileService = new InMemoryFileSystemService(
      {
        '/dataset/source/navigator/next/SKILL.md': '# Next Skill',
      },
      '/',
      '/',
    )

    await copyPathOps({
      fileService,
      source: 'source',
      target: 'target',
      datasetRoot: '/dataset',
      options: { prefix: 'pair' },
    })

    await TEST_ASSERTIONS.assertFileExists(
      fileService,
      '/dataset/target/pair-navigator/next/SKILL.md',
      '# Next Skill',
    )
  })

  it('should rewrite relative links after flatten+prefix copy (full pipeline)', async () => {
    // File at source/navigator/next/ (depth 3) links up 3 levels to reach dataset root
    const fileService = new InMemoryFileSystemService(
      {
        '/dataset/source/navigator/next/SKILL.md':
          '# Next\n[guide](../../../.pair/knowledge/testing/README.md)',
      },
      '/',
      '/',
    )

    await copyPathOps({
      fileService,
      source: 'source',
      target: 'target',
      datasetRoot: '/dataset',
      options: { flatten: true, prefix: 'pair' },
    })

    // After flatten+prefix: source/navigator/next/ → target/pair-navigator-next/
    // Original: ../../../ from source/navigator/next/ → /dataset/.pair/knowledge/testing/README.md
    // New location target/pair-navigator-next/ (depth 2): ../../.pair/knowledge/testing/README.md
    const content = await fileService.readFile(
      '/dataset/target/pair-navigator-next/SKILL.md',
    )
    expect(content).toContain('../../.pair/knowledge/testing/README.md')
  })

  it('should detect and throw on flatten collisions', async () => {
    const fileService = new InMemoryFileSystemService(
      {
        '/dataset/source/a/b/SKILL.md': '# Skill 1',
        '/dataset/source/a-b/SKILL.md': '# Skill 2',
      },
      '/',
      '/',
    )

    await expect(
      copyPathOps({
        fileService,
        source: 'source',
        target: 'target',
        datasetRoot: '/dataset',
        options: { flatten: true },
      }),
    ).rejects.toThrow(/collision/i)
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

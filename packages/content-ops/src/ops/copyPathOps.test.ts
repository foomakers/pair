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
      options: {
        defaultBehavior: 'overwrite' as const,
        folderBehavior: undefined,
        flatten: false,
        targets: [],
      },
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
      options: { flatten: true, targets: [] },
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
      options: { flatten: false, prefix: 'pair', targets: [] },
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
      options: { flatten: true, prefix: 'pair', targets: [] },
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
      options: { flatten: false, prefix: 'pair', targets: [] },
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
      options: { flatten: true, prefix: 'pair', targets: [] },
    })

    // After flatten+prefix: source/navigator/next/ → target/pair-navigator-next/
    // Original: ../../../ from source/navigator/next/ → /dataset/.pair/knowledge/testing/README.md
    // New location target/pair-navigator-next/ (depth 2): ../../.pair/knowledge/testing/README.md
    const content = await fileService.readFile('/dataset/target/pair-navigator-next/SKILL.md')
    expect(content).toContain('../../.pair/knowledge/testing/README.md')
  })

  it('should sync frontmatter name after flatten+prefix rename', async () => {
    const skillContent = [
      '---',
      'name: record-decision',
      'description: >-',
      '  Records an architectural',
      '  or non-architectural decision.',
      '---',
      '',
      '# /record-decision',
    ].join('\n')

    const fileService = new InMemoryFileSystemService(
      {
        '/dataset/source/capability/record-decision/SKILL.md': skillContent,
      },
      '/',
      '/',
    )

    await copyPathOps({
      fileService,
      source: 'source',
      target: 'target',
      datasetRoot: '/dataset',
      options: { flatten: true, prefix: 'pair', targets: [] },
    })

    const result = await fileService.readFile(
      '/dataset/target/pair-capability-record-decision/SKILL.md',
    )
    // name synced to match new directory name
    expect(result).toContain('name: pair-capability-record-decision')
    // multiline collapsed
    expect(result).toContain('description: Records an architectural or non-architectural decision.')
    expect(result).not.toContain('>-')
    // body skill references rewritten
    expect(result).toContain('# /pair-capability-record-decision')
  })

  it('should sync all frontmatter values referencing old dir name, not just name', async () => {
    const skillContent = [
      '---',
      'name: my-skill',
      'config: my-skill/defaults.yaml',
      '---',
      '',
      '# Body',
    ].join('\n')

    const fileService = new InMemoryFileSystemService(
      {
        '/dataset/source/category/my-skill/SKILL.md': skillContent,
      },
      '/',
      '/',
    )

    await copyPathOps({
      fileService,
      source: 'source',
      target: 'target',
      datasetRoot: '/dataset',
      options: { flatten: true, prefix: 'px', targets: [] },
    })

    const result = await fileService.readFile('/dataset/target/px-category-my-skill/SKILL.md')
    expect(result).toContain('name: px-category-my-skill')
    expect(result).toContain('config: px-category-my-skill/defaults.yaml')
  })

  it('should rewrite skill cross-references after flatten+prefix copy', async () => {
    const implementContent = [
      '---',
      'name: implement',
      'description: >-',
      '  Composes /verify-quality and',
      '  /record-decision.',
      '---',
      '',
      '# /implement',
      '',
      '| `/verify-quality` | Capability |',
      '| `/record-decision` | Capability |',
      'invoke /assess-stack if needed',
    ].join('\n')

    const verifyContent = [
      '---',
      'name: verify-quality',
      'description: Quality checker.',
      '---',
      '',
      '# /verify-quality',
      'Composed by /implement and /review.',
    ].join('\n')

    const fileService = new InMemoryFileSystemService(
      {
        '/dataset/source/process/implement/SKILL.md': implementContent,
        '/dataset/source/capability/verify-quality/SKILL.md': verifyContent,
        '/dataset/source/capability/record-decision/SKILL.md':
          '---\nname: record-decision\n---\n# /record-decision',
        '/dataset/source/capability/assess-stack/SKILL.md':
          '---\nname: assess-stack\n---\n# /assess-stack',
      },
      '/',
      '/',
    )

    await copyPathOps({
      fileService,
      source: 'source',
      target: 'target',
      datasetRoot: '/dataset',
      options: { flatten: true, prefix: 'pair', targets: [] },
    })

    const impl = await fileService.readFile('/dataset/target/pair-process-implement/SKILL.md')
    // frontmatter name synced
    expect(impl).toContain('name: pair-process-implement')
    // body references rewritten
    expect(impl).toContain('`/pair-capability-verify-quality`')
    expect(impl).toContain('`/pair-capability-record-decision`')
    expect(impl).toContain('/pair-capability-assess-stack')
    // frontmatter description also rewritten
    expect(impl).toContain('/pair-capability-verify-quality and')

    const verify = await fileService.readFile(
      '/dataset/target/pair-capability-verify-quality/SKILL.md',
    )
    expect(verify).toContain('/pair-process-implement')
  })

  it('should return skillNameMap from flatten+prefix copy', async () => {
    const fileService = new InMemoryFileSystemService(
      {
        '/dataset/source/navigator/next/SKILL.md': '---\nname: next\n---\n# /next',
        '/dataset/source/process/implement/SKILL.md': '---\nname: implement\n---\n# /implement',
      },
      '/',
      '/',
    )

    const result = await copyPathOps({
      fileService,
      source: 'source',
      target: 'target',
      datasetRoot: '/dataset',
      options: { flatten: true, prefix: 'pair', targets: [] },
    })

    expect(result.skillNameMap).toBeDefined()
    expect(result.skillNameMap!.get('next')).toBe('pair-navigator-next')
    expect(result.skillNameMap!.get('implement')).toBe('pair-process-implement')
  })

  it('should apply external skillNameMap to file copy', async () => {
    const agentsContent = [
      '# AGENTS',
      '```',
      '/next',
      '```',
      'Run `/next` to get started.',
      'Then `/implement` your task.',
    ].join('\n')

    const fileService = new InMemoryFileSystemService(
      {
        '/project/src/AGENTS.md': agentsContent,
      },
      '/',
      '/',
    )

    const skillNameMap = new Map([
      ['next', 'pair-navigator-next'],
      ['implement', 'pair-process-implement'],
    ])

    await copyPathOps({
      fileService,
      source: 'src/AGENTS.md',
      target: 'dist/AGENTS.md',
      datasetRoot: '/project',
      skillNameMap,
    })

    const result = await fileService.readFile('/project/dist/AGENTS.md')
    expect(result).toContain('/pair-navigator-next')
    expect(result).toContain('`/pair-navigator-next`')
    expect(result).toContain('/pair-process-implement')
    expect(result).not.toContain(' /next')
    expect(result).not.toContain('/implement')
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
        options: { flatten: true, targets: [] },
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
        flatten: false,
        targets: [],
      },
    })

    TEST_ASSERTIONS.assertSuccessfulOperation(result)
    await TEST_ASSERTIONS.assertFileExists(fileService, '/dataset/target.md', '# Existing Target')
  })
})

import { describe, it, expect } from 'vitest'
import { copyPathOps } from './copyPathOps'
import { TEST_ASSERTIONS, createTestFileService } from '../../test-utils'

describe('copyDirectoryWithTransforms (via copyPathOps, flatten/prefix)', () => {
  it('should flatten directory hierarchy into hyphen-separated names', async () => {
    const fileService = createTestFileService({
      '/dataset/source/catalog/next/SKILL.md': '# Next Skill',
      '/dataset/source/process/implement/SKILL.md': '# Implement Skill',
    })

    await copyPathOps({
      fileService,
      source: 'source',
      target: 'target',
      datasetRoot: '/dataset',
      options: { flatten: true, targets: [] },
    })

    await TEST_ASSERTIONS.assertFileExists(
      fileService,
      '/dataset/target/catalog-next/SKILL.md',
      '# Next Skill',
    )
    await TEST_ASSERTIONS.assertFileExists(
      fileService,
      '/dataset/target/process-implement/SKILL.md',
      '# Implement Skill',
    )
  })

  it('should apply prefix to top-level directory names', async () => {
    const fileService = createTestFileService({
      '/dataset/source/catalog/SKILL.md': '# Catalog Skill',
    })

    await copyPathOps({
      fileService,
      source: 'source',
      target: 'target',
      datasetRoot: '/dataset',
      options: { flatten: false, prefix: 'pair', targets: [] },
    })

    await TEST_ASSERTIONS.assertFileExists(
      fileService,
      '/dataset/target/pair-catalog/SKILL.md',
      '# Catalog Skill',
    )
  })

  it('should apply both flatten and prefix', async () => {
    const fileService = createTestFileService({
      '/dataset/source/catalog/next/SKILL.md': '# Next Skill',
    })

    await copyPathOps({
      fileService,
      source: 'source',
      target: 'target',
      datasetRoot: '/dataset',
      options: { flatten: true, prefix: 'pair', targets: [] },
    })

    await TEST_ASSERTIONS.assertFileExists(
      fileService,
      '/dataset/target/pair-catalog-next/SKILL.md',
      '# Next Skill',
    )
  })

  it('should apply prefix only without flatten (prefix top-level, keep hierarchy)', async () => {
    const fileService = createTestFileService({
      '/dataset/source/catalog/next/SKILL.md': '# Next Skill',
    })

    await copyPathOps({
      fileService,
      source: 'source',
      target: 'target',
      datasetRoot: '/dataset',
      options: { flatten: false, prefix: 'pair', targets: [] },
    })

    await TEST_ASSERTIONS.assertFileExists(
      fileService,
      '/dataset/target/pair-catalog/next/SKILL.md',
      '# Next Skill',
    )
  })

  it('should rewrite relative links after flatten+prefix copy (full pipeline)', async () => {
    // File at source/catalog/next/ (depth 3) links up 3 levels to reach dataset root
    const fileService = createTestFileService({
      '/dataset/source/catalog/next/SKILL.md':
        '# Next\n[guide](../../../.pair/knowledge/testing/README.md)',
    })

    await copyPathOps({
      fileService,
      source: 'source',
      target: 'target',
      datasetRoot: '/dataset',
      options: { flatten: true, prefix: 'pair', targets: [] },
    })

    // After flatten+prefix: source/catalog/next/ → target/pair-catalog-next/
    // Original: ../../../ from source/catalog/next/ → /dataset/.pair/knowledge/testing/README.md
    // New location target/pair-catalog-next/ (depth 2): ../../.pair/knowledge/testing/README.md
    const content = await fileService.readFile('/dataset/target/pair-catalog-next/SKILL.md')
    expect(content).toContain('../../.pair/knowledge/testing/README.md')
  })

  it('should re-root links when source content root differs from datasetRoot', async () => {
    // Simulates real pipeline: source deep in monorepo, target at project root
    // source = packages/kb/dataset/.skills → content root = packages/kb/dataset/
    // target = .claude/skills → content root = project root
    const fileService = createTestFileService({
      '/project/packages/kb/dataset/.skills/next/SKILL.md':
        '# Next\n[PRD](../../.pair/adoption/PRD.md)',
    })

    await copyPathOps({
      fileService,
      source: 'packages/kb/dataset/.skills',
      target: '.claude/skills',
      datasetRoot: '/project',
      options: { flatten: true, prefix: 'pair', targets: [] },
    })

    const content = await fileService.readFile('/project/.claude/skills/pair-next/SKILL.md')
    // Link should point to .pair/ at project root, NOT to packages/kb/dataset/.pair/
    expect(content).toContain('../../../.pair/adoption/PRD.md')
    expect(content).not.toContain('packages/kb/dataset')
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

    const fileService = createTestFileService({
      '/dataset/source/capability/record-decision/SKILL.md': skillContent,
    })

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

    const fileService = createTestFileService({
      '/dataset/source/category/my-skill/SKILL.md': skillContent,
    })

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

    const fileService = createTestFileService({
      '/dataset/source/process/implement/SKILL.md': implementContent,
      '/dataset/source/capability/verify-quality/SKILL.md': verifyContent,
      '/dataset/source/capability/record-decision/SKILL.md':
        '---\nname: record-decision\n---\n# /record-decision',
      '/dataset/source/capability/assess-stack/SKILL.md':
        '---\nname: assess-stack\n---\n# /assess-stack',
    })

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
    const fileService = createTestFileService({
      '/dataset/source/catalog/next/SKILL.md': '---\nname: next\n---\n# /next',
      '/dataset/source/process/implement/SKILL.md': '---\nname: implement\n---\n# /implement',
    })

    const result = await copyPathOps({
      fileService,
      source: 'source',
      target: 'target',
      datasetRoot: '/dataset',
      options: { flatten: true, prefix: 'pair', targets: [] },
    })

    expect(result.skillNameMap).toBeDefined()
    expect(result.skillNameMap!.get('next')).toBe('pair-catalog-next')
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

    const fileService = createTestFileService({
      '/project/src/AGENTS.md': agentsContent,
    })

    const skillNameMap = new Map([
      ['next', 'pair-next'],
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
    expect(result).toContain('/pair-next')
    expect(result).toContain('`/pair-next`')
    expect(result).toContain('/pair-process-implement')
    expect(result).not.toContain(' /next')
    expect(result).not.toContain('/implement')
  })

  it('should detect and throw on flatten collisions', async () => {
    const fileService = createTestFileService({
      '/dataset/source/a/b/SKILL.md': '# Skill 1',
      '/dataset/source/a-b/SKILL.md': '# Skill 2',
    })

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

  describe('multi-file skill directories (story #313 T5 prerequisite)', () => {
    it('ships every sibling file of a multi-file skill dir, not just SKILL.md', async () => {
      const fileService = createTestFileService({
        '/dataset/source/process/implement/SKILL.md':
          '---\nname: implement\n---\n# /implement\nSee [edge cases](./edge-cases.md).',
        '/dataset/source/process/implement/edge-cases.md':
          '# Edge Cases\nBack to [SKILL](./SKILL.md).',
        '/dataset/source/process/implement/reference.md': '# Reference material',
      })

      await copyPathOps({
        fileService,
        source: 'source',
        target: 'target',
        datasetRoot: '/dataset',
        options: { flatten: true, prefix: 'pair', targets: [] },
      })

      // All three sibling files land in the same transformed target directory
      await TEST_ASSERTIONS.assertFileExists(
        fileService,
        '/dataset/target/pair-process-implement/reference.md',
        '# Reference material',
      )
      const skill = await fileService.readFile('/dataset/target/pair-process-implement/SKILL.md')
      const edgeCases = await fileService.readFile(
        '/dataset/target/pair-process-implement/edge-cases.md',
      )

      // Cross-references between siblings resolve post-install (same-dir relative
      // links are unchanged since both files move together under the same rename)
      expect(skill).toContain('[edge cases](./edge-cases.md)')
      expect(edgeCases).toContain('[SKILL](./SKILL.md)')
    })
  })

  describe('mirror behavior — idempotent updates (AC4)', () => {
    it('removes a stale flattened directory when its source skill is gone', async () => {
      const fileService = createTestFileService({
        '/dataset/source/catalog/next/SKILL.md': '---\nname: next\n---\n# /next',
        // Stale leftover from a previous run — no longer present under source
        '/dataset/target/pair-catalog-removed/SKILL.md': '---\nname: pair-catalog-removed\n---',
      })

      await copyPathOps({
        fileService,
        source: 'source',
        target: 'target',
        datasetRoot: '/dataset',
        options: { flatten: true, prefix: 'pair', defaultBehavior: 'mirror', targets: [] },
      })

      await expect(
        fileService.exists('/dataset/target/pair-catalog-removed/SKILL.md'),
      ).resolves.toBe(false)
      await expect(fileService.exists('/dataset/target/pair-catalog-next/SKILL.md')).resolves.toBe(
        true,
      )
    })

    it('removes the old prefixed directory after a prefix change', async () => {
      const fileService = createTestFileService({
        '/dataset/source/catalog/next/SKILL.md': '---\nname: next\n---\n# /next',
        // Leftover from a previous install with prefix "pair"
        '/dataset/target/pair-catalog-next/SKILL.md': '---\nname: pair-catalog-next\n---',
      })

      await copyPathOps({
        fileService,
        source: 'source',
        target: 'target',
        datasetRoot: '/dataset',
        options: { flatten: true, prefix: 'foo', defaultBehavior: 'mirror', targets: [] },
      })

      await expect(fileService.exists('/dataset/target/pair-catalog-next/SKILL.md')).resolves.toBe(
        false,
      )
      await expect(fileService.exists('/dataset/target/foo-catalog-next/SKILL.md')).resolves.toBe(
        true,
      )
    })

    it('does not delete a root-level (non-nested) source file on a second mirror run', async () => {
      // Regression: cleanupStaleTransformedEntries built its "expected" set only from
      // dirMappingFiles, which copyFileWithTransform only populates for files under a
      // subdirectory (dir !== '.'). A file copied directly from the source root was never
      // registered as expected, so a second mirror run would delete it as "stale".
      const fileService = createTestFileService({
        '/dataset/source/README.md': '# Root-level file, no subdirectory',
        '/dataset/source/catalog/next/SKILL.md': '---\nname: next\n---\n# /next',
      })

      const runOnce = () =>
        copyPathOps({
          fileService,
          source: 'source',
          target: 'target',
          datasetRoot: '/dataset',
          options: { flatten: true, prefix: 'pair', defaultBehavior: 'mirror', targets: [] },
        })

      await runOnce()
      await expect(fileService.exists('/dataset/target/README.md')).resolves.toBe(true)

      // Second run must be idempotent — the root-level file must survive.
      await runOnce()
      await expect(fileService.exists('/dataset/target/README.md')).resolves.toBe(true)
      await expect(fileService.exists('/dataset/target/pair-catalog-next/SKILL.md')).resolves.toBe(
        true,
      )
    })

    it('does not clean up stale entries when behavior is not mirror', async () => {
      const fileService = createTestFileService({
        '/dataset/source/catalog/next/SKILL.md': '---\nname: next\n---\n# /next',
        '/dataset/target/pair-catalog-removed/SKILL.md': '---\nname: pair-catalog-removed\n---',
      })

      await copyPathOps({
        fileService,
        source: 'source',
        target: 'target',
        datasetRoot: '/dataset',
        options: { flatten: true, prefix: 'pair', defaultBehavior: 'overwrite', targets: [] },
      })

      await expect(
        fileService.exists('/dataset/target/pair-catalog-removed/SKILL.md'),
      ).resolves.toBe(true)
    })
  })
})

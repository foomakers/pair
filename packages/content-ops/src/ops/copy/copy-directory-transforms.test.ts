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
    // #407 (placement half — landed). The standard Agent-Skills
    // progressive-disclosure layout. Before `flattenDepth`, this installed as the
    // SIBLING dir `pair-process-review-references/`: not a sub-doc of the skill at
    // all, so the skill's own `./references/deep.md` pointed at nothing.
    it('installs a nested references/ dir INSIDE the skill, not as a sibling (#407)', async () => {
      const fileService = createTestFileService({
        '/dataset/source/process/review/SKILL.md':
          '---\nname: review\n---\n# /review\nDetail in [deep dive](./references/deep.md).',
        '/dataset/source/process/review/references/deep.md':
          '# Deep dive\nBack to [SKILL](../SKILL.md).',
      })

      await copyPathOps({
        fileService,
        source: 'source',
        target: 'target',
        datasetRoot: '/dataset',
        options: { flatten: true, prefix: 'pair', flattenDepth: 2, targets: [] },
      })

      expect(
        await fileService.exists('/dataset/target/pair-process-review/references/deep.md'),
      ).toBe(true)
      // ...and NOT as a sibling pseudo-skill, which was the defect.
      expect(
        await fileService.exists('/dataset/target/pair-process-review-references/deep.md'),
      ).toBe(false)

      // The skill's FORWARD link is correct with no rewrite: both files moved
      // together, so the same-dir-relative href still resolves.
      const skill = await fileService.readFile('/dataset/target/pair-process-review/SKILL.md')
      expect(skill).toContain('[deep dive](./references/deep.md)')
    })

    // The link half of #407. A sub-doc's link UP to its skill points at the
    // PARENT directory, which the file's own dir-mapping cannot rebase — it only
    // covers targets inside itself. Before the fix this fell through to the
    // source-root fallback and became `../../../source/process/review/SKILL.md`:
    // a path back into the dataset layout, dead in the install.
    it('keeps a nested sub-doc back-link pointing at its own skill (#407)', async () => {
      const fileService = createTestFileService({
        '/dataset/source/process/review/SKILL.md':
          '---\nname: review\n---\n# /review\nDetail in [deep dive](./references/deep.md).',
        '/dataset/source/process/review/references/deep.md':
          '# Deep dive\nBack to [SKILL](../SKILL.md).',
      })

      await copyPathOps({
        fileService,
        source: 'source',
        target: 'target',
        datasetRoot: '/dataset',
        options: { flatten: true, prefix: 'pair', flattenDepth: 2, targets: [] },
      })

      const deep = await fileService.readFile(
        '/dataset/target/pair-process-review/references/deep.md',
      )
      // Both files moved together, so the relative path is still correct and the
      // rewriter must leave it alone rather than re-root it.
      expect(deep).toContain('[SKILL](../SKILL.md)')
      expect(deep).not.toContain('source/process/review')
    })

    // The sibling case, which the same mechanism has to get right: when the
    // nested dir does NOT move with its parent (unbounded flatten), the link up
    // must be REWRITTEN to wherever the parent landed — not left alone.
    // Both directions, because they are the same mechanism: the FORWARD link
    // must be rewritten too. Its own directory moved AND the sub-directory it
    // points into moved elsewhere, so the most specific move has to win — with
    // the own-directory rebase asked first, the forward link was left as
    // `./references/deep.md`, pointing at nothing (#407 review).
    it('rewrites the back-link when the nested dir becomes a sibling (unbounded)', async () => {
      const fileService = createTestFileService({
        '/dataset/source/process/review/SKILL.md':
          '---\nname: review\n---\n# /review\nDetail in [deep dive](./references/deep.md).',
        '/dataset/source/process/review/references/deep.md':
          '# Deep dive\nBack to [SKILL](../SKILL.md).',
      })

      await copyPathOps({
        fileService,
        source: 'source',
        target: 'target',
        datasetRoot: '/dataset',
        options: { flatten: true, prefix: 'pair', targets: [] },
      })

      const deep = await fileService.readFile(
        '/dataset/target/pair-process-review-references/deep.md',
      )
      expect(deep).toContain('[SKILL](../pair-process-review/SKILL.md)')
      expect(deep).not.toContain('source/process/review')

      const skill = await fileService.readFile('/dataset/target/pair-process-review/SKILL.md')
      expect(skill).toContain('[deep dive](../pair-process-review-references/deep.md)')
      expect(skill).not.toContain('](./references/deep.md)')
    })

    // #407 review (Major). `flattenDepth` states "an entry is N segments deep",
    // and `.skills/next` is a ONE-segment entry while `process/review` is two.
    // `next/references` therefore has the same shape as a real entry and would
    // install as the sibling `pair-next-references/` — every defect this option
    // removes, back for `next`. Unrepresentable, so it must fail loudly.
    it('refuses a source entry shallower than flattenDepth that owns a sub-dir (#407)', async () => {
      const fileService = createTestFileService({
        '/dataset/source/next/SKILL.md': '---\nname: next\n---\n# /next',
        '/dataset/source/next/references/deep.md': '# Deep dive\nBack to [SKILL](../SKILL.md).',
        '/dataset/source/process/review/SKILL.md':
          '---\nname: review\n---\n# /review\nProgressive disclosure lives under /references.',
      })

      await expect(
        copyPathOps({
          fileService,
          source: 'source',
          target: 'target',
          datasetRoot: '/dataset',
          options: { flatten: true, prefix: 'pair', flattenDepth: 2, targets: [] },
        }),
      ).rejects.toThrow(/Ambiguous layout for a bounded flatten/)

      // Fails BEFORE copying anything, so no half-installed sibling is left behind
      // and no unrelated skill body was rewritten.
      expect(await fileService.exists('/dataset/target/pair-next-references/deep.md')).toBe(false)
      expect(await fileService.exists('/dataset/target/pair-process-review/SKILL.md')).toBe(false)
    })

    it('accepts a shallower entry that owns no sub-dir, alongside deeper entries (#407)', async () => {
      const fileService = createTestFileService({
        '/dataset/source/next/SKILL.md': '---\nname: next\n---\n# /next',
        '/dataset/source/process/review/SKILL.md': '---\nname: review\n---\n# /review',
      })

      await copyPathOps({
        fileService,
        source: 'source',
        target: 'target',
        datasetRoot: '/dataset',
        options: { flatten: true, prefix: 'pair', flattenDepth: 2, targets: [] },
      })

      // The real `.skills/` shape today: a one-segment entry and two-segment
      // entries side by side, both installing at the top level.
      expect(await fileService.exists('/dataset/target/pair-next/SKILL.md')).toBe(true)
      expect(await fileService.exists('/dataset/target/pair-process-review/SKILL.md')).toBe(true)
    })

    // #407 review finding: with a bounded flatten, `process/review/references`
    // is a real sub-path and so appears in the dir mapping next to the skill
    // dirs. Treating it as a SKILL registered `references` as a skill name
    // pointing at ONE arbitrary skill's sub-dir, and the `/references` token in
    // an unrelated skill's body was rewritten to it — a cross-skill corruption
    // decided by directory iteration order.
    it('never rewrites a /references token across skills when both own a references/ dir (#407)', async () => {
      const fileService = createTestFileService({
        '/dataset/source/process/review/SKILL.md':
          '---\nname: review\n---\n# /review\nProgressive disclosure lives under /references.',
        '/dataset/source/process/review/references/deep.md': '# Review deep dive',
        '/dataset/source/capability/grill/SKILL.md': '---\nname: grill\n---\n# /grill',
        '/dataset/source/capability/grill/references/deep.md': '# Grill deep dive',
      })

      await copyPathOps({
        fileService,
        source: 'source',
        target: 'target',
        datasetRoot: '/dataset',
        options: { flatten: true, prefix: 'pair', flattenDepth: 2, targets: [] },
      })

      const skill = await fileService.readFile('/dataset/target/pair-process-review/SKILL.md')
      expect(skill).toContain('under /references.')
      expect(skill).not.toContain('pair-capability-grill/references')
      // Both skills' own renames still happen — the fix scopes the map, it does
      // not disable it.
      expect(skill).toContain('# /pair-process-review')
      const grill = await fileService.readFile('/dataset/target/pair-capability-grill/SKILL.md')
      expect(grill).toContain('# /pair-capability-grill')
    })

    // Same root cause on the frontmatter side: the sub-doc's dir is not a
    // renamed skill dir, so its `name:` must be left alone instead of being set
    // to a PATH (`pair-process-review/references`).
    it('does not rewrite a nested sub-doc frontmatter name to a path (#407)', async () => {
      const fileService = createTestFileService({
        '/dataset/source/process/review/SKILL.md': '---\nname: review\n---\n# /review',
        '/dataset/source/process/review/references/deep.md':
          '---\nname: references\n---\n# Deep dive',
      })

      await copyPathOps({
        fileService,
        source: 'source',
        target: 'target',
        datasetRoot: '/dataset',
        options: { flatten: true, prefix: 'pair', flattenDepth: 2, targets: [] },
      })

      const deep = await fileService.readFile(
        '/dataset/target/pair-process-review/references/deep.md',
      )
      expect(deep).toContain('name: references')
      expect(deep).not.toContain('pair-process-review/references')
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

    it('preserves a foreign (non-source) entry in a shared target under overwrite behavior', async () => {
      // The skills registry uses `overwrite` (not `mirror`) precisely so a
      // shared target dir keeps third-party / user-installed skills: overwrite
      // updates/adds source entries but never runs stale cleanup. A foreign
      // skill (e.g. agent-browser) therefore survives.
      const fileService = createTestFileService({
        '/dataset/source/catalog/next/SKILL.md': '---\nname: next\n---\n# /next',
        '/dataset/target/agent-browser/SKILL.md': '---\nname: agent-browser\n---',
      })

      await copyPathOps({
        fileService,
        source: 'source',
        target: 'target',
        datasetRoot: '/dataset',
        options: { flatten: true, prefix: 'pair', defaultBehavior: 'overwrite', targets: [] },
      })

      await expect(fileService.exists('/dataset/target/agent-browser/SKILL.md')).resolves.toBe(true)
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

    // #407 review: under a bounded flatten a source sub-directory maps to a
    // target SUB-PATH, so top-level-only cleanup could no longer see it — a
    // `references/` deleted from the source stayed installed forever (and its
    // docs kept being loaded). Cleanup descends into a transformed entry.
    it('removes a nested sub-dir that is gone from the source (bounded + mirror, #407)', async () => {
      const fileService = createTestFileService({
        '/dataset/source/process/review/SKILL.md': '---\nname: review\n---\n# /review',
        '/dataset/source/process/review/references/deep.md': '# Deep dive',
      })

      const runOnce = () =>
        copyPathOps({
          fileService,
          source: 'source',
          target: 'target',
          datasetRoot: '/dataset',
          options: {
            flatten: true,
            prefix: 'pair',
            flattenDepth: 2,
            defaultBehavior: 'mirror',
            targets: [],
          },
        })

      await runOnce()
      await expect(
        fileService.exists('/dataset/target/pair-process-review/references/deep.md'),
      ).resolves.toBe(true)

      // Idempotent while the source is unchanged...
      await runOnce()
      await expect(
        fileService.exists('/dataset/target/pair-process-review/references/deep.md'),
      ).resolves.toBe(true)

      // ...and the nested target goes away with its source.
      await fileService.rm('/dataset/source/process/review/references', {
        recursive: true,
        force: true,
      })
      await runOnce()
      await expect(
        fileService.exists('/dataset/target/pair-process-review/references/deep.md'),
      ).resolves.toBe(false)
      // The entry itself and its own files are untouched.
      await expect(
        fileService.exists('/dataset/target/pair-process-review/SKILL.md'),
      ).resolves.toBe(true)
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

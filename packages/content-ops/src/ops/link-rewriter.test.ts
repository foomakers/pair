import { describe, it, expect } from 'vitest'
import { rewriteLinksInFile, rewriteLinksAfterTransform } from './link-rewriter'
import { InMemoryFileSystemService } from '../test-utils/in-memory-fs'

describe('rewriteLinksInFile', () => {
  it('rewrites relative links when file moves to shallower depth', async () => {
    const fs = new InMemoryFileSystemService(
      {
        '/dataset/target/pair-navigator-next/SKILL.md':
          '# Skill\n[guide](../../../.pair/knowledge/guidelines/testing/README.md)',
      },
      '/',
      '/',
    )

    await rewriteLinksInFile({
      fileService: fs,
      filePath: '/dataset/target/pair-navigator-next/SKILL.md',
      originalDir: '.skills/navigator/next',
      newDir: 'target/pair-navigator-next',
      datasetRoot: '/dataset',
    })

    const content = await fs.readFile('/dataset/target/pair-navigator-next/SKILL.md')
    expect(content).toContain('../../.pair/knowledge/guidelines/testing/README.md')
  })

  it('rewrites relative links when file moves to deeper depth', async () => {
    const fs = new InMemoryFileSystemService(
      {
        '/dataset/deep/nested/target/skill/SKILL.md':
          '# Skill\n[guide](../../.pair/knowledge/README.md)',
      },
      '/',
      '/',
    )

    await rewriteLinksInFile({
      fileService: fs,
      filePath: '/dataset/deep/nested/target/skill/SKILL.md',
      originalDir: '.skills/navigator',
      newDir: 'deep/nested/target/skill',
      datasetRoot: '/dataset',
    })

    const content = await fs.readFile('/dataset/deep/nested/target/skill/SKILL.md')
    expect(content).toContain('../../../../.pair/knowledge/README.md')
  })

  it('skips external links (http, mailto, anchors)', async () => {
    const fs = new InMemoryFileSystemService(
      {
        '/dataset/target/skill/SKILL.md':
          '# Skill\n[site](https://example.com)\n[mail](mailto:a@b.com)\n[anchor](#section)',
      },
      '/',
      '/',
    )

    await rewriteLinksInFile({
      fileService: fs,
      filePath: '/dataset/target/skill/SKILL.md',
      originalDir: '.skills/navigator',
      newDir: 'target/skill',
      datasetRoot: '/dataset',
    })

    const content = await fs.readFile('/dataset/target/skill/SKILL.md')
    expect(content).toContain('https://example.com')
    expect(content).toContain('mailto:a@b.com')
    expect(content).toContain('#section')
  })

  it('warns on unresolvable links but does not fail', async () => {
    const fs = new InMemoryFileSystemService(
      {
        '/dataset/target/skill/SKILL.md':
          '# Skill\n[broken](../../nonexistent/file.md)',
      },
      '/',
      '/',
    )

    // Should not throw
    await rewriteLinksInFile({
      fileService: fs,
      filePath: '/dataset/target/skill/SKILL.md',
      originalDir: '.skills/navigator',
      newDir: 'target/skill',
      datasetRoot: '/dataset',
    })
  })

  it('handles file with no links', async () => {
    const fs = new InMemoryFileSystemService(
      {
        '/dataset/target/skill/SKILL.md': '# Skill\nNo links here.',
      },
      '/',
      '/',
    )

    await rewriteLinksInFile({
      fileService: fs,
      filePath: '/dataset/target/skill/SKILL.md',
      originalDir: '.skills/navigator',
      newDir: 'target/skill',
      datasetRoot: '/dataset',
    })

    const content = await fs.readFile('/dataset/target/skill/SKILL.md')
    expect(content).toBe('# Skill\nNo links here.')
  })
})

describe('rewriteLinksAfterTransform', () => {
  it('rewrites links in all files from a path mapping', async () => {
    const fs = new InMemoryFileSystemService(
      {
        '/dataset/target/pair-nav-next/SKILL.md':
          '# Skill\n[guide](../../../.pair/knowledge/README.md)',
        '/dataset/target/pair-process-impl/SKILL.md':
          '# Impl\n[test](../../../.pair/knowledge/testing/README.md)',
      },
      '/',
      '/',
    )

    const pathMapping = [
      {
        originalDir: '.skills/navigator/next',
        newDir: 'target/pair-nav-next',
        files: ['/dataset/target/pair-nav-next/SKILL.md'],
      },
      {
        originalDir: '.skills/process/implement',
        newDir: 'target/pair-process-impl',
        files: ['/dataset/target/pair-process-impl/SKILL.md'],
      },
    ]

    await rewriteLinksAfterTransform({
      fileService: fs,
      pathMapping,
      datasetRoot: '/dataset',
    })

    const nav = await fs.readFile('/dataset/target/pair-nav-next/SKILL.md')
    expect(nav).toContain('../../.pair/knowledge/README.md')

    const impl = await fs.readFile('/dataset/target/pair-process-impl/SKILL.md')
    expect(impl).toContain('../../.pair/knowledge/testing/README.md')
  })
})

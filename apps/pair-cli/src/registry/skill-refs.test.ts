import { describe, it, expect } from 'vitest'
import { InMemoryFileSystemService } from '@pair/content-ops'
import type { SkillNameMap } from '@pair/content-ops'
import { rewriteSkillRefsInTarget, applySkillRefsToNonSkillRegistries } from './skill-refs'
import type { RegistryConfig } from './resolver'

describe('rewriteSkillRefsInTarget', () => {
  const noopLog = () => {}

  function makeSkillNameMap(entries: [string, string][]): SkillNameMap {
    return new Map(entries)
  }

  it('rewrites skill references in a single markdown file', async () => {
    const fs = new InMemoryFileSystemService(
      { '/project/AGENTS.md': '# AGENTS\n\nRun /next to start.\nUse /verify-quality for checks.' },
      '/project',
      '/project',
    )

    const map = makeSkillNameMap([
      ['next', 'pair-process-next'],
      ['verify-quality', 'pair-capability-verify-quality'],
    ])

    await rewriteSkillRefsInTarget(fs, '/project/AGENTS.md', map, noopLog)

    const result = await fs.readFile('/project/AGENTS.md')
    expect(result).toContain('/pair-process-next')
    expect(result).toContain('/pair-capability-verify-quality')
    expect(result).not.toMatch(/(?<![a-z-])\/next(?![a-z-])/)
  })

  it('rewrites all markdown files in a directory', async () => {
    const fs = new InMemoryFileSystemService(
      {
        '/project/docs/guide.md': 'Use /implement to code.',
        '/project/docs/review.md': 'Use /review for QA.',
      },
      '/project',
      '/project',
    )

    const map = makeSkillNameMap([
      ['implement', 'pair-process-implement'],
      ['review', 'pair-process-review'],
    ])

    await rewriteSkillRefsInTarget(fs, '/project/docs', map, noopLog)

    expect(await fs.readFile('/project/docs/guide.md')).toContain('/pair-process-implement')
    expect(await fs.readFile('/project/docs/review.md')).toContain('/pair-process-review')
  })

  it('no-op when target does not exist', async () => {
    const fs = new InMemoryFileSystemService({}, '/project', '/project')
    const map = makeSkillNameMap([['next', 'pair-process-next']])

    // Should not throw
    await rewriteSkillRefsInTarget(fs, '/project/nonexistent.md', map, noopLog)
  })

  it('skips non-markdown files', async () => {
    const fs = new InMemoryFileSystemService(
      { '/project/config.json': '{"skill": "/next"}' },
      '/project',
      '/project',
    )

    const map = makeSkillNameMap([['next', 'pair-process-next']])
    await rewriteSkillRefsInTarget(fs, '/project/config.json', map, noopLog)

    // Non-md files should not be rewritten
    const result = await fs.readFile('/project/config.json')
    expect(result).toContain('/next')
  })

  it('no-op when no references match', async () => {
    const fs = new InMemoryFileSystemService(
      { '/project/README.md': '# No skill refs here' },
      '/project',
      '/project',
    )

    const map = makeSkillNameMap([['next', 'pair-process-next']])
    await rewriteSkillRefsInTarget(fs, '/project/README.md', map, noopLog)

    const result = await fs.readFile('/project/README.md')
    expect(result).toBe('# No skill refs here')
  })
})

describe('applySkillRefsToNonSkillRegistries', () => {
  const noopLog = () => {}

  function makeSkillNameMap(entries: [string, string][]): SkillNameMap {
    return new Map(entries)
  }

  it('rewrites refs in non-skills registries, skips flatten/prefix ones', async () => {
    const fs = new InMemoryFileSystemService(
      {
        '/project/AGENTS.md': '# AGENTS\n\nUse /next.',
        '/project/.claude/skills/pair-process-next/SKILL.md': '# /pair-process-next',
      },
      '/project',
      '/project',
    )

    const registries: Record<string, RegistryConfig> = {
      skills: {
        source: '.skills',
        behavior: 'mirror',
        description: 'Skills',
        include: [],
        flatten: true,
        prefix: 'pair',
        targets: [{ path: '.claude/skills/', mode: 'canonical' }],
      },
      agents: {
        source: 'AGENTS.md',
        behavior: 'mirror',
        description: 'Agents',
        include: [],
        flatten: false,
        targets: [{ path: 'AGENTS.md', mode: 'canonical' }],
      },
    }

    const map = makeSkillNameMap([['next', 'pair-process-next']])

    await applySkillRefsToNonSkillRegistries(
      { fs, baseTarget: '/project', pushLog: noopLog },
      registries,
      map,
    )

    // AGENTS.md (non-skills) should be rewritten
    const agents = await fs.readFile('/project/AGENTS.md')
    expect(agents).toContain('/pair-process-next')

    // Skills registry files should NOT be touched by this function
    const skill = await fs.readFile('/project/.claude/skills/pair-process-next/SKILL.md')
    expect(skill).toBe('# /pair-process-next')
  })

  it('skips symlink targets', async () => {
    const fs = new InMemoryFileSystemService(
      { '/project/AGENTS.md': '# AGENTS\n\nUse /next.' },
      '/project',
      '/project',
    )

    const registries: Record<string, RegistryConfig> = {
      agents: {
        source: 'AGENTS.md',
        behavior: 'mirror',
        description: 'Agents',
        include: [],
        flatten: false,
        targets: [
          { path: 'AGENTS.md', mode: 'canonical' },
          { path: '.github/AGENTS.md', mode: 'symlink' },
        ],
      },
    }

    const map = makeSkillNameMap([['next', 'pair-process-next']])

    await applySkillRefsToNonSkillRegistries(
      { fs, baseTarget: '/project', pushLog: noopLog },
      registries,
      map,
    )

    // Canonical should be rewritten
    const agents = await fs.readFile('/project/AGENTS.md')
    expect(agents).toContain('/pair-process-next')
  })

  it('handles empty skill name map gracefully', async () => {
    const fs = new InMemoryFileSystemService(
      { '/project/AGENTS.md': '# AGENTS\n\nNo skills.' },
      '/project',
      '/project',
    )

    const registries: Record<string, RegistryConfig> = {
      agents: {
        source: 'AGENTS.md',
        behavior: 'mirror',
        description: 'Agents',
        include: [],
        flatten: false,
        targets: [{ path: 'AGENTS.md', mode: 'canonical' }],
      },
    }

    const emptyMap = makeSkillNameMap([])

    await applySkillRefsToNonSkillRegistries(
      { fs, baseTarget: '/project', pushLog: noopLog },
      registries,
      emptyMap,
    )

    const result = await fs.readFile('/project/AGENTS.md')
    expect(result).toBe('# AGENTS\n\nNo skills.')
  })
})

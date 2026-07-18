import { describe, it, expect } from 'vitest'
import { InMemoryFileSystemService } from '@pair/content-ops'
import type { SkillNameMap } from '@pair/content-ops'
import {
  rewriteSkillRefsInTarget,
  applySkillRefsToNonSkillRegistries,
  detectOrphanedSkillReferences,
  resolveSkillNameManifestPath,
  reconcileSkillNameRegistry,
} from './skill-refs'
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

    await rewriteSkillRefsInTarget(
      fs,
      '/project/AGENTS.md',
      { skillNameMap: map, skillLinkPathMap: new Map() },
      noopLog,
    )

    const result = await fs.readFile('/project/AGENTS.md')
    expect(result).toContain('/pair-process-next')
    expect(result).toContain('/pair-capability-verify-quality')
    expect(result).not.toMatch(/(?<![a-z-])\/next(?![a-z-])/)
  })

  it('rewrites SKILL.md cross-reference link paths from the link map', async () => {
    const fs = new InMemoryFileSystemService(
      {
        '/project/doc.md':
          'See [map-subdomains](../../.skills/capability/map-subdomains/SKILL.md).',
      },
      '/project',
      '/project',
    )
    const linkMap = new Map([
      [
        '../.skills/capability/map-subdomains/SKILL.md',
        '../.claude/skills/pair-capability-map-subdomains/SKILL.md',
      ],
    ])

    await rewriteSkillRefsInTarget(
      fs,
      '/project/doc.md',
      { skillNameMap: new Map(), skillLinkPathMap: linkMap },
      noopLog,
    )

    const result = await fs.readFile('/project/doc.md')
    expect(result).toBe(
      'See [map-subdomains](../../.claude/skills/pair-capability-map-subdomains/SKILL.md).',
    )
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

    await rewriteSkillRefsInTarget(
      fs,
      '/project/docs',
      { skillNameMap: map, skillLinkPathMap: new Map() },
      noopLog,
    )

    expect(await fs.readFile('/project/docs/guide.md')).toContain('/pair-process-implement')
    expect(await fs.readFile('/project/docs/review.md')).toContain('/pair-process-review')
  })

  it('no-op when target does not exist', async () => {
    const fs = new InMemoryFileSystemService({}, '/project', '/project')
    const map = makeSkillNameMap([['next', 'pair-process-next']])

    // Should not throw
    await rewriteSkillRefsInTarget(
      fs,
      '/project/nonexistent.md',
      { skillNameMap: map, skillLinkPathMap: new Map() },
      noopLog,
    )
  })

  it('skips non-markdown files', async () => {
    const fs = new InMemoryFileSystemService(
      { '/project/config.json': '{"skill": "/next"}' },
      '/project',
      '/project',
    )

    const map = makeSkillNameMap([['next', 'pair-process-next']])
    await rewriteSkillRefsInTarget(
      fs,
      '/project/config.json',
      { skillNameMap: map, skillLinkPathMap: new Map() },
      noopLog,
    )

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
    await rewriteSkillRefsInTarget(
      fs,
      '/project/README.md',
      { skillNameMap: map, skillLinkPathMap: new Map() },
      noopLog,
    )

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
      new Map(),
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
      new Map(),
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
      new Map(),
    )

    const result = await fs.readFile('/project/AGENTS.md')
    expect(result).toBe('# AGENTS\n\nNo skills.')
  })
})

describe('resolveSkillNameManifestPath', () => {
  it('resolves under .pair/ relative to baseTarget', () => {
    const fs = new InMemoryFileSystemService({}, '/project', '/project')
    expect(resolveSkillNameManifestPath(fs, '/project')).toBe('/project/.pair/.skill-name-map.json')
  })

  it('is outside the knowledge and adoption registry targets', () => {
    const fs = new InMemoryFileSystemService({}, '/project', '/project')
    const manifestPath = resolveSkillNameManifestPath(fs, '/project')
    expect(manifestPath.startsWith('/project/.pair/knowledge')).toBe(false)
    expect(manifestPath.startsWith('/project/.pair/adoption')).toBe(false)
  })
})

describe('detectOrphanedSkillReferences', () => {
  const noopLog = () => {}

  it('does nothing when there are no orphaned names', async () => {
    const fs = new InMemoryFileSystemService(
      { '/project/AGENTS.md': '# AGENTS' },
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

    await detectOrphanedSkillReferences(
      { fs, baseTarget: '/project', pushLog: noopLog },
      registries,
      [],
    )

    // no-op — nothing to assert beyond "did not throw"
  })

  it('warns when an orphaned installed name is still referenced', async () => {
    const fs = new InMemoryFileSystemService(
      { '/project/AGENTS.md': '# AGENTS\n\nRun /pair-removed for legacy setup.' },
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

    const warnings: string[] = []
    const pushLog = (level: string, message: string) => {
      if (level === 'warn') warnings.push(message)
    }

    await detectOrphanedSkillReferences({ fs, baseTarget: '/project', pushLog }, registries, [
      'pair-removed',
    ])

    expect(warnings).toHaveLength(1)
    expect(warnings[0]).toContain('/pair-removed')
    expect(warnings[0]).toContain('AGENTS.md')

    // content is left untouched
    const content = await fs.readFile('/project/AGENTS.md')
    expect(content).toBe('# AGENTS\n\nRun /pair-removed for legacy setup.')
  })

  it('does not warn when the orphaned name only appears in a fenced code block', async () => {
    const fs = new InMemoryFileSystemService(
      { '/project/AGENTS.md': ['# AGENTS', '```', '/pair-removed', '```'].join('\n') },
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

    const warnings: string[] = []
    const pushLog = (level: string, message: string) => {
      if (level === 'warn') warnings.push(message)
    }

    await detectOrphanedSkillReferences({ fs, baseTarget: '/project', pushLog }, registries, [
      'pair-removed',
    ])

    expect(warnings).toHaveLength(0)
  })

  it('does not throw when target does not exist', async () => {
    const fs = new InMemoryFileSystemService({}, '/project', '/project')
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

    await expect(
      detectOrphanedSkillReferences({ fs, baseTarget: '/project', pushLog: noopLog }, registries, [
        'pair-removed',
      ]),
    ).resolves.not.toThrow()
  })
})

describe('reconcileSkillNameRegistry', () => {
  // #238 finding: when this run's skillNameMap is empty — not just "no
  // manifest yet" but also "flatten/prefix was disabled for every registry
  // this run" — reconcile is a full no-op (no orphan warnings, no rewrite,
  // no manifest write), even though a previous manifest exists.
  //
  // This is intentional, not an oversight: with an empty current map we
  // cannot tell "skill removed from the registry" apart from "skill still
  // present but now installed under its unprefixed name" (the latter never
  // gets a skillNameMap entry when transforms are off — see
  // `hasNamingTransforms` in copyPathOps.ts). Attempting orphan detection
  // from the stale manifest alone would flag every previously-renamed skill
  // as "removed", which is actively misleading for the common case where it
  // is still installed, just unprefixed. No-op is the safer failure mode.
  it('is a no-op when the current run has no renames, even with a stale manifest', async () => {
    const previousManifest = JSON.stringify({ version: 1, skills: { next: 'pair-process-next' } })
    const fs = new InMemoryFileSystemService(
      {
        '/project/AGENTS.md': '# AGENTS\n\nRun /pair-process-next to get started.\n',
        '/project/.pair/.skill-name-map.json': previousManifest,
      },
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

    const warnings: string[] = []
    const pushLog = (level: string, message: string) => {
      if (level === 'warn') warnings.push(message)
    }

    await reconcileSkillNameRegistry(
      { fs, baseTarget: '/project', pushLog },
      registries,
      new Map(),
      new Map(),
    )

    // No orphan warning — "pair-process-next" is not misreported as removed.
    expect(warnings).toHaveLength(0)

    // Non-skill registry content is left untouched (no rewrite attempted).
    const agents = await fs.readFile('/project/AGENTS.md')
    expect(agents).toBe('# AGENTS\n\nRun /pair-process-next to get started.\n')

    // The stale manifest is left as recorded, not overwritten with an empty map.
    const manifest = await fs.readFile('/project/.pair/.skill-name-map.json')
    expect(manifest).toBe(previousManifest)
  })
})

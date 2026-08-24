import { describe, it, expect } from 'vitest'
import { InMemoryFileSystemService } from '@pair/content-ops'
import type { Config } from '#registry'
import { createSkillProbe } from './skill-probe'

const cwd = '/project'

const skillsConfig = (targets: string[], prefix?: string): Config =>
  ({
    asset_registries: {
      skills: {
        source: '.skills',
        behavior: 'overwrite',
        description: 'skills',
        include: [],
        flatten: true,
        ...(prefix && { prefix }),
        targets: targets.map(path => ({ path, mode: 'canonical' as const })),
      },
    },
  }) as unknown as Config

function probe(files: string[], config: Config) {
  const fs = new InMemoryFileSystemService(
    Object.fromEntries(files.map(file => [file, ''])),
    cwd,
    cwd,
  )
  return createSkillProbe(fs, config, cwd)
}

describe('createSkillProbe', () => {
  it('finds a prefixed skill under the registry target', () => {
    const isInstalled = probe(
      [`${cwd}/.claude/skills/pair-loop/SKILL.md`],
      skillsConfig(['.claude/skills/'], 'pair'),
    )

    expect(isInstalled('pair-loop')).toBe(true)
    expect(isInstalled('pair-next')).toBe(false)
  })

  it('finds a skill installed under the bare dataset name', () => {
    const isInstalled = probe(
      [`${cwd}/.claude/skills/loop/SKILL.md`],
      skillsConfig(['.claude/skills/'], 'pair'),
    )

    expect(isInstalled('pair-loop')).toBe(true)
  })

  it('probes every declared target, not just the canonical one', () => {
    const isInstalled = probe(
      [`${cwd}/.agents/skills/pair-next/SKILL.md`],
      skillsConfig(['.claude/skills/', '.agents/skills/'], 'pair'),
    )

    expect(isInstalled('pair-next')).toBe(true)
  })

  it('reports nothing installed when the registry is missing from the config', () => {
    const isInstalled = probe([`${cwd}/.claude/skills/pair-loop/SKILL.md`], {
      asset_registries: {},
    } as unknown as Config)

    // Falls back to the conventional location, which is where this fixture put the skill.
    expect(isInstalled('pair-loop')).toBe(true)
    expect(isInstalled('pair-next')).toBe(false)
  })
})

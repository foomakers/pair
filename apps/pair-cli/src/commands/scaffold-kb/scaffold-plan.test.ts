import { describe, it, expect } from 'vitest'
import { buildScaffoldPlan } from './scaffold-plan'

const identity = { name: 'acme-kb', slug: 'acme-kb', skillPrefix: 'acme-kb' }

function planFor(host: 'github' | 'generic') {
  return buildScaffoldPlan({ root: '/work/acme-kb', identity, host })
}

describe('buildScaffoldPlan', () => {
  it('creates the pure KB directories (no .pair/adoption)', () => {
    const plan = planFor('github')

    expect(plan.directories).toEqual(['.pair/knowledge', '.skills'])
    expect(plan.directories.some(d => d.startsWith('.pair/adoption'))).toBe(false)
  })

  it('owns the config, README, gitignore and release script', () => {
    const owned = planFor('github')
      .files.filter(f => f.kind === 'scaffold-owned')
      .map(f => f.path)

    expect(owned).toEqual([
      'pair.config.json',
      'README.md',
      '.gitignore',
      'scripts/release.sh',
      '.github/workflows/release.yml',
    ])
  })

  it('omits the GitHub Actions workflow on the generic host', () => {
    const paths = planFor('generic').files.map(f => f.path)

    expect(paths).not.toContain('.github/workflows/release.yml')
    expect(paths).toContain('scripts/release.sh')
  })

  it('seeds KB content as maintainer-owned files, never scaffold-owned', () => {
    const seeds = planFor('github')
      .files.filter(f => f.kind === 'seed')
      .map(f => f.path)

    expect(seeds).toEqual(['.pair/knowledge/README.md', '.skills/example-skill/SKILL.md'])
  })

  // Host-switch honesty: the plan states which scaffold-owned files the chosen host does
  // NOT manage, so a re-scaffold with a different --host can report the leftovers instead
  // of leaving an orphaned workflow firing on every v* tag push.
  it('lists the workflow as unmanaged on the generic host', () => {
    expect(planFor('generic').unmanaged).toEqual(['.github/workflows/release.yml'])
  })

  it('has nothing unmanaged on the github host (it manages every scaffold-owned file)', () => {
    expect(planFor('github').unmanaged).toEqual([])
  })

  it('never plans a file it also declares unmanaged', () => {
    const plan = planFor('generic')

    for (const orphan of plan.unmanaged) {
      expect(plan.files.map(f => f.path)).not.toContain(orphan)
    }
  })

  it('carries the root and non-empty content for every planned file', () => {
    const plan = planFor('github')

    expect(plan.root).toBe('/work/acme-kb')
    for (const file of plan.files) {
      expect(file.content.length).toBeGreaterThan(0)
    }
  })
})

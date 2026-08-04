import { describe, expect, it } from 'vitest'
import { InMemoryFileSystemService } from '@pair/content-ops'
import { extractRegistries, resolveTarget, resolveRegistryPaths } from './resolver'

describe('registry resolver', () => {
  const cwd = '/project'

  it('extractRegistries handles both new and legacy fields', () => {
    const config1 = { asset_registries: { a: { targets: [{ path: 'p', mode: 'canonical' }] } } }
    const config2 = { dataset_registries: { b: { targets: [{ path: 'q', mode: 'canonical' }] } } }

    expect(extractRegistries(config1)).toHaveProperty('a')
    expect(extractRegistries(config2)).toHaveProperty('b')
  })

  // #407: normalizeRegistryConfig used to ignore the key entirely, so
  // `"flattenDepth": 2` in config.json was silently dropped and the copy pipeline
  // always ran an unbounded flatten.
  it('extractRegistries reads flattenDepth, and omits it when absent', () => {
    const config = {
      asset_registries: {
        skills: {
          source: '.skills',
          flatten: true,
          flattenDepth: 2,
          targets: [{ path: '.claude/skills/', mode: 'canonical' }],
        },
        knowledge: { source: '.pair', targets: [{ path: '.pair', mode: 'canonical' }] },
      },
    }
    const registries = extractRegistries(config)
    expect(registries['skills']?.flattenDepth).toBe(2)
    expect(registries['knowledge']?.flattenDepth).toBeUndefined()
  })

  // An explicit null is a config MISTAKE, not an omission: dropping it here would
  // silently restore the unbounded flatten this story removed. Carried through so
  // validateFlattenDepthField rejects it by name.
  it('carries an explicit null flattenDepth through to validation instead of dropping it', () => {
    const config = {
      asset_registries: {
        skills: {
          source: '.skills',
          flatten: true,
          flattenDepth: null,
          targets: [{ path: '.claude/skills/', mode: 'canonical' }],
        },
      },
    }
    const registries = extractRegistries(config)
    expect('flattenDepth' in (registries['skills'] as object)).toBe(true)
    expect(registries['skills']?.flattenDepth).toBeNull()
  })

  it('resolveTarget correctly resolves relative and absolute targets', () => {
    const fs = new InMemoryFileSystemService({}, cwd, cwd)
    const config = {
      source: 'reg',
      behavior: 'mirror' as const,
      description: 'd',
      include: [] as string[],
      flatten: false,
      targets: [{ path: 'dest', mode: 'canonical' as const }],
    }

    expect(resolveTarget('reg', config, fs)).toBe(`${cwd}/dest`)
    expect(resolveTarget('reg', config, fs, '/other')).toBe('/other/dest')
  })

  it('resolveRegistryPaths calculates both source and target', () => {
    const fs = new InMemoryFileSystemService({}, cwd, cwd)
    const params = {
      name: 'reg',
      config: {
        source: 'reg',
        behavior: 'mirror' as const,
        description: 'd',
        include: [] as string[],
        flatten: false,
        targets: [{ path: 'dest', mode: 'canonical' as const }],
      },
      datasetRoot: '/dataset',
      fs,
    }

    const result = resolveRegistryPaths(params)
    expect(result.source).toBe('/dataset/reg')
    expect(result.target).toBe(`${cwd}/dest`)
  })

  it('extractRegistries preserves transform property on targets', () => {
    const config = {
      asset_registries: {
        agents: {
          source: 'AGENTS.md',
          behavior: 'mirror',
          description: 'Agents',
          targets: [
            { path: 'AGENTS.md', mode: 'canonical' },
            { path: 'CLAUDE.md', mode: 'copy', transform: { prefix: 'claude' } },
          ],
        },
      },
    }
    const registries = extractRegistries(config)
    const agentsReg = registries['agents']
    expect(agentsReg).toBeDefined()
    const claudeTarget = agentsReg!.targets.find(t => t.path === 'CLAUDE.md')
    expect(claudeTarget).toBeDefined()
    expect(claudeTarget!.transform).toEqual({ prefix: 'claude' })
  })
})

describe('exclude in the registry config (#277)', () => {
  it('is read from raw config', () => {
    const registries = extractRegistries({
      asset_registries: { skills: { source: '.skills', exclude: ['process/setup'] } },
    })
    expect(registries['skills']?.exclude).toEqual(['process/setup'])
  })

  it('defaults to empty when absent, so no registry changes behaviour', () => {
    const registries = extractRegistries({
      asset_registries: { knowledge: { source: '.knowledge' } },
    })
    expect(registries['knowledge']?.exclude).toEqual([])
  })

  it('ignores a non-array value instead of trusting it', () => {
    const registries = extractRegistries({
      asset_registries: { skills: { source: '.skills', exclude: 'process/setup' } },
    })
    expect(registries['skills']?.exclude).toEqual([])
  })
})

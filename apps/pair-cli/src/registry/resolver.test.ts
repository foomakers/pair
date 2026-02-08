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
})

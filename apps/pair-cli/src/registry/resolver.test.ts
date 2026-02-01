import { describe, expect, it } from 'vitest'
import { InMemoryFileSystemService } from '@pair/content-ops'
import { extractRegistries, resolveTarget, resolveRegistryPaths } from './resolver'

describe('registry resolver', () => {
  const cwd = '/project'

  it('extractRegistries handles both new and legacy fields', () => {
    const config1 = { asset_registries: { a: { target_path: 'p' } } }
    const config2 = { dataset_registries: { b: { target_path: 'q' } } }

    expect(extractRegistries(config1)).toHaveProperty('a')
    expect(extractRegistries(config2)).toHaveProperty('b')
  })

  it('resolveTarget correctly resolves relative and absolute targets', () => {
    const fs = new InMemoryFileSystemService({}, cwd, cwd)
    const config = { behavior: 'mirror' as const, target_path: 'dest', description: 'd' }

    expect(resolveTarget('reg', config, fs)).toBe(`${cwd}/dest`)
    expect(resolveTarget('reg', config, fs, '/other')).toBe('/other/dest')
  })

  it('resolveRegistryPaths calculates both source and target', () => {
    const fs = new InMemoryFileSystemService({}, cwd, cwd)
    const params = {
      name: 'reg',
      config: { behavior: 'mirror' as const, target_path: 'dest', description: 'd' },
      datasetRoot: '/dataset',
      fs,
    }

    const result = resolveRegistryPaths(params)
    expect(result.source).toBe('/dataset/reg')
    expect(result.target).toBe(`${cwd}/dest`)
  })
})

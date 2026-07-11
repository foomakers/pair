import { describe, it, expect } from 'vitest'
import { getReservedPaths, detectReservedPathOverlap } from './reserved-paths'
import { DEFAULT_WORKING_PATH } from './working-area'
import { RegistryConfig } from './resolver'

const baseRegistry: RegistryConfig = {
  source: '.pair/knowledge',
  behavior: 'mirror',
  description: 'Knowledge base',
  include: [],
  flatten: false,
  targets: [{ path: '.pair/knowledge', mode: 'canonical' }],
}

describe('getReservedPaths', () => {
  it('includes the working area (default)', () => {
    expect(getReservedPaths(DEFAULT_WORKING_PATH)).toContain('.pair/working')
  })

  it('includes the working area override', () => {
    expect(getReservedPaths('.pair/scratch')).toContain('.pair/scratch')
  })
})

describe('detectReservedPathOverlap', () => {
  const reserved = getReservedPaths(DEFAULT_WORKING_PATH)

  it('reports no overlap for ordinary registries', () => {
    const registries: Record<string, RegistryConfig> = { knowledge: baseRegistry }
    expect(detectReservedPathOverlap(registries, reserved)).toHaveLength(0)
  })

  it('rejects a registry target equal to a reserved path', () => {
    const registries: Record<string, RegistryConfig> = {
      knowledge: baseRegistry,
      working: {
        ...baseRegistry,
        targets: [{ path: '.pair/working', mode: 'canonical' }],
      },
    }
    const errors = detectReservedPathOverlap(registries, reserved)
    expect(errors).toHaveLength(1)
    expect(errors[0]).toContain("Registry 'working'")
    expect(errors[0]).toContain('reserved path')
  })

  it('rejects a registry mirroring an ancestor of a reserved path', () => {
    const registries: Record<string, RegistryConfig> = {
      pairroot: {
        ...baseRegistry,
        source: '.pair',
        targets: [{ path: '.pair', mode: 'canonical' }],
      },
    }
    const errors = detectReservedPathOverlap(registries, reserved)
    expect(errors).toHaveLength(1)
    expect(errors[0]).toContain("Registry 'pairroot'")
  })

  it('rejects a reserved path that lands inside a registry-managed directory', () => {
    const registries: Record<string, RegistryConfig> = { knowledge: baseRegistry }
    const errors = detectReservedPathOverlap(registries, ['.pair/knowledge/working'])
    expect(errors).toHaveLength(1)
    expect(errors[0]).toContain("Registry 'knowledge'")
  })

  it('checks secondary (non-canonical) targets too', () => {
    const registries: Record<string, RegistryConfig> = {
      agents: {
        ...baseRegistry,
        source: 'AGENTS.md',
        targets: [
          { path: 'AGENTS.md', mode: 'canonical' },
          { path: '.pair/working', mode: 'copy' },
        ],
      },
    }
    const errors = detectReservedPathOverlap(registries, reserved)
    expect(errors).toHaveLength(1)
  })

  it('flags every reserved path a target covers (extensible set)', () => {
    // Simulates a future reserved path (e.g. #261 .pair/.kb-version.json): a
    // registry mirroring an ancestor of multiple reserved paths is flagged per hit.
    const registries: Record<string, RegistryConfig> = {
      pairroot: {
        ...baseRegistry,
        source: '.pair',
        targets: [{ path: '.pair', mode: 'canonical' }],
      },
    }
    const errors = detectReservedPathOverlap(registries, ['.pair/working', '.pair/.kb-version.json'])
    expect(errors).toHaveLength(2)
  })
})

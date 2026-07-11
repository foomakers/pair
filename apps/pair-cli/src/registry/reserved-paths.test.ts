import { describe, it, expect } from 'vitest'
import { posix } from 'path'
import { getReservedPaths, detectReservedPathOverlap } from './reserved-paths'
import { DEFAULT_WORKING_PATH } from './working-area'
import { RegistryConfig } from './resolver'
import { INSTALLED_VERSION_MARKER } from '../commands/kb-info/version-resolver'

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

  it('includes the KB version marker, matching INSTALLED_VERSION_MARKER (#261)', () => {
    const paths = getReservedPaths(DEFAULT_WORKING_PATH)
    expect(paths).toContain('.pair/.kb-version.json')
    // anti-drift: the reserved literal must agree with the marker constant
    expect(paths.map(p => posix.normalize(p))).toContain(posix.normalize(INSTALLED_VERSION_MARKER))
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
    // `.pair` is an ancestor of every reserved path under it — flagged per hit
    expect(errors.length).toBeGreaterThanOrEqual(1)
    expect(errors.every(e => e.includes("Registry 'pairroot'"))).toBe(true)
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

  it('rejects a non-canonical target that resolves onto a reserved path (`..` segments)', () => {
    const registries: Record<string, RegistryConfig> = {
      sneaky: {
        ...baseRegistry,
        // resolves to `.pair/working` — must not slip past the overlap check
        targets: [{ path: '.pair/knowledge/../working', mode: 'canonical' }],
      },
    }
    const errors = detectReservedPathOverlap(registries, reserved)
    expect(errors).toHaveLength(1)
    expect(errors[0]).toContain("Registry 'sneaky'")
  })

  it('rejects a non-canonical ancestor target (`./.pair`)', () => {
    const registries: Record<string, RegistryConfig> = {
      dotpair: {
        ...baseRegistry,
        // `./.pair` resolves to `.pair`, an ancestor of the reserved paths
        targets: [{ path: './.pair', mode: 'canonical' }],
      },
    }
    const errs = detectReservedPathOverlap(registries, reserved)
    expect(errs.length).toBeGreaterThanOrEqual(1)
    expect(errs.every(e => e.includes("Registry 'dotpair'"))).toBe(true)
  })

  it('rejects a registry target equal to the KB version marker (#261)', () => {
    const registries: Record<string, RegistryConfig> = {
      ver: {
        ...baseRegistry,
        targets: [{ path: '.pair/.kb-version.json', mode: 'canonical' }],
      },
    }
    const errors = detectReservedPathOverlap(registries, reserved)
    expect(errors).toHaveLength(1)
    expect(errors[0]).toContain('.pair/.kb-version.json')
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
    const errors = detectReservedPathOverlap(registries, [
      '.pair/working',
      '.pair/.kb-version.json',
    ])
    expect(errors).toHaveLength(2)
  })
})

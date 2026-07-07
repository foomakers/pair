import { describe, it, expect } from 'vitest'
import {
  DEFAULT_WORKING_PATH,
  resolveWorkingPathOverride,
  resolveWorkingPath,
  isWithinPath,
  pathsOverlap,
  detectWorkingPathOverlap,
} from './working-area'
import { RegistryConfig } from './resolver'
import { createTestFs } from '#test-utils'

describe('resolveWorkingPathOverride', () => {
  it('returns the default when no override is configured', () => {
    expect(resolveWorkingPathOverride({})).toBe(DEFAULT_WORKING_PATH)
    expect(resolveWorkingPathOverride(undefined)).toBe(DEFAULT_WORKING_PATH)
  })

  it('returns the override when working_path is a non-empty string', () => {
    expect(resolveWorkingPathOverride({ working_path: '.pair/scratch' })).toBe('.pair/scratch')
  })

  it('falls back to the default for invalid override values', () => {
    expect(resolveWorkingPathOverride({ working_path: '' })).toBe(DEFAULT_WORKING_PATH)
    expect(resolveWorkingPathOverride({ working_path: '   ' })).toBe(DEFAULT_WORKING_PATH)
    expect(resolveWorkingPathOverride({ working_path: 123 })).toBe(DEFAULT_WORKING_PATH)
  })
})

describe('resolveWorkingPath', () => {
  it('resolves the default working path relative to baseTarget', () => {
    const fs = createTestFs({}, {}, '/project')
    expect(resolveWorkingPath({}, '/project', fs)).toBe('/project/.pair/working')
  })

  it('resolves an overridden working path relative to baseTarget', () => {
    const fs = createTestFs({}, {}, '/project')
    expect(resolveWorkingPath({ working_path: '.pair/scratch' }, '/project', fs)).toBe(
      '/project/.pair/scratch',
    )
  })
})

describe('isWithinPath', () => {
  it('matches an exact path', () => {
    expect(isWithinPath('.pair/working', '.pair/working')).toBe(true)
  })

  it('matches a nested path', () => {
    expect(isWithinPath('.pair/working/checkpoints', '.pair/working')).toBe(true)
  })

  it('does not match a sibling sharing the same string prefix', () => {
    expect(isWithinPath('.pair/working-notes', '.pair/working')).toBe(false)
  })

  it('does not match an unrelated path', () => {
    expect(isWithinPath('.pair/knowledge', '.pair/working')).toBe(false)
  })
})

describe('pathsOverlap', () => {
  it('is true when a contains b', () => {
    expect(pathsOverlap('.pair', '.pair/working')).toBe(true)
  })

  it('is true when b contains a', () => {
    expect(pathsOverlap('.pair/working', '.pair')).toBe(true)
  })

  it('is false for unrelated paths', () => {
    expect(pathsOverlap('.pair/adoption', '.pair/working')).toBe(false)
  })
})

describe('isWithinPath - case sensitivity by platform (D14)', () => {
  it('is case-insensitive on darwin', () => {
    expect(isWithinPath('.pair/Working', '.pair/working', 'darwin')).toBe(true)
  })

  it('is case-insensitive on win32', () => {
    expect(isWithinPath('.pair/Working', '.pair/working', 'win32')).toBe(true)
  })

  it('is case-sensitive on linux', () => {
    expect(isWithinPath('.pair/Working', '.pair/working', 'linux')).toBe(false)
  })
})

describe('pathsOverlap - case sensitivity by platform (D14)', () => {
  it('flags a working_path override differing only in case on darwin', () => {
    expect(pathsOverlap('.pair/Working', '.pair/working', 'darwin')).toBe(true)
  })

  it('flags a working_path override differing only in case on win32', () => {
    expect(pathsOverlap('.pair/Working', '.pair/working', 'win32')).toBe(true)
  })

  it('does not fold case on linux', () => {
    expect(pathsOverlap('.pair/Working', '.pair/working', 'linux')).toBe(false)
  })
})

describe('detectWorkingPathOverlap', () => {
  const baseRegistry: RegistryConfig = {
    source: '.pair/knowledge',
    behavior: 'mirror',
    description: 'Knowledge base',
    include: [],
    flatten: false,
    targets: [{ path: '.pair/knowledge', mode: 'canonical' }],
  }

  it('reports no overlap for the default registries and default working path', () => {
    const registries: Record<string, RegistryConfig> = { knowledge: baseRegistry }
    expect(detectWorkingPathOverlap(registries)).toHaveLength(0)
  })

  it('flags a registry that accidentally targets the working path exactly', () => {
    const registries: Record<string, RegistryConfig> = {
      knowledge: baseRegistry,
      working: {
        ...baseRegistry,
        targets: [{ path: '.pair/working', mode: 'canonical' }],
      },
    }
    const errors = detectWorkingPathOverlap(registries)
    expect(errors).toHaveLength(1)
    expect(errors[0]).toContain("Registry 'working'")
    expect(errors[0]).toContain('overlaps with the working area')
  })

  it('flags a registry mirroring an ancestor of the working path', () => {
    const registries: Record<string, RegistryConfig> = {
      pairroot: {
        ...baseRegistry,
        source: '.pair',
        targets: [{ path: '.pair', mode: 'canonical' }],
      },
    }
    const errors = detectWorkingPathOverlap(registries)
    expect(errors).toHaveLength(1)
    expect(errors[0]).toContain("Registry 'pairroot'")
  })

  it('flags an override that lands inside a registry-managed directory', () => {
    const registries: Record<string, RegistryConfig> = { knowledge: baseRegistry }
    const errors = detectWorkingPathOverlap(registries, '.pair/knowledge/working')
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
    const errors = detectWorkingPathOverlap(registries)
    expect(errors).toHaveLength(1)
  })
})

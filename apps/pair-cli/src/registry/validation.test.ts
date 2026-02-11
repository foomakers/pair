import { describe, it, expect } from 'vitest'
import {
  validateRegistry,
  detectOverlappingTargets,
  validateAllRegistries,
  checkTargetEmptiness,
  checkTargetsEmptiness,
} from './validation'
import { RegistryConfig } from './resolver'
import { createTestFs } from '#test-utils'

describe('registry validation - checkTargetEmptiness', () => {
  it('returns empty if directory does not exist', async () => {
    const fs = createTestFs({}, {}, '/test')
    const result = await checkTargetEmptiness('/test/absent', fs)
    expect(result.empty).toBe(true)
    expect(result.exists).toBe(false)
  })

  it('returns not empty if directory has files', async () => {
    const fs = createTestFs({}, { '/test/dir/file.txt': 'hi' }, '/test')
    const result = await checkTargetEmptiness('/test/dir', fs)
    expect(result.empty).toBe(false)
    expect(result.exists).toBe(true)
  })

  it('checkTargetsEmptiness validates multiple paths', async () => {
    const fs = createTestFs({}, {}, '/test')
    await fs.mkdir('/test/occupied', { recursive: true })
    await fs.writeFile('/test/occupied/f.txt', 'occupied')

    const targets = {
      empty: '/test/empty',
      occupied: '/test/occupied',
    }
    const result = await checkTargetsEmptiness(targets, fs)
    expect(result.valid).toBe(false)
    expect(result.errors).toHaveLength(1)
    expect(result.errors[0]!.registry).toBe('occupied')
  })
})

describe('registry validation - validateRegistry', () => {
  it('validates a correct registry', () => {
    const config: RegistryConfig = {
      source: '.pair',
      behavior: 'mirror',
      description: 'Test',
      include: [],
      flatten: false,
      targets: [{ path: '.pair', mode: 'canonical' }],
    }
    const errors = validateRegistry('test', config)
    expect(errors).toHaveLength(0)
  })

  it('fails on invalid behavior', () => {
    const config = {
      behavior: 'invalid',
      description: 'Test',
      include: [],
      flatten: false,
      targets: [{ path: '.pair', mode: 'canonical' }],
    }
    const errors = validateRegistry('test', config)
    expect(errors[0]).toContain('invalid behavior')
  })

  it('fails on missing targets', () => {
    const config = {
      behavior: 'mirror',
      description: 'Test',
    }
    const errors = validateRegistry('test', config)
    expect(errors[0]).toContain('at least one target')
  })
})

describe('registry validation - detectOverlappingTargets', () => {
  it('detects identical targets', () => {
    const targets = {
      reg1: 'path/a',
      reg2: 'path/a',
    }
    const errors = detectOverlappingTargets(targets)
    expect(errors).toHaveLength(1)
    expect(errors[0]).toContain('same target')
  })

  it('detects nested targets', () => {
    const targets = {
      parent: 'path/a',
      child: 'path/a/b',
    }
    const errors = detectOverlappingTargets(targets)
    expect(errors).toHaveLength(1)
    expect(errors[0]).toContain('overlap')
  })
})

describe('registry validation - validateAllRegistries', () => {
  it('validates a full set of registries', () => {
    const registries: Record<string, RegistryConfig> = {
      reg1: {
        source: 'reg1',
        behavior: 'mirror',
        description: 'desc',
        include: [],
        flatten: false,
        targets: [{ path: 'a', mode: 'canonical' }],
      },
      reg2: {
        source: 'reg2',
        behavior: 'add',
        description: 'desc',
        include: [],
        flatten: false,
        targets: [{ path: 'b', mode: 'canonical' }],
      },
    }
    const result = validateAllRegistries(registries)
    expect(result.valid).toBe(true)
    expect(result.errors).toHaveLength(0)
  })

  it('detects overlaps in validateAllRegistries', () => {
    const registries: Record<string, RegistryConfig> = {
      reg1: {
        source: 'reg1',
        behavior: 'mirror',
        description: 'desc',
        include: [],
        flatten: false,
        targets: [{ path: 'a', mode: 'canonical' }],
      },
      reg2: {
        source: 'reg2',
        behavior: 'add',
        description: 'desc',
        include: [],
        flatten: false,
        targets: [{ path: 'a', mode: 'canonical' }],
      },
    }
    const result = validateAllRegistries(registries)
    expect(result.valid).toBe(false)
    expect(result.errors).toHaveLength(1)
  })

  it('fails when no valid registries exist (all invalid)', () => {
    const registries: Record<string, RegistryConfig> = {
      // Registry with missing required fields
      invalid1: {
        source: 'invalid1',
        behavior: '' as unknown as 'mirror',
        description: '',
        include: [],
        flatten: false,
        targets: [],
      },
    }
    const result = validateAllRegistries(registries)
    expect(result.valid).toBe(false)
    expect(result.errors.length).toBeGreaterThan(0)
  })

  it('fails when registries object is empty', () => {
    const registries: Record<string, RegistryConfig> = {}
    const result = validateAllRegistries(registries)
    expect(result.valid).toBe(false)
    expect(result.errors[0]).toContain('Config must have asset_registries object')
  })
})

describe('registry validation - targets', () => {
  it('accepts registry with valid targets', () => {
    const config: RegistryConfig = {
      source: '.claude/skills/',
      behavior: 'mirror',
      description: 'Skills',
      include: [],
      flatten: false,
      targets: [
        { path: '.claude/skills/', mode: 'canonical' },
        { path: '.github/skills/', mode: 'symlink' },
      ],
    }
    const errors = validateRegistry('skills', config)
    expect(errors).toHaveLength(0)
  })

  it('accepts registry with single canonical target', () => {
    const config: RegistryConfig = {
      source: '.pair',
      behavior: 'mirror',
      description: 'KB',
      include: [],
      flatten: false,
      targets: [{ path: '.pair', mode: 'canonical' }],
    }
    const errors = validateRegistry('knowledge', config)
    expect(errors).toHaveLength(0)
  })

  it('rejects non-array targets', () => {
    const config = {
      behavior: 'mirror',
      description: 'Skills',
      include: [],
      flatten: false,
      targets: 'invalid',
    }
    const errors = validateRegistry('skills', config)
    expect(errors.some(e => e.includes('target'))).toBe(true)
  })

  it('rejects targets with missing path or mode', () => {
    const config = {
      behavior: 'mirror',
      description: 'Skills',
      include: [],
      flatten: false,
      targets: [{ path: '.claude/skills/' }],
    }
    const errors = validateRegistry('skills', config)
    expect(errors.some(e => e.includes('path and mode'))).toBe(true)
  })

  it('rejects multi-target with no canonical via validateTargets', () => {
    const config: RegistryConfig = {
      source: 'skills',
      behavior: 'mirror',
      description: 'Skills',
      include: [],
      flatten: false,
      targets: [
        { path: '.github/skills/', mode: 'symlink' },
        { path: '.cursor/skills/', mode: 'copy' },
      ],
    }
    const errors = validateRegistry('skills', config)
    expect(errors.some(e => e.includes('canonical'))).toBe(true)
  })

  it('accepts registry with flatten and prefix', () => {
    const config: RegistryConfig = {
      source: '.skills',
      behavior: 'mirror',
      description: 'Skills',
      include: [],
      flatten: true,
      prefix: 'pair',
      targets: [{ path: '.skills', mode: 'canonical' }],
    }
    const errors = validateRegistry('skills', config)
    expect(errors).toHaveLength(0)
  })

  it('rejects non-boolean flatten', () => {
    const config = {
      behavior: 'mirror',
      description: 'Skills',
      include: [],
      flatten: 'yes',
      targets: [{ path: '.skills', mode: 'canonical' }],
    }
    const errors = validateRegistry('skills', config)
    expect(errors.some(e => e.includes('flatten'))).toBe(true)
  })

  it('rejects non-string prefix', () => {
    const config = {
      behavior: 'mirror',
      description: 'Skills',
      include: [],
      flatten: false,
      prefix: 123,
      targets: [{ path: '.skills', mode: 'canonical' }],
    }
    const errors = validateRegistry('skills', config)
    expect(errors.some(e => e.includes('prefix'))).toBe(true)
  })

  it('accepts target with valid transform', () => {
    const config: RegistryConfig = {
      source: 'AGENTS.md',
      behavior: 'mirror',
      description: 'Agents',
      include: [],
      flatten: false,
      targets: [
        { path: 'AGENTS.md', mode: 'canonical' },
        { path: 'CLAUDE.md', mode: 'copy', transform: { prefix: 'claude' } },
      ],
    }
    const errors = validateRegistry('agents', config)
    expect(errors).toHaveLength(0)
  })

  it('rejects target with empty transform prefix', () => {
    const config = {
      behavior: 'mirror',
      description: 'Agents',
      include: [],
      flatten: false,
      targets: [
        { path: 'AGENTS.md', mode: 'canonical' },
        { path: 'CLAUDE.md', mode: 'copy', transform: { prefix: '' } },
      ],
    }
    const errors = validateRegistry('agents', config)
    expect(errors.some(e => e.includes('transform'))).toBe(true)
  })

  it('rejects target with non-object transform', () => {
    const config = {
      behavior: 'mirror',
      description: 'Agents',
      include: [],
      flatten: false,
      targets: [
        { path: 'AGENTS.md', mode: 'canonical' },
        { path: 'CLAUDE.md', mode: 'copy', transform: 'invalid' },
      ],
    }
    const errors = validateRegistry('agents', config)
    expect(errors.some(e => e.includes('transform'))).toBe(true)
  })
})

import { describe, it, expect } from 'vitest'
import {
  validateRegistry,
  detectOverlappingTargets,
  validateAllRegistries,
  checkTargetEmptiness,
  checkTargetsEmptiness,
} from './validation'
import { RegistryConfig } from './resolver'
import { createTestFs } from '../test-utils'

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
    expect(result.errors[0].registry).toBe('occupied')
  })
})

describe('registry validation - validateRegistry', () => {
  it('validates a correct registry', () => {
    const config: RegistryConfig = {
      behavior: 'mirror',
      target_path: '.pair',
      description: 'Test',
    }
    const errors = validateRegistry('test', config)
    expect(errors).toHaveLength(0)
  })

  it('fails on invalid behavior', () => {
    const config = {
      behavior: 'invalid',
      target_path: '.pair',
      description: 'Test',
    }
    const errors = validateRegistry('test', config)
    expect(errors[0]).toContain('invalid behavior')
  })

  it('fails on missing target_path', () => {
    const config = {
      behavior: 'mirror',
      description: 'Test',
    }
    const errors = validateRegistry('test', config)
    expect(errors[0]).toContain('valid target_path string')
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
      reg1: { behavior: 'mirror', target_path: 'a', description: 'desc' },
      reg2: { behavior: 'add', target_path: 'b', description: 'desc' },
    }
    const result = validateAllRegistries(registries)
    expect(result.valid).toBe(true)
    expect(result.errors).toHaveLength(0)
  })

  it('detects overlaps in validateAllRegistries', () => {
    const registries: Record<string, RegistryConfig> = {
      reg1: { behavior: 'mirror', target_path: 'a', description: 'desc' },
      reg2: { behavior: 'add', target_path: 'a', description: 'desc' },
    }
    const result = validateAllRegistries(registries)
    expect(result.valid).toBe(false)
    expect(result.errors).toHaveLength(1)
  })
})

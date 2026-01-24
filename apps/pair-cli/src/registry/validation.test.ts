import { describe, it, expect } from 'vitest'
import { validateRegistry, detectOverlappingTargets, validateAllRegistries } from './validation'
import { RegistryConfig } from './resolver'

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

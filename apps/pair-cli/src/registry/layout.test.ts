import { describe, it, expect } from 'vitest'
import type { TargetConfig, FileSystemService } from '@pair/content-ops'
import type { RegistryConfig } from './resolver'
import {
  filterRegistries,
  getNonSymlinkTargets,
  resolveLayoutPaths,
  applyPrefixFlatten,
  validateSkipList,
} from './layout'

// Test fixtures
const createMockRegistry = (
  source: string,
  targets: TargetConfig[],
  options?: { prefix?: string; flatten?: boolean },
): RegistryConfig => ({
  source,
  behavior: 'mirror',
  description: 'Test registry',
  include: [],
  flatten: options?.flatten ?? false,
  ...(options?.prefix && { prefix: options.prefix }),
  targets,
})

const mockFs: FileSystemService = {
  resolve: (...paths: string[]) => paths.join('/').replace(/\/+/g, '/'),
} as FileSystemService

describe('filterRegistries', () => {
  it('should return all registries when skip list is empty', () => {
    const registries = {
      skills: createMockRegistry('.skills', [{ path: '.claude/skills', mode: 'canonical' }]),
      adoption: createMockRegistry('.pair/adoption', [
        { path: '.pair/adoption', mode: 'canonical' },
      ]),
    }

    const result = filterRegistries(registries, [])
    expect(result).toEqual(registries)
  })

  it('should return all registries when skip list is undefined', () => {
    const registries = {
      skills: createMockRegistry('.skills', [{ path: '.claude/skills', mode: 'canonical' }]),
    }

    const result = filterRegistries(registries, undefined)
    expect(result).toEqual(registries)
  })

  it('should exclude single registry from skip list', () => {
    const registries = {
      skills: createMockRegistry('.skills', [{ path: '.claude/skills', mode: 'canonical' }]),
      adoption: createMockRegistry('.pair/adoption', [
        { path: '.pair/adoption', mode: 'canonical' },
      ]),
      agents: createMockRegistry('AGENTS.md', [{ path: 'AGENTS.md', mode: 'canonical' }]),
    }

    const result = filterRegistries(registries, ['adoption'])

    expect(result).toEqual({
      skills: registries.skills,
      agents: registries.agents,
    })
    expect(result).not.toHaveProperty('adoption')
  })

  it('should exclude multiple registries from skip list', () => {
    const registries = {
      skills: createMockRegistry('.skills', [{ path: '.claude/skills', mode: 'canonical' }]),
      adoption: createMockRegistry('.pair/adoption', [
        { path: '.pair/adoption', mode: 'canonical' },
      ]),
      agents: createMockRegistry('AGENTS.md', [{ path: 'AGENTS.md', mode: 'canonical' }]),
    }

    const result = filterRegistries(registries, ['adoption', 'agents'])

    expect(result).toEqual({
      skills: registries.skills,
    })
  })
})

describe('getNonSymlinkTargets', () => {
  it('should return all targets when none are symlinks', () => {
    const registry = createMockRegistry('.skills', [
      { path: '.claude/skills', mode: 'canonical' },
      { path: '.cursor/skills', mode: 'copy' },
    ])

    const result = getNonSymlinkTargets(registry)

    expect(result).toHaveLength(2)
    expect(result).toEqual(registry.targets)
  })

  it('should exclude symlink targets', () => {
    const registry = createMockRegistry('.skills', [
      { path: '.claude/skills', mode: 'canonical' },
      { path: '.github/skills', mode: 'symlink' },
      { path: '.cursor/skills', mode: 'copy' },
    ])

    const result = getNonSymlinkTargets(registry)

    expect(result).toHaveLength(2)
    expect(result).toEqual([
      { path: '.claude/skills', mode: 'canonical' },
      { path: '.cursor/skills', mode: 'copy' },
    ])
  })

  it('should return empty array when all targets are symlinks', () => {
    const registry = createMockRegistry('.skills', [
      { path: '.github/skills', mode: 'symlink' },
      { path: '.vscode/skills', mode: 'symlink' },
    ])

    const result = getNonSymlinkTargets(registry)

    expect(result).toHaveLength(0)
  })
})

describe('resolveLayoutPaths', () => {
  describe('source layout', () => {
    it('should return single source path', () => {
      const registry = createMockRegistry('.skills', [
        { path: '.claude/skills', mode: 'canonical' },
        { path: '.cursor/skills', mode: 'copy' },
      ])

      const result = resolveLayoutPaths({
        name: 'skills',
        registry,
        layout: 'source',
        baseDir: '/kb',
        fs: mockFs,
      })

      expect(result).toEqual(['/kb/.skills'])
    })

    it('should resolve source path relative to base directory', () => {
      const registry = createMockRegistry('custom/source', [
        { path: '.claude/skills', mode: 'canonical' },
      ])

      const result = resolveLayoutPaths({
        name: 'skills',
        registry,
        layout: 'source',
        baseDir: '/my/kb',
        fs: mockFs,
      })

      expect(result).toEqual(['/my/kb/custom/source'])
    })
  })

  describe('target layout', () => {
    it('should return multiple target paths excluding symlinks', () => {
      const registry = createMockRegistry('.skills', [
        { path: '.claude/skills', mode: 'canonical' },
        { path: '.github/skills', mode: 'symlink' },
        { path: '.cursor/skills', mode: 'copy' },
      ])

      const result = resolveLayoutPaths({
        name: 'skills',
        registry,
        layout: 'target',
        baseDir: '/kb',
        fs: mockFs,
      })

      expect(result).toHaveLength(2)
      expect(result).toEqual(['/kb/.claude/skills', '/kb/.cursor/skills'])
    })

    it('should return empty array when all targets are symlinks', () => {
      const registry = createMockRegistry('.skills', [{ path: '.github/skills', mode: 'symlink' }])

      const result = resolveLayoutPaths({
        name: 'skills',
        registry,
        layout: 'target',
        baseDir: '/kb',
        fs: mockFs,
      })

      expect(result).toHaveLength(0)
    })

    it('should resolve target paths relative to base directory', () => {
      const registry = createMockRegistry('.skills', [
        { path: '.claude/skills', mode: 'canonical' },
      ])

      const result = resolveLayoutPaths({
        name: 'skills',
        registry,
        layout: 'target',
        baseDir: '/my/kb',
        fs: mockFs,
      })

      expect(result).toEqual(['/my/kb/.claude/skills'])
    })
  })
})

describe('applyPrefixFlatten', () => {
  it('should return original name when no prefix', () => {
    const result = applyPrefixFlatten('bootstrap', undefined, false)
    expect(result).toBe('bootstrap')
  })

  it('should apply prefix with hyphen when flatten is true', () => {
    const result = applyPrefixFlatten('bootstrap', 'pair', true)
    expect(result).toBe('pair-bootstrap')
  })

  it('should return original name when flatten is false', () => {
    const result = applyPrefixFlatten('bootstrap', 'pair', false)
    expect(result).toBe('bootstrap')
  })

  it('should handle multi-word names with prefix and flatten', () => {
    const result = applyPrefixFlatten('process-implement', 'pair-capability', true)
    expect(result).toBe('pair-capability-process-implement')
  })
})

describe('validateSkipList', () => {
  it('should return empty array when all skip list entries are valid', () => {
    const registries = {
      skills: createMockRegistry('.skills', [{ path: '.claude/skills', mode: 'canonical' }]),
      adoption: createMockRegistry('.pair/adoption', [
        { path: '.pair/adoption', mode: 'canonical' },
      ]),
    }

    const result = validateSkipList(registries, ['skills', 'adoption'])

    expect(result).toEqual([])
  })

  it('should return invalid registry names', () => {
    const registries = {
      skills: createMockRegistry('.skills', [{ path: '.claude/skills', mode: 'canonical' }]),
    }

    const result = validateSkipList(registries, ['skills', 'invalid', 'missing'])

    expect(result).toEqual(['invalid', 'missing'])
  })

  it('should return empty array for empty skip list', () => {
    const registries = {
      skills: createMockRegistry('.skills', [{ path: '.claude/skills', mode: 'canonical' }]),
    }

    const result = validateSkipList(registries, [])

    expect(result).toEqual([])
  })
})

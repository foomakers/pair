import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import type { TargetConfig, FileSystemService } from '@pair/content-ops'
import type { RegistryConfig } from './resolver'
import {
  filterRegistries,
  getNonSymlinkTargets,
  resolveLayoutPaths,
  applyPrefixFlatten,
  validateSkipList,
  collectLayoutFiles,
  transformSourceToTarget,
  transformTargetToSource,
  validateLayoutOption,
  parseSkipRegistriesOption,
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

describe('collectLayoutFiles', () => {
  it('should collect files from source layout', async () => {
    const mockFsWithFiles: FileSystemService = {
      ...mockFs,
      exists: async (path: string) => path === '/kb/.skills',
      readdir: async () =>
        [{ name: 'bootstrap.md' }, { name: 'implement.md' }] as unknown as fs.Dirent[],
    } as FileSystemService

    const registry = createMockRegistry('.skills', [{ path: '.claude/skills', mode: 'canonical' }])

    const result = await collectLayoutFiles({
      registry,
      layout: 'source',
      baseDir: '/kb',
      fs: mockFsWithFiles,
    })

    expect(result).toEqual(['/kb/.skills/bootstrap.md', '/kb/.skills/implement.md'])
  })

  it('should collect files from target layout', async () => {
    const mockFsWithFiles: FileSystemService = {
      ...mockFs,
      exists: async (path: string) => ['/kb/.claude/skills', '/kb/.cursor/skills'].includes(path),
      readdir: async (path: string) =>
        (path === '/kb/.claude/skills'
          ? [{ name: 'bootstrap.md' }]
          : [{ name: 'implement.md' }]) as unknown as fs.Dirent[],
    } as FileSystemService

    const registry = createMockRegistry('.skills', [
      { path: '.claude/skills', mode: 'canonical' },
      { path: '.cursor/skills', mode: 'copy' },
    ])

    const result = await collectLayoutFiles({
      registry,
      layout: 'target',
      baseDir: '/kb',
      fs: mockFsWithFiles,
    })

    expect(result).toEqual(['/kb/.claude/skills/bootstrap.md', '/kb/.cursor/skills/implement.md'])
  })

  it('should return empty array when directory does not exist', async () => {
    const mockFsEmpty: FileSystemService = {
      ...mockFs,
      exists: async () => false,
    } as FileSystemService

    const registry = createMockRegistry('.skills', [{ path: '.claude/skills', mode: 'canonical' }])

    const result = await collectLayoutFiles({
      registry,
      layout: 'source',
      baseDir: '/kb',
      fs: mockFsEmpty,
    })

    expect(result).toEqual([])
  })

  it('should handle empty directory', async () => {
    const mockFsEmpty: FileSystemService = {
      ...mockFs,
      exists: async () => true,
      readdir: async () => [] as unknown as fs.Dirent[],
    } as FileSystemService

    const registry = createMockRegistry('.skills', [{ path: '.claude/skills', mode: 'canonical' }])

    const result = await collectLayoutFiles({
      registry,
      layout: 'source',
      baseDir: '/kb',
      fs: mockFsEmpty,
    })

    expect(result).toEqual([])
  })

  it('should collect files with various extensions', async () => {
    const mockFsWithFiles: FileSystemService = {
      ...mockFs,
      exists: async () => true,
      readdir: async () =>
        [
          { name: 'skill.md' },
          { name: 'config.json' },
          { name: 'data.yaml' },
          { name: 'script.ts' },
        ] as unknown as fs.Dirent[],
    } as FileSystemService

    const registry = createMockRegistry('.skills', [{ path: '.claude/skills', mode: 'canonical' }])

    const result = await collectLayoutFiles({
      registry,
      layout: 'source',
      baseDir: '/kb',
      fs: mockFsWithFiles,
    })

    expect(result).toEqual([
      '/kb/.skills/skill.md',
      '/kb/.skills/config.json',
      '/kb/.skills/data.yaml',
      '/kb/.skills/script.ts',
    ])
  })

  it('should skip non-existent target directories', async () => {
    const mockFsPartial: FileSystemService = {
      ...mockFs,
      exists: async (path: string) => path === '/kb/.claude/skills',
      readdir: async () => [{ name: 'bootstrap.md' }] as unknown as fs.Dirent[],
    } as FileSystemService

    const registry = createMockRegistry('.skills', [
      { path: '.claude/skills', mode: 'canonical' },
      { path: '.cursor/skills', mode: 'copy' },
    ])

    const result = await collectLayoutFiles({
      registry,
      layout: 'target',
      baseDir: '/kb',
      fs: mockFsPartial,
    })

    expect(result).toEqual(['/kb/.claude/skills/bootstrap.md'])
  })

  it('should exclude symlink targets in target layout', async () => {
    const mockFsWithFiles: FileSystemService = {
      ...mockFs,
      exists: async () => true,
      readdir: async () => [{ name: 'bootstrap.md' }] as unknown as fs.Dirent[],
    } as FileSystemService

    const registry = createMockRegistry('.skills', [
      { path: '.claude/skills', mode: 'canonical' },
      { path: '.github/skills', mode: 'symlink' },
    ])

    const result = await collectLayoutFiles({
      registry,
      layout: 'target',
      baseDir: '/kb',
      fs: mockFsWithFiles,
    })

    expect(result).toEqual(['/kb/.claude/skills/bootstrap.md'])
  })
})

describe('transformSourceToTarget', () => {
  it('should transform source path to single target without prefix/flatten', () => {
    const registry = createMockRegistry('.skills', [{ path: '.claude/skills', mode: 'canonical' }])

    const result = transformSourceToTarget({
      sourcePath: '/kb/.skills/bootstrap.md',
      registry,
      baseDir: '/kb',
      fs: mockFs,
    })

    expect(result).toEqual(['/kb/.claude/skills/bootstrap.md'])
  })

  it('should transform source path to multiple targets', () => {
    const registry = createMockRegistry('.skills', [
      { path: '.claude/skills', mode: 'canonical' },
      { path: '.cursor/skills', mode: 'copy' },
    ])

    const result = transformSourceToTarget({
      sourcePath: '/kb/.skills/bootstrap.md',
      registry,
      baseDir: '/kb',
      fs: mockFs,
    })

    expect(result).toEqual(['/kb/.claude/skills/bootstrap.md', '/kb/.cursor/skills/bootstrap.md'])
  })

  it('should apply prefix and flatten when configured', () => {
    const registry = createMockRegistry(
      '.skills',
      [{ path: '.claude/skills', mode: 'canonical' }],
      { prefix: 'pair', flatten: true },
    )

    const result = transformSourceToTarget({
      sourcePath: '/kb/.skills/bootstrap.md',
      registry,
      baseDir: '/kb',
      fs: mockFs,
    })

    expect(result).toEqual(['/kb/.claude/skills/pair-bootstrap.md'])
  })

  it('should exclude symlink targets', () => {
    const registry = createMockRegistry('.skills', [
      { path: '.claude/skills', mode: 'canonical' },
      { path: '.github/skills', mode: 'symlink' },
    ])

    const result = transformSourceToTarget({
      sourcePath: '/kb/.skills/bootstrap.md',
      registry,
      baseDir: '/kb',
      fs: mockFs,
    })

    expect(result).toEqual(['/kb/.claude/skills/bootstrap.md'])
  })

  it('should handle files without extension', () => {
    const registry = createMockRegistry('.skills', [{ path: '.claude/skills', mode: 'canonical' }])

    const result = transformSourceToTarget({
      sourcePath: '/kb/.skills/README',
      registry,
      baseDir: '/kb',
      fs: mockFs,
    })

    expect(result).toEqual(['/kb/.claude/skills/README'])
  })

  it('should handle files with multiple dots', () => {
    const registry = createMockRegistry(
      '.skills',
      [{ path: '.claude/skills', mode: 'canonical' }],
      { prefix: 'pair', flatten: true },
    )

    const result = transformSourceToTarget({
      sourcePath: '/kb/.skills/config.test.ts',
      registry,
      baseDir: '/kb',
      fs: mockFs,
    })

    expect(result).toEqual(['/kb/.claude/skills/pair-config.test.ts'])
  })

  it('should handle prefix without flatten', () => {
    const registry = createMockRegistry(
      '.skills',
      [{ path: '.claude/skills', mode: 'canonical' }],
      { prefix: 'pair', flatten: false },
    )

    const result = transformSourceToTarget({
      sourcePath: '/kb/.skills/bootstrap.md',
      registry,
      baseDir: '/kb',
      fs: mockFs,
    })

    expect(result).toEqual(['/kb/.claude/skills/bootstrap.md'])
  })

  it('should handle flatten without prefix', () => {
    const registry = createMockRegistry(
      '.skills',
      [{ path: '.claude/skills', mode: 'canonical' }],
      { flatten: true },
    )

    const result = transformSourceToTarget({
      sourcePath: '/kb/.skills/bootstrap.md',
      registry,
      baseDir: '/kb',
      fs: mockFs,
    })

    expect(result).toEqual(['/kb/.claude/skills/bootstrap.md'])
  })

  it('should handle multi-part prefix with flatten', () => {
    const registry = createMockRegistry(
      '.skills',
      [{ path: '.claude/skills', mode: 'canonical' }],
      { prefix: 'pair-capability', flatten: true },
    )

    const result = transformSourceToTarget({
      sourcePath: '/kb/.skills/verify-quality.md',
      registry,
      baseDir: '/kb',
      fs: mockFs,
    })

    expect(result).toEqual(['/kb/.claude/skills/pair-capability-verify-quality.md'])
  })

  it('should handle name already containing hyphen with prefix', () => {
    const registry = createMockRegistry(
      '.skills',
      [{ path: '.claude/skills', mode: 'canonical' }],
      { prefix: 'pair', flatten: true },
    )

    const result = transformSourceToTarget({
      sourcePath: '/kb/.skills/process-implement.md',
      registry,
      baseDir: '/kb',
      fs: mockFs,
    })

    expect(result).toEqual(['/kb/.claude/skills/pair-process-implement.md'])
  })

  it('should return empty array when all targets are symlinks', () => {
    const registry = createMockRegistry('.skills', [
      { path: '.github/skills', mode: 'symlink' },
      { path: '.vscode/skills', mode: 'symlink' },
    ])

    const result = transformSourceToTarget({
      sourcePath: '/kb/.skills/bootstrap.md',
      registry,
      baseDir: '/kb',
      fs: mockFs,
    })

    expect(result).toEqual([])
  })

  it('should handle file with no name part (edge case)', () => {
    const registry = createMockRegistry('.skills', [{ path: '.claude/skills', mode: 'canonical' }])

    const result = transformSourceToTarget({
      sourcePath: '/kb/.skills/.hidden',
      registry,
      baseDir: '/kb',
      fs: mockFs,
    })

    expect(result).toEqual(['/kb/.claude/skills/.hidden'])
  })
})

describe('transformTargetToSource', () => {
  it('should transform target path to source without prefix/flatten', () => {
    const registry = createMockRegistry('.skills', [{ path: '.claude/skills', mode: 'canonical' }])

    const result = transformTargetToSource({
      targetPath: '/kb/.claude/skills/bootstrap.md',
      registry,
      baseDir: '/kb',
      fs: mockFs,
    })

    expect(result).toBe('/kb/.skills/bootstrap.md')
  })

  it('should remove prefix when flatten is enabled', () => {
    const registry = createMockRegistry(
      '.skills',
      [{ path: '.claude/skills', mode: 'canonical' }],
      { prefix: 'pair', flatten: true },
    )

    const result = transformTargetToSource({
      targetPath: '/kb/.claude/skills/pair-bootstrap.md',
      registry,
      baseDir: '/kb',
      fs: mockFs,
    })

    expect(result).toBe('/kb/.skills/bootstrap.md')
  })

  it('should handle target from different target path', () => {
    const registry = createMockRegistry('.skills', [
      { path: '.claude/skills', mode: 'canonical' },
      { path: '.cursor/skills', mode: 'copy' },
    ])

    const result = transformTargetToSource({
      targetPath: '/kb/.cursor/skills/bootstrap.md',
      registry,
      baseDir: '/kb',
      fs: mockFs,
    })

    expect(result).toBe('/kb/.skills/bootstrap.md')
  })

  it('should return null for target path not matching any registry target', () => {
    const registry = createMockRegistry('.skills', [{ path: '.claude/skills', mode: 'canonical' }])

    const result = transformTargetToSource({
      targetPath: '/kb/.other/skills/bootstrap.md',
      registry,
      baseDir: '/kb',
      fs: mockFs,
    })

    expect(result).toBeNull()
  })

  it('should handle files without extension', () => {
    const registry = createMockRegistry(
      '.skills',
      [{ path: '.claude/skills', mode: 'canonical' }],
      { prefix: 'pair', flatten: true },
    )

    const result = transformTargetToSource({
      targetPath: '/kb/.claude/skills/pair-README',
      registry,
      baseDir: '/kb',
      fs: mockFs,
    })

    expect(result).toBe('/kb/.skills/README')
  })

  it('should handle files with multiple dots', () => {
    const registry = createMockRegistry(
      '.skills',
      [{ path: '.claude/skills', mode: 'canonical' }],
      { prefix: 'pair', flatten: true },
    )

    const result = transformTargetToSource({
      targetPath: '/kb/.claude/skills/pair-config.test.ts',
      registry,
      baseDir: '/kb',
      fs: mockFs,
    })

    expect(result).toBe('/kb/.skills/config.test.ts')
  })

  it('should preserve name when flatten is false', () => {
    const registry = createMockRegistry(
      '.skills',
      [{ path: '.claude/skills', mode: 'canonical' }],
      { prefix: 'pair', flatten: false },
    )

    const result = transformTargetToSource({
      targetPath: '/kb/.claude/skills/bootstrap.md',
      registry,
      baseDir: '/kb',
      fs: mockFs,
    })

    expect(result).toBe('/kb/.skills/bootstrap.md')
  })

  it('should not remove prefix when flatten is disabled', () => {
    const registry = createMockRegistry(
      '.skills',
      [{ path: '.claude/skills', mode: 'canonical' }],
      { prefix: 'pair', flatten: false },
    )

    const result = transformTargetToSource({
      targetPath: '/kb/.claude/skills/pair-bootstrap.md',
      registry,
      baseDir: '/kb',
      fs: mockFs,
    })

    expect(result).toBe('/kb/.skills/pair-bootstrap.md')
  })

  it('should handle multi-part prefix removal', () => {
    const registry = createMockRegistry(
      '.skills',
      [{ path: '.claude/skills', mode: 'canonical' }],
      { prefix: 'pair-capability', flatten: true },
    )

    const result = transformTargetToSource({
      targetPath: '/kb/.claude/skills/pair-capability-verify-quality.md',
      registry,
      baseDir: '/kb',
      fs: mockFs,
    })

    expect(result).toBe('/kb/.skills/verify-quality.md')
  })

  it('should handle name with hyphen after prefix removal', () => {
    const registry = createMockRegistry(
      '.skills',
      [{ path: '.claude/skills', mode: 'canonical' }],
      { prefix: 'pair', flatten: true },
    )

    const result = transformTargetToSource({
      targetPath: '/kb/.claude/skills/pair-process-implement.md',
      registry,
      baseDir: '/kb',
      fs: mockFs,
    })

    expect(result).toBe('/kb/.skills/process-implement.md')
  })

  it('should handle name without prefix even when prefix configured', () => {
    const registry = createMockRegistry(
      '.skills',
      [{ path: '.claude/skills', mode: 'canonical' }],
      { prefix: 'pair', flatten: true },
    )

    const result = transformTargetToSource({
      targetPath: '/kb/.claude/skills/bootstrap.md',
      registry,
      baseDir: '/kb',
      fs: mockFs,
    })

    expect(result).toBe('/kb/.skills/bootstrap.md')
  })

  it('should handle prefix as part of name (not prefix match)', () => {
    const registry = createMockRegistry(
      '.skills',
      [{ path: '.claude/skills', mode: 'canonical' }],
      { prefix: 'test', flatten: true },
    )

    const result = transformTargetToSource({
      targetPath: '/kb/.claude/skills/testing-guide.md',
      registry,
      baseDir: '/kb',
      fs: mockFs,
    })

    expect(result).toBe('/kb/.skills/testing-guide.md')
  })

  it('should return null for symlink target path', () => {
    const registry = createMockRegistry('.skills', [
      { path: '.claude/skills', mode: 'canonical' },
      { path: '.github/skills', mode: 'symlink' },
    ])

    const result = transformTargetToSource({
      targetPath: '/kb/.github/skills/bootstrap.md',
      registry,
      baseDir: '/kb',
      fs: mockFs,
    })

    expect(result).toBeNull()
  })

  it('should handle file with no name part (edge case)', () => {
    const registry = createMockRegistry(
      '.skills',
      [{ path: '.claude/skills', mode: 'canonical' }],
      { prefix: 'pair', flatten: true },
    )

    const result = transformTargetToSource({
      targetPath: '/kb/.claude/skills/.hidden',
      registry,
      baseDir: '/kb',
      fs: mockFs,
    })

    expect(result).toBe('/kb/.skills/.hidden')
  })

  it('should return null for partial path match', () => {
    const registry = createMockRegistry('.skills', [{ path: '.claude/skills', mode: 'canonical' }])

    const result = transformTargetToSource({
      targetPath: '/kb/.claude/skill/bootstrap.md',
      registry,
      baseDir: '/kb',
      fs: mockFs,
    })

    expect(result).toBeNull()
  })

  it('should handle empty registry targets', () => {
    const registry = createMockRegistry('.skills', [])

    const result = transformTargetToSource({
      targetPath: '/kb/.claude/skills/bootstrap.md',
      registry,
      baseDir: '/kb',
      fs: mockFs,
    })

    expect(result).toBeNull()
  })
})

describe('validateLayoutOption', () => {
  it('should return undefined when layout is undefined', () => {
    expect(validateLayoutOption(undefined)).toBeUndefined()
  })

  it('should return source when layout is source', () => {
    expect(validateLayoutOption('source')).toBe('source')
  })

  it('should return target when layout is target', () => {
    expect(validateLayoutOption('target')).toBe('target')
  })

  it('should throw on invalid layout value', () => {
    expect(() => validateLayoutOption('invalid')).toThrow("Invalid layout 'invalid'")
  })
})

describe('parseSkipRegistriesOption', () => {
  it('should return undefined when input is undefined', () => {
    expect(parseSkipRegistriesOption(undefined)).toBeUndefined()
  })

  it('should parse comma-separated values', () => {
    expect(parseSkipRegistriesOption('skills,adoption')).toEqual(['skills', 'adoption'])
  })

  it('should filter out empty strings', () => {
    expect(parseSkipRegistriesOption('skills,,adoption,')).toEqual(['skills', 'adoption'])
  })

  it('should return empty array for empty string', () => {
    expect(parseSkipRegistriesOption('')).toEqual([])
  })

  it('should handle single value', () => {
    expect(parseSkipRegistriesOption('skills')).toEqual(['skills'])
  })
})

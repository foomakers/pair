import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import type { TargetConfig, FileSystemService } from '@pair/content-ops'
import type { RegistryConfig } from './resolver'
import {
  collectLayoutFiles,
  transformSourceToTarget,
  transformTargetToSource,
  validateLayoutOption,
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

describe('collectLayoutFiles', () => {
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
})

describe('validateLayoutOption', () => {
  it('should return target when layout is target', () => {
    expect(validateLayoutOption('target')).toBe('target')
  })

  it('should throw on invalid layout value', () => {
    expect(() => validateLayoutOption('invalid')).toThrow("Invalid layout 'invalid'")
  })
})

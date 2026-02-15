import { describe, it, expect, beforeEach } from 'vitest'
import type { FileSystemService } from '@pair/content-ops'
import InMemoryFileSystemService from '@pair/content-ops/test-utils/in-memory-fs'
import type { RegistryConfig } from '../../registry/resolver'
import { validateStructure } from './structure-validator'

// Test fixtures
const createMockRegistry = (
  source: string,
  targets: Array<{ path: string; mode: 'canonical' | 'symlink' | 'copy' }>,
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

describe('validateStructure', () => {
  let fs: FileSystemService

  beforeEach(() => {
    fs = new InMemoryFileSystemService({}, '/kb', '/kb')
  })

  describe('source layout validation', () => {
    it('should pass when source path exists and is non-empty', async () => {
      // Setup: create source directory with content
      fs.mkdir('/kb/.skills', { recursive: true })
      fs.writeFile('/kb/.skills/bootstrap.md', 'content')

      const registries = {
        skills: createMockRegistry('.skills', [{ path: '.claude/skills', mode: 'canonical' }]),
      }

      const result = await validateStructure({
        registries,
        layout: 'source',
        baseDir: '/kb',
        fs,
      })

      expect(result.valid).toBe(true)
      expect(result.registries).toHaveLength(1)
      expect(result.registries[0]?.registry).toBe('skills')
      expect(result.registries[0]?.valid).toBe(true)
      expect(result.registries[0]?.errors).toHaveLength(0)
    })

    it('should fail when source path does not exist', async () => {
      const registries = {
        skills: createMockRegistry('.skills', [{ path: '.claude/skills', mode: 'canonical' }]),
      }

      const result = await validateStructure({
        registries,
        layout: 'source',
        baseDir: '/kb',
        fs,
      })

      expect(result.valid).toBe(false)
      expect(result.registries[0]?.valid).toBe(false)
      expect(result.registries[0]?.errors).toHaveLength(1)
      expect(result.registries[0]?.errors[0]).toContain('does not exist')
      expect(result.registries[0]?.errors[0]).toContain('/kb/.skills')
    })

    it('should warn when source directory is empty', async () => {
      // Setup: create empty source directory
      fs.mkdir('/kb/.skills', { recursive: true })

      const registries = {
        skills: createMockRegistry('.skills', [{ path: '.claude/skills', mode: 'canonical' }]),
      }

      const result = await validateStructure({
        registries,
        layout: 'source',
        baseDir: '/kb',
        fs,
      })

      expect(result.valid).toBe(true)
      expect(result.registries[0]?.valid).toBe(true)
      expect(result.registries[0]?.errors).toHaveLength(0)
      expect(result.registries[0]?.warnings).toHaveLength(1)
      expect(result.registries[0]?.warnings[0]).toContain('empty')
    })

    it('should validate multiple registries', async () => {
      // Setup: create source directories
      fs.mkdir('/kb/.skills', { recursive: true })
      fs.writeFile('/kb/.skills/bootstrap.md', 'content')
      fs.mkdir('/kb/.pair/adoption', { recursive: true })
      fs.writeFile('/kb/.pair/adoption/tech-stack.md', 'content')

      const registries = {
        skills: createMockRegistry('.skills', [{ path: '.claude/skills', mode: 'canonical' }]),
        adoption: createMockRegistry('.pair/adoption', [
          { path: '.pair/adoption', mode: 'canonical' },
        ]),
      }

      const result = await validateStructure({
        registries,
        layout: 'source',
        baseDir: '/kb',
        fs,
      })

      expect(result.valid).toBe(true)
      expect(result.registries).toHaveLength(2)
      expect(result.registries[0]?.valid).toBe(true)
      expect(result.registries[1]?.valid).toBe(true)
    })
  })

  describe('target layout validation', () => {
    it('should validate non-symlink targets', async () => {
      // Setup: create canonical and copy targets
      fs.mkdir('/kb/.claude/skills', { recursive: true })
      fs.writeFile('/kb/.claude/skills/bootstrap.md', 'content')
      fs.mkdir('/kb/.cursor/skills', { recursive: true })
      fs.writeFile('/kb/.cursor/skills/bootstrap.md', 'content')

      const registries = {
        skills: createMockRegistry('.skills', [
          { path: '.claude/skills', mode: 'canonical' },
          { path: '.cursor/skills', mode: 'copy' },
        ]),
      }

      const result = await validateStructure({
        registries,
        layout: 'target',
        baseDir: '/kb',
        fs,
      })

      expect(result.valid).toBe(true)
      expect(result.registries[0]?.valid).toBe(true)
      expect(result.registries[0]?.errors).toHaveLength(0)
    })

    it('should skip symlink targets in validation', async () => {
      // Setup: create only canonical target (symlink should be skipped)
      fs.mkdir('/kb/.claude/skills', { recursive: true })
      fs.writeFile('/kb/.claude/skills/bootstrap.md', 'content')
      // Note: .github/skills (symlink) is NOT created

      const registries = {
        skills: createMockRegistry('.skills', [
          { path: '.claude/skills', mode: 'canonical' },
          { path: '.github/skills', mode: 'symlink' },
        ]),
      }

      const result = await validateStructure({
        registries,
        layout: 'target',
        baseDir: '/kb',
        fs,
      })

      // Should pass because symlink target is excluded from validation
      expect(result.valid).toBe(true)
      expect(result.registries[0]?.valid).toBe(true)
    })

    it('should fail when canonical target does not exist', async () => {
      const registries = {
        skills: createMockRegistry('.skills', [{ path: '.claude/skills', mode: 'canonical' }]),
      }

      const result = await validateStructure({
        registries,
        layout: 'target',
        baseDir: '/kb',
        fs,
      })

      expect(result.valid).toBe(false)
      expect(result.registries[0]?.valid).toBe(false)
      expect(result.registries[0]?.errors).toHaveLength(1)
      expect(result.registries[0]?.errors[0]).toContain('does not exist')
      expect(result.registries[0]?.errors[0]).toContain('.claude/skills')
    })

    it('should validate all non-symlink targets', async () => {
      // Setup: create canonical but not copy
      fs.mkdir('/kb/.claude/skills', { recursive: true })
      fs.writeFile('/kb/.claude/skills/bootstrap.md', 'content')
      // .cursor/skills (copy) not created - should fail

      const registries = {
        skills: createMockRegistry('.skills', [
          { path: '.claude/skills', mode: 'canonical' },
          { path: '.cursor/skills', mode: 'copy' },
        ]),
      }

      const result = await validateStructure({
        registries,
        layout: 'target',
        baseDir: '/kb',
        fs,
      })

      expect(result.valid).toBe(false)
      expect(result.registries[0]?.valid).toBe(false)
      expect(result.registries[0]?.errors).toHaveLength(1)
      expect(result.registries[0]?.errors[0]).toContain('.cursor/skills')
    })
  })

  describe('file validation', () => {
    it('should validate single file registry', async () => {
      fs.writeFile('/kb/AGENTS.md', '# Agents')

      const registries = {
        agents: createMockRegistry('AGENTS.md', [{ path: 'AGENTS.md', mode: 'canonical' }]),
      }

      const result = await validateStructure({
        registries,
        layout: 'source',
        baseDir: '/kb',
        fs,
      })

      expect(result.valid).toBe(true)
      expect(result.registries[0]?.valid).toBe(true)
    })

    it('should warn when file is empty', async () => {
      fs.writeFile('/kb/AGENTS.md', '')

      const registries = {
        agents: createMockRegistry('AGENTS.md', [{ path: 'AGENTS.md', mode: 'canonical' }]),
      }

      const result = await validateStructure({
        registries,
        layout: 'source',
        baseDir: '/kb',
        fs,
      })

      expect(result.valid).toBe(true)
      expect(result.registries[0]?.valid).toBe(true)
      expect(result.registries[0]?.warnings).toHaveLength(1)
      expect(result.registries[0]?.warnings[0]).toContain('empty')
    })
  })

  describe('mixed results', () => {
    it('should aggregate results from multiple registries', async () => {
      // Setup: skills valid, adoption missing
      fs.mkdir('/kb/.skills', { recursive: true })
      fs.writeFile('/kb/.skills/bootstrap.md', 'content')

      const registries = {
        skills: createMockRegistry('.skills', [{ path: '.claude/skills', mode: 'canonical' }]),
        adoption: createMockRegistry('.pair/adoption', [
          { path: '.pair/adoption', mode: 'canonical' },
        ]),
      }

      const result = await validateStructure({
        registries,
        layout: 'source',
        baseDir: '/kb',
        fs,
      })

      expect(result.valid).toBe(false)
      expect(result.registries).toHaveLength(2)
      expect(result.registries[0]?.registry).toBe('skills')
      expect(result.registries[0]?.valid).toBe(true)
      expect(result.registries[1]?.registry).toBe('adoption')
      expect(result.registries[1]?.valid).toBe(false)
    })
  })
})

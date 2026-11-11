import { describe, it, expect } from 'vitest'
import { parsePackageCommand } from './parser'

describe('parsePackageCommand', () => {
  it('creates config with source directory', () => {
    const config = parsePackageCommand({
      sourceDir: './kb-content',
    })

    expect(config.sourceDir).toBe('./kb-content')
  })

  it('creates config with metadata', () => {
    const config = parsePackageCommand({
      name: 'My KB',
      version: '1.0.0',
      description: 'Test KB',
      author: 'Test Author',
    })

    expect(config.name).toBe('My KB')
    expect(config.version).toBe('1.0.0')
    expect(config.description).toBe('Test KB')
    expect(config.author).toBe('Test Author')
  })

  it('throws when positional args provided', () => {
    expect(() => parsePackageCommand({}, ['pos'])).toThrow(
      "Command 'package' does not accept positional arguments: pos",
    )
  })

  describe('skip-registries flag', () => {
    it('should handle empty string', () => {
      const config = parsePackageCommand({ skipRegistries: '' })

      expect(config).toEqual({
        command: 'package',
        interactive: false,
        tags: [],
        license: 'MIT',
        skipRegistries: [],
      })
    })
  })

  describe('tags flag', () => {
    it('should filter empty tags', () => {
      const config = parsePackageCommand({ tags: 'ai,,testing,' })

      expect(config.tags).toEqual(['ai', 'testing'])
    })
  })

  describe('org flag', () => {
    it('should parse all org fields', () => {
      const config = parsePackageCommand({
        org: true,
        orgName: 'Acme Corp',
        team: 'Platform',
        department: 'Engineering',
        approver: 'jane.doe',
        compliance: 'SOC2,ISO27001',
        distribution: 'private',
      })

      expect(config.org).toBe(true)
      expect(config.orgName).toBe('Acme Corp')
      expect(config.team).toBe('Platform')
      expect(config.department).toBe('Engineering')
      expect(config.approver).toBe('jane.doe')
      expect(config.compliance).toEqual(['SOC2', 'ISO27001'])
      expect(config.distribution).toBe('private')
    })

    it('should throw on invalid distribution policy', () => {
      expect(() =>
        parsePackageCommand({ org: true, orgName: 'Acme', distribution: 'invalid' }),
      ).toThrow("Invalid distribution policy 'invalid'. Valid values: open, private, restricted")
    })
  })

  describe('combined flags', () => {
    it('should parse multiple new flags together', () => {
      const config = parsePackageCommand({
        layout: 'source',
        skipRegistries: 'adoption,skills',
        root: './kb',
        output: 'dist/kb.zip',
      })

      expect(config).toEqual({
        command: 'package',
        interactive: false,
        tags: [],
        license: 'MIT',
        layout: 'source',
        skipRegistries: ['adoption', 'skills'],
        root: './kb',
        output: 'dist/kb.zip',
      })
    })
  })
})

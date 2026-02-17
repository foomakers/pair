import { describe, it, expect } from 'vitest'
import { parsePackageCommand } from './parser'

describe('parsePackageCommand', () => {
  it('creates PackageCommandConfig with defaults', () => {
    const config = parsePackageCommand({})

    expect(config).toEqual({
      command: 'package',
      interactive: false,
      tags: [],
      license: 'MIT',
    })
  })

  it('creates config with output path', () => {
    const config = parsePackageCommand({
      output: 'dist/kb.zip',
    })

    expect(config.output).toBe('dist/kb.zip')
  })

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

  describe('layout flag', () => {
    it('should parse --layout source', () => {
      const config = parsePackageCommand({ layout: 'source' })

      expect(config).toEqual({
        command: 'package',
        interactive: false,
        tags: [],
        license: 'MIT',
        layout: 'source',
      })
    })

    it('should parse --layout target', () => {
      const config = parsePackageCommand({ layout: 'target' })

      expect(config).toEqual({
        command: 'package',
        interactive: false,
        tags: [],
        license: 'MIT',
        layout: 'target',
      })
    })

    it('should throw on invalid layout value', () => {
      expect(() => parsePackageCommand({ layout: 'invalid' })).toThrow(
        "Invalid layout 'invalid'. Must be 'source' or 'target'",
      )
    })
  })

  describe('skip-registries flag', () => {
    it('should parse comma-separated registry names', () => {
      const config = parsePackageCommand({ skipRegistries: 'adoption,agents' })

      expect(config).toEqual({
        command: 'package',
        interactive: false,
        tags: [],
        license: 'MIT',
        skipRegistries: ['adoption', 'agents'],
      })
    })

    it('should handle single registry', () => {
      const config = parsePackageCommand({ skipRegistries: 'skills' })

      expect(config).toEqual({
        command: 'package',
        interactive: false,
        tags: [],
        license: 'MIT',
        skipRegistries: ['skills'],
      })
    })

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

  describe('root flag', () => {
    it('should parse --root with absolute path', () => {
      const config = parsePackageCommand({ root: '/custom/kb' })

      expect(config).toEqual({
        command: 'package',
        interactive: false,
        tags: [],
        license: 'MIT',
        root: '/custom/kb',
      })
    })

    it('should parse --root with relative path', () => {
      const config = parsePackageCommand({ root: './my-kb' })

      expect(config).toEqual({
        command: 'package',
        interactive: false,
        tags: [],
        license: 'MIT',
        root: './my-kb',
      })
    })
  })

  describe('interactive flag', () => {
    it('should parse --interactive as boolean', () => {
      const config = parsePackageCommand({ interactive: true })

      expect(config.interactive).toBe(true)
    })

    it('defaults to false when not provided', () => {
      const config = parsePackageCommand({})

      expect(config.interactive).toBe(false)
    })
  })

  describe('tags flag', () => {
    it('should parse comma-separated tags', () => {
      const config = parsePackageCommand({ tags: 'ai,devops,testing' })

      expect(config.tags).toEqual(['ai', 'devops', 'testing'])
    })

    it('should trim whitespace from tags', () => {
      const config = parsePackageCommand({ tags: ' ai , devops , testing ' })

      expect(config.tags).toEqual(['ai', 'devops', 'testing'])
    })

    it('should filter empty tags', () => {
      const config = parsePackageCommand({ tags: 'ai,,testing,' })

      expect(config.tags).toEqual(['ai', 'testing'])
    })

    it('defaults to empty array when not provided', () => {
      const config = parsePackageCommand({})

      expect(config.tags).toEqual([])
    })
  })

  describe('license flag', () => {
    it('should parse --license', () => {
      const config = parsePackageCommand({ license: 'Apache-2.0' })

      expect(config.license).toBe('Apache-2.0')
    })

    it('defaults to MIT when not provided', () => {
      const config = parsePackageCommand({})

      expect(config.license).toBe('MIT')
    })
  })

  describe('org flag', () => {
    it('should parse --org as boolean', () => {
      const config = parsePackageCommand({ org: true, orgName: 'Acme' })

      expect(config.org).toBe(true)
      expect(config.orgName).toBe('Acme')
    })

    it('should not include org fields when --org is not set', () => {
      const config = parsePackageCommand({})

      expect(config.org).toBeUndefined()
      expect(config.orgName).toBeUndefined()
    })

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

    it('should parse compliance tags with whitespace', () => {
      const config = parsePackageCommand({
        org: true,
        orgName: 'Acme',
        compliance: ' SOC2 , HIPAA ',
      })

      expect(config.compliance).toEqual(['SOC2', 'HIPAA'])
    })

    it('should not set org fields when --org is false', () => {
      const config = parsePackageCommand({ orgName: 'Acme' })

      expect(config.org).toBeUndefined()
      expect(config.orgName).toBeUndefined()
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

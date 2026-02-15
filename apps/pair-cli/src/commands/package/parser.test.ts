import { describe, it, expect } from 'vitest'
import { parsePackageCommand } from './parser'

describe('parsePackageCommand', () => {
  it('creates PackageCommandConfig with defaults', () => {
    const config = parsePackageCommand({})

    expect(config).toEqual({
      command: 'package',
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
        layout: 'source',
      })
    })

    it('should parse --layout target', () => {
      const config = parsePackageCommand({ layout: 'target' })

      expect(config).toEqual({
        command: 'package',
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
        skipRegistries: ['adoption', 'agents'],
      })
    })

    it('should handle single registry', () => {
      const config = parsePackageCommand({ skipRegistries: 'skills' })

      expect(config).toEqual({
        command: 'package',
        skipRegistries: ['skills'],
      })
    })

    it('should handle empty string', () => {
      const config = parsePackageCommand({ skipRegistries: '' })

      expect(config).toEqual({
        command: 'package',
        skipRegistries: [],
      })
    })
  })

  describe('root flag', () => {
    it('should parse --root with absolute path', () => {
      const config = parsePackageCommand({ root: '/custom/kb' })

      expect(config).toEqual({
        command: 'package',
        root: '/custom/kb',
      })
    })

    it('should parse --root with relative path', () => {
      const config = parsePackageCommand({ root: './my-kb' })

      expect(config).toEqual({
        command: 'package',
        root: './my-kb',
      })
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
        layout: 'source',
        skipRegistries: ['adoption', 'skills'],
        root: './kb',
        output: 'dist/kb.zip',
      })
    })
  })
})

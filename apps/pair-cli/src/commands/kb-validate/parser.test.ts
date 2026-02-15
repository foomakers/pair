import { describe, it, expect } from 'vitest'
import { parseKbValidateCommand } from './parser'

describe('parseKbValidateCommand', () => {
  it('should parse command with no options', () => {
    const config = parseKbValidateCommand({})

    expect(config).toEqual({
      command: 'kb-validate',
    })
  })

  it('should parse command with path option', () => {
    const config = parseKbValidateCommand({ path: '/custom/kb' })

    expect(config).toEqual({
      command: 'kb-validate',
      path: '/custom/kb',
    })
  })

  it('should parse command with relative path', () => {
    const config = parseKbValidateCommand({ path: './my-kb' })

    expect(config).toEqual({
      command: 'kb-validate',
      path: './my-kb',
    })
  })

  it('should have correct discriminator', () => {
    const config = parseKbValidateCommand({})

    expect(config.command).toBe('kb-validate')
  })

  it('throws when positional args provided', () => {
    expect(() => parseKbValidateCommand({}, ['pos'])).toThrow(
      "Command 'kb-validate' does not accept positional arguments: pos",
    )
  })

  describe('layout flag', () => {
    it('should parse --layout source', () => {
      const config = parseKbValidateCommand({ layout: 'source' })

      expect(config).toEqual({
        command: 'kb-validate',
        layout: 'source',
      })
    })

    it('should parse --layout target', () => {
      const config = parseKbValidateCommand({ layout: 'target' })

      expect(config).toEqual({
        command: 'kb-validate',
        layout: 'target',
      })
    })

    it('should throw on invalid layout value', () => {
      expect(() => parseKbValidateCommand({ layout: 'invalid' })).toThrow(
        "Invalid layout 'invalid'. Must be 'source' or 'target'",
      )
    })
  })

  describe('strict flag', () => {
    it('should parse --strict', () => {
      const config = parseKbValidateCommand({ strict: true })

      expect(config).toEqual({
        command: 'kb-validate',
        strict: true,
      })
    })
  })

  describe('ignore-config flag', () => {
    it('should parse --ignore-config', () => {
      const config = parseKbValidateCommand({ ignoreConfig: true })

      expect(config).toEqual({
        command: 'kb-validate',
        ignoreConfig: true,
      })
    })
  })

  describe('skip-registries flag', () => {
    it('should parse comma-separated registry names', () => {
      const config = parseKbValidateCommand({ skipRegistries: 'adoption,agents' })

      expect(config).toEqual({
        command: 'kb-validate',
        skipRegistries: ['adoption', 'agents'],
      })
    })

    it('should handle single registry', () => {
      const config = parseKbValidateCommand({ skipRegistries: 'skills' })

      expect(config).toEqual({
        command: 'kb-validate',
        skipRegistries: ['skills'],
      })
    })

    it('should handle empty string', () => {
      const config = parseKbValidateCommand({ skipRegistries: '' })

      expect(config).toEqual({
        command: 'kb-validate',
        skipRegistries: [],
      })
    })
  })

  describe('combined flags', () => {
    it('should parse multiple flags together', () => {
      const config = parseKbValidateCommand({
        path: './kb',
        layout: 'source',
        strict: true,
        ignoreConfig: false,
        skipRegistries: 'adoption,skills',
      })

      expect(config).toEqual({
        command: 'kb-validate',
        path: './kb',
        layout: 'source',
        strict: true,
        ignoreConfig: false,
        skipRegistries: ['adoption', 'skills'],
      })
    })
  })
})

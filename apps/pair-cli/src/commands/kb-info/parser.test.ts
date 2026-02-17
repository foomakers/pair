import { describe, it, expect } from 'vitest'
import { parseKbInfoCommand } from './parser'

describe('parseKbInfoCommand', () => {
  it('parses package path from positional args', () => {
    const config = parseKbInfoCommand({}, ['my-kb.zip'])

    expect(config).toEqual({
      command: 'kb-info',
      packagePath: 'my-kb.zip',
      json: false,
    })
  })

  it('parses --json flag', () => {
    const config = parseKbInfoCommand({ json: true }, ['pkg.zip'])

    expect(config.json).toBe(true)
  })

  it('defaults json to false', () => {
    const config = parseKbInfoCommand({}, ['pkg.zip'])

    expect(config.json).toBe(false)
  })

  it('throws when no package path provided', () => {
    expect(() => parseKbInfoCommand({})).toThrow(
      'Package path is required. Usage: pair kb-info <package-path>',
    )
  })

  it('throws when args array is empty', () => {
    expect(() => parseKbInfoCommand({}, [])).toThrow('Package path is required')
  })
})

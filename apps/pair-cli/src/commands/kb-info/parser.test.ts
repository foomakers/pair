import { describe, it, expect } from 'vitest'
import { parseKbInfoCommand } from './parser'

describe('parseKbInfoCommand', () => {
  it('parses package path from positional args (package mode)', () => {
    const config = parseKbInfoCommand({}, ['my-kb.zip'])

    expect(config).toEqual({
      command: 'kb-info',
      mode: 'package',
      packagePath: 'my-kb.zip',
      json: false,
    })
  })

  it('parses --json flag in package mode', () => {
    const config = parseKbInfoCommand({ json: true }, ['pkg.zip'])

    expect(config.json).toBe(true)
  })

  it('defaults json to false in package mode', () => {
    const config = parseKbInfoCommand({}, ['pkg.zip'])

    expect(config.json).toBe(false)
  })

  it('enters version-check mode when no package path provided', () => {
    const config = parseKbInfoCommand({})

    expect(config).toEqual({
      command: 'kb-info',
      mode: 'version-check',
      json: false,
    })
  })

  it('enters version-check mode when args array is empty', () => {
    const config = parseKbInfoCommand({}, [])

    expect(config.mode).toBe('version-check')
  })

  it('parses --json flag in version-check mode', () => {
    const config = parseKbInfoCommand({ json: true })

    expect(config).toEqual({
      command: 'kb-info',
      mode: 'version-check',
      json: true,
    })
  })

  it('parses --source in version-check mode', () => {
    const config = parseKbInfoCommand({ source: '/local/kb' })

    expect(config).toEqual({
      command: 'kb-info',
      mode: 'version-check',
      json: false,
      source: '/local/kb',
    })
  })

  it('omits source from version-check config when not provided', () => {
    const config = parseKbInfoCommand({})

    expect(config).not.toHaveProperty('source')
  })
})

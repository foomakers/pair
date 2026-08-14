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

/**
 * US-395 review round 12: kb-info's registry probe resolves the dataset the same way
 * install does, so the version it reports must be the version the named source carries —
 * a program-level `--url` included, or `pair kb-info --url <mirror>` reports the official
 * KB's version while `pair install --url <mirror>` installs the mirror's.
 */
describe('US-395: the program-level --url names the source when --source does not', () => {
  it('uses --url as the version-check source', () => {
    const config = parseKbInfoCommand({ url: 'https://mirror.internal/kb.zip' })

    expect(config).toEqual({
      command: 'kb-info',
      mode: 'version-check',
      json: false,
      source: 'https://mirror.internal/kb.zip',
    })
  })

  it('lets an explicit --source outrank --url', () => {
    const config = parseKbInfoCommand({
      source: '/local/kb',
      url: 'https://mirror.internal/kb.zip',
    })

    expect(config).toHaveProperty('source', '/local/kb')
  })
})

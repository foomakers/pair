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
})

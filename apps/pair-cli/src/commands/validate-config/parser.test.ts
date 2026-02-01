import { describe, it, expect } from 'vitest'
import { parseValidateConfigCommand } from './parser'

describe('parseValidateConfigCommand', () => {
  it('creates ValidateConfigCommandConfig with defaults', () => {
    const config = parseValidateConfigCommand({})

    expect(config).toEqual({
      command: 'validate-config',
    })
  })

  it('creates config with custom config path', () => {
    const config = parseValidateConfigCommand({
      config: './custom-config.json',
    })

    expect(config.config).toBe('./custom-config.json')
  })

  it('throws when positional args provided', () => {
    expect(() => parseValidateConfigCommand({}, ['unexpected'])).toThrow(
      "Command 'validate-config' does not accept positional arguments: unexpected",
    )
  })
})

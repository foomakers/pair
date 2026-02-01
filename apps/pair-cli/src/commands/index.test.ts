import { describe, it, expect } from 'vitest'
import { commandRegistry } from './index'

describe('commandRegistry', () => {
  it('exports all expected commands with metadata and parsers', () => {
    const keys = Object.keys(commandRegistry)
    expect(keys).toEqual(
      expect.arrayContaining([
        'install',
        'update',
        'package',
        'update-link',
        'validate-config',
        'kb-validate',
      ]),
    )

    for (const key of keys) {
      const entry = (commandRegistry as any)[key]
      expect(typeof entry.parse).toBe('function')
      expect(typeof entry.handle).toBe('function')
      expect(typeof entry.metadata).toBe('object')
    }
  })
})

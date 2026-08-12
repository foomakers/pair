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
        'kb-verify',
        'kb-info',
      ]),
    )

    for (const key of keys) {
      const entry = commandRegistry[key as keyof typeof commandRegistry]
      expect(typeof entry.parse).toBe('function')
      expect(typeof entry.handle).toBe('function')
      expect(typeof entry.metadata).toBe('object')
    }
  })

  // A closed limitation left in `--help` tells users a delivered feature is broken:
  // `--source <zip>` is cached in its own source-keyed slot, never the official KB's
  // (foomakers/pair#395), so the ZIP form is equivalent to the git and path forms.
  it('no command help text still claims the #395 ZIP limitation', () => {
    for (const key of Object.keys(commandRegistry)) {
      const entry = commandRegistry[key as keyof typeof commandRegistry]
      const helpText = JSON.stringify(entry.metadata)
      expect(helpText).not.toMatch(/not yet equivalent/)
      expect(helpText).not.toMatch(/pair#395/)
    }
  })
})

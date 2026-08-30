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

  // US-449: the published bin is `pair-cli`; a bare `pair` is what no npm install ever
  // creates. The docs tree has `docs:staleness` to catch that drift, but the CLI's OWN
  // help text had no gate at all — which is how `run/metadata.ts` arrived (#451) carrying
  // `usage: 'pair run [options]'` and shipped wrong help while ts:check, lint, the full
  // test suite and docs:staleness all stayed green. This is that gate: every `usage` and
  // every `examples` entry in the registry names the real binary.
  it('every command names the published binary in usage and examples', () => {
    const offenders: string[] = []
    for (const key of Object.keys(commandRegistry)) {
      const { metadata } = commandRegistry[key as keyof typeof commandRegistry]
      const lines: { where: string; text: string }[] = [
        { where: `${key}.usage`, text: metadata.usage },
        ...metadata.examples.map((text, i) => ({ where: `${key}.examples[${i}]`, text })),
      ]
      for (const { where, text } of lines) {
        if (!text.startsWith('pair-cli ')) offenders.push(`${where}: ${text}`)
      }
    }
    expect(offenders).toEqual([])
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

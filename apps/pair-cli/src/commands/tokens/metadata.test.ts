import { describe, expect, it } from 'vitest'
import { tokensCommandMetadata } from './metadata'

describe('tokensCommandMetadata', () => {
  it('r1-g1-w4 the --baseline example names no repo-only path (the CLI ships to adopters)', () => {
    const example = tokensCommandMetadata.examples.find(e => e.includes('--baseline'))!
    expect(example).not.toMatch(/scripts\/|\.pair\/working/)
    expect(tokensCommandMetadata.examples.some(e => /--json\s*>/.test(e))).toBe(true)
  })

  it('documents that --baseline resolves against the current directory', () => {
    const opt = tokensCommandMetadata.options.find(o => o.flags.startsWith('--baseline'))!
    expect(opt.description).toMatch(/current directory/)
  })
})

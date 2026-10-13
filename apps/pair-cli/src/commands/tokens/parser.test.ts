import { describe, it, expect } from 'vitest'
import { parseTokensCommand } from './parser'

describe('parseTokensCommand', () => {
  it('defaults: cwd root, all areas, human output', () => {
    expect(parseTokensCommand()).toEqual({
      command: 'tokens',
      root: process.cwd(),
      json: false,
    })
  })

  it('takes root, area and json', () => {
    expect(parseTokensCommand({ root: '/r', area: 'adr', json: true })).toEqual({
      command: 'tokens',
      root: '/r',
      area: 'adr',
      json: true,
    })
  })

  it('rejects an unknown area, listing the valid ones', () => {
    expect(() => parseTokensCommand({ area: 'nope' })).toThrow(/templates.*agent-context/)
  })
})

describe('parseTokensCommand --baseline', () => {
  it('carries the baseline path', () => {
    expect(parseTokensCommand({ root: '/r', baseline: 'b.json' }).baseline).toBe('b.json')
  })
})

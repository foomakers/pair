import { describe, expect, it } from 'vitest'
import { checkChangeset } from './changeset-check'

describe('checkChangeset', () => {
  it('passes with a changeset in the diff', () => {
    expect(checkChangeset(['src/a.ts', '.changeset/366.md'], []).ok).toBe(true)
  })
  it('fails without a changeset', () => {
    const r = checkChangeset(['src/a.ts'], [])
    expect(r.ok).toBe(false)
    expect(r.message).toMatch(/no-changeset/)
  })
  it('passes without changeset when labelled no-changeset', () => {
    expect(checkChangeset(['src/a.ts'], ['no-changeset']).ok).toBe(true)
  })
  it('ignores config.json and README under .changeset', () => {
    expect(checkChangeset(['.changeset/config.json', '.changeset/README.md'], []).ok).toBe(false)
  })
  it('a removed changeset file (release commit) does not count: only added/modified paths are passed', () => {
    expect(checkChangeset([], []).ok).toBe(false)
  })
})

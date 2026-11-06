import { describe, it, expect } from 'vitest'
import { ENGINES } from './engines'

/** US-603 r0-1: the adapter no longer calls the live run pending, and names the recorded fixture. */

describe('codex-0.166-live fixture adapter note', () => {
  it('verified-against-not-pending', () => {
    expect(ENGINES.codex.verifiedAgainst).not.toMatch(/pending/i)
    expect(ENGINES.codex.verifiedAgainst).toContain('codex-0.166-live.jsonl')
  })
})

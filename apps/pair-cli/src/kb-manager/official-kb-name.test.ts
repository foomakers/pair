import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { join } from 'path'
import { OFFICIAL_KB_NAME } from './cache-slot-key'

/**
 * The name the official KB is PUBLISHED with (release script) and the name the CLI
 * EXPECTS to find in a cache slot (US-395 contamination detection) are two artifacts that
 * must agree byte-for-byte. If they drift, every official slot is classified contaminated:
 * warn + purge + full re-download on every command, forever, with a warning naming the
 * official KB as foreign.
 *
 * The CLI side is IMPORTED, not text-matched: a rewrite of the declaration (double quotes,
 * a `satisfies` clause, a move) must not turn this red. Text matching survives only for
 * the release script, which has no importable form.
 */
const REPO_ROOT = join(__dirname, '..', '..', '..', '..')

function releasePackagedName(): string {
  const script = readFileSync(
    join(REPO_ROOT, 'scripts/workflows/release/package-kb-dataset.sh'),
    'utf-8',
  )
  const matches = [...script.matchAll(/--name "([^"]+)"/g)]
  expect(matches.length, 'package-kb-dataset.sh must pass --name exactly once').toBe(1)
  return matches[0]![1]!
}

describe('official KB name — CLI constant vs. release script', () => {
  it('the CLI expects the name the release script publishes', () => {
    expect(OFFICIAL_KB_NAME).toBe(releasePackagedName())
  })

  it('is the documented name (a rename is a deliberate, two-sided change)', () => {
    expect(OFFICIAL_KB_NAME).toBe('knowledge-base')
  })
})

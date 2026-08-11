import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { join } from 'path'

/**
 * The name the official KB is PUBLISHED with (release script) and the name the CLI
 * EXPECTS to find in a cache slot (US-395 contamination detection) are two artifacts that
 * must agree byte-for-byte. If they drift, every official slot is classified contaminated:
 * warn + purge + full re-download on every command, forever, with a warning naming the
 * official KB as foreign.
 */
const REPO_ROOT = join(__dirname, '..', '..', '..', '..')

const CACHE_SLOT_KEY = readFileSync(
  join(REPO_ROOT, 'apps/pair-cli/src/kb-manager/cache-slot-key.ts'),
  'utf-8',
)
const PACKAGE_KB_DATASET = readFileSync(
  join(REPO_ROOT, 'scripts/workflows/release/package-kb-dataset.sh'),
  'utf-8',
)

function officialKBNameConstant(): string {
  const match = CACHE_SLOT_KEY.match(/export const OFFICIAL_KB_NAME = '([^']+)'/)
  expect(match, 'OFFICIAL_KB_NAME must be declared in cache-slot-key.ts').not.toBeNull()
  return match![1]!
}

function releasePackagedName(): string {
  const matches = [...PACKAGE_KB_DATASET.matchAll(/--name "([^"]+)"/g)]
  expect(matches.length, 'package-kb-dataset.sh must pass --name exactly once').toBe(1)
  return matches[0]![1]!
}

describe('official KB name — CLI constant vs. release script', () => {
  it('the CLI expects the name the release script publishes', () => {
    expect(officialKBNameConstant()).toBe(releasePackagedName())
  })

  it('is the documented name (a rename is a deliberate, two-sided change)', () => {
    expect(officialKBNameConstant()).toBe('knowledge-base')
  })
})

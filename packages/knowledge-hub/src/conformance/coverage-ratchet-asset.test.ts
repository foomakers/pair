import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, it, expect } from 'vitest'
import { compileRatchetAsset } from '../tools/build-ratchet-asset'

/**
 * ADR-023: the ratchet ships as a GENERATED KB asset, not as a CLI command.
 * One implementation lives in src/tools/coverage-baseline-ratchet.ts; the two
 * committed copies below are build outputs of that source. Editing either copy
 * by hand — or editing the source without regenerating — turns this red.
 */
const REPO_ROOT = join(__dirname, '../../../..')
const SOURCE = join(REPO_ROOT, 'packages/knowledge-hub/src/tools/coverage-baseline-ratchet.ts')
const TARGETS = [
  join(REPO_ROOT, 'packages/knowledge-hub/dataset/.pair/knowledge/assets/coverage-ratchet.cjs'),
  join(REPO_ROOT, '.pair/knowledge/assets/coverage-ratchet.cjs'),
]

describe('coverage-ratchet asset — generated, not hand-maintained (ADR-023)', () => {
  const expected = compileRatchetAsset(readFileSync(SOURCE, 'utf8'))

  it.each(TARGETS.map(t => [t, t.split('/').slice(-4).join('/')]))(
    'the shipped copy matches a fresh compile of the tested source — %s',
    (target, _label) => {
      const committed = readFileSync(target as string, 'utf8')
      expect(committed).toBe(expected)
    },
  )

  it('the generated header names the source and the regeneration command', () => {
    expect(expected).toContain('GENERATED FILE')
    expect(expected).toContain('src/tools/coverage-baseline-ratchet.ts')
    expect(expected).toContain('ratchet:asset')
  })
})

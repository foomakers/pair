import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, it, expect } from 'vitest'
import { compileRealignAsset } from '../tools/build-realign-asset'

/**
 * #419: the Phase-1 recipe ships as a GENERATED KB asset, not as prose the
 * agent re-derives. One implementation lives in src/tools/mirror-realign.ts;
 * the two committed copies below are build outputs of that source. Editing
 * either copy by hand — or editing the source without regenerating — turns
 * this red.
 */
const REPO_ROOT = join(__dirname, '../../../..')
const SOURCE = join(REPO_ROOT, 'packages/knowledge-hub/src/tools/mirror-realign.ts')
const TARGETS = [
  join(REPO_ROOT, 'packages/knowledge-hub/dataset/.pair/knowledge/assets/mirror-realign.cjs'),
  join(REPO_ROOT, '.pair/knowledge/assets/mirror-realign.cjs'),
]

describe('mirror-realign asset — generated, not hand-maintained (#419)', () => {
  const expected = compileRealignAsset(readFileSync(SOURCE, 'utf8'))

  it.each(TARGETS.map(t => [t, t.split('/').slice(-4).join('/')]))(
    'the shipped copy matches a fresh compile of the tested source — %s',
    (target, _label) => {
      const committed = readFileSync(target as string, 'utf8')
      expect(committed).toBe(expected)
    },
  )

  it('the generated header names the source and the regeneration command', () => {
    expect(expected).toContain('GENERATED FILE')
    expect(expected).toContain('src/tools/mirror-realign.ts')
    expect(expected).toContain('realign:asset')
  })
})

import { describe, it, expect } from 'vitest'
import { classifyEntry, stalenessOf, type CacheEntry } from './inventory'

const entry = (name: string, kind: CacheEntry['kind']): CacheEntry => ({
  path: `/cache/${name}`,
  name,
  kind,
  size: 0,
})

describe('classifyEntry — the name is the only evidence prune has', () => {
  it('recognises the official slot by its version shape', () => {
    expect(classifyEntry('0.4.3', true)).toBe('official')
    expect(classifyEntry('1.10.0', true)).toBe('official')
  })

  it('recognises an abandoned atomic stage and a backup, at either level', () => {
    expect(classifyEntry('0.4.3.tmp-4821-0', true)).toBe('stage')
    expect(classifyEntry('zip-8ae362dc47aa.tmp-991-2', false)).toBe('stage')
    expect(classifyEntry('0.4.3.bak', true)).toBe('backup')
  })

  it('recognises a pre-#395 git clone at the ROOT, not an external slot below', () => {
    expect(classifyEntry('git-a1b2c3d4', true)).toBe('legacy-git')
    // The same name under external/ is a CURRENT slot — pruning it would delete a source
    // the user still installs from.
    expect(classifyEntry('git-a1b2c3d4', false)).toBe('external')
  })

  it('never classifies the external CONTAINER as an entry', () => {
    expect(classifyEntry('external', true)).toBe('unknown')
  })

  it('leaves anything unrecognised as unknown', () => {
    expect(classifyEntry('something-a-user-put-here', true)).toBe('unknown')
  })
})

describe('stalenessOf — what prune may delete', () => {
  const CURRENT = '0.4.3'

  it('spares the official slot of the running CLI version', () => {
    expect(stalenessOf(entry('0.4.3', 'official'), CURRENT)).toBeUndefined()
  })

  it('prunes an official slot of any other version', () => {
    expect(stalenessOf(entry('0.3.9', 'official'), CURRENT)).toMatch(/official KB for CLI 0\.3\.9/)
  })

  it('prunes stages, backups and pre-#395 clones', () => {
    expect(stalenessOf(entry('0.4.3.tmp-1-0', 'stage'), CURRENT)).toMatch(/abandoned/)
    expect(stalenessOf(entry('0.4.3.bak', 'backup'), CURRENT)).toMatch(/backup/)
    expect(stalenessOf(entry('git-abc', 'legacy-git'), CURRENT)).toMatch(/pre-#395/)
  })

  // The load-bearing negative: an external slot is one source the user chose to install
  // from. Nothing in the cache can tell whether they still want it, so prune must not guess.
  it('NEVER prunes an external slot', () => {
    for (const n of ['zip-8ae362dc47aa', 'git-a1b2c3d4', 'url-acme-kb-99887766'])
      expect(stalenessOf(entry(n, 'external'), CURRENT), `${n} must survive`).toBeUndefined()
  })

  it('never prunes an unknown entry', () => {
    expect(stalenessOf(entry('mystery', 'unknown'), CURRENT)).toBeUndefined()
  })
})

/**
 * US-395 round 18 — the cache is machine-wide, so `prune` runs while another project's
 * install may be halfway through the same directory. `cache-manager.sweepOrphanedStages`
 * already refuses to touch a stage whose pid is alive, for exactly that reason; prune had
 * no such check and would `rm -rf` a live extraction mid-flight, and with it the `.bak`
 * that is the interrupted install's ONLY way back — the loss the PR's own invariant
 * ("never deletes what it cannot refetch") forbids.
 */
describe('stalenessOf — an install in flight owns its stage and its backup', () => {
  const CURRENT = '0.4.3'

  it('spares a stage whose owning process is still alive', () => {
    expect(
      stalenessOf({ ...entry('0.4.3.tmp-1-0', 'stage'), inFlight: true }, CURRENT),
    ).toBeUndefined()
  })

  it('spares a backup with no sibling slot — it is the only copy of that KB', () => {
    expect(
      stalenessOf({ ...entry('0.4.3.bak', 'backup'), inFlight: true }, CURRENT),
    ).toBeUndefined()
  })

  it('still prunes a stage and a backup that no live install owns', () => {
    expect(stalenessOf({ ...entry('0.4.3.tmp-1-0', 'stage'), inFlight: false }, CURRENT)).toMatch(
      /abandoned/,
    )
    expect(stalenessOf({ ...entry('0.4.3.bak', 'backup'), inFlight: false }, CURRENT)).toMatch(
      /backup/,
    )
  })
})

describe('stalenessOf — fail-safe when the current version is unknown', () => {
  // The dispatcher passes `opts.cliVersion ?? ''`. Comparing names against '' would make
  // EVERY official slot prunable, the running CLI's included — a cleanup command that
  // deletes the KB about to be used.
  it('spares every official slot when no current version is known', () => {
    for (const v of ['0.4.3', '0.3.9', '1.0.0'])
      expect(stalenessOf(entry(v, 'official'), ''), `${v} must survive`).toBeUndefined()
  })

  it('still prunes stages and backups without a version — they are stale by shape', () => {
    expect(stalenessOf(entry('0.4.3.tmp-1-0', 'stage'), '')).toMatch(/abandoned/)
    expect(stalenessOf(entry('0.4.3.bak', 'backup'), '')).toMatch(/backup/)
  })
})

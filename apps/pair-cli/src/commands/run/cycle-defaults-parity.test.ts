import { describe, it, expect } from 'vitest'
import { existsSync } from 'fs'
import { join } from 'path'
import { pathToFileURL } from 'url'
import { CYCLE_WORKTREE_ROOT_DEFAULT, CYCLE_DISPATCH_CAP_DEFAULT } from './cycle-scripts'

/**
 * CROSS-IMPLEMENTATION PARITY — review finding r0-4 (US-487).
 *
 * AC10's transparency block must print the worktree root and the dispatch cap BEFORE `resolve()`
 * has a run directory to read a live `caps` value from, so `cycle-scripts.ts` mirrors two literals
 * from `cycle-state.mjs` by hand. Nothing tied them together: a change on the skill's side would
 * leave this driver printing a number the real dispatch no longer uses — and the one line whose
 * entire job is to tell the operator the truth would be the line lying to them.
 *
 * This repository has already been bitten by exactly this class of drift (the byte-identical copies
 * of `cycle-state.mjs`, the mirror gates, the custody scanner's own trailer bug), so the invariant
 * gets a test rather than a comment. `cycle-state.mjs` guards its CLI behind `isMain()`, so importing
 * it here runs no command; the values below are the ones the real dispatch reads.
 *
 * Follows `tier-parity.test.ts`'s precedent: assert against the OTHER implementation's own source,
 * never against a second copy of the expected value.
 */

// apps/pair-cli/src/commands/run -> repo root
const REPO_ROOT = join(__dirname, '..', '..', '..', '..', '..')
const CYCLE_STATE = join(REPO_ROOT, '.claude/skills/pair-workflow-cycle/scripts/cycle-state.mjs')

interface CycleStateModule {
  readonly CAPS: { readonly dispatchesPerStory: number }
  readonly PIPELINE_DEFAULTS: { readonly worktreeRoot: string }
}

describe('cycle defaults parity with pair-workflow-cycle (r0-4)', () => {
  it('the transparency block prints the SAME defaults the real dispatch reads', async () => {
    // ASSERTED, not assumed: a moved or renamed skill path would otherwise fail as an obscure
    // import error, whose natural reading is "the test is broken" rather than "the source moved".
    expect(existsSync(CYCLE_STATE), `cycle-state.mjs not found at ${CYCLE_STATE}`).toBe(true)

    const cycleState = (await import(pathToFileURL(CYCLE_STATE).href)) as CycleStateModule

    expect(CYCLE_WORKTREE_ROOT_DEFAULT).toBe(cycleState.PIPELINE_DEFAULTS.worktreeRoot)
    expect(CYCLE_DISPATCH_CAP_DEFAULT).toBe(cycleState.CAPS.dispatchesPerStory)
  })
})

import { describe, it, expect } from 'vitest'
import { isDorFallbackReason } from './handler'
import type { AutomationPolicy } from './automation-policy'

/**
 * AC14's fallback must not walk around the eligibility gate — and must not mistake a supervised
 * maintainer for an unattended pipeline either.
 *
 * `decideDispatch` answers `no-mapping-declared` BEFORE it ever reads `## Eligibility` (the
 * `mapping === undefined` branch returns above the eligibility branch). AC14 as first written
 * engaged on that reason alone, so a project declaring `## Eligibility` but no `## Workflows`
 * (this repository's own configuration on 2026-09-22) would have reached the delivery cycle for
 * EVERY card, including one the label exists to keep out. BR3 calls that ordering normative.
 *
 * The first correction then over-reached: it demanded the label from a maintainer typing the
 * command by hand, who would have had to assert labels the card does not carry to get past it —
 * found by running the real binary, not by reading it. `## Eligibility` bounds the UNATTENDED
 * pipeline, and `--autonomous` is this command's own explicit opt-in to being one, so that is what
 * the gate keys on. A run without it confirms or fails loudly at every write.
 */

const policy = (eligibility?: string): AutomationPolicy => ({ eligibility }) as AutomationPolicy
const AUTONOMOUS = true
const SUPERVISED = false

describe('AC14 fallback vs the eligibility gate', () => {
  it('falls back on `unmapped`: eligibility was already evaluated upstream, and passed', () => {
    // `unmapped` is only reachable AFTER the eligibility check, so re-checking would be wrong:
    // it is the one reason that proves the card carries the label.
    expect(isDorFallbackReason('unmapped', policy('risk:green'), [], AUTONOMOUS)).toBe(true)
  })

  it('falls back on `no-mapping-declared` when nobody opted into automation', () => {
    expect(isDorFallbackReason('no-mapping-declared', policy(undefined), [], AUTONOMOUS)).toBe(true)
  })

  it('falls back on `no-mapping-declared` when an autonomous run carries the eligibility label', () => {
    expect(
      isDorFallbackReason(
        'no-mapping-declared',
        policy('risk:green'),
        ['risk:green', 'auto-dev'],
        AUTONOMOUS,
      ),
    ).toBe(true)
  })

  it('REFUSES an AUTONOMOUS run on a card that does not carry the declared eligibility label', () => {
    // The hole this file exists for: without the check, an ineligible card reached the delivery
    // cycle unattended, through the one door the label was meant to close.
    expect(
      isDorFallbackReason('no-mapping-declared', policy('risk:green'), ['risk:red'], AUTONOMOUS),
    ).toBe(false)
    expect(isDorFallbackReason('no-mapping-declared', policy('risk:green'), [], AUTONOMOUS)).toBe(
      false,
    )
  })

  it('ALLOWS a supervised run on that same ineligible card — the label bounds the unattended path', () => {
    // The over-reach the first correction introduced: a maintainer would have had to claim labels
    // the card does not carry. A run without `--autonomous` stops at every write by construction.
    expect(
      isDorFallbackReason('no-mapping-declared', policy('risk:green'), ['risk:red'], SUPERVISED),
    ).toBe(true)
    expect(isDorFallbackReason('no-mapping-declared', policy('risk:green'), [], SUPERVISED)).toBe(
      true,
    )
  })

  it('never reaches the fallback for the skip reasons that are not about routing', () => {
    for (const reason of ['automation-off', 'ineligible', 'run-in-progress'] as const) {
      expect(isDorFallbackReason(reason, policy(undefined), [], AUTONOMOUS), reason).toBe(false)
      expect(isDorFallbackReason(reason, policy(undefined), [], SUPERVISED), reason).toBe(false)
    }
  })
})

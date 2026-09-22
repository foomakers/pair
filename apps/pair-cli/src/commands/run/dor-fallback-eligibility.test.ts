import { describe, it, expect } from 'vitest'
import { isDorFallbackReason } from './handler'
import type { AutomationPolicy } from './automation-policy'

/**
 * AC14's fallback must not walk around the eligibility gate.
 *
 * `decideDispatch` answers `no-mapping-declared` BEFORE it ever reads `## Eligibility` — the
 * `mapping === undefined` branch returns above the eligibility branch. AC14 as first written
 * engaged on that reason alone, so a project declaring `## Eligibility` but no `## Workflows`
 * (this repository's own configuration on 2026-09-22) would have reached the delivery cycle for
 * EVERY card, including one the label exists to keep out of an unattended pipeline. BR3 calls that
 * ordering normative: "an ineligible card is skipped BEFORE its tags are looked at, so the one
 * declaration that keeps business-critical work out of an unattended pipeline is never evaluated
 * after the decision it exists to bound."
 *
 * These cases pin the boundary. They are deliberately about the PREDICATE, not the whole handler:
 * the routing behaviour itself is already covered by the sealed suites, and the one property those
 * cannot express is the one below — which skip reasons may reach the fallback at all, and on what
 * evidence.
 */

const policy = (eligibility?: string): AutomationPolicy => ({ eligibility }) as AutomationPolicy

describe('AC14 fallback vs the eligibility gate', () => {
  it('falls back on `unmapped`: eligibility was already evaluated upstream, and passed', () => {
    // `unmapped` is only reachable AFTER the eligibility check, so re-checking would be wrong:
    // it is the one reason that proves the card carries the label.
    expect(isDorFallbackReason('unmapped', policy('risk:green'), [])).toBe(true)
  })

  it('falls back on `no-mapping-declared` when no `## Eligibility` is declared — nobody opted into automation', () => {
    expect(isDorFallbackReason('no-mapping-declared', policy(undefined), [])).toBe(true)
  })

  it('falls back on `no-mapping-declared` when the card DOES carry the eligibility label', () => {
    expect(
      isDorFallbackReason('no-mapping-declared', policy('risk:green'), ['risk:green', 'auto-dev']),
    ).toBe(true)
  })

  it('REFUSES to fall back when `## Eligibility` is declared and the card does not carry it', () => {
    // The regression this file exists for: without the check, this returned true and an ineligible
    // card reached the delivery cycle through the one door the label was meant to close.
    expect(isDorFallbackReason('no-mapping-declared', policy('risk:green'), ['risk:red'])).toBe(
      false,
    )
    expect(isDorFallbackReason('no-mapping-declared', policy('risk:green'), [])).toBe(false)
  })

  it('never reaches the fallback for the skip reasons that are not about routing', () => {
    for (const reason of ['automation-off', 'ineligible', 'run-in-progress'] as const) {
      expect(isDorFallbackReason(reason, policy(undefined), []), reason).toBe(false)
      expect(isDorFallbackReason(reason, policy('risk:green'), ['risk:green']), reason).toBe(false)
    }
  })
})

import { describe, it, expect } from 'vitest'
import { isDorFallbackReason, ineligibleOverrideApplied, type DorFallbackGate } from './handler'
import type { AutomationPolicy } from './automation-policy'
import type { DispatchSkipReason } from './dispatch'

/**
 * AC14's fallback must not walk around the eligibility gate — must not mistake a supervised
 * maintainer for an unattended pipeline — and must still let a person overrule it deliberately.
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
 * pipeline, and `--autonomous` is this command's own opt-in to being one, so that is what the gate
 * keys on; `--approve-ineligible` is how a person overrules it for one run, carrying it themselves.
 */

const gate = (
  over: Partial<DorFallbackGate> & { reason: DispatchSkipReason },
): DorFallbackGate => ({
  policy: {} as AutomationPolicy,
  tags: [],
  autonomous: true,
  ...over,
})

const eligibility = (label?: string) => ({ eligibility: label }) as AutomationPolicy

describe('AC14 fallback vs the eligibility gate', () => {
  it('falls back on `unmapped`: eligibility was already evaluated upstream, and passed', () => {
    // `unmapped` is only reachable AFTER the eligibility check, so re-checking would be wrong:
    // it is the one reason that proves the card carries the label.
    expect(
      isDorFallbackReason(gate({ reason: 'unmapped', policy: eligibility('risk:green') })),
    ).toBe(true)
  })

  it('falls back on `no-mapping-declared` when nobody opted into automation', () => {
    expect(
      isDorFallbackReason(gate({ reason: 'no-mapping-declared', policy: eligibility(undefined) })),
    ).toBe(true)
  })

  it('falls back when an autonomous run carries the declared eligibility label', () => {
    expect(
      isDorFallbackReason(
        gate({
          reason: 'no-mapping-declared',
          policy: eligibility('risk:green'),
          tags: ['risk:green', 'auto-dev'],
        }),
      ),
    ).toBe(true)
  })

  it('REFUSES an AUTONOMOUS run on a card that does not carry the declared label', () => {
    // The hole this file exists for: without the check, an ineligible card reached the delivery
    // cycle unattended, through the one door the label was meant to close.
    for (const tags of [['risk:red'], []]) {
      expect(
        isDorFallbackReason(
          gate({ reason: 'no-mapping-declared', policy: eligibility('risk:green'), tags }),
        ),
      ).toBe(false)
    }
  })

  it('ALLOWS a supervised run on that same ineligible card — the label bounds the unattended path', () => {
    // The over-reach the first correction introduced: a maintainer would have had to claim labels
    // the card does not carry. A run without `--autonomous` stops at every write by construction.
    expect(
      isDorFallbackReason(
        gate({
          reason: 'no-mapping-declared',
          policy: eligibility('risk:green'),
          tags: ['risk:red'],
          autonomous: false,
        }),
      ),
    ).toBe(true)
  })

  it('lets an operator overrule the bound for ONE run, and only when they say so', () => {
    // A policy binds a pipeline, never the person who wrote it: someone who knows why this card is
    // the exception must be able to say so and carry it. Nothing is persisted, so the next run on
    // the same card is bounded again — the flag IS the whole authorization, per invocation.
    const ineligible = {
      reason: 'no-mapping-declared' as const,
      policy: eligibility('risk:green'),
      tags: ['risk:yellow'],
    }
    expect(isDorFallbackReason(gate({ ...ineligible, approveIneligible: true }))).toBe(true)
    // Absent the flag the same call is still refused — the override is never implied.
    expect(isDorFallbackReason(gate(ineligible))).toBe(false)
  })

  it('never reaches the fallback for the skip reasons that are not about routing', () => {
    for (const reason of ['automation-off', 'ineligible', 'run-in-progress'] as const) {
      expect(isDorFallbackReason(gate({ reason })), reason).toBe(false)
      expect(isDorFallbackReason(gate({ reason, autonomous: false })), reason).toBe(false)
    }
  })
})

describe('ineligibleOverrideApplied — announced, never silent', () => {
  it('is true exactly when the flag is what decided the outcome', () => {
    expect(
      ineligibleOverrideApplied(
        gate({
          reason: 'no-mapping-declared',
          policy: eligibility('risk:green'),
          tags: ['risk:yellow'],
          approveIneligible: true,
        }),
      ),
    ).toBe(true)
  })

  it('stays quiet when the flag changed nothing — announcing it would train the reader to ignore the line', () => {
    const quiet: Array<Partial<DorFallbackGate>> = [
      // an eligible card: the run would have proceeded anyway
      { policy: eligibility('risk:green'), tags: ['risk:green'], approveIneligible: true },
      // supervised: the gate never applied
      {
        policy: eligibility('risk:green'),
        tags: ['risk:yellow'],
        approveIneligible: true,
        autonomous: false,
      },
      // no policy to overrule
      { policy: eligibility(undefined), tags: [], approveIneligible: true },
    ]
    for (const over of quiet) {
      expect(ineligibleOverrideApplied(gate({ reason: 'no-mapping-declared', ...over }))).toBe(
        false,
      )
    }
  })
})

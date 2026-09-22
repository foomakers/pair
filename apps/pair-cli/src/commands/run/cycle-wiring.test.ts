import { describe, it, expect } from 'vitest'
import { parseCardRecord, deriveBranch, resolveBranch } from './cycle-wiring'

/**
 * The pure halves of the production wiring — the tracker call itself is the operator's own `gh`
 * and is not re-tested here; what IS testable without a network is the grammar this code reads out
 * of a card body and the branch name it derives from a title.
 */

const body = (status: string, breakdown: boolean) =>
  `## Story Statement\n\nsomething\n\n## Epic Context\n\n**Parent Epic**: #1\n**Status**: ${status}\n${
    breakdown ? '\n## Task Breakdown\n\n- [ ] T-1: do it\n' : ''
  }`

describe('parseCardRecord', () => {
  it('reads the status the card template declares, and whether a breakdown is present', () => {
    expect(parseCardRecord('t', body('Refined', true))).toEqual({
      status: 'Refined',
      hasTaskBreakdown: true,
      title: 't',
    })
    expect(parseCardRecord('t', body('Refined', false)).hasTaskBreakdown).toBe(false)
    expect(parseCardRecord('t', body('Draft', false)).status).toBe('Draft')
  })

  it('REFUSES a body with no `**Status**:` line rather than guessing a macrostate', () => {
    // Guessing here would be the worst failure mode available: a Draft card silently treated as
    // Ready enters `prepare`, which then cannot produce an acceptance contract.
    expect(() => parseCardRecord('t', '## Story Statement\n\nno status anywhere')).toThrow(
      /card-status-unreadable/,
    )
  })

  it('does not mistake a `## Task Breakdown` mention inside prose for the section itself', () => {
    const prose = body('Refined', false) + '\nthe ## Task Breakdown comes later\n'
    expect(parseCardRecord('t', prose).hasTaskBreakdown).toBe(false)
  })
})

describe('deriveBranch', () => {
  it('follows the documented `<type>/<story-id>-<brief-description>` standard', () => {
    expect(
      deriveBranch('135', 'Cross-platform testing for KB source resolution (Linux/macOS)'),
    ).toBe('feature/US-135-cross-platform-testing-for-kb-source')
  })

  it('is deterministic and shell-safe: one slug, no punctuation, bounded length', () => {
    const branch = deriveBranch(
      '9',
      'A/B: "weird" title — with $ymbols, and a very long tail indeed',
    )
    expect(branch).toMatch(/^feature\/US-9(-[a-z0-9]+)*$/)
    expect(branch).toBe(
      deriveBranch('9', 'A/B: "weird" title — with $ymbols, and a very long tail indeed'),
    )
  })

  it('still yields a usable branch when the title slugs to nothing', () => {
    expect(deriveBranch('42', '!!! ???')).toBe('feature/US-42')
  })
})

describe('resolveBranch — ask the authority before deriving', () => {
  // The 8th defect the canary found: US-487's title changed after its branch was cut, so
  // `deriveBranch` produced `feature/US-487-pair-cli-run-card-pr-rounds` while the real branch was
  // `…-coordinator`. The worktree guard refused to switch a checkout, correctly — but the driver
  // should never have asked. Derivation is the fallback of last resort, not the first answer.
  it('falls back to derivation only for a card with no branch anywhere', () => {
    // A card id nothing in this repository has ever cut a branch for: no PR, no local ref, no
    // remote ref — the one case where the title is genuinely the only thing to go on.
    expect(resolveBranch('999999', 'A story never started', undefined, process.cwd())).toBe(
      deriveBranch('999999', 'A story never started'),
    )
  })

  it('prefers an existing branch for the card over anything the title would derive', () => {
    // This worktree's own story: the title no longer matches the branch, which is exactly the
    // condition that made derivation wrong.
    const derived = deriveBranch('487', 'pair-cli run --card [--pr] [--rounds] — coordinator')
    const resolved = resolveBranch(
      '487',
      'pair-cli run --card [--pr] [--rounds] — coordinator',
      undefined,
      process.cwd(),
    )
    expect(resolved).toBe('feature/US-487-pair-cli-run-card-coordinator')
    expect(resolved).not.toBe(derived)
  })
})

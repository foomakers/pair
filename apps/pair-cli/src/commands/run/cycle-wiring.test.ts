import { describe, it, expect } from 'vitest'
import { parseCardRecord, deriveBranch } from './cycle-wiring'

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

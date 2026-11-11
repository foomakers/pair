import { describe, it, expect } from 'vitest'
import {
  parseStateMapping,
  resolveCardReadiness,
  resolveMacrostate,
  unmetReadinessCriteria,
  type CardDocument,
  type StateMapping,
} from './card-readiness'

/**
 * US-253 — control state = macrostate (primary) + Definition-of-Ready fallback, never title
 * heuristics. The grammar is stated once in the KB (`canonical-states.md` Reading rules / Readiness
 * Fallback, `definition-of-ready-and-done.md`) and in `/pair-next`'s "Control-State Resolution"
 * procedure; `card-readiness.ts` is the ONE implementation the automation loop shares with it.
 *
 * These are the story's fixture boards, run through that implementation: mapped, minimal (no Ready
 * state), unmapped states, missing WoW — plus the conflict scenario (state says Ready, DoR fails).
 */

const wow = (rows: ReadonlyArray<readonly [string, string]>): string =>
  [
    '# Way of Working',
    '',
    '## State Mapping',
    '',
    '| Board State | Macrostate |',
    '| ----------- | ---------- |',
    ...rows.map(([board, macro]) => `| ${board} | ${macro} |`),
    '',
  ].join('\n')

// ── fixture boards ──────────────────────────────────────────────────────────────────────────────
const MAPPED: StateMapping = parseStateMapping(
  wow([
    ['Todo', 'Draft'],
    ['Refined', 'Ready'],
    ['In Progress', 'In Progress'],
    ['Review', 'Review'],
    ['Done', 'Done'],
  ]),
)

// ── fixture bodies ──────────────────────────────────────────────────────────────────────────────
const FULL_BODY = `## Story Statement

**As a** maintainer
**I want** deterministic control state
**So that** phases never block

## Acceptance Criteria

1. **Given** a board **When** pair-next evaluates **Then** it decides on macrostates

## Story Sizing and Sprint Readiness

**Final Story Points**: 3

## Dependencies and Coordination

**Story Dependencies**: None

## Technical Analysis

### Implementation Approach

Design: not required
`

/** Everything but the Design flag — 5 of 6 criteria. */
const NO_DESIGN_FLAG = FULL_BODY.replace('Design: not required\n', '')

const card = (
  boardState: string | undefined,
  body: string,
  title = 'A clear title',
): CardDocument => ({
  title,
  body,
  boardState,
})

describe('conflicting signals — state says Ready, DoR fails', () => {
  it('the mapped state wins (a warning, never a block); the unmet criteria are what gets flagged', () => {
    const c = card('Refined', NO_DESIGN_FLAG)
    expect(resolveMacrostate('Refined', MAPPED)).toBe('Ready')
    expect(unmetReadinessCriteria(c)).toEqual(['Design flag'])
    expect(resolveCardReadiness(c, MAPPED).readiness).toBe('refined-no-breakdown')
  })

  it('an out-of-process card has no signals to conflict: it never reaches the DoR', () => {
    expect(resolveMacrostate('Icebox', MAPPED)).toBeUndefined()
  })
})

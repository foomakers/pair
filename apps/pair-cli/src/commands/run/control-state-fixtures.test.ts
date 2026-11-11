import { describe, it, expect } from 'vitest'
import {
  CardOutOfScopeError,
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
// canonical-states.md Example 3 — a 3-column board: no board state anywhere maps to Ready.
const MINIMAL: StateMapping = parseStateMapping(
  wow([
    ['Todo', 'Draft'],
    ['In Progress', 'In Progress'],
    ['Done', 'Done'],
  ]),
)
// Example 5 (Azure) — `Removed` deliberately left unmapped.
const PARTIAL: StateMapping = parseStateMapping(
  wow([
    ['New', 'Draft'],
    ['Approved', 'Ready'],
    ['Committed', 'In Progress'],
    ['Done', 'Done'],
  ]),
)
const MISSING_WOW: StateMapping = undefined

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

/** No dedicated sections for 3–5, but a statement + an inline breakdown + a Design flag. */
const BREAKDOWN_BODY = `## Story Statement

**As a** maintainer
**I want** it
**So that** it works

## Technical Analysis

### Implementation Approach

Design: not required

## Task Breakdown

- [ ] T1 — resolve the control state
`

const card = (
  boardState: string | undefined,
  body: string,
  title = 'A clear title',
): CardDocument => ({
  title,
  body,
  boardState,
})

describe('AC3 — titles are never a control signal', () => {
  const titles = [
    'Ready: ship it',
    '[DONE] already finished',
    'Epic: not a story',
    'WIP — in progress',
    'DRAFT',
    'Refined',
  ]

  it.each(titles)('the title %j changes nothing: state + body decide', title => {
    const base = resolveCardReadiness(card('Todo', NO_DESIGN_FLAG), MINIMAL)
    const titled = resolveCardReadiness(card('Todo', NO_DESIGN_FLAG, title), MINIMAL)
    expect(titled).toEqual(base)
    const ready = resolveCardReadiness(card('Refined', BREAKDOWN_BODY), MAPPED)
    expect(resolveCardReadiness(card('Refined', BREAKDOWN_BODY, title), MAPPED)).toEqual(ready)
  })
})

describe('AC4 — an unmapped board state is out-of-process, never an error', () => {
  it.each([
    ['Removed', PARTIAL],
    ['Icebox', MAPPED],
    ['Blocked', MISSING_WOW],
  ] as const)('%s is skipped cleanly (CardOutOfScopeError, not a failure)', (literal, mapping) => {
    expect(() => resolveCardReadiness(card(literal, FULL_BODY), mapping)).toThrow(
      CardOutOfScopeError,
    )
  })
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

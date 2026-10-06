import { describe, it, expect } from 'vitest'
import {
  CardOutOfScopeError,
  conflictingSignals,
  parseStateMapping,
  resolveCardReadiness,
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

const card = (boardState: string | undefined, body: string, title = 'A clear title'): CardDocument => ({
  title,
  body,
  boardState,
})

describe('AC1 — a mapped board: the macrostate decides, board names never do', () => {
  it('resolves through the map, case-insensitively', () => {
    expect(resolveCardReadiness(card('refined', FULL_BODY), MAPPED).readiness).toBe(
      'refined-no-breakdown',
    )
    expect(resolveCardReadiness(card('Refined', BREAKDOWN_BODY), MAPPED).readiness).toBe('ready')
  })

  it('a Todo (⇒ Draft) card stays Draft even when its body satisfies the DoR: the board has a Ready state', () => {
    expect(resolveCardReadiness(card('Todo', FULL_BODY), MAPPED).readiness).toBe('draft')
  })

  it('the same macrostate behind different literals decides identically (n-m)', () => {
    const renamed = parseStateMapping(
      wow([
        ['Icebox', 'Draft'],
        ['Up Next', 'Ready'],
      ]),
    )
    const a = resolveCardReadiness(card('Refined', BREAKDOWN_BODY), MAPPED)
    const b = resolveCardReadiness(card('Up Next', BREAKDOWN_BODY), renamed)
    expect(b.readiness).toBe(a.readiness)
  })
})

describe('AC2 — a board with NO Ready state: readiness comes from the DoR on the body', () => {
  it('Todo + the six criteria met, no breakdown ⇒ effectively Ready (refined, planning due)', () => {
    const v = resolveCardReadiness(card('Todo', FULL_BODY), MINIMAL)
    expect(v.readiness).toBe('refined-no-breakdown')
    expect(v.explanation).toContain('Definition of Ready')
  })

  it('Todo + AC + estimate + inline task breakdown ⇒ Ready (the inline signal covers 3–5)', () => {
    expect(resolveCardReadiness(card('Todo', BREAKDOWN_BODY), MINIMAL).readiness).toBe('ready')
  })

  it('Todo + 5 of 6 criteria ⇒ Draft, the failing criterion listed by name', () => {
    const v = resolveCardReadiness(card('Todo', NO_DESIGN_FLAG), MINIMAL)
    expect(v.readiness).toBe('draft')
    expect(v.explanation).toContain('unmet: Design flag')
  })

  it('Todo + an empty body ⇒ Draft, every unmet criterion listed — never a guessed Ready', () => {
    const v = resolveCardReadiness(card('Todo', ''), MINIMAL)
    expect(v.readiness).toBe('draft')
    for (const name of [
      'Problem/goal',
      'Verifiable AC',
      'Estimate',
      'Dependencies',
      'Design flag',
    ]) {
      expect(v.explanation).toContain(name)
    }
  })
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

  it('a title says "Draft" but state + body say Ready ⇒ Ready wins', () => {
    expect(resolveCardReadiness(card('Refined', BREAKDOWN_BODY, 'Draft: idea'), MAPPED).readiness).toBe(
      'ready',
    )
  })

  it('the title is read for ONE thing — a template placeholder fails DoR criterion 1', () => {
    const v = resolveCardReadiness(card('Todo', FULL_BODY, '[Story title]'), MINIMAL)
    expect(v.readiness).toBe('draft')
    expect(v.explanation).toContain('Clear title')
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

  it('names the literal and says it is unmapped', () => {
    expect(() => resolveCardReadiness(card('Icebox', FULL_BODY), MAPPED)).toThrow(
      /Icebox[\s\S]*unmapped/,
    )
  })
})

describe('missing WoW — canonical names assumed', () => {
  it('canonical `Ready` + breakdown ⇒ ready; canonical `Draft` ⇒ draft', () => {
    expect(resolveCardReadiness(card('Ready', BREAKDOWN_BODY), MISSING_WOW).readiness).toBe('ready')
    expect(resolveCardReadiness(card('draft', FULL_BODY), MISSING_WOW).readiness).toBe('draft')
  })
})

describe('conflicting signals — state says Ready, DoR fails', () => {
  it('lists the failing criteria; the mapped state still wins (a warning, never a block)', () => {
    const c = card('Refined', NO_DESIGN_FLAG)
    expect(conflictingSignals(c, MAPPED)).toEqual(['Design flag'])
    expect(resolveCardReadiness(c, MAPPED).readiness).toBe('refined-no-breakdown')
  })

  it('no conflict when the DoR holds, when the state is not Ready, or when the DoR is the only signal', () => {
    expect(conflictingSignals(card('Refined', FULL_BODY), MAPPED)).toBeUndefined()
    expect(conflictingSignals(card('Todo', NO_DESIGN_FLAG), MAPPED)).toBeUndefined()
    expect(conflictingSignals(card('Todo', NO_DESIGN_FLAG), MINIMAL)).toBeUndefined()
  })

  it('an out-of-process card has no signals to conflict', () => {
    expect(conflictingSignals(card('Icebox', ''), MAPPED)).toBeUndefined()
  })
})

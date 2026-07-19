import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { join } from 'path'

// Conformance guard for story #249: pair-next gains `--root` (subtree scope) and
// `--filter` (generic tag match), re-evaluated at every run/step (selection never
// cached). pair-next carries NO tag semantics — `risk:red` is filtered exactly
// like `team:ui` (D18). This test is the tested production module standing in for
// the story's "grep-verifiable: no classification tag names hardcoded in the skill"
// acceptance check (ADL 2026-07-13 — gate/tooling logic lives in tested modules,
// not unit-tested scripts). It reads both the dataset source of record and the
// installed root mirror.

const DATASET = join(__dirname, '../../dataset/.skills/next/SKILL.md')
const MIRROR = join(__dirname, '../../../../.claude/skills/pair-next/SKILL.md')

const dataset = readFileSync(DATASET, 'utf-8')
const mirror = readFileSync(MIRROR, 'utf-8')

const sources: Array<[string, string]> = [
  ['dataset', dataset],
  ['mirror', mirror],
]

describe.each(sources)(
  'pair-next scoping — %s SKILL.md documents the argument surface',
  (_, content) => {
    it('documents the optional --root and --filter arguments', () => {
      expect(content).toMatch(/`--root/)
      expect(content).toMatch(/`--filter/)
      expect(content.toLowerCase()).toMatch(/optional/)
    })

    it('states --root scopes to the subtree via the PM-tool hierarchy, not title conventions', () => {
      expect(content.toLowerCase()).toMatch(/subtree/)
      expect(content.toLowerCase()).toMatch(/hierarchy/)
      expect(content.toLowerCase()).toMatch(/not.*title|never.*title/)
    })

    it('distinguishes epic-root vs story-root behaviour', () => {
      expect(content.toLowerCase()).toMatch(/epic root/)
      expect(content.toLowerCase()).toMatch(/story root/)
    })

    it('pins AC1 scoping intent: epic-root reaches plan-stories, story-root is itself a first-class candidate', () => {
      const lower = content.toLowerCase()
      // AC1 (epic root "plan its children"): rows 3-5 are NOT blanket-skipped under a
      // root scope — an epic root keeps row 5 → /plan-stories. Guards round-5 Major #2.
      expect(content).toMatch(/plan-stories/)
      expect(lower).toMatch(/keeps? row 5|row 5 is kept/)
      // Regression guard: the old blanket wording ("rows 3–5 … skipped under a
      // --root/--filter scope") that hid the epic-root planning path must be gone.
      expect(content).not.toMatch(/rows 3[–-]5[^.]*skipped under a `?--root`?\/`?--filter/i)
      // Positive invariant (round-6 robustness): a negative grep pinned to one
      // wording can be slipped past by a differently-worded blanket-skip regression.
      // So also pin the asymmetry positively — the story root skips rows 3–5 while
      // the epic root keeps row 5. Any regression that re-blankets the behaviour
      // must break one of these halves (story-root-only skip + epic-root row-5 kept).
      expect(lower).toMatch(/story root[^.]*skips? rows 3[–-]5|skips? rows 3[–-]5 entirely/)
      // AC1 (story root actionable): the root issue is itself a first-class member of
      // the candidate set, subject to the item-selection rows. Guards round-5 Major #1.
      expect(lower).toMatch(/first-class/)
    })

    it('states --filter is interpreted generically with NO tag semantics (D18)', () => {
      expect(content).toMatch(/D18/)
      expect(content.toLowerCase()).toMatch(/generic/)
      // The skill must explicitly disclaim any per-tag meaning.
      expect(content.toLowerCase()).toMatch(/no (meaning|semantics)/)
    })

    it('states selection is re-evaluated per step and never cached', () => {
      expect(content.toLowerCase()).toMatch(/re-?evaluat/)
      expect(content.toLowerCase()).toMatch(/never cache|not cached|stateless/)
    })

    it('documents the combined scope as subtree ∩ matching tags', () => {
      expect(content).toMatch(/subtree ∩|intersection/)
    })

    it('documents the three argument edge cases (missing root HALT, empty match clean exit, Done root exit)', () => {
      const lower = content.toLowerCase()
      // Root not found -> HALT
      expect(lower).toMatch(/root not found|root.*not.*resolve/)
      expect(content).toMatch(/HALT/)
      // Filter matches nothing -> clean exit, not an error
      expect(lower).toMatch(/no matching issues/)
      expect(lower).toMatch(/not an error|clean(ly)? exit|exit cleanly/)
      // Root is Done -> report and exit, no work
      expect(lower).toMatch(/done/)
    })
  },
)

describe('pair-next selection algorithm stays tag-agnostic (D18, grep-verifiable)', () => {
  // The selection Algorithm must not branch on any specific classification tag
  // value: filtering is a plain string-equality label query. Illustrative tag
  // examples (risk:red, team:ui) are allowed ONLY in the Arguments prose, never
  // inside the Algorithm's decision logic.
  it.each(sources)(
    '%s Algorithm section contains no hardcoded classification tag value',
    (_, content) => {
      const parts = content.split(/^## Algorithm/m)
      expect(parts.length).toBeGreaterThan(1)
      const algorithm = parts[1] ?? ''
      expect(algorithm).not.toMatch(/risk:\s*(red|yellow|green|amber)/i)
      expect(algorithm).not.toMatch(/team:[a-z]+/i)
      expect(algorithm).not.toMatch(/tier:[a-z0-9]+/i)
    },
  )
})

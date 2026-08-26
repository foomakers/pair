import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { join } from 'path'

// Conformance guard for the KB guideline `guidelines/collaboration/working-area.md`
// (dataset x root mirror). One file per target artifact, per ADL
// 2026-07-18-conformance-test-per-file-not-per-story: working-area.md is a shared
// guideline with more than one consumer (#281's cost panel, #222's metrics panels),
// so its assertions live here rather than inside any single consumer's test file.
//
// Currently asserted: the "Report Panels — Period Key and Idempotent Update"
// section added by #281 — the convention every periodic panel writer applies
// (path, period key + normalization, in-place idempotency, headline-first D22,
// input-provenance headline, output override, empty-period / not-writable /
// partial-coverage degradations). The panel's
// *semantics* (what a given panel measures) stay in the writing skill; only the
// shared form lives here (ADL 2026-07-28-reports-area-period-keyed-panels).

const DATASET_KB = join(__dirname, '../../dataset/.pair/knowledge')
const MIRROR_KB = join(__dirname, '../../../../.pair/knowledge')

const WORKING_AREA_REL = 'guidelines/collaboration/working-area.md'

const WORKING_AREA_DATASET = readFileSync(join(DATASET_KB, WORKING_AREA_REL), 'utf-8')
const WORKING_AREA_MIRROR = readFileSync(join(MIRROR_KB, WORKING_AREA_REL), 'utf-8')

/**
 * The slice of `content` from the `start` heading up to (not including) `end`
 * ('' when `start` is absent). Section-scoped so a claim about the Report Panels
 * convention cannot be satisfied by an unrelated part of the guideline — the same
 * anti-vacuity discipline as assess-cost.test.ts's `section()`.
 */
function section(content: string, start: string, end: string): string {
  const from = content.indexOf(start)
  if (from === -1) return ''
  const to = content.indexOf(end, from + start.length)
  return content.slice(from, to === -1 ? content.length : to)
}

const PANELS_HEADING = '## Report Panels — Period Key and Idempotent Update'
const NEXT_HEADING = '## How It Is Protected (D14)'

describe('working-area.md — period-keyed report panels (#281)', () => {
  for (const [label, content] of [
    ['dataset', WORKING_AREA_DATASET],
    ['mirror', WORKING_AREA_MIRROR],
  ] as const) {
    const panels = section(content, PANELS_HEADING, NEXT_HEADING)

    it(`${label} has the Report Panels section`, () => {
      expect(panels).not.toBe('')
    })

    it(`${label} defines the period key and its normalized forms`, () => {
      expect(panels.toLowerCase()).toContain('period key')
      expect(panels).toContain('YYYY-MM')
      expect(panels).toContain('YYYY-Wnn')
    })

    it(`${label} distinguishes a periodic panel from a run-date-keyed one-shot audit`, () => {
      expect(panels.toLowerCase()).toContain('one-shot audit')
      expect(panels).toMatch(/<YYYY-MM-DD>-audit\.md/)
    })

    it(`${label} normalizes a whole-month/whole-week range to the shorter key`, () => {
      // Two keys for one window (`2026-07` vs `2026-07-01_2026-07-31`) would produce
      // two panels for the same period, defeating the one-file-per-period guarantee.
      const lower = panels.toLowerCase()
      expect(lower).toMatch(/normaliz/)
      expect(lower).toContain('one window, one key')
      expect(panels).toContain('2026-07-01_2026-07-31')
    })

    it(`${label} requires the panel to be updated in place — one file per period`, () => {
      const lower = panels.toLowerCase()
      expect(lower).toContain('in place')
      expect(lower).toContain('one file per period')
    })

    it(`${label} requires headline-first rendering (D22) and honors the output override`, () => {
      expect(panels).toContain('D22')
      expect(panels.toLowerCase()).toMatch(/override/)
      expect(panels).toContain('$output')
    })

    it(`${label} requires input provenance in the headline and forbids a run timestamp`, () => {
      // A panel is updated in place, so without the resolved revision of the inputs
      // it was derived through, a regenerated panel is indistinguishable from the
      // pre-change one. An input revision keeps "same inputs => same content";
      // a wall-clock "generated at" line would break it.
      const lower = panels.toLowerCase()
      expect(lower).toContain('provenance')
      expect(lower).toMatch(/resolved revision of the inputs/)
      expect(lower).toContain('generated at')
      expect(panels).toMatch(/same inputs ⇒ same content/i)
    })

    it(`${label} keeps a large or partially processed period from losing its panel`, () => {
      // A period bigger than one run must still yield a panel with the shortfall in
      // the headline — never a refusal (that is the "failed run / silent skip" the
      // empty-period bullet already rules out) and never a silently partial panel.
      const lower = panels.toLowerCase()
      expect(lower).toContain('partial coverage')
      expect(panels).toMatch(/Coverage: N of M/)
      expect(lower).toMatch(/never a reason to refuse a panel/)
      expect(lower).toMatch(/batch/)
      expect(lower).toMatch(/never look complete/)
      // The items left out are named in that one line, not as empty per-item rows.
      expect(lower).toMatch(/no per-item row/)
      // The headline figures are over the processed items; the found count only
      // qualifies them, so a partial panel cannot mix the two denominators.
      expect(lower).toMatch(/count the \*\*processed\*\* items/)
    })

    it(`${label} forbids a lower-coverage run from overwriting a more complete panel`, () => {
      // Without this the two sibling rules contradict each other: "re-running for the
      // same period updates that panel in place / same inputs => same content" plus
      // "a partial run still writes its panel" lets a 40-of-73 re-run destroy a
      // 73-of-73 panel — same inputs, different content, and the drop in the figures
      // reads as real movement to anyone comparing periods. Authoritative here
      // because it binds EVERY panel writer, not just the cost panel (#222 inherits).
      const lower = panels.toLowerCase()
      expect(lower).toContain('no coverage regression')
      expect(lower).toMatch(/not unconditional/)
      expect(lower).toMatch(/keep it/)
      expect(lower).toMatch(/run output/)
      // The comparison is on the ABSOLUTE processed count, not on "completeness":
      // an open period's denominator grows, so a panel that was complete when
      // written can cover fewer items than a later partial one (round-5 finding 2).
      expect(lower).toMatch(/how many items each panel actually processed/)
      expect(lower).toMatch(/completeness is not the comparison basis/)
      // Merging separable rows is allowed ONLY with a recomputed headline, or the
      // table ends up contradicting the line above it (round-5 finding 1).
      expect(lower).toMatch(/merge in the rows[\s\S]{0,160}recompute the headline/)
      expect(lower).toMatch(/struck from the items-left-out list/)
    })

    it(`${label} states the empty-period and not-writable degradations`, () => {
      const lower = panels.toLowerCase()
      expect(lower).toMatch(/no data for (the|this) period/)
      expect(lower).toContain('not writable')
      expect(lower).toContain('inline')
    })

    it(`${label} keeps panel writers read-only over their sources`, () => {
      expect(panels.toLowerCase()).toMatch(/never adoption|not adoption/)
    })

    it(`${label} is listed in the Integration-with-Skills table`, () => {
      // Discoverability: a panel writer must find the convention from the table,
      // not only from this section.
      expect(content).toMatch(/Panel writers[^\n]*report-panels--period-key/i)
    })

    it(`${label} names EVERY in-tree panel writer with its path in that row (#222)`, () => {
      // The row is the discovery surface, so a writer absent from it is a writer
      // whose author never reaches the convention. Both current writers are named
      // WITH the path they own, so two panels can never be read as one.
      const row = content.split('\n').find(l => /^\| Panel writers/.test(l)) ?? ''
      expect(row).toContain('reports/cost/<period-key>-cost-panel.md')
      expect(row).toContain('analyze-delivery-metrics')
      expect(row).toContain('reports/metrics/<period-key>-delivery-metrics.md')
    })
  }
})

import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { join } from 'path'

// Conformance guard for the KB guideline `guidelines/quality-assurance/delivery-metrics.md`
// (dataset x root mirror), added by story #222. One file per target KB artifact, per ADL
// 2026-07-18-conformance-test-per-file-not-per-story — the SKILL that applies these rules
// has its own file (analyze-delivery-metrics.test.ts); this one guards the RULES.
//
// The guideline is the Delivery pillar's sibling of `cost-assessment.md`: the quality model
// owns the pillar and the taxonomy, this document owns which metrics exist, on which clock,
// aggregated how, read from which field of which tool (R9.5, D17/D21). Every claim below is
// a rule the skill would otherwise have to invent — the failure mode this guards is a
// definition drifting into the skill (or into a panel), where it stops being comparable
// across periods and across tools.
//
// Assertions are matched against NORMALIZED text (emphasis/code markers stripped) so a
// claim cannot go vacuously green because prose put a `code span` between two required
// words, and each was injection-tested by deleting the claim and confirming the red.

const DATASET_KB = join(__dirname, '../../dataset/.pair/knowledge')
const MIRROR_KB = join(__dirname, '../../../../.pair/knowledge')

const GUIDELINE_REL = 'guidelines/quality-assurance/delivery-metrics.md'
const QUALITY_MODEL_REL = 'guidelines/quality-assurance/quality-model.md'
const QA_README_REL = 'guidelines/quality-assurance/README.md'

const CORPORA = [
  { label: 'dataset', root: DATASET_KB },
  { label: 'mirror', root: MIRROR_KB },
] as const

function read(root: string, rel: string): string {
  return readFileSync(join(root, rel), 'utf-8')
}

function normalize(markdown: string): string {
  return markdown.replace(/[*`_]/g, '').replace(/\s+/g, ' ').toLowerCase()
}

/** The slice from the `start` heading up to (not including) `end` ('' when absent). */
function section(content: string, start: string, end: string): string {
  const from = content.indexOf(start)
  if (from === -1) return ''
  const to = content.indexOf(end, from + start.length)
  return content.slice(from, to === -1 ? content.length : to)
}

describe('delivery-metrics.md — the R9.5 metric set (#222 T1)', () => {
  for (const { label, root } of CORPORA) {
    const content = read(root, GUIDELINE_REL)
    const lower = normalize(content)

    it(`${label} defines all three metric families and nothing beyond the fixed trio`, () => {
      expect(lower).toContain('bug resolution time')
      expect(lower).toContain('pr lead time')
      expect(lower).toContain('adoption')
      expect(lower).toContain('r9.5')
      // A fourth family belongs to the quality-model taxonomy, not to this set.
      expect(lower).toMatch(/fixed trio|extensions belong/)
    })

    it(`${label} states each duration metric's clock — start AND stop event`, () => {
      const set = section(content, '## The metric set', '## Aggregation rules')
      const setLower = normalize(set)
      expect(setLower).toContain('clock starts')
      expect(setLower).toContain('clock stops')
      // Population keyed on the CLOSING event, or a closed period keeps moving.
      expect(normalize(content)).toMatch(/closed inside the window|keyed on the close event/)
      expect(normalize(content)).toContain('merged inside the window')
    })

    it(`${label} pins PR lead time to open→merge and says why, not to first-commit`, () => {
      expect(lower).toMatch(/time to merge/)
      expect(lower).toContain('first-commit')
      expect(lower).toMatch(/rebased or squashed|not a reliable clock/)
    })

    it(`${label} excludes closed-unmerged PRs and bot authors, both counted not dropped`, () => {
      expect(lower).toContain('closed unmerged')
      expect(lower).toMatch(/bot-authored prs are excluded/)
      expect(lower).toMatch(/names the exclusion/)
    })

    it(`${label} handles reopened and still-open defects explicitly`, () => {
      expect(lower).toMatch(/last close inside the window|the last close/)
      expect(lower).toContain('open at period end')
    })

    it(`${label} requires median + p75 and forbids the mean`, () => {
      expect(lower).toContain('median')
      expect(lower).toContain('p75')
      expect(lower).toMatch(/never the mean/)
    })

    it(`${label} states the low-sample rule with its threshold and no-trend consequence`, () => {
      const agg = normalize(section(content, '## Aggregation rules', '## Bug detection'))
      expect(agg).toContain('low sample')
      expect(agg).toMatch(/n < 5|fewer than 5/)
      expect(agg).toMatch(/no trend/)
    })

    it(`${label} defines the trend as the previous window of equal length`, () => {
      expect(lower).toMatch(/previous window of equal length/)
      expect(lower).toMatch(/no trend — first period|no trend - first period/)
    })

    it(`${label} orders bug detection adoption → tool default → unmapped-as-generic`, () => {
      const map = normalize(section(content, '## Bug detection', '## Per-tool query mapping'))
      expect(map).toMatch(/adoption declaration/)
      expect(map).toMatch(/per-tool default/)
      expect(map).toMatch(/counted as a generic issue|counted as generic/)
      // The count is what makes either failure mode visible.
      expect(map).toMatch(/notes the count|the panel notes/)
    })

    it(`${label} names the adoption-declaration keys a project can set`, () => {
      expect(content).toContain('bug-label')
      expect(content).toContain('bug-type')
      expect(content).toContain('exclude-authors')
      expect(content).toContain('adoption-signals')
      expect(normalize(content)).toContain('delta-only')
    })

    it(`${label} defines adoption as ratios over existing artifacts, never new telemetry`, () => {
      const ad = normalize(section(content, '### Adoption', '## Aggregation rules'))
      expect(ad).toContain('process coverage')
      expect(ad).toContain('classification coverage')
      expect(ad).toContain('review coverage')
      expect(ad).toMatch(/no new instrumentation|no telemetry service/)
    })

    it(`${label} requires "not available" over a fabricated zero for an absent source`, () => {
      expect(lower).toContain('not available')
      expect(lower).toMatch(/never zero|never 0%/)
    })

    it(`${label} maps every metric input per tool, for all four adapters`, () => {
      const map = section(content, '## Per-tool query mapping', '## Gotchas')
      expect(map).toContain('github-implementation.md')
      expect(map).toContain('azure-devops-implementation.md')
      expect(map).toContain('linear-implementation.md')
      expect(map).toContain('filesystem-implementation.md')
      const mapLower = normalize(map)
      expect(mapLower).toContain('closed defects in window')
      expect(mapLower).toContain('merged prs in window')
    })

    it(`${label} routes PR-side inputs through the code host, item-side through the PM tool`, () => {
      expect(lower).toMatch(/code host ≠ pm tool|code host and pm tool/)
      expect(content).toContain('way-of-working-pm-resolution.md')
      // A tracker with no PR surface degrades, it does not substitute a proxy.
      expect(lower).toMatch(/no pr surface/)
    })

    it(`${label} keeps a new tool an adoption/KB change, never a skill change (R2.12)`, () => {
      expect(lower).toMatch(/adoption link/)
      expect(lower).toMatch(/never a change to the skill/)
      expect(content).toContain('R2.12')
    })

    it(`${label} keeps the definitions here once — the panel links, never restates`, () => {
      expect(lower).toMatch(/definitions live here, once|links back to this document/)
      expect(lower).toMatch(/instead of restating/)
    })

    it(`${label} points at the shared report-panel convention, not its own`, () => {
      expect(content).toContain('working-area.md')
      expect(normalize(content)).toContain('report-panel convention')
      expect(content).toContain('.pair/working/reports/metrics/')
      expect(content).toContain('D14')
    })

    it(`${label} resolves windows in UTC and warns about the timezone edge`, () => {
      expect(lower).toContain('utc')
      expect(lower).toContain('timezone')
    })
  }
})

describe('delivery-metrics.md — indexed by the quality model and the QA README (#222 T1)', () => {
  for (const { label, root } of CORPORA) {
    it(`${label} quality-model §7 AI-metrics row points at the guideline`, () => {
      const model = read(root, QUALITY_MODEL_REL)
      const row = model.split('\n').find(l => /\| AI metrics \/ retro \|/.test(l)) ?? ''
      expect(row).toContain('delivery-metrics.md')
      expect(row).toContain('Delivery')
      expect(row).toContain('.pair/working/reports/metrics/')
    })

    it(`${label} QA README lists the guideline as the Delivery pillar's metrics doc`, () => {
      const readme = normalize(read(root, QA_README_REL))
      expect(readme).toContain('delivery-metrics.md')
      expect(readme).toContain('analyze-delivery-metrics')
    })
  }
})

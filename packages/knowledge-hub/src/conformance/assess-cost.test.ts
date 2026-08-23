import { describe, it, expect } from 'vitest'
import { readFileSync, existsSync } from 'fs'
import { join } from 'path'

// Conformance guard for story #226: pair-capability-assess-cost is an OUTPUT-ONLY,
// multi-provider cost classification shown at review (green/yellow/orange/red per
// quality-model §3.3). Consistent with the assess-security sibling: it emits a
// verdict, writes nothing, blocks nothing. The cost-signal catalog + general/AWS
// heuristics + gotchas live in the KB guideline (cost-assessment.md), never in the
// skill (D17/D21). Review-side wiring (compose into /review) and the review template
// land separately (#228) and are deliberately NOT asserted here.
//
// Story #281 adds the skill's SECOND mode — `$mode: report`: bidirectional cost
// monitoring (refinement-time predicted class vs. real/observed signals on merged
// PRs — closed-unmerged excluded, drift flagged, deploy-match degraded to "not
// available" without telemetry)
// rendered as a consolidated panel under .pair/working/reports/cost/, idempotent by
// period key. The period-keyed panel convention itself lives in the KB working-area
// guideline (shared with #222's AI-metrics reports — one reports-area pattern, not
// two) and is asserted in its own working-area.test.ts, per ADL
// 2026-07-18-conformance-test-per-file-not-per-story; this file asserts only that
// assess-cost APPLIES it. Classification mode stays output-only.

const DATASET_SKILLS = join(__dirname, '../../dataset/.skills')
const MIRROR_SKILLS = join(__dirname, '../../../../.claude/skills')
const DATASET_KB = join(__dirname, '../../dataset/.pair/knowledge')
const MIRROR_KB = join(__dirname, '../../../../.pair/knowledge')

const ASSESS_COST_DATASET = readFileSync(
  join(DATASET_SKILLS, 'capability/assess-cost/SKILL.md'),
  'utf-8',
)
const ASSESS_COST_MIRROR = readFileSync(
  join(MIRROR_SKILLS, 'pair-capability-assess-cost/SKILL.md'),
  'utf-8',
)
const COST_GUIDELINE_DATASET = readFileSync(
  join(DATASET_KB, 'guidelines/quality-assurance/cost-assessment.md'),
  'utf-8',
)
const COST_GUIDELINE_MIRROR = readFileSync(
  join(MIRROR_KB, 'guidelines/quality-assurance/cost-assessment.md'),
  'utf-8',
)
const NEXT_DATASET = readFileSync(join(DATASET_SKILLS, 'next/SKILL.md'), 'utf-8')
const NEXT_MIRROR = readFileSync(join(MIRROR_SKILLS, 'pair-next/SKILL.md'), 'utf-8')
const SKILLS_GUIDE_DATASET = readFileSync(join(DATASET_KB, 'skills-guide.md'), 'utf-8')
const SKILLS_GUIDE_MIRROR = readFileSync(join(MIRROR_KB, 'skills-guide.md'), 'utf-8')

describe('assess-cost.md — skill structure (#226)', () => {
  for (const [label, content] of [
    ['dataset', ASSESS_COST_DATASET],
    ['mirror', ASSESS_COST_MIRROR],
  ] as const) {
    it(`${label} is declared output-only (writes nothing, blocks nothing)`, () => {
      expect(content.toLowerCase()).toContain('output-only')
      // No adoption-write step — the skill never persists anything itself.
      expect(content).not.toMatch(/#+\s*Step\s*\d+:\s*Write Adoption File/i)
      expect(content.toLowerCase()).toMatch(/never blocks|does not block|no blocking/)
    })

    it(`${label} emits the §3.3 cost class token green|yellow|orange|red`, () => {
      expect(content).toContain('cost:green|yellow|orange|red')
    })

    it(`${label} feeds the classification matrix cost dimension with a 1-line verdict + details (D22)`, () => {
      expect(content).toContain('D22')
      expect(content.toLowerCase()).toContain('<details>')
    })

    it(`${label} keeps the signal catalog in the guideline, not the skill (D17/D21)`, () => {
      expect(content).toContain('cost-assessment.md')
      expect(content).toMatch(/D17|D21/)
    })

    it(`${label} is provider-agnostic — no hardcoded provider list, providers via adoption/KB`, () => {
      expect(content.toLowerCase()).toMatch(/provider-agnostic|no provider names/)
    })

    it(`${label} HALTs when the quality model is missing`, () => {
      expect(content).toMatch(/HALT/)
      expect(content.toLowerCase()).toContain('quality model')
    })

    it(`${label} defaults to green when no cost surface is touched (AC4)`, () => {
      expect(content.toLowerCase()).toContain('no cost surface')
    })
  }
})

/**
 * The Arguments-TABLE row declaring `$arg` (empty string when absent).
 *
 * Anchored to the row's FIRST cell, not a bare substring search: prose (and other
 * rows' descriptions) mention `$period`/`$mode`, so a substring match silently
 * resolves to the wrong line and the assertion goes vacuous — e.g. before this
 * anchoring, `argumentRow(content, 'period')` returned the `$mode` row, whose
 * description mentions `$period`, so deleting the `$period` row left the guard green.
 */
function argumentRow(content: string, arg: string): string {
  return (
    content
      .split('\n')
      .map(line => line.trimStart())
      .filter(line => line.startsWith('|'))
      .find(line => line.split('|')[1]?.trim() === `\`$${arg}\``) ?? ''
  )
}

/**
 * The slice of `content` between two headings — from `start` up to (not including)
 * the next occurrence of `end` — or '' when `start` is absent.
 *
 * Report-mode claims are asserted against the STEP slice, not the whole file. A
 * file-wide substring assertion goes vacuous the moment the phrase it matches also
 * appears elsewhere in the spec: drift injection on the round-1 head showed that
 * deleting the entire `## Report Mode` block (Steps 7–11, ~7.9k chars) left most of
 * these assertions green, because the surviving Output Format template, Edge Cases
 * and Notes carried every matched phrase — i.e. the regression class the guard exists
 * for (steps removed or weakened) was not caught. Slicing gives each claim the
 * section that actually has to carry it, the same first-anchor discipline
 * `argumentRow` applies to table rows.
 */
function section(content: string, start: string, end: string): string {
  const from = content.indexOf(start)
  if (from === -1) return ''
  const to = content.indexOf(end, from + start.length)
  return content.slice(from, to === -1 ? content.length : to)
}

const REPORT_MODE_HEADING = '## Report Mode (period cost monitoring)'
const OUTPUT_FORMAT_HEADING = '## Output Format'
const COMPOSITION_HEADING = '## Composition Interface'
const STEP_1_HEADING = '### Step 1: Detect Mode'
const STEP_2_HEADING = '### Step 2: Resolve the Rule Set'

describe('assess-cost.md — report mode (#281)', () => {
  for (const [label, content] of [
    ['dataset', ASSESS_COST_DATASET],
    ['mirror', ASSESS_COST_MIRROR],
  ] as const) {
    // Steps 7–11 (the algorithm), the rendered output templates, and mode detection.
    const steps = section(content, REPORT_MODE_HEADING, OUTPUT_FORMAT_HEADING)
    const output = section(content, OUTPUT_FORMAT_HEADING, COMPOSITION_HEADING)
    const modeDetection = section(content, STEP_1_HEADING, STEP_2_HEADING)

    it(`${label} has the report-mode step section, the output templates and mode detection`, () => {
      // Guards the slices themselves: if a heading is renamed or a section deleted,
      // this fails loudly instead of turning every assertion below into a no-op.
      expect(steps).not.toBe('')
      expect(output).not.toBe('')
      expect(modeDetection).not.toBe('')
    })

    it(`${label} declares $mode with both classify and report`, () => {
      const row = argumentRow(content, 'mode')
      expect(row).not.toBe('')
      expect(row).toContain('classify')
      expect(row).toContain('report')
    })

    it(`${label} report mode is bidirectional: predicted class vs. real signals, drift flagged (AC1)`, () => {
      const lower = steps.toLowerCase()
      expect(lower).toContain('bidirectional')
      expect(lower).toMatch(/predicted[^.\n]*\breal\b|predicted-vs-real/)
      expect(lower).toContain('drift')
    })

    it(`${label} report mode is period-scoped over the window's merged PRs (AC1)`, () => {
      const lower = steps.toLowerCase()
      expect(lower).toContain('merged pr')
      expect(argumentRow(content, 'period')).not.toBe('')
    })

    it(`${label} excludes closed-unmerged PRs — no merged diff, so no real class`, () => {
      // Step 9.1 derives `real` from the MERGED diff, so an abandoned/rejected PR has
      // no real class: collecting it would either stall the run or invent a class for
      // a change that never shipped, polluting drift and the class distribution.
      const lower = steps.toLowerCase()
      expect(lower).toMatch(/closed-unmerged prs are excluded|closed-unmerged.{0,40}excluded/)
      expect(lower).toMatch(/no merged diff/)
      // Collection keys on the MERGE date, not any close date (`**merge** date`).
      expect(lower).toMatch(/\*{0,2}merge\*{0,2} date/)
    })

    it(`${label} states how a PR resolves to its story before reading the prediction`, () => {
      // Precedence 1 reads the STORY-side matrix, so without a PR->story rule the
      // primary prediction source is unreachable and a period with real predictions
      // silently headlines "cost was never assessed".
      expect(steps).toContain('Story/Epic:')
      expect(steps).toMatch(/linked issue/i)
      expect(steps).toMatch(/US-<id>/)
      // The unresolved case is a distinct, separately counted diagnosis.
      expect(steps).toContain('prediction source unresolved')
    })

    it(`${label} bounds context by batching instead of refusing a large window`, () => {
      // The default $period is the current calendar MONTH, which on an active repo
      // holds far more PRs than any small per-run cap: a cap would make the default
      // window produce no panel at all (AC2) and contradict the panel convention's
      // "never a silent skip and never a failed run". Bounded memory must come from
      // batching + discarding each diff, not from refusing to write.
      const lower = steps.toLowerCase()
      expect(lower).toContain('no per-run pr cap')
      expect(lower).toMatch(/batch/)
      expect(lower).toMatch(/discard the diff/)
      expect(lower).not.toContain('window too large')
      // The context bound rests on retain-and-discard, not on a skill-local batch
      // constant the doc layer does not own (working-area.md says only "in batches").
      // "one PR at a time, in small batches (~10 per batch)" left the unit of work
      // ambiguous — 1 or 10 — so the number is gone and the rule is explicit.
      expect(steps).not.toMatch(/~\s*\d+\s*PRs? per batch/i)
      expect(lower).toMatch(/no batch size is prescribed here/)
      expect(lower).toMatch(/not on any batch constant/)
      // The announced count is output, never an implied prompt: report mode may run
      // unattended, so a run that waited for an answer would stall forever.
      expect(lower).toContain('continue without waiting')
      expect(lower).toMatch(/never a prompt/)
      // Truncation stays illegitimate unless it is visible in the headline.
      expect(lower).toContain('never a _silently_ truncated panel')
      expect(steps).toContain('**Coverage**: N of M merged PRs processed')
    })

    it(`${label} records the resolved rule-set revision in the panel headline`, () => {
      // The panel is updated in place and warns that drift is measured against the
      // CURRENT catalog; without the resolved input revision that caveat cannot be
      // checked against a re-run. An input revision (not a wall clock) also keeps
      // the convention's "same inputs => same content".
      expect(steps.toLowerCase()).toContain('rule-set revision')
      expect(output).toContain('**Rule set**')
      expect(output).toMatch(/cost-assessment\.md` @ <revision>/)
      // A run timestamp would break panel idempotency. Asserted on the RENDERED
      // template, not only on the prose that forbids it: the prose assertion below
      // is satisfied by the prohibition sentence itself, so on its own it stays
      // green while the regression it exists to catch (a `**Generated**: <ISO-8601>`
      // line added to the panel headline) lands untouched.
      expect(output).not.toMatch(/^\*\*Generated/im)
      expect(output).not.toMatch(/<timestamp>|<ISO-8601>|<YYYY-MM-DD>T/)
      // Secondary: the prohibition is stated, so an executor cannot re-add one.
      expect(steps.toLowerCase()).toMatch(/generated at/)
    })

    it(`${label} never lets a lower-coverage re-run overwrite a more complete panel`, () => {
      // The in-place update (Step 11.2) is not unconditional: a context-tight re-run
      // that processes 40 of 73 must not replace a 73-of-73 panel, or the complete
      // figures are destroyed and the resulting drop in drift reads as improvement
      // while being a pure run artifact — and "same inputs => same content" would
      // depend on how far a run got rather than on its inputs.
      const lower = steps.toLowerCase()
      expect(lower).toContain('coverage never regresses')
      expect(lower).toMatch(/not unconditional/)
      expect(lower).toMatch(/keep it|kept rather than overwritten/)
      expect(output).toMatch(/kept \(existing panel covers more of the period/)
      // Round-5 finding 2: the basis is the absolute `**Monitored**` count, because
      // an open period's denominator grows and "complete as of then" is not
      // comparable across runs.
      expect(lower).toMatch(/how many prs each panel actually processed/)
      expect(lower).toMatch(/completeness is not the comparison basis/)
      // Round-5 finding 1: merging rows without recomputing the headline lets the
      // table name more PRs than the headline counts, and leaves a PR listed as
      // unprocessed above a row it now has.
      expect(lower).toMatch(/recompute the headline over the union of processed prs/)
      expect(lower).toMatch(/must never still be named as unprocessed/)
    })

    it(`${label} renders unprocessed PRs only in the Coverage line, counted separately`, () => {
      // One rendering site for the ids (the headline Coverage line, where the
      // shortfall is stated), and `unprocessed` as a fifth classification member:
      // folding an unmeasured PR into `no prediction` inflates the never-assessed
      // figure with PRs that were never measured at all — the very conflation the
      // 8.2.1 diagnosis split exists to prevent.
      expect(steps).toContain('**Coverage**: N of M merged PRs processed')
      expect(steps.toLowerCase()).toMatch(/no per-pr row/)
      expect(steps).toMatch(/fifth, separately counted member — `unprocessed`/)
      expect(steps.toLowerCase()).toMatch(/never.{0,40}folded into `no prediction`/)
      // The figures are over the PROCESSED PRs; M appears only in the Coverage line
      // (otherwise `Monitored: N` and the distribution silently disagree on N vs. M).
      expect(steps).toContain('What the figures count')
      expect(steps).toMatch(/\*\*Monitored\*\*`?, the drift counts/)
      // The panel template must not send the ids to the per-PR section instead.
      expect(output).not.toMatch(/unprocessed ids in the per-PR section/)
      expect(output).toMatch(/unprocessed: #ID/)
    })

    it(`${label} writes the consolidated panel into the cost reports area (AC2, D14)`, () => {
      expect(steps).toContain('.pair/working/reports/cost/')
      expect(steps.toLowerCase()).toContain('consolidated panel')
      expect(argumentRow(content, 'output')).not.toBe('')
    })

    it(`${label} renders the panel headline-first with collapsed breakdown (AC2, D22)`, () => {
      // Panel-SPECIFIC markers on the Output Format slice: a bare `D22` + `<details>`
      // pair was already true before report mode existed (classification mode's own
      // template), so it guarded nothing about the panel.
      expect(output).toMatch(/^#\s*Cost Panel — <period-key>\s*$/m)
      expect(output).toContain('**Monitored**')
      expect(output).toContain('**Drift**')
      expect(output).toContain('<summary>Per-PR predicted vs. real</summary>')
      expect(output).toContain('<summary>Class distribution — predicted vs. real</summary>')
    })

    it(`${label} is idempotent by period key — same period updates in place (AC3)`, () => {
      const lower = steps.toLowerCase()
      expect(lower).toContain('period key')
      expect(lower).toContain('in place')
      expect(lower).toMatch(/one file per period|never a second (file|panel)|not duplicated/)
    })

    it(`${label} reuses the KB period-keyed panel convention rather than restating it`, () => {
      expect(steps).toContain('working-area.md')
    })

    it(`${label} degrades gracefully when there is no cost data for the period (AC4)`, () => {
      expect(steps).toContain('no cost data for this period')
      expect(steps.toLowerCase()).toContain('tag projection')
    })

    it(`${label} keeps unpredicted PRs as "no prediction — real only", never dropped`, () => {
      expect(steps).toContain('no prediction — real only')
      expect(steps.toLowerCase()).toMatch(/never drop|not dropped|never silently drop/)
    })

    it(`${label} reports deploy-match as not available without deploy telemetry`, () => {
      const lower = steps.toLowerCase()
      expect(lower).toContain('deploy-match')
      expect(lower).toMatch(/deploy-match[\s\S]{0,240}not available/)
    })

    it(`${label} makes the telemetry-present deploy-match branch executable or explicitly deferred`, () => {
      // Named declaration + a definition of "observed cost movement", plus the status
      // of the positive path — otherwise it reads as a promise the spec cannot keep.
      expect(steps).toContain('## Cost & Billing Telemetry')
      expect(steps).toContain('observed cost movement')
      expect(steps.toLowerCase()).toMatch(/deferred/)
    })

    it(`${label} presents the panel inline when the reports area is not writable`, () => {
      const lower = steps.toLowerCase()
      expect(lower).toContain('not writable')
      expect(lower).toMatch(/not writable[\s\S]{0,240}inline/)
    })

    it(`${label} keeps classification mode output-only (report mode is the only writer)`, () => {
      const lower = content.toLowerCase()
      expect(lower).toMatch(/classification mode[^.\n]*(writes no files|output-only)/)
      // Report mode writes the panel and nothing else — never adoption, never issues.
      expect(lower).toMatch(/no adoption|never adoption|writes no adoption/)
    })

    it(`${label} report mode consumes the cost class, it does not redefine the criteria`, () => {
      expect(steps.toLowerCase()).toMatch(/does not re-?derive|never re-?derives|not redefined/)
    })

    it(`${label} sources the predicted class from refinement only — never the review-time class`, () => {
      // Without this precedence, `predicted` would be read from the PR body/label that
      // review overwrites with the REVIEW-time class — the same computation `real` uses —
      // so every re-classified PR would report `match` and AC1's drift would be invisible.
      const lower = steps.toLowerCase()
      expect(lower).toContain('never read the review-time class as the prediction')
      expect(lower).toMatch(/refinement-time only|shift-left value/)
      // Unresolvable prediction degrades, never fabricates a match.
      expect(lower).toContain('never a fabricated match')
      // Cross-references cite the rule by its real number (8.2.1, not 8.2).
      expect(steps).toContain("Step 8.2.1's precedence rule")
    })

    it(`${label} names the current catalog as the drift baseline and a confounder`, () => {
      // `real` is re-derived against TODAY's catalog while each prediction was made
      // against the catalog at refinement, so a catalog change inside the window reads
      // as drift even when every prediction was right at the time.
      const lower = steps.toLowerCase()
      expect(lower).toMatch(/current.{0,40}(catalog|rule set)/)
      expect(lower).toContain('confounder')
      expect(output.toLowerCase()).toMatch(/current.{0,40}(catalog|rule set)/)
    })

    it(`${label} defaults to classify — report mode never runs implicitly`, () => {
      const row = argumentRow(content, 'mode')
      expect(row.toLowerCase()).toContain('default')
      const lower = modeDetection.toLowerCase()
      expect(lower).toMatch(/report.{0,80}never runs implicitly|never runs implicitly/)
      // The pre-fix "no surface in context → report" auto-detect must stay gone.
      expect(content.toLowerCase()).not.toContain('no surface in context')
    })

    it(`${label} treats $output as report-only and never as a mode signal`, () => {
      // A report-only argument supplied in a classify run must be reported, not dropped;
      // and it must not select the only file-writing mode.
      expect(modeDetection).toContain('$output')
      expect(modeDetection.toLowerCase()).toMatch(/not a mode signal/)
      expect(modeDetection.toLowerCase()).toMatch(/ignored/)
      expect(argumentRow(content, 'output').toLowerCase()).toContain('not a mode signal')
    })

    it(`${label} qualifies the no-cost-data headline when real-only rows are listed`, () => {
      // AC4's literal phrase is kept, but a bare "no cost data" headline above a table
      // of real classes contradicts itself — the predicted/real distinction is required.
      // "no CLOSED PRs" would contradict the `Excluded: N closed unmerged` line
      // rendered right under it when the window holds only abandoned PRs.
      expect(steps).toContain('no merged PRs in the window')
      expect(steps).not.toContain('no closed PRs in the window')
      expect(steps).toMatch(/no _?predicted_? cost data/i)
      expect(steps.toLowerCase()).toContain('real-only rows below')
    })

    it(`${label} cites the R6.3/R6.4 cost-monitoring requirements and where they live`, () => {
      expect(steps).toContain('R6.3')
      expect(steps).toContain('R6.4')
      // The citation must not dangle: quality-model.md §3.3 carries the pointer back.
      expect(steps).toContain('quality-model.md')
    })
  }
})

describe('cost-assessment.md — guideline (#226 T2)', () => {
  for (const [label, content] of [
    ['dataset', COST_GUIDELINE_DATASET],
    ['mirror', COST_GUIDELINE_MIRROR],
  ] as const) {
    it(`${label} defines the multi-provider cost-signal catalog`, () => {
      expect(content.toLowerCase()).toContain('cost-signal catalog')
      // A representative sample of the catalog signals must be present.
      for (const signal of ['paid-SDK', 'IaC', 'cron', 'queue', 'LLM']) {
        expect(content).toContain(signal)
      }
    })

    it(`${label} maps signals to the green|yellow|orange|red class scale`, () => {
      expect(content).toContain('cost:green|yellow|orange|red')
      expect(content.toLowerCase()).toContain('highest detected signal')
    })

    it(`${label} has an AWS-specific section and points other providers to adoption links`, () => {
      expect(content).toMatch(/## .*AWS/)
      expect(content.toLowerCase()).toMatch(/adoption link|adoption-link/)
    })

    it(`${label} has a cost gotchas section`, () => {
      expect(content.toLowerCase()).toContain('gotcha')
    })
  }
})

describe('assess-cost catalog registration (#226)', () => {
  it('dataset skill directory exists', () => {
    expect(existsSync(join(DATASET_SKILLS, 'capability/assess-cost/SKILL.md'))).toBe(true)
  })

  for (const [label, next, guide] of [
    ['dataset', NEXT_DATASET, SKILLS_GUIDE_DATASET],
    ['mirror', NEXT_MIRROR, SKILLS_GUIDE_MIRROR],
  ] as const) {
    it(`${label} next catalog lists assess-cost and states 31 capability / 42 total`, () => {
      expect(next).toMatch(/assess-cost/)
      expect(next).toContain('31 capability')
      expect(next).toContain('42 skills')
    })

    it(`${label} skills-guide lists assess-cost and states 31 capability / 42 total`, () => {
      expect(guide).toMatch(/assess-cost/)
      expect(guide).toContain('31 capability')
      // Round-3 nit: the title promised the total too, but only the capability
      // count was asserted (the guide states it as "Total: 42").
      expect(guide).toMatch(/Total: 42/)
    })
  }
})

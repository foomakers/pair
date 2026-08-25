import { describe, it, expect } from 'vitest'
import { existsSync, readFileSync } from 'fs'
import { join } from 'path'

// Conformance guard for story #222: the `analyze-delivery-metrics` capability — the
// Delivery-pillar retro panel (bug resolution time, PR lead time, process adoption, R9.5).
// One file per target KB artifact (ADL 2026-07-18-conformance-test-per-file-not-per-story):
// this file guards the SKILL, `delivery-metrics.test.ts` guards the RULES it applies, and
// `working-area.test.ts` guards the panel convention shared with assess-cost's cost panel.
//
// The invariants worth a guard are the ones a plausible edit would quietly break:
//   AC1 the three families come from the adopted tool, per the guideline, into the panel;
//   AC2 the panel is idempotent by period key and never regresses in coverage;
//   AC3 headline-first (D22) — figures readable in a screen, breakdowns collapsed;
//   AC4 the output path honours the override, else the reports-area default;
//   + the edge cases the story pins: sparse period, tool unreachable (nothing written),
//     unlabeled bugs (mapping → generic + counted).
//
// Assertions run against NORMALIZED text (emphasis/code markers stripped, whitespace
// collapsed) so no claim goes vacuously green because prose put a marker between two
// required words; each was injection-tested by deleting the claim and confirming the red.

const DATASET_SKILLS = join(__dirname, '../../dataset/.skills')
const MIRROR_SKILLS = join(__dirname, '../../../../.claude/skills')
const DATASET_KB = join(__dirname, '../../dataset/.pair/knowledge')
const MIRROR_KB = join(__dirname, '../../../../.pair/knowledge')

const DATASET_SKILL_REL = 'capability/analyze-delivery-metrics/SKILL.md'
const MIRROR_SKILL_REL = 'pair-capability-analyze-delivery-metrics/SKILL.md'

const SKILL_DATASET = readFileSync(join(DATASET_SKILLS, DATASET_SKILL_REL), 'utf-8')
const SKILL_MIRROR = readFileSync(join(MIRROR_SKILLS, MIRROR_SKILL_REL), 'utf-8')

const NEXT_DATASET = readFileSync(join(DATASET_SKILLS, 'next/SKILL.md'), 'utf-8')
const NEXT_MIRROR = readFileSync(join(MIRROR_SKILLS, 'pair-next/SKILL.md'), 'utf-8')
const GUIDE_DATASET = readFileSync(join(DATASET_KB, 'skills-guide.md'), 'utf-8')
const GUIDE_MIRROR = readFileSync(join(MIRROR_KB, 'skills-guide.md'), 'utf-8')

const CORPORA = [
  { label: 'dataset', content: SKILL_DATASET },
  { label: 'mirror', content: SKILL_MIRROR },
] as const

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

describe('analyze-delivery-metrics — skill contract (#222)', () => {
  for (const { label, content } of CORPORA) {
    const lower = normalize(content)

    it(`${label} declares only $period and $output`, () => {
      const args = section(content, '## Arguments', '## Rule Set')
      expect(args).toContain('$period')
      expect(args).toContain('$output')
      // A third knob would be a surface the story does not ask for; the panel
      // aggregates a whole window and never scopes by path.
      expect(args).not.toContain('$scope')
      expect(args).not.toContain('$diff')
    })

    it(`${label} resolves through the Argument > Adoption > KB default cascade`, () => {
      const rules = normalize(section(content, '## Rule Set', '## Algorithm'))
      expect(rules).toMatch(/argument > adoption > kb default/)
      expect(rules).toContain('delivery-metrics')
      expect(rules).toContain('way-of-working-pm-resolution.md')
      expect(rules).toMatch(/adoption absence never halts|never halts a run/)
    })

    it(`${label} keeps the definitions in the guideline, never in the skill (D17/D21)`, () => {
      expect(content).toContain('delivery-metrics.md')
      expect(content).toContain('D17/D21')
      expect(lower).toMatch(/the definitions are not here/)
      expect(lower).toMatch(/never a change to this skill/)
      expect(content).toContain('R2.12')
    })

    it(`${label} HALTs when the definitions are missing rather than inventing a clock`, () => {
      const step0 = normalize(section(content, '### Step 0', '### Step 1'))
      expect(step0).toContain('halt')
      expect(step0).toMatch(/not defaults this skill invents|the rule set, not defaults/)
    })

    it(`${label} resolves the period key in the convention's three normalized forms (AC4)`, () => {
      const step1 = section(content, '### Step 1', '### Step 2')
      expect(step1).toContain('YYYY-MM')
      expect(step1).toContain('YYYY-Wnn')
      expect(step1).toContain('YYYY-MM-DD_YYYY-MM-DD')
      const step1Lower = normalize(step1)
      expect(step1Lower).toMatch(/normalization rule/)
      expect(step1Lower).toMatch(/never guess a period/)
    })

    it(`${label} derives the previous equal-length window for the trend`, () => {
      expect(lower).toMatch(/previous window of equal length/)
      // Recomputed, not read from an older panel written under other rules.
      expect(lower).toMatch(/rather than read from an older panel|same definitions/)
    })

    // Review of #461, Major 2 (skill side): the baseline is resolved PER KEY FORM in the
    // guideline. The skill must defer to that rule, not restate a bare "same duration"
    // that contradicts it for a calendar key.
    it(`${label} defers the trend baseline to the guideline's per-key-form rule`, () => {
      const step1 = normalize(section(content, '### Step 1', '### Step 2'))
      expect(step1).toMatch(/per key form|per the guideline/)
      expect(step1).not.toMatch(/same duration/)
    })

    it(`${label} defaults the output to the metrics reports area and honours the override (AC4)`, () => {
      expect(content).toContain('.pair/working/reports/metrics/')
      expect(content).toContain('working_path')
      expect(content).toContain('<period-key>-delivery-metrics.md')
    })

    it(`${label} routes item-side to the PM tool and PR-side to the code host`, () => {
      const step2 = normalize(section(content, '### Step 2', '### Step 3'))
      expect(step2).toContain('pm tool')
      expect(step2).toContain('code host')
      expect(step2).toMatch(/absent code-host/)
    })

    it(`${label} HALTs on an unreachable tool with nothing written (edge case)`, () => {
      const step3 = normalize(section(content, '### Step 3', '### Step 4'))
      expect(step3).toContain('halt')
      expect(step3).toMatch(/no panel, no partial file|written nothing/)
      // "unreachable" and "no such surface" must stay distinct diagnoses.
      expect(step3).toMatch(/no pr surface/)
      expect(step3).toContain('not available')
    })

    it(`${label} collects both durations' populations on the closing event (AC1)`, () => {
      const step4 = normalize(section(content, '### Step 4', '### Step 5'))
      expect(step4).toMatch(/issues closed inside the window/)
      expect(step4).toMatch(/pull requests merged inside the window/)
      expect(step4).toContain('closed-unmerged')
    })

    it(`${label} keeps a large window bounded by retain-and-discard, never a refusal`, () => {
      const step4 = normalize(section(content, '### Step 4', '### Step 5'))
      expect(step4).toMatch(/item by item/)
      expect(step4).toMatch(/discarding the payload/)
      expect(step4).toMatch(/never a reason to refuse/)
      // Non-interactive: announcing a count must never become a prompt.
      expect(step4).toMatch(/continue without waiting/)
    })

    it(`${label} names unprocessed items only in the Coverage line`, () => {
      expect(lower).toMatch(/coverage/)
      expect(lower).toMatch(/and nowhere else|the only place/)
      expect(lower).toMatch(/no per-item row|gets no row/)
    })

    it(`${label} maps defects adoption → tool default → generic, and counts the unmapped`, () => {
      const step5 = normalize(section(content, '### Step 5', '### Step 6'))
      expect(step5).toMatch(/adoption declaration/)
      expect(step5).toMatch(/native defect marker/)
      expect(step5).toMatch(/counted as a generic issue/)
      expect(step5).toMatch(/counted as generic/)
      expect(step5).toMatch(/reopened/)
      expect(step5).toMatch(/still open at period end|open at period end/)
    })

    it(`${label} computes exactly the three families with median + p75 (AC1)`, () => {
      const step6 = normalize(section(content, '### Step 6', '### Step 7'))
      expect(step6).toContain('bug resolution time')
      expect(step6).toContain('pr lead time')
      expect(step6).toContain('adoption')
      expect(step6).toContain('median')
      expect(step6).toContain('p75')
    })

    it(`${label} reports low sample with no trend, never a fabricated one (edge case)`, () => {
      const step6 = normalize(section(content, '### Step 6', '### Step 7'))
      expect(step6).toMatch(/low sample \(n < 5\)/)
      expect(step6).toMatch(/no trend/)
      expect(step6).toMatch(/noise presented as a signal/)
    })

    it(`${label} reads an absent adoption source as not available, never 0%`, () => {
      const step6 = normalize(section(content, '### Step 6', '### Step 7'))
      expect(step6).toContain('not available')
      expect(step6).toMatch(/never 0%/)
    })

    it(`${label} renders headline-first with collapsed breakdowns (AC3, D22)`, () => {
      const step7 = section(content, '### Step 7', '### Step 8')
      expect(step7).toContain('D22')
      expect(normalize(step7)).toMatch(/headline-first/)
      expect(normalize(step7)).toMatch(/one screen/)
      expect(step7).toContain('<details>')
      // The panel points at the definitions instead of restating them.
      expect(normalize(step7)).toMatch(/instead of restating/)
    })

    it(`${label} records input provenance and never a run timestamp (AC2)`, () => {
      const step7 = normalize(section(content, '### Step 7', '### Step 8'))
      expect(step7).toMatch(/input provenance/)
      expect(step7).toMatch(/same inputs ⇒ same content/)
      expect(step7).toMatch(/generated at/)
      expect(step7).toMatch(/never added/)
    })

    it(`${label} updates the panel in place, one file per period (AC2)`, () => {
      const step7 = normalize(section(content, '### Step 7', '### Step 8'))
      expect(step7).toMatch(/updates that panel in place/)
      expect(step7).toMatch(/one file per period/)
      expect(step7).toContain('d14')
    })

    it(`${label} refuses to let a lower-coverage run overwrite a fuller panel (AC2)`, () => {
      const step7 = normalize(section(content, '### Step 7', '### Step 8'))
      expect(step7).toMatch(/coverage never regresses/)
      expect(step7).toMatch(/how many items each panel actually processed/)
      expect(step7).toMatch(/recompute the headline over the union/)
    })

    it(`${label} still writes a panel for an empty period, with the reason`, () => {
      const step7 = normalize(section(content, '### Step 7', '### Step 8'))
      expect(step7).toMatch(/no data for the period/)
      expect(step7).toMatch(/with the reason/)
    })

    it(`${label} degrades to an inline panel when the reports area is not writable`, () => {
      const step7 = normalize(section(content, '### Step 7', '### Step 8'))
      expect(step7).toMatch(/not writable/)
      expect(step7).toMatch(/inline/)
      expect(step7).toMatch(/the run succeeds/)
    })

    it(`${label} writes exactly one file and asserts no verdict`, () => {
      expect(lower).toMatch(/report-only/)
      expect(lower).toMatch(/no adoption content/)
      expect(lower).toMatch(/no backlog items/)
      expect(lower).toMatch(/no merge authority/)
    })

    it(`${label} is standalone, on demand, and never a review input (D18)`, () => {
      const composition = normalize(section(content, '## Composition Interface', '## Edge Cases'))
      expect(composition).toMatch(/composes nothing and is composed by nothing/)
      expect(composition).toMatch(/on demand only/)
      expect(composition).toContain('d18')
      expect(composition).toMatch(/never composes it|not a review input/)
      expect(composition).toMatch(/non-interactive/)
    })

    it(`${label} carries the run output block and the panel template`, () => {
      const output = section(content, '## Output Format', '## Composition Interface')
      expect(output).toContain('DELIVERY METRICS')
      expect(output).toContain('Panel:')
      expect(output).toContain('# Delivery Metrics — <period-key>')
      expect(output).toContain('Coverage')
      expect(output).toContain('Inputs')
    })
  }
})

describe('analyze-delivery-metrics — catalog registration (#222)', () => {
  it('the dataset skill directory exists at the registry entry depth', () => {
    expect(existsSync(join(DATASET_SKILLS, DATASET_SKILL_REL))).toBe(true)
    expect(existsSync(join(MIRROR_SKILLS, MIRROR_SKILL_REL))).toBe(true)
  })

  for (const [label, next, guide] of [
    ['dataset', NEXT_DATASET, GUIDE_DATASET],
    ['mirror', NEXT_MIRROR, GUIDE_MIRROR],
  ] as const) {
    it(`${label} next catalog lists it and states 32 capability / 44 total`, () => {
      expect(next).toMatch(/analyze-delivery-metrics/)
      expect(next).toContain('32 capability')
      expect(next).toContain('44 skills')
    })

    // Review of #461, Minor 6: next's "Full catalog coverage" note enumerates the skills
    // the cascade cannot surface. This one is on-demand only with no cascade row, so it
    // belongs in that list — otherwise the note reads as if every absence were a bug.
    it(`${label} next's full-catalog-coverage note names it as not cascade-suggested`, () => {
      const note = next.split('\n').find(l => l.includes('Full catalog coverage')) ?? ''
      expect(note).toContain('analyze-delivery-metrics')
    })

    it(`${label} skills-guide lists it under Analysis (3) and states 44 total`, () => {
      expect(guide).toMatch(/analyze-delivery-metrics/)
      expect(guide).toContain('Analysis Skills (3)')
      expect(guide).toMatch(/Total: 44/)
    })

    it(`${label} skills-guide states it writes its own panel — the D14 exception`, () => {
      const row = guide.split('\n').find(l => l.includes('analyze-delivery-metrics')) ?? ''
      expect(row).toContain('.pair/working/reports/metrics/')
      expect(row).toContain('D14')
    })
  }
})

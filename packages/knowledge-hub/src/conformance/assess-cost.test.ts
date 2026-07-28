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
// monitoring (refinement-time predicted class vs. real/observed signals on closed
// PRs, drift flagged, deploy-match degraded to "not available" without telemetry)
// rendered as a consolidated panel under .pair/working/reports/cost/, idempotent by
// period key. The period-keyed panel convention itself lives in the KB working-area
// guideline (shared with #222's AI-metrics reports — one reports-area pattern, not
// two); the skill applies it. Classification mode stays output-only.

const DATASET_SKILLS = join(__dirname, '../../dataset/.skills')
const MIRROR_SKILLS = join(__dirname, '../../../../.claude/skills')
const DATASET_KB = join(__dirname, '../../dataset/.pair/knowledge')
const MIRROR_KB = join(__dirname, '../../../../.pair/knowledge')

const WORKING_AREA_REL = 'guidelines/collaboration/working-area.md'

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
const WORKING_AREA_DATASET = readFileSync(join(DATASET_KB, WORKING_AREA_REL), 'utf-8')
const WORKING_AREA_MIRROR = readFileSync(join(MIRROR_KB, WORKING_AREA_REL), 'utf-8')
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

/** The Arguments-table row declaring `$arg` (empty string when absent). */
function argumentRow(content: string, arg: string): string {
  return content.split('\n').find(line => line.includes(`\`$${arg}\``)) ?? ''
}

describe('assess-cost.md — report mode (#281)', () => {
  for (const [label, content] of [
    ['dataset', ASSESS_COST_DATASET],
    ['mirror', ASSESS_COST_MIRROR],
  ] as const) {
    it(`${label} declares $mode with both classify and report`, () => {
      const row = argumentRow(content, 'mode')
      expect(row).not.toBe('')
      expect(row).toContain('classify')
      expect(row).toContain('report')
    })

    it(`${label} report mode is bidirectional: predicted class vs. real signals, drift flagged (AC1)`, () => {
      const lower = content.toLowerCase()
      expect(lower).toContain('bidirectional')
      expect(lower).toMatch(/predicted[^.\n]*\breal\b|predicted-vs-real/)
      expect(lower).toContain('drift')
    })

    it(`${label} report mode is period-scoped over closed PRs (AC1)`, () => {
      const lower = content.toLowerCase()
      expect(lower).toContain('closed pr')
      expect(argumentRow(content, 'period')).not.toBe('')
    })

    it(`${label} writes the consolidated panel into the cost reports area (AC2, D14)`, () => {
      expect(content).toContain('.pair/working/reports/cost/')
      expect(content.toLowerCase()).toContain('consolidated panel')
      expect(argumentRow(content, 'output')).not.toBe('')
    })

    it(`${label} renders the panel headline-first with collapsed breakdown (AC2, D22)`, () => {
      expect(content).toContain('D22')
      expect(content.toLowerCase()).toContain('<details>')
    })

    it(`${label} is idempotent by period key — same period updates in place (AC3)`, () => {
      const lower = content.toLowerCase()
      expect(lower).toContain('period key')
      expect(lower).toContain('in place')
      expect(lower).toMatch(/one file per period|never a second (file|panel)|not duplicated/)
    })

    it(`${label} reuses the KB period-keyed panel convention rather than restating it`, () => {
      expect(content).toContain('working-area.md')
    })

    it(`${label} degrades gracefully when there is no cost data for the period (AC4)`, () => {
      expect(content).toContain('no cost data for this period')
      expect(content.toLowerCase()).toContain('tag projection')
    })

    it(`${label} keeps unpredicted PRs as "no prediction — real only", never dropped`, () => {
      expect(content).toContain('no prediction — real only')
      expect(content.toLowerCase()).toMatch(/never drop|not dropped|never silently drop/)
    })

    it(`${label} reports deploy-match as not available without deploy telemetry`, () => {
      const lower = content.toLowerCase()
      expect(lower).toContain('deploy-match')
      expect(lower).toMatch(/deploy-match[\s\S]{0,240}not available/)
    })

    it(`${label} presents the panel inline when the reports area is not writable`, () => {
      const lower = content.toLowerCase()
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
      expect(content.toLowerCase()).toMatch(/does not re-?derive|never re-?derives|not redefined/)
    })
  }
})

describe('working-area.md — period-keyed report panels (#281)', () => {
  for (const [label, content] of [
    ['dataset', WORKING_AREA_DATASET],
    ['mirror', WORKING_AREA_MIRROR],
  ] as const) {
    it(`${label} defines the period key and its normalized forms`, () => {
      expect(content.toLowerCase()).toContain('period key')
      expect(content).toContain('YYYY-MM')
    })

    it(`${label} requires the panel to be updated in place — one file per period`, () => {
      const lower = content.toLowerCase()
      expect(lower).toContain('in place')
      expect(lower).toContain('one file per period')
    })

    it(`${label} requires headline-first rendering (D22) and honors the output override`, () => {
      expect(content).toContain('D22')
      expect(content.toLowerCase()).toMatch(/override/)
    })

    it(`${label} states the empty-period and not-writable degradations`, () => {
      const lower = content.toLowerCase()
      expect(lower).toMatch(/no data for (the|this) period/)
      expect(lower).toContain('not writable')
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
    it(`${label} next catalog lists assess-cost and states 30 capability / 40 total`, () => {
      expect(next).toMatch(/assess-cost/)
      expect(next).toContain('30 capability')
      expect(next).toContain('40 skills')
    })

    it(`${label} skills-guide lists assess-cost and states 30 capability / 40 total`, () => {
      expect(guide).toMatch(/assess-cost/)
      expect(guide).toContain('30 capability')
    })
  }
})

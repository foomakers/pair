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
    it(`${label} next catalog lists assess-cost and states 30 capability / 41 total`, () => {
      expect(next).toMatch(/assess-cost/)
      expect(next).toContain('30 capability')
      expect(next).toContain('41 skills')
    })

    it(`${label} skills-guide lists assess-cost and states 30 capability / 41 total`, () => {
      expect(guide).toMatch(/assess-cost/)
      expect(guide).toContain('30 capability')
      // Round-3 nit: the title promised the total too, but only the capability
      // count was asserted (the guide states it as "Total: 41").
      expect(guide).toMatch(/Total: 41/)
    })
  }
})

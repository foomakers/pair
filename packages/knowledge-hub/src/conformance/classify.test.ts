import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { join } from 'path'

// Conformance guard for story #233: pair-capability-classify builds the classification
// matrix by APPLYING the quality model (#221) — it owns no criteria of its own — and is
// composed by /pair-process-refine-story (refinement context) and /pair-process-review
// (review context). Grep-verifiable, dataset + installed mirror in lockstep, not an
// aspirational claim (same convention as assess-security.test.ts / adr-012's Callers Matrix).

const DATASET_SKILLS = join(__dirname, '../../dataset/.skills')
const MIRROR_SKILLS = join(__dirname, '../../../../.claude/skills')

const CLASSIFY_DATASET = readFileSync(join(DATASET_SKILLS, 'capability/classify/SKILL.md'), 'utf-8')
const CLASSIFY_MIRROR = readFileSync(
  join(MIRROR_SKILLS, 'pair-capability-classify/SKILL.md'),
  'utf-8',
)
const REFINE_DATASET = readFileSync(join(DATASET_SKILLS, 'process/refine-story/SKILL.md'), 'utf-8')
const REFINE_MIRROR = readFileSync(
  join(MIRROR_SKILLS, 'pair-process-refine-story/SKILL.md'),
  'utf-8',
)
const REVIEW_DATASET = readFileSync(join(DATASET_SKILLS, 'process/review/SKILL.md'), 'utf-8')
const REVIEW_MIRROR = readFileSync(join(MIRROR_SKILLS, 'pair-process-review/SKILL.md'), 'utf-8')

describe('classify.md — structure (#233)', () => {
  for (const [label, content] of [
    ['dataset', CLASSIFY_DATASET],
    ['mirror', CLASSIFY_MIRROR],
  ] as const) {
    it(`${label} exposes a $context argument with refinement and review branches (AC1, AC3)`, () => {
      expect(content).toMatch(/\|\s*`\$context`/)
      expect(content).toContain('refinement')
      expect(content).toContain('review')
    })

    it(`${label} applies the quality model and owns no criteria (D18)`, () => {
      expect(content).toContain('quality-model.md')
      expect(content).toMatch(/owns no criteria|no classification criteria of its own/i)
    })

    it(`${label} HALTs when the quality model doc is absent (edge case — #221 prerequisite)`, () => {
      expect(content).toMatch(/No quality model doc installed[\s\S]{0,120}HALT/)
      expect(content).toContain('#221')
    })

    it(`${label} builds the matrix twice and never lowers the review tier (AC3, D17)`, () => {
      expect(content).toMatch(/never lower/i)
      expect(content).toContain('D17')
      expect(content).toMatch(/floor/)
    })

    it(`${label} is deterministic — same input yields the same matrix (AC4)`, () => {
      expect(content).toMatch(/[Dd]eterministic/)
      expect(content).toMatch(/same (?:card\/PR|input)[\s\S]{0,80}identical|same matrix/)
    })

    it(`${label} gates tag emission on the ## Tag Projection declaration (AC2)`, () => {
      expect(content).toContain('## Tag Projection')
      expect(content).toContain('Active: risk')
      expect(content).toContain('Active: none')
      expect(content).toMatch(/propose[\s-]?then[\s-]?write|propose only the `risk` default/)
    })

    it(`${label} writes the matrix to the body regardless of tag projection (AC1)`, () => {
      expect(content).toMatch(
        /regardless of tag projection|Write the Matrix to the Body \(always\)/,
      )
    })

    it(`${label} respects the D22 reading budget — 1 line + <details>`, () => {
      expect(content).toContain('D22')
      expect(content).toContain('<details>')
    })

    it(`${label} reports coupling "not assessed" when sources are absent (AC6 edge, D21)`, () => {
      expect(content).toMatch(/not assessed/)
      expect(content).toContain('D21')
    })

    it(`${label} handles the label-API failure as non-blocking`, () => {
      expect(content).toMatch(/non-blocking/)
    })
  }
})

describe('/refine-story composes classify in refinement context (AC1 — #233)', () => {
  for (const [label, content, skillRef] of [
    ['dataset', REFINE_DATASET, '/classify'],
    ['mirror', REFINE_MIRROR, '/pair-capability-classify'],
  ] as const) {
    it(`${label} lists classify as a Composed Skill`, () => {
      const row = content
        .split('\n')
        .find(line => line.includes(`\`${skillRef}\``) && line.includes('Capability'))
      expect(row).toBeDefined()
    })

    it(`${label} composes classify with $context: refinement`, () => {
      expect(content).toContain(`Compose \`${skillRef}\` with \`$context: refinement\``)
    })
  }
})

describe('/review composes classify in review context (AC3 — #233)', () => {
  for (const [label, content, skillRef] of [
    ['dataset', REVIEW_DATASET, '/classify'],
    ['mirror', REVIEW_MIRROR, '/pair-capability-classify'],
  ] as const) {
    it(`${label} lists classify as a required Composed Skill in Phase 1`, () => {
      const row = content
        .split('\n')
        .find(line => line.includes(`\`${skillRef}\``) && line.includes('Capability'))
      expect(row).toBeDefined()
      expect(row).toMatch(/Yes/)
    })

    it(`${label} composes classify with $context: review (confirm-or-raise)`, () => {
      expect(content).toContain(`Compose \`${skillRef}\` with \`$context: review\``)
      expect(content).toMatch(/never lower/i)
    })
  }
})

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
const NEXT_DATASET = readFileSync(join(DATASET_SKILLS, 'next/SKILL.md'), 'utf-8')
const NEXT_MIRROR = readFileSync(join(MIRROR_SKILLS, 'pair-next/SKILL.md'), 'utf-8')

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

// DoD self-enforcement (#233): "no downstream consumer (gate/review/next) contains
// classification criteria" — classify owns the criteria, consumers only read the
// resulting matrix + tags (D18). The criteria's distinctive vocabulary is the
// tier-derivation rule (`tier = max`) and the full `risk:green|yellow|red` triple
// enumeration; a consumer may *reference* a single tier (e.g. `risk:red`) but must
// not restate the derivation rules. This assertion keeps the DoD claim grep-backed.
// Behavioural worked-example fixtures (#233): the classify SKILL documents
// hand-traced examples that pin determinism (AC4) and never-lower (D17) to
// CONCRETE matrices. This guard PARSES those fixtures and re-derives each tier
// from the documented max-rule (floored by the refinement pass in review) — so
// the examples cannot silently drift out of internal consistency. This is
// behavioural, not a prose grep: it recomputes the rule over the stated values.
const TIER_RANK: Record<string, number> = { green: 0, yellow: 1, red: 2 }
const RANK_TIER = ['green', 'yellow', 'red']
const REQUIRED_DIMENSIONS = [
  'Service/domain criticality',
  'Change/diff risk',
  'Business impact',
  'Security relevance',
  'Coupling balance',
]

type WorkedRow = { label: string; dims: string[]; tier: string }
type WorkedExample = { title: string; header: string[]; rows: WorkedRow[] }

function splitRow(line: string): string[] {
  return line
    .split('|')
    .slice(1, -1)
    .map(c => c.trim())
}

function dimRank(cell: string): number | null {
  const v = cell.toLowerCase()
  if (v.startsWith('not assessed')) return null
  if (v in TIER_RANK) return TIER_RANK[v]
  throw new Error(`unexpected dimension value: "${cell}"`)
}

function tierColor(cell: string): string {
  const m = cell.match(/risk:(green|yellow|red)/)
  if (!m) throw new Error(`no risk:<tier> in cell: "${cell}"`)
  return m[1]
}

function maxColorOf(dims: string[]): string {
  const ranks = dims.map(dimRank).filter((r): r is number => r !== null)
  return RANK_TIER[Math.max(...ranks)]
}

function parseWorkedExamples(content: string): WorkedExample[] {
  const start = content.indexOf('## Worked Examples')
  if (start === -1) throw new Error('no "## Worked Examples" section found')
  // Section runs until the next H2.
  const section = content.slice(start).split(/\n## /)[0]
  const blocks = section.split(/\n### /).slice(1)
  return blocks.map(block => {
    const lines = block.split('\n')
    const title = lines[0].trim()
    const tableLines = lines.filter(l => l.trim().startsWith('|'))
    const header = splitRow(tableLines[0])
    // tableLines[1] is the |---| separator; data rows follow.
    const rows = tableLines.slice(2).map(l => {
      const cells = splitRow(l)
      return { label: cells[0], dims: cells.slice(1, 6), tier: cells[6] }
    })
    return { title, header, rows }
  })
}

describe('worked-example fixtures are present and internally consistent (AC4/D17 — #233)', () => {
  for (const [label, content] of [
    ['dataset', CLASSIFY_DATASET],
    ['mirror', CLASSIFY_MIRROR],
  ] as const) {
    const examples = parseWorkedExamples(content)

    it(`${label} documents >=3 worked examples, each with all five dimensions + a tier`, () => {
      expect(examples.length).toBeGreaterThanOrEqual(3)
      for (const ex of examples) {
        for (const dim of REQUIRED_DIMENSIONS) expect(ex.header).toContain(dim)
        expect(ex.header[ex.header.length - 1]).toBe('Tier')
        expect(ex.rows.length).toBeGreaterThanOrEqual(2)
        for (const row of ex.rows) {
          expect(row.dims).toHaveLength(5)
          // every dimension cell parses to a valid rank or "not assessed"
          for (const d of row.dims) expect(() => dimRank(d)).not.toThrow()
          expect(() => tierColor(row.tier)).not.toThrow()
        }
      }
    })

    const determinism = examples.filter(ex => ex.rows.every(r => /^[AB]$/.test(r.label)))
    const neverLower = examples.filter(ex =>
      ['refinement', 'review'].every(l => ex.rows.some(r => r.label === l)),
    )

    it(`${label} has a determinism example: two runs, identical matrix, tier = max (AC4)`, () => {
      expect(determinism.length).toBeGreaterThanOrEqual(1)
      for (const ex of determinism) {
        const [a, b] = ex.rows
        expect(a.dims).toEqual(b.dims)
        expect(a.tier).toBe(b.tier)
        expect(tierColor(a.tier)).toBe(maxColorOf(a.dims))
      }
    })

    it(`${label} has >=2 never-lower examples; each review tier = max(review dims, refinement floor), never below (D17)`, () => {
      expect(neverLower.length).toBeGreaterThanOrEqual(2)
      const outcomes: Array<'stayed' | 'raised'> = []
      for (const ex of neverLower) {
        const refinement = ex.rows.find(r => r.label === 'refinement')!
        const review = ex.rows.find(r => r.label === 'review')!
        // refinement tier follows the plain max-rule over its own dimensions
        expect(tierColor(refinement.tier)).toBe(maxColorOf(refinement.dims))
        // review tier follows the max-rule floored by the refinement tier
        const refRank = TIER_RANK[tierColor(refinement.tier)]
        const reviewRawRank = TIER_RANK[maxColorOf(review.dims)]
        const expectedReview = RANK_TIER[Math.max(refRank, reviewRawRank)]
        expect(tierColor(review.tier)).toBe(expectedReview)
        // never-lower invariant: review tier is never below the refinement floor
        expect(TIER_RANK[tierColor(review.tier)]).toBeGreaterThanOrEqual(refRank)
        outcomes.push(TIER_RANK[tierColor(review.tier)] > refRank ? 'raised' : 'stayed')
      }
      // the fixtures must cover BOTH behaviours: a benign diff that stays and a
      // risky diff that raises.
      expect(outcomes).toContain('stayed')
      expect(outcomes).toContain('raised')
    })
  }
})

describe('consumers own no classification criteria (D18 — #233)', () => {
  for (const [label, content] of [
    ['review dataset', REVIEW_DATASET],
    ['review mirror', REVIEW_MIRROR],
    ['next dataset', NEXT_DATASET],
    ['next mirror', NEXT_MIRROR],
  ] as const) {
    it(`${label} restates no tier-derivation rule`, () => {
      expect(content).not.toMatch(/tier\s*=\s*max/i)
      expect(content).not.toContain('risk:green|yellow|red')
    })
  }
})

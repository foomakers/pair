import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { join } from 'path'

// Conformance guard for #228: the code-review template is verdict-first (D22, R6.6)
// and carries the seven required assessment sections — input validation, output
// handling, authentication, authorization, introduced vulnerabilities, cost,
// architecture (coupling) — each a 1-line verdict + <details>. The review artifact is
// the NATIVE GitHub review body (verdict = the review action), not a separate comment
// (decision Q5, AC2). /pair-process-review composes /assess-cost, surfaces the
// architecture/coupling verdict (assess-coupling, "not assessed" until #263), keeps
// the review-time classification a floor (raise-only, D17) and emits the
// "Classification changed" drift note upward only. Asserted on BOTH the dataset
// (source of truth) and the installed root mirror, name-mapped — the drift class this
// repo's parity guards exist to catch.

const DATASET_SKILLS = join(__dirname, '../../dataset/.skills')
const MIRROR_SKILLS = join(__dirname, '../../../../.claude/skills')
const DATASET_TEMPLATES = join(
  __dirname,
  '../../dataset/.pair/knowledge/guidelines/collaboration/templates',
)
const MIRROR_TEMPLATES = join(
  __dirname,
  '../../../../.pair/knowledge/guidelines/collaboration/templates',
)
const DATASET_HOWTO = join(__dirname, '../../dataset/.pair/knowledge/how-to')
const MIRROR_HOWTO = join(__dirname, '../../../../.pair/knowledge/how-to')

const TEMPLATE_DATASET = readFileSync(join(DATASET_TEMPLATES, 'code-review-template.md'), 'utf-8')
const TEMPLATE_MIRROR = readFileSync(join(MIRROR_TEMPLATES, 'code-review-template.md'), 'utf-8')
const REVIEW_DATASET = readFileSync(join(DATASET_SKILLS, 'process/review/SKILL.md'), 'utf-8')
const REVIEW_MIRROR = readFileSync(join(MIRROR_SKILLS, 'pair-process-review/SKILL.md'), 'utf-8')
const HOWTO11_DATASET = readFileSync(join(DATASET_HOWTO, '11-how-to-code-review.md'), 'utf-8')
const HOWTO11_MIRROR = readFileSync(join(MIRROR_HOWTO, '11-how-to-code-review.md'), 'utf-8')

// The seven required assessment sections (AC1), matched case-insensitively as `###` headings.
const REQUIRED_SECTIONS = [
  'Input validation',
  'Output handling',
  'Authentication',
  'Authorization',
  'Introduced vulnerabilities',
  'Cost',
  'Architecture',
] as const

const TEMPLATE_VARIANTS = [
  ['dataset', TEMPLATE_DATASET],
  ['mirror', TEMPLATE_MIRROR],
] as const

describe('code-review-template — verdict-first reading budget (AC3, D22) (#228)', () => {
  for (const [label, content] of TEMPLATE_VARIANTS) {
    it(`${label} opens with a Verdict section carrying risk tier + cost class + decision`, () => {
      // Verdict must be the first `##` section so the reader hits it in ~30s.
      const firstSection = content.slice(content.search(/^##\s+/m)).split(/\n## /)[0]
      expect(firstSection).toMatch(/##\s+Verdict/)
      expect(firstSection).toMatch(/risk:/)
      expect(firstSection).toMatch(/cost:/)
      expect(firstSection).toMatch(/APPROVED|CHANGES-REQUESTED|TECH-DEBT/)
    })

    it(`${label} states the ~30-second reading budget (D22, R6.6)`, () => {
      expect(content).toMatch(/D22/)
      expect(content).toMatch(/30\s*[- ]?\s*second|~?30s/i)
    })

    it(`${label} declares it is the native review body, not a separate comment (AC2, Q5)`, () => {
      expect(content.toLowerCase()).toMatch(/native (github )?review/)
      expect(content.toLowerCase()).toMatch(/no separate.*comment|not a separate.*comment/)
    })
  }
})

describe('code-review-template — seven verdict-first assessment sections (AC1) (#228)', () => {
  for (const [label, content] of TEMPLATE_VARIANTS) {
    for (const section of REQUIRED_SECTIONS) {
      it(`${label} has a "${section}" section that is 1-line verdict + <details>`, () => {
        const re = new RegExp(`^###\\s+.*${section}`, 'im')
        const idx = content.search(re)
        expect(idx).toBeGreaterThan(-1)
        // Slice to the next `###`/`##` heading — isolate this section only.
        const body = content
          .slice(idx)
          .replace(re, '')
          .split(/\n#{2,3}\s/)[0]
        // A 1-line verdict marker...
        expect(body).toMatch(/\*\*Verdict:\*\*|Verdict:/i)
        // ...backed by a collapsed details block.
        expect(body).toContain('<details>')
      })
    }

    it(`${label} shows an unavailable assessment as "not assessed" explicitly (edge case)`, () => {
      expect(content.toLowerCase()).toContain('not assessed')
    })
  }
})

const REVIEW_VARIANTS = [
  { label: 'dataset', content: REVIEW_DATASET, cost: '/assess-cost', coupling: '/assess-coupling' },
  {
    label: 'mirror',
    content: REVIEW_MIRROR,
    cost: '/pair-capability-assess-cost',
    coupling: '/pair-capability-assess-coupling',
  },
] as const

describe('review skill — composes assess-cost into the review (AC1 #228, AC3 #226)', () => {
  for (const v of REVIEW_VARIANTS) {
    it(`${v.label} lists assess-cost as a composed skill`, () => {
      const row = v.content
        .split('\n')
        .find(line => line.includes(`\`${v.cost}\``) && line.includes('Capability'))
      expect(row).toBeDefined()
    })

    it(`${v.label} composes assess-cost against the diff and shows the cost class 1-line + collapsed`, () => {
      expect(v.content).toContain(`Compose \`${v.cost}\``)
      expect(v.content).toMatch(/D22/)
    })

    it(`${v.label} surfaces the architecture/coupling verdict, "not assessed" until assess-coupling ships`, () => {
      expect(v.content).toContain(v.coupling)
      // Architecture/coupling degrades to "not assessed" when the capability is absent.
      const gd = v.content.slice(v.content.indexOf('## Graceful Degradation'))
      expect(gd.toLowerCase()).toContain('not assessed')
    })
  }
})

describe('review skill — review-time classification is a floor, drift note fires upward (AC3 #226, #228)', () => {
  for (const v of REVIEW_VARIANTS) {
    it(`${v.label} keeps the review matrix raise-only (never lowers the tier, D17)`, () => {
      expect(v.content).toMatch(/never\s+lower|raise-only|raise only/i)
      expect(v.content).toMatch(/D17/)
    })

    it(`${v.label} emits a "Classification changed" drift note when review-time differs`, () => {
      expect(v.content).toMatch(/Classification changed/)
    })

    it(`${v.label} applies the projected classification tags on the PR (not only the story)`, () => {
      expect(v.content.toLowerCase()).toMatch(/tag.*on the pr|label.*on the pr|re-apply.*tag/)
    })
  }
})

describe('review skill — review IS the native review body, no separate comment (AC2, Q5) (#228)', () => {
  for (const v of REVIEW_VARIANTS) {
    it(`${v.label} submits the report as the native review body, not a separate PR comment`, () => {
      const post = v.content.slice(v.content.indexOf('### Step 5.3'))
      expect(post.toLowerCase()).toMatch(/native (github )?review|review body/)
      expect(post.toLowerCase()).not.toMatch(/post the review report as a pr comment/)
    })
  }
})

describe('how-to-11 — aligned to native-review-body verdict (AC2) (#228)', () => {
  for (const [label, content] of [
    ['dataset', HOWTO11_DATASET],
    ['mirror', HOWTO11_MIRROR],
  ] as const) {
    it(`${label} no longer instructs a separate "post report as PR comment"`, () => {
      expect(content.toLowerCase()).not.toMatch(/post report as pr comment/)
    })
  }
})

describe('code-review-template — root/dataset structural parity (#228)', () => {
  const headings = (content: string) => content.match(/^##+ .*$/gm) ?? []
  it('has the same number of section headings in root and dataset', () => {
    expect(headings(TEMPLATE_MIRROR).length).toBe(headings(TEMPLATE_DATASET).length)
  })

  // Count parity proves structure, not content. The PR declares the two files an
  // identical mirror — enforce that fully with byte-equality (analogous to the
  // skills-guide-mirror byte-equality guard), so a body-only drift can't slip past.
  it('is byte-identical between root and dataset (identical-mirror invariant)', () => {
    expect(TEMPLATE_MIRROR).toBe(TEMPLATE_DATASET)
  })
})

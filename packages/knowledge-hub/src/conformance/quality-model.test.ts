import { describe, it, expect } from 'vitest'
import { readFileSync, existsSync } from 'fs'
import { join } from 'path'

const QUALITY_ASSURANCE_DIR = join(
  __dirname,
  '../../dataset/.pair/knowledge/guidelines/quality-assurance',
)

const QUALITY_MODEL = readFileSync(
  join(__dirname, '../../dataset/.pair/knowledge/guidelines/quality-assurance/quality-model.md'),
  'utf-8',
)
const QUALITY_MODEL_MIRROR = readFileSync(
  join(__dirname, '../../../../.pair/knowledge/guidelines/quality-assurance/quality-model.md'),
  'utf-8',
)
const RISK_MATRIX_EXAMPLE = readFileSync(
  join(__dirname, '../../dataset/.pair/knowledge/assets/risk-matrix-example.md'),
  'utf-8',
)
const QA_README = readFileSync(
  join(__dirname, '../../dataset/.pair/knowledge/guidelines/quality-assurance/README.md'),
  'utf-8',
)

describe('quality-model.md — structure', () => {
  it('has the expected title', () => {
    expect(QUALITY_MODEL).toMatch(/^# Quality Model/m)
  })

  it('documents the 3-layer principle', () => {
    expect(QUALITY_MODEL).toMatch(/Three-Layer Principle/)
    expect(QUALITY_MODEL).toMatch(/\*\*Doc\*\*/)
    expect(QUALITY_MODEL).toMatch(/\*\*Skill\*\*/)
    expect(QUALITY_MODEL).toMatch(/\*\*Automation\*\*/)
  })

  it('documents the 3 pillars', () => {
    expect(QUALITY_MODEL).toMatch(/\*\*Cost\*\*/)
    expect(QUALITY_MODEL).toMatch(/\*\*Security\*\*/)
    expect(QUALITY_MODEL).toMatch(/\*\*Delivery\*\*/)
  })

  it('documents all 5 risk dimensions with tier = max', () => {
    for (const dim of [
      'Service/domain criticality',
      'Change/diff risk',
      'Business impact',
      'Security relevance',
      'Coupling balance',
    ]) {
      expect(QUALITY_MODEL).toContain(dim)
    }
    expect(QUALITY_MODEL).toMatch(/max\(assessed dimensions/i)
  })

  it('matches the D10 SLA table exactly — 1 reviewer even at red tier', () => {
    expect(QUALITY_MODEL).toMatch(/🟢[^\n]*Self-merge/)
    expect(QUALITY_MODEL).toMatch(/🟡[^\n]*\|\s*1 reviewer\s*\|\s*1 working day/)
    expect(QUALITY_MODEL).toMatch(/🔴[^\n]*\|\s*1 reviewer\s*\|\s*2 working days/)
  })

  it('states reviewer counts and SLAs are adoption-overridable KB defaults, not fixed', () => {
    expect(QUALITY_MODEL).toMatch(
      /Reviewer counts and SLAs are \*\*KB defaults\*\*[\s\S]{0,300}Argument > Adoption > KB default/,
    )
    expect(QUALITY_MODEL).toContain('tier.red.reviewers: 2')
  })

  // Two claims that must not collapse into each other: WHAT the tiers require is
  // overridable, THAT the review runs is not, and whether any of it BLOCKS is a separate
  // opt-in. The previous assertion pinned a single sentence saying only reviewer count and
  // SLA were overridable — true before the enforcement flag existed, and it would now hide
  // a revert of the default back to blocking.
  it('separates the un-overridable part from the requirements and from enforcement', () => {
    expect(QUALITY_MODEL).toMatch(
      /Review always runs and tests are always green[\s\S]{0,120}\*\*that\*\* part is not overridable/i,
    )
    expect(QUALITY_MODEL).toMatch(/whether any of it BLOCKS is opt-in/i)
    expect(QUALITY_MODEL).toMatch(/`Review enforcement`[\s\S]{0,120}`disabled` by default/)
    // The consequence that makes the default non-negotiable, so a future edit cannot drop
    // it as decoration: enabling it on a single-maintainer repo cannot be satisfied.
    expect(QUALITY_MODEL).toMatch(/single-maintainer[\s\S]{0,140}cannot be obtained/i)
  })

  it('defines the chromatic tag projection', () => {
    expect(QUALITY_MODEL).toContain('risk:green|yellow|red')
    expect(QUALITY_MODEL).toContain('cost:green|yellow|orange|red')
  })

  it('states risk is the only KB-named/proposed tag family and does not special-case cost as a second default', () => {
    expect(QUALITY_MODEL).toMatch(
      /`risk:green\|yellow\|red` \(§3\.2\) is the only tag family the KB names and proposes by default/,
    )
    expect(QUALITY_MODEL).toMatch(/Only `risk` is a KB default/)
    expect(QUALITY_MODEL).toMatch(
      /the KB does not pre-select which, if any: that choice belongs entirely to the project/,
    )
  })

  it("documents classify's propose-then-write Tag Projection flow", () => {
    expect(QUALITY_MODEL).toMatch(/does `tech\/risk-matrix\.md` have a `## Tag Projection` section/)
    expect(QUALITY_MODEL).toMatch(
      /No Tag Projection declared yet\. Activate `risk:green\|yellow\|red`/,
    )
    expect(QUALITY_MODEL).toMatch(/records the opt-out so this isn't asked again/)
    expect(QUALITY_MODEL).toMatch(
      /the compiled matrix is written to the story\/PR body \*\*regardless of the answer\*\*/,
    )
  })

  it('shows the Tag Projection declaration schema (default, multi-family, opt-out)', () => {
    expect(QUALITY_MODEL).toMatch(/## Tag Projection\n\nActive: risk\n/)
    expect(QUALITY_MODEL).toContain('Active: risk, cost')
    expect(QUALITY_MODEL).toContain('Active: none')
  })

  it('states there is no dedicated eligibility tag', () => {
    expect(QUALITY_MODEL).toMatch(/No dedicated eligibility tag/)
  })

  it('states the Argument > Adoption > KB default resolution order', () => {
    expect(QUALITY_MODEL).toContain('Argument > Adoption > KB default')
  })

  it('states tech/risk-matrix.md holds 3 independent sections that do not imply each other', () => {
    expect(QUALITY_MODEL).toMatch(/up to three independent sections/)
    expect(QUALITY_MODEL).toMatch(/the presence of one never implies the others/)
  })

  it('walks through the resolution cascade with and without the delta file', () => {
    expect(QUALITY_MODEL).toMatch(/No file[^|]*\|\s*absent/)
    expect(QUALITY_MODEL).toMatch(/Tag Projection declared, `risk` active/)
    expect(QUALITY_MODEL).toMatch(/Tag Projection explicitly opted out/)
    expect(QUALITY_MODEL).toMatch(/File present, service listed/)
    expect(QUALITY_MODEL).toMatch(/File present, service \*\*not\*\* listed/)
    expect(QUALITY_MODEL).toMatch(/File present but malformed/)
  })

  it('does not create dead hyperlinks for guidelines that do not exist yet', () => {
    expect(QUALITY_MODEL).not.toMatch(/\]\([^)]*coupling-balance\.md\)/)
    expect(QUALITY_MODEL).toContain('`architecture/design-patterns/coupling-balance.md`')
  })

  it('resolves every §7 nested-taxonomy pointer link to a file on disk', () => {
    const section = QUALITY_MODEL.split('## 7. Nested Taxonomy')[1]
    const links = [...section.matchAll(/\]\(([^)]+)\)/g)].map(m => m[1])
    expect(links.length).toBeGreaterThanOrEqual(9)
    for (const link of links) {
      expect(existsSync(join(QUALITY_ASSURANCE_DIR, link))).toBe(true)
    }
  })

  it('nests every listed theme under a pillar with a pointer', () => {
    for (const theme of [
      'Performance',
      'Accessibility',
      'Observability',
      'Documentation',
      'Planning',
      'Code design / code quality',
      'Architecture / modularity',
      'Release',
      'AI metrics / retro',
      'Vulnerabilities / compliance',
      'Cost signals',
    ]) {
      expect(QUALITY_MODEL).toContain(theme)
    }
  })
})

describe('quality-model.md — cost monitoring pointer (#281, R6.3/R6.4)', () => {
  // §3.3 covers the cost CLASS (R6.2). Monitoring the predicted class against the real
  // one (R6.3) and surfacing drift periodically (R6.4) is assess-cost's report mode:
  // without this pointer the skill's R6.3/R6.4 citation dangles — an installed
  // project's KB (what an agent reads at Step 0) would carry no doc-layer rule for it.
  for (const [label, content] of [
    ['dataset', QUALITY_MODEL],
    ['mirror', QUALITY_MODEL_MIRROR],
  ] as const) {
    it(`${label} names R6.3/R6.4 and points at assess-cost report mode`, () => {
      expect(content).toContain('R6.3')
      expect(content).toContain('R6.4')
      expect(content).toMatch(/R6\.3\/R6\.4[^\n]*report mode/)
    })

    it(`${label} links the report-panel convention and names the current-catalog caveat`, () => {
      expect(content).toMatch(/working-area\.md#report-panels/)
      expect(content.toLowerCase()).toMatch(/current at run time|confounder/)
    })
  }
})

describe('risk-matrix-example.md', () => {
  it('provides a criticality table with at least one High entry', () => {
    expect(RISK_MATRIX_EXAMPLE).toMatch(/## Criticality Table/)
    expect(RISK_MATRIX_EXAMPLE).toMatch(/\|\s*payments\s*\|\s*High\s*\|/)
  })

  it('documents the unknown-service default separately from the file-absent default', () => {
    expect(RISK_MATRIX_EXAMPLE).toMatch(/resolves to High/)
  })
})

describe('quality-assurance README — index', () => {
  it('lists quality-model.md in the core quality framework section', () => {
    expect(QA_README).toMatch(/quality-model\.md/)
  })
})

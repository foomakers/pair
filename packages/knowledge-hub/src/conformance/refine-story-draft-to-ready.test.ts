import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { join } from 'path'

// Conformance guard for #242: /pair-process-refine-story is THE single Draft→Ready
// skill — phase 0 grill(sync), map-subdomains/map-contexts scoped in the
// functional/technical analysis, classify with the coupling dimension (D38), and a
// state transition that targets Ready via the mapping (with the DoR-on-body
// fallback). Asserted on BOTH the dataset (source of truth) and the installed root
// mirror, name-mapped — the exact drift class this repo's parity guards exist to catch.

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

const REFINE_DATASET = readFileSync(join(DATASET_SKILLS, 'process/refine-story/SKILL.md'), 'utf-8')
const REFINE_MIRROR = readFileSync(
  join(MIRROR_SKILLS, 'pair-process-refine-story/SKILL.md'),
  'utf-8',
)
const TEMPLATE_DATASET = readFileSync(join(DATASET_TEMPLATES, 'user-story-template.md'), 'utf-8')
const TEMPLATE_MIRROR = readFileSync(join(MIRROR_TEMPLATES, 'user-story-template.md'), 'utf-8')

// Name map dataset → root mirror (per the KB self-sync convention).
const VARIANTS = [
  {
    label: 'dataset',
    content: REFINE_DATASET,
    grill: '/grill',
    classify: '/classify',
    mapSub: '/map-subdomains',
    mapCtx: '/map-contexts',
  },
  {
    label: 'mirror',
    content: REFINE_MIRROR,
    grill: '/pair-capability-grill',
    classify: '/pair-capability-classify',
    mapSub: '/pair-capability-map-subdomains',
    mapCtx: '/pair-capability-map-contexts',
  },
] as const

describe('refine-story — single Draft→Ready (D24) (#242)', () => {
  for (const v of VARIANTS) {
    it(`${v.label} declares it is the single Draft→Ready path, no make-ready skill (D24)`, () => {
      expect(v.content).toMatch(/Draft.*Ready/)
      expect(v.content).toMatch(/no.*make-ready|make-ready.*(never|no)/i)
      expect(v.content).toMatch(/D24/)
    })
  }
})

describe('refine-story — Phase 0 grill sync (AC1) (#242)', () => {
  for (const v of VARIANTS) {
    it(`${v.label} lists grill as a required Composed Skill`, () => {
      const row = v.content
        .split('\n')
        .find(line => line.includes(`\`${v.grill}\``) && line.includes('Capability'))
      expect(row).toBeDefined()
      expect(row).toMatch(/Yes/)
    })

    it(`${v.label} has a Phase 0 that composes grill with $mode: sync`, () => {
      expect(v.content).toMatch(/##\s+Phase 0/)
      expect(v.content).toContain(`Compose \`${v.grill}\` with \`$mode: sync\``)
    })

    it(`${v.label} makes shared understanding a blocking prerequisite`, () => {
      // Phase 0 is a `###` subsection; isolate it by splitting on the next `###`.
      const phase0 = v.content.slice(v.content.search(/###\s+Phase 0/)).split(/\n### /)[0]
      expect(phase0).toMatch(/shared understanding/i)
      expect(phase0).toMatch(/BLOCKING|HALT|prerequisite/i)
    })
  }
})

describe('refine-story — map-* scoped in functional/technical analysis (AC3) (#242)', () => {
  for (const v of VARIANTS) {
    it(`${v.label} composes map-subdomains scoped to the story (functional analysis)`, () => {
      const row = v.content
        .split('\n')
        .find(line => line.includes(`\`${v.mapSub}\``) && line.includes('Capability'))
      expect(row).toBeDefined()
      expect(v.content).toContain(`Compose \`${v.mapSub}\` with \`$scope:`)
      // Scoped, never a full re-mapping.
      expect(v.content).not.toContain(`Compose \`${v.mapSub}\` with \`$scope: all\``)
    })

    it(`${v.label} composes map-contexts scoped to the story (technical analysis)`, () => {
      const row = v.content
        .split('\n')
        .find(line => line.includes(`\`${v.mapCtx}\``) && line.includes('Capability'))
      expect(row).toBeDefined()
      expect(v.content).toContain(`Compose \`${v.mapCtx}\` with \`$scope:`)
      expect(v.content).not.toContain(`Compose \`${v.mapCtx}\` with \`$scope: all\``)
    })
  }
})

describe('refine-story — coupling risk routed into the matrix (AC5, D38) (#242)', () => {
  for (const v of VARIANTS) {
    it(`${v.label} records an unbalanced/volatile integration as a technical risk (D38)`, () => {
      expect(v.content).toMatch(/D38/)
      expect(v.content).toMatch(/unbalanced|coupling/i)
    })

    it(`${v.label} feeds the coupling dimension from map-contexts into classify`, () => {
      expect(v.content).toContain(`Compose \`${v.classify}\` with \`$context: refinement\``)
      // classify's coupling dimension is fed by the scoped map-contexts output.
      // Scope to the steps region (Step 3 onward) so the ordering assertion reflects
      // the actual Step 3 (map-contexts) -> Step 3b (classify) procedure order, not
      // the Composed Skills table near the top of the file.
      const stepsRegion = v.content.slice(v.content.search(/### Step 3\b/))
      const idxCtx = stepsRegion.indexOf(`Compose \`${v.mapCtx}\` with \`$scope:`)
      const idxClassify = stepsRegion.indexOf(
        `Compose \`${v.classify}\` with \`$context: refinement\``,
      )
      expect(idxCtx).toBeGreaterThan(-1)
      expect(idxClassify).toBeGreaterThan(idxCtx)
    })
  }
})

describe('refine-story — state → Ready via mapping + DoR fallback (AC4) (#242)', () => {
  for (const v of VARIANTS) {
    it(`${v.label} transitions to Ready via the state mapping (writing rule)`, () => {
      expect(v.content).toMatch(/canonical-states\.md/)
      expect(v.content).toMatch(/Ready/)
    })

    it(`${v.label} falls back to DoR-on-body when no board state maps to Ready`, () => {
      expect(v.content).toMatch(/definition-of-ready-and-done\.md/)
      expect(v.content).toMatch(/fallback/i)
    })
  }
})

describe('refine-story — Design flag wired end-to-end (AC2, DoR criterion 6) (#242)', () => {
  for (const v of VARIANTS) {
    it(`${v.label} Step 1 detection table has a "Design flag" row referencing the \`Design:\` line`, () => {
      // Isolate Step 1 (detection) so a matching row elsewhere can't satisfy this.
      const step1 = v.content
        .slice(v.content.search(/### Step 1: Detect/))
        .split(/\n### Step 2\b/)[0]
      const row = step1
        .split('\n')
        .find(line => line.trim().startsWith('|') && /Design flag/.test(line))
      expect(row).toBeDefined()
      expect(row).toMatch(/`Design:`/)
    })

    it(`${v.label} Step 3 Act has a bullet that sets the \`Design:\` line (DoR criterion 6)`, () => {
      // Isolate Step 3 (Technical Analysis) — not Step 3b (Classification).
      const step3 = v.content
        .slice(v.content.search(/### Step 3: Technical Analysis/))
        .split(/\n### Step 3b\b/)[0]
      const bullet = step3
        .split('\n')
        .find(line => /^\s*-\s/.test(line) && /Design flag/.test(line) && /`Design:`/.test(line))
      expect(bullet).toBeDefined()
      expect(bullet).toMatch(/not required|required — reference/)
    })
  }
})

describe('refine-story — graceful degradation of composed skills (#242)', () => {
  for (const v of VARIANTS) {
    it(`${v.label} degrades gracefully when grill is absent`, () => {
      const gd = v.content.slice(v.content.indexOf('## Graceful Degradation'))
      expect(gd).toContain(v.grill)
    })

    it(`${v.label} degrades gracefully when map-* are absent (analysis still produced)`, () => {
      const gd = v.content.slice(v.content.indexOf('## Graceful Degradation'))
      expect(gd).toMatch(/map-subdomains|map-contexts|domain mapping/i)
    })
  }
})

describe('refine-story — root/dataset structural parity (#242)', () => {
  const headings = (content: string) => content.match(/^##+ .*$/gm) ?? []
  it('has the same number of section headings in root and dataset', () => {
    expect(headings(REFINE_MIRROR).length).toBe(headings(REFINE_DATASET).length)
  })
})

describe('user-story-template — first-class ## Classification slot (#242)', () => {
  for (const [label, content] of [
    ['dataset', TEMPLATE_DATASET],
    ['mirror', TEMPLATE_MIRROR],
  ] as const) {
    it(`${label} declares a ## Classification section in the Refined template`, () => {
      expect(content).toMatch(/##\s+Classification/)
    })

    it(`${label} renders the matrix as a 1-line verdict + <details> (D22)`, () => {
      const section = content.slice(content.search(/##\s+Classification/)).split(/\n## /)[0]
      expect(section).toMatch(/risk:.*cost:/s)
      expect(section).toMatch(/<details>/)
      expect(section).toMatch(/Coupling balance/)
    })

    it(`${label} names classify as the populator (refinement) and the confirm-or-raise rule`, () => {
      const section = content.slice(content.search(/##\s+Classification/)).split(/\n## /)[0]
      expect(section).toMatch(/classify/i)
      expect(section).toMatch(/raise|never lower/i)
    })
  }
})

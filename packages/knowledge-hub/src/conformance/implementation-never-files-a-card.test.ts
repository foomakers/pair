import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { join } from 'path'

// Conformance guard for ADL 2026-08-12-implementation-never-files-a-card-it-extends-the-story:
// an agent implementing or reviewing a story NEVER creates a work item. A debt or defect it
// finds is fixed in the same PR (extending the story if needed), or left as an actionable
// finding for the maintainer at the merge gate. Citing an ALREADY-EXISTING card stays allowed —
// the ban is on creating, not on referencing.
//
// The concrete regression this pins: /pair-process-review's Phase 4.2 tech-debt step used to
// end with "note it as a recommendation for deliberate promotion after review via
// /write-issue (with the tech-debt label)", and a reviewer reading it filed fresh tech-debt
// cards mid-review (#426-#431 in one batch). The instruction is the enforcement point of the
// ADL's Adoption Impact item 3, so it is asserted on BOTH the dataset (source of truth) and the
// installed root mirror — the drift class this repo's parity guards exist to catch.
//
// Cross-cutting by construction (the ADL binds the review skill AND the orchestrator prompts
// that land with the orchestrator's own change), so it gets its own file rather than extending
// a single-artifact one — the exception the per-file convention ADL
// (2026-07-18-conformance-test-per-file-not-per-story.md) names explicitly.

const DATASET_SKILLS = join(__dirname, '../../dataset/.skills')
const MIRROR_SKILLS = join(__dirname, '../../../../.claude/skills')
const ADL = join(
  __dirname,
  '../../../../.pair/adoption/decision-log/2026-08-12-implementation-never-files-a-card-it-extends-the-story.md',
)

const REVIEW_VARIANTS = [
  ['dataset', readFileSync(join(DATASET_SKILLS, 'process/review/SKILL.md'), 'utf-8')],
  ['mirror', readFileSync(join(MIRROR_SKILLS, 'pair-process-review/SKILL.md'), 'utf-8')],
] as const

describe('/pair-process-review never offers to file a card (ADL 2026-08-12)', () => {
  for (const [label, content] of REVIEW_VARIANTS) {
    it(`${label} copy never routes a finding to the issue writer`, () => {
      // Matches both the dataset spelling (/write-issue) and the installed one
      // (/pair-capability-write-issue): neither may appear anywhere in the review skill.
      expect(content).not.toMatch(/write-issue/)
    })

    it(`${label} copy states the ban and allows citing an existing card`, () => {
      const debtStep = content.slice(content.indexOf('### Step 4.2: Tech Debt Assessment'))
      expect(debtStep).not.toBe('')
      expect(debtStep.toLowerCase()).toMatch(/never creates a work item/)
      expect(debtStep.toLowerCase()).toMatch(/already-existing|existing card/)
      // The escape hatches the ADL leaves open, named in the step itself.
      expect(debtStep.toLowerCase()).toMatch(/merge gate/)
    })

    it(`${label} copy points at the ADL that decided it`, () => {
      expect(content).toMatch(/2026-08-12-implementation-never-files-a-card-it-extends-the-story/)
    })
  }
})

describe('the ADL is Active and its review-side impact is not left open', () => {
  const adl = readFileSync(ADL, 'utf-8')

  it('is Active', () => {
    expect(adl).toMatch(/##\s+Status\s+\n+Active/)
  })

  it('records that the /pair-process-review instruction landed, not that it is pending', () => {
    const impact = adl.slice(adl.indexOf('## Adoption Impact'))
    const reviewBullet = impact
      .split('\n')
      .find(line => line.startsWith('- `/pair-process-review`'))
    expect(reviewBullet).toBeDefined()
    // Every Adoption Impact bullet must say WHERE it lands — done here, or deferred to a
    // named change. An unqualified "must stop offering" is the unmet-commitment shape that
    // let the Active policy ship alongside the instruction violating it.
    expect(reviewBullet).toMatch(/Done in the same change as this record/)
  })
})

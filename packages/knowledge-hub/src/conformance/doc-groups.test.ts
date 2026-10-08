import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { join } from 'path'

const DATASET = join(__dirname, '../../dataset')
const OWNER = '.pair/knowledge/guidelines/collaboration/automation/doc-remediation-groups.md'
const SKILLS = ['red-spec', 'red-verify', 'green-fix', 'review-phase']

describe('mode: doc — prose-only remediation groups (maintainer decision 2026-10-06)', () => {
  const owner = readFileSync(join(DATASET, OWNER), 'utf-8')
  it('the single-owner guideline states the contract end to end', () => {
    for (const re of [
      /checklist/i,
      /prose/i,
      /never carr(y|ies) executable tests/i,
      /behavio(u)?r.*stays `?behavioral/is,
      /contractMode/,
      /checklistValidated/,
      /allowedPaths/,
    ])
      expect(owner).toMatch(re)
  })
  it('states the deterministic grouping rule, the mixed finding and the mixed round', () => {
    for (const re of [
      /prose-finding-not-doc/,
      /findingPaths/,
      /code-finding-in-doc-group/,
      /mixed finding/i,
      /mixed round/i,
      /dependsOn/,
    ])
      expect(owner).toMatch(re)
  })
  it('red-spec states the same rule', () => {
    const text = readFileSync(join(DATASET, '.skills/workflow/red-spec/SKILL.md'), 'utf-8')
    expect(text).toMatch(/prose-finding-not-doc/)
    expect(text).toMatch(/dependsOn/)
  })
  it.each(SKILLS)('%s references it and states its part', skill => {
    const text = readFileSync(join(DATASET, `.skills/workflow/${skill}/SKILL.md`), 'utf-8')
    expect(text).toContain('doc-remediation-groups.md')
    expect(text).toMatch(/mode: doc/)
  })
})

describe('review publication (AK): findings table, never-silent re-review, honest metrics, no GitHub review', () => {
  const text = readFileSync(join(DATASET, '.skills/workflow/review-phase/SKILL.md'), 'utf-8')
  it('the review-phase skill states each rule', () => {
    for (const re of [
      /never silent/i,
      /pair:findings/,
      /cycle-metrics\.mjs" findings/,
      /findings table/i,
      /missedUpstream/,
      /not recorded \(in-session\)/,
      /not as a GitHub PR review/i,
    ])
      expect(text).toMatch(re)
  })
})

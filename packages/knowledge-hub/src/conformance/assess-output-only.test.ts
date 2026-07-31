import { describe, it, expect } from 'vitest'
import { readFileSync, existsSync } from 'fs'
import { join } from 'path'

// Conformance guard for story #224: assess-* skills are output-only;
// record-decision is the sole adoption writer. The two report skills were renamed
// assess-debt → analyze-debt and assess-code-quality → analyze-code-quality
// (#313/T8 — skill naming verb taxonomy: verify/assess/analyze). They remain
// output-only and analyze-debt still has no scan-mode.
// See adr-009-assess-output-only.md and the taxonomy ADL
// (decision-log/2026-07-13-skill-naming-verb-taxonomy.md).

const DATASET = join(__dirname, '../../dataset/.skills/capability')
const MIRROR = join(__dirname, '../../../../.claude/skills')

// The 8 "decision" assess-* skills: evaluate options + propose an adoption choice.
const ASSESS_SKILLS = [
  'ai',
  'architecture',
  'infrastructure',
  'methodology',
  'observability',
  'pm',
  'stack',
  'testing',
]

// The 2 "report" analyze-* skills: analyze + report only, never block, no decision.
const ANALYZE_SKILLS = ['code-quality', 'debt']

function dataset(dir: string): string {
  return readFileSync(join(DATASET, dir, 'SKILL.md'), 'utf-8')
}

function mirror(dir: string): string {
  return readFileSync(join(MIRROR, dir, 'SKILL.md'), 'utf-8')
}

describe('assess-* skills are output-only (#224)', () => {
  for (const skill of ASSESS_SKILLS) {
    it(`assess-${skill} declares output-only and has no adoption-write step`, () => {
      const content = dataset(`assess-${skill}`)
      // Contract is stated explicitly.
      expect(content.toLowerCase()).toContain('output-only')
      // The old "Write Adoption File" step must be gone (renamed to a render/proposal step).
      expect(content).not.toMatch(/#+\s*Step\s*\d+:\s*Write Adoption File/i)
    })

    it(`assess-${skill} has an installed mirror that is also output-only`, () => {
      const mirrorPath = join(MIRROR, `pair-capability-assess-${skill}`, 'SKILL.md')
      expect(existsSync(mirrorPath)).toBe(true)
      expect(mirror(`pair-capability-assess-${skill}`).toLowerCase()).toContain('output-only')
    })
  }
})

describe('analyze-* report skills are output-only (#224; renamed #313/T8)', () => {
  for (const skill of ANALYZE_SKILLS) {
    it(`analyze-${skill} declares output-only and has no adoption-write step`, () => {
      const content = dataset(`analyze-${skill}`)
      expect(content.toLowerCase()).toContain('output-only')
      expect(content).not.toMatch(/#+\s*Step\s*\d+:\s*Write Adoption File/i)
    })

    it(`analyze-${skill} has an installed mirror that is also output-only`, () => {
      const mirrorPath = join(MIRROR, `pair-capability-analyze-${skill}`, 'SKILL.md')
      expect(existsSync(mirrorPath)).toBe(true)
      expect(mirror(`pair-capability-analyze-${skill}`).toLowerCase()).toContain('output-only')
    })
  }
})

describe('analyze-debt has no scan-mode and never auto-creates (#224)', () => {
  it('exposes no $mode argument (no scan-mode)', () => {
    const content = dataset('analyze-debt')
    // No $mode argument row in the Arguments table.
    expect(content).not.toMatch(/\|\s*`\$mode`/)
  })

  it('states it creates no backlog items and never blocks', () => {
    const content = dataset('analyze-debt').toLowerCase()
    expect(content).toContain('no auto-creation')
    expect(content).toContain('never block')
  })
})

describe('record-decision is the sole adoption writer (#224)', () => {
  const content = readFileSync(join(DATASET, 'record-decision', 'SKILL.md'), 'utf-8')

  it('documents itself as the sole GENERIC adoption writer, naming the inline exception', () => {
    // Since #230 the claim is qualified: the section-owning skills (/setup-pm,
    // /verify-quality, /classify) and the inline context-map maintenance of
    // /brainstorm and /refine-story are the documented exceptions. Pinned on the
    // qualified wording (review round 3, Minor): matching a bare /sole writer/
    // would let a regression to the unqualified monopoly claim stay green.
    expect(content.toLowerCase()).toMatch(/sole \*{0,2}generic\*{0,2} writer/)
    expect(content).toMatch(/context-map/)
    expect(content).toMatch(/brainstorm/)
  })

  it('accepts a generic pre-rendered {content, target} persist path', () => {
    expect(content).toMatch(/\$content/)
    expect(content).toMatch(/\$target/)
    expect(content.toLowerCase()).toContain('generic persist')
  })
})

describe('the record-decision invocation contract states the SAME exception list (#230)', () => {
  // Review finding (PR #387 round 3, Major): the KB doc that declares itself the
  // single statement of the invariant ("stated once here") still carried the
  // pre-#230 wording — "the one exception is /setup-pm" — so a skill author or a
  // writer-monopoly audit reading the canonical contract applied the superseded
  // rule and would score /brainstorm's inline context-map write as a violation.
  // Pinned on both copies (dataset source + repo-root installed KB) so the two
  // statements of one invariant cannot drift apart again.
  const CONTRACT =
    'guidelines/technical-standards/ai-development/skill-conventions/record-decision-contract.md'
  const COPIES = [
    ['dataset', join(__dirname, '../../dataset/.pair/knowledge', CONTRACT)],
    ['installed KB', join(__dirname, '../../../../.pair/knowledge', CONTRACT)],
  ] as const

  for (const [label, path] of COPIES) {
    it(`${label} copy names both exception classes, not "the one exception"`, () => {
      const contract = readFileSync(path, 'utf-8')
      expect(contract).toMatch(/sole \*{0,2}generic writer of adoption files\*{0,2}/)
      // The exclusive phrasing is what made the doc wrong; it must not come back.
      expect(contract).not.toMatch(/the one exception/i)
      // Class 1 — section owners.
      expect(contract).toMatch(/setup-pm/)
      expect(contract).toMatch(/verify-quality/)
      expect(contract).toMatch(/classify/)
      // Class 2 — guideline-authorized inline context-map maintenance.
      expect(contract).toMatch(/context-map/)
      expect(contract).toMatch(/brainstorm/)
      expect(contract).toMatch(/refine-story/)
      expect(contract).toMatch(/context-map-maintenance\.md/)
      // And the drift-resolution rule: the skill's own list is authoritative.
      expect(contract).toMatch(/authoritative list/)
    })
  }
})

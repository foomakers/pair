import { describe, it, expect } from 'vitest'
import { readFileSync, existsSync } from 'fs'
import { join } from 'path'

// Conformance guard for story #224: assess-* skills are output-only;
// record-decision is the sole adoption writer; assess-debt has no scan-mode.
// See adr-009-assess-output-only.md.

const DATASET = join(__dirname, '../../dataset/.skills/capability')
const MIRROR = join(__dirname, '../../../../.claude/skills')

const ASSESS_SKILLS = [
  'ai',
  'architecture',
  'code-quality',
  'debt',
  'infrastructure',
  'methodology',
  'observability',
  'pm',
  'stack',
  'testing',
]

function dataset(skill: string): string {
  return readFileSync(join(DATASET, `assess-${skill}`, 'SKILL.md'), 'utf-8')
}

function mirror(skill: string): string {
  return readFileSync(join(MIRROR, `pair-capability-assess-${skill}`, 'SKILL.md'), 'utf-8')
}

describe('assess-* skills are output-only (#224)', () => {
  for (const skill of ASSESS_SKILLS) {
    it(`assess-${skill} declares output-only and has no adoption-write step`, () => {
      const content = dataset(skill)
      // Contract is stated explicitly.
      expect(content.toLowerCase()).toContain('output-only')
      // The old "Write Adoption File" step must be gone (renamed to a render/proposal step).
      expect(content).not.toMatch(/#+\s*Step\s*\d+:\s*Write Adoption File/i)
    })

    it(`assess-${skill} has an installed mirror that is also output-only`, () => {
      const mirrorPath = join(MIRROR, `pair-capability-assess-${skill}`, 'SKILL.md')
      expect(existsSync(mirrorPath)).toBe(true)
      expect(mirror(skill).toLowerCase()).toContain('output-only')
    })
  }
})

describe('assess-debt has no scan-mode and never auto-creates (#224)', () => {
  it('exposes no $mode argument (no scan-mode)', () => {
    const content = dataset('debt')
    // No $mode argument row in the Arguments table.
    expect(content).not.toMatch(/\|\s*`\$mode`/)
  })

  it('states it creates no backlog items and never blocks', () => {
    const content = dataset('debt').toLowerCase()
    expect(content).toContain('no auto-creation')
    expect(content).toContain('never block')
  })
})

describe('record-decision is the sole adoption writer (#224)', () => {
  const content = readFileSync(join(DATASET, 'record-decision', 'SKILL.md'), 'utf-8')

  it('documents itself as the sole/single adoption writer', () => {
    expect(content.toLowerCase()).toMatch(/sole writer|single writer/)
  })

  it('accepts a generic pre-rendered {content, target} persist path', () => {
    expect(content).toMatch(/\$content/)
    expect(content).toMatch(/\$target/)
    expect(content.toLowerCase()).toContain('generic persist')
  })
})

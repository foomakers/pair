import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { join } from 'path'

const DATASET = join(__dirname, '../../dataset')
const GUIDELINE =
  '.pair/knowledge/guidelines/technical-standards/ai-development/skill-conventions/headless-stage-execution.md'
const STAGE_SKILLS = [
  '.skills/workflow/implement-phase/SKILL.md',
  '.skills/workflow/green-fix/SKILL.md',
  '.skills/workflow/red-spec/SKILL.md',
  '.skills/workflow/red-verify/SKILL.md',
  '.skills/workflow/review-phase/SKILL.md',
  '.skills/workflow/contract-phase/SKILL.md',
  '.skills/capability/publish-pr/SKILL.md',
]

describe('headless stage execution: one owner, referenced by every stage skill', () => {
  const owner = readFileSync(join(DATASET, GUIDELINE), 'utf-8')

  it('the guideline states the three rules', () => {
    expect(owner).toMatch(/never leave a (long )?command in the background/i)
    expect(owner).toMatch(/never end (your|the) turn while one runs/i)
    expect(owner).toMatch(/maximum tool timeout/i)
    expect(owner).toMatch(/poll/i)
    expect(owner).toMatch(/reason: "incomplete"/)
    expect(owner).toMatch(/branch/)
    expect(owner).toMatch(/outputHead/)
  })

  it.each(STAGE_SKILLS)('%s references it and ends with the structured result', skill => {
    const text = readFileSync(join(DATASET, skill), 'utf-8')
    expect(text).toContain('headless-stage-execution.md')
    expect(text).toMatch(/never end your turn while a command runs|structured result/i)
  })
})

describe('red-verify pushes the seal of a mode:test group (no green-fix will)', () => {
  const text = readFileSync(join(DATASET, '.skills/workflow/red-verify/SKILL.md'), 'utf-8')
  it('states the push step, its owner and the handoff evidence', () => {
    expect(text).toMatch(/mode: test/)
    expect(text).toMatch(/red-snapshot\.mjs"? push/)
    expect(text).toMatch(/snapshot-missing/)
    expect(text).toMatch(/pushed/)
  })
})

describe('red-verify / red-spec handoff hygiene (AB/AC): the envelope fields publish requires, and no shell chains in recorded commands', () => {
  it.each(['red-verify', 'red-spec'])(
    '%s states the required envelope fields and the command rule',
    skill => {
      const text = readFileSync(join(DATASET, `.skills/workflow/${skill}/SKILL.md`), 'utf-8')
      expect(text).toMatch(/`run`, `story`, `phase`, `skill`, `inputHead`/)
      expect(text).toMatch(/must not (start with|contain) `cd/i)
      expect(text).toMatch(/pnpm --dir/)
    },
  )
})

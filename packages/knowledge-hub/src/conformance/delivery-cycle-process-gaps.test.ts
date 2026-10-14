import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { join } from 'path'

const DATASET = join(__dirname, '../../dataset')
const read = (rel: string) => readFileSync(join(DATASET, rel), 'utf-8')

describe('red-verify: exhaustiveness is a procedure run before deciding, not a wish', () => {
  const text = read('.skills/workflow/red-verify/SKILL.md')
  it('enumerates representations/consumers incl. every CLI entry, every value of each dimension, interaction pairs — then one rejection', () => {
    expect(text).toMatch(/every CLI\/script entry that wires it/)
    expect(text).toMatch(/every value of every enumerated input dimension/)
    expect(text).toMatch(/interaction pairs/)
    expect(text).toMatch(/only then decide/i)
  })
})

describe('implement-phase: the cycle path activates the card and surfaces external ACs before review', () => {
  const text = read('.skills/workflow/implement-phase/SKILL.md')
  it('writes `In Progress` through the implement skill activation step', () => {
    expect(text).toMatch(/Step 0\.1b/)
    expect(text).toMatch(/`In Progress`/)
  })
  it('marks an AC needing live external verification in the result and the PR body', () => {
    expect(text).toMatch(/external — pending live verification/)
  })
  it('the delivery-cycle guideline documents it', () => {
    expect(read('.pair/knowledge/guidelines/collaboration/automation/delivery-cycle.md')).toMatch(
      /external — pending live verification/,
    )
  })
})

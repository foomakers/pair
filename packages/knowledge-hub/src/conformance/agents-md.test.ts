import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { join } from 'path'

const AGENTS_MD = readFileSync(join(__dirname, '../../dataset/AGENTS.md'), 'utf-8')

describe('dataset AGENTS.md paths', () => {
  it('does not reference the legacy adopted/knowledge-base scheme', () => {
    expect(AGENTS_MD).not.toMatch(/\.pair\/tech\/adopted/)
    expect(AGENTS_MD).not.toMatch(/\.pair\/product\/adopted/)
    expect(AGENTS_MD).not.toMatch(/\.pair\/tech\/knowledge-base/)
    expect(AGENTS_MD).not.toMatch(/\.pair\/how-to\/index\.json/)
  })
})

// Shrink discipline (#433 T-7): AGENTS.md / CLAUDE.md are re-read every turn. Trimmed with no rule lost
// (the anchors below are the rules and pointers it carries), plus the default style and the
// minimal-code rule as one line each.
const CLAUDE_MD = readFileSync(join(__dirname, '../../../../CLAUDE.md'), 'utf-8')
const wordCount = (s: string) => s.split(/\s+/).filter(Boolean).length

describe('dataset AGENTS.md shrink (#433 T-7)', () => {
  it('carries the default agent style and the minimal-code rule, one line each', () => {
    const style = AGENTS_MD.split('\n').filter(l => /^default style:.*terse.*recap/i.test(l))
    const code = AGENTS_MD.split('\n').filter(l => /^minimal code:/i.test(l))
    expect(style).toHaveLength(1)
    expect(code).toHaveLength(1)
  })

  it('keeps every rule and pointer', () => {
    const anchors = [
      'Always start by reading the project context',
      '/next',
      'Process Profile',
      'step-catalogue.md',
      'process-profiles.md',
      'HALT',
      'way-of-working.md',
      '.pair/knowledge/how-to/',
      '.pair/llms.txt',
      'PRD.md',
      'project-management-tool/README.md',
      'testing/README.md',
      'code-design/README.md',
      'security-guidelines.md',
      'Maintain session context',
      'One task per session',
      'Tests required',
      'Check adoptions first',
      'Package-specific rules win',
      'No secrets in code',
      'Context consistency',
      'NEVER modify code to fix a bug before creating a test that reproduces it',
      '.pair/working/',
      'ADR or ADL',
      '.pair/adoption/decision-log/',
      'MUST follow templates',
      'pnpm install',
      'pnpm vitest run -t',
      'pnpm lint --filter',
      '01-how-to-create-PRD.md',
      '02-how-to-complete-bootstrap-checklist.md',
      '03-how-to-create-and-prioritize-initiatives.md',
      '06-how-to-breakdown-epics.md',
      '07-how-to-breakdown-user-stories.md',
      '08-how-to-refine-a-user-story.md',
      '09-how-to-create-tasks.md',
      '10-how-to-implement-a-task.md',
      '11-how-to-code-review.md',
      'Understand the bug',
      'Verify test fails',
      'Verify fix',
      'Clean up',
    ]
    for (const a of anchors) expect(AGENTS_MD.toLowerCase(), a).toContain(a.toLowerCase())
  })

  it('is at most 1100 words (was 1437); the installed CLAUDE.md at most 800 (was 944)', () => {
    expect(wordCount(AGENTS_MD)).toBeLessThanOrEqual(1100)
    expect(wordCount(CLAUDE_MD)).toBeLessThanOrEqual(800)
  })
})

// #433 r0-1: the trim dropped the Task Selection Algorithm (oracle: origin/main dataset AGENTS.md items 1
// and 3) while step 1 still pointed at it. Both rules stay, in the source and its root mirror, and the
// step-1 pointer names a section that exists.
const ROOT_AGENTS_MD = readFileSync(join(__dirname, '../../../../AGENTS.md'), 'utf-8')
const hasExactMatchRule = (md: string) =>
  md.split('\n').some(l => /exact match/i.test(l) && /(\bid\b|filename)/i.test(l))
const ARROW = '\\s*(?:→|->)\\s*'
const PROGRESSION = new RegExp(
  ['induction', 'strategic', 'iteration', 'execution', 'review'].join(ARROW),
  'i',
)
const hasProgressionRule = (md: string) => md.split('\n').some(l => PROGRESSION.test(l))
const headingsOf = (md: string) =>
  md
    .split('\n')
    .filter(l => /^#{2,} /.test(l))
    .map(l => l.toLowerCase())
const stepOneLine = (md: string) => md.split('\n').find(l => /\*\*Determine how-to\*\*/.test(l))
// AGENTS.md (source and root mirror): step 1 must exist AND resolve — deleting the step loses a rule.
const stepOnePresentAndResolves = (md: string) => {
  const step = stepOneLine(md)
  if (step === undefined) return false
  const headings = headingsOf(md)
  const toSelection =
    /task selection/i.test(step) && headings.some(h => h.includes('task selection'))
  const toUnsure = /if unsure/i.test(step) && headings.some(h => h.includes('if unsure'))
  return toSelection || toUnsure
}
// CLAUDE.md only: step 1 sits in a claude-skip block, so absence is tolerated; presence must resolve.
const noDanglingStepOne = (md: string) =>
  stepOneLine(md) === undefined || stepOnePresentAndResolves(md)

describe('task selection rules survive the shrink (#433 r0-1)', () => {
  it('W1: dataset AGENTS.md carries the exact-match rule (named how-to ID/filename -> use it)', () => {
    expect(hasExactMatchRule(AGENTS_MD)).toBe(true)
  })

  it('W2: dataset AGENTS.md carries the category progression induction -> strategic -> iteration -> execution -> review', () => {
    expect(hasProgressionRule(AGENTS_MD)).toBe(true)
  })

  it('W3: dataset AGENTS.md keeps step 1 and it points at a section that exists', () => {
    expect(stepOnePresentAndResolves(AGENTS_MD)).toBe(true)
  })

  it('W4: root AGENTS.md mirror carries both rules', () => {
    expect(hasExactMatchRule(ROOT_AGENTS_MD)).toBe(true)
    expect(hasProgressionRule(ROOT_AGENTS_MD)).toBe(true)
  })

  it('W5: root AGENTS.md mirror keeps step 1 and it points at a section that exists', () => {
    expect(stepOnePresentAndResolves(ROOT_AGENTS_MD)).toBe(true)
  })

  it('B1: the origin/main oracle wording and the arrow-free available-tasks list are told apart', () => {
    const oracle = [
      '1. **Exact match**: Developer mentions specific how-to ID/filename → use it',
      '3. **Category workflow**: Follow the natural progression (induction → strategic → iteration → execution → review)',
    ].join('\n')
    expect(hasExactMatchRule(oracle)).toBe(true)
    expect(hasProgressionRule(oracle)).toBe(true)
    expect(hasProgressionRule('- **Induction**: a\n- **Strategic**: b\n- **Review**: c')).toBe(
      false,
    )
    expect(
      stepOnePresentAndResolves('1. **Determine how-to**: use the task selection algorithm below'),
    ).toBe(false)
    expect(
      stepOnePresentAndResolves(
        '1. **Determine how-to**: use the task selection algorithm below\n## Task Selection Algorithm',
      ),
    ).toBe(true)
    // step 1 deleted + both rules appended: the rules are back but step 1 is lost -> rejected
    const stepDeleted = [
      ...AGENTS_MD.split('\n').filter(l => !/\*\*Determine how-to\*\*/.test(l)),
      ...oracle.split('\n'),
    ].join('\n')
    expect(hasExactMatchRule(stepDeleted)).toBe(true)
    expect(stepOnePresentAndResolves(stepDeleted)).toBe(false)
    expect(noDanglingStepOne('no step here')).toBe(true)
  })

  it('C2: CLAUDE.md carries no dangling step-1 pointer', () => {
    expect(noDanglingStepOne(CLAUDE_MD)).toBe(true)
  })
})

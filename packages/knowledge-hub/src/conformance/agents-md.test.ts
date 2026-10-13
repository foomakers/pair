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

import { describe, it, expect } from 'vitest'
import { readFileSync, existsSync } from 'fs'
import { join } from 'path'

const PM_TOOL_DIR = join(
  __dirname,
  '../../dataset/.pair/knowledge/guidelines/collaboration/project-management-tool',
)

const DOR_DOD = readFileSync(join(PM_TOOL_DIR, 'definition-of-ready-and-done.md'), 'utf-8')
const CANONICAL_STATES = readFileSync(join(PM_TOOL_DIR, 'canonical-states.md'), 'utf-8')
const PM_README = readFileSync(join(PM_TOOL_DIR, 'README.md'), 'utf-8')
const USER_STORY_TEMPLATE = readFileSync(
  join(
    __dirname,
    '../../dataset/.pair/knowledge/guidelines/collaboration/templates/user-story-template.md',
  ),
  'utf-8',
)
const VERIFY_DONE_SKILL = readFileSync(
  join(__dirname, '../../dataset/.skills/capability/verify-done/SKILL.md'),
  'utf-8',
)
const VERIFY_DONE_MIRROR = readFileSync(
  join(__dirname, '../../../../.claude/skills/pair-capability-verify-done/SKILL.md'),
  'utf-8',
)

describe('definition-of-ready-and-done.md — structure', () => {
  it('has the expected title and is a companion to canonical-states.md', () => {
    expect(DOR_DOD).toMatch(/^# Definition of Ready & Definition of Done/m)
    expect(DOR_DOD).toMatch(/Companion to \[canonical-states\.md\]/)
  })

  it('documents all 6 DoR criteria', () => {
    for (const criterion of [
      'Clear title',
      'Problem/goal',
      'Verifiable AC',
      'Estimate',
      'Dependencies',
      'Design flag',
    ]) {
      expect(DOR_DOD).toContain(criterion)
    }
  })

  it('defines the Design flag as not required | required + reference', () => {
    expect(DOR_DOD).toMatch(/`not required`/)
    expect(DOR_DOD).toMatch(/`required — reference: <link>`/)
  })

  it('documents the inline task-breakdown signal as a first-class readiness signal', () => {
    expect(DOR_DOD).toMatch(/Inline task-breakdown signal/)
    expect(DOR_DOD).toMatch(/## Task Breakdown/)
    expect(DOR_DOD).toMatch(/first-class readiness signal/)
  })

  it('degrades gracefully for stories predating this template', () => {
    expect(DOR_DOD).toMatch(/Legacy stories \(predate this template\)/)
    expect(DOR_DOD).toMatch(/report the \*specific\* missing criteria/)
  })

  it('documents all 4 DoD criteria and excludes deployment', () => {
    for (const criterion of [
      'AC satisfied',
      'PR approved per risk tier',
      'CI green',
      'No critical bugs',
    ]) {
      expect(DOR_DOD).toContain(criterion)
    }
    expect(DOR_DOD).toMatch(/Deployment is explicitly excluded/)
  })

  it('states mapped state is always the primary signal over the DoR fallback', () => {
    expect(DOR_DOD).toMatch(/Mapped state is always the primary signal/)
    expect(DOR_DOD).toMatch(/never require both signals to agree/i)
  })

  it('walks through the readiness fallback for a board with no Ready state', () => {
    expect(DOR_DOD).toMatch(/Readiness Fallback Walkthrough/)
    expect(DOR_DOD).toMatch(/mandatory D4 fallback scenario/)
  })

  it('reports conflicting signals as a warning, never a block', () => {
    expect(DOR_DOD).toMatch(/## Conflicting Signals/)
    expect(DOR_DOD).toMatch(/never as a block/)
  })

  it('cross-references quality-model.md for per-tier DoD requirements without duplicating it', () => {
    expect(DOR_DOD).toMatch(/not duplicated here/)
    expect(DOR_DOD).toContain('quality-model.md')
  })

  it('resolves every relative link to a file on disk', () => {
    const links = [...DOR_DOD.matchAll(/\]\(([^)#]+)(?:#[^)]*)?\)/g)]
      .map(m => m[1])
      .filter(link => !link.startsWith('http'))
    expect(links.length).toBeGreaterThan(0)
    for (const link of links) {
      expect(existsSync(join(PM_TOOL_DIR, link))).toBe(true)
    }
  })
})

describe('canonical-states.md — DoR/DoD integration', () => {
  it('points the Readiness Fallback at the companion DoR/DoD doc instead of a placeholder', () => {
    expect(CANONICAL_STATES).toMatch(
      /\[definition-of-ready-and-done\.md\]\(definition-of-ready-and-done\.md\)/,
    )
    expect(CANONICAL_STATES).not.toMatch(/tracked as a dependent story to this one/)
  })
})

describe('project-management-tool README — index', () => {
  it('lists definition-of-ready-and-done.md in the directory contents', () => {
    expect(PM_README).toMatch(/definition-of-ready-and-done\.md/)
  })
})

describe('user-story-template.md — DoR-verifiable sections', () => {
  it('has a Design line in the Technical Analysis / Implementation Approach section', () => {
    expect(USER_STORY_TEMPLATE).toMatch(
      /\*\*Design\*\*: \[not required \| required — reference: link\/path to the design doc\]/,
    )
  })

  it('points readers at the canonical DoR/DoD mapping table', () => {
    expect(USER_STORY_TEMPLATE).toMatch(/definition-of-ready-and-done\.md/)
  })
})

describe('verify-done SKILL.md — canonical DoD integration', () => {
  it('lists the canonical doc as a source of truth, ahead of the legacy universal checklist', () => {
    const canonicalIndex = VERIFY_DONE_SKILL.indexOf('definition-of-ready-and-done.md')
    const legacyIndex = VERIFY_DONE_SKILL.indexOf('definition-of-done.md')
    expect(canonicalIndex).toBeGreaterThan(-1)
    expect(canonicalIndex).toBeLessThan(legacyIndex)
  })

  it('adds the PR-approval-per-risk-tier and critical-bugs steps', () => {
    expect(VERIFY_DONE_SKILL).toMatch(/### Step 3: PR Approval per Risk Tier/)
    expect(VERIFY_DONE_SKILL).toMatch(/### Step 10: Critical Bugs/)
  })

  it('applies the fail-safe red-tier default when risk-tier data is unavailable', () => {
    expect(VERIFY_DONE_SKILL).toMatch(/fail-safe default per ADR-013/)
  })

  it('states deployment is excluded from the canonical DoD', () => {
    expect(VERIFY_DONE_SKILL).toMatch(/Deployment is explicitly excluded/)
  })
})

describe('verify-done SKILL.md — root/dataset structural parity (#241 round-4)', () => {
  // Guards against the exact drift class this story exists to eliminate: a fix
  // landing only in the dataset (or only in the root mirror) instead of both.
  // Content differs in self-naming (/pair-capability-verify-done vs /verify-done)
  // and cross-skill references, so this checks structure, not byte-equality.
  const stepHeadings = (content: string) => content.match(/^### Step \d+:.*$/gm) ?? []
  const skipClauses = (content: string) => content.match(/^\d+\.\s+\*\*Skip\*\*:.*$/gm) ?? []

  it('has the same number of numbered Steps in root and dataset', () => {
    expect(stepHeadings(VERIFY_DONE_MIRROR).length).toBe(stepHeadings(VERIFY_DONE_SKILL).length)
  })

  it('has the same number of Skip clauses in root and dataset', () => {
    expect(skipClauses(VERIFY_DONE_MIRROR).length).toBe(skipClauses(VERIFY_DONE_SKILL).length)
  })

  it('Steps 3 and 10 carry the already-verified-this-session skip clause in both root and dataset', () => {
    for (const content of [VERIFY_DONE_SKILL, VERIFY_DONE_MIRROR]) {
      const step3 = content.split('### Step 3:')[1]?.split('### Step 4:')[0] ?? ''
      const step10 = content.split('### Step 10:')[1]?.split('### Step 11:')[0] ?? ''
      expect(step3).toMatch(/already verified earlier in this session.*mark PASS/)
      expect(step10).toMatch(/already verified earlier in this session.*mark PASS/)
    }
  })
})

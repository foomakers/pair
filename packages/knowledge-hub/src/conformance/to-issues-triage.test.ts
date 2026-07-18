import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { join } from 'path'

// Conformance guard for story #231: plan-epics and plan-stories triage candidates
// against the existing PM-tool tree (EXTEND vs CREATE) instead of a plain
// exists-then-skip check, per the shared to-issues-triage.md convention.

const DATASET_SKILLS = join(__dirname, '../../dataset/.skills/process')
const DATASET_CONVENTIONS = join(__dirname, '../../dataset/.pair/knowledge/skill-conventions')
const MIRROR = join(__dirname, '../../../../.claude/skills')

const CONVENTION = readFileSync(join(DATASET_CONVENTIONS, 'to-issues-triage.md'), 'utf-8')
const CONVENTION_README = readFileSync(join(DATASET_CONVENTIONS, 'README.md'), 'utf-8')

const PLAN_SKILLS = ['plan-epics', 'plan-stories'] as const
const MIRROR_NAME: Record<(typeof PLAN_SKILLS)[number], string> = {
  'plan-epics': 'pair-process-plan-epics',
  'plan-stories': 'pair-process-plan-stories',
}

function dataset(skill: string): string {
  return readFileSync(join(DATASET_SKILLS, skill, 'SKILL.md'), 'utf-8')
}

function mirror(skill: (typeof PLAN_SKILLS)[number]): string {
  return readFileSync(join(MIRROR, MIRROR_NAME[skill], 'SKILL.md'), 'utf-8')
}

describe('to-issues-triage.md — shared convention', () => {
  it('is registered in the skill-conventions README', () => {
    expect(CONVENTION_README).toMatch(/to-issues-triage\.md/)
  })

  it('documents the idempotency key (normalized title + parent)', () => {
    expect(CONVENTION.toLowerCase()).toMatch(/normalized title/)
    expect(CONVENTION.toLowerCase()).toMatch(/parent/)
  })

  it('documents EXTEND vs CREATE with a rationale requirement', () => {
    expect(CONVENTION).toMatch(/EXTEND/)
    expect(CONVENTION).toMatch(/CREATE/)
    expect(CONVENTION.toLowerCase()).toMatch(/rationale/)
  })

  it('documents ambiguous-match handling as a question with a recommendation', () => {
    expect(CONVENTION.toLowerCase()).toMatch(/ambiguous/)
    expect(CONVENTION.toLowerCase()).toMatch(/recommendation/)
  })

  it('documents closed-item handling (never EXTEND a closed item)', () => {
    expect(CONVENTION.toLowerCase()).toMatch(/closed/)
    expect(CONVENTION).toMatch(/never EXTEND/)
  })

  it('states the conservative-threshold rule (default to CREATE unless overlap is clear)', () => {
    expect(CONVENTION.toLowerCase()).toMatch(/conservative/)
  })

  it('Step 3 (Act/classify) compares against open-or-closed items, not open-only', () => {
    // Regression guard for PR #338 round-3 fix (Major-2): Step 3's opening sentence
    // previously restricted the comparison set to "open" items while the very next
    // bullet required detecting a "closed" best-match — self-contradictory spec.
    const step3 = CONVENTION.match(/3\.\s+\*\*Act\*\*:[\s\S]*?(?=\n4\.\s+\*\*Verify\*\*:)/)?.[0]
    expect(step3).toBeDefined()
    expect(step3).toMatch(/open or closed/i)
  })

  it('documents body-merge idempotency (overlap EXTEND re-merge is a no-op when scope already present)', () => {
    // Regression guard: repeated overlap-based EXTENDs must not accrete scope text.
    expect(CONVENTION.toLowerCase()).toMatch(/body-merge idempotency/)
    expect(CONVENTION.toLowerCase()).toMatch(/no-op when the scope is already present/)
  })

  it('plan-epics/plan-stories Step 2 registry query includes closed/Done items (both dataset + mirror)', () => {
    // The closed-item triage rule needs closed items in the registry; PM queries
    // often default to open-only, so the query must say so explicitly.
    for (const skill of PLAN_SKILLS) {
      for (const content of [dataset(skill), mirror(skill)]) {
        expect(content).toMatch(/including closed\/Done items/)
      }
    }
  })

  it('carries a fixture backlog + candidate tree example with a double-run note', () => {
    expect(CONVENTION).toMatch(/Fixture example/)
    expect(CONVENTION.toLowerCase()).toMatch(/re-running/)
  })
})

describe.each(PLAN_SKILLS)('%s — to-issues triage composed', skill => {
  it('dataset SKILL.md points to the shared to-issues-triage convention', () => {
    expect(dataset(skill)).toMatch(/to-issues-triage\.md/)
  })

  it('dataset SKILL.md proposes EXTEND <id> or CREATE before any write', () => {
    const content = dataset(skill)
    expect(content).toMatch(/EXTEND/)
    expect(content).toMatch(/CREATE/)
    expect(content.toLowerCase()).toMatch(/before any write/)
  })

  it('dataset SKILL.md still declares an idempotent re-run behavior', () => {
    expect(dataset(skill).toLowerCase()).toMatch(/never duplicates/)
  })

  it('installed mirror carries the same triage pointer and proposal shape', () => {
    const content = mirror(skill)
    expect(content).toMatch(/to-issues-triage\.md/)
    expect(content).toMatch(/EXTEND/)
    expect(content).toMatch(/CREATE/)
  })

  it('exact-match check runs at Step 3 triage time (proposal), not deferred to Step 4 (write time)', () => {
    // Regression guard for PR #338 review finding: the exact idempotency-key
    // match must be classified as ALREADY EXISTS in the same dry-run proposal
    // shown for developer approval (Step 3) — not decided later at write time,
    // which would make the confirmed proposal diverge from what actually happens.
    const step3 = dataset(skill).split(/### Step 4/)[0]
    expect(step3).toMatch(/ALREADY EXISTS/)
    const step4 = dataset(skill).split(/### Step 4/)[1]
    expect(step4).toMatch(/confirmed Step 3 proposal.*ALREADY EXISTS/)
  })

  it('Step 3 documents the ambiguous outcome as reachable in dataset and mirror', () => {
    // Regression guard for PR #338 round-3 fix (Major-1): Step 3's own Verify
    // wording previously enumerated only ALREADY EXISTS/EXTEND/CREATE, making the
    // ambiguous-question outcome unreachable per the skill's own spec.
    const datasetStep3 = dataset(skill).match(/### Step 3:[\s\S]*?(?=\n### )/)?.[0]
    expect(datasetStep3).toBeDefined()
    expect(datasetStep3).toMatch(/ambiguous/i)

    const mirrorStep3 = mirror(skill).match(/### Step 3:[\s\S]*?(?=\n### )/)?.[0]
    expect(mirrorStep3).toBeDefined()
    expect(mirrorStep3).toMatch(/ambiguous/i)
  })
})

describe('plan-stories — INVEST preserved alongside triage (AC2)', () => {
  it('INVEST validation still runs for CREATE candidates', () => {
    const content = dataset('plan-stories')
    expect(content).toMatch(/INVEST/)
    expect(content).toMatch(/\*\*I\*\*ndependent/)
    expect(content).toMatch(/\*\*S\*\*mall/)
    expect(content).toMatch(/\*\*T\*\*estable/)
  })

  it('EXTEND path re-validates INVEST for the merged scope', () => {
    expect(dataset('plan-stories')).toMatch(/Re-validate INVEST for the merged scope/)
  })
})

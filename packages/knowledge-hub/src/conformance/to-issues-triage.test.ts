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

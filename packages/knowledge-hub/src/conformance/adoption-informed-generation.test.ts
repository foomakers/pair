import { describe, it, expect } from 'vitest'
import { existsSync, readFileSync } from 'fs'
import { join } from 'path'

// Conformance guard for story #280: story generation is ADOPTION-INFORMED — the
// generating flows (plan-stories, brainstorm's triage phase, refine-story) read the
// project's recorded decisions (ADRs, decision log) and the context map BEFORE
// drafting, so generated content reflects and cites them instead of contradicting or
// re-proposing what was already settled (R3.13).
//
// The rule this file encodes: the reading step is defined ONCE, in the shared
// `adoption-informed-generation.md` convention, and each generation skill carries only
// its own delta + a pointer — the mitigation for "each touched skill interprets
// 'adoption-informed' differently" (story #280 risk table). A skill that re-describes
// the mechanics instead of pointing at the convention is the drift this guards.

const DATASET_SKILLS = join(__dirname, '../../dataset/.skills/process')
const DATASET_CONVENTIONS = join(
  __dirname,
  '../../dataset/.pair/knowledge/guidelines/technical-standards/ai-development/skill-conventions',
)
const REPO_ROOT = join(__dirname, '../../../..')
const ROOT_CONVENTIONS = join(
  REPO_ROOT,
  '.pair/knowledge/guidelines/technical-standards/ai-development/skill-conventions',
)
const MIRROR = join(REPO_ROOT, '.claude/skills')

const CONVENTION_FILE = 'adoption-informed-generation.md'
const CONVENTION = readFileSync(join(DATASET_CONVENTIONS, CONVENTION_FILE), 'utf-8')
const CONVENTION_README = readFileSync(join(DATASET_CONVENTIONS, 'README.md'), 'utf-8')

const GENERATION_SKILLS = ['plan-stories', 'brainstorm', 'refine-story'] as const
type GenerationSkill = (typeof GENERATION_SKILLS)[number]

const MIRROR_NAME: Record<GenerationSkill, string> = {
  'plan-stories': 'pair-process-plan-stories',
  brainstorm: 'pair-process-brainstorm',
  'refine-story': 'pair-process-refine-story',
}

function dataset(skill: GenerationSkill): string {
  return readFileSync(join(DATASET_SKILLS, skill, 'SKILL.md'), 'utf-8')
}

function mirror(skill: GenerationSkill): string {
  return readFileSync(join(MIRROR, MIRROR_NAME[skill], 'SKILL.md'), 'utf-8')
}

function bothCopies(skill: GenerationSkill): Array<[string, string]> {
  return [
    [`${skill} (dataset)`, dataset(skill)],
    [`${skill} (installed mirror)`, mirror(skill)],
  ]
}

describe('adoption-informed-generation.md — the shared reading step (T1)', () => {
  it('exists in the dataset AND in the installed KB mirror', () => {
    expect(existsSync(join(DATASET_CONVENTIONS, CONVENTION_FILE))).toBe(true)
    expect(existsSync(join(ROOT_CONVENTIONS, CONVENTION_FILE))).toBe(true)
  })

  it('is registered in the skill-conventions README index', () => {
    expect(CONVENTION_README).toMatch(/adoption-informed-generation\.md/)
  })

  it('names all three adoption sources it reads (AC1)', () => {
    expect(CONVENTION).toMatch(/adoption\/tech\/adr\//)
    expect(CONVENTION).toMatch(/adoption\/decision-log\//)
    expect(CONVENTION).toMatch(/context-map\.md/)
  })

  it('fixes the read order, so the same adoption yields the same read (AC4)', () => {
    expect(CONVENTION.toLowerCase()).toMatch(/fixed order/)
    expect(CONVENTION.toLowerCase()).toMatch(/determinis/)
  })

  it('bounds the read to the subject scope — the context-bloat mitigation', () => {
    expect(CONVENTION.toLowerCase()).toMatch(/bounded read/)
    // Never the whole history: the index of every record, the body of the relevant ones.
    expect(CONVENTION.toLowerCase()).toMatch(/never the entire (decision )?history/)
  })

  it('resolves conflicting decisions by supersession, then recency (edge case)', () => {
    expect(CONVENTION).toMatch(/Superseded/)
    expect(CONVENTION.toLowerCase()).toMatch(/most recent/)
  })

  it('defines what "informed" concretely means — constrain, cite, flag-revisit', () => {
    expect(CONVENTION.toLowerCase()).toMatch(/constrain/)
    expect(CONVENTION.toLowerCase()).toMatch(/cite/)
    expect(CONVENTION).toMatch(/Revisits/)
  })

  it('fixes ONE citation form for every source kind (AC2)', () => {
    expect(CONVENTION).toMatch(/per ADR-/)
    expect(CONVENTION).toMatch(/per decision-log\//)
    expect(CONVENTION).toMatch(/per context-map:/)
  })

  it('is read-only — generation never writes a decision record', () => {
    expect(CONVENTION.toLowerCase()).toMatch(/read-only/)
    expect(CONVENTION).toMatch(/\/record-decision/)
    expect(CONVENTION.toLowerCase()).toMatch(/never writes/)
  })

  it('degrades gracefully on empty or unparseable adoption, never HALTs (AC3)', () => {
    const degradation = CONVENTION.match(/## Degradation[\s\S]*?(?=\n## )/)?.[0]
    expect(degradation).toBeDefined()
    expect(degradation?.toLowerCase()).toMatch(/no adoption/)
    expect(degradation?.toLowerCase()).toMatch(/unparseable/)
    expect(degradation).toMatch(/never (a )?HALT/)
    // Empty adoption must be indistinguishable from today's behavior.
    expect(degradation?.toLowerCase()).toMatch(/no citations/)
  })

  it('carries a fixture example for BOTH the seeded and the empty-adoption path (T3)', () => {
    const fixture = CONVENTION.match(/## Fixture example[\s\S]*?(?=\n## )/)?.[0]
    expect(fixture).toBeDefined()
    expect(fixture).toMatch(/ADR-/)
    expect(fixture).toMatch(/Revisits/)
    expect(fixture?.toLowerCase()).toMatch(/empty-adoption/)
  })

  it('leaves the per-skill delta to the skill, keeping the mechanics single-sourced', () => {
    expect(CONVENTION).toMatch(/## Per-skill delta/)
  })

  it('reuses an already-loaded context map instead of re-reading it (no double read)', () => {
    // brainstorm phase 2 and refine-story Step 2 already load the map; a second read
    // would be both wasteful and a determinism hazard (two reads, one run).
    expect(CONVENTION.toLowerCase()).toMatch(/already loaded/)
  })
})

describe.each(GENERATION_SKILLS)('%s — adoption-informed generation wired in (T2)', skill => {
  it('points at the shared convention instead of re-describing it (dataset + mirror)', () => {
    for (const [label, content] of bothCopies(skill)) {
      expect(content, label).toMatch(/adoption-informed-generation\.md/)
    }
  })

  it('states its own delta — which subject scopes the read', () => {
    for (const [label, content] of bothCopies(skill)) {
      expect(content, label).toMatch(/This skill's subject/)
    }
  })

  it('carries the read as an explicit algorithm beat named for adoption context', () => {
    for (const [label, content] of bothCopies(skill)) {
      expect(content, label).toMatch(/Adoption Context Read/i)
    }
  })

  it('cites the decisions that shaped generated content (AC2)', () => {
    for (const [label, content] of bothCopies(skill)) {
      expect(content, label).toMatch(/cite|citation/i)
    }
  })

  it('flags a genuine revisit instead of silently contradicting a decision (edge case)', () => {
    for (const [label, content] of bothCopies(skill)) {
      expect(content, label).toMatch(/Revisits/)
    }
  })

  it('lists the empty/unreadable-adoption degradation in its own Graceful Degradation section (AC3)', () => {
    for (const [label, content] of bothCopies(skill)) {
      const section = content.match(/## Graceful Degradation[\s\S]*?(?=\n## )/)?.[0]
      expect(section, label).toBeDefined()
      expect(section, label).toMatch(/adoption-informed/i)
    }
  })

  it('does not re-describe the convention mechanics (no per-skill source list)', () => {
    // The anti-drift check: only the convention enumerates the source directories.
    // A skill naming them itself is the start of three divergent interpretations.
    for (const [label, content] of bothCopies(skill)) {
      expect(content, label).not.toMatch(/adoption\/tech\/adr\//)
    }
  })
})

describe('read-only guarantee at the skill level (business rule)', () => {
  it('no generation skill claims to write a decision record from the adoption read', () => {
    for (const skill of GENERATION_SKILLS) {
      for (const [label, content] of bothCopies(skill)) {
        const beat = content.match(/Adoption Context Read[\s\S]*?(?=\n#{3,4} |\n## )/)?.[0]
        expect(beat, label).toBeDefined()
        expect(beat, label).toMatch(/read-only/i)
      }
    }
  })
})

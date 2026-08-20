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
    // Review finding (#280, Minor): this asserted /cite|citation/i, which brainstorm
    // ALREADY satisfied before this story ("Cite the deciding source for each entry",
    // phase 2's inline map maintenance) — so for one of the three skills the guard was
    // vacuous and would not have caught a revert. The NOUN `citation` appears in none
    // of the three on the pre-change corpus, so it carries signal for all three.
    for (const [label, content] of bothCopies(skill)) {
      expect(content, label).toMatch(/\bcitations?\b/i)
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

// ---------------------------------------------------------------------------
// Round-1 review findings (#280). Each guard names the finding it pins so a
// later edit that reintroduces the defect fails with its reason attached.
// ---------------------------------------------------------------------------

describe('review round 1 — authorities, bounded read, inherited read', () => {
  it('reads `Category: Analysis` entries as CONTEXT, never as an authority (Major)', () => {
    // An analysis concludes in a `## Recommendation`, not a `## Decision`, and need
    // not conclude in one at all: folding it in with ADLs let a candidate be dropped
    // as "rejected by a decision" nobody ever took.
    const authorities = CONVENTION.match(/\*\*Authorities vs context\.\*\*[\s\S]*?\n\n/)?.[0]
    expect(authorities).toBeDefined()
    expect(authorities).toMatch(/Category: Analysis/)
    expect(authorities).toMatch(/never/)
    expect(authorities).toMatch(/Revisits/)
  })

  it('keeps an analysis entry out of the precedence order entirely (Major)', () => {
    // Otherwise a dated analysis outranks a live ADR, since kind is not a rank.
    const precedence = CONVENTION.match(/## Precedence[\s\S]*?(?=\n## )/)?.[0]
    expect(precedence).toBeDefined()
    expect(precedence).toMatch(/Category: Analysis/)
    expect(precedence).toMatch(/never outranks/)
  })

  it('indexes records from metadata only — stage 1 opens no body (Major)', () => {
    // A "one-line summary" is in no record template, so deriving one would have read
    // all N bodies — the exact cost the bounded read exists to avoid.
    const bounded = CONVENTION.match(/## Bounded read[\s\S]*?(?=\n## )/)?.[0]
    expect(bounded).toBeDefined()
    expect(bounded).toMatch(/metadata only/i)
    expect(bounded).toMatch(/H1 title/)
    expect(bounded).toMatch(/no record body is read here/i)
  })

  it('names the strategic subdomain catalog entry the scope filter resolves from (Minor)', () => {
    expect(CONVENTION).toMatch(/adoption\/product\/subdomain\/<slug>\.md/)
    expect(CONVENTION).toMatch(/subdomain\/<slug>\.context\.md/)
  })

  it('makes a composed writer inherit the caller read instead of re-deriving it (Minor)', () => {
    // brainstorm phase 3 reads, then composes plan-stories: without this the read is
    // paid twice in one flow, and the second, differently scoped pass can drop a
    // candidate the developer just approved.
    expect(CONVENTION).toMatch(/composed writer is part of the caller's run/i)
    expect(CONVENTION).toMatch(/caller's scope is the run's scope/i)
  })

  it('plan-stories takes the caller read in-band and skips its own (Minor)', () => {
    for (const [label, content] of bothCopies('plan-stories')) {
      expect(content, label).toMatch(/\$adoption-read/)
    }
    for (const [label, content] of bothCopies('brainstorm')) {
      expect(content, label).toMatch(/\$adoption-read/)
    }
  })

  it('refine-story Step 1b has no undecidable skip condition (Major)', () => {
    // The old gate keyed on "no section is being re-authored" — a fact only Step 6
    // knows, and Step 6 runs after. The already-Ready update is exactly the path
    // where a decision recorded since the last refinement must be read.
    for (const [label, content] of bothCopies('refine-story')) {
      const beat = content.match(/### Step 1b[\s\S]*?(?=\n### )/)?.[0]
      expect(beat, label).toBeDefined()
      expect(beat, label).toMatch(/\*\*Always runs\*\*/)
      expect(beat, label).not.toMatch(/\*\*Skip if\*\*/)
      // ...and the forward reference is backed: Step 6 states what it inherits.
      const step6 = content.match(/### Step 6[\s\S]*?(?=\n## )/)?.[0]
      expect(step6, label).toBeDefined()
      expect(step6, label).toMatch(/Step 1b/)
    }
  })

  it('refine-story shows a record-attributed DROP before taking the approval (Major)', () => {
    // Dropping an acceptance criterion is the most consequential of the three
    // effects; without this line the developer approves a shorter list silently.
    for (const [label, content] of bothCopies('refine-story')) {
      const step2 = content.match(/### Step 2: Requirements Analysis[\s\S]*?(?=\n### )/)?.[0]
      expect(step2, label).toBeDefined()
      expect(step2, label).toMatch(/Dropped by a recorded decision/)
      expect(step2, label).toMatch(/an approval is never taken on a list/)
    }
  })

  it('plan-epics persists a supplied citation into the epic body (Minor)', () => {
    // brainstorm claims BOTH writers carry the citation and the revisit flag; without
    // this, the initiative-root path drops them at the write boundary.
    const copies: Array<[string, string]> = [
      ['plan-epics (dataset)', readFileSync(join(DATASET_SKILLS, 'plan-epics/SKILL.md'), 'utf-8')],
      [
        'plan-epics (installed mirror)',
        readFileSync(join(MIRROR, 'pair-process-plan-epics/SKILL.md'), 'utf-8'),
      ],
    ]
    for (const [label, content] of copies) {
      expect(content, label).toMatch(/\*\*Citations\*\*/)
      expect(content, label).toMatch(/Revisits/)
      expect(content, label).toMatch(/runs no adoption read of its own/)
    }
  })
})

import { describe, it, expect } from 'vitest'
import { existsSync, readFileSync, readdirSync } from 'fs'
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

// ---------------------------------------------------------------------------
// Round-2 review findings (#280). Same rule as above: one guard per finding,
// naming it, so a later edit that reopens the gap fails with the reason attached.
// ---------------------------------------------------------------------------

const DATASET_KNOWLEDGE = join(__dirname, '../../dataset/.pair/knowledge')
const SKILLS_GUIDE_COPIES: Array<[string, string]> = [
  ['skills-guide (dataset)', readFileSync(join(DATASET_KNOWLEDGE, 'skills-guide.md'), 'utf-8')],
  [
    'skills-guide (installed mirror)',
    readFileSync(join(REPO_ROOT, '.pair/knowledge/skills-guide.md'), 'utf-8'),
  ],
]

const PLAN_EPICS_COPIES: Array<[string, string]> = [
  ['plan-epics (dataset)', readFileSync(join(DATASET_SKILLS, 'plan-epics/SKILL.md'), 'utf-8')],
  [
    'plan-epics (installed mirror)',
    readFileSync(join(MIRROR, 'pair-process-plan-epics/SKILL.md'), 'utf-8'),
  ],
]

describe('review round 2 — status authority, kind discriminator, declared channels', () => {
  it('defines the LIVE set, so a `Proposed` draft never constrains generation (Major)', () => {
    // Supersession was the only authority test: everything not `Superseded` counted
    // as live, so an ADR left at `Status: Proposed` pending review would DROP a
    // candidate and be cited as if the team had decided — and a `Deprecated` record
    // with no successor would keep constraining forever.
    const precedence = CONVENTION.match(/## Precedence[\s\S]*?(?=\n## )/)?.[0]
    expect(precedence).toBeDefined()
    expect(precedence).toMatch(/\*\*Live\*\*/)
    expect(precedence).toMatch(/Accepted/)
    expect(precedence).toMatch(/Active/)
    // The two non-live statuses the supersession test used to let through.
    expect(precedence).toMatch(/Proposed/)
    expect(precedence).toMatch(/Deprecated/)
  })

  it('indexes the kind discriminator, so an analysis is told from an ADL at stage 1 (Minor)', () => {
    // ADL and `Category: Analysis` entries share `decision-log/`. Without `Category`
    // (or the H1 prefix) in the indexed metadata, stage 1 could not classify them —
    // forcing either a body read (defeating "metadata only") or a precedence pass in
    // which an analysis is indistinguishable from an authority.
    const bounded = CONVENTION.match(/## Bounded read[\s\S]*?(?=\n## )/)?.[0]
    expect(bounded).toBeDefined()
    expect(bounded).toMatch(/## Category/)
    expect(bounded).toMatch(/# Analysis Log:/)
    expect(bounded).toMatch(/opened at stage 2 before it may act as an authority/)
  })

  it('lists the generating skills as readers of ADR and ADL in the skills-guide matrix (Minor)', () => {
    // The matrix is the single index of which skill consumes which adoption artifact;
    // this story makes three generating skills first-class readers of both.
    for (const [label, content] of SKILLS_GUIDE_COPIES) {
      for (const row of ['| Decisions (ADR) |', '| Decisions (ADL) |']) {
        const line = content.split('\n').find(l => l.startsWith(row))
        expect(line, `${label} — ${row}`).toBeDefined()
        for (const reader of ['plan-stories', 'refine-story', 'brainstorm']) {
          expect(line, `${label} — ${row} — ${reader}`).toContain(reader)
        }
      }
    }
  })

  it('declares the citation annotations on plan-epics `$candidates`, its only channel (Minor)', () => {
    // plan-epics persists a supplied citation but runs no read of its own: if the
    // argument contract does not carry the annotation, a caller building the
    // documented shape drops it at the write boundary.
    for (const [label, content] of PLAN_EPICS_COPIES) {
      const row = content.split('\n').find(l => l.startsWith('| `$candidates`'))
      expect(row, label).toBeDefined()
      expect(row, label).toMatch(/citation/i)
      expect(row, label).toMatch(/Revisits/)
    }
    // Same shape on plan-stories, so the two writers declare one contract.
    for (const [label, content] of bothCopies('plan-stories')) {
      const row = content.split('\n').find(l => l.startsWith('| `$candidates`'))
      expect(row, label).toBeDefined()
      expect(row, label).toMatch(/Revisits/)
    }
  })

  it('couples `$adoption-read` to `$candidates` — supplied alone it is not the run read (Minor)', () => {
    // The effects it carries are computed per candidate: honouring it without the
    // candidate set would skip Step 2b's own read and check Step 3's freshly derived
    // candidates against effects for candidates that do not exist — a silent no-op.
    for (const [label, content] of bothCopies('plan-stories')) {
      const row = content.split('\n').find(l => l.startsWith('| `$adoption-read`'))
      expect(row, label).toBeDefined()
      expect(row, label).toMatch(/only together with `\$candidates`/)
      const step2b = content.match(/### Step 2b[\s\S]*?(?=\n### )/)?.[0]
      expect(step2b, label).toBeDefined()
      expect(step2b, label).toMatch(/without\*\* `\$candidates`/)
    }
  })

  it('refine-story routes the already-Ready path THROUGH Step 1b (Minor)', () => {
    // Step 6 asserts as fact that Step 1b already ran; the route that reaches it
    // named Step 6 directly, so an executor could re-author sections with no records.
    for (const [label, content] of bothCopies('refine-story')) {
      const route = content.split('\n').find(l => l.includes('**All sections present**'))
      expect(route, label).toBeDefined()
      expect(route, label).toMatch(/Step 1b/)
    }
  })

  it('lists the DDR citation form wherever a skill enumerates the forms (Minor)', () => {
    // DDRs are authorities and are reachable on the read path; a skill list missing
    // the form leaves an executor to invent one, breaking the single-form guarantee.
    const enumerating: Array<[string, string]> = [
      ...bothCopies('plan-stories'),
      ...bothCopies('refine-story'),
      ...PLAN_EPICS_COPIES,
    ]
    for (const [label, content] of enumerating) {
      expect(content, label).toMatch(/\(per ADR-013\)/)
      expect(content, label).toMatch(/\(per DDR-004\)/)
    }
  })

  it('brainstorm keeps the Draft-exit attribution and the `/next` hand-off (Minor)', () => {
    // Removed with the Notes restatements to fund the byte budget, but item 8 carried
    // only the Draft landing — D24 and the `/next` pointer were not preserved anywhere.
    for (const [label, content] of bothCopies('brainstorm')) {
      const item8 = content.split('\n').find(l => l.includes('Items land as **Draft**'))
      expect(item8, label).toBeDefined()
      expect(item8, label).toMatch(/D24/)
      expect(item8, label).toMatch(/\/(pair-)?next/)
    }
  })
})

// ---------------------------------------------------------------------------
// Round-3 AND round-5 review findings (#280). One guard per finding, naming it —
// the two stage-2 scope guards at the end of this block are round 5's, not round 3's.
// ---------------------------------------------------------------------------

describe('review rounds 3-5 — head-field spellings, date ordering, sweep cost, stage-2 scope', () => {
  it('resolves Status in BOTH head spellings and never reads silence as "not live" (Major)', () => {
    // Stage 1 keyed liveness on a `## Status` HEADING, and round 2 made liveness a hard
    // gate. On pair's own tree 9 of 20 ADRs carry `**Status:** Accepted` as an inline
    // head field (adr-001..008, adr-010) — all live Accepted records. Under the old
    // text ADR-005 indexes with no resolvable Status, so it is not live: a story
    // touching the skills registry is generated contradicting its flatten contract with
    // no `(per ADR-005)` and no `Revisits` — the AC1 outcome the convention forbids.
    const bounded = CONVENTION.match(/## Bounded read[\s\S]*?(?=\n## )/)?.[0]
    expect(bounded).toBeDefined()
    expect(bounded).toMatch(/\*\*Status:\*\*/)
    // The stage-2 fallback the Category rule already had, extended to Status.
    expect(bounded).toMatch(/absent or unrecognized/i)
    expect(bounded).toMatch(/surfaced to the developer/i)
    const precedence = CONVENTION.match(/## Precedence[\s\S]*?(?=\n## )/)?.[0]
    expect(precedence).toMatch(/not\*\* thereby non-live|never\*\* thereby non-live/)
  })

  it('accepts the amended-Accepted spelling used in the wild, not only the template form (Major)', () => {
    // ADR-005 reads `**Status:** Accepted — **amended by [ADR-020](...)**`; the Live
    // definition enumerated only `Accepted (amended YYYY-MM-DD — ...)`.
    const precedence = CONVENTION.match(/## Precedence[\s\S]*?(?=\n## )/)?.[0]
    expect(precedence).toBeDefined()
    expect(precedence).toMatch(/amended by/)
  })

  it('indexes `Date` and orders by it, never by id (Minor)', () => {
    // ADR filenames carry no date, so "most recent by id/date" left cross-source order
    // undefined (adr-020 vs an ADL dated 2026-07-19) AND same-id order undefined —
    // `adr/` holds TWO live Accepted files numbered 018, so two runs on the same
    // unchanged tree could pick different winners and emit different citations (AC4).
    const bounded = CONVENTION.match(/## Bounded read[\s\S]*?(?=\n## )/)?.[0]
    expect(bounded).toBeDefined()
    expect(bounded).toMatch(/\*\*Date:\*\*/)
    const precedence = CONVENTION.match(/## Precedence[\s\S]*?(?=\n## )/)?.[0]
    expect(precedence).toMatch(/never by id/i)
    expect(precedence).toMatch(/same-id/i)
    const determinism = CONVENTION.match(/## Determinism[\s\S]*?(?=\n## )/)?.[0]
    expect(determinism).toBeDefined()
    expect(determinism).toMatch(/never by id/i)
  })

  it('produces the stage-1 index with one directory-wide sweep, not one open per record (Minor)', () => {
    // The natural reading was one file-head read per record: 68 tool calls on pair's
    // own tree (20 ADRs + 48 decision-log entries) on EVERY plan-stories /
    // refine-story / brainstorm run, growing with project age — the cost the card's
    // `cost:yellow` class was refined on assumes away.
    const bounded = CONVENTION.match(/## Bounded read[\s\S]*?(?=\n## )/)?.[0]
    expect(bounded).toBeDefined()
    expect(bounded).toMatch(/single directory-wide/i)
    expect(bounded).toMatch(/not one (file )?open per record/i)
  })

  it('scopes stage 2 against the text stage 1 actually indexed (round 5, Major)', () => {
    // Stage 2 filtered on "same subdomain/bounded context, same touched component" —
    // NONE of which stage 1 indexes (no record template carries such a field), so two of
    // its three criteria were unevaluable and only title-term overlap actually ran.
    // Concrete loss on pair's own tree: refining "story generation warns when the PM tool
    // is unreachable" leaves live ADR-011 (`# ADR-011: Canonical States + n-m
    // State-Mapping Schema`) at its index line — no shared term, no subdomain field to
    // match on, and not "genuinely ambiguous" from that title, so the err-toward-reading
    // hedge never fires. The story is authored naming its own state values and silently
    // contradicts a live ADR with no `(per ADR-011)` and no `Revisits` — the one outcome
    // the convention itself declares forbidden.
    const bounded = CONVENTION.match(/## Bounded read[\s\S]*?(?=\n## )/)?.[0]
    expect(bounded).toBeDefined()
    // Stage 2 must name its input: stage 1's only text.
    expect(bounded).toMatch(/filename slug/i)
    // A subdomain/context/component is a match only when the NAME is in that text.
    expect(bounded).toMatch(/only when that name appears in the indexed text/i)
    // Staying unopened needs positive evidence — an uninformative head is opened.
    expect(bounded).toMatch(/positively resolves/i)
    const determinism = CONVENTION.match(/## Determinism[\s\S]*?(?=\n## )/)?.[0]
    expect(determinism).toMatch(/indexed title/i)
  })

  it('never states a within-source READING order by id (round 5, Minor)', () => {
    // Sources said "files are read in id order (`adr-NNN`)" while Precedence said
    // "**Never by id.** Ids ... are not even unique within a source". Reading order and
    // precedence are different things, but nothing said so and the Sources line is the
    // one an executor meets first. The two live `Accepted` files numbered 018
    // (adr-018-code-host-optional-wow-override.md, adr-018-pr-state-flow-required-checks.md)
    // have NO order under it at all, and an executor that generalizes it into precedence
    // reintroduces the AC4 defect round 3 closed.
    const sources = CONVENTION.match(/## Sources[\s\S]*?(?=\n## )/)?.[0]
    expect(sources).toBeDefined()
    expect(sources).not.toMatch(/\bid order\b/i)
    expect(sources).toMatch(/never orders/i)
    // ...and it must hand ranking to the section that owns it.
    expect(sources).toMatch(/Precedence/)
  })

  it('states the real malformed shape — no record kind in this KB has frontmatter (Minor)', () => {
    // adr-template / adl-template / analysis-log-template are heading-based markdown,
    // so an executor hunting "malformed frontmatter" finds none and the realistic case
    // (a head yielding no title/Status/Category) does not match the stated trigger.
    const degradation = CONVENTION.match(/## Degradation[\s\S]*?(?=\n## )/)?.[0]
    expect(degradation).toBeDefined()
    // The trigger must not be a shape no record in this KB has...
    expect(degradation).not.toMatch(/malformed frontmatter/i)
    // ...and the word may only survive as the explicit statement that there is none.
    expect(degradation).toMatch(/no record kind here carries frontmatter/i)
    expect(degradation).toMatch(/no title.*Status.*Category/)
  })
})

// ---------------------------------------------------------------------------
// Round-6 review findings (#280). One guard per finding, naming it.
// ---------------------------------------------------------------------------

const FIXTURE = CONVENTION.match(/## Fixture example[\s\S]*?(?=\n## )/)?.[0] ?? ''
/** `adoption/tech/adr/adr-005-skills-infrastructure.md   Status: Accepted ...` */
const SEEDED = [...FIXTURE.matchAll(/^(adoption\/\S+\.md)(.*)$/gm)].map(m => ({
  path: m[1],
  tail: m[2],
}))

describe('review round 6 — the worked example must obey the rules it illustrates', () => {
  it('illustrates every REAL record of this repo at its real liveness, both directions (Major)', () => {
    // The fixture seeded `adr-005-skills-infrastructure.md  Status: Superseded by ADR-020`
    // and concluded "`ADR-005` contributed nothing: it is superseded". That file is real
    // and its real head is `**Status:** Accepted — **amended by [ADR-020](...)**` — which
    // line 38 of this same convention declares LIVE. Concrete loss: an executor running
    // /refine-story on a story touching the skills registry in THIS repo reads the
    // convention, anchors on the Fixture (last + most concrete section), sees the literal
    // filename paired with ADR-020 and the verdict "not live, contributed nothing, not
    // cited", pattern-matches the real ADR-005 whose head names ADR-020 in the same
    // breath, drops it out of the authority set, and authors the story against ADR-005's
    // flatten contract with no `(per ADR-005)` and no `Revisits` — the single outcome
    // line 53 forbids, byte-for-byte the round-3 Major lines 24/38 were written to close.
    //
    // Round-8 finding (Minor): the first version of this guard was ONE-DIRECTIONAL —
    // it computed `realIsLive` and `continue`d when the record was not live, so the
    // mirror image went uncaught. Concrete loss: a later story supersedes the real
    // adr-005-skills-infrastructure.md (head becomes `Superseded by ADR-0NN`); the loop
    // skips it, while the shipped Fixture still seeds that literal filename at
    // `Status: Accepted — amended by [ADR-020]` and narrates it as live and citable. An
    // executor pattern-matching the filename then treats a DEAD decision as an authority
    // and emits `(per ADR-005)` for it — equally invisible, equally wrong. Both
    // directions are asserted now. The liveness probe is the record's head Status FIELD
    // (`headStatus`), not a 1200-char prose window: the old window matched the word
    // "Accepted" anywhere in the Context, so a `Proposed` ADR that merely discusses an
    // accepted decision read as live.
    expect(SEEDED.length).toBeGreaterThan(0)
    for (const { path, tail } of SEEDED) {
      const real = join(REPO_ROOT, '.pair', path)
      if (!existsSync(real)) continue
      if (path.includes('context-map')) continue // no Status field; covered by its own guard
      const status = headStatus(readFileSync(real, 'utf-8'))
      expect(status, `${path} exists but exposes no head Status field`).toBeDefined()
      const id = path.match(/adr-(\d+)/)?.[1]
      if (isLiveStatus(status)) {
        expect(
          tail,
          `${path} is live in this repo (${status}) but the fixture shows it as`,
        ).not.toMatch(/Superseded|Deprecated|Proposed/i)
        if (!id) continue
        expect(
          FIXTURE,
          `ADR-${id} is live in this repo; the fixture must not narrate it as inert`,
        ).not.toMatch(new RegExp(`ADR-${id}[^\n]*(contributed nothing|is superseded|not cited)`))
      } else {
        expect(
          tail,
          `${path} is NOT live in this repo (${status}) but the fixture seeds it as live`,
        ).not.toMatch(/\b(Accepted|Active)\b/)
        if (!id) continue
        expect(
          FIXTURE,
          `ADR-${id} is not live in this repo; the fixture must not cite it as an authority`,
        ).not.toMatch(new RegExp(`\\(per ADR-${id}\\b`))
      }
    }
  })

  it('resolves liveness from the head Status FIELD, never from a prose window (round 8, Minor)', () => {
    // Non-vacuity for the tightened probe above, in both head spellings and against the
    // prose false-positive the 1200-char window produced.
    expect(
      headStatus(readFileSync(join(ADR_DIR, 'adr-005-skills-infrastructure.md'), 'utf-8')),
    ).toMatch(/^Accepted/)
    expect(
      headStatus(readFileSync(join(ADR_DIR, 'adr-009-assess-output-only.md'), 'utf-8')),
    ).toMatch(/^Accepted/)
    expect(
      headStatus('# ADR-x\n\n## Status\n\nProposed\n\n## Context\n\nADR-1 was Accepted.'),
    ).toBe('Proposed')
    expect(isLiveStatus('Proposed')).toBe(false)
    expect(isLiveStatus('Superseded by ADR-020')).toBe(false)
    expect(isLiveStatus('Accepted — amended by [ADR-020](x.md)')).toBe(true)
    expect(isLiveStatus('Active (amended 2026-08-13 — ...)')).toBe(true)
  })

  it('narrates no record its own seeded listing does not contain (Minor)', () => {
    // The prose said `ADR-020` "was read in its place" while adr-020 was not among the
    // seeded files: an executor tracing the example cannot reproduce the stated outcome,
    // and learns that a successor may be conjured from a pointer without being in the tree.
    const seededIds = new Set(
      SEEDED.map(s => (s.path.match(/adr-(\d+)/)?.[1] ?? '').replace(/^0+/, '')),
    )
    const prose = FIXTURE.split('\n')
      .filter(l => !/^adoption\//.test(l))
      .join('\n')
    for (const m of prose.matchAll(/ADR-(\d+)/g)) {
      expect(
        seededIds.has(m[1].replace(/^0+/, '')),
        `ADR-${m[1]} is narrated but never seeded`,
      ).toBe(true)
    }
  })

  it('seeds a Status on every record, so its `Revisits` flag is licensed by the fixture (Minor)', () => {
    // The decision-log entry was seeded with NO Status while the outcome flagged
    // `Revisits decision-log/2026-07-11-agent-execution-layer`. Per Precedence a Revisits
    // may only target a LIVE authority, and an unresolved Status must be opened at stage 2
    // then surfaced — never silently treated as live. The fixture taught that silent
    // promotion on the very record it flags.
    for (const { path, tail } of SEEDED) {
      if (path.includes('context-map')) continue
      expect(tail, `${path} is seeded without a Status`).toMatch(/Status:/)
    }
  })

  it('says WHOSE subdomain the strategic catalog entry resolves (Minor)', () => {
    // Sources (read first) called `subdomain/<slug>.md` "the file the scope filter
    // resolves a subdomain from"; Bounded read stage 2 says a RECORD's subdomain is never
    // resolved from a field stage 1 did not index. Intended reading: line 11 resolves the
    // ITEM's subdomain. Neither line said so. Concrete loss: refining a story mapped to
    // `collaborative-workflow`, the executor takes Sources as licence to resolve each
    // RECORD's subdomain from the catalog, assigns a live ADR to another subdomain, and
    // uses that catalog-derived subdomain as the "positively resolves to a different
    // subject" evidence stage 2 requires — leaving the record unopened and the story
    // authored against a live decision with no citation: the round-5 Major through a
    // narrower door.
    const sources = CONVENTION.match(/## Sources[\s\S]*?(?=\n## )/)?.[0]
    expect(sources).toBeDefined()
    expect(sources).toMatch(/\*\*the item's\*\* subdomain/)
    expect(sources).toMatch(/a \*record's\* subdomain is never resolved here/)
    expect(sources).toMatch(/Bounded read/)
  })
})

// ---------------------------------------------------------------------------
// Round-8 review findings (#280) + the round-7 escalation flush. One guard per
// finding, naming it.
// ---------------------------------------------------------------------------

const ADR_DIR = join(REPO_ROOT, '.pair/adoption/tech/adr')
const DECISION_LOG_DIR = join(REPO_ROOT, '.pair/adoption/decision-log')
const CONTEXT_MAP = join(REPO_ROOT, '.pair/adoption/product/context-map.md')

/**
 * The record's own head `Status` VALUE, read the way the convention's stage-1 sweep
 * says it sits: on the matched line in the inline form (`**Status:** Accepted`), and
 * on the next NON-BLANK line below in the heading form (`## Status` + blank + value).
 * Deliberately not a prose window — a `Proposed` record whose Context paragraph uses
 * the word "Accepted" must not read as live.
 */
function headStatus(body: string): string | undefined {
  const lines = body.split('\n')
  for (let i = 0; i < lines.length; i++) {
    const inline = lines[i].match(/^\*\*Status:\*\*\s*(.+)$/)
    if (inline) return inline[1].trim()
    if (/^##\s+Status\s*$/.test(lines[i])) {
      for (let j = i + 1; j < lines.length; j++) {
        if (lines[j].trim() !== '') return lines[j].trim()
      }
    }
  }
  return undefined
}

/** Live per the convention's *Precedence*: `Accepted`/`Active` in any amended form. */
function isLiveStatus(status: string | undefined): boolean {
  if (status === undefined) return false
  return /^(Accepted|Active)\b/.test(status) && !/superseded by/i.test(status)
}

describe('review round 8 — the convention is evaluable, and its numbers do not rot', () => {
  it('scopes the authority clause to DECISIONS — the map still constrains wording and is cited (Minor)', () => {
    // "Only ADR, ADL and DDR entries are authorities — what may constrain a candidate,
    // BE CITED, or be reopened" read against the rest of the file: Precedence makes the
    // map constrain generated wording, Cite lists `(per context-map: <term>)` as one of
    // the four forms, and the Fixture uses it. Concrete loss: generating a story whose
    // only adoption input is a registered glossary term, an executor obeying the clause
    // literally normalizes the synonym to the registered term and emits NO citation —
    // the human reads a silently reworded story with no trace of why, which is the AC2
    // outcome for the one source AC1 names explicitly ("ignore an established
    // context-map term").
    const authorities = CONVENTION.match(/\*\*Authorities vs context\.\*\*[\s\S]*?\n\n/)?.[0]
    expect(authorities).toBeDefined()
    // The map is named, excluded from the authority set, AND kept as a constraint + citation.
    expect(authorities).toMatch(/context map is not an authority/i)
    expect(authorities).toMatch(/\(per context-map: <term>\)/)
    expect(authorities).toMatch(/wording/i)
    // ...and the two sections it defers to still carry those rules.
    const precedence = CONVENTION.match(/## Precedence[\s\S]*?(?=\n## )/)?.[0]
    expect(precedence).toMatch(/generated wording adopts the registered term/)
    expect(CONVENTION).toMatch(/`\(per context-map: <term>\)`/)
  })

  it('says WHERE the value sits in each head spelling, so the sweep is runnable (Minor)', () => {
    // Stage 1 is ONE directory-wide sweep over the metadata lines, and each field is
    // read "in the templates' heading form (`## Status`, ...)". In that form the matched
    // line carries only the field NAME — the value is two lines below, past a blank.
    // Verified on this repo's own tree: 47 of 48 decision-log entries use the heading
    // form, and `grep -A1 '## Status' .pair/adoption/decision-log/*.md` returns the
    // blank separator, never the value. Concrete loss: an executor greps the field names
    // across the directory, gets N heading hits and ZERO values, so every record's
    // Status/Category is "absent" — and the absent-field rule then requires each one to
    // be opened at stage 2. The bounded read collapses into a whole-corpus body read on
    // EVERY plan-stories / refine-story / brainstorm run: exactly the cost stage 1
    // exists to prevent, and the assumption the card's `cost:yellow` rests on.
    const bounded = CONVENTION.match(/## Bounded read[\s\S]*?(?=\n## )/)?.[0]
    expect(bounded).toBeDefined()
    expect(bounded).toMatch(/next non-blank line/i)
    expect(bounded).toMatch(/-A2|head -n/)
    // ...and the inline form's value is stated to be on the matched line, so the two
    // spellings are not left to the same (wrong) extraction.
    expect(bounded).toMatch(/on the matched line/i)
  })

  it('reproduces the failure the value-position clause prevents, on the real tree', () => {
    // Non-vacuity for the guard above: the naive one-line sweep really does yield no
    // value for the heading form on this repo's own decision-log.
    const headingForm = readdirSync(DECISION_LOG_DIR)
      .filter(f => f.endsWith('.md'))
      .map(f => readFileSync(join(DECISION_LOG_DIR, f), 'utf-8'))
      .filter(body => /^##\s+Status\s*$/m.test(body))
    expect(headingForm.length).toBeGreaterThan(0)
    for (const body of headingForm) {
      const lines = body.split('\n')
      const i = lines.findIndex(l => /^##\s+Status\s*$/.test(l))
      // grep -A1 lands on the blank separator: the value is NOT one line below...
      expect(lines[i + 1].trim()).toBe('')
      // ...it is on the next non-blank line, which is what the clause now says.
      expect(headStatus(body)).toBeDefined()
    }
  })

  it('ships no self-referential record COUNT — those rot on the next recorded decision (Minor)', () => {
    // The file stated "pair's own tree is 20 ADRs + 48 decision-log entries", "9 of
    // pair's own 20 ADRs carry the inline form" and "would spend 68 reads". All three
    // were true only at that HEAD: the next /record-decision run that writes an ADR or
    // an ADL makes them wrong, and nothing asserted them. Concrete loss: this very PR
    // adds a decision-log entry, so the NEXT story to record one ships a guideline —
    // installed into every adopter project, where "pair's own tree" is a foreign
    // project's statistic — stating a count that is off by one, in a file whose whole
    // purpose is to be executed literally by an LLM.
    const counted = [...CONVENTION.matchAll(/\b\d+\s+(ADRs|decision-log entries|records|reads)\b/g)]
    expect(
      counted.map(m => m[0]),
      'a corpus count in the shipped convention drifts on the next recorded decision',
    ).toEqual([])
    expect(CONVENTION).not.toMatch(/\b\d+ of (pair's own )?\d+\b/)
  })

  it('guards the one structural claim it still makes — two live `Accepted` files numbered 018', () => {
    // The duplicate-id counter-example is load-bearing (it is WHY ids never order
    // anything), so it is asserted against the real tree instead of softened away:
    // a renumbering that removes the pair must fail here, not ship silently.
    const eighteens = readdirSync(ADR_DIR).filter(f => /^adr-018-/.test(f))
    expect(eighteens.length, 'the convention claims TWO adr-018 files').toBe(2)
    for (const f of eighteens) {
      expect(isLiveStatus(headStatus(readFileSync(join(ADR_DIR, f), 'utf-8'))), f).toBe(true)
    }
    expect(CONVENTION).toMatch(/two live `Accepted` files numbered 018/)
  })
})

describe('review round 7 (escalation flush) — kinds, amended-Active, fixture citations', () => {
  it('covers the `# DDR:` heads actually found in `decision-log/` (Major)', () => {
    // The stage-1 kind discriminator named only two decision-log kinds (`# Decision:` =
    // ADL, `# Analysis Log:` = analysis). This repo's own decision-log holds live
    // `Accepted` DDRs whose H1 is `# DDR: ...` and which carry NO `## Category` at all,
    // so both discriminators miss: the absent-field rule sends each to a stage-2 body
    // open and then to a Degradation warning, and its authority is left undecided —
    // a live domain decision that neither constrains nor is cited, reported to the
    // developer as a malformed file.
    const realDdrs = readdirSync(DECISION_LOG_DIR)
      .filter(f => f.endsWith('.md'))
      .map(f => ({ f, body: readFileSync(join(DECISION_LOG_DIR, f), 'utf-8') }))
      .filter(({ body }) => /^# DDR:/m.test(body))
    expect(
      realDdrs.length,
      'no `# DDR:` entry in decision-log/ — finding is stale',
    ).toBeGreaterThan(0)
    for (const { f, body } of realDdrs) {
      expect(isLiveStatus(headStatus(body)), `${f} is a live DDR`).toBe(true)
      expect(/^##\s+Category\s*$/m.test(body) || /^\*\*Category:\*\*/m.test(body), f).toBe(false)
    }
    const bounded = CONVENTION.match(/## Bounded read[\s\S]*?(?=\n## )/)?.[0]
    expect(bounded).toBeDefined()
    expect(bounded).toMatch(/# DDR:/)
  })

  it('reads `Active` in its amended form as live, like `Accepted` (Minor)', () => {
    // The amended-form equivalence was spelled for `Accepted` only. This repo's ADL
    // `2026-07-11-agent-execution-layer.md` — the record the Fixture flags a `Revisits`
    // on — reads `Active (amended 2026-08-13 — ...)`: under the Accepted-only wording
    // its Status resolves to no listed value, so it is opened at stage 2 and surfaced as
    // unresolved instead of being read as the live authority it is.
    const amendedActive = readdirSync(DECISION_LOG_DIR)
      .filter(f => f.endsWith('.md'))
      .map(f => headStatus(readFileSync(join(DECISION_LOG_DIR, f), 'utf-8')))
      .filter(s => s !== undefined && /^Active\s*\(amended/.test(s))
    expect(amendedActive.length, 'no amended-Active ADL — finding is stale').toBeGreaterThan(0)
    const precedence = CONVENTION.match(/## Precedence[\s\S]*?(?=\n## )/)?.[0]
    expect(precedence).toMatch(/`Active \(amended/)
  })

  it('seeds only context-map terms that are really registered in this repo (Minor)', () => {
    // The fixture seeded `term: "capability skill"` and the worked candidate cited
    // `(per context-map: capability skill)`. That term exists nowhere in this repo's
    // context-map.md or any `.context.md` sibling, so the one citation form the round-6
    // guard skips was the one dangling example — teaching a citation shape pointed at a
    // term the map does not carry.
    const map = readFileSync(CONTEXT_MAP, 'utf-8')
    const seededTerms = [...FIXTURE.matchAll(/context-map\.md\s+term:\s+"([^"]+)"/g)].map(m => m[1])
    expect(seededTerms.length, 'the fixture seeds no context-map term').toBeGreaterThan(0)
    for (const term of seededTerms) {
      expect(
        new RegExp(`^\\|\\s*${term}\\s*\\|`, 'im').test(map),
        `"${term}" is seeded as registered but is in no Term/Entity row of context-map.md`,
      ).toBe(true)
      // ...and the worked example must cite the same term it seeded.
      expect(FIXTURE).toMatch(new RegExp(`\\(per context-map: ${term}\\)`, 'i'))
    }
  })

  it('cites a record only for what that record actually decides (Minor)', () => {
    // The reshape "-> extend the generation flow (per ADR-009)" attributed to ADR-009 a
    // call it does not make: ADR-009 decides that assess-* skills are OUTPUT-ONLY and
    // that /record-decision is the sole adoption writer — not whether a capability may
    // exist or should extend an existing flow. An executor copying the pattern lands the
    // citation on the wrong record in a real run, which is worse than none: the human
    // opens ADR-009 and finds nothing about the shape of the item it justifies.
    const adr009 = readFileSync(join(ADR_DIR, 'adr-009-assess-output-only.md'), 'utf-8')
    expect(adr009).toMatch(/output-only/i)
    expect(adr009).toMatch(/sole adoption writer|sole .*writer/i)
    const cites = FIXTURE.split('\n').filter(l => /\(per ADR-009/.test(l))
    expect(cites.length).toBeGreaterThan(0)
    for (const line of cites) {
      expect(line, 'a (per ADR-009) citation must rest on what ADR-009 decides').toMatch(
        /output-only|read-only|sole adoption writer|the recorder persists/i,
      )
    }
  })
})

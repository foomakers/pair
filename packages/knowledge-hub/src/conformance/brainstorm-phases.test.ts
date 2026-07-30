import { describe, it, expect } from 'vitest'
import { existsSync, readdirSync, readFileSync } from 'fs'
import { join } from 'path'

// Conformance guard for story #230: /pair-process-brainstorm — structured discovery
// in THREE fixed phases (interview -> domain -> triage), parametrized by `$root` and
// the deduced level/orientation, landing a Draft epic/story tree without ever touching
// the PRD.
//
// Asserted on BOTH the dataset (source of truth) and the installed root mirror,
// name-mapped: byte-equality of the pair is the mirror-equality guard's job
// (skill-md-mirror), while these name-mapped assertions prove the *installed* copy
// carries the same instructions with its `/command` references rewritten.

const DATASET_SKILLS = join(__dirname, '../../dataset/.skills')
const MIRROR_SKILLS = join(__dirname, '../../../../.claude/skills')
const DATASET_KB = join(__dirname, '../../dataset/.pair/knowledge')
const MIRROR_KB = join(__dirname, '../../../../.pair/knowledge')

const BRAINSTORM_DATASET_PATH = join(DATASET_SKILLS, 'process/brainstorm/SKILL.md')
const BRAINSTORM_MIRROR_PATH = join(MIRROR_SKILLS, 'pair-process-brainstorm/SKILL.md')

// Sibling reference files (progressive disclosure — review round 3): the normative
// deduction matrix and the per-phase resume list live beside SKILL.md, as /review
// does with degradation-levels.md and merge-and-cascade.md.
const MATRIX_DATASET_PATH = join(DATASET_SKILLS, 'process/brainstorm/parametrization.md')
const MATRIX_MIRROR_PATH = join(MIRROR_SKILLS, 'pair-process-brainstorm/parametrization.md')
const RESUME_DATASET_PATH = join(DATASET_SKILLS, 'process/brainstorm/resume.md')
const RESUME_MIRROR_PATH = join(MIRROR_SKILLS, 'pair-process-brainstorm/resume.md')
const DEGRADATION_DATASET_PATH = join(DATASET_SKILLS, 'process/brainstorm/degradation.md')
const DEGRADATION_MIRROR_PATH = join(MIRROR_SKILLS, 'pair-process-brainstorm/degradation.md')

const read = (path: string): string => (existsSync(path) ? readFileSync(path, 'utf-8') : '')

const BRAINSTORM_DATASET = read(BRAINSTORM_DATASET_PATH)
const BRAINSTORM_MIRROR = read(BRAINSTORM_MIRROR_PATH)

// Name map dataset -> root mirror (per the KB self-sync convention).
const VARIANTS = [
  {
    label: 'dataset',
    content: BRAINSTORM_DATASET,
    matrix: read(MATRIX_DATASET_PATH),
    resume: read(RESUME_DATASET_PATH),
    degradation: read(DEGRADATION_DATASET_PATH),
    matrixPath: MATRIX_DATASET_PATH,
    resumePath: RESUME_DATASET_PATH,
    degradationPath: DEGRADATION_DATASET_PATH,
    grill: '/grill',
    mapSub: '/map-subdomains',
    mapCtx: '/map-contexts',
    planEpics: '/plan-epics',
    planStories: '/plan-stories',
    refine: '/refine-story',
    setupPm: '/setup-pm',
    recordDecision: '/record-decision',
  },
  {
    label: 'mirror',
    content: BRAINSTORM_MIRROR,
    matrix: read(MATRIX_MIRROR_PATH),
    resume: read(RESUME_MIRROR_PATH),
    degradation: read(DEGRADATION_MIRROR_PATH),
    matrixPath: MATRIX_MIRROR_PATH,
    resumePath: RESUME_MIRROR_PATH,
    degradationPath: DEGRADATION_MIRROR_PATH,
    grill: '/pair-capability-grill',
    mapSub: '/pair-capability-map-subdomains',
    mapCtx: '/pair-capability-map-contexts',
    planEpics: '/pair-process-plan-epics',
    planStories: '/pair-process-plan-stories',
    refine: '/pair-process-refine-story',
    setupPm: '/pair-capability-setup-pm',
    recordDecision: '/pair-capability-record-decision',
  },
] as const

/** The `### Phase N` section of a SKILL.md, up to the next `##`/`###` heading. */
function phase(content: string, n: number): string {
  const start = content.search(new RegExp(`^### Phase ${n}\\b`, 'm'))
  if (start === -1) return ''
  const rest = content.slice(start)
  const afterHeading = rest.indexOf('\n')
  if (afterHeading === -1) return rest
  const next = rest.slice(afterHeading).search(/\n#{2,3} /)
  return next === -1 ? rest : rest.slice(0, afterHeading + next)
}

/** A `## <title>` section of a SKILL.md, up to the next `## ` heading. */
function section(content: string, title: string): string {
  const start = content.search(new RegExp(`^## ${title}\\b`, 'm'))
  if (start === -1) return ''
  const rest = content.slice(start)
  const afterHeading = rest.indexOf('\n')
  if (afterHeading === -1) return rest
  const next = rest.slice(afterHeading).search(/\n## /)
  return next === -1 ? rest : rest.slice(0, afterHeading + next)
}

/** Everything before the first `## ` heading — the skill's opening claims. */
function preamble(content: string): string {
  const end = content.search(/^## /m)
  return end === -1 ? content : content.slice(0, end)
}

describe('brainstorm — skill exists in both dataset and installed mirror (#230)', () => {
  it('dataset carries process/brainstorm/SKILL.md', () => {
    expect(existsSync(BRAINSTORM_DATASET_PATH)).toBe(true)
  })

  it('installed mirror carries pair-process-brainstorm/SKILL.md', () => {
    expect(existsSync(BRAINSTORM_MIRROR_PATH)).toBe(true)
  })

  it('dataset frontmatter names the skill `brainstorm`', () => {
    expect(BRAINSTORM_DATASET).toMatch(/^name: brainstorm$/m)
  })

  it('mirror frontmatter names the skill `pair-process-brainstorm` (prefix transform)', () => {
    expect(BRAINSTORM_MIRROR).toMatch(/^name: pair-process-brainstorm$/m)
  })
})

describe('brainstorm — three phases in fixed order (business rule) (#230)', () => {
  for (const v of VARIANTS) {
    it(`${v.label} declares the three phases interview -> domain -> triage in order`, () => {
      const i1 = v.content.search(/^### Phase 1\b.*[Ii]nterview/m)
      const i2 = v.content.search(/^### Phase 2\b.*Domain/m)
      const i3 = v.content.search(/^### Phase 3\b.*Tree/m)
      expect(i1).toBeGreaterThan(-1)
      expect(i2).toBeGreaterThan(i1)
      expect(i3).toBeGreaterThan(i2)
      // No fourth phase — the tree triage is the terminal phase.
      expect(v.content).not.toMatch(/^### Phase 4\b/m)
    })

    it(`${v.label} states the phase order is fixed and each output feeds the next`, () => {
      expect(v.content).toMatch(/[Pp]hase order.*fixed/)
      expect(v.content).toMatch(/feeds the next/)
    })

    it(`${v.label} is declared the only new process skill (D24)`, () => {
      // Scoped to the claim itself (preamble) and its Notes restatement — a bare
      // file-wide /D24/ match would stay green if the claim were deleted.
      expect(preamble(v.content)).toMatch(/\*\*only\*\* new process skill \(D24\)/)
      expect(section(v.content, 'Notes')).toMatch(/D24/)
    })
  }
})

describe('brainstorm — phase 1 grill interview, level asked first (AC1) (#230)', () => {
  for (const v of VARIANTS) {
    it(`${v.label} lists grill as a required composed skill for phase 1`, () => {
      const row = v.content
        .split('\n')
        .find(line => line.includes(`\`${v.grill}\``) && line.includes('Capability'))
      expect(row).toBeDefined()
      expect(row).toMatch(/Yes/)
    })

    it(`${v.label} phase 1 composes grill in interview mode`, () => {
      expect(phase(v.content, 1)).toContain(`Compose \`${v.grill}\``)
    })

    it(`${v.label} phase 1 asks the level (broad vs punctual) as the FIRST question`, () => {
      const p1 = phase(v.content, 1)
      expect(p1).toMatch(/FIRST question/)
      expect(p1).toMatch(/broad/i)
      expect(p1).toMatch(/punctual/i)
    })

    it(`${v.label} phase 1 asks the THEME when neither $root nor $theme was given`, () => {
      // Review finding (PR #387 round 2, Minor-4): the Arguments table promised
      // "phase 1's opening questions ask for the level and then the theme", but only
      // the level was asked — leaving grill's `$topic` undefined on the bare
      // `/brainstorm` invocation, which is AC1's own scenario.
      const p1 = phase(v.content, 1)
      expect(p1).toMatch(/\*\*second question\*\* asks the theme/)
      expect(p1).toMatch(/neither `\$root` nor `\$theme`/)
      // The theme question must precede the grill composition it feeds.
      const themeAt = p1.search(/second question\*\* asks the theme/)
      const grillAt = p1.indexOf(`Compose \`${v.grill}\``)
      expect(themeAt).toBeGreaterThan(-1)
      expect(grillAt).toBeGreaterThan(themeAt)
      // And the Verify beat requires a non-empty topic.
      expect(p1).toMatch(/non-empty `\$topic`/)
    })

    it(`${v.label} phase 1 produces the raw requirements blob (R3.7)`, () => {
      const p1 = phase(v.content, 1)
      expect(p1).toMatch(/raw requirements blob/)
      expect(p1).toMatch(/R3\.7/)
    })

    it(`${v.label} offers the blob as a .pair/working/ handoff when the session stops after phase 1`, () => {
      // Scoped to Phase 1: the handoff instruction must live in the phase that
      // produces the blob, not merely somewhere in the file.
      const p1 = phase(v.content, 1)
      expect(p1).toMatch(/\.pair\/working\//)
      expect(p1).toMatch(/handoff/i)
    })
  }
})

describe('brainstorm — parametrization: $root + orientation deduction (AC2) (#230)', () => {
  for (const v of VARIANTS) {
    it(`${v.label} declares the $root argument as optional`, () => {
      const args = v.content.slice(v.content.search(/^## Arguments/m)).split(/\n## /)[0] ?? ''
      const row = args.split('\n').find(line => line.includes('`$root`'))
      expect(row).toBeDefined()
      expect(row).toMatch(/\|\s*No\s*\|/)
    })

    it(`${v.label} declares $level and $orientation override arguments`, () => {
      const args = v.content.slice(v.content.search(/^## Arguments/m)).split(/\n## /)[0] ?? ''
      expect(args).toContain('`$level`')
      expect(args).toContain('`$orientation`')
    })

    it(`${v.label} carries an orientation matrix deducing level/orientation from type and tags`, () => {
      const matrix = v.matrix
      expect(matrix).not.toBe('')
      expect(matrix).toMatch(/epic.*broad.*functional/i)
      expect(matrix).toMatch(/story.*punctual/i)
      expect(matrix).toMatch(/tech-debt/)
      expect(matrix).toMatch(/technical/)
    })

    it(`${v.label} states the deduced values up-front and accepts an override`, () => {
      // Scoped to the matrix reference file (where the rule lives) and to
      // Step 0's up-front statement template (where it is executed).
      const matrix = v.matrix
      expect(matrix).toMatch(/stated up-front/)
      expect(matrix).toMatch(/override/i)
      const step0 = v.content.match(/### Step 0:[\s\S]*?(?=\n### )/)?.[0] ?? ''
      expect(step0).toMatch(/override level\/orientation/)
    })

    it(`${v.label} keys the phase-3 writer on the root's TYPE in the same matrix`, () => {
      // Review finding (PR #387, Major-1): selecting the writer on the level alone
      // routed an epic root to plan-epics, which can only hang epics off an
      // INITIATIVE. The writer column must key on type: initiative -> plan-epics,
      // epic -> plan-stories under the root, story -> plan-stories under its parent.
      const matrix = v.matrix
      const row = (signal: string): string =>
        matrix.split('\n').find(line => line.startsWith('|') && line.includes(signal)) ?? ''

      expect(row('type `initiative`')).toContain(`\`${v.planEpics}\` with \`$initiative:`)
      expect(row('type `epic`')).toContain(`\`${v.planStories}\` with \`$epic:`)
      expect(row('type `story`')).toContain(`\`${v.planStories}\` with \`$epic:`)
      expect(row('type `story`')).toMatch(/parent epic/)
      // The epic row must NOT route to plan-epics (the defect being guarded).
      expect(row('type `epic`')).not.toContain(`\`${v.planEpics}\``)
      // And the rule is stated, not just tabulated.
      expect(matrix).toMatch(/root's type selects the writer/)
    })

    it(`${v.label} resolves a $root with no recognized type on an explicit fallback row`, () => {
      // Review finding (PR #387 round 2, Major-1): the matrix had rows for type
      // initiative/epic/story, a tag MODIFIER row ("level unchanged, writer
      // unchanged") and a no-$root row — so a $root carrying no type label (10 open
      // issues in this repo, incl. #280 and #393) matched no base row: the modifier's
      // "unchanged" referred to nothing, Step 0's Verify was unsatisfiable, and
      // phase 1's level question fired only on the no-$root path.
      const matrix = v.matrix
      const fallback =
        matrix.split('\n').find(line => line.startsWith('|') && /no recognized type/i.test(line)) ??
        ''
      expect(fallback).not.toBe('')
      // Level: asked, exactly as on the no-root path.
      expect(fallback).toMatch(/asked first \(phase 1\)/)
      // Writer: leaf treatment — siblings under the root's parent epic, root as EXTEND target.
      expect(fallback).toContain(`\`${v.planStories}\` with \`$epic:`)
      expect(fallback).toMatch(/parent epic/)
      expect(fallback).toMatch(/EXTEND target/)
      expect(fallback).toMatch(/HALT/)
      // Every input has a base row, so the modifier always has a base to modify.
      expect(matrix).toMatch(/exactly one base row/)
      // Step 0 and phase 1 honour the fallback, not just the table.
      const step0 = v.content.match(/### Step 0:[\s\S]*?(?=\n### )/)?.[0] ?? ''
      expect(step0).toMatch(/fallback row/)
      expect(phase(v.content, 1)).toMatch(/fallback row/)
    })

    it(`${v.label} resolves the free-theme (no $root) row's writer on the answered level`, () => {
      // Review finding (PR #387 round 2, Minor-13): the guard pinned the three type
      // rows but not the no-$root row, so its writer resolution could regress unseen.
      const matrix = v.matrix
      const freeTheme =
        matrix.split('\n').find(line => line.startsWith('|') && /free theme/i.test(line)) ?? ''
      expect(freeTheme).not.toBe('')
      expect(freeTheme).toContain(`\`${v.planEpics}\` with \`$initiative:`)
      expect(freeTheme).toContain(`\`${v.planStories}\` with \`$epic:`)
      expect(freeTheme).toMatch(/broad/)
      expect(freeTheme).toMatch(/punctual/)
    })

    it(`${v.label} resolves the tag row as a modifier with an explicit precedence note`, () => {
      // Review finding (PR #387, Minor): two tag-driven rows overlapped with no
      // stated precedence, so an epic labelled tech-debt matched both.
      const matrix = v.matrix
      expect(matrix).toMatch(/Most specific row wins/i)
      expect(matrix).toMatch(/modifier/)
      // Exactly one tag-driven row remains.
      const tagRows = matrix
        .split('\n')
        .filter(line => line.startsWith('|') && /tech-debt/.test(line))
      expect(tagRows).toHaveLength(1)
    })

    it(`${v.label} HALTs when $root does not resolve`, () => {
      const halt = v.content.slice(v.content.search(/^## HALT Conditions/m)).split(/\n## /)[0] ?? ''
      expect(halt).toMatch(/\$root/)
      expect(halt).toMatch(/not found/)
    })
  }
})

describe('brainstorm — phase 2 domain integration, scoped (AC3) (#230)', () => {
  for (const v of VARIANTS) {
    it(`${v.label} composes map-subdomains scoped (broad/functional), never $scope: all`, () => {
      const p2 = phase(v.content, 2)
      expect(p2).toContain(`Compose \`${v.mapSub}\` with \`$scope:`)
      expect(v.content).not.toContain(`Compose \`${v.mapSub}\` with \`$scope: all\``)
    })

    it(`${v.label} composes map-contexts scoped (punctual/technical), never $scope: all`, () => {
      const p2 = phase(v.content, 2)
      expect(p2).toContain(`Compose \`${v.mapCtx}\` with \`$scope:`)
      expect(v.content).not.toContain(`Compose \`${v.mapCtx}\` with \`$scope: all\``)
    })

    it(`${v.label} phase 2 runs Load / Check / Flag / Update-inline against the context map`, () => {
      const p2 = phase(v.content, 2)
      expect(p2).toMatch(/context-map\.md/)
      expect(p2).toMatch(/context-map-maintenance\.md/)
      expect(p2).toMatch(/inline/)
    })

    it(`${v.label} flags a feature conflicting with a registered rule, citing the DDR`, () => {
      const p2 = phase(v.content, 2)
      expect(p2).toMatch(/conflict/i)
      expect(p2).toMatch(/DDR/)
    })

    it(`${v.label} degrades gracefully when context-map.md is absent (no failure)`, () => {
      const gd = v.degradation
      expect(gd).toMatch(/context-map\.md/)
      expect(gd).toMatch(/not an error|expected steady state/)
    })

    it(`${v.label} lists a Graceful Degradation entry for ${v.recordDecision} too`, () => {
      // Review finding (PR #387 round 2, Minor-8): every other optional composition
      // had a Graceful Degradation bullet; record-decision's degrade path lived only
      // in its Composed Skills cell, so that section read as complete while it was not.
      const gd = v.degradation
      const bullet = gd.split('\n').find(line => line.includes(`\`${v.recordDecision}\``)) ?? ''
      expect(bullet).toMatch(/not installed/)
      expect(bullet).toMatch(/Phase 2/)
      expect(bullet).toMatch(/rationale/)
    })
  }
})

describe('brainstorm — phase 3 to-issues tree triage (AC4) (#230)', () => {
  for (const v of VARIANTS) {
    it(`${v.label} composes plan-epics / plan-stories for the tree`, () => {
      const p3 = phase(v.content, 3)
      expect(p3).toContain(`\`${v.planEpics}\``)
      expect(p3).toContain(`\`${v.planStories}\``)
    })

    it(`${v.label} Composed Skills rows for both writers match the matrix (no-root included)`, () => {
      // Review finding (PR #387 round 2, Minor-7): the /plan-epics row carried the
      // symmetric "or absent and the level is broad" clause while the /plan-stories
      // row named only epic/story roots, though the matrix's free-theme row and
      // phase 3 item 6 also select it for a no-$root punctual discovery.
      const composed = section(v.content, 'Composed Skills')
      const row = (skill: string): string =>
        composed.split('\n').find(line => line.includes(`\`${skill}\``)) ?? ''
      expect(row(v.planEpics)).toMatch(/absent and the level is broad/)
      expect(row(v.planStories)).toMatch(/absent and the level is punctual/)
      // …and the untyped-root fallback is named there as well.
      expect(row(v.planStories)).toMatch(/untyped/)
    })

    it(`${v.label} passes the resolved parent AND the candidate tree to the writer`, () => {
      // Review finding (PR #387, Major-2): phase 3 named no arguments, so
      // plan-stories fell back to "highest-priority Todo epic" and re-derived its
      // own candidates — discarding the discovery tree.
      const p3 = phase(v.content, 3)
      expect(p3).toContain(`\`${v.planEpics}\` with \`$initiative:`)
      expect(p3).toContain(`\`${v.planStories}\` with \`$epic:`)
      expect(p3).toContain('`$candidates:')
      expect(p3).toMatch(/instead of re-deriving their own/)
    })

    it(`${v.label} composes exactly ONE writer and writes exactly one level`, () => {
      // Review finding (PR #387 round 2, Major-2): item 7's plan-epics bullet
      // appended a second pass ("then, for the slices under each confirmed epic,
      // /plan-stories …") that item 5's tree (epics only), the matrix writer column,
      // the /plan-stories Composed Skills row and the single `Writer:` output slot
      // all contradicted — so an executor either invented story slices phase 2 never
      // produced or silently dropped the clause.
      const p3 = phase(v.content, 3)
      expect(p3).toMatch(/One writer per run, one level written/)
      expect(p3).toMatch(/does \*\*not\*\* cascade/)
      // The tree is one level deep, stated where it is assembled (item 5).
      expect(p3).toMatch(/\*\*one level deep\*\*/)
      expect(p3).toMatch(/never carries two levels/)
      // The plan-epics composition bullet must not itself chain plan-stories.
      const planEpicsBullet =
        p3
          .split('\n')
          .find(
            line =>
              line.trimStart().startsWith(`- \`${v.planEpics}\``) && line.includes('$initiative:'),
          ) ?? ''
      expect(planEpicsBullet).not.toBe('')
      expect(planEpicsBullet).not.toContain(v.planStories)
      // Output Format carries a single Writer slot, consistent with the above.
      expect(v.content).toMatch(/├── Writer:/)
    })

    it(`${v.label} HALTs when a story or untyped root has no parent epic (orphan)`, () => {
      // Review finding (PR #387 round 2, Minor-6): the "No parent to hang the tree
      // from" HALT was scoped "free-theme discovery only", yet item 6 resolves a
      // story root's parent epic with no HALT when it does not exist — and orphan
      // stories are a normal PM-tool state (sub-issue links are optional).
      const p3 = phase(v.content, 3)
      expect(p3).toMatch(/orphan story/i)
      const halt = v.content.slice(v.content.search(/^## HALT Conditions/m)).split(/\n## /)[0] ?? ''
      expect(halt).not.toMatch(/free-theme discovery only/)
      expect(halt).toMatch(/\*\*any\*\* root or none/)
    })

    it(`${v.label} evaluates the key-match half of the phase-3 Check after the parent resolves`, () => {
      // Review finding (PR #387 round 2, Minor-5): item 1's Check read "items under
      // the resolved parent whose idempotency keys match", but the tree is assembled
      // at item 5 and the parent resolved at item 6 — unevaluable where written.
      const p3 = phase(v.content, 3)
      expect(p3).toMatch(/once item 6 has resolved the parent/)
      const idem = v.resume
      expect(idem).toMatch(/after\*\* item 6 has resolved that parent/)
    })

    it(`${v.label} treats a story root as an EXTEND target, never a candidate`, () => {
      // Review finding (PR #387, Question): "the root itself a triage candidate"
      // would match its own idempotency key and report ALREADY EXISTS.
      const p3 = phase(v.content, 3)
      expect(p3).toMatch(/EXTEND target/)
      expect(p3).toMatch(/never a candidate/)
    })

    it(`${v.label} HALTs rather than writing under an unrelated parent (free theme)`, () => {
      const halt = v.content.slice(v.content.search(/^## HALT Conditions/m)).split(/\n## /)[0] ?? ''
      expect(halt).toMatch(/No parent to hang the tree from/)
      expect(halt).toMatch(
        /never invents a parent|never writing beneath an unrelated parent|rather than writing beneath an unrelated parent/,
      )
    })

    it(`${v.label} points at the shared to-issues-triage convention (EXTEND vs CREATE)`, () => {
      const p3 = phase(v.content, 3)
      expect(p3).toMatch(/to-issues-triage\.md/)
      expect(p3).toMatch(/EXTEND/)
      expect(p3).toMatch(/CREATE/)
    })

    it(`${v.label} shows a dry-run proposal confirmed before any write`, () => {
      const p3 = phase(v.content, 3)
      expect(p3).toMatch(/dry-run/)
      expect(p3.toLowerCase()).toMatch(/before any write/)
    })

    it(`${v.label} creates items in the Draft macrostate as vertical slices`, () => {
      const p3 = phase(v.content, 3)
      expect(p3).toMatch(/Draft/)
      expect(p3).toMatch(/vertical slice/i)
    })

    it(`${v.label} integrates the tree under $root (compound insertion, R3.1)`, () => {
      const p3 = phase(v.content, 3)
      expect(p3).toMatch(/\$root/)
      expect(p3).toMatch(/R3\.1/)
    })

    it(`${v.label} never modifies the PRD`, () => {
      // Scoped to Phase 3 — the only phase that could write planning artifacts —
      // so a deleted instruction cannot be masked by the Notes restatement.
      const p3 = phase(v.content, 3)
      expect(p3).toMatch(/PRD is never modified/)
      expect(p3).toMatch(/PRD\.md` is unchanged/)
    })

    it(`${v.label} HALTs phase 3 with a setup pointer when no PM tool is configured`, () => {
      const halt = v.content.slice(v.content.search(/^## HALT Conditions/m)).split(/\n## /)[0] ?? ''
      expect(halt).toMatch(/PM tool/)
      expect(halt).toContain(v.setupPm)
      // Phases 1-2 still complete without a PM tool.
      expect(halt).toMatch(/phases 1[–-]2/)
    })

    it(`${v.label} points to ${v.refine} as the next step`, () => {
      expect(v.content).toContain(v.refine)
    })
  }
})

describe('brainstorm — per-phase idempotency matches the claim (#230)', () => {
  // Review finding (PR #387, Minor): the preamble claimed "each phase checks its
  // own output before acting" while only Phase 1 had a Check/Skip beat, and the
  // itemized resume list the idempotency convention requires of multi-phase
  // orchestrators was missing.
  for (const v of VARIANTS) {
    it(`${v.label} carries an Idempotent Re-invocation section with a per-phase resume list`, () => {
      const idem = v.resume
      expect(idem).not.toBe('')
      expect(idem).toMatch(/idempotency\.md/)
      expect(idem).toMatch(/Phase 1/)
      expect(idem).toMatch(/Phase 2/)
      expect(idem).toMatch(/Phase 3/)
    })

    it(`${v.label} phase 2 detects a placement already recorded before re-placing`, () => {
      const p2 = phase(v.content, 2)
      expect(p2).toMatch(/^1\. \*\*Check\*\*/m)
      expect(p2).toMatch(/^2\. \*\*Skip\*\*/m)
      expect(p2).toMatch(/do not re-compose/)
    })

    it(`${v.label} phase 3 detects a tree already proposed before re-triaging`, () => {
      const p3 = phase(v.content, 3)
      expect(p3).toMatch(/^1\. \*\*Check\*\*/m)
      expect(p3).toMatch(/^2\. \*\*Skip\*\*/m)
      expect(p3).toMatch(/already proposed/)
    })
  }
})

describe('brainstorm — grill Required flag does not contradict the degrade path (#230)', () => {
  // Review finding (PR #387, Minor): Required = "Yes" while the same cell degrades
  // inline — resolved the /review way, with an explicit dagger footnote.
  for (const v of VARIANTS) {
    it(`${v.label} marks grill Yes with the "required when installed" footnote`, () => {
      const composed = section(v.content, 'Composed Skills')
      const row = composed.split('\n').find(line => line.includes(`\`${v.grill}\``)) ?? ''
      expect(row).toMatch(/Yes †/)
      expect(composed).toMatch(/† \*\*Required _when installed_\.\*\*/)
      expect(composed).toMatch(/composed by default_, not _a hard prerequisite_/)
    })
  }
})

describe('brainstorm — writers accept a caller-supplied candidate tree (#230)', () => {
  // Review finding (PR #387, Major-2, complete fix): plan-epics/plan-stories always
  // re-derived their candidates, so a supplied discovery tree was discarded.
  const WRITERS = [
    {
      dataset: join(DATASET_SKILLS, 'process/plan-epics/SKILL.md'),
      mirror: join(MIRROR_SKILLS, 'pair-process-plan-epics/SKILL.md'),
      parent: 'initiative',
    },
    {
      dataset: join(DATASET_SKILLS, 'process/plan-stories/SKILL.md'),
      mirror: join(MIRROR_SKILLS, 'pair-process-plan-stories/SKILL.md'),
      parent: 'epic',
    },
  ] as const

  for (const w of WRITERS) {
    for (const [label, path] of [
      ['dataset', w.dataset],
      ['mirror', w.mirror],
    ] as const) {
      it(`${w.parent} writer (${label}) declares the optional $candidates argument`, () => {
        const content = read(path)
        const args = content.slice(content.search(/^## Arguments/m)).split(/\n## /)[0] ?? ''
        const row = args.split('\n').find(line => line.includes('`$candidates`'))
        expect(row).toBeDefined()
        expect(row).toMatch(/\|\s*No\s*\|/)
      })

      it(`${w.parent} writer (${label}) triages supplied candidates instead of re-deriving`, () => {
        const content = read(path)
        const step3 = content.match(/### Step 3[:.][\s\S]*?(?=\n### )/)?.[0] ?? ''
        expect(step3).toMatch(/Is `\$candidates` provided\?/)
        expect(step3).toMatch(/never re-derive it from the/)
      })

      it(`${w.parent} writer (${label}) Skip beat points forward at validation then triage`, () => {
        // Review finding (PR #387 round 2, Minor-3): plan-stories' Skip beat pointed
        // back at item 3 (the re-derive branch it exists to bypass) and called item 4
        // "triage" — an executor following it literally re-derived the tree anyway.
        const content = read(path)
        const step3 = content.match(/### Step 3[:.][\s\S]*?(?=\n### )/)?.[0] ?? ''
        const skip = step3.split('\n').find(line => /^2\. \*\*Skip\*\*/.test(line)) ?? ''
        expect(skip).not.toBe('')
        expect(skip).toMatch(/of item 4/)
        expect(skip).toMatch(/item 5's triage/)
        expect(skip).not.toMatch(/item 3/)
      })
    }
  }
})

describe('brainstorm — catalog registration (#230)', () => {
  const NEXT_DATASET = read(join(DATASET_SKILLS, 'next/SKILL.md'))
  const NEXT_MIRROR = read(join(MIRROR_SKILLS, 'pair-next/SKILL.md'))
  const GUIDE_DATASET = read(join(DATASET_KB, 'skills-guide.md'))
  const GUIDE_MIRROR = read(join(MIRROR_KB, 'skills-guide.md'))
  const WOW_DATASET = read(join(DATASET_KB, 'way-of-working.md'))
  const WOW_MIRROR = read(join(MIRROR_KB, 'way-of-working.md'))
  const GETTING_STARTED_DATASET = read(join(DATASET_KB, 'getting-started.md'))
  const GETTING_STARTED_MIRROR = read(join(MIRROR_KB, 'getting-started.md'))

  for (const [label, next, guide, wow, gettingStarted, command] of [
    ['dataset', NEXT_DATASET, GUIDE_DATASET, WOW_DATASET, GETTING_STARTED_DATASET, '/brainstorm'],
    [
      'mirror',
      NEXT_MIRROR,
      GUIDE_MIRROR,
      WOW_MIRROR,
      GETTING_STARTED_MIRROR,
      '/pair-process-brainstorm',
    ],
  ] as const) {
    it(`${label} next catalog lists brainstorm and states 10 process / 41 total`, () => {
      expect(next).toContain(`\`${command}\``)
      expect(next).toContain('10 process')
      expect(next).toContain('41 skills')
    })

    it(`${label} skills-guide lists brainstorm and states 10 process / 41 total`, () => {
      expect(guide).toContain(`\`${command}\``)
      expect(guide).toContain('10 process')
      expect(guide).toMatch(/Total: 41/)
    })

    it(`${label} way-of-working states the 41-skill catalog`, () => {
      expect(wow).toContain('41 skills')
    })

    it(`${label} getting-started states 41 Agent Skills (10 process + 30 capability + 1 navigator)`, () => {
      expect(gettingStarted).toContain('41 Agent Skills')
      expect(gettingStarted).toContain('(10 process + 30 capability + 1 navigator)')
    })
  }
})

describe('brainstorm — present in the narrative process flow, not only the catalog (#230)', () => {
  // Review finding (PR #387, Major-3): both narrative surfaces (KB Operational Flow,
  // docs-site Process Lifecycle ladder) got only the 40->41 count bump, leaving the
  // shipped entry point reachable in prose only through the raw catalog table.
  const DOCS_LADDER = join(
    __dirname,
    '../../../../apps/website/content/docs/developer-journey/index.mdx',
  )

  for (const [label, wow, command] of [
    ['dataset', read(join(DATASET_KB, 'way-of-working.md')), '/brainstorm'],
    ['mirror', read(join(MIRROR_KB, 'way-of-working.md')), '/pair-process-brainstorm'],
  ] as const) {
    it(`${label} Operational Flow carries a Discovery entry pointing at brainstorm`, () => {
      const flow = wow.slice(wow.search(/^## Operational Flow/m))
      expect(flow).toMatch(/Discovery/)
      expect(flow).toContain(`\`${command}\``)
      // Marked as outside the nine numbered steps, so a count sweep cannot read it
      // as a tenth step (per the ADL).
      expect(flow).toMatch(/not one of the nine numbered steps/)
    })
  }

  for (const [label, guide, command] of [
    ['dataset', read(join(DATASET_KB, 'skills-guide.md')), '/brainstorm'],
    ['mirror', read(join(MIRROR_KB, 'skills-guide.md')), '/pair-process-brainstorm'],
  ] as const) {
    it(`${label} skills-guide Navigation process flow prefixes the optional discovery entry`, () => {
      // Review finding (PR #387 round 2, Minor-9): the third narrative surface —
      // skills-guide's own Navigation flow — still started at Induction, in the very
      // file whose process-skill table now carries the Discovery row.
      const nav = guide.slice(guide.search(/^## Navigation/m))
      const flow = nav.split('\n').find(line => line.includes('Process flow')) ?? ''
      expect(flow).toContain(`\`${command}\``)
      expect(flow).toMatch(/optional/i)
      // Prefixed, i.e. it comes before the Induction entry point.
      expect(flow.indexOf(command)).toBeLessThan(flow.indexOf('specify-prd'))
    })

    it(`${label} skills-guide Adoption Files table has a domain (context map) row`, () => {
      // Review finding (PR #387 round 2, Minor-10): this PR re-scopes
      // /record-decision's writer monopoly to admit /brainstorm and /refine-story as
      // inline writers of the context map, so the table that exists to answer "who
      // writes this adoption file" must carry the row.
      const table = guide.slice(guide.search(/^## Adoption Files/m)).split(/\n## /)[0] ?? ''
      const row = table.split('\n').find(line => line.includes('context-map.md')) ?? ''
      expect(row).not.toBe('')
      expect(row).toContain(`\`${command}\``)
      expect(row).toMatch(/inline glossary/)
    })
  }

  it('docs-site Process Lifecycle ladder shows discovery as an optional pre-Induction entry point', () => {
    const ladder = read(DOCS_LADDER)
    expect(ladder).toContain('/pair-process-brainstorm')
    expect(ladder).toMatch(/optional entry point/i)
    expect(ladder).toMatch(/nine steps/)
  })
})

describe('brainstorm — forward references retired now that it ships (#230)', () => {
  const CALLERS = [
    { dataset: 'capability/grill/SKILL.md', mirror: 'pair-capability-grill/SKILL.md' },
    {
      dataset: 'capability/map-subdomains/SKILL.md',
      mirror: 'pair-capability-map-subdomains/SKILL.md',
    },
    {
      dataset: 'capability/map-contexts/SKILL.md',
      mirror: 'pair-capability-map-contexts/SKILL.md',
    },
  ] as const

  for (const c of CALLERS) {
    it(`${c.dataset} no longer calls brainstorm "planned"`, () => {
      const content = read(join(DATASET_SKILLS, c.dataset))
      expect(content).toMatch(/brainstorm/)
      expect(content).not.toMatch(/planned — #230/)
    })

    it(`${c.mirror} no longer calls brainstorm "planned"`, () => {
      const content = read(join(MIRROR_SKILLS, c.mirror))
      expect(content).toMatch(/brainstorm/)
      expect(content).not.toMatch(/planned — #230/)
    })
  }

  it('skills-guide callers matrix records brainstorm as a real composition', () => {
    for (const guide of [
      read(join(DATASET_KB, 'skills-guide.md')),
      read(join(MIRROR_KB, 'skills-guide.md')),
    ]) {
      expect(guide).toMatch(/brainstorm/)
      expect(guide).not.toMatch(/planned — #230/)
    }
  })
})

describe('brainstorm — round-3 review fixes (#230)', () => {
  for (const v of VARIANTS) {
    it(`${v.label} keeps branch-specific reference in sibling files behind pointers`, () => {
      // Review finding (round 3, Minor): at 29 KB SKILL.md was the largest in the
      // corpus, with material only a fraction of runs reach (matrix rationale, the
      // itemized resume list) inline — against progressive disclosure, which /review
      // and /implement satisfy with sibling reference files.
      expect(existsSync(v.matrixPath)).toBe(true)
      expect(existsSync(v.resumePath)).toBe(true)
      expect(existsSync(v.degradationPath)).toBe(true)
      // The pointers are sharp and named where the material used to be.
      expect(section(v.content, 'Parametrization')).toMatch(
        /\[parametrization\.md\]\((\.\/)?parametrization\.md\)/,
      )
      expect(section(v.content, 'Idempotent Re-invocation')).toMatch(
        /\[resume\.md\]\((\.\/)?resume\.md\)/,
      )
      expect(section(v.content, 'Graceful Degradation')).toMatch(
        /\[degradation\.md\]\((\.\/)?degradation\.md\)/,
      )
      // The moved material is moved, not copied.
      expect(v.content).not.toMatch(/^\| type `initiative`/m)
      expect(v.content).not.toMatch(/^\| \*\*no recognized type\*\*/m)
      expect(v.content).not.toMatch(/not installed\*\* \(Phase 2\)/)
    })
  }

  it('dataset SKILL.md is no longer the largest in the skill corpus', () => {
    // The finding measured size against the corpus (brainstorm 29 KB vs review 27.8,
    // implement 26.7), so the guard is relative and self-maintaining rather than a
    // magic byte budget: whatever the corpus grows to, brainstorm must not be its
    // biggest SKILL.md.
    const sizes = readdirSync(DATASET_SKILLS, { withFileTypes: true })
      .filter(group => group.isDirectory())
      .flatMap(group =>
        readdirSync(join(DATASET_SKILLS, group.name), { withFileTypes: true })
          .filter(skill => skill.isDirectory())
          .map(skill => ({
            name: `${group.name}/${skill.name}`,
            size: read(join(DATASET_SKILLS, group.name, skill.name, 'SKILL.md')).length,
          })),
      )
    const brainstorm = sizes.find(s => s.name === 'process/brainstorm')?.size ?? 0
    const largestOther = Math.max(
      ...sizes.filter(s => s.name !== 'process/brainstorm').map(s => s.size),
    )
    expect(brainstorm).toBeGreaterThan(0)
    expect(brainstorm).toBeLessThan(largestOther)
  })

  for (const v of VARIANTS) {
    it(`${v.label} preamble admits the level is ASKED on the fallback row`, () => {
      // Review finding (round 3, Minor): the preamble claimed the level is deduced
      // "with $root", contradicting the matrix's own fallback row.
      expect(preamble(v.content)).toMatch(
        /or asked, when the root carries no recognized type label/,
      )
    })

    it(`${v.label} states the $theme precedence when $root is also given`, () => {
      // Review finding (round 3, Minor): $theme was documented as "$root absent"
      // with no rule for both, while phase 1 read "the free theme … or the root's
      // subject" — unresolvable for an executor.
      const args = section(v.content, 'Arguments')
      const row = args.split('\n').find(line => line.includes('`$theme`')) ?? ''
      expect(row).toMatch(/Precedence with `\$root`/)
      expect(row).toMatch(/narrows the topic inside `\$root`/)
      // …and phase 1's grill composition applies that precedence.
      expect(phase(v.content, 1)).toMatch(/\*\*`\$theme` when it was given\*\*/)
      expect(phase(v.content, 1)).toMatch(/wins over the root's subject/)
    })

    it(`${v.label} free-theme row keys orientation on the argument/tag, not on the level`, () => {
      // Review finding (round 3, Minor): "follows the answered level, functional
      // default" — orientation is not derivable from level.
      const freeTheme =
        v.matrix.split('\n').find(line => line.startsWith('|') && /free theme/i.test(line)) ?? ''
      expect(freeTheme).toMatch(/unless `\$orientation` or the tag modifier flips it/)
      expect(freeTheme).not.toMatch(/follows the answered level/)
    })

    it(`${v.label} resolves an untyped root under an INITIATIVE to the plan-epics writer`, () => {
      // Review finding (round 3, Minor): the fallback row's leaf treatment left an
      // untyped root whose parent is an initiative (an unlabelled epic-shaped
      // container) with no parent epic — the run HALTed telling the developer to
      // create an epic when a missing LABEL was the actual defect.
      const fallback =
        v.matrix
          .split('\n')
          .find(line => line.startsWith('|') && /no recognized type/i.test(line)) ?? ''
      expect(fallback).toMatch(/Parent is an `initiative`/)
      expect(fallback).toContain(`\`${v.planEpics}\` with \`$initiative:`)
      expect(fallback).toMatch(/rather than a HALT/)
      // Phase 3 item 6 carries the same two sub-cases…
      const p3 = phase(v.content, 3)
      expect(p3).toMatch(/when the root's parent is an \*\*initiative\*\*/)
      expect(p3).toMatch(/label `#\[ID\]` with its real type and re-run/)
      // …and the HALT names the labelling remedy, not only the /plan-epics pointer.
      const halt = section(v.content, 'HALT Conditions')
      expect(halt).toMatch(/label `#\[ID\]` with its real type and re-run/)
      expect(halt).toMatch(/never reaches this HALT/)
    })

    it(`${v.label} offers the .pair/working/ handoff on the grill-not-installed path too`, () => {
      // Review finding (round 3, Minor): the handoff was phrased as "take grill's
      // handoff offer", leaving the story's interruption edge case unspecified on
      // the one branch where there is no grill to offer it.
      const p1 = phase(v.content, 1)
      expect(p1).toMatch(/when the interview ran \*\*inline\*\*/)
      expect(p1).toMatch(/there is no grill to offer it/)
      const gd = v.degradation
      const bullet =
        gd.split('\n').find(line => line.includes(`\`${v.grill}\` not installed`)) ?? ''
      expect(bullet).toMatch(/`\.pair\/working\/` handoff/)
    })

    it(`${v.label} records the resolved parametrization in the phase-1 handoff`, () => {
      // Review finding (round 3, Minor): resume item 1 claimed the triple is "never
      // a re-ask", false on the two paths where the level is ASKED — nothing
      // persisted it, so a fresh-session resume re-asked exactly that question.
      const p1 = phase(v.content, 1)
      expect(p1).toMatch(/records the \*\*resolved parametrization\*\*/)
      expect(p1).toMatch(/without re-asking the level/)
      // The resume list is qualified accordingly, not absolute.
      expect(v.resume).toMatch(/on the three \*\*type rows\*\*/)
      expect(v.resume).toMatch(/where the level is \*\*asked\*\* rather than deduced/)
      expect(v.resume).toMatch(/the level question fires again/)
    })

    it(`${v.label} states the writer's domain step is a confirm-only pass after phase 2`, () => {
      // Review finding (round 3, Minor): on the initiative-root path phase 2 mapped
      // the scope and the composed writer's Step 3.5 mapped the SAME scope again —
      // two subdomain-catalog deltas to approve in one run.
      const p3 = phase(v.content, 3)
      expect(p3).toMatch(/\*\*confirm-only pass\*\*/)
      expect(p3).toMatch(/Step 3\.5/)
      expect(p3).toMatch(/one\*\* subdomain-catalog delta per run/)
    })
  }

  const PLAN_EPICS = [
    ['dataset', join(DATASET_SKILLS, 'process/plan-epics/SKILL.md')],
    ['mirror', join(MIRROR_SKILLS, 'pair-process-plan-epics/SKILL.md')],
  ] as const

  for (const [label, path] of PLAN_EPICS) {
    it(`plan-epics (${label}) Step 3.5 skips re-mapping a scope the caller already placed`, () => {
      const content = read(path)
      const step = content.match(/### Step 3\.5[\s\S]*?(?=\n### )/)?.[0] ?? ''
      expect(step).not.toBe('')
      const skip = step.split('\n').find(line => /^2\. \*\*Skip\*\*/.test(line)) ?? ''
      expect(skip).toMatch(/same capability areas/)
      expect(skip).toMatch(/do not re-compose/)
      expect(skip).toMatch(/one\*\* subdomain-catalog delta/)
    })
  }

  const IDEMPOTENCY =
    'guidelines/technical-standards/ai-development/skill-conventions/idempotency.md'

  for (const [label, kb, command] of [
    ['dataset', join(DATASET_KB, IDEMPOTENCY), '/brainstorm'],
    ['installed KB', join(MIRROR_KB, IDEMPOTENCY), '/pair-process-brainstorm'],
  ] as const) {
    it(`${label} idempotency convention counts brainstorm among the orchestrators`, () => {
      // Review finding (round 3, Minor): the convention enumerated "the three
      // orchestrators", but brainstorm now carries exactly the itemized per-phase
      // resume list that enumeration describes.
      const content = read(kb)
      expect(content).toMatch(/four orchestrators/)
      expect(content).toContain(`\`${command}\``)
      expect(content).not.toMatch(/three orchestrators/)
    })
  }
})

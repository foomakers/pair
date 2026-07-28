import { describe, it, expect } from 'vitest'
import { existsSync, readFileSync } from 'fs'
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

const read = (path: string): string => (existsSync(path) ? readFileSync(path, 'utf-8') : '')

const BRAINSTORM_DATASET = read(BRAINSTORM_DATASET_PATH)
const BRAINSTORM_MIRROR = read(BRAINSTORM_MIRROR_PATH)

// Name map dataset -> root mirror (per the KB self-sync convention).
const VARIANTS = [
  {
    label: 'dataset',
    content: BRAINSTORM_DATASET,
    grill: '/grill',
    mapSub: '/map-subdomains',
    mapCtx: '/map-contexts',
    planEpics: '/plan-epics',
    planStories: '/plan-stories',
    refine: '/refine-story',
    setupPm: '/setup-pm',
  },
  {
    label: 'mirror',
    content: BRAINSTORM_MIRROR,
    grill: '/pair-capability-grill',
    mapSub: '/pair-capability-map-subdomains',
    mapCtx: '/pair-capability-map-contexts',
    planEpics: '/pair-process-plan-epics',
    planStories: '/pair-process-plan-stories',
    refine: '/pair-process-refine-story',
    setupPm: '/pair-capability-setup-pm',
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
      const matrix =
        v.content.slice(v.content.search(/^## Orientation Matrix/m)).split(/\n## /)[0] ?? ''
      expect(matrix).not.toBe('')
      expect(matrix).toMatch(/epic.*broad.*functional/i)
      expect(matrix).toMatch(/story.*punctual/i)
      expect(matrix).toMatch(/tech-debt/)
      expect(matrix).toMatch(/technical/)
    })

    it(`${v.label} states the deduced values up-front and accepts an override`, () => {
      // Scoped to the Orientation Matrix section (where the rule lives) and to
      // Step 0's up-front statement template (where it is executed).
      const matrix = section(v.content, 'Orientation Matrix')
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
      const matrix = section(v.content, 'Orientation Matrix')
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

    it(`${v.label} resolves the tag row as a modifier with an explicit precedence note`, () => {
      // Review finding (PR #387, Minor): two tag-driven rows overlapped with no
      // stated precedence, so an epic labelled tech-debt matched both.
      const matrix = section(v.content, 'Orientation Matrix')
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
      const gd =
        v.content.slice(v.content.search(/^## Graceful Degradation/m)).split(/\n## /)[0] ?? ''
      expect(gd).toMatch(/context-map\.md/)
      expect(gd).toMatch(/not an error|expected steady state/)
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
      const idem = section(v.content, 'Idempotent Re-invocation')
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

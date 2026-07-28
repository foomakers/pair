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
      expect(v.content).toMatch(/D24/)
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
      expect(v.content).toMatch(/\.pair\/working\//)
      expect(v.content).toMatch(/handoff/i)
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
      expect(v.content).toMatch(/up-front/)
      expect(v.content).toMatch(/override/i)
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
      expect(v.content).toMatch(/PRD is never modified|never modifies the PRD/)
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

import { describe, it, expect } from 'vitest'
import { existsSync, readFileSync } from 'fs'
import { join } from 'path'
import {
  parseStepCatalogue,
  parseProcessProfiles,
  collectHowToGuides,
  collectProcessSkillDirs,
  checkStepCatalogue,
  checkStepMarkers,
  checkStepMarkersInMirror,
  checkManualPathEntrypoint,
  checkProcessProfiles,
  STEP_MARKER,
} from '../tools/skills-conformance-check'
import { sectionBetween } from './test-utils'

// Conformance guard for story #251: a `## Process Profile` section in
// way-of-working declares which PROCESS STEPS a project runs, and `/next` never
// proposes a disabled one.
//
// The unit of configuration is the STEP, never one of its two representations —
// a how-to guide (the manual path) and an executable skill are two ways to run
// the same step, and the two sets do not coincide (`define-subdomains` /
// `define-bounded-contexts` are capabilities with no how-to; `brainstorm` is a
// process skill with no how-to). The catalogue is what ties them together, so
// those asymmetries are DECLARED DATA, not conditionals in `/next`.
//
// Split of duties, per the repo's "gate logic lives in a tested production
// module" rule (ADL 2026-07-13): the mechanical catalogue↔corpus binding lives in
// `skills-conformance-check.ts` (a module with white-box unit tests, exposed as
// the root-gated `skills:conformance` CLI) and is only INVOKED here over the real
// corpus. What this file owns is the prose contract — that the schema, the HALTs,
// the gate convention and `/next`'s new resolution step actually say what the
// story requires — which no CLI can assert.

const HUB = join(__dirname, '../..')
const DATASET = join(HUB, 'dataset')
const KB = join(DATASET, '.pair/knowledge')
const AI_DEV = join(KB, 'guidelines/technical-standards/ai-development')
const CATALOGUE_PATH = join(AI_DEV, 'step-catalogue.md')
const PROFILES_PATH = join(AI_DEV, 'process-profiles.md')
const GATE_PATH = join(AI_DEV, 'skill-conventions/process-profile-gate.md')
const SKILLS_DIR = join(DATASET, '.skills')
const HOW_TO_DIR = join(KB, 'how-to')
const WOW_TEMPLATE = join(DATASET, '.pair/adoption/tech/way-of-working.md')
const CONVENTIONS_README = join(AI_DEV, 'skill-conventions/README.md')

const NEXT_DATASET = join(SKILLS_DIR, 'next/SKILL.md')
const MIRROR_SKILLS_DIR = join(HUB, '../../.claude/skills')
const NEXT_MIRROR = join(MIRROR_SKILLS_DIR, 'pair-next/SKILL.md')
const AGENTS_MD = join(DATASET, 'AGENTS.md')

const read = (p: string): string => (existsSync(p) ? readFileSync(p, 'utf-8') : '')

const catalogueSource = read(CATALOGUE_PATH)
const profilesSource = read(PROFILES_PATH)
const gateSource = read(GATE_PATH)

describe('step catalogue — the unit of the profile is the step, not its representation', () => {
  it('ships as a KB file', () => {
    expect(existsSync(CATALOGUE_PATH)).toBe(true)
  })

  it('gives every step a stable id, both representations and its prerequisites', () => {
    const entries = parseStepCatalogue(catalogueSource)
    expect(entries.length).toBeGreaterThan(0)
    for (const entry of entries) {
      expect(entry.id).toMatch(/^[a-z][a-z0-9-]*$/)
      // `howTo` / `executable` are nullable BY DESIGN — that nullability is what
      // makes the three asymmetries expressible as data.
      expect(entry).toHaveProperty('howTo')
      expect(entry).toHaveProperty('executable')
      expect(Array.isArray(entry.requires)).toBe(true)
    }
    // Ids are unique — a duplicate would make a whitelist entry ambiguous.
    expect(new Set(entries.map(e => e.id)).size).toBe(entries.length)
  })

  it('binds to the real corpus in BOTH directions (no silent drift)', () => {
    const entries = parseStepCatalogue(catalogueSource)
    const errors = checkStepCatalogue(entries, {
      howToGuides: collectHowToGuides(HOW_TO_DIR),
      skillDirs: collectProcessSkillDirs(SKILLS_DIR),
    })
    expect(errors).toEqual([])
  })

  it('declares the three asymmetries as DATA, not as special cases in logic', () => {
    const byId = new Map(parseStepCatalogue(catalogueSource).map(e => [e.id, e]))

    // 04 / 05: retired how-to guides, executable form is a CAPABILITY.
    for (const id of ['define-subdomains', 'define-bounded-contexts']) {
      const entry = byId.get(id)
      expect(entry, `catalogue is missing the DDD-mapping step \`${id}\``).toBeDefined()
      expect(entry?.howTo).toBeNull()
      expect(entry?.executable).toMatch(/^\/map-/)
    }

    // brainstorm: a process SKILL with no how-to — so on a project running the
    // manual path it is not executable at all, and must be declared unreachable.
    const brainstorm = byId.get('brainstorm')
    expect(brainstorm).toBeDefined()
    expect(brainstorm?.howTo).toBeNull()
    expect(brainstorm?.executable).toBe('/brainstorm')
  })

  it('states that a step with no representation is never proposed', () => {
    expect(catalogueSource.toLowerCase()).toMatch(/unreachable|not executable|no representation/)
  })

  it('scopes itself: a capability that is not a step is out of the profile', () => {
    // The catalogue is the boundary that makes "is `/estimate` governed?" answerable.
    expect(catalogueSource).toMatch(/`\/estimate`|`\/classify`/)
    expect(catalogueSource.toLowerCase()).toMatch(/not a step|outside the profile|never a step/)
  })
})

describe('step markers — every executable representation declares its step id', () => {
  it('carries a marker on each catalogued executable, and on nothing else', () => {
    const entries = parseStepCatalogue(catalogueSource)
    expect(checkStepMarkers(entries, SKILLS_DIR)).toEqual([])
  })

  it('carries it in the INSTALLED MIRROR too — the copy an assistant actually loads', () => {
    // The dataset copy is the source; the mirror is the binding one (same finding
    // class as #280's `brainstorm-phases.test.ts:820`). Guarded here AND in
    // `skills:conformance`, so dropping a marker from `.claude/skills/**` during a
    // regeneration is a red gate, not a silently ungoverned step.
    const entries = parseStepCatalogue(catalogueSource)
    expect(checkStepMarkersInMirror(entries, SKILLS_DIR, MIRROR_SKILLS_DIR)).toEqual([])
  })

  it('uses a declared marker, not a prose window', () => {
    // Same contract shape as the approval-round marker: attachment is line
    // identity, so a reworded section cannot silently widen the check.
    expect(STEP_MARKER.source).toContain('process-step')
  })
})

describe('profile schema — built-in profiles and their normative error cases', () => {
  it('ships as a KB file', () => {
    expect(existsSync(PROFILES_PATH)).toBe(true)
  })

  it('declares `default`, `poc` and `custom`', () => {
    expect(profilesSource).toMatch(/`default`/)
    expect(profilesSource).toMatch(/`poc`/)
    expect(profilesSource).toMatch(/`custom`/)
  })

  it('states that an ABSENT section means `default` — today’s behaviour unchanged', () => {
    const lower = profilesSource.toLowerCase()
    expect(lower).toMatch(/absent|no `?## process profile`? section|omitted/)
    expect(lower).toMatch(/convention over configuration|d21/)
  })

  it('states the three HALTs as normative rules, not reader inference', () => {
    const lower = profilesSource.toLowerCase()
    // Unknown profile name -> HALT listing the known profiles.
    expect(profilesSource).toMatch(/HALT/)
    expect(lower).toMatch(/unknown profile/)
    expect(lower).toMatch(/known profiles|list.*profiles/)
    // Unknown step id -> HALT listing the valid ids. A typo must not silently
    // disable a step.
    expect(lower).toMatch(/unknown (step )?id/)
    expect(lower).toMatch(/valid ids|list.*ids/)
    // The two messages are deliberately different.
    expect(lower).toMatch(/different message|not the same mistake|two different/)
  })

  it('treats an empty whitelist as a misconfiguration, never as “everything disabled”', () => {
    const lower = profilesSource.toLowerCase()
    expect(lower).toMatch(/empty (custom )?whitelist/)
    expect(lower).toMatch(/misconfiguration/)
    expect(lower).toMatch(/never .*everything disabled|not .*everything disabled|not "?all/)
  })

  it('resolves every built-in profile against the catalogue, prerequisite-closed', () => {
    const entries = parseStepCatalogue(catalogueSource)
    const profiles = parseProcessProfiles(profilesSource)
    expect(Object.keys(profiles)).toEqual(expect.arrayContaining(['default', 'poc']))
    expect(checkProcessProfiles(profiles, entries)).toEqual([])
  })

  it('`poc` proposes no DDD-mapping step and no strategic planning (epic #204 AC4)', () => {
    const profiles = parseProcessProfiles(profilesSource)
    const poc = profiles['poc']
    expect(Array.isArray(poc)).toBe(true)
    const enabled = new Set(poc as string[])
    for (const disabled of [
      'define-subdomains',
      'define-bounded-contexts',
      'plan-initiatives',
      'plan-epics',
    ]) {
      expect(enabled.has(disabled), `\`poc\` must not enable \`${disabled}\``).toBe(false)
    }
    // …while the delivery steps stay on: `poc` is a subset, not a different process.
    for (const kept of ['refine-story', 'plan-tasks', 'implement', 'review']) {
      expect(enabled.has(kept), `\`poc\` must keep \`${kept}\``).toBe(true)
    }
  })

  it('says the guidelines still apply to the code a `poc` project produces', () => {
    expect(profilesSource.toLowerCase()).toMatch(/guidelines still apply/)
  })

  it('states the profile lives ONLY in adoption; the KB owns schema + built-ins (D19)', () => {
    expect(profilesSource).toMatch(/D19/)
    expect(profilesSource).toMatch(/way-of-working/)
  })
})

describe('direct-invocation gate — written once as a convention, referenced everywhere', () => {
  it('ships as a skill-conventions file', () => {
    expect(existsSync(GATE_PATH)).toBe(true)
  })

  it('is listed in the skill-conventions index', () => {
    expect(read(CONVENTIONS_README)).toContain('process-profile-gate.md')
  })

  it('gates DIRECT invocation: warn that the step is disabled, then confirm', () => {
    const lower = gateSource.toLowerCase()
    expect(lower).toMatch(/direct(ly)? invok|direct invocation/)
    expect(lower).toMatch(/warn/)
    expect(lower).toMatch(/confirm/)
  })

  it('carves the composition case OUT: a composed disabled step never prompts', () => {
    const lower = gateSource.toLowerCase()
    expect(lower).toMatch(/compos/)
    expect(lower).toMatch(/never prompt|no prompt|without prompting/)
    // It degrades through the path that already exists for a skill that is not
    // installed — deliberately NOT a second degradation mechanism.
    expect(gateSource).toContain('graceful-degradation.md')
    expect(lower).toMatch(/not installed/)
  })

  it('leaves an enabled step (or an absent section) byte-for-byte unchanged', () => {
    expect(gateSource.toLowerCase()).toMatch(/unchanged|proceeds? silently|no prompt/)
  })
})

describe('way-of-working — the `## Process Profile` adoption section', () => {
  const template = read(WOW_TEMPLATE)

  it('documents the section in the shipped adoption template', () => {
    expect(template).toContain('## Process Profile')
  })

  it('marks it optional, absence meaning `default`', () => {
    const section = sectionBetween(template, '## Process Profile', '\n## ')
    expect(section).toMatch(/Optional/)
    expect(section.toLowerCase()).toMatch(/omitted|absent/)
    expect(section).toMatch(/`default`/)
  })

  it('shows the `poc` and `custom` shapes with a whitelist example', () => {
    const section = sectionBetween(template, '## Process Profile', '\n## ')
    expect(section).toMatch(/`poc`/)
    expect(section).toMatch(/`custom`/)
    expect(section).toMatch(/whitelist/)
  })

  it('points at the KB schema rather than restating it', () => {
    const section = sectionBetween(template, '## Process Profile', '\n## ')
    expect(section).toContain('process-profiles.md')
  })
})

describe('/next resolves the profile and never proposes a disabled step', () => {
  const sources: Array<[string, string]> = [
    ['dataset', read(NEXT_DATASET)],
    ['mirror', read(NEXT_MIRROR)],
  ]

  it.each(sources)('%s: resolves the profile before the cascade', (_, content) => {
    expect(content).toMatch(/## Process Profile|Resolve the Process Profile/)
    expect(content).toContain('process-profiles.md')
    expect(content).toContain('step-catalogue.md')
  })

  it.each(sources)('%s: absent section ⇒ `default` ⇒ the whole cascade (AC1)', (_, content) => {
    const section = sectionBetween(content, 'Resolve the Process Profile', '\n### Step 1')
    expect(section.toLowerCase()).toMatch(/no `?## process profile`? section|absent|omitted/)
    expect(section).toMatch(/`default`/)
    expect(section.toLowerCase()).toMatch(/unchanged|every step|full process/)
  })

  it.each(sources)('%s: drops a disabled candidate instead of erroring (AC4)', (_, content) => {
    const section = sectionBetween(content, 'Resolve the Process Profile', '\n### Step 1')
    expect(section.toLowerCase()).toMatch(/skipped|dropped|never (proposed|suggested)/)
    expect(section.toLowerCase()).toMatch(/not an error|never an error/)
  })

  it.each(sources)('%s: HALTs on an unknown id and on an unknown name (AC5)', (_, content) => {
    const section = sectionBetween(content, 'Resolve the Process Profile', '\n### Step 1')
    expect(section).toMatch(/HALT/)
    expect(section.toLowerCase()).toMatch(/unknown profile/)
    expect(section.toLowerCase()).toMatch(/unknown (step )?id/)
  })

  it.each(sources)('%s: HALTs on an empty custom whitelist (AC10)', (_, content) => {
    const section = sectionBetween(content, 'Resolve the Process Profile', '\n### Step 1')
    expect(section.toLowerCase()).toMatch(/empty/)
    expect(section.toLowerCase()).toMatch(/misconfiguration/)
  })

  it.each(sources)('%s: flags a disabled prerequisite with the minimal fix (AC9)', (_, content) => {
    const section = sectionBetween(content, 'Resolve the Process Profile', '\n### Step 1')
    expect(section.toLowerCase()).toMatch(/prerequisite/)
    expect(section.toLowerCase()).toMatch(/minimal fix/)
    // Flagged, never silently repaired.
    expect(section.toLowerCase()).toMatch(/never silently|not silently/)
  })

  it.each(sources)('%s: maps its cascade rows to step ids as data', (_, content) => {
    // Rows 12–16 are capabilities that are NOT steps and are never filtered —
    // the mapping table is what makes that explicit instead of implied.
    expect(content).toMatch(/Step id/)
    expect(content.toLowerCase()).toMatch(/rows? 12[–-]16|not steps|never filtered/)
  })

  it.each(sources)('%s: keeps the profile stateless, re-read every run', (_, content) => {
    const section = sectionBetween(content, 'Resolve the Process Profile', '\n### Step 1')
    expect(section.toLowerCase()).toMatch(/every (run|invocation)|re-?read|never cached/)
  })
})

describe('the manual (no-skills) path is governed by the same profile (AC8)', () => {
  it('the catalogue names the how-to guide as the step’s other representation', () => {
    const entries = parseStepCatalogue(catalogueSource)
    const withHowTo = entries.filter(e => e.howTo !== null)
    // Every how-to guide on disk is reachable from a step id.
    expect(withHowTo.length).toBe(collectHowToGuides(HOW_TO_DIR).length)
  })

  it('the schema says the profile governs the step, not one representation', () => {
    const lower = profilesSource.toLowerCase()
    expect(lower).toMatch(/how-to/)
    expect(lower).toMatch(/no skills installed|without skills|manual path/)
  })

  // The catalogue makes the mapping EXPRESSIBLE; it does not make the manual path
  // GOVERNED. The entrypoint a human with no skills reads is AGENTS.md's manual
  // flow — without a step there, a `poc` team follows step "identify your task",
  // opens `03-how-to-create-and-prioritize-initiatives.md` and runs a disabled step.
  it('AGENTS.md’s manual flow sends the reader to the profile before picking a how-to', () => {
    expect(checkManualPathEntrypoint(read(AGENTS_MD))).toEqual([])
  })

  it('the manual step names the section, the file and the catalogue', () => {
    const section = sectionBetween(read(AGENTS_MD), '## 🎯 Quick Start Process', '\n## ')
    expect(section).toContain('## Process Profile')
    expect(section).toContain('way-of-working.md')
    expect(section).toContain('step-catalogue.md')
  })
})

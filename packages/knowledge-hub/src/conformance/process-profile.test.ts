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
    //
    // Round 7 Minor: this asserted `STEP_MARKER.source` contained the literal
    // 'process-step' — true of a correct marker AND of a broken one (drop the
    // `id=` capture, widen `[a-z0-9-]+` to `.*`: both stay green). Asserted on
    // behaviour instead; each of the three cases below fails under one of those
    // edits.
    expect(STEP_MARKER.exec('<!-- process-step: id=refine-story -->')?.[1]).toBe('refine-story')
    expect(STEP_MARKER.test('This step carries a process-step marker for refine-story.')).toBe(
      false,
    )
    expect(STEP_MARKER.test('<!-- process-step: refine-story -->')).toBe(false)
    expect(STEP_MARKER.test('<!-- process-step: id=Refine Story -->')).toBe(false)
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

  // Round 3 Minor: the two remaining shapes of the widening hole. Both are
  // normative rules a reader executes, so both are stated in the schema rather
  // than left as behaviour only the reference resolver knows about.
  // Round 7 Questions: the reference resolver's HALT arm used to carry the full
  // catalogue as `enabled`, so a caller reading it without checking `halts` got
  // the whole process back. The type no longer offers one — and the prose readers
  // are held to the same rule, since `/next` resolves the profile by reading this.
  it('states that a HALT yields NO step set — neither `default` nor an empty one', () => {
    const lower = profilesSource.toLowerCase()
    expect(lower).toMatch(/no step set/)
    expect(lower).toMatch(/never continue on `?default`?/)
  })

  it('states that the section is exactly ONE, at heading level `##`', () => {
    const lower = profilesSource.toLowerCase()
    expect(lower).toMatch(/more than once|declared twice|second .*section/)
    expect(lower).toMatch(/heading level|level `?##`?|any level other/)
    // Both HALT — never a quiet fallback to `default`.
    expect(profilesSource).toMatch(/MORE THAN ONCE\*\*\s*\|\s*\*\*HALT/)
    expect(profilesSource).toMatch(/other than `## `\*\*|other than `##`\*\*/)
  })

  // Round 4 Major: the two shapes between the section level and the value level —
  // one key on two LINES, and a key whose list marker this reader does not accept.
  it('states that a key is declared ONCE, on a `-`/`*`/`+` list item', () => {
    const lower = profilesSource.toLowerCase()
    expect(lower).toMatch(/twice|more than once/)
    expect(profilesSource).toMatch(/`-`, `\*` or `\+`|`-` \/ `\*` \/ `\+`/)
    expect(lower).toMatch(/no bullet|bullet-less|numbered|ordered/)
  })

  // Round 5: the three CommonMark facts the reader has to know before any of the
  // rules above can fire at all — how the heading may be spelled, which blocks are
  // examples, and that a CRLF file is the same file.
  it('states the setext heading as a HALT alongside the mis-levelled one', () => {
    expect(profilesSource).toMatch(/SETEXT\*\*[^|]*\|\s*\*\*HALT/)
    expect(profilesSource.toLowerCase()).toMatch(/underlined with `?-{3}`?/)
  })

  it('states that all three code-block forms are examples, never declarations', () => {
    const lower = profilesSource.toLowerCase()
    expect(lower).toMatch(/code-block forms are examples|never declarations/)
    expect(profilesSource).toContain('`~~~`')
    expect(lower).toMatch(/four-space-indented|four-space indent|indented/)
  })

  // Round 6: the four shapes between "the section exists" and "its keys are read"
  // that the prose did not cover — a value spilling past its line, a key indented
  // into sublist/code ambiguity, a nested fence, and a delimiter never closed.
  it('states that a SPILLED value HALTs rather than being read up to the wrap', () => {
    const lower = profilesSource.toLowerCase()
    expect(lower).toMatch(/spill/)
    expect(lower).toMatch(/wrapp?ed|wrap/)
    expect(profilesSource).toMatch(/SPILLED[^|]*\|\s*\*\*HALT/)
  })

  it('states that a key indented by four spaces or a tab HALTs', () => {
    expect(profilesSource).toMatch(/INDENTED[^|]*\|\s*\*\*HALT/)
    expect(profilesSource.toLowerCase()).toMatch(/sublist/)
  })

  // Round 8: the two shapes the schema had no position on. A blockquoted key was
  // read as neither a declaration nor a problem — the silent widening — while the
  // table-row exclusion it must be distinguished from was enforced in code and
  // stated nowhere. Both directions are written down here, together, because the
  // rule is the distinction and not either half.
  it('states that a key inside a BLOCKQUOTE HALTs, and a table row does not', () => {
    const lower = profilesSource.toLowerCase()
    expect(profilesSource).toMatch(/BLOCKQUOTE[^|]*\|\s*\*\*HALT/)
    expect(lower).toMatch(/table row/)
    expect(lower).toMatch(/documentation is never configuration|no declaration, and no halt/)
  })

  // Round 9: the key's SPELLING is case-insensitive, its VALUE is not. Undocumented,
  // the rule was also unimplemented — `- `Profile`: `poc`` resolved to `default` with
  // all twelve steps and nothing reported, while the heading one line above it is
  // matched case-insensitively for exactly the reason stated there.
  it('states that a key is detected whatever its CASE, and its value is not', () => {
    const lower = profilesSource.toLowerCase()
    expect(lower).toMatch(/case-insensitiv|whatever its case|regardless of case/)
    // In the error table, as its own row — and the one row whose outcome is not a HALT.
    expect(profilesSource).toMatch(/CASE[^|]*\|\s*\*\*read/)
    expect(lower).toMatch(/value|`poc`/)
  })

  it('states that a step id repeated in a whitelist HALTs rather than being deduped', () => {
    expect(profilesSource).toMatch(/MORE THAN ONCE\*\* in a whitelist[^|]*\|\s*\*\*HALT/)
    expect(profilesSource.toLowerCase()).toMatch(/never deduped|not deduped/)
  })

  it('states the CommonMark fence-length rule', () => {
    expect(profilesSource.toLowerCase()).toMatch(/at least as long/)
  })

  it('states that HTML comments are masked and an unterminated one HALTs', () => {
    const lower = profilesSource.toLowerCase()
    expect(lower).toMatch(/html comments? (are|is) not content|html comments are masked|masked/)
    expect(profilesSource).toMatch(/UNTERMINATED[^|]*\|\s*\*\*HALT/)
  })

  it('states that line endings are normalized before anything is read', () => {
    const lower = profilesSource.toLowerCase()
    expect(lower).toMatch(/line endings are normalized/)
    expect(lower).toMatch(/crlf/)
  })

  it('accepts the closed-ATX and indented spellings of the heading', () => {
    const lower = profilesSource.toLowerCase()
    expect(lower).toMatch(/closed-atx/)
    expect(lower).toMatch(/three spaces/)
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

  // Round 4 Minor: the convention's "what stays in the skill" snippet is the file
  // the NEXT author copies from, and it prescribed a delta none of the 12 shipped
  // skills carries. `checkOneStepMarker` only requires the marker plus a pointer
  // anywhere in the dir, so a 13th, differently-worded delta would land green and
  // the convention would drift from the corpus it governs. Pinned to the real one.
  it('prescribes the delta the corpus actually ships, not a paraphrase of it', () => {
    const marker = '<!-- process-step: id=refine-story -->'
    const snippet = /```markdown\n([\s\S]*?)```/.exec(gateSource)?.[1]?.trim()
    const skill = read(join(SKILLS_DIR, 'process/refine-story/SKILL.md'))
    const from = skill.indexOf(marker)
    expect(from).toBeGreaterThan(-1)
    expect(snippet).toBe(skill.slice(from, skill.indexOf('\n## ', from)).trim())
  })
})

// Round 7 Minor: AC7 and the convention put the check on the COMPOSING skill,
// before composing (process-profile-gate.md). `brainstorm` states that at its
// composition sites; the other four composers stated it only in their top delta,
// while their algorithms kept deciding on installation ALONE. An executor
// following refine-story's numbered algorithm under `poc` composes
// `/map-subdomains` and runs DDD mapping on a project that declared it does none
// — the one path that reaches DDD mapping under `poc`, since `/next` has no
// cascade row for it (epic #204 AC4).
describe('composers name the profile AT the composition site, not only in their delta', () => {
  const CLAUSE = /disabled by the project['’]s \[process profile\]/
  const copies = (name: string): Array<[string, string]> => [
    [`dataset ${name}`, read(join(SKILLS_DIR, `process/${name}/SKILL.md`))],
    [`mirror ${name}`, read(join(MIRROR_SKILLS_DIR, `pair-process-${name}/SKILL.md`))],
  ]
  const composers = ['refine-story', 'plan-tasks', 'plan-epics', 'bootstrap'].flatMap(copies)

  it.each(composers)('%s: states it in the ALGORITHM, at the composition beat', (_, content) => {
    const cut = content.indexOf('## Graceful Degradation')
    expect(cut).toBeGreaterThan(-1)
    // Before the degradation section ⇒ inside the numbered algorithm, where the
    // executor decides whether to compose.
    expect(content.slice(0, cut)).toMatch(CLAUSE)
  })

  it.each(composers)('%s: states it in the graceful-degradation entry too', (_, content) => {
    const section = sectionBetween(content, '## Graceful Degradation', '\n## ')
    expect(section).toMatch(CLAUSE)
  })

  // The precedent this mirrors — kept in the same test so removing one side of
  // the pair is visible.
  it('brainstorm keeps its own composition-site statement', () => {
    const degradation = read(join(SKILLS_DIR, 'process/brainstorm/degradation.md'))
    expect(degradation).toMatch(/process profile/i)
    expect(degradation.toLowerCase()).toContain('before composing')
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

  // Round 8: this template is itself read as a declaration by the gate, and it
  // documents the two keys in a TABLE — so the shape it must not treat as a
  // declaration is one of its own, and the shape it must HALT on is one an author
  // could plausibly write two lines below. Both are stated where they are read.
  it('tells an author that a blockquoted key HALTs and a table row is documentation', () => {
    const section = sectionBetween(template, '## Process Profile', '\n## ')
    const lower = section.toLowerCase()
    expect(lower).toMatch(/blockquote/)
    expect(lower).toMatch(/table/)
    expect(lower).toMatch(/twice/)
  })

  // Round 9: the template's own key column is headed `Key` in Title Case, which is
  // where the mirrored spelling comes from — so the case rule is stated where it is
  // read.
  it('tells an author the key is read whatever its case, and the value is not', () => {
    const section = sectionBetween(template, '## Process Profile', '\n## ')
    expect(section.toLowerCase()).toMatch(/case-insensitiv|whatever its case|regardless of case/)
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

  it.each(sources)('%s: a HALT yields no step set, not `default` (round 7)', (_, content) => {
    const section = sectionBetween(content, 'Resolve the Process Profile', '\n### Step 1')
    expect(section.toLowerCase()).toMatch(/no step set/)
    expect(section.toLowerCase()).toMatch(/never continue on `?default`?/)
  })

  it.each(sources)('%s: HALTs on a duplicated or mis-levelled section', (_, content) => {
    const section = sectionBetween(content, 'Resolve the Process Profile', '\n### Step 1')
    expect(section.toLowerCase()).toMatch(/more than one `?## process profile`?/)
    expect(section.toLowerCase()).toMatch(/level other than `?##`?|### process profile/)
  })

  // Round 4 Major: the KEY level, between the SECTION level (round 3) and the
  // VALUE level (round 2). Both new rules are normative for the LLM path too —
  // `/next` is the executing reader, the resolver only the reference one.
  it.each(sources)(
    '%s: HALTs on a key declared twice, and on an off-shape marker',
    (_, content) => {
      const section = sectionBetween(content, 'Resolve the Process Profile', '\n### Step 1')
      const lower = section.toLowerCase()
      expect(lower).toMatch(/same key .*twice|key .*more than once|twice .*same section/)
      expect(lower).toMatch(/`?[-*+]`?|bullet/)
      expect(lower).toMatch(/no bullet|bullet-less|numbered|ordered/)
    },
  )

  // Round 5: the executing reader needs the same three CommonMark facts the
  // schema now states — a setext heading is a HALT, a code block of any of the
  // three forms is an example, and a CRLF file is read as the LF one.
  it.each(sources)('%s: HALTs on a setext heading and normalizes line endings', (_, content) => {
    const section = sectionBetween(content, 'Resolve the Process Profile', '\n### Step 1')
    const lower = section.toLowerCase()
    expect(lower).toMatch(/setext/)
    expect(lower).toMatch(/line endings|crlf/)
    expect(lower).toMatch(/code-block forms|examples rather than declarations/)
  })

  // Round 8: the executing reader carries the same two rules — the blockquote
  // HALTs, the documentation table row does not, and a repeated step id is never
  // deduped away.
  it.each(sources)('%s: HALTs on a blockquoted key but not on a table row', (_, content) => {
    const section = sectionBetween(content, 'Resolve the Process Profile', '\n### Step 1')
    const lower = section.toLowerCase()
    expect(lower).toMatch(/blockquote/)
    expect(lower).toMatch(/table row/)
  })

  // Round 9: the executing reader carries the same rule — a case-variant KEY is the
  // key, a case-variant VALUE is not the value.
  it.each(sources)('%s: reads a key whatever its case, and a value strictly', (_, content) => {
    const section = sectionBetween(content, 'Resolve the Process Profile', '\n### Step 1')
    const lower = section.toLowerCase()
    expect(lower).toMatch(/case-insensitiv|whatever its case|regardless of case/)
    expect(lower).toMatch(/`profile`|`whitelist`/)
  })

  it.each(sources)('%s: HALTs on a step id named more than once', (_, content) => {
    const section = sectionBetween(content, 'Resolve the Process Profile', '\n### Step 1')
    const lower = section.toLowerCase()
    expect(lower).toMatch(/named more than once|more than once in the whitelist/)
    expect(lower).toMatch(/never deduped|not deduped/)
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

  // Round 7 Minor: Step 3 carried an explicit "every row below is subject to the
  // enabled step set" reminder and Step 2 carried none, though Step 0.5 says the
  // set is carried into Steps 2–5 and rows 1–2 map to `specify-prd`/`bootstrap`.
  // The contrast invited the reading that only Step 3's rows are filtered — a
  // `custom` profile omitting `specify-prd` on a template PRD would then be
  // proposed `/specify-prd`, a step the project explicitly disabled (AC4).
  it.each(sources)('%s: repeats the profile filter under BOTH cascade tables', (_, content) => {
    for (const [step, until] of [
      ['### Step 2: Cascade', '\n### Step 3'],
      ['### Step 3: Cascade', '\n### Step 4'],
    ]) {
      const section = sectionBetween(content, step as string, until as string)
      expect(section, `${step} states no profile filter`).toMatch(/Profile filter/)
      expect(section.toLowerCase()).toMatch(/step 0\.5/)
      expect(section.toLowerCase()).toMatch(/skipped|never proposed/)
    }
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

  // Round 2 Major (a): Step 0.5 scoped its filter to "Steps 2–4" while Step 5 names
  // skills unconditionally, so the fallback printed `/pair-process-plan-stories` and
  // `/pair-process-review` verbatim even when the profile disabled them — AC4 says a
  // disabled step is never suggested, and the fallback is not a row.
  it.each(sources)('%s: carries the enabled set into the FALLBACK too (AC4)', (_, content) => {
    const section = sectionBetween(content, 'Resolve the Process Profile', '\n### Step 1')
    expect(section).toMatch(/Steps? 2[–-]5/)
    expect(section.toLowerCase()).toMatch(/fallback/)
  })

  it.each(sources)('%s: the fallback names only enabled steps (AC4)', (_, content) => {
    const section = sectionBetween(content, '### Step 5: Fallback', '\n## ')
    expect(section.toLowerCase()).toMatch(/enabled/)
    expect(section.toLowerCase()).toMatch(/disabled/)
  })

  // Round 2 Major (b): under `poc`, rows 3–4 are dropped and row 5 needs epics, so a
  // fresh project fell through to a fallback recommending `plan-stories` — whose only
  // enabled producer of input is `brainstorm`, a step `/next` proposes nowhere else.
  it.each(sources)('%s: the fallback has a backlog entry point under `poc`', (_, content) => {
    const section = sectionBetween(content, '### Step 5: Fallback', '\n## ')
    // Dataset names skills bare, the mirror carries the install prefix.
    expect(section).toMatch(/\/(pair-process-)?brainstorm/)
    expect(section).toMatch(/`poc`/)
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

import { describe, it, expect } from 'vitest'
import { existsSync, readFileSync } from 'fs'
import { join } from 'path'
import { syncFrontmatter } from '@pair/content-ops'
import {
  buildDatasetSkillNameMap,
  buildSkillLinkPathMap,
  applyKnownMirrorTransforms,
} from '../tools/skills-guide-mirror'

// Conformance guard for the `bootstrap` skill artifact
// (dataset/.skills/process/bootstrap/** + its root mirror).
//
// Story #278 — Quickstart path: bootstrap gains a QUICK setup depth as an
// ADDITIVE second resolution depth of the same skill (no new skill, no second
// entry point). It composes the already-merged Guided/Quick Setup Convention
// (#276) rather than inventing a Quickstart-specific resolution (AC3): the
// convention fixes the selector direction, the defaults cascade, and the
// non-interactive safety rule; bootstrap only declares its per-adopter delta
// (which decision points are defaultable, which are still asked, and from which
// source each tier is filled) in the disclosed `quick-mode-defaults.md`.
//
// Guided remains bootstrap's DECLARED DEFAULT — absent an explicit quick signal
// the existing interview runs unchanged (AC2), and every file quick mode writes
// is a normal adoption file, editable exactly as guided mode's would be (AC4).
// See issue #278 and epic #213.

const ROOT = join(__dirname, '../../../..')
const SKILLS_DIR = join(__dirname, '../../dataset/.skills')
const DATASET_DIR = join(SKILLS_DIR, 'process/bootstrap')
const MIRROR_DIR = join(ROOT, '.claude/skills/pair-process-bootstrap')

const CONVENTION_REL =
  '.pair/knowledge/guidelines/technical-standards/ai-development/skill-conventions/guided-quick-setup.md'

const read = (p: string): string => readFileSync(p, 'utf-8')
const datasetSkill = (): string => read(join(DATASET_DIR, 'SKILL.md'))
const datasetDefaults = (): string => read(join(DATASET_DIR, 'quick-mode-defaults.md'))
const mirrorSkill = (): string => read(join(MIRROR_DIR, 'SKILL.md'))
const mirrorDefaults = (): string => read(join(MIRROR_DIR, 'quick-mode-defaults.md'))

/**
 * The dataset → root-mirror transform pair (`pair update`): skill-reference
 * rewrite (`/bootstrap` → `/pair-process-bootstrap`) + SKILL.md link-path
 * rewrite. Same helper the implement/skills-guide mirror guards use.
 */
const toMirror = (text: string): string =>
  applyKnownMirrorTransforms(
    text,
    buildDatasetSkillNameMap(SKILLS_DIR),
    buildSkillLinkPathMap(SKILLS_DIR),
  )

// The flatten/prefix link-rewriter prepends `./` to a bare SAME-DIR relative
// link when the file moves (link-rewriter computeNewHref). Neutralize exactly
// that shape on both sides — a `./sub/file.md` drift still fails.
const neutralizeSameDirDotSlash = (s: string): string => s.replace(/\]\(\.\/([^/)]+)\)/g, ']($1)')

describe('prerequisite: the Guided/Quick Setup Convention exists (#276)', () => {
  it('is present in both the dataset and the root KB mirror', () => {
    expect(existsSync(join(__dirname, '../../dataset', CONVENTION_REL))).toBe(true)
    expect(existsSync(join(ROOT, CONVENTION_REL))).toBe(true)
  })

  // The convention enumerates its shipped adopters to prove "guided is always
  // the default" is false. Bootstrap is now one of them, so the enumeration
  // must name it — otherwise the convention documents a stale adopter set and
  // the next adopter reads a list that is missing the closest precedent.
  it('enumerates bootstrap among its shipped adopters, in both copies', () => {
    for (const p of [join(__dirname, '../../dataset', CONVENTION_REL), join(ROOT, CONVENTION_REL)]) {
      const c = read(p)
      expect(c).toMatch(/bootstrap/i)
      // the count of enumerated adopters must not still say "two"
      expect(c).not.toMatch(/two shipped adopters/i)
    }
  })
})

describe('bootstrap quick mode: selector + declared default (AC1/AC2)', () => {
  it('declares a $mode argument with guided as the default and quick as the opt-in', () => {
    const c = datasetSkill()
    expect(c).toMatch(/##\s*Arguments/)
    expect(c).toMatch(/\$mode/)
    // Both depths named, guided explicitly the declared default.
    expect(c).toMatch(/guided/i)
    expect(c).toMatch(/quick/i)
    expect(c).toMatch(/declared default[^.\n]*guided|guided[^.\n]*declared default/i)
  })

  it('treats an absent $mode as guided — the existing interview, unchanged (AC2)', () => {
    const c = datasetSkill().toLowerCase()
    expect(c).toMatch(/absent|omitted|without/)
    expect(c).toMatch(/additive/)
    // quick is a second resolution depth of the SAME skill, never a new skill.
    expect(c).toMatch(/no new skill|not a separate skill|same skill/)
  })

  it('reaches a first workable story with no interview in quick mode (AC1)', () => {
    const c = datasetSkill().toLowerCase()
    expect(c).toMatch(/no interview|without an interview|asks no questions/)
    expect(c).toMatch(/first workable story/)
  })
})

describe('quick mode composes the Guided/Quick Setup Convention (AC3)', () => {
  it('links the convention from SKILL.md instead of restating a resolution order', () => {
    expect(datasetSkill()).toContain('guided-quick-setup.md')
  })

  it('states explicitly that no bespoke Quickstart resolution exists', () => {
    const c = `${datasetSkill()}\n${datasetDefaults()}`.toLowerCase()
    expect(c).toMatch(/no bespoke|never a bespoke|not a bespoke/)
  })

  it('names the four convention cascade tiers as bootstrap sources (per-adopter delta)', () => {
    const c = datasetDefaults()
    expect(c).toContain('guided-quick-setup.md')
    const low = c.toLowerCase()
    expect(low).toMatch(/explicit argument/)
    expect(low).toMatch(/project state/)
    expect(low).toMatch(/preferences/)
    expect(low).toMatch(/fallback/)
    // the KB fallback tier is the bootstrap checklist's per-type defaults,
    // not a value invented here.
    expect(c).toContain('bootstrap-checklist.md')
  })

  it('keeps the selector direction of the convention (explicit signal ⇒ non-default depth)', () => {
    const c = datasetDefaults().toLowerCase()
    expect(c).toMatch(/selector/)
    expect(c).toMatch(/\$mode/)
  })
})

describe('per-decision defaultability — T1 (AC1/AC4)', () => {
  const c = (): string => datasetDefaults()

  it('is disclosed from SKILL.md as a sibling doc, not inlined', () => {
    expect(datasetSkill()).toContain('quick-mode-defaults.md')
    expect(c()).toContain('SKILL.md')
  })

  it('maps every bootstrap decision point to a resolution, phase by phase', () => {
    const doc = c()
    for (const anchor of [
      'PRD',
      'categoriz',
      'assess-',
      'quality gate',
      'PM tool',
      'domain model',
    ]) {
      expect(doc.toLowerCase()).toContain(anchor.toLowerCase())
    }
  })

  it('still asks the decisions with no safe KB default (PM tool, stack when undetectable)', () => {
    const doc = c().toLowerCase()
    expect(doc).toMatch(/still ask/)
    expect(doc).toMatch(/pm tool/)
    expect(doc).toMatch(/tech stack|stack/)
    // reduces questions to the genuinely-defaultable ones, never eliminates all.
    expect(doc).toMatch(/does not eliminate|never eliminates|not eliminate/)
  })

  it('writes the same adoption files guided mode would, in the same format (AC4)', () => {
    const doc = `${datasetSkill()}\n${c()}`.toLowerCase()
    expect(doc).toMatch(/normal adoption file/)
    expect(doc).toMatch(/no quick-mode-only|never a quick-mode-only|same shape/)
  })
})

describe('edge cases (#278)', () => {
  it('confirms rather than overwrites an already-configured project', () => {
    const c = `${datasetSkill()}\n${datasetDefaults()}`.toLowerCase()
    expect(c).toMatch(/confirm.*rather than overwrit|never overwrit/)
  })

  it('applies the convention non-interactive safety rule (no TTY can never run guided)', () => {
    const c = `${datasetSkill()}\n${datasetDefaults()}`
    expect(c.toLowerCase()).toMatch(/tty/)
    expect(c.toLowerCase()).toMatch(/never hang|without hanging|never wait/)
  })

  it('HALTs when a non-defaultable input can neither be resolved nor asked', () => {
    const c = datasetSkill()
    expect(c).toContain('HALT')
    expect(c.toLowerCase()).toMatch(/non-defaultable|cannot be asked|cannot be resolved/)
  })
})

describe('no regression on the guided path (AC2)', () => {
  const c = datasetSkill()

  it('keeps every guided phase/step anchor intact', () => {
    for (const anchor of [
      /Phase 0: PRD Verification \(BLOCKING\)/,
      /Step 1\.2: Categorize Project/,
      /Step 2\.2: Assessment Phase \(Optional\)/,
      /Step 2\.3: Gather Information per Section/,
      /Step 3\.1: Generate Adoption Documents/,
      /Step 3\.2: Quality Gate Setup/,
      /Phase 3\.5: Domain Modeling/,
      /Step 4\.2: PM Tool Configuration/,
      /Step 4\.3: Final Summary/,
    ]) {
      expect(c).toMatch(anchor)
    }
  })

  it('keeps the guided questions themselves (they are the guided depth)', () => {
    expect(c).toMatch(/Does this categorization match your project\?/)
    expect(c).toMatch(/Do you want custom quality gates beyond the standard pipeline\?/)
    expect(c).toMatch(/Ask 3-4 focused questions per section/)
  })

  it('reports the resolved depth in the output format', () => {
    expect(c).toMatch(/Mode:\s*\[?\s*guided/i)
  })
})

describe('root mirror is in sync with the dataset (pair update)', () => {
  it('SKILL.md equals the dataset run through the real transform', () => {
    const expected = toMirror(
      syncFrontmatter(datasetSkill(), { from: 'bootstrap', to: 'pair-process-bootstrap' }),
    )
    expect(neutralizeSameDirDotSlash(mirrorSkill())).toBe(neutralizeSameDirDotSlash(expected))
  })

  it('the disclosed sibling doc is ported too (frontmatter-free, same transform)', () => {
    expect(existsSync(join(MIRROR_DIR, 'quick-mode-defaults.md'))).toBe(true)
    expect(neutralizeSameDirDotSlash(mirrorDefaults())).toBe(
      neutralizeSameDirDotSlash(toMirror(datasetDefaults())),
    )
  })

  it('the mirror references prefixed skill names', () => {
    expect(mirrorSkill()).toMatch(/\/pair-capability-setup-pm\b/)
    expect(mirrorDefaults()).toMatch(/\/pair-capability-setup-gates\b|\/pair-capability-setup-pm\b/)
  })
})

describe('timed onboarding scenario + docs (AC1, DoD)', () => {
  const CP = join(ROOT, 'qa/release-validation/CP9-quickstart-onboarding.md')
  const DOC = join(ROOT, 'apps/website/content/docs/getting-started/bootstrap-quick-mode.mdx')

  it('adds a reproducible timed critical path with the <10 minute target', () => {
    expect(existsSync(CP)).toBe(true)
    const c = read(CP)
    expect(c).toMatch(/10\s*min/i)
    // reproducible: outside-the-repo workdir + explicit stopwatch steps.
    expect(c).toContain('$WORKDIR')
    expect(c.toLowerCase()).toMatch(/elapsed|stopwatch|timer/)
  })

  it('covers the guided-mode regression in the same critical path (AC2)', () => {
    expect(read(CP).toLowerCase()).toMatch(/guided/)
  })

  it('registers the critical path in the suite index', () => {
    expect(read(join(ROOT, 'qa/release-validation/README.md'))).toContain(
      'CP9-quickstart-onboarding.md',
    )
  })

  it('documents quick mode on the docs site and registers the page in nav', () => {
    expect(existsSync(DOC)).toBe(true)
    const doc = read(DOC)
    expect(doc).toMatch(/\$mode\s*[:=]\s*quick/)
    expect(doc.toLowerCase()).toMatch(/guided/)
    const meta = read(join(ROOT, 'apps/website/content/docs/getting-started/meta.json'))
    expect(meta).toContain('bootstrap-quick-mode')
  })
})

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
 * The dataset → root-mirror transform pair (`pair-cli update`): skill-reference
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
    for (const p of [
      join(__dirname, '../../dataset', CONVENTION_REL),
      join(ROOT, CONVENTION_REL),
    ]) {
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

/**
 * Split SKILL.md into `### Step x.y` sections (heading + body up to the next
 * `##`/`###` heading), so a quick-mode note can be asserted WHERE it belongs
 * rather than anywhere in the file.
 */
const stepSections = (skill: string): Map<string, string> => {
  const out = new Map<string, string>()
  const lines = skill.split('\n')
  let current: string | null = null
  let buf: string[] = []
  const flush = (): void => {
    if (current) out.set(current, buf.join('\n'))
  }
  for (const line of lines) {
    const m = /^###\s+Step\s+([0-9.]+):/.exec(line)
    if (m) {
      flush()
      current = m[1].replace(/\.$/, '')
      buf = [line]
      continue
    }
    if (/^##\s/.test(line)) {
      flush()
      current = null
      buf = []
      continue
    }
    if (current) buf.push(line)
  }
  flush()
  return out
}

// A step is question-bearing if its own text interviews the developer: a
// blockquote line ending in a question, an explicit "ask N questions" rule, or
// a present-and-approve round. Those are exactly the steps quick mode has to
// say something about — and the derivation makes a FUTURE interview step fail
// this guard unless its author adds the note too.
//
// The last two shapes are the ones Step 4.3 itself uses ("…for final approval",
// "**Verify**: Developer approves"): without them a future approval gate written
// in Step 4.3's own phrasing would land with no quick-mode note and stay green.
const INTERVIEW_MARKERS = [
  /^\s*>.*\?\s*$/m,
  /Ask \d+(-\d+)? focused questions/i,
  /for developer review/i,
  /until approved/i,
  /for (final )?approval/i,
  /Developer approves/i,
]

describe('quick mode is declared where the questions are (AC1)', () => {
  const sections = stepSections(datasetSkill())

  it('finds the guided step sections it is supposed to check', () => {
    for (const step of ['1.2', '2.2', '2.3', '3.1', '3.2', '4.2', '4.3']) {
      expect(sections.has(step), `Step ${step} section not found`).toBe(true)
    }
  })

  it('carries a `**Quick mode**:` note in EVERY question-bearing step', () => {
    const missing: string[] = []
    for (const [step, body] of sections) {
      const interviews = INTERVIEW_MARKERS.some(re => re.test(body))
      if (interviews && !/\*\*Quick mode\*\*/.test(body)) missing.push(step)
    }
    expect(
      missing,
      `question-bearing steps with no quick-mode note: ${missing.join(', ')}`,
    ).toEqual([])
  })

  it('covers the composed-assessment and finalization steps too (2.2, 4.2, 4.3)', () => {
    for (const step of ['2.2', '4.2', '4.3']) {
      expect(sections.get(step), `Step ${step}`).toMatch(/\*\*Quick mode\*\*/)
    }
  })

  it('tells composed assess-* skills to use their own quick signal (Path A $choice)', () => {
    // the assess-* family's declared default is GUIDED, so plain composition
    // would interview once per installed skill.
    expect(sections.get('2.2')).toMatch(/\$choice/)
    expect(sections.get('2.2')?.toLowerCase()).toMatch(/path a/)
  })

  // Path A is `$choice` PLUS a confirmation round (resolution-cascade.md steps
  // 3-4), and each assess-* skill declares its own prompt for it. Naming Path A
  // without suppressing that round would put up to EIGHT confirmations
  // (assess-orchestration.md sequences eight skills) inside a depth that claims
  // to ask nothing.
  //
  // #410 changed WHERE that is fixed. It used to be a caller-side deviation
  // disclosed here, per composed family — a shape that structurally cannot see
  // the next composed skill that asks, which is why the same defect landed twice
  // in two review rounds of #408 (round 2: assess-*, round 3: map-*). Bootstrap
  // now passes ONE signal, `$approval: auto`, and every composed skill honours it
  // (ADR-021, skill-conventions/approval-rounds.md; the per-skill obligation is
  // guarded by src/conformance/approval-signal.test.ts and the skills:conformance
  // gate). So these assertions pin the SIGNAL being passed, and pin that the
  // retired disclosures do not creep back as a second mechanism.
  it('passes the non-interactive signal to the composed assess-* family in quick mode', () => {
    const step = sections.get('2.2') ?? ''
    expect(step).toMatch(/\$approval: auto/)
    expect(step).toContain('approval-rounds.md')
    // The old shape: a round declared "not run" by the caller. One signal replaced
    // it; two mechanisms for one thing is how they drift apart.
    expect(step).not.toMatch(/confirmation round[^.]*not run|not run[^.]*confirmation round/i)
  })

  /**
   * Round 7, Minor 2: this lookup used to be
   * `sections.get('3.5.2') ?? sections.get('3.5') ?? datasetSkill()` — a chain that
   * DEGRADES to grepping the whole file when the section is not pinned. Renaming the
   * heading and reverting the note to the retired caller-side shape kept the suite
   * green: the file-wide fallback found `$approval: auto` in Step 2.2 instead. A
   * lookup that cannot find its section must fail, not widen (the fail-closed rule in
   * `approval-rounds.md` § Authoring obligation).
   */
  const domainModelingSection = (): string => {
    const section = sections.get('3.5.2') ?? sections.get('3.5')
    if (section === undefined) {
      throw new Error(
        `bootstrap SKILL.md has no Step 3.5.2 / Phase 3.5 section — the pin cannot ` +
          `fall back to the whole file: ${[...sections.keys()].join(', ')}`,
      )
    }
    return section
  }

  it('passes the same one signal to the composed map-* family (Phase 3.5)', () => {
    const step = domainModelingSection()
    expect(step).toMatch(/\$approval: auto/)
    expect(step).toMatch(/map-\\?\*/)
  })

  it('retires deviations 2 and 3, and says why the disclosure shrank', () => {
    const defaults = datasetDefaults()
    // One deviation left — the explicit-`guided` no-op — and the count is stated
    // in prose, so a new deviation cannot be slipped in silently.
    expect(defaults).toMatch(/##\s*Disclosed deviations/)
    expect(defaults).toMatch(/One, deliberate/i)
    expect(defaults).not.toMatch(/Three, all deliberate/i)
    expect(defaults.toLowerCase()).toMatch(/loud no-op/)
    // The retirement is recorded, not silent: a reader of the old note must find
    // out where the mechanism went.
    expect(defaults).toMatch(/Two deviations were retired/i)
    expect(defaults).toMatch(/\$approval: auto/)
    expect(defaults).not.toMatch(/approval round is not run/i)
  })

  // The one gate quick mode deliberately KEEPS (#278), now surviving BY THE
  // MECHANISM rather than by an exception bootstrap has to remember: a judgement
  // gate is never resolved by `auto`. Asserted here too, because "quick mode asks
  // nothing at all" is exactly the change that would swallow it — accepting an
  // unbalanced + volatile relationship without a judgement writes a domain model
  // recording a coupling risk nobody approved.
  it('keeps the unbalanced+volatile HALT even in quick mode, and says so', () => {
    const defaults = datasetDefaults()
    expect(defaults).toMatch(/unbalanced \+ volatile/i)
    expect(defaults.toLowerCase()).not.toMatch(/phase 3\.5[^|\n]*never blocking\s*\|/)
    expect(defaults).toMatch(/judgement gate `auto` does not resolve/i)
    expect(domainModelingSection()).toMatch(/judgement gate, which `auto` never resolves/i)
  })

  it('qualifies the approval-round HALT conditions as guided-only', () => {
    const halt = datasetSkill().split('## HALT Conditions')[1] ?? ''
    expect(halt).toMatch(/Adoption file generation rejected[^\n]*guided only/i)
    expect(halt).toMatch(/Project categorization rejected[^\n]*guided only/i)
  })
})

describe('the fallback tier points at a KB anchor that exists (AC3)', () => {
  const CHECKLIST_REL = '.pair/knowledge/assets/bootstrap-checklist.md'
  const ANCHOR = '## Quick-Mode Per-Project-Type Defaults'

  it('bootstrap-checklist.md carries the per-project-type defaults table, in both copies', () => {
    for (const p of [join(ROOT, CHECKLIST_REL), join(__dirname, '../../dataset', CHECKLIST_REL)]) {
      const c = read(p)
      expect(c).toContain(ANCHOR)
      // one column per project type, and the rows quick mode resolves from
      expect(c).toMatch(/Type A[^|]*\|[^|]*Type B[^|]*\|[^|]*Type C/)
      for (const row of [
        'Architecture — style',
        'Infrastructure —',
        'UX/UI',
        'Way of Working —',
        // tech-stack.md's testing and AI sections are SEPARATE assess-*
        // invocations (assess-orchestration.md), each needing its own resolved
        // value — without these rows quick mode has nothing to resolve them
        // from and must either invent a value or ask.
        'Testing — strategy',
        'AI development tooling',
      ]) {
        expect(c, `${p}: missing fallback row ${row}`).toContain(row)
      }
      // and it must NOT invent the non-defaultable ones
      expect(c).toMatch(/Deliberately absent from this table/)
    }
  })

  it('names that anchor as the fallback source instead of the asset as a whole', () => {
    const c = `${datasetSkill()}\n${datasetDefaults()}`
    expect(c).toContain('Quick-Mode Per-Project-Type Defaults')
    // the worked examples are explicitly ruled out as a default source
    expect(c).toMatch(/Context-Specific Examples/)
  })

  // Eight assess-* invocations, not five sections: the testing and the AI
  // section of tech-stack.md are their own skills. Quick mode must say where
  // each resolves from, or "at most two questions" is not true.
  it('resolves the testing and AI sections of tech-stack.md without a question', () => {
    const doc = datasetDefaults()
    expect(doc).toMatch(/testing section of `tech-stack\.md`/i)
    expect(doc).toMatch(/AI section of `tech-stack\.md`/i)
    expect(doc).toContain('Testing — strategy')
    expect(doc).toContain('AI development tooling')
    // and the still-asked list stays at ONE stack question, not three
    expect(doc).toMatch(/one\*\* question, not three|one question, not three/i)
  })

  it('keeps the cascade tiers disjoint — decision-log belongs to preferences only', () => {
    const defaults = datasetDefaults()
    expect(defaults).toMatch(/excluding[^|]*decision-log/i)
  })
})

describe('the PRD is a precondition, not a quick-mode default (AC1)', () => {
  it('SKILL.md and the defaults doc both say so', () => {
    for (const c of [datasetSkill(), datasetDefaults()]) {
      expect(c.toLowerCase()).toMatch(/precondition/)
      expect(c).toMatch(/PRD/)
    }
  })

  it('the timed critical path authors the PRD outside the stopwatch', () => {
    const cp = read(join(ROOT, 'qa/release-validation/CP9-quickstart-onboarding.md'))
    expect(cp).toMatch(/outside\s+the\s+stopwatch/i)
    expect(cp).toMatch(/PRD/)
    // two splits, so a slow run names the phase that caused it
    expect(cp.toLowerCase()).toMatch(/bootstrap-elapsed/)
    expect(cp.toLowerCase()).toMatch(/story-elapsed/)
  })

  it('the docs page states the same precondition', () => {
    const doc = read(
      join(ROOT, 'apps/website/content/docs/getting-started/bootstrap-quick-mode.mdx'),
    )
    expect(doc.toLowerCase()).toMatch(/precondition/)
    expect(doc).toMatch(/PRD/)
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

  // the guided Step 2.3 list is one list: all five items bold. Two of them
  // drifted to `*`code`*` in a quick-mode commit, which is exactly the kind of
  // silent edit to guided-path text AC2 exists to prevent.
  it('keeps the Step 2.3 section list in a single emphasis style', () => {
    const step = stepSections(c).get('2.3') ?? ''
    for (const item of [
      '**Architecture**',
      '**Tech Stack**',
      '**Infrastructure**',
      '**UX/UI**',
      '**Way of Working**',
    ]) {
      expect(step, `Step 2.3 list item ${item}`).toContain(item)
    }
  })
})

describe('root mirror is in sync with the dataset (pair-cli update)', () => {
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

  // landing.e2e.test.ts walks Quickstart's footer `next` link and asserts it
  // lands on Quickstart: Solo. Inserting a page BETWEEN them would still pass
  // that test (its locator resolves the sidebar link) while silently voiding
  // the prev/next guarantee it exists to check — so pin the order here, in the
  // local gate, where e2e ordering is not otherwise observable.
  it('sits after the quickstart-{solo,team,org} trio in nav order', () => {
    const pages: string[] = JSON.parse(
      read(join(ROOT, 'apps/website/content/docs/getting-started/meta.json')),
    ).pages
    expect(pages[pages.indexOf('quickstart') + 1]).toBe('quickstart-solo')
    expect(pages.indexOf('bootstrap-quick-mode')).toBeGreaterThan(pages.indexOf('quickstart-org'))
  })

  it('is cross-linked from the Getting Started index (DoD)', () => {
    const index = read(join(ROOT, 'apps/website/content/docs/getting-started/index.mdx'))
    expect(index).toContain('/docs/getting-started/bootstrap-quick-mode')
  })
})

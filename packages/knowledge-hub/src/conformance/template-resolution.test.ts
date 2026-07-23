import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { join, relative } from 'path'
import { collectSkillFiles, collectSkillMarkdownFiles } from '../tools/skills-conformance-check'

// Conformance guard for story #314: the template-override mechanism the docs
// describe (`.pair/adoption/tech/templates/<name>-template.md` shadows the KB
// default) must actually be wired into the skills. Every SKILL.md that links a
// collaboration template must resolve it override-first, via the single shared
// `template-resolution.md` convention — not by hardcoding the KB path alone.

const DATASET_SKILLS = join(__dirname, '../../dataset/.skills')
const CONVENTIONS = join(__dirname, '../../dataset/.pair/knowledge/skill-conventions')
const MIRROR = join(__dirname, '../../../../.claude/skills')
// The guidelines corpus (dataset source + generated repo root) — the skills scan
// above never sees it, yet a template use-site lives here (context-map-maintenance.md,
// Major #2). Both roots are byte-consistent mirrors; scan both.
const DATASET_GUIDELINES = join(__dirname, '../../dataset/.pair/knowledge/guidelines')
const ROOT_GUIDELINES = join(__dirname, '../../../../.pair/knowledge/guidelines')

const CONVENTION_FILE = join(CONVENTIONS, 'template-resolution.md')
const CONVENTION = readFileSync(CONVENTION_FILE, 'utf-8')
const CONVENTION_README = readFileSync(join(CONVENTIONS, 'README.md'), 'utf-8')

const POINTER = /template-resolution\.md/
// A collaboration-template link: .../collaboration/templates/<name>-template.md
const TEMPLATE_LINK = /collaboration\/templates\/[a-z0-9-]*template\.md/

/**
 * Every Markdown file under a corpus root that links at least one collaboration
 * template. Walks all `.md`, not just SKILL.md, so template links in disclosed
 * skill files (merge-and-cascade.md, post-review-merge.md, …) AND in the
 * guidelines corpus (context-map-maintenance.md) cannot escape the pointer
 * invariant (story #314). `collectSkillMarkdownFiles` is a generic recursive
 * `.md` walker — reused here for both the skills and guidelines trees.
 */
function templateLinkingFiles(root: string): { rel: string; content: string }[] {
  return collectSkillMarkdownFiles(root)
    .map(f => ({ rel: relative(root, f), content: readFileSync(f, 'utf-8') }))
    .filter(({ content }) => TEMPLATE_LINK.test(content))
}

/** Same, but SKILL.md files only — used for the "wired skill count" invariant. */
function templateLinkingSkills(skillsRoot: string): { rel: string; content: string }[] {
  return collectSkillFiles(skillsRoot)
    .map(f => ({ rel: relative(skillsRoot, f), content: readFileSync(f, 'utf-8') }))
    .filter(({ content }) => TEMPLATE_LINK.test(content))
}

describe('template-resolution.md — shared convention (AC1, AC3, AC4)', () => {
  it('is registered in the skill-conventions README', () => {
    expect(CONVENTION_README).toMatch(POINTER)
  })

  it('resolves via a file-existence check on the adoption override path (AC3)', () => {
    expect(CONVENTION).toMatch(/\.pair\/adoption\/tech\/templates\/<name>-template\.md/)
    expect(CONVENTION.toLowerCase()).toMatch(/file-existence check/)
    expect(CONVENTION.toLowerCase()).toMatch(/exist/)
  })

  it('falls back to the KB default path when no override is present (AC1 — zero behavior change)', () => {
    expect(CONVENTION).toMatch(
      /\.pair\/knowledge\/guidelines\/collaboration\/templates\/<name>-template\.md/,
    )
    expect(CONVENTION.toLowerCase()).toMatch(/zero behavior change/)
    expect(CONVENTION.toLowerCase()).toMatch(/idempotent/)
  })

  it('states the adoption override always wins, whole, over the KB default (AC2 semantics)', () => {
    expect(CONVENTION.toLowerCase()).toMatch(/always wins/)
    expect(CONVENTION.toLowerCase()).toMatch(/no partial\/hybrid/)
  })

  it('documents way-of-working `## Templates` as an audit trail, NOT the resolution trigger (AC4)', () => {
    expect(CONVENTION).toMatch(/## Templates/)
    expect(CONVENTION.toLowerCase()).toMatch(/audit trail/)
    expect(CONVENTION.toLowerCase()).toMatch(/not the resolution trigger/)
  })

  it('handles the edge cases (malformed/empty override used as-is; unknown filename silently unused)', () => {
    expect(CONVENTION.toLowerCase()).toMatch(/malformed\/empty/)
    expect(CONVENTION.toLowerCase()).toMatch(/silently unused/)
  })
})

describe('every template-linking skill file carries the resolution pointer (AC3)', () => {
  it('dataset: no skill file (SKILL.md or disclosed .md) links a collaboration template without the resolution pointer', () => {
    const offenders = templateLinkingFiles(DATASET_SKILLS)
      .filter(({ content }) => !POINTER.test(content))
      .map(({ rel }) => rel)
    expect(offenders).toEqual([])
  })

  it('dataset: at least 15 SKILL.md link collaboration templates (the wired set)', () => {
    expect(templateLinkingSkills(DATASET_SKILLS).length).toBeGreaterThanOrEqual(15)
  })

  it('installed mirror: no skill file links a collaboration template without the resolution pointer', () => {
    const offenders = templateLinkingFiles(MIRROR)
      .filter(({ content }) => !POINTER.test(content))
      .map(({ rel }) => rel)
    expect(offenders).toEqual([])
  })
})

// AC2: verified for at least one process-composed template and one capability-composed template.
describe('AC2 — key template consumers resolve override-first (dataset + mirror)', () => {
  const cases: { dataset: string; mirror: string; label: string }[] = [
    {
      dataset: 'process/implement',
      mirror: 'pair-process-implement',
      label: 'commit-template via /implement',
    },
    {
      dataset: 'capability/publish-pr',
      mirror: 'pair-capability-publish-pr',
      label: 'pr-template via /publish-pr',
    },
    {
      dataset: 'capability/record-decision',
      mirror: 'pair-capability-record-decision',
      label: 'adr/adl/ddr-template via /record-decision',
    },
  ]

  it.each(cases)('$label carries the pointer in the dataset skill', ({ dataset }) => {
    const content = readFileSync(join(DATASET_SKILLS, dataset, 'SKILL.md'), 'utf-8')
    expect(content).toMatch(TEMPLATE_LINK)
    expect(content).toMatch(POINTER)
  })

  it.each(cases)('$label carries the pointer in the installed mirror', ({ mirror }) => {
    const content = readFileSync(join(MIRROR, mirror, 'SKILL.md'), 'utf-8')
    expect(content).toMatch(TEMPLATE_LINK)
    expect(content).toMatch(POINTER)
  })
})

// Major #2 blind-spot: the resolution fix also lives in the guidelines corpus
// (context-map-maintenance.md), which the skills scan never reaches. Same
// invariant applied to the guidelines tree (dataset + generated root) so a
// regression that drops the pointer from a guideline's template use-site fails.
describe('every template-linking guideline carries the resolution pointer (AC5, Major #2)', () => {
  const guidelineRoots: { root: string; label: string }[] = [
    { root: DATASET_GUIDELINES, label: 'dataset' },
    { root: ROOT_GUIDELINES, label: 'generated root' },
  ]
  const CONTEXT_MAP_GUIDELINE = join(
    'architecture',
    'design-patterns',
    'context-map-maintenance.md',
  )

  it.each(guidelineRoots)(
    '$label: no guideline links a collaboration template without the resolution pointer',
    ({ root }) => {
      const offenders = templateLinkingFiles(root)
        .filter(({ content }) => !POINTER.test(content))
        .map(({ rel }) => rel)
      expect(offenders).toEqual([])
    },
  )

  it.each(guidelineRoots)(
    '$label: context-map-maintenance.md is actually reached by the scan (guards the Major #2 fix)',
    ({ root }) => {
      const scanned = templateLinkingFiles(root).map(({ rel }) => rel)
      expect(scanned).toContain(CONTEXT_MAP_GUIDELINE)
    },
  )
})

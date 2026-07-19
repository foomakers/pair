import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { join } from 'path'
import { rewriteSkillReferences, rewriteSkillLinkPaths } from '@pair/content-ops'
import {
  collectSkillDirs,
  buildDatasetSkillNameMap,
  buildSkillLinkPathMap,
  applyKnownMirrorTransforms,
  extractLineContaining,
} from './skills-guide-mirror'

// packages/knowledge-hub/src/tools -> repo root
const REPO_ROOT = join(__dirname, '..', '..', '..', '..')
const DATASET_SKILLS_GUIDE = join(
  REPO_ROOT,
  'packages/knowledge-hub/dataset/.pair/knowledge/skills-guide.md',
)
const ROOT_MIRROR_SKILLS_GUIDE = join(REPO_ROOT, '.pair/knowledge/skills-guide.md')
const SKILLS_DIR = join(REPO_ROOT, 'packages/knowledge-hub/dataset/.skills')

describe('collectSkillDirs', () => {
  it('finds every skill directory under the dataset .skills tree', () => {
    const dirs = collectSkillDirs(SKILLS_DIR)
    expect(dirs).toContain('capability/map-subdomains')
    expect(dirs).toContain('capability/map-contexts')
    expect(dirs).toContain('process/refine-story')
    expect(dirs).toContain('next')
  })
})

describe('buildDatasetSkillNameMap', () => {
  it('maps short skill names to their real installed prefixed names', () => {
    const map = buildDatasetSkillNameMap(SKILLS_DIR)
    expect(map.get('map-subdomains')).toBe('pair-capability-map-subdomains')
    expect(map.get('map-contexts')).toBe('pair-capability-map-contexts')
    expect(map.get('refine-story')).toBe('pair-process-refine-story')
    expect(map.get('next')).toBe('pair-next')
  })
})

describe('buildSkillLinkPathMap', () => {
  it('maps dataset-source SKILL.md links to their installed-path equivalents', () => {
    const map = buildSkillLinkPathMap(SKILLS_DIR)
    expect(map.get('../.skills/capability/map-subdomains/SKILL.md')).toBe(
      '../.claude/skills/pair-capability-map-subdomains/SKILL.md',
    )
    expect(map.get('../.skills/capability/map-contexts/SKILL.md')).toBe(
      '../.claude/skills/pair-capability-map-contexts/SKILL.md',
    )
  })

  it('excludes bare top-level directories with no category (e.g. next)', () => {
    const map = buildSkillLinkPathMap(SKILLS_DIR)
    for (const key of map.keys()) {
      expect(key).not.toContain('/next/')
    }
  })
})

/**
 * These 5 anchors pin the exact paragraphs that have twice drifted between
 * the canonical dataset file and the root mirror (flagged in PR #319's
 * review, fixed again in PR #336's description item 3 — see that PR body's
 * "genuine content drift" list). Each is unaffected by the two documented
 * mechanical-transform exceptions (see `skills-guide-mirror.ts` module
 * docs), so applying the real skill-name-prefix + SKILL.md-link transform to
 * the dataset's version of the line must exactly reproduce the root
 * mirror's version — any future drift on these lines fails this test.
 *
 * Kept alongside the whole-file test below (not replaced by it): on
 * failure, a per-anchor mismatch pinpoints the exact paragraph and expected
 * line, which is a far faster first diagnosis than a whole-file diff.
 */
const CRITICAL_SECTION_ANCHORS = [
  'How-to guides 04 and 05',
  'Functional/domain analysis',
  'Technical analysis',
  'is a real composition, verified against',
  'No standalone process step or how-to remains for domain mapping',
] as const

describe('skills-guide.md dataset <-> root mirror consistency (critical sections)', () => {
  const datasetContent = readFileSync(DATASET_SKILLS_GUIDE, 'utf-8')
  const rootContent = readFileSync(ROOT_MIRROR_SKILLS_GUIDE, 'utf-8')
  const skillNameMap = buildDatasetSkillNameMap(SKILLS_DIR)
  const linkPathMap = buildSkillLinkPathMap(SKILLS_DIR)

  it.each(CRITICAL_SECTION_ANCHORS)('anchor %j is present in both files', anchor => {
    expect(() => extractLineContaining(datasetContent, anchor)).not.toThrow()
    expect(() => extractLineContaining(rootContent, anchor)).not.toThrow()
  })

  it.each(CRITICAL_SECTION_ANCHORS)(
    'root mirror line for anchor %j matches the dataset line run through the real transform',
    anchor => {
      const datasetLine = extractLineContaining(datasetContent, anchor)
      const rootLine = extractLineContaining(rootContent, anchor)
      const expectedLine = applyKnownMirrorTransforms(datasetLine, skillNameMap, linkPathMap)

      // If this fails, `.pair/knowledge/skills-guide.md` has drifted from
      // the canonical dataset file on this specific paragraph — this exact
      // class of drift has happened twice before. Reconcile the root mirror
      // line to `expectedLine` (or update this anchor/transform if the
      // real content legitimately changed).
      expect(rootLine).toBe(expectedLine)
    },
  )
})

/**
 * Whole-file coverage: applies the REAL content-ops transform
 * (`rewriteSkillReferences` + `rewriteSkillLinkPaths`) — the exact pair the
 * `pair update` pipeline runs — to the ENTIRE dataset content, with NO manual
 * exceptions. The dataset file is authored to be transform-correct (prefixed
 * Composition Pattern diagram; slash-free self-referential "Unprefixed dataset
 * command names" phrases), so this reproduces the root mirror byte-for-byte.
 * If the root mirror has drifted ANYWHERE — not just on the 5 anchored
 * paragraphs above — this fails.
 *
 * On failure, check the targeted-anchor tests above first: if one of them
 * also fails, its message pinpoints the paragraph directly. If only this
 * test fails, the drift is somewhere else in the file — regenerate the root
 * mirror with `node apps/pair-cli/dist/cli.js update` (or, if the dataset
 * itself has a transform-incorrect span, fix the dataset so the mechanical
 * transform reproduces the intended installed output).
 */
describe('skills-guide.md dataset <-> root mirror consistency (whole file)', () => {
  it('root mirror is byte-for-byte reproducible from the dataset via the real content-ops transform', () => {
    const datasetContent = readFileSync(DATASET_SKILLS_GUIDE, 'utf-8')
    const rootContent = readFileSync(ROOT_MIRROR_SKILLS_GUIDE, 'utf-8')
    const skillNameMap = buildDatasetSkillNameMap(SKILLS_DIR)
    const linkPathMap = buildSkillLinkPathMap(SKILLS_DIR)

    const reconstructed = rewriteSkillLinkPaths(
      rewriteSkillReferences(datasetContent, skillNameMap),
      linkPathMap,
    )

    // If this fails, `.pair/knowledge/skills-guide.md` has drifted from the
    // canonical dataset file's real transform output. Regenerate the root
    // mirror via `pair update`.
    expect(reconstructed).toBe(rootContent)
  })
})

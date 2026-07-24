import { describe, it, expect, beforeAll } from 'vitest'
import { existsSync, readdirSync, readFileSync } from 'fs'
import { join } from 'path'
import {
  readSkillsDatasetFromDisk,
  datasetSkillDirs,
  installedSkillDir,
  buildInstalledSkillMd,
  assertRootSkillMdMatches,
  diffSkillMd,
  type DatasetTree,
} from './skill-md-mirror'

// packages/knowledge-hub/src/tools -> repo root
const REPO_ROOT = join(__dirname, '..', '..', '..', '..')
const DATASET_SKILLS = join(REPO_ROOT, 'packages/knowledge-hub/dataset/.skills')
const ROOT_CLAUDE_SKILLS = join(REPO_ROOT, '.claude/skills')

const rootMirrorContent = (prefixed: string): string | undefined => {
  const p = join(ROOT_CLAUDE_SKILLS, prefixed, 'SKILL.md')
  return existsSync(p) ? readFileSync(p, 'utf-8') : undefined
}

/** Runs `fn`, expecting it to throw, and returns the thrown Error's message. */
const captureThrownMessage = (fn: () => void): string => {
  try {
    fn()
  } catch (err) {
    return (err as Error).message
  }
  throw new Error('expected the assertion to throw, but it did not')
}

/**
 * Data-driven mirror-equality guard: for EVERY skill dir in the dataset,
 * asserts the root `.claude/skills/<prefixed>/SKILL.md` is byte-for-byte the
 * real `pair update` copy-pipeline transform of its dataset source. The case
 * list is derived from the dataset at collection time, so a newly added skill
 * is covered automatically with no test edit (AC5) — never a hardcoded count.
 */
describe('per-skill SKILL.md dataset -> root mirror equality (data-driven)', () => {
  const tree = readSkillsDatasetFromDisk(DATASET_SKILLS)
  const skillDirs = datasetSkillDirs(tree)
  let installed: Map<string, string>

  beforeAll(async () => {
    installed = await buildInstalledSkillMd(tree)
  })

  it('discovers dataset skill dirs directly from disk (no hardcoded count)', () => {
    expect(skillDirs.length).toBeGreaterThan(0)
    expect(skillDirs).toContain('capability/verify-quality')
    expect(skillDirs).toContain('process/refine-story')
    expect(skillDirs).toContain('next')
  })

  it.each(skillDirs)(
    'root mirror SKILL.md for %s equals the real copy-pipeline transform',
    datasetDir => {
      const prefixed = installedSkillDir(datasetDir)
      const expected = installed.get(prefixed)
      expect(expected, `pipeline produced no SKILL.md for ${prefixed}`).toBeDefined()

      // Throws (AC4 missing / AC2+AC3 drift) or passes. The assertion helper
      // lives in the production module so this guard and the drift-injection
      // tests below exercise the same code path.
      expect(() =>
        assertRootSkillMdMatches(prefixed, expected!, rootMirrorContent(prefixed)),
      ).not.toThrow()
    },
  )
})

/**
 * Directional (dataset -> root): the guard iterates dataset skill dirs, so a
 * root-only skill with no dataset source (e.g. `agent-browser`) is never
 * asserted and is NOT treated as drift.
 */
describe('directional guard ignores root-only skills with no dataset source', () => {
  it('agent-browser is present in the root mirror but absent from the dataset', () => {
    const rootDirs = readdirSync(ROOT_CLAUDE_SKILLS, { withFileTypes: true })
      .filter(e => e.isDirectory())
      .map(e => e.name)
    expect(rootDirs).toContain('agent-browser')

    const tree = readSkillsDatasetFromDisk(DATASET_SKILLS)
    const installedFromDataset = datasetSkillDirs(tree).map(installedSkillDir)
    expect(installedFromDataset).not.toContain('agent-browser')
  })
})

/**
 * `diffSkillMd` unit coverage: the compact line-level diff behind the drift
 * failure message (finding-2 remediation — replaces the full two-file dump).
 * Exercises each edit class directly so a large SKILL.md failure stays readable.
 */
describe('diffSkillMd — compact line-level diff', () => {
  it('shows a changed line as a - expected / + actual pair with surrounding context', () => {
    const expected = 'a\nb\nc\nd\ne'
    const actual = 'a\nb\nX\nd\ne'
    const out = diffSkillMd(expected, actual)
    expect(out).toContain('-c')
    expect(out).toContain('+X')
    expect(out).toContain(' b') // unchanged context line kept
    expect(out).toContain(' d')
  })

  it('shows pure insertions as + lines (actual longer than expected)', () => {
    const out = diffSkillMd('a\nb', 'a\nb\nc\nd')
    expect(out).toContain('+c')
    expect(out).toContain('+d')
    expect(out).not.toContain('-')
  })

  it('shows pure deletions as - lines (expected longer than actual)', () => {
    const out = diffSkillMd('a\nb\nc\nd', 'a\nb')
    expect(out).toContain('-c')
    expect(out).toContain('-d')
    expect(out).not.toContain('+')
  })

  it('collapses long runs of unchanged lines with an ellipsis marker', () => {
    const many = Array.from({ length: 30 }, (_, i) => `line${i}`).join('\n')
    const drifted = many.replace('line15', 'CHANGED')
    const out = diffSkillMd(many, drifted)
    expect(out).toContain('-line15')
    expect(out).toContain('+CHANGED')
    expect(out).toContain('…') // distant unchanged lines elided
    expect(out).not.toContain('line0\n') // far-from-change context dropped
  })

  it('returns no diff lines for identical input', () => {
    // identical input has no changed lines, so nothing is kept — only elision.
    expect(diffSkillMd('a\nb\nc', 'a\nb\nc').replace(/…/g, '').trim()).toBe('')
  })
})

/**
 * Drift-injection: proves the guard FAILS on each drift class the copy
 * transform covers, then PASSES once reconciled. A synthetic mini dataset is
 * run through the SAME real pipeline; the transformed output is then corrupted
 * to simulate a stale root mirror, and `assertRootSkillMdMatches` must throw.
 *
 * The mini fixture is authored so the real transform performs all three
 * content rewrites: frontmatter `name:` sync, relative-link-depth bump
 * (`../../` -> `../../../`, triggered by the depth-shifting bare `demo` skill),
 * and the `/command` skill-reference rewrite.
 */
describe('drift-injection: guard fails on each drift class, passes when reconciled', () => {
  const MINI: DatasetTree = {
    'demo/SKILL.md':
      '---\nname: demo\ndescription: "d"\n---\n\n# demo\n\nSee [foo](../../.pair/foo.md). Compose /verify-quality here.\n',
    'capability/verify-quality/SKILL.md': '---\nname: verify-quality\n---\n\n# vq\n',
  }
  let expected: string

  beforeAll(async () => {
    const installed = await buildInstalledSkillMd(MINI)
    expected = installed.get('pair-demo')!
  })

  it('the real transform performs all three content rewrites (fixture is meaningful)', () => {
    // frontmatter name: sync
    expect(expected).toContain('name: pair-demo')
    expect(expected).not.toContain('name: demo\n')
    // relative-link-depth bump (../../ -> ../../../)
    expect(expected).toContain('](../../../.pair/foo.md)')
    expect(expected).not.toContain('](../../.pair/foo.md)')
    // /command skill-reference rewrite
    expect(expected).toContain('/pair-capability-verify-quality')
    expect(expected).not.toContain(' /verify-quality ')
  })

  it('passes when the root mirror equals the real transform (reconciled)', () => {
    expect(() => assertRootSkillMdMatches('pair-demo', expected, expected)).not.toThrow()
  })

  it('FAILS on frontmatter name: drift (AC2), naming the skill + showing expected vs actual', () => {
    const drifted = expected.replace('name: pair-demo', 'name: demo')
    expect(() => assertRootSkillMdMatches('pair-demo', expected, drifted)).toThrow(/drifted/)

    // AC2 explicitly requires the failure to NAME the offending skill and SHOW
    // expected-vs-actual content — assert the message carries all of it, so a
    // regression that dropped the skill name or the diff dump would fail here.
    const message = captureThrownMessage(() =>
      assertRootSkillMdMatches('pair-demo', expected, drifted),
    )
    expect(message).toMatch(/pair-demo/) // names the offending skill
    expect(message).toContain('--- expected') // labelled expected side of the diff
    expect(message).toContain('+++ actual') // labelled actual side of the diff
    expect(message).toContain('-name: pair-demo') // expected content shown as a removed diff line
    expect(message).toContain('+name: demo') // drifted actual content shown as an added diff line
  })

  it('FAILS on relative-link-depth drift (AC3)', () => {
    const drifted = expected.replace('](../../../.pair/foo.md)', '](../../.pair/foo.md)')
    expect(() => assertRootSkillMdMatches('pair-demo', expected, drifted)).toThrow(/drifted/)
  })

  it('FAILS on /command skill-reference drift (AC3)', () => {
    const drifted = expected.replace('/pair-capability-verify-quality', '/verify-quality')
    expect(() => assertRootSkillMdMatches('pair-demo', expected, drifted)).toThrow(/drifted/)
  })

  it('FAILS loudly when the root mirror is missing (AC4)', () => {
    expect(() => assertRootSkillMdMatches('pair-demo', expected, undefined)).toThrow(
      /missing[\s\S]*pair update/,
    )
  })
})

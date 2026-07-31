import { describe, it, expect, beforeAll } from 'vitest'
import { existsSync, readdirSync, readFileSync } from 'fs'
import { join } from 'path'
import {
  readSkillsDatasetFromDisk,
  datasetSkillDirs,
  datasetSkillArtifacts,
  installedSkillDir,
  installedArtifactPath,
  buildInstalledArtifacts,
  assertRootArtifactMatches,
  diffSkillMd,
  SKILL_COPY_OPTS,
  type DatasetTree,
} from './skill-md-mirror'

// packages/knowledge-hub/src/tools -> repo root
const REPO_ROOT = join(__dirname, '..', '..', '..', '..')
const DATASET_SKILLS = join(REPO_ROOT, 'packages/knowledge-hub/dataset/.skills')
const ROOT_CLAUDE_SKILLS = join(REPO_ROOT, '.claude/skills')

/**
 * On-disk root mirror of a dataset artifact, or `undefined` when it is missing
 * OR unreadable — an unreadable root copy must be reported as such with its
 * path, never swallowed into a pass.
 */
const rootMirrorContent = (datasetArtifact: string): string | undefined => {
  const p = join(ROOT_CLAUDE_SKILLS, installedArtifactPath(datasetArtifact))
  if (!existsSync(p)) return undefined
  try {
    return readFileSync(p, 'utf-8')
  } catch {
    return undefined
  }
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
 * Data-driven mirror-equality guard: for EVERY markdown artifact the dataset
 * contributes — each skill's `SKILL.md` AND every sub-doc under a skill dir —
 * asserts the root `.claude/skills/<transformed path>` is byte-for-byte the real
 * `pair update` copy-pipeline transform of its dataset source. The case list is
 * derived from the dataset at collection time, so a newly added skill or
 * sub-doc is covered automatically with no test edit (AC1/AC3) — never a
 * hardcoded list and never a count.
 */
describe('dataset -> root mirror equality for every skill artifact (data-driven)', () => {
  const tree = readSkillsDatasetFromDisk(DATASET_SKILLS)
  const skillDirs = datasetSkillDirs(tree)
  const artifacts = datasetSkillArtifacts(tree)
  let mirror: Awaited<ReturnType<typeof buildInstalledArtifacts>>

  // Runs the real copy pipeline over the whole dataset (temp-dir I/O for every
  // skill), so it needs more than vitest's 10s default hookTimeout — the suite
  // shares the machine with the rest of the turbo test fan-out.
  beforeAll(async () => {
    mirror = await buildInstalledArtifacts(tree)
  }, 120_000)

  it('discovers dataset skill dirs directly from disk (no hardcoded count)', () => {
    expect(skillDirs.length).toBeGreaterThan(0)
    expect(skillDirs).toContain('capability/verify-quality')
    expect(skillDirs).toContain('process/refine-story')
    expect(skillDirs).toContain('next')
  })

  // The derivation `installedArtifactPath` uses to locate each root copy must
  // reproduce the pipeline's REAL output set exactly. Without this, a
  // path-mapping assumption (e.g. assuming a nested `references/` subdir is
  // preserved rather than flattened) would silently drop artifacts from the
  // guard: `byDatasetPath` would just lack an entry and nothing would fail.
  it('locates every artifact exactly where the pipeline actually wrote it', () => {
    expect(artifacts.map(installedArtifactPath).sort()).toEqual(mirror.producedPaths)
    expect([...mirror.byDatasetPath.keys()].sort()).toEqual(artifacts)
  })

  it.each(artifacts)('root mirror for %s equals the real copy-pipeline transform', artifact => {
    const expected = mirror.byDatasetPath.get(artifact)
    expect(expected, `pipeline produced no output for ${artifact}`).toBeDefined()

    // Throws (AC4 missing / AC2+AC3 drift) or passes. The assertion helper
    // lives in the production module so this guard and the drift-injection
    // tests below exercise the same code path.
    expect(() =>
      assertRootArtifactMatches(artifact, expected!, rootMirrorContent(artifact)),
    ).not.toThrow()
  })
})

/**
 * Directional (dataset -> root): the guard iterates DATASET artifacts, so a
 * root-only file with no dataset source is never asserted and is NOT treated as
 * drift — whether it is a whole root-only skill (`agent-browser`) or a stray
 * extra file inside an otherwise dataset-backed skill dir (AC5).
 */
describe('directional guard ignores root-only artifacts with no dataset source', () => {
  it('enumerates ONLY the dataset-derived expected set, never a root-only skill', async () => {
    // Synthetic dataset that deliberately does NOT contain `agent-browser` (a real root-only skill).
    const tree: DatasetTree = {
      'capability/verify-quality/SKILL.md': '---\nname: verify-quality\n---\n\n# vq\n',
      'next/SKILL.md': '---\nname: next\n---\n\n# next\n',
    }
    // Exercise the guard's actual expected-set construction (not filesystem facts):
    const expectedPaths = datasetSkillArtifacts(tree).map(installedArtifactPath)
    const { producedPaths } = await buildInstalledArtifacts(tree)

    // The guard will assert on EXACTLY these dataset-derived paths — the iteration
    // domain is dataset -> root, so a root-only skill name is structurally never checked.
    expect(expectedPaths.slice().sort()).toEqual(producedPaths)
    expect(expectedPaths).toContain('pair-capability-verify-quality/SKILL.md')
    expect(expectedPaths.some(p => p.startsWith('agent-browser/'))).toBe(false)

    // The real root DOES carry agent-browser, yet the dataset-derived expected set above never
    // enumerates it (proving direction) while dataset skills DO mirror into the root.
    const rootDirs = readdirSync(ROOT_CLAUDE_SKILLS, { withFileTypes: true })
      .filter(e => e.isDirectory())
      .map(e => e.name)
    expect(rootDirs).toContain('agent-browser')
    expect(
      datasetSkillDirs(readSkillsDatasetFromDisk(DATASET_SKILLS)).map(installedSkillDir),
    ).not.toContain('agent-browser')
  })

  it('ignores a root-only EXTRA file inside a dataset-backed skill dir', async () => {
    // The dataset skill dir contributes only SKILL.md; the root copy of that same
    // skill also carries a hand-added `scratch.md`. The dataset-derived case list
    // never mentions it, so it is not asserted and not drift.
    const tree: DatasetTree = { 'process/review/SKILL.md': '---\nname: review\n---\n\n# r\n' }
    const { byDatasetPath, producedPaths } = await buildInstalledArtifacts(tree)

    expect(producedPaths).toEqual(['pair-process-review/SKILL.md'])
    expect([...byDatasetPath.keys()]).toEqual(['process/review/SKILL.md'])
    expect(producedPaths).not.toContain('pair-process-review/scratch.md')
  })
})

/**
 * SKILL_COPY_OPTS is a local copy of the `skills` asset-registry knobs in
 * apps/pair-cli/config.json (what `pair update` actually uses). Pin it so a
 * registry change (e.g. prefix `pair` -> `p`) fails HERE — correctly attributed
 * — instead of the guard silently computing the wrong root path and blaming the
 * mirror / `pair update` (finding: hardcoded duplication of the config).
 */
describe('SKILL_COPY_OPTS stays pinned to the pair-cli skills registry', () => {
  it('flatten/prefix/source match apps/pair-cli/config.json asset_registries.skills', () => {
    const config = JSON.parse(
      readFileSync(join(REPO_ROOT, 'apps/pair-cli/config.json'), 'utf-8'),
    ) as {
      asset_registries: { skills: { source: string; flatten: boolean; prefix: string } }
    }
    const registry = config.asset_registries.skills
    expect(SKILL_COPY_OPTS.flatten).toBe(registry.flatten)
    expect(SKILL_COPY_OPTS.prefix).toBe(registry.prefix)
    // the guard reads the dataset from the registry's declared source dir (.skills)
    expect(DATASET_SKILLS.endsWith(registry.source)).toBe(true)
  })
})

/**
 * Artifact enumeration (T-1): a skill dir contributes its `SKILL.md` AND every
 * other markdown file under it — sub-docs today, `references/*` tomorrow. The
 * enumeration is derived from the dataset tree, recursive, markdown-only, and
 * never encodes how many artifacts exist.
 */
describe('datasetSkillArtifacts — every markdown artifact the dataset contributes', () => {
  const tree = readSkillsDatasetFromDisk(DATASET_SKILLS)

  it('enumerates SKILL.md AND non-SKILL.md sub-docs of the real dataset (no count)', () => {
    const artifacts = datasetSkillArtifacts(tree)
    // sub-docs the dataset contributes today, asserted by identity not by count
    expect(artifacts).toContain('process/review/merge-and-cascade.md')
    expect(artifacts).toContain('process/bootstrap/assess-orchestration.md')
    // ...alongside the SKILL.md of EVERY dataset skill dir, derived from the dataset
    for (const dir of datasetSkillDirs(tree)) {
      expect(artifacts).toContain(`${dir}/SKILL.md`)
    }
  })

  it('enumerates nested sub-directories recursively (ready for the first references/)', () => {
    const nested: DatasetTree = {
      'process/review/SKILL.md': 'a',
      'process/review/references/deep.md': 'b',
    }
    expect(datasetSkillArtifacts(nested)).toEqual([
      'process/review/SKILL.md',
      'process/review/references/deep.md',
    ])
  })

  it('excludes non-markdown files (a stray .DS_Store is never asserted as an artifact)', () => {
    const withJunk: DatasetTree = {
      'process/review/SKILL.md': 'a',
      'process/review/.DS_Store': 'binary-ish',
      'process/review/diagram.png': 'png',
    }
    expect(datasetSkillArtifacts(withJunk)).toEqual(['process/review/SKILL.md'])
  })

  it('returns a sorted list so it.each ordering is stable', () => {
    const artifacts = datasetSkillArtifacts(tree)
    expect(artifacts).toEqual([...artifacts].sort())
  })
})

/**
 * `installedArtifactPath` composes the REAL `transformPath` on the artifact's
 * dataset directory, exactly as the copy pipeline's per-file transform does —
 * including the flatten of a NESTED sub-directory into its own top-level
 * prefixed dir (`process/review/references` → `pair-process-review-references`),
 * which is emphatically NOT a preserved `references/` subdir.
 */
describe('installedArtifactPath — root location via the real naming transform', () => {
  it('maps a skill-dir artifact into that skill prefixed root dir', () => {
    expect(installedArtifactPath('process/review/merge-and-cascade.md')).toBe(
      'pair-process-review/merge-and-cascade.md',
    )
    expect(installedArtifactPath('next/SKILL.md')).toBe('pair-next/SKILL.md')
  })

  it('flattens a nested sub-directory into its own prefixed dir, as the pipeline does', () => {
    expect(installedArtifactPath('process/review/references/deep.md')).toBe(
      'pair-process-review-references/deep.md',
    )
  })

  it('leaves a dataset-root file unprefixed (no directory to transform)', () => {
    expect(installedArtifactPath('README.md')).toBe('README.md')
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
  const SKILL = 'demo/SKILL.md'
  let expected: string

  beforeAll(async () => {
    const { byDatasetPath } = await buildInstalledArtifacts(MINI)
    expected = byDatasetPath.get(SKILL)!
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
    expect(() => assertRootArtifactMatches(SKILL, expected, expected)).not.toThrow()
  })

  it('FAILS on frontmatter name: drift (AC2), naming the artifact + showing expected vs actual', () => {
    const drifted = expected.replace('name: pair-demo', 'name: demo')
    expect(() => assertRootArtifactMatches(SKILL, expected, drifted)).toThrow(/drifted/)

    // AC2 explicitly requires the failure to NAME the offending artifact by its
    // dataset-relative path and SHOW expected-vs-actual content — assert the
    // message carries all of it, so a regression that dropped the name, the
    // generated root path, or the diff dump would fail here.
    const message = captureThrownMessage(() => assertRootArtifactMatches(SKILL, expected, drifted))
    expect(message).toContain(SKILL) // names the offending artifact by dataset path
    expect(message).toContain('.claude/skills/pair-demo/SKILL.md') // and its generated root path
    expect(message).toContain('--- expected') // labelled expected side of the diff
    expect(message).toContain('+++ actual') // labelled actual side of the diff
    expect(message).toContain('-name: pair-demo') // expected content shown as a removed diff line
    expect(message).toContain('+name: demo') // drifted actual content shown as an added diff line
  })

  it('FAILS on relative-link-depth drift (AC3)', () => {
    const drifted = expected.replace('](../../../.pair/foo.md)', '](../../.pair/foo.md)')
    expect(() => assertRootArtifactMatches(SKILL, expected, drifted)).toThrow(/drifted/)
  })

  it('FAILS on /command skill-reference drift (AC3)', () => {
    const drifted = expected.replace('/pair-capability-verify-quality', '/verify-quality')
    expect(() => assertRootArtifactMatches(SKILL, expected, drifted)).toThrow(/drifted/)
  })

  it('FAILS loudly when the root mirror is missing (AC4)', () => {
    expect(() => assertRootArtifactMatches(SKILL, expected, undefined)).toThrow(
      /missing[\s\S]*pair update/,
    )
  })
})

/**
 * Drift-injection for NON-`SKILL.md` artifacts (#384's actual subject): a
 * sub-doc and a nested `references/` file go through the SAME real pipeline, so
 * every drift class must be caught on them too — not just on `SKILL.md`. The
 * fixture is authored so the transform genuinely rewrites the sub-doc content
 * (link depth + `/command` reference), which is what makes a hand-edit there
 * silently lossy today.
 */
describe('drift-injection on sub-docs and nested references (non-SKILL.md artifacts)', () => {
  const SUB = 'demo/sub-doc.md'
  const NESTED = 'demo/references/deep.md'
  const SUB_ROOT = '.claude/skills/pair-demo/sub-doc.md'
  const MINI: DatasetTree = {
    'demo/SKILL.md': '---\nname: demo\ndescription: "d"\n---\n\n# demo\n',
    // Authored so the transform performs all three sub-doc rewrite classes:
    // sibling self-pointer normalisation (`SKILL.md` -> `./SKILL.md`, the one the
    // four real dataset sub-docs exercise), relative-link-depth bump, and the
    // `/command` -> `/pair-*` skill-reference rewrite.
    [SUB]:
      '# sub\n\nDisclosed from [SKILL.md](SKILL.md).\nSee [kb](../../.pair/kb.md).\nCompose /verify-quality first.\nTail line kept unchanged.\nAnother tail line.\nAnd a third.\n',
    [NESTED]: '# deep\n\nCompose /verify-quality here.\n',
    'capability/verify-quality/SKILL.md': '---\nname: verify-quality\n---\n\n# vq\n',
    // non-markdown noise: copied by the pipeline, never asserted as an artifact
    'demo/.DS_Store': 'junk',
  }
  let mirror: Awaited<ReturnType<typeof buildInstalledArtifacts>>

  beforeAll(async () => {
    mirror = await buildInstalledArtifacts(MINI)
  }, 120_000)

  it('asserts the sub-doc and the nested reference, and NOT the non-markdown file', () => {
    expect([...mirror.byDatasetPath.keys()].sort()).toEqual([
      'capability/verify-quality/SKILL.md',
      'demo/SKILL.md',
      NESTED,
      SUB,
    ])
    expect(mirror.producedPaths).toContain('pair-demo/sub-doc.md')
    // a nested subdir is FLATTENED into its own top-level prefixed dir
    expect(mirror.producedPaths).toContain('pair-demo-references/deep.md')
    expect(mirror.producedPaths.some(p => p.includes('.DS_Store'))).toBe(false)
  })

  it('the transform genuinely rewrites the sub-doc (fixture is meaningful)', () => {
    const sub = mirror.byDatasetPath.get(SUB)!
    expect(sub).toContain('](./SKILL.md)') // sibling self-pointer normalised
    expect(sub).not.toContain('[SKILL.md](SKILL.md)')
    expect(sub).toContain('](../../../.pair/kb.md)') // link-depth bump
    expect(sub).not.toContain('](../../.pair/kb.md)')
    expect(sub).toContain('/pair-capability-verify-quality') // skill-reference rewrite
    expect(sub).not.toContain(' /verify-quality ')
  })

  it('rewrites a nested reference file too (flattened into its own prefixed dir)', () => {
    expect(mirror.byDatasetPath.get(NESTED)).toContain('/pair-capability-verify-quality')
  })

  it('passes when the sub-doc root copy equals the real transform (reconciled)', () => {
    const sub = mirror.byDatasetPath.get(SUB)!
    expect(() => assertRootArtifactMatches(SUB, sub, sub)).not.toThrow()
  })

  it('FAILS on sub-doc content drift, naming it by dataset path + compact diff (AC2)', () => {
    const sub = mirror.byDatasetPath.get(SUB)!
    const drifted = sub.replace('# sub\n', '# sub (hand-edited)\n')
    const message = captureThrownMessage(() => assertRootArtifactMatches(SUB, sub, drifted))
    expect(message).toContain(SUB)
    expect(message).toContain(SUB_ROOT)
    expect(message).toContain('-# sub')
    expect(message).toContain('+# sub (hand-edited)')
    // compact diff, not a two-file dump: the unchanged tail is elided
    expect(message).toContain('…')
  })

  it('FAILS on sub-doc sibling self-pointer drift (AC2)', () => {
    const sub = mirror.byDatasetPath.get(SUB)!
    const drifted = sub.replace('](./SKILL.md)', '](SKILL.md)')
    expect(() => assertRootArtifactMatches(SUB, sub, drifted)).toThrow(/drifted/)
  })

  it('FAILS on sub-doc link-depth drift (AC2)', () => {
    const sub = mirror.byDatasetPath.get(SUB)!
    const drifted = sub.replace('](../../../.pair/kb.md)', '](../../.pair/kb.md)')
    expect(() => assertRootArtifactMatches(SUB, sub, drifted)).toThrow(/drifted/)
  })

  it('FAILS on sub-doc /command skill-reference drift (AC2)', () => {
    const sub = mirror.byDatasetPath.get(SUB)!
    const drifted = sub.replace('/pair-capability-verify-quality', '/verify-quality')
    expect(() => assertRootArtifactMatches(SUB, sub, drifted)).toThrow(/drifted/)
  })

  it('FAILS loudly when the sub-doc root copy is missing, pointing at pair update (AC4)', () => {
    const message = captureThrownMessage(() =>
      assertRootArtifactMatches(SUB, mirror.byDatasetPath.get(SUB)!, undefined),
    )
    expect(message).toMatch(/missing[\s\S]*pair update/)
    expect(message).toContain(SUB)
    expect(message).toContain(SUB_ROOT)
  })

  it('FAILS on nested reference drift, named by its nested dataset path', () => {
    const deep = mirror.byDatasetPath.get(NESTED)!
    const drifted = `${deep}stray\n`
    const message = captureThrownMessage(() => assertRootArtifactMatches(NESTED, deep, drifted))
    expect(message).toContain(NESTED)
    expect(message).toContain('.claude/skills/pair-demo-references/deep.md')
  })
})

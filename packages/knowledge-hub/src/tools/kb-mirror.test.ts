import { describe, it, expect } from 'vitest'
import { existsSync, readFileSync } from 'fs'
import { join } from 'path'
import {
  buildKbMirrorTransform,
  kbDatasetPaths,
  kbDatasetMarkdownPaths,
  kbDatasetNonMarkdownPaths,
  assertKbMirrorMatches,
  isFrozenUntransformed,
  KB_DATASET_REL,
  KB_MIRROR_REL,
} from './kb-mirror'

// packages/knowledge-hub/src/tools -> repo root
const REPO_ROOT = join(__dirname, '..', '..', '..', '..')
const DATASET_KB = join(REPO_ROOT, KB_DATASET_REL)
const ROOT_KB = join(REPO_ROOT, KB_MIRROR_REL)
const DATASET_SKILLS = join(REPO_ROOT, 'packages/knowledge-hub/dataset/.skills')

/** On-disk root mirror of a dataset KB file, or `undefined` when genuinely absent. */
const mirrorContent = (rel: string): string | undefined => {
  const p = join(ROOT_KB, rel)
  return existsSync(p) ? readFileSync(p, 'utf-8') : undefined
}

const datasetContent = (rel: string): string => readFileSync(join(DATASET_KB, rel), 'utf-8')

/** Runs `fn`, expecting it to throw, and returns the thrown Error's message. */
const captureThrownMessage = (fn: () => void): string => {
  try {
    fn()
  } catch (err) {
    return (err as Error).message
  }
  throw new Error('expected the assertion to throw, but it did not')
}

const transform = buildKbMirrorTransform(DATASET_SKILLS)
const KB_FILES = kbDatasetMarkdownPaths(DATASET_KB)
const KB_NON_MD_FILES = kbDatasetNonMarkdownPaths(DATASET_KB)

/**
 * Dataset source + its transform output, computed ONCE per markdown file, here at
 * module scope (i.e. at collection, which no `testTimeout` bounds).
 *
 * `rewriteSkillReferences` is O(lines x skills) — every non-fenced line is matched
 * against one compiled pattern per installed skill — so a full pass over this
 * corpus is the expensive operation in this file. Every consumer below (the
 * equality `it.each`, the frozen-untransformed sweep, the idempotence check) reads
 * from this map instead of transforming again, leaving exactly ONE corpus pass
 * inside a test body (the re-transform in the idempotence assertion, which is the
 * thing under test there). Recomputing per consumer put the two aggregate tests
 * over vitest's default 5s per-test budget on CI's slower runners.
 */
const EXPECTED: ReadonlyMap<string, { source: string; expected: string }> = new Map(
  KB_FILES.map(rel => {
    const source = datasetContent(rel)
    return [rel, { source, expected: transform(source) }] as const
  }),
)

/** Precomputed `{ source, expected }` for a dataset markdown file. */
const expectedFor = (rel: string): { source: string; expected: string } => {
  const hit = EXPECTED.get(rel)
  if (!hit) throw new Error(`no precomputed transform for '${rel}' — not a dataset markdown file`)
  return hit
}

/**
 * Generous explicit budget for the two whole-corpus assertions. The default 5s is
 * a per-test timeout tuned for unit tests, not for a sweep over a 5 MB corpus on a
 * shared CI runner (~10x slower than a dev machine on this suite); an explicit
 * value keeps a slow runner from turning a green invariant red.
 */
const CORPUS_TEST_TIMEOUT_MS = 30_000

/**
 * Data-driven mirror-equality guard for the WHOLE KB tree (#393 AC1/AC5): for
 * every file the dataset contributes, the root `.pair/knowledge/<rel>` copy must
 * equal the REAL `pair update` transform of its dataset source — not the source
 * itself.
 *
 * Markdown and non-markdown are both covered, because the `knowledge` registry
 * ships both: the content rewrites only walk markdown, so for the non-markdown
 * files (the `assets/*.sh` gate scripts and `gitleaks-example.toml`) the transform
 * is the identity by construction and `expected` IS the source. Same helper, same
 * failure format — a hand-edited `assets/pr-state.sh` mirror now fails here
 * instead of shipping unnoticed.
 *
 * The case list is derived from the dataset at collection time, so a new KB file
 * is covered with no test edit and no count is encoded anywhere.
 */
describe('KB dataset -> root mirror equality for every KB file (data-driven) (#393)', () => {
  it('discovers KB dataset files directly from disk (no hardcoded count)', () => {
    expect(KB_FILES.length).toBeGreaterThan(0)
    expect(KB_FILES).toContain('guidelines/collaboration/templates/code-review-template.md')
    expect(KB_FILES).toContain('skills-guide.md')
    // ...and the non-markdown half of the same registry is enumerated too, so the
    // "whole tree" claim is not markdown-only.
    expect(KB_NON_MD_FILES.length).toBeGreaterThan(0)
    expect(KB_NON_MD_FILES).toContain('assets/pr-state.sh')
    // the two partitions are exactly the tree, nothing dropped between them
    expect([...KB_FILES, ...KB_NON_MD_FILES].sort()).toEqual(kbDatasetPaths(DATASET_KB))
  })

  it.each(KB_FILES)('root mirror for %s equals the real transform of its dataset source', rel => {
    assertKbMirrorMatches(rel, expectedFor(rel).expected, mirrorContent(rel))
  })

  it.each(KB_NON_MD_FILES)(
    'root mirror for non-markdown %s is byte-equal to its dataset source (transform is identity)',
    rel => {
      assertKbMirrorMatches(rel, datasetContent(rel), mirrorContent(rel))
    },
  )
})

/**
 * AC5 — the anomaly CLASS is closed, not just its one instance.
 *
 * `code-review-template.md` was the only KB file left byte-identical to its
 * dataset source while the transform would have rewritten it (i.e. while it
 * carried un-prefixed skill names). This asserts the set of such files is
 * EMPTY, so the next hand-port — or the next byte-equality guard pinning a
 * mirror to its raw source — fails here with the whole offending list rather
 * than being discovered years later by a reader typing a command that does not
 * exist.
 */
describe('KB mirror — no file is frozen in an untransformed state (AC5) (#393)', () => {
  it(
    'lists no KB mirror that is byte-identical to a source the transform would change',
    () => {
      const frozen = KB_FILES.filter(rel => {
        // source + transform output both come from the module-scope EXPECTED map:
        // this sweep does no transforming of its own, only mirror reads.
        const { source, expected } = expectedFor(rel)
        return isFrozenUntransformed(source, mirrorContent(rel), expected)
      })
      expect(frozen).toEqual([])
    },
    CORPUS_TEST_TIMEOUT_MS,
  )
})

/**
 * Edge case from the story: the regeneration runs many times over this corpus's
 * lifetime, so the transform must be a fixed point on its own output — an
 * already-prefixed `/pair-capability-assess-cost` must never become
 * `/pair-capability-pair-capability-assess-cost`.
 */
describe('KB mirror transform is idempotent (#393)', () => {
  // ONE case over the whole corpus, not one per file: idempotence is a property of
  // the transform, not of any individual file, so 441 `it` blocks bought nothing
  // but collection cost. Concatenating keeps every real input in the assertion —
  // any file that double-prefixed would still fail here.
  it(
    're-transforming the installed output of the whole KB corpus is a no-op',
    () => {
      // `once` is assembled from the ALREADY-transformed per-file outputs computed at
      // module scope, i.e. literally the bytes `pair update` installs — so this test
      // body performs the single re-transform that is the property under test, and no
      // setup pass.
      const once = KB_FILES.map(rel => expectedFor(rel).expected).join('\n')
      expect(transform(once)).toBe(once)
    },
    CORPUS_TEST_TIMEOUT_MS,
  )

  it('is a no-op on content with no skill references at all', () => {
    const plain = '# Title\n\nNo slash commands here, only prose.\n'
    expect(transform(plain)).toBe(plain)
  })
})

/**
 * The two-op composition in `buildKbMirrorTransform` is the COMPLETE `pair update`
 * transform for this registry only because the `knowledge` registry declares no
 * naming transform. Pin that, as the sibling `skill-md-mirror` pins
 * `SKILL_COPY_OPTS`: if the registry later gains `flatten`/`prefix`, the real
 * pipeline both renames paths AND stops rewriting skill references entirely
 * (`applySkillRefsToNonSkillRegistries` skips any registry with flatten/prefix),
 * so `transform(dataset)` would no longer equal `pair update`'s output and the
 * guard above would go permanently red with no satisfiable mirror — the deadlock
 * this story removed, reintroduced one level up. Failing HERE attributes it to the
 * registry change instead of blaming the mirror.
 */
describe('the KB guard stays pinned to the pair-cli knowledge registry (#393)', () => {
  const registry = (
    JSON.parse(readFileSync(join(REPO_ROOT, 'apps/pair-cli/config.json'), 'utf-8')) as {
      asset_registries: Record<
        string,
        {
          source: string
          behavior: string
          flatten?: boolean
          prefix?: string
          targets: { path: string; mode: string; transform?: unknown }[]
        }
      >
    }
  ).asset_registries.knowledge

  it('declares no flatten/prefix, so the skill-ref + link-path pair IS the whole transform', () => {
    expect(registry.flatten).toBeUndefined()
    expect(registry.prefix).toBeUndefined()
    // no per-target content transform either (the `agents` registry's `claude`
    // prefix transform is what one would look like)
    for (const target of registry.targets) expect(target.transform).toBeUndefined()
  })

  it('reads the dataset from, and asserts against, the registry-declared source and target', () => {
    expect(KB_DATASET_REL.endsWith(registry.source)).toBe(true)
    expect(registry.targets.map(t => t.path)).toContain(KB_MIRROR_REL)
    // 'mirror' behavior: the installed tree is meant to be the dataset's image,
    // which is what makes whole-tree equality the right assertion here.
    expect(registry.behavior).toBe('mirror')
  })
})

/**
 * Drift-injection coverage for the assertion helper: the real on-disk guard
 * above only ever exercises its happy path, so the failure paths — and above
 * all the WORDING of the failure (AC3) — are driven here.
 */
describe('assertKbMirrorMatches — failure paths and message (#393)', () => {
  const REL = 'guidelines/collaboration/templates/code-review-template.md'
  const expected = 'line one\nline two\nline three\n'

  it('passes when the mirror equals the transform output', () => {
    // called directly, not wrapped in `expect().not.toThrow()`: vitest then reports
    // the guard's own message as the failure headline instead of truncating it
    // inside "expected [Function] to not throw an error but '...' was thrown".
    assertKbMirrorMatches(REL, expected, expected)
  })

  it('throws when the mirror has drifted', () => {
    expect(() => assertKbMirrorMatches(REL, expected, 'line one\nDRIFT\nline three\n')).toThrow(
      /drifted/,
    )
  })

  it('states WHAT it compares — mirror vs. transform(dataset), not vs. the raw source (AC3)', () => {
    const message = captureThrownMessage(() => assertKbMirrorMatches(REL, expected, 'drifted\n'))
    expect(message).toContain('COMPARED')
    expect(message).toContain('TRANSFORM(dataset source)')
    expect(message).toContain('NOT vs. the raw dataset source')
    // The refuted assumption is spelled out, so the "identical mirror"
    // invariant cannot be re-derived from this message.
    expect(message).toContain('byte-identical to its dataset source is itself the drift')
  })

  it('names both the mirror path and the dataset path, and the regenerate remedy', () => {
    const message = captureThrownMessage(() => assertKbMirrorMatches(REL, expected, 'drifted\n'))
    expect(message).toContain(join(KB_MIRROR_REL, REL))
    expect(message).toContain(join(KB_DATASET_REL, REL))
    expect(message).toContain("Regenerate with 'pair update'")
    expect(message).toContain('never hand-edit the mirror')
  })

  it('carries a compact expected-vs-actual diff of the drifted lines', () => {
    const message = captureThrownMessage(() =>
      assertKbMirrorMatches(REL, expected, 'line one\nDRIFT\nline three\n'),
    )
    expect(message).toContain('-line two')
    expect(message).toContain('+DRIFT')
  })

  it('states the OTHER comparison for a non-markdown file — byte-equality IS the invariant', () => {
    const message = captureThrownMessage(() =>
      assertKbMirrorMatches('assets/pr-state.sh', expected, 'drifted\n'),
    )
    expect(message).toContain('COMPARED')
    expect(message).toContain('byte for byte')
    expect(message).toContain('NOT markdown')
    expect(message).toContain('byte-equality IS the invariant')
    // and must NOT teach the markdown rule here, where it is false
    expect(message).not.toContain('is itself the drift')
  })

  it('reports a missing mirror as missing, with the regenerate hint (not as drift)', () => {
    expect(() => assertKbMirrorMatches(REL, expected, undefined)).toThrow(
      /KB mirror missing.*does not exist.*pair update/s,
    )
  })
})

describe('isFrozenUntransformed (#393)', () => {
  const source = 'Compose `/assess-cost` here.\n'
  const transformed = 'Compose `/pair-capability-assess-cost` here.\n'

  it('flags a mirror byte-identical to a source the transform would have changed', () => {
    expect(isFrozenUntransformed(source, source, transformed)).toBe(true)
  })

  it('does not flag a correctly transformed mirror', () => {
    expect(isFrozenUntransformed(source, transformed, transformed)).toBe(false)
  })

  it('does not flag a file the transform legitimately leaves untouched', () => {
    const plain = '# No skill references\n'
    expect(isFrozenUntransformed(plain, plain, plain)).toBe(false)
  })

  it('does not flag a missing mirror (that is the missing-file failure, not this class)', () => {
    expect(isFrozenUntransformed(source, undefined, transformed)).toBe(false)
  })
})

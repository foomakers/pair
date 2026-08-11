import { describe, it, expect } from 'vitest'
import { existsSync, readFileSync } from 'fs'
import { join } from 'path'
import {
  buildKbMirrorTransform,
  kbDatasetMarkdownPaths,
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

/**
 * Data-driven mirror-equality guard for the WHOLE KB tree (#393 AC1/AC5): for
 * every markdown file the dataset contributes, the root `.pair/knowledge/<rel>`
 * copy must equal the REAL `pair update` transform of its dataset source — not
 * the source itself.
 *
 * The case list is derived from the dataset at collection time, so a new KB file
 * is covered with no test edit and no count is encoded anywhere.
 */
describe('KB dataset -> root mirror equality for every KB file (data-driven) (#393)', () => {
  it('discovers KB dataset files directly from disk (no hardcoded count)', () => {
    expect(KB_FILES.length).toBeGreaterThan(0)
    expect(KB_FILES).toContain('guidelines/collaboration/templates/code-review-template.md')
    expect(KB_FILES).toContain('skills-guide.md')
  })

  it.each(KB_FILES)('root mirror for %s equals the real transform of its dataset source', rel => {
    expect(() =>
      assertKbMirrorMatches(rel, transform(datasetContent(rel)), mirrorContent(rel)),
    ).not.toThrow()
  })
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
  it('lists no KB mirror that is byte-identical to a source the transform would change', () => {
    const frozen = KB_FILES.filter(rel =>
      isFrozenUntransformed(
        datasetContent(rel),
        mirrorContent(rel),
        transform(datasetContent(rel)),
      ),
    )
    expect(frozen).toEqual([])
  })
})

/**
 * Edge case from the story: the regeneration runs many times over this corpus's
 * lifetime, so the transform must be a fixed point on its own output — an
 * already-prefixed `/pair-capability-assess-cost` must never become
 * `/pair-capability-pair-capability-assess-cost`.
 */
describe('KB mirror transform is idempotent (#393)', () => {
  it.each(KB_FILES)('re-transforming the installed output of %s is a no-op', rel => {
    const once = transform(datasetContent(rel))
    expect(transform(once)).toBe(once)
  })

  it('is a no-op on content with no skill references at all', () => {
    const plain = '# Title\n\nNo slash commands here, only prose.\n'
    expect(transform(plain)).toBe(plain)
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
    expect(() => assertKbMirrorMatches(REL, expected, expected)).not.toThrow()
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

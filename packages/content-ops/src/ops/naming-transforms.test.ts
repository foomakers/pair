import { describe, it, expect } from 'vitest'
import {
  flattenPath,
  prefixPath,
  transformPath,
  detectCollisions,
  isRegistryEntryPath,
  isValidFlattenDepth,
} from './naming-transforms'

describe('flattenPath', () => {
  it('converts nested path separators to hyphens', () => {
    expect(flattenPath('catalog/next')).toBe('catalog-next')
  })

  it('converts deeply nested paths', () => {
    expect(flattenPath('process/implement/task')).toBe('process-implement-task')
  })

  it('returns single-level path unchanged', () => {
    expect(flattenPath('catalog')).toBe('catalog')
  })

  it('handles trailing slash', () => {
    expect(flattenPath('catalog/next/')).toBe('catalog-next')
  })

  it('handles leading slash', () => {
    expect(flattenPath('/catalog/next')).toBe('catalog-next')
  })

  it('handles empty string', () => {
    expect(flattenPath('')).toBe('')
  })
})

describe('prefixPath', () => {
  it('prepends prefix with hyphen separator to top-level', () => {
    expect(prefixPath('catalog-next', 'pair')).toBe('pair-catalog-next')
  })

  it('prepends prefix to single-level path', () => {
    expect(prefixPath('catalog', 'pair')).toBe('pair-catalog')
  })

  it('prepends prefix to nested path (top-level only)', () => {
    expect(prefixPath('catalog/next', 'pair')).toBe('pair-catalog/next')
  })

  it('returns path unchanged when prefix is empty', () => {
    expect(prefixPath('catalog', '')).toBe('catalog')
  })

  it('returns empty string unchanged when dirName is empty', () => {
    expect(prefixPath('', 'pair')).toBe('')
  })
})

describe('transformPath', () => {
  it('returns path unchanged with no flatten and no prefix', () => {
    expect(transformPath('catalog/next', {})).toBe('catalog/next')
  })

  it('applies flatten only', () => {
    expect(transformPath('catalog/next', { flatten: true })).toBe('catalog-next')
  })

  it('applies prefix only (top-level)', () => {
    expect(transformPath('catalog/next', { prefix: 'pair' })).toBe('pair-catalog/next')
  })

  it('applies both flatten and prefix', () => {
    expect(transformPath('catalog/next', { flatten: true, prefix: 'pair' })).toBe(
      'pair-catalog-next',
    )
  })

  it('handles deeply nested with both', () => {
    expect(transformPath('process/implement/task', { flatten: true, prefix: 'pair' })).toBe(
      'pair-process-implement-task',
    )
  })

  it('handles single level with both', () => {
    expect(transformPath('catalog', { flatten: true, prefix: 'pair' })).toBe('pair-catalog')
  })

  it('does not apply prefix when prefix is undefined', () => {
    expect(transformPath('catalog/next', { flatten: true })).toBe('catalog-next')
  })
})

describe('detectCollisions', () => {
  it('returns empty array when no collisions', () => {
    expect(detectCollisions(['a-b', 'c-d', 'e-f'])).toEqual([])
  })

  it('detects duplicate paths after transformation', () => {
    const collisions = detectCollisions(['a-b', 'c-d', 'a-b'])
    expect(collisions).toContain('a-b')
  })

  it('returns empty for empty input', () => {
    expect(detectCollisions([])).toEqual([])
  })

  it('returns empty for single entry', () => {
    expect(detectCollisions(['a-b'])).toEqual([])
  })
})

// ---------------------------------------------------------------------------
// #407 — a skill's nested `references/` sub-dir must install INSIDE the skill
// ---------------------------------------------------------------------------
//
// The skills registry's entry granularity is TWO segments (`process/review`,
// `capability/write-issue`), so a deeper segment is content *of* that entry, not
// a separate one. Flattening every slash turned `process/review/references` into
// the sibling pseudo-skill `pair-process-review-references`, which breaks the
// skill's link to `./references/deep.md` and the sub-doc's link back up.
//
// `flattenDepth` bounds the flattening to the entry: segments beyond it are
// preserved. Absent, behaviour is unchanged — every other registry keeps
// flattening everything, so this cannot regress them.
describe('flattenPath with a bounded depth (#407)', () => {
  it('flattens exactly the entry segments and preserves what is below', () => {
    expect(flattenPath('process/review/references', 2)).toBe('process-review/references')
  })

  it('preserves more than one level below the entry', () => {
    expect(flattenPath('process/review/references/deep', 2)).toBe('process-review/references/deep')
  })

  it('leaves an entry-depth path exactly as the unbounded form does', () => {
    expect(flattenPath('process/review', 2)).toBe(flattenPath('process/review'))
  })

  it('is a no-op beyond the available segments (a shallower entry is not padded)', () => {
    expect(flattenPath('review', 2)).toBe('review')
  })

  it('without a depth, flattens everything — unchanged for every other registry', () => {
    expect(flattenPath('process/review/references')).toBe('process-review-references')
  })

  // The value comes from JSON config, so a typo must fail loudly. Degrading
  // silently would degrade in the direction that REINTRODUCES #407 (0 and -1
  // used to full-flatten; a fractional depth used to flatten nothing).
  it.each([0, -1, 1.5, NaN])('throws on the non-positive-integer depth %s', depth => {
    expect(() => flattenPath('a/b/c/d', depth)).toThrow(/positive integer/)
  })

  // The depth is rejected whatever path it is paired with: an early return for a
  // trivial path must not decide whether the value is validated at all.
  it.each([0, -1, 1.5, NaN])('throws on the depth %s even for an empty path', depth => {
    expect(() => flattenPath('', depth)).toThrow(/positive integer/)
    expect(() => isRegistryEntryPath('', depth)).toThrow(/positive integer/)
  })

  // The unbounded form is traversal-safe by construction (every separator
  // becomes a hyphen). A preserved tail is not: the copy pipeline joins it onto
  // the destination root, so `process/review/../../../../etc` would resolve to
  // `/etc`.
  it('refuses to preserve a .. segment that would escape the destination root', () => {
    expect(() => flattenPath('process/review/../../../../etc', 2)).toThrow(/refusing to preserve/)
  })

  it('refuses to preserve a . segment in the tail', () => {
    expect(() => flattenPath('process/review/./deep', 2)).toThrow(/refusing to preserve/)
  })

  it('still flattens a .. into a hyphen when it sits within the entry segments', () => {
    expect(flattenPath('process/../review', 3)).toBe('process-..-review')
  })
})

// The copy-time failure convention in this layer is the typed IO_ERROR, so a
// programmatic consumer that skipped CLI validation still gets
// `operation`/`path` context through the CLI error formatter.
describe('flattenPath failure typing (#407 review)', () => {
  it('throws the ops layer IO_ERROR for an invalid depth', () => {
    expect(() => flattenPath('a/b/c', 0)).toThrow(expect.objectContaining({ name: 'IO_ERROR' }))
  })

  it('throws the ops layer IO_ERROR for a traversal segment in the tail', () => {
    expect(() => flattenPath('a/b/../c', 2)).toThrow(expect.objectContaining({ name: 'IO_ERROR' }))
  })
})

// One predicate, shared with the CLI config boundary so the two enforcement
// points cannot drift into two different rules.
describe('isValidFlattenDepth (#407 review)', () => {
  it.each([1, 2, 10])('accepts the positive integer %s', value => {
    expect(isValidFlattenDepth(value)).toBe(true)
  })

  it.each([0, -1, 1.5, NaN, '2', null, undefined, {}])('rejects %s', value => {
    expect(isValidFlattenDepth(value)).toBe(false)
  })
})

describe('isRegistryEntryPath (#407)', () => {
  it('treats every dir as an entry when the flatten is unbounded', () => {
    expect(isRegistryEntryPath('process/review/references')).toBe(true)
  })

  it('treats a dir at or above the entry depth as an entry', () => {
    expect(isRegistryEntryPath('process/review', 2)).toBe(true)
    expect(isRegistryEntryPath('next', 2)).toBe(true)
  })

  it('treats a dir below the entry depth as content, not an entry', () => {
    expect(isRegistryEntryPath('process/review/references', 2)).toBe(false)
    expect(isRegistryEntryPath('process/review/references/deep', 2)).toBe(false)
  })

  it('rejects an invalid depth for the same reason flattenPath does', () => {
    expect(() => isRegistryEntryPath('process/review', 0)).toThrow(/positive integer/)
  })
})

describe('transformPath with a bounded flatten depth (#407)', () => {
  it('prefixes the entry and keeps the nested dir underneath it', () => {
    expect(
      transformPath('process/review/references', {
        flatten: true,
        prefix: 'pair',
        flattenDepth: 2,
      }),
    ).toBe('pair-process-review/references')
  })

  it('is identical to today for a path at entry depth', () => {
    expect(
      transformPath('process/review', { flatten: true, prefix: 'pair', flattenDepth: 2 }),
    ).toBe('pair-process-review')
  })

  it('reproduces the #407 defect when the depth is absent (regression witness)', () => {
    expect(transformPath('process/review/references', { flatten: true, prefix: 'pair' })).toBe(
      'pair-process-review-references',
    )
  })
})

describe('bounded flatten is not less traversal-safe than the unbounded form (#411 round 3)', () => {
  it('refuses a `..` head when flattenDepth is 1', () => {
    // Returned '../evil' before the fix — escaping the destination root, in the
    // very dimension the guard claims to harden.
    expect(() => flattenPath('../evil', 1)).toThrow(/refusing to preserve/)
  })

  it('refuses a `.` head when flattenDepth is 1', () => {
    expect(() => flattenPath('./evil', 1)).toThrow(/refusing to preserve/)
  })

  it('the unbounded form stays safe by construction, as before', () => {
    expect(flattenPath('../evil')).toBe('..-evil')
  })

  it('a `..` in the head of a deeper bound is refused too', () => {
    expect(() => flattenPath('../a/b', 2)).toThrow(/refusing to preserve/)
  })
})

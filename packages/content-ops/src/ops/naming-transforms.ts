/**
 * Naming transformations for flatten and prefix operations.
 * Flatten: converts directory hierarchy into hyphen-separated names.
 * Prefix: prepends a prefix to the top-level directory name.
 * Both operations are independent and composable.
 */

/**
 * Naming transform options applied during a copy. One name for the concept
 * everywhere it travels: `SyncOptions.flattenDepth` →
 * `TransformOpts.flattenDepth` → `transformPath({ flattenDepth })` →
 * `flattenPath(dir, flattenDepth)`.
 *
 * `flattenDepth` bounds flattening to the registry's ENTRY granularity, so a
 * deeper segment is preserved as a real sub-path instead of becoming a sibling
 * entry. Omitted ⇒ every separator is flattened, as before (#407).
 */
export type TransformOpts = { flatten: boolean; prefix?: string; flattenDepth?: number }

/** A `flattenDepth` given as a JSON-config typo must fail loudly, not silently full-flatten. */
function assertValidFlattenDepth(flattenDepth: number): void {
  if (!Number.isInteger(flattenDepth) || flattenDepth < 1) {
    throw new Error(
      `flattenPath: flattenDepth must be a positive integer, got ${flattenDepth}. ` +
        'Omit it to flatten every separator.',
    )
  }
}

/**
 * A preserved tail is joined onto a destination root by the copy pipeline, so a
 * `.`/`..` segment in it could escape that root. The unbounded form is
 * traversal-safe by construction (every separator becomes a hyphen); the
 * bounded form has to say no explicitly.
 */
function assertNoTraversalInTail(tail: string[], dirName: string): void {
  const offender = tail.find(segment => segment === '.' || segment === '..')
  if (offender !== undefined) {
    throw new Error(
      `flattenPath: refusing to preserve the relative segment '${offender}' of '${dirName}' — ` +
        'a preserved sub-path is joined onto the destination root and could escape it.',
    )
  }
}

/**
 * Flatten a path by replacing directory separators with hyphens.
 * Example: 'catalog/next' → 'catalog-next'
 *
 * `flattenDepth` bounds the flattening to a registry's **entry granularity**:
 * only the first `flattenDepth` segments are joined, and anything deeper is
 * preserved as a real sub-path.
 * Example: 'process/review/references' with flattenDepth 2 → 'process-review/references'
 *
 * Why it exists (#407): the skills registry's entries are two segments deep
 * (`process/review`), so a third segment is content *of* that skill, not a
 * separate skill. Flattening every slash installed it as the SIBLING pseudo-skill
 * `pair-process-review-references`, which breaks the skill's own link to
 * `./references/deep.md` and the sub-doc's link back up — the first skill using
 * the standard `references/` progressive-disclosure layout would install unusable.
 *
 * Omitted ⇒ every separator is flattened, exactly as before. Registries whose
 * entries are single-segment are unaffected either way.
 *
 * Throws when `flattenDepth` is present but not a positive integer, and when the
 * preserved tail contains a `.`/`..` segment (see the two assertions above).
 */
export function flattenPath(dirName: string, flattenDepth?: number): string {
  const trimmed = dirName.replace(/^\/+/, '').replace(/\/+$/, '')
  if (trimmed === '') return ''
  if (flattenDepth === undefined) return trimmed.replace(/\//g, '-')
  assertValidFlattenDepth(flattenDepth)

  const segments = trimmed.split('/')
  // Fewer segments than the entry depth: nothing below the entry to preserve, so
  // this is the unbounded result — a shallower entry is never padded.
  if (segments.length <= flattenDepth) return segments.join('-')
  const tail = segments.slice(flattenDepth)
  assertNoTraversalInTail(tail, dirName)
  return [segments.slice(0, flattenDepth).join('-'), ...tail].join('/')
}

/**
 * Whether a source sub-path is one of the registry's own ENTRIES (a skill's own
 * directory) rather than CONTENT inside one (a skill's `references/` sub-dir).
 *
 * Only a bounded flatten can tell the two apart: `flattenDepth` IS the entry
 * granularity, so anything deeper is content. Without it every sub-dir becomes
 * its own top-level target dir, hence every sub-dir *is* an entry — the
 * pre-#407 behaviour, preserved exactly.
 *
 * Why it matters (#407): the skill-name / skill-link-path maps and the
 * frontmatter `name:` sync are keyed on entries. Feeding them a content dir
 * registers `references` as a SKILL NAME mapped to `<some-skill>/references`,
 * and the `/references` token in an unrelated skill's body then gets rewritten
 * to another skill's sub-dir — last writer wins on directory iteration order.
 */
export function isRegistryEntryPath(dirName: string, flattenDepth?: number): boolean {
  if (flattenDepth === undefined) return true
  const trimmed = dirName.replace(/^\/+/, '').replace(/\/+$/, '')
  if (trimmed === '') return true
  assertValidFlattenDepth(flattenDepth)
  return trimmed.split('/').length <= flattenDepth
}

/**
 * Prepend a prefix to the top-level directory name with hyphen separator.
 * For nested paths, only the top-level segment is prefixed.
 * Example: 'catalog-next' + 'pair' → 'pair-catalog-next'
 * Example: 'catalog/next' + 'pair' → 'pair-catalog/next'
 */
export function prefixPath(dirName: string, prefix: string): string {
  if (prefix === '' || dirName === '') return dirName
  const slashIndex = dirName.indexOf('/')
  if (slashIndex === -1) {
    return `${prefix}-${dirName}`
  }
  const topLevel = dirName.slice(0, slashIndex)
  const rest = dirName.slice(slashIndex)
  return `${prefix}-${topLevel}${rest}`
}

/**
 * Apply flatten and/or prefix transformations to a path.
 * Order: flatten first (if enabled), then prefix (if provided).
 */
export function transformPath(dirName: string, options: Partial<TransformOpts>): string {
  let result = dirName
  if (options.flatten) {
    result = flattenPath(result, options.flattenDepth)
  }
  if (options.prefix) {
    // prefixPath already prefixes only the top-level segment, so a preserved
    // sub-path stays under the prefixed entry: 'process-review/references' →
    // 'pair-process-review/references'.
    result = prefixPath(result, options.prefix)
  }
  return result
}

/**
 * Detect naming collisions in a list of transformed paths.
 * Returns the list of duplicated path names.
 */
export function detectCollisions(paths: string[]): string[] {
  const seen = new Set<string>()
  const duplicates = new Set<string>()
  for (const p of paths) {
    if (seen.has(p)) {
      duplicates.add(p)
    }
    seen.add(p)
  }
  return [...duplicates]
}

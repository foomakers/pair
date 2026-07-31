/**
 * Naming transformations for flatten and prefix operations.
 * Flatten: converts directory hierarchy into hyphen-separated names.
 * Prefix: prepends a prefix to the top-level directory name.
 * Both operations are independent and composable.
 */

/**
 * Flatten a path by replacing directory separators with hyphens.
 * Example: 'catalog/next' → 'catalog-next'
 *
 * `maxDepth` bounds the flattening to a registry's **entry granularity**: only
 * the first `maxDepth` segments are joined, and anything deeper is preserved as
 * a real sub-path.
 * Example: 'process/review/references' with maxDepth 2 → 'process-review/references'
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
 */
export function flattenPath(dirName: string, maxDepth?: number): string {
  const trimmed = dirName.replace(/^\/+/, '').replace(/\/+$/, '')
  if (trimmed === '') return ''
  if (maxDepth === undefined || maxDepth < 1) return trimmed.replace(/\//g, '-')

  const segments = trimmed.split('/')
  // Fewer segments than the entry depth: nothing below the entry to preserve, so
  // this is the unbounded result — a shallower entry is never padded.
  if (segments.length <= maxDepth) return segments.join('-')
  return [segments.slice(0, maxDepth).join('-'), ...segments.slice(maxDepth)].join('/')
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
export function transformPath(
  dirName: string,
  options: { flatten?: boolean; prefix?: string; flattenDepth?: number },
): string {
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

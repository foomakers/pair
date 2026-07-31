/**
 * Naming transformations for flatten and prefix operations.
 * Flatten: converts directory hierarchy into hyphen-separated names.
 * Prefix: prepends a prefix to the top-level directory name.
 * Both operations are independent and composable.
 */
import { createError } from '../observability'

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

/**
 * The one predicate for a valid `flattenDepth`, shared with the CLI config
 * boundary (`validateFlattenDepthField`) so the rule cannot drift between the
 * two places that enforce it. Each boundary keeps its own message; only the
 * rule is shared.
 */
export function isValidFlattenDepth(value: unknown): boolean {
  return typeof value === 'number' && Number.isInteger(value) && value >= 1
}

/**
 * A `flattenDepth` given as a JSON-config typo must fail loudly, not silently
 * full-flatten. Thrown as the ops layer's typed `IO_ERROR` (like the sibling
 * collision error in `copy-directory-transforms.ts`) so a programmatic
 * `@pair/content-ops` consumer that skipped CLI validation still gets
 * `operation`/`path` context through the CLI error formatter.
 */
function assertValidFlattenDepth(flattenDepth: number, operation: string, path: string): void {
  if (!isValidFlattenDepth(flattenDepth)) {
    throw createError({
      type: 'IO_ERROR',
      message:
        `${operation}: flattenDepth must be a positive integer, got ${flattenDepth}. ` +
        'Omit it to flatten every separator.',
      operation,
      path,
    })
  }
}

/**
 * A result is joined onto a destination root by the copy pipeline, so a `.`/`..`
 * segment surviving in it could escape that root.
 *
 * The "safe by construction" argument for the unbounded form — every separator
 * becomes a hyphen, so `../evil` → `..-evil` is inert — holds only for a path with
 * a separator to hyphenate. A SINGLE segment has none, in either form:
 * `flattenPath('..')` returned `'..'` unchanged. So the guard is applied by SHAPE,
 * not by branch (round-4 review of PR #411): every segment of a bounded result
 * plus any single-segment result, bounded or not. That keeps the two branches
 * symmetric — the bounded form is never LESS safe than the unbounded one it
 * replaces (round-3's hole: `flattenPath('../evil', 1)` returned `'../evil'`), and
 * never MORE strict than it either.
 *
 * Not reachable through the CLI (directory names come from
 * `dirname(relative(root, path))`, which yields neither `.` nor `..` for a file
 * under the root, and the source root's own files bypass the transform), so this
 * is defensive depth for a programmatic `@pair/content-ops` caller.
 */
function assertNoTraversal(segments: string[], dirName: string): void {
  const offender = segments.find(segment => segment === '.' || segment === '..')
  if (offender !== undefined) {
    throw createError({
      type: 'IO_ERROR',
      message:
        `flattenPath: refusing to preserve the relative segment '${offender}' of '${dirName}' — ` +
        'a bounded result is joined onto the destination root and could escape it.',
      operation: 'flattenPath',
      path: dirName,
    })
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
 * Throws when `flattenDepth` is present but not a positive integer, and when a
 * `.`/`..` segment would survive into the result (see the two assertions above).
 */
export function flattenPath(dirName: string, flattenDepth?: number): string {
  // Validated before ANY early return: an invalid depth must be rejected
  // regardless of the path it happens to be paired with, or the fail-loudly
  // guarantee becomes dependent on the other argument.
  if (flattenDepth !== undefined) assertValidFlattenDepth(flattenDepth, 'flattenPath', dirName)
  const trimmed = dirName.replace(/^\/+/, '').replace(/\/+$/, '')
  if (trimmed === '') return ''

  const segments = trimmed.split('/')
  // No separator to hyphenate ⇒ the segment survives verbatim, in BOTH forms.
  if (segments.length === 1) assertNoTraversal(segments, dirName)
  if (flattenDepth === undefined) return trimmed.replace(/\//g, '-')

  // Fewer segments than the entry depth: nothing below the entry to preserve, so
  // this is the unbounded result — a shallower entry is never padded.
  if (segments.length <= flattenDepth) return segments.join('-')

  assertNoTraversal(segments, dirName)
  const tail = segments.slice(flattenDepth)
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
  // Same ordering rationale as `flattenPath`: validate the depth before the
  // empty-path early return.
  assertValidFlattenDepth(flattenDepth, 'isRegistryEntryPath', dirName)
  const trimmed = dirName.replace(/^\/+/, '').replace(/\/+$/, '')
  if (trimmed === '') return true
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

/**
 * Naming transformations for flatten and prefix operations.
 * Flatten: converts directory hierarchy into hyphen-separated names.
 * Prefix: prepends a prefix to the top-level directory name.
 * Both operations are independent and composable.
 */

/**
 * Flatten a path by replacing directory separators with hyphens.
 * Example: 'navigator/next' → 'navigator-next'
 */
export function flattenPath(dirName: string): string {
  const trimmed = dirName.replace(/^\/+/, '').replace(/\/+$/, '')
  if (trimmed === '') return ''
  return trimmed.replace(/\//g, '-')
}

/**
 * Prepend a prefix to the top-level directory name with hyphen separator.
 * For nested paths, only the top-level segment is prefixed.
 * Example: 'navigator-next' + 'pair' → 'pair-navigator-next'
 * Example: 'navigator/next' + 'pair' → 'pair-navigator/next'
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
  options: { flatten?: boolean; prefix?: string },
): string {
  let result = dirName
  if (options.flatten) {
    result = flattenPath(result)
  }
  if (options.prefix) {
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

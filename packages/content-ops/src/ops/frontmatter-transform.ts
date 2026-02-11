/**
 * Frontmatter transformations for files copied with naming transforms.
 *
 * - Collapses multiline YAML scalars (>-, >, |, |-) to single-line values.
 * - Replaces old directory names with new ones in all frontmatter values (not keys).
 * - Body content after the closing --- is never modified.
 */

const FM_OPEN = '---\n'
const FM_CLOSE_RE = /\n---(?:\n|$)/

/** Matches a YAML multiline indicator: `key: >-`, `key: >`, `key: |`, `key: |-` */
const MULTILINE_INDICATOR_RE = /^(\s*[\w][\w-]*:\s*)[>|][-]?\s*$/

/** Matches a YAML continuation line (indented with at least 2 spaces) */
const CONTINUATION_RE = /^(\s{2,})\S/

/**
 * Collapses multiline YAML block scalars into single-line values.
 * Handles >-, >, |, |- indicators by joining continuation lines with spaces.
 */
function collapseMultilineScalars(frontmatter: string): string {
  const lines = frontmatter.split('\n')
  const result: string[] = []
  let i = 0

  while (i < lines.length) {
    const match = MULTILINE_INDICATOR_RE.exec(lines[i]!)
    if (match) {
      const keyPrefix = match[1]!
      const continuationLines: string[] = []
      i++
      while (i < lines.length && CONTINUATION_RE.test(lines[i]!)) {
        continuationLines.push(lines[i]!.trim())
        i++
      }
      result.push(keyPrefix + continuationLines.join(' '))
    } else {
      result.push(lines[i]!)
      i++
    }
  }

  return result.join('\n')
}

/**
 * Replaces `from` with `to` in YAML values when it appears as an exact
 * path segment (split by `/`). This prevents false matches in prose.
 * Keys (before `: `) are never modified.
 */
function renameInValues(frontmatter: string, from: string, to: string): string {
  return frontmatter
    .split('\n')
    .map(line => {
      const colonIdx = line.indexOf(': ')
      if (colonIdx === -1) return line
      const key = line.slice(0, colonIdx + 2)
      const value = line.slice(colonIdx + 2)
      const replaced = value
        .split('/')
        .map(seg => (seg === from ? to : seg))
        .join('/')
      return key + replaced
    })
    .join('\n')
}

/**
 * Synchronizes frontmatter after a directory rename.
 * - Collapses multiline YAML scalars (>-, >, |, |-) to single-line values.
 * - If `rename` provided, replaces `from` with `to` in all frontmatter values.
 * - Body content is never modified.
 *
 * Returns content unchanged if no frontmatter is detected.
 */
export function syncFrontmatter(content: string, rename?: { from: string; to: string }): string {
  if (!content.startsWith(FM_OPEN)) return content

  const closeMatch = FM_CLOSE_RE.exec(content.slice(FM_OPEN.length))
  if (!closeMatch) return content

  const fmEndOffset = FM_OPEN.length + closeMatch.index!
  const frontmatter = content.slice(FM_OPEN.length, fmEndOffset)
  const rest = content.slice(fmEndOffset)

  let processed = collapseMultilineScalars(frontmatter)

  if (rename) {
    processed = renameInValues(processed, rename.from, rename.to)
  }

  return FM_OPEN + processed + rest
}

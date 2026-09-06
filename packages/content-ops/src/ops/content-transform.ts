/**
 * Marker-based content transform for multi-target distribution.
 *
 * Marker protocol: <!-- @{prefix}-{command}-start --> / <!-- @{prefix}-{command}-end -->
 * Currently supported command: "skip" (removes the enclosed section).
 */

const MARKER_LINE_RE = /^<!-- @[\w]+-[\w]+-(?:start|end) -->\n?/gm

const collapseBlankLines = (s: string): string => s.replace(/\n{3,}/g, '\n\n')

/**
 * Trims EXTRA trailing newlines, and only those. `collapseBlankLines` cannot: a file left
 * with a single trailing blank line ends in `\n\n`, which is two newlines, not three or
 * more. Content that ends without a newline is left exactly as it is — an earlier version
 * of this helper added one, which changed what `pair-cli update` writes for every target and
 * broke a test that pinned a fixture without a trailing newline.
 * A source whose LAST block is skipped always lands there — and the artifact then trips
 * `MD012/no-multiple-blanks` in the very repository that generated it (observed on
 * CLAUDE.md, whose source ends with `@claude-skip-end`: the generated file failed the
 * pre-push gate it is shipped alongside).
 */
const normalizeEnding = (s: string): string => s.replace(/\n{2,}$/, '\n')

const tidy = (s: string): string => normalizeEnding(collapseBlankLines(s))

/**
 * Strips ALL marker comments from content, regardless of prefix or command.
 * Content between markers is preserved. Triple+ blank lines are collapsed and the
 * output ends with exactly one newline.
 */
export function stripAllMarkers(content: string): string {
  return tidy(content.replace(MARKER_LINE_RE, ''))
}

/**
 * Applies transform commands for a specific prefix.
 * For "skip": removes everything between start/end markers (inclusive).
 * Other prefixes' markers are left untouched. Triple+ blank lines are collapsed and the
 * output ends with exactly one newline.
 */
export function applyTransformCommands(content: string, prefix: string): string {
  const skipBlockRe = new RegExp(
    `<!-- @${prefix}-skip-start -->[\\s\\S]*?<!-- @${prefix}-skip-end -->\\n?`,
    'g',
  )
  return tidy(content.replace(skipBlockRe, ''))
}

export type MarkerError = {
  line: number
  message: string
}

const DEFAULT_COMMANDS = ['skip']

const WELL_FORMED_RE = /^<!-- @(\w+)-(\w+)-(start|end) -->$/
const MALFORMED_RE =
  /(?:^<!-- @\w+-\w+-(?:start|end)\b(?! -->))|(?:(?<!<!-- )@\w+-\w+-(?:start|end) -->$)/

type ValidationState = {
  supportedCommands: string[]
  openStack: Map<string, number>
  errors: MarkerError[]
}

function validateLine(line: string, lineNum: number, state: ValidationState): void {
  const trimmed = line.trim()

  if (MALFORMED_RE.test(trimmed)) {
    state.errors.push({ line: lineNum, message: `malformed marker: "${trimmed}"` })
    return
  }

  const match = WELL_FORMED_RE.exec(trimmed)
  if (!match) return

  const [, prefix, command, boundary] = match
  const key = `${prefix!}-${command!}`

  if (!state.supportedCommands.includes(command!)) {
    state.errors.push({
      line: lineNum,
      message: `unsupported command '${command!}' in marker (supported: ${state.supportedCommands.join(', ')})`,
    })
    return
  }

  if (boundary === 'start') {
    if (state.openStack.has(key)) {
      state.errors.push({
        line: lineNum,
        message: `nested '${key}-start' — previous opened at line ${state.openStack.get(key)!}`,
      })
    }
    state.openStack.set(key, lineNum)
  } else if (!state.openStack.has(key)) {
    state.errors.push({
      line: lineNum,
      message: `unmatched '${key}-end' without a preceding start`,
    })
  } else {
    state.openStack.delete(key)
  }
}

/**
 * Validates marker comments in content. Reports:
 * - Malformed markers (incorrect syntax)
 * - Unsupported commands (not in supported list)
 * - Unmatched start/end pairs
 * - Nested markers of same prefix+command
 */
export function validateMarkers(
  content: string,
  supportedCommands: string[] = DEFAULT_COMMANDS,
): MarkerError[] {
  const lines = content.split('\n')
  const state: ValidationState = {
    supportedCommands,
    openStack: new Map(),
    errors: [],
  }

  for (let i = 0; i < lines.length; i++) {
    validateLine(lines[i]!, i + 1, state)
  }

  for (const [key, lineNum] of state.openStack) {
    state.errors.push({ line: lineNum, message: `unmatched '${key}-start' without a closing end` })
  }

  return state.errors
}

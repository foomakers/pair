/**
 * Minimal glob matching for kb-validate's optional link patterns (US-188).
 *
 * Deliberately NOT a new runtime dependency: `pair-cli` is published to npm and
 * this is the only place the CLI needs glob matching, on short path strings with
 * a fixed syntax (`**`, `*`, `?`, `[...]`). See ADL
 * `2026-08-19-optional-link-globs-use-an-internal-matcher.md`.
 *
 * Syntax:
 * - `**` — any characters, separators included
 * - `*`  — any characters except `/`
 * - `?`  — exactly one character except `/`
 * - `[abc]` / `[a-z]` / `[!abc]` — character class (negated with `!` or `^`)
 * - everything else is literal (regex metacharacters are escaped)
 *
 * A pattern is anchored: it must match the WHOLE candidate path, so `apps/**`
 * does not match `vendor/apps/x.md`.
 */

/** A pattern that could not be compiled, kept so the caller can warn about it. */
export interface CompiledPatterns {
  matchers: RegExp[]
  invalid: string[]
}

/**
 * Compiles optional-link glob patterns, separating the malformed ones instead of
 * throwing: a typo in config must not abort a whole validation run (US-188 edge case).
 */
export function compileOptionalLinkPatterns(patterns: string[]): CompiledPatterns {
  const matchers: RegExp[] = []
  const invalid: string[] = []

  for (const pattern of patterns) {
    const compiled = compileGlob(pattern)
    if (compiled === null) {
      invalid.push(pattern)
    } else {
      matchers.push(compiled)
    }
  }

  return { matchers, invalid }
}

/**
 * True when ANY candidate form of the link matches ANY pattern.
 *
 * Callers pass more than one form of the same link (as written in the markdown,
 * and resolved relative to the KB root) because both are legitimate ways to
 * express the same rule — `../../apps/**` is how the link reads, `apps/**` is
 * where it points. First match wins: a link is optional once, never twice, so
 * overlapping patterns cannot produce duplicate warnings.
 */
export function matchesAnyPattern(candidates: string[], matchers: RegExp[]): boolean {
  return candidates.some(candidate => {
    const normalized = normalizePath(candidate)
    return matchers.some(matcher => matcher.test(normalized))
  })
}

/**
 * Compiles one glob to an anchored RegExp, or `null` when malformed
 * (blank, or an unterminated character class).
 */
function compileGlob(pattern: string): RegExp | null {
  // Trimmed here, not by the caller: config-file patterns never pass through the
  // CLI parser, so `" apps/**"` must not compile into a pattern matching nothing.
  const normalized = normalizePath(pattern.trim())
  if (normalized.length === 0) return null

  let source = ''
  let index = 0

  while (index < normalized.length) {
    const char = normalized[index] as string

    if (char === '*') {
      const isGlobstar = normalized[index + 1] === '*'
      if (isGlobstar) {
        source += '.*'
        index += 2
        // `a/**/b` and `a/**b` both keep their remaining separators literal.
      } else {
        source += '[^/]*'
        index += 1
      }
      continue
    }

    if (char === '?') {
      source += '[^/]'
      index += 1
      continue
    }

    if (char === '[') {
      const classEnd = findClassEnd(normalized, index)
      if (classEnd === -1) return null
      source += compileCharacterClass(normalized.slice(index, classEnd + 1))
      index = classEnd + 1
      continue
    }

    source += escapeRegExp(char)
    index += 1
  }

  return new RegExp(`^${source}$`)
}

/** Index of the `]` closing the class opened at `start`, or -1 when unterminated. */
function findClassEnd(pattern: string, start: number): number {
  // A `]` immediately after `[` (or after the negation mark) is a literal `]`.
  let cursor = start + 1
  if (pattern[cursor] === '!' || pattern[cursor] === '^') cursor += 1
  if (pattern[cursor] === ']') cursor += 1

  for (; cursor < pattern.length; cursor += 1) {
    if (pattern[cursor] === ']') return cursor
  }
  return -1
}

function compileCharacterClass(raw: string): string {
  const body = raw.slice(1, -1)
  const negated = body.startsWith('!') || body.startsWith('^')
  const members = negated ? body.slice(1) : body
  // Only `\` and `]` are structural inside a JS character class; ranges (`a-z`)
  // are intentionally passed through, they are the point of the class.
  const escaped = members.replace(/[\\\]]/g, match => `\\${match}`)
  return `[${negated ? '^' : ''}${escaped}]`
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, match => `\\${match}`)
}

/** Windows separators to POSIX, and a leading `./` dropped, on both sides. */
function normalizePath(value: string): string {
  const posix = value.replace(/\\/g, '/')
  return posix.startsWith('./') ? posix.slice(2) : posix
}

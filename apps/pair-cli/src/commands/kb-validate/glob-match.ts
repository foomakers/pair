/**
 * Minimal glob matching for kb-validate's optional link patterns (US-188).
 *
 * Deliberately NOT a new runtime dependency: `pair-cli` is published to npm and
 * this is the only place the CLI needs glob matching, on short path strings with
 * a fixed syntax (`**`, `*`, `?`, `[...]`). See ADL
 * `2026-08-19-optional-link-globs-use-an-internal-matcher.md`.
 *
 * Syntax:
 * - `**` — as a WHOLE path segment: zero or more segments (`a/**\/b` matches `a/b`)
 * - `*`  — any characters except `/` (a `**` that is not a whole segment is one `*`)
 * - `?`  — exactly one character except `/`
 * - `[abc]` / `[a-z]` / `[!abc]` — character class (negated with `!` or `^`)
 * - everything else is literal
 *
 * A pattern is anchored: it must match the WHOLE candidate path, so `apps/**`
 * does not match `vendor/apps/x.md`.
 *
 * NOT minimatch-equivalent, and every divergence measured is MORE permissive: a
 * trailing `/**` also matches the directory itself (`apps/**` matches `apps`), and
 * `**` traverses `..` segments (`**` matches `../../apps/x.ts` — which is the point
 * here, the tolerated links leave the KB). Both are pinned in `glob-match.test.ts`
 * and stated in the CLI reference; see the ADL's Consequences.
 *
 * Matching is NOT regex-based, on purpose: patterns come from a config file and
 * a CLI flag, and a compiled-to-RegExp matcher both throws on some inputs
 * (`[z-a]` — range out of order) and backtracks catastrophically on others
 * (`**a**a**a**b`). The two-pointer matcher below cannot throw and is O(n·m):
 * a malformed pattern is reported through `invalid`, never raised.
 */

/** A pattern compiled once and reusable across every link of every file. */
export interface OptionalLinkMatcher {
  /** True when the (already normalized) candidate path matches. */
  matches(candidate: string): boolean
}

/** Compiled matchers plus the patterns that could not be compiled. */
export interface CompiledPatterns {
  matchers: OptionalLinkMatcher[]
  invalid: string[]
}

/** One element of a compiled pattern segment. */
type Token =
  | { kind: 'star' }
  | { kind: 'any' }
  | { kind: 'literal'; value: string }
  | { kind: 'class'; matches: (char: string) => boolean }

/** One `/`-delimited part of a compiled pattern. */
type Segment = { kind: 'globstar' } | { kind: 'tokens'; tokens: Token[] }

/**
 * Compiles optional-link glob patterns, separating the malformed ones instead of
 * throwing: a typo in config must not abort a whole validation run (US-188 edge case).
 *
 * Malformed = an unterminated character class, or a character class with an
 * out-of-order range (`[z-a]`) — the two shapes a user actually sees warned about.
 * A blank pattern is also rejected, but never from the CLI: the flag parser drops
 * blank entries (`parser.ts`) and the config reader drops them with its own
 * warning (`optional-link-config.ts`), so that branch only guards direct callers
 * of this module.
 */
export function compileOptionalLinkPatterns(patterns: string[]): CompiledPatterns {
  const matchers: OptionalLinkMatcher[] = []
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
export function matchesAnyPattern(candidates: string[], matchers: OptionalLinkMatcher[]): boolean {
  return candidates.some(candidate => {
    const normalized = normalizePath(candidate)
    return matchers.some(matcher => matcher.matches(normalized))
  })
}

/** Compiles one glob into a matcher, or `null` when the pattern is malformed. */
function compileGlob(pattern: string): OptionalLinkMatcher | null {
  // Trimmed here, not by the caller: config-file patterns never pass through the
  // CLI parser, so `" apps/**"` must not compile into a pattern matching nothing.
  const normalized = normalizePath(pattern.trim())
  if (normalized.length === 0) return null

  const segments: Segment[] = []
  for (const raw of normalized.split('/')) {
    if (raw === '**') {
      // Consecutive globstars are one globstar: `**/**/x` === `**/x`.
      if (segments[segments.length - 1]?.kind !== 'globstar') segments.push({ kind: 'globstar' })
      continue
    }
    const tokens = tokenizeSegment(raw)
    if (tokens === null) return null
    segments.push({ kind: 'tokens', tokens })
  }

  return {
    matches: candidate => matchSegments(segments, candidate.split('/')),
  }
}

/** Compiles one path segment to tokens, or `null` when it contains a malformed class. */
function tokenizeSegment(segment: string): Token[] | null {
  const tokens: Token[] = []
  let index = 0

  while (index < segment.length) {
    const char = segment[index] as string

    if (char === '*') {
      // A `**` that is not a whole segment is just `*` — it cannot cross `/`.
      if (tokens[tokens.length - 1]?.kind !== 'star') tokens.push({ kind: 'star' })
      index += 1
      continue
    }

    if (char === '?') {
      tokens.push({ kind: 'any' })
      index += 1
      continue
    }

    if (char === '[') {
      const classEnd = findClassEnd(segment, index)
      if (classEnd === -1) return null
      const compiled = compileCharacterClass(segment.slice(index + 1, classEnd))
      if (compiled === null) return null
      tokens.push(compiled)
      index = classEnd + 1
      continue
    }

    tokens.push({ kind: 'literal', value: char })
    index += 1
  }

  return tokens
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

/**
 * Compiles the body of a `[...]` class into a predicate, or `null` when a range is
 * out of order (`[z-a]`) — malformed, and reported as such rather than thrown on.
 */
function compileCharacterClass(body: string): Token | null {
  const negated = body.startsWith('!') || body.startsWith('^')
  const members = negated ? body.slice(1) : body
  if (members.length === 0) return null

  const literals = new Set<string>()
  const ranges: Array<[string, string]> = []
  let index = 0

  while (index < members.length) {
    const low = members[index] as string
    const isRange = members[index + 1] === '-' && index + 2 < members.length
    if (isRange) {
      const high = members[index + 2] as string
      if (low > high) return null
      ranges.push([low, high])
      index += 3
      continue
    }
    literals.add(low)
    index += 1
  }

  const contains = (char: string): boolean =>
    literals.has(char) || ranges.some(([low, high]) => char >= low && char <= high)

  return { kind: 'class', matches: char => (negated ? !contains(char) : contains(char)) }
}

/**
 * The wildcard match, written ONCE for both levels (segments against a path, tokens
 * against one segment): greedy consume, remember the last wildcard position, and on a
 * mismatch let that wildcard swallow one more element and retry from just after it.
 *
 * Two-pointer with a single backtrack anchor (the classic wildcard algorithm): the last
 * wildcard is the only place to retry, so the cost is O(pattern·input) worst case and no
 * input can make it hang. Generic on purpose — the algorithm's correctness is subtle and
 * one copy per level would let a fix land in one and not the other.
 */
function matchWildcard<P, I>(
  pattern: readonly P[],
  input: readonly I[],
  isWildcard: (element: P) => boolean,
  matchOne: (element: P, item: I) => boolean,
): boolean {
  let patternIndex = 0
  let inputIndex = 0
  let wildcardPattern = -1
  let wildcardInput = -1

  while (inputIndex < input.length) {
    const element = pattern[patternIndex]

    if (element !== undefined && isWildcard(element)) {
      wildcardPattern = patternIndex
      wildcardInput = inputIndex
      patternIndex += 1
      continue
    }

    if (element !== undefined && matchOne(element, input[inputIndex] as I)) {
      patternIndex += 1
      inputIndex += 1
      continue
    }

    if (wildcardPattern === -1) return false

    // Let the wildcard swallow one more element and retry from just after it.
    wildcardInput += 1
    patternIndex = wildcardPattern + 1
    inputIndex = wildcardInput
  }

  // Trailing wildcards can still match nothing.
  while (patternIndex < pattern.length && isWildcard(pattern[patternIndex] as P)) patternIndex += 1
  return patternIndex === pattern.length
}

/** Matches compiled segments against candidate segments, `**` consuming zero or more. */
function matchSegments(pattern: Segment[], candidate: string[]): boolean {
  return matchWildcard(
    pattern,
    candidate,
    segment => segment.kind === 'globstar',
    (segment, value) => segment.kind === 'tokens' && matchTokens(segment.tokens, value),
  )
}

/** Same match, one level down: tokens against the characters of one segment. */
function matchTokens(tokens: Token[], value: string): boolean {
  return matchWildcard(
    tokens,
    // `split('')`, not `[...value]`: the pattern is tokenized by UTF-16 code unit too,
    // so both sides must be split the same way.
    value.split(''),
    token => token.kind === 'star',
    (token, char) => matchToken(token, char),
  )
}

function matchToken(token: Token, char: string): boolean {
  switch (token.kind) {
    case 'any':
      return true
    case 'literal':
      return token.value === char
    case 'class':
      return token.matches(char)
    case 'star':
      return false
  }
}

/** Windows separators to POSIX, and a leading `./` dropped, on both sides. */
function normalizePath(value: string): string {
  const posix = value.replace(/\\/g, '/')
  return posix.startsWith('./') ? posix.slice(2) : posix
}

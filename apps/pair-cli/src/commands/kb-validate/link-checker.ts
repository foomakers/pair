import type { FileSystemService } from '@pair/content-ops'
import type { HttpClientService } from '@pair/content-ops'
import { join, dirname, isAbsolute, relative } from 'path'
import type { OptionalLinkMatcher } from './glob-match'
import { compileOptionalLinkPatterns, matchesAnyPattern } from './glob-match'

/**
 * Link validation result
 */
export interface LinkValidationResult {
  file: string
  valid: boolean
  errors: string[]
  warnings: string[]
}

/**
 * Options for link validation
 */
export interface LinkValidationOptions {
  baseDir: string
  files: string[]
  fs: FileSystemService
  /**
   * When supplied AND `strict` is set, external (`http`/`https`) links are probed
   * with an HTTP HEAD. No CLI path supplies one today — `pair kb-validate --strict`
   * makes zero network requests — so this is a module-level capability only.
   */
  httpClient?: HttpClientService
  /** Zero tolerance: optional link patterns are discarded, every miss is an error. */
  strict?: boolean
  /**
   * Globs (US-188) marking a MISSING internal link target as optional: matched
   * misses become warnings instead of errors, so a KB validated on its own does
   * not fail on links into a codebase that is not checked out beside it.
   * `--strict` overrides this — strict tolerates nothing, by definition.
   */
  optionalLinkPatterns?: string[]
}

/**
 * Outcome of one link-validation run: the per-file results, plus the run-level
 * diagnostics (today: one message per optional link pattern that cannot be
 * compiled).
 *
 * The diagnostics are RETURNED rather than logged here so this module stays
 * pure — results in, results out — and the caller owns every output channel:
 * the CLI handler logs them on stderr AND counts them in the report footer,
 * which a module writing straight to stderr could not offer.
 */
export interface LinkValidationRun {
  results: LinkValidationResult[]
  diagnostics: string[]
}

/**
 * Validates links in markdown files
 * @param options - Validation options
 * @returns Per-file validation results plus run-level diagnostics
 */
export async function validateLinks(options: LinkValidationOptions): Promise<LinkValidationRun> {
  const { baseDir, files, fs, httpClient, strict, optionalLinkPatterns } = options

  // Compiled ONCE per run, not per file: a malformed pattern must be reported
  // once, and the matchers are reused across every link of every file.
  // Compiled EVEN IN STRICT MODE: strict discards the matchers (it tolerates
  // nothing), but a typo in the config must still be reported — CI is exactly
  // where `--strict` runs and where a silent typo would go unnoticed.
  const { matchers, invalid } = compileOptionalLinkPatterns(optionalLinkPatterns ?? [])
  const diagnostics = invalid.map(formatInvalidOptionalLinkPattern)
  const optionalMatchers = strict ? [] : matchers

  const results: LinkValidationResult[] = []

  for (const file of files) {
    const result =
      strict && httpClient
        ? await validateFileLinks({ file, baseDir, fs, httpClient, optionalMatchers })
        : await validateFileLinks({ file, baseDir, fs, optionalMatchers })
    results.push(result)
  }

  return { results, diagnostics }
}

/** The one wording for "this pattern could not be compiled". */
function formatInvalidOptionalLinkPattern(pattern: string): string {
  return `Invalid optional link pattern '${pattern}', ignoring`
}

/**
 * Validates links in a single file
 */
async function validateFileLinks(params: {
  file: string
  baseDir: string
  fs: FileSystemService
  httpClient?: HttpClientService
  optionalMatchers: OptionalLinkMatcher[]
}): Promise<LinkValidationResult> {
  const { file, fs } = params

  const errors: string[] = []
  const warnings: string[] = []

  const content = await fs.readFile(file)

  for (const link of extractLinks(content)) {
    const { error, warning } = await classifyLink(link, params)
    if (error) errors.push(error)
    if (warning) warnings.push(warning)
  }

  return {
    file,
    valid: errors.length === 0,
    errors,
    warnings,
  }
}

/**
 * One link's verdict: an error, a warning, or neither.
 *
 * Three families, in order: probe-able external links (`http`/`https`, checked only
 * when an httpClient is supplied), links carrying ANY other URI scheme, and internal
 * paths.
 */
async function classifyLink(
  link: string,
  params: {
    file: string
    baseDir: string
    fs: FileSystemService
    httpClient?: HttpClientService
    optionalMatchers: OptionalLinkMatcher[]
  },
): Promise<{ error?: string; warning?: string }> {
  const { file, baseDir, fs, httpClient, optionalMatchers } = params

  if (isExternalLink(link)) {
    // External link - only validate if httpClient provided (strict mode), and only
    // when it carries a scheme to request: a protocol-relative `//host/x` has none.
    if (!httpClient || !isProbeableExternalLink(link)) return {}
    const externalResult = await validateExternalLink(link, httpClient)
    return externalResult.valid ? {} : { warning: `Unreachable external link: ${link}` }
  }

  // Any OTHER URI scheme (`mailto:`, `tel:`, `ftp:`, `vscode:`) addresses something
  // that is not a file: nothing to stat, and nothing this CLI can fetch. Skipped
  // entirely — treating it as a relative path would join it onto the source
  // directory and report a link that is not broken as broken.
  if (hasNonFileUriScheme(link)) return {}

  // Internal link - always validate
  const internalResult = await validateInternalLink(link, file, baseDir, fs)
  if (internalResult.valid) return {}

  return isOptionalLink(link, internalResult.targetPath, baseDir, optionalMatchers)
    ? { warning: `optional link (pattern-matched), target missing: ${link}` }
    : { error: `Broken internal link: ${link}` }
}

/**
 * Strip fenced code blocks from markdown content to avoid false-positive link matches
 * inside code examples (e.g. regex with pipes, JS callbacks parsed as links).
 */
function stripFencedCodeBlocks(content: string): string {
  // Match ``` or ```` (with optional language) to closing fence of same length
  return content.replace(/^(`{3,})[^\n]*\n[\s\S]*?^\1\s*$/gm, '')
}

/**
 * Extracts markdown links from content
 * Matches [text](url) format, ignoring content inside fenced code blocks
 */
function extractLinks(content: string): string[] {
  const stripped = stripFencedCodeBlocks(content)
  const linkRegex = /\[([^\]]+)\]\(([^)]+)\)/g
  const links: string[] = []

  let match
  while ((match = linkRegex.exec(stripped)) !== null) {
    const url = match[2]
    if (url) {
      const destination = linkDestination(url)
      if (destination) links.push(destination)
    }
  }

  return links
}

/**
 * The DESTINATION of a CommonMark inline link, from everything the extractor
 * captured between the parentheses.
 *
 * Two forms are unwrapped, because both are valid markdown that used to be
 * stat-ed verbatim and reported broken while the file existed:
 * - an optional title after the destination — `[a](./b.md "T")`, `'T'`;
 * - an angle-bracket destination — `[a](<./my file.md>)`, the only way to spell
 *   a destination containing spaces.
 *
 * A parenthesised title (`[a](./b.md (T))`) is NOT handled: the extractor's regex
 * stops at the first `)`, so the destination never reaches here whole. Out of
 * scope (pinned by a test) — it needs balanced-paren parsing, i.e. a real parser.
 */
function linkDestination(raw: string): string {
  const withoutTitle = raw.trim().replace(/\s+(?:"[^"]*"|'[^']*')$/, '')
  const angled = /^<(.*)>$/.exec(withoutTitle)
  return (angled?.[1] ?? withoutTitle).trim()
}

/**
 * Checks if a link is external: `http(s)://…`, or the PROTOCOL-RELATIVE form
 * `//cdn.example.com/x.png`, which inherits the page's scheme and is a URL, not
 * a path — `isAbsolute('//…')` is true, so without this it was joined onto the
 * KB root and reported broken. Only the `http(s)` form is probe-able (a
 * protocol-relative URL carries no scheme to request); every other scheme is
 * handled by `hasNonFileUriScheme`.
 */
function isExternalLink(link: string): boolean {
  return /^(?:https?:)?\/\//i.test(link)
}

/** External AND carrying an explicit http(s) scheme, so it can be HEAD-requested. */
function isProbeableExternalLink(link: string): boolean {
  return /^https?:\/\//i.test(link)
}

/**
 * True for a link carrying an RFC-3986 scheme this module cannot resolve as a
 * file — `mailto:`, `tel:`, `ftp:`, `vscode:`, … (http/https are handled first).
 *
 * A Windows drive letter (`C:/x`, `C:\x`) is deliberately NOT a scheme: it is a
 * single letter, and it IS a filesystem path, so it keeps going down the
 * internal-link route.
 */
function hasNonFileUriScheme(link: string): boolean {
  return /^[a-z][a-z0-9+.-]+:/i.test(link)
}

/**
 * Validates an internal link
 */
async function validateInternalLink(
  link: string,
  sourceFile: string,
  baseDir: string,
  fs: FileSystemService,
): Promise<{ valid: boolean; targetPath?: string }> {
  // Handle anchor-only links (#section)
  if (link.startsWith('#')) {
    // Anchor within same file - assume valid
    return { valid: true }
  }

  // Split link and anchor (path#anchor)
  const [pathPart] = link.split('#')
  if (!pathPart) {
    return { valid: true }
  }

  // Resolve link path
  let targetPath: string
  if (isAbsolute(pathPart)) {
    // Absolute path - resolve from baseDir
    targetPath = join(baseDir, pathPart)
  } else {
    // Relative path - resolve from source file directory
    const sourceDir = dirname(sourceFile)
    targetPath = join(sourceDir, pathPart)
  }

  // Check if target exists
  const exists = await fs.exists(targetPath)
  return { valid: exists, targetPath }
}

/**
 * Whether a MISSING internal link target is declared optional (US-188).
 *
 * The resolved target relative to the KB root (`apps/x.ts`) is ALWAYS a candidate.
 * The path as written (`../../apps/x.ts`) is offered as a second candidate ONLY
 * when it is a genuine SPELLING of that same resolved target — i.e. stripping its
 * leading `../` segments yields exactly the resolved form (the `../` climb lands
 * on the KB root) — or when the resolved form itself leaves the KB tree.
 *
 * That is the case the written form exists for: for a target outside the KB the
 * `../` depth varies with the source file's depth while the resolved form does
 * not, so a maintainer legitimately writes the rule either way. Every other
 * link — in-tree (`apps/x.md`, `./apps/x.md`) or parent-relative but landing
 * back INSIDE the KB (`../../apps/y.md` from `.pair/knowledge/a/b/`) — is
 * matched on its resolved form only. Otherwise a rule meaning "KB-root-relative
 * `apps/`" would also silence a broken link that merely LOOKS like it (a moved
 * file whose `../` depth is now wrong resolves to a path that will never exist),
 * which is the exact failure a link validator exists to catch.
 *
 * String matching only: nothing here reads the filesystem, so an optional
 * pattern can never widen what kb-validate touches outside the KB root.
 */
function isOptionalLink(
  link: string,
  targetPath: string | undefined,
  baseDir: string,
  optionalMatchers: OptionalLinkMatcher[],
): boolean {
  if (optionalMatchers.length === 0) return false

  const [writtenPath] = link.split('#')
  const resolved = targetPath ? relative(baseDir, targetPath) : undefined
  const candidates = [
    ...(writtenPath && describesResolvedTarget(writtenPath, resolved) ? [writtenPath] : []),
    ...(resolved === undefined ? [] : [resolved]),
  ]

  return matchesAnyPattern(candidates, optionalMatchers)
}

/**
 * True when the link AS WRITTEN is a legitimate spelling of `resolved` — its
 * leading `../` segments stripped equal the resolved form (the climb reaches the
 * KB root) — or when `resolved` itself escapes the KB root, where the written
 * form is the only stable way to express the rule.
 */
function describesResolvedTarget(writtenPath: string, resolved: string | undefined): boolean {
  if (resolved === undefined || !escapesSourceDir(writtenPath)) return false
  const resolvedPosix = toPosix(resolved)
  if (resolvedPosix.startsWith('../')) return true
  return toPosix(writtenPath).replace(/^(?:\.\/)?(?:\.\.\/)+/, '') === resolvedPosix
}

/** True for a link written as a parent-relative path (`../x`, `..\\x`, `./../x`). */
function escapesSourceDir(writtenPath: string): boolean {
  const posix = toPosix(writtenPath)
  const withoutDotSlash = posix.startsWith('./') ? posix.slice(2) : posix
  return withoutDotSlash.startsWith('../')
}

/** Windows-style separators normalized, so written and resolved forms compare. */
function toPosix(path: string): string {
  return path.replace(/\\/g, '/')
}

/**
 * Validates an external link via HTTP HEAD
 * Includes a 2-second timeout to prevent hanging on unreachable URLs
 */
async function validateExternalLink(
  link: string,
  httpClient: HttpClientService,
): Promise<{ valid: boolean }> {
  return new Promise(resolve => {
    let resolved = false

    // Timeout after 2 seconds
    const timeout = setTimeout(() => {
      if (!resolved) {
        resolved = true
        resolve({ valid: false })
      }
    }, 2000)

    const request = httpClient.request(link, { method: 'HEAD' }, res => {
      if (!resolved) {
        resolved = true
        clearTimeout(timeout)
        // Any response (even 4xx/5xx) means the link is reachable
        resolve({ valid: !!res })
      }
    })

    request.on('error', () => {
      if (!resolved) {
        resolved = true
        clearTimeout(timeout)
        resolve({ valid: false })
      }
    })

    request.end()
  })
}

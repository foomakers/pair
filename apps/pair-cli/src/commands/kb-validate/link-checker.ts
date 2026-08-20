import type { FileSystemService } from '@pair/content-ops'
import type { HttpClientService } from '@pair/content-ops'
import { logger } from '@pair/content-ops'
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
  httpClient?: HttpClientService
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
 * Validates links in markdown files
 * @param options - Validation options
 * @returns Validation results per file
 */
export async function validateLinks(
  options: LinkValidationOptions,
): Promise<LinkValidationResult[]> {
  const { baseDir, files, fs, httpClient, strict, optionalLinkPatterns } = options

  // Compiled ONCE per run, not per file: a malformed pattern must be reported
  // once, and the matchers are reused across every link of every file.
  // Compiled EVEN IN STRICT MODE: strict discards the matchers (it tolerates
  // nothing), but a typo in the config must still be reported — CI is exactly
  // where `--strict` runs and where a silent typo would go unnoticed.
  const { matchers, invalid } = compileOptionalLinkPatterns(optionalLinkPatterns ?? [])
  for (const pattern of invalid) {
    logger.warn(formatInvalidOptionalLinkPattern(pattern))
  }
  const optionalMatchers = strict ? [] : matchers

  const results: LinkValidationResult[] = []

  for (const file of files) {
    const result =
      strict && httpClient
        ? await validateFileLinks({ file, baseDir, fs, httpClient, optionalMatchers })
        : await validateFileLinks({ file, baseDir, fs, optionalMatchers })
    results.push(result)
  }

  return results
}

/** The one wording for "this pattern could not be compiled", logged and reported. */
function formatInvalidOptionalLinkPattern(pattern: string): string {
  return `Invalid optional link pattern '${pattern}', ignoring`
}

/**
 * Run-level diagnostics for a set of optional link patterns — one message per
 * pattern that cannot be compiled.
 *
 * Exported so a caller can put the SAME messages `validateLinks` logs into the
 * validation report as well: a diagnostic that only reaches the log would leave
 * the report footer printing `Warnings: 0` on a run that just reported a typo.
 * Compiling twice (here and inside `validateLinks`) is pure string work on a
 * handful of patterns — cheaper than threading a second return value through
 * every call site of `validateLinks`.
 */
export function describeInvalidOptionalLinkPatterns(patterns: string[] | undefined): string[] {
  const { invalid } = compileOptionalLinkPatterns(patterns ?? [])
  return invalid.map(formatInvalidOptionalLinkPattern)
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
  const { file, baseDir, fs, httpClient, optionalMatchers } = params

  const errors: string[] = []
  const warnings: string[] = []

  // Read file content
  const content = await fs.readFile(file)

  // Extract links from markdown
  const links = extractLinks(content)

  // Validate each link
  for (const link of links) {
    if (isExternalLink(link)) {
      // External link - only validate if httpClient provided (strict mode)
      if (httpClient) {
        const externalResult = await validateExternalLink(link, httpClient)
        if (!externalResult.valid) {
          warnings.push(`Unreachable external link: ${link}`)
        }
      }
    } else {
      // Internal link - always validate
      const internalResult = await validateInternalLink(link, file, baseDir, fs)
      if (!internalResult.valid) {
        if (isOptionalLink(link, internalResult.targetPath, baseDir, optionalMatchers)) {
          warnings.push(`optional link (pattern-matched), target missing: ${link}`)
        } else {
          errors.push(`Broken internal link: ${link}`)
        }
      }
    }
  }

  return {
    file,
    valid: errors.length === 0,
    errors,
    warnings,
  }
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
      links.push(url)
    }
  }

  return links
}

/**
 * Checks if a link is external (http/https)
 */
function isExternalLink(link: string): boolean {
  return link.startsWith('http://') || link.startsWith('https://')
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
  if (resolved.startsWith('../')) return true
  return toPosix(writtenPath).replace(/^(?:\.\/)?(?:\.\.\/)+/, '') === resolved
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

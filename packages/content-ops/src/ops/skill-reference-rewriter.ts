/**
 * Skill reference rewriter for flatten+prefix transforms.
 *
 * When skills are copied with naming transforms (e.g., catalog/next → pair-catalog-next),
 * cross-references like `/next` or `/verify-quality` in file body text must be updated
 * to their new prefixed names (`/pair-catalog-next`, `/pair-capability-verify-quality`).
 *
 * Pattern: pure rewrite function + async file orchestrator (same shape as link-rewriter).
 *
 * Fenced code blocks (```...``` or ~~~...~~~) are left untouched — a skill name quoted
 * as example text inside a fenced block is not a live invocation. Inline code spans
 * (single backtick, e.g. `` `/next` ``) are still rewritten.
 *
 * Known limitation: fence detection is column-anchored to ≤3 leading spaces
 * (matching CommonMark's rule for top-level fences), so a fence nested
 * inside a blockquote (e.g. `> ```) is never recognized as fenced and its
 * content is rewritten like normal prose — the inverse of the guarantee
 * above. Not fixed: KB skill bodies don't use blockquoted fences, and
 * correctly supporting them needs blockquote-prefix-aware line stripping,
 * which is a larger change for a case that doesn't occur in practice.
 */

import { logger } from '../observability'
import { FileSystemService } from '../file-system'
import { transformPath, isRegistryEntryPath, type TransformOpts } from './naming-transforms'

/** Maps original (short) skill name → new (prefixed) skill name */
export type SkillNameMap = Map<string, string>

/**
 * Maps a dataset skill-directory substring (`.skills/<category>/<name>/`) to
 * its installed equivalent (`.claude/skills/<transformed-name>/`). Used to
 * convert SKILL.md cross-reference link PATHS in non-`.skills` copied files —
 * the counterpart to `SkillNameMap`, which only covers the `/command` tokens.
 */
export type SkillLinkPathMap = Map<string, string>

export type RewriteSkillRefsParams = {
  fileService: FileSystemService
  files: string[]
  skillNameMap: SkillNameMap
}

export type RewriteSkillLinkPathsParams = {
  fileService: FileSystemService
  files: string[]
  linkMap: SkillLinkPathMap
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/**
 * Builds a boundary-aware, single-line regex matching `/name` for a given skill name.
 * Boundary characters (before): start-of-line, whitespace, backtick, double-quote, (, |
 * Boundary characters (after): end-of-line, whitespace, backtick, double-quote, ), |, , . : ; ! ? ]
 */
function buildReferenceRegex(name: string): RegExp {
  return new RegExp(`(?<=^|[\\s\`"(|])\\/${escapeRegex(name)}(?=$|[\\s\`")|,.:;!?\\]])`, 'g')
}

/** Detects a fenced code block delimiter line (```/~~~, up to 3 leading spaces, optional info string). */
const FENCE_OPEN_RE = /^ {0,3}(`{3,}|~{3,})/

/**
 * Matches a fence-open line, honoring the CommonMark rule that a
 * backtick-fence's info string (the text after the marker on the opening
 * line) must itself be backtick-free. Without this check, a single-line
 * construct like `` ```inline `code` span``` `` — which CommonMark does NOT
 * treat as a fence at all — would be misclassified as fence-open here and
 * suppress rewriting for the rest of the file (no closing marker would ever
 * legitimately match). Tilde fences have no such restriction, since
 * backticks in their info string are unambiguous.
 *
 * Known limitation (not handled): fences nested inside a blockquote
 * (e.g. `> ```) are column-anchored out of this check entirely — see
 * module docs.
 */
function matchFenceOpen(line: string): { char: string; len: number } | null {
  const m = FENCE_OPEN_RE.exec(line)
  if (!m) return null
  const marker = m[1]!
  const char = marker[0]!
  if (char === '`') {
    const infoString = line.slice(m[0].length)
    if (infoString.includes('`')) return null
  }
  return { char, len: marker.length }
}

function isFenceClose(line: string, fenceChar: string, fenceLen: number): boolean {
  const m = /^ {0,3}(`+|~+)\s*$/.exec(line)
  if (!m) return false
  const marker = m[1]!
  return marker[0] === fenceChar && marker.length >= fenceLen
}

/**
 * Splits content into lines and applies `transform` to every line that is
 * NOT inside a fenced code block. Fence delimiter lines and their contents
 * are passed through unchanged. Rejoins with '\n'.
 */
function transformOutsideFences(content: string, transform: (line: string) => string): string {
  const lines = content.split('\n')
  const result: string[] = []
  let fence: { char: string; len: number } | null = null

  for (const line of lines) {
    if (fence) {
      result.push(line)
      if (isFenceClose(line, fence.char, fence.len)) fence = null
      continue
    }

    const opened = matchFenceOpen(line)
    if (opened) {
      fence = opened
      result.push(line)
      continue
    }

    result.push(transform(line))
  }

  return result.join('\n')
}

/**
 * Rewrites skill cross-references in content.
 * Replaces `/oldName` with `/newName` for every entry in the map.
 * Entries are processed longest-first to avoid partial matches.
 * Content inside fenced code blocks is left untouched (see module docs).
 */
export function rewriteSkillReferences(content: string, skillNameMap: SkillNameMap): string {
  if (skillNameMap.size === 0) return content

  const sorted = [...skillNameMap.entries()].sort((a, b) => b[0].length - a[0].length)
  // Compile each pattern once per call, not once per line — String.replace() resets a
  // global regex's lastIndex to 0 at the start of every call, so reusing the same
  // compiled RegExp across lines is safe (unlike reusing it across .test() calls).
  const compiled = sorted.map(
    ([oldName, newName]) => [buildReferenceRegex(oldName), newName] as const,
  )

  return transformOutsideFences(content, line => {
    let result = line
    for (const [pattern, newName] of compiled) {
      result = result.replace(pattern, `/${newName}`)
    }
    return result
  })
}

/**
 * Scans content (skipping fenced code blocks) for literal `/name` invocations
 * matching any of the given names. Used to detect references to skills that
 * are no longer in the registry (e.g. removed/disabled) so callers can warn
 * instead of silently rewriting or dropping them.
 */
export function findSkillReferences(content: string, names: Iterable<string>): string[] {
  const nameList = [...new Set(names)].filter(n => n.length > 0)
  if (nameList.length === 0) return []

  const found = new Set<string>()
  transformOutsideFences(content, line => {
    for (const name of nameList) {
      if (buildReferenceRegex(name).test(line)) found.add(name)
    }
    return line
  })
  return [...found]
}

/**
 * Builds a skill name map from the directory mapping collected during copy.
 * For each transformed directory: leafName (original) → transformedName (new).
 *
 * Directories BELOW the registry's entry granularity are skipped: with a bounded
 * flatten (`flattenDepth`, #407) a skill's `references/` sub-dir is a real
 * sub-path and therefore appears in the mapping, but it is content, not a skill
 * — see `isRegistryEntryPath`.
 *
 * Typed as the full `TransformOpts` on purpose: it is forwarded verbatim to
 * `transformPath`, which reads `flattenDepth` too, so a narrower declared type
 * would invite a refactor to rebuild the object and silently drop the depth.
 */
export function buildSkillNameMap(
  dirMappingFiles: Map<string, string[]>,
  transformOpts: TransformOpts,
): SkillNameMap {
  const map: SkillNameMap = new Map()
  for (const originalSubDir of dirMappingFiles.keys()) {
    if (!isRegistryEntryPath(originalSubDir, transformOpts.flattenDepth)) continue
    const leafName = originalSubDir.split('/').pop()!
    const transformedName = transformPath(originalSubDir, transformOpts)
    if (leafName !== transformedName) {
      map.set(leafName, transformedName)
    }
  }
  return map
}

/**
 * Rewrites skill references in all provided .md files.
 * Reads each file, applies rewriteSkillReferences, writes back if changed.
 */
export async function rewriteSkillReferencesInFiles(params: RewriteSkillRefsParams): Promise<void> {
  const { fileService, files, skillNameMap } = params

  for (const filePath of files) {
    if (!filePath.endsWith('.md')) continue
    const content = await fileService.readFile(filePath)
    const rewritten = rewriteSkillReferences(content, skillNameMap)
    if (rewritten !== content) {
      await fileService.writeFile(filePath, rewritten)
      logger.info(`Skill reference rewriter: updated references in ${filePath}`)
    }
  }
}

/**
 * Builds a skill link-path map from the directory mapping collected during a
 * flatten+prefix skills copy — the SAME `dirMappingFiles` used to build the
 * `SkillNameMap`. Each nested (`category/name`) skill directory yields a
 * mapping from its dataset `.skills/<category>/<name>/SKILL.md` link to the
 * installed `.claude/skills/<transformed-name>/SKILL.md` link.
 *
 * Keyed on a RELATIVE-LINK form — `../.skills/<cat>/<name>/SKILL.md` — not a
 * bare path, deliberately, so it matches only actual markdown links and never
 * PROSE that mentions a dataset path:
 *   - a bare directory path appears in prose describing the dataset layout
 *     (e.g. "new path: `.skills/capability/foo/`") — no `SKILL.md`, no `../`;
 *   - a repo-relative file path appears in prose too (e.g.
 *     "`packages/knowledge-hub/dataset/.skills/process/foo/SKILL.md`") — has
 *     `SKILL.md` but is preceded by `dataset/`, not `../`.
 * Only a real relative link (`](../../.skills/<cat>/<name>/SKILL.md)`) carries
 * a leading `../`, since `.skills` sits at the repo root and every referencing
 * file is nested under it. Matching the single leading `../` (a substring of
 * `../../…`, `../../../…`, etc.) redirects the link while preserving all
 * additional `../` segments, so it works at any file depth. Bare top-level
 * dirs (e.g. `next`, no category) are skipped — no SKILL.md cross-reference.
 *
 * Contract: converts only a skill's `SKILL.md` entrypoint link. Deep links to
 * other files inside a skill dir (e.g. `references/*.md`) are NOT converted —
 * none exist in the KB today; add per-file mappings here if that changes.
 * For the same reason a directory below the entry granularity is skipped (#407):
 * a `references/` sub-dir holds no `SKILL.md` of its own. `TransformOpts` (not a
 * narrower shape) for the reason given on `buildSkillNameMap`.
 */
export function buildSkillLinkPathMap(
  dirMappingFiles: Map<string, string[]>,
  transformOpts: TransformOpts,
): SkillLinkPathMap {
  const map: SkillLinkPathMap = new Map()
  for (const originalSubDir of dirMappingFiles.keys()) {
    if (!originalSubDir.includes('/')) continue
    if (!isRegistryEntryPath(originalSubDir, transformOpts.flattenDepth)) continue
    const transformed = transformPath(originalSubDir, transformOpts)
    map.set(`../.skills/${originalSubDir}/SKILL.md`, `../.claude/skills/${transformed}/SKILL.md`)
  }
  return map
}

/**
 * Rewrites skill SKILL.md link paths in content via plain substring
 * replacement, longest key first (so a longer path is never pre-empted by a
 * prefix of it). Idempotent: an installed path (`.claude/skills/...`) contains
 * no source `.skills/<category>/` substring, so a second pass is a no-op.
 */
export function rewriteSkillLinkPaths(content: string, linkMap: SkillLinkPathMap): string {
  if (linkMap.size === 0) return content

  const sorted = [...linkMap.entries()].sort((a, b) => b[0].length - a[0].length)
  let result = content
  for (const [from, to] of sorted) {
    result = result.split(from).join(to)
  }
  return result
}

/**
 * Rewrites skill link paths in all provided .md files.
 * Reads each file, applies rewriteSkillLinkPaths, writes back if changed.
 */
export async function rewriteSkillLinkPathsInFiles(
  params: RewriteSkillLinkPathsParams,
): Promise<void> {
  const { fileService, files, linkMap } = params
  if (linkMap.size === 0) return

  for (const filePath of files) {
    if (!filePath.endsWith('.md')) continue
    const content = await fileService.readFile(filePath)
    const rewritten = rewriteSkillLinkPaths(content, linkMap)
    if (rewritten !== content) {
      await fileService.writeFile(filePath, rewritten)
      logger.info(`Skill link-path rewriter: updated links in ${filePath}`)
    }
  }
}

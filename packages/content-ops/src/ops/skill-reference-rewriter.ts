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
 */

import { logger } from '../observability'
import { FileSystemService } from '../file-system'
import { transformPath } from './naming-transforms'

/** Maps original (short) skill name → new (prefixed) skill name */
export type SkillNameMap = Map<string, string>

export type RewriteSkillRefsParams = {
  fileService: FileSystemService
  files: string[]
  skillNameMap: SkillNameMap
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

function matchFenceOpen(line: string): { char: string; len: number } | null {
  const m = FENCE_OPEN_RE.exec(line)
  if (!m) return null
  const marker = m[1]!
  return { char: marker[0]!, len: marker.length }
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

  return transformOutsideFences(content, line => {
    let result = line
    for (const [oldName, newName] of sorted) {
      result = result.replace(buildReferenceRegex(oldName), `/${newName}`)
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
 */
export function buildSkillNameMap(
  dirMappingFiles: Map<string, string[]>,
  transformOpts: { flatten?: boolean; prefix?: string },
): SkillNameMap {
  const map: SkillNameMap = new Map()
  for (const originalSubDir of dirMappingFiles.keys()) {
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

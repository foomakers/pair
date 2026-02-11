/**
 * Skill reference rewriter for flatten+prefix transforms.
 *
 * When skills are copied with naming transforms (e.g., catalog/next → pair-catalog-next),
 * cross-references like `/next` or `/verify-quality` in file body text must be updated
 * to their new prefixed names (`/pair-catalog-next`, `/pair-capability-verify-quality`).
 *
 * Pattern: pure rewrite function + async file orchestrator (same shape as link-rewriter).
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
 * Rewrites skill cross-references in content.
 * Replaces `/oldName` with `/newName` for every entry in the map.
 * Entries are processed longest-first to avoid partial matches.
 *
 * Boundary characters (before): start-of-line, whitespace, backtick, double-quote, (, |
 * Boundary characters (after): end-of-line, whitespace, backtick, double-quote, ), |, , . : ; ! ? ]
 */
export function rewriteSkillReferences(content: string, skillNameMap: SkillNameMap): string {
  if (skillNameMap.size === 0) return content

  const sorted = [...skillNameMap.entries()].sort((a, b) => b[0].length - a[0].length)

  let result = content
  for (const [oldName, newName] of sorted) {
    const pattern = new RegExp(
      `(?<=^|[\\s\`"(|])\\/${escapeRegex(oldName)}(?=$|[\\s\`")|,.:;!?\\]])`,
      'gm',
    )
    result = result.replace(pattern, `/${newName}`)
  }

  return result
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

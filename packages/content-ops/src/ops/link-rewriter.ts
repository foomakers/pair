import { posix } from 'path'
import { logger } from '../observability'
import { FileSystemService } from '../file-system'
import { extractLinks } from '../markdown/link-processor'
import { isExternalLink } from '../file-system/file-system-utils'
import type { ParsedLink } from '../markdown/markdown-parser'

/**
 * Parameters for rewriting links in a single file after flatten/prefix copy.
 */
export type RewriteLinksInFileParams = {
  fileService: FileSystemService
  filePath: string
  originalDir: string
  newDir: string
  datasetRoot: string
  /** When source content lives under a subdirectory of datasetRoot (e.g.,
   *  `packages/kb/dataset`), links resolving under that subtree are re-rooted
   *  to datasetRoot so they point to the installed copy, not the source. */
  sourceContentRoot?: string
  /**
   * Every directory this copy moved, as absolute paths. A link can point OUTSIDE
   * the file's own directory — a sub-doc's `../SKILL.md` points at its parent —
   * and that parent may have moved too. Without this the target fell through to
   * the source-root fallback and came out as a path back into the dataset layout,
   * dead in the install (#407). Optional: absent, behaviour is unchanged.
   */
  movedDirs?: Array<{ originalDir: string; newDir: string }>
}

/**
 * A path mapping entry for batch link rewriting.
 */
export type PathMappingEntry = {
  originalDir: string
  newDir: string
  files: string[]
}

/**
 * Parameters for batch link rewriting after a transformed copy.
 */
export type RewriteLinksAfterTransformParams = {
  fileService: FileSystemService
  pathMapping: PathMappingEntry[]
  datasetRoot: string
  sourceContentRoot?: string
}

/**
 * Re-roots an absolute target path when source content lives under a different
 * root than the datasetRoot. Links resolving under sourceContentRoot are mapped
 * to equivalent paths under datasetRoot.
 */
function reRootTarget(
  absoluteTarget: string,
  datasetRoot: string,
  sourceContentRoot: string,
): string {
  const sourceRoot = posix.join(datasetRoot, sourceContentRoot)
  if (absoluteTarget.startsWith(sourceRoot + '/') || absoluteTarget === sourceRoot) {
    const relativeToSourceRoot = posix.relative(sourceRoot, absoluteTarget)
    return posix.join(datasetRoot, relativeToSourceRoot)
  }
  return absoluteTarget
}

/**
 * Rebases a link target that resolves inside the current file's own original
 * directory (e.g. a sibling file in a multi-file skill dir) onto the new
 * directory that same dir is moving to.
 *
 * This takes priority over `reRootTarget`: the current file's directory is
 * precisely the one this copy operation is moving from `originalFileDir` to
 * `newFileDir`, so a link resolving inside it maps 1:1 onto the new
 * directory — no need to go through the coarser dataset-root re-rooting,
 * which only knows about the *overall* content-root move and would otherwise
 * misplace a same-directory sibling link (see #313 T5 fixture regression).
 *
 * Known scope boundary: only rebases links resolving inside the SAME
 * directory the current file lives in. A link that escapes to a *different*
 * transformed sibling directory (e.g. one skill linking into another skill's
 * sibling file) still falls through to `reRootTarget` and is not corrected by
 * this function — not needed by any skill in the corpus today.
 */
function rebaseWithinMovedDir(
  absoluteTarget: string,
  originalFileDir: string,
  newFileDir: string,
): string | null {
  if (absoluteTarget === originalFileDir) return newFileDir
  if (absoluteTarget.startsWith(originalFileDir + '/')) {
    return newFileDir + absoluteTarget.slice(originalFileDir.length)
  }
  return null
}

type ComputeNewHrefParams = {
  href: string
  originalFileDir: string
  newFileDir: string
  datasetRoot?: string
  sourceContentRoot?: string
  movedDirs?: Array<{ originalDir: string; newDir: string }>
}

/**
 * Resolves the absolute target a link points at, after accounting for the
 * current copy operation: a same-directory rebase takes priority over the
 * coarser dataset-root re-root (see `rebaseWithinMovedDir` docs).
 */
function resolveAbsoluteTarget(params: {
  originalFileDir: string
  newFileDir: string
  pathPart: string
  datasetRoot?: string
  sourceContentRoot?: string
  movedDirs?: Array<{ originalDir: string; newDir: string }>
}): string {
  const { originalFileDir, newFileDir, pathPart, datasetRoot, sourceContentRoot, movedDirs } =
    params
  const absoluteTarget = posix.resolve(originalFileDir, pathPart)

  const rebased = rebaseWithinMovedDir(absoluteTarget, originalFileDir, newFileDir)
  if (rebased) return rebased
  // The target is outside the file's own directory. It may still live in another
  // directory this same copy moved — the commonest case being a sub-doc linking
  // UP to its skill. Most specific (longest originalDir) wins, so a nested entry
  // is preferred over its parent.
  const viaSibling = rebaseWithinMovedDirs(absoluteTarget, movedDirs)
  if (viaSibling) return viaSibling
  if (datasetRoot && sourceContentRoot) {
    return reRootTarget(absoluteTarget, datasetRoot, sourceContentRoot)
  }
  return absoluteTarget
}

/**
 * Rebase a target through whichever moved directory contains it, preferring the
 * most specific match. Returns null when no moved directory covers it, so the
 * caller keeps its existing fallbacks.
 */
function rebaseWithinMovedDirs(
  absoluteTarget: string,
  movedDirs?: Array<{ originalDir: string; newDir: string }>,
): string | null {
  if (!movedDirs || movedDirs.length === 0) return null
  const candidates = [...movedDirs].sort((a, b) => b.originalDir.length - a.originalDir.length)
  for (const { originalDir, newDir } of candidates) {
    const rebased = rebaseWithinMovedDir(absoluteTarget, originalDir, newDir)
    if (rebased) return rebased
  }
  return null
}

/**
 * Computes the new href for a relative link after the file has moved.
 * Returns null if the link should not be rewritten (external, anchor, unchanged).
 */
/**
 * Splits a rewritable href into its path and anchor halves, or null when the
 * link must be left alone: external, a pure anchor, or anchor-only after the
 * split. Extracted from `computeNewHref` to keep it under the complexity ceiling.
 */
function splitRewritableHref(href: string): { pathPart: string; anchorPart: string } | null {
  if (isExternalLink(href) || href.startsWith('#')) return null
  const anchorIdx = href.indexOf('#')
  const pathPart = anchorIdx >= 0 ? href.slice(0, anchorIdx) : href
  const anchorPart = anchorIdx >= 0 ? href.slice(anchorIdx) : ''
  if (pathPart === '') return null // pure anchor link
  return { pathPart, anchorPart }
}

function computeNewHref(params: ComputeNewHrefParams): string | null {
  const { href, originalFileDir, newFileDir, datasetRoot, sourceContentRoot, movedDirs } = params
  const split = splitRewritableHref(href)
  if (!split) return null
  const { pathPart, anchorPart } = split

  const absoluteTarget = resolveAbsoluteTarget({
    originalFileDir,
    newFileDir,
    pathPart,
    ...(datasetRoot && { datasetRoot }),
    ...(sourceContentRoot && { sourceContentRoot }),
    ...(movedDirs && { movedDirs }),
  })

  let newRelativePath = posix.relative(newFileDir, absoluteTarget)

  if (!newRelativePath.startsWith('.')) {
    newRelativePath = './' + newRelativePath
  }

  const newHref = newRelativePath + anchorPart
  return newHref === href ? null : newHref
}

/**
 * Locates where the href starts within a link node's raw text (`[label](href)`).
 *
 * A bare `indexOf(href)` is ambiguous when the visible label is byte-identical
 * to the href — e.g. `[SKILL.md](SKILL.md)`, exactly the self-pointer style
 * this module's callers write (see module docs) — because `indexOf` matches
 * the label's occurrence (it comes first) instead of the href inside the
 * parens. Anchoring the search on the `](` delimiter that always immediately
 * precedes the href in valid markdown link syntax disambiguates the two.
 */
function findHrefStart(nodeText: string, href: string): number {
  const marker = '](' + href
  const markerPos = nodeText.indexOf(marker)
  if (markerPos >= 0) return markerPos + 2
  // Fallback for hrefs the marker search doesn't match (shouldn't happen for
  // well-formed links) — keeps prior behavior rather than failing outright.
  return nodeText.indexOf(href)
}

/**
 * Replaces the href within a link node's text range.
 * Returns the updated content and whether a replacement was made.
 */
function replaceHrefInNode(
  content: string,
  link: ParsedLink & { start: number; end: number },
  newHref: string,
  filePath: string,
): { content: string; replaced: boolean } {
  const nodeStart = link.start
  const nodeEnd = link.end
  const nodeText = content.slice(nodeStart, nodeEnd)
  const hrefPos = findHrefStart(nodeText, link.href)
  if (hrefPos >= 0) {
    const absStart = nodeStart + hrefPos
    const absEnd = absStart + link.href.length
    return {
      content: content.slice(0, absStart) + newHref + content.slice(absEnd),
      replaced: true,
    }
  }
  logger.warn(
    `Link rewriter: could not find href in link node at ${nodeStart}-${nodeEnd} in ${filePath}`,
  )
  return { content, replaced: false }
}

/**
 * Rewrites relative links in a single markdown file after it has been copied
 * to a new location with flatten/prefix transforms applied.
 *
 * External links (http, mailto, anchors) are skipped.
 * Unresolvable links produce a warning but do not fail.
 */
export async function rewriteLinksInFile(params: RewriteLinksInFileParams): Promise<void> {
  const { fileService, filePath, originalDir, newDir, datasetRoot, sourceContentRoot, movedDirs } =
    params

  const content = await fileService.readFile(filePath)
  const links = await extractLinks(content)

  if (links.length === 0) return

  const originalFileDir = posix.join(datasetRoot, originalDir)
  const newFileDir = posix.join(datasetRoot, newDir)

  let updatedContent = content
  let rewriteCount = 0

  const hasPosition = (l: ParsedLink): l is ParsedLink & { start: number; end: number } =>
    typeof l.start === 'number' && typeof l.end === 'number'

  const sortedLinks = [...links].filter(hasPosition).sort((a, b) => b.start - a.start)

  for (const link of sortedLinks) {
    const newHref = computeNewHref({
      href: link.href,
      originalFileDir,
      newFileDir,
      datasetRoot,
      ...(sourceContentRoot && { sourceContentRoot }),
      ...(movedDirs && { movedDirs }),
    })
    if (!newHref) continue

    const result = replaceHrefInNode(updatedContent, link, newHref, filePath)
    updatedContent = result.content
    if (result.replaced) rewriteCount++
  }

  if (rewriteCount > 0) {
    await fileService.writeFile(filePath, updatedContent)
    logger.info(`Link rewriter: rewrote ${rewriteCount} links in ${filePath}`)
  }
}

/**
 * Rewrites links in all files from a path mapping after a transformed copy.
 * Each mapping entry specifies the original and new directory, plus the list
 * of files that were copied to the new location.
 */
export async function rewriteLinksAfterTransform(
  params: RewriteLinksAfterTransformParams,
): Promise<void> {
  const { fileService, pathMapping, datasetRoot, sourceContentRoot } = params

  // Built once for the whole batch: every directory this copy moved, absolute.
  const movedDirs = pathMapping.map(e => ({
    originalDir: posix.join(datasetRoot, e.originalDir),
    newDir: posix.join(datasetRoot, e.newDir),
  }))

  for (const entry of pathMapping) {
    for (const filePath of entry.files) {
      if (!filePath.endsWith('.md')) continue
      await rewriteLinksInFile({
        fileService,
        filePath,
        originalDir: entry.originalDir,
        newDir: entry.newDir,
        datasetRoot,
        ...(sourceContentRoot && { sourceContentRoot }),
        movedDirs,
      })
    }
  }
}

import { posix } from 'path'
import { logger } from '../observability'
import { FileSystemService } from '../file-system'
import { LinkProcessor } from '../markdown/link-processor'
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

type ComputeNewHrefParams = {
  href: string
  originalFileDir: string
  newFileDir: string
  datasetRoot?: string
  sourceContentRoot?: string
}

/**
 * Computes the new href for a relative link after the file has moved.
 * Returns null if the link should not be rewritten (external, anchor, unchanged).
 */
function computeNewHref(params: ComputeNewHrefParams): string | null {
  const { href, originalFileDir, newFileDir, datasetRoot, sourceContentRoot } = params
  if (isExternalLink(href) || href.startsWith('#')) return null

  const anchorIdx = href.indexOf('#')
  const pathPart = anchorIdx >= 0 ? href.slice(0, anchorIdx) : href
  const anchorPart = anchorIdx >= 0 ? href.slice(anchorIdx) : ''

  if (pathPart === '') return null // pure anchor link

  let absoluteTarget = posix.resolve(originalFileDir, pathPart)

  if (datasetRoot && sourceContentRoot) {
    absoluteTarget = reRootTarget(absoluteTarget, datasetRoot, sourceContentRoot)
  }

  let newRelativePath = posix.relative(newFileDir, absoluteTarget)

  if (!newRelativePath.startsWith('.')) {
    newRelativePath = './' + newRelativePath
  }

  const newHref = newRelativePath + anchorPart
  return newHref === href ? null : newHref
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
  const hrefPos = nodeText.indexOf(link.href)
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
  const { fileService, filePath, originalDir, newDir, datasetRoot, sourceContentRoot } = params

  const content = await fileService.readFile(filePath)
  const links = await LinkProcessor.extractLinks(content)

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
      })
    }
  }
}

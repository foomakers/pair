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
}

/**
 * Computes the new href for a relative link after the file has moved.
 * Returns null if the link should not be rewritten (external, anchor, unchanged).
 */
function computeNewHref(href: string, originalFileDir: string, newFileDir: string): string | null {
  if (isExternalLink(href) || href.startsWith('#')) return null

  const anchorIdx = href.indexOf('#')
  const pathPart = anchorIdx >= 0 ? href.slice(0, anchorIdx) : href
  const anchorPart = anchorIdx >= 0 ? href.slice(anchorIdx) : ''

  if (pathPart === '') return null // pure anchor link

  const absoluteTarget = posix.resolve(originalFileDir, pathPart)
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
  link: ParsedLink,
  newHref: string,
  filePath: string,
): { content: string; replaced: boolean } {
  const nodeStart = link.start!
  const nodeEnd = link.end!
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
  const { fileService, filePath, originalDir, newDir, datasetRoot } = params

  const content = await fileService.readFile(filePath)
  const links = await LinkProcessor.extractLinks(content)

  if (links.length === 0) return

  const originalFileDir = posix.join(datasetRoot, originalDir)
  const newFileDir = posix.join(datasetRoot, newDir)

  let updatedContent = content
  let rewriteCount = 0

  const sortedLinks = [...links]
    .filter(l => typeof l.start === 'number' && typeof l.end === 'number')
    .sort((a, b) => b.start! - a.start!)

  for (const link of sortedLinks) {
    const newHref = computeNewHref(link.href, originalFileDir, newFileDir)
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
  const { fileService, pathMapping, datasetRoot } = params

  for (const entry of pathMapping) {
    for (const filePath of entry.files) {
      if (!filePath.endsWith('.md')) continue
      await rewriteLinksInFile({
        fileService,
        filePath,
        originalDir: entry.originalDir,
        newDir: entry.newDir,
        datasetRoot,
      })
    }
  }
}

import { posix } from 'path'
import { logger } from '../observability'
import { FileSystemService } from '../file-system'
import { LinkProcessor } from '../markdown/link-processor'
import { isExternalLink } from '../file-system/file-system-utils'

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
 * Rewrites relative links in a single markdown file after it has been copied
 * to a new location with flatten/prefix transforms applied.
 *
 * For each relative link:
 * 1. Resolve the original absolute target using the file's original directory
 * 2. Compute the new relative path from the file's new directory
 * 3. Replace the link in the file content
 *
 * External links (http, mailto, anchors) are skipped.
 * Unresolvable links produce a warning but do not fail.
 */
export async function rewriteLinksInFile(params: RewriteLinksInFileParams): Promise<void> {
  const { fileService, filePath, originalDir, newDir, datasetRoot } = params

  const content = await fileService.readFile(filePath)
  const links = await LinkProcessor.extractLinks(content)

  if (links.length === 0) return

  let updatedContent = content
  let rewriteCount = 0

  // Process links in reverse offset order to avoid index shifting
  const sortedLinks = [...links]
    .filter(l => typeof l.start === 'number' && typeof l.end === 'number')
    .sort((a, b) => b.start! - a.start!)

  for (const link of sortedLinks) {
    const href = link.href

    // Skip external links, anchors, mailto
    if (isExternalLink(href) || href.startsWith('#')) continue

    // Strip anchor from href for path resolution
    const anchorIdx = href.indexOf('#')
    const pathPart = anchorIdx >= 0 ? href.slice(0, anchorIdx) : href
    const anchorPart = anchorIdx >= 0 ? href.slice(anchorIdx) : ''

    if (pathPart === '') continue // pure anchor link

    // Resolve original absolute target
    const originalFileDir = posix.join(datasetRoot, originalDir)
    const absoluteTarget = posix.resolve(originalFileDir, pathPart)

    // Compute new relative path from the new file location
    const newFileDir = posix.join(datasetRoot, newDir)
    let newRelativePath = posix.relative(newFileDir, absoluteTarget)

    // Ensure relative paths start with ./ or ../
    if (!newRelativePath.startsWith('.')) {
      newRelativePath = './' + newRelativePath
    }

    const newHref = newRelativePath + anchorPart

    if (newHref === href) continue

    // Find the href within the link node range (start/end cover the full [text](url) node)
    const nodeStart = link.start!
    const nodeEnd = link.end!
    const nodeText = updatedContent.slice(nodeStart, nodeEnd)
    const hrefPos = nodeText.indexOf(href)
    if (hrefPos >= 0) {
      const absStart = nodeStart + hrefPos
      const absEnd = absStart + href.length
      updatedContent = updatedContent.slice(0, absStart) + newHref + updatedContent.slice(absEnd)
      rewriteCount++
    } else {
      logger.warn(`Link rewriter: could not find href in link node at ${nodeStart}-${nodeEnd} in ${filePath}`)
    }
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

import { dirname } from 'path'
import { FileSystemService } from '../file-system/file-system-service'
import { extractLinks as parseExtractLinks } from './markdown-parser'
import { resolveMarkdownPath } from './path-resolution'
import { convertToRelative } from '../path-resolution'
import {
  isExternalLink,
  normalizeLinkSlashes,
  walkMarkdownFiles,
} from '../file-system/file-system-utils'
import { type Replacement } from './replacement-applier'

// Re-export the replacement-application helpers so consumers can keep importing
// the whole link-processing surface from a single module.
export { applyReplacements, processFileWithLinks } from './replacement-applier'
export type { ApplyResult } from './replacement-applier'

/**
 * Represents a parsed markdown link
 */
export type ParsedLink = {
  href: string
  text: string
  line: number
  start: number | undefined
  end: number | undefined
}

/**
 * Configuration for link processing operations
 */
export type LinkProcessingConfig = {
  docsFolders: string[]
  datasetRoot: string
  exclusionList: string[]
}

/**
 * Extract all markdown links from content using the shared markdown parser
 */
export async function extractLinks(content: string): Promise<ParsedLink[]> {
  return parseExtractLinks(content)
}

/**
 * Extract links from a single markdown file and enrich with file context
 */
export async function extractLinksFromFile(
  filePath: string,
  fileService: FileSystemService,
): Promise<
  Array<ParsedLink & { filePath: string; type?: string | undefined; anchor?: string | undefined }>
> {
  const content = await fileService.readFile(filePath)
  const parsed = await extractLinks(content)

  return parsed.map(p => {
    const href = p.href
    const type = classifyLinkType(href)
    const anchor = extractAnchor(href)
    return Object.assign({}, p, { filePath, type: type as string | undefined, anchor })
  })
}

/**
 * Extract links from all markdown files under a directory (recursively)
 */
export async function extractLinksFromDirectory(
  dir: string,
  fileService: FileSystemService,
): Promise<
  Array<ParsedLink & { filePath: string; type?: string | undefined; anchor?: string | undefined }>
> {
  const files = await walkMarkdownFiles(dir, fileService)
  const results = await Promise.all(files.map(f => extractLinksFromFile(f, fileService)))
  return results.flat()
}

/**
 * Classify a link href into a simple type for downstream logic
 */
export function classifyLinkType(
  href?: string,
): 'relative' | 'absolute' | 'http' | 'mailto' | 'anchor' | 'other' {
  if (!href) return 'other'
  const h = href.trim()
  if (h.startsWith('#')) return 'anchor'
  if (/^https?:\/\//i.test(h)) return 'http'
  if (/^mailto:/i.test(h)) return 'mailto'
  if (h.startsWith('/')) return 'absolute'
  return 'relative'
}

export function extractAnchor(href?: string): string | undefined {
  if (!href) return undefined
  const idx = href.indexOf('#')
  return idx >= 0 ? href.substring(idx) : undefined
}

/**
 * Split a link into filesystem path, query string (including '?') and anchor (including '#')
 */
export function splitLinkParts(href?: string) {
  if (!href) return { path: '', query: '', anchor: '' }
  const hashIdx = href.indexOf('#')
  const qIdx = href.indexOf('?')

  let pathEnd = href.length
  if (hashIdx >= 0) pathEnd = Math.min(pathEnd, hashIdx)
  if (qIdx >= 0) pathEnd = Math.min(pathEnd, qIdx)

  const path = href.substring(0, pathEnd)
  const query =
    qIdx >= 0 && (hashIdx < 0 || qIdx < hashIdx)
      ? href.substring(qIdx, hashIdx >= 0 ? hashIdx : undefined)
      : ''
  const anchor = hashIdx >= 0 ? href.substring(hashIdx) : ''
  return { path, query, anchor }
}

/**
 * Generate replacements for link normalization
 */
export async function generateNormalizationReplacements(
  links: ParsedLink[],
  file: string,
  config: LinkProcessingConfig,
  fileService: FileSystemService,
): Promise<Replacement[]> {
  const replacements: Replacement[] = []
  for (const lnk of links) {
    await processLinkForNormalization({ lnk, file, config, fileService, replacements })
  }

  return replacements
}

async function processLinkForNormalization(params: {
  lnk: ParsedLink
  file: string
  config: LinkProcessingConfig
  fileService: FileSystemService
  replacements: Replacement[]
}) {
  const { lnk, file, config, fileService, replacements } = params
  const originalLink = lnk.href
  const linkPath: string | undefined = originalLink

  if (isSkippableLink(linkPath, config)) return

  // split into path/query/anchor — resolve against filesystem using only the path
  const { path: linkPathOnly, query, anchor } = splitLinkParts(linkPath)
  const absTarget = await resolveAbsTarget(file, linkPathOnly, config)
  const hostDir = dirname(file)

  // Try same-directory relative normalization
  if (
    await tryPushRelativeNormalization({
      replacements,
      lnk,
      linkPath,
      absTarget,
      hostDir,
      fileService,
      query,
      anchor,
    })
  )
    return

  // Try full-docs normalization
  await tryPushFullNormalization({
    replacements,
    lnk,
    linkPath,
    absTarget,
    config,
    fileService,
    query,
    anchor,
  })
}

async function tryPushRelativeNormalization(params: {
  replacements: Replacement[]
  lnk: ParsedLink
  linkPath: string
  absTarget: string
  hostDir: string
  fileService: FileSystemService
  query: string
  anchor: string
}) {
  const { replacements, lnk, linkPath, absTarget, hostDir, fileService, anchor } = params
  const { query } = params
  let relFromHost = convertToRelative(hostDir, absTarget)
  if (!relFromHost.startsWith('..')) {
    if (!(await fileService.exists(absTarget))) return false
    // preserve anchors but do not introduce a leading './' that wasn't present
    // if the original link didn't start with './', strip the './' prefix
    if (!linkPath.startsWith('./') && relFromHost.startsWith('./')) {
      relFromHost = relFromHost.slice(2)
    }
    const normalized = relFromHost + (query || '') + (anchor || '')
    if (linkPath !== normalized) {
      pushNormalizedReplacement({
        replacements,
        lnk,
        oldHref: linkPath,
        newHref: normalized,
        kind: 'normalizedRel',
      })
    }
    return true
  }
  return false
}

async function tryPushFullNormalization(params: {
  replacements: Replacement[]
  lnk: ParsedLink
  linkPath: string
  absTarget: string
  config: LinkProcessingConfig
  fileService: FileSystemService
  query: string
  anchor: string
}) {
  const { replacements, lnk, linkPath, absTarget, config, fileService, anchor } = params
  const { query } = params
  const relToDocs = convertToRelative(config.datasetRoot, absTarget)
  // convertToRelative returns './' when paths are identical; preserve original
  // behavior by treating './' as not valid
  if (!relToDocs || relToDocs.startsWith('..') || relToDocs === './') return

  const normalized = normalizeLinkSlashes(relToDocs) + (query || '') + (anchor || '')

  // handle single-filename normalization
  if (!relToDocs.includes('/')) {
    await tryPushSingleFileNormalization({
      replacements,
      lnk,
      linkPath,
      absTarget,
      fileService,
      normalized,
      relToDocs,
    })
  }

  // Multi-file path normalization (converting relative paths to docsFolders-based
  // paths like .pair/adoption/tech/...) is intentionally disabled. These non-standard
  // paths are not navigable in IDEs/GitHub and break the link rewriter during skill
  // distribution. Relative paths (e.g., ../../../.pair/...) are correct and work everywhere.
}

async function tryPushSingleFileNormalization(params: {
  replacements: Replacement[]
  lnk: ParsedLink
  linkPath: string
  absTarget: string
  fileService: FileSystemService
  normalized: string
  relToDocs: string
}) {
  const { replacements, lnk, linkPath, absTarget, fileService, normalized, relToDocs } = params
  const base = relToDocs
  if (base === 'index.md') return
  if (!(await fileService.exists(absTarget))) return
  if (linkPath !== normalized) {
    pushNormalizedReplacement({
      replacements,
      lnk,
      oldHref: linkPath,
      newHref: normalized,
      kind: 'normalizedRel',
    })
  }
}

function isSkippableLink(url: string, config: LinkProcessingConfig) {
  return (
    !url ||
    isExternalLink(url) ||
    config.exclusionList.some(e => url.startsWith(e)) ||
    /^:.*\.md:$/.test(url)
  )
}

async function resolveAbsTarget(
  file: string,
  linkForResolve: string,
  config: LinkProcessingConfig,
) {
  return resolveMarkdownPath(file, linkForResolve, config.docsFolders, config.datasetRoot)
}

function pushNormalizedReplacement(opts: {
  replacements: Replacement[]
  lnk: ParsedLink
  oldHref: string
  newHref: string
  kind?: 'normalizedRel' | 'normalizedFull'
}) {
  const { replacements, lnk, oldHref, newHref, kind = 'normalizedRel' } = opts
  replacements.push({
    start: lnk.start,
    end: lnk.end,
    line: lnk.line,
    oldHref,
    newHref,
    kind,
  })
}

/**
 * Generate replacements for path substitution
 */
export async function generatePathSubstitutionReplacements(
  links: ParsedLink[],
  oldBase: string,
  newBase: string,
): Promise<Replacement[]> {
  const replacements: Replacement[] = []

  for (const p of links) {
    const link = p.href
    if (isExternalLink(link)) continue
    const norm = normalizeLinkSlashes(link)
    if (norm.startsWith(oldBase)) {
      replacements.push({
        start: p.start,
        end: p.end,
        line: p.line,
        oldHref: link,
        newHref: newBase + norm.slice(oldBase.length),
        kind: 'pathSubstitution',
      })
    }
  }

  return replacements
}

/**
 * Detect the dominant link style in markdown files within a directory
 * Returns 'relative' if relative links are >= absolute links, otherwise 'absolute'
 */
export async function detectLinkStyle(
  fsService: FileSystemService,
  targetPath: string,
): Promise<'relative' | 'absolute'> {
  const files = await walkMarkdownFiles(targetPath, fsService)
  let relativeCount = 0
  let absoluteCount = 0

  for (const file of files) {
    const content = await fsService.readFile(file)
    const links = await extractLinks(content)

    for (const link of links) {
      if (isExternalLink(link.href)) continue
      if (link.href.startsWith('#')) continue

      if (link.href.startsWith('/')) {
        absoluteCount++
      } else {
        relativeCount++
      }
    }
  }

  return relativeCount >= absoluteCount ? 'relative' : 'absolute'
}

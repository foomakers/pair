// path.relative is no longer used; normalization delegated to LinkProcessor
import { FileSystemService } from '../file-system/file-system-service'
import { dirname } from 'path'
import { ParsedLink } from './markdown-parser'
import { LinkProcessor, LinkProcessingConfig } from './link-processor'
import { ErrorLog } from '../observability'
import { Replacement } from './replacement-applier'
import { isExternalLink, stripAnchor } from '../file-system/file-system-utils'
import { resolveMarkdownPath, tryResolvePathVariants } from './path-resolution'
import { convertToRelative } from '../path-resolution'

type ExistenceCheckContext = {
  links: ParsedLink[]
  file: string
  config: { docsFolders: string[]; datasetRoot: string; exclusionList: string[] }
  fileService: FileSystemService
  lines: string[]
}

/**
 * Check if a link should be skipped during processing
 */
function shouldSkipLink(linkPath: string, config?: { exclusionList?: string[] }): boolean {
  const exclusionList = config?.exclusionList ?? []
  return (
    !linkPath ||
    isExternalLink(linkPath) ||
    exclusionList.some((excluded: string) => linkPath.startsWith(excluded)) ||
    /^:.*\.md:$/.test(linkPath)
  )
}

/**
 * Generate relative path normalization replacement
 */
// Delegated normalization helpers removed; use LinkProcessor

export async function generateNormalizationReplacements(
  links: ParsedLink[],
  file: string,
  config: { docsFolders: string[]; datasetRoot: string; exclusionList: string[] },
  fileService: FileSystemService,
): Promise<Replacement[]> {
  // Delegate to centralized LinkProcessor implementation. Cast config to LinkProcessingConfig
  const cfg = config as unknown as LinkProcessingConfig
  return LinkProcessor.generateNormalizationReplacements(links, file, cfg, fileService)
}

// Normalization logic delegated to LinkProcessor

export async function generateExistenceCheckReplacements(
  context: ExistenceCheckContext,
): Promise<{ replacements: Replacement[]; errors: ErrorLog[] }> {
  const { links, file, config, fileService, lines } = context
  const replacements: Replacement[] = []
  const errors: ErrorLog[] = []
  for (const lnk of links) {
    const res = await processLinkExistence(lnk, { file, config, fileService, lines })
    if (!res) continue
    if (res.error) errors.push(res.error)
    if (res.replacement) replacements.push(res.replacement)
  }

  return { replacements, errors }
}

async function processLinkExistence(
  lnk: ParsedLink,
  ctx: {
    file: string
    config: { docsFolders: string[]; datasetRoot: string; exclusionList: string[] }
    fileService: FileSystemService
    lines: string[]
  },
): Promise<undefined | { replacement?: Replacement; error?: ErrorLog }> {
  const { file, config, fileService, lines } = ctx
  const linkPath = lnk.href
  if (shouldSkipLink(linkPath, config)) return undefined

  const linkForResolve = stripAnchor(linkPath)
  const absTarget = await resolveMarkdownPath(
    file,
    linkForResolve,
    config.docsFolders,
    config.datasetRoot,
  )

  if (await fileService.exists(absTarget)) return undefined

  const fixed = await tryResolvePathVariants({
    file,
    linkPath,
    docsFolders: config.docsFolders,
    fileService,
    datasetRoot: config.datasetRoot,
  })
  if (!fixed) {
    return {
      error: {
        type: 'LINK TARGET NOT FOUND',
        file,
        lineNumber: lnk.line,
        line: lines[lnk.line - 1] ?? '',
      },
    }
  }
  return {
    replacement: await computeReplacementForFixed({ fixed, lnk, file, config, linkPath }),
  }
}

async function computeReplacementForFixed(params: {
  fixed: string
  lnk: ParsedLink
  file: string
  config: { docsFolders: string[]; datasetRoot: string; exclusionList: string[] }
  linkPath: string
}): Promise<Replacement> {
  const { fixed, lnk, file, config, linkPath } = params
  const hashIdx = linkPath.indexOf('#')
  const anchor = hashIdx >= 0 ? linkPath.substring(hashIdx) : ''
  const query = extractQuery(linkPath, hashIdx)

  const absResolved = await resolveMarkdownPath(file, fixed, config.docsFolders, config.datasetRoot)
  const relFromHost = normalizeRelForHost(dirname(file), absResolved, linkPath)

  const newHref = relFromHost + (query || '') + (anchor || '')

  return {
    start: lnk.start,
    end: lnk.end,
    line: lnk.line,
    oldHref: linkPath,
    newHref,
    kind: 'patched',
  }
}

function extractQuery(linkPath: string, hashIdx: number) {
  const qIdx = linkPath.indexOf('?')
  return qIdx >= 0 && (hashIdx < 0 || qIdx < hashIdx)
    ? linkPath.substring(qIdx, hashIdx >= 0 ? hashIdx : undefined)
    : ''
}

function normalizeRelForHost(hostDir: string, absResolved: string, originalLink: string) {
  let relFromHost = convertToRelative(hostDir, absResolved)
  if (!originalLink.startsWith('./') && relFromHost.startsWith('./')) {
    relFromHost = relFromHost.slice(2)
  }
  return relFromHost
}

export async function generatePathSubstitutionReplacements(
  links: ParsedLink[],
  oldBase: string,
  newBase: string,
): Promise<Replacement[]> {
  // Delegate to LinkProcessor implementation
  return LinkProcessor.generatePathSubstitutionReplacements(links, oldBase, newBase)
}

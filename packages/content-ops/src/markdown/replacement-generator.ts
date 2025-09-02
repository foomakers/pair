import { relative, dirname } from 'path'
import { FileSystemService } from '../file-system/file-system-service'
import { ParsedLink } from './markdown-parser'
import { ErrorLog } from '../observability'
import { Replacement } from './replacement-applier'
import { isExternalLink, normalizeLinkSlashes, stripAnchor } from '../file-system/file-system-utils'
import { resolveMarkdownPath, tryResolvePathVariants } from './path-resolution'

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
type RelativeNormalizationParams = {
  lnk: ParsedLink
  linkPath: string
  absTarget: string
  hostDir: string
  fileService: FileSystemService
}

async function generateRelativeNormalization(
  params: RelativeNormalizationParams,
): Promise<Replacement | null> {
  const { lnk, linkPath, absTarget, hostDir, fileService } = params
  const relFromHost = relative(hostDir, absTarget)
  if (!relFromHost.startsWith('..')) {
    if (!(await fileService.exists(absTarget))) {
      return null
    }
    // preserve anchors but do not introduce a leading './' that wasn't present
    const anchor =
      linkPath && linkPath.includes('#') ? linkPath.substring(linkPath.indexOf('#')) : ''
    // use the relative path from host directory as the normalized base (no leading './')
    const normalizedBase = relFromHost
    const normalized = normalizedBase + anchor
    if (linkPath !== normalized) {
      return {
        start: lnk.start,
        end: lnk.end,
        line: lnk.line,
        oldHref: linkPath,
        newHref: normalized,
        kind: 'normalizedRel',
      }
    }
  }
  return null
}

/**
 * Generate full path normalization replacement
 */
type FullNormalizationParams = {
  lnk: ParsedLink
  linkPath: string
  absTarget: string
  config: { datasetRoot: string; docsFolders: string[] }
  fileService: FileSystemService
}

async function generateFullNormalization(
  params: FullNormalizationParams,
): Promise<Replacement | null> {
  const { lnk, linkPath, absTarget, config, fileService } = params
  const relToDocs = relative(config.datasetRoot, absTarget)
  const topFolder = relToDocs.split('/')[0] ?? ''
  if (config.docsFolders.includes(topFolder)) {
    if (!(await fileService.exists(absTarget))) {
      return null
    }
    const anchor =
      linkPath && linkPath.includes('#') ? linkPath.substring(linkPath.indexOf('#')) : ''
    const normalized = normalizeLinkSlashes(relToDocs) + anchor
    if (linkPath !== normalized) {
      return {
        start: lnk.start,
        end: lnk.end,
        line: lnk.line,
        oldHref: linkPath,
        newHref: normalized,
        kind: 'normalizedFull',
      }
    }
  }
  return null
}

export async function generateNormalizationReplacements(
  links: ParsedLink[],
  file: string,
  config: { docsFolders: string[]; datasetRoot: string; exclusionList: string[] },
  fileService: FileSystemService,
): Promise<Replacement[]> {
  const replacements: Replacement[] = []
  const hostDir = dirname(file)
  for (const lnk of links) {
    await processLinkForNormalization({ lnk, file, hostDir, config, fileService, replacements })
  }

  return replacements
}

async function processLinkForNormalization(params: {
  lnk: ParsedLink
  file: string
  hostDir: string
  config: { docsFolders: string[]; datasetRoot: string; exclusionList: string[] }
  fileService: FileSystemService
  replacements: Replacement[]
}) {
  const { lnk, file, hostDir, config, fileService, replacements } = params
  const linkPath = lnk.href
  if (shouldSkipLink(linkPath, config)) return

  const linkForResolve = stripAnchor(linkPath)
  const absTarget = await resolveMarkdownPath(
    file,
    linkForResolve,
    config.docsFolders,
    config.datasetRoot,
  )

  const relReplacement = await generateRelativeNormalization({
    lnk,
    linkPath,
    absTarget,
    hostDir,
    fileService,
  })
  if (relReplacement) {
    replacements.push(relReplacement)
    return
  }

  const relFromHost = relative(hostDir, absTarget)
  if (relFromHost.startsWith('..')) {
    const fullReplacement = await generateFullNormalization({
      lnk,
      linkPath,
      absTarget,
      config: { datasetRoot: config.datasetRoot, docsFolders: config.docsFolders },
      fileService,
    })
    if (fullReplacement) replacements.push(fullReplacement)
  }
}

export async function generateExistenceCheckReplacements(
  context: ExistenceCheckContext,
): Promise<{ replacements: Replacement[]; errors: ErrorLog[] }> {
  const { links, file, config, fileService, lines } = context
  const replacements: Replacement[] = []
  const errors: ErrorLog[] = []

  for (const lnk of links) {
    const linkPath = lnk.href
    if (shouldSkipLink(linkPath, config)) continue

    const linkForResolve = stripAnchor(linkPath)
    const absTarget = await resolveMarkdownPath(
      file,
      linkForResolve,
      config.docsFolders,
      config.datasetRoot,
    )

    if (!(await fileService.exists(absTarget))) {
      const fixed = await tryResolvePathVariants({
        file,
        linkPath,
        docsFolders: config.docsFolders,
        fileService,
        datasetRoot: config.datasetRoot,
      })
      if (fixed) {
        replacements.push({
          start: lnk.start,
          end: lnk.end,
          line: lnk.line,
          oldHref: linkPath,
          newHref: fixed,
          kind: 'patched',
        })
        continue
      }
      errors.push({
        type: 'LINK TARGET NOT FOUND',
        file,
        lineNumber: lnk.line,
        line: lines[lnk.line - 1] ?? '',
      })
    }
  }

  return { replacements, errors }
}

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

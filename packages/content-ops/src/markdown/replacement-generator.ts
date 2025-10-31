// path.relative is no longer used; normalization delegated to LinkProcessor
import { FileSystemService } from '../file-system/file-system-service'
import { ParsedLink } from './markdown-parser'
import { LinkProcessor, LinkProcessingConfig } from './link-processor'
import { ErrorLog } from '../observability'
import { Replacement } from './replacement-applier'
import { isExternalLink, stripAnchor } from '../file-system/file-system-utils'
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
// Delegated normalization helpers removed; use LinkProcessor

export async function generateNormalizationReplacements(
  links: ParsedLink[],
  file: string,
  config: { docsFolders: string[]; datasetRoot: string; exclusionList: string[] },
  fileService: FileSystemService,
): Promise<Replacement[]> {
  // Delegate to centralized LinkProcessor implementation. Cast config to LinkProcessingConfig
  const cfg = config as unknown as LinkProcessingConfig
  return LinkProcessor.generateNormalizationReplacements(links as any, file, cfg, fileService)
}

// Normalization logic delegated to LinkProcessor

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
  // Delegate to LinkProcessor implementation
  return LinkProcessor.generatePathSubstitutionReplacements(links as any, oldBase, newBase)
}

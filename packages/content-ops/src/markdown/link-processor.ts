import { relative, dirname } from 'path'
import { FileSystemService } from '../file-system/file-system-service'
import { extractLinks as parseExtractLinks } from './markdown-parser'
import { resolveMarkdownPath } from './path-resolution'
import { isExternalLink, normalizeLinkSlashes, stripAnchor } from '../file-system/file-system-utils'
import {
  type Replacement,
  applyReplacements,
  processFileWithLinks,
  type ApplyResult,
} from './replacement-applier'

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
 * LinkProcessor - Centralized module for markdown link processing
 * Handles parsing, analysis, transformation, and replacement of markdown links
 */
export class LinkProcessor {
  // processor cache removed; parsing delegated to markdown-parser

  /**
   * Get or create the unified markdown processor
   */
  /**
   * Extract all markdown links from content using the shared markdown parser
   */
  static async extractLinks(content: string): Promise<ParsedLink[]> {
    return parseExtractLinks(content)
  }

  /**
   * Generate replacements for link normalization
   */
  static async generateNormalizationReplacements(
    links: ParsedLink[],
    file: string,
    config: LinkProcessingConfig,
    fileService: FileSystemService,
  ): Promise<Replacement[]> {
    const replacements: Replacement[] = []
    for (const lnk of links) {
      await this.processLinkForNormalization({ lnk, file, config, fileService, replacements })
    }

    return replacements
  }

  private static async processLinkForNormalization(params: {
    lnk: ParsedLink
    file: string
    config: LinkProcessingConfig
    fileService: FileSystemService
    replacements: Replacement[]
  }) {
    const { lnk, file, config, fileService, replacements } = params
    const linkText = lnk.text
    const originalLink = lnk.href
    const linkPath: string | undefined = originalLink

    if (this.isSkippableLink(linkPath, config)) return

    const linkForResolve = stripAnchor(linkPath)
    const anchor = this.getAnchor(linkPath)
    const absTarget = await this.resolveAbsTarget(file, linkForResolve, config)
    const hostDir = dirname(file)

    // Try same-directory relative normalization
    if (
      await this.tryPushRelativeNormalization({
        replacements,
        lnk,
        linkPath,
        linkText,
        absTarget,
        hostDir,
        fileService,
        anchor,
      })
    )
      return

    // Try full-docs normalization
    await this.tryPushFullNormalization({
      replacements,
      lnk,
      linkPath,
      linkText,
      absTarget,
      config,
      fileService,
      anchor,
    })
  }

  private static async tryPushRelativeNormalization(params: {
    replacements: Replacement[]
    lnk: ParsedLink
    linkPath: string
    linkText: string
    absTarget: string
    hostDir: string
    fileService: FileSystemService
    anchor: string
  }) {
    const { replacements, lnk, linkPath, linkText, absTarget, hostDir, fileService, anchor } =
      params
    const relFromHost = relative(hostDir, absTarget)
    if (!relFromHost.startsWith('..')) {
      if (!(await fileService.exists(absTarget))) return false
      const normalized = (relFromHost.startsWith('./') ? relFromHost : `./${relFromHost}`) + anchor
      if (linkPath !== normalized) {
        this.pushNormalizedReplacement(replacements, lnk, linkPath, `[${linkText}](${normalized})`)
      }
      return true
    }
    return false
  }

  private static async tryPushFullNormalization(params: {
    replacements: Replacement[]
    lnk: ParsedLink
    linkPath: string
    linkText: string
    absTarget: string
    config: LinkProcessingConfig
    fileService: FileSystemService
    anchor: string
  }) {
    const { replacements, lnk, linkPath, linkText, absTarget, config, fileService, anchor } = params
    const relToDocs = relative(config.datasetRoot, absTarget)
    if (relToDocs && !relToDocs.startsWith('..')) {
      if (!(await fileService.exists(absTarget))) return
      const normalized = normalizeLinkSlashes(relToDocs) + anchor
      if (linkPath !== normalized) {
        this.pushNormalizedReplacement(replacements, lnk, linkPath, `[${linkText}](${normalized})`)
      }
    }
  }

  private static isSkippableLink(url: string, config: LinkProcessingConfig) {
    return (
      !url ||
      isExternalLink(url) ||
      config.exclusionList.some(e => url.startsWith(e)) ||
      /^:.*\.md:$/.test(url)
    )
  }

  private static getAnchor(linkPath?: string) {
    return linkPath && linkPath.includes('#') ? linkPath.substring(linkPath.indexOf('#')) : ''
  }

  private static async resolveAbsTarget(
    file: string,
    linkForResolve: string,
    config: LinkProcessingConfig,
  ) {
    return resolveMarkdownPath(file, linkForResolve, config.docsFolders, config.datasetRoot)
  }

  private static pushNormalizedReplacement(
    replacements: Replacement[],
    lnk: ParsedLink,
    oldHref: string,
    newHref: string,
  ) {
    replacements.push({
      start: lnk.start,
      end: lnk.end,
      line: lnk.line,
      oldHref,
      newHref,
      kind: 'normalizedRel',
    })
  }

  /**
   * Generate replacements for path substitution
   */
  static async generatePathSubstitutionReplacements(
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
   * Apply replacements to content (delegates to replacement-applier)
   */
  static applyReplacements(content: string, replacements: Replacement[]): ApplyResult {
    return applyReplacements(content, replacements)
  }

  /**
   * Process a file with link replacements (delegates to replacement-applier)
   */
  static async processFileWithLinks(
    content: string,
    generateReplacements: (links: ParsedLink[]) => Promise<Replacement[]>,
  ): Promise<{ content: string; applied: number; byKind: Record<string, number> }> {
    return processFileWithLinks(content, generateReplacements)
  }
}

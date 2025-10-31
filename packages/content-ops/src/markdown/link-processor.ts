import { relative, dirname } from 'path'
import { FileSystemService } from '../file-system/file-system-service'
import { extractLinks as parseExtractLinks } from './markdown-parser'
import { resolveMarkdownPath } from './path-resolution'
import {
  isExternalLink,
  normalizeLinkSlashes,
  stripAnchor,
  walkMarkdownFiles,
} from '../file-system/file-system-utils'
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
   * Extract links from a single markdown file and enrich with file context
   */
  static async extractLinksFromFile(
    filePath: string,
    fileService: FileSystemService,
  ): Promise<
    Array<ParsedLink & { filePath: string; type?: string | undefined; anchor?: string | undefined }>
  > {
    const content = await fileService.readFile(filePath)
    const parsed = await this.extractLinks(content)

    return parsed.map(p => {
      const href = p.href
      const type = this.classifyLinkType(href)
      const anchor = this.extractAnchor(href)
      return Object.assign({}, p, { filePath, type: type as string | undefined, anchor })
    })
  }

  /**
   * Extract links from all markdown files under a directory (recursively)
   */
  static async extractLinksFromDirectory(
    dir: string,
    fileService: FileSystemService,
  ): Promise<
    Array<ParsedLink & { filePath: string; type?: string | undefined; anchor?: string | undefined }>
  > {
    const files = await walkMarkdownFiles(dir, fileService)
    const results = await Promise.all(files.map(f => this.extractLinksFromFile(f, fileService)))
    return results.flat()
  }

  /**
   * Classify a link href into a simple type for downstream logic
   */
  static classifyLinkType(
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

  static extractAnchor(href?: string): string | undefined {
    if (!href) return undefined
    const idx = href.indexOf('#')
    return idx >= 0 ? href.substring(idx) : undefined
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
    absTarget: string
    hostDir: string
    fileService: FileSystemService
    anchor: string
  }) {
    const { replacements, lnk, linkPath, absTarget, hostDir, fileService, anchor } = params
    const relFromHost = relative(hostDir, absTarget)
    if (!relFromHost.startsWith('..')) {
      if (!(await fileService.exists(absTarget))) return false
      // preserve anchors but do not introduce a leading './' that wasn't present
      const normalized = relFromHost + anchor
      if (linkPath !== normalized) {
        this.pushNormalizedReplacement(replacements, lnk, linkPath, normalized, 'normalizedRel')
      }
      return true
    }
    return false
  }

  private static async tryPushFullNormalization(params: {
    replacements: Replacement[]
    lnk: ParsedLink
    linkPath: string
    absTarget: string
    config: LinkProcessingConfig
    fileService: FileSystemService
    anchor: string
  }) {
    const { replacements, lnk, linkPath, absTarget, config, fileService, anchor } = params
    const relToDocs = relative(config.datasetRoot, absTarget)
    if (relToDocs && !relToDocs.startsWith('..')) {
      // If relToDocs is a single filename (no '/'), allow normalization to
      // a simple filename (normalizedRel) even if the top folder doesn't match
      // docsFolders. This preserves expected normalization for links like
      // '../page.md' from inside a docs folder.
      const normalized = normalizeLinkSlashes(relToDocs) + anchor
      if (!relToDocs.includes('/')) {
        // Avoid normalizing generic parent index files (index.md) — keep ../index.md
        // unchanged to preserve relative semantics.
        const base = relToDocs
        if (base === 'index.md') return
        if (!(await fileService.exists(absTarget))) return
        if (linkPath !== normalized) {
          this.pushNormalizedReplacement(replacements, lnk, linkPath, normalized, 'normalizedRel')
        }
        return
      }

      const topFolder = relToDocs.split('/')[0] ?? ''
      if (!config.docsFolders.includes(topFolder)) return
      if (!(await fileService.exists(absTarget))) return
      if (linkPath !== normalized) {
        this.pushNormalizedReplacement(replacements, lnk, linkPath, normalized, 'normalizedFull')
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
    kind: 'normalizedRel' | 'normalizedFull' = 'normalizedRel',
  ) {
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

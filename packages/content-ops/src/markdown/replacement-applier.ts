import { ParsedLink, extractLinks } from './markdown-parser'
import { FileSystemService } from '../file-system'

function applyOffsetReplacement(content: string, r: Replacement) {
  const s = r.start!
  const e = r.end!
  if (s < 0 || e > content.length || s >= e) return { changed: false, content, applied: 0 }
  let applied = 0
  if (content.slice(s, e) === r.oldHref) {
    content = content.slice(0, s) + r.newHref + content.slice(e)
    applied = 1
    return { changed: true, content, applied }
  }
  const found = content.indexOf(r.oldHref, Math.max(0, s - 64))
  if (found === -1) return { changed: false, content, applied: 0 }
  if (found < s) {
    if (content.slice(found, found + r.oldHref.length) === r.oldHref) {
      content = content.slice(0, found) + r.newHref + content.slice(found + r.oldHref.length)
      applied = 1
      return { changed: true, content, applied }
    }
    return { changed: false, content, applied: 0 }
  }
  if (found >= s && found <= e + 64) {
    content = content.slice(0, found) + r.newHref + content.slice(found + r.oldHref.length)
    applied = 1
    return { changed: true, content, applied }
  }
  return { changed: false, content, applied: 0 }
}

function applyOffsetReplacements(content: string, offsetRepls: Replacement[]) {
  const byKind: Record<string, number> = {}
  let applied = 0
  for (const r of offsetRepls) {
    const res = applyOffsetReplacement(content, r)
    if (res.changed) {
      content = res.content
      applied += res.applied
      byKind[r.kind ?? 'updated'] = (byKind[r.kind ?? 'updated'] || 0) + res.applied
    }
  }
  return { content, applied, byKind }
}

export function applyReplacements(content: string, replacements: Replacement[]): ApplyResult {
  if (!replacements || replacements.length === 0) return { content, applied: 0, byKind: {} }

  const byKind: Record<string, number> = {}
  let applied = 0

  const offsetRepls = replacements
    .filter(r => typeof r.start === 'number' && typeof r.end === 'number')
    .sort((a, b) => b.start! - a.start!)

  const nonOffset = replacements.filter(
    r => typeof r.start !== 'number' || typeof r.end !== 'number',
  )
  // apply offset-based replacements using helper to reduce complexity
  const offsetResult = applyOffsetReplacements(content, offsetRepls)
  content = offsetResult.content
  applied += offsetResult.applied
  for (const k of Object.keys(offsetResult.byKind)) {
    byKind[k] = (byKind[k] ?? 0) + (offsetResult.byKind[k] ?? 0)
  }

  // apply non-offset replacements (line-based)
  // apply non-offset replacements (line-based)
  const nonOffsetResult = applyNonOffsetReplacements(content, nonOffset)
  content = nonOffsetResult.content
  applied += nonOffsetResult.applied
  for (const k of Object.keys(nonOffsetResult.byKind)) {
    const add = nonOffsetResult.byKind[k] ?? 0
    byKind[k] = (byKind[k] ?? 0) + add
  }

  return { content, applied, byKind }
}

function applyNonOffsetReplacements(content: string, nonOffset: Replacement[]) {
  const byKind: Record<string, number> = {}
  let applied = 0
  for (const r of nonOffset) {
    const before = content
    content = replaceLinkOnLine(content, r.line, r.oldHref, r.newHref)
    if (content !== before) {
      applied++
      byKind[r.kind ?? 'updated'] = (byKind[r.kind ?? 'updated'] || 0) + 1
    }
  }
  return { content, applied, byKind }
}

/**
 * Processes a single file: reads content, generates and applies replacements, writes if modified.
 * This module handles the common I/O logic shared between validateAndFixFileLinks and bulkUpdateMarkdownLinks.
 */
export async function processFileReplacement(
  file: string,
  generateReplacements: (
    links: ParsedLink[],
    content: string,
    lines: string[],
  ) => Promise<Replacement[]>,
  fileService: FileSystemService,
): Promise<{ content: string; applied: number; byKind?: Record<string, number> }> {
  const content = await fileService.readFile(file)
  const lines = content.split(/\r?\n/)
  const result = await processFileWithLinks(content, links =>
    generateReplacements(links, content, lines),
  )
  const modified =
    (result.byKind?.['normalizedFull'] || 0) +
      (result.byKind?.['patched'] || 0) +
      (result.byKind?.['pathSubstitution'] || 0) +
      (result.byKind?.['normalizedRel'] || 0) >
    0
  if (modified) {
    await fileService.writeFile(file, result.content)
  }
  return result
}

export async function processFileWithLinks(
  content: string,
  generateReplacements: (links: ParsedLink[]) => Promise<Replacement[]>,
): Promise<{ content: string; applied: number; byKind: Record<string, number> }> {
  const links = await extractLinks(content)
  const replacements = await generateReplacements(links)
  return applyReplacements(content, replacements)
}

export type Replacement = {
  start?: number | undefined
  end?: number | undefined
  line: number
  oldHref: string
  newHref: string
  kind?: string
}

export type ApplyResult = { content: string; applied: number; byKind: Record<string, number> }

export function replaceLinkOnLine(content: string, line: number, oldHref: string, newHref: string) {
  // Detect the line ending used in the original content
  const hasCRLF = content.includes('\r\n')
  const lineEnding = hasCRLF ? '\r\n' : '\n'

  const lines = content.split(/\r?\n/)
  const idx = Math.max(0, line - 1)
  if (idx >= lines.length) return content
  const lineText = lines[idx] ?? ''
  const pos = lineText.indexOf(oldHref)
  if (pos === -1) return content
  lines[idx] = lineText.slice(0, pos) + newHref + lineText.slice(pos + oldHref.length)
  return lines.join(lineEnding)
}

import { join } from 'path'
import { FileSystemService } from './file-system-service'
import { logger } from '../observability'

/**
 * Walks through a directory and returns all markdown files
 */
export async function walkMarkdownFiles(
  dir: string,
  fileService: FileSystemService,
): Promise<string[]> {
  return logger.time(async () => {
    return await doWalkMarkdownFiles(dir, fileService)
  }, 'walkMarkdownFiles')
}

async function doWalkMarkdownFiles(dir: string, fileService: FileSystemService): Promise<string[]> {
  const entries = await fileService.readdir(dir)
  const files = await Promise.all(
    entries.map(entry => {
      const fullPath = join(dir, entry.name)
      return entry.isDirectory()
        ? doWalkMarkdownFiles(fullPath, fileService)
        : entry.name.endsWith('.md')
          ? [fullPath]
          : []
    }),
  )
  return files.flat()
}
export function isExternalLink(link: string | undefined) {
  if (!link) return false
  const l = link.trim()
  return /^(https?:|mailto:)/i.test(l) || l.startsWith('#')
}

export function normalizeLinkSlashes(link: string) {
  return link.replace(/\\/g, '/')
}

export function stripAnchor(link: string | undefined) {
  if (!link) return ''
  return link.split('#')[0] ?? ''
}

import type { UpdateLinkCommandConfig } from './parser'
import type { FileSystemService } from '@pair/content-ops'
import { createLogger, type LogEntry } from '../command-utils'
import { convertToRelative, convertToAbsolute } from '@pair/content-ops'
import { isExternalLink, walkMarkdownFiles } from '@pair/content-ops/file-system'
import { dirname } from 'path'
import { getKnowledgeHubDatasetPath } from '../../config-utils'

function extractMarkdownLinks(content: string): Array<{ href: string; text: string }> {
  const linkRegex = /\[([^\]]+)\]\(([^)]+)\)/g
  const links: Array<{ href: string; text: string }> = []
  let match

  while ((match = linkRegex.exec(content)) !== null) {
    const text = match[1]
    const href = match[2]
    if (text && href) {
      links.push({ text, href })
    }
  }

  return links
}

function transformLink(
  link: { href: string; text: string },
  filePath: string,
  pathMode: 'relative' | 'absolute',
): { newHref: string; category?: string } {
  if (isExternalLink(link.href)) {
    return { newHref: link.href }
  }

  if (pathMode === 'absolute') {
    if (!link.href.startsWith('/')) {
      const fileDir = dirname(filePath)
      const absPath = convertToAbsolute(fileDir, link.href)
      return { newHref: absPath, category: 'relative→absolute' }
    }
  } else {
    if (link.href.startsWith('/')) {
      const fileDir = dirname(filePath)
      const relPath = convertToRelative(fileDir, link.href)
      return { newHref: relPath, category: 'absolute→relative' }
    }
  }

  return { newHref: link.href }
}

function processMarkdownFile(
  content: string,
  filePath: string,
  pathMode: 'relative' | 'absolute',
): {
  newContent: string
  modified: boolean
  stats: { totalLinks: number; byCategory: Record<string, number> }
} {
  const links = extractMarkdownLinks(content)
  const stats = {
    totalLinks: links.length,
    byCategory: {} as Record<string, number>,
  }

  if (links.length === 0) {
    return { newContent: content, modified: false, stats }
  }

  let modified = false
  let newContent = content

  for (const link of links) {
    const { newHref, category } = transformLink(link, filePath, pathMode)

    if (newHref !== link.href) {
      newContent = newContent.replace(`](${link.href})`, `](${newHref})`)
      modified = true
      if (category) {
        stats.byCategory[category] = (stats.byCategory[category] || 0) + 1
      }
    }
  }

  return { newContent, modified, stats }
}

async function verifyKB(
  fs: FileSystemService,
  pushLog: (level: LogEntry['level'], message: string) => void,
): Promise<string> {
  try {
    const datasetRoot = getKnowledgeHubDatasetPath(fs)
    pushLog('info', `Knowledge Base dataset detected at: ${datasetRoot}`)
  } catch (error) {
    const message = 'No Knowledge Base found. Please run "pair install" first.'
    pushLog('error', message)
    pushLog('error', String(error))
    throw new Error(message)
  }

  const cwd = fs.currentWorkingDirectory()
  const kbPath = fs.resolve(cwd, '.pair')

  if (!fs.existsSync(kbPath)) {
    const message = 'No Knowledge Base installed. Please run "pair install" first.'
    pushLog('error', message)
    throw new Error(message)
  }

  pushLog('info', `Processing installed KB at: ${kbPath}`)
  return kbPath
}

async function processFiles(params: {
  kbPath: string
  pathMode: 'relative' | 'absolute'
  dryRun: boolean
  fs: FileSystemService
  pushLog: (level: LogEntry['level'], message: string) => void
}) {
  const { kbPath, pathMode, dryRun, fs, pushLog } = params
  
  const aggregateStats = {
    totalLinks: 0,
    filesModified: 0,
    linksByCategory: {} as Record<string, number>,
  }

  const files = await walkMarkdownFiles(kbPath, fs)
  pushLog('info', `Found ${files.length} markdown files`)

  for (const filePath of files) {
    const content = fs.readFileSync(filePath)
    const { newContent, modified, stats } = processMarkdownFile(content, filePath, pathMode)

    aggregateStats.totalLinks += stats.totalLinks

    for (const [category, count] of Object.entries(stats.byCategory)) {
      aggregateStats.linksByCategory[category] =
        (aggregateStats.linksByCategory[category] || 0) + count
    }

    if (modified && !dryRun) {
      await fs.writeFile(filePath, newContent)
      aggregateStats.filesModified++
      pushLog('info', `Updated ${filePath}`)
    } else if (modified && dryRun) {
      pushLog('info', `Would update ${filePath}`)
    }
  }

  return aggregateStats
}

/**
 * Handles update-link command execution.
 */
export async function handleUpdateLinkCommand(
  config: UpdateLinkCommandConfig,
  fs: FileSystemService,
): Promise<void> {
  const { pushLog } = createLogger(config.verbose ? 'info' : ('warn' as LogEntry['level']))

  pushLog('info', 'Starting update-link command')
  
  const pathMode = config.absolute ? 'absolute' : 'relative'
  const dryRun = config.dryRun ?? false
  
  pushLog('info', `Path mode: ${pathMode}, Dry run: ${dryRun}`)

  const kbPath = await verifyKB(fs, pushLog)
  const aggregateStats = await processFiles({ kbPath, pathMode, dryRun, fs, pushLog })

  pushLog('info', `Processed ${aggregateStats.totalLinks} links, modified ${aggregateStats.filesModified} files`)
}

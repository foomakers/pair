import type { FileSystemService } from '@pair/content-ops'
import type { LogEntry, CommandOptions } from './command-utils'
import { createLogger } from './command-utils'
import { convertToRelative, convertToAbsolute } from '@pair/content-ops'
import { isExternalLink, walkMarkdownFiles } from '@pair/content-ops/file-system'
import { dirname } from 'path'
import { getKnowledgeHubDatasetPath } from '../config-utils'

export type UpdateLinkOptions = CommandOptions & {
  dryRun?: boolean
  verbose?: boolean
  datasetRoot?: string
}

export type UpdateLinkResult = {
  success: boolean
  message?: string
  pathMode?: 'relative' | 'absolute'
  dryRun?: boolean
  stats?: {
    totalLinks: number
    filesModified: number
    linksByCategory?: Record<string, number>
  }
  logs?: LogEntry[]
}

/**
 * Extract markdown links from content using simple regex
 */
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

/**
 * Transform a single link based on path mode
 */
function transformLink(
  link: { href: string; text: string },
  filePath: string,
  pathMode: 'relative' | 'absolute',
): { newHref: string; category?: string } {
  if (isExternalLink(link.href)) {
    return { newHref: link.href }
  }

  if (pathMode === 'absolute') {
    // Convert to absolute
    if (!link.href.startsWith('/')) {
      const fileDir = dirname(filePath)
      const absPath = convertToAbsolute(fileDir, link.href)
      return { newHref: absPath, category: 'relative→absolute' }
    }
  } else {
    // Convert to relative
    if (link.href.startsWith('/')) {
      const fileDir = dirname(filePath)
      const relPath = convertToRelative(fileDir, link.href)
      return { newHref: relPath, category: 'absolute→relative' }
    }
  }

  return { newHref: link.href }
}

/**
 * Process a single markdown file and transform links
 */
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

/**
 * Configuration for processing markdown files
 */
type ProcessConfig = {
  fsService: FileSystemService
  kbPath: string
  pathMode: 'relative' | 'absolute'
  dryRun: boolean
  pushLog: (level: LogEntry['level'], message: string) => void
}

/**
 * Process markdown files in a directory and transform links
 */
async function processMarkdownFiles(config: ProcessConfig): Promise<{
  totalLinks: number
  filesModified: number
  linksByCategory: Record<string, number>
}> {
  const { fsService, kbPath, pathMode, dryRun, pushLog } = config
  const aggregateStats = {
    totalLinks: 0,
    filesModified: 0,
    linksByCategory: {} as Record<string, number>,
  }

  const files = await walkMarkdownFiles(kbPath, fsService)
  pushLog('info', `Found ${files.length} markdown files`)

  for (const filePath of files) {
    const content = fsService.readFileSync(filePath)
    const { newContent, modified, stats } = processMarkdownFile(content, filePath, pathMode)

    aggregateStats.totalLinks += stats.totalLinks

    for (const [category, count] of Object.entries(stats.byCategory)) {
      aggregateStats.linksByCategory[category] =
        (aggregateStats.linksByCategory[category] || 0) + count
    }

    if (modified && !dryRun) {
      await fsService.writeFile(filePath, newContent)
      aggregateStats.filesModified++
      pushLog('info', `Updated ${filePath}`)
    } else if (modified && dryRun) {
      pushLog('info', `Would update ${filePath}`)
    }
  }

  return aggregateStats
}

/**
 * Parse update-link command arguments
 */
function parseUpdateLinkArgs(args: string[]): {
  pathMode: 'relative' | 'absolute'
  dryRun: boolean
  error?: string
} {
  const hasRelative = args.includes('--relative')
  const hasAbsolute = args.includes('--absolute')
  const dryRun = args.includes('--dry-run')

  // Check for conflicting flags
  if (hasRelative && hasAbsolute) {
    return {
      pathMode: 'relative',
      dryRun: false,
      error: 'Cannot specify both --relative and --absolute flags',
    }
  }

  // Default to relative if no path mode specified
  const pathMode = hasAbsolute ? 'absolute' : 'relative'

  return { pathMode, dryRun }
}

/**
 * Verify KB is available using same detection as install/update commands
 */
function verifyKnowledgeBase(
  fsService: FileSystemService,
  pushLog: (level: LogEntry['level'], message: string) => void,
  options?: UpdateLinkOptions,
): { kbPath: string } | { error: string } {
  // Verify KB dataset is available
  try {
    const datasetRoot = options?.datasetRoot || getKnowledgeHubDatasetPath(fsService)
    pushLog('info', `Knowledge Base dataset detected at: ${datasetRoot}`)
  } catch (error) {
    const message = 'No Knowledge Base found. Please run "pair install" first.'
    pushLog('error', message)
    pushLog('error', String(error))
    return { error: message }
  }

  // Process installed KB content in .pair directory
  const cwd = fsService.currentWorkingDirectory()
  const kbPath = fsService.resolve(cwd, '.pair')

  if (!fsService.existsSync(kbPath)) {
    const message = 'No Knowledge Base installed. Please run "pair install" first.'
    pushLog('error', message)
    return { error: message }
  }

  pushLog('info', `Processing installed KB at: ${kbPath}`)
  return { kbPath }
}

/**
 * Main update-link command handler
 */
export async function updateLinkCommand(
  fsService: FileSystemService,
  args: string[],
  options?: UpdateLinkOptions,
): Promise<UpdateLinkResult> {
  const { logs, pushLog } = createLogger(options?.minLogLevel as LogEntry['level'] | undefined)

  pushLog('info', 'Starting update-link command')

  const parseResult = parseUpdateLinkArgs(args)
  if (parseResult.error) {
    pushLog('error', parseResult.error)
    return { success: false, message: parseResult.error, logs }
  }

  const { pathMode, dryRun } = parseResult
  pushLog('info', `Path mode: ${pathMode}, Dry run: ${dryRun}`)

  // Verify KB is available
  const kbResult = verifyKnowledgeBase(fsService, pushLog, options)
  if ('error' in kbResult) {
    return { success: false, message: kbResult.error, logs }
  }

  const { kbPath } = kbResult

  const stats = await processMarkdownFiles({ fsService, kbPath, pathMode, dryRun, pushLog })

  pushLog('info', `Processed ${stats.totalLinks} links, modified ${stats.filesModified} files`)

  return {
    success: true,
    message: 'Link update completed successfully',
    pathMode,
    stats,
    logs,
    ...(dryRun && { dryRun: true }),
  }
}

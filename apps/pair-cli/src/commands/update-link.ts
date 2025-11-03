import type { FileSystemService } from '@pair/content-ops'
import type { LogEntry, CommandOptions } from './command-utils'
import { createLogger } from './command-utils'
import { convertToRelative, convertToAbsolute } from '@pair/content-ops'
import { dirname } from 'path'

export type UpdateLinkOptions = CommandOptions & {
  dryRun?: boolean
  verbose?: boolean
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
 * Check if a link is external (http/https/mailto/etc)
 */
function isExternalLink(href: string): boolean {
  return /^(https?|mailto|ftp):/.test(href)
}

/**
 * Check if a link is an anchor
 */
function isAnchor(href: string): boolean {
  return href.startsWith('#')
}

/**
 * Process markdown files in a directory and transform links
 */
// eslint-disable-next-line complexity, max-lines-per-function, max-params
async function processMarkdownFiles(
  fsService: FileSystemService,
  kbPath: string,
  pathMode: 'relative' | 'absolute',
  dryRun: boolean,
  pushLog: (level: LogEntry['level'], message: string) => void,
): Promise<{
  totalLinks: number
  filesModified: number
  linksByCategory: Record<string, number>
}> {
  const stats = {
    totalLinks: 0,
    filesModified: 0,
    linksByCategory: {} as Record<string, number>,
  }

  // Find all markdown files
  const files = await findMarkdownFiles(fsService, kbPath)
  pushLog('info', `Found ${files.length} markdown files`)

  for (const filePath of files) {
    const content = fsService.readFileSync(filePath)
    const links = extractMarkdownLinks(content)

    if (links.length === 0) continue

    stats.totalLinks += links.length
    let modified = false
    let newContent = content

    for (const link of links) {
      if (isExternalLink(link.href) || isAnchor(link.href)) {
        continue
      }

      let newHref = link.href

      if (pathMode === 'absolute') {
        // Convert to absolute
        if (!link.href.startsWith('/')) {
          const fileDir = dirname(filePath)
          const absPath = convertToAbsolute(fileDir, link.href)
          newHref = absPath
          modified = true
          stats.linksByCategory['relative→absolute'] =
            (stats.linksByCategory['relative→absolute'] || 0) + 1
        }
      } else {
        // Convert to relative
        if (link.href.startsWith('/')) {
          const fileDir = dirname(filePath)
          const relPath = convertToRelative(fileDir, link.href)
          newHref = relPath
          modified = true
          stats.linksByCategory['absolute→relative'] =
            (stats.linksByCategory['absolute→relative'] || 0) + 1
        }
      }

      if (newHref !== link.href) {
        newContent = newContent.replace(`](${link.href})`, `](${newHref})`)
      }
    }

    if (modified && !dryRun) {
      await fsService.writeFile(filePath, newContent)
      stats.filesModified++
      pushLog('info', `Updated ${filePath}`)
    } else if (modified && dryRun) {
      pushLog('info', `Would update ${filePath}`)
    }
  }

  return stats
}

/**
 * Find all markdown files in a directory recursively
 */
async function findMarkdownFiles(fsService: FileSystemService, dirPath: string): Promise<string[]> {
  const files: string[] = []

  async function walk(dir: string) {
    const entries = await fsService.readdir(dir)

    for (const entry of entries) {
      const fullPath = fsService.resolve(dir, entry.name)
      const isDir = entry.isDirectory()

      if (isDir) {
        await walk(fullPath)
      } else if (entry.name.endsWith('.md')) {
        files.push(fullPath)
      }
    }
  }

  await walk(dirPath)
  return files
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
 * Detect if Knowledge Base is installed in the project
 */
function detectKnowledgeBase(fsService: FileSystemService): string | null {
  const cwd = fsService.currentWorkingDirectory()
  const pairPath = fsService.resolve(cwd, '.pair')

  if (fsService.existsSync(pairPath)) {
    return pairPath
  }

  return null
}

/**
 * Main update-link command handler
 */
// eslint-disable-next-line max-lines-per-function
export async function updateLinkCommand(
  fsService: FileSystemService,
  args: string[],
  options?: UpdateLinkOptions,
): Promise<UpdateLinkResult> {
  const { logs, pushLog } = createLogger(options?.minLogLevel as LogEntry['level'] | undefined)

  pushLog('info', 'Starting update-link command')

  // Parse arguments
  const parseResult = parseUpdateLinkArgs(args)
  if (parseResult.error) {
    pushLog('error', parseResult.error)
    return {
      success: false,
      message: parseResult.error,
      logs,
    }
  }

  const { pathMode, dryRun } = parseResult

  pushLog('info', `Path mode: ${pathMode}, Dry run: ${dryRun}`)

  // Detect Knowledge Base
  const kbPath = detectKnowledgeBase(fsService)
  if (!kbPath) {
    const message = 'No Knowledge Base found. Please run "pair install" first.'
    pushLog('error', message)
    return {
      success: false,
      message,
      logs,
    }
  }

  pushLog('info', `Knowledge Base detected at: ${kbPath}`)

  // Process markdown files and transform links
  const stats = await processMarkdownFiles(fsService, kbPath, pathMode, dryRun, pushLog)

  pushLog('info', `Processed ${stats.totalLinks} links, modified ${stats.filesModified} files`)

  const result: UpdateLinkResult = {
    success: true,
    message: 'Link update completed successfully',
    pathMode,
    stats,
    logs,
  }

  if (dryRun) {
    result.dryRun = true
  }

  return result
}

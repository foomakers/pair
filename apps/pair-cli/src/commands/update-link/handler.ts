import type { UpdateLinkCommandConfig } from './parser'
import {
  type FileSystemService,
  convertToRelative,
  convertToAbsolute,
  extractLinks,
  type ParsedLink,
  isExternalLink,
  walkMarkdownFiles,
  BackupService,
} from '@pair/content-ops'
import { dirname } from 'path'
import { getKnowledgeHubDatasetPath } from '#config'
import { createLogger, type LogEntry } from '#diagnostics'
import { setLogLevel } from '@pair/content-ops'
import { createRegistryBackupConfig, handleBackupRollback } from '#registry'

function transformLink(
  link: ParsedLink,
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

async function processMarkdownFile(
  content: string,
  filePath: string,
  pathMode: 'relative' | 'absolute',
): Promise<{
  newContent: string
  modified: boolean
  stats: { totalLinks: number; byCategory: Record<string, number> }
}> {
  const links = await extractLinks(content)
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
  config: UpdateLinkCommandConfig,
  fs: FileSystemService,
  pushLog: (level: LogEntry['level'], message: string) => void,
): Promise<string> {
  let datasetRoot: string | undefined
  try {
    datasetRoot = getKnowledgeHubDatasetPath(fs)
    pushLog('info', `Knowledge Base dataset detected at: ${datasetRoot}`)
  } catch (error) {
    pushLog(
      'warn',
      `Knowledge Base dataset not found: ${String(error)}. Link fixing might be limited.`,
    )
  }

  const kbPath = config.target ? fs.resolve(config.target) : fs.resolve('.pair/knowledge')

  if (!fs.existsSync(kbPath)) {
    const message = `No Knowledge Base found at: ${kbPath}. Please run "pair install" first.`
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
    const { newContent, modified, stats } = await processMarkdownFile(content, filePath, pathMode)

    aggregateStats.totalLinks += stats.totalLinks

    for (const [category, count] of Object.entries(stats.byCategory)) {
      aggregateStats.linksByCategory[category] =
        (aggregateStats.linksByCategory[category] || 0) + (count as number)
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
 * Update link options for handler
 */
interface UpdateLinkHandlerOptions {
  persistBackup?: boolean
}

/**
 * Handles update-link command execution.
 */
export async function handleUpdateLinkCommand(
  config: UpdateLinkCommandConfig,
  fs: FileSystemService,
  options?: UpdateLinkHandlerOptions,
): Promise<void> {
  if (config.logLevel) setLogLevel(config.logLevel)
  const { pushLog } = createLogger((config.logLevel as LogEntry['level']) ?? 'info')

  pushLog('info', 'Starting update-link command')

  try {
    await executeUpdateLinkSequence(config, fs, options, pushLog)
    pushLog('info', 'Update-link completed')
  } catch (error) {
    pushLog('error', `Update-link failed: ${String(error)}`)
    throw error
  }
}

async function executeUpdateLinkSequence(
  config: UpdateLinkCommandConfig,
  fs: FileSystemService,
  options: UpdateLinkHandlerOptions | undefined,
  pushLog: (level: LogEntry['level'], message: string) => void,
): Promise<void> {
  const pathMode = config.absolute ? 'absolute' : 'relative'
  const dryRun = config.dryRun ?? false
  const kbPath = await verifyKB(config, fs, pushLog)
  const backupService = new BackupService(fs)
  const shouldBackup = !dryRun

  if (shouldBackup) {
    await performLinkBackup(backupService, kbPath, pushLog)
  }

  try {
    const aggregateStats = await processFiles({ kbPath, pathMode, dryRun, fs, pushLog })

    if (shouldBackup && !options?.persistBackup) {
      await backupService.commit(false)
    }

    pushLog(
      'info',
      `Processed ${aggregateStats.totalLinks} links, modified ${aggregateStats.filesModified} files`,
    )
  } catch (error) {
    if (shouldBackup) {
      await handleLinkRollback(backupService, error, options, pushLog)
    }
    throw error
  }
}

async function performLinkBackup(
  backupService: BackupService,
  kbPath: string,
  pushLog: (level: LogEntry['level'], message: string) => void,
): Promise<void> {
  pushLog('info', 'Creating backup before modifications...')
  const backupConfig = createRegistryBackupConfig('knowledge-base', kbPath)
  await backupService.backupAllRegistries(backupConfig)
}

async function handleLinkRollback(
  backupService: BackupService,
  error: unknown,
  options: UpdateLinkHandlerOptions | undefined,
  pushLog: (level: LogEntry['level'], message: string) => void,
): Promise<void> {
  pushLog('warn', 'Update failed, attempting rollback...')
  await handleBackupRollback(
    backupService,
    error,
    { autoRollback: true, keepBackup: options?.persistBackup ?? false },
    pushLog,
  )
}

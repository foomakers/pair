import {
  copyPathOps,
  walkMarkdownFiles,
  isExternalLink,
  extractLinks,
  type ParsedLink,
} from '@pair/content-ops'
import type { FileSystemService } from '@pair/content-ops'
import { isAbsolute } from 'node:path'

export type LogEntry = {
  time: string
  level: 'trace' | 'debug' | 'info' | 'warn' | 'error'
  message: string
  meta?: Record<string, unknown> | undefined
}

export type CommandOptions = {
  datasetRoot?: string
  customConfigPath?: string
  baseTarget?: string
  useDefaults?: boolean
  minLogLevel?: LogEntry['level'] | string
}

export function parseTargetAndSource(args?: string[] | null) {
  if (!Array.isArray(args)) args = []
  const targetIndex = args.indexOf('--target')
  const target = targetIndex >= 0 && args[targetIndex + 1] ? args[targetIndex + 1] : null
  const sourceIndex = args.indexOf('--source')
  const source = sourceIndex >= 0 && args[sourceIndex + 1] ? args[sourceIndex + 1] : null
  return { target, source }
}

/**
 * Parse registry overrides in format "registry:target"
 */
// Note: registry overrides via CLI have been removed in the simplified flow.

/**
 * Parse install/update arguments supporting multiple formats:
 * - No args: use defaults from config
 * - Single arg: base target folder for all registries
 * - Multiple args: registry:target overrides
 */
export function parseInstallUpdateArgs(args: string[]) {
  // If no args provided, use defaults from config
  if (!args || args.length === 0) {
    return { baseTarget: null, useDefaults: true }
  }

  // Find the first non-flag argument (should be the base target)
  const baseTarget = args.find(arg => !arg.startsWith('--')) || null

  return { baseTarget, useDefaults: false }
}

export function createLogger(minLogLevel?: LogEntry['level']) {
  const logs: LogEntry[] = []
  const now = () => new Date().toISOString()

  const levelOrder: Record<LogEntry['level'], number> = {
    trace: 0,
    debug: 1,
    info: 2,
    warn: 3,
    error: 4,
  }

  const threshold =
    minLogLevel && levelOrder[minLogLevel] !== undefined
      ? levelOrder[minLogLevel]
      : levelOrder['info']

  const pushLog = (level: LogEntry['level'], message: string, meta?: Record<string, unknown>) => {
    const entry: LogEntry = { time: now(), level, message, meta }
    if (levelOrder[level] >= threshold) logs.push(entry)
    // Logging is always captured; interactive verbose printing was removed.
  }
  return { logs, pushLog }
}

export async function ensureDir(fsService: FileSystemService, abs: string) {
  await fsService.mkdir(abs, { recursive: true })
}

/**
 * Recursively copy directory or file from source to target
 */
async function copyRecursive(
  fsService: FileSystemService,
  srcPath: string,
  tgtPath: string,
): Promise<void> {
  const stat = await fsService.stat(srcPath)
  if (!stat.isDirectory()) {
    const content = await fsService.readFile(srcPath)
    await fsService.writeFile(tgtPath, content)
    return
  }

  await fsService.mkdir(tgtPath, { recursive: true })
  const entries = await fsService.readdir(srcPath)
  for (const entry of entries) {
    const srcEntryPath = fsService.resolve(srcPath, entry.name)
    const tgtEntryPath = fsService.resolve(tgtPath, entry.name)
    if (entry.isDirectory()) {
      await copyRecursive(fsService, srcEntryPath, tgtEntryPath)
    } else {
      const content = await fsService.readFile(srcEntryPath)
      await fsService.writeFile(tgtEntryPath, content)
    }
  }
}

export async function doCopyAndUpdateLinks(
  fsService: FileSystemService,
  copyOptions: {
    source: string
    target: string
    datasetRoot: string
    options?: Record<string, unknown>
  },
) {
  const { source, target, datasetRoot, options } = copyOptions

  // copyPathOps requires BOTH source and target to be relative to datasetRoot
  // For cross-directory copies, manually copy files instead
  if (isAbsolute(source) || isAbsolute(target)) {
    const srcPath = isAbsolute(source) ? source : fsService.resolve(datasetRoot, source)
    const tgtPath = isAbsolute(target) ? target : fsService.resolve(datasetRoot, target)

    if (await fsService.exists(srcPath)) {
      await copyRecursive(fsService, srcPath, tgtPath)
    }
  } else {
    // Both relative - use copyPathOps normally
    await copyPathOps({
      fileService: fsService,
      source,
      target,
      datasetRoot,
      ...(options && { options }),
    })
  }

  return {}
}

/**
 * Extract markdown links from content (delegates to content-ops)
 */
export async function extractMarkdownLinks(
  content: string,
): Promise<Array<{ href: string; text: string }>> {
  const links = await extractLinks(content)
  return links.map((l: ParsedLink) => ({ href: l.href, text: l.text }))
}

/**
 * Detect the dominant link style in markdown files at targetPath

/**
 * Detect the dominant link style in markdown files at targetPath
 * Returns 'relative' if relative links are >= absolute links, otherwise 'absolute'
 */
export async function detectLinkStyle(
  fsService: FileSystemService,
  targetPath: string,
): Promise<'relative' | 'absolute'> {
  const files = await walkMarkdownFiles(targetPath, fsService)
  let relativeCount = 0
  let absoluteCount = 0

  for (const file of files) {
    const content = await fsService.readFile(file)
    const links = await extractMarkdownLinks(content)

    for (const link of links) {
      if (isExternalLink(link.href)) continue
      if (link.href.startsWith('#')) continue

      if (link.href.startsWith('/')) {
        absoluteCount++
      } else {
        relativeCount++
      }
    }
  }

  return relativeCount >= absoluteCount ? 'relative' : 'absolute'
}

/**
 * Apply link transformation after install/update
 */
export async function applyLinkTransformation(
  fsService: FileSystemService,
  options: { linkStyle?: 'relative' | 'absolute' | 'auto'; minLogLevel?: string },
  pushLog: (level: LogEntry['level'], message: string) => void,
  mode: 'install' | 'update',
): Promise<void> {
  const linkStyle = options.linkStyle
  if (!linkStyle) return

  pushLog('info', `Applying link transformation: ${linkStyle}`)

  try {
    let style: 'relative' | 'absolute' = 'relative'

    if (linkStyle === 'auto') {
      if (mode === 'update') {
        // For update, auto means detect existing style
        const kbPath = fsService.resolve('.pair')
        if (await fsService.exists(kbPath)) {
          style = await detectLinkStyle(fsService, kbPath)
          pushLog('info', `Auto-detected link style: ${style}`)
        }
      } else {
        // For install, auto means relative (default)
        style = 'relative'
      }
    } else {
      style = linkStyle
    }

    // Import handler locally to avoid circular dependency
    const { handleUpdateLinkCommand } = await import('./update-link/handler.js')
    await handleUpdateLinkCommand(
      {
        command: 'update-link',
        absolute: style === 'absolute',
        dryRun: false,
        verbose: options.minLogLevel === 'info' || options.minLogLevel === 'debug',
      },
      fsService,
    )
    pushLog('info', `Link transformation completed: ${style}`)
  } catch (err) {
    pushLog('warn', `Link transformation failed: ${String(err)}`)
  }
}

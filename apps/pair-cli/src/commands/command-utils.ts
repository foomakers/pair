import { copyPathOps } from '@pair/content-ops'
import type { FileSystemService } from '@pair/content-ops'

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

export async function doCopyAndUpdateLinks(
  fsService: FileSystemService,
  copyOptions: {
    source: string
    target: string
    datasetRoot: string
    options?: Record<string, unknown>
  },
) {
  await copyPathOps({
    fileService: fsService,
    ...copyOptions,
  })
  return {}
}

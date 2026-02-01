import { FileSystemService, LogLevel } from '@pair/content-ops'
import { isInRelease, getKnowledgeHubDatasetPath } from './config'

/**
 * Global default minimum logging level.
 */
export const MIN_LOG_LEVEL: LogLevel = 'INFO'

/**
 * Check if diagnostic logging is enabled via PAIR_DIAG environment variable.
 */
export function isDiagEnabled(): boolean {
  const diagEnv = process.env['PAIR_DIAG']
  return diagEnv === '1' || diagEnv === 'true'
}

/**
 * Diagnostic logging: prints key runtime values to stderr.
 * Helps reproduce environment differences (CI vs local).
 */
export function runDiagnostics(fsService: FileSystemService): void {
  if (!isDiagEnabled()) return

  try {
    console.error(`[diag] __dirname=${fsService.rootModuleDirectory()}`)
    console.error(`[diag] process cwd=${fsService.currentWorkingDirectory()}`)
    console.error(`[diag] argv=${process.argv.join(' ')}`)

    console.error(
      `[diag] isInRelease(__dirname)=${isInRelease(fsService, fsService.rootModuleDirectory())}`,
    )

    try {
      const resolved = getKnowledgeHubDatasetPath(fsService)
      console.error(`[diag] getKnowledgeHubDatasetPath resolved to: ${resolved}`)
    } catch (err) {
      console.error(`[diag] getKnowledgeHubDatasetPath threw: ${String(err)}`)
      if (err && (err as Error).stack) console.error((err as Error).stack)
    }
  } catch (err) {
    console.error('[diag] failed to emit diagnostics', String(err))
  }
}

/**
 * Logger structures and factory
 */
export type LogEntry = {
  time: string
  level: 'trace' | 'debug' | 'info' | 'warn' | 'error'
  message: string
  meta?: Record<string, unknown> | undefined
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
  }
  return { logs, pushLog }
}

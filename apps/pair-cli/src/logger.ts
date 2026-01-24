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

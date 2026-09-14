import { relative } from 'path'

// Error types and interfaces
export type ErrorType = 'BAD LINK FORMAT' | 'LINK TARGET NOT FOUND'

export type ContentSyncError =
  | { type: 'PATH_ESCAPE'; message: string; source: string; target: string }
  | { type: 'SOURCE_NOT_EXISTS'; message: string; sourcePath: string }
  | { type: 'INVALID_PATH'; message: string; sourcePath: string; targetPath: string }
  | { type: 'INVALID_SUBFOLDER_MOVE'; message: string; source: string; target: string }
  | { type: 'INVALID_SUBFOLDER_COPY'; message: string; source: string; target: string }
  | { type: 'INVALID_SOURCE_TYPE'; message: string; sourcePath: string }
  | { type: 'IO_ERROR'; message: string; operation: string; path: string; originalError?: unknown }
  | { type: 'MIRROR_CONSTRAINT_VIOLATION'; message: string; details: string }

export interface ErrorLog {
  type: ErrorType
  file: string
  lineNumber: number
  line: string
}

// Simplified logging levels
export type LogLevel = 'INFO' | 'WARN' | 'ERROR' | 'DEBUG'

// Current minimum log level (inclusive). Messages below this level are suppressed.
let currentLogLevel: LogLevel = 'INFO'

const levelOrder: Record<LogLevel, number> = {
  DEBUG: 0,
  INFO: 1,
  WARN: 2,
  ERROR: 3,
}

function normalizeLevel(level?: string | LogLevel): LogLevel {
  if (!level) return 'INFO'
  const l = String(level).toUpperCase().trim()
  if (l === 'DEBUG') return 'DEBUG'
  if (l === 'INFO') return 'INFO'
  if (l === 'WARN' || l === 'WARNING') return 'WARN'
  if (l === 'ERROR') return 'ERROR'
  return 'INFO'
}

export function setLogLevel(level?: string | LogLevel) {
  currentLogLevel = normalizeLevel(level)
}

export function getLogLevel(): LogLevel {
  return currentLogLevel
}

function shouldLog(messageLevel: LogLevel) {
  return levelOrder[messageLevel] >= levelOrder[currentLogLevel]
}

/**
 * Escapes C0 and C1 control characters (keeping `\n` and `\t`, which are real
 * formatting) as a visible `\xNN`.
 *
 * WHY at this boundary: diagnostics routinely quote strings this process did not
 * author — a key from a config file being validated, a registry name, a package
 * manifest field. `pair-cli kb-validate --path ./downloaded-kb` on a KB you did not
 * write would otherwise let that KB's `config.json` move the cursor, clear the
 * screen, or rewrite the terminal title/clipboard through an OSC sequence, just
 * by naming a key. Escaping ONCE here means no call site has to remember.
 *
 * ESCAPED, not dropped: the operator still sees that something was there, and
 * what it was, which a silent drop would hide.
 */
export function sanitizeControlCharacters(text: string): string {
  // A character-by-character scan, not a control-character regex literal: this repo's
  // code-hygiene gate flags every linter-suppression comment with no exception
  // mechanism, and a loop needs none. Same ranges as the regex it replaces (C0
  // 0x00-0x08 and 0x0B-0x1F, C1 0x7F-0x9F), keeping \t (0x09) and \n (0x0A)
  // untouched as real formatting.
  let result = ''
  for (const char of text) {
    const code = char.codePointAt(0) ?? 0
    const isControl =
      code <= 0x08 || (code >= 0x0b && code <= 0x1f) || (code >= 0x7f && code <= 0x9f)
    result += isControl ? `\\x${code.toString(16).toUpperCase().padStart(2, '0')}` : char
  }
  return result
}

// Unified Logger - Funzioni standalone invece di classe
let loggerEnabled = true

export const logger = {
  enable: () => {
    loggerEnabled = true
  },
  disable: () => {
    loggerEnabled = false
  },

  info: (message: string, data?: unknown) => {
    if (!loggerEnabled) return
    if (!shouldLog('INFO')) return
    const payload = data ? (typeof data === 'string' ? data : JSON.stringify(data)) : ''
    console.log(sanitizeControlCharacters(payload ? `ℹ️ ${message} ${payload}` : `ℹ️ ${message}`))
  },

  warn: (message: string, data?: unknown) => {
    if (!loggerEnabled) return
    if (!shouldLog('WARN')) return
    const payload = data ? (typeof data === 'string' ? data : JSON.stringify(data)) : ''
    console.warn(sanitizeControlCharacters(payload ? `⚠️ ${message} ${payload}` : `⚠️ ${message}`))
  },

  error: (message: string, data?: unknown) => {
    if (!loggerEnabled) return
    if (!shouldLog('ERROR')) return
    const payload = data ? (typeof data === 'string' ? data : JSON.stringify(data)) : ''
    console.error(sanitizeControlCharacters(payload ? `❌ ${message} ${payload}` : `❌ ${message}`))
  },

  debug: (message: string, data?: unknown) => {
    if (!loggerEnabled) return
    if (!shouldLog('DEBUG')) return
    const payload = data ? (typeof data === 'string' ? data : JSON.stringify(data)) : ''
    console.debug(sanitizeControlCharacters(payload ? `🔍 ${message} ${payload}` : `🔍 ${message}`))
  },

  // Security-specific logging (semplificato)
  security: (
    level: 'INFO' | 'WARN' | 'CRITICAL',
    operation: string,
    message: string,
    details?: unknown,
  ) => {
    const prefix = level === 'CRITICAL' ? '🚨 SECURITY CRITICAL' : `🔒 SECURITY ${level}`
    const logMethod = level === 'CRITICAL' ? 'error' : level === 'WARN' ? 'warn' : 'info'
    logger[logMethod](`${prefix} [${operation}]: ${message}`, details)
  },

  // Performance logging semplificato
  time: async <T>(operation: () => Promise<T>, operationName: string): Promise<T> => {
    const start = Date.now()
    try {
      const result = await operation()
      const duration = Date.now() - start
      logger.debug(`⏱️ ${operationName} completed in ${duration}ms`)
      return result
    } catch (error) {
      const duration = Date.now() - start
      logger.error(`⏱️ ${operationName} failed after ${duration}ms`, error)
      throw error
    }
  },
}

// Error creation functions (mantenute semplici)
export function createError(error: ContentSyncError): Error {
  const err = new Error(error.message)
  err.name = error.type
  return err
}

export function createMirrorConstraintError(message: string, details: string): Error {
  return createError({
    type: 'MIRROR_CONSTRAINT_VIOLATION',
    message,
    details,
  })
}

export function createFormatError(rootPath: string) {
  return ({ type, file, lineNumber, line }: ErrorLog) => {
    return `\n---\nFile: ${relative(
      rootPath,
      file,
    )}\nLine: ${lineNumber}\nType: ${type}\nText: ${line.trim()}\n---`
  }
}

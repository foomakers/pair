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
    console.log(`ℹ️ ${message}`, data || '')
  },

  warn: (message: string, data?: unknown) => {
    if (!loggerEnabled) return
    if (!shouldLog('WARN')) return
    console.warn(`⚠️ ${message}`, data || '')
  },

  error: (message: string, data?: unknown) => {
    if (!loggerEnabled) return
    if (!shouldLog('ERROR')) return
    console.error(`❌ ${message}`, data || '')
  },

  debug: (message: string, data?: unknown) => {
    if (!loggerEnabled) return
    if (!shouldLog('DEBUG')) return
    console.debug(`🔍 ${message}`, data || '')
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

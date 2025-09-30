# 📝 Logging Guidelines

**Focus**: Comprehensive logging strategies, structured logging, and observability practices

Guidelines for implementing effective logging that provides valuable insights for debugging, monitoring, and understanding application behavior across different environments.

## 🎯 Logging Principles

### Structured Logging Framework

```typescript
// ✅ Comprehensive structured logging system
enum LogLevel {
  TRACE = 0,
  DEBUG = 1,
  INFO = 2,
  WARN = 3,
  ERROR = 4,
  FATAL = 5,
}

interface LogContext {
  readonly correlationId?: string
  readonly userId?: string
  readonly sessionId?: string
  readonly requestId?: string
  readonly operation?: string
  readonly component?: string
  readonly version?: string
  readonly environment?: string
  readonly timestamp?: Date
  readonly metadata?: Record<string, unknown>
}

interface LogEntry {
  readonly level: LogLevel
  readonly message: string
  readonly timestamp: Date
  readonly context: LogContext
  readonly error?: Error
  readonly duration?: number
  readonly tags?: string[]
}

interface Logger {
  trace(message: string, context?: Partial<LogContext>): void
  debug(message: string, context?: Partial<LogContext>): void
  info(message: string, context?: Partial<LogContext>): void
  warn(message: string, context?: Partial<LogContext>): void
  error(message: string, error?: Error, context?: Partial<LogContext>): void
  fatal(message: string, error?: Error, context?: Partial<LogContext>): void

  withContext(context: Partial<LogContext>): Logger
  createTimer(operation: string): LogTimer
  isLevelEnabled(level: LogLevel): boolean
}

interface LogTimer {
  readonly startTime: Date
  readonly operation: string

  info(message: string, context?: Partial<LogContext>): void
  warn(message: string, context?: Partial<LogContext>): void
  error(message: string, error?: Error, context?: Partial<LogContext>): void
  end(message?: string, context?: Partial<LogContext>): void
}

// ✅ Production-ready logger implementation
class StructuredLogger implements Logger {
  private readonly baseContext: LogContext
  private readonly config: LoggerConfig
  private readonly transports: LogTransport[]

  constructor(
    config: LoggerConfig,
    transports: LogTransport[],
    baseContext: Partial<LogContext> = {},
  ) {
    this.config = config
    this.transports = transports
    this.baseContext = {
      ...baseContext,
      environment: process.env.NODE_ENV || 'development',
      version: process.env.APP_VERSION || 'unknown',
    }
  }

  trace(message: string, context?: Partial<LogContext>): void {
    this.log(LogLevel.TRACE, message, context)
  }

  debug(message: string, context?: Partial<LogContext>): void {
    this.log(LogLevel.DEBUG, message, context)
  }

  info(message: string, context?: Partial<LogContext>): void {
    this.log(LogLevel.INFO, message, context)
  }

  warn(message: string, context?: Partial<LogContext>): void {
    this.log(LogLevel.WARN, message, context)
  }

  error(message: string, error?: Error, context?: Partial<LogContext>): void {
    this.log(LogLevel.ERROR, message, { ...context, error })
  }

  fatal(message: string, error?: Error, context?: Partial<LogContext>): void {
    this.log(LogLevel.FATAL, message, { ...context, error })
  }

  withContext(context: Partial<LogContext>): Logger {
    return new StructuredLogger(this.config, this.transports, { ...this.baseContext, ...context })
  }

  createTimer(operation: string): LogTimer {
    return new LogTimerImpl(this, operation)
  }

  isLevelEnabled(level: LogLevel): boolean {
    return level >= this.config.level
  }

  private log(
    level: LogLevel,
    message: string,
    context?: Partial<LogContext & { error?: Error }>,
  ): void {
    if (!this.isLevelEnabled(level)) {
      return
    }

    const logEntry: LogEntry = {
      level,
      message,
      timestamp: new Date(),
      context: {
        ...this.baseContext,
        ...context,
        correlationId: context?.correlationId || this.generateCorrelationId(),
      },
      error: context?.error,
    }

    // Apply redaction and sanitization
    const sanitizedEntry = this.sanitizeLogEntry(logEntry)

    // Send to all transports
    this.transports.forEach(transport => {
      try {
        transport.log(sanitizedEntry)
      } catch (error) {
        // Fallback logging to prevent logging failures from breaking the application
        console.error('Logging transport failed:', error)
        console.log('Original log entry:', JSON.stringify(sanitizedEntry, null, 2))
      }
    })
  }

  private generateCorrelationId(): string {
    return crypto.randomUUID()
  }

  private sanitizeLogEntry(entry: LogEntry): LogEntry {
    const sanitizedContext = this.sanitizeContext(entry.context)

    return {
      ...entry,
      context: sanitizedContext,
      message: this.sanitizeMessage(entry.message),
    }
  }

  private sanitizeContext(context: LogContext): LogContext {
    const sensitiveFields = [
      'password',
      'token',
      'secret',
      'key',
      'authorization',
      'creditCard',
      'ssn',
      'email',
      'phone',
    ]

    const sanitized = { ...context }

    if (sanitized.metadata) {
      sanitized.metadata = this.redactSensitiveData(sanitized.metadata, sensitiveFields)
    }

    return sanitized
  }

  private sanitizeMessage(message: string): string {
    // Remove potential sensitive data from log messages
    return message
      .replace(/password[=:]\s*\S+/gi, 'password=[REDACTED]')
      .replace(/token[=:]\s*\S+/gi, 'token=[REDACTED]')
      .replace(/key[=:]\s*\S+/gi, 'key=[REDACTED]')
  }

  private redactSensitiveData(
    obj: Record<string, unknown>,
    sensitiveFields: string[],
  ): Record<string, unknown> {
    const redacted = { ...obj }

    for (const [key, value] of Object.entries(redacted)) {
      const lowerKey = key.toLowerCase()

      if (sensitiveFields.some(field => lowerKey.includes(field))) {
        redacted[key] = '[REDACTED]'
      } else if (typeof value === 'object' && value !== null) {
        redacted[key] = this.redactSensitiveData(value as Record<string, unknown>, sensitiveFields)
      }
    }

    return redacted
  }
}

// ✅ Log timer implementation for performance tracking
class LogTimerImpl implements LogTimer {
  readonly startTime: Date
  readonly operation: string
  private readonly logger: Logger

  constructor(logger: Logger, operation: string) {
    this.logger = logger
    this.operation = operation
    this.startTime = new Date()

    this.logger.debug(`Started operation: ${operation}`, {
      operation,
      timestamp: this.startTime,
    })
  }

  info(message: string, context?: Partial<LogContext>): void {
    const duration = Date.now() - this.startTime.getTime()
    this.logger.info(message, {
      ...context,
      operation: this.operation,
      duration,
    })
  }

  warn(message: string, context?: Partial<LogContext>): void {
    const duration = Date.now() - this.startTime.getTime()
    this.logger.warn(message, {
      ...context,
      operation: this.operation,
      duration,
    })
  }

  error(message: string, error?: Error, context?: Partial<LogContext>): void {
    const duration = Date.now() - this.startTime.getTime()
    this.logger.error(message, error, {
      ...context,
      operation: this.operation,
      duration,
    })
  }

  end(message?: string, context?: Partial<LogContext>): void {
    const duration = Date.now() - this.startTime.getTime()
    const finalMessage = message || `Completed operation: ${this.operation}`

    this.logger.info(finalMessage, {
      ...context,
      operation: this.operation,
      duration,
      completed: true,
    })
  }
}

interface LoggerConfig {
  readonly level: LogLevel
  readonly enableConsole: boolean
  readonly enableFile: boolean
  readonly enableRemote: boolean
  readonly maxFileSize: number
  readonly maxFiles: number
  readonly remoteEndpoint?: string
  readonly bufferSize?: number
}

// ✅ Log transport interfaces and implementations
interface LogTransport {
  log(entry: LogEntry): void
  flush?(): Promise<void>
  close?(): Promise<void>
}

class ConsoleTransport implements LogTransport {
  private readonly config: ConsoleTransportConfig

  constructor(config: ConsoleTransportConfig = {}) {
    this.config = config
  }

  log(entry: LogEntry): void {
    const formatted = this.formatEntry(entry)

    switch (entry.level) {
      case LogLevel.TRACE:
      case LogLevel.DEBUG:
        console.debug(formatted)
        break
      case LogLevel.INFO:
        console.info(formatted)
        break
      case LogLevel.WARN:
        console.warn(formatted)
        break
      case LogLevel.ERROR:
      case LogLevel.FATAL:
        console.error(formatted)
        break
    }
  }

  private formatEntry(entry: LogEntry): string {
    if (this.config.json) {
      return JSON.stringify({
        timestamp: entry.timestamp.toISOString(),
        level: LogLevel[entry.level],
        message: entry.message,
        ...entry.context,
        error: entry.error
          ? {
              name: entry.error.name,
              message: entry.error.message,
              stack: entry.error.stack,
            }
          : undefined,
      })
    }

    // Human-readable format for development
    const timestamp = entry.timestamp.toISOString()
    const level = LogLevel[entry.level].padStart(5)
    const correlationId = entry.context.correlationId?.slice(0, 8) || 'unknown'
    const component = entry.context.component || 'app'

    let formatted = `${timestamp} [${level}] [${correlationId}] [${component}] ${entry.message}`

    if (entry.context.duration !== undefined) {
      formatted += ` (${entry.context.duration}ms)`
    }

    if (entry.error) {
      formatted += `\nError: ${entry.error.message}`
      if (entry.error.stack) {
        formatted += `\nStack: ${entry.error.stack}`
      }
    }

    return formatted
  }
}

interface ConsoleTransportConfig {
  readonly json?: boolean
}

class FileTransport implements LogTransport {
  private readonly config: FileTransportConfig
  private currentFile?: string
  private writeStream?: NodeJS.WritableStream

  constructor(config: FileTransportConfig) {
    this.config = config
    this.initializeFile()
  }

  log(entry: LogEntry): void {
    const formatted =
      JSON.stringify({
        timestamp: entry.timestamp.toISOString(),
        level: LogLevel[entry.level],
        message: entry.message,
        ...entry.context,
        error: entry.error
          ? {
              name: entry.error.name,
              message: entry.error.message,
              stack: entry.error.stack,
            }
          : undefined,
      }) + '\n'

    if (this.writeStream) {
      this.writeStream.write(formatted)
    }
  }

  async flush(): Promise<void> {
    return new Promise(resolve => {
      if (this.writeStream) {
        this.writeStream.write('', resolve)
      } else {
        resolve()
      }
    })
  }

  async close(): Promise<void> {
    return new Promise(resolve => {
      if (this.writeStream) {
        this.writeStream.end(resolve)
      } else {
        resolve()
      }
    })
  }

  private initializeFile(): void {
    // File initialization logic would be implemented here
    // This would handle file rotation, directory creation, etc.
  }
}

interface FileTransportConfig {
  readonly filename: string
  readonly maxSize: number
  readonly maxFiles: number
  readonly compress?: boolean
}

class RemoteTransport implements LogTransport {
  private readonly config: RemoteTransportConfig
  private readonly buffer: LogEntry[] = []
  private flushTimer?: NodeJS.Timeout

  constructor(config: RemoteTransportConfig) {
    this.config = config
    this.startFlushTimer()
  }

  log(entry: LogEntry): void {
    this.buffer.push(entry)

    if (this.buffer.length >= (this.config.bufferSize || 100)) {
      this.flushBuffer()
    }
  }

  async flush(): Promise<void> {
    await this.flushBuffer()
  }

  async close(): Promise<void> {
    if (this.flushTimer) {
      clearInterval(this.flushTimer)
    }
    await this.flushBuffer()
  }

  private startFlushTimer(): void {
    this.flushTimer = setInterval(() => {
      if (this.buffer.length > 0) {
        this.flushBuffer()
      }
    }, this.config.flushInterval || 5000)
  }

  private async flushBuffer(): Promise<void> {
    if (this.buffer.length === 0) return

    const entries = this.buffer.splice(0)

    try {
      await fetch(this.config.endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(this.config.headers || {}),
        },
        body: JSON.stringify({ entries }),
      })
    } catch (error) {
      // Fallback to console on remote logging failure
      console.error('Failed to send logs to remote endpoint:', error)
      entries.forEach(entry => {
        console.log(JSON.stringify(entry))
      })
    }
  }
}

interface RemoteTransportConfig {
  readonly endpoint: string
  readonly headers?: Record<string, string>
  readonly bufferSize?: number
  readonly flushInterval?: number
}
```

### Application Logging Patterns

```typescript
// ✅ Domain-specific logging helpers
class UserServiceLogger {
  private readonly logger: Logger

  constructor(baseLogger: Logger) {
    this.logger = baseLogger.withContext({
      component: 'UserService',
    })
  }

  logUserCreation(userId: string, email: string, correlationId: string): void {
    this.logger.info('User created successfully', {
      operation: 'create_user',
      userId,
      email,
      correlationId,
    })
  }

  logUserCreationFailure(email: string, error: Error, correlationId: string): void {
    this.logger.error('Failed to create user', error, {
      operation: 'create_user',
      email,
      correlationId,
    })
  }

  logUserAuthentication(userId: string, method: string): void {
    this.logger.info('User authenticated', {
      operation: 'authenticate_user',
      userId,
      authMethod: method,
    })
  }

  logUserAuthenticationFailure(email: string, method: string, reason: string): void {
    this.logger.warn('User authentication failed', {
      operation: 'authenticate_user',
      email,
      authMethod: method,
      failureReason: reason,
    })
  }

  logUserPasswordChange(userId: string): void {
    this.logger.info('User password changed', {
      operation: 'change_password',
      userId,
    })
  }

  logUserDeletion(userId: string, requestedBy: string): void {
    this.logger.info('User deleted', {
      operation: 'delete_user',
      userId,
      requestedBy,
    })
  }

  logSuspiciousActivity(userId: string, activity: string, metadata: Record<string, unknown>): void {
    this.logger.warn('Suspicious user activity detected', {
      operation: 'suspicious_activity',
      userId,
      activity,
      metadata,
    })
  }
}

// ✅ HTTP request/response logging middleware
class HTTPLoggingMiddleware {
  private readonly logger: Logger

  constructor(baseLogger: Logger) {
    this.logger = baseLogger.withContext({
      component: 'HTTPMiddleware',
    })
  }

  logRequest(req: Request): void {
    const correlationId = (req.headers['x-correlation-id'] as string) || crypto.randomUUID()

    this.logger.info('HTTP request started', {
      operation: 'http_request',
      method: req.method,
      url: req.url,
      userAgent: req.headers['user-agent'],
      correlationId,
      contentLength: req.headers['content-length'],
    })
  }

  logResponse(req: Request, res: Response, duration: number): void {
    const correlationId = req.headers['x-correlation-id'] as string

    const level = this.getLogLevel(res.statusCode)
    const message = `HTTP request completed - ${res.statusCode}`

    const context = {
      operation: 'http_request',
      method: req.method,
      url: req.url,
      statusCode: res.statusCode,
      correlationId,
      duration,
      responseSize: res.get('content-length'),
    }

    switch (level) {
      case LogLevel.INFO:
        this.logger.info(message, context)
        break
      case LogLevel.WARN:
        this.logger.warn(message, context)
        break
      case LogLevel.ERROR:
        this.logger.error(message, undefined, context)
        break
    }
  }

  logRequestError(req: Request, error: Error, duration: number): void {
    const correlationId = req.headers['x-correlation-id'] as string

    this.logger.error('HTTP request failed', error, {
      operation: 'http_request',
      method: req.method,
      url: req.url,
      correlationId,
      duration,
    })
  }

  private getLogLevel(statusCode: number): LogLevel {
    if (statusCode >= 500) return LogLevel.ERROR
    if (statusCode >= 400) return LogLevel.WARN
    return LogLevel.INFO
  }
}

// ✅ Database operation logging
class DatabaseLogger {
  private readonly logger: Logger

  constructor(baseLogger: Logger) {
    this.logger = baseLogger.withContext({
      component: 'Database',
    })
  }

  logQuery(query: string, parameters: unknown[], correlationId?: string): LogTimer {
    const timer = this.logger.createTimer('database_query')

    this.logger.debug('Executing database query', {
      operation: 'database_query',
      query: this.sanitizeQuery(query),
      parameterCount: parameters.length,
      correlationId,
    })

    return timer
  }

  logQueryResult(timer: LogTimer, rowCount: number, correlationId?: string): void {
    timer.info('Database query completed', {
      rowCount,
      correlationId,
    })
  }

  logQueryError(timer: LogTimer, error: Error, query: string, correlationId?: string): void {
    timer.error('Database query failed', error, {
      query: this.sanitizeQuery(query),
      correlationId,
    })
  }

  logTransaction(operation: string, correlationId?: string): LogTimer {
    const timer = this.logger.createTimer('database_transaction')

    this.logger.debug('Starting database transaction', {
      operation: 'database_transaction',
      transactionType: operation,
      correlationId,
    })

    return timer
  }

  logTransactionCommit(timer: LogTimer, correlationId?: string): void {
    timer.info('Database transaction committed', {
      correlationId,
    })
  }

  logTransactionRollback(timer: LogTimer, reason: string, correlationId?: string): void {
    timer.warn('Database transaction rolled back', {
      rollbackReason: reason,
      correlationId,
    })
  }

  logConnectionPool(
    totalConnections: number,
    activeConnections: number,
    idleConnections: number,
  ): void {
    this.logger.debug('Database connection pool status', {
      operation: 'connection_pool_status',
      totalConnections,
      activeConnections,
      idleConnections,
      utilizationPercentage: (activeConnections / totalConnections) * 100,
    })
  }

  private sanitizeQuery(query: string): string {
    // Remove potentially sensitive data from queries
    return query
      .replace(/VALUES\s*\([^)]+\)/gi, 'VALUES ([PARAMETERS])')
      .replace(/SET\s+[^=]+=[^,\s]+/gi, 'SET [FIELD]=[VALUE]')
      .replace(/WHERE\s+[^=]+=[^,\s]+/gi, 'WHERE [CONDITION]')
  }
}

// ✅ External service integration logging
class ExternalServiceLogger {
  private readonly logger: Logger

  constructor(baseLogger: Logger, serviceName: string) {
    this.logger = baseLogger.withContext({
      component: 'ExternalService',
      serviceName,
    })
  }

  logServiceCall(endpoint: string, method: string, correlationId?: string): LogTimer {
    const timer = this.logger.createTimer('external_service_call')

    this.logger.info('External service call initiated', {
      operation: 'external_service_call',
      endpoint,
      method,
      correlationId,
    })

    return timer
  }

  logServiceResponse(
    timer: LogTimer,
    statusCode: number,
    responseSize?: number,
    correlationId?: string,
  ): void {
    const level = statusCode >= 400 ? 'warn' : 'info'
    const message = `External service call completed - ${statusCode}`

    if (level === 'warn') {
      timer.warn(message, {
        statusCode,
        responseSize,
        correlationId,
      })
    } else {
      timer.info(message, {
        statusCode,
        responseSize,
        correlationId,
      })
    }
  }

  logServiceError(timer: LogTimer, error: Error, endpoint: string, correlationId?: string): void {
    timer.error('External service call failed', error, {
      endpoint,
      correlationId,
    })
  }

  logRateLimitHit(endpoint: string, resetTime: Date, correlationId?: string): void {
    this.logger.warn('External service rate limit hit', {
      operation: 'rate_limit_hit',
      endpoint,
      resetTime,
      correlationId,
    })
  }

  logCircuitBreakerTrip(endpoint: string, failureCount: number, correlationId?: string): void {
    this.logger.error('External service circuit breaker tripped', undefined, {
      operation: 'circuit_breaker_trip',
      endpoint,
      failureCount,
      correlationId,
    })
  }
}

// ✅ Security logging for audit trails
class SecurityLogger {
  private readonly logger: Logger

  constructor(baseLogger: Logger) {
    this.logger = baseLogger.withContext({
      component: 'Security',
    })
  }

  logLogin(
    userId: string,
    method: string,
    ipAddress: string,
    userAgent: string,
    success: boolean,
  ): void {
    const message = success ? 'User login successful' : 'User login failed'
    const level = success ? 'info' : 'warn'

    if (level === 'warn') {
      this.logger.warn(message, {
        operation: 'user_login',
        userId,
        authMethod: method,
        ipAddress,
        userAgent,
        success,
      })
    } else {
      this.logger.info(message, {
        operation: 'user_login',
        userId,
        authMethod: method,
        ipAddress,
        userAgent,
        success,
      })
    }
  }

  logLogout(userId: string, sessionDuration: number): void {
    this.logger.info('User logout', {
      operation: 'user_logout',
      userId,
      sessionDuration,
    })
  }

  logPermissionCheck(userId: string, resource: string, action: string, granted: boolean): void {
    this.logger.debug('Permission check performed', {
      operation: 'permission_check',
      userId,
      resource,
      action,
      granted,
    })
  }

  logUnauthorizedAccess(userId: string, resource: string, action: string, ipAddress: string): void {
    this.logger.warn('Unauthorized access attempt', {
      operation: 'unauthorized_access',
      userId,
      resource,
      action,
      ipAddress,
    })
  }

  logSuspiciousActivity(
    userId: string,
    activity: string,
    ipAddress: string,
    metadata: Record<string, unknown>,
  ): void {
    this.logger.error('Suspicious activity detected', undefined, {
      operation: 'suspicious_activity',
      userId,
      activity,
      ipAddress,
      metadata,
    })
  }

  logTokenGeneration(userId: string, tokenType: string, expiresAt: Date): void {
    this.logger.info('Security token generated', {
      operation: 'token_generation',
      userId,
      tokenType,
      expiresAt,
    })
  }

  logTokenRevocation(userId: string, tokenType: string, reason: string): void {
    this.logger.info('Security token revoked', {
      operation: 'token_revocation',
      userId,
      tokenType,
      reason,
    })
  }

  logPasswordChange(userId: string, triggeredBy: string): void {
    this.logger.info('User password changed', {
      operation: 'password_change',
      userId,
      triggeredBy,
    })
  }

  logAccountLockout(userId: string, reason: string, duration: number): void {
    this.logger.warn('User account locked', {
      operation: 'account_lockout',
      userId,
      reason,
      lockoutDuration: duration,
    })
  }
}
```

### Performance and Monitoring Integration

```typescript
// ✅ Performance monitoring integration
class PerformanceLogger {
  private readonly logger: Logger
  private readonly metricsCollector: MetricsCollector

  constructor(baseLogger: Logger, metricsCollector: MetricsCollector) {
    this.logger = baseLogger.withContext({
      component: 'Performance',
    })
    this.metricsCollector = metricsCollector
  }

  logSlowOperation(
    operation: string,
    duration: number,
    threshold: number,
    context?: Record<string, unknown>,
  ): void {
    this.logger.warn(`Slow operation detected: ${operation}`, {
      operation: 'slow_operation',
      operationName: operation,
      duration,
      threshold,
      slowBy: duration - threshold,
      ...context,
    })

    // Also record metric
    this.metricsCollector.recordHistogram('slow_operations_duration_ms', duration, { operation })
  }

  logMemoryUsage(usage: NodeJS.MemoryUsage): void {
    this.logger.debug('Memory usage report', {
      operation: 'memory_usage',
      heapUsed: usage.heapUsed,
      heapTotal: usage.heapTotal,
      external: usage.external,
      rss: usage.rss,
      heapUtilization: (usage.heapUsed / usage.heapTotal) * 100,
    })

    // Record metrics
    this.metricsCollector.recordGauge('memory_heap_used_bytes', usage.heapUsed)
    this.metricsCollector.recordGauge('memory_heap_total_bytes', usage.heapTotal)
    this.metricsCollector.recordGauge('memory_external_bytes', usage.external)
    this.metricsCollector.recordGauge('memory_rss_bytes', usage.rss)
  }

  logCPUUsage(usage: number): void {
    this.logger.debug('CPU usage report', {
      operation: 'cpu_usage',
      cpuUsagePercentage: usage,
    })

    this.metricsCollector.recordGauge('cpu_usage_percentage', usage)
  }

  logHighLatency(endpoint: string, latency: number, threshold: number): void {
    this.logger.warn(`High latency detected on ${endpoint}`, {
      operation: 'high_latency',
      endpoint,
      latency,
      threshold,
      excessLatency: latency - threshold,
    })
  }

  logThroughputMetrics(
    operation: string,
    requestsPerSecond: number,
    averageResponseTime: number,
  ): void {
    this.logger.info('Throughput metrics', {
      operation: 'throughput_metrics',
      operationName: operation,
      requestsPerSecond,
      averageResponseTime,
    })

    this.metricsCollector.recordGauge('throughput_requests_per_second', requestsPerSecond, {
      operation,
    })

    this.metricsCollector.recordGauge('average_response_time_ms', averageResponseTime, {
      operation,
    })
  }
}

// ✅ Centralized logging configuration
class LoggingConfiguration {
  static createProductionLogger(): Logger {
    const config: LoggerConfig = {
      level: LogLevel.INFO,
      enableConsole: false,
      enableFile: true,
      enableRemote: true,
      maxFileSize: 100 * 1024 * 1024, // 100MB
      maxFiles: 10,
      remoteEndpoint: process.env.LOG_ENDPOINT || 'https://logs.example.com/api/logs',
      bufferSize: 100,
    }

    const transports: LogTransport[] = []

    if (config.enableConsole) {
      transports.push(new ConsoleTransport({ json: true }))
    }

    if (config.enableFile) {
      transports.push(
        new FileTransport({
          filename: '/var/log/app/application.log',
          maxSize: config.maxFileSize,
          maxFiles: config.maxFiles,
          compress: true,
        }),
      )
    }

    if (config.enableRemote && config.remoteEndpoint) {
      transports.push(
        new RemoteTransport({
          endpoint: config.remoteEndpoint,
          headers: {
            Authorization: `Bearer ${process.env.LOG_API_KEY}`,
            'X-Service-Name': process.env.SERVICE_NAME || 'unknown',
          },
          bufferSize: config.bufferSize,
          flushInterval: 5000,
        }),
      )
    }

    return new StructuredLogger(config, transports, {
      environment: process.env.NODE_ENV,
      version: process.env.APP_VERSION,
      serviceName: process.env.SERVICE_NAME,
      instanceId: process.env.INSTANCE_ID || crypto.randomUUID(),
    })
  }

  static createDevelopmentLogger(): Logger {
    const config: LoggerConfig = {
      level: LogLevel.DEBUG,
      enableConsole: true,
      enableFile: false,
      enableRemote: false,
      maxFileSize: 0,
      maxFiles: 0,
    }

    const transports: LogTransport[] = [new ConsoleTransport({ json: false })]

    return new StructuredLogger(config, transports, {
      environment: 'development',
      version: 'dev',
      serviceName: 'local-dev',
    })
  }

  static createTestLogger(): Logger {
    const config: LoggerConfig = {
      level: LogLevel.ERROR, // Only errors in tests
      enableConsole: true,
      enableFile: false,
      enableRemote: false,
      maxFileSize: 0,
      maxFiles: 0,
    }

    const transports: LogTransport[] = [new ConsoleTransport({ json: true })]

    return new StructuredLogger(config, transports, {
      environment: 'test',
      version: 'test',
    })
  }
}

// ✅ Log aggregation and analysis helpers
class LogAnalyzer {
  private readonly logger: Logger

  constructor(baseLogger: Logger) {
    this.logger = baseLogger.withContext({
      component: 'LogAnalyzer',
    })
  }

  async analyzeErrorPatterns(
    timeRange: TimeRange,
    logStore: LogStore,
  ): Promise<ErrorPatternAnalysis> {
    const timer = this.logger.createTimer('analyze_error_patterns')

    try {
      const errorLogs = await logStore.findErrorLogs(timeRange)

      const patterns = this.groupErrorsByPattern(errorLogs)
      const trending = this.identifyTrendingErrors(patterns)
      const recommendations = this.generateRecommendations(patterns)

      timer.end('Error pattern analysis completed', {
        totalErrors: errorLogs.length,
        uniquePatterns: Object.keys(patterns).length,
        trendingPatterns: trending.length,
      })

      return {
        timeRange,
        totalErrors: errorLogs.length,
        patterns,
        trending,
        recommendations,
      }
    } catch (error) {
      timer.error('Error pattern analysis failed', error as Error)
      throw error
    }
  }

  private groupErrorsByPattern(errorLogs: LogEntry[]): Record<string, ErrorPattern> {
    const patterns: Record<string, ErrorPattern> = {}

    errorLogs.forEach(log => {
      const signature = this.generateErrorSignature(log)

      if (!patterns[signature]) {
        patterns[signature] = {
          signature,
          message: log.message,
          count: 0,
          firstSeen: log.timestamp,
          lastSeen: log.timestamp,
          contexts: [],
        }
      }

      patterns[signature].count++
      patterns[signature].lastSeen = log.timestamp
      patterns[signature].contexts.push(log.context)
    })

    return patterns
  }

  private generateErrorSignature(log: LogEntry): string {
    // Create a signature based on error type and general pattern
    const message = log.message.replace(/\d+/g, 'N').replace(/[a-f0-9-]{36}/g, 'UUID')
    return `${log.level}:${message}`
  }

  private identifyTrendingErrors(patterns: Record<string, ErrorPattern>): TrendingError[] {
    // Implementation would analyze error count trends over time
    return Object.values(patterns)
      .filter(pattern => pattern.count > 10)
      .sort((a, b) => b.count - a.count)
      .slice(0, 5)
      .map(pattern => ({
        pattern,
        trend: 'increasing', // Simplified - would calculate actual trend
        severity: 'high',
      }))
  }

  private generateRecommendations(patterns: Record<string, ErrorPattern>): string[] {
    const recommendations: string[] = []

    const totalErrors = Object.values(patterns).reduce((sum, p) => sum + p.count, 0)

    if (totalErrors > 1000) {
      recommendations.push('Consider implementing circuit breakers for external services')
    }

    const highFrequencyPatterns = Object.values(patterns).filter(p => p.count > 50)
    if (highFrequencyPatterns.length > 0) {
      recommendations.push(`Investigate high-frequency errors: ${highFrequencyPatterns[0].message}`)
    }

    return recommendations
  }
}

interface TimeRange {
  readonly start: Date
  readonly end: Date
}

interface ErrorPattern {
  readonly signature: string
  readonly message: string
  readonly count: number
  readonly firstSeen: Date
  readonly lastSeen: Date
  readonly contexts: LogContext[]
}

interface TrendingError {
  readonly pattern: ErrorPattern
  readonly trend: 'increasing' | 'decreasing' | 'stable'
  readonly severity: 'low' | 'medium' | 'high'
}

interface ErrorPatternAnalysis {
  readonly timeRange: TimeRange
  readonly totalErrors: number
  readonly patterns: Record<string, ErrorPattern>
  readonly trending: TrendingError[]
  readonly recommendations: string[]
}

interface LogStore {
  findErrorLogs(timeRange: TimeRange): Promise<LogEntry[]>
}

interface MetricsCollector {
  recordHistogram(name: string, value: number, labels?: Record<string, string>): void
  recordGauge(name: string, value: number, labels?: Record<string, string>): void
}
```

## 🔗 Related Concepts

- **[Error Handling](error-handling.md)** - Comprehensive error handling strategies
- **[Performance Optimization](performance-optimization.md)** - Performance monitoring and logging
- **[Code Review](code-review.md)** - Review processes for logging practices
- **[Testing Strategy](.pair/knowledge/guidelines/testing/README.md)** - Testing logging implementations

## 🎯 Implementation Guidelines

1. **Structured Format**: Always use structured logging with consistent field names
2. **Context Propagation**: Maintain correlation IDs and context throughout request lifecycles
3. **Security Awareness**: Sanitize sensitive data and implement proper redaction
4. **Performance Impact**: Use appropriate log levels and buffering for production environments
5. **Observability**: Integrate with monitoring and alerting systems
6. **Storage Management**: Implement log rotation and retention policies
7. **Analysis Ready**: Design logs for easy parsing and analysis
8. **Environment Specific**: Configure logging appropriately for different environments

## 📏 Benefits

- **Debugging**: Comprehensive logs speed up debugging and troubleshooting
- **Monitoring**: Structured logs enable effective monitoring and alerting
- **Audit Trail**: Security logging provides complete audit trails
- **Performance**: Performance logging identifies bottlenecks and optimization opportunities
- **Business Intelligence**: Application logs provide insights into user behavior and system usage
- **Compliance**: Proper logging supports regulatory compliance requirements
- **Operational Insights**: Logs provide valuable operational data for decision making

---

_Effective logging is crucial for maintaining, monitoring, and understanding application behavior in production environments while providing valuable insights for debugging and optimization._

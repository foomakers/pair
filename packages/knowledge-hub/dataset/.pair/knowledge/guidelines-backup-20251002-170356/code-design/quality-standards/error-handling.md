# 🚨 Error Handling

**Focus**: Comprehensive error handling strategies, patterns, and recovery mechanisms

Guidelines for implementing robust error handling that provides graceful degradation, meaningful error messages, and effective error recovery across different application layers.

## 🎯 Error Handling Principles

### Error Classification and Types

```typescript
// ✅ Comprehensive error classification system
abstract class BaseError extends Error {
  abstract readonly code: string
  abstract readonly category: ErrorCategory
  abstract readonly severity: ErrorSeverity
  readonly timestamp: Date
  readonly context?: Record<string, unknown>
  readonly correlationId?: string

  constructor(message: string, context?: Record<string, unknown>, correlationId?: string) {
    super(message)
    this.name = this.constructor.name
    this.timestamp = new Date()
    this.context = context
    this.correlationId = correlationId

    // Maintain proper stack trace
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, this.constructor)
    }
  }

  toJSON(): ErrorDetails {
    return {
      name: this.name,
      message: this.message,
      code: this.code,
      category: this.category,
      severity: this.severity,
      timestamp: this.timestamp,
      context: this.context,
      correlationId: this.correlationId,
      stack: this.stack,
    }
  }
}

enum ErrorCategory {
  VALIDATION = 'validation',
  AUTHENTICATION = 'authentication',
  AUTHORIZATION = 'authorization',
  NOT_FOUND = 'not_found',
  CONFLICT = 'conflict',
  RATE_LIMIT = 'rate_limit',
  EXTERNAL_SERVICE = 'external_service',
  DATABASE = 'database',
  NETWORK = 'network',
  SYSTEM = 'system',
  BUSINESS_LOGIC = 'business_logic',
  CONFIGURATION = 'configuration',
}

enum ErrorSeverity {
  LOW = 'low', // Informational, no action required
  MEDIUM = 'medium', // Warning, monitoring recommended
  HIGH = 'high', // Error, action required
  CRITICAL = 'critical', // Critical, immediate action required
}

// ✅ Specific error implementations
class ValidationError extends BaseError {
  readonly code = 'VALIDATION_ERROR'
  readonly category = ErrorCategory.VALIDATION
  readonly severity = ErrorSeverity.MEDIUM
  readonly field?: string
  readonly validationRules?: string[]

  constructor(
    message: string,
    field?: string,
    validationRules?: string[],
    context?: Record<string, unknown>,
  ) {
    super(message, context)
    this.field = field
    this.validationRules = validationRules
  }
}

class AuthenticationError extends BaseError {
  readonly code = 'AUTHENTICATION_ERROR'
  readonly category = ErrorCategory.AUTHENTICATION
  readonly severity = ErrorSeverity.HIGH
  readonly authMethod?: string

  constructor(message: string, authMethod?: string, context?: Record<string, unknown>) {
    super(message, context)
    this.authMethod = authMethod
  }
}

class AuthorizationError extends BaseError {
  readonly code = 'AUTHORIZATION_ERROR'
  readonly category = ErrorCategory.AUTHORIZATION
  readonly severity = ErrorSeverity.HIGH
  readonly requiredPermission?: string
  readonly userRole?: string

  constructor(
    message: string,
    requiredPermission?: string,
    userRole?: string,
    context?: Record<string, unknown>,
  ) {
    super(message, context)
    this.requiredPermission = requiredPermission
    this.userRole = userRole
  }
}

class NotFoundError extends BaseError {
  readonly code = 'NOT_FOUND_ERROR'
  readonly category = ErrorCategory.NOT_FOUND
  readonly severity = ErrorSeverity.MEDIUM
  readonly resourceType?: string
  readonly resourceId?: string

  constructor(
    message: string,
    resourceType?: string,
    resourceId?: string,
    context?: Record<string, unknown>,
  ) {
    super(message, context)
    this.resourceType = resourceType
    this.resourceId = resourceId
  }
}

class ConflictError extends BaseError {
  readonly code = 'CONFLICT_ERROR'
  readonly category = ErrorCategory.CONFLICT
  readonly severity = ErrorSeverity.MEDIUM
  readonly conflictingResource?: string

  constructor(message: string, conflictingResource?: string, context?: Record<string, unknown>) {
    super(message, context)
    this.conflictingResource = conflictingResource
  }
}

class ExternalServiceError extends BaseError {
  readonly code = 'EXTERNAL_SERVICE_ERROR'
  readonly category = ErrorCategory.EXTERNAL_SERVICE
  readonly severity = ErrorSeverity.HIGH
  readonly serviceName?: string
  readonly serviceEndpoint?: string
  readonly httpStatus?: number

  constructor(
    message: string,
    serviceName?: string,
    serviceEndpoint?: string,
    httpStatus?: number,
    context?: Record<string, unknown>,
  ) {
    super(message, context)
    this.serviceName = serviceName
    this.serviceEndpoint = serviceEndpoint
    this.httpStatus = httpStatus
  }
}

class DatabaseError extends BaseError {
  readonly code = 'DATABASE_ERROR'
  readonly category = ErrorCategory.DATABASE
  readonly severity = ErrorSeverity.CRITICAL
  readonly operation?: string
  readonly table?: string
  readonly query?: string

  constructor(
    message: string,
    operation?: string,
    table?: string,
    query?: string,
    context?: Record<string, unknown>,
  ) {
    super(message, context)
    this.operation = operation
    this.table = table
    this.query = query
  }
}

class BusinessLogicError extends BaseError {
  readonly code = 'BUSINESS_LOGIC_ERROR'
  readonly category = ErrorCategory.BUSINESS_LOGIC
  readonly severity = ErrorSeverity.MEDIUM
  readonly businessRule?: string

  constructor(message: string, businessRule?: string, context?: Record<string, unknown>) {
    super(message, context)
    this.businessRule = businessRule
  }
}

interface ErrorDetails {
  readonly name: string
  readonly message: string
  readonly code: string
  readonly category: ErrorCategory
  readonly severity: ErrorSeverity
  readonly timestamp: Date
  readonly context?: Record<string, unknown>
  readonly correlationId?: string
  readonly stack?: string
}
```

### Result Pattern for Error Handling

```typescript
// ✅ Result pattern implementation
type Result<T, E = BaseError> = Success<T> | Failure<E>

interface Success<T> {
  readonly success: true
  readonly data: T
}

interface Failure<E> {
  readonly success: false
  readonly error: E
}

// Helper functions
const ok = <T>(data: T): Success<T> => ({ success: true, data })
const err = <E>(error: E): Failure<E> => ({ success: false, error })

// ✅ Result utilities and combinators
class ResultUtils {
  // Map over successful results
  static map<T, U, E>(result: Result<T, E>, fn: (value: T) => U): Result<U, E> {
    return result.success ? ok(fn(result.data)) : result
  }

  // Chain operations that can fail
  static flatMap<T, U, E>(result: Result<T, E>, fn: (value: T) => Result<U, E>): Result<U, E> {
    return result.success ? fn(result.data) : result
  }

  // Handle errors with recovery
  static mapError<T, E1, E2>(result: Result<T, E1>, fn: (error: E1) => E2): Result<T, E2> {
    return result.success ? result : err(fn(result.error))
  }

  // Provide fallback value on error
  static withDefault<T, E>(result: Result<T, E>, defaultValue: T): T {
    return result.success ? result.data : defaultValue
  }

  // Combine multiple results
  static combine<T1, T2, E>(result1: Result<T1, E>, result2: Result<T2, E>): Result<[T1, T2], E> {
    if (!result1.success) return result1
    if (!result2.success) return result2
    return ok([result1.data, result2.data])
  }

  // Combine array of results
  static all<T, E>(results: Result<T, E>[]): Result<T[], E> {
    const data: T[] = []

    for (const result of results) {
      if (!result.success) {
        return result
      }
      data.push(result.data)
    }

    return ok(data)
  }

  // Collect all errors or return success with accumulated data
  static allOrErrors<T, E>(results: Result<T, E>[]): Result<T[], E[]> {
    const data: T[] = []
    const errors: E[] = []

    for (const result of results) {
      if (result.success) {
        data.push(result.data)
      } else {
        errors.push(result.error)
      }
    }

    return errors.length > 0 ? err(errors) : ok(data)
  }

  // Try operations in sequence until one succeeds
  static firstSuccess<T, E>(results: (() => Result<T, E>)[]): Result<T, E[]> {
    const errors: E[] = []

    for (const getResult of results) {
      const result = getResult()
      if (result.success) {
        return result
      }
      errors.push(result.error)
    }

    return err(errors)
  }

  // Convert Promise to Result
  static async fromPromise<T>(
    promise: Promise<T>,
    errorMapper?: (error: unknown) => BaseError,
  ): Promise<Result<T, BaseError>> {
    try {
      const data = await promise
      return ok(data)
    } catch (error) {
      const mappedError = errorMapper
        ? errorMapper(error)
        : error instanceof BaseError
        ? error
        : new SystemError('Unknown error occurred', { originalError: error })

      return err(mappedError)
    }
  }

  // Convert Result to Promise (throws on error)
  static toPromise<T, E>(result: Result<T, E>): Promise<T> {
    if (result.success) {
      return Promise.resolve(result.data)
    }

    const error = result.error instanceof Error ? result.error : new Error(String(result.error))
    return Promise.reject(error)
  }
}

// ✅ System error for unexpected conditions
class SystemError extends BaseError {
  readonly code = 'SYSTEM_ERROR'
  readonly category = ErrorCategory.SYSTEM
  readonly severity = ErrorSeverity.CRITICAL
}

// ✅ Error handling in service layer
class UserService {
  constructor(
    private readonly userRepository: UserRepository,
    private readonly emailService: EmailService,
    private readonly logger: Logger,
  ) {}

  async createUser(userData: CreateUserData): Promise<Result<User, BaseError>> {
    try {
      // Validate input
      const validationResult = this.validateUserData(userData)
      if (!validationResult.success) {
        return validationResult
      }

      // Check if user already exists
      const existingUserResult = await ResultUtils.fromPromise(
        this.userRepository.findByEmail(userData.email),
        error =>
          new DatabaseError('Failed to check existing user', 'findByEmail', 'users', undefined, {
            error,
          }),
      )

      if (!existingUserResult.success) {
        return existingUserResult
      }

      if (existingUserResult.data) {
        return err(
          new ConflictError('User with this email already exists', 'user_email', {
            email: userData.email,
          }),
        )
      }

      // Create user
      const user = this.createUserEntity(userData)
      const saveResult = await ResultUtils.fromPromise(
        this.userRepository.save(user),
        error => new DatabaseError('Failed to save user', 'save', 'users', undefined, { error }),
      )

      if (!saveResult.success) {
        return saveResult
      }

      // Send welcome email (non-blocking)
      this.sendWelcomeEmailAsync(saveResult.data)

      return ok(saveResult.data)
    } catch (error) {
      this.logger.error('Unexpected error in createUser', { error, userData })
      return err(
        new SystemError('An unexpected error occurred while creating user', {
          originalError: error,
        }),
      )
    }
  }

  private validateUserData(userData: CreateUserData): Result<CreateUserData, ValidationError> {
    const errors: string[] = []

    if (!userData.email || !this.isValidEmail(userData.email)) {
      errors.push('Valid email is required')
    }

    if (!userData.name || userData.name.trim().length < 2) {
      errors.push('Name must be at least 2 characters long')
    }

    if (!userData.password || userData.password.length < 8) {
      errors.push('Password must be at least 8 characters long')
    }

    if (errors.length > 0) {
      return err(
        new ValidationError('User data validation failed', undefined, errors, {
          userData: { ...userData, password: '[REDACTED]' },
        }),
      )
    }

    return ok(userData)
  }

  private createUserEntity(userData: CreateUserData): User {
    return {
      id: crypto.randomUUID() as UserId,
      email: userData.email.toLowerCase().trim() as Email,
      name: userData.name.trim(),
      passwordHash: this.hashPassword(userData.password),
      role: 'user',
      status: 'active',
      createdAt: new Date(),
      updatedAt: new Date(),
    }
  }

  private async sendWelcomeEmailAsync(user: User): Promise<void> {
    try {
      const emailResult = await this.emailService.sendWelcomeEmail(user.email, user.name)
      if (!emailResult.success) {
        this.logger.warn('Failed to send welcome email', {
          userId: user.id,
          email: user.email,
          error: emailResult.error,
        })
      }
    } catch (error) {
      this.logger.error('Unexpected error sending welcome email', {
        userId: user.id,
        email: user.email,
        error,
      })
    }
  }

  private isValidEmail(email: string): boolean {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
    return emailRegex.test(email)
  }

  private hashPassword(password: string): string {
    // Implementation would use bcrypt or similar
    return `hashed_${password}`
  }
}
```

### Error Recovery and Resilience Patterns

```typescript
// ✅ Circuit breaker pattern for external services
class CircuitBreaker {
  private state: CircuitBreakerState = CircuitBreakerState.CLOSED
  private failureCount = 0
  private lastFailureTime?: Date
  private successCount = 0

  constructor(private readonly options: CircuitBreakerOptions, private readonly logger: Logger) {}

  async execute<T>(operation: () => Promise<T>): Promise<Result<T, BaseError>> {
    if (this.state === CircuitBreakerState.OPEN) {
      if (this.shouldAttemptReset()) {
        this.state = CircuitBreakerState.HALF_OPEN
        this.logger.info('Circuit breaker transitioning to HALF_OPEN')
      } else {
        return err(
          new ExternalServiceError(
            'Circuit breaker is OPEN - service temporarily unavailable',
            this.options.serviceName,
          ),
        )
      }
    }

    try {
      const startTime = Date.now()
      const result = await Promise.race([operation(), this.createTimeoutPromise()])

      const duration = Date.now() - startTime
      this.onSuccess(duration)

      return ok(result)
    } catch (error) {
      this.onFailure(error)

      return err(
        new ExternalServiceError(
          `Operation failed: ${error.message}`,
          this.options.serviceName,
          undefined,
          undefined,
          { originalError: error },
        ),
      )
    }
  }

  private shouldAttemptReset(): boolean {
    if (!this.lastFailureTime) return false

    const timeSinceLastFailure = Date.now() - this.lastFailureTime.getTime()
    return timeSinceLastFailure >= this.options.resetTimeoutMs
  }

  private createTimeoutPromise<T>(): Promise<T> {
    return new Promise((_, reject) => {
      setTimeout(() => {
        reject(new Error(`Operation timed out after ${this.options.timeoutMs}ms`))
      }, this.options.timeoutMs)
    })
  }

  private onSuccess(duration: number): void {
    this.failureCount = 0
    this.lastFailureTime = undefined

    if (this.state === CircuitBreakerState.HALF_OPEN) {
      this.successCount++

      if (this.successCount >= this.options.successThreshold) {
        this.state = CircuitBreakerState.CLOSED
        this.successCount = 0
        this.logger.info('Circuit breaker transitioned to CLOSED')
      }
    }

    this.logger.debug('Circuit breaker operation succeeded', {
      duration,
      state: this.state,
    })
  }

  private onFailure(error: unknown): void {
    this.failureCount++
    this.lastFailureTime = new Date()

    if (this.state === CircuitBreakerState.HALF_OPEN) {
      this.state = CircuitBreakerState.OPEN
      this.successCount = 0
      this.logger.warn('Circuit breaker transitioned to OPEN from HALF_OPEN')
    } else if (this.failureCount >= this.options.failureThreshold) {
      this.state = CircuitBreakerState.OPEN
      this.logger.warn('Circuit breaker transitioned to OPEN', {
        failureCount: this.failureCount,
        threshold: this.options.failureThreshold,
      })
    }

    this.logger.error('Circuit breaker operation failed', {
      error,
      failureCount: this.failureCount,
      state: this.state,
    })
  }

  getStatus(): CircuitBreakerStatus {
    return {
      state: this.state,
      failureCount: this.failureCount,
      successCount: this.successCount,
      lastFailureTime: this.lastFailureTime,
    }
  }
}

enum CircuitBreakerState {
  CLOSED = 'closed',
  OPEN = 'open',
  HALF_OPEN = 'half_open',
}

interface CircuitBreakerOptions {
  readonly serviceName: string
  readonly failureThreshold: number
  readonly successThreshold: number
  readonly timeoutMs: number
  readonly resetTimeoutMs: number
}

interface CircuitBreakerStatus {
  readonly state: CircuitBreakerState
  readonly failureCount: number
  readonly successCount: number
  readonly lastFailureTime?: Date
}

// ✅ Retry mechanism with exponential backoff
class RetryMechanism {
  static async withExponentialBackoff<T>(
    operation: () => Promise<T>,
    options: RetryOptions = {},
  ): Promise<Result<T, BaseError>> {
    const {
      maxAttempts = 3,
      baseDelayMs = 1000,
      maxDelayMs = 30000,
      backoffMultiplier = 2,
      retryableErrors = [],
    } = options

    let lastError: unknown

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        const result = await operation()
        return ok(result)
      } catch (error) {
        lastError = error

        // Check if error is retryable
        if (!this.isRetryableError(error, retryableErrors)) {
          break
        }

        // Don't delay on last attempt
        if (attempt < maxAttempts) {
          const delay = Math.min(baseDelayMs * Math.pow(backoffMultiplier, attempt - 1), maxDelayMs)

          await this.delay(delay)
        }
      }
    }

    const error =
      lastError instanceof BaseError
        ? lastError
        : new SystemError('Operation failed after retries', {
            maxAttempts,
            originalError: lastError,
          })

    return err(error)
  }

  private static isRetryableError(error: unknown, retryableErrors: string[]): boolean {
    if (retryableErrors.length === 0) {
      // Default retryable conditions
      if (error instanceof ExternalServiceError) return true
      if (error instanceof DatabaseError) return true
      if (error instanceof Error && error.message.includes('timeout')) return true
      if (error instanceof Error && error.message.includes('network')) return true
      return false
    }

    return retryableErrors.some(retryableError => {
      if (error instanceof BaseError) {
        return error.code === retryableError || error.category === retryableError
      }

      if (error instanceof Error) {
        return error.name === retryableError || error.message.includes(retryableError)
      }

      return false
    })
  }

  private static delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms))
  }
}

interface RetryOptions {
  readonly maxAttempts?: number
  readonly baseDelayMs?: number
  readonly maxDelayMs?: number
  readonly backoffMultiplier?: number
  readonly retryableErrors?: string[]
}

// ✅ Bulkhead pattern for resource isolation
class BulkheadResourceManager {
  private readonly resourcePools: Map<string, ResourcePool> = new Map()

  createPool(name: string, maxConcurrency: number): void {
    this.resourcePools.set(name, {
      name,
      maxConcurrency,
      currentUsage: 0,
      queue: [],
    })
  }

  async executeWithPool<T>(
    poolName: string,
    operation: () => Promise<T>,
  ): Promise<Result<T, BaseError>> {
    const pool = this.resourcePools.get(poolName)

    if (!pool) {
      return err(new SystemError(`Resource pool '${poolName}' not found`))
    }

    // Check if pool is at capacity
    if (pool.currentUsage >= pool.maxConcurrency) {
      return new Promise(resolve => {
        pool.queue.push({ operation, resolve })
      })
    }

    // Execute immediately
    return this.executeOperation(pool, operation)
  }

  private async executeOperation<T>(
    pool: ResourcePool,
    operation: () => Promise<T>,
  ): Promise<Result<T, BaseError>> {
    pool.currentUsage++

    try {
      const result = await operation()
      return ok(result)
    } catch (error) {
      const mappedError =
        error instanceof BaseError
          ? error
          : new SystemError('Operation failed in bulkhead', {
              pool: pool.name,
              originalError: error,
            })

      return err(mappedError)
    } finally {
      pool.currentUsage--

      // Process queue
      if (pool.queue.length > 0 && pool.currentUsage < pool.maxConcurrency) {
        const next = pool.queue.shift()!
        this.executeOperation(pool, next.operation).then(next.resolve)
      }
    }
  }

  getPoolStatus(poolName: string): ResourcePoolStatus | null {
    const pool = this.resourcePools.get(poolName)
    return pool
      ? {
          name: pool.name,
          maxConcurrency: pool.maxConcurrency,
          currentUsage: pool.currentUsage,
          queueLength: pool.queue.length,
          utilizationPercentage: (pool.currentUsage / pool.maxConcurrency) * 100,
        }
      : null
  }
}

interface ResourcePool {
  readonly name: string
  readonly maxConcurrency: number
  currentUsage: number
  queue: Array<{
    operation: () => Promise<any>
    resolve: (result: Result<any, BaseError>) => void
  }>
}

interface ResourcePoolStatus {
  readonly name: string
  readonly maxConcurrency: number
  readonly currentUsage: number
  readonly queueLength: number
  readonly utilizationPercentage: number
}
```

### Error Monitoring and Alerting

```typescript
// ✅ Error tracking and monitoring
class ErrorTracker {
  private readonly metricsCollector: MetricsCollector
  private readonly alertManager: AlertManager
  private readonly errorStore: ErrorStore

  constructor(
    metricsCollector: MetricsCollector,
    alertManager: AlertManager,
    errorStore: ErrorStore,
  ) {
    this.metricsCollector = metricsCollector
    this.alertManager = alertManager
    this.errorStore = errorStore
  }

  async trackError(error: BaseError, context?: ErrorContext): Promise<void> {
    // Store error details
    const errorRecord = await this.errorStore.save({
      ...error.toJSON(),
      context,
      fingerprint: this.generateFingerprint(error),
      environment: process.env.NODE_ENV || 'development',
    })

    // Update metrics
    this.updateErrorMetrics(error)

    // Check alert conditions
    await this.checkAlertConditions(error, errorRecord)

    // Update error rates
    this.updateErrorRates(error)
  }

  private generateFingerprint(error: BaseError): string {
    // Generate a unique fingerprint for grouping similar errors
    const key = `${error.name}:${error.code}:${error.message}`
    return crypto.createHash('md5').update(key).digest('hex')
  }

  private updateErrorMetrics(error: BaseError): void {
    // Overall error count
    this.metricsCollector.incrementCounter('errors_total', {
      category: error.category,
      severity: error.severity,
      code: error.code,
    })

    // Error by severity
    this.metricsCollector.incrementCounter(`errors_${error.severity}_total`, {
      category: error.category,
      code: error.code,
    })

    // Error by category
    this.metricsCollector.incrementCounter(`errors_${error.category}_total`, {
      severity: error.severity,
      code: error.code,
    })
  }

  private async checkAlertConditions(error: BaseError, errorRecord: ErrorRecord): Promise<void> {
    // Critical errors always trigger alerts
    if (error.severity === ErrorSeverity.CRITICAL) {
      await this.alertManager.sendAlert({
        type: AlertType.CRITICAL_ERROR,
        message: `Critical error occurred: ${error.message}`,
        details: errorRecord,
        urgency: AlertUrgency.HIGH,
      })
    }

    // Check error rate thresholds
    const recentErrorRate = await this.getRecentErrorRate(error.category)
    if (recentErrorRate > this.getErrorRateThreshold(error.category)) {
      await this.alertManager.sendAlert({
        type: AlertType.HIGH_ERROR_RATE,
        message: `High error rate detected for ${error.category}: ${recentErrorRate}/min`,
        details: { category: error.category, rate: recentErrorRate },
        urgency: AlertUrgency.MEDIUM,
      })
    }

    // Check for error spikes
    const errorSpike = await this.detectErrorSpike(error)
    if (errorSpike) {
      await this.alertManager.sendAlert({
        type: AlertType.ERROR_SPIKE,
        message: `Error spike detected: ${errorSpike.increase}% increase in ${error.category} errors`,
        details: errorSpike,
        urgency: AlertUrgency.MEDIUM,
      })
    }
  }

  private updateErrorRates(error: BaseError): void {
    const timestamp = Date.now()
    const minute = Math.floor(timestamp / 60000)

    // Store error count per minute for rate calculation
    this.metricsCollector.recordValue(`error_rate_${error.category}`, 1, {
      timestamp: minute,
    })
  }

  private async getRecentErrorRate(category: ErrorCategory): Promise<number> {
    const now = Date.now()
    const fiveMinutesAgo = now - 5 * 60 * 1000

    return this.errorStore.countErrors({
      category,
      since: new Date(fiveMinutesAgo),
    })
  }

  private getErrorRateThreshold(category: ErrorCategory): number {
    // Different thresholds for different categories
    const thresholds = {
      [ErrorCategory.VALIDATION]: 50,
      [ErrorCategory.AUTHENTICATION]: 20,
      [ErrorCategory.AUTHORIZATION]: 30,
      [ErrorCategory.EXTERNAL_SERVICE]: 15,
      [ErrorCategory.DATABASE]: 10,
      [ErrorCategory.SYSTEM]: 5,
    }

    return thresholds[category] || 25
  }

  private async detectErrorSpike(error: BaseError): Promise<ErrorSpike | null> {
    const currentHour = Math.floor(Date.now() / 3600000)
    const previousHour = currentHour - 1

    const currentCount = await this.errorStore.countErrors({
      category: error.category,
      hour: currentHour,
    })

    const previousCount = await this.errorStore.countErrors({
      category: error.category,
      hour: previousHour,
    })

    if (previousCount === 0) return null

    const increase = ((currentCount - previousCount) / previousCount) * 100

    // Consider it a spike if increase is more than 100%
    if (increase > 100) {
      return {
        category: error.category,
        currentCount,
        previousCount,
        increase,
      }
    }

    return null
  }

  async generateErrorReport(timeRange: TimeRange): Promise<ErrorReport> {
    const errors = await this.errorStore.findErrors({
      since: timeRange.start,
      until: timeRange.end,
    })

    return {
      timeRange,
      totalErrors: errors.length,
      errorsByCategory: this.groupErrorsByCategory(errors),
      errorsBySeverity: this.groupErrorsBySeverity(errors),
      topErrors: this.getTopErrors(errors),
      errorTrends: await this.calculateErrorTrends(timeRange),
      summary: this.generateSummary(errors),
    }
  }

  private groupErrorsByCategory(errors: ErrorRecord[]): Record<ErrorCategory, number> {
    return errors.reduce((acc, error) => {
      acc[error.category] = (acc[error.category] || 0) + 1
      return acc
    }, {} as Record<ErrorCategory, number>)
  }

  private groupErrorsBySeverity(errors: ErrorRecord[]): Record<ErrorSeverity, number> {
    return errors.reduce((acc, error) => {
      acc[error.severity] = (acc[error.severity] || 0) + 1
      return acc
    }, {} as Record<ErrorSeverity, number>)
  }

  private getTopErrors(errors: ErrorRecord[]): TopErrorInfo[] {
    const errorGroups = errors.reduce((acc, error) => {
      const key = error.fingerprint
      if (!acc[key]) {
        acc[key] = {
          fingerprint: key,
          message: error.message,
          code: error.code,
          category: error.category,
          severity: error.severity,
          count: 0,
          firstSeen: error.timestamp,
          lastSeen: error.timestamp,
        }
      }

      acc[key].count++
      if (error.timestamp < acc[key].firstSeen) {
        acc[key].firstSeen = error.timestamp
      }
      if (error.timestamp > acc[key].lastSeen) {
        acc[key].lastSeen = error.timestamp
      }

      return acc
    }, {} as Record<string, TopErrorInfo>)

    return Object.values(errorGroups)
      .sort((a, b) => b.count - a.count)
      .slice(0, 10)
  }

  private async calculateErrorTrends(timeRange: TimeRange): Promise<ErrorTrend[]> {
    // Implementation would calculate error trends over time
    return []
  }

  private generateSummary(errors: ErrorRecord[]): ErrorSummary {
    const criticalErrors = errors.filter(e => e.severity === ErrorSeverity.CRITICAL).length
    const highErrors = errors.filter(e => e.severity === ErrorSeverity.HIGH).length

    return {
      totalErrors: errors.length,
      criticalErrors,
      highErrors,
      healthScore: this.calculateHealthScore(errors),
      recommendation: this.generateRecommendation(errors),
    }
  }

  private calculateHealthScore(errors: ErrorRecord[]): number {
    const total = errors.length
    if (total === 0) return 100

    const critical = errors.filter(e => e.severity === ErrorSeverity.CRITICAL).length
    const high = errors.filter(e => e.severity === ErrorSeverity.HIGH).length
    const medium = errors.filter(e => e.severity === ErrorSeverity.MEDIUM).length

    // Weight errors by severity
    const weightedScore = critical * 4 + high * 2 + medium * 1
    const maxPossibleScore = total * 4

    return Math.max(0, 100 - (weightedScore / maxPossibleScore) * 100)
  }

  private generateRecommendation(errors: ErrorRecord[]): string {
    const critical = errors.filter(e => e.severity === ErrorSeverity.CRITICAL).length
    const high = errors.filter(e => e.severity === ErrorSeverity.HIGH).length

    if (critical > 0) {
      return `🚨 Immediate attention required: ${critical} critical errors detected`
    }

    if (high > 10) {
      return `⚠️ High error volume: ${high} high-severity errors need investigation`
    }

    if (errors.length > 100) {
      return `📊 Monitor error patterns: ${errors.length} total errors detected`
    }

    return '✅ Error levels within acceptable ranges'
  }
}

interface ErrorContext {
  readonly userId?: string
  readonly sessionId?: string
  readonly requestId?: string
  readonly userAgent?: string
  readonly ipAddress?: string
  readonly endpoint?: string
  readonly method?: string
}

interface ErrorRecord extends ErrorDetails {
  readonly id: string
  readonly context?: ErrorContext
  readonly fingerprint: string
  readonly environment: string
}

interface TimeRange {
  readonly start: Date
  readonly end: Date
}

interface ErrorSpike {
  readonly category: ErrorCategory
  readonly currentCount: number
  readonly previousCount: number
  readonly increase: number
}

interface TopErrorInfo {
  readonly fingerprint: string
  readonly message: string
  readonly code: string
  readonly category: ErrorCategory
  readonly severity: ErrorSeverity
  readonly count: number
  readonly firstSeen: Date
  readonly lastSeen: Date
}

interface ErrorTrend {
  readonly timestamp: Date
  readonly count: number
  readonly category: ErrorCategory
}

interface ErrorSummary {
  readonly totalErrors: number
  readonly criticalErrors: number
  readonly highErrors: number
  readonly healthScore: number
  readonly recommendation: string
}

interface ErrorReport {
  readonly timeRange: TimeRange
  readonly totalErrors: number
  readonly errorsByCategory: Record<ErrorCategory, number>
  readonly errorsBySeverity: Record<ErrorSeverity, number>
  readonly topErrors: TopErrorInfo[]
  readonly errorTrends: ErrorTrend[]
  readonly summary: ErrorSummary
}

enum AlertType {
  CRITICAL_ERROR = 'critical_error',
  HIGH_ERROR_RATE = 'high_error_rate',
  ERROR_SPIKE = 'error_spike',
}

enum AlertUrgency {
  LOW = 'low',
  MEDIUM = 'medium',
  HIGH = 'high',
}
```

## 🔗 Related Concepts

- **[Function Design](.pair/knowledge/guidelines/code-design/implementation-standards/function-design.md)** - Designing functions with proper error handling
- **[Service Abstraction](.pair/knowledge/guidelines/code-design/implementation-standards/service-abstraction.md)** - Service-level error handling patterns
- **[Logging Guidelines](logging-guidelines.md)** - Error logging best practices
- **[Performance Optimization](performance-optimization.md)** - Error handling performance considerations

## 🎯 Implementation Guidelines

1. **Comprehensive Classification**: Implement a comprehensive error classification system with proper inheritance
2. **Result Pattern**: Use Result types for explicit error handling instead of exceptions for business logic
3. **Resilience Patterns**: Implement circuit breakers, retries, and bulkheads for external dependencies
4. **Error Recovery**: Provide graceful degradation and recovery mechanisms
5. **Monitoring**: Implement comprehensive error tracking and alerting
6. **User Experience**: Provide meaningful error messages for users while logging detailed information
7. **Testing**: Test error scenarios thoroughly including edge cases and recovery paths

## 📏 Benefits

- **Reliability**: Robust error handling improves application stability
- **User Experience**: Graceful error handling provides better user experience
- **Debugging**: Comprehensive error information speeds up debugging
- **Monitoring**: Error tracking enables proactive issue resolution
- **Resilience**: Recovery patterns increase system resilience
- **Maintainability**: Well-structured error handling makes code easier to maintain

---

_Comprehensive error handling is essential for building reliable, user-friendly, and maintainable applications that can gracefully handle failures and recover from errors._

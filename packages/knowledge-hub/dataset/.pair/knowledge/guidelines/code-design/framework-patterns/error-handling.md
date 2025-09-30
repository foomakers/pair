# 🚨 Error Handling

**Focus**: Comprehensive error handling patterns for robust applications

Standardized error handling patterns across the full-stack application, including error types, recovery strategies, logging, monitoring, and user experience considerations.

## 🎯 Error Handling Architecture

### Core Error Types

```typescript
// ✅ Base error classes
export abstract class AppError extends Error {
  abstract readonly statusCode: number
  abstract readonly isOperational: boolean
  abstract readonly errorCode: string

  constructor(message: string, public readonly context?: Record<string, unknown>) {
    super(message)
    this.name = this.constructor.name

    // Capture stack trace
    Error.captureStackTrace(this, this.constructor)
  }

  toJSON() {
    return {
      name: this.name,
      message: this.message,
      statusCode: this.statusCode,
      errorCode: this.errorCode,
      context: this.context,
      stack: this.stack,
    }
  }
}

// ✅ Specific error types
export class ValidationError extends AppError {
  readonly statusCode = 400
  readonly isOperational = true
  readonly errorCode = 'VALIDATION_ERROR'

  constructor(
    message: string,
    public readonly field?: string,
    public readonly value?: unknown,
    context?: Record<string, unknown>,
  ) {
    super(message, { field, value, ...context })
  }
}

export class NotFoundError extends AppError {
  readonly statusCode = 404
  readonly isOperational = true
  readonly errorCode = 'NOT_FOUND'

  constructor(resource: string, identifier?: string | number, context?: Record<string, unknown>) {
    super(`${resource} not found`, { resource, identifier, ...context })
  }
}

export class UnauthorizedError extends AppError {
  readonly statusCode = 401
  readonly isOperational = true
  readonly errorCode = 'UNAUTHORIZED'

  constructor(message = 'Authentication required', context?: Record<string, unknown>) {
    super(message, context)
  }
}

export class ForbiddenError extends AppError {
  readonly statusCode = 403
  readonly isOperational = true
  readonly errorCode = 'FORBIDDEN'

  constructor(
    message = 'Insufficient permissions',
    public readonly requiredPermission?: string,
    context?: Record<string, unknown>,
  ) {
    super(message, { requiredPermission, ...context })
  }
}

export class ConflictError extends AppError {
  readonly statusCode = 409
  readonly isOperational = true
  readonly errorCode = 'CONFLICT'

  constructor(
    message: string,
    public readonly conflictingField?: string,
    context?: Record<string, unknown>,
  ) {
    super(message, { conflictingField, ...context })
  }
}

export class RateLimitError extends AppError {
  readonly statusCode = 429
  readonly isOperational = true
  readonly errorCode = 'RATE_LIMIT_EXCEEDED'

  constructor(public readonly retryAfter: number, context?: Record<string, unknown>) {
    super('Rate limit exceeded', { retryAfter, ...context })
  }
}

export class ExternalServiceError extends AppError {
  readonly statusCode = 502
  readonly isOperational = true
  readonly errorCode = 'EXTERNAL_SERVICE_ERROR'

  constructor(service: string, originalError?: Error, context?: Record<string, unknown>) {
    super(`External service error: ${service}`, {
      service,
      originalError: originalError?.message,
      ...context,
    })
  }
}

export class DatabaseError extends AppError {
  readonly statusCode = 500
  readonly isOperational = true
  readonly errorCode = 'DATABASE_ERROR'

  constructor(operation: string, originalError?: Error, context?: Record<string, unknown>) {
    super(`Database operation failed: ${operation}`, {
      operation,
      originalError: originalError?.message,
      ...context,
    })
  }
}
```

## 🛡️ Error Boundaries (React)

### React Error Boundaries

```typescript
// ✅ Global error boundary
interface ErrorBoundaryState {
  hasError: boolean
  error?: Error
  errorInfo?: ErrorInfo
  eventId?: string
}

export class GlobalErrorBoundary extends Component<PropsWithChildren<{}>, ErrorBoundaryState> {
  constructor(props: PropsWithChildren<{}>) {
    super(props)
    this.state = { hasError: false }
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return {
      hasError: true,
      error,
    }
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    // Log error to monitoring service
    const eventId = captureException(error, {
      contexts: {
        react: {
          componentStack: errorInfo.componentStack,
        },
      },
    })

    this.setState({
      error,
      errorInfo,
      eventId,
    })

    // Log to application logger
    logger.error('React Error Boundary caught an error', {
      error: error.message,
      stack: error.stack,
      componentStack: errorInfo.componentStack,
      eventId,
    })
  }

  render() {
    if (this.state.hasError) {
      return (
        <ErrorFallback
          error={this.state.error}
          errorInfo={this.state.errorInfo}
          eventId={this.state.eventId}
          onRetry={() => this.setState({ hasError: false })}
        />
      )
    }

    return this.props.children
  }
}

// ✅ Feature-specific error boundary
interface FeatureErrorBoundaryProps {
  children: ReactNode
  fallback?: ComponentType<ErrorFallbackProps>
  onError?: (error: Error, errorInfo: ErrorInfo) => void
}

export const FeatureErrorBoundary: React.FC<FeatureErrorBoundaryProps> = ({
  children,
  fallback: Fallback = FeatureErrorFallback,
  onError,
}) => {
  return (
    <ErrorBoundary
      FallbackComponent={Fallback}
      onError={(error, errorInfo) => {
        onError?.(error, errorInfo)

        // Track feature-specific error
        trackEvent('feature_error', {
          feature: 'unknown', // Should be passed as prop
          error: error.message,
        })
      }}>
      {children}
    </ErrorBoundary>
  )
}

// ✅ Error fallback components
interface ErrorFallbackProps {
  error?: Error
  errorInfo?: ErrorInfo
  eventId?: string
  onRetry?: () => void
}

const ErrorFallback: React.FC<ErrorFallbackProps> = ({ error, eventId, onRetry }) => {
  return (
    <div className='error-fallback'>
      <div className='error-content'>
        <h2>Something went wrong</h2>
        <p>We're sorry, but something unexpected happened.</p>

        {eventId && (
          <p className='error-id'>
            Error ID: <code>{eventId}</code>
          </p>
        )}

        <div className='error-actions'>
          {onRetry && (
            <button onClick={onRetry} className='retry-button'>
              Try Again
            </button>
          )}

          <button onClick={() => window.location.reload()} className='reload-button'>
            Reload Page
          </button>
        </div>

        {process.env.NODE_ENV === 'development' && error && (
          <details className='error-details'>
            <summary>Error Details</summary>
            <pre>{error.stack}</pre>
          </details>
        )}
      </div>
    </div>
  )
}

const FeatureErrorFallback: React.FC<ErrorFallbackProps> = ({ onRetry }) => {
  return (
    <div className='feature-error-fallback'>
      <p>This feature is temporarily unavailable.</p>
      {onRetry && (
        <button onClick={onRetry} className='retry-button'>
          Try Again
        </button>
      )}
    </div>
  )
}
```

## 🌐 API Error Handling

### Backend Error Middleware

```typescript
// ✅ Express error handling middleware
export const errorHandler = (error: Error, req: Request, res: Response, next: NextFunction) => {
  // Log error
  logger.error('Unhandled error', {
    error: error.message,
    stack: error.stack,
    url: req.url,
    method: req.method,
    userId: req.user?.id,
    requestId: req.id,
  })

  // Handle known application errors
  if (error instanceof AppError) {
    return res.status(error.statusCode).json({
      success: false,
      error: {
        code: error.errorCode,
        message: error.message,
        ...(process.env.NODE_ENV === 'development' && {
          context: error.context,
          stack: error.stack,
        }),
      },
      requestId: req.id,
    })
  }

  // Handle Prisma errors
  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    const prismaError = handlePrismaError(error)
    return res.status(prismaError.statusCode).json({
      success: false,
      error: {
        code: prismaError.errorCode,
        message: prismaError.message,
      },
      requestId: req.id,
    })
  }

  // Handle validation errors (Zod)
  if (error instanceof ZodError) {
    return res.status(400).json({
      success: false,
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Validation failed',
        details: error.errors.map(err => ({
          field: err.path.join('.'),
          message: err.message,
          code: err.code,
        })),
      },
      requestId: req.id,
    })
  }

  // Handle JWT errors
  if (error.name === 'JsonWebTokenError') {
    return res.status(401).json({
      success: false,
      error: {
        code: 'INVALID_TOKEN',
        message: 'Invalid authentication token',
      },
      requestId: req.id,
    })
  }

  // Handle unexpected errors
  res.status(500).json({
    success: false,
    error: {
      code: 'INTERNAL_SERVER_ERROR',
      message: 'An unexpected error occurred',
      ...(process.env.NODE_ENV === 'development' && {
        details: error.message,
        stack: error.stack,
      }),
    },
    requestId: req.id,
  })
}

// ✅ Prisma error handling
function handlePrismaError(error: Prisma.PrismaClientKnownRequestError): AppError {
  switch (error.code) {
    case 'P2002': // Unique constraint violation
      const field = error.meta?.target as string[]
      return new ConflictError(
        `A record with this ${field?.[0] || 'value'} already exists`,
        field?.[0],
      )

    case 'P2025': // Record not found
      return new NotFoundError('Record')

    case 'P2003': // Foreign key constraint violation
      return new ValidationError(
        'Invalid reference to related record',
        error.meta?.field_name as string,
      )

    case 'P2011': // Null constraint violation
      return new ValidationError(`Required field is missing: ${error.meta?.constraint as string}`)

    default:
      return new DatabaseError('Unknown database error', error)
  }
}

// ✅ Async error wrapper
export const asyncHandler = (
  fn: (req: Request, res: Response, next: NextFunction) => Promise<any>,
) => {
  return (req: Request, res: Response, next: NextFunction) => {
    Promise.resolve(fn(req, res, next)).catch(next)
  }
}
```

### Frontend API Error Handling

```typescript
// ✅ API error handling with React Query
export class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
    public readonly details?: unknown,
  ) {
    super(message)
    this.name = 'ApiError'
  }
}

// ✅ API client with error handling
export class ApiClient {
  private baseURL: string
  private defaultHeaders: HeadersInit

  constructor(baseURL: string) {
    this.baseURL = baseURL
    this.defaultHeaders = {
      'Content-Type': 'application/json',
    }
  }

  async request<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
    const url = `${this.baseURL}${endpoint}`

    try {
      const response = await fetch(url, {
        ...options,
        headers: {
          ...this.defaultHeaders,
          ...options.headers,
        },
      })

      const data = await this.handleResponse<T>(response)
      return data
    } catch (error) {
      if (error instanceof ApiError) {
        throw error
      }

      // Network or other errors
      throw new ApiError(0, 'NETWORK_ERROR', 'Network request failed', {
        originalError: error.message,
      })
    }
  }

  private async handleResponse<T>(response: Response): Promise<T> {
    const contentType = response.headers.get('content-type')
    const isJson = contentType?.includes('application/json')

    if (response.ok) {
      if (isJson) {
        const data = await response.json()
        return data.data || data // Handle wrapped responses
      }
      return response.text() as unknown as T
    }

    // Handle error responses
    if (isJson) {
      const errorData = await response.json()
      throw new ApiError(
        response.status,
        errorData.error?.code || 'UNKNOWN_ERROR',
        errorData.error?.message || 'An error occurred',
        errorData.error?.details,
      )
    }

    // Fallback for non-JSON errors
    const text = await response.text()
    throw new ApiError(response.status, 'HTTP_ERROR', text || response.statusText)
  }
}

// ✅ React Query error handling
export const useApiQuery = <T>(
  key: string[],
  fetcher: () => Promise<T>,
  options?: UseQueryOptions<T, ApiError>,
) => {
  return useQuery<T, ApiError>({
    queryKey: key,
    queryFn: fetcher,
    retry: (failureCount, error) => {
      // Don't retry on client errors (4xx)
      if (error.status >= 400 && error.status < 500) {
        return false
      }

      // Retry up to 3 times for server errors
      return failureCount < 3
    },
    retryDelay: attemptIndex => Math.min(1000 * 2 ** attemptIndex, 30000),
    ...options,
  })
}

export const useApiMutation = <TData, TVariables>(
  mutationFn: (variables: TVariables) => Promise<TData>,
  options?: UseMutationOptions<TData, ApiError, TVariables>,
) => {
  return useMutation<TData, ApiError, TVariables>({
    mutationFn,
    onError: (error, variables, context) => {
      // Global error handling
      if (error.status === 401) {
        // Handle authentication error
        authStore.logout()
        router.push('/login')
      }

      // Show user-friendly error message
      toast.error(getErrorMessage(error))

      // Call custom error handler
      options?.onError?.(error, variables, context)
    },
    ...options,
  })
}

// ✅ Error message helpers
export function getErrorMessage(error: ApiError): string {
  const errorMessages: Record<string, string> = {
    VALIDATION_ERROR: 'Please check your input and try again',
    NOT_FOUND: 'The requested resource was not found',
    UNAUTHORIZED: 'Please sign in to continue',
    FORBIDDEN: "You don't have permission to perform this action",
    CONFLICT: 'This action conflicts with existing data',
    RATE_LIMIT_EXCEEDED: 'Too many requests. Please try again later',
    NETWORK_ERROR: 'Network connection failed. Please check your internet connection',
    INTERNAL_SERVER_ERROR: 'Something went wrong on our end. Please try again later',
  }

  return errorMessages[error.code] || error.message || 'An unexpected error occurred'
}
```

## 📊 Error Logging & Monitoring

### Comprehensive Error Logging

```typescript
// ✅ Error logging service
export class ErrorLogger {
  private logger: Logger
  private monitoring: MonitoringService

  constructor(logger: Logger, monitoring: MonitoringService) {
    this.logger = logger
    this.monitoring = monitoring
  }

  /**
   * Log application error with context
   */
  logError(error: Error, context: ErrorContext): void {
    const errorData = {
      message: error.message,
      stack: error.stack,
      name: error.name,
      timestamp: new Date().toISOString(),
      ...context,
    }

    // Log to application logger
    this.logger.error('Application error', errorData)

    // Send to monitoring service
    this.monitoring.captureException(error, {
      tags: {
        errorType: error.constructor.name,
        userId: context.userId,
        feature: context.feature,
      },
      extra: context,
    })

    // Track error metrics
    this.monitoring.incrementCounter('errors.total', {
      errorType: error.constructor.name,
      statusCode: (error as AppError).statusCode?.toString(),
    })
  }

  /**
   * Log performance error
   */
  logPerformanceError(
    operation: string,
    duration: number,
    threshold: number,
    context: Record<string, unknown>,
  ): void {
    this.logger.warn('Performance threshold exceeded', {
      operation,
      duration,
      threshold,
      ...context,
    })

    this.monitoring.recordTiming('performance.slow_operation', duration, {
      operation,
    })
  }

  /**
   * Log security error
   */
  logSecurityError(
    event: string,
    severity: 'low' | 'medium' | 'high' | 'critical',
    context: SecurityContext,
  ): void {
    this.logger.error('Security event', {
      event,
      severity,
      timestamp: new Date().toISOString(),
      ...context,
    })

    // Immediate alert for critical security events
    if (severity === 'critical') {
      this.monitoring.sendAlert('Critical security event', {
        event,
        ...context,
      })
    }
  }
}

// ✅ Error metrics dashboard
export class ErrorMetricsDashboard {
  /**
   * Get error metrics for dashboard
   */
  async getErrorMetrics(timeRange: TimeRange): Promise<ErrorMetrics> {
    const [errorCounts, errorRates, topErrors, errorTrends] = await Promise.all([
      this.getErrorCounts(timeRange),
      this.getErrorRates(timeRange),
      this.getTopErrors(timeRange),
      this.getErrorTrends(timeRange),
    ])

    return {
      errorCounts,
      errorRates,
      topErrors,
      errorTrends,
      alerts: await this.getActiveAlerts(),
    }
  }

  private async getErrorCounts(timeRange: TimeRange): Promise<ErrorCounts> {
    // Implementation would query monitoring system
    return {
      total: 1250,
      byType: {
        ValidationError: 450,
        NotFoundError: 320,
        UnauthorizedError: 180,
        DatabaseError: 120,
        ExternalServiceError: 95,
        RateLimitError: 85,
      },
      byStatusCode: {
        '400': 450,
        '401': 180,
        '403': 75,
        '404': 320,
        '409': 45,
        '429': 85,
        '500': 95,
      },
    }
  }

  private async getTopErrors(timeRange: TimeRange): Promise<TopError[]> {
    return [
      {
        message: 'User not found',
        count: 320,
        type: 'NotFoundError',
        trend: 'increasing',
        affectedUsers: 180,
      },
      {
        message: 'Invalid email format',
        count: 280,
        type: 'ValidationError',
        trend: 'stable',
        affectedUsers: 210,
      },
    ]
  }
}
```

## 🔄 Recovery Strategies

### Automatic Recovery Patterns

```typescript
// ✅ Circuit breaker pattern
export class CircuitBreaker {
  private failures = 0
  private lastFailureTime?: Date
  private state: 'CLOSED' | 'OPEN' | 'HALF_OPEN' = 'CLOSED'

  constructor(
    private threshold: number = 5,
    private timeout: number = 60000,
    private monitor?: (state: string) => void,
  ) {}

  async call<T>(operation: () => Promise<T>): Promise<T> {
    if (this.state === 'OPEN') {
      if (this.shouldAttemptReset()) {
        this.state = 'HALF_OPEN'
        this.monitor?.('HALF_OPEN')
      } else {
        throw new Error('Circuit breaker is OPEN')
      }
    }

    try {
      const result = await operation()
      this.onSuccess()
      return result
    } catch (error) {
      this.onFailure()
      throw error
    }
  }

  private shouldAttemptReset(): boolean {
    return this.lastFailureTime && Date.now() - this.lastFailureTime.getTime() >= this.timeout
  }

  private onSuccess(): void {
    this.failures = 0
    this.state = 'CLOSED'
    this.monitor?.('CLOSED')
  }

  private onFailure(): void {
    this.failures++
    this.lastFailureTime = new Date()

    if (this.failures >= this.threshold) {
      this.state = 'OPEN'
      this.monitor?.('OPEN')
    }
  }
}

// ✅ Retry with exponential backoff
export class RetryManager {
  static async retry<T>(operation: () => Promise<T>, options: RetryOptions = {}): Promise<T> {
    const {
      maxAttempts = 3,
      baseDelay = 1000,
      maxDelay = 30000,
      backoffFactor = 2,
      shouldRetry = this.defaultShouldRetry,
    } = options

    let lastError: Error

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        return await operation()
      } catch (error) {
        lastError = error

        if (attempt === maxAttempts || !shouldRetry(error, attempt)) {
          throw error
        }

        const delay = Math.min(baseDelay * Math.pow(backoffFactor, attempt - 1), maxDelay)

        // Add jitter to prevent thundering herd
        const jitteredDelay = delay + Math.random() * 1000

        await this.sleep(jitteredDelay)
      }
    }

    throw lastError!
  }

  private static defaultShouldRetry(error: Error, attempt: number): boolean {
    // Don't retry client errors (4xx)
    if (error instanceof ApiError && error.status >= 400 && error.status < 500) {
      return false
    }

    // Don't retry validation errors
    if (error instanceof ValidationError) {
      return false
    }

    return true
  }

  private static sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms))
  }
}
```

## 🔗 Related Concepts

- **[API Design](.pair/knowledge/guidelines/code-design/README.md)** - API error response patterns
- **[Testing Strategy](.pair/knowledge/guidelines/testing/README.md)** - Error scenario testing
- **[Performance Optimization](.pair/knowledge/guidelines/code-design/quality-standards/performance-optimization.md)** - Error impact on performance

## 📏 Implementation Guidelines

1. **Consistent Error Types**: Use standardized error classes
2. **Proper Error Boundaries**: Implement React error boundaries
3. **Comprehensive Logging**: Log errors with sufficient context
4. **User-Friendly Messages**: Provide helpful error messages
5. **Recovery Strategies**: Implement automatic recovery when possible
6. **Monitoring Integration**: Connect errors to monitoring systems
7. **Security Considerations**: Don't expose sensitive information
8. **Performance Impact**: Minimize error handling overhead

---

_Error Handling provides comprehensive patterns for managing errors across the application stack, ensuring robust error recovery, proper logging, and excellent user experience during failure scenarios._

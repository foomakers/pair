# Error Handling

This document defines comprehensive error handling patterns and strategies across our full-stack application, ensuring consistent, user-friendly error experiences and robust system resilience.

## Overview

Our error handling strategy emphasizes graceful degradation, meaningful error messages, proper error propagation, and comprehensive logging while maintaining system stability and user experience.

## Error Classification

### Error Categories

```typescript
enum ErrorSeverity {
  LOW = 'low', // Info/warnings, non-blocking
  MEDIUM = 'medium', // Degraded functionality
  HIGH = 'high', // Feature failure
  CRITICAL = 'critical', // System failure
}

enum ErrorType {
  VALIDATION = 'validation',
  AUTHENTICATION = 'authentication',
  AUTHORIZATION = 'authorization',
  NETWORK = 'network',
  DATABASE = 'database',
  EXTERNAL_SERVICE = 'external_service',
  BUSINESS_LOGIC = 'business_logic',
  SYSTEM = 'system',
  UNKNOWN = 'unknown',
}

interface BaseError {
  code: string
  message: string
  type: ErrorType
  severity: ErrorSeverity
  timestamp: string
  correlation_id: string
  context?: Record<string, any>
  stack?: string
  cause?: Error
}

interface UserFacingError extends BaseError {
  user_message: string
  user_message_key?: string
  suggested_actions: string[]
  retry_after?: number
}

interface SystemError extends BaseError {
  service: string
  operation: string
  metadata: Record<string, any>
  metrics: {
    duration?: number
    memory_usage?: number
    cpu_usage?: number
  }
}
```

### Error Hierarchy

```typescript
abstract class AppError extends Error {
  abstract readonly code: string
  abstract readonly type: ErrorType
  abstract readonly severity: ErrorSeverity

  public readonly correlationId: string
  public readonly timestamp: string
  public readonly context: Record<string, any>

  constructor(message: string, context: Record<string, any> = {}, cause?: Error) {
    super(message)
    this.name = this.constructor.name
    this.correlationId = generateCorrelationId()
    this.timestamp = new Date().toISOString()
    this.context = context
    this.cause = cause

    // Capture stack trace
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, this.constructor)
    }
  }

  toJSON(): BaseError {
    return {
      code: this.code,
      message: this.message,
      type: this.type,
      severity: this.severity,
      timestamp: this.timestamp,
      correlation_id: this.correlationId,
      context: this.context,
      stack: this.stack,
      cause: this.cause,
    }
  }

  abstract toUserMessage(locale?: string): string
}

// Validation Errors
class ValidationError extends AppError {
  readonly code = 'VALIDATION_ERROR'
  readonly type = ErrorType.VALIDATION
  readonly severity = ErrorSeverity.MEDIUM

  constructor(field: string, value: any, constraint: string, context: Record<string, any> = {}) {
    super(`Validation failed for field '${field}': ${constraint}`, {
      field,
      value,
      constraint,
      ...context,
    })
  }

  toUserMessage(locale: string = 'en'): string {
    return `Please check the ${this.context.field} field and try again.`
  }
}

class MultiFieldValidationError extends AppError {
  readonly code = 'MULTI_FIELD_VALIDATION_ERROR'
  readonly type = ErrorType.VALIDATION
  readonly severity = ErrorSeverity.MEDIUM

  public readonly fieldErrors: Array<{
    field: string
    errors: string[]
  }>

  constructor(fieldErrors: Array<{ field: string; errors: string[] }>) {
    const message = `Validation failed for ${fieldErrors.length} field(s)`
    super(message, { field_count: fieldErrors.length })
    this.fieldErrors = fieldErrors
  }

  toUserMessage(locale: string = 'en'): string {
    return 'Please correct the highlighted fields and try again.'
  }
}

// Authentication/Authorization Errors
class AuthenticationError extends AppError {
  readonly code = 'AUTHENTICATION_ERROR'
  readonly type = ErrorType.AUTHENTICATION
  readonly severity = ErrorSeverity.HIGH

  toUserMessage(locale: string = 'en'): string {
    return 'Please log in to continue.'
  }
}

class AuthorizationError extends AppError {
  readonly code = 'AUTHORIZATION_ERROR'
  readonly type = ErrorType.AUTHORIZATION
  readonly severity = ErrorSeverity.HIGH

  toUserMessage(locale: string = 'en'): string {
    return 'You do not have permission to perform this action.'
  }
}

// Network/External Service Errors
class NetworkError extends AppError {
  readonly code = 'NETWORK_ERROR'
  readonly type = ErrorType.NETWORK
  readonly severity = ErrorSeverity.HIGH

  constructor(operation: string, statusCode?: number, context: Record<string, any> = {}) {
    super(`Network error during ${operation}`, { operation, status_code: statusCode, ...context })
  }

  toUserMessage(locale: string = 'en'): string {
    return 'Connection problem. Please check your internet and try again.'
  }
}

class ExternalServiceError extends AppError {
  readonly code = 'EXTERNAL_SERVICE_ERROR'
  readonly type = ErrorType.EXTERNAL_SERVICE
  readonly severity = ErrorSeverity.HIGH

  constructor(service: string, operation: string, context: Record<string, any> = {}) {
    super(`External service error: ${service} - ${operation}`, { service, operation, ...context })
  }

  toUserMessage(locale: string = 'en'): string {
    return 'A service is temporarily unavailable. Please try again later.'
  }
}

// Business Logic Errors
class BusinessLogicError extends AppError {
  readonly code = 'BUSINESS_LOGIC_ERROR'
  readonly type = ErrorType.BUSINESS_LOGIC
  readonly severity = ErrorSeverity.MEDIUM

  toUserMessage(locale: string = 'en'): string {
    return 'This action cannot be completed due to business rules.'
  }
}

// Database Errors
class DatabaseError extends AppError {
  readonly code = 'DATABASE_ERROR'
  readonly type = ErrorType.DATABASE
  readonly severity = ErrorSeverity.CRITICAL

  toUserMessage(locale: string = 'en'): string {
    return 'Data access error. Please try again later.'
  }
}

// System Errors
class SystemError extends AppError {
  readonly code = 'SYSTEM_ERROR'
  readonly type = ErrorType.SYSTEM
  readonly severity = ErrorSeverity.CRITICAL

  toUserMessage(locale: string = 'en'): string {
    return 'System error. Our team has been notified.'
  }
}
```

## Frontend Error Handling

### React Error Boundaries

```typescript
interface ErrorBoundaryState {
  hasError: boolean
  error?: Error
  errorInfo?: ErrorInfo
  errorId?: string
}

interface ErrorBoundaryProps {
  children: React.ReactNode
  fallback?: React.ComponentType<ErrorFallbackProps>
  onError?: (error: Error, errorInfo: ErrorInfo) => void
  isolate?: boolean // Prevent error propagation to parent boundaries
}

interface ErrorFallbackProps {
  error: Error
  errorId: string
  resetError: () => void
  retryAction?: () => void
}

class ErrorBoundary extends React.Component<ErrorBoundaryProps, ErrorBoundaryState> {
  private resetTimeoutId: number | null = null

  constructor(props: ErrorBoundaryProps) {
    super(props)
    this.state = { hasError: false }
  }

  static getDerivedStateFromError(error: Error): Partial<ErrorBoundaryState> {
    return {
      hasError: true,
      error,
      errorId: generateErrorId(),
    }
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    const errorId = this.state.errorId || generateErrorId()

    // Log error details
    console.error('Error boundary caught an error:', {
      error,
      errorInfo,
      errorId,
      timestamp: new Date().toISOString(),
    })

    // Report to error monitoring service
    errorReportingService.reportError(error, {
      errorId,
      componentStack: errorInfo.componentStack,
      context: 'error_boundary',
    })

    // Call custom error handler
    this.props.onError?.(error, errorInfo)

    // Auto-reset after 30 seconds (optional)
    this.resetTimeoutId = window.setTimeout(() => {
      this.setState({ hasError: false, error: undefined, errorInfo: undefined })
    }, 30000)
  }

  componentWillUnmount() {
    if (this.resetTimeoutId) {
      clearTimeout(this.resetTimeoutId)
    }
  }

  resetError = () => {
    this.setState({
      hasError: false,
      error: undefined,
      errorInfo: undefined,
      errorId: undefined,
    })
  }

  render() {
    if (this.state.hasError && this.state.error) {
      const FallbackComponent = this.props.fallback || DefaultErrorFallback

      return (
        <FallbackComponent
          error={this.state.error}
          errorId={this.state.errorId!}
          resetError={this.resetError}
        />
      )
    }

    return this.props.children
  }
}

// Default error fallback component
function DefaultErrorFallback({ error, errorId, resetError }: ErrorFallbackProps) {
  const { t } = useTranslation('errors')

  return (
    <div className='error-fallback'>
      <div className='error-fallback-content'>
        <h2 className='error-title'>{t('something_went_wrong')}</h2>
        <p className='error-message'>
          {error instanceof AppError ? error.toUserMessage() : t('generic_error_message')}
        </p>
        <details className='error-details'>
          <summary>{t('technical_details')}</summary>
          <pre className='error-stack'>
            <code>
              Error ID: {errorId}
              {'\n'}
              {error.message}
              {'\n'}
              {error.stack}
            </code>
          </pre>
        </details>
        <div className='error-actions'>
          <button onClick={resetError} className='btn btn-primary'>
            {t('try_again')}
          </button>
          <button onClick={() => window.location.reload()} className='btn btn-secondary'>
            {t('reload_page')}
          </button>
        </div>
      </div>
    </div>
  )
}

// Specialized error boundaries
function ApiErrorBoundary({ children }: { children: React.ReactNode }) {
  return (
    <ErrorBoundary
      fallback={ApiErrorFallback}
      onError={(error, errorInfo) => {
        // Specific handling for API errors
        if (error instanceof NetworkError || error instanceof ExternalServiceError) {
          // Maybe show a retry mechanism
          console.log('API error detected, implementing retry logic')
        }
      }}>
      {children}
    </ErrorBoundary>
  )
}

function ApiErrorFallback({ error, resetError }: ErrorFallbackProps) {
  const { t } = useTranslation('errors')
  const [retryCount, setRetryCount] = useState(0)

  const handleRetry = () => {
    setRetryCount(prev => prev + 1)
    resetError()
  }

  return (
    <div className='api-error-fallback'>
      <h3>{t('api_error_title')}</h3>
      <p>{t('api_error_message')}</p>
      {retryCount < 3 && (
        <button onClick={handleRetry} className='btn btn-retry'>
          {t('retry')} {retryCount > 0 && `(${retryCount}/3)`}
        </button>
      )}
    </div>
  )
}
```

### Async Error Handling

```typescript
// Custom hook for async operations with error handling
interface UseAsyncState<T> {
  data: T | null
  loading: boolean
  error: Error | null
  execute: (...args: any[]) => Promise<T>
  reset: () => void
}

function useAsync<T>(
  asyncFunction: (...args: any[]) => Promise<T>,
  immediate: boolean = false,
): UseAsyncState<T> {
  const [state, setState] = useState<{
    data: T | null
    loading: boolean
    error: Error | null
  }>({
    data: null,
    loading: immediate,
    error: null,
  })

  const execute = useCallback(
    async (...args: any[]): Promise<T> => {
      setState(prev => ({ ...prev, loading: true, error: null }))

      try {
        const result = await asyncFunction(...args)
        setState({ data: result, loading: false, error: null })
        return result
      } catch (error) {
        const appError =
          error instanceof AppError
            ? error
            : new SystemError('Async operation failed', { original_error: error })

        setState({ data: null, loading: false, error: appError })
        throw appError
      }
    },
    [asyncFunction],
  )

  const reset = useCallback(() => {
    setState({ data: null, loading: false, error: null })
  }, [])

  useEffect(() => {
    if (immediate) {
      execute()
    }
  }, [execute, immediate])

  return { ...state, execute, reset }
}

// Error handling hook
interface UseErrorHandlerOptions {
  report?: boolean
  showToast?: boolean
  redirectOn?: ErrorType[]
}

function useErrorHandler(options: UseErrorHandlerOptions = {}) {
  const { report = true, showToast = true, redirectOn = [] } = options
  const router = useRouter()
  const { showToast: displayToast } = useToast()

  const handleError = useCallback(
    (error: Error, context?: Record<string, any>) => {
      const appError =
        error instanceof AppError
          ? error
          : new SystemError('Unhandled error', { ...context, original_error: error })

      // Report error if enabled
      if (report) {
        errorReportingService.reportError(appError, context)
      }

      // Show toast notification if enabled
      if (showToast) {
        displayToast({
          type: 'error',
          title: 'Error',
          message: appError.toUserMessage(),
          duration: 5000,
        })
      }

      // Handle redirects for specific error types
      if (redirectOn.includes(appError.type)) {
        switch (appError.type) {
          case ErrorType.AUTHENTICATION:
            router.push('/login')
            break
          case ErrorType.AUTHORIZATION:
            router.push('/unauthorized')
            break
          default:
            router.push('/error')
        }
      }

      return appError
    },
    [report, showToast, redirectOn, router, displayToast],
  )

  return { handleError }
}

// React Query error handling
function createQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        retry: (failureCount, error) => {
          // Don't retry on authentication/authorization errors
          if (error instanceof AuthenticationError || error instanceof AuthorizationError) {
            return false
          }

          // Retry network errors up to 3 times
          if (error instanceof NetworkError && failureCount < 3) {
            return true
          }

          return false
        },
        retryDelay: attemptIndex => Math.min(1000 * 2 ** attemptIndex, 30000),
        onError: error => {
          console.error('Query error:', error)
          errorReportingService.reportError(error as Error, {
            context: 'react_query',
          })
        },
      },
      mutations: {
        onError: error => {
          console.error('Mutation error:', error)
          errorReportingService.reportError(error as Error, {
            context: 'react_query_mutation',
          })
        },
      },
    },
  })
}
```

## Backend Error Handling

### Express.js Error Middleware

```typescript
import { Request, Response, NextFunction } from 'express'

interface ErrorResponse {
  error: {
    code: string
    message: string
    type: string
    correlation_id: string
    timestamp: string
  }
  details?: any
  suggestions?: string[]
}

// Global error handler middleware
function errorHandler(err: Error, req: Request, res: Response, next: NextFunction): void {
  // Ensure error is an AppError
  const appError =
    err instanceof AppError
      ? err
      : new SystemError('Internal server error', { original_error: err })

  // Log error
  const logLevel = appError.severity === ErrorSeverity.CRITICAL ? 'error' : 'warn'
  logger[logLevel]('Request error', {
    error: appError.toJSON(),
    request: {
      method: req.method,
      url: req.originalUrl,
      headers: req.headers,
      body: req.body,
      user: req.user?.id,
      ip: req.ip,
    },
  })

  // Report critical errors
  if (appError.severity === ErrorSeverity.CRITICAL) {
    errorReportingService.reportError(appError, {
      request_id: req.id,
      user_id: req.user?.id,
      endpoint: `${req.method} ${req.originalUrl}`,
    })
  }

  // Determine status code
  const statusCode = getStatusCodeForError(appError)

  // Build response
  const response: ErrorResponse = {
    error: {
      code: appError.code,
      message: appError.toUserMessage(req.locale),
      type: appError.type,
      correlation_id: appError.correlationId,
      timestamp: appError.timestamp,
    },
  }

  // Add details in development
  if (process.env.NODE_ENV === 'development') {
    response.details = {
      stack: appError.stack,
      context: appError.context,
    }
  }

  // Add suggestions for certain error types
  if (appError instanceof ValidationError) {
    response.suggestions = ['Check input format', 'Verify required fields']
  }

  res.status(statusCode).json(response)
}

function getStatusCodeForError(error: AppError): number {
  switch (error.type) {
    case ErrorType.VALIDATION:
      return 400
    case ErrorType.AUTHENTICATION:
      return 401
    case ErrorType.AUTHORIZATION:
      return 403
    case ErrorType.BUSINESS_LOGIC:
      return 409
    case ErrorType.NETWORK:
    case ErrorType.EXTERNAL_SERVICE:
      return 502
    case ErrorType.DATABASE:
    case ErrorType.SYSTEM:
      return 500
    default:
      return 500
  }
}

// 404 handler
function notFoundHandler(req: Request, res: Response, next: NextFunction): void {
  const error = new BusinessLogicError(`Route not found: ${req.method} ${req.originalUrl}`, {
    method: req.method,
    url: req.originalUrl,
    available_routes: getAvailableRoutes(), // Implementation depends on your routing setup
  })

  next(error)
}

// Async wrapper for route handlers
function asyncHandler(fn: (req: Request, res: Response, next: NextFunction) => Promise<any>) {
  return (req: Request, res: Response, next: NextFunction) => {
    Promise.resolve(fn(req, res, next)).catch(next)
  }
}

// Usage example
app.get(
  '/api/users/:id',
  asyncHandler(async (req, res) => {
    const { id } = req.params

    if (!isValidId(id)) {
      throw new ValidationError('id', id, 'Invalid user ID format')
    }

    const user = await userService.findById(id)

    if (!user) {
      throw new BusinessLogicError(`User not found: ${id}`, { user_id: id })
    }

    res.json({ user })
  }),
)
```

### Database Error Handling

```typescript
// Prisma error wrapper
function handlePrismaError(error: any): AppError {
  if (error.code === 'P2002') {
    // Unique constraint violation
    const field = error.meta?.target?.[0] || 'field'
    return new ValidationError(field, null, 'Value already exists', { prisma_error: error.code })
  }

  if (error.code === 'P2025') {
    // Record not found
    return new BusinessLogicError('Record not found', { prisma_error: error.code })
  }

  if (error.code === 'P2003') {
    // Foreign key constraint violation
    return new BusinessLogicError('Related record not found', { prisma_error: error.code })
  }

  // Connection errors
  if (error.code === 'P1001' || error.code === 'P1008') {
    return new DatabaseError('Database connection failed', { prisma_error: error.code })
  }

  // Generic database error
  return new DatabaseError('Database operation failed', {
    prisma_error: error.code,
    prisma_message: error.message,
  })
}

// Repository with error handling
class UserRepository {
  async findById(id: string): Promise<User> {
    try {
      const user = await prisma.user.findUnique({
        where: { id },
      })

      if (!user) {
        throw new BusinessLogicError(`User not found: ${id}`, { user_id: id })
      }

      return user
    } catch (error) {
      if (error instanceof AppError) {
        throw error
      }

      throw handlePrismaError(error)
    }
  }

  async create(userData: CreateUserData): Promise<User> {
    try {
      return await prisma.user.create({
        data: userData,
      })
    } catch (error) {
      throw handlePrismaError(error)
    }
  }
}
```

## Error Monitoring and Reporting

### Error Reporting Service

```typescript
interface ErrorReport {
  error: AppError
  context: Record<string, any>
  user?: {
    id: string
    email: string
  }
  environment: string
  version: string
  timestamp: string
}

interface ErrorReportingConfig {
  enabled: boolean
  service: 'sentry' | 'bugsnag' | 'rollbar' | 'custom'
  api_key: string
  environment: string
  release: string
  sample_rate: number
  ignore_errors: string[]
}

class ErrorReportingService {
  private config: ErrorReportingConfig
  private client: any // Sentry, Bugsnag, etc.

  constructor(config: ErrorReportingConfig) {
    this.config = config
    this.initializeClient()
  }

  private initializeClient(): void {
    if (!this.config.enabled) return

    switch (this.config.service) {
      case 'sentry':
        // Initialize Sentry
        break
      case 'bugsnag':
        // Initialize Bugsnag
        break
      default:
        console.warn('Unknown error reporting service')
    }
  }

  reportError(error: Error, context: Record<string, any> = {}): void {
    if (!this.config.enabled) return

    const appError =
      error instanceof AppError
        ? error
        : new SystemError('Unhandled error', { original_error: error })

    // Check if error should be ignored
    if (this.shouldIgnoreError(appError)) {
      return
    }

    // Apply sampling
    if (Math.random() > this.config.sample_rate) {
      return
    }

    const report: ErrorReport = {
      error: appError,
      context,
      environment: this.config.environment,
      version: this.config.release,
      timestamp: new Date().toISOString(),
    }

    this.sendReport(report)
  }

  private shouldIgnoreError(error: AppError): boolean {
    return this.config.ignore_errors.some(
      pattern => error.code.includes(pattern) || error.message.includes(pattern),
    )
  }

  private sendReport(report: ErrorReport): void {
    // Implementation depends on the service
    try {
      this.client?.captureException(report.error, {
        contexts: {
          app: report.context,
          runtime: {
            name: 'node',
            version: process.version,
          },
        },
        tags: {
          error_type: report.error.type,
          error_severity: report.error.severity,
        },
        level: this.mapSeverityToLevel(report.error.severity),
      })
    } catch (reportingError) {
      console.error('Failed to report error:', reportingError)
    }
  }

  private mapSeverityToLevel(severity: ErrorSeverity): string {
    switch (severity) {
      case ErrorSeverity.LOW:
        return 'info'
      case ErrorSeverity.MEDIUM:
        return 'warning'
      case ErrorSeverity.HIGH:
        return 'error'
      case ErrorSeverity.CRITICAL:
        return 'fatal'
      default:
        return 'error'
    }
  }
}

// Initialize service
const errorReportingService = new ErrorReportingService({
  enabled: process.env.NODE_ENV === 'production',
  service: 'sentry',
  api_key: process.env.SENTRY_DSN || '',
  environment: process.env.NODE_ENV || 'development',
  release: process.env.APP_VERSION || '1.0.0',
  sample_rate: 0.1, // 10% sampling
  ignore_errors: ['ValidationError', 'AuthenticationError'],
})
```

## Testing Error Scenarios

### Error Testing Strategies

```typescript
// Jest test utilities for error handling
function expectError<T extends AppError>(
  promise: Promise<any>,
  ErrorClass: new (...args: any[]) => T,
): Promise<T> {
  return promise
    .then(() => {
      throw new Error('Expected promise to reject')
    })
    .catch(error => {
      expect(error).toBeInstanceOf(ErrorClass)
      return error as T
    })
}

// Example tests
describe('UserService', () => {
  describe('findById', () => {
    it('should throw BusinessLogicError when user not found', async () => {
      const error = await expectError(userService.findById('nonexistent'), BusinessLogicError)

      expect(error.code).toBe('BUSINESS_LOGIC_ERROR')
      expect(error.context.user_id).toBe('nonexistent')
    })

    it('should throw ValidationError for invalid ID format', async () => {
      const error = await expectError(userService.findById('invalid-id'), ValidationError)

      expect(error.context.field).toBe('id')
      expect(error.context.constraint).toBe('Invalid user ID format')
    })
  })
})

// React component error testing
describe('UserProfile Component', () => {
  it('should display error message when user loading fails', async () => {
    const mockError = new NetworkError('fetch_user', 500)

    jest.spyOn(userService, 'findById').mockRejectedValue(mockError)

    render(<UserProfile userId='123' />)

    await waitFor(() => {
      expect(screen.getByText(/connection problem/i)).toBeInTheDocument()
    })
  })

  it('should show retry button for retryable errors', async () => {
    const mockError = new NetworkError('fetch_user', 500)

    jest.spyOn(userService, 'findById').mockRejectedValue(mockError)

    render(<UserProfile userId='123' />)

    await waitFor(() => {
      expect(screen.getByText(/try again/i)).toBeInTheDocument()
    })
  })
})
```

## Related Concepts

- **Performance Patterns**: Error monitoring impact on performance
- **Security Guidelines**: Secure error message handling
- **Testing Strategy**: Comprehensive error scenario testing
- **Quality Standards**: Error handling code quality standards
- **External Services**: Third-party error reporting integration

## Tools and Libraries

- **Sentry**: Error monitoring and reporting platform
- **React Error Boundary**: React error handling mechanism
- **Zod**: Runtime type validation and error generation
- **Winston**: Structured logging for error tracking
- **Joi**: Data validation with detailed error messages

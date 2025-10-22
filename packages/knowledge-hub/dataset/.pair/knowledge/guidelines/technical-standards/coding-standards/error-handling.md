# Error Handling Standards

Comprehensive framework for consistent, predictable, and maintainable error handling across applications and services.

## Purpose

Establish unified error handling patterns that improve system reliability, debugging efficiency, and user experience through consistent error management strategies.

## Error Handling Philosophy

### Core Principles

1. **Fail Fast and Explicitly** - Detect and report errors as early as possible
2. **Contextual Information** - Provide meaningful context for debugging and resolution
3. **Graceful Degradation** - Maintain functionality when possible during partial failures
4. **User-Friendly Messages** - Present appropriate error information to end users
5. **Observability Integration** - Enable effective monitoring and alerting

## Error Classification Framework

### Error Severity Levels

```typescript
enum ErrorSeverity {
  CRITICAL = 'critical', // System failure, immediate attention required
  HIGH = 'high', // Feature unavailable, significant impact
  MEDIUM = 'medium', // Degraded functionality, workaround available
  LOW = 'low', // Minor issues, minimal impact
  INFO = 'info', // Informational, no action required
}
```

### Error Categories

#### System Errors

```typescript
// Infrastructure and system-level failures
class SystemError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly details?: Record<string, unknown>,
  ) {
    super(message)
    this.name = 'SystemError'
  }
}

// Examples
const databaseConnectionError = new SystemError(
  'Failed to connect to database',
  'DB_CONNECTION_FAILED',
  { host: 'localhost', port: 5432, timeout: 30000 },
)

const externalServiceError = new SystemError(
  'Payment service unavailable',
  'EXTERNAL_SERVICE_UNAVAILABLE',
  { service: 'stripe', endpoint: '/charges', statusCode: 503 },
)
```

#### Validation Errors

```typescript
// Input validation and business rule violations
class ValidationError extends Error {
  constructor(
    message: string,
    public readonly field: string,
    public readonly constraint: string,
    public readonly received?: unknown,
  ) {
    super(message)
    this.name = 'ValidationError'
  }
}

// Examples
const emailValidationError = new ValidationError(
  'Invalid email address format',
  'email',
  'format',
  'invalid-email-address',
)

const requiredFieldError = new ValidationError(
  'First name is required',
  'firstName',
  'required',
  undefined,
)
```

#### Business Logic Errors

```typescript
// Domain-specific business rule violations
class BusinessError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly context?: Record<string, unknown>,
  ) {
    super(message)
    this.name = 'BusinessError'
  }
}

// Examples
const insufficientFundsError = new BusinessError(
  'Insufficient funds for transaction',
  'INSUFFICIENT_FUNDS',
  { accountBalance: 100, requestedAmount: 150 },
)

const duplicateResourceError = new BusinessError(
  'User with this email already exists',
  'DUPLICATE_USER_EMAIL',
  { email: 'user@example.com' },
)
```

## Error Handling Patterns

### Result Pattern (Recommended)

```typescript
// Result type for explicit error handling
type Result<T, E = Error> =
  | {
      success: true
      data: T
    }
  | {
      success: false
      error: E
    }

// Implementation example
async function createUser(
  userData: CreateUserData,
): Promise<Result<User, ValidationError | BusinessError>> {
  // Validation
  const validation = validateUserData(userData)
  if (!validation.success) {
    return { success: false, error: validation.error }
  }

  // Business logic
  const existingUser = await userRepository.findByEmail(userData.email)
  if (existingUser) {
    return {
      success: false,
      error: new BusinessError('User with this email already exists', 'DUPLICATE_USER_EMAIL', {
        email: userData.email,
      }),
    }
  }

  // Create user
  try {
    const user = await userRepository.create(userData)
    return { success: true, data: user }
  } catch (error) {
    return {
      success: false,
      error: new SystemError('Failed to create user', 'USER_CREATION_FAILED', {
        originalError: error,
      }),
    }
  }
}

// Usage
const userResult = await createUser(newUserData)
if (!userResult.success) {
  handleError(userResult.error)
  return
}
const user = userResult.data // Type-safe access
```

### Error Boundary Pattern (React)

```typescript
interface ErrorBoundaryState {
  hasError: boolean
  error?: Error
  errorInfo?: ErrorInfo
}

class ErrorBoundary extends Component<PropsWithChildren, ErrorBoundaryState> {
  constructor(props: PropsWithChildren) {
    super(props)
    this.state = { hasError: false }
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error }
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    // Log error to monitoring service
    logger.error('Component error boundary caught error', {
      error: error.message,
      stack: error.stack,
      componentStack: errorInfo.componentStack,
    })

    this.setState({ error, errorInfo })
  }

  render() {
    if (this.state.hasError) {
      return (
        <ErrorFallback error={this.state.error} retry={() => this.setState({ hasError: false })} />
      )
    }

    return this.props.children
  }
}
```

### Circuit Breaker Pattern

```typescript
class CircuitBreaker {
  private state: 'CLOSED' | 'OPEN' | 'HALF_OPEN' = 'CLOSED'
  private failureCount = 0
  private lastFailureTime = 0
  private successCount = 0

  constructor(
    private readonly threshold: number = 5,
    private readonly timeout: number = 60000,
    private readonly resetTimeout: number = 30000,
  ) {}

  async execute<T>(operation: () => Promise<T>): Promise<Result<T, SystemError>> {
    if (this.state === 'OPEN') {
      if (Date.now() - this.lastFailureTime > this.resetTimeout) {
        this.state = 'HALF_OPEN'
        this.successCount = 0
      } else {
        return {
          success: false,
          error: new SystemError('Circuit breaker is OPEN', 'CIRCUIT_BREAKER_OPEN', {
            failureCount: this.failureCount,
          }),
        }
      }
    }

    try {
      const result = await operation()
      this.onSuccess()
      return { success: true, data: result }
    } catch (error) {
      this.onFailure()
      return {
        success: false,
        error: new SystemError('Operation failed', 'OPERATION_FAILED', { originalError: error }),
      }
    }
  }

  private onSuccess(): void {
    this.failureCount = 0
    this.successCount++

    if (this.state === 'HALF_OPEN' && this.successCount >= 3) {
      this.state = 'CLOSED'
    }
  }

  private onFailure(): void {
    this.failureCount++
    this.lastFailureTime = Date.now()

    if (this.failureCount >= this.threshold) {
      this.state = 'OPEN'
    }
  }
}
```

## API Error Handling

### HTTP Error Response Format

```typescript
interface ApiErrorResponse {
  success: false
  error: {
    code: string
    message: string
    details?: Record<string, unknown>
    field?: string // For validation errors
  }
  metadata: {
    requestId: string
    timestamp: string
    traceId?: string
  }
}

// Express.js error handler middleware
function errorHandler(error: Error, req: Request, res: Response, next: NextFunction): void {
  const requestId = req.headers['x-request-id'] as string

  // Log error
  logger.error('API error', {
    error: error.message,
    stack: error.stack,
    requestId,
    path: req.path,
    method: req.method,
  })

  // Determine response based on error type
  if (error instanceof ValidationError) {
    res.status(400).json({
      success: false,
      error: {
        code: 'VALIDATION_ERROR',
        message: error.message,
        field: error.field,
        details: { constraint: error.constraint, received: error.received },
      },
      metadata: {
        requestId,
        timestamp: new Date().toISOString(),
      },
    })
    return
  }

  if (error instanceof BusinessError) {
    res.status(422).json({
      success: false,
      error: {
        code: error.code,
        message: error.message,
        details: error.context,
      },
      metadata: {
        requestId,
        timestamp: new Date().toISOString(),
      },
    })
    return
  }

  // Default to internal server error
  res.status(500).json({
    success: false,
    error: {
      code: 'INTERNAL_SERVER_ERROR',
      message: 'An unexpected error occurred',
    },
    metadata: {
      requestId,
      timestamp: new Date().toISOString(),
    },
  })
}
```

## Monitoring and Observability

### Error Tracking Integration

```typescript
interface ErrorTracker {
  captureError(error: Error, context?: Record<string, unknown>): void
  captureMessage(message: string, level: 'info' | 'warning' | 'error'): void
}

class ErrorTrackingService implements ErrorTracker {
  captureError(error: Error, context?: Record<string, unknown>): void {
    // Send to monitoring service (Sentry, Bugsnag, etc.)
    console.error('Error captured:', {
      message: error.message,
      stack: error.stack,
      name: error.name,
      context,
    })
  }

  captureMessage(message: string, level: 'info' | 'warning' | 'error'): void {
    console.log(`[${level.toUpperCase()}] ${message}`)
  }
}

// Global error handler
process.on('unhandledRejection', (reason, promise) => {
  errorTracker.captureError(new Error(`Unhandled rejection: ${reason}`), {
    promise: promise.toString(),
  })
})

process.on('uncaughtException', error => {
  errorTracker.captureError(error, { type: 'uncaughtException' })
  process.exit(1)
})
```

### Error Metrics and Alerting

```typescript
interface ErrorMetrics {
  errorRate: number
  errorCount: number
  errorsByType: Record<string, number>
  errorsByEndpoint: Record<string, number>
}

class ErrorMetricsCollector {
  private errorCounts = new Map<string, number>()

  incrementErrorCount(errorType: string, endpoint?: string): void {
    const key = endpoint ? `${errorType}:${endpoint}` : errorType
    this.errorCounts.set(key, (this.errorCounts.get(key) || 0) + 1)
  }

  getMetrics(): ErrorMetrics {
    const errorsByType: Record<string, number> = {}
    const errorsByEndpoint: Record<string, number> = {}
    let totalErrors = 0

    for (const [key, count] of this.errorCounts) {
      totalErrors += count

      if (key.includes(':')) {
        const [errorType, endpoint] = key.split(':')
        errorsByType[errorType] = (errorsByType[errorType] || 0) + count
        errorsByEndpoint[endpoint] = (errorsByEndpoint[endpoint] || 0) + count
      } else {
        errorsByType[key] = count
      }
    }

    return {
      errorRate: totalErrors / (totalErrors + this.getSuccessCount()),
      errorCount: totalErrors,
      errorsByType,
      errorsByEndpoint,
    }
  }

  private getSuccessCount(): number {
    // Implementation depends on your metrics collection system
    return 1000 // Placeholder
  }
}
```

This framework ensures consistent, observable, and maintainable error handling across all application components.

````markdown
# Error Handling

## Overview

Robust error handling is essential for building reliable applications. This guide covers strategies for fail-fast operations, domain-specific errors, error enrichment, and mapping errors for observability and user experience.

## Error Handling Principles

### 1. Fail-Fast Strategy

Detect and report errors as early as possible to prevent cascading failures.

```typescript
// ✅ Good: Validate inputs immediately
function calculateOrderTotal(items: OrderItem[]): number {
  if (!items || items.length === 0) {
    throw new Error('Order items cannot be empty')
  }

  for (const item of items) {
    if (!item.price || item.price < 0) {
      throw new Error(`Invalid price for item ${item.id}: ${item.price}`)
    }
    if (!item.quantity || item.quantity <= 0) {
      throw new Error(`Invalid quantity for item ${item.id}: ${item.quantity}`)
    }
  }

  return items.reduce((total, item) => total + item.price * item.quantity, 0)
}

// ❌ Bad: Silent failures or late detection
function calculateOrderTotal(items: OrderItem[]): number {
  let total = 0
  for (const item of items || []) {
    total += (item.price || 0) * (item.quantity || 1) // Silently uses defaults
  }
  return total // Could return 0 for invalid input
}
```
````

### 2. Domain-Specific Errors

Create meaningful error types that represent business domain concepts.

```typescript
// Base error class
abstract class DomainError extends Error {
  abstract readonly code: string
  abstract readonly statusCode: number

  constructor(message: string, public readonly context?: Record<string, any>) {
    super(message)
    this.name = this.constructor.name
  }
}

// Specific domain errors
class ValidationError extends DomainError {
  readonly code = 'VALIDATION_ERROR'
  readonly statusCode = 400

  constructor(
    message: string,
    public readonly field: string,
    public readonly value: any,
    context?: Record<string, any>,
  ) {
    super(message, { field, value, ...context })
  }
}

class NotFoundError extends DomainError {
  readonly code = 'NOT_FOUND'
  readonly statusCode = 404

  constructor(resource: string, id: string, context?: Record<string, any>) {
    super(`${resource} with id ${id} not found`, { resource, id, ...context })
  }
}

class BusinessRuleError extends DomainError {
  readonly code = 'BUSINESS_RULE_VIOLATION'
  readonly statusCode = 422

  constructor(rule: string, context?: Record<string, any>) {
    super(`Business rule violation: ${rule}`, { rule, ...context })
  }
}

class InsufficientPermissionsError extends DomainError {
  readonly code = 'INSUFFICIENT_PERMISSIONS'
  readonly statusCode = 403

  constructor(action: string, resource: string, context?: Record<string, any>) {
    super(`Insufficient permissions to ${action} ${resource}`, { action, resource, ...context })
  }
}
```

### 3. Error Enrichment

Add contextual information to errors for better debugging and monitoring.

```typescript
class ErrorEnricher {
  static enrich(error: Error, context: Record<string, any>): Error {
    if (error instanceof DomainError) {
      return new (error.constructor as any)(error.message, { ...error.context, ...context })
    }

    // Enrich generic errors
    const enrichedError = new Error(error.message)
    enrichedError.name = error.name
    enrichedError.stack = error.stack
    ;(enrichedError as any).context = context

    return enrichedError
  }

  static withUserContext(error: Error, userId: string, sessionId: string): Error {
    return this.enrich(error, { userId, sessionId, timestamp: new Date().toISOString() })
  }

  static withRequestContext(error: Error, requestId: string, path: string, method: string): Error {
    return this.enrich(error, { requestId, path, method, timestamp: new Date().toISOString() })
  }
}

// Usage in service layer
class UserService {
  async createUser(userData: CreateUserRequest, context: RequestContext): Promise<User> {
    try {
      const validation = this.validateUserData(userData)
      if (!validation.isValid) {
        throw new ValidationError('User data validation failed', validation.field, validation.value)
      }

      const existingUser = await this.userRepository.findByEmail(userData.email)
      if (existingUser) {
        throw new BusinessRuleError('User with this email already exists')
      }

      return await this.userRepository.create(userData)
    } catch (error) {
      const enrichedError = ErrorEnricher.withRequestContext(
        ErrorEnricher.withUserContext(error, context.userId, context.sessionId),
        context.requestId,
        '/api/users',
        'POST',
      )

      throw enrichedError
    }
  }
}
```

## Error Mapping Strategies

### HTTP Status Code Mapping

```typescript
class ErrorMapper {
  static toHttpResponse(error: Error): { statusCode: number; body: any } {
    if (error instanceof DomainError) {
      return {
        statusCode: error.statusCode,
        body: {
          error: {
            code: error.code,
            message: error.message,
            context: this.sanitizeContext(error.context),
          },
        },
      }
    }

    // Handle known error types
    if (error.name === 'ValidationError') {
      return {
        statusCode: 400,
        body: {
          error: {
            code: 'VALIDATION_ERROR',
            message: error.message,
          },
        },
      }
    }

    // Default to internal server error
    return {
      statusCode: 500,
      body: {
        error: {
          code: 'INTERNAL_SERVER_ERROR',
          message: 'An unexpected error occurred',
        },
      },
    }
  }

  private static sanitizeContext(context?: Record<string, any>): Record<string, any> {
    if (!context) return {}

    // Remove sensitive information
    const sanitized = { ...context }
    delete sanitized.password
    delete sanitized.token
    delete sanitized.secret

    return sanitized
  }
}
```

### User-Friendly Error Messages

```typescript
class UserErrorMapper {
  private static readonly USER_MESSAGES: Record<string, string> = {
    VALIDATION_ERROR: 'Please check your input and try again.',
    NOT_FOUND: 'The requested item could not be found.',
    BUSINESS_RULE_VIOLATION: 'This action cannot be completed due to business rules.',
    INSUFFICIENT_PERMISSIONS: 'You do not have permission to perform this action.',
    NETWORK_ERROR: 'Please check your internet connection and try again.',
    RATE_LIMIT_EXCEEDED: 'Too many requests. Please wait a moment and try again.',
  }

  static toUserMessage(error: Error): string {
    if (error instanceof DomainError) {
      return this.USER_MESSAGES[error.code] || 'An error occurred. Please try again.'
    }

    return 'An unexpected error occurred. Please try again.'
  }

  static toUserError(error: Error): UserError {
    const message = this.toUserMessage(error)
    const code = error instanceof DomainError ? error.code : 'UNKNOWN_ERROR'

    return {
      code,
      message,
      userMessage: message,
      timestamp: new Date().toISOString(),
    }
  }
}

interface UserError {
  code: string
  message: string
  userMessage: string
  timestamp: string
}
```

## Async Error Handling

### Promise-Based Error Handling

```typescript
// Result pattern for explicit error handling
type Result<T, E = Error> = { success: true; data: T } | { success: false; error: E }

class AsyncErrorHandler {
  static async safe<T>(promise: Promise<T>): Promise<Result<T>> {
    try {
      const data = await promise
      return { success: true, data }
    } catch (error) {
      return { success: false, error: error instanceof Error ? error : new Error(String(error)) }
    }
  }

  static async safeWithRetry<T>(
    operation: () => Promise<T>,
    maxRetries: number = 3,
    delay: number = 1000,
  ): Promise<Result<T>> {
    let lastError: Error

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      const result = await this.safe(operation())

      if (result.success) {
        return result
      }

      lastError = result.error

      // Don't retry on certain error types
      if (result.error instanceof ValidationError || result.error instanceof NotFoundError) {
        break
      }

      if (attempt < maxRetries) {
        await new Promise(resolve => setTimeout(resolve, delay * attempt))
      }
    }

    return { success: false, error: lastError! }
  }
}

// Usage
async function getUserData(userId: string): Promise<Result<User>> {
  const result = await AsyncErrorHandler.safeWithRetry(
    () => userRepository.findById(userId),
    3,
    1000,
  )

  if (!result.success) {
    logger.error('Failed to fetch user data', { userId, error: result.error })
  }

  return result
}
```

### Error Boundaries (React)

```typescript
interface ErrorBoundaryState {
  hasError: boolean
  error?: Error
  errorInfo?: ErrorInfo
}

class ErrorBoundary extends React.Component<React.PropsWithChildren<{}>, ErrorBoundaryState> {
  constructor(props: React.PropsWithChildren<{}>) {
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
    this.setState({
      error,
      errorInfo,
    })

    // Log error to monitoring service
    errorReporter.captureException(error, {
      extra: errorInfo,
      tags: { component: 'ErrorBoundary' },
    })
  }

  render() {
    if (this.state.hasError) {
      return (
        <ErrorFallback
          error={this.state.error}
          onRetry={() => this.setState({ hasError: false })}
        />
      )
    }

    return this.props.children
  }
}

const ErrorFallback: React.FC<{
  error?: Error
  onRetry: () => void
}> = ({ error, onRetry }) => {
  const userMessage = UserErrorMapper.toUserMessage(error || new Error('Unknown error'))

  return (
    <div className='error-fallback'>
      <h2>Something went wrong</h2>
      <p>{userMessage}</p>
      <button onClick={onRetry}>Try again</button>
    </div>
  )
}
```

## Observability Integration

### Structured Error Logging

```typescript
interface ErrorLog {
  level: 'error' | 'warn' | 'fatal'
  message: string
  error: {
    name: string
    message: string
    stack?: string
    code?: string
  }
  context: Record<string, any>
  timestamp: string
  service: string
  version: string
}

class ErrorLogger {
  constructor(private readonly logger: Logger) {}

  logError(error: Error, context: Record<string, any> = {}): void {
    const errorLog: ErrorLog = {
      level: this.getLogLevel(error),
      message: error.message,
      error: {
        name: error.name,
        message: error.message,
        stack: error.stack,
        code: error instanceof DomainError ? error.code : undefined,
      },
      context: {
        ...context,
        ...(error instanceof DomainError ? error.context : {}),
      },
      timestamp: new Date().toISOString(),
      service: process.env.SERVICE_NAME || 'unknown',
      version: process.env.SERVICE_VERSION || 'unknown',
    }

    this.logger.log(errorLog.level, errorLog)
  }

  private getLogLevel(error: Error): 'error' | 'warn' | 'fatal' {
    if (error instanceof ValidationError) return 'warn'
    if (error instanceof NotFoundError) return 'warn'
    if (error instanceof BusinessRuleError) return 'warn'
    if (error instanceof InsufficientPermissionsError) return 'warn'

    return 'error'
  }
}
```

### Error Metrics

```typescript
class ErrorMetrics {
  constructor(private readonly metricsClient: MetricsClient) {}

  recordError(error: Error, context: Record<string, any> = {}): void {
    const tags = {
      error_type: error.name,
      error_code: error instanceof DomainError ? error.code : 'UNKNOWN',
      service: process.env.SERVICE_NAME || 'unknown',
    }

    // Increment error counter
    this.metricsClient.increment('errors.total', 1, tags)

    // Record error by HTTP status code
    if (error instanceof DomainError) {
      this.metricsClient.increment(`errors.http_${error.statusCode}`, 1, tags)
    }

    // Record error by endpoint if available
    if (context.endpoint) {
      this.metricsClient.increment('errors.by_endpoint', 1, {
        ...tags,
        endpoint: context.endpoint,
      })
    }
  }
}
```

## Error Recovery Patterns

### Circuit Breaker

```typescript
interface CircuitBreakerConfig {
  failureThreshold: number
  timeout: number
  resetTimeout: number
}

enum CircuitState {
  CLOSED = 'CLOSED',
  OPEN = 'OPEN',
  HALF_OPEN = 'HALF_OPEN',
}

class CircuitBreaker {
  private state = CircuitState.CLOSED
  private failureCount = 0
  private nextAttempt = 0

  constructor(private readonly config: CircuitBreakerConfig) {}

  async execute<T>(operation: () => Promise<T>): Promise<T> {
    if (this.state === CircuitState.OPEN) {
      if (Date.now() < this.nextAttempt) {
        throw new Error('Circuit breaker is OPEN')
      }
      this.state = CircuitState.HALF_OPEN
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

  private onSuccess(): void {
    this.failureCount = 0
    this.state = CircuitState.CLOSED
  }

  private onFailure(): void {
    this.failureCount++

    if (this.failureCount >= this.config.failureThreshold) {
      this.state = CircuitState.OPEN
      this.nextAttempt = Date.now() + this.config.resetTimeout
    }
  }
}
```

### Graceful Degradation

```typescript
class ServiceWithFallback {
  constructor(
    private readonly primaryService: PrimaryService,
    private readonly fallbackService: FallbackService,
    private readonly circuitBreaker: CircuitBreaker,
  ) {}

  async getData(id: string): Promise<Data> {
    try {
      // Try primary service with circuit breaker
      return await this.circuitBreaker.execute(() => this.primaryService.getData(id))
    } catch (error) {
      logger.warn('Primary service failed, using fallback', {
        id,
        error: error.message,
      })

      try {
        // Try fallback service
        return await this.fallbackService.getData(id)
      } catch (fallbackError) {
        logger.error('Both primary and fallback services failed', {
          id,
          primaryError: error.message,
          fallbackError: fallbackError.message,
        })

        // Return default/cached data or re-throw
        return this.getDefaultData(id)
      }
    }
  }

  private getDefaultData(id: string): Data {
    // Return cached data or sensible defaults
    return {
      id,
      data: 'Default data - service temporarily unavailable',
    }
  }
}
```

## Testing Error Scenarios

### Error Testing Utilities

```typescript
class ErrorTestUtils {
  static expectError<T extends Error>(
    operation: () => Promise<any>,
    errorType: new (...args: any[]) => T,
    expectedMessage?: string,
  ): Promise<T> {
    return operation()
      .then(() => {
        throw new Error('Expected operation to throw an error')
      })
      .catch(error => {
        expect(error).toBeInstanceOf(errorType)
        if (expectedMessage) {
          expect(error.message).toContain(expectedMessage)
        }
        return error
      })
  }

  static async expectDomainError(
    operation: () => Promise<any>,
    expectedCode: string,
    expectedStatusCode?: number,
  ): Promise<DomainError> {
    const error = await this.expectError(operation, DomainError)
    expect(error.code).toBe(expectedCode)
    if (expectedStatusCode) {
      expect(error.statusCode).toBe(expectedStatusCode)
    }
    return error
  }
}

// Test examples
describe('UserService', () => {
  it('should throw ValidationError for invalid email', async () => {
    const invalidUserData = { email: 'invalid-email', firstName: 'John' }

    await ErrorTestUtils.expectDomainError(
      () => userService.createUser(invalidUserData),
      'VALIDATION_ERROR',
      400,
    )
  })

  it('should throw NotFoundError for non-existent user', async () => {
    const nonExistentId = 'non-existent-id'

    await ErrorTestUtils.expectDomainError(
      () => userService.getUserById(nonExistentId),
      'NOT_FOUND',
      404,
    )
  })
})
```

## Best Practices

1. **Fail Fast**: Validate inputs early and fail immediately on invalid data
2. **Domain Errors**: Use specific error types that represent business concepts
3. **Error Enrichment**: Add contextual information for debugging
4. **Structured Logging**: Log errors in a structured format for analysis
5. **User-Friendly Messages**: Map technical errors to user-friendly messages
6. **Monitoring**: Track error metrics and set up alerts
7. **Recovery**: Implement fallback mechanisms and graceful degradation
8. **Testing**: Test error scenarios explicitly
9. **Documentation**: Document expected errors and their meanings
10. **Consistency**: Use consistent error handling patterns across the application

Proper error handling improves application reliability, developer experience, and user satisfaction.

```

```

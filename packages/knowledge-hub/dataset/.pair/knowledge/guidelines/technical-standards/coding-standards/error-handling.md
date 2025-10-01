# Error Handling Standards

## Purpose

Establish consistent error handling patterns to improve application reliability, debugging efficiency, and user experience across all system components.

## Error Handling Philosophy

### Core Principles

1. **Fail Fast**: Detect and report errors as early as possible
2. **Fail Safe**: When errors occur, maintain system stability
3. **Transparency**: Provide clear error information for debugging
4. **User-Centric**: Present meaningful messages to end users
5. **Operational**: Enable effective monitoring and alerting

### Error Categories

```typescript
enum ErrorCategory {
  VALIDATION = 'validation', // Input validation failures
  BUSINESS = 'business', // Business rule violations
  SYSTEM = 'system', // Infrastructure/system failures
  INTEGRATION = 'integration', // External service failures
  SECURITY = 'security', // Authentication/authorization failures
  UNKNOWN = 'unknown', // Unexpected errors
}

enum ErrorSeverity {
  LOW = 'low', // Non-critical, system continues
  MEDIUM = 'medium', // Degraded functionality
  HIGH = 'high', // Critical feature failure
  CRITICAL = 'critical', // System failure, immediate attention
}
```

## Error Types and Patterns

### Custom Error Classes

```typescript
// Base error class with structured information
abstract class BaseError extends Error {
  public readonly code: string
  public readonly category: ErrorCategory
  public readonly severity: ErrorSeverity
  public readonly metadata: Record<string, any>
  public readonly timestamp: Date
  public readonly correlationId: string

  constructor(
    message: string,
    code: string,
    category: ErrorCategory,
    severity: ErrorSeverity = ErrorSeverity.MEDIUM,
    metadata: Record<string, any> = {},
  ) {
    super(message)
    this.name = this.constructor.name
    this.code = code
    this.category = category
    this.severity = severity
    this.metadata = metadata
    this.timestamp = new Date()
    this.correlationId = generateCorrelationId()

    // Maintains proper stack trace
    Error.captureStackTrace(this, this.constructor)
  }
}

// Specific error types
class ValidationError extends BaseError {
  constructor(message: string, field?: string, value?: any) {
    super(message, 'VALIDATION_FAILED', ErrorCategory.VALIDATION, ErrorSeverity.LOW, {
      field,
      value,
    })
  }
}

class BusinessError extends BaseError {
  constructor(message: string, rule: string, context?: any) {
    super(message, 'BUSINESS_RULE_VIOLATION', ErrorCategory.BUSINESS, ErrorSeverity.MEDIUM, {
      rule,
      context,
    })
  }
}

class SystemError extends BaseError {
  constructor(message: string, cause?: Error) {
    super(message, 'SYSTEM_ERROR', ErrorCategory.SYSTEM, ErrorSeverity.HIGH, {
      cause: cause?.message,
      stack: cause?.stack,
    })
  }
}

class IntegrationError extends BaseError {
  constructor(service: string, operation: string, cause?: Error) {
    super(
      `${service} integration failed during ${operation}`,
      'INTEGRATION_FAILED',
      ErrorCategory.INTEGRATION,
      ErrorSeverity.MEDIUM,
      { service, operation, cause: cause?.message },
    )
  }
}
```

### Error Result Pattern

```typescript
// Result type for operation outcomes
type Result<T, E = Error> =
  | {
      success: true
      data: T
    }
  | {
      success: false
      error: E
    }

// Utility functions for Result pattern
const success = <T>(data: T): Result<T> => ({ success: true, data })
const failure = <E>(error: E): Result<never, E> => ({ success: false, error })

// Usage in service methods
class UserService {
  async createUser(
    userData: CreateUserRequest,
  ): Promise<Result<User, ValidationError | BusinessError>> {
    // Validation
    const validationResult = this.validateUserData(userData)
    if (!validationResult.success) {
      return failure(validationResult.error)
    }

    // Business rules
    const existingUser = await this.findUserByEmail(userData.email)
    if (existingUser) {
      return failure(
        new BusinessError('User with this email already exists', 'UNIQUE_EMAIL_CONSTRAINT', {
          email: userData.email,
        }),
      )
    }

    try {
      const user = await this.repository.create(userData)
      return success(user)
    } catch (error) {
      return failure(new SystemError('Failed to create user', error as Error))
    }
  }
}
```

## Exception Handling Patterns

### Try-Catch Best Practices

```typescript
// Good: Specific error handling with context
async function processPayment(payment: PaymentRequest): Promise<PaymentResult> {
  try {
    const validatedPayment = await validatePayment(payment)
    const processedPayment = await paymentGateway.process(validatedPayment)

    await auditLog.record('payment_processed', {
      paymentId: processedPayment.id,
      amount: processedPayment.amount,
    })

    return { success: true, paymentId: processedPayment.id }
  } catch (error) {
    if (error instanceof ValidationError) {
      logger.warn('Payment validation failed', {
        paymentData: payment,
        error: error.message,
      })
      return { success: false, error: 'Invalid payment data' }
    }

    if (error instanceof IntegrationError) {
      logger.error('Payment gateway error', {
        paymentData: payment,
        error: error.message,
        service: error.metadata.service,
      })
      return { success: false, error: 'Payment processing unavailable' }
    }

    // Unexpected errors
    logger.error('Unexpected payment processing error', {
      paymentData: payment,
      error: error.message,
      stack: error.stack,
    })
    return { success: false, error: 'Payment processing failed' }
  }
}

// Good: Resource cleanup with finally
async function processFileUpload(file: File): Promise<string> {
  let tempPath: string | null = null

  try {
    tempPath = await createTempFile(file)
    const processedFile = await processFile(tempPath)
    const uploadUrl = await uploadToStorage(processedFile)

    return uploadUrl
  } catch (error) {
    logger.error('File processing failed', {
      fileName: file.name,
      error: error.message,
    })
    throw new SystemError('File processing failed', error as Error)
  } finally {
    // Always cleanup temporary files
    if (tempPath) {
      await cleanupTempFile(tempPath)
    }
  }
}
```

### Async/Await Error Handling

```typescript
// Good: Explicit error handling for each async operation
async function createOrder(orderData: CreateOrderRequest): Promise<Order> {
  // Validate input
  const validation = await validateOrderData(orderData).catch(error => {
    throw new ValidationError('Invalid order data', 'orderData', orderData)
  })

  // Check inventory
  const inventory = await inventoryService.checkAvailability(orderData.items).catch(error => {
    throw new IntegrationError('inventory', 'checkAvailability', error)
  })

  if (!inventory.available) {
    throw new BusinessError('Insufficient inventory', 'INVENTORY_CONSTRAINT', {
      requestedItems: orderData.items,
      availableItems: inventory.available,
    })
  }

  // Create order
  const order = await orderRepository.create(orderData).catch(error => {
    throw new SystemError('Failed to create order', error)
  })

  return order
}

// Good: Promise.allSettled for multiple operations
async function processMultiplePayments(payments: PaymentRequest[]): Promise<ProcessingReport> {
  const results = await Promise.allSettled(payments.map(payment => processPayment(payment)))

  const successful: string[] = []
  const failed: { payment: PaymentRequest; error: string }[] = []

  results.forEach((result, index) => {
    if (result.status === 'fulfilled' && result.value.success) {
      successful.push(result.value.paymentId)
    } else {
      const error = result.status === 'rejected' ? result.reason.message : result.value.error

      failed.push({ payment: payments[index], error })
    }
  })

  return { successful, failed }
}
```

## API Error Responses

### HTTP Error Response Structure

```typescript
interface ErrorResponse {
  error: {
    code: string
    message: string
    details?: any
    timestamp: string
    correlationId: string
    path: string
  }
}

// Express.js error middleware
function errorHandler(error: Error, req: Request, res: Response, next: NextFunction): void {
  const correlationId = (req.headers['x-correlation-id'] as string) || generateCorrelationId()

  // Log error for debugging
  logger.error('API Error', {
    error: error.message,
    stack: error.stack,
    path: req.path,
    method: req.method,
    correlationId,
    userAgent: req.headers['user-agent'],
  })

  if (error instanceof ValidationError) {
    res.status(400).json({
      error: {
        code: error.code,
        message: 'Request validation failed',
        details: error.metadata,
        timestamp: error.timestamp.toISOString(),
        correlationId,
        path: req.path,
      },
    })
    return
  }

  if (error instanceof BusinessError) {
    res.status(422).json({
      error: {
        code: error.code,
        message: error.message,
        timestamp: error.timestamp.toISOString(),
        correlationId,
        path: req.path,
      },
    })
    return
  }

  if (error instanceof IntegrationError) {
    res.status(503).json({
      error: {
        code: error.code,
        message: 'Service temporarily unavailable',
        timestamp: error.timestamp.toISOString(),
        correlationId,
        path: req.path,
      },
    })
    return
  }

  // Default to 500 for unknown errors
  res.status(500).json({
    error: {
      code: 'INTERNAL_SERVER_ERROR',
      message: 'An unexpected error occurred',
      timestamp: new Date().toISOString(),
      correlationId,
      path: req.path,
    },
  })
}
```

### GraphQL Error Handling

```typescript
import { ApolloError, UserInputError, ForbiddenError } from 'apollo-server-express'

class GraphQLErrorHandler {
  static formatError(error: any): any {
    // Extract original error
    const originalError = error.originalError

    if (originalError instanceof ValidationError) {
      return new UserInputError(originalError.message, {
        code: originalError.code,
        field: originalError.metadata.field,
      })
    }

    if (originalError instanceof BusinessError) {
      return new ApolloError(originalError.message, originalError.code, {
        rule: originalError.metadata.rule,
      })
    }

    if (originalError instanceof SecurityError) {
      return new ForbiddenError(originalError.message)
    }

    // Log unexpected errors
    logger.error('GraphQL Error', {
      error: error.message,
      stack: error.stack,
      path: error.path,
    })

    return new ApolloError('Internal server error', 'INTERNAL_ERROR')
  }
}
```

## Logging and Monitoring

### Structured Logging

```typescript
interface LogContext {
  correlationId: string
  userId?: string
  operation: string
  duration?: number
  metadata?: Record<string, any>
}

class Logger {
  error(message: string, context: LogContext, error?: Error): void {
    const logEntry = {
      level: 'error',
      timestamp: new Date().toISOString(),
      message,
      ...context,
      error: error
        ? {
            name: error.name,
            message: error.message,
            stack: error.stack,
          }
        : undefined,
    }

    console.error(JSON.stringify(logEntry))

    // Send to monitoring service
    this.sendToMonitoring(logEntry)
  }

  private sendToMonitoring(logEntry: any): void {
    // Integration with monitoring services (Sentry, DataDog, etc.)
  }
}
```

### Error Metrics and Alerting

```typescript
class ErrorMetrics {
  private static metrics = new Map<string, number>()

  static recordError(error: BaseError): void {
    const key = `${error.category}.${error.code}`
    const current = this.metrics.get(key) || 0
    this.metrics.set(key, current + 1)

    // Send metrics to monitoring system
    this.sendMetric(`error.${key}`, current + 1, {
      severity: error.severity,
      service: process.env.SERVICE_NAME,
    })

    // Check for alert thresholds
    this.checkAlertThresholds(error)
  }

  private static checkAlertThresholds(error: BaseError): void {
    if (error.severity === ErrorSeverity.CRITICAL) {
      this.sendAlert('Critical error occurred', error)
    }

    const errorRate = this.calculateErrorRate(error.code)
    if (errorRate > 0.1) {
      // 10% error rate threshold
      this.sendAlert('High error rate detected', error)
    }
  }
}
```

## Client-Side Error Handling

### React Error Boundaries

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
    // Log error to monitoring service
    logger.error(
      'React Error Boundary',
      {
        correlationId: generateCorrelationId(),
        operation: 'component_render',
        metadata: {
          componentStack: errorInfo.componentStack,
          errorBoundary: this.constructor.name,
        },
      },
      error,
    )

    this.setState({
      error,
      errorInfo,
    })
  }

  render() {
    if (this.state.hasError) {
      return (
        <ErrorFallback
          error={this.state.error}
          resetError={() => this.setState({ hasError: false })}
        />
      )
    }

    return this.props.children
  }
}
```

### API Error Handling in Frontend

```typescript
class ApiClient {
  async request<T>(url: string, options: RequestInit = {}): Promise<T> {
    try {
      const response = await fetch(url, {
        ...options,
        headers: {
          'Content-Type': 'application/json',
          'X-Correlation-ID': generateCorrelationId(),
          ...options.headers,
        },
      })

      if (!response.ok) {
        await this.handleHttpError(response)
      }

      return await response.json()
    } catch (error) {
      if (error instanceof NetworkError) {
        throw error
      }

      throw new NetworkError('Request failed', error as Error)
    }
  }

  private async handleHttpError(response: Response): Promise<never> {
    const errorData = await response.json().catch(() => ({}))

    switch (response.status) {
      case 400:
        throw new ValidationError(errorData.error?.message || 'Bad request')
      case 401:
        throw new AuthenticationError('Authentication required')
      case 403:
        throw new AuthorizationError('Access denied')
      case 404:
        throw new NotFoundError('Resource not found')
      case 422:
        throw new BusinessError(errorData.error?.message || 'Business rule violation')
      case 503:
        throw new ServiceUnavailableError('Service temporarily unavailable')
      default:
        throw new ServerError(`Server error: ${response.status}`)
    }
  }
}
```

## Testing Error Scenarios

### Unit Testing Error Conditions

```typescript
describe('UserService', () => {
  describe('createUser', () => {
    it('should return validation error for invalid email', async () => {
      const userData = { email: 'invalid-email', name: 'John Doe' }

      const result = await userService.createUser(userData)

      expect(result.success).toBe(false)
      expect(result.error).toBeInstanceOf(ValidationError)
      expect(result.error.code).toBe('VALIDATION_FAILED')
      expect(result.error.metadata.field).toBe('email')
    })

    it('should handle database connection errors', async () => {
      mockRepository.create.mockRejectedValue(new Error('Connection failed'))
      const userData = { email: 'test@example.com', name: 'John Doe' }

      const result = await userService.createUser(userData)

      expect(result.success).toBe(false)
      expect(result.error).toBeInstanceOf(SystemError)
      expect(result.error.category).toBe(ErrorCategory.SYSTEM)
    })
  })
})
```

### Integration Testing Error Responses

```typescript
describe('POST /api/users', () => {
  it('should return 400 for validation errors', async () => {
    const response = await request(app).post('/api/users').send({ email: 'invalid-email' })

    expect(response.status).toBe(400)
    expect(response.body.error.code).toBe('VALIDATION_FAILED')
    expect(response.body.error.correlationId).toBeDefined()
  })

  it('should return 503 when external service is down', async () => {
    mockExternalService.mockRejectedValue(new Error('Service unavailable'))

    const response = await request(app)
      .post('/api/users')
      .send({ email: 'test@example.com', name: 'John Doe' })

    expect(response.status).toBe(503)
    expect(response.body.error.code).toBe('INTEGRATION_FAILED')
  })
})
```

## Error Handling Checklist

### Development Checklist

- [ ] Define custom error types for domain-specific errors
- [ ] Implement structured error responses
- [ ] Add correlation IDs for request tracing
- [ ] Configure proper logging with context
- [ ] Set up error monitoring and alerting
- [ ] Implement graceful degradation
- [ ] Add error boundaries for UI components
- [ ] Test error scenarios thoroughly

### Monitoring Checklist

- [ ] Error rate monitoring
- [ ] Error severity alerting
- [ ] Performance impact tracking
- [ ] User experience metrics
- [ ] Recovery time monitoring
- [ ] Error trend analysis

### Documentation Checklist

- [ ] Error code documentation
- [ ] Recovery procedures
- [ ] Escalation guidelines
- [ ] User-facing error messages
- [ ] API error response examples

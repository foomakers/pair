# Server Patterns

## Overview

Server-side patterns provide structure for building robust, maintainable backend services. This guide covers essential patterns for request handling, middleware composition, error management, and scalable server architecture.

## Server Architecture Philosophy

### Request Lifecycle Management

Understanding and controlling the request lifecycle is fundamental to server design:

**Request Reception**: Incoming request parsing and validation
**Middleware Processing**: Cross-cutting concerns like authentication, logging, rate limiting
**Business Logic Execution**: Core application functionality and data processing
**Response Formation**: Result serialization and response preparation
**Error Handling**: Graceful error processing and user-friendly error responses

### Separation of Concerns

Organize server logic into distinct, focused layers:

**Controllers**: Handle HTTP-specific concerns and request/response mapping
**Services**: Implement business logic and coordinate between different components
**Middleware**: Address cross-cutting concerns like security, logging, and validation
**Data Access**: Manage database interactions and data persistence

## Controller Patterns

### RESTful Controller Design

Structure controllers around REST principles and resource operations:

```typescript
interface UserController {
  getUser(request: GetUserRequest): Promise<UserResponse>
  createUser(request: CreateUserRequest): Promise<UserResponse>
  updateUser(request: UpdateUserRequest): Promise<UserResponse>
  deleteUser(request: DeleteUserRequest): Promise<void>
  listUsers(request: ListUsersRequest): Promise<PaginatedUsersResponse>
}

class UserControllerImpl implements UserController {
  constructor(private userService: UserService, private validator: RequestValidator) {}

  async getUser(request: GetUserRequest): Promise<UserResponse> {
    await this.validator.validateGetUser(request)

    const user = await this.userService.findById(request.params.id)
    if (!user) {
      throw new NotFoundError('User not found')
    }

    return this.mapToResponse(user)
  }

  async createUser(request: CreateUserRequest): Promise<UserResponse> {
    await this.validator.validateCreateUser(request)

    const userData = this.mapToUserData(request.body)
    const user = await this.userService.createUser(userData)

    return this.mapToResponse(user)
  }

  private mapToResponse(user: User): UserResponse {
    return {
      id: user.id,
      email: user.email,
      firstName: user.firstName,
      lastName: user.lastName,
      createdAt: user.createdAt.toISOString(),
    }
  }
}
```

**Benefits**: Clear resource-based operations, consistent API structure, predictable behavior
**Use Cases**: CRUD operations, RESTful APIs, resource management

### Command/Query Separation

Separate read and write operations for better scalability and clarity:

```typescript
// Command handlers for write operations
interface UserCommandHandler {
  createUser(command: CreateUserCommand): Promise<UserCreatedEvent>
  updateUser(command: UpdateUserCommand): Promise<UserUpdatedEvent>
  deleteUser(command: DeleteUserCommand): Promise<UserDeletedEvent>
}

// Query handlers for read operations
interface UserQueryHandler {
  getUserById(query: GetUserByIdQuery): Promise<UserView>
  getUsersByRole(query: GetUsersByRoleQuery): Promise<UserView[]>
  searchUsers(query: SearchUsersQuery): Promise<PaginatedResult<UserView>>
}

class UserController {
  constructor(private commandHandler: UserCommandHandler, private queryHandler: UserQueryHandler) {}

  // Commands modify state
  async createUser(request: Request): Promise<Response> {
    const command = this.mapToCreateCommand(request)
    const event = await this.commandHandler.createUser(command)
    return this.successResponse(201, event)
  }

  // Queries read state
  async getUser(request: Request): Promise<Response> {
    const query = new GetUserByIdQuery(request.params.id)
    const userView = await this.queryHandler.getUserById(query)
    return this.successResponse(200, userView)
  }
}
```

**Benefits**: Optimized read/write operations, clearer intent, better scalability
**Use Cases**: High-traffic applications, complex business logic, event-driven systems

## Middleware Patterns

### Composable Middleware Design

Create reusable middleware components that can be easily composed:

```typescript
interface Middleware {
  (request: Request, response: Response, next: NextFunction): Promise<void> | void
}

// Authentication middleware
const authenticationMiddleware: Middleware = async (req, res, next) => {
  const token = extractToken(req)

  if (!token) {
    return res.status(401).json({ error: 'Authentication required' })
  }

  try {
    const user = await validateToken(token)
    req.user = user
    next()
  } catch (error) {
    return res.status(401).json({ error: 'Invalid token' })
  }
}

// Authorization middleware factory
const requireRole = (role: UserRole): Middleware => {
  return (req, res, next) => {
    if (!req.user?.roles.includes(role)) {
      return res.status(403).json({ error: 'Insufficient permissions' })
    }
    next()
  }
}

// Validation middleware factory
const validateRequest = (schema: ValidationSchema): Middleware => {
  return async (req, res, next) => {
    try {
      await schema.validate(req.body)
      next()
    } catch (error) {
      return res.status(400).json({ error: 'Validation failed', details: error.errors })
    }
  }
}

// Usage - composing middleware
app.post(
  '/api/users',
  authenticationMiddleware,
  requireRole('admin'),
  validateRequest(createUserSchema),
  userController.createUser,
)
```

**Benefits**: Reusable components, clean separation of concerns, easy testing
**Use Cases**: Cross-cutting concerns, request preprocessing, response post-processing

### Error Handling Middleware

Centralize error handling for consistent error responses:

```typescript
interface AppError extends Error {
  statusCode: number
  isOperational: boolean
}

class ValidationError extends Error implements AppError {
  statusCode = 400
  isOperational = true

  constructor(message: string, public field?: string) {
    super(message)
    this.name = 'ValidationError'
  }
}

class NotFoundError extends Error implements AppError {
  statusCode = 404
  isOperational = true

  constructor(resource: string) {
    super(`${resource} not found`)
    this.name = 'NotFoundError'
  }
}

// Global error handling middleware
const errorHandler: Middleware = (error, req, res, next) => {
  // Log error for monitoring
  logger.error('Request error:', {
    error: error.message,
    stack: error.stack,
    request: {
      method: req.method,
      url: req.url,
      user: req.user?.id,
    },
  })

  // Handle different error types
  if (error instanceof ValidationError) {
    return res.status(400).json({
      error: 'Validation Error',
      message: error.message,
      field: error.field,
    })
  }

  if (error instanceof NotFoundError) {
    return res.status(404).json({
      error: 'Not Found',
      message: error.message,
    })
  }

  // Default error response
  const statusCode = error.statusCode || 500
  const message = error.isOperational ? error.message : 'Internal Server Error'

  res.status(statusCode).json({
    error: 'Server Error',
    message,
    ...(process.env.NODE_ENV === 'development' && { stack: error.stack }),
  })
}
```

## Request Processing Patterns

### Input Validation Strategy

Implement comprehensive input validation at the request boundary:

```typescript
interface RequestValidator {
  validateHeaders(headers: any): Promise<ValidationResult>
  validateParams(params: any): Promise<ValidationResult>
  validateQuery(query: any): Promise<ValidationResult>
  validateBody(body: any): Promise<ValidationResult>
}

class SchemaRequestValidator implements RequestValidator {
  constructor(
    private headerSchema?: ValidationSchema,
    private paramSchema?: ValidationSchema,
    private querySchema?: ValidationSchema,
    private bodySchema?: ValidationSchema,
  ) {}

  async validateHeaders(headers: any): Promise<ValidationResult> {
    if (!this.headerSchema) return { isValid: true }
    return this.headerSchema.validate(headers)
  }

  async validateBody(body: any): Promise<ValidationResult> {
    if (!this.bodySchema) return { isValid: true }
    return this.bodySchema.validate(body)
  }

  // Comprehensive request validation
  async validateRequest(request: Request): Promise<ValidationResult> {
    const results = await Promise.all([
      this.validateHeaders(request.headers),
      this.validateParams(request.params),
      this.validateQuery(request.query),
      this.validateBody(request.body),
    ])

    const errors = results.filter(result => !result.isValid).flatMap(result => result.errors)

    return {
      isValid: errors.length === 0,
      errors,
    }
  }
}
```

### Response Formatting

Standardize response formats for consistency:

```typescript
interface ApiResponse<T = any> {
  success: boolean
  data?: T
  error?: {
    code: string
    message: string
    details?: any
  }
  meta?: {
    timestamp: string
    requestId: string
    version: string
  }
}

class ResponseFormatter {
  static success<T>(data: T, meta?: any): ApiResponse<T> {
    return {
      success: true,
      data,
      meta: {
        timestamp: new Date().toISOString(),
        requestId: this.generateRequestId(),
        version: process.env.API_VERSION || '1.0.0',
        ...meta,
      },
    }
  }

  static error(code: string, message: string, details?: any): ApiResponse {
    return {
      success: false,
      error: {
        code,
        message,
        details,
      },
      meta: {
        timestamp: new Date().toISOString(),
        requestId: this.generateRequestId(),
        version: process.env.API_VERSION || '1.0.0',
      },
    }
  }

  static paginated<T>(items: T[], pagination: PaginationInfo): ApiResponse<T[]> {
    return this.success(items, { pagination })
  }

  private static generateRequestId(): string {
    return Math.random().toString(36).substr(2, 9)
  }
}

// Usage in controllers
class UserController {
  async getUsers(req: Request, res: Response): Promise<void> {
    try {
      const users = await this.userService.findAll()
      const response = ResponseFormatter.success(users)
      res.json(response)
    } catch (error) {
      const response = ResponseFormatter.error(
        'USER_FETCH_ERROR',
        'Failed to fetch users',
        error.message,
      )
      res.status(500).json(response)
    }
  }
}
```

## Server Performance Patterns

### Async Processing

Handle long-running operations asynchronously:

```typescript
interface JobQueue {
  enqueue<T>(jobType: string, payload: T): Promise<JobId>
  process<T>(jobType: string, handler: JobHandler<T>): void
}

class EmailNotificationService {
  constructor(private jobQueue: JobQueue) {
    // Register job processors
    this.jobQueue.process('send-welcome-email', this.processSendWelcomeEmail)
    this.jobQueue.process('send-password-reset', this.processSendPasswordReset)
  }

  async scheduleWelcomeEmail(userId: string): Promise<JobId> {
    return this.jobQueue.enqueue('send-welcome-email', { userId })
  }

  private async processSendWelcomeEmail(payload: { userId: string }): Promise<void> {
    const user = await this.userService.findById(payload.userId)
    if (user) {
      await this.emailService.sendWelcomeEmail(user)
    }
  }
}

// Controller returns immediately while processing happens in background
class UserController {
  async createUser(req: Request, res: Response): Promise<void> {
    const userData = req.body
    const user = await this.userService.createUser(userData)

    // Schedule welcome email asynchronously
    await this.emailService.scheduleWelcomeEmail(user.id)

    const response = ResponseFormatter.success(user)
    res.status(201).json(response)
  }
}
```

### Caching Strategies

Implement caching at multiple levels for better performance:

```typescript
interface CacheStrategy {
  get<T>(key: string): Promise<T | null>
  set<T>(key: string, value: T, ttl?: number): Promise<void>
  delete(key: string): Promise<void>
  clear(): Promise<void>
}

class CachedUserService {
  constructor(
    private userService: UserService,
    private cache: CacheStrategy,
    private defaultTTL: number = 300, // 5 minutes
  ) {}

  async findById(id: string): Promise<User | null> {
    const cacheKey = `user:${id}`

    // Try cache first
    const cachedUser = await this.cache.get<User>(cacheKey)
    if (cachedUser) {
      return cachedUser
    }

    // Fetch from service
    const user = await this.userService.findById(id)
    if (user) {
      await this.cache.set(cacheKey, user, this.defaultTTL)
    }

    return user
  }

  async updateUser(id: string, updates: Partial<User>): Promise<User> {
    const user = await this.userService.updateUser(id, updates)

    // Invalidate cache
    await this.cache.delete(`user:${id}`)

    return user
  }
}
```

## Server Security Patterns

### Rate Limiting

Protect against abuse with rate limiting:

```typescript
interface RateLimiter {
  isAllowed(key: string, limit: number, window: number): Promise<boolean>
  getRemainingAttempts(key: string, limit: number, window: number): Promise<number>
}

const rateLimitMiddleware = (
  limiter: RateLimiter,
  limit: number = 100,
  windowMs: number = 15 * 60 * 1000, // 15 minutes
): Middleware => {
  return async (req, res, next) => {
    const key = req.ip || req.connection.remoteAddress

    const isAllowed = await limiter.isAllowed(key, limit, windowMs)
    if (!isAllowed) {
      return res.status(429).json({
        error: 'Rate limit exceeded',
        message: 'Too many requests, please try again later',
      })
    }

    const remaining = await limiter.getRemainingAttempts(key, limit, windowMs)
    res.setHeader('X-RateLimit-Remaining', remaining.toString())

    next()
  }
}
```

### Request Sanitization

Sanitize inputs to prevent security vulnerabilities:

```typescript
class RequestSanitizer {
  static sanitizeString(input: string): string {
    return input
      .trim()
      .replace(/[<>]/g, '') // Remove potential XSS characters
      .substring(0, 1000) // Limit length
  }

  static sanitizeEmail(email: string): string {
    return email.toLowerCase().trim()
  }

  static sanitizeRequestBody(body: any): any {
    if (typeof body === 'string') {
      return this.sanitizeString(body)
    }

    if (Array.isArray(body)) {
      return body.map(item => this.sanitizeRequestBody(item))
    }

    if (typeof body === 'object' && body !== null) {
      const sanitized: any = {}
      for (const [key, value] of Object.entries(body)) {
        const sanitizedKey = this.sanitizeString(key)
        sanitized[sanitizedKey] = this.sanitizeRequestBody(value)
      }
      return sanitized
    }

    return body
  }
}

const sanitizationMiddleware: Middleware = (req, res, next) => {
  if (req.body) {
    req.body = RequestSanitizer.sanitizeRequestBody(req.body)
  }
  next()
}
```

## Best Practices Summary

### Controller Design

- **Single Responsibility**: Each controller should handle one resource type
- **Thin Controllers**: Keep controllers focused on HTTP concerns, delegate business logic to services
- **Consistent Responses**: Use standardized response formats across all endpoints

### Middleware Strategy

- **Composability**: Design middleware to be easily combined and reused
- **Order Matters**: Carefully consider middleware execution order
- **Error Boundaries**: Implement proper error handling in each middleware

### Performance Optimization

- **Async Processing**: Use background jobs for long-running operations
- **Strategic Caching**: Implement caching at appropriate levels
- **Resource Management**: Properly manage database connections and memory usage

### Security Considerations

- **Input Validation**: Validate and sanitize all inputs at the boundary
- **Rate Limiting**: Protect against abuse and DoS attacks
- **Error Information**: Don't expose sensitive information in error messages

Server patterns provide the foundation for building scalable, maintainable backend services that handle requests efficiently while maintaining security and performance standards.

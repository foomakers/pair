# 🌐 API Standards

**Focus**: RESTful API design, OpenAPI specification, and integration patterns

Comprehensive standards for designing consistent, maintainable, and well-documented APIs using REST principles, OpenAPI/Swagger specifications, and modern integration patterns.

## 🎯 API Design Principles

### RESTful Architecture Standards

```typescript
// ✅ Resource-based URL design
interface APIEndpoints {
  // Users resource
  users: {
    list: 'GET /api/v1/users'
    create: 'POST /api/v1/users'
    get: 'GET /api/v1/users/{id}'
    update: 'PUT /api/v1/users/{id}'
    patch: 'PATCH /api/v1/users/{id}'
    delete: 'DELETE /api/v1/users/{id}'
  }

  // Nested resources
  userPosts: {
    list: 'GET /api/v1/users/{userId}/posts'
    create: 'POST /api/v1/users/{userId}/posts'
    get: 'GET /api/v1/users/{userId}/posts/{postId}'
  }

  // Collection operations
  userActions: {
    activate: 'POST /api/v1/users/{id}/activate'
    deactivate: 'POST /api/v1/users/{id}/deactivate'
    resetPassword: 'POST /api/v1/users/{id}/reset-password'
  }
}

// ✅ HTTP Status Codes Standards
enum HTTPStatus {
  // Success
  OK = 200,
  CREATED = 201,
  ACCEPTED = 202,
  NO_CONTENT = 204,

  // Client Errors
  BAD_REQUEST = 400,
  UNAUTHORIZED = 401,
  FORBIDDEN = 403,
  NOT_FOUND = 404,
  METHOD_NOT_ALLOWED = 405,
  CONFLICT = 409,
  UNPROCESSABLE_ENTITY = 422,
  TOO_MANY_REQUESTS = 429,

  // Server Errors
  INTERNAL_SERVER_ERROR = 500,
  NOT_IMPLEMENTED = 501,
  BAD_GATEWAY = 502,
  SERVICE_UNAVAILABLE = 503,
  GATEWAY_TIMEOUT = 504,
}
```

## 🏗️ API Response Standards

### Consistent Response Format

```typescript
// ✅ Standard API response structure
interface APIResponse<T = any> {
  success: boolean
  data?: T
  error?: APIError
  meta?: ResponseMeta
}

interface APIError {
  code: string
  message: string
  details?: ErrorDetail[]
  traceId?: string
}

interface ErrorDetail {
  field?: string
  code: string
  message: string
}

interface ResponseMeta {
  timestamp: string
  requestId: string
  version: string
  pagination?: PaginationMeta
}

interface PaginationMeta {
  page: number
  limit: number
  total: number
  totalPages: number
  hasNext: boolean
  hasPrevious: boolean
}

// ✅ Success response examples
const successResponse: APIResponse<User> = {
  success: true,
  data: {
    id: '123',
    name: 'John Doe',
    email: 'john@example.com',
    createdAt: '2023-01-01T00:00:00Z',
  },
  meta: {
    timestamp: '2023-01-01T00:00:00Z',
    requestId: 'req_123456789',
    version: 'v1',
  },
}

const listResponse: APIResponse<User[]> = {
  success: true,
  data: [
    // ... user objects
  ],
  meta: {
    timestamp: '2023-01-01T00:00:00Z',
    requestId: 'req_123456789',
    version: 'v1',
    pagination: {
      page: 1,
      limit: 20,
      total: 150,
      totalPages: 8,
      hasNext: true,
      hasPrevious: false,
    },
  },
}

// ✅ Error response examples
const errorResponse: APIResponse = {
  success: false,
  error: {
    code: 'VALIDATION_ERROR',
    message: 'The request contains invalid data',
    details: [
      {
        field: 'email',
        code: 'INVALID_FORMAT',
        message: 'Email must be a valid email address',
      },
      {
        field: 'password',
        code: 'TOO_SHORT',
        message: 'Password must be at least 8 characters long',
      },
    ],
    traceId: 'trace_123456789',
  },
  meta: {
    timestamp: '2023-01-01T00:00:00Z',
    requestId: 'req_123456789',
    version: 'v1',
  },
}
```

## 📋 OpenAPI Specification

### Complete API Documentation

```yaml
# ✅ OpenAPI 3.0 specification
openapi: 3.0.3
info:
  title: User Management API
  description: Comprehensive API for user management operations
  version: 1.0.0
  contact:
    name: API Support
    email: api-support@company.com
  license:
    name: MIT
    url: https://opensource.org/licenses/MIT

servers:
  - url: https://api.company.com/v1
    description: Production server
  - url: https://staging-api.company.com/v1
    description: Staging server
  - url: http://localhost:3000/api/v1
    description: Development server

security:
  - bearerAuth: []

paths:
  /users:
    get:
      summary: List users
      description: Retrieve a paginated list of users with optional filtering
      tags:
        - Users
      parameters:
        - name: page
          in: query
          description: Page number (1-based)
          schema:
            type: integer
            minimum: 1
            default: 1
        - name: limit
          in: query
          description: Number of items per page
          schema:
            type: integer
            minimum: 1
            maximum: 100
            default: 20
        - name: search
          in: query
          description: Search term for name or email
          schema:
            type: string
            maxLength: 100
        - name: status
          in: query
          description: Filter by user status
          schema:
            type: string
            enum: [active, inactive, pending]
      responses:
        '200':
          description: Successful response
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/UserListResponse'
        '400':
          $ref: '#/components/responses/BadRequest'
        '401':
          $ref: '#/components/responses/Unauthorized'
        '500':
          $ref: '#/components/responses/InternalServerError'

    post:
      summary: Create user
      description: Create a new user account
      tags:
        - Users
      requestBody:
        required: true
        content:
          application/json:
            schema:
              $ref: '#/components/schemas/CreateUserRequest'
      responses:
        '201':
          description: User created successfully
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/UserResponse'
        '400':
          $ref: '#/components/responses/BadRequest'
        '422':
          $ref: '#/components/responses/ValidationError'

  /users/{userId}:
    parameters:
      - name: userId
        in: path
        required: true
        description: User identifier
        schema:
          type: string
          pattern: '^[a-zA-Z0-9_-]+$'

    get:
      summary: Get user
      description: Retrieve a specific user by ID
      tags:
        - Users
      responses:
        '200':
          description: Successful response
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/UserResponse'
        '404':
          $ref: '#/components/responses/NotFound'

    put:
      summary: Update user
      description: Update all user properties
      tags:
        - Users
      requestBody:
        required: true
        content:
          application/json:
            schema:
              $ref: '#/components/schemas/UpdateUserRequest'
      responses:
        '200':
          description: User updated successfully
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/UserResponse'

    patch:
      summary: Partially update user
      description: Update specific user properties
      tags:
        - Users
      requestBody:
        required: true
        content:
          application/json:
            schema:
              $ref: '#/components/schemas/PatchUserRequest'
      responses:
        '200':
          description: User updated successfully
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/UserResponse'

    delete:
      summary: Delete user
      description: Soft delete a user account
      tags:
        - Users
      responses:
        '204':
          description: User deleted successfully
        '404':
          $ref: '#/components/responses/NotFound'

components:
  securitySchemes:
    bearerAuth:
      type: http
      scheme: bearer
      bearerFormat: JWT

  schemas:
    User:
      type: object
      required:
        - id
        - email
        - name
        - status
        - createdAt
        - updatedAt
      properties:
        id:
          type: string
          description: Unique user identifier
          example: user_123456789
        email:
          type: string
          format: email
          description: User email address
          example: john.doe@example.com
        name:
          type: string
          minLength: 1
          maxLength: 100
          description: User full name
          example: John Doe
        status:
          type: string
          enum: [active, inactive, pending]
          description: User account status
        avatar:
          type: string
          format: uri
          description: User avatar URL
          nullable: true
        preferences:
          $ref: '#/components/schemas/UserPreferences'
        createdAt:
          type: string
          format: date-time
          description: Account creation timestamp
        updatedAt:
          type: string
          format: date-time
          description: Last update timestamp

    UserPreferences:
      type: object
      properties:
        theme:
          type: string
          enum: [light, dark, system]
          default: system
        language:
          type: string
          pattern: '^[a-z]{2}(-[A-Z]{2})?$'
          default: en
        timezone:
          type: string
          description: IANA timezone identifier
          default: UTC

    CreateUserRequest:
      type: object
      required:
        - email
        - name
        - password
      properties:
        email:
          type: string
          format: email
          example: john.doe@example.com
        name:
          type: string
          minLength: 1
          maxLength: 100
          example: John Doe
        password:
          type: string
          minLength: 8
          maxLength: 128
          description: User password (will be hashed)

    UpdateUserRequest:
      type: object
      required:
        - email
        - name
      properties:
        email:
          type: string
          format: email
        name:
          type: string
          minLength: 1
          maxLength: 100
        preferences:
          $ref: '#/components/schemas/UserPreferences'

    PatchUserRequest:
      type: object
      properties:
        email:
          type: string
          format: email
        name:
          type: string
          minLength: 1
          maxLength: 100
        status:
          type: string
          enum: [active, inactive]
        preferences:
          $ref: '#/components/schemas/UserPreferences'

    UserResponse:
      allOf:
        - $ref: '#/components/schemas/APIResponse'
        - type: object
          properties:
            data:
              $ref: '#/components/schemas/User'

    UserListResponse:
      allOf:
        - $ref: '#/components/schemas/APIResponse'
        - type: object
          properties:
            data:
              type: array
              items:
                $ref: '#/components/schemas/User'

    APIResponse:
      type: object
      required:
        - success
        - meta
      properties:
        success:
          type: boolean
          description: Indicates if the request was successful
        data:
          description: Response data (varies by endpoint)
        error:
          $ref: '#/components/schemas/APIError'
        meta:
          $ref: '#/components/schemas/ResponseMeta'

    APIError:
      type: object
      required:
        - code
        - message
      properties:
        code:
          type: string
          description: Error code identifier
          example: VALIDATION_ERROR
        message:
          type: string
          description: Human-readable error message
          example: The request contains invalid data
        details:
          type: array
          items:
            $ref: '#/components/schemas/ErrorDetail'
        traceId:
          type: string
          description: Trace identifier for debugging

    ErrorDetail:
      type: object
      required:
        - code
        - message
      properties:
        field:
          type: string
          description: Field name (for validation errors)
        code:
          type: string
          description: Specific error code
        message:
          type: string
          description: Detailed error message

    ResponseMeta:
      type: object
      required:
        - timestamp
        - requestId
        - version
      properties:
        timestamp:
          type: string
          format: date-time
          description: Response timestamp
        requestId:
          type: string
          description: Unique request identifier
        version:
          type: string
          description: API version
        pagination:
          $ref: '#/components/schemas/PaginationMeta'

    PaginationMeta:
      type: object
      required:
        - page
        - limit
        - total
        - totalPages
        - hasNext
        - hasPrevious
      properties:
        page:
          type: integer
          minimum: 1
          description: Current page number
        limit:
          type: integer
          minimum: 1
          description: Items per page
        total:
          type: integer
          minimum: 0
          description: Total number of items
        totalPages:
          type: integer
          minimum: 0
          description: Total number of pages
        hasNext:
          type: boolean
          description: Whether there is a next page
        hasPrevious:
          type: boolean
          description: Whether there is a previous page

  responses:
    BadRequest:
      description: Bad request
      content:
        application/json:
          schema:
            allOf:
              - $ref: '#/components/schemas/APIResponse'
              - type: object
                properties:
                  success:
                    example: false
                  error:
                    type: object
                    properties:
                      code:
                        example: BAD_REQUEST
                      message:
                        example: The request is malformed or invalid

    Unauthorized:
      description: Unauthorized
      content:
        application/json:
          schema:
            allOf:
              - $ref: '#/components/schemas/APIResponse'
              - type: object
                properties:
                  success:
                    example: false
                  error:
                    type: object
                    properties:
                      code:
                        example: UNAUTHORIZED
                      message:
                        example: Authentication is required

    NotFound:
      description: Resource not found
      content:
        application/json:
          schema:
            allOf:
              - $ref: '#/components/schemas/APIResponse'
              - type: object
                properties:
                  success:
                    example: false
                  error:
                    type: object
                    properties:
                      code:
                        example: NOT_FOUND
                      message:
                        example: The requested resource was not found

    ValidationError:
      description: Validation error
      content:
        application/json:
          schema:
            allOf:
              - $ref: '#/components/schemas/APIResponse'
              - type: object
                properties:
                  success:
                    example: false
                  error:
                    type: object
                    properties:
                      code:
                        example: VALIDATION_ERROR
                      message:
                        example: The request contains invalid data

    InternalServerError:
      description: Internal server error
      content:
        application/json:
          schema:
            allOf:
              - $ref: '#/components/schemas/APIResponse'
              - type: object
                properties:
                  success:
                    example: false
                  error:
                    type: object
                    properties:
                      code:
                        example: INTERNAL_SERVER_ERROR
                      message:
                        example: An unexpected error occurred
```

## 🔑 Authentication & Authorization

```typescript
// ✅ JWT Authentication implementation
interface JWTPayload {
  sub: string // User ID
  email: string
  name: string
  roles: string[]
  permissions: string[]
  iat: number
  exp: number
  aud: string
  iss: string
}

const authMiddleware = (requiredPermissions: string[] = []) => {
  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      const authHeader = req.headers.authorization
      if (!authHeader?.startsWith('Bearer ')) {
        return res.status(401).json({
          success: false,
          error: {
            code: 'MISSING_TOKEN',
            message: 'Authorization token is required',
          },
        })
      }

      const token = authHeader.substring(7)
      const payload = jwt.verify(token, process.env.JWT_SECRET!) as JWTPayload

      // Check permissions
      if (requiredPermissions.length > 0) {
        const hasPermission = requiredPermissions.some(permission =>
          payload.permissions.includes(permission),
        )

        if (!hasPermission) {
          return res.status(403).json({
            success: false,
            error: {
              code: 'INSUFFICIENT_PERMISSIONS',
              message: 'You do not have permission to access this resource',
            },
          })
        }
      }

      req.user = payload
      next()
    } catch (error) {
      return res.status(401).json({
        success: false,
        error: {
          code: 'INVALID_TOKEN',
          message: 'The provided token is invalid or expired',
        },
      })
    }
  }
}
```

## 🔗 Related Concepts

- **[Database Integration](database-integration.md)** - Database layer integration
- **[External Services](external-services.md)** - Third-party service integration
- **[Error Handling](error-handling.md)** - API error handling strategies

## 📏 Implementation Guidelines

1. **Consistency**: Use consistent naming conventions and response formats
2. **Documentation**: Maintain comprehensive OpenAPI specifications
3. **Versioning**: Implement proper API versioning strategies
4. **Security**: Include authentication, authorization, and rate limiting
5. **Error Handling**: Provide clear, actionable error messages
6. **Performance**: Implement caching, pagination, and optimization
7. **Testing**: Include comprehensive API testing strategies
8. **Monitoring**: Implement logging, metrics, and health checks

---

_API Standards ensure consistent, well-documented, and maintainable APIs that provide excellent developer experience and robust integration capabilities._

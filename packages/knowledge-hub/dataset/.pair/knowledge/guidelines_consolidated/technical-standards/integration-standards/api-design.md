# API Design Standards

Comprehensive framework for designing, implementing, and maintaining robust APIs that provide consistent, secure, and scalable interfaces for system integration.

## Purpose

Establish systematic standards for API design that ensure consistency, security, performance, and maintainability across all application programming interfaces.

## API Design Principles

### RESTful API Standards

```typescript
interface RestApiStandards {
  resourceNaming: ResourceNamingConvention
  httpMethods: HttpMethodUsage
  statusCodes: StatusCodeStandards
  versioning: ApiVersioningStrategy
  authentication: AuthenticationMethods
  errorHandling: ErrorResponseFormat
}

enum ResourceNamingConvention {
  PLURAL_NOUNS = 'plural-nouns', // /users, /orders
  KEBAB_CASE = 'kebab-case', // /user-profiles
  NESTED_RESOURCES = 'nested-resources', // /users/123/orders
}

interface HttpMethodUsage {
  GET: 'retrieve resources'
  POST: 'create new resources'
  PUT: 'update entire resources'
  PATCH: 'partial resource updates'
  DELETE: 'remove resources'
  OPTIONS: 'preflight and capability discovery'
}
```

### API Response Standards

```typescript
interface StandardApiResponse<T> {
  success: boolean
  data?: T
  error?: ApiError
  meta?: ResponseMetadata
  links?: HateoasLinks
}

interface ApiError {
  code: string
  message: string
  details?: ErrorDetail[]
  timestamp: string
  traceId: string
}

interface ResponseMetadata {
  timestamp: string
  version: string
  requestId: string
  pagination?: PaginationInfo
  totalCount?: number
}

// Example implementation
class ApiResponseBuilder<T> {
  static success<T>(data: T, meta?: ResponseMetadata): StandardApiResponse<T> {
    return {
      success: true,
      data,
      meta: {
        timestamp: new Date().toISOString(),
        version: process.env.API_VERSION || '1.0.0',
        requestId: generateRequestId(),
        ...meta,
      },
    }
  }

  static error(error: ApiError): StandardApiResponse<never> {
    return {
      success: false,
      error: {
        ...error,
        timestamp: new Date().toISOString(),
        traceId: generateTraceId(),
      },
    }
  }
}
```

## API Documentation Standards

### OpenAPI Specification Template

```yaml
# openapi-template.yml
openapi: 3.0.3
info:
  title: '{Service Name} API'
  version: '1.0.0'
  description: |
    Comprehensive API for {service description}

    ## Authentication
    This API uses JWT Bearer tokens for authentication.

    ## Rate Limiting
    Requests are limited to 1000 per hour per API key.

    ## Error Handling
    All errors follow RFC 7807 Problem Details format.

  contact:
    name: API Support
    email: api-support@company.com
    url: https://docs.company.com/api
  license:
    name: MIT
    url: https://opensource.org/licenses/MIT

servers:
  - url: https://api.company.com/v1
    description: Production server
  - url: https://staging-api.company.com/v1
    description: Staging server

security:
  - BearerAuth: []

components:
  securitySchemes:
    BearerAuth:
      type: http
      scheme: bearer
      bearerFormat: JWT

  schemas:
    StandardResponse:
      type: object
      properties:
        success:
          type: boolean
          description: Indicates if the request was successful
        data:
          type: object
          description: Response data payload
        error:
          $ref: '#/components/schemas/ApiError'
        meta:
          $ref: '#/components/schemas/ResponseMetadata'

    ApiError:
      type: object
      properties:
        code:
          type: string
          description: Machine-readable error code
        message:
          type: string
          description: Human-readable error message
        details:
          type: array
          items:
            $ref: '#/components/schemas/ErrorDetail'
        timestamp:
          type: string
          format: date-time
        traceId:
          type: string
          description: Unique identifier for tracing

    ResponseMetadata:
      type: object
      properties:
        timestamp:
          type: string
          format: date-time
        version:
          type: string
        requestId:
          type: string
        pagination:
          $ref: '#/components/schemas/PaginationInfo'
```

### API Documentation Generation

```typescript
// scripts/generate-api-docs.ts
import swaggerJsdoc from 'swagger-jsdoc'
import { writeFile } from 'fs/promises'

interface ApiDocumentationConfig {
  title: string
  version: string
  description: string
  servers: ServerConfig[]
  paths: string[]
}

class ApiDocumentationGenerator {
  async generateDocumentation(config: ApiDocumentationConfig): Promise<void> {
    const options = {
      definition: {
        openapi: '3.0.3',
        info: {
          title: config.title,
          version: config.version,
          description: config.description,
        },
        servers: config.servers,
      },
      apis: config.paths,
    }

    const specs = swaggerJsdoc(options)

    // Generate OpenAPI JSON
    await writeFile('./docs/api/openapi.json', JSON.stringify(specs, null, 2))

    // Generate HTML documentation
    await this.generateHtmlDocs(specs)

    // Generate Postman collection
    await this.generatePostmanCollection(specs)
  }

  private async generateHtmlDocs(specs: any): Promise<void> {
    const html = `
<!DOCTYPE html>
<html>
<head>
  <title>API Documentation</title>
  <link rel="stylesheet" type="text/css" href="https://unpkg.com/swagger-ui-dist@3.25.0/swagger-ui.css" />
</head>
<body>
  <div id="swagger-ui"></div>
  <script src="https://unpkg.com/swagger-ui-dist@3.25.0/swagger-ui-bundle.js"></script>
  <script>
    SwaggerUIBundle({
      url: './openapi.json',
      dom_id: '#swagger-ui',
      presets: [
        SwaggerUIBundle.presets.apis,
        SwaggerUIBundle.presets.standalone
      ]
    });
  </script>
</body>
</html>`

    await writeFile('./docs/api/index.html', html)
  }
}
```

## API Security Standards

### Authentication and Authorization

```typescript
interface AuthenticationConfig {
  method: AuthMethod
  tokenExpiry: number
  refreshTokenExpiry: number
  multiFactorAuth: boolean
  rateLimiting: RateLimitConfig
}

enum AuthMethod {
  JWT = 'jwt',
  OAUTH2 = 'oauth2',
  API_KEY = 'api-key',
  BASIC_AUTH = 'basic-auth',
}

class ApiSecurityMiddleware {
  static authenticate(config: AuthenticationConfig) {
    return async (req: Request, res: Response, next: NextFunction) => {
      try {
        const token = this.extractToken(req)

        if (!token) {
          return res.status(401).json({
            success: false,
            error: {
              code: 'MISSING_TOKEN',
              message: 'Authentication token is required',
              timestamp: new Date().toISOString(),
            },
          })
        }

        const payload = await this.verifyToken(token, config)
        req.user = payload

        // Check rate limiting
        await this.checkRateLimit(req, config.rateLimiting)

        next()
      } catch (error) {
        return res.status(401).json({
          success: false,
          error: {
            code: 'AUTHENTICATION_FAILED',
            message: 'Invalid or expired token',
            timestamp: new Date().toISOString(),
          },
        })
      }
    }
  }

  static authorize(permissions: string[]) {
    return (req: Request, res: Response, next: NextFunction) => {
      const userPermissions = req.user?.permissions || []

      const hasPermission = permissions.some(permission => userPermissions.includes(permission))

      if (!hasPermission) {
        return res.status(403).json({
          success: false,
          error: {
            code: 'INSUFFICIENT_PERMISSIONS',
            message: 'You do not have permission to access this resource',
            timestamp: new Date().toISOString(),
          },
        })
      }

      next()
    }
  }
}
```

### Input Validation and Sanitization

```typescript
import Joi from 'joi'
import DOMPurify from 'isomorphic-dompurify'

interface ValidationSchema {
  body?: Joi.ObjectSchema
  query?: Joi.ObjectSchema
  params?: Joi.ObjectSchema
  headers?: Joi.ObjectSchema
}

class ApiValidationMiddleware {
  static validate(schema: ValidationSchema) {
    return (req: Request, res: Response, next: NextFunction) => {
      const validationResults = []

      // Validate request body
      if (schema.body) {
        const { error, value } = schema.body.validate(req.body)
        if (error) {
          validationResults.push({
            field: 'body',
            errors: error.details.map(detail => ({
              path: detail.path.join('.'),
              message: detail.message,
              value: detail.context?.value,
            })),
          })
        } else {
          req.body = this.sanitizeData(value)
        }
      }

      // Validate query parameters
      if (schema.query) {
        const { error, value } = schema.query.validate(req.query)
        if (error) {
          validationResults.push({
            field: 'query',
            errors: error.details.map(detail => ({
              path: detail.path.join('.'),
              message: detail.message,
            })),
          })
        } else {
          req.query = value
        }
      }

      if (validationResults.length > 0) {
        return res.status(400).json({
          success: false,
          error: {
            code: 'VALIDATION_ERROR',
            message: 'Request validation failed',
            details: validationResults,
            timestamp: new Date().toISOString(),
          },
        })
      }

      next()
    }
  }

  private static sanitizeData(data: any): any {
    if (typeof data === 'string') {
      return DOMPurify.sanitize(data)
    }

    if (Array.isArray(data)) {
      return data.map(item => this.sanitizeData(item))
    }

    if (data && typeof data === 'object') {
      const sanitized: any = {}
      for (const [key, value] of Object.entries(data)) {
        sanitized[key] = this.sanitizeData(value)
      }
      return sanitized
    }

    return data
  }
}

// Example validation schemas
const userValidationSchemas = {
  createUser: {
    body: Joi.object({
      name: Joi.string().min(2).max(100).required(),
      email: Joi.string().email().required(),
      password: Joi.string()
        .min(8)
        .pattern(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/)
        .required(),
      role: Joi.string().valid('user', 'admin').default('user'),
    }),
  },

  updateUser: {
    params: Joi.object({
      id: Joi.string().uuid().required(),
    }),
    body: Joi.object({
      name: Joi.string().min(2).max(100),
      email: Joi.string().email(),
      role: Joi.string().valid('user', 'admin'),
    }).min(1),
  },
}
```

## API Performance Standards

### Response Time and Caching

```typescript
interface PerformanceConfig {
  responseTimeTargets: ResponseTimeTargets
  cachingStrategy: CachingStrategy
  compressionConfig: CompressionConfig
  rateLimiting: RateLimitConfig
}

interface ResponseTimeTargets {
  p50: number // 50th percentile target (ms)
  p95: number // 95th percentile target (ms)
  p99: number // 99th percentile target (ms)
  timeout: number // Request timeout (ms)
}

class ApiPerformanceMiddleware {
  static responseTime() {
    return (req: Request, res: Response, next: NextFunction) => {
      const startTime = Date.now()

      res.on('finish', () => {
        const responseTime = Date.now() - startTime

        // Log performance metrics
        this.logPerformanceMetric({
          path: req.path,
          method: req.method,
          responseTime,
          statusCode: res.statusCode,
          timestamp: new Date().toISOString(),
        })

        // Set response time header
        res.set('X-Response-Time', `${responseTime}ms`)
      })

      next()
    }
  }

  static caching(config: CachingConfig) {
    return (req: Request, res: Response, next: NextFunction) => {
      // Check if response should be cached
      if (this.shouldCache(req, config)) {
        const cacheKey = this.generateCacheKey(req)

        // Try to get from cache
        const cachedResponse = this.getFromCache(cacheKey)
        if (cachedResponse) {
          res.set('X-Cache', 'HIT')
          return res.json(cachedResponse)
        }

        // Intercept response to cache it
        const originalJson = res.json
        res.json = function (data) {
          if (res.statusCode === 200) {
            ApiPerformanceMiddleware.saveToCache(cacheKey, data, config.ttl)
          }
          res.set('X-Cache', 'MISS')
          return originalJson.call(this, data)
        }
      }

      next()
    }
  }

  static compression() {
    return (req: Request, res: Response, next: NextFunction) => {
      // Enable gzip compression for responses > 1KB
      if (req.headers['accept-encoding']?.includes('gzip')) {
        res.set('Content-Encoding', 'gzip')
      }

      next()
    }
  }
}
```

### Pagination and Filtering Standards

```typescript
interface PaginationConfig {
  defaultPageSize: number
  maxPageSize: number
  pageNumberParam: string
  pageSizeParam: string
}

interface FilterConfig {
  allowedFields: string[]
  operatorMapping: Map<string, FilterOperator>
  maxFilters: number
}

class ApiPaginationMiddleware {
  static paginate(config: PaginationConfig) {
    return (req: Request, res: Response, next: NextFunction) => {
      const page = Math.max(1, parseInt(req.query[config.pageNumberParam] as string) || 1)
      const limit = Math.min(
        config.maxPageSize,
        parseInt(req.query[config.pageSizeParam] as string) || config.defaultPageSize,
      )

      req.pagination = {
        page,
        limit,
        offset: (page - 1) * limit,
      }

      // Enhance response with pagination metadata
      const originalJson = res.json
      res.json = function (data) {
        if (data.success && Array.isArray(data.data)) {
          const totalCount = data.meta?.totalCount || data.data.length
          const totalPages = Math.ceil(totalCount / limit)

          data.meta = {
            ...data.meta,
            pagination: {
              currentPage: page,
              pageSize: limit,
              totalPages,
              totalCount,
              hasNextPage: page < totalPages,
              hasPreviousPage: page > 1,
            },
          }

          // Add pagination links
          data.links = {
            self: req.originalUrl,
            first: this.buildPaginationUrl(req, 1, limit),
            last: this.buildPaginationUrl(req, totalPages, limit),
            ...(page > 1 && { prev: this.buildPaginationUrl(req, page - 1, limit) }),
            ...(page < totalPages && { next: this.buildPaginationUrl(req, page + 1, limit) }),
          }
        }

        return originalJson.call(this, data)
      }

      next()
    }
  }

  static filter(config: FilterConfig) {
    return (req: Request, res: Response, next: NextFunction) => {
      const filters = this.parseFilters(req.query, config)

      if (filters.length > config.maxFilters) {
        return res.status(400).json({
          success: false,
          error: {
            code: 'TOO_MANY_FILTERS',
            message: `Maximum ${config.maxFilters} filters allowed`,
            timestamp: new Date().toISOString(),
          },
        })
      }

      req.filters = filters
      next()
    }
  }

  private static parseFilters(query: any, config: FilterConfig): Filter[] {
    const filters: Filter[] = []

    for (const [key, value] of Object.entries(query)) {
      if (key.startsWith('filter.')) {
        const fieldPath = key.substring(7) // Remove 'filter.' prefix
        const [field, operator = 'eq'] = fieldPath.split('.')

        if (config.allowedFields.includes(field)) {
          filters.push({
            field,
            operator: config.operatorMapping.get(operator) || FilterOperator.EQUALS,
            value,
          })
        }
      }
    }

    return filters
  }
}
```

## API Versioning Strategy

### Version Management Implementation

```typescript
interface ApiVersionConfig {
  strategy: VersioningStrategy
  supportedVersions: string[]
  deprecationPolicy: DeprecationPolicy
  defaultVersion: string
}

enum VersioningStrategy {
  URL_PATH = 'url-path', // /v1/users, /v2/users
  HEADER = 'header', // X-API-Version: 1.0
  QUERY_PARAM = 'query-param', // ?version=1.0
  CONTENT_TYPE = 'content-type', // application/vnd.api+json;version=1.0
}

class ApiVersioningMiddleware {
  static version(config: ApiVersionConfig) {
    return (req: Request, res: Response, next: NextFunction) => {
      let requestedVersion: string

      switch (config.strategy) {
        case VersioningStrategy.URL_PATH:
          requestedVersion = this.extractVersionFromPath(req.path)
          break
        case VersioningStrategy.HEADER:
          requestedVersion = req.headers['x-api-version'] as string
          break
        case VersioningStrategy.QUERY_PARAM:
          requestedVersion = req.query.version as string
          break
        case VersioningStrategy.CONTENT_TYPE:
          requestedVersion = this.extractVersionFromContentType(req.headers['content-type'])
          break
        default:
          requestedVersion = config.defaultVersion
      }

      // Validate version
      if (!config.supportedVersions.includes(requestedVersion)) {
        return res.status(400).json({
          success: false,
          error: {
            code: 'UNSUPPORTED_VERSION',
            message: `API version ${requestedVersion} is not supported`,
            details: {
              supportedVersions: config.supportedVersions,
              requestedVersion,
            },
            timestamp: new Date().toISOString(),
          },
        })
      }

      // Check for deprecated version
      const deprecatedVersion = config.deprecationPolicy.deprecatedVersions.find(
        dv => dv.version === requestedVersion,
      )

      if (deprecatedVersion) {
        res.set('X-API-Deprecated', 'true')
        res.set('X-API-Sunset', deprecatedVersion.sunsetDate)
        res.set('Warning', `299 - "API version ${requestedVersion} is deprecated"`)
      }

      req.apiVersion = requestedVersion
      res.set('X-API-Version', requestedVersion)

      next()
    }
  }
}

// Version-specific route handling
class VersionedApiRouter {
  private routes: Map<string, Map<string, RouteHandler>> = new Map()

  registerRoute(version: string, path: string, handler: RouteHandler): void {
    if (!this.routes.has(version)) {
      this.routes.set(version, new Map())
    }

    this.routes.get(version)!.set(path, handler)
  }

  getHandler(version: string, path: string): RouteHandler | null {
    const versionRoutes = this.routes.get(version)
    return versionRoutes?.get(path) || null
  }

  // Fallback to previous version if route not found
  getHandlerWithFallback(version: string, path: string): RouteHandler | null {
    let handler = this.getHandler(version, path)

    if (!handler) {
      // Try previous versions in descending order
      const versions = Array.from(this.routes.keys()).sort().reverse()
      const currentIndex = versions.indexOf(version)

      for (let i = currentIndex + 1; i < versions.length; i++) {
        handler = this.getHandler(versions[i], path)
        if (handler) break
      }
    }

    return handler
  }
}
```

This comprehensive API design framework ensures consistent, secure, and maintainable APIs that provide excellent developer experience while maintaining high performance and reliability standards.

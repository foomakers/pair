# Fastify Patterns

## Overview

Fastify is a fast and low overhead web framework for Node.js with excellent TypeScript support. This guide covers plugin architecture, route organization, error handling, validation patterns, and performance optimization strategies.

## Plugin Architecture

### 1. Plugin Structure and Encapsulation

````typescript
# Fastify Patterns

## Overview

Fastify is a fast and low overhead web framework for Node.js with excellent TypeScript support. This guide covers plugin architecture, route organization, error handling, validation patterns, and performance optimization strategies.

## Plugin Architecture Philosophy

### Encapsulation and Modularity

Fastify's plugin system promotes modularity by encapsulating functionality into isolated, reusable components. Each plugin operates within its own context, preventing namespace pollution and enabling controlled sharing of resources.

**Context Isolation**: Plugins create their own scope, ensuring that decorators, hooks, and configurations don't accidentally interfere with other parts of the application.

**Dependency Management**: The plugin system automatically handles loading order and dependencies, ensuring that required services are available when needed.

**Hot-Swappable Features**: Well-designed plugins can be easily added, removed, or replaced without affecting the core application structure.

### Configuration Strategy

A centralized configuration approach eliminates scattered environment variable handling throughout the codebase:

```typescript

// types/fastify.ts - Type definitions for configuration
export interface AppConfig {
  database: {
    url: string;
    pool: { min: number; max: number; }
  };
  auth: {
    jwtSecret: string;
    tokenExpiry: string;
  };
}

// plugins/config.ts - Single source of configuration
const configPlugin: FastifyPluginAsync = async (fastify) => {
  const config: AppConfig = {
    database: {
      url: process.env.DATABASE_URL || 'postgresql://localhost/mydb',
      pool: {
| min: parseInt(process.env.DB_POOL_MIN |  | '2'), |
| max: parseInt(process.env.DB_POOL_MAX |  | '10') |
      }
    }
    // ... other config
  };

  fastify.decorate('config', config);
};

````

**Type Safety**: Configuration interfaces ensure compile-time validation of settings
**Environment Flexibility**: Default values provide development convenience while allowing production overrides
**Centralized Access**: All configuration lives in one place, making it easy to audit and modify

### Feature-Based Organization

Organize plugins by business domain rather than technical layers. This approach scales better as applications grow and makes code easier to navigate.

**Domain Cohesion**: Related functionality (routes, services, validation) stays together
**Team Ownership**: Different teams can own different feature plugins without conflicts
**Independent Testing**: Each feature plugin can be tested in isolation

Example structure:

```text

plugins/
  users/
    users.plugin.ts    // Main plugin registration
    users.service.ts   // Business logic
    users.routes.ts    // HTTP endpoints
    users.schemas.ts   // Validation schemas
  orders/
    orders.plugin.ts
    orders.service.ts
    orders.routes.ts

```text

## Request Lifecycle Management

### Validation and Schema Design

Fastify's schema-first approach provides both validation and documentation generation:

```typescript

// Shared schema definitions
const UserResponse = Type.Object({
  id: Type.String({ format: 'uuid' }),
  email: Type.String({ format: 'email' }),
  firstName: Type.String({ minLength: 1, maxLength: 50 }),
})

const CreateUserRequest = Type.Object({
  email: Type.String({ format: 'email' }),
  password: Type.String({ minLength: 8 }),
})

```

**Automatic Validation**: Invalid requests are rejected before reaching your handlers
**API Documentation**: Schemas automatically generate OpenAPI/Swagger documentation
**Type Generation**: TypeScript types can be derived from schemas for end-to-end type safety

### Error Handling Strategy

Implement consistent error handling that provides useful information while maintaining security:

**Centralized Error Processing**: A single error handler manages all error responses
**User-Friendly Messages**: Transform technical errors into actionable user feedback
**Security Considerations**: Avoid exposing sensitive system information in error messages
**Logging Integration**: Capture detailed error context for debugging while sending clean responses to clients

```typescript

// Custom error classes for different scenarios
export class ValidationError extends Error {
  statusCode = 400
  code = 'VALIDATION_ERROR'
}

export class NotFoundError extends Error {
  statusCode = 404
  code = 'NOT_FOUND'
}

```

## Performance Optimization Strategies

### Caching Patterns

Implement intelligent caching to reduce database load and improve response times:

**Layer-Based Caching**: Cache at different levels (database queries, computed results, full responses)
**TTL Strategy**: Use appropriate time-to-live values based on data volatility
**Cache Invalidation**: Implement strategies to invalidate stale data when underlying resources change

### Rate Limiting

Protect your application from abuse while ensuring fair resource allocation:

**User-Based Limits**: Different limits for authenticated vs anonymous users
**Endpoint-Specific Rates**: Sensitive operations (login, password reset) need stricter limits
**Distributed Rate Limiting**: Use Redis for rate limiting across multiple server instances

### Performance Monitoring

Track key metrics to identify bottlenecks and optimization opportunities:

**Request Metrics**: Response times, throughput, error rates
**Resource Usage**: Memory consumption, CPU utilization, database connection pool status
**Business Metrics**: Feature usage, user behavior patterns

## Testing Strategies

### Plugin Testing

Test plugins in isolation to ensure they work correctly without dependencies:

**Mock Dependencies**: Use test doubles for external services (databases, APIs)
**Behavior Verification**: Focus on testing the plugin's public interface rather than implementation details
**Integration Points**: Verify that plugins correctly integrate with Fastify's lifecycle

### Load Testing

Understand your application's performance characteristics under stress:

**Realistic Scenarios**: Test with traffic patterns that mirror production usage
**Bottleneck Identification**: Find which components become limiting factors under load
**Scalability Planning**: Determine when and how to scale different parts of your system

## Best Practices Summary

### Architecture Principles

- **Single Responsibility**: Each plugin should have one clear purpose
- **Loose Coupling**: Minimize dependencies between plugins
- **High Cohesion**: Keep related functionality together within plugins

### Development Workflow

- **Schema-First Design**: Define schemas before implementing handlers
- **Type Safety**: Leverage TypeScript throughout the request/response cycle
- **Error Handling**: Implement comprehensive error handling with appropriate user feedback

### Operations and Monitoring

- **Health Checks**: Provide endpoints for monitoring system health
- **Graceful Shutdown**: Handle application lifecycle events properly
- **Observability**: Include logging, metrics, and tracing for production debugging

### Security Considerations

- **Input Validation**: Validate all incoming data using schemas
- **Authentication**: Implement proper authentication and authorization
- **Rate Limiting**: Protect against abuse and ensure fair resource usage

Fastify's plugin system enables building scalable, maintainable applications by promoting good separation of concerns and providing powerful performance optimization tools.

// plugins/config.ts - Configuration plugin
const configPlugin: FastifyPluginAsync = async (fastify) => {
const config: AppConfig = {
database: {
url: process.env.DATABASE_URL || 'postgresql://localhost/mydb',
pool: {
min: parseInt(process.env.DB_POOL_MIN || '2'),
max: parseInt(process.env.DB_POOL_MAX || '10')
}
},
auth: {
jwtSecret: process.env.JWT_SECRET || 'your-secret-key',
tokenExpiry: process.env.JWT_EXPIRY || '24h'
},
redis: {
url: process.env.REDIS_URL || 'redis://localhost:6379'
}
};

fastify.decorate('config', config);
};

export default configPlugin;

// plugins/database.ts - Database plugin
import { Pool } from 'pg';

const databasePlugin: FastifyPluginAsync = async (fastify) => {
const pool = new Pool({
connectionString: fastify.config.database.url,
min: fastify.config.database.pool.min,
max: fastify.config.database.pool.max
});

// Test connection
try {
await pool.query('SELECT 1');
fastify.log.info('Database connected successfully');
} catch (error) {
fastify.log.error('Database connection failed:', error);
throw error;
}

fastify.decorate('db', pool);

// Graceful shutdown
fastify.addHook('onClose', async () => {
await pool.end();
fastify.log.info('Database connection closed');
});
};

export default databasePlugin;

// plugins/auth.ts - Authentication plugin
import jwt from '@fastify/jwt';

const authPlugin: FastifyPluginAsync = async (fastify) => {
await fastify.register(jwt, {
secret: fastify.config.auth.jwtSecret
});

fastify.decorate('authenticate', async (request: FastifyRequest, reply: FastifyReply) => {
try {
await request.jwtVerify();
} catch (err) {
reply.send(err);
}
});

// Auth hook
fastify.addHook('preHandler', async (request, reply) => {
const publicRoutes = ['/login', '/register', '/health'];
const isPublicRoute = publicRoutes.some(route =>
request.url.startsWith(route)
);

    if (!isPublicRoute) {
      await fastify.authenticate(request, reply);
    }

});
};

export default authPlugin;

````text

### 2. Feature-Based Plugin Organization

```typescript
// plugins/users/users.plugin.ts
import { FastifyPluginAsync } from 'fastify';
import { userRoutes } from './users.routes';
import { userService } from './users.service';

const usersPlugin: FastifyPluginAsync = async (fastify) => {
  // Register service
  fastify.decorate('userService', userService(fastify));

  // Register routes
  await fastify.register(userRoutes, { prefix: '/api/users' });
};

export default usersPlugin;

// plugins/users/users.service.ts
import { FastifyInstance } from 'fastify';

export interface User {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface CreateUserRequest {
  email: string;
  firstName: string;
  lastName: string;
  password: string;
}

export interface UpdateUserRequest {
  firstName?: string;
  lastName?: string;
}

export function userService(fastify: FastifyInstance) {
  const { db } = fastify;

  return {
    async findById(id: string): Promise<User | null> {
      const result = await db.query(
        'SELECT id, email, first_name, last_name, created_at, updated_at FROM users WHERE id = $1',
        [id]
      );

      if (result.rows.length === 0) return null;

      const row = result.rows[0];
      return {
        id: row.id,
        email: row.email,
        firstName: row.first_name,
        lastName: row.last_name,
        createdAt: row.created_at,
        updatedAt: row.updated_at
      };
    },

    async findByEmail(email: string): Promise<User | null> {
      const result = await db.query(
        'SELECT id, email, first_name, last_name, created_at, updated_at FROM users WHERE email = $1',
        [email]
      );

      if (result.rows.length === 0) return null;

      const row = result.rows[0];
      return {
        id: row.id,
        email: row.email,
        firstName: row.first_name,
        lastName: row.last_name,
        createdAt: row.created_at,
        updatedAt: row.updated_at
      };
    },

    async create(userData: CreateUserRequest): Promise<User> {
      const hashedPassword = await fastify.bcrypt.hash(userData.password);

      const result = await db.query(
        `INSERT INTO users (email, first_name, last_name, password_hash, created_at, updated_at)
         VALUES ($1, $2, $3, $4, NOW(), NOW())
         RETURNING id, email, first_name, last_name, created_at, updated_at`,
        [userData.email, userData.firstName, userData.lastName, hashedPassword]
      );

      const row = result.rows[0];
      return {
        id: row.id,
        email: row.email,
        firstName: row.first_name,
        lastName: row.last_name,
        createdAt: row.created_at,
        updatedAt: row.updated_at
      };
    },

    async update(id: string, updates: UpdateUserRequest): Promise<User | null> {
      const setParts: string[] = [];
      const values: any[] = [];
      let paramIndex = 1;

      if (updates.firstName !== undefined) {
        setParts.push(`first_name = $${paramIndex++}`);
        values.push(updates.firstName);
      }

      if (updates.lastName !== undefined) {
        setParts.push(`last_name = $${paramIndex++}`);
        values.push(updates.lastName);
      }

      if (setParts.length === 0) return this.findById(id);

      setParts.push(`updated_at = NOW()`);
      values.push(id);

      const result = await db.query(
        `UPDATE users SET ${setParts.join(', ')} WHERE id = $${paramIndex}
         RETURNING id, email, first_name, last_name, created_at, updated_at`,
        values
      );

      if (result.rows.length === 0) return null;

      const row = result.rows[0];
      return {
        id: row.id,
        email: row.email,
        firstName: row.first_name,
        lastName: row.last_name,
        createdAt: row.created_at,
        updatedAt: row.updated_at
      };
    },

    async delete(id: string): Promise<boolean> {
      const result = await db.query('DELETE FROM users WHERE id = $1', [id]);
      return result.rowCount > 0;
    }
  };
}
````

### 3. Route Organization and Validation

```typescript
// plugins/users/users.routes.ts
import { FastifyPluginAsync } from 'fastify'
import { Type, Static } from '@sinclair/typebox'

// Schema definitions
const UserResponse = Type.Object({
  id: Type.String({ format: 'uuid' }),
  email: Type.String({ format: 'email' }),
  firstName: Type.String({ minLength: 1, maxLength: 50 }),
  lastName: Type.String({ minLength: 1, maxLength: 50 }),
  createdAt: Type.String({ format: 'date-time' }),
  updatedAt: Type.String({ format: 'date-time' }),
})

const CreateUserRequest = Type.Object({
  email: Type.String({ format: 'email' }),
  firstName: Type.String({ minLength: 1, maxLength: 50 }),
  lastName: Type.String({ minLength: 1, maxLength: 50 }),
  password: Type.String({ minLength: 8 }),
})

const UpdateUserRequest = Type.Object({
  firstName: Type.Optional(Type.String({ minLength: 1, maxLength: 50 })),
  lastName: Type.Optional(Type.String({ minLength: 1, maxLength: 50 })),
})

const GetUserParams = Type.Object({
  id: Type.String({ format: 'uuid' }),
})

const ErrorResponse = Type.Object({
  error: Type.String(),
  message: Type.String(),
  statusCode: Type.Number(),
})

// Route handlers
export const userRoutes: FastifyPluginAsync = async fastify => {
  // Get user by ID
  fastify.get<{
    Params: Static<typeof GetUserParams>
    Reply: Static<typeof UserResponse> | Static<typeof ErrorResponse>
  }>(
    '/:id',
    {
      schema: {
        description: 'Get user by ID',
        tags: ['users'],
        params: GetUserParams,
        response: {
          200: UserResponse,
          404: ErrorResponse,
          500: ErrorResponse,
        },
      },
      preHandler: fastify.authenticate,
    },
    async (request, reply) => {
      try {
        const user = await fastify.userService.findById(request.params.id)

        if (!user) {
          return reply.code(404).send({
            error: 'Not Found',
            message: 'User not found',
            statusCode: 404,
          })
        }

        return reply.send(user)
      } catch (error) {
        fastify.log.error('Error fetching user:', error)
        return reply.code(500).send({
          error: 'Internal Server Error',
          message: 'Failed to fetch user',
          statusCode: 500,
        })
      }
    },
  )

  // Create user
  fastify.post<{
    Body: Static<typeof CreateUserRequest>
    Reply: Static<typeof UserResponse> | Static<typeof ErrorResponse>
  }>(
    '/',
    {
      schema: {
        description: 'Create new user',
        tags: ['users'],
        body: CreateUserRequest,
        response: {
          201: UserResponse,
          400: ErrorResponse,
          409: ErrorResponse,
          500: ErrorResponse,
        },
      },
    },
    async (request, reply) => {
      try {
        // Check if user already exists
        const existingUser = await fastify.userService.findByEmail(request.body.email)

        if (existingUser) {
          return reply.code(409).send({
            error: 'Conflict',
            message: 'User with this email already exists',
            statusCode: 409,
          })
        }

        const user = await fastify.userService.create(request.body)

        return reply.code(201).send(user)
      } catch (error) {
        fastify.log.error('Error creating user:', error)
        return reply.code(500).send({
          error: 'Internal Server Error',
          message: 'Failed to create user',
          statusCode: 500,
        })
      }
    },
  )

  // Update user
  fastify.patch<{
    Params: Static<typeof GetUserParams>
    Body: Static<typeof UpdateUserRequest>
    Reply: Static<typeof UserResponse> | Static<typeof ErrorResponse>
  }>(
    '/:id',
    {
      schema: {
        description: 'Update user',
        tags: ['users'],
        params: GetUserParams,
        body: UpdateUserRequest,
        response: {
          200: UserResponse,
          404: ErrorResponse,
          500: ErrorResponse,
        },
      },
      preHandler: fastify.authenticate,
    },
    async (request, reply) => {
      try {
        const user = await fastify.userService.update(request.params.id, request.body)

        if (!user) {
          return reply.code(404).send({
            error: 'Not Found',
            message: 'User not found',
            statusCode: 404,
          })
        }

        return reply.send(user)
      } catch (error) {
        fastify.log.error('Error updating user:', error)
        return reply.code(500).send({
          error: 'Internal Server Error',
          message: 'Failed to update user',
          statusCode: 500,
        })
      }
    },
  )

  // Delete user
  fastify.delete<{
    Params: Static<typeof GetUserParams>
    Reply: { success: boolean } | Static<typeof ErrorResponse>
  }>(
    '/:id',
    {
      schema: {
        description: 'Delete user',
        tags: ['users'],
        params: GetUserParams,
        response: {
          200: Type.Object({ success: Type.Boolean() }),
          404: ErrorResponse,
          500: ErrorResponse,
        },
      },
      preHandler: fastify.authenticate,
    },
    async (request, reply) => {
      try {
        const deleted = await fastify.userService.delete(request.params.id)

        if (!deleted) {
          return reply.code(404).send({
            error: 'Not Found',
            message: 'User not found',
            statusCode: 404,
          })
        }

        return reply.send({ success: true })
      } catch (error) {
        fastify.log.error('Error deleting user:', error)
        return reply.code(500).send({
          error: 'Internal Server Error',
          message: 'Failed to delete user',
          statusCode: 500,
        })
      }
    },
  )
}
```

## Error Handling and Logging

### 1. Global Error Handler

```typescript
// plugins/error-handler.ts
import { FastifyPluginAsync, FastifyError } from 'fastify'

export interface CustomError extends Error {
  statusCode?: number
  code?: string
  validation?: any[]
}

const errorHandlerPlugin: FastifyPluginAsync = async fastify => {
  fastify.setErrorHandler(async (error: FastifyError, request, reply) => {
    const { method, url, ip, headers } = request

    // Log error details
    fastify.log.error(
      {
        error: error.message,
        stack: error.stack,
        statusCode: error.statusCode || 500,
        method,
        url,
        ip,
        userAgent: headers['user-agent'],
        userId: request.user?.id,
      },
      'Request error occurred',
    )

    // Handle validation errors
    if (error.validation) {
      return reply.code(400).send({
        error: 'Validation Error',
        message: 'Request validation failed',
        statusCode: 400,
        details: error.validation.map(item => ({
          field: item.instancePath?.replace('/', '') || item.schemaPath,
          message: item.message,
          value: item.data,
        })),
      })
    }

    // Handle known application errors
    if (error.statusCode && error.statusCode < 500) {
      return reply.code(error.statusCode).send({
        error: error.name || 'Client Error',
        message: error.message,
        statusCode: error.statusCode,
      })
    }

    // Handle internal server errors
    return reply.code(500).send({
      error: 'Internal Server Error',
      message:
        process.env.NODE_ENV === 'production' ? 'An unexpected error occurred' : error.message,
      statusCode: 500,
      ...(process.env.NODE_ENV !== 'production' && { stack: error.stack }),
    })
  })

  // Not found handler
  fastify.setNotFoundHandler(async (request, reply) => {
    fastify.log.warn(
      {
        method: request.method,
        url: request.url,
        ip: request.ip,
      },
      'Route not found',
    )

    return reply.code(404).send({
      error: 'Not Found',
      message: `Route ${request.method} ${request.url} not found`,
      statusCode: 404,
    })
  })
}

export default errorHandlerPlugin

// Custom error classes
export class ValidationError extends Error {
  statusCode = 400
  code = 'VALIDATION_ERROR'

  constructor(message: string, public field?: string) {
    super(message)
    this.name = 'ValidationError'
  }
}

export class NotFoundError extends Error {
  statusCode = 404
  code = 'NOT_FOUND'

  constructor(resource: string, id?: string) {
    super(id ? `${resource} with id ${id} not found` : `${resource} not found`)
    this.name = 'NotFoundError'
  }
}

export class ConflictError extends Error {
  statusCode = 409
  code = 'CONFLICT'

  constructor(message: string) {
    super(message)
    this.name = 'ConflictError'
  }
}

export class UnauthorizedError extends Error {
  statusCode = 401
  code = 'UNAUTHORIZED'

  constructor(message = 'Unauthorized') {
    super(message)
    this.name = 'UnauthorizedError'
  }
}

export class ForbiddenError extends Error {
  statusCode = 403
  code = 'FORBIDDEN'

  constructor(message = 'Forbidden') {
    super(message)
    this.name = 'ForbiddenError'
  }
}
```

### 2. Request Logging and Monitoring

```typescript
// plugins/logging.ts
import { FastifyPluginAsync } from 'fastify'

const loggingPlugin: FastifyPluginAsync = async fastify => {
  // Request logging
  fastify.addHook('onRequest', async request => {
    fastify.log.info(
      {
        method: request.method,
        url: request.url,
        ip: request.ip,
        userAgent: request.headers['user-agent'],
        userId: request.user?.id,
        requestId: request.id,
      },
      'Incoming request',
    )
  })

  // Response logging
  fastify.addHook('onResponse', async (request, reply) => {
    const responseTime = reply.elapsedTime

    fastify.log.info(
      {
        method: request.method,
        url: request.url,
        statusCode: reply.statusCode,
        responseTime: `${responseTime}ms`,
        ip: request.ip,
        userId: request.user?.id,
        requestId: request.id,
      },
      'Request completed',
    )

    // Log slow requests
    if (responseTime > 1000) {
      fastify.log.warn(
        {
          method: request.method,
          url: request.url,
          responseTime: `${responseTime}ms`,
          requestId: request.id,
        },
        'Slow request detected',
      )
    }
  })

  // Health check endpoint
  fastify.get(
    '/health',
    {
      schema: {
        description: 'Health check endpoint',
        tags: ['health'],
        response: {
          200: {
            type: 'object',
            properties: {
              status: { type: 'string' },
              timestamp: { type: 'string' },
              uptime: { type: 'number' },
              version: { type: 'string' },
            },
          },
        },
      },
    },
    async (request, reply) => {
      return reply.send({
        status: 'ok',
        timestamp: new Date().toISOString(),
        uptime: process.uptime(),
        version: process.env.npm_package_version || '1.0.0',
      })
    },
  )
}

export default loggingPlugin
```

## Performance Optimization

### 1. Caching Strategies

```typescript
// plugins/cache.ts
import { FastifyPluginAsync } from 'fastify';
import Redis from 'ioredis';

const cachePlugin: FastifyPluginAsync = async (fastify) => {
  const redis = new Redis(fastify.config.redis.url);

  fastify.decorate('cache', {
    async get<T>(key: string): Promise<T | null> {
      try {
        const cached = await redis.get(key);
        return cached ? JSON.parse(cached) : null;
      } catch (error) {
        fastify.log.error('Cache get error:', error);
        return null;
      }
    },

    async set(key: string, value: any, ttl = 3600): Promise<void> {
      try {
        await redis.setex(key, ttl, JSON.stringify(value));
      } catch (error) {
        fastify.log.error('Cache set error:', error);
      }
    },

    async del(key: string): Promise<void> {
      try {
        await redis.del(key);
      } catch (error) {
        fastify.log.error('Cache delete error:', error);
      }
    },

    async invalidatePattern(pattern: string): Promise<void> {
      try {
        const keys = await redis.keys(pattern);
        if (keys.length > 0) {
          await redis.del(...keys);
        }
      } catch (error) {
        fastify.log.error('Cache invalidate error:', error);
      }
    }
  });

  fastify.addHook('onClose', async () => {
    await redis.quit();
  });
};

export default cachePlugin;

// Caching decorator
export function cached(ttl = 3600) {
  return function (target: any, propertyName: string, descriptor: PropertyDescriptor) {
    const method = descriptor.value;

    descriptor.value = async function (...args: any[]) {
      const cacheKey = `${target.constructor.name}:${propertyName}:${JSON.stringify(args)}`;

      // Try to get from cache
      const cached = await this.fastify.cache.get(cacheKey);
      if (cached !== null) {
        return cached;
      }

      // Execute method and cache result
      const result = await method.apply(this, args);
      await this.fastify.cache.set(cacheKey, result, ttl);

      return result;
    };
  };
}

// Usage in service
export function userService(fastify: FastifyInstance) {
  return {
    @cached(1800) // Cache for 30 minutes
    async findById(id: string): Promise<User | null> {
      // Implementation...
    }
  };
}
```

### 2. Request Rate Limiting

```typescript
// plugins/rate-limit.ts
import { FastifyPluginAsync } from 'fastify'
import rateLimit from '@fastify/rate-limit'

const rateLimitPlugin: FastifyPluginAsync = async fastify => {
  await fastify.register(rateLimit, {
    max: 100, // Maximum 100 requests
    timeWindow: '1 minute', // Per minute
    cache: 10000, // Cache size
    allowList: ['127.0.0.1'], // Whitelist localhost
    redis: fastify.redis, // Use Redis for distributed rate limiting
    nameSpace: 'rate-limit:',
    continueExceeding: true,
    skipOnError: true,
    keyGenerator: request => {
      // Use user ID if authenticated, otherwise IP
      return request.user?.id || request.ip
    },
    onExceeding: request => {
      fastify.log.warn(
        {
          ip: request.ip,
          userId: request.user?.id,
          url: request.url,
        },
        'Rate limit approaching',
      )
    },
    onExceeded: request => {
      fastify.log.warn(
        {
          ip: request.ip,
          userId: request.user?.id,
          url: request.url,
        },
        'Rate limit exceeded',
      )
    },
  })

  // Different limits for different routes
  const strictLimiter = {
    max: 5,
    timeWindow: '1 minute',
  }

  const loginLimiter = {
    max: 10,
    timeWindow: '15 minutes',
  }

  fastify.register(async function (fastify) {
    await fastify.register(rateLimit, strictLimiter)

    fastify.post('/api/auth/reset-password', async (request, reply) => {
      // Implementation
    })
  })

  fastify.register(async function (fastify) {
    await fastify.register(rateLimit, loginLimiter)

    fastify.post('/api/auth/login', async (request, reply) => {
      // Implementation
    })
  })
}

export default rateLimitPlugin
```

### 3. Performance Monitoring

```typescript
// plugins/metrics.ts
import { FastifyPluginAsync } from 'fastify'
import metricsPlugin from 'fastify-metrics'

const performancePlugin: FastifyPluginAsync = async fastify => {
  await fastify.register(metricsPlugin, {
    endpoint: '/metrics',
    defaultMetrics: {
      enabled: true,
      register: null,
    },
    routeMetrics: {
      enabled: true,
      registrationDelay: 0,
      overrides: {
        histogram: {
          name: 'http_request_duration_seconds',
          help: 'Duration of HTTP requests in seconds',
          labelNames: ['method', 'route', 'status_code'],
          buckets: [0.1, 0.5, 1, 2, 5],
        },
      },
    },
  })

  // Custom metrics
  const activeConnections = new fastify.metrics.client.Gauge({
    name: 'active_connections',
    help: 'Number of active connections',
  })

  const dbQueryDuration = new fastify.metrics.client.Histogram({
    name: 'db_query_duration_seconds',
    help: 'Duration of database queries in seconds',
    labelNames: ['query_type'],
    buckets: [0.01, 0.05, 0.1, 0.5, 1, 2],
  })

  fastify.decorate('metrics', {
    activeConnections,
    dbQueryDuration,
  })

  // Track connections
  fastify.addHook('onRequest', async () => {
    activeConnections.inc()
  })

  fastify.addHook('onResponse', async () => {
    activeConnections.dec()
  })
}

export default performancePlugin
```

## Testing Fastify Applications

### 1. Plugin Testing

```typescript
// tests/plugins/users.test.ts
import { test } from 'tap'
import Fastify from 'fastify'
import usersPlugin from '../../src/plugins/users/users.plugin'

test('users plugin', async t => {
  const fastify = Fastify()

  // Mock dependencies
  fastify.decorate('userService', {
    findById: async (id: string) => ({
      id,
      email: 'test@example.com',
      firstName: 'John',
      lastName: 'Doe',
      createdAt: new Date(),
      updatedAt: new Date(),
    }),
    create: async (data: any) => ({
      id: '123',
      ...data,
      createdAt: new Date(),
      updatedAt: new Date(),
    }),
  })

  fastify.decorate('authenticate', async () => {})

  await fastify.register(usersPlugin)

  t.teardown(() => fastify.close())

  // Test GET /users/:id
  const response = await fastify.inject({
    method: 'GET',
    url: '/api/users/123',
  })

  t.equal(response.statusCode, 200)

  const user = JSON.parse(response.payload)
  t.equal(user.id, '123')
  t.equal(user.email, 'test@example.com')
})

// Integration test
test('user creation flow', async t => {
  const fastify = Fastify()

  // Register all plugins
  await fastify.register(configPlugin)
  await fastify.register(databasePlugin)
  await fastify.register(authPlugin)
  await fastify.register(usersPlugin)

  t.teardown(() => fastify.close())

  // Test user creation
  const createResponse = await fastify.inject({
    method: 'POST',
    url: '/api/users',
    payload: {
      email: 'newuser@example.com',
      firstName: 'Jane',
      lastName: 'Smith',
      password: 'password123',
    },
  })

  t.equal(createResponse.statusCode, 201)

  const user = JSON.parse(createResponse.payload)
  t.equal(user.email, 'newuser@example.com')
  t.equal(user.firstName, 'Jane')

  // Test duplicate email
  const duplicateResponse = await fastify.inject({
    method: 'POST',
    url: '/api/users',
    payload: {
      email: 'newuser@example.com',
      firstName: 'John',
      lastName: 'Doe',
      password: 'password123',
    },
  })

  t.equal(duplicateResponse.statusCode, 409)
})
```

### 2. Load Testing

```typescript
// scripts/load-test.ts
import autocannon from 'autocannon'

async function runLoadTest() {
  const result = await autocannon({
    url: 'http://localhost:3000',
    connections: 10,
    pipelining: 1,
    duration: 30,
    requests: [
      {
        method: 'GET',
        path: '/api/users/123',
        headers: {
          authorization: 'Bearer YOUR_TOKEN_HERE',
        },
      },
      {
        method: 'POST',
        path: '/api/users',
        headers: {
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          email: 'test@example.com',
          firstName: 'Test',
          lastName: 'User',
          password: 'password123',
        }),
      },
    ],
  })

  console.log('Load test results:', result)
}

runLoadTest().catch(console.error)
```

## Best Practices

1. **Plugin Architecture**: Use plugins for feature organization and encapsulation
2. **Type Safety**: Leverage TypeScript and schema validation extensively
3. **Error Handling**: Implement comprehensive error handling and logging
4. **Performance**: Use caching, rate limiting, and monitoring
5. **Security**: Implement authentication, authorization, and input validation
6. **Testing**: Write unit, integration, and load tests
7. **Monitoring**: Use metrics and health checks for observability
8. **Documentation**: Generate API documentation from schemas
9. **Environment Config**: Use environment-specific configurations
10. **Graceful Shutdown**: Handle application lifecycle properly

Fastify's plugin system and TypeScript support enable building scalable, performant, and maintainable web applications with excellent developer experience.

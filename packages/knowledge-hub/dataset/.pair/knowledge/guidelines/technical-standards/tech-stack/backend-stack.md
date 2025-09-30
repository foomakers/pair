# 🖥️ Backend Stack

**Focus**: Node.js, Fastify, and modern backend architecture

Backend technology stack configuration and standards for building high-performance, type-safe, and scalable Node.js APIs with Fastify.

## 🏗️ Core Backend Architecture

### Technology Stack Overview

```typescript
// Backend Stack Configuration
const backendStack = {
  runtime: 'Node.js 20+',
  framework: 'Fastify 4+',
  language: 'TypeScript 5.3+',
  database: {
    primary: 'PostgreSQL 15+',
    orm: 'Prisma 5+',
    cache: 'Redis 7+',
  },
  authentication: {
    strategy: 'JWT + Refresh Tokens',
    library: 'jsonwebtoken',
    validation: 'Zod',
  },
  validation: 'Zod',
  testing: 'Vitest + Supertest',
  monitoring: {
    logging: 'Pino (built-in Fastify)',
    metrics: 'Prometheus',
    tracing: 'OpenTelemetry',
  },
  deployment: {
    containerization: 'Docker',
    orchestration: 'Docker Compose',
    cloud: 'Vercel Functions / Railway',
  },
} as const
```

### Project Structure

```
src/
├── config/               # Configuration files
│   ├── database.ts      # Database configuration
│   ├── redis.ts         # Redis configuration
│   └── env.ts           # Environment validation
├── controllers/         # Route handlers
│   ├── auth/           # Authentication controllers
│   ├── users/          # User controllers
│   └── index.ts        # Controller exports
├── services/           # Business logic layer
│   ├── auth/           # Authentication services
│   ├── users/          # User services
│   └── index.ts        # Service exports
├── repositories/       # Data access layer
│   ├── users/          # User repository
│   ├── base/           # Base repository patterns
│   └── index.ts        # Repository exports
├── middleware/         # Fastify middleware
│   ├── auth.ts         # Authentication middleware
│   ├── validation.ts   # Validation middleware
│   └── error-handler.ts # Error handling
├── plugins/            # Fastify plugins
│   ├── database.ts     # Database plugin
│   ├── redis.ts        # Redis plugin
│   └── swagger.ts      # API documentation
├── schemas/            # Zod validation schemas
│   ├── auth/           # Authentication schemas
│   ├── users/          # User schemas
│   └── common/         # Common schemas
├── types/              # TypeScript type definitions
│   ├── api.ts          # API types
│   ├── database.ts     # Database types
│   └── auth.ts         # Authentication types
├── utils/              # Utility functions
│   ├── crypto.ts       # Cryptographic utilities
│   ├── validation.ts   # Validation helpers
│   └── response.ts     # Response helpers
├── app.ts              # Fastify app setup
└── server.ts           # Server entry point
```

## ⚡ Fastify Configuration

### Application Setup

```typescript
// src/app.ts
import Fastify, { FastifyInstance } from 'fastify'
import { TypeBoxTypeProvider } from '@fastify/type-provider-typebox'
import cors from '@fastify/cors'
import helmet from '@fastify/helmet'
import jwt from '@fastify/jwt'
import rateLimit from '@fastify/rate-limit'

import { env } from './config/env'
import { databasePlugin } from './plugins/database'
import { redisPlugin } from './plugins/redis'
import { swaggerPlugin } from './plugins/swagger'
import { errorHandler } from './middleware/error-handler'

// Routes
import { authRoutes } from './controllers/auth'
import { userRoutes } from './controllers/users'

export const createApp = async (): Promise<FastifyInstance> => {
  const app = Fastify({
    logger: {
      level: env.LOG_LEVEL,
      serializers: {
        req: request => ({
          method: request.method,
          url: request.url,
          headers: request.headers,
          hostname: request.hostname,
          remoteAddress: request.ip,
        }),
        res: reply => ({
          statusCode: reply.statusCode,
          headers: reply.getHeaders(),
        }),
      },
    },
    ajv: {
      customOptions: {
        strict: 'log',
        keywords: ['kind', 'modifier'],
      },
    },
  }).withTypeProvider<TypeBoxTypeProvider>()

  // Security plugins
  await app.register(helmet, {
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
      },
    },
  })

  await app.register(cors, {
    origin: env.CORS_ORIGINS,
    credentials: true,
  })

  await app.register(rateLimit, {
    max: 100,
    timeWindow: '1 minute',
  })

  // JWT authentication
  await app.register(jwt, {
    secret: env.JWT_SECRET,
    sign: {
      algorithm: 'HS256',
      expiresIn: env.JWT_EXPIRES_IN,
    },
    verify: {
      algorithms: ['HS256'],
    },
  })

  // Infrastructure plugins
  await app.register(databasePlugin)
  await app.register(redisPlugin)

  // Development plugins
  if (env.NODE_ENV === 'development') {
    await app.register(swaggerPlugin)
  }

  // Error handling
  app.setErrorHandler(errorHandler)

  // Health check
  app.get('/health', async () => {
    return {
      status: 'ok',
      timestamp: new Date().toISOString(),
      environment: env.NODE_ENV,
    }
  })

  // Route registration
  await app.register(authRoutes, { prefix: '/api/auth' })
  await app.register(userRoutes, { prefix: '/api/users' })

  return app
}
```

### Environment Configuration

```typescript
// src/config/env.ts
import { z } from 'zod'

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.coerce.number().default(3000),
  HOST: z.string().default('0.0.0.0'),

  // Database
  DATABASE_URL: z.string().url(),

  // Redis
  REDIS_URL: z.string().url(),

  // JWT
  JWT_SECRET: z.string().min(32),
  JWT_EXPIRES_IN: z.string().default('15m'),
  JWT_REFRESH_SECRET: z.string().min(32),
  JWT_REFRESH_EXPIRES_IN: z.string().default('7d'),

  // CORS
  CORS_ORIGINS: z.string().transform(str => str.split(',').map(origin => origin.trim())),

  // Logging
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).default('info'),

  // External APIs
  EMAIL_SERVICE_API_KEY: z.string().optional(),
  UPLOAD_SERVICE_URL: z.string().url().optional(),
})

export const env = envSchema.parse(process.env)

export type Env = z.infer<typeof envSchema>
```

## 🗄️ Database Integration

### Prisma Configuration

```typescript
// prisma/schema.prisma
generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

model User {
  id        String   @id @default(cuid())
  email     String   @unique
  name      String
  age       Int?
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  // Relations
  posts Post[]

  @@map("users")
}

model Post {
  id        String   @id @default(cuid())
  title     String
  content   String
  published Boolean  @default(false)
  authorId  String
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  // Relations
  author User @relation(fields: [authorId], references: [id], onDelete: Cascade)

  @@map("posts")
}
```

### Database Plugin

```typescript
// src/plugins/database.ts
import fp from 'fastify-plugin'
import { PrismaClient } from '@prisma/client'
import { FastifyInstance } from 'fastify'

declare module 'fastify' {
  interface FastifyInstance {
    prisma: PrismaClient
  }
}

export const databasePlugin = fp(async (fastify: FastifyInstance) => {
  const prisma = new PrismaClient({
    log: fastify.log.level === 'debug' ? ['query', 'info', 'warn', 'error'] : ['warn', 'error'],
  })

  // Test connection
  try {
    await prisma.$connect()
    fastify.log.info('Database connected successfully')
  } catch (error) {
    fastify.log.error('Failed to connect to database:', error)
    throw error
  }

  // Graceful shutdown
  fastify.addHook('onClose', async () => {
    await prisma.$disconnect()
    fastify.log.info('Database disconnected')
  })

  fastify.decorate('prisma', prisma)
})
```

### Repository Pattern

```typescript
// src/repositories/base/base-repository.ts
import { PrismaClient } from '@prisma/client'

export abstract class BaseRepository {
  constructor(protected readonly prisma: PrismaClient) {}
}

// src/repositories/users/user-repository.ts
import { User, Prisma } from '@prisma/client'
import { BaseRepository } from '../base/base-repository'
import { Result } from '../../types/api'
import { UserId, Email } from '../../types/database'

export type CreateUserData = {
  readonly name: string
  readonly email: Email
  readonly age?: number
}

export type UpdateUserData = Partial<CreateUserData>

export type UserFilters = {
  readonly search?: string
  readonly minAge?: number
  readonly maxAge?: number
}

export class UserRepository extends BaseRepository {
  async create(data: CreateUserData): Promise<User> {
    return this.prisma.user.create({
      data: {
        name: data.name,
        email: data.email,
        age: data.age,
      },
    })
  }

  async findById(id: UserId): Promise<User | null> {
    return this.prisma.user.findUnique({
      where: { id },
    })
  }

  async findByEmail(email: Email): Promise<User | null> {
    return this.prisma.user.findUnique({
      where: { email },
    })
  }

  async update(id: UserId, data: UpdateUserData): Promise<User> {
    return this.prisma.user.update({
      where: { id },
      data,
    })
  }

  async delete(id: UserId): Promise<void> {
    await this.prisma.user.delete({
      where: { id },
    })
  }

  async findMany(
    filters: UserFilters = {},
    options: { page?: number; limit?: number } = {},
  ): Promise<User[]> {
    const { page = 1, limit = 10 } = options
    const skip = (page - 1) * limit

    const where: Prisma.UserWhereInput = {}

    if (filters.search) {
      where.OR = [
        { name: { contains: filters.search, mode: 'insensitive' } },
        { email: { contains: filters.search, mode: 'insensitive' } },
      ]
    }

    if (filters.minAge !== undefined) {
      where.age = { ...where.age, gte: filters.minAge }
    }

    if (filters.maxAge !== undefined) {
      where.age = { ...where.age, lte: filters.maxAge }
    }

    return this.prisma.user.findMany({
      where,
      skip,
      take: limit,
      orderBy: { createdAt: 'desc' },
    })
  }

  async count(filters: UserFilters = {}): Promise<number> {
    const where: Prisma.UserWhereInput = {}

    if (filters.search) {
      where.OR = [
        { name: { contains: filters.search, mode: 'insensitive' } },
        { email: { contains: filters.search, mode: 'insensitive' } },
      ]
    }

    return this.prisma.user.count({ where })
  }
}
```

## 🔐 Authentication & Authorization

### JWT Authentication Service

```typescript
// src/services/auth/auth-service.ts
import { FastifyInstance } from 'fastify'
import bcrypt from 'bcryptjs'
import { UserRepository } from '../../repositories/users/user-repository'
import { Result } from '../../types/api'
import { LoginCredentials, RegisterData, AuthTokens, TokenPayload } from '../../types/auth'

export class AuthService {
  constructor(
    private readonly userRepository: UserRepository,
    private readonly app: FastifyInstance,
  ) {}

  async register(data: RegisterData): Promise<Result<AuthTokens>> {
    try {
      // Check if user already exists
      const existingUser = await this.userRepository.findByEmail(data.email)
      if (existingUser) {
        return {
          success: false,
          error: new Error('User with this email already exists'),
        }
      }

      // Hash password
      const hashedPassword = await bcrypt.hash(data.password, 12)

      // Create user
      const user = await this.userRepository.create({
        name: data.name,
        email: data.email,
        age: data.age,
      })

      // Generate tokens
      const tokens = await this.generateTokens(user.id)

      return { success: true, data: tokens }
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error : new Error('Registration failed'),
      }
    }
  }

  async login(credentials: LoginCredentials): Promise<Result<AuthTokens>> {
    try {
      // Find user by email
      const user = await this.userRepository.findByEmail(credentials.email)
      if (!user) {
        return {
          success: false,
          error: new Error('Invalid credentials'),
        }
      }

      // Verify password
      const isValidPassword = await bcrypt.compare(credentials.password, user.password)
      if (!isValidPassword) {
        return {
          success: false,
          error: new Error('Invalid credentials'),
        }
      }

      // Generate tokens
      const tokens = await this.generateTokens(user.id)

      return { success: true, data: tokens }
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error : new Error('Login failed'),
      }
    }
  }

  async refreshToken(refreshToken: string): Promise<Result<AuthTokens>> {
    try {
      // Verify refresh token
      const payload = this.app.jwt.verify(refreshToken) as TokenPayload

      // Generate new tokens
      const tokens = await this.generateTokens(payload.userId)

      return { success: true, data: tokens }
    } catch (error) {
      return {
        success: false,
        error: new Error('Invalid refresh token'),
      }
    }
  }

  private async generateTokens(userId: string): Promise<AuthTokens> {
    const payload: TokenPayload = { userId }

    const accessToken = this.app.jwt.sign(payload)
    const refreshToken = this.app.jwt.sign(payload, { expiresIn: '7d' })

    return { accessToken, refreshToken }
  }
}
```

### Authentication Middleware

```typescript
// src/middleware/auth.ts
import { FastifyRequest, FastifyReply } from 'fastify'
import { TokenPayload } from '../types/auth'

declare module 'fastify' {
  interface FastifyRequest {
    user?: TokenPayload
  }
}

export const authenticate = async (request: FastifyRequest, reply: FastifyReply) => {
  try {
    const token = await request.jwtVerify<TokenPayload>()
    request.user = token
  } catch (error) {
    reply.status(401).send({ error: 'Unauthorized' })
  }
}

export const authorize = (...roles: string[]) => {
  return async (request: FastifyRequest, reply: FastifyReply) => {
    if (!request.user) {
      reply.status(401).send({ error: 'Unauthorized' })
      return
    }

    if (roles.length > 0 && !roles.includes(request.user.role)) {
      reply.status(403).send({ error: 'Forbidden' })
      return
    }
  }
}
```

## 📊 Redis Integration

### Redis Plugin

```typescript
// src/plugins/redis.ts
import fp from 'fastify-plugin'
import { createClient, RedisClientType } from 'redis'
import { FastifyInstance } from 'fastify'
import { env } from '../config/env'

declare module 'fastify' {
  interface FastifyInstance {
    redis: RedisClientType
  }
}

export const redisPlugin = fp(async (fastify: FastifyInstance) => {
  const redis = createClient({
    url: env.REDIS_URL,
  })

  redis.on('error', error => {
    fastify.log.error('Redis client error:', error)
  })

  await redis.connect()
  fastify.log.info('Redis connected successfully')

  fastify.addHook('onClose', async () => {
    await redis.disconnect()
    fastify.log.info('Redis disconnected')
  })

  fastify.decorate('redis', redis)
})
```

### Caching Service

```typescript
// src/services/cache/cache-service.ts
import { RedisClientType } from 'redis'

export class CacheService {
  constructor(private readonly redis: RedisClientType) {}

  async get<T>(key: string): Promise<T | null> {
    try {
      const value = await this.redis.get(key)
      return value ? JSON.parse(value) : null
    } catch (error) {
      console.error('Cache get error:', error)
      return null
    }
  }

  async set(key: string, value: any, ttlSeconds?: number): Promise<void> {
    try {
      const serialized = JSON.stringify(value)
      if (ttlSeconds) {
        await this.redis.setEx(key, ttlSeconds, serialized)
      } else {
        await this.redis.set(key, serialized)
      }
    } catch (error) {
      console.error('Cache set error:', error)
    }
  }

  async del(key: string): Promise<void> {
    try {
      await this.redis.del(key)
    } catch (error) {
      console.error('Cache delete error:', error)
    }
  }

  async flush(): Promise<void> {
    try {
      await this.redis.flushAll()
    } catch (error) {
      console.error('Cache flush error:', error)
    }
  }

  // Utility methods
  createKey(...parts: string[]): string {
    return parts.join(':')
  }

  async getOrSet<T>(key: string, fetchFn: () => Promise<T>, ttlSeconds?: number): Promise<T> {
    const cached = await this.get<T>(key)
    if (cached !== null) {
      return cached
    }

    const fresh = await fetchFn()
    await this.set(key, fresh, ttlSeconds)
    return fresh
  }
}
```

## 🔗 Related Configurations

- **[TypeScript Standards](typescript-standards.md)** - TypeScript configuration for backend
- **[Build Tools](.pair/knowledge/guidelines/technical-standards/development-tools/build-tools.md)** - Node.js build configuration
- **[API Standards](.pair/knowledge/guidelines/technical-standards/integration-standards/api-standards.md)** - API design standards
- **[Testing Strategy](.pair/knowledge/guidelines/testing/testing-strategy)** - Backend testing approach

## 🎯 Backend Stack Checklist

- [ ] **Node.js 20+ configured** - Latest LTS version
- [ ] **Fastify 4+ setup** - High-performance framework
- [ ] **TypeScript strict mode** - Full type safety
- [ ] **PostgreSQL + Prisma** - Database and ORM configured
- [ ] **Redis caching** - Cache layer implemented
- [ ] **JWT authentication** - Secure authentication system
- [ ] **Zod validation** - Input validation and schemas
- [ ] **Error handling** - Comprehensive error management
- [ ] **Logging system** - Pino logging configured
- [ ] **Testing setup** - Vitest and Supertest configured

---

_This backend stack provides a robust, scalable, and maintainable foundation for high-performance Node.js APIs with excellent developer experience._

# Database Integration

This document defines patterns and practices for database integration, including ORM configuration, connection management, query optimization, and data consistency strategies.

## Overview

Our database integration strategy emphasizes type safety, performance, data consistency, and maintainability across all database operations while supporting both relational and non-relational data needs.

## Database Architecture

### Primary Database Stack

```typescript
interface DatabaseStack {
  primary: 'postgresql'
  orm: 'prisma'
  cache: 'redis'
  search: 'elasticsearch'
  analytics: 'clickhouse'
  migrations: 'prisma_migrate'
  pooling: 'pgbouncer'
}

interface DatabaseConfiguration {
  host: string
  port: number
  database: string
  username: string
  password: string
  ssl: boolean
  pool_size: number
  connection_timeout: number
  idle_timeout: number
  max_lifetime: number
}

const databaseConfig: DatabaseConfiguration = {
  host: process.env.DATABASE_HOST || 'localhost',
  port: parseInt(process.env.DATABASE_PORT || '5432'),
  database: process.env.DATABASE_NAME || 'pair_dev',
  username: process.env.DATABASE_USER || 'postgres',
  password: process.env.DATABASE_PASSWORD || '',
  ssl: process.env.NODE_ENV === 'production',
  pool_size: parseInt(process.env.DATABASE_POOL_SIZE || '20'),
  connection_timeout: 5000,
  idle_timeout: 30000,
  max_lifetime: 3600000,
}
```

### Connection Management

```typescript
import { PrismaClient } from '@prisma/client'

interface DatabaseConnection {
  client: PrismaClient
  isConnected: boolean
  connectionPool: ConnectionPool
  metrics: ConnectionMetrics
}

interface ConnectionPool {
  active: number
  idle: number
  waiting: number
  max: number
}

interface ConnectionMetrics {
  totalConnections: number
  activeQueries: number
  avgQueryTime: number
  slowQueries: number
  errorRate: number
}

class DatabaseManager {
  private static instance: DatabaseManager
  private prisma: PrismaClient
  private isInitialized: boolean = false

  private constructor() {
    this.prisma = new PrismaClient({
      log: [
        { level: 'query', emit: 'event' },
        { level: 'error', emit: 'event' },
        { level: 'info', emit: 'event' },
        { level: 'warn', emit: 'event' },
      ],
      datasources: {
        db: {
          url: this.buildConnectionString(),
        },
      },
    })

    this.setupEventHandlers()
  }

  static getInstance(): DatabaseManager {
    if (!DatabaseManager.instance) {
      DatabaseManager.instance = new DatabaseManager()
    }
    return DatabaseManager.instance
  }

  async initialize(): Promise<void> {
    if (this.isInitialized) return

    try {
      await this.prisma.$connect()
      await this.validateConnection()
      this.isInitialized = true
      console.log('Database connection established')
    } catch (error) {
      console.error('Failed to initialize database:', error)
      throw new Error('Database initialization failed')
    }
  }

  private setupEventHandlers(): void {
    this.prisma.$on('query', event => {
      if (event.duration > 1000) {
        console.warn(`Slow query detected: ${event.query} (${event.duration}ms)`)
      }
    })

    this.prisma.$on('error', event => {
      console.error('Database error:', event)
    })
  }

  getClient(): PrismaClient {
    if (!this.isInitialized) {
      throw new Error('Database not initialized. Call initialize() first.')
    }
    return this.prisma
  }

  async disconnect(): Promise<void> {
    await this.prisma.$disconnect()
    this.isInitialized = false
  }
}
```

## Query Patterns and Optimization

### Repository Pattern Implementation

```typescript
interface BaseRepository<T> {
  findById(id: string): Promise<T | null>
  findMany(where?: any, options?: QueryOptions): Promise<T[]>
  create(data: Partial<T>): Promise<T>
  update(id: string, data: Partial<T>): Promise<T>
  delete(id: string): Promise<void>
  count(where?: any): Promise<number>
}

interface QueryOptions {
  skip?: number
  take?: number
  orderBy?: any
  include?: any
  select?: any
}

abstract class BaseRepository<T> {
  protected prisma: PrismaClient
  protected model: string

  constructor(model: string) {
    this.prisma = DatabaseManager.getInstance().getClient()
    this.model = model
  }

  async findById(id: string): Promise<T | null> {
    try {
      return await (this.prisma as any)[this.model].findUnique({
        where: { id },
      })
    } catch (error) {
      throw new DatabaseError(`Failed to find ${this.model} by id: ${id}`, error)
    }
  }

  async findMany(where?: any, options?: QueryOptions): Promise<T[]> {
    try {
      return await (this.prisma as any)[this.model].findMany({
        where,
        ...options,
      })
    } catch (error) {
      throw new DatabaseError(`Failed to find ${this.model}s`, error)
    }
  }

  async create(data: Partial<T>): Promise<T> {
    try {
      return await (this.prisma as any)[this.model].create({
        data: this.validateCreateData(data),
      })
    } catch (error) {
      throw new DatabaseError(`Failed to create ${this.model}`, error)
    }
  }

  async update(id: string, data: Partial<T>): Promise<T> {
    try {
      return await (this.prisma as any)[this.model].update({
        where: { id },
        data: this.validateUpdateData(data),
      })
    } catch (error) {
      throw new DatabaseError(`Failed to update ${this.model}: ${id}`, error)
    }
  }

  async delete(id: string): Promise<void> {
    try {
      await (this.prisma as any)[this.model].delete({
        where: { id },
      })
    } catch (error) {
      throw new DatabaseError(`Failed to delete ${this.model}: ${id}`, error)
    }
  }

  protected abstract validateCreateData(data: Partial<T>): any
  protected abstract validateUpdateData(data: Partial<T>): any
}

// Example implementation
class UserRepository extends BaseRepository<User> {
  constructor() {
    super('user')
  }

  async findByEmail(email: string): Promise<User | null> {
    return this.prisma.user.findUnique({
      where: { email },
    })
  }

  async findActiveUsers(limit: number = 50): Promise<User[]> {
    return this.prisma.user.findMany({
      where: {
        isActive: true,
        deletedAt: null,
      },
      take: limit,
      orderBy: { createdAt: 'desc' },
    })
  }

  protected validateCreateData(data: Partial<User>): any {
    if (!data.email || !data.name) {
      throw new ValidationError('Email and name are required')
    }
    return {
      ...data,
      createdAt: new Date(),
      updatedAt: new Date(),
    }
  }

  protected validateUpdateData(data: Partial<User>): any {
    return {
      ...data,
      updatedAt: new Date(),
    }
  }
}
```

### Query Optimization Patterns

```typescript
interface QueryOptimization {
  indexing: IndexStrategy
  batching: BatchStrategy
  caching: CacheStrategy
  pagination: PaginationStrategy
}

interface IndexStrategy {
  composite_indexes: CompositeIndex[]
  partial_indexes: PartialIndex[]
  unique_indexes: UniqueIndex[]
}

interface CompositeIndex {
  name: string
  columns: string[]
  order: 'ASC' | 'DESC'
  where_clause?: string
}

// Optimized query patterns
class OptimizedQueryService {
  private prisma: PrismaClient

  constructor() {
    this.prisma = DatabaseManager.getInstance().getClient()
  }

  // Batch loading to prevent N+1 queries
  async loadUsersWithPosts(userIds: string[]): Promise<UserWithPosts[]> {
    const users = await this.prisma.user.findMany({
      where: {
        id: { in: userIds },
      },
      include: {
        posts: {
          take: 10,
          orderBy: { createdAt: 'desc' },
        },
      },
    })

    return users
  }

  // Cursor-based pagination for large datasets
  async getPaginatedPosts(cursor?: string, limit: number = 20): Promise<PaginatedResult<Post>> {
    const posts = await this.prisma.post.findMany({
      take: limit + 1, // Take one extra to check if there's a next page
      cursor: cursor ? { id: cursor } : undefined,
      orderBy: { createdAt: 'desc' },
      include: {
        author: {
          select: { id: true, name: true, email: true },
        },
      },
    })

    const hasNextPage = posts.length > limit
    const items = hasNextPage ? posts.slice(0, -1) : posts

    return {
      items,
      hasNextPage,
      nextCursor: hasNextPage ? items[items.length - 1].id : null,
    }
  }

  // Aggregation queries
  async getUserStats(userId: string): Promise<UserStats> {
    const stats = await this.prisma.user.findUnique({
      where: { id: userId },
      include: {
        _count: {
          select: {
            posts: true,
            comments: true,
            likes: true,
          },
        },
      },
    })

    if (!stats) {
      throw new NotFoundError('User not found')
    }

    return {
      postsCount: stats._count.posts,
      commentsCount: stats._count.comments,
      likesCount: stats._count.likes,
    }
  }

  // Raw SQL for complex queries
  async getTopContributors(limit: number = 10): Promise<ContributorStats[]> {
    return this.prisma.$queryRaw`
      SELECT 
        u.id,
        u.name,
        u.email,
        COUNT(DISTINCT p.id) as post_count,
        COUNT(DISTINCT c.id) as comment_count,
        (COUNT(DISTINCT p.id) + COUNT(DISTINCT c.id)) as total_contributions
      FROM users u
      LEFT JOIN posts p ON u.id = p.author_id
      LEFT JOIN comments c ON u.id = c.author_id
      WHERE u.is_active = true
      GROUP BY u.id, u.name, u.email
      ORDER BY total_contributions DESC
      LIMIT ${limit}
    `
  }
}
```

## Transaction Management

### Transaction Patterns

```typescript
interface TransactionContext {
  prisma: PrismaClient
  isTransaction: boolean
  rollback(): Promise<void>
  commit(): Promise<void>
}

class TransactionManager {
  private prisma: PrismaClient

  constructor() {
    this.prisma = DatabaseManager.getInstance().getClient()
  }

  async executeTransaction<T>(operation: (tx: PrismaClient) => Promise<T>): Promise<T> {
    return await this.prisma.$transaction(async tx => {
      try {
        return await operation(tx)
      } catch (error) {
        console.error('Transaction failed:', error)
        throw error
      }
    })
  }

  // Saga pattern for distributed transactions
  async executeSaga<T>(steps: SagaStep<T>[]): Promise<T> {
    const compensations: (() => Promise<void>)[] = []
    let result: T

    try {
      for (const step of steps) {
        result = await step.execute(this.prisma)
        if (step.compensate) {
          compensations.unshift(step.compensate)
        }
      }
      return result!
    } catch (error) {
      // Execute compensations in reverse order
      for (const compensate of compensations) {
        try {
          await compensate()
        } catch (compensationError) {
          console.error('Compensation failed:', compensationError)
        }
      }
      throw error
    }
  }
}

interface SagaStep<T> {
  execute: (prisma: PrismaClient) => Promise<T>
  compensate?: () => Promise<void>
}

// Example transaction usage
class OrderService {
  private transactionManager: TransactionManager

  constructor() {
    this.transactionManager = new TransactionManager()
  }

  async createOrder(orderData: CreateOrderData): Promise<Order> {
    return await this.transactionManager.executeTransaction(async tx => {
      // 1. Create order
      const order = await tx.order.create({
        data: {
          ...orderData,
          status: 'PENDING',
          total: 0,
        },
      })

      // 2. Process order items
      let total = 0
      for (const item of orderData.items) {
        const product = await tx.product.findUnique({
          where: { id: item.productId },
        })

        if (!product || product.stock < item.quantity) {
          throw new Error(`Insufficient stock for product ${item.productId}`)
        }

        // Update product stock
        await tx.product.update({
          where: { id: item.productId },
          data: { stock: { decrement: item.quantity } },
        })

        // Create order item
        await tx.orderItem.create({
          data: {
            orderId: order.id,
            productId: item.productId,
            quantity: item.quantity,
            price: product.price,
          },
        })

        total += product.price * item.quantity
      }

      // 3. Update order total
      const updatedOrder = await tx.order.update({
        where: { id: order.id },
        data: { total, status: 'CONFIRMED' },
      })

      return updatedOrder
    })
  }
}
```

## Cache Integration

### Redis Cache Patterns

```typescript
interface CacheConfig {
  redis_url: string
  default_ttl: number
  key_prefix: string
  compression: boolean
  serialization: 'json' | 'msgpack'
}

interface CacheStrategy {
  cache_aside: boolean
  write_through: boolean
  write_behind: boolean
  refresh_ahead: boolean
}

class CacheService {
  private redis: Redis
  private config: CacheConfig

  constructor(config: CacheConfig) {
    this.config = config
    this.redis = new Redis(config.redis_url)
  }

  async get<T>(key: string): Promise<T | null> {
    try {
      const cached = await this.redis.get(this.buildKey(key))
      return cached ? JSON.parse(cached) : null
    } catch (error) {
      console.error('Cache get error:', error)
      return null
    }
  }

  async set<T>(key: string, value: T, ttl: number = this.config.default_ttl): Promise<void> {
    try {
      await this.redis.setex(this.buildKey(key), ttl, JSON.stringify(value))
    } catch (error) {
      console.error('Cache set error:', error)
    }
  }

  async invalidate(pattern: string): Promise<void> {
    try {
      const keys = await this.redis.keys(this.buildKey(pattern))
      if (keys.length > 0) {
        await this.redis.del(...keys)
      }
    } catch (error) {
      console.error('Cache invalidation error:', error)
    }
  }

  private buildKey(key: string): string {
    return `${this.config.key_prefix}:${key}`
  }
}

// Repository with caching
class CachedUserRepository extends UserRepository {
  private cache: CacheService

  constructor(cache: CacheService) {
    super()
    this.cache = cache
  }

  async findById(id: string): Promise<User | null> {
    const cacheKey = `user:${id}`

    // Try cache first
    let user = await this.cache.get<User>(cacheKey)
    if (user) {
      return user
    }

    // Fallback to database
    user = await super.findById(id)
    if (user) {
      await this.cache.set(cacheKey, user, 300) // 5 minutes TTL
    }

    return user
  }

  async update(id: string, data: Partial<User>): Promise<User> {
    const user = await super.update(id, data)

    // Invalidate cache
    await this.cache.invalidate(`user:${id}`)

    return user
  }
}
```

## Migration Management

### Prisma Migration Strategy

```typescript
interface MigrationStrategy {
  auto_deploy: boolean
  backup_before_migrate: boolean
  rollback_support: boolean
  zero_downtime: boolean
  data_migration_scripts: boolean
}

// Custom migration scripts
abstract class DataMigration {
  abstract name: string
  abstract description: string

  abstract up(prisma: PrismaClient): Promise<void>
  abstract down(prisma: PrismaClient): Promise<void>
  abstract validate(prisma: PrismaClient): Promise<boolean>
}

class AddUserRolesMigration extends DataMigration {
  name = '20240101_add_user_roles'
  description = 'Add default roles to existing users'

  async up(prisma: PrismaClient): Promise<void> {
    await prisma.$transaction(async tx => {
      // Get all users without roles
      const usersWithoutRoles = await tx.user.findMany({
        where: { role: null },
      })

      // Assign default role
      for (const user of usersWithoutRoles) {
        await tx.user.update({
          where: { id: user.id },
          data: { role: 'USER' },
        })
      }
    })
  }

  async down(prisma: PrismaClient): Promise<void> {
    await prisma.user.updateMany({
      where: { role: 'USER' },
      data: { role: null },
    })
  }

  async validate(prisma: PrismaClient): Promise<boolean> {
    const usersWithoutRoles = await prisma.user.count({
      where: { role: null },
    })
    return usersWithoutRoles === 0
  }
}

class MigrationRunner {
  private prisma: PrismaClient
  private migrations: DataMigration[]

  constructor(migrations: DataMigration[]) {
    this.prisma = DatabaseManager.getInstance().getClient()
    this.migrations = migrations
  }

  async runMigrations(): Promise<void> {
    for (const migration of this.migrations) {
      try {
        console.log(`Running migration: ${migration.name}`)
        await migration.up(this.prisma)

        const isValid = await migration.validate(this.prisma)
        if (!isValid) {
          throw new Error(`Migration validation failed: ${migration.name}`)
        }

        console.log(`Migration completed: ${migration.name}`)
      } catch (error) {
        console.error(`Migration failed: ${migration.name}`, error)
        throw error
      }
    }
  }
}
```

## Error Handling and Resilience

### Database Error Handling

```typescript
class DatabaseError extends Error {
  constructor(message: string, public originalError?: any) {
    super(message)
    this.name = 'DatabaseError'
  }
}

class ConnectionError extends DatabaseError {
  constructor(message: string) {
    super(message)
    this.name = 'ConnectionError'
  }
}

class QueryError extends DatabaseError {
  constructor(query: string, originalError: any) {
    super(`Query failed: ${query}`)
    this.name = 'QueryError'
    this.originalError = originalError
  }
}

// Retry mechanism
class DatabaseRetryWrapper {
  private maxRetries: number = 3
  private baseDelay: number = 1000

  async executeWithRetry<T>(operation: () => Promise<T>, operationName: string): Promise<T> {
    let lastError: Error

    for (let attempt = 1; attempt <= this.maxRetries; attempt++) {
      try {
        return await operation()
      } catch (error) {
        lastError = error as Error

        if (attempt === this.maxRetries) {
          break
        }

        if (this.isRetryableError(error)) {
          const delay = this.baseDelay * Math.pow(2, attempt - 1)
          console.warn(`${operationName} failed (attempt ${attempt}), retrying in ${delay}ms`)
          await this.sleep(delay)
        } else {
          break
        }
      }
    }

    throw new DatabaseError(`${operationName} failed after ${this.maxRetries} attempts`, lastError)
  }

  private isRetryableError(error: any): boolean {
    const retryableErrors = ['ECONNREFUSED', 'ENOTFOUND', 'TIMEOUT', 'CONNECTION_LOST']

    return retryableErrors.some(
      errType => error.code === errType || error.message.includes(errType),
    )
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms))
  }
}
```

## Related Concepts

- **Error Handling**: Database-specific error patterns and recovery
- **Performance Patterns**: Database query optimization and monitoring
- **Security Guidelines**: Database security and access control
- **Testing Strategy**: Database testing approaches and fixtures
- **External Services**: Third-party service integration patterns

## Tools and Libraries

- **Prisma**: Primary ORM with type safety and migration support
- **Redis**: Caching layer and session storage
- **PostgreSQL**: Primary relational database
- **PgBouncer**: Connection pooling and management
- **Elasticsearch**: Full-text search and analytics

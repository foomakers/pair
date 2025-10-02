# 🗄️ Database Integration

**Focus**: PostgreSQL + Prisma integration patterns, migrations, and performance optimization

Comprehensive database integration patterns using PostgreSQL with Prisma ORM, including connection management, migrations, performance optimization, and data modeling best practices.

## 🎯 Database Architecture

### Core Integration Stack

```typescript
// ✅ Database configuration structure
interface DatabaseConfig {
  // Connection configuration
  connection: DatabaseConnection

  // Prisma configuration
  prisma: PrismaConfig

  // Connection pooling
  pooling: PoolingConfig

  // Performance settings
  performance: PerformanceConfig

  // Migration settings
  migrations: MigrationConfig

  // Monitoring
  monitoring: MonitoringConfig
}

interface DatabaseConnection {
  host: string
  port: number
  database: string
  username: string
  password: string
  ssl: boolean
  schema: string
  connectionTimeout: number
  idleTimeout: number
  maxConnections: number
}

interface PrismaConfig {
  provider: 'postgresql'
  url: string
  directUrl?: string // For connection pooling
  shadowDatabaseUrl?: string // For migrations
  relationMode?: 'prisma' | 'foreignKeys'
  previewFeatures: string[]
  generateOptions: {
    output: string
    binaryTargets: string[]
  }
}
```

## 🔌 Prisma Setup & Configuration

### Schema Definition

```typescript
// ✅ schema.prisma configuration
generator client {
  provider        = "prisma-client-js"
  output          = "./generated/client"
  previewFeatures = ["jsonProtocol", "tracing", "metrics"]
  binaryTargets   = ["native", "rhel-openssl-1.0.x"]
}

datasource db {
  provider  = "postgresql"
  url       = env("DATABASE_URL")
  directUrl = env("DIRECT_DATABASE_URL") // Connection pooling bypass
}

// ✅ Base model patterns
model User {
  id        String   @id @default(cuid())
  email     String   @unique
  name      String?
  avatar    String?
  role      UserRole @default(USER)

  // Timestamps
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  // Soft delete
  deletedAt DateTime?

  // Relations
  profile   UserProfile?
  posts     Post[]
  comments  Comment[]

  // Indexes
  @@index([email])
  @@index([createdAt])
  @@index([deletedAt])
  @@map("users")
}

model UserProfile {
  id       String  @id @default(cuid())
  userId   String  @unique
  bio      String?
  website  String?
  location String?

  // JSON fields for flexible data
  preferences Json    @default("{}")
  metadata    Json    @default("{}")

  // Relations
  user User @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@map("user_profiles")
}

model Post {
  id          String      @id @default(cuid())
  title       String
  content     String
  excerpt     String?
  slug        String      @unique
  status      PostStatus  @default(DRAFT)
  publishedAt DateTime?

  // Author
  authorId String
  author   User   @relation(fields: [authorId], references: [id])

  // Categories & Tags (many-to-many)
  categories PostCategory[]
  tags       PostTag[]

  // Comments
  comments Comment[]

  // Timestamps
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt
  deletedAt DateTime?

  // Full-text search
  searchVector Unsupported("tsvector")?

  // Indexes
  @@index([slug])
  @@index([status, publishedAt])
  @@index([authorId])
  @@index([createdAt])
  @@index([searchVector], type: Gin)
  @@map("posts")
}

// ✅ Enums
enum UserRole {
  USER
  MODERATOR
  ADMIN
  SUPER_ADMIN
}

enum PostStatus {
  DRAFT
  PUBLISHED
  ARCHIVED
}
```

### Database Client Setup

```typescript
// ✅ Prisma client configuration
import { PrismaClient, Prisma } from '@prisma/client'
import { createSoftDeleteExtension } from './extensions/soft-delete'
import { createAuditExtension } from './extensions/audit'
import { createCacheExtension } from './extensions/cache'

// Global Prisma client with extensions
const createPrismaClient = () => {
  const client = new PrismaClient({
    log: [
      { level: 'query', emit: 'event' },
      { level: 'error', emit: 'stdout' },
      { level: 'info', emit: 'stdout' },
      { level: 'warn', emit: 'stdout' },
    ],
    errorFormat: 'pretty',
  })

  // Query logging in development
  if (process.env.NODE_ENV === 'development') {
    client.$on('query', e => {
      console.log('Query: ' + e.query)
      console.log('Duration: ' + e.duration + 'ms')
    })
  }

  // Extended client with custom functionality
  return client
    .$extends(createSoftDeleteExtension())
    .$extends(createAuditExtension())
    .$extends(createCacheExtension())
}

// Singleton pattern for client
const globalForPrisma = globalThis as unknown as {
  prisma: ReturnType<typeof createPrismaClient> | undefined
}

export const prisma = globalForPrisma.prisma ?? createPrismaClient()

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = prisma
}

// ✅ Connection management
export class DatabaseManager {
  private static instance: DatabaseManager
  private client: ReturnType<typeof createPrismaClient>

  private constructor() {
    this.client = prisma
  }

  static getInstance(): DatabaseManager {
    if (!DatabaseManager.instance) {
      DatabaseManager.instance = new DatabaseManager()
    }
    return DatabaseManager.instance
  }

  async connect(): Promise<void> {
    try {
      await this.client.$connect()
      console.log('📦 Database connected successfully')
    } catch (error) {
      console.error('❌ Database connection failed:', error)
      throw error
    }
  }

  async disconnect(): Promise<void> {
    await this.client.$disconnect()
    console.log('📦 Database disconnected')
  }

  async healthCheck(): Promise<boolean> {
    try {
      await this.client.$queryRaw`SELECT 1`
      return true
    } catch {
      return false
    }
  }

  getClient() {
    return this.client
  }
}
```

## 🔄 Migration Management

### Migration Strategies

```typescript
// ✅ Migration workflow
export class MigrationManager {
  private prisma: PrismaClient

  constructor(prisma: PrismaClient) {
    this.prisma = prisma
  }

  /**
   * Apply pending migrations
   */
  async migrate(): Promise<void> {
    try {
      await this.prisma.$executeRawUnsafe('BEGIN')

      // Apply Prisma migrations
      await this.executePrismaMigrations()

      // Run custom data migrations
      await this.executeDataMigrations()

      await this.prisma.$executeRawUnsafe('COMMIT')
      console.log('✅ Migrations applied successfully')
    } catch (error) {
      await this.prisma.$executeRawUnsafe('ROLLBACK')
      console.error('❌ Migration failed:', error)
      throw error
    }
  }

  /**
   * Rollback last migration
   */
  async rollback(): Promise<void> {
    // Implementation depends on migration tracking table
    const lastMigration = await this.getLastMigration()
    if (lastMigration?.rollbackSql) {
      await this.prisma.$executeRawUnsafe(lastMigration.rollbackSql)
    }
  }

  /**
   * Seed database with initial data
   */
  async seed(): Promise<void> {
    console.log('🌱 Starting database seed...')

    // Create default roles
    await this.seedRoles()

    // Create admin user
    await this.seedAdminUser()

    // Create demo data (development only)
    if (process.env.NODE_ENV === 'development') {
      await this.seedDemoData()
    }

    console.log('✅ Database seeded successfully')
  }

  private async seedRoles(): Promise<void> {
    const roles = [
      { name: 'admin', permissions: ['*'] },
      { name: 'moderator', permissions: ['read', 'write'] },
      { name: 'user', permissions: ['read'] },
    ]

    for (const role of roles) {
      await this.prisma.role.upsert({
        where: { name: role.name },
        update: {},
        create: role,
      })
    }
  }

  private async seedAdminUser(): Promise<void> {
    await this.prisma.user.upsert({
      where: { email: 'admin@example.com' },
      update: {},
      create: {
        email: 'admin@example.com',
        name: 'Admin User',
        role: 'ADMIN',
        profile: {
          create: {
            bio: 'System administrator',
          },
        },
      },
    })
  }
}

// ✅ Migration scripts structure
interface MigrationScript {
  id: string
  description: string
  up: (prisma: PrismaClient) => Promise<void>
  down: (prisma: PrismaClient) => Promise<void>
}

const migrations: MigrationScript[] = [
  {
    id: '001_add_full_text_search',
    description: 'Add full-text search to posts',
    up: async prisma => {
      await prisma.$executeRaw`
        ALTER TABLE posts 
        ADD COLUMN search_vector tsvector 
        GENERATED ALWAYS AS (
          to_tsvector('english', coalesce(title, '') || ' ' || coalesce(content, ''))
        ) STORED
      `

      await prisma.$executeRaw`
        CREATE INDEX posts_search_vector_idx ON posts USING gin(search_vector)
      `
    },
    down: async prisma => {
      await prisma.$executeRaw`DROP INDEX IF EXISTS posts_search_vector_idx`
      await prisma.$executeRaw`ALTER TABLE posts DROP COLUMN IF EXISTS search_vector`
    },
  },
]
```

## 🚀 Query Optimization

### Performance Patterns

```typescript
// ✅ Repository pattern with optimizations
export class PostRepository {
  constructor(private prisma: PrismaClient) {}

  /**
   * Find posts with optimized queries
   */
  async findPosts(options: FindPostsOptions): Promise<PaginatedResult<Post>> {
    const { page = 1, limit = 10, status, authorId, search } = options

    const where: Prisma.PostWhereInput = {
      deletedAt: null, // Soft delete filter
      ...(status && { status }),
      ...(authorId && { authorId }),
      ...(search && {
        OR: [
          { title: { contains: search, mode: 'insensitive' } },
          { content: { contains: search, mode: 'insensitive' } },
          // Full-text search for better performance
          { searchVector: { search: search.split(' ').join(' & ') } },
        ],
      }),
    }

    // Count and data queries in parallel
    const [total, posts] = await Promise.all([
      this.prisma.post.count({ where }),
      this.prisma.post.findMany({
        where,
        include: {
          author: {
            select: { id: true, name: true, email: true },
          },
          categories: {
            select: { id: true, name: true, slug: true },
          },
          _count: {
            select: { comments: true },
          },
        },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
    ])

    return {
      data: posts,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    }
  }

  /**
   * Find post by slug with full relations
   */
  async findBySlug(slug: string): Promise<Post | null> {
    return this.prisma.post.findUnique({
      where: {
        slug,
        deletedAt: null,
      },
      include: {
        author: {
          select: {
            id: true,
            name: true,
            email: true,
            profile: {
              select: { bio: true, avatar: true },
            },
          },
        },
        categories: true,
        tags: true,
        comments: {
          where: { deletedAt: null },
          include: {
            author: {
              select: { id: true, name: true },
            },
          },
          orderBy: { createdAt: 'asc' },
        },
      },
    })
  }

  /**
   * Bulk operations for performance
   */
  async bulkUpdateStatus(postIds: string[], status: PostStatus): Promise<void> {
    await this.prisma.post.updateMany({
      where: {
        id: { in: postIds },
        deletedAt: null,
      },
      data: {
        status,
        updatedAt: new Date(),
      },
    })
  }

  /**
   * Aggregate queries for analytics
   */
  async getPostStatistics(): Promise<PostStatistics> {
    const stats = await this.prisma.post.aggregate({
      where: { deletedAt: null },
      _count: { id: true },
      _avg: { viewCount: true },
      _sum: { viewCount: true },
    })

    const statusCounts = await this.prisma.post.groupBy({
      by: ['status'],
      where: { deletedAt: null },
      _count: { id: true },
    })

    return {
      total: stats._count.id || 0,
      averageViews: stats._avg.viewCount || 0,
      totalViews: stats._sum.viewCount || 0,
      byStatus: statusCounts.reduce((acc, item) => {
        acc[item.status] = item._count.id
        return acc
      }, {} as Record<PostStatus, number>),
    }
  }
}

// ✅ Connection pooling configuration
const connectionPoolConfig = {
  // PgBouncer configuration
  pgBouncer: {
    poolMode: 'transaction', // or 'session', 'statement'
    maxClientConnections: 100,
    defaultPoolSize: 20,
    maxDbConnections: 20,
    poolModeStatement: true,
  },

  // Prisma connection pool
  prismaPool: {
    connectionLimit: 10, // Default connection pool size
    acquireTimeoutMillis: 60000,
    createTimeoutMillis: 30000,
    destroyTimeoutMillis: 5000,
    idleTimeoutMillis: 30000,
    reapIntervalMillis: 1000,
    createRetryIntervalMillis: 200,
  },
}
```

## 📊 Database Monitoring

### Health Checks & Metrics

```typescript
// ✅ Database monitoring service
export class DatabaseMonitoringService {
  constructor(private prisma: PrismaClient) {}

  /**
   * Comprehensive health check
   */
  async healthCheck(): Promise<DatabaseHealth> {
    const startTime = Date.now()

    try {
      // Basic connectivity
      await this.prisma.$queryRaw`SELECT 1`

      // Connection pool status
      const poolStatus = await this.getPoolStatus()

      // Performance metrics
      const metrics = await this.getPerformanceMetrics()

      // Disk usage
      const diskUsage = await this.getDiskUsage()

      const responseTime = Date.now() - startTime

      return {
        status: 'healthy',
        responseTime,
        poolStatus,
        metrics,
        diskUsage,
        timestamp: new Date(),
      }
    } catch (error) {
      return {
        status: 'unhealthy',
        error: error.message,
        responseTime: Date.now() - startTime,
        timestamp: new Date(),
      }
    }
  }

  /**
   * Get connection pool metrics
   */
  private async getPoolStatus(): Promise<PoolStatus> {
    const result = await this.prisma.$queryRaw<
      Array<{
        state: string
        count: number
      }>
    >`
      SELECT state, count(*) as count
      FROM pg_stat_activity 
      WHERE datname = current_database()
      GROUP BY state
    `

    return result.reduce((acc, row) => {
      acc[row.state] = Number(row.count)
      return acc
    }, {} as PoolStatus)
  }

  /**
   * Get performance metrics
   */
  private async getPerformanceMetrics(): Promise<PerformanceMetrics> {
    const [slowQueries, lockInfo, cacheHitRatio] = await Promise.all([
      this.getSlowQueries(),
      this.getLockInformation(),
      this.getCacheHitRatio(),
    ])

    return {
      slowQueries,
      lockInfo,
      cacheHitRatio,
    }
  }

  private async getSlowQueries(): Promise<SlowQuery[]> {
    return this.prisma.$queryRaw<SlowQuery[]>`
      SELECT 
        query,
        calls,
        total_time,
        mean_time,
        rows
      FROM pg_stat_statements 
      WHERE mean_time > 100
      ORDER BY mean_time DESC 
      LIMIT 10
    `
  }

  private async getCacheHitRatio(): Promise<number> {
    const result = await this.prisma.$queryRaw<
      Array<{
        ratio: number
      }>
    >`
      SELECT 
        round(
          (sum(heap_blks_hit) / (sum(heap_blks_hit) + sum(heap_blks_read))) * 100,
          2
        ) as ratio
      FROM pg_statio_user_tables
    `

    return result[0]?.ratio || 0
  }

  /**
   * Monitor database size and growth
   */
  async getDatabaseSize(): Promise<DatabaseSize> {
    const [totalSize, tablesSizes, indexesSizes] = await Promise.all([
      this.prisma.$queryRaw<Array<{ size: string }>>`
        SELECT pg_size_pretty(pg_database_size(current_database())) as size
      `,
      this.prisma.$queryRaw<
        Array<{
          table_name: string
          size: string
          row_count: number
        }>
      >`
        SELECT 
          schemaname||'.'||tablename as table_name,
          pg_size_pretty(pg_total_relation_size(schemaname||'.'||tablename)) as size,
          n_tup_ins + n_tup_upd + n_tup_del as row_count
        FROM pg_stat_user_tables 
        ORDER BY pg_total_relation_size(schemaname||'.'||tablename) DESC
        LIMIT 20
      `,
      this.prisma.$queryRaw<
        Array<{
          index_name: string
          size: string
          usage: number
        }>
      >`
        SELECT 
          indexrelname as index_name,
          pg_size_pretty(pg_relation_size(indexrelid)) as size,
          idx_scan as usage
        FROM pg_stat_user_indexes 
        ORDER BY pg_relation_size(indexrelid) DESC
        LIMIT 20
      `,
    ])

    return {
      total: totalSize[0]?.size || '0 bytes',
      tables: tablesSizes,
      indexes: indexesSizes,
    }
  }
}

// ✅ Automated backup monitoring
export class BackupMonitoringService {
  async checkBackupStatus(): Promise<BackupStatus> {
    // Check last backup timestamp
    const lastBackup = await this.getLastBackupTime()

    // Verify backup integrity
    const integrityCheck = await this.verifyBackupIntegrity()

    // Check backup storage usage
    const storageUsage = await this.getBackupStorageUsage()

    return {
      lastBackup,
      integrityCheck,
      storageUsage,
      nextScheduledBackup: this.getNextBackupTime(),
      retentionPolicy: this.getRetentionPolicy(),
    }
  }
}
```

## 🔗 Related Concepts

- **[Performance Optimization](.pair/knowledge/guidelines/code-design/quality-standards/performance-optimization.md)** - Database performance patterns
- **[API Design](.pair/knowledge/guidelines/code-design/README.md)** - Database-backed API patterns
- **[Error Handling](error-handling.md)** - Database error management

## 📏 Implementation Guidelines

1. **Schema Design**: Use proper normalization and indexing strategies
2. **Migration Management**: Version control all schema changes
3. **Performance Optimization**: Monitor and optimize query performance
4. **Connection Pooling**: Implement efficient connection management
5. **Monitoring**: Track database health and performance metrics
6. **Backup Strategy**: Implement automated backup and recovery
7. **Security**: Use proper authentication and authorization
8. **Data Validation**: Validate data at both application and database levels

---

_Database Integration provides comprehensive patterns for PostgreSQL + Prisma integration, ensuring robust, performant, and maintainable database operations across the application stack._

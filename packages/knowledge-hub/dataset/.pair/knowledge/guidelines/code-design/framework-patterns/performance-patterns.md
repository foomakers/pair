# Performance Patterns

This document defines performance optimization patterns, monitoring strategies, and best practices for building high-performance applications across frontend, backend, and database layers.

## Overview

Our performance patterns ensure optimal user experience through efficient resource utilization, intelligent caching strategies, and proactive performance monitoring while maintaining code maintainability.

## Frontend Performance Patterns

### React Performance Optimization

```typescript
import React, { memo, useMemo, useCallback, lazy, Suspense } from 'react'
import { useVirtualizer } from '@tanstack/react-virtual'

// Memoization patterns
interface ExpensiveComponentProps {
  data: ComplexData[]
  onItemClick: (id: string) => void
  sortBy: string
  filterBy: string
}

// Component memoization with custom comparison
const ExpensiveComponent = memo<ExpensiveComponentProps>(
  ({ data, onItemClick, sortBy, filterBy }) => {
    // Memoize expensive calculations
    const processedData = useMemo(() => {
      return data
        .filter(item => item.category.includes(filterBy))
        .sort((a, b) => {
          switch (sortBy) {
            case 'date':
              return new Date(b.date).getTime() - new Date(a.date).getTime()
            case 'name':
              return a.name.localeCompare(b.name)
            default:
              return 0
          }
        })
    }, [data, sortBy, filterBy])

    // Memoize event handlers
    const handleItemClick = useCallback(
      (id: string) => {
        onItemClick(id)
      },
      [onItemClick],
    )

    return (
      <div className='expensive-component'>
        {processedData.map(item => (
          <ExpensiveItem key={item.id} item={item} onClick={handleItemClick} />
        ))}
      </div>
    )
  },
  // Custom comparison function
  (prevProps, nextProps) => {
    return (
      prevProps.data === nextProps.data &&
      prevProps.sortBy === nextProps.sortBy &&
      prevProps.filterBy === nextProps.filterBy &&
      prevProps.onItemClick === nextProps.onItemClick
    )
  },
)

// Virtual scrolling for large lists
interface VirtualizedListProps {
  items: ListItem[]
  itemHeight: number
  containerHeight: number
}

function VirtualizedList({ items, itemHeight, containerHeight }: VirtualizedListProps) {
  const parentRef = useRef<HTMLDivElement>(null)

  const virtualizer = useVirtualizer({
    count: items.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => itemHeight,
    overscan: 5, // Render 5 extra items outside viewport
  })

  return (
    <div
      ref={parentRef}
      className='virtual-list-container'
      style={{ height: containerHeight, overflow: 'auto' }}>
      <div
        style={{
          height: `${virtualizer.getTotalSize()}px`,
          width: '100%',
          position: 'relative',
        }}>
        {virtualizer.getVirtualItems().map(virtualItem => (
          <div
            key={virtualItem.key}
            style={{
              position: 'absolute',
              top: 0,
              left: 0,
              width: '100%',
              height: `${virtualItem.size}px`,
              transform: `translateY(${virtualItem.start}px)`,
            }}>
            <ListItemComponent item={items[virtualItem.index]} />
          </div>
        ))}
      </div>
    </div>
  )
}

// Code splitting with lazy loading
const LazyDashboard = lazy(() =>
  import('./Dashboard').then(module => ({
    default: module.Dashboard,
  })),
)

const LazySettings = lazy(() =>
  import('./Settings').then(module => ({
    default: module.Settings,
  })),
)

// Route-based code splitting
function App() {
  return (
    <Router>
      <Routes>
        <Route
          path='/dashboard'
          element={
            <Suspense fallback={<DashboardSkeleton />}>
              <LazyDashboard />
            </Suspense>
          }
        />
        <Route
          path='/settings'
          element={
            <Suspense fallback={<SettingsSkeleton />}>
              <LazySettings />
            </Suspense>
          }
        />
      </Routes>
    </Router>
  )
}
```

### Image and Asset Optimization

```typescript
interface ImageOptimizationConfig {
  formats: ('webp' | 'avif' | 'jpeg' | 'png')[]
  sizes: number[]
  quality: number
  loading: 'lazy' | 'eager'
  priority: boolean
}

// Optimized image component
interface OptimizedImageProps {
  src: string
  alt: string
  width: number
  height: number
  priority?: boolean
  className?: string
  sizes?: string
}

function OptimizedImage({
  src,
  alt,
  width,
  height,
  priority = false,
  className,
  sizes = '100vw',
}: OptimizedImageProps) {
  // Generate responsive image URLs
  const generateSrcSet = (baseSrc: string, format: string) => {
    const sizes = [640, 768, 1024, 1280, 1920]
    return sizes.map(size => `${baseSrc}?w=${size}&f=${format} ${size}w`).join(', ')
  }

  return (
    <picture className={className}>
      {/* Modern formats first */}
      <source srcSet={generateSrcSet(src, 'avif')} sizes={sizes} type='image/avif' />
      <source srcSet={generateSrcSet(src, 'webp')} sizes={sizes} type='image/webp' />

      {/* Fallback */}
      <img
        src={`${src}?w=${width}&h=${height}&f=jpeg&q=75`}
        srcSet={generateSrcSet(src, 'jpeg')}
        alt={alt}
        width={width}
        height={height}
        sizes={sizes}
        loading={priority ? 'eager' : 'lazy'}
        decoding='async'
        style={{
          maxWidth: '100%',
          height: 'auto',
        }}
      />
    </picture>
  )
}

// Image preloading strategy
class ImagePreloader {
  private cache = new Map<string, Promise<HTMLImageElement>>()

  preload(src: string, priority: 'high' | 'low' = 'low'): Promise<HTMLImageElement> {
    if (this.cache.has(src)) {
      return this.cache.get(src)!
    }

    const promise = new Promise<HTMLImageElement>((resolve, reject) => {
      const img = new Image()

      img.onload = () => resolve(img)
      img.onerror = reject

      // Set loading priority
      if ('loading' in img) {
        img.loading = priority === 'high' ? 'eager' : 'lazy'
      }

      img.src = src
    })

    this.cache.set(src, promise)
    return promise
  }

  preloadCritical(urls: string[]): Promise<HTMLImageElement[]> {
    return Promise.all(urls.map(url => this.preload(url, 'high')))
  }
}

// Bundle optimization utilities
const imagePreloader = new ImagePreloader()

// Preload critical images
export function preloadCriticalImages() {
  const criticalImages = ['/images/hero-banner.jpg', '/images/logo.png', '/images/critical-cta.jpg']

  return imagePreloader.preloadCritical(criticalImages)
}
```

### Web Performance APIs

```typescript
interface PerformanceMetrics {
  fcp: number // First Contentful Paint
  lcp: number // Largest Contentful Paint
  fid: number // First Input Delay
  cls: number // Cumulative Layout Shift
  ttfb: number // Time to First Byte
  domContentLoaded: number
  loadComplete: number
}

class PerformanceMonitor {
  private metrics: Partial<PerformanceMetrics> = {}
  private observer: PerformanceObserver | null = null

  constructor() {
    this.initializeObserver()
    this.measureNavigationTiming()
  }

  private initializeObserver(): void {
    if ('PerformanceObserver' in window) {
      this.observer = new PerformanceObserver(list => {
        const entries = list.getEntries()

        entries.forEach(entry => {
          if (entry.entryType === 'paint') {
            if (entry.name === 'first-contentful-paint') {
              this.metrics.fcp = entry.startTime
            }
          }

          if (entry.entryType === 'largest-contentful-paint') {
            this.metrics.lcp = entry.startTime
          }

          if (entry.entryType === 'first-input') {
            this.metrics.fid = (entry as PerformanceEventTiming).processingStart - entry.startTime
          }

          if (entry.entryType === 'layout-shift' && !(entry as any).hadRecentInput) {
            this.metrics.cls = (this.metrics.cls || 0) + (entry as any).value
          }
        })

        this.reportMetrics()
      })

      // Observe performance entries
      this.observer.observe({
        entryTypes: ['paint', 'largest-contentful-paint', 'first-input', 'layout-shift'],
      })
    }
  }

  private measureNavigationTiming(): void {
    window.addEventListener('load', () => {
      const navigation = performance.getEntriesByType(
        'navigation',
      )[0] as PerformanceNavigationTiming

      this.metrics.ttfb = navigation.responseStart - navigation.fetchStart
      this.metrics.domContentLoaded = navigation.domContentLoadedEventEnd - navigation.fetchStart
      this.metrics.loadComplete = navigation.loadEventEnd - navigation.fetchStart
    })
  }

  private reportMetrics(): void {
    // Report to analytics service
    if (this.isCompleteMetrics()) {
      this.sendToAnalytics(this.metrics as PerformanceMetrics)
    }
  }

  private isCompleteMetrics(): boolean {
    const requiredMetrics = ['fcp', 'lcp', 'fid', 'cls', 'ttfb']
    return requiredMetrics.every(
      metric => this.metrics[metric as keyof PerformanceMetrics] !== undefined,
    )
  }

  private sendToAnalytics(metrics: PerformanceMetrics): void {
    // Send to your analytics service
    fetch('/api/analytics/performance', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        metrics,
        url: window.location.href,
        userAgent: navigator.userAgent,
        timestamp: Date.now(),
      }),
    }).catch(console.error)
  }

  getMetrics(): Partial<PerformanceMetrics> {
    return { ...this.metrics }
  }

  disconnect(): void {
    if (this.observer) {
      this.observer.disconnect()
    }
  }
}

// Usage
const performanceMonitor = new PerformanceMonitor()

// Web Vitals thresholds
const PERFORMANCE_THRESHOLDS = {
  fcp: { good: 1800, poor: 3000 }, // First Contentful Paint
  lcp: { good: 2500, poor: 4000 }, // Largest Contentful Paint
  fid: { good: 100, poor: 300 }, // First Input Delay
  cls: { good: 0.1, poor: 0.25 }, // Cumulative Layout Shift
  ttfb: { good: 800, poor: 1800 }, // Time to First Byte
}
```

## Backend Performance Patterns

### Database Query Optimization

```typescript
interface QueryOptimizationStrategy {
  indexing: IndexStrategy
  caching: CacheStrategy
  pagination: PaginationStrategy
  batching: BatchingStrategy
}

// Efficient pagination with cursor-based approach
class CursorPagination {
  async paginate<T>(
    model: any,
    options: {
      cursor?: string
      limit: number
      orderBy: Record<string, 'asc' | 'desc'>
      where?: Record<string, any>
      include?: Record<string, any>
    },
  ): Promise<PaginatedResult<T>> {
    const { cursor, limit, orderBy, where, include } = options

    // Add one extra item to check if there's a next page
    const items = await model.findMany({
      take: limit + 1,
      cursor: cursor ? { id: cursor } : undefined,
      orderBy,
      where,
      include,
    })

    const hasNextPage = items.length > limit
    const resultItems = hasNextPage ? items.slice(0, -1) : items
    const nextCursor = hasNextPage ? resultItems[resultItems.length - 1].id : null

    return {
      items: resultItems,
      hasNextPage,
      nextCursor,
      totalCount: await this.getTotalCount(model, where),
    }
  }

  private async getTotalCount(model: any, where?: Record<string, any>): Promise<number> {
    return model.count({ where })
  }
}

// Query batching to prevent N+1 problems
class DataLoader<K, V> {
  private batchLoadFn: (keys: K[]) => Promise<V[]>
  private cache = new Map<K, Promise<V>>()
  private batch: K[] = []
  private batchScheduler: NodeJS.Timeout | null = null

  constructor(batchLoadFn: (keys: K[]) => Promise<V[]>) {
    this.batchLoadFn = batchLoadFn
  }

  load(key: K): Promise<V> {
    if (this.cache.has(key)) {
      return this.cache.get(key)!
    }

    const promise = new Promise<V>((resolve, reject) => {
      this.batch.push(key)

      if (!this.batchScheduler) {
        this.batchScheduler = setImmediate(() => {
          this.executeBatch()
        })
      }
    })

    this.cache.set(key, promise)
    return promise
  }

  private async executeBatch(): Promise<void> {
    const currentBatch = [...this.batch]
    this.batch = []
    this.batchScheduler = null

    try {
      const results = await this.batchLoadFn(currentBatch)

      currentBatch.forEach((key, index) => {
        const promise = this.cache.get(key)
        if (promise) {
          ;(promise as any).resolve(results[index])
        }
      })
    } catch (error) {
      currentBatch.forEach(key => {
        const promise = this.cache.get(key)
        if (promise) {
          ;(promise as any).reject(error)
        }
      })
    }
  }

  clear(): void {
    this.cache.clear()
  }
}

// Usage example
const userLoader = new DataLoader<string, User>(async (userIds: string[]) => {
  return prisma.user.findMany({
    where: { id: { in: userIds } },
    orderBy: { id: 'asc' },
  })
})

// Optimized repository methods
class OptimizedUserRepository {
  async findUsersWithPosts(userIds: string[]): Promise<UserWithPosts[]> {
    // Batch load users and their posts separately
    const [users, posts] = await Promise.all([
      prisma.user.findMany({
        where: { id: { in: userIds } },
      }),
      prisma.post.findMany({
        where: { authorId: { in: userIds } },
        include: { author: true },
      }),
    ])

    // Group posts by author
    const postsByUser = posts.reduce((acc, post) => {
      if (!acc[post.authorId]) {
        acc[post.authorId] = []
      }
      acc[post.authorId].push(post)
      return acc
    }, {} as Record<string, Post[]>)

    return users.map(user => ({
      ...user,
      posts: postsByUser[user.id] || [],
    }))
  }

  async getTopContributors(limit: number = 10): Promise<UserStats[]> {
    // Use raw SQL for complex aggregations
    return prisma.$queryRaw`
      SELECT 
        u.id,
        u.name,
        u.email,
        COUNT(DISTINCT p.id) as post_count,
        COUNT(DISTINCT c.id) as comment_count,
        (COUNT(DISTINCT p.id) + COUNT(DISTINCT c.id)) as total_contributions
      FROM users u
      LEFT JOIN posts p ON u.id = p.author_id AND p.deleted_at IS NULL
      LEFT JOIN comments c ON u.id = c.author_id AND c.deleted_at IS NULL
      WHERE u.is_active = true
      GROUP BY u.id, u.name, u.email
      HAVING total_contributions > 0
      ORDER BY total_contributions DESC
      LIMIT ${limit}
    `
  }
}
```

### Caching Strategies

```typescript
interface CacheStrategy {
  levels: CacheLevel[]
  invalidation: InvalidationStrategy
  warming: WarmingStrategy
  monitoring: CacheMonitoring
}

enum CacheLevel {
  MEMORY = 'memory',
  REDIS = 'redis',
  CDN = 'cdn',
  DATABASE = 'database',
}

// Multi-level cache implementation
class MultiLevelCache {
  private memoryCache: Map<string, CacheEntry> = new Map()
  private redisClient: Redis
  private defaultTTL: number = 3600 // 1 hour

  constructor(redisClient: Redis) {
    this.redisClient = redisClient
    this.startCleanupInterval()
  }

  async get<T>(key: string): Promise<T | null> {
    // Level 1: Memory cache
    const memoryEntry = this.memoryCache.get(key)
    if (memoryEntry && !this.isExpired(memoryEntry)) {
      return memoryEntry.value as T
    }

    // Level 2: Redis cache
    try {
      const redisValue = await this.redisClient.get(key)
      if (redisValue) {
        const parsed = JSON.parse(redisValue) as T

        // Populate memory cache
        this.memoryCache.set(key, {
          value: parsed,
          expiry: Date.now() + this.defaultTTL * 1000,
        })

        return parsed
      }
    } catch (error) {
      console.error('Redis cache error:', error)
    }

    return null
  }

  async set<T>(key: string, value: T, ttl: number = this.defaultTTL): Promise<void> {
    const expiry = Date.now() + ttl * 1000

    // Set in memory cache
    this.memoryCache.set(key, { value, expiry })

    // Set in Redis cache
    try {
      await this.redisClient.setex(key, ttl, JSON.stringify(value))
    } catch (error) {
      console.error('Redis cache set error:', error)
    }
  }

  async invalidate(pattern: string): Promise<void> {
    // Clear memory cache
    for (const key of this.memoryCache.keys()) {
      if (key.match(pattern)) {
        this.memoryCache.delete(key)
      }
    }

    // Clear Redis cache
    try {
      const keys = await this.redisClient.keys(pattern)
      if (keys.length > 0) {
        await this.redisClient.del(...keys)
      }
    } catch (error) {
      console.error('Redis cache invalidation error:', error)
    }
  }

  private isExpired(entry: CacheEntry): boolean {
    return Date.now() > entry.expiry
  }

  private startCleanupInterval(): void {
    setInterval(() => {
      const now = Date.now()
      for (const [key, entry] of this.memoryCache.entries()) {
        if (now > entry.expiry) {
          this.memoryCache.delete(key)
        }
      }
    }, 60000) // Cleanup every minute
  }
}

// Cache-aside pattern implementation
class CachedUserService {
  private cache: MultiLevelCache
  private userRepository: UserRepository

  constructor(cache: MultiLevelCache, userRepository: UserRepository) {
    this.cache = cache
    this.userRepository = userRepository
  }

  async getUserById(id: string): Promise<User | null> {
    const cacheKey = `user:${id}`

    // Try cache first
    let user = await this.cache.get<User>(cacheKey)
    if (user) {
      return user
    }

    // Fallback to database
    user = await this.userRepository.findById(id)
    if (user) {
      await this.cache.set(cacheKey, user, 1800) // 30 minutes
    }

    return user
  }

  async updateUser(id: string, data: Partial<User>): Promise<User> {
    const user = await this.userRepository.update(id, data)

    // Invalidate cache
    await this.cache.invalidate(`user:${id}`)
    await this.cache.invalidate(`user_posts:${id}`)

    return user
  }

  async getUserPosts(userId: string, limit: number = 10): Promise<Post[]> {
    const cacheKey = `user_posts:${userId}:${limit}`

    let posts = await this.cache.get<Post[]>(cacheKey)
    if (posts) {
      return posts
    }

    posts = await this.userRepository.getUserPosts(userId, limit)
    if (posts) {
      await this.cache.set(cacheKey, posts, 600) // 10 minutes
    }

    return posts || []
  }
}
```

### API Response Optimization

```typescript
interface ResponseOptimization {
  compression: CompressionConfig
  serialization: SerializationConfig
  streaming: StreamingConfig
  batching: BatchingConfig
}

// Response compression middleware
import compression from 'compression'
import { Request, Response, NextFunction } from 'express'

function createCompressionMiddleware() {
  return compression({
    filter: (req: Request, res: Response) => {
      // Don't compress responses if this request asks for 'no transform'
      if (req.headers['cache-control'] && req.headers['cache-control'].includes('no-transform')) {
        return false
      }

      // Compress if response is larger than 1KB
      return compression.filter(req, res)
    },
    level: 6, // Compression level (1-9)
    threshold: 1024, // Only compress if larger than 1KB
    chunkSize: 16 * 1024, // 16KB chunks
  })
}

// Response streaming for large datasets
class StreamingResponseHandler {
  async streamUsers(req: Request, res: Response): Promise<void> {
    res.setHeader('Content-Type', 'application/json')
    res.setHeader('Transfer-Encoding', 'chunked')

    try {
      res.write('{"users":[')

      let isFirst = true
      const batchSize = 100
      let offset = 0

      while (true) {
        const users = await this.userRepository.findMany({
          skip: offset,
          take: batchSize,
        })

        if (users.length === 0) break

        for (const user of users) {
          if (!isFirst) {
            res.write(',')
          }
          res.write(JSON.stringify(user))
          isFirst = false
        }

        offset += batchSize

        // Allow other operations to process
        await new Promise(resolve => setImmediate(resolve))
      }

      res.write(']}')
      res.end()
    } catch (error) {
      if (!res.headersSent) {
        res.status(500).json({ error: 'Streaming failed' })
      } else {
        res.end()
      }
    }
  }
}

// GraphQL DataLoader pattern for batching
interface GraphQLContext {
  dataloaders: {
    userLoader: DataLoader<string, User>
    postsByUserLoader: DataLoader<string, Post[]>
  }
}

function createDataLoaders(): GraphQLContext['dataloaders'] {
  return {
    userLoader: new DataLoader<string, User>(async userIds => {
      const users = await prisma.user.findMany({
        where: { id: { in: userIds as string[] } },
      })

      // Ensure order matches input order
      return userIds.map(id => users.find(user => user.id === id)!)
    }),

    postsByUserLoader: new DataLoader<string, Post[]>(async userIds => {
      const posts = await prisma.post.findMany({
        where: { authorId: { in: userIds as string[] } },
        orderBy: { createdAt: 'desc' },
      })

      // Group posts by user ID
      const postsByUser = posts.reduce((acc, post) => {
        if (!acc[post.authorId]) {
          acc[post.authorId] = []
        }
        acc[post.authorId].push(post)
        return acc
      }, {} as Record<string, Post[]>)

      return userIds.map(id => postsByUser[id] || [])
    }),
  }
}
```

## Database Performance Patterns

### Index Optimization

```sql
-- Composite indexes for common query patterns
CREATE INDEX CONCURRENTLY idx_posts_author_created
ON posts (author_id, created_at DESC)
WHERE deleted_at IS NULL;

-- Partial indexes for filtered queries
CREATE INDEX CONCURRENTLY idx_users_active_email
ON users (email)
WHERE is_active = true AND deleted_at IS NULL;

-- Covering indexes to avoid table lookups
CREATE INDEX CONCURRENTLY idx_posts_list_covering
ON posts (author_id, created_at DESC)
INCLUDE (title, summary, view_count)
WHERE deleted_at IS NULL;

-- Expression indexes for computed values
CREATE INDEX CONCURRENTLY idx_users_lower_email
ON users (LOWER(email));

-- GIN indexes for full-text search
CREATE INDEX CONCURRENTLY idx_posts_search
ON posts USING gin(to_tsvector('english', title || ' ' || content));
```

### Query Optimization Patterns

```typescript
// Prisma query optimization examples
class OptimizedQueries {
  // Use select to limit returned fields
  async getUserSummary(id: string): Promise<UserSummary> {
    return prisma.user.findUnique({
      where: { id },
      select: {
        id: true,
        name: true,
        email: true,
        avatar: true,
        _count: {
          select: {
            posts: true,
            comments: true,
          },
        },
      },
    })
  }

  // Use include strategically to avoid N+1
  async getPostsWithAuthors(limit: number = 10): Promise<PostWithAuthor[]> {
    return prisma.post.findMany({
      take: limit,
      orderBy: { createdAt: 'desc' },
      include: {
        author: {
          select: {
            id: true,
            name: true,
            avatar: true,
          },
        },
      },
      where: {
        deletedAt: null,
      },
    })
  }

  // Use aggregations for statistics
  async getUserStatistics(): Promise<UserStatistics> {
    const [totalUsers, activeUsers, newUsersThisMonth] = await Promise.all([
      prisma.user.count(),

      prisma.user.count({
        where: {
          isActive: true,
          deletedAt: null,
        },
      }),

      prisma.user.count({
        where: {
          createdAt: {
            gte: new Date(new Date().getFullYear(), new Date().getMonth(), 1),
          },
        },
      }),
    ])

    return {
      total: totalUsers,
      active: activeUsers,
      newThisMonth: newUsersThisMonth,
      activePercentage: (activeUsers / totalUsers) * 100,
    }
  }

  // Use transactions for consistency
  async createPostWithTags(postData: CreatePostData, tagNames: string[]): Promise<PostWithTags> {
    return prisma.$transaction(async tx => {
      // Find or create tags
      const tags = await Promise.all(
        tagNames.map(name =>
          tx.tag.upsert({
            where: { name },
            update: {},
            create: { name },
          }),
        ),
      )

      // Create post
      const post = await tx.post.create({
        data: {
          ...postData,
          tags: {
            connect: tags.map(tag => ({ id: tag.id })),
          },
        },
        include: {
          tags: true,
          author: {
            select: { id: true, name: true },
          },
        },
      })

      return post
    })
  }
}
```

## Monitoring and Profiling

### Performance Monitoring

```typescript
interface PerformanceAlert {
  type: 'response_time' | 'error_rate' | 'throughput' | 'resource_usage'
  threshold: number
  current_value: number
  timestamp: string
  context: Record<string, any>
}

class PerformanceMonitoringService {
  private metrics: Map<string, PerformanceMetric[]> = new Map()
  private alertThresholds: Record<string, number> = {
    response_time_p95: 1000, // 1 second
    error_rate: 0.05, // 5%
    cpu_usage: 0.8, // 80%
    memory_usage: 0.85, // 85%
    db_connection_pool: 0.9, // 90%
  }

  recordMetric(name: string, value: number, labels?: Record<string, string>): void {
    const metric: PerformanceMetric = {
      name,
      value,
      timestamp: Date.now(),
      labels: labels || {},
    }

    if (!this.metrics.has(name)) {
      this.metrics.set(name, [])
    }

    const metrics = this.metrics.get(name)!
    metrics.push(metric)

    // Keep only last 1000 metrics per type
    if (metrics.length > 1000) {
      metrics.shift()
    }

    this.checkAlerts(name, value)
  }

  private checkAlerts(metricName: string, value: number): void {
    const threshold = this.alertThresholds[metricName]
    if (threshold && value > threshold) {
      this.sendAlert({
        type: metricName as any,
        threshold,
        current_value: value,
        timestamp: new Date().toISOString(),
        context: { metric_name: metricName },
      })
    }
  }

  private sendAlert(alert: PerformanceAlert): void {
    // Send to monitoring service (e.g., PagerDuty, Slack)
    console.warn('Performance Alert:', alert)
  }

  getMetrics(name: string, timeRange?: { start: number; end: number }): PerformanceMetric[] {
    const metrics = this.metrics.get(name) || []

    if (!timeRange) return metrics

    return metrics.filter(
      metric => metric.timestamp >= timeRange.start && metric.timestamp <= timeRange.end,
    )
  }

  calculatePercentile(name: string, percentile: number): number {
    const metrics = this.getMetrics(name)
    if (metrics.length === 0) return 0

    const sorted = metrics.map(m => m.value).sort((a, b) => a - b)
    const index = Math.ceil((percentile / 100) * sorted.length) - 1
    return sorted[index]
  }
}

// Express middleware for request monitoring
function performanceMonitoringMiddleware(monitor: PerformanceMonitoringService) {
  return (req: Request, res: Response, next: NextFunction) => {
    const startTime = Date.now()

    res.on('finish', () => {
      const duration = Date.now() - startTime
      const route = req.route?.path || req.path

      monitor.recordMetric('http_request_duration', duration, {
        method: req.method,
        route,
        status_code: res.statusCode.toString(),
      })

      monitor.recordMetric('http_requests_total', 1, {
        method: req.method,
        route,
        status_code: res.statusCode.toString(),
      })

      if (res.statusCode >= 400) {
        monitor.recordMetric('http_errors_total', 1, {
          method: req.method,
          route,
          status_code: res.statusCode.toString(),
        })
      }
    })

    next()
  }
}
```

## Related Concepts

- **Quality Standards**: Performance quality metrics and thresholds
- **Testing Strategy**: Performance testing and load testing
- **Database Integration**: Database optimization and query performance
- **External Services**: Third-party service performance considerations
- **Automated Gates**: Performance quality gates in CI/CD

## Tools and Libraries

- **React Virtual**: Virtual scrolling for large lists
- **TanStack Query**: Intelligent data fetching and caching
- **Redis**: High-performance caching layer
- **DataLoader**: Batching and caching for GraphQL
- **Lighthouse**: Web performance auditing
- **New Relic/Datadog**: Application performance monitoring

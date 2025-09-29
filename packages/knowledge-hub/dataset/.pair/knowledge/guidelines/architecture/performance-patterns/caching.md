# Caching Patterns

Strategies for implementing effective caching to improve application performance.

## When to Use

- **Slow data sources** - Database queries, external APIs, complex calculations
- **Repeated requests** - Same data requested frequently
- **Read-heavy workloads** - Much more reads than writes
- **Performance requirements** - Sub-second response times needed

## Caching Strategies

### Multi-Level Caching

```typescript
// Hierarchical caching system
export class MultiLevelCache {
  constructor(
    private l1Cache: MemoryCache, // Fastest, smallest
    private l2Cache: RedisCache, // Fast, medium size
    private l3Cache: CDNCache, // Global, largest
    private dataSource: DataSource, // Slowest, authoritative
  ) {}

  async get<T>(key: string): Promise<T | null> {
    // L1: Memory cache (fastest)
    let value = await this.l1Cache.get<T>(key)
    if (value) {
      this.recordCacheHit('L1', key)
      return value
    }

    // L2: Redis cache
    value = await this.l2Cache.get<T>(key)
    if (value) {
      this.recordCacheHit('L2', key)
      await this.l1Cache.set(key, value, { ttl: 300 }) // 5 min
      return value
    }

    // L3: CDN cache (for static/semi-static data)
    if (this.isStaticData(key)) {
      value = await this.l3Cache.get<T>(key)
      if (value) {
        this.recordCacheHit('L3', key)
        await this.l2Cache.set(key, value, { ttl: 3600 }) // 1 hour
        await this.l1Cache.set(key, value, { ttl: 300 })
        return value
      }
    }

    // Cache miss - fetch from source
    this.recordCacheMiss(key)
    value = await this.dataSource.get<T>(key)

    if (value) {
      // Populate all cache levels
      await this.populateCaches(key, value)
    }

    return value
  }

  private async populateCaches<T>(key: string, value: T): Promise<void> {
    const ttlConfig = this.getTTLConfig(key)

    await Promise.all([
      this.l1Cache.set(key, value, { ttl: ttlConfig.l1 }),
      this.l2Cache.set(key, value, { ttl: ttlConfig.l2 }),
      this.isStaticData(key)
        ? this.l3Cache.set(key, value, { ttl: ttlConfig.l3 })
        : Promise.resolve(),
    ])
  }
}
```

### Write-Through Pattern

```typescript
// Always write to cache and storage
export class WriteThroughCache<T> {
  constructor(private cache: Cache, private storage: PersistentStorage<T>) {}

  async set(key: string, value: T): Promise<void> {
    // Write to both cache and storage synchronously
    await Promise.all([this.cache.set(key, value), this.storage.save(key, value)])
  }

  async get(key: string): Promise<T | null> {
    // Try cache first
    let value = await this.cache.get<T>(key)

    if (!value) {
      // Cache miss - get from storage
      value = await this.storage.get(key)
      if (value) {
        // Populate cache for next time
        await this.cache.set(key, value)
      }
    }

    return value
  }
}
```

### Write-Behind Pattern

```typescript
// Write to cache immediately, storage asynchronously
export class WriteBehindCache<T> {
  private writeQueue = new Map<string, T>()
  private flushTimer: NodeJS.Timeout | null = null

  constructor(
    private cache: Cache,
    private storage: PersistentStorage<T>,
    private flushInterval = 5000, // 5 seconds
  ) {
    this.startFlushTimer()
  }

  async set(key: string, value: T): Promise<void> {
    // Write to cache immediately
    await this.cache.set(key, value)

    // Queue for async storage write
    this.writeQueue.set(key, value)
  }

  private startFlushTimer(): void {
    this.flushTimer = setInterval(async () => {
      await this.flushToStorage()
    }, this.flushInterval)
  }

  private async flushToStorage(): Promise<void> {
    if (this.writeQueue.size === 0) return

    const entries = Array.from(this.writeQueue.entries())
    this.writeQueue.clear()

    // Batch write to storage
    await Promise.all(
      entries.map(([key, value]) =>
        this.storage.save(key, value).catch(error => {
          // Handle write failures - could re-queue
          console.error(`Failed to write ${key} to storage:`, error)
        }),
      ),
    )
  }
}
```

### Cache-Aside Pattern

```typescript
// Application manages cache explicitly
export class CacheAsidePattern<T> {
  constructor(private cache: Cache, private repository: Repository<T>) {}

  async get(id: string): Promise<T | null> {
    // Try cache first
    const cacheKey = this.getCacheKey(id)
    let entity = await this.cache.get<T>(cacheKey)

    if (!entity) {
      // Cache miss - get from repository
      entity = await this.repository.findById(id)

      if (entity) {
        // Store in cache for next time
        await this.cache.set(cacheKey, entity, {
          ttl: this.getTTL(entity),
        })
      }
    }

    return entity
  }

  async update(id: string, updates: Partial<T>): Promise<T> {
    // Update in repository
    const entity = await this.repository.update(id, updates)

    // Invalidate cache
    const cacheKey = this.getCacheKey(id)
    await this.cache.delete(cacheKey)

    return entity
  }

  async delete(id: string): Promise<void> {
    // Delete from repository
    await this.repository.delete(id)

    // Remove from cache
    const cacheKey = this.getCacheKey(id)
    await this.cache.delete(cacheKey)
  }
}
```

## Cache Invalidation Strategies

### Time-Based Invalidation

```typescript
export class TTLCacheManager {
  private readonly ttlStrategies = new Map<string, number>([
    ['user-profile', 1800], // 30 minutes
    ['product-catalog', 3600], // 1 hour
    ['configuration', 86400], // 24 hours
    ['session-data', 900], // 15 minutes
  ])

  getTTL(key: string): number {
    const prefix = key.split(':')[0]
    return this.ttlStrategies.get(prefix) ?? 300 // default 5 minutes
  }

  async setWithTTL<T>(key: string, value: T): Promise<void> {
    const ttl = this.getTTL(key)
    await this.cache.set(key, value, { ttl })
  }
}
```

### Event-Based Invalidation

```typescript
export class EventDrivenCacheInvalidation {
  constructor(private cache: Cache, private eventBus: EventBus) {
    this.subscribeToInvalidationEvents()
  }

  private subscribeToInvalidationEvents(): void {
    this.eventBus.subscribe('user.updated', async event => {
      await this.invalidateUserCache(event.userId)
    })

    this.eventBus.subscribe('product.updated', async event => {
      await this.invalidateProductCache(event.productId)
    })

    this.eventBus.subscribe('category.updated', async event => {
      await this.invalidateCategoryCache(event.categoryId)
    })
  }

  private async invalidateUserCache(userId: string): Promise<void> {
    const patterns = [`user:${userId}:*`, `user-orders:${userId}:*`, `user-preferences:${userId}:*`]

    await Promise.all(patterns.map(pattern => this.cache.deletePattern(pattern)))
  }
}
```

## Cache Patterns by Use Case

### Database Query Caching

```typescript
export class QueryResultCache {
  constructor(private cache: Cache, private database: Database) {}

  async executeQuery<T>(query: string, params: any[] = [], cacheKey?: string): Promise<T[]> {
    const key = cacheKey ?? this.generateQueryKey(query, params)

    // Try cache first
    let results = await this.cache.get<T[]>(key)

    if (!results) {
      // Execute query
      results = await this.database.query<T>(query, params)

      // Cache results with appropriate TTL
      const ttl = this.getQueryTTL(query)
      await this.cache.set(key, results, { ttl })
    }

    return results
  }

  private generateQueryKey(query: string, params: any[]): string {
    const queryHash = this.hashQuery(query)
    const paramsHash = this.hashParams(params)
    return `query:${queryHash}:${paramsHash}`
  }

  private getQueryTTL(query: string): number {
    // Different TTLs based on query type
    if (query.includes('configuration')) return 3600
    if (query.includes('user_sessions')) return 300
    if (query.includes('products')) return 1800
    return 600 // default 10 minutes
  }
}
```

### API Response Caching

```typescript
export class APIResponseCache {
  constructor(private cache: Cache, private httpClient: HttpClient) {}

  async get<T>(url: string, options: RequestOptions = {}): Promise<T> {
    const cacheKey = this.generateCacheKey(url, options)

    // Check cache first
    let response = await this.cache.get<T>(cacheKey)

    if (!response) {
      // Make API call
      response = await this.httpClient.get<T>(url, options)

      // Cache based on response headers or URL patterns
      const ttl = this.getTTLFromResponse(response, url)
      if (ttl > 0) {
        await this.cache.set(cacheKey, response, { ttl })
      }
    }

    return response
  }

  private getTTLFromResponse(response: any, url: string): number {
    // Check Cache-Control header
    const cacheControl = response.headers?.['cache-control']
    if (cacheControl) {
      const maxAge = this.parseCacheControl(cacheControl)
      if (maxAge > 0) return maxAge
    }

    // Fallback to URL-based rules
    if (url.includes('/static/')) return 86400 // 24 hours
    if (url.includes('/api/v1/config')) return 3600 // 1 hour
    if (url.includes('/api/v1/products')) return 1800 // 30 minutes

    return 300 // default 5 minutes
  }
}
```

## Best Practices

- **Cache key design** - Use consistent, hierarchical naming
- **TTL strategy** - Different TTLs for different data types
- **Cache warming** - Pre-populate frequently accessed data
- **Monitoring** - Track hit rates, miss rates, and performance
- **Graceful degradation** - Handle cache failures gracefully
- **Memory management** - Implement eviction policies
- **Security** - Don't cache sensitive data inappropriately

## Common Pitfalls

- **Cache stampede** - Multiple requests for same expired key
- **Hot key problem** - One key gets too much traffic
- **Cache inconsistency** - Stale data due to poor invalidation
- **Memory leaks** - Unbounded cache growth
- **Over-caching** - Caching data that changes frequently

## Related Patterns

- [Database Optimization](database.md) - Query optimization
- [Memory Management](memory.md) - Memory usage patterns
- [Load Balancing](../scaling-patterns/load-balancing.md) - Distributing cache load
- [Circuit Breaker](../scaling-patterns/circuit-breaker.md) - Handling cache failures

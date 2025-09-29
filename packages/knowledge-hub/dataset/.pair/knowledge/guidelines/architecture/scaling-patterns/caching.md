# Multi-Level Caching Patterns

Hierarchical caching strategies for optimal performance and scalability.

## When to Use

- **Frequent data access** patterns
- **Performance optimization** needs
- **Database load reduction**
- **Distributed system caching**

## Multi-Level Caching Architecture

```typescript
export class CacheManager {
  constructor(
    private l1Cache: MemoryCache,    // In-memory (fastest)
    private l2Cache: RedisCache,     // Distributed (medium)
    private l3Cache: DatabaseCache   // Persistent (slowest)
  ) {}
  
  async get<T>(key: string): Promise<T | null> {
    // L1 Cache (Memory)
    let value = await this.l1Cache.get<T>(key)
    if (value) return value
    
    // L2 Cache (Redis)
    value = await this.l2Cache.get<T>(key)
    if (value) {
      await this.l1Cache.set(key, value, 300) // 5 minutes
      return value
    }
    
    // L3 Cache (Database)
    value = await this.l3Cache.get<T>(key)
    if (value) {
      await this.l2Cache.set(key, value, 3600) // 1 hour
      await this.l1Cache.set(key, value, 300)  // 5 minutes
      return value
    }
    
    return null
  }
  
  async set<T>(key: string, value: T, ttl?: number): Promise<void> {
    await Promise.all([
      this.l1Cache.set(key, value, Math.min(ttl || 300, 300)),
      this.l2Cache.set(key, value, ttl || 3600),
      this.l3Cache.set(key, value, ttl)
    ])
  }
  
  async invalidate(key: string): Promise<void> {
    await Promise.all([
      this.l1Cache.delete(key),
      this.l2Cache.delete(key),
      this.l3Cache.delete(key)
    ])
  }
}
```

## Cache-Aside Pattern

```typescript
export class UserService {
  constructor(
    private userRepository: UserRepository,
    private cache: CacheManager
  ) {}
  
  async getUserById(id: string): Promise<User | null> {
    const cacheKey = `user:${id}`
    
    // Try cache first
    let user = await this.cache.get<User>(cacheKey)
    if (user) return user
    
    // Cache miss - get from database
    user = await this.userRepository.findById(id)
    if (user) {
      // Store in cache for future requests
      await this.cache.set(cacheKey, user, 3600) // 1 hour TTL
    }
    
    return user
  }
  
  async updateUser(id: string, updates: Partial<User>): Promise<User> {
    const user = await this.userRepository.update(id, updates)
    
    // Invalidate cache after update
    const cacheKey = `user:${id}`
    await this.cache.invalidate(cacheKey)
    
    return user
  }
}
```

## Write-Through Cache Pattern

```typescript
export class WriteThroughUserService {
  constructor(
    private userRepository: UserRepository,
    private cache: CacheManager
  ) {}
  
  async updateUser(id: string, updates: Partial<User>): Promise<User> {
    // Update database first
    const user = await this.userRepository.update(id, updates)
    
    // Then update cache (write-through)
    const cacheKey = `user:${id}`
    await this.cache.set(cacheKey, user, 3600)
    
    return user
  }
}
```

## Cache Levels Comparison

| Level | Speed | Capacity | Scope | TTL |
|-------|-------|----------|-------|-----|
| L1 (Memory) | Fastest | Smallest | Single instance | 5 minutes |
| L2 (Redis) | Fast | Medium | Distributed | 1 hour |
| L3 (Database) | Medium | Large | Persistent | 24 hours |

## Caching Strategies

**Cache-Aside:** Application manages cache
**Write-Through:** Write to cache and database
**Write-Behind:** Write to cache, async to database
**Refresh-Ahead:** Proactive cache refresh

## Pros and Cons

**Pros:**
- **High performance** - Multiple speed tiers
- **Scalability** - Reduces database load
- **Flexibility** - Different strategies per level
- **Resilience** - Fallback to slower levels

**Cons:**
- **Complexity** - Multiple systems to manage
- **Consistency** - Cache invalidation challenges
- **Memory usage** - High memory requirements
- **Cost** - Multiple caching infrastructure

## Best Practices

- **TTL strategy** - Shorter TTL for higher levels
- **Cache warm-up** - Pre-populate frequently used data
- **Invalidation strategy** - Consistent cache invalidation
- **Monitoring** - Track hit rates and performance

## Related Patterns

- [Database Read Replicas](scaling-patterns-database-read-replicas.md) - Database scaling
- [CQRS Scaling](scaling-patterns-cqrs.md) - Command-query separation
- [Performance Optimization](performance-patterns.md) - Overall performance strategies

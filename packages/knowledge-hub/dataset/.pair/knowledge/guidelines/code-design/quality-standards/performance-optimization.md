# ⚡ Performance Optimization

**Focus**: Performance analysis, optimization strategies, and monitoring for scalable applications

Guidelines for writing performant code, identifying bottlenecks, and implementing optimization strategies across frontend, backend, and database layers.

## 🎯 Performance Optimization Principles

### Performance Measurement and Monitoring

```typescript
// ✅ Performance measurement infrastructure
class PerformanceMonitor {
  private metrics: Map<string, PerformanceMetric[]> = new Map()
  private readonly metricsCollector: MetricsCollector

  constructor(metricsCollector: MetricsCollector) {
    this.metricsCollector = metricsCollector
  }

  measureExecutionTime<T>(operation: string, fn: () => Promise<T>): Promise<T> {
    return this.measure(operation, fn, {
      type: MetricType.EXECUTION_TIME,
      unit: 'milliseconds',
    })
  }

  measureMemoryUsage<T>(operation: string, fn: () => Promise<T>): Promise<T> {
    return this.measure(operation, fn, {
      type: MetricType.MEMORY_USAGE,
      unit: 'bytes',
    })
  }

  measureThroughput<T>(operation: string, fn: () => Promise<T>): Promise<T> {
    return this.measure(operation, fn, {
      type: MetricType.THROUGHPUT,
      unit: 'requests_per_second',
    })
  }

  private async measure<T>(
    operation: string,
    fn: () => Promise<T>,
    config: MeasurementConfig,
  ): Promise<T> {
    const startTime = performance.now()
    const startMemory = this.getMemoryUsage()

    try {
      const result = await fn()

      const endTime = performance.now()
      const endMemory = this.getMemoryUsage()

      const metric: PerformanceMetric = {
        operation,
        type: config.type,
        value: this.calculateValue(config.type, startTime, endTime, startMemory, endMemory),
        unit: config.unit,
        timestamp: new Date(),
        success: true,
      }

      this.recordMetric(operation, metric)

      return result
    } catch (error) {
      const endTime = performance.now()

      const metric: PerformanceMetric = {
        operation,
        type: config.type,
        value: endTime - startTime,
        unit: config.unit,
        timestamp: new Date(),
        success: false,
        error: error instanceof Error ? error.message : String(error),
      }

      this.recordMetric(operation, metric)
      throw error
    }
  }

  private calculateValue(
    type: MetricType,
    startTime: number,
    endTime: number,
    startMemory: number,
    endMemory: number,
  ): number {
    switch (type) {
      case MetricType.EXECUTION_TIME:
        return endTime - startTime
      case MetricType.MEMORY_USAGE:
        return endMemory - startMemory
      case MetricType.THROUGHPUT:
        return 1000 / (endTime - startTime) // ops per second
      default:
        return endTime - startTime
    }
  }

  private getMemoryUsage(): number {
    if (typeof process !== 'undefined' && process.memoryUsage) {
      return process.memoryUsage().heapUsed
    }
    // Browser environment
    if ('memory' in performance) {
      return (performance as any).memory.usedJSHeapSize
    }
    return 0
  }

  private recordMetric(operation: string, metric: PerformanceMetric): void {
    if (!this.metrics.has(operation)) {
      this.metrics.set(operation, [])
    }

    const operationMetrics = this.metrics.get(operation)!
    operationMetrics.push(metric)

    // Keep only last 1000 metrics per operation
    if (operationMetrics.length > 1000) {
      operationMetrics.shift()
    }

    // Send to metrics collector
    this.metricsCollector.recordMetric(metric)
  }

  getMetrics(operation: string): PerformanceAnalysis {
    const metrics = this.metrics.get(operation) || []
    const successfulMetrics = metrics.filter(m => m.success)

    if (successfulMetrics.length === 0) {
      return {
        operation,
        count: 0,
        average: 0,
        median: 0,
        percentile95: 0,
        min: 0,
        max: 0,
        successRate: 0,
      }
    }

    const values = successfulMetrics.map(m => m.value).sort((a, b) => a - b)

    return {
      operation,
      count: metrics.length,
      average: values.reduce((sum, val) => sum + val, 0) / values.length,
      median: this.calculatePercentile(values, 50),
      percentile95: this.calculatePercentile(values, 95),
      min: values[0],
      max: values[values.length - 1],
      successRate: successfulMetrics.length / metrics.length,
    }
  }

  private calculatePercentile(sortedValues: number[], percentile: number): number {
    const index = Math.ceil((percentile / 100) * sortedValues.length) - 1
    return sortedValues[Math.max(0, index)]
  }

  generateReport(operations: string[]): PerformanceReport {
    const analyses = operations.map(op => this.getMetrics(op))

    return {
      timestamp: new Date(),
      analyses,
      summary: {
        totalOperations: analyses.reduce((sum, a) => sum + a.count, 0),
        averageResponseTime: analyses.reduce((sum, a) => sum + a.average, 0) / analyses.length,
        overallSuccessRate: analyses.reduce((sum, a) => sum + a.successRate, 0) / analyses.length,
        slowestOperation: analyses.reduce((prev, curr) =>
          curr.average > prev.average ? curr : prev,
        ),
        fastestOperation: analyses.reduce((prev, curr) =>
          curr.average < prev.average ? curr : prev,
        ),
      },
    }
  }
}

enum MetricType {
  EXECUTION_TIME = 'execution_time',
  MEMORY_USAGE = 'memory_usage',
  THROUGHPUT = 'throughput',
  CPU_USAGE = 'cpu_usage',
}

interface MeasurementConfig {
  readonly type: MetricType
  readonly unit: string
}

interface PerformanceMetric {
  readonly operation: string
  readonly type: MetricType
  readonly value: number
  readonly unit: string
  readonly timestamp: Date
  readonly success: boolean
  readonly error?: string
}

interface PerformanceAnalysis {
  readonly operation: string
  readonly count: number
  readonly average: number
  readonly median: number
  readonly percentile95: number
  readonly min: number
  readonly max: number
  readonly successRate: number
}

interface PerformanceReport {
  readonly timestamp: Date
  readonly analyses: PerformanceAnalysis[]
  readonly summary: {
    readonly totalOperations: number
    readonly averageResponseTime: number
    readonly overallSuccessRate: number
    readonly slowestOperation: PerformanceAnalysis
    readonly fastestOperation: PerformanceAnalysis
  }
}

// ✅ Performance benchmarking utilities
class PerformanceBenchmark {
  static async compareFunctions<T>(
    name: string,
    implementations: Record<string, () => Promise<T>>,
    iterations: number = 1000,
  ): Promise<BenchmarkResult[]> {
    const results: BenchmarkResult[] = []

    for (const [implementationName, implementation] of Object.entries(implementations)) {
      console.log(`Benchmarking ${implementationName}...`)

      const times: number[] = []
      let errors = 0

      for (let i = 0; i < iterations; i++) {
        try {
          const startTime = performance.now()
          await implementation()
          const endTime = performance.now()
          times.push(endTime - startTime)
        } catch (error) {
          errors++
        }
      }

      times.sort((a, b) => a - b)

      results.push({
        name: implementationName,
        iterations: iterations - errors,
        errors,
        average: times.reduce((sum, time) => sum + time, 0) / times.length,
        median: times[Math.floor(times.length / 2)],
        min: times[0],
        max: times[times.length - 1],
        percentile95: times[Math.floor(times.length * 0.95)],
        standardDeviation: this.calculateStandardDeviation(times),
      })
    }

    // Sort by average performance
    results.sort((a, b) => a.average - b.average)

    console.log(`\nBenchmark Results for ${name}:`)
    this.printResults(results)

    return results
  }

  private static calculateStandardDeviation(values: number[]): number {
    const average = values.reduce((sum, val) => sum + val, 0) / values.length
    const squaredDifferences = values.map(val => Math.pow(val - average, 2))
    const averageSquaredDifference =
      squaredDifferences.reduce((sum, val) => sum + val, 0) / values.length
    return Math.sqrt(averageSquaredDifference)
  }

  private static printResults(results: BenchmarkResult[]): void {
    console.table(
      results.map(result => ({
        Implementation: result.name,
        'Avg (ms)': result.average.toFixed(2),
        'Median (ms)': result.median.toFixed(2),
        'Min (ms)': result.min.toFixed(2),
        'Max (ms)': result.max.toFixed(2),
        'P95 (ms)': result.percentile95.toFixed(2),
        'Std Dev': result.standardDeviation.toFixed(2),
        'Success Rate': `${(
          (result.iterations / (result.iterations + result.errors)) *
          100
        ).toFixed(1)}%`,
      })),
    )
  }
}

interface BenchmarkResult {
  readonly name: string
  readonly iterations: number
  readonly errors: number
  readonly average: number
  readonly median: number
  readonly min: number
  readonly max: number
  readonly percentile95: number
  readonly standardDeviation: number
}
```

### Frontend Performance Optimization

```typescript
// ✅ React performance optimization patterns
class ReactPerformanceOptimizer {
  // ✅ Memoization strategies
  static readonly MemoizationPatterns = {
    // Expensive calculations
    expensiveCalculation: useMemo(() => {
      return heavyComputation(data)
    }, [data]),

    // Event handlers
    eventHandler: useCallback(
      (event: React.MouseEvent) => {
        handleClick(event, data)
      },
      [data],
    ),

    // Component memoization
    memoizedComponent: React.memo(
      ({ data, onUpdate }: Props) => {
        return <ExpensiveComponent data={data} onUpdate={onUpdate} />
      },
      (prevProps, nextProps) => {
        // Custom comparison for better performance
        return (
          prevProps.data.id === nextProps.data.id &&
          prevProps.data.version === nextProps.data.version
        )
      },
    ),
  }

  // ✅ Virtual scrolling implementation
  static createVirtualList<T>(items: T[], itemHeight: number) {
    return function VirtualList({
      height,
      renderItem,
    }: {
      height: number
      renderItem: (item: T, index: number) => React.ReactNode
    }) {
      const [scrollTop, setScrollTop] = useState(0)

      const containerHeight = height
      const totalHeight = items.length * itemHeight

      const startIndex = Math.floor(scrollTop / itemHeight)
      const endIndex = Math.min(
        startIndex + Math.ceil(containerHeight / itemHeight) + 1,
        items.length,
      )

      const visibleItems = items.slice(startIndex, endIndex)

      return (
        <div
          style={{ height: containerHeight, overflow: 'auto' }}
          onScroll={e => setScrollTop(e.currentTarget.scrollTop)}>
          <div style={{ height: totalHeight, position: 'relative' }}>
            {visibleItems.map((item, index) => (
              <div
                key={startIndex + index}
                style={{
                  position: 'absolute',
                  top: (startIndex + index) * itemHeight,
                  height: itemHeight,
                  width: '100%',
                }}>
                {renderItem(item, startIndex + index)}
              </div>
            ))}
          </div>
        </div>
      )
    }
  }

  // ✅ Image optimization
  static optimizeImages = {
    lazyLoadImage: ({ src, alt, ...props }: React.ImgHTMLAttributes<HTMLImageElement>) => {
      const [imageSrc, setImageSrc] = useState<string>()
      const [imageRef, setImageRef] = useState<HTMLImageElement>()

      useEffect(() => {
        let observer: IntersectionObserver

        if (imageRef && imageSrc !== src) {
          observer = new IntersectionObserver(
            entries => {
              entries.forEach(entry => {
                if (entry.isIntersecting) {
                  setImageSrc(src)
                  observer.unobserve(imageRef)
                }
              })
            },
            { threshold: 0.1 },
          )

          observer.observe(imageRef)
        }

        return () => {
          if (observer && imageRef) {
            observer.unobserve(imageRef)
          }
        }
      }, [imageRef, src, imageSrc])

      return (
        <img
          ref={setImageRef}
          src={imageSrc}
          alt={alt}
          {...props}
          style={{
            ...props.style,
            backgroundColor: imageSrc ? 'transparent' : '#f0f0f0',
          }}
        />
      )
    },

    responsiveImage: ({
      src,
      sizes = [480, 768, 1024, 1440],
      ...props
    }: {
      src: string
      sizes?: number[]
    } & React.ImgHTMLAttributes<HTMLImageElement>) => {
      const srcSet = sizes.map(size => `${src}?w=${size}&q=80 ${size}w`).join(', ')

      return (
        <img
          {...props}
          src={`${src}?w=1024&q=80`}
          srcSet={srcSet}
          sizes='(max-width: 480px) 480px, (max-width: 768px) 768px, (max-width: 1024px) 1024px, 1440px'
          loading='lazy'
          decoding='async'
        />
      )
    },
  }

  // ✅ Code splitting patterns
  static createCodeSplitComponent = <T extends Record<string, any>>(
    importFn: () => Promise<{ default: React.ComponentType<T> }>,
    fallback: React.ReactNode = <div>Loading...</div>,
  ) => {
    const Component = React.lazy(importFn)

    return (props: T) => (
      <React.Suspense fallback={fallback}>
        <Component {...props} />
      </React.Suspense>
    )
  }

  // ✅ Bundle optimization
  static readonly BundleOptimization = {
    // Tree shaking helper
    importOnlyNeeded: {
      // ❌ Imports entire library
      // import _ from 'lodash';
      // ✅ Imports only needed functions
      // import { debounce, throttle } from 'lodash';
      // import debounce from 'lodash/debounce';
    },

    // Dynamic imports for large libraries
    loadHeavyLibrary: async () => {
      const { default: heavyLibrary } = await import('heavy-library')
      return heavyLibrary
    },

    // Preload critical resources
    preloadCriticalResources: () => {
      // Preload critical fonts
      const link = document.createElement('link')
      link.rel = 'preload'
      link.href = '/fonts/critical-font.woff2'
      link.as = 'font'
      link.type = 'font/woff2'
      link.crossOrigin = 'anonymous'
      document.head.appendChild(link)
    },
  }
}

// ✅ Performance hooks
const usePerformanceOptimization = () => {
  // Debounced search
  const useDebouncedSearch = (searchTerm: string, delay: number = 300) => {
    const [debouncedValue, setDebouncedValue] = useState(searchTerm)

    useEffect(() => {
      const handler = setTimeout(() => {
        setDebouncedValue(searchTerm)
      }, delay)

      return () => {
        clearTimeout(handler)
      }
    }, [searchTerm, delay])

    return debouncedValue
  }

  // Throttled scroll
  const useThrottledScroll = (callback: (scrollY: number) => void, delay: number = 100) => {
    const [isThrottled, setIsThrottled] = useState(false)

    useEffect(() => {
      const handleScroll = () => {
        if (!isThrottled) {
          callback(window.scrollY)
          setIsThrottled(true)

          setTimeout(() => {
            setIsThrottled(false)
          }, delay)
        }
      }

      window.addEventListener('scroll', handleScroll)
      return () => window.removeEventListener('scroll', handleScroll)
    }, [callback, delay, isThrottled])
  }

  // Intersection observer for performance
  const useIntersectionObserver = (
    callback: (isIntersecting: boolean) => void,
    options?: IntersectionObserverInit,
  ) => {
    const [elementRef, setElementRef] = useState<Element | null>(null)

    useEffect(() => {
      if (!elementRef) return

      const observer = new IntersectionObserver(entries => {
        entries.forEach(entry => {
          callback(entry.isIntersecting)
        })
      }, options)

      observer.observe(elementRef)

      return () => observer.disconnect()
    }, [elementRef, callback, options])

    return setElementRef
  }

  return {
    useDebouncedSearch,
    useThrottledScroll,
    useIntersectionObserver,
  }
}
```

### Backend Performance Optimization

```typescript
// ✅ Database query optimization
class DatabaseOptimizer {
  // ✅ Query performance analysis
  static analyzeQuery(query: string, params: any[]): QueryAnalysis {
    return {
      estimatedCost: this.estimateQueryCost(query),
      indexUsage: this.analyzeIndexUsage(query),
      suggestions: this.generateOptimizationSuggestions(query),
      warningFlags: this.checkForAntiPatterns(query),
    }
  }

  // ✅ Optimized repository patterns
  static createOptimizedRepository<T extends { id: string }>() {
    return class OptimizedRepository {
      private cache = new Map<string, T>()
      private queryCache = new Map<string, T[]>()

      // Batch operations
      async findByIds(ids: string[]): Promise<T[]> {
        const uncachedIds = ids.filter(id => !this.cache.has(id))

        if (uncachedIds.length > 0) {
          // Single query instead of N+1
          const uncachedItems = await db.query('SELECT * FROM table WHERE id = ANY($1)', [
            uncachedIds,
          ])

          // Cache results
          uncachedItems.forEach(item => {
            this.cache.set(item.id, item)
          })
        }

        return ids.map(id => this.cache.get(id)!).filter(Boolean)
      }

      // Pagination with cursor
      async findPaginated(cursor?: string, limit: number = 20): Promise<PaginatedResult<T>> {
        const cacheKey = `paginated:${cursor}:${limit}`

        if (this.queryCache.has(cacheKey)) {
          return {
            items: this.queryCache.get(cacheKey)!,
            hasMore: true, // This would be calculated
            nextCursor: 'next_cursor',
          }
        }

        const query = cursor
          ? 'SELECT * FROM table WHERE id > $1 ORDER BY id LIMIT $2'
          : 'SELECT * FROM table ORDER BY id LIMIT $1'

        const params = cursor ? [cursor, limit + 1] : [limit + 1]
        const results = await db.query(query, params)

        const hasMore = results.length > limit
        const items = hasMore ? results.slice(0, -1) : results
        const nextCursor = hasMore ? items[items.length - 1].id : null

        // Cache results
        this.queryCache.set(cacheKey, items)

        return {
          items,
          hasMore,
          nextCursor,
        }
      }

      // Bulk operations
      async bulkCreate(items: Omit<T, 'id'>[]): Promise<T[]> {
        if (items.length === 0) return []

        // Use bulk insert for better performance
        const values = items.map((_, index) => `($${index * 2 + 1}, $${index * 2 + 2})`).join(', ')

        const params = items.flatMap(item => [item.name, item.description]) // Example fields

        const query = `
          INSERT INTO table (name, description) 
          VALUES ${values} 
          RETURNING *
        `

        const results = await db.query(query, params)

        // Update cache
        results.forEach(item => {
          this.cache.set(item.id, item)
        })

        return results
      }

      // Efficient updates
      async bulkUpdate(updates: Array<{ id: string; changes: Partial<T> }>): Promise<T[]> {
        if (updates.length === 0) return []

        // Use CASE statements for bulk update
        const setClauses = Object.keys(updates[0].changes).map(field => {
          const cases = updates
            .map(update => `WHEN id = '${update.id}' THEN '${update.changes[field]}'`)
            .join(' ')

          return `${field} = CASE ${cases} ELSE ${field} END`
        })

        const ids = updates.map(u => u.id)

        const query = `
          UPDATE table 
          SET ${setClauses.join(', ')}
          WHERE id = ANY($1)
          RETURNING *
        `

        const results = await db.query(query, [ids])

        // Update cache
        results.forEach(item => {
          this.cache.set(item.id, item)
        })

        return results
      }

      // Cache management
      invalidateCache(pattern?: string): void {
        if (pattern) {
          // Invalidate specific pattern
          for (const key of this.queryCache.keys()) {
            if (key.includes(pattern)) {
              this.queryCache.delete(key)
            }
          }
        } else {
          // Clear all caches
          this.cache.clear()
          this.queryCache.clear()
        }
      }
    }
  }

  // ✅ Connection pooling optimization
  static optimizeConnectionPool(config: DatabaseConfig): PoolConfig {
    const cpuCount = require('os').cpus().length

    return {
      min: Math.max(2, Math.floor(cpuCount / 2)),
      max: Math.min(cpuCount * 2, 20),
      acquireTimeoutMillis: 60000,
      createTimeoutMillis: 30000,
      destroyTimeoutMillis: 5000,
      idleTimeoutMillis: 30000,
      reapIntervalMillis: 1000,
      createRetryIntervalMillis: 200,
      propagateCreateError: false,
    }
  }

  private static estimateQueryCost(query: string): number {
    // Simplified cost estimation
    let cost = 1

    // Table scans are expensive
    if (query.toLowerCase().includes('select *')) cost *= 2

    // Joins increase cost
    const joinCount = (query.toLowerCase().match(/join/g) || []).length
    cost *= Math.pow(1.5, joinCount)

    // Subqueries increase cost
    const subqueryCount = (query.match(/\(/g) || []).length
    cost *= Math.pow(1.3, subqueryCount)

    return cost
  }

  private static analyzeIndexUsage(query: string): IndexAnalysis {
    const whereClause = query
      .toLowerCase()
      .match(/where\s+(.+?)(?:\s+order|\s+group|\s+limit|$)/)?.[1]

    if (!whereClause) {
      return { usesIndex: false, suggestedIndexes: [] }
    }

    // Extract column references
    const columns = whereClause.match(/\b\w+\b/g) || []

    return {
      usesIndex: columns.length > 0,
      suggestedIndexes: columns.map(col => `CREATE INDEX idx_${col} ON table(${col})`),
    }
  }

  private static generateOptimizationSuggestions(query: string): string[] {
    const suggestions: string[] = []

    if (query.toLowerCase().includes('select *')) {
      suggestions.push('Avoid SELECT *, specify only needed columns')
    }

    if (query.toLowerCase().includes("like '%")) {
      suggestions.push('Avoid leading wildcards in LIKE patterns, consider full-text search')
    }

    if ((query.toLowerCase().match(/join/g) || []).length > 3) {
      suggestions.push('Consider breaking complex joins into smaller queries with caching')
    }

    return suggestions
  }

  private static checkForAntiPatterns(query: string): string[] {
    const warnings: string[] = []

    if (query.toLowerCase().includes('or')) {
      warnings.push('OR conditions can prevent index usage')
    }

    if (query.toLowerCase().includes('!=') || query.toLowerCase().includes('<>')) {
      warnings.push('Inequality operators can be inefficient')
    }

    if (query.toLowerCase().includes('order by rand()')) {
      warnings.push('Random ordering is very expensive for large datasets')
    }

    return warnings
  }
}

interface QueryAnalysis {
  readonly estimatedCost: number
  readonly indexUsage: IndexAnalysis
  readonly suggestions: string[]
  readonly warningFlags: string[]
}

interface IndexAnalysis {
  readonly usesIndex: boolean
  readonly suggestedIndexes: string[]
}

// ✅ Caching strategies
class PerformanceCaching {
  private readonly redis: RedisClient
  private readonly localCache: Map<string, CacheEntry> = new Map()

  constructor(redis: RedisClient) {
    this.redis = redis

    // Cleanup local cache periodically
    setInterval(() => this.cleanupLocalCache(), 60000) // Every minute
  }

  // Multi-level caching
  async get<T>(key: string): Promise<T | null> {
    // Level 1: Memory cache
    const localEntry = this.localCache.get(key)
    if (localEntry && !this.isExpired(localEntry)) {
      return localEntry.value as T
    }

    // Level 2: Redis cache
    try {
      const redisValue = await this.redis.get(key)
      if (redisValue) {
        const parsed = JSON.parse(redisValue) as T

        // Store in local cache
        this.localCache.set(key, {
          value: parsed,
          timestamp: Date.now(),
          ttl: 300000, // 5 minutes
        })

        return parsed
      }
    } catch (error) {
      console.warn('Redis cache error:', error)
    }

    return null
  }

  async set<T>(key: string, value: T, ttl: number = 3600): Promise<void> {
    // Store in local cache
    this.localCache.set(key, {
      value,
      timestamp: Date.now(),
      ttl: Math.min(ttl * 1000, 300000), // Max 5 minutes for local cache
    })

    // Store in Redis
    try {
      await this.redis.setex(key, ttl, JSON.stringify(value))
    } catch (error) {
      console.warn('Redis cache set error:', error)
    }
  }

  // Cache-aside pattern
  async getOrSet<T>(key: string, fetcher: () => Promise<T>, ttl: number = 3600): Promise<T> {
    const cached = await this.get<T>(key)
    if (cached !== null) {
      return cached
    }

    const value = await fetcher()
    await this.set(key, value, ttl)

    return value
  }

  // Write-through caching
  async writeThrough<T>(
    key: string,
    value: T,
    persist: (value: T) => Promise<void>,
    ttl: number = 3600,
  ): Promise<void> {
    // Write to database first
    await persist(value)

    // Then update cache
    await this.set(key, value, ttl)
  }

  // Write-behind (write-back) caching
  private writeBehindQueue: Map<string, { value: any; timestamp: number }> = new Map()

  async writeBehind<T>(
    key: string,
    value: T,
    persist: (value: T) => Promise<void>,
    ttl: number = 3600,
  ): Promise<void> {
    // Update cache immediately
    await this.set(key, value, ttl)

    // Queue for background write
    this.writeBehindQueue.set(key, { value, timestamp: Date.now() })

    // Process queue periodically
    this.processWriteBehindQueue(persist)
  }

  private async processWriteBehindQueue<T>(persist: (value: T) => Promise<void>): Promise<void> {
    const batch = Array.from(this.writeBehindQueue.entries()).slice(0, 10)

    for (const [key, entry] of batch) {
      try {
        await persist(entry.value)
        this.writeBehindQueue.delete(key)
      } catch (error) {
        console.error('Write-behind error for key', key, error)

        // Retry logic could be added here
        if (Date.now() - entry.timestamp > 300000) {
          // 5 minutes
          this.writeBehindQueue.delete(key) // Remove old entries
        }
      }
    }
  }

  private isExpired(entry: CacheEntry): boolean {
    return Date.now() - entry.timestamp > entry.ttl
  }

  private cleanupLocalCache(): void {
    for (const [key, entry] of this.localCache.entries()) {
      if (this.isExpired(entry)) {
        this.localCache.delete(key)
      }
    }
  }
}

interface CacheEntry {
  readonly value: any
  readonly timestamp: number
  readonly ttl: number
}
```

## 🔗 Related Concepts

- **[Function Design](.pair/knowledge/guidelines/code-design/implementation-standards/function-design.md)** - Writing performant functions
- **[Error Handling](error-handling.md)** - Efficient error handling patterns
- **[Logging Guidelines](logging-guidelines.md)** - Performance-aware logging
- **[Testing Strategy](.pair/knowledge/guidelines/testing/testing-strategy/README.md)** - Performance testing approaches

## 🎯 Implementation Guidelines

1. **Measure First**: Always measure performance before optimizing
2. **Optimize Bottlenecks**: Focus on the most impactful performance issues
3. **Cache Strategically**: Implement appropriate caching strategies for your use case
4. **Database Optimization**: Optimize queries, use indexes, and implement connection pooling
5. **Frontend Optimization**: Use code splitting, lazy loading, and memoization
6. **Monitor Continuously**: Implement comprehensive performance monitoring
7. **Profile Regularly**: Use profiling tools to identify performance bottlenecks

## 📏 Benefits

- **User Experience**: Faster applications provide better user experience
- **Scalability**: Optimized code handles increased load more effectively
- **Cost Efficiency**: Better performance reduces infrastructure costs
- **Reliability**: Performant applications are typically more stable
- **Competitive Advantage**: Fast applications often outperform slower competitors
- **Developer Productivity**: Well-optimized development tools improve productivity

---

_Performance optimization is an ongoing process that requires measurement, analysis, and continuous improvement to deliver fast, scalable applications._

# Memory Management Patterns

Strategies for efficient memory usage and garbage collection optimization.

## When to Use

- **Memory-constrained environments** - Limited available memory
- **High allocation rates** - Frequent object creation/destruction
- **Long-running processes** - Services that run for extended periods
- **Large data processing** - Working with big datasets

## Memory Allocation Patterns

### Object Pool Pattern

```typescript
// Reusable object pool to reduce GC pressure
export class ObjectPool<T> {
  private pool: T[] = []
  private factory: () => T
  private reset: (obj: T) => void
  private maxSize: number

  constructor(
    factory: () => T,
    reset: (obj: T) => void,
    initialSize: number = 10,
    maxSize: number = 100,
  ) {
    this.factory = factory
    this.reset = reset
    this.maxSize = maxSize

    // Pre-populate pool
    for (let i = 0; i < initialSize; i++) {
      this.pool.push(factory())
    }
  }

  acquire(): T {
    const obj = this.pool.pop()
    if (obj) {
      return obj
    }

    // Pool exhausted, create new object
    return this.factory()
  }

  release(obj: T): void {
    if (this.pool.length >= this.maxSize) {
      // Pool is full, let object be garbage collected
      return
    }

    // Reset object state
    this.reset(obj)

    // Return to pool
    this.pool.push(obj)
  }

  clear(): void {
    this.pool.length = 0
  }

  get size(): number {
    return this.pool.length
  }
}

// Example: HTTP Request object pool
interface HttpRequest {
  method: string
  url: string
  headers: Map<string, string>
  body: any
  timestamp: number
}

export class HttpRequestPool {
  private pool = new ObjectPool<HttpRequest>(
    () => ({
      method: '',
      url: '',
      headers: new Map(),
      body: null,
      timestamp: 0,
    }),
    req => {
      req.method = ''
      req.url = ''
      req.headers.clear()
      req.body = null
      req.timestamp = 0
    },
    50, // initial size
    200, // max size
  )

  createRequest(method: string, url: string): HttpRequest {
    const request = this.pool.acquire()
    request.method = method
    request.url = url
    request.timestamp = Date.now()
    return request
  }

  releaseRequest(request: HttpRequest): void {
    this.pool.release(request)
  }
}
```

### Buffer Management

```typescript
// Efficient buffer management for streaming data
export class BufferManager {
  private buffers = new Map<number, Buffer[]>()
  private allocatedBytes = 0
  private maxMemory: number

  constructor(maxMemoryMB: number = 100) {
    this.maxMemory = maxMemoryMB * 1024 * 1024
  }

  allocate(size: number): Buffer {
    // Round up to next power of 2 for better reuse
    const actualSize = this.nextPowerOfTwo(size)

    // Check if we have a buffer of this size
    const sizePool = this.buffers.get(actualSize)
    if (sizePool && sizePool.length > 0) {
      return sizePool.pop()!
    }

    // Check memory limit
    if (this.allocatedBytes + actualSize > this.maxMemory) {
      this.cleanup()

      if (this.allocatedBytes + actualSize > this.maxMemory) {
        throw new Error('Out of memory')
      }
    }

    // Allocate new buffer
    const buffer = Buffer.allocUnsafe(actualSize)
    this.allocatedBytes += actualSize

    return buffer
  }

  release(buffer: Buffer): void {
    const size = buffer.length

    // Clear buffer contents for security
    buffer.fill(0)

    // Return to appropriate size pool
    let sizePool = this.buffers.get(size)
    if (!sizePool) {
      sizePool = []
      this.buffers.set(size, sizePool)
    }

    sizePool.push(buffer)
  }

  private cleanup(): void {
    // Remove excess buffers from pools
    for (const [size, pool] of this.buffers) {
      while (pool.length > 10) {
        // Keep max 10 buffers per size
        const buffer = pool.pop()!
        this.allocatedBytes -= buffer.length
      }
    }
  }

  private nextPowerOfTwo(n: number): number {
    return Math.pow(2, Math.ceil(Math.log2(n)))
  }

  getStats(): { allocatedBytes: number; poolSizes: Record<number, number> } {
    const poolSizes: Record<number, number> = {}
    for (const [size, pool] of this.buffers) {
      poolSizes[size] = pool.length
    }

    return {
      allocatedBytes: this.allocatedBytes,
      poolSizes,
    }
  }
}
```

### Streaming Data Processing

```typescript
// Memory-efficient streaming data processor
export class StreamProcessor<T, R> {
  private chunkSize: number
  private processorFn: (chunk: T[]) => Promise<R[]>
  private memoryLimit: number
  private currentMemoryUsage = 0

  constructor(
    processorFn: (chunk: T[]) => Promise<R[]>,
    chunkSize: number = 1000,
    memoryLimitMB: number = 50,
  ) {
    this.processorFn = processorFn
    this.chunkSize = chunkSize
    this.memoryLimit = memoryLimitMB * 1024 * 1024
  }

  async *processStream(dataStream: AsyncIterable<T>): AsyncGenerator<R, void, unknown> {
    let chunk: T[] = []

    for await (const item of dataStream) {
      chunk.push(item)
      this.currentMemoryUsage += this.estimateItemSize(item)

      // Process chunk when it's full or memory limit reached
      if (chunk.length >= this.chunkSize || this.currentMemoryUsage >= this.memoryLimit) {
        const results = await this.processorFn(chunk)

        // Yield results one by one to avoid accumulating in memory
        for (const result of results) {
          yield result
        }

        // Reset chunk and memory tracking
        chunk = []
        this.currentMemoryUsage = 0

        // Force garbage collection hint
        if (global.gc) {
          global.gc()
        }
      }
    }

    // Process remaining items
    if (chunk.length > 0) {
      const results = await this.processorFn(chunk)
      for (const result of results) {
        yield result
      }
    }
  }

  private estimateItemSize(item: T): number {
    // Rough estimation of object size in bytes
    if (typeof item === 'string') {
      return item.length * 2 // UTF-16
    } else if (typeof item === 'number') {
      return 8
    } else if (typeof item === 'object' && item !== null) {
      return JSON.stringify(item).length * 2
    }
    return 8 // default for primitives
  }
}

// Usage example
async function processLargeDataset() {
  const processor = new StreamProcessor<RawData, ProcessedData>(
    async chunk => {
      return chunk.map(item => ({
        id: item.id,
        processedValue: expensiveComputation(item.value),
        timestamp: Date.now(),
      }))
    },
    500, // chunk size
    25, // 25MB memory limit
  )

  const dataStream = readLargeFile() // Returns AsyncIterable<RawData>

  for await (const result of processor.processStream(dataStream)) {
    await saveResult(result)
  }
}
```

## Garbage Collection Optimization

### Generational GC Awareness

```typescript
// Design objects to work well with generational GC
export class GCOptimizedCache<T> {
  private shortTermCache = new Map<string, CacheEntry<T>>() // Young generation
  private longTermCache = new Map<string, CacheEntry<T>>() // Old generation
  private promotionThreshold = 3 // Access count to promote to long-term

  set(key: string, value: T, ttl: number = 300000): void {
    const entry: CacheEntry<T> = {
      value,
      accessCount: 1,
      createdAt: Date.now(),
      lastAccessed: Date.now(),
      ttl,
    }

    // Always start in short-term cache
    this.shortTermCache.set(key, entry)

    // Clean up periodically
    this.scheduleCleanup()
  }

  get(key: string): T | undefined {
    // Check short-term cache first
    let entry = this.shortTermCache.get(key)
    if (entry) {
      entry.accessCount++
      entry.lastAccessed = Date.now()

      // Promote to long-term if accessed frequently
      if (entry.accessCount >= this.promotionThreshold) {
        this.shortTermCache.delete(key)
        this.longTermCache.set(key, entry)
      }

      return entry.value
    }

    // Check long-term cache
    entry = this.longTermCache.get(key)
    if (entry) {
      entry.lastAccessed = Date.now()
      return entry.value
    }

    return undefined
  }

  private scheduleCleanup(): void {
    // Use requestIdleCallback to cleanup during idle time
    if (typeof requestIdleCallback !== 'undefined') {
      requestIdleCallback(() => this.cleanup())
    } else {
      setTimeout(() => this.cleanup(), 0)
    }
  }

  private cleanup(): void {
    const now = Date.now()

    // Clean short-term cache more aggressively
    for (const [key, entry] of this.shortTermCache) {
      if (now - entry.createdAt > entry.ttl) {
        this.shortTermCache.delete(key)
      }
    }

    // Clean long-term cache less frequently
    for (const [key, entry] of this.longTermCache) {
      if (now - entry.lastAccessed > entry.ttl * 2) {
        this.longTermCache.delete(key)
      }
    }
  }
}
```

### Memory-Efficient Data Structures

```typescript
// Circular buffer for fixed-size collections
export class CircularBuffer<T> {
  private buffer: (T | undefined)[]
  private head = 0
  private tail = 0
  private size = 0

  constructor(private capacity: number) {
    this.buffer = new Array(capacity)
  }

  push(item: T): T | undefined {
    const evicted = this.buffer[this.tail]
    this.buffer[this.tail] = item

    if (this.size < this.capacity) {
      this.size++
    } else {
      // Buffer is full, move head
      this.head = (this.head + 1) % this.capacity
    }

    this.tail = (this.tail + 1) % this.capacity
    return evicted
  }

  pop(): T | undefined {
    if (this.size === 0) return undefined

    this.tail = (this.tail - 1 + this.capacity) % this.capacity
    const item = this.buffer[this.tail]
    this.buffer[this.tail] = undefined // Help GC
    this.size--

    return item
  }

  shift(): T | undefined {
    if (this.size === 0) return undefined

    const item = this.buffer[this.head]
    this.buffer[this.head] = undefined // Help GC
    this.head = (this.head + 1) % this.capacity
    this.size--

    return item
  }

  clear(): void {
    // Help GC by explicitly clearing references
    for (let i = 0; i < this.capacity; i++) {
      this.buffer[i] = undefined
    }
    this.head = 0
    this.tail = 0
    this.size = 0
  }

  toArray(): T[] {
    const result: T[] = []
    for (let i = 0; i < this.size; i++) {
      const index = (this.head + i) % this.capacity
      result.push(this.buffer[index]!)
    }
    return result
  }
}

// Weak reference cache that doesn't prevent GC
export class WeakCache<T extends object> {
  private cache = new WeakMap<object, T>()
  private keyMap = new Map<string, WeakRef<object>>()
  private cleanupRegistry = new FinalizationRegistry<string>(key => {
    this.keyMap.delete(key)
  })

  set(key: string, value: T): void {
    // Use the value object itself as the weak map key
    this.cache.set(value, value)

    // Keep a weak reference for string-based lookup
    const weakRef = new WeakRef(value)
    this.keyMap.set(key, weakRef)

    // Register for cleanup when value is GC'd
    this.cleanupRegistry.register(value, key)
  }

  get(key: string): T | undefined {
    const weakRef = this.keyMap.get(key)
    if (!weakRef) return undefined

    const value = weakRef.deref()
    if (!value) {
      // Object was garbage collected
      this.keyMap.delete(key)
      return undefined
    }

    return this.cache.get(value)
  }

  has(key: string): boolean {
    const weakRef = this.keyMap.get(key)
    if (!weakRef) return false

    const value = weakRef.deref()
    if (!value) {
      this.keyMap.delete(key)
      return false
    }

    return this.cache.has(value)
  }

  delete(key: string): boolean {
    const weakRef = this.keyMap.get(key)
    if (!weakRef) return false

    const value = weakRef.deref()
    if (!value) {
      this.keyMap.delete(key)
      return false
    }

    this.cache.delete(value)
    this.keyMap.delete(key)
    return true
  }
}
```

## Memory Monitoring

### Memory Usage Tracking

```typescript
// Memory usage monitor with alerts
export class MemoryMonitor {
  private checkInterval: NodeJS.Timeout | null = null
  private listeners: Array<(usage: MemoryUsage) => void> = []
  private thresholds = {
    warning: 0.8, // 80% of heap limit
    critical: 0.9, // 90% of heap limit
  }

  start(intervalMs: number = 5000): void {
    if (this.checkInterval) return

    this.checkInterval = setInterval(() => {
      this.checkMemoryUsage()
    }, intervalMs)
  }

  stop(): void {
    if (this.checkInterval) {
      clearInterval(this.checkInterval)
      this.checkInterval = null
    }
  }

  onMemoryUsage(listener: (usage: MemoryUsage) => void): void {
    this.listeners.push(listener)
  }

  private checkMemoryUsage(): void {
    const usage = process.memoryUsage()
    const heapLimit = this.getHeapLimit()

    const memoryInfo: MemoryUsage = {
      ...usage,
      heapUsedPercent: usage.heapUsed / heapLimit,
      heapLimit,
      timestamp: Date.now(),
    }

    // Check thresholds
    if (memoryInfo.heapUsedPercent >= this.thresholds.critical) {
      this.handleCriticalMemory(memoryInfo)
    } else if (memoryInfo.heapUsedPercent >= this.thresholds.warning) {
      this.handleWarningMemory(memoryInfo)
    }

    // Notify listeners
    this.listeners.forEach(listener => listener(memoryInfo))
  }

  private handleWarningMemory(usage: MemoryUsage): void {
    console.warn('Memory usage warning:', {
      heapUsed: `${Math.round(usage.heapUsed / 1024 / 1024)}MB`,
      heapTotal: `${Math.round(usage.heapTotal / 1024 / 1024)}MB`,
      percentage: `${Math.round(usage.heapUsedPercent * 100)}%`,
    })

    // Suggest garbage collection
    if (global.gc) {
      global.gc()
    }
  }

  private handleCriticalMemory(usage: MemoryUsage): void {
    console.error('Critical memory usage:', {
      heapUsed: `${Math.round(usage.heapUsed / 1024 / 1024)}MB`,
      heapTotal: `${Math.round(usage.heapTotal / 1024 / 1024)}MB`,
      percentage: `${Math.round(usage.heapUsedPercent * 100)}%`,
    })

    // Force garbage collection
    if (global.gc) {
      global.gc()
    }

    // Emit critical memory event
    process.emit('memoryPressure', usage)
  }

  private getHeapLimit(): number {
    // V8 heap size limit (can be set with --max-old-space-size)
    return require('v8').getHeapStatistics().heap_size_limit
  }
}

interface MemoryUsage extends NodeJS.MemoryUsage {
  heapUsedPercent: number
  heapLimit: number
  timestamp: number
}
```

## Best Practices

- **Pool expensive objects** - Reuse objects that are expensive to create
- **Use appropriate data structures** - Choose memory-efficient collections
- **Monitor memory usage** - Track allocation patterns and GC behavior
- **Avoid memory leaks** - Clear references when objects are no longer needed
- **Stream large datasets** - Process data incrementally instead of loading everything
- **Optimize for GC** - Design objects to work well with generational garbage collection
- **Use weak references** - For caches that shouldn't prevent garbage collection

## Common Pitfalls

- **Memory leaks** - Holding references to objects that should be garbage collected
- **Excessive allocations** - Creating too many short-lived objects
- **Large object heap** - Objects over 85KB go to LOH and are collected differently
- **Circular references** - Can prevent garbage collection in some engines
- **Event listener leaks** - Not removing event listeners when components are destroyed
- **Closure capturing** - Accidentally capturing large objects in closures

## Related Patterns

- [Caching Patterns](caching.md) - Memory-efficient caching
- [Database Optimization](database.md) - Memory usage in data access
- [Concurrency Patterns](concurrency.md) - Memory safety in concurrent code
- [Auto-Scaling](.pair/knowledge/guidelines/architecture/system-design/scaling-patterns.md#auto-scaling) - Memory-based scaling decisions

# Concurrency Patterns

Strategies for handling concurrent operations and parallel processing effectively.

## When to Use

- **High throughput requirements** - Need to process many requests simultaneously
- **I/O bound operations** - Waiting for database, API, or file system operations
- **CPU intensive tasks** - Computations that can be parallelized
- **Real-time processing** - Event streams, live data processing

## Concurrency Control Patterns

### Thread Pool Pattern

```typescript
// Managed thread pool for concurrent task execution
export class ThreadPoolExecutor {
  private workers: Worker[] = []
  private taskQueue: Task[] = []
  private activeWorkers = 0

  constructor(private poolSize: number = 10, private maxQueueSize: number = 1000) {
    this.initializeWorkers()
  }

  async execute<T>(task: () => Promise<T>): Promise<T> {
    if (this.taskQueue.length >= this.maxQueueSize) {
      throw new Error('Task queue is full')
    }

    return new Promise((resolve, reject) => {
      const wrappedTask: Task = {
        execute: task,
        resolve,
        reject,
        submittedAt: Date.now(),
      }

      this.taskQueue.push(wrappedTask)
      this.scheduleNextTask()
    })
  }

  private scheduleNextTask(): void {
    if (this.taskQueue.length === 0 || this.activeWorkers >= this.poolSize) {
      return
    }

    const task = this.taskQueue.shift()!
    this.activeWorkers++

    this.executeTask(task).finally(() => {
      this.activeWorkers--
      this.scheduleNextTask() // Schedule next task
    })
  }

  private async executeTask(task: Task): Promise<void> {
    try {
      const result = await task.execute()
      task.resolve(result)
    } catch (error) {
      task.reject(error)
    }
  }

  async waitForCompletion(): Promise<void> {
    while (this.taskQueue.length > 0 || this.activeWorkers > 0) {
      await new Promise(resolve => setTimeout(resolve, 10))
    }
  }
}
```

### Actor Model Pattern

```typescript
// Actor-based concurrency for isolated state management
export abstract class Actor {
  private messageQueue: Message[] = []
  private isProcessing = false

  protected abstract handle(message: Message): Promise<any>

  async send(message: Message): Promise<any> {
    return new Promise((resolve, reject) => {
      this.messageQueue.push({
        ...message,
        resolve,
        reject,
      })

      this.processMessages()
    })
  }

  private async processMessages(): Promise<void> {
    if (this.isProcessing || this.messageQueue.length === 0) {
      return
    }

    this.isProcessing = true

    while (this.messageQueue.length > 0) {
      const message = this.messageQueue.shift()!

      try {
        const result = await this.handle(message)
        message.resolve?.(result)
      } catch (error) {
        message.reject?.(error)
      }
    }

    this.isProcessing = false
  }
}

// Example: Order Processing Actor
export class OrderProcessingActor extends Actor {
  private orders = new Map<string, Order>()

  protected async handle(message: Message): Promise<any> {
    switch (message.type) {
      case 'CREATE_ORDER':
        return await this.createOrder(message.data)

      case 'UPDATE_ORDER':
        return await this.updateOrder(message.data.id, message.data.updates)

      case 'GET_ORDER':
        return this.orders.get(message.data.id)

      default:
        throw new Error(`Unknown message type: ${message.type}`)
    }
  }

  private async createOrder(orderData: CreateOrderData): Promise<Order> {
    const order: Order = {
      id: generateId(),
      ...orderData,
      status: 'pending',
      createdAt: new Date(),
    }

    this.orders.set(order.id, order)

    // Simulate async processing
    await this.processPayment(order)
    await this.reserveInventory(order)

    order.status = 'confirmed'
    return order
  }
}
```

### Producer-Consumer Pattern

```typescript
// Asynchronous producer-consumer with backpressure
export class AsyncQueue<T> {
  private queue: T[] = []
  private consumers: Array<{
    resolve: (value: T) => void
    reject: (error: Error) => void
  }> = []

  constructor(
    private maxSize: number = 1000,
    private dropPolicy: 'head' | 'tail' | 'reject' = 'reject',
  ) {}

  async produce(item: T): Promise<void> {
    if (this.queue.length >= this.maxSize) {
      switch (this.dropPolicy) {
        case 'head':
          this.queue.shift() // Remove oldest
          break
        case 'tail':
          this.queue.pop() // Remove newest
          break
        case 'reject':
          throw new Error('Queue is full')
      }
    }

    this.queue.push(item)

    // Notify waiting consumer
    const consumer = this.consumers.shift()
    if (consumer) {
      const nextItem = this.queue.shift()!
      consumer.resolve(nextItem)
    }
  }

  async consume(): Promise<T> {
    // Return immediately if items available
    if (this.queue.length > 0) {
      return this.queue.shift()!
    }

    // Wait for next item
    return new Promise((resolve, reject) => {
      this.consumers.push({ resolve, reject })
    })
  }

  async consumeBatch(maxSize: number, timeout: number = 5000): Promise<T[]> {
    const batch: T[] = []
    const deadline = Date.now() + timeout

    while (batch.length < maxSize && Date.now() < deadline) {
      if (this.queue.length > 0) {
        batch.push(this.queue.shift()!)
      } else if (batch.length > 0) {
        // Return partial batch if we have some items
        break
      } else {
        // Wait for at least one item
        try {
          const item = await Promise.race([
            this.consume(),
            new Promise<never>((_, reject) =>
              setTimeout(() => reject(new Error('Timeout')), Math.max(0, deadline - Date.now())),
            ),
          ])
          batch.push(item)
        } catch (error) {
          if (batch.length > 0) break
          throw error
        }
      }
    }

    return batch
  }
}

// Usage example
export class OrderProcessor {
  private orderQueue = new AsyncQueue<Order>()
  private isProcessing = false

  async submitOrder(order: Order): Promise<void> {
    await this.orderQueue.produce(order)
    this.startProcessing()
  }

  private async startProcessing(): Promise<void> {
    if (this.isProcessing) return

    this.isProcessing = true

    try {
      while (true) {
        // Process orders in batches for efficiency
        const orders = await this.orderQueue.consumeBatch(10, 1000)
        if (orders.length === 0) break

        await this.processBatch(orders)
      }
    } finally {
      this.isProcessing = false
    }
  }
}
```

## Parallel Processing Patterns

### Fork-Join Pattern

```typescript
// Parallel processing with result aggregation
export class ForkJoinProcessor<T, R> {
  constructor(private worker: (item: T) => Promise<R>, private parallelism: number = 4) {}

  async processAll(items: T[]): Promise<R[]> {
    if (items.length === 0) return []

    const results: R[] = new Array(items.length)
    const semaphore = new Semaphore(this.parallelism)

    const promises = items.map(async (item, index) => {
      await semaphore.acquire()

      try {
        const result = await this.worker(item)
        results[index] = result
      } finally {
        semaphore.release()
      }
    })

    await Promise.all(promises)
    return results
  }

  async processWithProgress(
    items: T[],
    onProgress: (completed: number, total: number) => void,
  ): Promise<R[]> {
    if (items.length === 0) return []

    const results: R[] = new Array(items.length)
    const semaphore = new Semaphore(this.parallelism)
    let completed = 0

    const promises = items.map(async (item, index) => {
      await semaphore.acquire()

      try {
        const result = await this.worker(item)
        results[index] = result

        completed++
        onProgress(completed, items.length)
      } finally {
        semaphore.release()
      }
    })

    await Promise.all(promises)
    return results
  }
}

// Semaphore for controlling concurrency
export class Semaphore {
  private permits: number
  private waitQueue: Array<() => void> = []

  constructor(permits: number) {
    this.permits = permits
  }

  async acquire(): Promise<void> {
    if (this.permits > 0) {
      this.permits--
      return
    }

    return new Promise(resolve => {
      this.waitQueue.push(resolve)
    })
  }

  release(): void {
    const waiter = this.waitQueue.shift()
    if (waiter) {
      waiter()
    } else {
      this.permits++
    }
  }
}
```

### Pipeline Pattern

```typescript
// Processing pipeline with concurrent stages
export class ProcessingPipeline<T> {
  private stages: Stage<any, any>[] = []

  addStage<U>(
    name: string,
    processor: (input: T) => Promise<U>,
    concurrency: number = 1,
  ): ProcessingPipeline<U> {
    this.stages.push({
      name,
      processor,
      concurrency,
      queue: new AsyncQueue(1000),
    })

    return this as any
  }

  async process(inputs: T[]): Promise<any[]> {
    if (this.stages.length === 0) return inputs

    // Start all stages
    const stagePromises = this.stages.map((stage, index) => this.runStage(stage, index))

    // Feed inputs to first stage
    const firstStage = this.stages[0]
    for (const input of inputs) {
      await firstStage.queue.produce(input)
    }

    // Signal completion
    await firstStage.queue.produce(null as any) // End marker

    // Wait for pipeline completion
    await Promise.all(stagePromises)

    // Collect results from last stage
    const results: any[] = []
    const lastStage = this.stages[this.stages.length - 1]

    while (true) {
      try {
        const result = await lastStage.outputQueue.consume()
        if (result === null) break // End marker
        results.push(result)
      } catch (error) {
        break
      }
    }

    return results
  }

  private async runStage(stage: Stage<any, any>, stageIndex: number): Promise<void> {
    const workers = Array.from({ length: stage.concurrency }, () =>
      this.runStageWorker(stage, stageIndex),
    )

    await Promise.all(workers)
  }

  private async runStageWorker(stage: Stage<any, any>, stageIndex: number): Promise<void> {
    while (true) {
      const input = await stage.queue.consume()
      if (input === null) break // End marker

      try {
        const output = await stage.processor(input)

        // Send to next stage or output
        if (stageIndex < this.stages.length - 1) {
          const nextStage = this.stages[stageIndex + 1]
          await nextStage.queue.produce(output)
        } else {
          await stage.outputQueue.produce(output)
        }
      } catch (error) {
        console.error(`Error in stage ${stage.name}:`, error)
      }
    }

    // Propagate end marker
    if (stageIndex < this.stages.length - 1) {
      const nextStage = this.stages[stageIndex + 1]
      await nextStage.queue.produce(null)
    } else {
      await stage.outputQueue.produce(null)
    }
  }
}
```

## Lock-Free Programming

### Compare-And-Swap Operations

```typescript
// Lock-free counter using atomic operations
export class AtomicCounter {
  private value = 0
  private readonly maxRetries = 1000

  increment(): number {
    let retries = 0

    while (retries < this.maxRetries) {
      const current = this.value
      const next = current + 1

      // Atomic compare-and-swap
      if (this.compareAndSwap(current, next)) {
        return next
      }

      retries++
      // Brief backoff to reduce contention
      if (retries % 10 === 0) {
        setTimeout(() => {}, 0)
      }
    }

    throw new Error('Failed to increment after maximum retries')
  }

  private compareAndSwap(expected: number, newValue: number): boolean {
    // In real implementation, this would use atomic CPU instructions
    // For TypeScript/Node.js, we simulate with Atomics API where available
    if (this.value === expected) {
      this.value = newValue
      return true
    }
    return false
  }

  get(): number {
    return this.value
  }
}

// Lock-free queue using linked list
export class LockFreeQueue<T> {
  private head: Node<T>
  private tail: Node<T>

  constructor() {
    const dummy = new Node<T>(null as any)
    this.head = dummy
    this.tail = dummy
  }

  enqueue(item: T): void {
    const newNode = new Node(item)

    while (true) {
      const last = this.tail
      const next = last.next

      if (last === this.tail) {
        // Consistency check
        if (next === null) {
          // Try to link new node at end of list
          if (this.compareAndSetNext(last, null, newNode)) {
            // Enqueue succeeded, try to swing tail to new node
            this.compareAndSetTail(last, newNode)
            break
          }
        } else {
          // Queue is in intermediate state, advance tail
          this.compareAndSetTail(last, next)
        }
      }
    }
  }

  dequeue(): T | null {
    while (true) {
      const first = this.head
      const last = this.tail
      const next = first.next

      if (first === this.head) {
        // Consistency check
        if (first === last) {
          if (next === null) {
            return null // Queue is empty
          }
          // Queue is in intermediate state, advance tail
          this.compareAndSetTail(last, next)
        } else {
          if (next === null) {
            continue // Another thread is in the process
          }

          const data = next.data

          // Try to swing head to next node
          if (this.compareAndSetHead(first, next)) {
            return data
          }
        }
      }
    }
  }

  private compareAndSetNext(node: Node<T>, expected: Node<T> | null, newValue: Node<T>): boolean {
    // Atomic compare-and-swap for next pointer
    if (node.next === expected) {
      node.next = newValue
      return true
    }
    return false
  }

  private compareAndSetHead(expected: Node<T>, newValue: Node<T>): boolean {
    if (this.head === expected) {
      this.head = newValue
      return true
    }
    return false
  }

  private compareAndSetTail(expected: Node<T>, newValue: Node<T>): boolean {
    if (this.tail === expected) {
      this.tail = newValue
      return true
    }
    return false
  }
}
```

## Best Practices

- **Minimize shared state** - Reduce contention points
- **Use appropriate concurrency level** - Match thread pool size to workload
- **Implement backpressure** - Prevent memory exhaustion under load
- **Handle errors gracefully** - Don't let one failure stop all processing
- **Monitor performance** - Track throughput, latency, and resource usage
- **Test under load** - Verify behavior under concurrent access
- **Use timeouts** - Prevent indefinite blocking

## Common Pitfalls

- **Race conditions** - Unsynchronized access to shared data
- **Deadlocks** - Circular dependency on locks
- **Resource starvation** - Some threads never get resources
- **Context switching overhead** - Too many threads causing performance degradation
- **Memory leaks** - Accumulating objects in concurrent collections
- **Thundering herd** - Many threads waking up simultaneously

## Related Patterns

- [Caching Patterns](caching.md) - Cache concurrent access
- [Load Balancing](../scaling-patterns/load-balancing.md) - Distribute concurrent load
- [Circuit Breaker](../scaling-patterns/circuit-breaker.md) - Handle concurrent failures
- [Auto-Scaling](../scaling-patterns/auto-scaling.md) - Scale concurrency dynamically

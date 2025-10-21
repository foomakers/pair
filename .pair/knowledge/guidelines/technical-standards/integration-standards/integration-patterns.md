# Integration Patterns

Comprehensive framework for implementing integration patterns that facilitate communication, data exchange, and system coordination across distributed architectures.

## Purpose

Establish systematic integration patterns that ensure consistent, reliable, and scalable communication between systems, services, and components while maintaining loose coupling and high cohesion.

## Messaging Patterns

### Message Queue Integration

```typescript
interface MessageQueue {
  name: string
  durability: boolean
  exclusivity: boolean
  autoDelete: boolean
  deadLetterQueue?: string
  maxRetries: number
  ttl?: number
}

interface MessageProducer<T> {
  send(message: T, options?: SendOptions): Promise<MessageResult>
  sendBatch(messages: T[], options?: BatchSendOptions): Promise<BatchMessageResult>
}

interface MessageConsumer<T> {
  subscribe(handler: MessageHandler<T>, options?: ConsumeOptions): Promise<void>
  unsubscribe(): Promise<void>
}

class MessageBroker {
  private queues: Map<string, MessageQueue> = new Map()
  private producers: Map<string, MessageProducer<any>> = new Map()
  private consumers: Map<string, MessageConsumer<any>> = new Map()

  async createQueue(config: MessageQueue): Promise<void> {
    this.queues.set(config.name, config)

    // Implementation specific queue creation
    await this.brokerClient.assertQueue(config.name, {
      durable: config.durability,
      exclusive: config.exclusivity,
      autoDelete: config.autoDelete,
      arguments: {
        'x-message-ttl': config.ttl,
        'x-max-retries': config.maxRetries,
        ...(config.deadLetterQueue && {
          'x-dead-letter-exchange': '',
          'x-dead-letter-routing-key': config.deadLetterQueue,
        }),
      },
    })
  }

  getProducer<T>(queueName: string): MessageProducer<T> {
    if (!this.producers.has(queueName)) {
      this.producers.set(queueName, new QueueProducer<T>(queueName, this.brokerClient))
    }

    return this.producers.get(queueName)!
  }

  getConsumer<T>(queueName: string): MessageConsumer<T> {
    if (!this.consumers.has(queueName)) {
      this.consumers.set(queueName, new QueueConsumer<T>(queueName, this.brokerClient))
    }

    return this.consumers.get(queueName)!
  }
}

class QueueProducer<T> implements MessageProducer<T> {
  constructor(private queueName: string, private client: BrokerClient) {}

  async send(message: T, options?: SendOptions): Promise<MessageResult> {
    try {
      const messageId = generateMessageId()
      const timestamp = new Date()

      const envelope: MessageEnvelope<T> = {
        id: messageId,
        payload: message,
        timestamp,
        source: options?.source || process.env.SERVICE_NAME,
        correlationId: options?.correlationId,
        replyTo: options?.replyTo,
        headers: options?.headers || {},
      }

      await this.client.sendToQueue(this.queueName, Buffer.from(JSON.stringify(envelope)), {
        messageId,
        timestamp: timestamp.getTime(),
        correlationId: options?.correlationId,
        replyTo: options?.replyTo,
        headers: options?.headers,
      })

      return {
        success: true,
        messageId,
        timestamp,
      }
    } catch (error) {
      return {
        success: false,
        error: error.message,
      }
    }
  }

  async sendBatch(messages: T[], options?: BatchSendOptions): Promise<BatchMessageResult> {
    const results: MessageResult[] = []
    const batchId = generateBatchId()

    try {
      await this.client.startTransaction()

      for (let i = 0; i < messages.length; i++) {
        const messageOptions = {
          ...options,
          batchId,
          batchIndex: i,
          batchSize: messages.length,
        }

        const result = await this.send(messages[i], messageOptions)
        results.push(result)

        if (!result.success && options?.failOnError) {
          throw new Error(`Batch failed at message ${i}: ${result.error}`)
        }
      }

      await this.client.commitTransaction()

      return {
        success: true,
        batchId,
        totalMessages: messages.length,
        successfulMessages: results.filter(r => r.success).length,
        results,
      }
    } catch (error) {
      await this.client.rollbackTransaction()

      return {
        success: false,
        batchId,
        error: error.message,
        results,
      }
    }
  }
}

class QueueConsumer<T> implements MessageConsumer<T> {
  private isConsuming = false

  constructor(private queueName: string, private client: BrokerClient) {}

  async subscribe(handler: MessageHandler<T>, options?: ConsumeOptions): Promise<void> {
    if (this.isConsuming) {
      throw new Error('Consumer is already subscribed')
    }

    this.isConsuming = true

    await this.client.consume(
      this.queueName,
      async msg => {
        if (!msg) return

        try {
          const envelope: MessageEnvelope<T> = JSON.parse(msg.content.toString())

          const context: MessageContext = {
            messageId: envelope.id,
            timestamp: envelope.timestamp,
            source: envelope.source,
            correlationId: envelope.correlationId,
            headers: envelope.headers,
            attempt: msg.fields.redelivered
              ? (msg.properties.headers['x-retry-count'] || 1) + 1
              : 1,
          }

          const result = await handler(envelope.payload, context)

          if (result.success) {
            this.client.ack(msg)

            if (result.reply && envelope.replyTo) {
              await this.sendReply(envelope.replyTo, result.reply, envelope.correlationId)
            }
          } else {
            await this.handleProcessingError(msg, result.error, context)
          }
        } catch (error) {
          await this.handleProcessingError(msg, error.message, {
            messageId: 'unknown',
            timestamp: new Date(),
            source: 'unknown',
            attempt: 1,
          })
        }
      },
      {
        noAck: false,
        prefetch: options?.prefetch || 10,
      },
    )
  }

  private async handleProcessingError(
    msg: any,
    error: string,
    context: MessageContext,
  ): Promise<void> {
    const maxRetries = this.getMaxRetries(msg)

    if (context.attempt >= maxRetries) {
      // Send to dead letter queue
      console.error(`Message ${context.messageId} exceeded max retries, sending to DLQ`)
      this.client.nack(msg, false, false)
    } else {
      // Retry with backoff
      const retryDelay = this.calculateRetryDelay(context.attempt)

      setTimeout(() => {
        this.client.nack(msg, false, true)
      }, retryDelay)
    }
  }
}
```

### Event-Driven Architecture

```typescript
interface Event<T = any> {
  id: string
  type: string
  version: string
  source: string
  timestamp: Date
  data: T
  metadata?: EventMetadata
}

interface EventStore {
  append(streamId: string, events: Event[]): Promise<void>
  getEvents(streamId: string, fromVersion?: number): Promise<Event[]>
  getEventsByType(eventType: string, fromTimestamp?: Date): Promise<Event[]>
  subscribe(eventType: string, handler: EventHandler): Promise<void>
}

class EventBus {
  private handlers: Map<string, EventHandler[]> = new Map()
  private middlewares: EventMiddleware[] = []
  private eventStore: EventStore

  constructor(eventStore: EventStore) {
    this.eventStore = eventStore
  }

  addMiddleware(middleware: EventMiddleware): void {
    this.middlewares.push(middleware)
  }

  subscribe(eventType: string, handler: EventHandler): void {
    if (!this.handlers.has(eventType)) {
      this.handlers.set(eventType, [])
    }

    this.handlers.get(eventType)!.push(handler)
  }

  async publish<T>(event: Event<T>): Promise<PublishResult> {
    try {
      // Apply middleware
      let processedEvent = event
      for (const middleware of this.middlewares) {
        processedEvent = await middleware.process(processedEvent)
      }

      // Store event
      await this.eventStore.append(processedEvent.source, [processedEvent])

      // Dispatch to handlers
      const handlers = this.handlers.get(processedEvent.type) || []
      const results = await Promise.allSettled(
        handlers.map(handler => this.executeHandler(handler, processedEvent)),
      )

      const failures = results
        .filter(result => result.status === 'rejected')
        .map(result => (result as PromiseRejectedResult).reason)

      return {
        success: failures.length === 0,
        eventId: processedEvent.id,
        handlersExecuted: handlers.length,
        failures,
      }
    } catch (error) {
      return {
        success: false,
        eventId: event.id,
        error: error.message,
      }
    }
  }

  private async executeHandler(handler: EventHandler, event: Event): Promise<void> {
    const context: EventContext = {
      eventId: event.id,
      eventType: event.type,
      timestamp: event.timestamp,
      source: event.source,
      correlation: {
        id: generateCorrelationId(),
        causationId: event.id,
      },
    }

    await handler(event, context)
  }
}

// Event sourcing implementation
class EventSourcedAggregate {
  protected id: string
  protected version: number = 0
  private uncommittedEvents: Event[] = []

  constructor(id: string) {
    this.id = id
  }

  protected applyEvent<T>(eventType: string, data: T): void {
    const event: Event<T> = {
      id: generateEventId(),
      type: eventType,
      version: '1.0',
      source: this.id,
      timestamp: new Date(),
      data,
    }

    this.uncommittedEvents.push(event)
    this.when(event)
    this.version++
  }

  protected abstract when(event: Event): void

  getUncommittedEvents(): Event[] {
    return [...this.uncommittedEvents]
  }

  clearUncommittedEvents(): void {
    this.uncommittedEvents = []
  }

  replayEvents(events: Event[]): void {
    for (const event of events) {
      this.when(event)
      this.version++
    }
  }
}

// Example aggregate
class OrderAggregate extends EventSourcedAggregate {
  private status: OrderStatus = OrderStatus.PENDING
  private items: OrderItem[] = []
  private total: number = 0

  static create(customerId: string, items: OrderItem[]): OrderAggregate {
    const orderId = generateOrderId()
    const order = new OrderAggregate(orderId)

    order.applyEvent('OrderCreated', {
      orderId,
      customerId,
      items,
      total: items.reduce((sum, item) => sum + item.price * item.quantity, 0),
    })

    return order
  }

  confirm(): void {
    if (this.status !== OrderStatus.PENDING) {
      throw new Error('Order can only be confirmed from pending status')
    }

    this.applyEvent('OrderConfirmed', {
      orderId: this.id,
      confirmedAt: new Date(),
    })
  }

  protected when(event: Event): void {
    switch (event.type) {
      case 'OrderCreated':
        this.handleOrderCreated(event.data)
        break
      case 'OrderConfirmed':
        this.handleOrderConfirmed(event.data)
        break
      case 'OrderCancelled':
        this.handleOrderCancelled(event.data)
        break
    }
  }

  private handleOrderCreated(data: any): void {
    this.status = OrderStatus.PENDING
    this.items = data.items
    this.total = data.total
  }

  private handleOrderConfirmed(data: any): void {
    this.status = OrderStatus.CONFIRMED
  }

  private handleOrderCancelled(data: any): void {
    this.status = OrderStatus.CANCELLED
  }
}
```

## Service Communication Patterns

### Request-Response Pattern

```typescript
interface RequestResponseConfig {
  timeout: number
  retryPolicy: RetryPolicy
  circuitBreaker: CircuitBreakerConfig
  correlation: CorrelationConfig
}

class RequestResponseHandler {
  private pendingRequests: Map<string, PendingRequest> = new Map()
  private responseQueue: string

  constructor(
    private producer: MessageProducer<any>,
    private consumer: MessageConsumer<any>,
    private config: RequestResponseConfig,
  ) {
    this.responseQueue = `response-${generateQueueId()}`
    this.setupResponseConsumer()
  }

  async sendRequest<TRequest, TResponse>(
    targetQueue: string,
    request: TRequest,
    timeout?: number,
  ): Promise<TResponse> {
    const correlationId = generateCorrelationId()
    const requestTimeout = timeout || this.config.timeout

    return new Promise<TResponse>((resolve, reject) => {
      // Store pending request
      const pendingRequest: PendingRequest = {
        correlationId,
        resolve,
        reject,
        timestamp: Date.now(),
        timeout: setTimeout(() => {
          this.pendingRequests.delete(correlationId)
          reject(new Error(`Request timeout after ${requestTimeout}ms`))
        }, requestTimeout),
      }

      this.pendingRequests.set(correlationId, pendingRequest)

      // Send request
      this.producer
        .send(request, {
          correlationId,
          replyTo: this.responseQueue,
          headers: {
            'request-type': 'request-response',
            timeout: requestTimeout.toString(),
          },
        })
        .catch(error => {
          this.pendingRequests.delete(correlationId)
          clearTimeout(pendingRequest.timeout)
          reject(error)
        })
    })
  }

  private async setupResponseConsumer(): Promise<void> {
    await this.consumer.subscribe(async (response: any, context: MessageContext) => {
      const correlationId = context.correlationId

      if (!correlationId) {
        return { success: false, error: 'Missing correlation ID in response' }
      }

      const pendingRequest = this.pendingRequests.get(correlationId)

      if (!pendingRequest) {
        console.warn(`Received response for unknown correlation ID: ${correlationId}`)
        return { success: true } // Acknowledge but ignore
      }

      // Clean up
      this.pendingRequests.delete(correlationId)
      clearTimeout(pendingRequest.timeout)

      // Resolve the pending promise
      pendingRequest.resolve(response)

      return { success: true }
    })
  }
}

// Request handler for service side
class RequestHandler<TRequest, TResponse> {
  constructor(
    private consumer: MessageConsumer<TRequest>,
    private producer: MessageProducer<TResponse>,
    private handler: (request: TRequest, context: MessageContext) => Promise<TResponse>,
  ) {}

  async start(): Promise<void> {
    await this.consumer.subscribe(async (request: TRequest, context: MessageContext) => {
      try {
        const response = await this.handler(request, context)

        if (context.headers?.['request-type'] === 'request-response' && context.correlationId) {
          const replyTo = context.headers['reply-to']

          if (replyTo) {
            await this.producer.send(response, {
              correlationId: context.correlationId,
              headers: {
                'response-type': 'request-response',
              },
            })
          }
        }

        return { success: true }
      } catch (error) {
        return { success: false, error: error.message }
      }
    })
  }
}
```

### Publish-Subscribe Pattern

```typescript
interface Topic {
  name: string
  partitions?: number
  replicationFactor?: number
  retentionMs?: number
  cleanupPolicy?: 'delete' | 'compact'
}

interface Publisher<T> {
  publish(topic: string, message: T, options?: PublishOptions): Promise<PublishResult>
  publishBatch(
    topic: string,
    messages: T[],
    options?: BatchPublishOptions,
  ): Promise<BatchPublishResult>
}

interface Subscriber<T> {
  subscribe(topics: string[], handler: MessageHandler<T>, options?: SubscribeOptions): Promise<void>
  unsubscribe(): Promise<void>
}

class PubSubBroker {
  private topics: Map<string, Topic> = new Map()
  private publishers: Map<string, Publisher<any>> = new Map()
  private subscribers: Map<string, Subscriber<any>> = new Map()

  async createTopic(config: Topic): Promise<void> {
    this.topics.set(config.name, config)

    // Implementation specific topic creation
    await this.brokerClient.createTopic(config.name, {
      numPartitions: config.partitions || 1,
      replicationFactor: config.replicationFactor || 1,
      configEntries: {
        'retention.ms': config.retentionMs?.toString() || '604800000', // 7 days
        'cleanup.policy': config.cleanupPolicy || 'delete',
      },
    })
  }

  getPublisher<T>(clientId: string): Publisher<T> {
    if (!this.publishers.has(clientId)) {
      this.publishers.set(clientId, new TopicPublisher<T>(clientId, this.brokerClient))
    }

    return this.publishers.get(clientId)!
  }

  getSubscriber<T>(groupId: string): Subscriber<T> {
    if (!this.subscribers.has(groupId)) {
      this.subscribers.set(groupId, new TopicSubscriber<T>(groupId, this.brokerClient))
    }

    return this.subscribers.get(groupId)!
  }
}

class TopicPublisher<T> implements Publisher<T> {
  constructor(private clientId: string, private client: BrokerClient) {}

  async publish(topic: string, message: T, options?: PublishOptions): Promise<PublishResult> {
    try {
      const messageId = generateMessageId()
      const timestamp = Date.now()

      const envelope: MessageEnvelope<T> = {
        id: messageId,
        payload: message,
        timestamp: new Date(timestamp),
        source: this.clientId,
        headers: options?.headers || {},
      }

      const result = await this.client.send({
        topic,
        partition: options?.partition,
        key: options?.key,
        value: JSON.stringify(envelope),
        timestamp,
        headers: options?.headers,
      })

      return {
        success: true,
        messageId,
        partition: result.partition,
        offset: result.offset,
        timestamp: new Date(timestamp),
      }
    } catch (error) {
      return {
        success: false,
        error: error.message,
      }
    }
  }
}

class TopicSubscriber<T> implements Subscriber<T> {
  private isSubscribed = false
  private consumer: Consumer

  constructor(private groupId: string, private client: BrokerClient) {
    this.consumer = this.client.consumer({ groupId })
  }

  async subscribe(
    topics: string[],
    handler: MessageHandler<T>,
    options?: SubscribeOptions,
  ): Promise<void> {
    if (this.isSubscribed) {
      throw new Error('Subscriber is already subscribed')
    }

    await this.consumer.connect()
    await this.consumer.subscribe({
      topics,
      fromBeginning: options?.fromBeginning || false,
    })

    this.isSubscribed = true

    await this.consumer.run({
      eachMessage: async ({ topic, partition, message }) => {
        try {
          const envelope: MessageEnvelope<T> = JSON.parse(message.value.toString())

          const context: MessageContext = {
            messageId: envelope.id,
            timestamp: envelope.timestamp,
            source: envelope.source,
            topic,
            partition,
            offset: message.offset,
            headers: envelope.headers,
          }

          const result = await handler(envelope.payload, context)

          if (!result.success) {
            console.error(`Message processing failed:`, {
              topic,
              partition,
              offset: message.offset,
              error: result.error,
            })
          }
        } catch (error) {
          console.error(`Message handler error:`, {
            topic,
            partition,
            offset: message.offset,
            error: error.message,
          })
        }
      },
    })
  }

  async unsubscribe(): Promise<void> {
    if (this.isSubscribed) {
      await this.consumer.stop()
      await this.consumer.disconnect()
      this.isSubscribed = false
    }
  }
}
```

## Saga Pattern Implementation

### Orchestration-Based Saga

```typescript
interface SagaStep {
  name: string
  action: SagaAction
  compensation: SagaAction
  timeout?: number
  retryPolicy?: RetryPolicy
}

interface SagaDefinition {
  name: string
  steps: SagaStep[]
  compensationStrategy: CompensationStrategy
}

enum SagaStatus {
  PENDING = 'pending',
  RUNNING = 'running',
  COMPLETED = 'completed',
  FAILED = 'failed',
  COMPENSATING = 'compensating',
  COMPENSATED = 'compensated',
}

class SagaOrchestrator {
  private sagas: Map<string, SagaDefinition> = new Map()
  private sagaInstances: Map<string, SagaInstance> = new Map()

  registerSaga(definition: SagaDefinition): void {
    this.sagas.set(definition.name, definition)
  }

  async startSaga(sagaName: string, data: any): Promise<string> {
    const definition = this.sagas.get(sagaName)
    if (!definition) {
      throw new Error(`Saga ${sagaName} not found`)
    }

    const sagaId = generateSagaId()
    const instance: SagaInstance = {
      id: sagaId,
      name: sagaName,
      status: SagaStatus.PENDING,
      currentStep: 0,
      data,
      startedAt: new Date(),
      completedSteps: [],
      compensationSteps: [],
    }

    this.sagaInstances.set(sagaId, instance)

    // Start execution
    this.executeSaga(sagaId)

    return sagaId
  }

  private async executeSaga(sagaId: string): Promise<void> {
    const instance = this.sagaInstances.get(sagaId)
    const definition = this.sagas.get(instance!.name)

    if (!instance || !definition) {
      throw new Error(`Saga instance or definition not found`)
    }

    instance.status = SagaStatus.RUNNING

    try {
      for (let i = instance.currentStep; i < definition.steps.length; i++) {
        const step = definition.steps[i]
        instance.currentStep = i

        const stepResult = await this.executeStep(step, instance.data, sagaId)

        if (stepResult.success) {
          instance.completedSteps.push({
            stepName: step.name,
            completedAt: new Date(),
            result: stepResult.result,
          })
        } else {
          // Step failed, start compensation
          instance.status = SagaStatus.FAILED
          await this.compensateSaga(sagaId, step.name, stepResult.error)
          return
        }
      }

      // All steps completed successfully
      instance.status = SagaStatus.COMPLETED
      instance.completedAt = new Date()
    } catch (error) {
      instance.status = SagaStatus.FAILED
      await this.compensateSaga(sagaId, 'execution-error', error.message)
    }
  }

  private async compensateSaga(sagaId: string, failedStep: string, error: string): Promise<void> {
    const instance = this.sagaInstances.get(sagaId)
    const definition = this.sagas.get(instance!.name)

    if (!instance || !definition) return

    instance.status = SagaStatus.COMPENSATING
    instance.failedStep = failedStep
    instance.error = error

    try {
      // Execute compensation for completed steps in reverse order
      for (let i = instance.completedSteps.length - 1; i >= 0; i--) {
        const completedStep = instance.completedSteps[i]
        const stepDefinition = definition.steps.find(s => s.name === completedStep.stepName)

        if (stepDefinition?.compensation) {
          const compensationResult = await this.executeCompensation(
            stepDefinition.compensation,
            instance.data,
            sagaId,
          )

          instance.compensationSteps.push({
            stepName: completedStep.stepName,
            compensatedAt: new Date(),
            result: compensationResult.result,
            success: compensationResult.success,
          })
        }
      }

      instance.status = SagaStatus.COMPENSATED
      instance.compensatedAt = new Date()
    } catch (compensationError) {
      console.error(`Compensation failed for saga ${sagaId}:`, compensationError)
      // Manual intervention required
    }
  }

  private async executeStep(step: SagaStep, data: any, sagaId: string): Promise<StepResult> {
    try {
      const result = await this.executeAction(step.action, data, sagaId)
      return { success: true, result }
    } catch (error) {
      return { success: false, error: error.message }
    }
  }

  private async executeAction(action: SagaAction, data: any, sagaId: string): Promise<any> {
    const context: SagaContext = {
      sagaId,
      data,
      timestamp: new Date(),
    }

    return await action.execute(context)
  }
}

// Example saga definition
const orderProcessingSaga: SagaDefinition = {
  name: 'order-processing',
  compensationStrategy: CompensationStrategy.REVERSE_ORDER,
  steps: [
    {
      name: 'validate-order',
      action: new ValidateOrderAction(),
      compensation: new RejectOrderAction(),
      timeout: 5000,
    },
    {
      name: 'reserve-inventory',
      action: new ReserveInventoryAction(),
      compensation: new ReleaseInventoryAction(),
      timeout: 10000,
    },
    {
      name: 'process-payment',
      action: new ProcessPaymentAction(),
      compensation: new RefundPaymentAction(),
      timeout: 15000,
    },
    {
      name: 'ship-order',
      action: new ShipOrderAction(),
      compensation: new CancelShipmentAction(),
      timeout: 30000,
    },
  ],
}

class ValidateOrderAction implements SagaAction {
  async execute(context: SagaContext): Promise<any> {
    const order = context.data.order

    // Validate order logic
    if (!order.items || order.items.length === 0) {
      throw new Error('Order must contain at least one item')
    }

    return { validated: true, orderId: order.id }
  }
}
```

This comprehensive integration patterns framework provides robust, scalable solutions for system communication while ensuring reliability, maintainability, and proper error handling across distributed architectures.

# Serverless Architecture

Function-based deployment with event-driven scaling and execution.

## When to Use

- **Variable workloads** - Unpredictable or spiky traffic
- **Event-driven processing** - Respond to events and triggers
- **Cost optimization** - Pay per execution, not per server
- **Rapid prototyping** - Fast development and deployment

## Architecture Pattern

```typescript
// Function Organization
functions/
├── user-functions/
│   ├── create-user/
│   ├── get-user/
│   └── update-user/
├── order-functions/
│   ├── create-order/
│   ├── process-payment/
│   └── send-confirmation/
├── event-handlers/
│   ├── order-created/
│   ├── payment-processed/
│   └── inventory-updated/
└── shared/
    ├── database/
    ├── validators/
    └── utilities/
```

## Implementation Example

```typescript
// HTTP Function
export const createOrder = async (
  request: APIGatewayProxyEvent,
  context: Context,
): Promise<APIGatewayProxyResult> => {
  try {
    const orderData = JSON.parse(request.body || '{}')

    // Validate input
    const validation = validateOrderData(orderData)
    if (!validation.valid) {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: validation.errors }),
      }
    }

    // Create order
    const order = await orderService.createOrder(orderData)

    // Trigger async processing
    await eventBridge.putEvent({
      Source: 'order-service',
      DetailType: 'Order Created',
      Detail: JSON.stringify({
        orderId: order.id,
        customerId: order.customerId,
        total: order.total,
      }),
    })

    return {
      statusCode: 201,
      body: JSON.stringify(order),
    }
  } catch (error) {
    console.error('Order creation failed:', error)

    return {
      statusCode: 500,
      body: JSON.stringify({ error: 'Internal server error' }),
    }
  }
}

// Event-Driven Function
export const handleOrderCreated = async (
  event: EventBridgeEvent<'Order Created', OrderCreatedDetail>,
): Promise<void> => {
  const { orderId, customerId, total } = event.detail

  try {
    // Get customer information
    const customer = await customerService.getCustomer(customerId)

    // Send confirmation email
    await emailService.sendOrderConfirmation({
      to: customer.email,
      orderId,
      total,
    })

    // Update analytics
    await analyticsService.recordOrderEvent({
      orderId,
      customerId,
      total,
      timestamp: new Date().toISOString(),
    })
  } catch (error) {
    console.error('Order processing failed:', error)

    // Send to dead letter queue for retry
    await sqsService.sendMessage({
      QueueUrl: process.env.DEAD_LETTER_QUEUE_URL,
      MessageBody: JSON.stringify({
        event,
        error: error.message,
        timestamp: new Date().toISOString(),
      }),
    })
  }
}
```

## Event Sources

**HTTP Triggers:** API Gateway, Application Load Balancer
**Event Triggers:** EventBridge, SQS, SNS, Kinesis
**Storage Triggers:** S3, DynamoDB Streams
**Scheduled Triggers:** CloudWatch Events, Cron expressions

## Benefits and Trade-offs

**Benefits:**

- **Automatic scaling** - Scale to zero and to millions
- **Cost efficiency** - Pay per execution, not idle time
- **Operational simplicity** - No server management
- **Fast deployment** - Quick function updates
- **Event-driven** - Natural fit for reactive architectures

**Trade-offs:**

- **Cold starts** - Initial execution latency
- **Execution limits** - Time and memory constraints
- **Vendor lock-in** - Platform-specific implementations
- **Local development** - Testing and debugging complexity
- **State management** - Stateless execution model

## Best Practices

- **Single responsibility** - One function per business operation
- **Stateless design** - No local state between invocations
- **Error handling** - Comprehensive error handling and retries
- **Dead letter queues** - Handle failed executions
- **Monitoring** - Track function performance and errors
- **Environment variables** - Externalize configuration
- **Connection pooling** - Reuse database connections

## Related Patterns

- [Event-Driven Architecture](.pair/knowledge/guidelines/architecture/integration-patterns.md) - Event communication patterns
- [Microservices](microservices.md) - Service-based alternative
- [CQRS](.pair/knowledge/guidelines/architecture/architectural-patterns/cqrs.md) - Command-query separation
- [Circuit Breaker](.pair/knowledge/guidelines/architecture/scaling-patterns/circuit-breaker.md) - Resilience patterns

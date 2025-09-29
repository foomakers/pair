# Circuit Breaker Pattern

Failure resilience pattern for preventing cascade failures in distributed systems.

## When to Use

- **External service dependencies**
- **Failure isolation** needs
- **Graceful degradation** requirements
- **Cascade failure prevention**

## Implementation

```typescript
export class CircuitBreaker {
  private state: 'CLOSED' | 'OPEN' | 'HALF_OPEN' = 'CLOSED'
  private failureCount = 0
  private lastFailureTime = 0
  
  constructor(
    private readonly failureThreshold: number = 5,
    private readonly timeout: number = 60000, // 1 minute
    private readonly retryTimeout: number = 30000 // 30 seconds
  ) {}
  
  async call<T>(operation: () => Promise<T>): Promise<T> {
    if (this.state === 'OPEN') {
      if (Date.now() - this.lastFailureTime > this.retryTimeout) {
        this.state = 'HALF_OPEN'
      } else {
        throw new CircuitBreakerOpenError()
      }
    }
    
    try {
      const result = await operation()
      this.onSuccess()
      return result
    } catch (error) {
      this.onFailure()
      throw error
    }
  }
  
  private onSuccess(): void {
    this.failureCount = 0
    this.state = 'CLOSED'
  }
  
  private onFailure(): void {
    this.failureCount++
    this.lastFailureTime = Date.now()
    
    if (this.failureCount >= this.failureThreshold) {
      this.state = 'OPEN'
    }
  }
}
```

## Usage with Service

```typescript
export class PaymentService {
  private circuitBreaker = new CircuitBreaker(3, 60000, 30000)
  
  constructor(private paymentGateway: PaymentGateway) {}
  
  async processPayment(payment: Payment): Promise<PaymentResult> {
    return await this.circuitBreaker.call(async () => {
      return await this.paymentGateway.charge(payment)
    })
  }
  
  // Fallback when circuit is open
  async processPaymentWithFallback(payment: Payment): Promise<PaymentResult> {
    try {
      return await this.processPayment(payment)
    } catch (error) {
      if (error instanceof CircuitBreakerOpenError) {
        // Fallback to offline processing
        return await this.queueForLaterProcessing(payment)
      }
      throw error
    }
  }
}
```

## Circuit States

**CLOSED:** Normal operation, all requests pass through
**OPEN:** Circuit tripped, all requests fail immediately
**HALF_OPEN:** Testing if service has recovered

## Configuration Guidelines

- **Failure Threshold:** 3-10 failures (start with 5)
- **Timeout:** 30-120 seconds (start with 60s)
- **Retry Timeout:** 30-60 seconds (start with 30s)

## Pros and Cons

**Pros:**
- **Fast failure** - Immediate failure instead of hanging
- **Resource protection** - Prevents resource exhaustion
- **Recovery detection** - Automatic service recovery testing
- **Stability** - Prevents cascade failures

**Cons:**
- **False positives** - May trip on temporary issues
- **Configuration complexity** - Requires proper tuning
- **Monitoring needs** - Need good metrics and alerting

## Best Practices

- **Meaningful timeouts** - Set appropriate failure thresholds
- **Fallback strategies** - Provide alternative responses
- **Monitoring** - Track circuit state and metrics
- **Graceful degradation** - Reduced functionality vs total failure

## Related Patterns

- [Load Balancing](scaling-patterns-load-balancing.md) - Traffic distribution
- [Auto-Scaling](scaling-patterns-auto-scaling.md) - Dynamic scaling
- [Timeout Pattern](performance-patterns-timeout.md) - Request timeouts

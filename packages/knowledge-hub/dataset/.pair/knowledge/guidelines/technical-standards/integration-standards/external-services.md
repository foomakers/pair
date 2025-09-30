# 🌐 External Services

**Focus**: Integration patterns for third-party services and APIs

Comprehensive patterns for integrating external services including authentication, error handling, rate limiting, monitoring, and data transformation for reliable service-to-service communication.

## 🎯 Service Integration Architecture

### Core Integration Patterns

```typescript
// ✅ External service integration framework
interface ExternalServiceIntegration {
  // Service configuration
  configuration: ServiceConfiguration

  // Authentication & authorization
  authentication: AuthenticationStrategy

  // Request/response handling
  communication: CommunicationLayer

  // Error handling & resilience
  resilience: ResiliencePatterns

  // Monitoring & observability
  observability: ObservabilityConfig

  // Data transformation
  transformation: DataTransformationLayer
}

interface ServiceConfiguration {
  baseUrl: string
  timeout: number
  retryPolicy: RetryPolicy
  rateLimits: RateLimitConfig
  healthCheck: HealthCheckConfig
  circuitBreaker: CircuitBreakerConfig
}

interface AuthenticationStrategy {
  type: 'apiKey' | 'oauth2' | 'jwt' | 'basic' | 'custom'
  credentials: CredentialStore
  tokenRefresh: TokenRefreshStrategy
  scopes: string[]
}
```

## 🔐 Authentication Strategies

### API Key Authentication

```typescript
// ✅ API Key authentication implementation
export class ApiKeyAuthService {
  private apiKey: string
  private headerName: string

  constructor(config: ApiKeyConfig) {
    this.apiKey = config.apiKey
    this.headerName = config.headerName || 'X-API-Key'
  }

  /**
   * Add API key to request headers
   */
  authenticate(request: RequestConfig): RequestConfig {
    return {
      ...request,
      headers: {
        ...request.headers,
        [this.headerName]: this.apiKey,
      },
    }
  }

  /**
   * Validate API key format
   */
  validateApiKey(): boolean {
    if (!this.apiKey) {
      throw new ConfigurationError('API key is required')
    }

    if (this.apiKey.length < 16) {
      throw new ConfigurationError('API key appears to be invalid')
    }

    return true
  }
}

// ✅ OAuth2 authentication implementation
export class OAuth2AuthService {
  private clientId: string
  private clientSecret: string
  private tokenEndpoint: string
  private accessToken?: string
  private refreshToken?: string
  private tokenExpiry?: Date

  constructor(config: OAuth2Config) {
    this.clientId = config.clientId
    this.clientSecret = config.clientSecret
    this.tokenEndpoint = config.tokenEndpoint
  }

  /**
   * Authenticate and get access token
   */
  async authenticate(scope?: string[]): Promise<AuthTokens> {
    const response = await fetch(this.tokenEndpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Authorization: `Basic ${btoa(`${this.clientId}:${this.clientSecret}`)}`,
      },
      body: new URLSearchParams({
        grant_type: 'client_credentials',
        scope: scope?.join(' ') || '',
      }),
    })

    if (!response.ok) {
      throw new AuthenticationError('OAuth2 authentication failed')
    }

    const tokens = await response.json()

    this.accessToken = tokens.access_token
    this.refreshToken = tokens.refresh_token
    this.tokenExpiry = new Date(Date.now() + tokens.expires_in * 1000)

    return tokens
  }

  /**
   * Add access token to request
   */
  async authenticateRequest(request: RequestConfig): Promise<RequestConfig> {
    await this.ensureValidToken()

    return {
      ...request,
      headers: {
        ...request.headers,
        Authorization: `Bearer ${this.accessToken}`,
      },
    }
  }

  /**
   * Refresh token if expired
   */
  private async ensureValidToken(): Promise<void> {
    if (!this.accessToken || this.isTokenExpired()) {
      if (this.refreshToken) {
        await this.refreshAccessToken()
      } else {
        await this.authenticate()
      }
    }
  }

  private async refreshAccessToken(): Promise<void> {
    const response = await fetch(this.tokenEndpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        grant_type: 'refresh_token',
        refresh_token: this.refreshToken!,
        client_id: this.clientId,
        client_secret: this.clientSecret,
      }),
    })

    if (!response.ok) {
      throw new AuthenticationError('Token refresh failed')
    }

    const tokens = await response.json()
    this.accessToken = tokens.access_token
    this.tokenExpiry = new Date(Date.now() + tokens.expires_in * 1000)
  }

  private isTokenExpired(): boolean {
    if (!this.tokenExpiry) return true
    return Date.now() >= this.tokenExpiry.getTime() - 60000 // 1 minute buffer
  }
}
```

## 🔄 HTTP Client Implementation

### Robust HTTP Client

```typescript
// ✅ Comprehensive HTTP client for external services
export class ExternalServiceClient {
  private baseUrl: string
  private timeout: number
  private authService: AuthenticationService
  private retryPolicy: RetryPolicy
  private circuitBreaker: CircuitBreaker
  private rateLimiter: RateLimiter

  constructor(config: ServiceClientConfig) {
    this.baseUrl = config.baseUrl
    this.timeout = config.timeout || 30000
    this.authService = config.authService
    this.retryPolicy = config.retryPolicy || new DefaultRetryPolicy()
    this.circuitBreaker = new CircuitBreaker(config.circuitBreakerConfig)
    this.rateLimiter = new RateLimiter(config.rateLimitConfig)
  }

  /**
   * Make authenticated HTTP request with resilience patterns
   */
  async request<T>(config: RequestConfig): Promise<ServiceResponse<T>> {
    // Apply rate limiting
    await this.rateLimiter.acquire()

    return this.circuitBreaker.execute(async () => {
      return this.retryPolicy.execute(async () => {
        const authenticatedConfig = await this.authService.authenticateRequest(config)
        return this.makeRequest<T>(authenticatedConfig)
      })
    })
  }

  /**
   * Core HTTP request implementation
   */
  private async makeRequest<T>(config: RequestConfig): Promise<ServiceResponse<T>> {
    const url = `${this.baseUrl}${config.path}`
    const startTime = Date.now()

    try {
      const response = await fetch(url, {
        method: config.method || 'GET',
        headers: {
          'Content-Type': 'application/json',
          'User-Agent': 'MyApp/1.0',
          Accept: 'application/json',
          ...config.headers,
        },
        body: config.body ? JSON.stringify(config.body) : undefined,
        signal: AbortSignal.timeout(this.timeout),
      })

      const duration = Date.now() - startTime

      // Log request metrics
      this.logRequestMetrics({
        url,
        method: config.method || 'GET',
        status: response.status,
        duration,
      })

      if (!response.ok) {
        throw await this.createErrorFromResponse(response)
      }

      const data = await this.parseResponse<T>(response)

      return {
        data,
        status: response.status,
        headers: Object.fromEntries(response.headers.entries()),
        duration,
      }
    } catch (error) {
      const duration = Date.now() - startTime

      this.logRequestError({
        url,
        method: config.method || 'GET',
        error: error.message,
        duration,
      })

      if (error.name === 'AbortError') {
        throw new TimeoutError(`Request to ${url} timed out after ${this.timeout}ms`)
      }

      throw error
    }
  }

  /**
   * Parse response based on content type
   */
  private async parseResponse<T>(response: Response): Promise<T> {
    const contentType = response.headers.get('content-type') || ''

    if (contentType.includes('application/json')) {
      return response.json()
    }

    if (contentType.includes('text/')) {
      return response.text() as unknown as T
    }

    return response.arrayBuffer() as unknown as T
  }

  /**
   * Create appropriate error from HTTP response
   */
  private async createErrorFromResponse(response: Response): Promise<Error> {
    let errorBody: any

    try {
      errorBody = await response.json()
    } catch {
      errorBody = { message: response.statusText }
    }

    switch (response.status) {
      case 400:
        return new ValidationError(errorBody.message || 'Bad Request', errorBody)
      case 401:
        return new AuthenticationError(errorBody.message || 'Unauthorized')
      case 403:
        return new AuthorizationError(errorBody.message || 'Forbidden')
      case 404:
        return new NotFoundError(errorBody.message || 'Not Found')
      case 429:
        const retryAfter = response.headers.get('Retry-After')
        return new RateLimitError(
          errorBody.message || 'Rate limit exceeded',
          retryAfter ? parseInt(retryAfter) : undefined,
        )
      case 500:
      case 502:
      case 503:
      case 504:
        return new ServiceUnavailableError(errorBody.message || 'Service temporarily unavailable')
      default:
        return new ExternalServiceError(
          errorBody.message || `HTTP ${response.status}`,
          response.status,
          errorBody,
        )
    }
  }
}
```

## 🛡️ Resilience Patterns

### Circuit Breaker Implementation

```typescript
// ✅ Circuit breaker for external service protection
export class CircuitBreaker {
  private state: 'CLOSED' | 'OPEN' | 'HALF_OPEN' = 'CLOSED'
  private failureCount = 0
  private lastFailureTime?: Date
  private successCount = 0

  constructor(private config: CircuitBreakerConfig) {}

  async execute<T>(operation: () => Promise<T>): Promise<T> {
    if (this.state === 'OPEN') {
      if (this.shouldAttemptReset()) {
        this.state = 'HALF_OPEN'
        this.successCount = 0
      } else {
        throw new CircuitBreakerOpenError('Circuit breaker is OPEN')
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

    if (this.state === 'HALF_OPEN') {
      this.successCount++
      if (this.successCount >= this.config.halfOpenSuccessThreshold) {
        this.state = 'CLOSED'
      }
    }
  }

  private onFailure(): void {
    this.failureCount++
    this.lastFailureTime = new Date()

    if (this.failureCount >= this.config.failureThreshold) {
      this.state = 'OPEN'
    }
  }

  private shouldAttemptReset(): boolean {
    if (!this.lastFailureTime) return false

    const timeSinceLastFailure = Date.now() - this.lastFailureTime.getTime()
    return timeSinceLastFailure >= this.config.timeout
  }
}

// ✅ Rate limiter implementation
export class RateLimiter {
  private tokens: number
  private lastRefill: Date

  constructor(private config: RateLimitConfig) {
    this.tokens = config.maxTokens
    this.lastRefill = new Date()
  }

  async acquire(tokens: number = 1): Promise<void> {
    this.refillTokens()

    if (this.tokens >= tokens) {
      this.tokens -= tokens
      return
    }

    // Wait for tokens to be available
    const waitTime = this.calculateWaitTime(tokens)
    await this.sleep(waitTime)
    await this.acquire(tokens)
  }

  private refillTokens(): void {
    const now = new Date()
    const timeSinceLastRefill = now.getTime() - this.lastRefill.getTime()
    const tokensToAdd = Math.floor((timeSinceLastRefill / 1000) * this.config.refillRate)

    if (tokensToAdd > 0) {
      this.tokens = Math.min(this.config.maxTokens, this.tokens + tokensToAdd)
      this.lastRefill = now
    }
  }

  private calculateWaitTime(requiredTokens: number): number {
    const deficit = requiredTokens - this.tokens
    return (deficit / this.config.refillRate) * 1000
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms))
  }
}
```

## 📊 Service Integration Examples

### Payment Service Integration

```typescript
// ✅ Stripe payment service integration
export class StripePaymentService extends ExternalServiceClient {
  constructor(config: StripeConfig) {
    super({
      baseUrl: 'https://api.stripe.com/v1',
      authService: new ApiKeyAuthService({
        apiKey: config.secretKey,
        headerName: 'Authorization',
        format: 'Bearer',
      }),
      timeout: 30000,
      retryPolicy: new ExponentialBackoffRetry({
        maxAttempts: 3,
        baseDelay: 1000,
      }),
    })
  }

  /**
   * Create payment intent
   */
  async createPaymentIntent(params: CreatePaymentIntentParams): Promise<PaymentIntent> {
    const response = await this.request<StripePaymentIntent>({
      path: '/payment_intents',
      method: 'POST',
      body: {
        amount: params.amount,
        currency: params.currency || 'usd',
        metadata: params.metadata,
        customer: params.customerId,
      },
    })

    return this.transformPaymentIntent(response.data)
  }

  /**
   * Confirm payment intent
   */
  async confirmPaymentIntent(
    paymentIntentId: string,
    params: ConfirmPaymentIntentParams,
  ): Promise<PaymentIntent> {
    const response = await this.request<StripePaymentIntent>({
      path: `/payment_intents/${paymentIntentId}/confirm`,
      method: 'POST',
      body: {
        payment_method: params.paymentMethodId,
        return_url: params.returnUrl,
      },
    })

    return this.transformPaymentIntent(response.data)
  }

  /**
   * Handle Stripe webhook
   */
  async handleWebhook(
    payload: string,
    signature: string,
    endpointSecret: string,
  ): Promise<WebhookEvent> {
    try {
      const event = stripe.webhooks.constructEvent(payload, signature, endpointSecret)

      switch (event.type) {
        case 'payment_intent.succeeded':
          await this.handlePaymentSucceeded(event.data.object)
          break
        case 'payment_intent.payment_failed':
          await this.handlePaymentFailed(event.data.object)
          break
        default:
          console.log(`Unhandled event type: ${event.type}`)
      }

      return event
    } catch (error) {
      throw new WebhookValidationError('Invalid webhook signature')
    }
  }

  private transformPaymentIntent(stripePI: StripePaymentIntent): PaymentIntent {
    return {
      id: stripePI.id,
      amount: stripePI.amount,
      currency: stripePI.currency,
      status: stripePI.status,
      clientSecret: stripePI.client_secret,
      metadata: stripePI.metadata,
      createdAt: new Date(stripePI.created * 1000),
    }
  }
}
```

### Email Service Integration

```typescript
// ✅ SendGrid email service integration
export class SendGridEmailService extends ExternalServiceClient {
  constructor(config: SendGridConfig) {
    super({
      baseUrl: 'https://api.sendgrid.com/v3',
      authService: new ApiKeyAuthService({
        apiKey: config.apiKey,
        headerName: 'Authorization',
        format: 'Bearer',
      }),
      timeout: 15000,
    })
  }

  /**
   * Send transactional email
   */
  async sendEmail(params: SendEmailParams): Promise<EmailResult> {
    const response = await this.request<SendGridResponse>({
      path: '/mail/send',
      method: 'POST',
      body: {
        personalizations: [
          {
            to: params.to.map(email => ({ email })),
            subject: params.subject,
            dynamic_template_data: params.templateData,
          },
        ],
        from: { email: params.from },
        template_id: params.templateId,
        categories: params.categories,
        tracking_settings: {
          click_tracking: { enable: true },
          open_tracking: { enable: true },
        },
      },
    })

    return {
      messageId: response.headers['x-message-id'],
      status: 'sent',
      sentAt: new Date(),
    }
  }

  /**
   * Handle delivery webhook
   */
  async handleDeliveryWebhook(events: SendGridWebhookEvent[]): Promise<void> {
    for (const event of events) {
      switch (event.event) {
        case 'delivered':
          await this.handleEmailDelivered(event)
          break
        case 'bounce':
          await this.handleEmailBounced(event)
          break
        case 'click':
          await this.handleEmailClicked(event)
          break
        case 'open':
          await this.handleEmailOpened(event)
          break
      }
    }
  }
}
```

## 📈 Monitoring & Observability

### Service Health Monitoring

```typescript
// ✅ External service health monitoring
export class ServiceHealthMonitor {
  private healthChecks = new Map<string, HealthCheck>()

  /**
   * Register service health check
   */
  registerService(name: string, healthCheck: HealthCheck): void {
    this.healthChecks.set(name, healthCheck)
  }

  /**
   * Check health of all registered services
   */
  async checkAllServices(): Promise<ServiceHealthReport> {
    const results = await Promise.allSettled(
      Array.from(this.healthChecks.entries()).map(async ([name, check]) => {
        const startTime = Date.now()
        try {
          await check.check()
          return {
            name,
            status: 'healthy' as const,
            responseTime: Date.now() - startTime,
          }
        } catch (error) {
          return {
            name,
            status: 'unhealthy' as const,
            responseTime: Date.now() - startTime,
            error: error.message,
          }
        }
      }),
    )

    const healthResults = results.map(result =>
      result.status === 'fulfilled' ? result.value : result.reason,
    )

    return {
      overall: healthResults.every(r => r.status === 'healthy') ? 'healthy' : 'degraded',
      services: healthResults,
      timestamp: new Date(),
    }
  }

  /**
   * Start continuous health monitoring
   */
  startMonitoring(intervalMs: number = 60000): void {
    setInterval(async () => {
      const report = await this.checkAllServices()

      // Log health status
      console.log('Service Health Report:', report)

      // Send alerts for unhealthy services
      const unhealthyServices = report.services.filter(s => s.status === 'unhealthy')
      if (unhealthyServices.length > 0) {
        await this.sendHealthAlert(unhealthyServices)
      }
    }, intervalMs)
  }
}
```

## 🔗 Related Concepts

- **[Error Handling](error-handling.md)** - Service error management
- **[Database Integration](database-integration.md)** - Internal data persistence
- **API Standards** - Internal API design

## 📏 Implementation Guidelines

1. **Authentication Security**: Store credentials securely and rotate regularly
2. **Resilience Patterns**: Implement circuit breakers and retry logic
3. **Rate Limiting**: Respect external service rate limits
4. **Error Handling**: Handle all error scenarios gracefully
5. **Monitoring**: Monitor service health and performance
6. **Documentation**: Document integration patterns and dependencies
7. **Testing**: Test integrations with mocks and contract tests
8. **Fallback Strategies**: Implement fallbacks for critical services

---

_External Services integration ensures reliable, secure, and efficient communication with third-party services through proper authentication, resilience patterns, and comprehensive monitoring._

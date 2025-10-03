# External Services Integration

Comprehensive framework for integrating with external services, APIs, and third-party systems while ensuring reliability, security, and maintainability of all external dependencies.

## Purpose

Establish systematic standards for external service integration that ensure robust error handling, security, performance, and maintainability when working with third-party systems and APIs.

## Integration Architecture Standards

### Service Integration Patterns

```typescript
interface ExternalServiceConfig {
  baseUrl: string
  authentication: AuthenticationConfig
  rateLimiting: RateLimitConfig
  timeout: TimeoutConfig
  retryPolicy: RetryPolicy
  circuitBreaker: CircuitBreakerConfig
  monitoring: MonitoringConfig
}

interface ServiceClient {
  name: string
  version: string
  config: ExternalServiceConfig
  healthCheck: HealthCheckConfig
  fallbackStrategy: FallbackStrategy
}

enum IntegrationPattern {
  SYNCHRONOUS = 'synchronous',
  ASYNCHRONOUS = 'asynchronous',
  EVENT_DRIVEN = 'event-driven',
  BATCH_PROCESSING = 'batch-processing',
  WEBHOOK = 'webhook',
}
```

### HTTP Client Standards

```typescript
class HttpServiceClient {
  private readonly client: AxiosInstance
  private readonly metrics: ServiceMetrics
  private readonly circuitBreaker: CircuitBreaker

  constructor(private config: ExternalServiceConfig) {
    this.client = this.createHttpClient()
    this.metrics = new ServiceMetrics(config.name)
    this.circuitBreaker = new CircuitBreaker(config.circuitBreaker)
  }

  private createHttpClient(): AxiosInstance {
    const client = axios.create({
      baseURL: this.config.baseUrl,
      timeout: this.config.timeout.request,
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': `${process.env.APP_NAME}/${process.env.APP_VERSION}`,
        'X-Request-ID': this.generateRequestId(),
      },
    })

    // Request interceptor for authentication and monitoring
    client.interceptors.request.use(
      config => {
        // Add authentication
        config = this.addAuthentication(config)

        // Start request timing
        config.metadata = { startTime: Date.now() }

        // Log request
        this.logRequest(config)

        return config
      },
      error => Promise.reject(error),
    )

    // Response interceptor for monitoring and error handling
    client.interceptors.response.use(
      response => {
        const duration = Date.now() - response.config.metadata.startTime

        this.metrics.recordRequest({
          method: response.config.method,
          status: response.status,
          duration,
          success: true,
        })

        this.logResponse(response, duration)
        return response
      },
      error => {
        const duration = error.config?.metadata ? Date.now() - error.config.metadata.startTime : 0

        this.metrics.recordRequest({
          method: error.config?.method,
          status: error.response?.status || 0,
          duration,
          success: false,
          error: error.message,
        })

        this.logError(error, duration)
        return Promise.reject(error)
      },
    )

    return client
  }

  async request<T>(options: RequestOptions): Promise<ServiceResponse<T>> {
    const requestId = this.generateRequestId()

    try {
      // Check circuit breaker
      if (this.circuitBreaker.isOpen()) {
        throw new ServiceError('Circuit breaker is open', 'CIRCUIT_OPEN')
      }

      // Apply rate limiting
      await this.applyRateLimit()

      // Execute request with retry logic
      const response = await this.executeWithRetry(options, requestId)

      this.circuitBreaker.recordSuccess()

      return {
        success: true,
        data: response.data,
        status: response.status,
        headers: response.headers,
        requestId,
      }
    } catch (error) {
      this.circuitBreaker.recordFailure()

      return {
        success: false,
        error: this.handleError(error),
        requestId,
      }
    }
  }

  private async executeWithRetry<T>(
    options: RequestOptions,
    requestId: string,
  ): Promise<AxiosResponse<T>> {
    const retryPolicy = this.config.retryPolicy
    let lastError: any

    for (let attempt = 1; attempt <= retryPolicy.maxAttempts; attempt++) {
      try {
        const response = await this.client.request({
          ...options,
          headers: {
            ...options.headers,
            'X-Request-ID': requestId,
            'X-Retry-Attempt': attempt.toString(),
          },
        })

        return response
      } catch (error) {
        lastError = error

        // Don't retry on client errors (4xx)
        if (error.response?.status >= 400 && error.response?.status < 500) {
          throw error
        }

        // Don't retry on last attempt
        if (attempt === retryPolicy.maxAttempts) {
          break
        }

        // Calculate delay for exponential backoff
        const delay = this.calculateRetryDelay(attempt, retryPolicy)
        await this.delay(delay)

        console.warn(`Retrying request (attempt ${attempt + 1}/${retryPolicy.maxAttempts})`, {
          requestId,
          error: error.message,
          delay,
        })
      }
    }

    throw lastError
  }

  private calculateRetryDelay(attempt: number, policy: RetryPolicy): number {
    const baseDelay = policy.baseDelay || 1000
    const multiplier = policy.multiplier || 2
    const maxDelay = policy.maxDelay || 30000

    const delay = baseDelay * Math.pow(multiplier, attempt - 1)

    // Add jitter to prevent thundering herd
    const jitter = delay * 0.1 * Math.random()

    return Math.min(delay + jitter, maxDelay)
  }
}
```

## Authentication and Security

### Multi-Authentication Support

```typescript
enum AuthenticationType {
  API_KEY = 'api-key',
  BEARER_TOKEN = 'bearer-token',
  OAUTH2 = 'oauth2',
  BASIC_AUTH = 'basic-auth',
  CUSTOM = 'custom',
}

interface AuthenticationProvider {
  type: AuthenticationType
  authenticate(config: any): Promise<AuthenticationResult>
  refresh?(token: string): Promise<string>
  validate?(token: string): Promise<boolean>
}

class AuthenticationManager {
  private providers: Map<AuthenticationType, AuthenticationProvider> = new Map()
  private tokenCache: Map<string, CachedToken> = new Map()

  registerProvider(type: AuthenticationType, provider: AuthenticationProvider): void {
    this.providers.set(type, provider)
  }

  async authenticate(
    serviceId: string,
    config: AuthenticationConfig,
  ): Promise<AuthenticationResult> {
    const provider = this.providers.get(config.type)
    if (!provider) {
      throw new Error(`Authentication provider ${config.type} not found`)
    }

    // Check for cached token
    const cachedToken = this.tokenCache.get(serviceId)
    if (cachedToken && this.isTokenValid(cachedToken)) {
      return {
        success: true,
        token: cachedToken.token,
        expiresAt: cachedToken.expiresAt,
      }
    }

    try {
      const result = await provider.authenticate(config)

      if (result.success && result.token) {
        // Cache the token
        this.tokenCache.set(serviceId, {
          token: result.token,
          expiresAt: result.expiresAt || new Date(Date.now() + 3600000), // 1 hour default
          refreshToken: result.refreshToken,
        })
      }

      return result
    } catch (error) {
      throw new ServiceError(
        `Authentication failed for ${serviceId}: ${error.message}`,
        'AUTH_FAILED',
      )
    }
  }

  async refreshToken(serviceId: string): Promise<string> {
    const cachedToken = this.tokenCache.get(serviceId)
    if (!cachedToken?.refreshToken) {
      throw new Error('No refresh token available')
    }

    const authConfig = await this.getAuthConfig(serviceId)
    const provider = this.providers.get(authConfig.type)

    if (!provider?.refresh) {
      throw new Error('Token refresh not supported')
    }

    const newToken = await provider.refresh(cachedToken.refreshToken)

    // Update cache
    this.tokenCache.set(serviceId, {
      ...cachedToken,
      token: newToken,
      expiresAt: new Date(Date.now() + 3600000),
    })

    return newToken
  }
}

// OAuth2 Provider Implementation
class OAuth2Provider implements AuthenticationProvider {
  type = AuthenticationType.OAUTH2

  async authenticate(config: OAuth2Config): Promise<AuthenticationResult> {
    try {
      const response = await axios.post(
        config.tokenUrl,
        {
          grant_type: 'client_credentials',
          client_id: config.clientId,
          client_secret: config.clientSecret,
          scope: config.scope,
        },
        {
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        },
      )

      const { access_token, expires_in, refresh_token } = response.data

      return {
        success: true,
        token: access_token,
        expiresAt: new Date(Date.now() + expires_in * 1000),
        refreshToken: refresh_token,
      }
    } catch (error) {
      return {
        success: false,
        error: error.response?.data?.error_description || error.message,
      }
    }
  }

  async refresh(refreshToken: string): Promise<string> {
    // Implementation for token refresh
    throw new Error('Refresh token implementation required')
  }
}
```

## Error Handling and Resilience

### Circuit Breaker Pattern

```typescript
interface CircuitBreakerConfig {
  failureThreshold: number
  resetTimeout: number
  monitoringPeriod: number
  halfOpenMaxRequests: number
}

enum CircuitState {
  CLOSED = 'closed',
  OPEN = 'open',
  HALF_OPEN = 'half-open',
}

class CircuitBreaker {
  private state: CircuitState = CircuitState.CLOSED
  private failures: number = 0
  private lastFailureTime: number = 0
  private halfOpenRequests: number = 0

  constructor(private config: CircuitBreakerConfig) {}

  isOpen(): boolean {
    return this.state === CircuitState.OPEN
  }

  recordSuccess(): void {
    this.failures = 0
    this.halfOpenRequests = 0

    if (this.state === CircuitState.HALF_OPEN) {
      this.state = CircuitState.CLOSED
      console.info('Circuit breaker closed - service recovered')
    }
  }

  recordFailure(): void {
    this.failures++
    this.lastFailureTime = Date.now()

    if (this.state === CircuitState.CLOSED && this.failures >= this.config.failureThreshold) {
      this.state = CircuitState.OPEN
      console.warn('Circuit breaker opened due to failures', {
        failures: this.failures,
        threshold: this.config.failureThreshold,
      })
    } else if (this.state === CircuitState.HALF_OPEN) {
      this.state = CircuitState.OPEN
      this.halfOpenRequests = 0
      console.warn('Circuit breaker re-opened - service still failing')
    }
  }

  canExecute(): boolean {
    if (this.state === CircuitState.CLOSED) {
      return true
    }

    if (this.state === CircuitState.OPEN) {
      // Check if reset timeout has passed
      if (Date.now() - this.lastFailureTime >= this.config.resetTimeout) {
        this.state = CircuitState.HALF_OPEN
        this.halfOpenRequests = 0
        console.info('Circuit breaker half-open - testing service')
        return true
      }
      return false
    }

    if (this.state === CircuitState.HALF_OPEN) {
      return this.halfOpenRequests < this.config.halfOpenMaxRequests
    }

    return false
  }

  onRequest(): void {
    if (this.state === CircuitState.HALF_OPEN) {
      this.halfOpenRequests++
    }
  }
}
```

### Fallback Strategies

```typescript
interface FallbackStrategy {
  type: FallbackType
  implementation: FallbackImplementation
  conditions: FallbackCondition[]
}

enum FallbackType {
  CACHE = 'cache',
  DEFAULT_VALUE = 'default-value',
  ALTERNATIVE_SERVICE = 'alternative-service',
  GRACEFUL_DEGRADATION = 'graceful-degradation',
  QUEUE_FOR_RETRY = 'queue-for-retry',
}

class FallbackManager {
  private strategies: Map<string, FallbackStrategy[]> = new Map()
  private cache: CacheService
  private queue: RetryQueue

  registerFallback(serviceId: string, strategy: FallbackStrategy): void {
    if (!this.strategies.has(serviceId)) {
      this.strategies.set(serviceId, [])
    }
    this.strategies.get(serviceId)!.push(strategy)
  }

  async executeFallback<T>(
    serviceId: string,
    originalError: ServiceError,
    context: FallbackContext,
  ): Promise<FallbackResult<T>> {
    const strategies = this.strategies.get(serviceId) || []

    for (const strategy of strategies) {
      if (this.shouldApplyFallback(strategy, originalError, context)) {
        try {
          const result = await this.executeFallbackStrategy<T>(strategy, context)

          if (result.success) {
            console.info(`Fallback ${strategy.type} succeeded for ${serviceId}`)
            return result
          }
        } catch (error) {
          console.warn(`Fallback ${strategy.type} failed for ${serviceId}:`, error)
        }
      }
    }

    return {
      success: false,
      error: `All fallback strategies failed for ${serviceId}`,
      originalError,
    }
  }

  private async executeFallbackStrategy<T>(
    strategy: FallbackStrategy,
    context: FallbackContext,
  ): Promise<FallbackResult<T>> {
    switch (strategy.type) {
      case FallbackType.CACHE:
        return this.executeCacheFallback<T>(strategy, context)

      case FallbackType.DEFAULT_VALUE:
        return this.executeDefaultValueFallback<T>(strategy, context)

      case FallbackType.ALTERNATIVE_SERVICE:
        return this.executeAlternativeServiceFallback<T>(strategy, context)

      case FallbackType.GRACEFUL_DEGRADATION:
        return this.executeGracefulDegradationFallback<T>(strategy, context)

      case FallbackType.QUEUE_FOR_RETRY:
        return this.executeQueueForRetryFallback<T>(strategy, context)

      default:
        throw new Error(`Unknown fallback strategy: ${strategy.type}`)
    }
  }

  private async executeCacheFallback<T>(
    strategy: FallbackStrategy,
    context: FallbackContext,
  ): Promise<FallbackResult<T>> {
    const cacheKey = this.generateCacheKey(context)
    const cachedData = await this.cache.get<T>(cacheKey)

    if (cachedData) {
      return {
        success: true,
        data: cachedData,
        source: 'cache',
        stale: true,
      }
    }

    return {
      success: false,
      error: 'No cached data available',
    }
  }

  private async executeAlternativeServiceFallback<T>(
    strategy: FallbackStrategy,
    context: FallbackContext,
  ): Promise<FallbackResult<T>> {
    const alternativeService = strategy.implementation.alternativeServiceId
    const alternativeClient = this.getServiceClient(alternativeService)

    if (!alternativeClient) {
      return {
        success: false,
        error: `Alternative service ${alternativeService} not available`,
      }
    }

    const result = await alternativeClient.request<T>(context.originalRequest)

    return {
      success: result.success,
      data: result.data,
      source: 'alternative-service',
      error: result.error?.message,
    }
  }
}
```

## Service Discovery and Load Balancing

### Service Registry

```typescript
interface ServiceRegistry {
  register(service: ServiceInstance): Promise<void>
  deregister(serviceId: string): Promise<void>
  discover(serviceName: string): Promise<ServiceInstance[]>
  healthCheck(serviceId: string): Promise<HealthStatus>
}

interface ServiceInstance {
  id: string
  name: string
  version: string
  endpoint: string
  health: HealthStatus
  metadata: ServiceMetadata
  registeredAt: Date
  lastSeen: Date
}

class ServiceDiscoveryManager {
  private registry: ServiceRegistry
  private loadBalancer: LoadBalancer
  private healthMonitor: HealthMonitor

  constructor(registry: ServiceRegistry, loadBalancer: LoadBalancer) {
    this.registry = registry
    this.loadBalancer = loadBalancer
    this.healthMonitor = new HealthMonitor(registry)
  }

  async getServiceEndpoint(serviceName: string): Promise<string> {
    const instances = await this.registry.discover(serviceName)
    const healthyInstances = instances.filter(instance => instance.health === HealthStatus.HEALTHY)

    if (healthyInstances.length === 0) {
      throw new ServiceError(
        `No healthy instances available for service ${serviceName}`,
        'NO_HEALTHY_INSTANCES',
      )
    }

    const selectedInstance = this.loadBalancer.selectInstance(healthyInstances)
    return selectedInstance.endpoint
  }

  async registerService(instance: ServiceInstance): Promise<void> {
    await this.registry.register(instance)
    this.healthMonitor.startMonitoring(instance.id)

    console.info(`Service registered: ${instance.name}@${instance.endpoint}`)
  }

  async deregisterService(serviceId: string): Promise<void> {
    await this.registry.deregister(serviceId)
    this.healthMonitor.stopMonitoring(serviceId)

    console.info(`Service deregistered: ${serviceId}`)
  }
}

// Load balancing strategies
class RoundRobinLoadBalancer implements LoadBalancer {
  private counters: Map<string, number> = new Map()

  selectInstance(instances: ServiceInstance[]): ServiceInstance {
    const serviceName = instances[0].name
    const currentCounter = this.counters.get(serviceName) || 0

    const selectedIndex = currentCounter % instances.length
    this.counters.set(serviceName, currentCounter + 1)

    return instances[selectedIndex]
  }
}

class WeightedRandomLoadBalancer implements LoadBalancer {
  selectInstance(instances: ServiceInstance[]): ServiceInstance {
    const totalWeight = instances.reduce(
      (sum, instance) => sum + (instance.metadata.weight || 1),
      0,
    )

    let random = Math.random() * totalWeight

    for (const instance of instances) {
      const weight = instance.metadata.weight || 1
      random -= weight

      if (random <= 0) {
        return instance
      }
    }

    return instances[0] // Fallback
  }
}
```

## Monitoring and Observability

### Service Metrics Collection

```typescript
interface ServiceMetrics {
  requestCount: number
  errorCount: number
  averageResponseTime: number
  p95ResponseTime: number
  p99ResponseTime: number
  circuitBreakerState: CircuitState
  lastError?: string
  uptime: number
}

class ServiceMonitoringCollector {
  private metrics: Map<string, ServiceMetrics> = new Map()
  private responseTimeHistogram: Map<string, number[]> = new Map()

  recordRequest(serviceId: string, request: RequestMetric): void {
    let metrics = this.metrics.get(serviceId)
    if (!metrics) {
      metrics = this.initializeMetrics()
      this.metrics.set(serviceId, metrics)
    }

    metrics.requestCount++

    if (!request.success) {
      metrics.errorCount++
      metrics.lastError = request.error
    }

    // Update response time metrics
    this.updateResponseTimeMetrics(serviceId, request.duration)
  }

  getMetrics(serviceId: string): ServiceMetrics | null {
    return this.metrics.get(serviceId) || null
  }

  getAllMetrics(): Map<string, ServiceMetrics> {
    return new Map(this.metrics)
  }

  private updateResponseTimeMetrics(serviceId: string, duration: number): void {
    let histogram = this.responseTimeHistogram.get(serviceId)
    if (!histogram) {
      histogram = []
      this.responseTimeHistogram.set(serviceId, histogram)
    }

    histogram.push(duration)

    // Keep only last 1000 measurements
    if (histogram.length > 1000) {
      histogram.shift()
    }

    // Update metrics
    const metrics = this.metrics.get(serviceId)!
    metrics.averageResponseTime = this.calculateAverage(histogram)
    metrics.p95ResponseTime = this.calculatePercentile(histogram, 95)
    metrics.p99ResponseTime = this.calculatePercentile(histogram, 99)
  }

  private calculatePercentile(values: number[], percentile: number): number {
    const sorted = [...values].sort((a, b) => a - b)
    const index = Math.ceil((percentile / 100) * sorted.length) - 1
    return sorted[index] || 0
  }
}

// Health check implementation
class HealthCheckService {
  private checks: Map<string, HealthCheck> = new Map()

  registerHealthCheck(serviceId: string, check: HealthCheck): void {
    this.checks.set(serviceId, check)
  }

  async performHealthCheck(serviceId: string): Promise<HealthCheckResult> {
    const check = this.checks.get(serviceId)
    if (!check) {
      return {
        status: HealthStatus.UNKNOWN,
        error: 'No health check configured',
      }
    }

    try {
      const startTime = Date.now()
      const result = await check.execute()
      const duration = Date.now() - startTime

      return {
        status: result.healthy ? HealthStatus.HEALTHY : HealthStatus.UNHEALTHY,
        responseTime: duration,
        details: result.details,
        timestamp: new Date(),
      }
    } catch (error) {
      return {
        status: HealthStatus.UNHEALTHY,
        error: error.message,
        timestamp: new Date(),
      }
    }
  }

  async performAllHealthChecks(): Promise<Map<string, HealthCheckResult>> {
    const results = new Map<string, HealthCheckResult>()

    const promises = Array.from(this.checks.keys()).map(async serviceId => {
      const result = await this.performHealthCheck(serviceId)
      results.set(serviceId, result)
    })

    await Promise.all(promises)
    return results
  }
}
```

This comprehensive external services integration framework ensures robust, secure, and maintainable integration with third-party systems while providing excellent error handling, monitoring, and resilience capabilities.

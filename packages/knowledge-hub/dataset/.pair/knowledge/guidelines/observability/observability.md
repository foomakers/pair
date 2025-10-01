# Observability Practice (Level 2)

Comprehensive monitoring, logging, alerting, and system visibility practices for proactive issue detection and resolution.

## Purpose

Define observability strategies, monitoring patterns, and incident management processes that ensure comprehensive system visibility, proactive issue detection, and effective incident response.

## Scope

**In Scope:**

- Application monitoring and metrics collection
- Logging strategies and log management
- Alerting and incident management processes
- Performance observability and tracing
- System health monitoring and dashboards

**Out of Scope:**

- Infrastructure monitoring details (see [Infrastructure](infrastructure.md))
- Security monitoring implementation (see [Quality/Security](../quality/security.md))
- Performance optimization strategies (see [Quality/Performance](../quality/performance.md))
- Development environment monitoring (see [Technical Standards](../technical-standards/README.md))

## Topics Covered

### Monitoring and Logging

Application monitoring, metrics collection, and logging strategies

- Application metrics and monitoring patterns
- Logging strategies and structured logging
- Log aggregation and management
- Monitoring dashboards and visualization

### Alerting and Incident Management

Alerting strategies, incident response, and escalation procedures

- Alerting strategies and thresholds
- Incident management and response procedures
- Escalation policies and communication
- Post-incident analysis and improvement

### Performance Observability

Performance monitoring, profiling, and optimization insights

- Performance monitoring and profiling
- Application performance management (APM)
- Resource utilization monitoring
- Performance bottleneck identification

### Distributed Tracing

Distributed tracing, request flow monitoring, and service dependency tracking

- Distributed tracing and service maps
- Request flow monitoring and analysis
- Service dependency tracking
- Trace analysis and debugging

## 🛠️ Level 3: Tool-Specific Implementations

### Monitoring Platforms

- **[Prometheus](prometheus.md)** - Metrics collection and monitoring
- **[Grafana](grafana.md)** - Visualization and dashboards

### Logging Solutions

- **[ELK Stack](elk-stack.md)** - Elasticsearch, Logstash, Kibana

### Tracing Systems

- **[Jaeger](jaeger.md)** - Distributed tracing platform

## 📊 Observability Principles

### Three Pillars of Observability

**Metrics**: Quantitative measurements of system behavior and performance

- Application performance metrics (response time, throughput, error rate)
- Business metrics (user registrations, transactions, revenue)
- Resource utilization metrics (CPU, memory, disk, network)
- Custom domain-specific metrics

**Logs**: Detailed records of events and transactions within the system

- Structured logging with consistent format
- Contextual information (trace IDs, user IDs, session IDs)
- Error logs with stack traces and debugging information
- Audit logs for security and compliance

**Traces**: End-to-end request flow tracking across distributed systems

- Request correlation across microservices
- Performance bottleneck identification
- Service dependency mapping
- Error propagation tracking

### Proactive Monitoring

**Early Detection**: Identify issues before they impact users

- Health check monitoring and alerting
- Trend analysis and anomaly detection
- Capacity planning and resource forecasting
- SLA/SLO monitoring and reporting

**Predictive Analytics**: Use trends to predict potential problems

- Machine learning-based anomaly detection
- Predictive capacity planning
- Performance degradation prediction
- Failure pattern recognition

## 📈 Metrics Strategy

### Application Metrics

**Performance Metrics**:

```typescript
// Application metrics collection
import { createPrometheusMetrics } from '@prometheus/client'

export const metrics = {
  httpRequestDuration: new Histogram({
    name: 'http_request_duration_seconds',
    help: 'Duration of HTTP requests in seconds',
    labelNames: ['method', 'route', 'status_code'],
    buckets: [0.1, 0.3, 0.5, 0.7, 1, 3, 5, 7, 10],
  }),

  httpRequestsTotal: new Counter({
    name: 'http_requests_total',
    help: 'Total number of HTTP requests',
    labelNames: ['method', 'route', 'status_code'],
  }),

  activeConnections: new Gauge({
    name: 'active_connections',
    help: 'Number of active connections',
  }),

  businessMetrics: {
    userRegistrations: new Counter({
      name: 'user_registrations_total',
      help: 'Total number of user registrations',
      labelNames: ['source', 'plan'],
    }),

    transactionValue: new Histogram({
      name: 'transaction_value_dollars',
      help: 'Value of transactions in dollars',
      buckets: [1, 5, 10, 25, 50, 100, 250, 500, 1000],
    }),
  },
}

// Middleware for automatic metric collection
export const metricsMiddleware = (req: Request, res: Response, next: NextFunction) => {
  const start = Date.now()

  res.on('finish', () => {
    const duration = (Date.now() - start) / 1000
    const route = req.route?.path || 'unknown'

    metrics.httpRequestDuration
      .labels(req.method, route, res.statusCode.toString())
      .observe(duration)

    metrics.httpRequestsTotal.labels(req.method, route, res.statusCode.toString()).inc()
  })

  next()
}
```

**Business Metrics**:

```typescript
// Business metrics tracking
export class BusinessMetrics {
  static trackUserRegistration(source: string, plan: string): void {
    metrics.businessMetrics.userRegistrations.labels(source, plan).inc()
  }

  static trackTransaction(value: number, currency: string = 'USD'): void {
    if (currency === 'USD') {
      metrics.businessMetrics.transactionValue.observe(value)
    }
  }

  static trackFeatureUsage(feature: string, userId: string): void {
    metrics.featureUsage.labels(feature, 'success').inc()

    // Track in analytics system
    analytics.track(userId, 'Feature Used', { feature })
  }
}
```

### Custom Metrics

**Domain-Specific Metrics**:

```typescript
// Domain-specific metrics for different business contexts
export const domainMetrics = {
  ecommerce: {
    cartAbandonmentRate: new Gauge({
      name: 'cart_abandonment_rate',
      help: 'Percentage of abandoned shopping carts',
    }),

    averageOrderValue: new Histogram({
      name: 'average_order_value_dollars',
      help: 'Average order value in dollars',
      buckets: [10, 25, 50, 100, 200, 500, 1000],
    }),
  },

  saas: {
    monthlyActiveUsers: new Gauge({
      name: 'monthly_active_users',
      help: 'Number of monthly active users',
    }),

    featureAdoptionRate: new Gauge({
      name: 'feature_adoption_rate',
      help: 'Feature adoption rate percentage',
      labelNames: ['feature'],
    }),
  },
}
```

## 📝 Logging Standards

### Structured Logging

**JSON Logging Format**:

```typescript
// Structured logging implementation
import winston from 'winston'

const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.errors({ stack: true }),
    winston.format.json(),
    winston.format.printf(info => {
      return JSON.stringify({
        timestamp: info.timestamp,
        level: info.level,
        message: info.message,
        service: process.env.SERVICE_NAME || 'unknown',
        environment: process.env.NODE_ENV || 'development',
        traceId: info.traceId,
        spanId: info.spanId,
        userId: info.userId,
        sessionId: info.sessionId,
        ...info.metadata,
        stack: info.stack,
      })
    }),
  ),
  transports: [
    new winston.transports.Console(),
    new winston.transports.File({
      filename: 'logs/error.log',
      level: 'error',
    }),
    new winston.transports.File({
      filename: 'logs/combined.log',
    }),
  ],
})

// Request logging middleware
export const requestLogger = (req: Request, res: Response, next: NextFunction) => {
  const traceId = req.headers['x-trace-id'] || generateTraceId()
  const spanId = generateSpanId()

  // Add trace context to request
  req.traceId = traceId
  req.spanId = spanId

  logger.info('HTTP Request', {
    traceId,
    spanId,
    method: req.method,
    url: req.url,
    userAgent: req.headers['user-agent'],
    ip: req.ip,
    userId: req.user?.id,
    sessionId: req.sessionID,
  })

  next()
}
```

**Error Logging**:

```typescript
// Comprehensive error logging
export class ErrorLogger {
  static logError(error: Error, context?: Record<string, any>): void {
    logger.error('Application Error', {
      error: {
        name: error.name,
        message: error.message,
        stack: error.stack,
      },
      context,
      timestamp: new Date().toISOString(),
    })

    // Send to error tracking service
    if (process.env.NODE_ENV === 'production') {
      Sentry.captureException(error, { extra: context })
    }
  }

  static logBusinessError(
    operation: string,
    error: string,
    userId?: string,
    context?: Record<string, any>,
  ): void {
    logger.warn('Business Logic Error', {
      operation,
      error,
      userId,
      context,
      timestamp: new Date().toISOString(),
    })
  }
}
```

### Log Aggregation

**Centralized Logging Configuration**:

```yaml
# Fluentd configuration for log aggregation
apiVersion: v1
kind: ConfigMap
metadata:
  name: fluentd-config
data:
  fluent.conf: |
    <source>
      @type tail
      @id in_tail_container_logs
      path /var/log/containers/*.log
      pos_file /var/log/fluentd-containers.log.pos
      tag kubernetes.*
      read_from_head true
      <parse>
        @type json
        time_format %Y-%m-%dT%H:%M:%S.%NZ
      </parse>
    </source>

    <filter kubernetes.**>
      @type kubernetes_metadata
    </filter>

    <match kubernetes.**>
      @type elasticsearch
      host elasticsearch-service
      port 9200
      logstash_format true
      logstash_prefix kubernetes
      include_tag_key true
      type_name _doc
      tag_key @log_name
    </match>
```

## 🔍 Distributed Tracing

### Trace Implementation

**OpenTelemetry Integration**:

```typescript
// OpenTelemetry setup
import { NodeSDK } from '@opentelemetry/sdk-node'
import { JaegerExporter } from '@opentelemetry/exporter-jaeger'
import { Resource } from '@opentelemetry/resources'
import { SemanticResourceAttributes } from '@opentelemetry/semantic-conventions'

const sdk = new NodeSDK({
  resource: new Resource({
    [SemanticResourceAttributes.SERVICE_NAME]: 'myapp',
    [SemanticResourceAttributes.SERVICE_VERSION]: process.env.APP_VERSION || '1.0.0',
    [SemanticResourceAttributes.DEPLOYMENT_ENVIRONMENT]: process.env.NODE_ENV || 'development',
  }),
  traceExporter: new JaegerExporter({
    endpoint: process.env.JAEGER_ENDPOINT || 'http://localhost:14268/api/traces',
  }),
})

sdk.start()

// Manual tracing for business operations
import { trace } from '@opentelemetry/api'

export class TracingService {
  private tracer = trace.getTracer('business-operations')

  async traceBusinessOperation<T>(
    name: string,
    operation: () => Promise<T>,
    attributes?: Record<string, string | number | boolean>,
  ): Promise<T> {
    return this.tracer.startActiveSpan(name, { attributes }, async span => {
      try {
        const result = await operation()
        span.setStatus({ code: SpanStatusCode.OK })
        return result
      } catch (error) {
        span.setStatus({
          code: SpanStatusCode.ERROR,
          message: error instanceof Error ? error.message : 'Unknown error',
        })
        span.recordException(error as Error)
        throw error
      } finally {
        span.end()
      }
    })
  }
}
```

**Service Dependency Tracking**:

```typescript
// Automatic service dependency tracking
export const tracingMiddleware = (req: Request, res: Response, next: NextFunction) => {
  const tracer = trace.getTracer('http-server')

  tracer.startActiveSpan(`${req.method} ${req.route?.path || req.path}`, span => {
    span.setAttributes({
      'http.method': req.method,
      'http.url': req.url,
      'http.route': req.route?.path || 'unknown',
      'user.id': req.user?.id || 'anonymous',
    })

    res.on('finish', () => {
      span.setAttributes({
        'http.status_code': res.statusCode,
        'http.response_size': res.get('content-length') || 0,
      })

      if (res.statusCode >= 400) {
        span.setStatus({
          code: SpanStatusCode.ERROR,
          message: `HTTP ${res.statusCode}`,
        })
      }

      span.end()
    })

    next()
  })
}
```

## 🚨 Alerting Strategy

### Alert Configuration

**Multi-Channel Alerting**:

```yaml
# Prometheus alerting rules
groups:
  - name: application.rules
    rules:
      - alert: HighErrorRate
        expr: |
          (
            rate(http_requests_total{status_code=~"5.."}[5m]) /
            rate(http_requests_total[5m])
          ) > 0.05
        for: 5m
        labels:
          severity: critical
          service: '{{ $labels.service }}'
        annotations:
          summary: 'High error rate detected'
          description: 'Error rate is {{ $value | humanizePercentage }} for service {{ $labels.service }}'
          runbook_url: 'https://runbooks.example.com/high-error-rate'

      - alert: HighLatency
        expr: |
          histogram_quantile(0.95, rate(http_request_duration_seconds_bucket[5m])) > 1
        for: 10m
        labels:
          severity: warning
          service: '{{ $labels.service }}'
        annotations:
          summary: 'High latency detected'
          description: '95th percentile latency is {{ $value }}s for service {{ $labels.service }}'

      - alert: LowAvailability
        expr: |
          (
            rate(http_requests_total{status_code=~"2.."}[5m]) /
            rate(http_requests_total[5m])
          ) < 0.95
        for: 15m
        labels:
          severity: critical
          service: '{{ $labels.service }}'
        annotations:
          summary: 'Low availability detected'
          description: 'Availability is {{ $value | humanizePercentage }} for service {{ $labels.service }}'
```

### Incident Management

**Automated Incident Response**:

```typescript
// Automated incident response system
export class IncidentManager {
  async handleAlert(alert: Alert): Promise<void> {
    const incident = await this.createIncident(alert)

    // Notify on-call team
    await this.notifyOnCallTeam(incident)

    // Try automated remediation
    if (alert.labels.autoRemediate === 'true') {
      await this.attemptAutoRemediation(incident)
    }

    // Update status page
    await this.updateStatusPage(incident)

    // Start incident timeline
    await this.startIncidentTimeline(incident)
  }

  private async createIncident(alert: Alert): Promise<Incident> {
    return {
      id: generateIncidentId(),
      title: alert.annotations.summary,
      description: alert.annotations.description,
      severity: alert.labels.severity,
      service: alert.labels.service,
      status: 'investigating',
      createdAt: new Date().toISOString(),
      runbookUrl: alert.annotations.runbook_url,
    }
  }

  private async attemptAutoRemediation(incident: Incident): Promise<void> {
    const remediationActions = this.getRemediationActions(incident)

    for (const action of remediationActions) {
      try {
        await action.execute()
        await this.logRemediationAction(incident.id, action.name, 'success')
      } catch (error) {
        await this.logRemediationAction(incident.id, action.name, 'failed', error.message)
      }
    }
  }
}
```

## 🔗 Related Practices

- **[Infrastructure](infrastructure.md)** - Infrastructure monitoring and observability
- **[Deployment](deployment.md)** - Deployment monitoring and pipeline observability
- **[Environment Management](environment-management.md)** - Configuration monitoring and drift detection
- **[Quality/Performance](../quality/performance.md)** - Performance optimization strategies

---

_Focus on comprehensive system visibility, proactive monitoring, and effective incident response._

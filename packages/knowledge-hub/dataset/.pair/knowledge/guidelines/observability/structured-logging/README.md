# Structured Logging

## 🎯 Overview

**Purpose**: Strategic structured logging framework that transforms logs from unstructured text into queryable, analyzable data for operational insights and debugging efficiency.

**Scope**: Log structure design, contextual information management, log level strategies, and sensitive data protection with standardized logging practices.

**Prerequisites**: Understanding of logging fundamentals and access to centralized logging infrastructure.

---

## 🚀 Quick Start Decision Tree

```
What logging structure do you need?
├─ Basic Structure → Start with [JSON Logging](#json-logging)
├─ Context Tracking → Implement [Contextual Logging](#contextual-logging)
├─ Sensitive Data → Apply [Data Protection](#sensitive-data-protection)
├─ Performance Logs → Use [Performance Logging](#performance-logging)
└─ Complete Solution → Deploy [Full Structured Logging](#comprehensive-logging)
```

---

## 📊 Structured Logging Framework

### Log Structure Design

**Standard Log Format**:

```json
{
  "timestamp": "2025-01-15T14:30:00.000Z",
  "level": "info",
  "message": "User login successful",
  "service": "auth-service",
  "version": "1.2.3",
  "environment": "production",
  "traceId": "abc123def456",
  "spanId": "def456ghi789",
  "userId": "user_12345",
  "action": "user_login",
  "duration": 150,
  "metadata": {
    "userAgent": "Mozilla/5.0...",
    "ip": "192.168.1.100",
    "method": "POST",
    "path": "/auth/login"
  }
}
```

### Core Log Components

**Required Fields**:

- **timestamp**: ISO 8601 formatted timestamp
- **level**: Log severity level (error, warn, info, debug)
- **message**: Human-readable description
- **service**: Service/application identifier
- **version**: Application version

**Context Fields**:

- **traceId**: Distributed tracing identifier
- **spanId**: Specific operation identifier
- **userId**: User context (when applicable)
- **sessionId**: Session tracking identifier
- **requestId**: Request correlation identifier

**Operational Fields**:

- **environment**: Deployment environment
- **region**: Geographic deployment region
- **instance**: Service instance identifier
- **process**: Process or worker identifier

---

## 📝 Log Levels and Usage

### Log Level Strategy

**ERROR Level**:

- **Purpose**: System errors requiring immediate attention
- **Examples**: Unhandled exceptions, external service failures, data corruption
- **Response**: Alert engineering team, investigate immediately

**WARN Level**:

- **Purpose**: Potential issues that don't break functionality
- **Examples**: Deprecated API usage, resource constraints, retry attempts
- **Response**: Monitor trends, plan remediation

**INFO Level**:

- **Purpose**: Normal operational events and business logic
- **Examples**: User actions, system state changes, external API calls
- **Response**: Business analytics, audit trails

**DEBUG Level**:

- **Purpose**: Detailed execution information for development
- **Examples**: Variable values, function entry/exit, detailed flow
- **Response**: Development debugging, performance analysis

### Log Level Implementation

```typescript
interface LogContext {
  traceId?: string
  spanId?: string
  userId?: string
  sessionId?: string
  requestId?: string
  metadata?: Record<string, any>
}

class StructuredLogger {
  private service: string
  private version: string
  private environment: string

  constructor(config: LoggerConfig) {
    this.service = config.service
    this.version = config.version
    this.environment = config.environment
  }

  error(message: string, error?: Error, context?: LogContext) {
    this.log('error', message, { error: this.serializeError(error), ...context })
  }

  warn(message: string, context?: LogContext) {
    this.log('warn', message, context)
  }

  info(message: string, context?: LogContext) {
    this.log('info', message, context)
  }

  debug(message: string, context?: LogContext) {
    if (this.environment === 'development' || this.isDebugEnabled()) {
      this.log('debug', message, context)
    }
  }

  private log(level: LogLevel, message: string, context?: LogContext) {
    const logEntry = {
      timestamp: new Date().toISOString(),
      level,
      message,
      service: this.service,
      version: this.version,
      environment: this.environment,
      ...context,
    }

    console.log(JSON.stringify(logEntry))
  }
}
```

---

## 🔧 Contextual Information Management

### Request Context Tracking

**HTTP Request Logging**:

```typescript
class RequestLogger {
  logRequest(req: Request, res: Response, duration: number) {
    const context = {
      traceId: req.headers['x-trace-id'],
      method: req.method,
      path: req.path,
      statusCode: res.statusCode,
      duration,
      userAgent: req.headers['user-agent'],
      ip: this.getClientIP(req),
      userId: req.user?.id,
      sessionId: req.session?.id,
    }

    if (res.statusCode >= 400) {
      this.logger.error('HTTP request failed', context)
    } else {
      this.logger.info('HTTP request completed', context)
    }
  }

  logDatabaseQuery(query: string, duration: number, context?: LogContext) {
    this.logger.info('Database query executed', {
      queryType: this.getQueryType(query),
      duration,
      ...context,
    })
  }

  logExternalAPI(url: string, method: string, statusCode: number, duration: number) {
    this.logger.info('External API call', {
      url: this.sanitizeURL(url),
      method,
      statusCode,
      duration,
      success: statusCode < 400,
    })
  }
}
```

### Business Logic Logging

**User Action Tracking**:

```typescript
class BusinessLogger {
  logUserAction(action: string, userId: string, metadata?: Record<string, any>) {
    this.logger.info('User action performed', {
      userId,
      action,
      timestamp: Date.now(),
      ...metadata,
    })
  }

  logBusinessEvent(event: string, data: Record<string, any>) {
    this.logger.info('Business event occurred', {
      event,
      data: this.sanitizeBusinessData(data),
      timestamp: Date.now(),
    })
  }

  logPerformanceMetric(metric: string, value: number, unit: string) {
    this.logger.info('Performance metric recorded', {
      metric,
      value,
      unit,
      timestamp: Date.now(),
    })
  }
}
```

---

## 🔐 Sensitive Data Protection

### Data Sanitization Strategy

**PII Protection**:

```typescript
class DataSanitizer {
  private readonly sensitiveFields = [
    'password',
    'token',
    'secret',
    'key',
    'authorization',
    'ssn',
    'credit_card',
    'phone',
    'email',
  ]

  sanitizeLogData(data: any): any {
    if (typeof data !== 'object' || data === null) {
      return data
    }

    const sanitized = Array.isArray(data) ? [] : {}

    for (const [key, value] of Object.entries(data)) {
      if (this.isSensitiveField(key)) {
        sanitized[key] = '[REDACTED]'
      } else if (typeof value === 'object') {
        sanitized[key] = this.sanitizeLogData(value)
      } else {
        sanitized[key] = value
      }
    }

    return sanitized
  }

  private isSensitiveField(fieldName: string): boolean {
    const lowerField = fieldName.toLowerCase()
    return this.sensitiveFields.some(sensitive => lowerField.includes(sensitive))
  }
}
```

### Compliance Considerations

**GDPR/Privacy Compliance**:

- **Data Minimization**: Log only necessary information
- **Retention Policies**: Implement log retention limits
- **Access Controls**: Restrict log access to authorized personnel
- **Audit Trails**: Track log access and modifications

**Security Standards**:

- **Encryption**: Encrypt logs in transit and at rest
- **Integrity**: Ensure log tampering detection
- **Anonymization**: Remove or hash personal identifiers
- **Monitoring**: Monitor log access patterns

---

## 📈 Log Analysis and Querying

### Query Patterns

**Common Log Queries**:

```javascript
// Find all errors for a specific user
{
  "level": "error",
  "userId": "user_12345",
  "timestamp": {
    "$gte": "2025-01-15T00:00:00Z",
    "$lt": "2025-01-16T00:00:00Z"
  }
}

// Trace request flow across services
{
  "traceId": "abc123def456"
}

// Monitor API performance
{
  "message": "HTTP request completed",
  "duration": { "$gt": 1000 },
  "timestamp": { "$gte": "2025-01-15T14:00:00Z" }
}

// Business analytics
{
  "action": "purchase_completed",
  "metadata.amount": { "$gt": 100 }
}
```

### Log Aggregation Strategies

**Performance Monitoring**:

```javascript
// Average response time by endpoint
db.logs.aggregate([
  { $match: { message: 'HTTP request completed' } },
  {
    $group: {
      _id: '$path',
      avgDuration: { $avg: '$duration' },
      requestCount: { $sum: 1 },
    },
  },
  { $sort: { avgDuration: -1 } },
])

// Error rate by service
db.logs.aggregate([
  { $match: { level: { $in: ['error', 'warn'] } } },
  {
    $group: {
      _id: '$service',
      errorCount: { $sum: 1 },
      lastError: { $max: '$timestamp' },
    },
  },
])
```

---

## 🛠️ Implementation Tools

### Logging Libraries

**Node.js/TypeScript**:

- **Winston**: Flexible logging library with multiple transports
- **Pino**: High-performance JSON logger
- **Bunyan**: JSON logging library with child loggers

**Log Aggregation Platforms**:

- **ELK Stack**: Elasticsearch, Logstash, Kibana
- **Grafana Loki**: Log aggregation system
- **Splunk**: Enterprise log management
- **DataDog Logs**: Cloud-native log management

### Configuration Examples

**Winston Configuration**:

```typescript
import winston from 'winston'

const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.errors({ stack: true }),
    winston.format.json(),
  ),
  defaultMeta: {
    service: 'api-service',
    version: process.env.APP_VERSION || '1.0.0',
    environment: process.env.NODE_ENV || 'development',
  },
  transports: [
    new winston.transports.Console(),
    new winston.transports.File({ filename: 'logs/error.log', level: 'error' }),
    new winston.transports.File({ filename: 'logs/combined.log' }),
  ],
})
```

---

## 📋 Implementation Checklist

### Structured Logging Setup

- [ ] **Choose Logging Library**: Select appropriate structured logging library
- [ ] **Define Log Schema**: Establish standard log format and required fields
- [ ] **Implement Context Tracking**: Add tracing and correlation IDs
- [ ] **Configure Log Levels**: Set up appropriate log level strategy
- [ ] **Add Sanitization**: Implement sensitive data protection
- [ ] **Set Up Aggregation**: Configure centralized log collection

### Operational Excellence

- [ ] **Log Retention**: Define and implement log retention policies
- [ ] **Performance Monitoring**: Monitor logging performance impact
- [ ] **Alert Integration**: Connect critical logs to alerting systems
- [ ] **Documentation**: Document logging standards and practices
- [ ] **Team Training**: Train team on structured logging practices
- [ ] **Regular Review**: Periodically review and optimize logging strategy

---

## 🚀 Next Steps

1. **Assess Current Logging**: Evaluate existing logging practices and gaps
2. **Design Log Schema**: Define standard log structure for your applications
3. **Implement Logging Library**: Set up structured logging infrastructure
4. **Add Context Tracking**: Implement distributed tracing integration
5. **Configure Aggregation**: Set up centralized log collection and analysis
6. **Monitor and Optimize**: Regularly review and improve logging practices

---

## 🔗 Related Resources

- **[JSON Logging](json-logging.md)**: Specific JSON logging implementation
- **[Log Levels](log-levels.md)**: Detailed log level guidance
- **[Sensitive Data Protection](sensitive-data-protection.md)**: Security implementation
- **[Observability Principles](../observability-principles/README.md)**: Foundation concepts

---

**Next**: [JSON Logging](json-logging.md) | **Previous**: [Observability Overview](../README.md)

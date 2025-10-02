# JSON Logging Implementation

## 🎯 Overview

**Purpose**: JSON-based logging implementation that provides structured, queryable log data with consistent formatting and efficient parsing for modern log aggregation systems.

**Scope**: JSON log structure design, implementation patterns, parsing strategies, and integration with log analysis tools.

**Prerequisites**: Understanding of JSON format and structured logging principles.

---

## 🚀 Quick Start Decision Tree

```
What JSON logging setup do you need?
├─ Basic JSON Logs → Use [Standard JSON Format](#standard-json-format)
├─ Performance Optimized → Implement [Efficient JSON Logging](#performance-optimization)
├─ Complex Applications → Use [Hierarchical JSON Structure](#complex-structures)
├─ Legacy Integration → Apply [JSON Migration Strategy](#legacy-migration)
└─ Complete Solution → Deploy [Full JSON Logging Stack](#comprehensive-implementation)
```

---

## 📊 JSON Log Structure Design

### Standard JSON Log Format

**Core JSON Schema**:

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "type": "object",
  "required": ["timestamp", "level", "message", "service"],
  "properties": {
    "timestamp": {
      "type": "string",
      "format": "date-time",
      "description": "ISO 8601 timestamp"
    },
    "level": {
      "type": "string",
      "enum": ["error", "warn", "info", "debug"],
      "description": "Log severity level"
    },
    "message": {
      "type": "string",
      "description": "Human-readable log message"
    },
    "service": {
      "type": "string",
      "description": "Service or application identifier"
    },
    "context": {
      "type": "object",
      "properties": {
        "traceId": { "type": "string" },
        "spanId": { "type": "string" },
        "userId": { "type": "string" },
        "sessionId": { "type": "string" }
      }
    },
    "metadata": {
      "type": "object",
      "description": "Additional structured data"
    }
  }
}
```

### Hierarchical Data Organization

**Nested Context Structure**:

```json
{
  "timestamp": "2025-01-15T14:30:00.000Z",
  "level": "info",
  "message": "User order completed",
  "service": "order-service",
  "version": "2.1.0",
  "environment": "production",
  "context": {
    "trace": {
      "traceId": "abc123def456",
      "spanId": "def456ghi789",
      "parentSpanId": "ghi789jkl012"
    },
    "user": {
      "userId": "user_12345",
      "sessionId": "sess_67890",
      "role": "customer"
    },
    "request": {
      "requestId": "req_abcdef",
      "method": "POST",
      "path": "/orders",
      "ip": "192.168.1.100",
      "userAgent": "Mozilla/5.0..."
    }
  },
  "business": {
    "order": {
      "orderId": "order_98765",
      "amount": 125.5,
      "currency": "USD",
      "items": 3
    },
    "metrics": {
      "processingTime": 1250,
      "databaseQueries": 4,
      "externalAPICalls": 2
    }
  },
  "technical": {
    "instance": "api-pod-xyz123",
    "region": "us-east-1",
    "process": 15678,
    "memory": {
      "used": "245MB",
      "heap": "180MB"
    }
  }
}
```

---

## 🔧 Implementation Patterns

### TypeScript JSON Logger

```typescript
interface JSONLogEntry {
  timestamp: string
  level: LogLevel
  message: string
  service: string
  version?: string
  environment?: string
  context?: LogContext
  metadata?: Record<string, any>
}

interface LogContext {
  trace?: {
    traceId?: string
    spanId?: string
    parentSpanId?: string
  }
  user?: {
    userId?: string
    sessionId?: string
    role?: string
  }
  request?: {
    requestId?: string
    method?: string
    path?: string
    ip?: string
    userAgent?: string
  }
}

class JSONLogger {
  private config: LoggerConfig

  constructor(config: LoggerConfig) {
    this.config = {
      service: config.service,
      version: config.version || '1.0.0',
      environment: config.environment || 'development',
      ...config,
    }
  }

  log(level: LogLevel, message: string, context?: LogContext, metadata?: Record<string, any>) {
    const logEntry: JSONLogEntry = {
      timestamp: new Date().toISOString(),
      level,
      message,
      service: this.config.service,
      version: this.config.version,
      environment: this.config.environment,
    }

    if (context) {
      logEntry.context = this.sanitizeContext(context)
    }

    if (metadata) {
      logEntry.metadata = this.sanitizeMetadata(metadata)
    }

    // Ensure valid JSON
    const jsonString = this.safeStringify(logEntry)
    console.log(jsonString)

    // Send to external log aggregator if configured
    if (this.config.externalLogger) {
      this.config.externalLogger.send(logEntry)
    }
  }

  private safeStringify(obj: any): string {
    try {
      return JSON.stringify(obj, this.jsonReplacer)
    } catch (error) {
      // Fallback for circular references or other JSON errors
      return JSON.stringify({
        timestamp: new Date().toISOString(),
        level: 'error',
        message: 'Failed to serialize log entry',
        service: this.config.service,
        error: error.message,
      })
    }
  }

  private jsonReplacer(key: string, value: any): any {
    // Handle circular references
    if (typeof value === 'object' && value !== null) {
      if (this.seen.has(value)) {
        return '[Circular Reference]'
      }
      this.seen.add(value)
    }

    // Convert functions to string representation
    if (typeof value === 'function') {
      return '[Function]'
    }

    // Handle Error objects
    if (value instanceof Error) {
      return {
        name: value.name,
        message: value.message,
        stack: value.stack,
      }
    }

    return value
  }
}
```

### Performance-Optimized JSON Logging

```typescript
class HighPerformanceJSONLogger {
  private buffer: JSONLogEntry[] = []
  private bufferSize = 100
  private flushInterval = 5000 // 5 seconds
  private timer: NodeJS.Timeout

  constructor(config: LoggerConfig) {
    this.setupBuffering()
  }

  private setupBuffering() {
    this.timer = setInterval(() => {
      this.flush()
    }, this.flushInterval)

    // Flush on process exit
    process.on('beforeExit', () => this.flush())
    process.on('SIGINT', () => this.flush())
    process.on('SIGTERM', () => this.flush())
  }

  log(level: LogLevel, message: string, context?: LogContext) {
    const logEntry = this.createLogEntry(level, message, context)

    // Use object pooling for frequently created objects
    this.buffer.push(logEntry)

    if (this.buffer.length >= this.bufferSize) {
      this.flush()
    }
  }

  private flush() {
    if (this.buffer.length === 0) return

    const logs = this.buffer.splice(0, this.buffer.length)
    const batchLog = {
      timestamp: new Date().toISOString(),
      batch: true,
      count: logs.length,
      logs,
    }

    console.log(JSON.stringify(batchLog))
  }

  private createLogEntry(level: LogLevel, message: string, context?: LogContext): JSONLogEntry {
    // Pre-allocate common properties for performance
    return {
      t: Date.now(), // Use shorter field names for performance
      l: level,
      m: message,
      s: this.config.service,
      c: context,
    }
  }
}
```

---

## 📈 JSON Log Parsing and Analysis

### Log Parsing Strategies

**Logstash Configuration**:

```ruby
# logstash.conf
input {
  beats {
    port => 5044
  }
}

filter {
  if [fields][service] {
    json {
      source => "message"
    }

    # Parse timestamp
    date {
      match => [ "timestamp", "ISO8601" ]
    }

    # Extract trace information
    if [context][trace][traceId] {
      mutate {
        add_field => { "traceId" => "%{[context][trace][traceId]}" }
      }
    }

    # Extract user information
    if [context][user][userId] {
      mutate {
        add_field => { "userId" => "%{[context][user][userId]}" }
      }
    }

    # Parse performance metrics
    if [business][metrics] {
      ruby {
        code => "
          metrics = event.get('[business][metrics]')
          if metrics
            event.set('performance_processing_time', metrics['processingTime'])
            event.set('performance_db_queries', metrics['databaseQueries'])
          end
        "
      }
    }
  }
}

output {
  elasticsearch {
    hosts => ["elasticsearch:9200"]
    index => "application-logs-%{+YYYY.MM.dd}"
  }
}
```

### Elasticsearch Index Mapping

```json
{
  "mappings": {
    "properties": {
      "timestamp": {
        "type": "date",
        "format": "strict_date_optional_time"
      },
      "level": {
        "type": "keyword"
      },
      "message": {
        "type": "text",
        "analyzer": "standard"
      },
      "service": {
        "type": "keyword"
      },
      "traceId": {
        "type": "keyword"
      },
      "userId": {
        "type": "keyword"
      },
      "context": {
        "type": "object",
        "properties": {
          "trace": {
            "properties": {
              "traceId": { "type": "keyword" },
              "spanId": { "type": "keyword" }
            }
          },
          "user": {
            "properties": {
              "userId": { "type": "keyword" },
              "role": { "type": "keyword" }
            }
          }
        }
      },
      "business": {
        "type": "object",
        "properties": {
          "metrics": {
            "properties": {
              "processingTime": { "type": "long" },
              "databaseQueries": { "type": "integer" }
            }
          }
        }
      }
    }
  }
}
```

---

## 🔍 Query Patterns and Analytics

### Common JSON Log Queries

**Elasticsearch Query Examples**:

```json
// Find all errors for a specific trace
{
  "query": {
    "bool": {
      "must": [
        { "term": { "level": "error" } },
        { "term": { "context.trace.traceId": "abc123def456" } }
      ]
    }
  },
  "sort": [
    { "timestamp": { "order": "asc" } }
  ]
}

// Aggregate performance metrics by service
{
  "size": 0,
  "aggs": {
    "services": {
      "terms": { "field": "service" },
      "aggs": {
        "avg_processing_time": {
          "avg": { "field": "business.metrics.processingTime" }
        },
        "error_rate": {
          "filter": { "term": { "level": "error" } }
        }
      }
    }
  }
}

// Time-series analysis of log levels
{
  "size": 0,
  "aggs": {
    "timeline": {
      "date_histogram": {
        "field": "timestamp",
        "interval": "1h"
      },
      "aggs": {
        "levels": {
          "terms": { "field": "level" }
        }
      }
    }
  }
}
```

### Kibana Dashboard Queries

```json
// User journey tracking
{
  "query": {
    "bool": {
      "must": [
        { "term": { "context.user.userId": "user_12345" } },
        { "range": { "timestamp": { "gte": "now-1h" } } }
      ]
    }
  },
  "sort": [
    { "timestamp": { "order": "asc" } }
  ]
}

// Performance monitoring
{
  "query": {
    "bool": {
      "must": [
        { "exists": { "field": "business.metrics.processingTime" } },
        { "range": { "business.metrics.processingTime": { "gt": 1000 } } }
      ]
    }
  }
}
```

---

## 🛠️ Integration and Migration

### Legacy Log Migration

**Migration Strategy**:

```typescript
class LogMigrationAdapter {
  private legacyParser: LegacyLogParser

  migrateLegacyLog(legacyLogLine: string): JSONLogEntry | null {
    try {
      const parsed = this.legacyParser.parse(legacyLogLine)

      return {
        timestamp: this.convertTimestamp(parsed.timestamp),
        level: this.mapLogLevel(parsed.level),
        message: parsed.message,
        service: this.extractService(parsed),
        context: this.buildContext(parsed),
        metadata: {
          original_format: 'legacy',
          migration_timestamp: new Date().toISOString(),
        },
      }
    } catch (error) {
      console.error('Failed to migrate legacy log:', error)
      return null
    }
  }

  private mapLogLevel(legacyLevel: string): LogLevel {
    const levelMap: Record<string, LogLevel> = {
      ERROR: 'error',
      WARNING: 'warn',
      INFO: 'info',
      DEBUG: 'debug',
    }
    return levelMap[legacyLevel.toUpperCase()] || 'info'
  }
}
```

### JSON Schema Validation

```typescript
import Ajv from 'ajv'

class JSONLogValidator {
  private ajv: Ajv
  private schema: object

  constructor() {
    this.ajv = new Ajv()
    this.schema = this.loadSchema()
  }

  validateLogEntry(logEntry: any): boolean {
    const validate = this.ajv.compile(this.schema)
    const valid = validate(logEntry)

    if (!valid) {
      console.error('Log validation failed:', validate.errors)
      return false
    }

    return true
  }

  private loadSchema(): object {
    return {
      type: 'object',
      required: ['timestamp', 'level', 'message', 'service'],
      properties: {
        timestamp: { type: 'string', format: 'date-time' },
        level: { type: 'string', enum: ['error', 'warn', 'info', 'debug'] },
        message: { type: 'string' },
        service: { type: 'string' },
      },
    }
  }
}
```

---

## 📋 Implementation Checklist

### JSON Logging Setup

- [ ] **Define JSON Schema**: Establish standard JSON log structure
- [ ] **Implement Logger**: Create JSON logging infrastructure
- [ ] **Add Validation**: Implement JSON schema validation
- [ ] **Configure Parsing**: Set up log parsing in aggregation system
- [ ] **Create Indexes**: Design optimal Elasticsearch indexes
- [ ] **Build Dashboards**: Create JSON log analysis dashboards

### Performance and Reliability

- [ ] **Performance Testing**: Measure JSON logging performance impact
- [ ] **Buffer Management**: Implement log buffering for high-volume scenarios
- [ ] **Error Handling**: Add fallback mechanisms for JSON serialization failures
- [ ] **Schema Evolution**: Plan for JSON schema versioning and migration
- [ ] **Monitoring**: Monitor JSON logging system health
- [ ] **Documentation**: Document JSON structure and query patterns

---

## 🚀 Next Steps

1. **Design JSON Schema**: Define standard JSON log structure for your applications
2. **Implement Logger**: Set up JSON logging library and infrastructure
3. **Configure Parsing**: Set up JSON log parsing in your aggregation system
4. **Create Dashboards**: Build analysis and monitoring dashboards
5. **Migrate Legacy Logs**: Plan and execute migration from legacy log formats
6. **Monitor and Optimize**: Continuously improve JSON logging performance

---

## 🔗 Related Resources

- **[Log Levels](log-levels.md)**: Detailed log level guidance
- **[Contextual Information](contextual-information.md)**: Context tracking implementation
- **[Sensitive Data Protection](sensitive-data-protection.md)**: Security considerations
- **[Structured Logging Overview](README.md)**: Foundation concepts

---

**Next**: [Log Levels](log-levels.md) | **Previous**: [Structured Logging](README.md)

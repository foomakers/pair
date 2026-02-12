# Contextual Information

## Purpose

Define strategies for enriching logs with contextual information that enables effective debugging, monitoring, and analysis while maintaining performance and security.

## Scope

#### In Scope:

- Context enrichment strategies and techniques
- Correlation ID implementation and usage
- User and session context handling
- Request and transaction correlation
- Business context integration
- Performance impact optimization

#### Out of Scope:

- Sensitive data handling (covered in separate document)
- Specific logging tool configurations
- Storage and indexing optimization
- Log aggregation infrastructure

## Introduction

Contextual information transforms isolated log entries into correlated, meaningful data that enables efficient debugging and system understanding. Proper context enrichment allows teams to trace requests across services, understand user journeys, and correlate business events with technical operations.

## Context Categories

### Technical Context

#### Request Context:

```json
{
  "timestamp": "2024-01-15T10:30:00.000Z",
  "level": "INFO",
  "message": "Processing user request",
  "requestId": "req-abc123def456",
  "traceId": "trace-xyz789uvw012",
  "spanId": "span-123abc456def",
  "parentSpanId": "span-parent789ghi",
  "method": "POST",
  "endpoint": "/api/users/profile",
  "userAgent": "Mozilla/5.0...",
  "clientIp": "192.168.1.100"
}
```

#### Service Context:

```json
{
  "service": "user-service",
  "version": "1.2.3",
  "environment": "production",
  "region": "us-west-2",
  "instance": "i-1234567890abcdef0",
  "container": "user-service-7d8f9b6c5d",
  "deployment": "release-2024-01-15"
}
```

#### Performance Context:

```json
{
  "execution": {
    "duration": 245,
    "cpuTime": 120,
    "memoryUsed": 1048576,
    "dbQueries": 3,
    "externalCalls": 1
  }
}
```

### Business Context

#### User Context:

```json
{
  "user": {
    "id": "user-12345",
    "role": "premium_customer",
    "subscription": "pro",
    "timezone": "America/New_York",
    "locale": "en-US"
  }
}
```

#### Transaction Context:

```json
{
  "transaction": {
    "id": "txn-abc123",
    "type": "payment",
    "amount": 99.99,
    "currency": "USD",
    "merchant": "example-store"
  }
}
```

#### Session Context:

```json
{
  "session": {
    "id": "sess-xyz789",
    "startTime": "2024-01-15T10:00:00.000Z",
    "duration": 1800,
    "pageViews": 5,
    "actions": 12
  }
}
```

## Correlation Strategies

### Distributed Tracing Integration

#### OpenTelemetry Context:

```json
{
  "tracing": {
    "traceId": "550e8400e29b41d4a716446655440000",
    "spanId": "6ba7b810-9dad-11d1-80b4-00c04fd430c8",
    "parentSpanId": "6ba7b811-9dad-11d1-80b4-00c04fd430c8",
    "traceFlags": "01",
    "traceState": "rojo=00f067aa0ba902b7,congo=t61rcWkgMzE"
  }
}
```

#### Cross-Service Correlation:

```json
{
  "correlation": {
    "requestId": "req-global-123",
    "causationId": "cause-456",
    "conversationId": "conv-789",
    "workflowId": "wf-012"
  }
}
```

### Request Flow Tracking

#### API Gateway Context:

```json
{
  "gateway": {
    "requestId": "gw-req-123",
    "route": "/api/v1/users",
    "upstreamService": "user-service",
    "loadBalancer": "lb-001",
    "retryCount": 0
  }
}
```

#### Service-to-Service Calls:

```json
{
  "serviceCall": {
    "caller": "order-service",
    "callee": "inventory-service",
    "operation": "checkStock",
    "protocol": "HTTP",
    "timeout": 5000
  }
}
```

## Context Propagation

### HTTP Header Propagation

#### Standard Headers:

```http
X-Request-ID: req-abc123def456
X-Trace-ID: trace-xyz789uvw012
X-Span-ID: span-123abc456def
X-User-ID: user-12345
X-Session-ID: sess-xyz789
```

#### Custom Business Headers:

```http
X-Tenant-ID: tenant-enterprise-001
X-Feature-Flags: feature-a=on,feature-b=off
X-AB-Test: experiment-123=variant-b
X-Client-Version: mobile-app-2.1.0
```

### Message Queue Context

#### Message Metadata:

```json
{
  "messageContext": {
    "messageId": "msg-abc123",
    "correlationId": "corr-def456",
    "causationId": "cause-ghi789",
    "timestamp": "2024-01-15T10:30:00.000Z",
    "source": "order-service",
    "destination": "notification-service",
    "messageType": "OrderPlaced"
  }
}
```

#### Event Context:

```json
{
  "event": {
    "type": "UserRegistered",
    "version": "1.0",
    "source": "auth-service",
    "aggregateId": "user-12345",
    "aggregateVersion": 1,
    "causedBy": "user-registration-flow"
  }
}
```

## Implementation Patterns

### Context Injection

#### Middleware Pattern:

```javascript
// Example middleware for context injection
const contextMiddleware = (req, res, next) => {
  req.context = {
    requestId: req.headers['x-request-id'] || generateRequestId(),
    traceId: req.headers['x-trace-id'] || generateTraceId(),
    userId: extractUserId(req),
    sessionId: extractSessionId(req),
    timestamp: new Date().toISOString(),
  }
  next()
}
```

#### Logger Enhancement:

```javascript
// Context-aware logger
const logger = require('./logger')
const contextualLogger = {
  info: (message, data = {}) => {
    logger.info(message, {
      ...getRequestContext(),
      ...data,
    })
  },
}
```

### Context Storage

#### Thread-Local Storage:

```javascript
// Node.js AsyncLocalStorage example
const { AsyncLocalStorage } = require('async_hooks')
const contextStorage = new AsyncLocalStorage()

const withContext = (context, fn) => {
  contextStorage.run(context, fn)
}

const getContext = () => {
  return contextStorage.getStore() || {}
}
```

#### Context Provider Pattern:

```javascript
// React Context for frontend logging
const LoggingContext = React.createContext()

const LoggingProvider = ({ children }) => {
  const context = {
    userId: user?.id,
    sessionId: session?.id,
    page: location.pathname,
    userAgent: navigator.userAgent,
  }

  return <LoggingContext.Provider value={context}>{children}</LoggingContext.Provider>
}
```

## Context Enrichment Strategies

### Automatic Enrichment

#### Framework Integration:

```json
{
  "framework": {
    "name": "Express.js",
    "version": "4.18.0",
    "route": "/api/users/:id",
    "method": "GET",
    "middleware": ["auth", "validation", "rateLimit"]
  }
}
```

#### Infrastructure Context:

```json
{
  "infrastructure": {
    "cloud": "AWS",
    "region": "us-west-2",
    "availabilityZone": "us-west-2a",
    "instance": "i-1234567890abcdef0",
    "cluster": "production-cluster",
    "namespace": "user-services"
  }
}
```

### Dynamic Enrichment

#### Runtime Context:

```json
{
  "runtime": {
    "nodeVersion": "18.15.0",
    "memoryUsage": {
      "rss": 45678592,
      "heapTotal": 12345678,
      "heapUsed": 8765432,
      "external": 1234567
    },
    "uptime": 86400
  }
}
```

#### Feature Flag Context:

```json
{
  "features": {
    "newCheckout": true,
    "experimentalUI": false,
    "betaFeatures": true,
    "experiment123": "variant-b"
  }
}
```

## Performance Optimization

### Context Filtering

#### Level-Based Filtering:

```javascript
const contextFilters = {
  ERROR: ['requestId', 'userId', 'traceId', 'error'],
  WARN: ['requestId', 'userId', 'traceId'],
  INFO: ['requestId', 'traceId'],
  DEBUG: '*', // All context
}
```

#### Conditional Enrichment:

```javascript
const enrichContext = (level, baseContext) => {
  if (level === 'DEBUG') {
    return {
      ...baseContext,
      performance: getPerformanceMetrics(),
      memory: getMemoryUsage(),
      stack: getStackTrace(),
    }
  }
  return baseContext
}
```

### Lazy Loading

#### Expensive Context Calculation:

```javascript
const createContext = () => ({
  requestId: req.id,
  userId: req.user?.id,
  get detailedUser() {
    // Only calculate when accessed
    return this._detailedUser || (this._detailedUser = loadUserDetails(this.userId))
  },
})
```

### Context Caching

#### Request-Scoped Caching:

```javascript
const contextCache = new Map()

const getCachedContext = (key, factory) => {
  if (!contextCache.has(key)) {
    contextCache.set(key, factory())
  }
  return contextCache.get(key)
}
```

## Security Considerations

### Sensitive Context Handling

#### Data Masking:

```json
{
  "user": {
    "id": "user-12345",
    "email": "j***@example.com",
    "role": "customer",
    "ip": "192.168.xxx.xxx"
  }
}
```

#### Context Sanitization:

```javascript
const sanitizeContext = context => {
  const sanitized = { ...context }

  // Remove sensitive fields
  delete sanitized.password
  delete sanitized.apiKey
  delete sanitized.token

  // Mask PII
  if (sanitized.email) {
    sanitized.email = maskEmail(sanitized.email)
  }

  return sanitized
}
```

## Best Practices

### Context Design

#### Consistency Guidelines:

- Use standard field names across services
- Maintain consistent data types
- Implement proper field hierarchy
- Document context schema

#### Naming Conventions:

- Use camelCase for field names
- Prefix context categories (user.id, request.method)
- Avoid abbreviations
- Use descriptive names

### Performance Guidelines

#### Context Size Management:

- Limit context object size
- Use references for large objects
- Implement context pruning
- Monitor serialization overhead

#### Efficient Propagation:

- Minimize header count
- Use compact representations
- Implement header compression
- Cache context calculations

### Operational Guidelines

#### Context Validation:

- Validate context structure
- Handle missing context gracefully
- Implement fallback mechanisms
- Monitor context quality

#### Evolution Management:

- Version context schemas
- Implement backward compatibility
- Plan context migrations
- Document context changes

## Related Documents

- [JSON Logging](json-logging.md) - JSON structure for contextual data
- [Sensitive Data Protection](sensitive-data-protection.md) - Secure context handling
- [Logging Standards](logging-standards.md) - Overall context standards
- [Log Levels](log-levels.md) - Context by log level

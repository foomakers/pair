# Logging Standards

## Purpose

Define comprehensive logging standards and conventions that ensure consistent, efficient, and secure logging practices across all systems and applications.

## Scope

**In Scope:**

- Logging format standards and conventions
- Message structure and content guidelines
- Performance and efficiency requirements
- Security and compliance standards
- Tool integration and compatibility
- Quality assurance and monitoring

**Out of Scope:**

- Specific logging library implementations
- Infrastructure deployment configurations
- Log storage and retention policies
- Visualization and dashboard design

## Introduction

Consistent logging standards are essential for effective system observability, debugging, and compliance. These standards provide a framework for creating meaningful, searchable, and actionable logs while maintaining system performance and security requirements.

## Logging Format Standards

### Structured Logging Requirements

**JSON Format Standard:**

```json
{
  "timestamp": "2024-01-15T10:30:00.123Z",
  "level": "INFO",
  "message": "User authentication successful",
  "service": "auth-service",
  "version": "1.2.3",
  "traceId": "abc123def456",
  "userId": "user-12345",
  "duration": 245,
  "status": "success"
}
```

**Required Fields:**

- `timestamp` - ISO 8601 format with milliseconds
- `level` - Log level (ERROR, WARN, INFO, DEBUG, TRACE)
- `message` - Human-readable description
- `service` - Service name identifier
- `version` - Application version

**Optional Standard Fields:**

- `traceId` - Distributed tracing identifier
- `spanId` - Span identifier for tracing
- `userId` - User identifier (when applicable)
- `sessionId` - Session identifier
- `requestId` - Request correlation identifier
- `environment` - Environment name (prod, staging, dev)

### Message Structure Guidelines

**Message Format:**

- Use clear, concise, human-readable messages
- Include action performed and outcome
- Provide sufficient context for understanding
- Avoid technical jargon in user-facing messages

**Good Examples:**

```json
{
  "message": "User login successful",
  "message": "Database connection established",
  "message": "Payment processing failed due to insufficient funds",
  "message": "Cache miss for user profile data"
}
```

**Poor Examples:**

```json
{
  "message": "Auth OK",
  "message": "DB conn",
  "message": "Error 500",
  "message": "Cache: 0"
}
```

## Naming Conventions

### Field Naming Standards

**General Rules:**

- Use camelCase for field names
- Avoid abbreviations and acronyms
- Use descriptive, meaningful names
- Maintain consistency across services

**Standard Field Names:**

```json
{
  "timestamp": "2024-01-15T10:30:00.123Z",
  "logLevel": "INFO",
  "serviceName": "user-service",
  "serviceVersion": "1.2.3",
  "requestId": "req-abc123",
  "userId": "user-12345",
  "sessionId": "sess-xyz789",
  "traceId": "trace-def456",
  "spanId": "span-ghi789",
  "errorCode": "USER_NOT_FOUND",
  "errorMessage": "User with ID user-12345 not found",
  "executionTime": 245,
  "httpStatusCode": 404,
  "httpMethod": "GET",
  "requestPath": "/api/users/12345"
}
```

### Service Identification

**Service Name Format:**

- Use kebab-case for service names
- Include environment suffix when needed
- Maintain consistency across deployments

**Examples:**

```json
{
  "service": "user-service",
  "service": "payment-processor",
  "service": "notification-gateway",
  "service": "order-management-api"
}
```

## Content Standards

### What to Log

**Essential Events:**

- Application startup and shutdown
- User authentication and authorization events
- Business transaction completions
- Error conditions and exceptions
- Performance milestones
- Security-relevant events

**Performance Events:**

```json
{
  "level": "INFO",
  "message": "Request processed successfully",
  "requestPath": "/api/orders",
  "httpMethod": "POST",
  "responseTime": 234,
  "dbQueryCount": 3,
  "dbQueryTime": 145,
  "cacheHitRate": 0.85
}
```

**Business Events:**

```json
{
  "level": "INFO",
  "message": "Order placed successfully",
  "orderId": "order-abc123",
  "customerId": "customer-xyz789",
  "orderValue": 99.99,
  "currency": "USD",
  "paymentMethod": "credit_card"
}
```

### What Not to Log

**Sensitive Information:**

- Passwords and authentication tokens
- Credit card numbers and financial data
- Social security numbers and PII
- API keys and secrets
- Personal health information

**Excessive Detail:**

- Raw database query results
- Large payload contents
- Detailed stack traces in production (INFO level)
- Temporary variables and intermediate calculations

## Error Logging Standards

### Error Information Requirements

**Standard Error Structure:**

```json
{
  "level": "ERROR",
  "message": "Database connection failed",
  "error": {
    "type": "DatabaseConnectionError",
    "code": "DB_CONN_001",
    "message": "Unable to connect to database server",
    "stack": "Error: Connection timeout\n    at Database.connect...",
    "cause": "Connection timeout after 5000ms"
  },
  "context": {
    "database": "user_db",
    "host": "db.example.com",
    "port": 5432,
    "timeout": 5000
  }
}
```

**Error Classification:**

```json
{
  "error": {
    "category": "infrastructure", // infrastructure, application, business, security
    "severity": "high", // low, medium, high, critical
    "recoverable": false,
    "impact": "service_unavailable",
    "affectedUsers": 1250
  }
}
```

### Exception Handling

**Try-Catch Logging:**

```javascript
try {
  const result = await processPayment(paymentData)
  logger.info('Payment processed successfully', {
    paymentId: result.id,
    amount: paymentData.amount,
    duration: Date.now() - startTime,
  })
} catch (error) {
  logger.error('Payment processing failed', {
    paymentData: sanitizePaymentData(paymentData),
    error: {
      type: error.constructor.name,
      message: error.message,
      code: error.code,
      stack: error.stack,
    },
    duration: Date.now() - startTime,
  })
  throw error
}
```

## Performance Standards

### Logging Efficiency

**Performance Requirements:**

- Logging should not impact application performance by more than 5%
- Use asynchronous logging for high-volume applications
- Implement log level checks before expensive operations
- Optimize serialization and formatting

**Efficient Logging Patterns:**

```javascript
// Check log level before expensive operations
if (logger.isDebugEnabled()) {
  logger.debug('Detailed user data', {
    user: await getUserDetailsFromDatabase(userId),
    permissions: await getUserPermissions(userId),
  })
}

// Use lazy evaluation for expensive context
logger.info('User action performed', {
  userId: user.id,
  action: 'profile_update',
  get userDetails() {
    return expensiveUserLookup(user.id)
  },
})
```

### Volume Management

**Log Volume Guidelines:**

- Production: INFO level and above
- Staging: DEBUG level for testing
- Development: DEBUG or TRACE level
- Monitor and alert on excessive log volume

**Sampling Strategies:**

```javascript
// Sample debug logs in production
const shouldLogDebug = () => {
  return Math.random() < 0.01 // 1% sampling
}

if (shouldLogDebug()) {
  logger.debug('Detailed execution trace', debugContext)
}
```

## Integration Standards

### Tool Compatibility

**ELK Stack Integration:**

- Use consistent field mappings
- Implement proper index templates
- Support Elasticsearch field types
- Enable Kibana visualization

**Prometheus Integration:**

- Extract metrics from log data
- Use consistent label names
- Support metric aggregation
- Enable alert rule creation

**OpenTelemetry Integration:**

- Include trace and span IDs
- Support context propagation
- Enable trace-log correlation
- Use standard semantic conventions

### Configuration Management

**Environment-Specific Configuration:**

```json
{
  "production": {
    "level": "INFO",
    "format": "json",
    "outputs": ["stdout", "elasticsearch"],
    "sampling": {
      "debug": 0.01,
      "trace": 0.001
    }
  },
  "development": {
    "level": "DEBUG",
    "format": "pretty",
    "outputs": ["stdout", "file"],
    "sampling": {
      "debug": 1.0,
      "trace": 1.0
    }
  }
}
```

## Quality Assurance

### Log Quality Metrics

**Quality Indicators:**

- Message clarity and usefulness
- Appropriate log level usage
- Consistent format compliance
- Performance impact measurement
- Error information completeness

**Monitoring Metrics:**

```json
{
  "logQuality": {
    "formatCompliance": 0.98,
    "levelDistribution": {
      "ERROR": 0.02,
      "WARN": 0.05,
      "INFO": 0.78,
      "DEBUG": 0.15
    },
    "averageMessageLength": 85,
    "performanceImpact": 0.03
  }
}
```

### Validation and Testing

**Automated Validation:**

- Schema validation for log entries
- Format compliance checking
- Sensitive data detection
- Performance impact monitoring

**Testing Requirements:**

- Log output testing in unit tests
- Integration testing for log aggregation
- Performance testing with logging enabled
- Security testing for data protection

## Governance and Compliance

### Audit Requirements

**Audit Trail Standards:**

```json
{
  "level": "AUDIT",
  "message": "User permission modified",
  "actor": "admin-user-001",
  "subject": "user-12345",
  "action": "permission_grant",
  "resource": "admin_panel",
  "timestamp": "2024-01-15T10:30:00.123Z",
  "requestId": "req-audit-abc123",
  "compliance": ["SOX", "GDPR"]
}
```

### Retention and Archival

**Retention Policies:**

- Production logs: 90 days hot, 365 days warm, 7 years cold
- Audit logs: 7 years minimum retention
- Debug logs: 30 days maximum retention
- Error logs: 180 days retention

**Archival Standards:**

- Compress archived logs
- Maintain searchability
- Ensure data integrity
- Support compliance requirements

## Implementation Guidelines

### Migration Strategy

**Gradual Adoption:**

1. Implement standards in new services
2. Migrate critical services first
3. Update existing services incrementally
4. Validate compliance continuously

**Backward Compatibility:**

- Support multiple log formats during transition
- Implement format conversion utilities
- Maintain existing integrations
- Plan deprecation timeline

### Training and Documentation

**Team Enablement:**

- Provide logging best practices training
- Create implementation examples
- Maintain coding standards documentation
- Regular compliance reviews

**Documentation Requirements:**

- Service-specific logging guides
- Error code documentation
- Field definition glossaries
- Troubleshooting guides

## Related Documents

- [JSON Logging](json-logging.md) - JSON format implementation details
- [Log Levels](log-levels.md) - Log level definitions and usage
- [Contextual Information](contextual-information.md) - Context enrichment strategies
- [Sensitive Data Protection](sensitive-data-protection.md) - Security and privacy requirements

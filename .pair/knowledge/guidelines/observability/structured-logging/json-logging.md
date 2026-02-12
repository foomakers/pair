# JSON Logging Standards

## Purpose

Define JSON logging format standards and implementation guidelines for structured, machine-readable log data.

## Scope

**In Scope:**

- JSON structure standards
- Field naming conventions
- Data type specifications
- Performance optimization
- Tool compatibility

**Out of Scope:**

- Binary logging formats
- Plain text logging
- Specific tool configurations
- Storage optimization

## JSON Structure Standards

### Required Fields
```json
{
  "timestamp": "2024-01-15T10:30:00.000Z",
  "level": "INFO",
  "message": "User login successful",
  "service": "auth-service",
  "version": "1.2.3"
}
```

### Optional Context Fields
```json
{
  "traceId": "abc123def456",
  "spanId": "789ghi012jkl",
  "userId": "user-12345",
  "sessionId": "session-67890",
  "environment": "production"
}
```

### Error Fields
```json
{
  "error": {
    "type": "ValidationError",
    "message": "Invalid email format",
    "code": "VALIDATION_001",
    "stack": "Error: Invalid email..."
  }
}
```

## Field Naming Conventions

### General Rules

- Use camelCase for field names
- Avoid special characters and spaces
- Use descriptive, concise names
- Maintain consistency across services

### Standard Field Names

- `timestamp` - ISO 8601 format
- `level` - Log level (ERROR, WARN, INFO, DEBUG)
- `message` - Human-readable description
- `service` - Service name identifier
- `traceId` - Distributed tracing ID
- `userId` - User identifier
- `error` - Error information object

## Implementation Guidelines

### Performance Optimization

- Use efficient JSON serialization
- Avoid deep nesting (max 3 levels)
- Minimize field duplication
- Consider async logging

### Compatibility

- Ensure ELK stack compatibility
- Support Fluentd parsing
- Enable Prometheus metrics extraction
- Maintain backwards compatibility

## Related Documents

- [Logging Standards](logging-standards.md) - Overall logging guidelines
- [Contextual Information](contextual-information.md) - Context enrichment
- [Sensitive Data Protection](sensitive-data-protection.md) - Security considerations

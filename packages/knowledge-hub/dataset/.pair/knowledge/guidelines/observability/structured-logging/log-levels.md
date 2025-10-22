# Log Levels

## Purpose

Define log level standards and usage guidelines to ensure consistent log categorization and appropriate information capture across systems.

## Scope

**In Scope:**
- Log level definitions and use cases
- Selection criteria and guidelines
- Performance impact considerations
- Runtime configuration strategies

**Out of Scope:**
- Tool-specific configurations
- Log format specifications
- Storage and retention policies

## Log Level Definitions

### ERROR
**Purpose:** Critical errors that require immediate attention
**Use Cases:**
- Application crashes or failures
- Data corruption or loss
- Security breaches or violations
- External service failures affecting functionality

**Example:**
```json
{
  "level": "ERROR",
  "message": "Database connection failed",
  "error": {
    "type": "ConnectionError",
    "code": "DB_CONN_001"
  }
}
```

### WARN
**Purpose:** Potentially harmful situations that don't stop execution
**Use Cases:**
- Deprecated API usage
- Resource constraints approaching limits
- Configuration issues
- Recoverable errors

**Example:**
```json
{
  "level": "WARN",
  "message": "Memory usage above 80% threshold",
  "metrics": {
    "memoryUsage": 0.85,
    "threshold": 0.80
  }
}
```

### INFO
**Purpose:** Informational messages highlighting application progress
**Use Cases:**
- Application startup/shutdown
- Significant business events
- Configuration changes
- User actions

**Example:**
```json
{
  "level": "INFO",
  "message": "User login successful",
  "userId": "user-12345",
  "timestamp": "2024-01-15T10:30:00.000Z"
}
```

### DEBUG
**Purpose:** Detailed information for debugging purposes
**Use Cases:**
- Function entry/exit
- Variable values
- Detailed execution flow
- Development troubleshooting

**Example:**
```json
{
  "level": "DEBUG",
  "message": "Processing user request",
  "requestId": "req-789",
  "parameters": {
    "userId": "user-123",
    "action": "update_profile"
  }
}
```

### TRACE
**Purpose:** Very detailed information for complex debugging
**Use Cases:**
- Step-by-step execution tracking
- Performance profiling
- Complex system interaction analysis

## Usage Guidelines

### Production Environments
- **Default Level:** INFO
- **Error Handling:** ERROR and WARN always enabled
- **Performance:** Minimize DEBUG and TRACE
- **Business Events:** Use INFO for significant events

### Development Environments
- **Default Level:** DEBUG
- **Troubleshooting:** Enable TRACE when needed
- **Testing:** Use appropriate levels for test validation

### Performance Considerations
- **High Volume:** Avoid DEBUG/TRACE in production
- **Async Logging:** Use for high-frequency logs
- **Conditional Logging:** Check level before expensive operations

## Runtime Configuration

### Dynamic Level Changes
- Support runtime log level modification
- Service-specific level configuration
- Feature flag integration
- Performance impact monitoring

### Environment-Based Defaults
- Production: INFO level default
- Staging: DEBUG level default
- Development: DEBUG or TRACE default
- Testing: Level based on test requirements

## Related Documents

- [JSON Logging](json-logging.md) - JSON format standards
- [Logging Standards](logging-standards.md) - Comprehensive logging guidelines
- [Contextual Information](contextual-information.md) - Context enrichment strategies

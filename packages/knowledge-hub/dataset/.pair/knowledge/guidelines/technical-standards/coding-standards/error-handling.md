# Error Handling Standards

Strategic framework for implementing consistent, robust error handling across applications and services.

## When to Apply Error Handling Standards

| Scenario | Priority | Strategy |
|----------|----------|----------|
| Production applications | Critical | Comprehensive handling |
| External integrations | Critical | Resilience patterns |
| Development tools | Low | Basic error checking |
| Legacy systems | Medium | Gradual improvement |

## Error Handling Principles

### 1. Fail Fast and Explicit
**Early Detection**
- Validate inputs immediately
- Use type systems for compile-time checks
- Implement runtime validation for critical operations
- Prefer explicit errors over silent failures

### 2. Error Classification Framework

| Error Type | Characteristics | Handling Strategy |
|------------|----------------|-------------------|
| **Operational** | Expected failures (network, I/O) | Retry + fallback |
| **Programming** | Bugs, logic errors | Fail fast + fix |
| **Business Logic** | Domain rule violations | Validate + communicate |
| **System** | Infrastructure failures | Circuit breaker + monitor |

### 3. Recovery Strategies

| Pattern | Use Case | Implementation |
|---------|----------|----------------|
| **Retry** | Transient failures | Exponential backoff |
| **Fallback** | Service unavailable | Alternative approach |
| **Circuit Breaker** | Cascading failures | Fail fast protection |
| **Graceful Degradation** | Partial failures | Reduced functionality |

## Implementation Patterns

### Type-Safe Error Handling
```typescript
// Result pattern for explicit error handling
type Result<T, E> = Success<T> | Failure<E>;

interface Success<T> {
  success: true;
  data: T;
}

interface Failure<E> {
  success: false;
  error: E;
}
```

### Async Error Handling
```typescript
// Consistent async error patterns
async function fetchUser(id: string): Promise<Result<User, FetchError>> {
  try {
    const user = await userService.get(id);
    return { success: true, data: user };
  } catch (error) {
    return { success: false, error: mapToFetchError(error) };
  }
}
```

### Validation Framework
```typescript
// Composable validation
const validateUser = (user: unknown): Result<User, ValidationError[]> => {
  const errors = [
    validateRequired(user.email, 'email'),
    validateEmail(user.email),
    validateRequired(user.name, 'name')
  ].filter(Boolean);
  
  return errors.length === 0 
    ? { success: true, data: user as User }
    : { success: false, error: errors };
};
```

## Error Communication Strategy

### User-Facing Messages
| Audience | Message Style | Example |
|----------|---------------|---------|
| **End Users** | Clear, actionable | "Email address is required" |
| **Developers** | Technical, detailed | "ValidationError: user.email is undefined" |
| **Operations** | Contextual, traceable | "UserService.get failed: DB connection timeout" |

### Error State Design
```typescript
// UI error state management
interface ErrorState {
  type: 'validation' | 'network' | 'server' | 'unknown';
  message: string;
  retryable: boolean;
  actions?: ErrorAction[];
}
```

## Monitoring and Observability

### Error Tracking Framework
| Metric | Purpose | Implementation |
|--------|---------|----------------|
| **Error Rate** | System health | % of requests with errors |
| **Error Types** | Issue categorization | Error classification tracking |
| **Recovery Rate** | Resilience effectiveness | % of retries that succeed |

### Logging Strategy
```typescript
// Structured error logging
logger.error('User fetch failed', {
  operation: 'fetchUser',
  userId: id,
  error: error.message,
  stack: error.stack,
  correlationId: req.correlationId,
  duration: performance.now() - startTime
});
```

## Language-Specific Patterns

### TypeScript/JavaScript
```typescript
// Error boundary for React applications
class ErrorBoundary extends React.Component {
  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error };
  }
  
  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    this.logError(error, errorInfo);
  }
}
```

### Python
```python
# Context manager for resource cleanup
class DatabaseConnection:
    def __enter__(self):
        self.connection = self.connect()
        return self.connection
    
    def __exit__(self, exc_type, exc_val, exc_tb):
        if exc_type:
            self.connection.rollback()
        self.connection.close()
```

## Testing Error Scenarios

### Error Testing Strategy
| Test Type | Purpose | Implementation |
|-----------|---------|----------------|
| **Unit Tests** | Individual error paths | Mock failures |
| **Integration Tests** | Service error propagation | Simulate dependencies |
| **Chaos Testing** | System resilience | Inject random failures |

## Success Metrics

### Reliability KPIs
- Error rate (target: <1% for critical paths)
- Mean time to recovery (target: <5 minutes)
- User error experience score (target: >4.0/5.0)

### Developer Experience
- Error handling test coverage (target: >80%)
- Time to debug errors (target: <30 minutes)
- Error documentation completeness (target: 100%)

## Critical Success Factors

**Technical Foundation**:
- Consistent error types
- Comprehensive logging
- Automated monitoring

**Team Practice**:
- Error handling reviews
- Testing discipline
- Documentation culture

**User Experience**:
- Clear error messages
- Recovery guidance
- Accessibility compliance

> **Key Insight**: Effective error handling balances system resilience with user experience through consistent patterns, clear communication, and proactive monitoring.
- Provide stack traces and debugging information
- Implement structured logging for error analysis

**Monitoring and Alerting**
- Design error metrics and dashboards
- Implement alerting for critical error conditions
- Track error rates and patterns over time
- Correlate errors with business and operational metrics

## Language-Specific Patterns

### TypeScript/JavaScript
**Error Handling Approaches**
- Use Error objects with additional properties for context
- Implement Result types for functional error handling
- Handle both synchronous and Promise-based errors
- Use error boundaries in React applications

### Python
**Python Error Patterns**
- Use appropriate built-in exception types
- Create custom exception hierarchies for domain errors
- Implement context managers for resource cleanup
- Use logging module for structured error reporting

### Other Languages
**General Principles**
- Follow language idioms and community practices
- Use language-specific error handling mechanisms appropriately
- Implement consistent patterns across the codebase
- Document language-specific error handling decisions

## Testing Error Handling

### Error Condition Testing
**Test Strategy**
- Test both happy path and error conditions
- Use dependency injection for controllable failures
- Implement chaos engineering for resilience testing
- Test error recovery and fallback mechanisms

**Test Implementation**
- Mock external dependencies to simulate failures
- Test error message clarity and actionability
- Validate error logging and monitoring integration
- Test error handling performance and resource usage

## Monitoring and Continuous Improvement

### Error Metrics and Analysis
**Key Performance Indicators**
- Error rates by service and operation
- Mean time to detection and resolution
- Error recovery success rates
- User impact and satisfaction metrics

**Error Analysis Process**
- Regular review of error patterns and trends
- Root cause analysis for significant failures
- Documentation of error handling improvements
- Knowledge sharing of error handling best practices

### Evolution and Refinement
**Continuous Improvement**
- Regular review and update of error handling patterns
- Adaptation to new technologies and frameworks
- Team training on error handling best practices
- Integration of lessons learned from production incidents

Error handling standards provide the foundation for building resilient, maintainable systems that gracefully handle both expected and unexpected failure conditions.

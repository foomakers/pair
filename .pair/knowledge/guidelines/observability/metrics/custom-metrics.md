# Custom Metrics

## Purpose

Define guidelines for creating domain-specific and business-logic metrics that provide unique insights into application behavior and business performance.

## Scope

**In Scope:**
- Custom metric design principles
- Domain-specific measurement strategies
- Business logic performance tracking
- Implementation patterns and best practices
- Naming conventions and standards
- Performance impact considerations

**Out of Scope:**
- Standard infrastructure metrics
- Generic application metrics
- Third-party service metrics
- System-level measurements

## Design Principles

### Metric Design
- Clear purpose and actionability
- Consistent naming conventions
- Appropriate granularity level
- Business value alignment

### Implementation Considerations
- Minimal performance impact
- Efficient data structures
- Proper error handling
- Scalable collection patterns

## Custom Metric Categories

### Business Logic Metrics
- Domain-specific operations
- Workflow completion rates
- Business rule violations
- Process efficiency measures

### Feature Performance
- Feature-specific response times
- Usage pattern tracking
- Performance optimization metrics
- A/B testing measurements

### Quality Metrics
- Code quality indicators
- Test coverage metrics
- Technical debt measurements
- Deployment quality tracking

## Implementation Patterns

### Collection Strategies
- Event-driven metric generation
- Sampling and aggregation techniques
- Batch vs. real-time collection
- Performance optimization approaches

### Storage and Analysis
- Time series data modeling
- Aggregation level selection
- Retention policy design
- Query optimization strategies

## Related Documents

- [Strategy](strategy.md) - Overall metrics strategy
- [Application Monitoring](application-monitoring.md) - Standard application metrics
- [Performance Metrics](performance-metrics.md) - Performance measurement approaches

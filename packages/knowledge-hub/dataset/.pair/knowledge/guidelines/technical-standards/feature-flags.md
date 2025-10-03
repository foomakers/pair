# Feature Flags

## Overview

Feature flags (also known as feature toggles) are a software development technique that allows you to enable or disable features without deploying new code. They provide a powerful mechanism for controlled feature rollouts, A/B testing, and risk mitigation.

## Implementation Strategy

### 1. Feature Flag Types

#### Release Toggles

- **Purpose**: Control feature releases
- **Lifecycle**: Short-term (days to weeks)
- **Use Case**: Gradual rollouts, canary releases

#### Experiment Toggles

- **Purpose**: A/B testing and experimentation
- **Lifecycle**: Medium-term (weeks to months)
- **Use Case**: Performance testing, user experience optimization

#### Ops Toggles

- **Purpose**: Operational control
- **Lifecycle**: Long-term (permanent)
- **Use Case**: Circuit breakers, performance degradation responses

#### Permission Toggles

- **Purpose**: Access control
- **Lifecycle**: Long-term (months to years)
- **Use Case**: Premium features, user role-based access

### 2. Configuration Management

#### Environment-Based Configuration

```typescript
interface FeatureFlagConfig {
  flags: {
    [flagName: string]: {
      enabled: boolean
      percentage?: number
      conditions?: FeatureFlagCondition[]
    }
  }
}

interface FeatureFlagCondition {
  type: 'user' | 'environment' | 'date' | 'custom'
  operator: 'equals' | 'contains' | 'greater_than' | 'less_than'
  value: string | number | boolean
}
```

#### Dynamic Configuration

- Runtime flag updates without deployment
- Database or external service integration
- Real-time flag status monitoring

### 3. Implementation Patterns

#### Simple Boolean Flags

```typescript
export class FeatureFlagService {
  private flags: Map<string, boolean> = new Map()

  isEnabled(flagName: string): boolean {
    return this.flags.get(flagName) ?? false
  }

  setFlag(flagName: string, enabled: boolean): void {
    this.flags.set(flagName, enabled)
  }
}
```

#### Percentage-Based Rollouts

```typescript
export class GradualRolloutService {
  isEnabledForUser(flagName: string, userId: string): boolean {
    const flag = this.getFlag(flagName)
    if (!flag.enabled) return false

    const hash = this.hashUserId(userId)
    return hash % 100 < (flag.percentage ?? 0)
  }

  private hashUserId(userId: string): number {
    // Simple hash function for demonstration
    return userId.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0)
  }
}
```

#### Conditional Flags

```typescript
export class ConditionalFlagService {
  evaluateFlag(flagName: string, context: EvaluationContext): boolean {
    const flag = this.getFlag(flagName)
    if (!flag.enabled) return false

    return flag.conditions?.every(condition => this.evaluateCondition(condition, context)) ?? true
  }

  private evaluateCondition(condition: FeatureFlagCondition, context: EvaluationContext): boolean {
    const contextValue = context[condition.type]

    switch (condition.operator) {
      case 'equals':
        return contextValue === condition.value
      case 'contains':
        return String(contextValue).includes(String(condition.value))
      case 'greater_than':
        return Number(contextValue) > Number(condition.value)
      case 'less_than':
        return Number(contextValue) < Number(condition.value)
      default:
        return false
    }
  }
}
```

## Best Practices

### 1. Naming Conventions

- Use descriptive, action-oriented names
- Include context: `user_profile_redesign`, `payment_gateway_v2`
- Avoid negatives: prefer `new_checkout_enabled` over `old_checkout_disabled`

### 2. Flag Lifecycle Management

- Set clear expiration dates
- Regular flag cleanup and removal
- Documentation of flag purpose and dependencies

### 3. Testing Strategy

```typescript
describe('Feature Flag Tests', () => {
  test('should handle flag enabled state', () => {
    const service = new FeatureFlagService()
    service.setFlag('test_feature', true)

    expect(service.isEnabled('test_feature')).toBe(true)
  })

  test('should handle flag disabled state', () => {
    const service = new FeatureFlagService()
    service.setFlag('test_feature', false)

    expect(service.isEnabled('test_feature')).toBe(false)
  })

  test('should handle undefined flags', () => {
    const service = new FeatureFlagService()

    expect(service.isEnabled('undefined_feature')).toBe(false)
  })
})
```

### 4. Monitoring and Observability

- Flag usage metrics
- Performance impact monitoring
- Flag evaluation logging
- User experience impact tracking

## Integration Guidelines

### Frontend Integration

```typescript
// React Hook for feature flags
export function useFeatureFlag(flagName: string): boolean {
  const [isEnabled, setIsEnabled] = useState(false)

  useEffect(() => {
    const checkFlag = async () => {
      const enabled = await featureFlagService.isEnabled(flagName)
      setIsEnabled(enabled)
    }

    checkFlag()
  }, [flagName])

  return isEnabled
}

// Component usage
export function NewFeatureComponent() {
  const isNewUIEnabled = useFeatureFlag('new_ui_design')

  return isNewUIEnabled ? <NewUI /> : <LegacyUI />
}
```

### Backend Integration

```typescript
// Express middleware
export function featureFlagMiddleware(flagName: string) {
  return (req: Request, res: Response, next: NextFunction) => {
    const isEnabled = featureFlagService.isEnabledForUser(flagName, req.user?.id)

    if (!isEnabled) {
      return res.status(404).json({ error: 'Feature not available' })
    }

    next()
  }
}

// Route usage
app.get('/api/new-feature', featureFlagMiddleware('new_api_endpoint'), (req, res) => {
  // New feature implementation
})
```

## Security Considerations

### 1. Client-Side Exposure

- Avoid exposing sensitive business logic flags
- Use server-side evaluation for critical features
- Implement proper authentication for flag management

### 2. Performance Impact

- Cache flag evaluations
- Minimize flag evaluation overhead
- Use efficient storage mechanisms

### 3. Rollback Strategy

- Immediate flag disable capability
- Automated rollback triggers
- Emergency access procedures

## Tools and Platforms

### Self-Hosted Solutions

- **Unleash**: Open-source feature flag service
- **Flagr**: Microservice-oriented feature flag solution
- **GrowthBook**: Open-source experimentation platform

### Managed Services

- **LaunchDarkly**: Enterprise feature flag platform
- **Split**: Feature delivery platform
- **Optimizely**: Digital experience optimization

### Simple Solutions

- Environment variables
- Configuration files
- Database flags

## Migration and Cleanup

### Flag Removal Process

1. **Deprecation Warning**: Mark flags for removal
2. **Monitoring Period**: Track usage and impact
3. **Code Cleanup**: Remove flag-related code
4. **Documentation Update**: Update relevant documentation

### Automated Cleanup

```typescript
export class FlagCleanupService {
  async identifyStaleFlags(): Promise<string[]> {
    const allFlags = await this.getAllFlags()
    const staleFlags: string[] = []

    for (const flag of allFlags) {
      if (this.isFlagStale(flag)) {
        staleFlags.push(flag.name)
      }
    }

    return staleFlags
  }

  private isFlagStale(flag: FeatureFlag): boolean {
    const daysSinceLastUsed = this.daysSince(flag.lastUsed)
    const daysSinceCreated = this.daysSince(flag.created)

    return daysSinceLastUsed > 30 || daysSinceCreated > 90
  }
}
```

## Related Documentation

- [Technical Debt Management](./coding-standards/technical-debt.md)
- [Deployment Workflow](./deployment-workflow/README.md)
- [Quality Assurance Standards](../quality-assurance/README.md)
- [Observability Guidelines](../observability/README.md)

# Feature Flags

This document defines our approach to feature flags (feature toggles) for safe, gradual feature rollouts and experimentation in production environments.

## Overview

Feature flags enable controlled feature deployment, A/B testing, and rapid rollback capabilities while minimizing risk and enabling continuous delivery.

## Feature Flag Types

### Flag Classification

```typescript
enum FeatureFlagType {
  RELEASE = 'release', // Gradual feature rollout
  EXPERIMENT = 'experiment', // A/B testing and experimentation
  OPERATIONAL = 'operational', // System behavior toggles
  PERMISSION = 'permission', // Access control flags
  KILL_SWITCH = 'kill_switch', // Emergency feature disable
}

interface FeatureFlag {
  key: string
  type: FeatureFlagType
  description: string
  enabled: boolean
  rollout_percentage: number
  targeting_rules: TargetingRule[]
  created_at: string
  created_by: string
  expires_at?: string
  dependencies?: string[]
}
```

### Targeting and Segmentation

```typescript
interface TargetingRule {
  id: string
  name: string
  conditions: Condition[]
  rollout_percentage: number
  enabled: boolean
}

interface Condition {
  attribute: string
  operator: 'equals' | 'not_equals' | 'in' | 'not_in' | 'contains' | 'gt' | 'lt'
  value: string | number | string[]
}

// Example targeting configuration
const userSegmentationRules: TargetingRule[] = [
  {
    id: 'beta_users',
    name: 'Beta Users',
    conditions: [
      {
        attribute: 'user.role',
        operator: 'in',
        value: ['beta_tester', 'internal'],
      },
    ],
    rollout_percentage: 100,
    enabled: true,
  },
  {
    id: 'premium_users',
    name: 'Premium Subscribers',
    conditions: [
      {
        attribute: 'user.subscription',
        operator: 'equals',
        value: 'premium',
      },
      {
        attribute: 'user.created_at',
        operator: 'lt',
        value: '2024-01-01',
      },
    ],
    rollout_percentage: 50,
    enabled: true,
  },
]
```

## Implementation Patterns

### Frontend Feature Flags

```typescript
// React Hook for Feature Flags
import { useFeatureFlag } from '@/hooks/useFeatureFlag'

interface UseFeatureFlagResult {
  isEnabled: boolean
  loading: boolean
  error?: Error
  variant?: string
}

function useFeatureFlag(flagKey: string, defaultValue: boolean = false): UseFeatureFlagResult {
  const [state, setState] = useState({
    isEnabled: defaultValue,
    loading: true,
    error: undefined,
    variant: undefined,
  })

  useEffect(() => {
    const evaluateFlag = async () => {
      try {
        const result = await featureFlagService.evaluate(flagKey)
        setState({
          isEnabled: result.enabled,
          loading: false,
          error: undefined,
          variant: result.variant,
        })
      } catch (error) {
        setState({
          isEnabled: defaultValue,
          loading: false,
          error: error as Error,
          variant: undefined,
        })
      }
    }

    evaluateFlag()
  }, [flagKey, defaultValue])

  return state
}

// Component usage
function NewFeatureComponent() {
  const { isEnabled, loading } = useFeatureFlag('new_dashboard_ui')

  if (loading) return <LoadingSpinner />

  return isEnabled ? <NewDashboard /> : <LegacyDashboard />
}
```

### Backend Feature Flags

```typescript
// Feature Flag Service
class FeatureFlagService {
  private flagProvider: FeatureFlagProvider
  private cache: Map<string, CachedFlag> = new Map()

  async evaluateFlag(
    flagKey: string,
    context: EvaluationContext,
    defaultValue: boolean = false,
  ): Promise<FlagEvaluation> {
    try {
      // Check cache first
      const cached = this.getCachedFlag(flagKey)
      if (cached && !this.isCacheExpired(cached)) {
        return this.evaluateWithRules(cached.flag, context)
      }

      // Fetch from provider
      const flag = await this.flagProvider.getFlag(flagKey)
      this.setCachedFlag(flagKey, flag)

      return this.evaluateWithRules(flag, context)
    } catch (error) {
      console.error(`Feature flag evaluation error for ${flagKey}:`, error)
      return { enabled: defaultValue, variant: null, reason: 'error' }
    }
  }

  private evaluateWithRules(flag: FeatureFlag, context: EvaluationContext): FlagEvaluation {
    if (!flag.enabled) {
      return { enabled: false, variant: null, reason: 'flag_disabled' }
    }

    // Check targeting rules
    for (const rule of flag.targeting_rules) {
      if (this.evaluateRule(rule, context)) {
        const enabled = Math.random() * 100 < rule.rollout_percentage
        return {
          enabled,
          variant: enabled ? rule.variant : null,
          reason: enabled ? 'rule_match' : 'rollout_percentage',
        }
      }
    }

    // Default rollout
    const enabled = Math.random() * 100 < flag.rollout_percentage
    return {
      enabled,
      variant: null,
      reason: enabled ? 'default_rollout' : 'rollout_percentage',
    }
  }
}

// Express middleware
function featureFlagMiddleware(flagKey: string, defaultValue: boolean = false) {
  return async (req: Request, res: Response, next: NextFunction) => {
    const context = createEvaluationContext(req)
    const evaluation = await featureFlagService.evaluateFlag(flagKey, context, defaultValue)

    req.featureFlags = req.featureFlags || {}
    req.featureFlags[flagKey] = evaluation

    next()
  }
}
```

### Configuration Management

```typescript
interface FeatureFlagConfig {
  provider: 'launchdarkly' | 'split' | 'unleash' | 'custom'
  sdk_key: string
  environment: string
  cache_ttl: number
  refresh_interval: number
  offline_mode: boolean
  default_values: Record<string, boolean>
}

const featureFlagConfig: FeatureFlagConfig = {
  provider: 'launchdarkly',
  sdk_key: process.env.FEATURE_FLAG_SDK_KEY!,
  environment: process.env.NODE_ENV || 'development',
  cache_ttl: 300, // 5 minutes
  refresh_interval: 60, // 1 minute
  offline_mode: false,
  default_values: {
    new_dashboard_ui: false,
    payment_v2: false,
    experimental_search: false,
  },
}
```

## Rollout Strategies

### Gradual Rollout

```typescript
interface RolloutStrategy {
  type: 'percentage' | 'user_segment' | 'geographic' | 'canary'
  schedule: RolloutSchedule[]
  success_criteria: SuccessCriteria
  rollback_triggers: RollbackTrigger[]
}

interface RolloutSchedule {
  phase: number
  percentage: number
  duration: string
  target_segments?: string[]
  success_threshold: number
}

// Example gradual rollout
const newFeatureRollout: RolloutStrategy = {
  type: 'percentage',
  schedule: [
    {
      phase: 1,
      percentage: 5,
      duration: '24h',
      target_segments: ['internal_users'],
      success_threshold: 0.95,
    },
    {
      phase: 2,
      percentage: 25,
      duration: '48h',
      success_threshold: 0.98,
    },
    {
      phase: 3,
      percentage: 100,
      duration: 'indefinite',
      success_threshold: 0.99,
    },
  ],
  success_criteria: {
    error_rate_threshold: 0.01,
    performance_degradation_threshold: 0.1,
    user_satisfaction_threshold: 0.8,
  },
  rollback_triggers: ['error_rate_exceeded', 'performance_degraded', 'user_complaints_spike'],
}
```

### A/B Testing Integration

```typescript
interface ExperimentConfig {
  experiment_id: string
  hypothesis: string
  variants: ExperimentVariant[]
  traffic_allocation: number
  duration: string
  success_metrics: string[]
  statistical_power: number
}

interface ExperimentVariant {
  key: string
  name: string
  description: string
  allocation_percentage: number
  feature_flags: Record<string, boolean>
}

// A/B test configuration
const checkoutExperiment: ExperimentConfig = {
  experiment_id: 'checkout_optimization_v1',
  hypothesis: 'Simplified checkout flow will increase conversion rate by 15%',
  variants: [
    {
      key: 'control',
      name: 'Control (Current)',
      description: 'Current checkout flow',
      allocation_percentage: 50,
      feature_flags: {
        simplified_checkout: false,
        one_click_payment: false,
      },
    },
    {
      key: 'treatment',
      name: 'Simplified Flow',
      description: 'New simplified checkout with one-click payment',
      allocation_percentage: 50,
      feature_flags: {
        simplified_checkout: true,
        one_click_payment: true,
      },
    },
  ],
  traffic_allocation: 20, // 20% of total traffic
  duration: '14d',
  success_metrics: ['conversion_rate', 'cart_abandonment', 'user_satisfaction'],
  statistical_power: 0.8,
}
```

## Monitoring and Analytics

### Flag Usage Tracking

```typescript
interface FlagUsageMetrics {
  flag_key: string
  evaluation_count: number
  enabled_count: number
  disabled_count: number
  variant_distribution: Record<string, number>
  error_count: number
  cache_hit_ratio: number
  avg_evaluation_time: number
}

class FeatureFlagAnalytics {
  private metrics: Map<string, FlagUsageMetrics> = new Map()

  trackEvaluation(flagKey: string, result: FlagEvaluation, duration: number) {
    const metrics = this.getOrCreateMetrics(flagKey)

    metrics.evaluation_count++
    if (result.enabled) {
      metrics.enabled_count++
    } else {
      metrics.disabled_count++
    }

    if (result.variant) {
      metrics.variant_distribution[result.variant] =
        (metrics.variant_distribution[result.variant] || 0) + 1
    }

    metrics.avg_evaluation_time = (metrics.avg_evaluation_time + duration) / 2
  }

  generateReport(): FlagUsageReport {
    return {
      timestamp: new Date().toISOString(),
      flags: Array.from(this.metrics.values()),
      summary: this.calculateSummary(),
    }
  }
}
```

### Performance Impact Monitoring

```typescript
interface PerformanceImpact {
  flag_key: string
  feature_enabled: boolean
  metrics: {
    response_time_p95: number
    error_rate: number
    throughput: number
    memory_usage: number
    cpu_utilization: number
  }
  comparison_baseline: {
    response_time_p95: number
    error_rate: number
    throughput: number
  }
  impact_score: number // -1 to 1, negative is bad impact
}

async function measurePerformanceImpact(flagKey: string): Promise<PerformanceImpact> {
  const enabledMetrics = await collectMetrics({ [flagKey]: true })
  const disabledMetrics = await collectMetrics({ [flagKey]: false })

  return {
    flag_key: flagKey,
    feature_enabled: true,
    metrics: enabledMetrics,
    comparison_baseline: disabledMetrics,
    impact_score: calculateImpactScore(enabledMetrics, disabledMetrics),
  }
}
```

## Flag Lifecycle Management

### Flag Lifecycle States

```typescript
enum FlagLifecycleState {
  DEVELOPMENT = 'development',
  TESTING = 'testing',
  ROLLOUT = 'rollout',
  ACTIVE = 'active',
  DEPRECATED = 'deprecated',
  RETIRED = 'retired',
}

interface FlagLifecycle {
  current_state: FlagLifecycleState
  state_history: Array<{
    state: FlagLifecycleState
    timestamp: string
    changed_by: string
    reason: string
  }>
  retirement_schedule?: string
  cleanup_tasks: string[]
}
```

### Automated Flag Cleanup

```typescript
interface FlagCleanupRule {
  condition: 'age' | 'usage' | 'percentage' | 'dependency'
  threshold: number | string
  action: 'warn' | 'deprecate' | 'retire'
  notification_channels: string[]
}

const cleanupRules: FlagCleanupRule[] = [
  {
    condition: 'age',
    threshold: '90d',
    action: 'warn',
    notification_channels: ['slack'],
  },
  {
    condition: 'percentage',
    threshold: 100,
    action: 'deprecate',
    notification_channels: ['email', 'slack'],
  },
  {
    condition: 'usage',
    threshold: 0,
    action: 'retire',
    notification_channels: ['email'],
  },
]
```

## Security and Compliance

### Flag Security

```typescript
interface FlagSecurityConfig {
  encryption_at_rest: boolean
  encryption_in_transit: boolean
  access_control: AccessControlConfig
  audit_logging: boolean
  data_retention_days: number
}

interface AccessControlConfig {
  read_permissions: string[]
  write_permissions: string[]
  admin_permissions: string[]
  environment_restrictions: Record<string, string[]>
}

const flagSecurity: FlagSecurityConfig = {
  encryption_at_rest: true,
  encryption_in_transit: true,
  access_control: {
    read_permissions: ['developer', 'qa', 'product_manager'],
    write_permissions: ['tech_lead', 'product_manager'],
    admin_permissions: ['tech_lead'],
    environment_restrictions: {
      production: ['tech_lead', 'devops'],
      staging: ['developer', 'qa', 'tech_lead'],
      development: ['developer', 'qa', 'tech_lead'],
    },
  },
  audit_logging: true,
  data_retention_days: 365,
}
```

## Best Practices

### Flag Naming Conventions

```typescript
interface FlagNamingConvention {
  pattern: string
  examples: string[]
  description: string
}

const namingConventions: FlagNamingConvention[] = [
  {
    pattern: '{team}_{feature}_{version}',
    examples: ['payments_checkout_v2', 'search_elasticsearch_v1'],
    description: 'Team-scoped feature flags',
  },
  {
    pattern: 'experiment_{hypothesis}_{date}',
    examples: ['experiment_homepage_redesign_2024q1'],
    description: 'A/B testing experiments',
  },
  {
    pattern: 'killswitch_{service}_{component}',
    examples: ['killswitch_payment_processor', 'killswitch_email_service'],
    description: 'Emergency kill switches',
  },
]
```

## Related Concepts

- **Deployment Workflow**: Production deployment and release management
- **Versioning Strategy**: Release versioning and compatibility
- **Build Release**: Automated build and deployment processes
- **Performance Patterns**: Performance monitoring and optimization
- **Quality Gates**: Automated quality checks and validation

## Tools Integration

- **LaunchDarkly**: Enterprise feature flag platform
- **Split**: Feature flag and experimentation platform
- **Unleash**: Open-source feature toggle service
- **Flipper**: Ruby feature flag gem
- **Custom Implementation**: In-house feature flag service

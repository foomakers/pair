# User Research Practice (Level 2)

User research methods, testing strategies, validation techniques, and data-driven design decision-making for user-centered design.

## Purpose

Define user research standards and methodologies that ensure design decisions are based on user needs, behavior analysis, and data-driven insights.

## Scope

**In Scope:**

- User research and testing methodologies
- Usability testing and validation strategies
- User analytics and behavior analysis
- Accessibility testing and inclusive design
- A/B testing and experimentation

**Out of Scope:**

- Design implementation (see [Interface Design](interface-design.md))
- Component development (see [Design Systems](design-systems.md))
- Content creation (see [Content Strategy](content-strategy.md))
- Technical analytics implementation (see [Platform Operations/Observability](../platform-operations/observability.md))

## Topics Covered

### User Research Methodologies

Research methods and user discovery techniques

- User interviews and qualitative research
- Surveys and quantitative research
- User personas and journey mapping
- Contextual inquiry and field studies

### Usability Testing

Testing methods for interface validation

- Moderated and unmoderated usability testing
- A/B testing and multivariate testing
- Prototype testing and validation
- Accessibility testing and compliance

### User Analytics

Data collection and behavior analysis

- User behavior tracking and analysis
- Conversion funnel analysis
- User engagement metrics
- Performance and usability metrics

### Research Integration

Integrating research into design and development processes

- Research planning and methodology selection
- Data analysis and insight generation
- Research communication and stakeholder alignment
- Iterative design and continuous improvement

## 🛠️ Level 3: Tool-Specific Implementations

### Research Tools

- **[Hotjar](../hotjar/)** - User behavior analytics and heatmaps
- **[Maze](../maze/)** - Rapid usability testing platform

## 🔍 User Research Methodologies

### User Interview Framework

**Interview Planning**:

```typescript
interface UserInterviewPlan {
  objectives: string[]
  targetAudience: {
    demographics: string[]
    behaviors: string[]
    painPoints: string[]
  }
  methodology: 'structured' | 'semi-structured' | 'unstructured'
  duration: number // minutes
  format: 'in-person' | 'remote' | 'phone'
  participants: number
}

// Example interview plan
const interviewPlan: UserInterviewPlan = {
  objectives: [
    'Understand user pain points in current workflow',
    'Validate proposed feature concepts',
    'Identify opportunities for improvement',
  ],
  targetAudience: {
    demographics: ['Ages 25-45', 'Professional knowledge workers'],
    behaviors: ['Daily software users', 'Collaborative work style'],
    painPoints: ['Time management', 'Information overload'],
  },
  methodology: 'semi-structured',
  duration: 45,
  format: 'remote',
  participants: 8,
}
```

**Interview Script Template**:

```markdown
# User Interview Script: [Feature/Product Name]

## Introduction (5 minutes)

- Thank participant for their time
- Explain purpose and format
- Request permission to record
- Emphasize there are no wrong answers

## Background Questions (10 minutes)

1. Tell me about your role and daily responsibilities
2. What tools do you currently use for [relevant task]?
3. What's your typical workflow for [specific process]?

## Current Experience (15 minutes)

4. Walk me through how you currently [perform task]
5. What works well in your current process?
6. What challenges do you face?
7. How do you work around these challenges?

## Concept Validation (10 minutes)

8. [Show prototype/concept]
9. What's your first impression?
10. How would this fit into your workflow?
11. What concerns do you have?

## Wrap-up (5 minutes)

12. Any additional thoughts or questions?
13. Would you be interested in future research sessions?
```

### User Persona Development

**Persona Template**:

```typescript
interface UserPersona {
  name: string
  role: string
  demographics: {
    age: number
    location: string
    education: string
    experience: string
  }
  goals: string[]
  painPoints: string[]
  behaviors: string[]
  tools: string[]
  quote: string
  scenario: string
}

// Example persona
const primaryPersona: UserPersona = {
  name: 'Sarah Chen',
  role: 'Product Manager',
  demographics: {
    age: 32,
    location: 'San Francisco, CA',
    education: 'MBA, Computer Science background',
    experience: '8 years in product management',
  },
  goals: [
    'Efficiently coordinate cross-functional teams',
    'Make data-driven product decisions',
    'Maintain clear project visibility',
  ],
  painPoints: [
    'Information scattered across multiple tools',
    'Difficulty tracking feature progress',
    'Time-consuming status update meetings',
  ],
  behaviors: [
    'Checks project status multiple times daily',
    'Prefers visual data representations',
    'Values quick access to key metrics',
  ],
  tools: ['Slack', 'Jira', 'Figma', 'Google Analytics', 'Notion'],
  quote: 'I need to see the big picture without getting lost in the details',
  scenario:
    "Sarah starts her day by reviewing overnight progress, identifying blockers, and planning her team's priorities for the day.",
}
```

## 🧪 Usability Testing

### Testing Protocol

**A/B Testing Framework**:

```typescript
interface ABTestConfig {
  testName: string
  hypothesis: string
  variants: {
    control: {
      name: string
      description: string
      implementation: string
    }
    treatment: {
      name: string
      description: string
      implementation: string
    }
  }
  metrics: {
    primary: string
    secondary: string[]
  }
  audienceSegmentation: {
    targeting: string[]
    splitRatio: number // 0-1
  }
  duration: {
    minDuration: number // days
    maxDuration: number // days
    significanceLevel: number // 0-1
  }
}

// Example A/B test configuration
const checkoutFlowTest: ABTestConfig = {
  testName: 'Checkout Flow Optimization',
  hypothesis: 'Reducing checkout steps from 4 to 2 will increase conversion rate',
  variants: {
    control: {
      name: 'Current 4-step checkout',
      description: 'Existing checkout flow with 4 separate steps',
      implementation: '/checkout/current',
    },
    treatment: {
      name: 'Streamlined 2-step checkout',
      description: 'Condensed checkout flow with 2 steps',
      implementation: '/checkout/streamlined',
    },
  },
  metrics: {
    primary: 'checkout_completion_rate',
    secondary: ['time_to_complete', 'cart_abandonment_rate', 'user_satisfaction'],
  },
  audienceSegmentation: {
    targeting: ['returning_customers', 'cart_value > $50'],
    splitRatio: 0.5,
  },
  duration: {
    minDuration: 14,
    maxDuration: 30,
    significanceLevel: 0.95,
  },
}
```

### Usability Testing Sessions

**Testing Session Structure**:

```typescript
interface UsabilityTestSession {
  participant: {
    id: string
    persona: string
    demographics: Record<string, string>
  }
  tasks: UsabilityTask[]
  metrics: {
    taskCompletionRate: number
    timeOnTask: number
    errorRate: number
    satisfactionScore: number
  }
  observations: string[]
  quotes: string[]
  recommendations: string[]
}

interface UsabilityTask {
  id: string
  description: string
  successCriteria: string[]
  startingPoint: string
  completed: boolean
  timeToComplete: number
  errors: number
  assistanceRequired: boolean
  userFeedback: string
}

// Example testing task
const testTasks: UsabilityTask[] = [
  {
    id: 'task_1',
    description: 'Find and purchase a specific product',
    successCriteria: [
      'User locates the product within 2 minutes',
      'User completes purchase without assistance',
      'User expresses confidence in the process',
    ],
    startingPoint: '/homepage',
    completed: true,
    timeToComplete: 180, // seconds
    errors: 1,
    assistanceRequired: false,
    userFeedback: "The search worked well, but I wasn't sure about the shipping options",
  },
]
```

## 📊 User Analytics

### Analytics Implementation

**Event Tracking Strategy**:

```typescript
// User behavior tracking
interface AnalyticsEvent {
  eventName: string
  properties: Record<string, any>
  userId?: string
  sessionId: string
  timestamp: string
}

class UserAnalytics {
  // Track user interactions
  trackEvent(eventName: string, properties: Record<string, any> = {}): void {
    const event: AnalyticsEvent = {
      eventName,
      properties: {
        ...properties,
        page_url: window.location.href,
        page_title: document.title,
        user_agent: navigator.userAgent,
      },
      userId: this.getCurrentUserId(),
      sessionId: this.getSessionId(),
      timestamp: new Date().toISOString(),
    }

    // Send to analytics platform
    this.sendToAnalytics(event)
  }

  // Track page views
  trackPageView(page: string, properties: Record<string, any> = {}): void {
    this.trackEvent('page_view', {
      page,
      ...properties,
    })
  }

  // Track user actions
  trackUserAction(action: string, context: Record<string, any> = {}): void {
    this.trackEvent('user_action', {
      action,
      ...context,
    })
  }

  // Track business events
  trackBusinessEvent(event: string, value?: number, properties: Record<string, any> = {}): void {
    this.trackEvent('business_event', {
      event,
      value,
      ...properties,
    })
  }
}

// Usage examples
const analytics = new UserAnalytics()

// Track feature usage
analytics.trackUserAction('feature_used', {
  feature: 'search',
  query: 'user input',
  results_count: 15,
})

// Track conversion events
analytics.trackBusinessEvent('purchase_completed', 99.99, {
  product_id: 'prod_123',
  category: 'electronics',
  payment_method: 'credit_card',
})
```

### Conversion Funnel Analysis

**Funnel Tracking Configuration**:

```typescript
interface ConversionFunnel {
  name: string
  steps: FunnelStep[]
  timeWindow: number // hours
  segments: string[]
}

interface FunnelStep {
  name: string
  eventName: string
  requiredProperties?: Record<string, any>
  conversionGoal?: boolean
}

// Example: E-commerce conversion funnel
const ecommerceFunnel: ConversionFunnel = {
  name: 'E-commerce Purchase Funnel',
  steps: [
    {
      name: 'Product View',
      eventName: 'product_viewed',
    },
    {
      name: 'Add to Cart',
      eventName: 'add_to_cart',
    },
    {
      name: 'Checkout Started',
      eventName: 'checkout_started',
    },
    {
      name: 'Payment Info Added',
      eventName: 'payment_info_added',
    },
    {
      name: 'Purchase Completed',
      eventName: 'purchase_completed',
      conversionGoal: true,
    },
  ],
  timeWindow: 24,
  segments: ['new_users', 'returning_users', 'mobile_users', 'desktop_users'],
}
```

## 🔗 Related Practices

- **[Design Systems](design-systems.md)** - Component testing and validation
- **[Interface Design](interface-design.md)** - Interface usability and effectiveness
- **[Content Strategy](content-strategy.md)** - Content testing and optimization
- **[Platform Operations/Observability](../platform-operations/observability.md)** - Analytics implementation and monitoring

---

_Focus on data-driven design decisions, user validation, and continuous improvement through research._

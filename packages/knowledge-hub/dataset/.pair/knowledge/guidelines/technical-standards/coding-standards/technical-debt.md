# Technical Debt Management

Comprehensive framework for identifying, measuring, prioritizing, and systematically reducing technical debt to maintain long-term codebase health and development velocity.

## Purpose

Establish systematic approaches for technical debt management that balance feature development with code quality, ensuring sustainable development practices and maintainable systems.

## Technical Debt Framework

### Definition and Classification

#### Technical Debt Types

#### 1. Code Debt

```typescript
// Example: Duplicated business logic
// DEBT: Repeated validation logic across components
function validateUserEmail(email: string): boolean {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
  return emailRegex.test(email) && email.length <= 254
}

function validateContactEmail(email: string): boolean {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
  return emailRegex.test(email) && email.length <= 254
}

// SOLUTION: Extract to shared utility
import { isValidEmail } from '@/utils/validation'

function validateUserEmail(email: string): boolean {
  return isValidEmail(email)
}

function validateContactEmail(email: string): boolean {
  return isValidEmail(email)
}
```

#### 2. Design Debt

```typescript
// Example: Tight coupling between components
// DEBT: Component directly accessing global state
function UserProfile({ userId }: { userId: string }) {
  const user = globalUserStore.getUser(userId) // Tight coupling
  const subscription = globalSubscriptionStore.getByUser(userId)

  return (
    <div>
      <h1>{user.name}</h1>
      <p>Plan: {subscription.plan}</p>
    </div>
  )
}

// SOLUTION: Dependency injection and proper data flow
interface UserProfileProps {
  user: User
  subscription: Subscription
  onUpdateUser?: (user: User) => void
}

function UserProfile({ user, subscription, onUpdateUser }: UserProfileProps) {
  return (
    <div>
      <h1>{user.name}</h1>
      <p>Plan: {subscription.plan}</p>
    </div>
  )
}
```

#### 3. Test Debt

```typescript
// Example: Insufficient test coverage
// DEBT: Missing edge case tests
describe('calculateDiscount', () => {
  it('should calculate 10% discount', () => {
    expect(calculateDiscount(100, 0.1)).toBe(90)
  })

  // Missing tests for:
  // - Zero amount
  // - Negative amounts
  // - Invalid discount rates
  // - Boundary conditions
})

// SOLUTION: Comprehensive test coverage
describe('calculateDiscount', () => {
  it('should calculate percentage discount correctly', () => {
    expect(calculateDiscount(100, 0.1)).toBe(90)
    expect(calculateDiscount(50, 0.2)).toBe(40)
  })

  it('should handle zero amount', () => {
    expect(calculateDiscount(0, 0.1)).toBe(0)
  })

  it('should handle invalid inputs', () => {
    expect(() => calculateDiscount(-100, 0.1)).toThrow('Amount must be positive')
    expect(() => calculateDiscount(100, -0.1)).toThrow('Discount rate must be between 0 and 1')
    expect(() => calculateDiscount(100, 1.5)).toThrow('Discount rate must be between 0 and 1')
  })

  it('should handle boundary conditions', () => {
    expect(calculateDiscount(100, 0)).toBe(100)
    expect(calculateDiscount(100, 1)).toBe(0)
  })
})
```

#### 4. Documentation Debt

```typescript
// DEBT: Undocumented complex business logic
function calculateSubscriptionPrice(user, plan, addons, discounts) {
  let price = plan.basePrice

  if (user.isStudent) {
    price *= 0.8
  }

  addons.forEach(addon => {
    if (addon.type === 'storage') {
      price += addon.price * addon.quantity
    } else {
      price += addon.price
    }
  })

  let discountAmount = 0
  discounts.forEach(discount => {
    if (discount.type === 'percentage') {
      discountAmount += price * discount.value
    } else {
      discountAmount += discount.value
    }
  })

  return Math.max(0, price - discountAmount)
}

// SOLUTION: Well-documented business logic
/**
 * Calculates the final subscription price including all modifiers
 *
 * Business Rules:
 * 1. Students receive 20% discount on base price
 * 2. Storage addons are multiplied by quantity, others are flat fees
 * 3. Percentage discounts apply to current price, fixed discounts are subtracted
 * 4. Final price cannot be negative
 *
 * @param user - User information including student status
 * @param plan - Base subscription plan with pricing
 * @param addons - Additional features with pricing
 * @param discounts - Applied discounts (percentage or fixed amount)
 * @returns Final calculated price (minimum 0)
 */
function calculateSubscriptionPrice(
  user: User,
  plan: SubscriptionPlan,
  addons: Addon[],
  discounts: Discount[],
): number {
  // Start with base plan price
  let price = plan.basePrice

  // Apply student discount to base price
  if (user.isStudent) {
    price = price * STUDENT_DISCOUNT_RATE // 0.8 = 20% discount
  }

  // Add addon costs
  const addonCost = addons.reduce((total, addon) => {
    return total + calculateAddonPrice(addon)
  }, 0)
  price += addonCost

  // Apply discounts
  const discountAmount = discounts.reduce((total, discount) => {
    return total + calculateDiscountAmount(discount, price)
  }, 0)

  // Ensure price is not negative
  return Math.max(0, price - discountAmount)
}
```

### Debt Measurement and Tracking

#### Technical Debt Metrics

```typescript
interface TechnicalDebtMetrics {
  codeComplexity: {
    cyclomaticComplexity: number
    cognitiveComplexity: number
    maintainabilityIndex: number
  }
  codeQuality: {
    duplicatedLines: number
    codeSmells: number
    technicalDebtRatio: number
  }
  testCoverage: {
    linesCovered: number
    totalLines: number
    branchCoverage: number
    functionCoverage: number
  }
  dependencies: {
    outdatedPackages: number
    securityVulnerabilities: number
    licenseIssues: number
  }
}

// Automated debt tracking
class TechnicalDebtTracker {
  async collectMetrics(): Promise<TechnicalDebtMetrics> {
    return {
      codeComplexity: await this.analyzeComplexity(),
      codeQuality: await this.analyzeQuality(),
      testCoverage: await this.analyzeCoverage(),
      dependencies: await this.analyzeDependencies(),
    }
  }

  private async analyzeComplexity() {
    // Integration with tools like ESLint complexity rules
    // SonarQube, CodeClimate, etc.
    return {
      cyclomaticComplexity: 8.5,
      cognitiveComplexity: 12.3,
      maintainabilityIndex: 65,
    }
  }
}
```

#### Debt Prioritization Matrix

```typescript
enum DebtSeverity {
  CRITICAL = 'critical', // Blocks development, security risk
  HIGH = 'high', // Significantly impacts velocity
  MEDIUM = 'medium', // Moderate impact on maintainability
  LOW = 'low', // Minor improvement opportunity
}

enum DebtEffort {
  SMALL = 'small', // < 1 day
  MEDIUM = 'medium', // 1-3 days
  LARGE = 'large', // 1-2 weeks
  XLARGE = 'xlarge', // > 2 weeks
}

interface TechnicalDebtItem {
  id: string
  title: string
  description: string
  type: 'code' | 'design' | 'test' | 'documentation' | 'infrastructure'
  severity: DebtSeverity
  effort: DebtEffort
  affectedAreas: string[]
  businessImpact: string
  proposedSolution: string
  createdAt: Date
  estimatedCost: number // Hours
  potentialSavings: number // Hours saved per month
}

class DebtPrioritizer {
  prioritizeDebt(items: TechnicalDebtItem[]): TechnicalDebtItem[] {
    return items.sort((a, b) => {
      const scoreA = this.calculatePriorityScore(a)
      const scoreB = this.calculatePriorityScore(b)
      return scoreB - scoreA // Higher score = higher priority
    })
  }

  private calculatePriorityScore(item: TechnicalDebtItem): number {
    const severityWeight = {
      [DebtSeverity.CRITICAL]: 10,
      [DebtSeverity.HIGH]: 7,
      [DebtSeverity.MEDIUM]: 4,
      [DebtSeverity.LOW]: 1,
    }

    const effortWeight = {
      [DebtEffort.SMALL]: 10,
      [DebtEffort.MEDIUM]: 7,
      [DebtEffort.LARGE]: 4,
      [DebtEffort.XLARGE]: 1,
    }

    const severityScore = severityWeight[item.severity]
    const effortScore = effortWeight[item.effort]
    const roiScore = item.potentialSavings / item.estimatedCost

    return severityScore * 0.4 + effortScore * 0.3 + roiScore * 0.3
  }
}
```

## Debt Reduction Strategies

### Systematic Refactoring Approach

```typescript
// 1. Extract and modularize
// BEFORE: Large, monolithic function
function processUserOrder(orderData: any) {
  // 200+ lines of mixed concerns
  // - Validation
  // - Pricing calculation
  // - Inventory checking
  // - Payment processing
  // - Email notifications
}

// AFTER: Modular, single-responsibility functions
async function processUserOrder(orderData: OrderData): Promise<ProcessedOrder> {
  const validatedOrder = await validateOrder(orderData)
  const pricedOrder = await calculatePricing(validatedOrder)
  await checkInventory(pricedOrder)
  const paymentResult = await processPayment(pricedOrder)
  await updateInventory(pricedOrder)
  await sendOrderConfirmation(pricedOrder, paymentResult)

  return {
    order: pricedOrder,
    payment: paymentResult,
    status: 'completed',
  }
}
```

### Incremental Improvement Pattern

```typescript
// Strategy: Gradually improve code while adding features
class UserService {
  // Legacy method with debt
  async getUserData(id: string): Promise<any> {
    // TODO: DEBT - Remove any type, add proper error handling
    const user = await this.db.query('SELECT * FROM users WHERE id = ?', [id])
    return user[0]
  }

  // New method with improvements
  async getUserById(id: string): Promise<Result<User, Error>> {
    try {
      const result = await this.userRepository.findById(id)
      if (!result) {
        return {
          success: false,
          error: new Error(`User not found: ${id}`),
        }
      }
      return { success: true, data: result }
    } catch (error) {
      return {
        success: false,
        error: new Error(`Failed to fetch user: ${error.message}`),
      }
    }
  }

  // Migration strategy: Gradually replace legacy calls
  async getUser(id: string): Promise<User | null> {
    const result = await this.getUserById(id)
    if (!result.success) {
      console.warn('Legacy getUserData usage, migrate to getUserById')
      return null
    }
    return result.data
  }
}
```

### Strangler Fig Pattern

```typescript
// Gradually replace legacy systems
class PaymentServiceAdapter {
  constructor(
    private legacyPaymentService: LegacyPaymentService,
    private newPaymentService: NewPaymentService,
    private migrationConfig: MigrationConfig,
  ) {}

  async processPayment(request: PaymentRequest): Promise<PaymentResult> {
    // Route to new service for eligible requests
    if (this.shouldUseNewService(request)) {
      try {
        return await this.newPaymentService.processPayment(request)
      } catch (error) {
        // Fallback to legacy service on error
        console.warn('New service failed, falling back to legacy', error)
        return await this.legacyPaymentService.processPayment(request)
      }
    }

    // Use legacy service for non-migrated scenarios
    return await this.legacyPaymentService.processPayment(request)
  }

  private shouldUseNewService(request: PaymentRequest): boolean {
    // Gradual migration based on configuration
    return (
      this.migrationConfig.enabledForUser(request.userId) &&
      this.migrationConfig.enabledForPaymentType(request.type)
    )
  }
}
```

## Debt Prevention Strategies

### Definition of Done Checklist

```typescript
interface DefinitionOfDone {
  codeQuality: {
    lintingPassed: boolean
    testCoverageAboveThreshold: boolean
    codeReviewCompleted: boolean
    noCodeSmells: boolean
  }
  documentation: {
    apiDocumented: boolean
    complexLogicExplained: boolean
    readmeUpdated: boolean
  }
  testing: {
    unitTestsWritten: boolean
    integrationTestsPassed: boolean
    edgeCasesCovered: boolean
  }
  performance: {
    performanceTestsPassed: boolean
    noPerformanceRegressions: boolean
  }
}

// Automated checks in CI/CD
class QualityGate {
  async validateDefinitionOfDone(pullRequest: PullRequest): Promise<boolean> {
    const checks = await Promise.all([
      this.checkCodeQuality(pullRequest),
      this.checkDocumentation(pullRequest),
      this.checkTesting(pullRequest),
      this.checkPerformance(pullRequest),
    ])

    return checks.every(check => check.passed)
  }
}
```

### Architectural Decision Records (ADRs)

```markdown
# ADR-001: Migration from REST to GraphQL

## Status

Proposed

## Context

Our REST API has grown complex with multiple endpoints and over-fetching issues.
Mobile clients are requesting custom data shapes that don't align with our REST endpoints.

## Decision

We will gradually migrate from REST to GraphQL for client-facing APIs.

## Consequences

**Positive:**

- Better client performance with precise data fetching
- Single endpoint for all client needs
- Strong typing and introspection

**Negative:**

- Learning curve for the team
- Additional complexity in caching
- Migration effort for existing clients

## Implementation Plan

1. Implement GraphQL alongside existing REST (3 months)
2. Migrate mobile clients to GraphQL (6 months)
3. Deprecate unused REST endpoints (12 months)
```

This framework ensures proactive technical debt management that maintains code quality while supporting business objectives.

# Coding Conventions

## Purpose

Establish consistent coding conventions across languages and frameworks to improve code readability, maintainability, and team collaboration.

## Language-Specific Conventions

### JavaScript/TypeScript

#### Naming Conventions

```typescript
// Variables and functions: camelCase
const userAccount = 'premium'
function calculateTotalPrice() {}

// Constants: SCREAMING_SNAKE_CASE
const MAX_RETRY_ATTEMPTS = 3
const API_BASE_URL = 'https://api.example.com'

// Classes: PascalCase
class UserManager {}
class PaymentProcessor {}

// Interfaces (TypeScript): PascalCase with 'I' prefix optional
interface UserProfile {}
interface IUserProfile {} // Alternative style

// Types (TypeScript): PascalCase
type PaymentMethod = 'card' | 'bank' | 'crypto'

// Enums (TypeScript): PascalCase
enum OrderStatus {
  PENDING = 'pending',
  CONFIRMED = 'confirmed',
  SHIPPED = 'shipped',
}
```

#### File and Directory Conventions

```
// File names: kebab-case
user-profile.component.ts
payment-service.ts
order-status.enum.ts

// Component files: PascalCase (React/Vue)
UserProfile.tsx
PaymentForm.vue

// Directory structure
src/
  components/
    user-profile/
      UserProfile.tsx
      UserProfile.test.tsx
      UserProfile.styles.ts
  services/
    payment/
      payment.service.ts
      payment.types.ts
  utils/
    date-utils.ts
    validation-utils.ts
```

#### Code Organization

```typescript
// Import order: external libraries, internal modules, relative imports
import React from 'react'
import { Router } from 'express'
import lodash from 'lodash'

import { UserService } from '@/services/user.service'
import { logger } from '@/utils/logger'

import './component.styles.css'
import { validateInput } from '../utils/validation'

// Export patterns
export { UserService } from './user.service'
export type { UserProfile, UserPreferences } from './user.types'
export default UserManager
```

### Python

#### Naming Conventions

```python
# Variables and functions: snake_case
user_account = 'premium'
def calculate_total_price():
    pass

# Constants: SCREAMING_SNAKE_CASE
MAX_RETRY_ATTEMPTS = 3
API_BASE_URL = 'https://api.example.com'

# Classes: PascalCase
class UserManager:
    pass

class PaymentProcessor:
    pass

# Private methods and variables: leading underscore
class UserService:
    def __init__(self):
        self._private_var = None

    def _private_method(self):
        pass

    def public_method(self):
        pass
```

#### File and Module Conventions

```python
# File names: snake_case
user_profile.py
payment_service.py
order_status.py

# Package structure
src/
    models/
        user.py
        payment.py
        __init__.py
    services/
        user_service.py
        payment_service.py
        __init__.py
    utils/
        date_utils.py
        validation_utils.py
        __init__.py
```

### Java

#### Naming Conventions

```java
// Variables and methods: camelCase
String userAccount = "premium";
public void calculateTotalPrice() {}

// Constants: SCREAMING_SNAKE_CASE
public static final int MAX_RETRY_ATTEMPTS = 3;
public static final String API_BASE_URL = "https://api.example.com";

// Classes and interfaces: PascalCase
public class UserManager {}
public interface PaymentProcessor {}

// Packages: lowercase, dot-separated
package com.company.product.userservice;
```

#### File and Package Conventions

```java
// File names match class names: PascalCase
UserProfile.java
PaymentService.java

// Package structure
src/main/java/com/company/product/
    models/
        User.java
        Payment.java
    services/
        UserService.java
        PaymentService.java
    utils/
        DateUtils.java
        ValidationUtils.java
```

## Code Organization Principles

### Function and Method Design

```typescript
// Good: Single responsibility, clear naming
function calculateOrderTotalWithTax(orderItems: OrderItem[], taxRate: number): number {
  const subtotal = orderItems.reduce((sum, item) => sum + item.price, 0)
  return subtotal * (1 + taxRate)
}

// Good: Early returns, guard clauses
function processPayment(payment: Payment): PaymentResult {
  if (!payment.amount || payment.amount <= 0) {
    return { success: false, error: 'Invalid amount' }
  }

  if (!payment.method) {
    return { success: false, error: 'Payment method required' }
  }

  // Process payment logic here
  return { success: true }
}

// Good: Consistent error handling
async function fetchUserProfile(userId: string): Promise<UserProfile> {
  try {
    const response = await api.get(`/users/${userId}`)
    return response.data
  } catch (error) {
    logger.error('Failed to fetch user profile', { userId, error })
    throw new Error('Unable to retrieve user profile')
  }
}
```

### Class Design

```typescript
// Good: Clear responsibilities, consistent interface
class UserService {
  private readonly repository: UserRepository
  private readonly logger: Logger

  constructor(repository: UserRepository, logger: Logger) {
    this.repository = repository
    this.logger = logger
  }

  async createUser(userData: CreateUserRequest): Promise<User> {
    this.validateUserData(userData)

    const user = await this.repository.create(userData)
    this.logger.info('User created successfully', { userId: user.id })

    return user
  }

  private validateUserData(userData: CreateUserRequest): void {
    if (!userData.email || !isValidEmail(userData.email)) {
      throw new ValidationError('Valid email is required')
    }
  }
}
```

## Comment and Documentation Standards

### Inline Comments

```typescript
// Good: Explain why, not what
function calculateDiscount(order: Order): number {
  // Apply bulk discount for orders over $100 to encourage larger purchases
  if (order.total > 100) {
    return order.total * 0.1
  }

  return 0
}

// Good: Complex logic explanation
function optimizeDeliveryRoute(stops: DeliveryStop[]): DeliveryStop[] {
  // Using nearest neighbor algorithm for initial route optimization
  // This provides O(n²) performance which is acceptable for up to 1000 stops
  const optimizedRoute = nearestNeighborTSP(stops)

  // Apply 2-opt improvements to reduce total distance
  return twoOptImprovement(optimizedRoute)
}
```

### Function Documentation

````typescript
/**
 * Calculates the estimated delivery date for an order based on location and priority.
 *
 * @param order - The order containing items and delivery address
 * @param priority - Delivery priority level (standard, express, overnight)
 * @returns Promise resolving to estimated delivery date
 *
 * @throws {ValidationError} When order data is invalid
 * @throws {ServiceError} When delivery service is unavailable
 *
 * @example
 * ```typescript
 * const deliveryDate = await calculateDeliveryDate(order, 'express');
 * console.log(`Estimated delivery: ${deliveryDate.toDateString()}`);
 * ```
 */
async function calculateDeliveryDate(order: Order, priority: DeliveryPriority): Promise<Date> {
  // Implementation here
}
````

### Class Documentation

````typescript
/**
 * Manages user authentication and session handling.
 *
 * Provides methods for user login, logout, session validation,
 * and token refresh operations. Integrates with external OAuth
 * providers and manages local session storage.
 *
 * @example
 * ```typescript
 * const authService = new AuthenticationService(config);
 * const session = await authService.login(credentials);
 * ```
 */
class AuthenticationService {
  // Implementation here
}
````

## Code Formatting Standards

### Indentation and Spacing

```typescript
// Use 2 spaces for indentation (configurable per project)
if (condition) {
  doSomething()
  if (nestedCondition) {
    doNestedThing()
  }
}

// Consistent spacing around operators
const result = value1 + value2 * value3
const isValid = user.age >= 18 && user.verified === true

// Line length: 80-100 characters (configurable)
const longVariableName = someFunction(parameter1, parameter2, parameter3)
```

### Object and Array Formatting

```typescript
// Short arrays: single line
const colors = ['red', 'blue', 'green']

// Long arrays: multiple lines
const configOptions = ['enableLogging', 'enableCaching', 'enableCompression', 'enableAnalytics']

// Short objects: single line
const point = { x: 10, y: 20 }

// Long objects: multiple lines with trailing comma
const userConfig = {
  name: 'John Doe',
  email: 'john@example.com',
  preferences: {
    theme: 'dark',
    language: 'en',
    notifications: true,
  },
}
```

## Enforcement Tools and Configuration

### ESLint Configuration

```json
{
  "extends": ["@eslint/recommended", "@typescript-eslint/recommended"],
  "rules": {
    "@typescript-eslint/naming-convention": [
      "error",
      {
        "selector": "variableLike",
        "format": ["camelCase"]
      },
      {
        "selector": "typeLike",
        "format": ["PascalCase"]
      }
    ],
    "prefer-const": "error",
    "no-var": "error",
    "max-len": ["error", { "code": 100 }]
  }
}
```

### Prettier Configuration

```json
{
  "semi": true,
  "trailingComma": "es5",
  "singleQuote": true,
  "printWidth": 100,
  "tabWidth": 2,
  "useTabs": false
}
```

### Pre-commit Hooks

```json
{
  "husky": {
    "hooks": {
      "pre-commit": "lint-staged"
    }
  },
  "lint-staged": {
    "*.{ts,tsx,js,jsx}": ["eslint --fix", "prettier --write", "git add"]
  }
}
```

## Team Adoption Guidelines

### Implementation Strategy

1. **Start with Core Rules**: Implement basic naming and formatting first
2. **Tool Integration**: Set up automated enforcement in CI/CD
3. **Team Training**: Provide examples and rationale for conventions
4. **Gradual Adoption**: Introduce complex rules incrementally
5. **Regular Review**: Update conventions based on team feedback

### Exception Handling

- Document exceptions with clear rationale
- Time-bound exceptions with review dates
- Team approval process for permanent exceptions
- Regular audit of existing exceptions

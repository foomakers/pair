# Naming Conventions

## Overview

Consistent naming patterns improve code readability, maintainability, and team collaboration. These conventions apply to TypeScript/JavaScript projects including React and Node.js applications.

## General Principles

1. **Descriptive**: Names should clearly indicate purpose and context
2. **Consistent**: Use the same pattern across similar elements
3. **Searchable**: Avoid single letters and abbreviations
4. **Pronounceable**: Names should be easy to say and discuss

## File and Directory Naming

### Files

- **Components**: PascalCase `UserProfile.tsx`, `LoginForm.tsx`
- **Hooks**: camelCase with prefix `useAuth.ts`, `useLocalStorage.ts`
- **Utilities**: camelCase `formatDate.ts`, `validateEmail.ts`
- **Services**: PascalCase `ApiService.ts`, `AuthService.ts`
- **Types**: camelCase with suffix `user.types.ts`, `api.types.ts`
- **Constants**: camelCase `apiEndpoints.ts`, `appConfig.ts`
- **Tests**: Match implementation `UserProfile.test.tsx`

### Directories

- **Features**: kebab-case `user-management/`, `order-processing/`
- **Components**: PascalCase `UserProfile/`, `LoginForm/`
- **General folders**: kebab-case `shared-components/`, `test-utils/`

```
src/
├── components/
│   ├── UserProfile/           # PascalCase for component folders
│   └── shared-ui/             # kebab-case for utility folders
├── features/
│   ├── user-management/       # kebab-case for feature folders
│   └── order-processing/
└── shared/
    ├── lib/
    └── test-utils/           # kebab-case for utility folders
```

## Variable and Function Naming

### Variables

```typescript
// ✅ Good: Descriptive camelCase
const userAccountBalance = 1500
const isUserAuthenticated = true
const maxRetryAttempts = 3

// ❌ Bad: Unclear or abbreviated
const bal = 1500
const flag = true
const max = 3
```

### Functions

```typescript
// ✅ Good: Verb-based, descriptive
function calculateOrderTotal(items: OrderItem[]): number {}
function validateUserEmail(email: string): boolean {}
function fetchUserProfile(userId: string): Promise<User> {}

// ❌ Bad: Unclear purpose
function calc(items: any[]): number {}
function check(email: string): boolean {}
function get(id: string): Promise<any> {}
```

### Boolean Variables

Use positive, question-like names:

```typescript
// ✅ Good
const isLoading = true
const hasPermission = false
const canEdit = true
const shouldShowModal = false

// ❌ Bad
const loading = true // Not clearly boolean
const noPermission = true // Negative naming
const disabled = false // Ambiguous
```

## Component Naming

### React Components

```typescript
// ✅ Good: PascalCase, descriptive
const UserProfileCard = () => {}
const OrderSummaryModal = () => {}
const NavigationMenuButton = () => {}

// ❌ Bad: Unclear or too generic
const Card = () => {}
const Modal = () => {}
const Button = () => {}
```

### Component Props

```typescript
// ✅ Good: Clear and specific
interface UserProfileCardProps {
  readonly user: User
  readonly onEditClick: (userId: string) => void
  readonly isEditingEnabled: boolean
  readonly className?: string
}

// ❌ Bad: Generic or unclear
interface Props {
  data: any
  onClick: () => void
  flag: boolean
  style?: string
}
```

## Hook Naming

### Custom Hooks

Always start with `use` and be descriptive:

```typescript
// ✅ Good
const useUserAuthentication = () => {}
const useLocalStoragePersistence = (key: string) => {}
const useApiDataFetching = (endpoint: string) => {}

// ❌ Bad
const userAuth = () => {} // Missing 'use' prefix
const useData = () => {} // Too generic
const useLS = (key: string) => {} // Abbreviated
```

## Type and Interface Naming

### Interfaces

```typescript
// ✅ Good: Descriptive, specific purpose
interface UserAccount {
  readonly id: string
  readonly email: string
  readonly displayName: string
}

interface ApiResponse<T> {
  readonly data: T
  readonly status: number
  readonly message: string
}

// ❌ Bad: Too generic
interface Data {
  id: string
  info: any
}
```

### Type Aliases

```typescript
// ✅ Good: Clear purpose
type UserRole = 'admin' | 'user' | 'guest'
type OrderStatus = 'pending' | 'confirmed' | 'shipped' | 'delivered'
type EventHandler<T> = (event: T) => void

// ❌ Bad: Unclear
type Role = string
type Status = any
type Handler = Function
```

### Generic Types

Use meaningful names instead of single letters when possible:

```typescript
// ✅ Good: Descriptive generic names
interface Repository<EntityType, IdType = string> {
  findById(id: IdType): Promise<EntityType | null>
  save(entity: EntityType): Promise<EntityType>
}

// ✅ Acceptable: Standard single letters when context is clear
interface List<T> {
  items: T[]
  length: number
}
```

## Constants and Enums

### Constants

```typescript
// ✅ Good: SCREAMING_SNAKE_CASE for module-level constants
const API_BASE_URL = 'https://api.example.com'
const MAX_RETRY_ATTEMPTS = 3
const DEFAULT_PAGE_SIZE = 20

// ✅ Good: camelCase for local constants
function processOrder() {
  const defaultShippingMethod = 'standard'
  const processingTimeout = 5000
}
```

### Enums

```typescript
// ✅ Good: PascalCase for enum, descriptive values
enum OrderStatus {
  PENDING = 'pending',
  CONFIRMED = 'confirmed',
  SHIPPED = 'shipped',
  DELIVERED = 'delivered',
  CANCELLED = 'cancelled',
}

enum UserRole {
  ADMIN = 'admin',
  MODERATOR = 'moderator',
  USER = 'user',
  GUEST = 'guest',
}
```

## Class Naming

### Classes

```typescript
// ✅ Good: PascalCase, noun-based
class UserAccountService {
  private readonly apiClient: ApiClient

  constructor(apiClient: ApiClient) {
    this.apiClient = apiClient
  }
}

class OrderProcessingEngine {
  processOrder(order: Order): Promise<ProcessedOrder> {}
}

// ❌ Bad: Unclear purpose
class Manager {}
class Handler {}
class Utils {}
```

### Methods

```typescript
class UserService {
  // ✅ Good: Verb-based, specific
  async createUserAccount(userData: CreateUserRequest): Promise<User> {}
  async validateUserCredentials(email: string, password: string): Promise<boolean> {}
  async deleteUserAccount(userId: string): Promise<void> {}

  // ❌ Bad: Unclear or generic
  async create(data: any): Promise<any> {}
  async check(email: string, pwd: string): Promise<boolean> {}
  async remove(id: string): Promise<void> {}
}
```

## Event and Handler Naming

### Event Handlers

```typescript
// ✅ Good: Clear action and context
const handleUserLoginSubmit = () => {}
const handleOrderCancelClick = () => {}
const handleModalClose = () => {}

// ❌ Bad: Generic or unclear
const onSubmit = () => {}
const onClick = () => {}
const handleClick = () => {}
```

### Event Names

```typescript
// ✅ Good: Past tense for events that happened
const USER_LOGGED_IN = 'user_logged_in'
const ORDER_CREATED = 'order_created'
const PAYMENT_PROCESSED = 'payment_processed'

// ✅ Good: Present tense for actions
const LOGIN_USER = 'login_user'
const CREATE_ORDER = 'create_order'
const PROCESS_PAYMENT = 'process_payment'
```

## API and Service Naming

### Service Methods

```typescript
class ApiService {
  // ✅ Good: RESTful naming
  async getUserById(id: string): Promise<User> {}
  async createUser(userData: CreateUserRequest): Promise<User> {}
  async updateUser(id: string, updates: UpdateUserRequest): Promise<User> {}
  async deleteUser(id: string): Promise<void> {}

  // ✅ Good: Action-based for complex operations
  async authenticateUser(credentials: LoginCredentials): Promise<AuthResult> {}
  async resetUserPassword(email: string): Promise<void> {}
}
```

### Endpoint Constants

```typescript
const API_ENDPOINTS = {
  USERS: '/api/users',
  USER_BY_ID: (id: string) => `/api/users/${id}`,
  USER_ORDERS: (userId: string) => `/api/users/${userId}/orders`,
  AUTH_LOGIN: '/api/auth/login',
  AUTH_REFRESH: '/api/auth/refresh',
} as const
```

## Common Patterns

### Repository Pattern

```typescript
interface UserRepository {
  findById(id: string): Promise<User | null>
  findByEmail(email: string): Promise<User | null>
  create(user: CreateUserData): Promise<User>
  update(id: string, updates: Partial<User>): Promise<User>
  delete(id: string): Promise<void>
}
```

### Factory Pattern

```typescript
class DatabaseConnectionFactory {
  static createConnection(config: DatabaseConfig): DatabaseConnection {}
  static createTestConnection(): DatabaseConnection {}
}
```

## Naming Anti-patterns

❌ **Avoid these patterns**:

```typescript
// Too generic
const data = fetchData()
const info = getInfo()
const result = processResult()

// Unclear abbreviations
const usr = getCurrentUsr()
const pwd = validatePwd()
const cfg = loadCfg()

// Negative boolean names
const isNotValid = false
const cannotEdit = true
const isDisabled = false

// Mixed naming conventions
const user_name = 'john' // snake_case in camelCase context
const UserID = '123' // Mixed case
const COMPONENT_name = 'test' // Mixed case
```

## Context-Specific Guidelines

### Test Files

```typescript
// ✅ Good: Descriptive test names
describe('UserAuthenticationService', () => {
  describe('authenticateUser', () => {
    it('should return auth token for valid credentials', () => {})
    it('should throw error for invalid credentials', () => {})
    it('should handle network timeout gracefully', () => {})
  })
})
```

### Environment Variables

```typescript
// ✅ Good: Clear, prefixed
const DATABASE_URL = process.env.DATABASE_URL
const API_SECRET_KEY = process.env.API_SECRET_KEY
const REDIS_CONNECTION_STRING = process.env.REDIS_CONNECTION_STRING
```

These naming conventions should be consistently applied across all project files to maintain code quality and team productivity.

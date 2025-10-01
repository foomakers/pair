# 🏷️ Naming Conventions

**Focus**: Consistent naming patterns across TypeScript, React, and Node.js code

Comprehensive naming conventions for variables, functions, classes, files, and directories to ensure consistency and clarity across the codebase.

## 📝 General Naming Principles

### Core Guidelines

```typescript
// ✅ Use descriptive, intention-revealing names
const userRegistrationDate = new Date()
const calculateMonthlyPayment = (principal: number, rate: number) => {
  /* ... */
}
const isUserAuthenticated = (user: User) => user.status === 'authenticated'

// ❌ Avoid abbreviations and unclear names
const urDate = new Date()
const calc = (p: number, r: number) => {
  /* ... */
}
const chk = (u: User) => u.status === 'authenticated'

// ✅ Use searchable names for important concepts
const MAX_RETRY_ATTEMPTS = 3
const DEFAULT_SESSION_TIMEOUT_MINUTES = 30
const USER_ROLE_ADMIN = 'admin'

// ❌ Avoid magic numbers and unclear constants
const attempts = 3
const timeout = 30
const role = 'admin'

// ✅ Use positive boolean names
const isValid = true
const canEdit = false
const hasPermission = user.role === 'admin'

// ❌ Avoid negative boolean names
const isNotValid = false
const cannotEdit = true
const hasNoPermission = user.role !== 'admin'
```

### Naming Length Guidelines

```typescript
// ✅ Variable names: 2-50 characters, descriptive
const user = getCurrentUser()
const userAccountBalance = calculateBalance(user.id)
const monthlySubscriptionFee = subscription.amount

// ✅ Function names: 3-50 characters, verb-based
const getUser = (id: string) => {
  /* ... */
}
const validateEmailAddress = (email: string) => {
  /* ... */
}
const calculateCompoundInterest = (principal: number, rate: number) => {
  /* ... */
}

// ✅ Class names: 3-50 characters, noun-based
class UserRepository {
  /* ... */
}
class EmailValidationService {
  /* ... */
}
class PaymentProcessor {
  /* ... */
}

// ❌ Too short or too long names
const u = getCurrentUser() // Too short
const theCurrentlyAuthenticatedUserAccountBalanceInDollars = 100 // Too long
```

## 🔤 TypeScript Naming Conventions

### Variables and Functions

```typescript
// ✅ Variables: camelCase
const userName = 'john_doe'
const userRegistrationDate = new Date()
const isEmailVerified = true
const currentUserSession = session

// ✅ Functions: camelCase, verb-based
const getUserById = (id: string): User | null => {
  /* ... */
}
const validatePassword = (password: string): boolean => {
  /* ... */
}
const calculateTotalPrice = (items: Item[]): number => {
  /* ... */
}
const sendWelcomeEmail = async (user: User): Promise<void> => {
  /* ... */
}

// ✅ Arrow functions: same naming as regular functions
const formatCurrency = (amount: number, currency: string = 'USD') =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency }).format(amount)

const transformUserData = (rawUser: RawUserData): User => ({
  id: rawUser.user_id,
  name: rawUser.full_name,
  email: rawUser.email_address,
})

// ✅ Async functions: clear async intent
const fetchUserProfile = async (userId: string): Promise<UserProfile> => {
  /* ... */
}
const saveUserSettings = async (settings: UserSettings): Promise<void> => {
  /* ... */
}
const loadUserDashboard = async (): Promise<DashboardData> => {
  /* ... */
}

// ✅ Higher-order functions: clear purpose
const withLogging = <T extends any[], R>(fn: (...args: T) => R) => {
  /* ... */
}
const withRetry = <T>(operation: () => Promise<T>) => {
  /* ... */
}
const createValidator = <T>(predicate: (value: T) => boolean) => {
  /* ... */
}
```

### Classes and Interfaces

```typescript
// ✅ Classes: PascalCase, noun-based
class UserService {
  private readonly repository: UserRepository

  constructor(repository: UserRepository) {
    this.repository = repository
  }
}

class PaymentProcessor {
  async processPayment(payment: PaymentRequest): Promise<PaymentResult> {
    // Implementation
  }
}

class EmailNotificationService {
  async sendNotification(recipient: string, message: string): Promise<void> {
    // Implementation
  }
}

// ✅ Interfaces: PascalCase, noun-based (no 'I' prefix)
interface User {
  readonly id: string
  readonly name: string
  readonly email: string
  readonly createdAt: Date
}

interface UserRepository {
  findById(id: string): Promise<User | null>
  save(user: User): Promise<void>
  delete(id: string): Promise<void>
}

interface PaymentGateway {
  processPayment(payment: PaymentRequest): Promise<PaymentResult>
  refundPayment(paymentId: string): Promise<RefundResult>
}

// ✅ Abstract classes: PascalCase with descriptive names
abstract class BaseRepository<T> {
  abstract findById(id: string): Promise<T | null>
  abstract save(entity: T): Promise<void>
}

abstract class EventHandler {
  abstract handle(event: DomainEvent): Promise<void>
}
```

### Types and Enums

```typescript
// ✅ Type aliases: PascalCase
type UserId = Brand<string, 'UserId'>
type EmailAddress = Brand<string, 'EmailAddress'>
type UserRole = 'admin' | 'user' | 'moderator'
type UserStatus = 'active' | 'inactive' | 'suspended'

type CreateUserRequest = {
  readonly name: string
  readonly email: string
  readonly password: string
}

type UserProfileUpdate = {
  readonly name?: string
  readonly bio?: string
  readonly avatar?: string
}

// ✅ Enums: PascalCase for enum name, UPPER_CASE for values
enum UserRole {
  ADMIN = 'admin',
  USER = 'user',
  MODERATOR = 'moderator',
}

enum PaymentStatus {
  PENDING = 'pending',
  COMPLETED = 'completed',
  FAILED = 'failed',
  REFUNDED = 'refunded',
}

enum HttpStatusCode {
  OK = 200,
  CREATED = 201,
  BAD_REQUEST = 400,
  UNAUTHORIZED = 401,
  NOT_FOUND = 404,
  INTERNAL_SERVER_ERROR = 500,
}

// ✅ Union types: descriptive names
type ApiResponse<T> = { success: true; data: T } | { success: false; error: ApiError }

type LoadingState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'success'; data: unknown }
  | { status: 'error'; error: string }
```

### Constants and Configuration

```typescript
// ✅ Constants: UPPER_SNAKE_CASE
const MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024 // 10MB
const DEFAULT_PAGE_SIZE = 20
const API_TIMEOUT_MILLISECONDS = 5000
const JWT_EXPIRY_HOURS = 24

// ✅ Configuration objects: camelCase with descriptive structure
const apiConfig = {
  baseUrl: 'https://api.example.com',
  timeout: 5000,
  retryAttempts: 3,
  apiVersion: 'v1',
} as const

const databaseConfig = {
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT || '5432'),
  database: process.env.DB_NAME || 'myapp',
  connectionPool: {
    min: 2,
    max: 10,
    idleTimeoutMillis: 30000,
  },
} as const

// ✅ Feature flags: camelCase with clear boolean intent
const featureFlags = {
  enableUserRegistration: true,
  enablePaymentProcessing: false,
  enableExperimentalFeatures: false,
  showBetaFeatures: true,
} as const

// ✅ Environment-specific constants
const isDevelopment = process.env.NODE_ENV === 'development'
const isProduction = process.env.NODE_ENV === 'production'
const isTesting = process.env.NODE_ENV === 'test'
```

## ⚛️ React Naming Conventions

### Components

```typescript
// ✅ Components: PascalCase, descriptive names
const UserProfile = ({ user }: { user: User }) => {
  return (
    <div className='user-profile'>
      <h1>{user.name}</h1>
      <p>{user.email}</p>
    </div>
  )
}

const UserRegistrationForm = () => {
  const [formData, setFormData] = useState<RegistrationFormData>({
    name: '',
    email: '',
    password: '',
  })

  return <form>{/* Form implementation */}</form>
}

const PaymentSuccessModal = ({ isOpen, onClose }: ModalProps) => {
  return isOpen ? (
    <div className='modal'>
      <div className='modal-content'>
        <h2>Payment Successful!</h2>
        <button onClick={onClose}>Close</button>
      </div>
    </div>
  ) : null
}

// ✅ Higher-Order Components: withXxx pattern
const withAuthentication =
  <P extends object>(Component: React.ComponentType<P>) =>
  (props: P) => {
    const user = useCurrentUser()

    if (!user) {
      return <LoginPrompt />
    }

    return <Component {...props} />
  }

const withLoading =
  <P extends object>(Component: React.ComponentType<P>) =>
  (props: P & { loading: boolean }) => {
    if (props.loading) {
      return <LoadingSpinner />
    }

    return <Component {...props} />
  }
```

### Hooks

```typescript
// ✅ Custom hooks: useXxx pattern
const useCurrentUser = (): User | null => {
  const [user, setUser] = useState<User | null>(null)

  useEffect(() => {
    // Load user logic
  }, [])

  return user
}

const useApiCall = <T>(url: string): ApiState<T> => {
  const [state, setState] = useState<ApiState<T>>({ status: 'idle' })

  // Implementation

  return state
}

const useLocalStorage = <T>(key: string, defaultValue: T) => {
  const [value, setValue] = useState<T>(defaultValue)

  // Implementation

  return [value, setValue] as const
}

// ✅ Hook return values: descriptive names
const useUserForm = () => {
  const [formData, setFormData] = useState<UserFormData>({})
  const [errors, setErrors] = useState<FormErrors>({})
  const [isSubmitting, setIsSubmitting] = useState(false)

  const submitForm = async () => {
    setIsSubmitting(true)
    // Submit logic
    setIsSubmitting(false)
  }

  return {
    formData,
    setFormData,
    errors,
    setErrors,
    isSubmitting,
    submitForm,
  }
}
```

### Props and State

```typescript
// ✅ Props interfaces: ComponentProps pattern
interface UserCardProps {
  readonly user: User
  readonly onEdit?: (user: User) => void
  readonly onDelete?: (userId: string) => void
  readonly showActions?: boolean
  readonly className?: string
}

interface ModalProps {
  readonly isOpen: boolean
  readonly onClose: () => void
  readonly title?: string
  readonly children: React.ReactNode
}

interface FormProps<T> {
  readonly initialData?: T
  readonly onSubmit: (data: T) => void
  readonly onCancel?: () => void
  readonly isLoading?: boolean
  readonly errors?: Record<keyof T, string>
}

// ✅ State types: descriptive names
type UserFormState = {
  readonly data: UserFormData
  readonly errors: FormErrors
  readonly isSubmitting: boolean
  readonly isDirty: boolean
}

type PaymentState =
  | { status: 'idle' }
  | { status: 'processing' }
  | { status: 'success'; paymentId: string }
  | { status: 'error'; errorMessage: string }

// ✅ Event handlers: onXxx pattern
interface UserListProps {
  readonly users: User[]
  readonly onUserSelect: (user: User) => void
  readonly onUserEdit: (userId: string) => void
  readonly onUserDelete: (userId: string) => void
  readonly onRefresh: () => void
}
```

## 📁 File and Directory Naming

### File Naming Patterns

```typescript
// ✅ TypeScript files: kebab-case.ts
// Components
user - profile.component.tsx
payment - form.component.tsx
navigation - header.component.tsx

// Services
user - service.ts
payment - processor.ts
email - notification - service.ts

// Utilities
date - utils.ts
validation - utils.ts
api - client.ts

// Types
user.types.ts
payment.types.ts
api.types.ts

// Tests
user - service.test.ts
payment - processor.test.ts
user - profile.component.test.tsx

// Hooks
use - current - user.hook.ts
use - api - call.hook.ts
use - local - storage.hook.ts

// Configurations
database.config.ts
api.config.ts
app.config.ts
```

### Directory Structure

```
src/
├── components/           # React components
│   ├── common/          # Shared components
│   │   ├── button/
│   │   │   ├── button.component.tsx
│   │   │   ├── button.test.tsx
│   │   │   └── index.ts
│   │   └── modal/
│   └── features/        # Feature-specific components
│       ├── user-management/
│       └── payment/
├── services/            # Business logic services
│   ├── user-service.ts
│   ├── payment-service.ts
│   └── index.ts
├── hooks/              # Custom React hooks
│   ├── use-current-user.hook.ts
│   ├── use-api-call.hook.ts
│   └── index.ts
├── utils/              # Utility functions
│   ├── date-utils.ts
│   ├── validation-utils.ts
│   └── index.ts
├── types/              # Type definitions
│   ├── user.types.ts
│   ├── api.types.ts
│   └── index.ts
├── config/             # Configuration files
│   ├── database.config.ts
│   ├── api.config.ts
│   └── index.ts
└── __tests__/          # Test utilities
    ├── test-helpers.ts
    ├── mock-data.ts
    └── setup.ts
```

## 🎯 Domain-Specific Naming

### API and HTTP

```typescript
// ✅ API endpoints: kebab-case with clear resource names
const API_ENDPOINTS = {
  users: '/api/v1/users',
  userProfile: '/api/v1/users/:id/profile',
  userSessions: '/api/v1/users/:id/sessions',
  paymentMethods: '/api/v1/payment-methods',
  subscriptions: '/api/v1/subscriptions',
} as const

// ✅ HTTP method handlers: methodResource pattern
const getUserById = async (id: string): Promise<User> => {
  /* ... */
}
const createUser = async (userData: CreateUserRequest): Promise<User> => {
  /* ... */
}
const updateUser = async (id: string, updates: UpdateUserRequest): Promise<User> => {
  /* ... */
}
const deleteUser = async (id: string): Promise<void> => {
  /* ... */
}

// ✅ Request/Response types: clear purpose
type GetUserRequest = {
  readonly id: string
  readonly include?: ('profile' | 'settings' | 'sessions')[]
}

type CreateUserRequest = {
  readonly name: string
  readonly email: string
  readonly password: string
}

type UpdateUserRequest = {
  readonly name?: string
  readonly email?: string
  readonly settings?: UserSettings
}

type UserResponse = {
  readonly user: User
  readonly profile?: UserProfile
  readonly settings?: UserSettings
}
```

### Database and Repository

```typescript
// ✅ Repository methods: clear CRUD operations
interface UserRepository {
  findById(id: string): Promise<User | null>
  findByEmail(email: string): Promise<User | null>
  findActiveUsers(): Promise<User[]>
  save(user: User): Promise<User>
  delete(id: string): Promise<void>
  count(): Promise<number>
  existsByEmail(email: string): Promise<boolean>
}

// ✅ Database table names: snake_case (following SQL conventions)
const TABLE_NAMES = {
  users: 'users',
  userProfiles: 'user_profiles',
  userSessions: 'user_sessions',
  paymentMethods: 'payment_methods',
  subscriptionPlans: 'subscription_plans',
} as const

// ✅ Database column names: snake_case
type UserTableRow = {
  id: string
  email: string
  password_hash: string
  first_name: string
  last_name: string
  created_at: Date
  updated_at: Date
  is_active: boolean
}

// ✅ Query builder methods: descriptive names
class UserQueryBuilder {
  whereActive(): this {
    /* ... */
  }
  whereEmailLike(pattern: string): this {
    /* ... */
  }
  whereCreatedAfter(date: Date): this {
    /* ... */
  }
  orderByCreatedAt(direction: 'ASC' | 'DESC' = 'ASC'): this {
    /* ... */
  }
  includeProfile(): this {
    /* ... */
  }
  includeSessions(): this {
    /* ... */
  }
}
```

### Error Handling

```typescript
// ✅ Error classes: descriptive names with Error suffix
class UserNotFoundError extends Error {
  constructor(userId: string) {
    super(`User not found: ${userId}`)
    this.name = 'UserNotFoundError'
  }
}

class InvalidEmailError extends Error {
  constructor(email: string) {
    super(`Invalid email format: ${email}`)
    this.name = 'InvalidEmailError'
  }
}

class UserAlreadyExistsError extends Error {
  constructor(email: string) {
    super(`User already exists with email: ${email}`)
    this.name = 'UserAlreadyExistsError'
  }
}

// ✅ Error handling functions: clear intent
const handleUserNotFound = (error: UserNotFoundError): ApiErrorResponse => ({
  code: 'USER_NOT_FOUND',
  message: 'The requested user was not found',
  details: { userId: error.message },
})

const handleValidationError = (error: ValidationError): ApiErrorResponse => ({
  code: 'VALIDATION_ERROR',
  message: 'Request validation failed',
  details: error.validationErrors,
})

// ✅ Result types: clear success/failure distinction
type OperationResult<T> = { success: true; data: T } | { success: false; error: Error }

type ValidationResult = {
  readonly isValid: boolean
  readonly errors: readonly string[]
}
```

## 🔗 Related Concepts

- **[File Structure](file-structure.md)** - Organizing files and directories
- **[Clear Readable Code](.pair/knowledge/guidelines/code-design/design-principles/clear-readable-code.md)** - Code clarity principles
- **[TypeScript Standards](.pair/knowledge/guidelines/technical-standards/tech-stack/typescript-standards.md)** - TypeScript-specific conventions
- **[Code Review Standards](.pair/knowledge/guidelines/code-design/quality-standards/code-review.md)** - Review criteria for naming

## 🎯 Implementation Guidelines

1. **Consistency First**: Maintain consistent naming patterns across the entire codebase
2. **Be Descriptive**: Use clear, intention-revealing names even if they're longer
3. **Follow Conventions**: Respect language and framework conventions (camelCase for JS/TS, PascalCase for components)
4. **Avoid Abbreviations**: Use full words unless the abbreviation is widely understood
5. **Use Searchable Names**: Important concepts should have unique, searchable names
6. **Context Matters**: Names should make sense within their context and scope
7. **Team Agreement**: Establish and document team-specific naming conventions

## 📏 Benefits

- **Consistency**: Uniform naming makes code more predictable and easier to navigate
- **Clarity**: Descriptive names make code self-documenting
- **Maintainability**: Clear naming reduces cognitive load when reading and modifying code
- **Collaboration**: Consistent conventions help team members understand each other's code
- **Tooling**: Good naming improves IDE support and search functionality
- **Onboarding**: New team members can understand code structure more quickly

---

_Consistent naming conventions create a shared vocabulary that makes code more readable, maintainable, and professional._

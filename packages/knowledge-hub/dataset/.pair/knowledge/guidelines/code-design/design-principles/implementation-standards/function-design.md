# ⚙️ Function Design

**Focus**: Function composition, parameters, and return value design patterns

Guidelines for designing clean, testable, and maintainable functions in TypeScript with focus on composition, error handling, and clear interfaces.

## 🎯 Function Design Principles

### Single Responsibility Functions

```typescript
// ❌ Function doing too many things
function processUser(userData: any): any {
  // Validation
  if (!userData.email || !userData.name) {
    throw new Error('Invalid data')
  }

  // Transformation
  const user = {
    id: Math.random().toString(),
    email: userData.email.toLowerCase(),
    name: userData.name.trim(),
    createdAt: new Date(),
  }

  // Side effects
  console.log('User created:', user.id)
  sendWelcomeEmail(user.email)

  // Data persistence
  database.save(user)

  return user
}

// ✅ Functions with single responsibilities
const validateUserData = (userData: unknown): Result<UserData> => {
  if (!userData || typeof userData !== 'object') {
    return err(new Error('User data must be an object'))
  }

  const data = userData as Record<string, unknown>

  if (!data.email || typeof data.email !== 'string') {
    return err(new Error('Valid email is required'))
  }

  if (!data.name || typeof data.name !== 'string') {
    return err(new Error('Valid name is required'))
  }

  return ok({
    email: data.email,
    name: data.name,
  })
}

const createUserEntity = (userData: UserData): User => ({
  id: crypto.randomUUID(),
  email: userData.email.toLowerCase().trim(),
  name: userData.name.trim(),
  createdAt: new Date(),
  updatedAt: new Date(),
})

const logUserCreation = (user: User): void => {
  console.log('User created:', { id: user.id, email: user.email })
}

const sendWelcomeEmailAsync = async (user: User): Promise<void> => {
  try {
    await emailService.sendWelcomeEmail(user.email, user.name)
  } catch (error) {
    console.error('Failed to send welcome email:', error)
    // Don't throw - this is a side effect
  }
}

// ✅ Composed function with clear flow
const processUser = async (userData: unknown): Promise<Result<User>> => {
  const validationResult = validateUserData(userData)
  if (!validationResult.success) {
    return err(validationResult.error)
  }

  const user = createUserEntity(validationResult.data)

  try {
    const savedUser = await userRepository.save(user)

    // Side effects (don't block main flow)
    logUserCreation(savedUser)
    sendWelcomeEmailAsync(savedUser)

    return ok(savedUser)
  } catch (error) {
    return err(error as Error)
  }
}
```

### Pure vs Impure Function Separation

```typescript
// ✅ Pure functions - predictable, testable
const calculateTax = (amount: number, rate: number): number => amount * rate

const formatCurrency = (amount: number, currency: string = 'USD'): string =>
  new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency,
  }).format(amount)

const calculateOrderTotal = (items: OrderItem[], taxRate: number): OrderTotal => {
  const subtotal = items.reduce((sum, item) => sum + item.price * item.quantity, 0)
  const tax = calculateTax(subtotal, taxRate)
  const total = subtotal + tax

  return {
    subtotal,
    tax,
    total,
    formattedTotal: formatCurrency(total),
  }
}

// ✅ Impure functions - clearly marked, isolated
const getCurrentTimestamp = (): Date => new Date()

const generateOrderId = (): OrderId => crypto.randomUUID() as OrderId

const logOrderCreation = (order: Order): void => {
  console.log('Order created:', {
    id: order.id,
    total: order.total,
    timestamp: order.createdAt,
  })
}

// ✅ Function composition separating pure and impure logic
const createOrder = async (
  items: OrderItem[],
  customerId: CustomerId,
  taxRate: number,
): Promise<Result<Order>> => {
  // Pure calculations
  const orderCalculations = calculateOrderTotal(items, taxRate)

  // Impure operations
  const orderId = generateOrderId()
  const timestamp = getCurrentTimestamp()

  const order: Order = {
    id: orderId,
    customerId,
    items,
    subtotal: orderCalculations.subtotal,
    tax: orderCalculations.tax,
    total: orderCalculations.total,
    status: 'pending',
    createdAt: timestamp,
    updatedAt: timestamp,
  }

  try {
    const savedOrder = await orderRepository.save(order)

    // Side effects
    logOrderCreation(savedOrder)
    eventBus.publish(new OrderCreatedEvent(savedOrder))

    return ok(savedOrder)
  } catch (error) {
    return err(error as Error)
  }
}
```

## 📝 Function Signatures and Parameters

### Parameter Design Patterns

```typescript
// ✅ Use objects for multiple parameters
interface CreateUserOptions {
  readonly email: string
  readonly name: string
  readonly sendWelcomeEmail?: boolean
  readonly role?: UserRole
  readonly metadata?: Record<string, unknown>
}

// ❌ Too many positional parameters
const createUser = (
  email: string,
  name: string,
  sendWelcomeEmail: boolean,
  role: string,
  metadata: any,
) => {
  /* ... */
}

// ✅ Clear object parameters
const createUser = (options: CreateUserOptions): Promise<Result<User>> => {
  const { email, name, sendWelcomeEmail = true, role = 'user', metadata = {} } = options

  // Implementation
}

// ✅ Builder pattern for complex configurations
class QueryBuilder {
  private conditions: string[] = []
  private sortFields: string[] = []
  private limitValue?: number

  where(condition: string): this {
    this.conditions.push(condition)
    return this
  }

  orderBy(field: string, direction: 'ASC' | 'DESC' = 'ASC'): this {
    this.sortFields.push(`${field} ${direction}`)
    return this
  }

  limit(count: number): this {
    this.limitValue = count
    return this
  }

  build(): string {
    let query = 'SELECT * FROM users'

    if (this.conditions.length > 0) {
      query += ` WHERE ${this.conditions.join(' AND ')}`
    }

    if (this.sortFields.length > 0) {
      query += ` ORDER BY ${this.sortFields.join(', ')}`
    }

    if (this.limitValue) {
      query += ` LIMIT ${this.limitValue}`
    }

    return query
  }
}

// Usage
const query = new QueryBuilder()
  .where('status = "active"')
  .where('created_at > "2023-01-01"')
  .orderBy('name')
  .limit(50)
  .build()

// ✅ Functional options pattern
interface EmailOptions {
  readonly template?: string
  readonly priority?: 'low' | 'normal' | 'high'
  readonly delay?: number
  readonly metadata?: Record<string, unknown>
}

type EmailOptionsFn = (options: EmailOptions) => EmailOptions

const withTemplate =
  (template: string): EmailOptionsFn =>
  options => ({ ...options, template })

const withPriority =
  (priority: 'low' | 'normal' | 'high'): EmailOptionsFn =>
  options => ({ ...options, priority })

const withDelay =
  (delay: number): EmailOptionsFn =>
  options => ({ ...options, delay })

const sendEmail = (
  to: string,
  subject: string,
  body: string,
  ...optionsFns: EmailOptionsFn[]
): Promise<void> => {
  const options = optionsFns.reduce((acc, fn) => fn(acc), {} as EmailOptions)

  // Implementation
}

// Usage
await sendEmail(
  'user@example.com',
  'Welcome!',
  'Welcome to our platform',
  withTemplate('welcome'),
  withPriority('high'),
  withDelay(5000),
)
```

### Type-Safe Parameter Validation

```typescript
// ✅ Runtime validation with compile-time types
import { z } from 'zod'

const CreateUserSchema = z.object({
  email: z.string().email(),
  name: z.string().min(2).max(100),
  age: z.number().int().min(0).max(120).optional(),
  role: z.enum(['admin', 'user', 'moderator']).default('user'),
})

type CreateUserInput = z.infer<typeof CreateUserSchema>

const createUserWithValidation = (input: unknown): Result<User> => {
  const validation = CreateUserSchema.safeParse(input)

  if (!validation.success) {
    return err(new Error(`Validation failed: ${validation.error.message}`))
  }

  const userData = validation.data

  // Type-safe access to validated data
  const user: User = {
    id: crypto.randomUUID() as UserId,
    email: userData.email as Email,
    name: userData.name,
    age: userData.age,
    role: userData.role,
    createdAt: new Date(),
    updatedAt: new Date(),
  }

  return ok(user)
}

// ✅ Branded types for parameter safety
type UserId = Brand<string, 'UserId'>
type Email = Brand<string, 'Email'>
type OrderId = Brand<string, 'OrderId'>

// Prevents mixing up parameters
const getUser = (id: UserId): Promise<User | null> => {
  /* ... */
}
const getOrder = (id: OrderId): Promise<Order | null> => {
  /* ... */
}

// ❌ This would cause a type error
// const user = await getUser(orderId); // Type error!

// ✅ Explicit conversion when needed
const userId = 'user-123' as UserId
const user = await getUser(userId)
```

## 🔄 Return Value Design

### Result Pattern for Error Handling

```typescript
// ✅ Result type for explicit error handling
type Result<T, E = Error> =
  | { readonly success: true; readonly data: T }
  | { readonly success: false; readonly error: E }

const ok = <T>(data: T): Result<T> => ({ success: true, data })
const err = <E>(error: E): Result<never, E> => ({ success: false, error })

// ✅ Functions returning Results
const parseJson = <T>(jsonString: string): Result<T> => {
  try {
    const data = JSON.parse(jsonString)
    return ok(data)
  } catch (error) {
    return err(error as Error)
  }
}

const validateAge = (age: number): Result<number> => {
  if (age < 0) {
    return err(new Error('Age cannot be negative'))
  }

  if (age > 150) {
    return err(new Error('Age seems unrealistic'))
  }

  return ok(age)
}

const calculateDiscount = (price: number, discountPercent: number): Result<number> => {
  if (price < 0) {
    return err(new Error('Price cannot be negative'))
  }

  if (discountPercent < 0 || discountPercent > 100) {
    return err(new Error('Discount must be between 0 and 100'))
  }

  const discount = price * (discountPercent / 100)
  return ok(discount)
}

// ✅ Result composition
const processOrder = (orderData: unknown): Result<ProcessedOrder> => {
  const parseResult = parseJson<RawOrderData>(orderData as string)
  if (!parseResult.success) {
    return err(parseResult.error)
  }

  const { price, discountPercent, customerAge } = parseResult.data

  const ageValidation = validateAge(customerAge)
  if (!ageValidation.success) {
    return err(ageValidation.error)
  }

  const discountResult = calculateDiscount(price, discountPercent)
  if (!discountResult.success) {
    return err(discountResult.error)
  }

  return ok({
    originalPrice: price,
    discount: discountResult.data,
    finalPrice: price - discountResult.data,
    customerAge: ageValidation.data,
  })
}
```

### Optional and Nullable Returns

```typescript
// ✅ Clear distinction between optional and nullable
interface User {
  readonly id: UserId
  readonly name: string
  readonly email: string
  readonly avatar?: string // Optional: may not be set
  readonly lastLoginAt: Date | null // Nullable: explicitly null when never logged in
}

// ✅ Functions with clear optional semantics
const findUserById = (id: UserId): Promise<User | null> => {
  // Returns null when user doesn't exist (expected case)
}

const getUserById = (id: UserId): Promise<User> => {
  // Throws error when user doesn't exist (unexpected case)
}

const findUserByEmail = (email: Email): Promise<User | undefined> => {
  // Returns undefined when user doesn't exist (search operation)
}

// ✅ Option type pattern
type Option<T> = T | null

const findFirst = <T>(array: T[], predicate: (item: T) => boolean): Option<T> => {
  const found = array.find(predicate)
  return found ?? null
}

// ✅ Maybe type pattern with helpers
type Maybe<T> = {
  readonly hasValue: boolean
  readonly value?: T
}

const some = <T>(value: T): Maybe<T> => ({ hasValue: true, value })
const none = <T>(): Maybe<T> => ({ hasValue: false })

const mapMaybe = <T, U>(maybe: Maybe<T>, fn: (value: T) => U): Maybe<U> => {
  return maybe.hasValue ? some(fn(maybe.value!)) : none()
}

const getUserProfile = (userId: UserId): Maybe<UserProfile> => {
  const user = users.find(u => u.id === userId)
  return user ? some(user.profile) : none()
}
```

### Async Function Design

```typescript
// ✅ Clear async/await patterns
const fetchUserData = async (userId: UserId): Promise<Result<User>> => {
  try {
    const response = await fetch(`/api/users/${userId}`)

    if (!response.ok) {
      return err(new Error(`HTTP ${response.status}: ${response.statusText}`))
    }

    const userData = await response.json()
    const user = UserSchema.parse(userData)

    return ok(user)
  } catch (error) {
    return err(error as Error)
  }
}

// ✅ Parallel async operations
const loadUserDashboard = async (userId: UserId): Promise<Result<DashboardData>> => {
  try {
    const [userResult, ordersResult, notificationsResult] = await Promise.allSettled([
      fetchUserData(userId),
      fetchUserOrders(userId),
      fetchUserNotifications(userId),
    ])

    // Handle individual failures gracefully
    const user =
      userResult.status === 'fulfilled' && userResult.value.success ? userResult.value.data : null

    const orders =
      ordersResult.status === 'fulfilled' && ordersResult.value.success
        ? ordersResult.value.data
        : []

    const notifications =
      notificationsResult.status === 'fulfilled' && notificationsResult.value.success
        ? notificationsResult.value.data
        : []

    if (!user) {
      return err(new Error('Failed to load user data'))
    }

    return ok({
      user,
      orders,
      notifications,
      hasErrors: ordersResult.status === 'rejected' || notificationsResult.status === 'rejected',
    })
  } catch (error) {
    return err(error as Error)
  }
}

// ✅ Timeout and cancellation
const withTimeout = <T>(promise: Promise<T>, timeoutMs: number): Promise<T> => {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) =>
      setTimeout(() => reject(new Error('Operation timed out')), timeoutMs),
    ),
  ])
}

const fetchWithTimeout = async (url: string, timeoutMs: number = 5000): Promise<Response> => {
  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs)

  try {
    const response = await fetch(url, { signal: controller.signal })
    clearTimeout(timeoutId)
    return response
  } catch (error) {
    clearTimeout(timeoutId)
    throw error
  }
}

// ✅ Retry logic
const withRetry = async <T>(
  operation: () => Promise<T>,
  maxAttempts: number = 3,
  delayMs: number = 1000,
): Promise<T> => {
  let lastError: Error

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await operation()
    } catch (error) {
      lastError = error as Error

      if (attempt === maxAttempts) {
        break
      }

      // Exponential backoff
      const delay = delayMs * Math.pow(2, attempt - 1)
      await new Promise(resolve => setTimeout(resolve, delay))
    }
  }

  throw lastError!
}
```

## 🧩 Function Composition Patterns

### Higher-Order Functions

```typescript
// ✅ Function decorators and wrappers
const withLogging =
  <T extends any[], R>(fn: (...args: T) => R, name: string) =>
  (...args: T): R => {
    console.log(`[${name}] Called with:`, args)
    const startTime = performance.now()

    try {
      const result = fn(...args)
      const duration = performance.now() - startTime
      console.log(`[${name}] Completed in ${duration.toFixed(2)}ms`)
      return result
    } catch (error) {
      const duration = performance.now() - startTime
      console.error(`[${name}] Failed after ${duration.toFixed(2)}ms:`, error)
      throw error
    }
  }

const withValidation =
  <T extends any[], R>(fn: (...args: T) => R, validator: (...args: T) => boolean) =>
  (...args: T): R => {
    if (!validator(...args)) {
      throw new Error('Validation failed')
    }
    return fn(...args)
  }

const withMemoization = <T extends any[], R>(
  fn: (...args: T) => R,
  keyFn: (...args: T) => string = (...args) => JSON.stringify(args),
) => {
  const cache = new Map<string, R>()

  return (...args: T): R => {
    const key = keyFn(...args)

    if (cache.has(key)) {
      return cache.get(key)!
    }

    const result = fn(...args)
    cache.set(key, result)
    return result
  }
}

// ✅ Usage examples
const calculateExpensiveValue = (x: number, y: number): number => {
  // Simulate expensive computation
  return Math.pow(x, y)
}

const validateNumbers = (x: number, y: number): boolean => {
  return !isNaN(x) && !isNaN(y) && x >= 0 && y >= 0
}

const enhancedCalculate = withLogging(
  withValidation(withMemoization(calculateExpensiveValue), validateNumbers),
  'calculateExpensiveValue',
)

// ✅ Pipeline composition
const pipe =
  <T>(...fns: Array<(arg: T) => T>) =>
  (value: T): T =>
    fns.reduce((acc, fn) => fn(acc), value)

const compose =
  <T>(...fns: Array<(arg: T) => T>) =>
  (value: T): T =>
    fns.reduceRight((acc, fn) => fn(acc), value)

// String processing pipeline
const trim = (str: string): string => str.trim()
const toLowerCase = (str: string): string => str.toLowerCase()
const removeSpaces = (str: string): string => str.replace(/\s+/g, '')
const addPrefix =
  (prefix: string) =>
  (str: string): string =>
    `${prefix}${str}`

const processString = pipe(trim, toLowerCase, removeSpaces, addPrefix('processed_'))

// Usage
const result = processString('  Hello World  ') // "processed_helloworld"
```

### Currying and Partial Application

```typescript
// ✅ Curried functions for reusability
const multiply =
  (a: number) =>
  (b: number): number =>
    a * b
const add =
  (a: number) =>
  (b: number): number =>
    a + b
const divide =
  (a: number) =>
  (b: number): number =>
    b / a

// Create specialized functions
const double = multiply(2)
const triple = multiply(3)
const addTen = add(10)
const halve = divide(2)

// Usage
const numbers = [1, 2, 3, 4, 5]
const doubled = numbers.map(double) // [2, 4, 6, 8, 10]
const withTen = numbers.map(addTen) // [11, 12, 13, 14, 15]

// ✅ Curried validation functions
const createValidator =
  <T>(predicate: (value: T) => boolean, errorMessage: string) =>
  (value: T): Result<T> => {
    return predicate(value) ? ok(value) : err(new Error(errorMessage))
  }

const isPositive = createValidator((n: number) => n > 0, 'Number must be positive')

const isNonEmpty = createValidator((s: string) => s.length > 0, 'String cannot be empty')

const isValidEmail = createValidator(
  (email: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email),
  'Invalid email format',
)

// ✅ Function factories
const createApiClient =
  (baseUrl: string) =>
  (timeout: number = 5000) => ({
    get: (path: string) =>
      fetch(`${baseUrl}${path}`, {
        method: 'GET',
        signal: AbortSignal.timeout(timeout),
      }),

    post: (path: string, data: unknown) =>
      fetch(`${baseUrl}${path}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
        signal: AbortSignal.timeout(timeout),
      }),
  })

// Usage
const apiClient = createApiClient('https://api.example.com')(10000)
const fastClient = createApiClient('https://api.example.com')(1000)
```

## 🔗 Related Concepts

- **[Clear Readable Code](.pair/knowledge/guidelines/code-design/design-principles/clear-readable-code.md)** - Code clarity principles
- **[Functional Programming](.pair/knowledge/guidelines/code-design/design-principles/functional-programming.md)** - Functional design patterns
- **[Service Abstraction](service-abstraction.md)** - Service layer function design
- **[SOLID Principles](.pair/knowledge/guidelines/code-design/design-principles/solid-principles.md)** - Design principles for functions

## 🎯 Implementation Guidelines

1. **Single Responsibility**: Each function should have one clear purpose
2. **Pure Functions**: Prefer pure functions for predictability and testability
3. **Clear Parameters**: Use objects for multiple parameters, validate inputs
4. **Explicit Returns**: Use Result types for error handling, be clear about nullability
5. **Composition**: Build complex behavior from simple, composable functions
6. **Type Safety**: Leverage TypeScript's type system for parameter and return value safety
7. **Error Handling**: Handle errors explicitly without throwing exceptions in business logic

## 📏 Benefits

- **Testability**: Well-designed functions are easy to unit test
- **Reusability**: Pure, composable functions can be reused across the codebase
- **Maintainability**: Clear function signatures make code easier to understand and modify
- **Reliability**: Explicit error handling reduces unexpected failures
- **Performance**: Memoization and optimization patterns improve performance
- **Team Collaboration**: Consistent function design helps team members work together

---

_Well-designed functions are the building blocks of maintainable, testable, and reliable TypeScript applications._

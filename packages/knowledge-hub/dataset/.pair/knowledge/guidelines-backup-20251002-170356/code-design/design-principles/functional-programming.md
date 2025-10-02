# 🔄 Functional Programming

**Focus**: Immutability, pure functions, and functional composition patterns

Functional programming principles and patterns for TypeScript development, emphasizing immutability, pure functions, and composability in React/Node.js applications.

## 🧮 Core Functional Programming Concepts

### Pure Functions

```typescript
// ✅ Pure functions - no side effects, deterministic
const add = (a: number, b: number): number => a + b

const formatCurrency = (amount: number, currency: string = 'USD'): string =>
  new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency,
  }).format(amount)

const calculateTax = (amount: number, rate: number): number => amount * rate

// ✅ Pure function for data transformation
const normalizeUser = (user: RawUser): User => ({
  id: user.id,
  name: user.name.trim(),
  email: user.email.toLowerCase(),
  age: user.age || 0,
  createdAt: new Date(user.created_at),
  updatedAt: new Date(user.updated_at),
})

// ❌ Impure function - has side effects
let userCount = 0
const createUserImpure = (userData: CreateUserData): User => {
  userCount++ // Side effect: modifies external state
  console.log('Creating user...') // Side effect: I/O operation

  return {
    id: Math.random().toString(), // Non-deterministic
    ...userData,
    createdAt: new Date(), // Non-deterministic
  }
}

// ✅ Pure version - side effects handled externally
const createUserData = (userData: CreateUserData, id: string, timestamp: Date): User => ({
  id,
  name: userData.name,
  email: userData.email,
  age: userData.age,
  createdAt: timestamp,
  updatedAt: timestamp,
})
```

### Immutability Patterns

```typescript
// ✅ Immutable data structures
type User = {
  readonly id: string
  readonly name: string
  readonly email: string
  readonly preferences: readonly UserPreference[]
  readonly metadata: Readonly<Record<string, unknown>>
}

// ✅ Immutable updates using spread operator
const updateUserName = (user: User, newName: string): User => ({
  ...user,
  name: newName,
  updatedAt: new Date(),
})

const addUserPreference = (user: User, preference: UserPreference): User => ({
  ...user,
  preferences: [...user.preferences, preference],
})

const updateUserPreference = (
  user: User,
  preferenceId: string,
  updates: Partial<UserPreference>,
): User => ({
  ...user,
  preferences: user.preferences.map(pref =>
    pref.id === preferenceId ? { ...pref, ...updates } : pref,
  ),
})

// ✅ Deep immutable updates
const updateNestedUserData = (user: User, path: string, value: unknown): User => {
  if (path === 'metadata.theme') {
    return {
      ...user,
      metadata: {
        ...user.metadata,
        theme: value,
      },
    }
  }

  return user
}

// ✅ Immutable array operations
const users: readonly User[] = []

// Add user
const addUser = (users: readonly User[], user: User): readonly User[] => [...users, user]

// Remove user
const removeUser = (users: readonly User[], userId: string): readonly User[] =>
  users.filter(user => user.id !== userId)

// Update user
const updateUser = (
  users: readonly User[],
  userId: string,
  updates: Partial<User>,
): readonly User[] => users.map(user => (user.id === userId ? { ...user, ...updates } : user))
```

### Function Composition

```typescript
// ✅ Basic function composition
type Transformer<T, U> = (input: T) => U

const pipe =
  <T>(...functions: Array<(arg: T) => T>) =>
  (value: T): T =>
    functions.reduce((acc, fn) => fn(acc), value)

const compose =
  <T>(...functions: Array<(arg: T) => T>) =>
  (value: T): T =>
    functions.reduceRight((acc, fn) => fn(acc), value)

// ✅ String transformation pipeline
const trimString = (str: string): string => str.trim()
const toLowerCase = (str: string): string => str.toLowerCase()
const removeSpaces = (str: string): string => str.replace(/\s+/g, '')

const normalizeString = pipe(trimString, toLowerCase, removeSpaces)

// Usage
const normalized = normalizeString('  Hello World  ') // "helloworld"

// ✅ Data validation pipeline
const validateRequired = (value: string): ValidationResult => ({
  isValid: value.length > 0,
  errors: value.length > 0 ? [] : ['Field is required'],
})

const validateEmail = (value: string): ValidationResult => ({
  isValid: value.includes('@'),
  errors: value.includes('@') ? [] : ['Invalid email format'],
})

const validateMinLength =
  (min: number) =>
  (value: string): ValidationResult => ({
    isValid: value.length >= min,
    errors: value.length >= min ? [] : [`Minimum length is ${min}`],
  })

// Compose validators
const composeValidators =
  (...validators: Array<(value: string) => ValidationResult>) =>
  (value: string): ValidationResult => {
    const results = validators.map(validator => validator(value))
    const allErrors = results.flatMap(result => result.errors)

    return {
      isValid: allErrors.length === 0,
      errors: allErrors,
    }
  }

const validateUserEmail = composeValidators(validateRequired, validateEmail, validateMinLength(5))
```

### Higher-Order Functions

```typescript
// ✅ Higher-order functions for reusability
const withLogging =
  <T extends any[], R>(fn: (...args: T) => R, logMessage: string) =>
  (...args: T): R => {
    console.log(`${logMessage}:`, args)
    const result = fn(...args)
    console.log(`${logMessage} result:`, result)
    return result
  }

const withRetry =
  <T extends any[], R>(fn: (...args: T) => Promise<R>, maxRetries: number = 3) =>
  async (...args: T): Promise<R> => {
    let attempts = 0

    while (attempts < maxRetries) {
      try {
        return await fn(...args)
      } catch (error) {
        attempts++
        if (attempts >= maxRetries) {
          throw error
        }

        // Exponential backoff
        await new Promise(resolve => setTimeout(resolve, Math.pow(2, attempts) * 1000))
      }
    }

    throw new Error('Max retries exceeded')
  }

const withCache = <T extends any[], R>(
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

const cachedCalculation = withCache(calculateExpensiveValue)
const loggedCalculation = withLogging(calculateExpensiveValue, 'Calculation')

// ✅ Function factory pattern
const createValidator =
  <T>(predicate: (value: T) => boolean, errorMessage: string) =>
  (value: T): ValidationResult => ({
    isValid: predicate(value),
    errors: predicate(value) ? [] : [errorMessage],
  })

const isPositiveNumber = createValidator((n: number) => n > 0, 'Number must be positive')

const isNonEmptyString = createValidator(
  (s: string) => s.trim().length > 0,
  'String cannot be empty',
)

const isValidEmail = createValidator(
  (email: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email),
  'Invalid email format',
)
```

## 🔄 Functional Patterns in Practice

### Error Handling with Result Pattern

```typescript
// ✅ Result type for functional error handling
type Result<T, E = Error> =
  | { readonly success: true; readonly data: T }
  | { readonly success: false; readonly error: E }

// ✅ Functional error handling utilities
const ok = <T>(data: T): Result<T> => ({ success: true, data })
const err = <E>(error: E): Result<never, E> => ({ success: false, error })

const map = <T, U, E>(result: Result<T, E>, fn: (data: T) => U): Result<U, E> =>
  result.success ? ok(fn(result.data)) : result

const flatMap = <T, U, E>(result: Result<T, E>, fn: (data: T) => Result<U, E>): Result<U, E> =>
  result.success ? fn(result.data) : result

const match = <T, U, E>(
  result: Result<T, E>,
  handlers: {
    success: (data: T) => U
    error: (error: E) => U
  },
): U => (result.success ? handlers.success(result.data) : handlers.error(result.error))

// ✅ Usage in service functions
const parseJson = <T>(jsonString: string): Result<T> => {
  try {
    const data = JSON.parse(jsonString)
    return ok(data)
  } catch (error) {
    return err(error as Error)
  }
}

const validateUser = (data: unknown): Result<User> => {
  if (typeof data !== 'object' || data === null) {
    return err(new Error('Invalid user data'))
  }

  const user = data as Record<string, unknown>

  if (typeof user.name !== 'string' || user.name.length === 0) {
    return err(new Error('Invalid user name'))
  }

  if (typeof user.email !== 'string' || !user.email.includes('@')) {
    return err(new Error('Invalid user email'))
  }

  return ok({
    id: user.id as string,
    name: user.name,
    email: user.email,
    age: (user.age as number) || 0,
    createdAt: new Date(),
    updatedAt: new Date(),
  })
}

// ✅ Function composition with Result
const processUserData = (jsonString: string): Result<User> =>
  flatMap(parseJson<unknown>(jsonString), validateUser)

// ✅ Usage
const userResult = processUserData('{"name":"John","email":"john@example.com"}')

match(userResult, {
  success: user => console.log('User created:', user),
  error: error => console.error('Error:', error.message),
})
```

### Functional State Management

```typescript
// ✅ Functional state management with reducers
type State = {
  readonly users: readonly User[]
  readonly loading: boolean
  readonly error: string | null
}

type Action =
  | { type: 'LOAD_USERS_START' }
  | { type: 'LOAD_USERS_SUCCESS'; payload: readonly User[] }
  | { type: 'LOAD_USERS_ERROR'; payload: string }
  | { type: 'ADD_USER'; payload: User }
  | { type: 'UPDATE_USER'; payload: { id: string; updates: Partial<User> } }
  | { type: 'REMOVE_USER'; payload: string }

// ✅ Pure reducer function
const userReducer = (state: State, action: Action): State => {
  switch (action.type) {
    case 'LOAD_USERS_START':
      return {
        ...state,
        loading: true,
        error: null,
      }

    case 'LOAD_USERS_SUCCESS':
      return {
        ...state,
        users: action.payload,
        loading: false,
        error: null,
      }

    case 'LOAD_USERS_ERROR':
      return {
        ...state,
        loading: false,
        error: action.payload,
      }

    case 'ADD_USER':
      return {
        ...state,
        users: [...state.users, action.payload],
      }

    case 'UPDATE_USER':
      return {
        ...state,
        users: state.users.map(user =>
          user.id === action.payload.id ? { ...user, ...action.payload.updates } : user,
        ),
      }

    case 'REMOVE_USER':
      return {
        ...state,
        users: state.users.filter(user => user.id !== action.payload),
      }

    default:
      return state
  }
}

// ✅ Action creators
const loadUsersStart = (): Action => ({ type: 'LOAD_USERS_START' })
const loadUsersSuccess = (users: readonly User[]): Action => ({
  type: 'LOAD_USERS_SUCCESS',
  payload: users,
})
const loadUsersError = (error: string): Action => ({
  type: 'LOAD_USERS_ERROR',
  payload: error,
})
const addUser = (user: User): Action => ({ type: 'ADD_USER', payload: user })
const updateUser = (id: string, updates: Partial<User>): Action => ({
  type: 'UPDATE_USER',
  payload: { id, updates },
})
const removeUser = (id: string): Action => ({ type: 'REMOVE_USER', payload: id })
```

### Functional React Patterns

```typescript
// ✅ Functional component patterns
type UserListProps = {
  readonly users: readonly User[]
  readonly onUserSelect: (user: User) => void
  readonly onUserUpdate: (id: string, updates: Partial<User>) => void
}

const UserList = ({ users, onUserSelect, onUserUpdate }: UserListProps) => {
  // ✅ Pure derived state
  const sortedUsers = useMemo(
    () => [...users].sort((a, b) => a.name.localeCompare(b.name)),
    [users],
  )

  const activeUsers = useMemo(
    () => sortedUsers.filter(user => user.status === 'active'),
    [sortedUsers],
  )

  // ✅ Functional event handlers
  const handleUserClick = useCallback(
    (user: User) => () => {
      onUserSelect(user)
    },
    [onUserSelect],
  )

  const handleUserToggleActive = useCallback(
    (user: User) => () => {
      onUserUpdate(user.id, {
        status: user.status === 'active' ? 'inactive' : 'active',
      })
    },
    [onUserUpdate],
  )

  return (
    <div className='user-list'>
      {activeUsers.map(user => (
        <UserCard
          key={user.id}
          user={user}
          onClick={handleUserClick(user)}
          onToggleActive={handleUserToggleActive(user)}
        />
      ))}
    </div>
  )
}

// ✅ Higher-order component for functional composition
const withLoadingState =
  <P extends object>(Component: React.ComponentType<P>) =>
  (props: P & { loading: boolean }) => {
    if (props.loading) {
      return <LoadingSpinner />
    }

    return <Component {...props} />
  }

const withErrorBoundary =
  <P extends object>(Component: React.ComponentType<P>) =>
  (props: P) =>
    (
      <ErrorBoundary>
        <Component {...props} />
      </ErrorBoundary>
    )

// ✅ Composed component
const EnhancedUserList = pipe(withLoadingState, withErrorBoundary)(UserList)
```

## 🔗 Related Concepts

- **[SOLID Principles](solid-principles.md)** - OOP principles that complement functional patterns
- **[Clear Readable Code](clear-readable-code.md)** - Code clarity through functional patterns
- **[State Management](.pair/knowledge/guidelines/code-design/framework-patterns/state-management.md)** - Functional state management patterns
- **[React/Next.js Patterns](.pair/knowledge/guidelines/code-design/framework-patterns/react-nextjs-patterns.md)** - Functional React patterns

## 🎯 Implementation Guidelines

1. **Favor Immutability**: Use readonly types and immutable update patterns
2. **Write Pure Functions**: Avoid side effects, make functions deterministic
3. **Compose Functions**: Build complex behavior from simple, composable functions
4. **Handle Errors Functionally**: Use Result types instead of exceptions
5. **Use Higher-Order Functions**: Create reusable function factories and decorators
6. **Prefer Function Composition**: Use pipe/compose for readable transformations

## 📏 Benefits

- **Predictability**: Pure functions are easier to reason about and test
- **Reusability**: Composed functions can be reused in different contexts
- **Maintainability**: Immutable data prevents unexpected side effects
- **Testability**: Pure functions are easier to unit test
- **Performance**: Immutable data enables optimizations like memoization

---

_Functional programming principles create more predictable, testable, and maintainable TypeScript applications._

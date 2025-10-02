# 📘 TypeScript Standards

**Focus**: Type safety, configuration, and TypeScript best practices

TypeScript configuration and coding standards ensuring type safety, maintainability, and optimal developer experience across all applications.

## ⚙️ TypeScript Configuration

### Strict Configuration

```json
{
  "compilerOptions": {
    // Language and Target
    "target": "ES2022",
    "lib": ["ES2022", "DOM", "DOM.Iterable"],
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "allowJs": false,
    "checkJs": false,

    // Strict Type Checking
    "strict": true,
    "noImplicitAny": true,
    "strictNullChecks": true,
    "strictFunctionTypes": true,
    "strictBindCallApply": true,
    "strictPropertyInitialization": true,
    "noImplicitReturns": true,
    "noImplicitThis": true,
    "alwaysStrict": true,

    // Additional Checks
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "exactOptionalPropertyTypes": true,
    "noImplicitOverride": true,
    "noPropertyAccessFromIndexSignature": true,
    "noUncheckedIndexedAccess": true,

    // Module Resolution
    "esModuleInterop": true,
    "allowSyntheticDefaultImports": true,
    "forceConsistentCasingInFileNames": true,
    "resolveJsonModule": true,
    "isolatedModules": true,

    // Emit
    "declaration": true,
    "declarationMap": true,
    "sourceMap": true,
    "removeComments": false,
    "importHelpers": true,
    "downlevelIteration": true,

    // Skip Libraries
    "skipLibCheck": true,

    // Path Mapping
    "baseUrl": ".",
    "paths": {
      "@/*": ["./src/*"],
      "@/components/*": ["./src/components/*"],
      "@/lib/*": ["./src/lib/*"],
      "@/utils/*": ["./src/utils/*"],
      "@/types/*": ["./src/types/*"],
      "@/hooks/*": ["./src/hooks/*"],
      "@/services/*": ["./src/services/*"]
    }
  },
  "include": ["src/**/*", "test/**/*"],
  "exclude": ["node_modules", "dist", ".next"]
}
```

### Project-Specific Configurations

```json
// Frontend (Next.js) - tsconfig.json
{
  "extends": "./tsconfig.base.json",
  "compilerOptions": {
    "jsx": "preserve",
    "incremental": true,
    "plugins": [{ "name": "next" }],
    "noEmit": true
  },
  "include": ["next-env.d.ts", "**/*.ts", "**/*.tsx", ".next/types/**/*.ts"],
  "exclude": ["node_modules"]
}

// Backend (Node.js) - tsconfig.json
{
  "extends": "./tsconfig.base.json",
  "compilerOptions": {
    "module": "CommonJS",
    "outDir": "./dist",
    "rootDir": "./src",
    "noEmit": false,
    "experimentalDecorators": true,
    "emitDecoratorMetadata": true
  },
  "include": ["src/**/*"],
  "exclude": ["node_modules", "dist", "**/*.test.ts"]
}

// Shared Package - tsconfig.json
{
  "extends": "./tsconfig.base.json",
  "compilerOptions": {
    "outDir": "./dist",
    "rootDir": "./src",
    "composite": true,
    "declaration": true,
    "declarationMap": true
  },
  "include": ["src/**/*"],
  "exclude": ["node_modules", "dist", "**/*.test.ts"]
}
```

## 🏗️ Type Design Patterns

### Branded Types

```typescript
// ✅ Create type-safe IDs and values
type Brand<T, TBrand> = T & { readonly __brand: TBrand }

type UserId = Brand<string, 'UserId'>
type Email = Brand<string, 'Email'>
type Timestamp = Brand<number, 'Timestamp'>

// ✅ Factory functions with validation
const createUserId = (value: string): UserId => {
  if (!value.startsWith('user_')) {
    throw new Error('Invalid user ID format')
  }
  return value as UserId
}

const createEmail = (value: string): Email => {
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) {
    throw new Error('Invalid email format')
  }
  return value as Email
}

const createTimestamp = (): Timestamp => {
  return Date.now() as Timestamp
}

// ✅ Usage
const userId = createUserId('user_123')
const userEmail = createEmail('user@example.com')
const createdAt = createTimestamp()
```

### Utility Types for Domain Modeling

```typescript
// ✅ Result type for error handling
type Result<T, E = Error> =
  | { readonly success: true; readonly data: T }
  | { readonly success: false; readonly error: E }

// ✅ Optional fields helper
type WithOptional<T, K extends keyof T> = Omit<T, K> & Partial<Pick<T, K>>

// ✅ Required fields helper
type WithRequired<T, K extends keyof T> = T & Required<Pick<T, K>>

// ✅ Deep readonly
type DeepReadonly<T> = {
  readonly [P in keyof T]: T[P] extends (infer U)[]
    ? DeepReadonlyArray<U>
    : T[P] extends object
    ? DeepReadonly<T[P]>
    : T[P]
}

interface DeepReadonlyArray<T> extends ReadonlyArray<DeepReadonly<T>> {}

// ✅ Non-empty array
type NonEmptyArray<T> = [T, ...T[]]

// ✅ Usage examples
type CreateUserData = {
  readonly name: string
  readonly email: Email
  readonly age?: number
}

type UpdateUserData = WithOptional<CreateUserData, 'name' | 'email'>
type UserWithId = WithRequired<CreateUserData, 'age'> & { readonly id: UserId }
```

### Functional Type Patterns

```typescript
// ✅ Function composition types
type Func<A, B> = (a: A) => B
type AsyncFunc<A, B> = (a: A) => Promise<B>

type Compose<A, B, C> = (f: Func<B, C>, g: Func<A, B>) => Func<A, C>

type Pipe<A, B, C> = (g: Func<A, B>, f: Func<B, C>) => Func<A, C>

// ✅ Predicate types
type Predicate<T> = (value: T) => boolean
type AsyncPredicate<T> = (value: T) => Promise<boolean>

// ✅ Transformer types
type Transformer<T, U> = (input: T) => U
type AsyncTransformer<T, U> = (input: T) => Promise<U>

// ✅ Validator types
type ValidationResult<T> = Result<T, string[]>
type Validator<T> = (input: unknown) => ValidationResult<T>

// ✅ Usage in domain logic
const isValidAge: Predicate<number> = age => age >= 0 && age <= 150
const formatUserName: Transformer<string, string> = name => name.trim().toLowerCase()

const validateUser: Validator<CreateUserData> = input => {
  const errors: string[] = []

  if (typeof input !== 'object' || input === null) {
    return { success: false, error: ['Input must be an object'] }
  }

  const data = input as Record<string, unknown>

  if (typeof data.name !== 'string' || data.name.trim().length === 0) {
    errors.push('Name is required and must be a non-empty string')
  }

  if (typeof data.email !== 'string') {
    errors.push('Email is required and must be a string')
  }

  if (errors.length > 0) {
    return { success: false, error: errors }
  }

  return {
    success: true,
    data: {
      name: data.name as string,
      email: data.email as Email,
      age: typeof data.age === 'number' ? data.age : undefined,
    },
  }
}
```

## 🔒 Strict Type Safety

### Discriminated Unions

```typescript
// ✅ API Response types
type ApiResponse<T> =
  | { readonly status: 'loading' }
  | { readonly status: 'success'; readonly data: T }
  | { readonly status: 'error'; readonly error: string }

// ✅ Form state management
type FormState<T> =
  | { readonly state: 'idle'; readonly data?: undefined }
  | { readonly state: 'submitting'; readonly data: T }
  | { readonly state: 'success'; readonly data: T; readonly result: string }
  | { readonly state: 'error'; readonly data: T; readonly error: string }

// ✅ Navigation states
type NavigationState =
  | { readonly type: 'home' }
  | { readonly type: 'user'; readonly userId: UserId }
  | { readonly type: 'search'; readonly query: string; readonly filters: SearchFilters }

// ✅ Pattern matching helper
const matchApiResponse = <T, R>(
  response: ApiResponse<T>,
  handlers: {
    loading: () => R
    success: (data: T) => R
    error: (error: string) => R
  },
): R => {
  switch (response.status) {
    case 'loading':
      return handlers.loading()
    case 'success':
      return handlers.success(response.data)
    case 'error':
      return handlers.error(response.error)
  }
}
```

### Template Literal Types

```typescript
// ✅ Route type safety
type ApiRoute = '/api/users' | '/api/users/:id' | '/api/auth/login' | '/api/auth/logout'

type HttpMethod = 'GET' | 'POST' | 'PUT' | 'DELETE'

type ApiEndpoint<TRoute extends string, TMethod extends HttpMethod> = `${TMethod} ${TRoute}`

// ✅ CSS class generation
type Color = 'red' | 'blue' | 'green'
type Size = 'sm' | 'md' | 'lg'
type Variant = 'solid' | 'outline'

type ButtonClass = `btn-${Color}-${Size}-${Variant}`

// ✅ Event name generation
type EventType = 'click' | 'hover' | 'focus'
type ComponentName = 'button' | 'input' | 'modal'

type ComponentEvent = `${ComponentName}:${EventType}`

// ✅ Usage examples
const handleUserEndpoint = (endpoint: ApiEndpoint<'/api/users/:id', 'GET'>) => {
  // Implementation
}

const buttonClassname: ButtonClass = 'btn-red-md-solid'
const componentEvent: ComponentEvent = 'button:click'
```

### Conditional Types for API Design

```typescript
// ✅ Conditional response types
type ApiMethod = 'GET' | 'POST' | 'PUT' | 'DELETE'

type ApiResult<TMethod extends ApiMethod, TData> = TMethod extends 'GET'
  ? { readonly data: TData }
  : TMethod extends 'POST'
  ? { readonly data: TData; readonly created: true }
  : TMethod extends 'PUT'
  ? { readonly data: TData; readonly updated: true }
  : TMethod extends 'DELETE'
  ? { readonly deleted: true }
  : never

// ✅ Conditional input requirements
type CreateInput<T> = Omit<T, 'id' | 'createdAt' | 'updatedAt'>
type UpdateInput<T> = Partial<CreateInput<T>>

type UserInput<TOperation extends 'create' | 'update'> = TOperation extends 'create'
  ? CreateInput<User>
  : UpdateInput<User>

// ✅ Usage
type CreateUserInput = UserInput<'create'> // All required except id/timestamps
type UpdateUserInput = UserInput<'update'> // All optional except id
```

## 🛡️ Runtime Type Safety

### Zod Integration

```typescript
import { z } from 'zod'

// ✅ Zod schemas for runtime validation
const UserIdSchema = z.string().regex(/^user_/, 'Invalid user ID format')
const EmailSchema = z.string().email('Invalid email format')

const CreateUserSchema = z.object({
  name: z.string().min(1, 'Name is required').max(100, 'Name too long'),
  email: EmailSchema,
  age: z.number().int().min(0).max(150).optional(),
})

const UpdateUserSchema = CreateUserSchema.partial()

// ✅ Type inference from schemas
type CreateUserData = z.infer<typeof CreateUserSchema>
type UpdateUserData = z.infer<typeof UpdateUserSchema>
type UserId = z.infer<typeof UserIdSchema>
type Email = z.infer<typeof EmailSchema>

// ✅ API route validation
const validateCreateUser = (input: unknown): Result<CreateUserData> => {
  const result = CreateUserSchema.safeParse(input)
  return result.success
    ? { success: true, data: result.data }
    : { success: false, error: new Error(result.error.message) }
}

// ✅ Transform and validate
const UserResponseSchema = CreateUserSchema.extend({
  id: UserIdSchema,
  createdAt: z.date(),
  updatedAt: z.date(),
})

type User = z.infer<typeof UserResponseSchema>
```

### Type Guards

```typescript
// ✅ Custom type guards
const isUserId = (value: unknown): value is UserId => {
  return typeof value === 'string' && value.startsWith('user_')
}

const isEmail = (value: unknown): value is Email => {
  return typeof value === 'string' && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)
}

const isUser = (value: unknown): value is User => {
  return (
    typeof value === 'object' &&
    value !== null &&
    'id' in value &&
    'name' in value &&
    'email' in value &&
    isUserId((value as any).id) &&
    typeof (value as any).name === 'string' &&
    isEmail((value as any).email)
  )
}

// ✅ Array type guards
const isUserArray = (value: unknown): value is User[] => {
  return Array.isArray(value) && value.every(isUser)
}

// ✅ Result type guards
const isSuccessResult = <T>(result: Result<T>): result is { success: true; data: T } => {
  return result.success
}

const isErrorResult = <T>(result: Result<T>): result is { success: false; error: Error } => {
  return !result.success
}
```

## 📝 Documentation Standards

### JSDoc with TypeScript

````typescript
/**
 * Creates a new user with validated input data.
 *
 * @param userData - The user data to create a user with
 * @returns A promise that resolves to a Result containing either the created user or an error
 *
 * @example
 * ```typescript
 * const result = await createUser({
 *   name: 'John Doe',
 *   email: 'john@example.com',
 *   age: 30
 * });
 *
 * if (result.success) {
 *   console.log('User created:', result.data.id);
 * } else {
 *   console.error('Failed to create user:', result.error.message);
 * }
 * ```
 */
const createUser = async (userData: CreateUserData): Promise<Result<User>> => {
  // Implementation
}

/**
 * User service for managing user-related operations.
 *
 * @template TUser - The user type
 */
interface UserService<TUser = User> {
  /**
   * Creates a new user.
   * @param data - User creation data
   * @throws {ValidationError} When user data is invalid
   * @throws {DuplicateEmailError} When email already exists
   */
  readonly create: (data: CreateUserData) => Promise<Result<TUser>>

  /**
   * Retrieves a user by ID.
   * @param id - The user ID
   * @returns Promise resolving to user result or error if not found
   */
  readonly getById: (id: UserId) => Promise<Result<TUser>>
}
````

### Type Documentation Comments

```typescript
/**
 * Represents a user in the system.
 *
 * @interface User
 * @property {UserId} id - Unique identifier for the user
 * @property {string} name - User's display name (1-100 characters)
 * @property {Email} email - User's email address (validated)
 * @property {number} [age] - User's age (0-150, optional)
 * @property {Timestamp} createdAt - When the user was created
 * @property {Timestamp} updatedAt - When the user was last updated
 */
type User = {
  readonly id: UserId
  readonly name: string
  readonly email: Email
  readonly age?: number
  readonly createdAt: Timestamp
  readonly updatedAt: Timestamp
}

/**
 * Configuration options for user service.
 *
 * @interface UserServiceConfig
 * @property {boolean} [enableCaching=true] - Whether to enable user caching
 * @property {number} [cacheTimeout=300] - Cache timeout in seconds
 * @property {boolean} [validateEmail=true] - Whether to validate email format
 */
type UserServiceConfig = {
  readonly enableCaching?: boolean
  readonly cacheTimeout?: number
  readonly validateEmail?: boolean
}
```

## 🔗 Related Standards

- **[Frontend Stack](frontend-stack.md)** - React/Next.js TypeScript integration
- **[Backend Stack](backend-stack.md)** - Node.js/Fastify TypeScript setup
- **Code Quality Tools** - TypeScript linting configuration
- **[API Standards](.pair/knowledge/guidelines/technical-standards/integration-standards/api-standards.md)** - API type definitions

## 🎯 TypeScript Checklist

- [ ] **Strict configuration enabled** - All strict mode options activated
- [ ] **Path mapping configured** - Absolute imports set up
- [ ] **Branded types used** - Type-safe IDs and domain values
- [ ] **Result pattern implemented** - Functional error handling
- [ ] **Discriminated unions** - Type-safe state management
- [ ] **Runtime validation** - Zod schemas for API boundaries
- [ ] **Type guards implemented** - Runtime type checking
- [ ] **JSDoc documentation** - Comprehensive type documentation
- [ ] **Template literal types** - Type-safe string compositions
- [ ] **Conditional types** - Advanced type relationships

---

_These TypeScript standards ensure maximum type safety, excellent developer experience, and maintainable code across all applications._

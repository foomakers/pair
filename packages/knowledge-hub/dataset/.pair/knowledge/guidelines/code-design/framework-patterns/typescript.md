# TypeScript

## Overview

TypeScript enhances JavaScript with static type checking, enabling better code quality, developer experience, and maintainability. This guide covers best practices, advanced patterns, and effective TypeScript usage in modern applications.

## Configuration and Setup

### 1. Strict TypeScript Configuration

````json
# TypeScript

## Overview

TypeScript enhances JavaScript with static type checking, enabling better code quality, developer experience, and maintainability. This guide covers best practices, advanced patterns, and effective TypeScript usage in modern applications.

## Configuration Philosophy

### Strict Mode Benefits

TypeScript's strict mode catches errors early and enforces better coding practices. While initially challenging, strict mode prevents entire categories of runtime errors.

**Null Safety**: Eliminates undefined reference errors, one of the most common JavaScript runtime issues
**Type Completeness**: Ensures all code paths are properly typed, improving reliability
**Intent Clarity**: Makes developer intentions explicit through type annotations

### Progressive Adoption Strategy

For existing JavaScript projects, adopt TypeScript incrementally:

**Phase 1**: Enable basic TypeScript with loose settings to establish tooling
**Phase 2**: Gradually tighten compiler options as code is refactored
**Phase 3**: Full strict mode with comprehensive type checking

This approach minimizes disruption while progressively improving code quality.

## Type System Strategies

### Domain-Driven Type Organization

Organize types around business domains rather than technical layers. This approach scales better and makes the codebase more intuitive.

```typescript
// types/user.types.ts - Domain-specific types
export interface User {
  readonly id: string;
  readonly email: string;
  readonly firstName: string;
  readonly lastName: string;
  readonly preferences: UserPreferences;
  readonly roles: readonly UserRole[];
}

export interface CreateUserRequest {
  readonly email: string;
  readonly firstName: string;
  readonly lastName: string;
  readonly password: string;
}

export type UserRole = 'admin' | 'user' | 'guest';
````

**Immutability by Default**: Use `readonly` modifiers to prevent accidental mutations
**Request/Response Separation**: Separate types for API contracts and internal models
**Utility Types**: Create derived types using TypeScript's utility types for consistency

### Advanced Type Patterns

**Branded Types**: Create distinct types from primitives to prevent mixing incompatible values:

```typescript
type UserId = Brand<string, 'UserId'>
type Email = Brand<string, 'Email'>

function createEmail(email: string): Email {
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new Error('Invalid email format')
  }
  return email as Email
}
```

**Template Literal Types**: Use for type-safe string patterns:

```typescript
type EventType = 'user' | 'order' | 'payment'
type Action = 'created' | 'updated' | 'deleted'
type EventName = `${EventType}.${Action}`
```

**Conditional Types**: Create types that adapt based on input types for flexible APIs.

## Null Safety Patterns

### Explicit Null Handling

TypeScript's strict null checks force explicit handling of potentially undefined values:

```typescript
// ✅ Good: Explicit null handling
function getUserDisplayName(user: User | null): string {
  if (user === null) {
    return 'Guest User'
  }
  return `${user.firstName} ${user.lastName}`
}

// ✅ Good: Optional chaining
function getEmailDomain(user?: User): string {
  return user?.email?.split('@')[1] ?? 'unknown'
}
```

**Type Guards**: Create reusable functions to check and narrow types
**Optional Chaining**: Use `?.` operator for safe property access
**Nullish Coalescing**: Use `??` for default values, avoiding falsy value pitfalls

### Array Safety

With `noUncheckedIndexedAccess`, array access returns `T | undefined`, forcing safer array handling:

```typescript
function getFirstUser(users: User[]): User | undefined {
  const firstUser = users[0] // Type is User | undefined

  if (firstUser === undefined) {
    return undefined
  }

  return firstUser
}
```

## Generic Programming

### Constraint-Based Generics

Use constraints to make generic functions more specific and type-safe:

```typescript
interface HasId {
  readonly id: string
}

function updateEntity<T extends HasId>(entities: T[], id: string, updates: Partial<T>): T[] {
  return entities.map(entity => (entity.id === id ? { ...entity, ...updates } : entity))
}
```

**Interface Constraints**: Ensure generic types have required properties
**Keyof Constraints**: Create type-safe property access patterns
**Multiple Constraints**: Combine constraints for complex type requirements

### Utility Type Patterns

Leverage TypeScript's built-in utility types for common patterns:

```typescript
// Make specific fields optional
type Optional<T, K extends keyof T> = Omit<T, K> & Partial<Pick<T, K>>

// Make specific fields required
type Required<T, K extends keyof T> = T & Required<Pick<T, K>>

// Deep readonly for immutable structures
type DeepReadonly<T> = {
  readonly [P in keyof T]: T[P] extends object ? DeepReadonly<T[P]> : T[P]
}
```

## Migration Strategies

### Legacy Code Integration

When working with existing JavaScript libraries or legacy code:

**Type Declarations**: Create `.d.ts` files for untyped libraries
**Gradual Typing**: Use `any` initially, then progressively add specific types
**Adapter Patterns**: Create TypeScript-friendly wrappers around legacy APIs

```typescript
// Legacy adapter example
class LegacyUserAdapter {
  static toModernUser(legacyUser: any): User {
    return {
      id: legacyUser.id.toString(),
      email: legacyUser.email ?? '',
      firstName: legacyUser.name.split(' ')[0] ?? '',
      // ... proper type conversion
    }
  }
}
```

### Team Adoption

**Training**: Provide TypeScript training focused on practical patterns
**Code Reviews**: Use reviews to share TypeScript best practices
**Tooling**: Configure IDEs and CI/CD to support TypeScript workflow

## Testing with TypeScript

### Type-Safe Testing

Leverage TypeScript in tests for better reliability:

```typescript
function createMockUser(overrides: Partial<User> = {}): User {
  const baseUser: User = {
    id: '1',
    email: 'test@example.com',
    firstName: 'John',
    lastName: 'Doe',
    // ... complete user object
  }

  return { ...baseUser, ...overrides }
}
```

**Mock Factories**: Create type-safe mock data generators
**Type Testing**: Verify that type definitions work as expected
**Integration Types**: Ensure API contracts match between frontend and backend

## Performance Considerations

### Type-Only Imports

Use type-only imports to avoid runtime overhead:

```typescript
import type { User, UserRole } from '@/types/user'
import { createUser } from '@/services/userService'
```

**Bundle Size**: Type-only imports are removed during compilation
**Build Performance**: Faster compilation with explicit type imports
**Dependency Clarity**: Clear separation between runtime and type dependencies

### Efficient Type Definitions

Design types for optimal TypeScript performance:

**Interface Merging**: Use interfaces for extensibility
**Computed Types**: Avoid complex computed types in hot code paths
**Modular Types**: Split large type definitions into focused modules

## Best Practices Summary

### Development Workflow

- **Strict Configuration**: Use strict TypeScript settings from the start
- **Domain Types**: Organize types around business concepts
- **Explicit Typing**: Prefer explicit types over inference for public APIs

### Code Quality

- **Immutability**: Use readonly modifiers by default
- **Null Safety**: Handle undefined values explicitly
- **Type Guards**: Create reusable type checking functions

### Team Collaboration

- **Consistent Patterns**: Establish team conventions for common type patterns
- **Documentation**: Document complex types and their intended usage
- **Review Process**: Include type design in code review discussions

TypeScript's type system becomes more powerful when used thoughtfully to model your domain and prevent entire categories of errors, rather than just adding type annotations to existing JavaScript code.

````

### 2. Project References for Monorepos

```json
// Root tsconfig.json
{
  "files": [],
  "references": [
    { "path": "./packages/ui" },
    { "path": "./packages/types" },
    { "path": "./packages/utils" },
    { "path": "./apps/web" },
    { "path": "./apps/api" }
  ]
}

// packages/ui/tsconfig.json
{
  "extends": "../../tsconfig.json",
  "compilerOptions": {
    "composite": true,
    "outDir": "./dist",
    "rootDir": "./src"
  },
  "include": ["src/**/*"],
  "references": [
    { "path": "../types" },
    { "path": "../utils" }
  ]
}
````

## Type Definition Strategies

### 1. Domain-Driven Type Organization

```typescript
// types/user.types.ts
export interface User {
  readonly id: string
  readonly email: string
  readonly firstName: string
  readonly lastName: string
  readonly createdAt: Date
  readonly updatedAt: Date
  readonly preferences: UserPreferences
  readonly roles: readonly UserRole[]
}

export interface UserPreferences {
  readonly theme: 'light' | 'dark'
  readonly emailNotifications: boolean
  readonly language: SupportedLanguage
  readonly timezone: string
}

export type UserRole = 'admin' | 'user' | 'guest'
export type SupportedLanguage = 'en' | 'es' | 'fr' | 'de'

// Request/Response types
export interface CreateUserRequest {
  readonly email: string
  readonly firstName: string
  readonly lastName: string
  readonly password: string
  readonly preferences?: Partial<UserPreferences>
}

export interface UpdateUserRequest {
  readonly firstName?: string
  readonly lastName?: string
  readonly preferences?: Partial<UserPreferences>
}

export interface UserResponse extends Omit<User, 'createdAt' | 'updatedAt'> {
  readonly createdAt: string
  readonly updatedAt: string
}

// Utility types
export type UserWithoutSensitiveData = Omit<User, 'roles'>
export type UserEmail = Pick<User, 'email'>
export type CreateUserData = Omit<User, 'id' | 'createdAt' | 'updatedAt'>
```

### 2. API Contract Types

```typescript
// types/api.types.ts
export interface ApiResponse<T = any> {
  readonly data: T
  readonly success: boolean
  readonly message?: string
  readonly errors?: ValidationError[]
}

export interface PaginatedResponse<T> {
  readonly items: readonly T[]
  readonly pagination: PaginationInfo
}

export interface PaginationInfo {
  readonly page: number
  readonly limit: number
  readonly total: number
  readonly totalPages: number
  readonly hasNext: boolean
  readonly hasPrevious: boolean
}

export interface PaginationRequest {
  readonly page?: number
  readonly limit?: number
  readonly sortBy?: string
  readonly sortOrder?: 'asc' | 'desc'
}

export interface ValidationError {
  readonly field: string
  readonly message: string
  readonly code: string
  readonly value?: any
}

// Generic service interface
export interface CrudService<T, CreateRequest, UpdateRequest> {
  findById(id: string): Promise<ApiResponse<T>>
  findAll(pagination?: PaginationRequest): Promise<ApiResponse<PaginatedResponse<T>>>
  create(data: CreateRequest): Promise<ApiResponse<T>>
  update(id: string, data: UpdateRequest): Promise<ApiResponse<T>>
  delete(id: string): Promise<ApiResponse<void>>
}
```

### 3. Advanced Type Patterns

```typescript
// Branded types for type safety
type Brand<T, K> = T & { readonly __brand: K }

export type UserId = Brand<string, 'UserId'>
export type Email = Brand<string, 'Email'>
export type Password = Brand<string, 'Password'>

function createUserId(id: string): UserId {
  return id as UserId
}

function createEmail(email: string): Email {
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new Error('Invalid email format')
  }
  return email as Email
}

// Template literal types
type EventType = 'user' | 'order' | 'payment'
type Action = 'created' | 'updated' | 'deleted'
type EventName = `${EventType}.${Action}`

const validEvents: EventName[] = [
  'user.created',
  'user.updated',
  'order.created',
  'payment.deleted',
]

// Conditional types
type ApiEndpoint<T> = T extends User
  ? '/api/users'
  : T extends Order
  ? '/api/orders'
  : T extends Product
  ? '/api/products'
  : never

// Mapped types
type Optional<T, K extends keyof T> = Omit<T, K> & Partial<Pick<T, K>>
type Required<T, K extends keyof T> = T & Required<Pick<T, K>>

type CreateUserRequestOptional = Optional<CreateUserRequest, 'preferences'>
type UserWithRequiredEmail = Required<Partial<User>, 'email'>

// Recursive types
type DeepReadonly<T> = {
  readonly [P in keyof T]: T[P] extends object ? DeepReadonly<T[P]> : T[P]
}

type DeepPartial<T> = {
  [P in keyof T]?: T[P] extends object ? DeepPartial<T[P]> : T[P]
}
```

## Strict Mode Patterns

### 1. Null Safety

```typescript
// ✅ Good: Explicit null handling
function getUserDisplayName(user: User | null): string {
  if (user === null) {
    return 'Guest User'
  }

  return `${user.firstName} ${user.lastName}`
}

// ✅ Good: Optional chaining with nullish coalescing
function getEmailDomain(user?: User): string {
  return user?.email?.split('@')[1] ?? 'unknown'
}

// ✅ Good: Type guards
function isValidUser(user: User | null | undefined): user is User {
  return user !== null && user !== undefined && user.email.length > 0
}

function processUser(user: User | null | undefined): void {
  if (isValidUser(user)) {
    // TypeScript knows user is User here
    console.log(user.email) // No null check needed
  }
}

// ❌ Bad: Using ! operator without certainty
function badExample(user: User | null): string {
  return user!.firstName // Runtime error if user is null
}
```

### 2. Array Safety

```typescript
// With noUncheckedIndexedAccess: true
function getFirstUser(users: User[]): User | undefined {
  const firstUser = users[0] // Type is User | undefined

  if (firstUser === undefined) {
    return undefined
  }

  return firstUser
}

// Safe array access patterns
function processUsers(users: readonly User[]): string[] {
  return users.filter((user): user is User => user !== undefined).map(user => user.email)
}

// Type-safe array utilities
function safeArrayAccess<T>(array: readonly T[], index: number): T | undefined {
  return index >= 0 && index < array.length ? array[index] : undefined
}
```

### 3. Function Overloads

```typescript
// Proper function overloads
function createUser(data: CreateUserRequest): Promise<User>
function createUser(data: CreateUserRequest, options: { validate: false }): Promise<User>
function createUser(
  data: CreateUserRequest,
  options: { validate: true },
): Promise<ValidationResult<User>>

function createUser(
  data: CreateUserRequest,
  options?: { validate?: boolean },
): Promise<User | ValidationResult<User>> {
  if (options?.validate === true) {
    const validation = validateUserData(data)
    if (!validation.isValid) {
      return Promise.resolve(validation)
    }
  }

  return userRepository.create(data)
}

// Usage with correct return types
const user1 = await createUser(userData) // Type: User
const user2 = await createUser(userData, { validate: false }) // Type: User
const result = await createUser(userData, { validate: true }) // Type: ValidationResult<User>
```

## Generic Programming

### 1. Generic Constraints

```typescript
// Constraint to objects with id property
interface HasId {
  readonly id: string
}

function updateEntity<T extends HasId>(entities: T[], id: string, updates: Partial<T>): T[] {
  return entities.map(entity => (entity.id === id ? { ...entity, ...updates } : entity))
}

// Keyof constraints
function getProperty<T, K extends keyof T>(obj: T, key: K): T[K] {
  return obj[key]
}

// Multiple constraints
interface Timestamped {
  readonly createdAt: Date
  readonly updatedAt: Date
}

function sortByDate<T extends Timestamped>(
  items: T[],
  field: keyof Timestamped = 'createdAt',
): T[] {
  return [...items].sort((a, b) => a[field].getTime() - b[field].getTime())
}
```

### 2. Generic Utility Functions

```typescript
// Result type for error handling
type Result<T, E = Error> = { success: true; data: T } | { success: false; error: E }

async function safeAsync<T>(operation: () => Promise<T>): Promise<Result<T>> {
  try {
    const data = await operation()
    return { success: true, data }
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error : new Error(String(error)),
    }
  }
}

// Option type
abstract class Option<T> {
  abstract isSome(): boolean
  abstract isNone(): boolean
  abstract map<U>(fn: (value: T) => U): Option<U>
  abstract flatMap<U>(fn: (value: T) => Option<U>): Option<U>
  abstract getOrElse(defaultValue: T): T
}

class Some<T> extends Option<T> {
  constructor(private readonly value: T) {
    super()
  }

  isSome(): boolean {
    return true
  }
  isNone(): boolean {
    return false
  }

  map<U>(fn: (value: T) => U): Option<U> {
    return new Some(fn(this.value))
  }

  flatMap<U>(fn: (value: T) => Option<U>): Option<U> {
    return fn(this.value)
  }

  getOrElse(_defaultValue: T): T {
    return this.value
  }
}

class None<T> extends Option<T> {
  isSome(): boolean {
    return false
  }
  isNone(): boolean {
    return true
  }

  map<U>(_fn: (value: T) => U): Option<U> {
    return new None<U>()
  }

  flatMap<U>(_fn: (value: T) => Option<U>): Option<U> {
    return new None<U>()
  }

  getOrElse(defaultValue: T): T {
    return defaultValue
  }
}

// Factory functions
const some = <T>(value: T): Option<T> => new Some(value)
const none = <T>(): Option<T> => new None<T>()
```

## Migration Strategies

### 1. Gradual TypeScript Adoption

```typescript
// Phase 1: Allow JS files, basic types
{
  "compilerOptions": {
    "allowJs": true,
    "checkJs": false,
    "strict": false,
    "noImplicitAny": false
  }
}

// Phase 2: Enable basic checking
{
  "compilerOptions": {
    "allowJs": true,
    "checkJs": true,
    "strict": false,
    "noImplicitAny": true
  }
}

// Phase 3: Strict mode
{
  "compilerOptions": {
    "allowJs": false,
    "strict": true,
    "noImplicitAny": true,
    "strictNullChecks": true
  }
}
```

### 2. Legacy Code Integration

```typescript
// Type declarations for legacy JS modules
// types/legacy.d.ts
declare module 'legacy-library' {
  export interface LegacyUser {
    id: number
    name: string
    email?: string
  }

  export function getLegacyUsers(): LegacyUser[]
  export function createLegacyUser(data: Partial<LegacyUser>): LegacyUser
}

// Adapters for legacy code
class LegacyUserAdapter {
  static toModernUser(legacyUser: LegacyUser): User {
    return {
      id: legacyUser.id.toString(),
      email: legacyUser.email ?? '',
      firstName: legacyUser.name.split(' ')[0] ?? '',
      lastName: legacyUser.name.split(' ').slice(1).join(' ') ?? '',
      createdAt: new Date(),
      updatedAt: new Date(),
      preferences: {
        theme: 'light',
        emailNotifications: true,
        language: 'en',
        timezone: 'UTC',
      },
      roles: ['user'],
    }
  }

  static toLegacyUser(user: User): LegacyUser {
    return {
      id: parseInt(user.id),
      name: `${user.firstName} ${user.lastName}`,
      email: user.email,
    }
  }
}
```

## Testing with TypeScript

### 1. Type-Safe Test Utilities

```typescript
// Test utilities with proper typing
interface MockUser extends Partial<User> {
  id: string
  email: string
}

function createMockUser(overrides: Partial<User> = {}): User {
  const baseUser: User = {
    id: '1',
    email: 'test@example.com',
    firstName: 'John',
    lastName: 'Doe',
    createdAt: new Date(),
    updatedAt: new Date(),
    preferences: {
      theme: 'light',
      emailNotifications: true,
      language: 'en',
      timezone: 'UTC',
    },
    roles: ['user'],
  }

  return { ...baseUser, ...overrides }
}

// Type-safe mocking
interface UserServiceMock {
  createUser: jest.MockedFunction<UserService['createUser']>
  getUserById: jest.MockedFunction<UserService['getUserById']>
  updateUser: jest.MockedFunction<UserService['updateUser']>
}

function createUserServiceMock(): UserServiceMock {
  return {
    createUser: jest.fn(),
    getUserById: jest.fn(),
    updateUser: jest.fn(),
  }
}

// Usage in tests
describe('UserController', () => {
  let userService: UserServiceMock
  let userController: UserController

  beforeEach(() => {
    userService = createUserServiceMock()
    userController = new UserController(userService as any)
  })

  it('should create user successfully', async () => {
    const mockUser = createMockUser({ email: 'new@example.com' })
    userService.createUser.mockResolvedValue({ success: true, data: mockUser })

    const result = await userController.createUser({
      email: 'new@example.com',
      firstName: 'Jane',
      lastName: 'Smith',
      password: 'password123',
      termsAccepted: true,
    })

    expect(result.success).toBe(true)
    expect(userService.createUser).toHaveBeenCalledWith(
      expect.objectContaining({ email: 'new@example.com' }),
    )
  })
})
```

### 2. Type Testing

```typescript
// Type-only tests
type IsEqual<T, U> = T extends U ? (U extends T ? true : false) : false
type Assert<T extends true> = T

// Test type definitions
type TestUserType = Assert<IsEqual<User['id'], string>>
type TestUserEmail = Assert<IsEqual<User['email'], string>>
type TestUserRoles = Assert<IsEqual<User['roles'], readonly UserRole[]>>

// Test utility types
type TestCreateUserRequest = Assert<
  IsEqual<
    CreateUserRequest,
    {
      readonly email: string
      readonly firstName: string
      readonly lastName: string
      readonly password: string
      readonly preferences?: Partial<UserPreferences>
    }
  >
>
```

## Performance Considerations

### 1. Type-Only Imports

```typescript
// ✅ Good: Type-only imports
import type { User, UserRole } from '@/types/user'
import type { ApiResponse } from '@/types/api'

// Regular import only when needed at runtime
import { createUser } from '@/services/userService'

// ✅ Good: Mixed imports
import { validateUser, type ValidationResult } from '@/lib/validation'
```

### 2. Efficient Type Definitions

```typescript
// ✅ Good: Interface merging for extensibility
interface BaseEntity {
  readonly id: string
  readonly createdAt: Date
  readonly updatedAt: Date
}

interface User extends BaseEntity {
  readonly email: string
  readonly firstName: string
  readonly lastName: string
}

// ✅ Good: Discriminated unions for performance
type ApiResult<T> = { success: true; data: T } | { success: false; error: string; code: number }

// ❌ Avoid: Complex computed types in hot paths
type ComplexType<T> = T extends User
  ? { userSpecificField: string } & T
  : T extends Order
  ? { orderSpecificField: number } & T
  : T // This can be slow with large union types
```

## Best Practices

1. **Use strict mode**: Enable all strict TypeScript options
2. **Prefer interfaces over types**: For object shapes, use interfaces
3. **Use readonly modifiers**: Make data immutable by default
4. **Explicit return types**: Define return types for public functions
5. **Avoid any**: Use unknown or proper types instead
6. **Use type guards**: Create type-safe runtime checks
7. **Leverage utility types**: Use built-in and custom utility types
8. **Type-only imports**: Import types separately from values
9. **Branded types**: Use branded types for domain-specific values
10. **Generic constraints**: Use constraints to make generics more specific

TypeScript provides powerful tools for building type-safe, maintainable applications when used effectively with proper patterns and configurations.

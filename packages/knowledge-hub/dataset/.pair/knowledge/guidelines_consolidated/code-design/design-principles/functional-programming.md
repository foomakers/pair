# Functional Programming

## Overview

Functional programming (FP) emphasizes immutability, pure functions, and declarative code. This guide covers practical FP principles and patterns in TypeScript, focusing on maintainable, predictable, and testable code.

## Core Principles

### 1. Immutability

Prefer immutable data structures and avoid mutating existing objects.

```typescript
// ❌ Mutating approach
interface User {
  id: string
  name: string
  email: string
  preferences: UserPreferences
}

function updateUserEmail(user: User, newEmail: string): void {
  user.email = newEmail // Mutates the original object
  user.preferences.emailNotifications = true // Side effect
}

// ✅ Immutable approach
function updateUserEmail(user: User, newEmail: string): User {
  return {
    ...user,
    email: newEmail,
    preferences: {
      ...user.preferences,
      emailNotifications: true,
    },
  }
}

// ✅ Using immutability helpers
import { produce } from 'immer'

function updateUserEmailImmer(user: User, newEmail: string): User {
  return produce(user, draft => {
    draft.email = newEmail
    draft.preferences.emailNotifications = true
  })
}
```

### 2. Pure Functions

Functions should be deterministic and free of side effects.

```typescript
// ❌ Impure function (side effects)
let taxRate = 0.1

function calculateTotal(price: number): number {
  const total = price + price * taxRate // Depends on external state
  console.log(`Calculated total: ${total}`) // Side effect
  return total
}

// ✅ Pure function
function calculateTotal(price: number, taxRate: number): number {
  return price + price * taxRate
}

// ✅ Pure function with explicit dependencies
interface TaxConfig {
  readonly rate: number
  readonly exemptions: string[]
}

function calculateTotalWithConfig(price: number, productType: string, config: TaxConfig): number {
  const isExempt = config.exemptions.includes(productType)
  return isExempt ? price : price + price * config.rate
}
```

### 3. Higher-Order Functions

Functions that take other functions as arguments or return functions.

```typescript
// Function composition
type Transformer<T, U> = (input: T) => U

function compose<A, B, C>(f: Transformer<B, C>, g: Transformer<A, B>): Transformer<A, C> {
  return (input: A) => f(g(input))
}

// Usage
const addTax = (price: number) => price * 1.1
const formatCurrency = (amount: number) => `$${amount.toFixed(2)}`

const formatPriceWithTax = compose(formatCurrency, addTax)
console.log(formatPriceWithTax(100)) // "$110.00"

// Currying
function multiply(a: number): (b: number) => number {
  return (b: number) => a * b
}

const double = multiply(2)
const triple = multiply(3)

console.log(double(5)) // 10
console.log(triple(5)) // 15

// Practical currying example
function createValidator<T>(
  predicate: (value: T) => boolean,
  errorMessage: string,
): (value: T) => ValidationResult {
  return (value: T) => ({
    isValid: predicate(value),
    error: predicate(value) ? undefined : errorMessage,
  })
}

const isRequired = createValidator(
  (value: string) => value.trim().length > 0,
  'This field is required',
)

const isEmail = createValidator(
  (value: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value),
  'Please enter a valid email address',
)
```

## Functional Data Transformations

### Array Operations

```typescript
interface Product {
  readonly id: string
  readonly name: string
  readonly price: number
  readonly category: string
  readonly inStock: boolean
}

const products: readonly Product[] = [
  { id: '1', name: 'Laptop', price: 1000, category: 'Electronics', inStock: true },
  { id: '2', name: 'Book', price: 20, category: 'Education', inStock: true },
  { id: '3', name: 'Phone', price: 800, category: 'Electronics', inStock: false },
]

// ✅ Functional transformations
const expensiveElectronics = products
  .filter(product => product.category === 'Electronics')
  .filter(product => product.price > 500)
  .filter(product => product.inStock)
  .map(product => ({
    ...product,
    formattedPrice: `$${product.price.toFixed(2)}`,
  }))

// ✅ Reduce for complex aggregations
interface CategorySummary {
  readonly totalValue: number
  readonly count: number
  readonly averagePrice: number
}

const categorySummary = products.reduce<Record<string, CategorySummary>>(
  (summary, product) => ({
    ...summary,
    [product.category]: {
      totalValue: (summary[product.category]?.totalValue || 0) + product.price,
      count: (summary[product.category]?.count || 0) + 1,
      averagePrice: 0, // Will be calculated below
    },
  }),
  {},
)

// Calculate average prices
const finalSummary = Object.entries(categorySummary).reduce(
  (result, [category, data]) => ({
    ...result,
    [category]: {
      ...data,
      averagePrice: data.totalValue / data.count,
    },
  }),
  {} as Record<string, CategorySummary>,
)
```

### Functional Utilities

```typescript
// Pipe function for left-to-right composition
function pipe<T>(...fns: Array<(arg: T) => T>): (value: T) => T {
  return (value: T) => fns.reduce((acc, fn) => fn(acc), value)
}

// Usage
const processOrder = pipe(
  (order: Order) => addTax(order),
  (order: Order) => applyDiscount(order),
  (order: Order) => calculateShipping(order),
  (order: Order) => formatForDisplay(order),
)

// Partial application
function createPredicate<T>(
  field: keyof T,
  operator: 'eq' | 'gt' | 'lt' | 'contains',
  value: any,
): (item: T) => boolean {
  return (item: T) => {
    const fieldValue = item[field]

    switch (operator) {
      case 'eq':
        return fieldValue === value
      case 'gt':
        return fieldValue > value
      case 'lt':
        return fieldValue < value
      case 'contains':
        return (
          typeof fieldValue === 'string' && fieldValue.toLowerCase().includes(value.toLowerCase())
        )
      default:
        return false
    }
  }
}

// Usage
const isExpensive = createPredicate<Product>('price', 'gt', 500)
const isElectronics = createPredicate<Product>('category', 'eq', 'Electronics')

const expensiveElectronics2 = products.filter(isExpensive).filter(isElectronics)
```

## Monadic Patterns

### Option/Maybe Pattern

```typescript
abstract class Option<T> {
  abstract isSome(): boolean
  abstract isNone(): boolean
  abstract map<U>(fn: (value: T) => U): Option<U>
  abstract flatMap<U>(fn: (value: T) => Option<U>): Option<U>
  abstract filter(predicate: (value: T) => boolean): Option<T>
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

  filter(predicate: (value: T) => boolean): Option<T> {
    return predicate(this.value) ? this : new None<T>()
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

  filter(_predicate: (value: T) => boolean): Option<T> {
    return this
  }

  getOrElse(defaultValue: T): T {
    return defaultValue
  }
}

// Factory functions
const some = <T>(value: T): Option<T> => new Some(value)
const none = <T>(): Option<T> => new None<T>()

// Usage
function findUserById(id: string): Option<User> {
  const user = users.find(u => u.id === id)
  return user ? some(user) : none<User>()
}

const userEmail = findUserById('123')
  .filter(user => user.isActive)
  .map(user => user.email)
  .getOrElse('No email found')
```

### Either Pattern (Error Handling)

```typescript
abstract class Either<L, R> {
  abstract isLeft(): boolean
  abstract isRight(): boolean
  abstract map<U>(fn: (value: R) => U): Either<L, U>
  abstract mapLeft<U>(fn: (value: L) => U): Either<U, R>
  abstract flatMap<U>(fn: (value: R) => Either<L, U>): Either<L, U>
  abstract fold<U>(leftFn: (left: L) => U, rightFn: (right: R) => U): U
}

class Left<L, R> extends Either<L, R> {
  constructor(private readonly value: L) {
    super()
  }

  isLeft(): boolean {
    return true
  }
  isRight(): boolean {
    return false
  }

  map<U>(_fn: (value: R) => U): Either<L, U> {
    return new Left<L, U>(this.value)
  }

  mapLeft<U>(fn: (value: L) => U): Either<U, R> {
    return new Left<U, R>(fn(this.value))
  }

  flatMap<U>(_fn: (value: R) => Either<L, U>): Either<L, U> {
    return new Left<L, U>(this.value)
  }

  fold<U>(leftFn: (left: L) => U, _rightFn: (right: R) => U): U {
    return leftFn(this.value)
  }
}

class Right<L, R> extends Either<L, R> {
  constructor(private readonly value: R) {
    super()
  }

  isLeft(): boolean {
    return false
  }
  isRight(): boolean {
    return true
  }

  map<U>(fn: (value: R) => U): Either<L, U> {
    return new Right<L, U>(fn(this.value))
  }

  mapLeft<U>(_fn: (value: L) => U): Either<U, R> {
    return new Right<U, R>(this.value)
  }

  flatMap<U>(fn: (value: R) => Either<L, U>): Either<L, U> {
    return fn(this.value)
  }

  fold<U>(_leftFn: (left: L) => U, rightFn: (right: R) => U): U {
    return rightFn(this.value)
  }
}

// Factory functions
const left = <L, R>(value: L): Either<L, R> => new Left(value)
const right = <L, R>(value: R): Either<L, R> => new Right(value)

// Usage
function parseJSON<T>(jsonString: string): Either<string, T> {
  try {
    const parsed = JSON.parse(jsonString)
    return right<string, T>(parsed)
  } catch (error) {
    return left<string, T>(`Invalid JSON: ${error.message}`)
  }
}

function validateUser(userData: any): Either<string, User> {
  if (!userData.email) {
    return left('Email is required')
  }
  if (!userData.name) {
    return left('Name is required')
  }
  return right(userData as User)
}

// Chaining operations
const result = parseJSON<any>('{"email":"test@example.com","name":"John"}')
  .flatMap(validateUser)
  .map(user => ({ ...user, id: generateId() }))
  .fold(
    error => ({ success: false, error }),
    user => ({ success: true, data: user }),
  )
```

## Functional State Management

### State Reducers

```typescript
interface AppState {
  readonly user: User | null
  readonly products: readonly Product[]
  readonly cart: readonly CartItem[]
  readonly loading: boolean
  readonly error: string | null
}

type AppAction =
  | { type: 'SET_USER'; payload: User }
  | { type: 'SET_PRODUCTS'; payload: readonly Product[] }
  | { type: 'ADD_TO_CART'; payload: Product }
  | { type: 'REMOVE_FROM_CART'; payload: string }
  | { type: 'SET_LOADING'; payload: boolean }
  | { type: 'SET_ERROR'; payload: string }
  | { type: 'CLEAR_ERROR' }

function appReducer(state: AppState, action: AppAction): AppState {
  switch (action.type) {
    case 'SET_USER':
      return { ...state, user: action.payload, error: null }

    case 'SET_PRODUCTS':
      return { ...state, products: action.payload, loading: false }

    case 'ADD_TO_CART':
      const existingItem = state.cart.find(item => item.productId === action.payload.id)
      if (existingItem) {
        return {
          ...state,
          cart: state.cart.map(item =>
            item.productId === action.payload.id ? { ...item, quantity: item.quantity + 1 } : item,
          ),
        }
      } else {
        return {
          ...state,
          cart: [...state.cart, { productId: action.payload.id, quantity: 1 }],
        }
      }

    case 'REMOVE_FROM_CART':
      return {
        ...state,
        cart: state.cart.filter(item => item.productId !== action.payload),
      }

    case 'SET_LOADING':
      return { ...state, loading: action.payload }

    case 'SET_ERROR':
      return { ...state, error: action.payload, loading: false }

    case 'CLEAR_ERROR':
      return { ...state, error: null }

    default:
      return state
  }
}
```

### Functional Event Handling

```typescript
// Event stream processing
type EventHandler<T> = (event: T) => void

class EventStream<T> {
  private handlers: EventHandler<T>[] = []

  subscribe(handler: EventHandler<T>): () => void {
    this.handlers.push(handler)
    return () => {
      this.handlers = this.handlers.filter(h => h !== handler)
    }
  }

  emit(event: T): void {
    this.handlers.forEach(handler => handler(event))
  }

  map<U>(mapper: (event: T) => U): EventStream<U> {
    const newStream = new EventStream<U>()
    this.subscribe(event => newStream.emit(mapper(event)))
    return newStream
  }

  filter(predicate: (event: T) => boolean): EventStream<T> {
    const newStream = new EventStream<T>()
    this.subscribe(event => {
      if (predicate(event)) {
        newStream.emit(event)
      }
    })
    return newStream
  }

  debounce(ms: number): EventStream<T> {
    const newStream = new EventStream<T>()
    let timeoutId: NodeJS.Timeout

    this.subscribe(event => {
      clearTimeout(timeoutId)
      timeoutId = setTimeout(() => newStream.emit(event), ms)
    })

    return newStream
  }
}

// Usage
const searchStream = new EventStream<string>()

searchStream
  .filter(query => query.length > 2)
  .debounce(300)
  .map(query => query.toLowerCase())
  .subscribe(query => {
    console.log(`Searching for: ${query}`)
    // Perform search
  })
```

## Functional Composition Patterns

### Function Pipeline

```typescript
interface Pipeline<T> {
  readonly value: T
  pipe<U>(fn: (value: T) => U): Pipeline<U>
  tap(fn: (value: T) => void): Pipeline<T>
  unwrap(): T
}

class PipelineImpl<T> implements Pipeline<T> {
  constructor(readonly value: T) {}

  pipe<U>(fn: (value: T) => U): Pipeline<U> {
    return new PipelineImpl(fn(this.value))
  }

  tap(fn: (value: T) => void): Pipeline<T> {
    fn(this.value)
    return this
  }

  unwrap(): T {
    return this.value
  }
}

const pipeline = <T>(value: T): Pipeline<T> => new PipelineImpl(value)

// Usage
const processedData = pipeline(rawData)
  .pipe(validateData)
  .tap(data => logger.info('Data validated', { data }))
  .pipe(transformData)
  .pipe(enrichData)
  .tap(data => logger.info('Data processed', { data }))
  .unwrap()
```

## Best Practices

### 1. Prefer Immutability

```typescript
// ✅ Good: Immutable updates
const updateUserPreferences = (user: User, newPrefs: Partial<UserPreferences>): User => ({
  ...user,
  preferences: { ...user.preferences, ...newPrefs },
})

// ❌ Bad: Mutation
const updateUserPreferences2 = (user: User, newPrefs: Partial<UserPreferences>): void => {
  Object.assign(user.preferences, newPrefs)
}
```

### 2. Use Pure Functions

```typescript
// ✅ Good: Pure function
const calculateShipping = (weight: number, distance: number, rate: number): number => {
  return weight * distance * rate
}

// ❌ Bad: Impure function
let shippingTotal = 0
const calculateShipping2 = (weight: number, distance: number): void => {
  shippingTotal += weight * distance * 0.1 // Side effect + hidden dependency
}
```

### 3. Compose Small Functions

```typescript
// ✅ Good: Small, composable functions
const isAdult = (age: number): boolean => age >= 18
const hasValidEmail = (email: string): boolean => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
const isActiveUser = (user: User): boolean => user.isActive

const canReceivePromotions = (user: User): boolean =>
  isAdult(user.age) && hasValidEmail(user.email) && isActiveUser(user)

// ❌ Bad: Large, monolithic function
const canReceivePromotions2 = (user: User): boolean => {
  if (user.age < 18) return false
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(user.email)) return false
  if (!user.isActive) return false
  return true
}
```

### 4. Use Type-Safe Functional Utilities

```typescript
// Type-safe utilities
const prop =
  <T, K extends keyof T>(key: K) =>
  (obj: T): T[K] =>
    obj[key]
const sortBy =
  <T>(selector: (item: T) => number | string) =>
  (array: readonly T[]): readonly T[] =>
    [...array].sort((a, b) => {
      const aVal = selector(a)
      const bVal = selector(b)
      return aVal < bVal ? -1 : aVal > bVal ? 1 : 0
    })

// Usage
const getProductName = prop<Product, 'name'>('name')
const sortByPrice = sortBy<Product>(product => product.price)

const sortedProductNames = products.pipe(sortByPrice).map(getProductName)
```

Functional programming patterns in TypeScript lead to more predictable, testable, and maintainable code by emphasizing immutability, pure functions, and declarative composition.

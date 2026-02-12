# React Hooks

## Overview

React hooks provide a powerful way to encapsulate stateful logic and side effects in functional components. This guide focuses on custom hook patterns, architectural principles, and best practices for creating reusable and maintainable hook-based logic.

## Hook Design Philosophy

### Logic Encapsulation Strategy

Hooks excel at encapsulating related stateful logic and side effects into reusable units. This creates cleaner components and promotes code reuse across different parts of your application.

**Single Concern**: Each hook should manage one specific aspect of state or behavior
**Composability**: Hooks should work well when combined with other hooks
**Predictability**: Hook behavior should be consistent and easy to reason about

### Abstraction Levels

Design hooks at appropriate abstraction levels for your use cases:

**Low-Level Hooks**: Handle specific browser APIs or basic state patterns
**Domain Hooks**: Encapsulate business logic and domain-specific operations
**Composite Hooks**: Combine multiple concerns into cohesive functionality
**Feature Hooks**: Provide complete functionality for specific application features

## Custom Hook Patterns

### Data Fetching Hooks

Encapsulate API interactions and state management:

```typescript
function useUser(userId: string | null) {
  const [state, setState] = useState({
    data: null,
    loading: false,
    error: null,
  })

  useEffect(() => {
    if (!userId) return

    setState(prev => ({ ...prev, loading: true }))

    fetchUser(userId)
      .then(data => setState({ data, loading: false, error: null }))
      .catch(error => setState({ data: null, loading: false, error }))
  }, [userId])

  return state
}
```

**Benefits**: Consistent data fetching patterns, centralized error handling, automatic loading states
**Use Cases**: API calls, database queries, external service integration

### State Management Hooks

Create reusable state patterns with built-in validation and side effects:

```typescript
function useLocalStorage<T>(key: string, initialValue: T) {
  const [value, setValue] = useState<T>(() => {
    try {
      const item = window.localStorage.getItem(key)
      return item ? JSON.parse(item) : initialValue
    } catch {
      return initialValue
    }
  })

  const setStoredValue = useCallback(
    (newValue: T | ((val: T) => T)) => {
      try {
        const valueToStore = newValue instanceof Function ? newValue(value) : newValue
        setValue(valueToStore)
        window.localStorage.setItem(key, JSON.stringify(valueToStore))
      } catch (error) {
        console.error(`Error setting localStorage key "${key}":`, error)
      }
    },
    [key, value],
  )

  return [value, setStoredValue] as const
}
```

**Benefits**: Encapsulated persistence logic, type safety, error handling
**Use Cases**: Form state, user preferences, shopping carts, temporary data

### Effect Management Hooks

Abstract complex side effect patterns:

```typescript
function useDebounce<T>(value: T, delay: number): T {
  const [debouncedValue, setDebouncedValue] = useState<T>(value)

  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedValue(value)
    }, delay)

    return () => {
      clearTimeout(handler)
    }
  }, [value, delay])

  return debouncedValue
}

// Usage in search functionality
function SearchComponent() {
  const [searchTerm, setSearchTerm] = useState('')
  const debouncedSearchTerm = useDebounce(searchTerm, 300)
  const searchResults = useSearch(debouncedSearchTerm)

  return (
    <div>
      <input value={searchTerm} onChange={e => setSearchTerm(e.target.value)} />
      {searchResults.loading ? <Spinner /> : <Results data={searchResults.data} />}
    </div>
  )
}
```

**Benefits**: Performance optimization, reduced API calls, improved user experience
**Use Cases**: Search, form validation, auto-save functionality

## Hook Composition Patterns

### Layered Hook Architecture

Build complex functionality by layering simpler hooks:

```typescript
// Base hook: API communication
function useApi<T>(url: string | null) {
  // ... basic fetch logic
}

// Domain hook: User operations
function useUserAPI(userId: string | null) {
  const userUrl = userId ? `/api/users/${userId}` : null
  return useApi<User>(userUrl)
}

// Feature hook: User profile management
function useUserProfile(userId: string | null) {
  const user = useUserAPI(userId)
  const [editing, setEditing] = useState(false)
  const [localChanges, setLocalChanges] = useState<Partial<User>>({})

  const startEditing = useCallback(() => {
    setEditing(true)
    setLocalChanges(user.data || {})
  }, [user.data])

  const cancelEditing = useCallback(() => {
    setEditing(false)
    setLocalChanges({})
  }, [])

  return {
    ...user,
    editing,
    localChanges,
    startEditing,
    cancelEditing,
    updateField: (field: keyof User, value: any) =>
      setLocalChanges(prev => ({ ...prev, [field]: value })),
  }
}
```

**Benefits**: Gradual complexity, testable layers, clear separation of concerns
**Use Cases**: Complex features, multi-step workflows, interdependent state

### Hook Communication Patterns

Coordinate between multiple hooks using shared state or context:

```typescript
// Shared state hook
function useSharedState<T>(key: string, initialValue: T) {
  // Implementation using context or external store
}

// Hooks that communicate through shared state
function useShoppingCart() {
  const [cart, setCart] = useSharedState('cart', [])

  const addItem = useCallback(
    item => {
      setCart(prev => [...prev, item])
    },
    [setCart],
  )

  return { cart, addItem }
}

function useCartSummary() {
  const [cart] = useSharedState('cart', [])

  const total = useMemo(() => cart.reduce((sum, item) => sum + item.price, 0), [cart])

  return { itemCount: cart.length, total }
}
```

## Performance Optimization

### Dependency Management

Manage hook dependencies carefully to prevent unnecessary re-renders:

**Stable References**: Use useCallback and useMemo for stable object and function references
**Dependency Arrays**: Be precise about which values actually affect the hook
**Ref Storage**: Use useRef for values that don't trigger re-renders

```typescript
function useApiCall<T>(url: string, options: RequestOptions = {}) {
  const [state, setState] = useState({ data: null, loading: false, error: null })

  // Memoize options to prevent unnecessary effect runs
  const memoizedOptions = useMemo(() => options, [options.method, options.headers, options.body])

  const fetchData = useCallback(async () => {
    setState(prev => ({ ...prev, loading: true }))
    try {
      const response = await fetch(url, memoizedOptions)
      const data = await response.json()
      setState({ data, loading: false, error: null })
    } catch (error) {
      setState({ data: null, loading: false, error })
    }
  }, [url, memoizedOptions])

  useEffect(() => {
    fetchData()
  }, [fetchData])

  return { ...state, refetch: fetchData }
}
```

### Cleanup Strategies

Implement proper cleanup to prevent memory leaks and stale state updates:

```typescript
function useSubscription<T>(subscribe: (callback: (data: T) => void) => () => void) {
  const [data, setData] = useState<T | null>(null)

  useEffect(() => {
    let isActive = true

    const unsubscribe = subscribe(newData => {
      if (isActive) {
        setData(newData)
      }
    })

    return () => {
      isActive = false
      unsubscribe()
    }
  }, [subscribe])

  return data
}
```

## Hook Testing Strategies

### Isolated Hook Testing

Test hooks independently of components using testing utilities:

```typescript
import { renderHook, act } from '@testing-library/react'

describe('useCounter', () => {
  it('initializes with default value', () => {
    const { result } = renderHook(() => useCounter())
    expect(result.current.count).toBe(0)
  })

  it('increments count when increment is called', () => {
    const { result } = renderHook(() => useCounter())

    act(() => {
      result.current.increment()
    })

    expect(result.current.count).toBe(1)
  })

  it('decrements count when decrement is called', () => {
    const { result } = renderHook(() => useCounter(5))

    act(() => {
      result.current.decrement()
    })

    expect(result.current.count).toBe(4)
  })
})
```

### Integration Testing

Test hooks within component contexts to verify real-world behavior:

```typescript
describe('useUserProfile integration', () => {
  it('loads user data and handles editing state', async () => {
    const TestComponent = ({ userId }) => {
      const profile = useUserProfile(userId)

      return (
        <div>
          <span data-testid='loading'>{profile.loading ? 'Loading' : 'Loaded'}</span>
          <span data-testid='editing'>{profile.editing ? 'Editing' : 'Viewing'}</span>
          <button onClick={profile.startEditing}>Edit</button>
        </div>
      )
    }

    render(<TestComponent userId='123' />)

    expect(screen.getByTestId('loading')).toHaveTextContent('Loading')

    await waitFor(() => {
      expect(screen.getByTestId('loading')).toHaveTextContent('Loaded')
    })

    fireEvent.click(screen.getByText('Edit'))
    expect(screen.getByTestId('editing')).toHaveTextContent('Editing')
  })
})
```

## Error Handling Patterns

### Graceful Degradation

Design hooks to handle errors gracefully and provide fallback behavior:

```typescript
function useFeatureFlag(flagName: string, defaultValue: boolean = false) {
  const [flag, setFlag] = useState(defaultValue)

  useEffect(() => {
    fetchFeatureFlag(flagName)
      .then(setFlag)
      .catch(error => {
        console.warn(`Failed to load feature flag ${flagName}:`, error)
        // Keep the default value on error
      })
  }, [flagName])

  return flag
}
```

### Error Boundaries Integration

Integrate hooks with error boundaries for comprehensive error handling:

```typescript
function useErrorHandler() {
  const throwError = useCallback((error: Error) => {
    // This will be caught by the nearest error boundary
    throw error
  }, [])

  return { throwError }
}

function useAsyncOperation<T>(operation: () => Promise<T>) {
  const [state, setState] = useState({ data: null, loading: false })
  const { throwError } = useErrorHandler()

  const execute = useCallback(async () => {
    setState({ data: null, loading: true })
    try {
      const result = await operation()
      setState({ data: result, loading: false })
      return result
    } catch (error) {
      setState({ data: null, loading: false })
      throwError(error instanceof Error ? error : new Error(String(error)))
    }
  }, [operation, throwError])

  return { ...state, execute }
}
```

## Best Practices Summary

### Hook Design

- **Single Responsibility**: Each hook should have one clear purpose
- **Composability**: Design hooks to work well together
- **Predictable APIs**: Use consistent patterns for similar functionality

### Performance

- **Dependency Precision**: Only include necessary dependencies in arrays
- **Memoization Strategy**: Use memoization for expensive calculations and stable references
- **Cleanup Implementation**: Always clean up subscriptions and async operations

### Testing

- **Isolated Testing**: Test hook logic independently of components
- **Integration Testing**: Verify hooks work correctly in real component contexts
- **Error Scenarios**: Test error handling and edge cases

### Maintainability

- **Clear Naming**: Use descriptive names that indicate hook purpose
- **Documentation**: Document complex hooks and their usage patterns
- **Type Safety**: Leverage TypeScript for better development experience

Effective React hooks encapsulate complex logic into simple, reusable interfaces that make components cleaner and more focused on presentation.
const [results, setResults] = useState<SearchResult[]>([]);
const [loading, setLoading] = useState(false);

// All dependencies included
useEffect(() => {
if (!query) return;

    setLoading(true);

    searchApi(query, filters)
      .then(setResults)
      .finally(() => setLoading(false));

}, [query, filters]); // ✅ All dependencies

return { results, loading };
}

// ❌ Bad: Missing dependencies
function BadSearchResults({ query, filters }: SearchProps) {
const [results, setResults] = useState<SearchResult[]>([]);

useEffect(() => {
searchApi(query, filters).then(setResults);
}, [query]); // ❌ Missing 'filters' dependency
}

// ✅ Good: useCallback with dependencies
function TodoList({ todos, onToggle }: TodoListProps) {
const handleToggle = useCallback((id: string) => {
onToggle(id);
}, [onToggle]); // ✅ Dependency included

const memoizedTodos = useMemo(() => {
return todos.filter(todo => !todo.completed);
}, [todos]); // ✅ Dependency included

return (
<div>
{memoizedTodos.map(todo => (
<TodoItem 
          key={todo.id} 
          todo={todo} 
          onToggle={handleToggle} 
        />
))}
</div>
);
}

````text

## Custom Hook Patterns

### 1. Data Fetching Hooks

```typescript

// Generic data fetching hook
interface UseAsyncState<T> {
  data: T | null;
  loading: boolean;
  error: Error | null;
  refetch: () => Promise<void>;
}

function useAsync<T>(
  asyncFunction: () => Promise<T>,
  dependencies: React.DependencyList = []
): UseAsyncState<T> {
  const [state, setState] = useState<UseAsyncState<T>>({
    data: null,
    loading: true,
    error: null,
    refetch: async () => {}
  });

  const execute = useCallback(async () => {
    setState(prev => ({ ...prev, loading: true, error: null }));

    try {
      const data = await asyncFunction();
      setState(prev => ({ ...prev, data, loading: false }));
    } catch (error) {
      setState(prev => ({
        ...prev,
        error: error instanceof Error ? error : new Error('Unknown error'),
        loading: false
      }));
    }
  }, dependencies);

  useEffect(() => {
    execute();
  }, [execute]);

  const refetch = useCallback(() => execute(), [execute]);

  return { ...state, refetch };
}

// Specific user data hook
function useUser(userId: string | null): UseAsyncState<User> {
  return useAsync(
    async () => {
      if (!userId) throw new Error('User ID is required');

      const response = await fetch(`/api/users/${userId}`);
      if (!response.ok) {
        throw new Error(`Failed to fetch user: ${response.statusText}`);
      }

      return response.json();
    },
    [userId]
  );
}

// Paginated data hook
interface UsePaginatedDataOptions {
  initialPage?: number;
  pageSize?: number;
}

interface PaginatedData<T> {
  items: T[];
  page: number;
  totalPages: number;
  hasNext: boolean;
  hasPrevious: boolean;
}

function usePaginatedData<T>(
  fetchFunction: (page: number, pageSize: number) => Promise<PaginatedData<T>>,
  options: UsePaginatedDataOptions = {}
) {
  const { initialPage = 1, pageSize = 10 } = options;

  const [page, setPage] = useState(initialPage);
  const [allData, setAllData] = useState<PaginatedData<T> | null>(null);

  const { data, loading, error, refetch } = useAsync(
    () => fetchFunction(page, pageSize),
    [page, pageSize]
  );

  useEffect(() => {
    if (data) {
      setAllData(data);
    }
  }, [data]);

  const nextPage = useCallback(() => {
    if (allData?.hasNext) {
      setPage(prev => prev + 1);
    }
  }, [allData?.hasNext]);

  const previousPage = useCallback(() => {
    if (allData?.hasPrevious) {
      setPage(prev => prev - 1);
    }
  }, [allData?.hasPrevious]);

  const goToPage = useCallback((targetPage: number) => {
    if (targetPage >= 1 && targetPage <= (allData?.totalPages || 1)) {
      setPage(targetPage);
    }
  }, [allData?.totalPages]);

  return {
    data: allData,
    loading,
    error,
    page,
    nextPage,
    previousPage,
    goToPage,
    refetch
  };
}

````

### 2. State Management Hooks

```typescript

// Local storage hook
function useLocalStorage<T>(
  key: string,
  initialValue: T,
): [T, (value: T | ((prev: T) => T)) => void] {
  const [storedValue, setStoredValue] = useState<T>(() => {
    try {
      const item = window.localStorage.getItem(key)
      return item ? JSON.parse(item) : initialValue
    } catch (error) {
      console.error(`Error loading from localStorage key "${key}":`, error)
      return initialValue
    }
  })

  const setValue = useCallback(
    (value: T | ((prev: T) => T)) => {
      try {
        const valueToStore = value instanceof Function ? value(storedValue) : value
        setStoredValue(valueToStore)
        window.localStorage.setItem(key, JSON.stringify(valueToStore))
      } catch (error) {
        console.error(`Error saving to localStorage key "${key}":`, error)
      }
    },
    [key, storedValue],
  )

  return [storedValue, setValue]
}

// Debounced value hook
function useDebounce<T>(value: T, delay: number): T {
  const [debouncedValue, setDebouncedValue] = useState<T>(value)

  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedValue(value)
    }, delay)

    return () => {
      clearTimeout(handler)
    }
  }, [value, delay])

  return debouncedValue
}

// Previous value hook
| function usePrevious<T>(value: T): T | undefined {           |
| const ref = useRef<T                 | undefined>(undefined) |

  useEffect(() => {
    ref.current = value
  }, [value])

  return ref.current
}

// Toggle hook
function useToggle(initialValue = false): [boolean, () => void, (value: boolean) => void] {
  const [value, setValue] = useState(initialValue)

  const toggle = useCallback(() => {
    setValue(prev => !prev)
  }, [])

  const setToggle = useCallback((newValue: boolean) => {
    setValue(newValue)
  }, [])

  return [value, toggle, setToggle]
}

// Counter hook
interface UseCounterOptions {
  min?: number
  max?: number
  step?: number
}

function useCounter(initialValue = 0, options: UseCounterOptions = {}) {
  const { min = -Infinity, max = Infinity, step = 1 } = options
  const [count, setCount] = useState(initialValue)

  const increment = useCallback(() => {
    setCount(prev => Math.min(prev + step, max))
  }, [step, max])

  const decrement = useCallback(() => {
    setCount(prev => Math.max(prev - step, min))
  }, [step, min])

  const reset = useCallback(() => {
    setCount(initialValue)
  }, [initialValue])

  const set = useCallback(
    (value: number) => {
      setCount(Math.min(Math.max(value, min), max))
    },
    [min, max],
  )

  return {
    count,
    increment,
    decrement,
    reset,
    set,
  }
}

```

### 3. Effect Hooks

```typescript

// Interval hook
function useInterval(callback: () => void, delay: number | null) {
  const savedCallback = useRef<() => void>()

  useEffect(() => {
    savedCallback.current = callback
  }, [callback])

  useEffect(() => {
    if (delay !== null) {
      const interval = setInterval(() => {
        savedCallback.current?.()
      }, delay)

      return () => clearInterval(interval)
    }
  }, [delay])
}

// Online status hook
function useOnlineStatus(): boolean {
  const [isOnline, setIsOnline] = useState(navigator.onLine)

  useEffect(() => {
    function handleOnline() {
      setIsOnline(true)
    }

    function handleOffline() {
      setIsOnline(false)
    }

    window.addEventListener('online', handleOnline)
    window.addEventListener('offline', handleOffline)

    return () => {
      window.removeEventListener('online', handleOnline)
      window.removeEventListener('offline', handleOffline)
    }
  }, [])

  return isOnline
}

// Window size hook
interface WindowSize {
  width: number
  height: number
}

function useWindowSize(): WindowSize {
  const [windowSize, setWindowSize] = useState<WindowSize>(() => ({
    width: window.innerWidth,
    height: window.innerHeight,
  }))

  useEffect(() => {
    function handleResize() {
      setWindowSize({
        width: window.innerWidth,
        height: window.innerHeight,
      })
    }

    window.addEventListener('resize', handleResize)

    return () => {
      window.removeEventListener('resize', handleResize)
    }
  }, [])

  return windowSize
}

// Click outside hook
function useClickOutside<T extends HTMLElement>(
  callback: () => void,
  enabled = true,
): React.RefObject<T> {
  const ref = useRef<T>(null)

  useEffect(() => {
    if (!enabled) return

    function handleClick(event: MouseEvent) {
      if (ref.current && !ref.current.contains(event.target as Node)) {
        callback()
      }
    }

    document.addEventListener('mousedown', handleClick)

    return () => {
      document.removeEventListener('mousedown', handleClick)
    }
  }, [callback, enabled])

  return ref
}

// Escape key hook
function useEscapeKey(callback: () => void, enabled = true) {
  useEffect(() => {
    if (!enabled) return

    function handleEscape(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        callback()
      }
    }

    document.addEventListener('keydown', handleEscape)

    return () => {
      document.removeEventListener('keydown', handleEscape)
    }
  }, [callback, enabled])
}

```

### 4. Form Hooks

```typescript

// Form validation hook
interface ValidationRule<T> {
  required?: boolean
  minLength?: number
  maxLength?: number
  pattern?: RegExp
  custom?: (value: T) => string | null
}

interface FieldState<T> {
  value: T
  error: string | null
  touched: boolean
}

interface UseFormOptions<T> {
  initialValues: T
  validationRules?: Partial<Record<keyof T, ValidationRule<T[keyof T]>>>
  onSubmit?: (values: T) => void | Promise<void>
}

function useForm<T extends Record<string, any>>({
  initialValues,
  validationRules = {},
  onSubmit,
}: UseFormOptions<T>) {
  const [fields, setFields] = useState<Record<keyof T, FieldState<T[keyof T]>>>(() => {
    const initialFields = {} as Record<keyof T, FieldState<T[keyof T]>>

    for (const key in initialValues) {
      initialFields[key] = {
        value: initialValues[key],
        error: null,
        touched: false,
      }
    }

    return initialFields
  })

  const validateField = useCallback(
    <K extends keyof T>(name: K, value: T[K]): string | null => {
      const rules = validationRules[name]
      if (!rules) return null

      if (rules.required && (!value || String(value).trim() === '')) {
        return 'This field is required'
      }

      if (rules.minLength && String(value).length < rules.minLength) {
        return `Minimum length is ${rules.minLength}`
      }

      if (rules.maxLength && String(value).length > rules.maxLength) {
        return `Maximum length is ${rules.maxLength}`
      }

      if (rules.pattern && !rules.pattern.test(String(value))) {
        return 'Invalid format'
      }

      if (rules.custom) {
        return rules.custom(value)
      }

      return null
    },
    [validationRules],
  )

  const setFieldValue = useCallback(
    <K extends keyof T>(name: K, value: T[K]) => {
      setFields(prev => ({
        ...prev,
        [name]: {
          ...prev[name],
          value,
          error: validateField(name, value),
        },
      }))
    },
    [validateField],
  )

  const setFieldTouched = useCallback(<K extends keyof T>(name: K) => {
    setFields(prev => ({
      ...prev,
      [name]: {
        ...prev[name],
        touched: true,
      },
    }))
  }, [])

  const getFieldProps = useCallback(
    <K extends keyof T>(name: K) => ({
      value: fields[name].value,
      onChange: (e: React.ChangeEvent<HTMLInputElement>) => {
        setFieldValue(name, e.target.value as T[K])
      },
      onBlur: () => {
        setFieldTouched(name)
      },
    }),
    [fields, setFieldValue, setFieldTouched],
  )

  const values = useMemo(() => {
    const formValues = {} as T
    for (const key in fields) {
      formValues[key] = fields[key].value
    }
    return formValues
  }, [fields])

  const errors = useMemo(() => {
    const formErrors = {} as Partial<Record<keyof T, string>>
    for (const key in fields) {
      if (fields[key].error) {
        formErrors[key] = fields[key].error!
      }
    }
    return formErrors
  }, [fields])

  const isValid = useMemo(() => {
    return Object.values(errors).length === 0
  }, [errors])

  const handleSubmit = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault()

      // Mark all fields as touched
      setFields(prev => {
        const updatedFields = { ...prev }
        for (const key in updatedFields) {
          updatedFields[key] = { ...updatedFields[key], touched: true }
        }
        return updatedFields
      })

      if (isValid && onSubmit) {
        onSubmit(values)
      }
    },
    [isValid, onSubmit, values],
  )

  const reset = useCallback(() => {
    setFields(() => {
      const resetFields = {} as Record<keyof T, FieldState<T[keyof T]>>

      for (const key in initialValues) {
        resetFields[key] = {
          value: initialValues[key],
          error: null,
          touched: false,
        }
      }

      return resetFields
    })
  }, [initialValues])

  return {
    values,
    errors,
    fields,
    isValid,
    getFieldProps,
    setFieldValue,
    setFieldTouched,
    handleSubmit,
    reset,
  }
}

```

## Performance Optimization

### 1. Memoization Hooks

```typescript

// Expensive computation hook
function useExpensiveValue<T>(computeValue: () => T, dependencies: React.DependencyList): T {
  return useMemo(computeValue, dependencies)
}

// Stable reference hook
function useStableCallback<T extends (...args: any[]) => any>(
  callback: T,
  dependencies: React.DependencyList,
): T {
  return useCallback(callback, dependencies)
}

// Deep comparison memo
function useDeepCompareMemo<T>(factory: () => T, dependencies: React.DependencyList): T {
  const ref = useRef<{
    deps: React.DependencyList
    value: T
  }>()

  if (!ref.current || !deepEqual(ref.current.deps, dependencies)) {
    ref.current = {
      deps: dependencies,
      value: factory(),
    }
  }

  return ref.current.value
}

function deepEqual(a: any, b: any): boolean {
  if (a === b) return true

  if (a && b && typeof a === 'object' && typeof b === 'object') {
    if (Array.isArray(a) !== Array.isArray(b)) return false

    const keys = Object.keys(a)
    if (keys.length !== Object.keys(b).length) return false

    return keys.every(key => deepEqual(a[key], b[key]))
  }

  return false
}

// Throttled callback
function useThrottledCallback<T extends (...args: any[]) => any>(callback: T, delay: number): T {
  const lastRan = useRef<number>(Date.now())

  return useCallback(
    ((...args: Parameters<T>) => {
      if (Date.now() - lastRan.current >= delay) {
        callback(...args)
        lastRan.current = Date.now()
      }
    }) as T,
    [callback, delay],
  )
}

```

## Testing Custom Hooks

### 1. Hook Testing with React Testing Library

```typescript

import { renderHook, act } from '@testing-library/react'
import { vi } from 'vitest'
import { useCounter, useLocalStorage, useAsync } from './hooks'

describe('useCounter', () => {
  it('should initialize with default value', () => {
    const { result } = renderHook(() => useCounter(5))

    expect(result.current.count).toBe(5)
  })

  it('should increment counter', () => {
    const { result } = renderHook(() => useCounter(0))

    act(() => {
      result.current.increment()
    })

    expect(result.current.count).toBe(1)
  })

  it('should respect max value', () => {
    const { result } = renderHook(() => useCounter(8, { max: 10 }))

    act(() => {
      result.current.increment()
      result.current.increment()
      result.current.increment() // Should not exceed max
    })

    expect(result.current.count).toBe(10)
  })

  it('should reset to initial value', () => {
    const { result } = renderHook(() => useCounter(5))

    act(() => {
      result.current.increment()
      result.current.increment()
    })

    expect(result.current.count).toBe(7)

    act(() => {
      result.current.reset()
    })

    expect(result.current.count).toBe(5)
  })
})

describe('useLocalStorage', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  it('should return initial value when localStorage is empty', () => {
    const { result } = renderHook(() => useLocalStorage('test-key', 'initial'))

    expect(result.current[0]).toBe('initial')
  })

  it('should update localStorage when value changes', () => {
    const { result } = renderHook(() => useLocalStorage('test-key', 'initial'))

    act(() => {
      result.current[1]('updated')
    })

    expect(result.current[0]).toBe('updated')
    expect(localStorage.getItem('test-key')).toBe('"updated"')
  })

  it('should load value from localStorage on init', () => {
    localStorage.setItem('test-key', '"stored-value"')

    const { result } = renderHook(() => useLocalStorage('test-key', 'initial'))

    expect(result.current[0]).toBe('stored-value')
  })
})

describe('useAsync', () => {
  it('should handle successful async operation', async () => {
    const mockFn = vi.fn().mockResolvedValue('success')

    const { result, waitForNextUpdate } = renderHook(() => useAsync(mockFn, []))

    expect(result.current.loading).toBe(true)
    expect(result.current.data).toBe(null)
    expect(result.current.error).toBe(null)

    await waitForNextUpdate()

    expect(result.current.loading).toBe(false)
    expect(result.current.data).toBe('success')
    expect(result.current.error).toBe(null)
  })

  it('should handle async operation error', async () => {
    const mockError = new Error('Test error')
    const mockFn = vi.fn().mockRejectedValue(mockError)

    const { result, waitForNextUpdate } = renderHook(() => useAsync(mockFn, []))

    await waitForNextUpdate()

    expect(result.current.loading).toBe(false)
    expect(result.current.data).toBe(null)
    expect(result.current.error).toBe(mockError)
  })

  it('should refetch data when refetch is called', async () => {
    const mockFn = vi.fn().mockResolvedValueOnce('first').mockResolvedValueOnce('second')

    const { result, waitForNextUpdate } = renderHook(() => useAsync(mockFn, []))

    await waitForNextUpdate()
    expect(result.current.data).toBe('first')

    act(() => {
      result.current.refetch()
    })

    await waitForNextUpdate()
    expect(result.current.data).toBe('second')
    expect(mockFn).toHaveBeenCalledTimes(2)
  })
})

```

### 2. Integration Testing with Components

```typescript

// Testing hooks within component context
function TestComponent() {
  const { count, increment, decrement } = useCounter(0, { min: 0, max: 5 })

  return (
    <div>
      <span data-testid='count'>{count}</span>
      <button data-testid='increment' onClick={increment}>
        +
      </button>
      <button data-testid='decrement' onClick={decrement}>
        -
      </button>
    </div>
  )
}

describe('useCounter integration', () => {
  it('should work correctly in component', async () => {
    const user = userEvent.setup()
    render(<TestComponent />)

    const countElement = screen.getByTestId('count')
    const incrementButton = screen.getByTestId('increment')
    const decrementButton = screen.getByTestId('decrement')

    expect(countElement).toHaveTextContent('0')

    await user.click(incrementButton)
    expect(countElement).toHaveTextContent('1')

    await user.click(decrementButton)
    expect(countElement).toHaveTextContent('0')

    // Test min boundary
    await user.click(decrementButton)
    expect(countElement).toHaveTextContent('0') // Should not go below 0
  })
})

```

## Best Practices

1. **Follow Rules of Hooks**: Always call hooks at the top level
2. **Proper Dependencies**: Include all dependencies in useEffect and useCallback
3. **Custom Hook Naming**: Start with "use" prefix
4. **Single Responsibility**: Each custom hook should have one clear purpose
5. **Return Objects**: For multiple values, return objects instead of arrays
6. **Error Handling**: Handle errors gracefully in async hooks
7. **Performance**: Use useMemo and useCallback judiciously
8. **Testing**: Test custom hooks thoroughly with renderHook
9. **TypeScript**: Provide proper types for hook parameters and returns
10. **Documentation**: Document hook behavior and usage patterns

Custom hooks are powerful tools for encapsulating and reusing stateful logic across components while maintaining clean and testable code.

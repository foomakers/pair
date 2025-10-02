# ⚛️ React/Next.js Patterns

**Focus**: Component design, state management, and Next.js application patterns

React and Next.js implementation patterns for building maintainable, performant, and type-safe frontend applications with modern React features.

## 🧩 Component Design Patterns

### Functional Component Standards

```typescript
// ✅ Base component type definitions
type BaseProps = {
  readonly className?: string
  readonly children?: React.ReactNode
}

type ComponentProps = BaseProps & {
  readonly title: string
  readonly variant?: 'primary' | 'secondary'
  readonly disabled?: boolean
  readonly onClick?: () => void
}

// ✅ Component implementation with forwardRef
const Button = React.forwardRef<HTMLButtonElement, ComponentProps>(
  ({ className, title, variant = 'primary', disabled, onClick, children, ...props }, ref) => {
    return (
      <button
        ref={ref}
        className={cn(buttonVariants({ variant }), className)}
        disabled={disabled}
        onClick={onClick}
        aria-label={title}
        {...props}>
        {children || title}
      </button>
    )
  },
)
Button.displayName = 'Button'

// ✅ Export with type
export { Button, type ComponentProps as ButtonProps }
```

### Compound Component Pattern

```typescript
// ✅ Compound component with context
type CardContextValue = {
  readonly variant: 'default' | 'outlined' | 'elevated'
  readonly size: 'sm' | 'md' | 'lg'
}

const CardContext = React.createContext<CardContextValue | null>(null)

const useCardContext = () => {
  const context = React.useContext(CardContext)
  if (!context) {
    throw new Error('Card components must be used within a Card')
  }
  return context
}

// ✅ Main component
type CardProps = BaseProps & {
  readonly variant?: CardContextValue['variant']
  readonly size?: CardContextValue['size']
}

const Card = ({ variant = 'default', size = 'md', className, children }: CardProps) => {
  const contextValue: CardContextValue = { variant, size }

  return (
    <CardContext.Provider value={contextValue}>
      <div className={cn(cardVariants({ variant, size }), className)}>{children}</div>
    </CardContext.Provider>
  )
}

// ✅ Sub-components
const CardHeader = ({ className, children }: BaseProps) => {
  const { size } = useCardContext()
  return <div className={cn(cardHeaderVariants({ size }), className)}>{children}</div>
}

const CardContent = ({ className, children }: BaseProps) => {
  const { size } = useCardContext()
  return <div className={cn(cardContentVariants({ size }), className)}>{children}</div>
}

const CardFooter = ({ className, children }: BaseProps) => {
  return <div className={cn('flex items-center pt-4', className)}>{children}</div>
}

// ✅ Compound export
Card.Header = CardHeader
Card.Content = CardContent
Card.Footer = CardFooter

export { Card }
```

### Render Props Pattern

```typescript
// ✅ Render props for data fetching
type DataFetcherProps<T> = {
  readonly url: string
  readonly children: (state: {
    readonly data: T | null
    readonly loading: boolean
    readonly error: Error | null
    readonly refetch: () => void
  }) => React.ReactNode
}

const DataFetcher = <T>({ url, children }: DataFetcherProps<T>) => {
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['data', url],
    queryFn: () => fetch(url).then(res => res.json()),
  })

  return (
    <>
      {children({
        data: data || null,
        loading: isLoading,
        error: error || null,
        refetch,
      })}
    </>
  )
}

// ✅ Usage
const UserProfile = ({ userId }: { userId: string }) => (
  <DataFetcher<User> url={`/api/users/${userId}`}>
    {({ data: user, loading, error, refetch }) => {
      if (loading) return <ProfileSkeleton />
      if (error) return <ErrorMessage error={error} onRetry={refetch} />
      if (!user) return <NotFound />

      return <UserCard user={user} />
    }}
  </DataFetcher>
)
```

## 🎣 Custom Hooks Patterns

### State Management Hooks

```typescript
// ✅ Form state hook with validation
type UseFormProps<T> = {
  readonly initialValues: T
  readonly validationSchema: z.ZodSchema<T>
  readonly onSubmit: (values: T) => Promise<void> | void
}

type UseFormReturn<T> = {
  readonly values: T
  readonly errors: Partial<Record<keyof T, string>>
  readonly isSubmitting: boolean
  readonly isValid: boolean
  readonly setValue: <K extends keyof T>(key: K, value: T[K]) => void
  readonly setValues: (values: Partial<T>) => void
  readonly handleSubmit: (e: React.FormEvent) => Promise<void>
  readonly reset: () => void
}

const useForm = <T extends Record<string, any>>({
  initialValues,
  validationSchema,
  onSubmit,
}: UseFormProps<T>): UseFormReturn<T> => {
  const [values, setValues] = useState<T>(initialValues)
  const [errors, setErrors] = useState<Partial<Record<keyof T, string>>>({})
  const [isSubmitting, setIsSubmitting] = useState(false)

  const validate = useCallback(
    (data: T): boolean => {
      try {
        validationSchema.parse(data)
        setErrors({})
        return true
      } catch (error) {
        if (error instanceof z.ZodError) {
          const fieldErrors: Partial<Record<keyof T, string>> = {}
          error.errors.forEach(err => {
            if (err.path[0]) {
              fieldErrors[err.path[0] as keyof T] = err.message
            }
          })
          setErrors(fieldErrors)
        }
        return false
      }
    },
    [validationSchema],
  )

  const setValue = useCallback(<K extends keyof T>(key: K, value: T[K]) => {
    setValues(prev => ({ ...prev, [key]: value }))
  }, [])

  const handleSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault()

      if (!validate(values)) return

      setIsSubmitting(true)
      try {
        await onSubmit(values)
      } catch (error) {
        console.error('Form submission error:', error)
      } finally {
        setIsSubmitting(false)
      }
    },
    [values, validate, onSubmit],
  )

  const reset = useCallback(() => {
    setValues(initialValues)
    setErrors({})
    setIsSubmitting(false)
  }, [initialValues])

  const isValid = Object.keys(errors).length === 0

  return {
    values,
    errors,
    isSubmitting,
    isValid,
    setValue,
    setValues,
    handleSubmit,
    reset,
  }
}
```

### Data Fetching Hooks

```typescript
// ✅ API query hook with caching
type UseApiQueryOptions<T> = {
  readonly enabled?: boolean
  readonly refetchOnWindowFocus?: boolean
  readonly staleTime?: number
  readonly onSuccess?: (data: T) => void
  readonly onError?: (error: Error) => void
}

const useApiQuery = <T>(endpoint: string, options: UseApiQueryOptions<T> = {}) => {
  const {
    enabled = true,
    refetchOnWindowFocus = false,
    staleTime = 5 * 60 * 1000, // 5 minutes
    onSuccess,
    onError,
  } = options

  return useQuery({
    queryKey: ['api', endpoint],
    queryFn: async (): Promise<T> => {
      const response = await fetch(`/api${endpoint}`)
      if (!response.ok) {
        throw new Error(`API Error: ${response.status}`)
      }
      return response.json()
    },
    enabled,
    refetchOnWindowFocus,
    staleTime,
    onSuccess,
    onError,
  })
}

// ✅ API mutation hook
type UseApiMutationOptions<TData, TVariables> = {
  readonly onSuccess?: (data: TData, variables: TVariables) => void
  readonly onError?: (error: Error, variables: TVariables) => void
  readonly onMutate?: (variables: TVariables) => void
}

const useApiMutation = <TData, TVariables>(
  endpoint: string,
  method: 'POST' | 'PUT' | 'PATCH' | 'DELETE' = 'POST',
  options: UseApiMutationOptions<TData, TVariables> = {},
) => {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (variables: TVariables): Promise<TData> => {
      const response = await fetch(`/api${endpoint}`, {
        method,
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(variables),
      })

      if (!response.ok) {
        throw new Error(`API Error: ${response.status}`)
      }

      return response.json()
    },
    onSuccess: (data, variables) => {
      // Invalidate related queries
      queryClient.invalidateQueries({ queryKey: ['api'] })
      options.onSuccess?.(data, variables)
    },
    onError: options.onError,
    onMutate: options.onMutate,
  })
}
```

### Local Storage Hook

```typescript
// ✅ Persistent local storage hook
const useLocalStorage = <T>(
  key: string,
  initialValue: T,
): [T, (value: T | ((prev: T) => T)) => void, () => void] => {
  // Get initial value from localStorage or use provided initial value
  const [storedValue, setStoredValue] = useState<T>(() => {
    if (typeof window === 'undefined') {
      return initialValue
    }

    try {
      const item = window.localStorage.getItem(key)
      return item ? JSON.parse(item) : initialValue
    } catch (error) {
      console.error(`Error reading localStorage key "${key}":`, error)
      return initialValue
    }
  })

  // Update localStorage and state
  const setValue = useCallback(
    (value: T | ((prev: T) => T)) => {
      try {
        const valueToStore = value instanceof Function ? value(storedValue) : value
        setStoredValue(valueToStore)

        if (typeof window !== 'undefined') {
          window.localStorage.setItem(key, JSON.stringify(valueToStore))
        }
      } catch (error) {
        console.error(`Error setting localStorage key "${key}":`, error)
      }
    },
    [key, storedValue],
  )

  // Remove from localStorage
  const removeValue = useCallback(() => {
    try {
      setStoredValue(initialValue)
      if (typeof window !== 'undefined') {
        window.localStorage.removeItem(key)
      }
    } catch (error) {
      console.error(`Error removing localStorage key "${key}":`, error)
    }
  }, [key, initialValue])

  return [storedValue, setValue, removeValue]
}
```

## 🌐 Next.js App Router Patterns

### Layout Composition

```typescript
// app/layout.tsx - Root layout
import { Inter } from 'next/font/google'
import { Providers } from './providers'
import { Navigation } from '@/components/layout/navigation'
import { Footer } from '@/components/layout/footer'

const inter = Inter({ subsets: ['latin'] })

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang='en' suppressHydrationWarning>
      <body className={inter.className}>
        <Providers>
          <div className='min-h-screen flex flex-col'>
            <Navigation />
            <main className='flex-1'>{children}</main>
            <Footer />
          </div>
        </Providers>
      </body>
    </html>
  )
}

// app/(dashboard)/layout.tsx - Nested layout
import { DashboardSidebar } from '@/components/dashboard/sidebar'
import { DashboardHeader } from '@/components/dashboard/header'

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className='flex h-screen'>
      <DashboardSidebar />
      <div className='flex-1 flex flex-col overflow-hidden'>
        <DashboardHeader />
        <main className='flex-1 overflow-auto p-6'>{children}</main>
      </div>
    </div>
  )
}
```

### Server Components with Data Fetching

```typescript
// app/users/page.tsx - Server component
import { getUsers } from '@/services/users'
import { UsersList } from '@/components/users/users-list'
import { UsersHeader } from '@/components/users/users-header'

type UsersPageProps = {
  readonly searchParams: {
    readonly page?: string
    readonly search?: string
  }
}

export default async function UsersPage({ searchParams }: UsersPageProps) {
  const page = parseInt(searchParams.page || '1')
  const search = searchParams.search || ''

  // Server-side data fetching
  const { users, totalPages } = await getUsers({
    page,
    search,
    limit: 10,
  })

  return (
    <div className='space-y-6'>
      <UsersHeader />
      <UsersList users={users} currentPage={page} totalPages={totalPages} searchTerm={search} />
    </div>
  )
}

// Generate metadata
export async function generateMetadata({ searchParams }: UsersPageProps) {
  const search = searchParams.search

  return {
    title: search ? `Users - Search: ${search}` : 'Users',
    description: 'Manage and view users in the application',
  }
}
```

### Client Components with State

```typescript
// components/users/users-list.tsx - Client component
'use client'

import { useState, useMemo } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { UserCard } from './user-card'
import { Pagination } from '@/components/ui/pagination'
import { SearchInput } from '@/components/ui/search-input'

type UsersListProps = {
  readonly users: User[]
  readonly currentPage: number
  readonly totalPages: number
  readonly searchTerm: string
}

export function UsersList({ users, currentPage, totalPages, searchTerm }: UsersListProps) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [localSearch, setLocalSearch] = useState(searchTerm)

  // Debounced search
  const debouncedSearch = useDebounce(localSearch, 300)

  // Update URL when search changes
  useEffect(() => {
    if (debouncedSearch !== searchTerm) {
      const params = new URLSearchParams(searchParams)
      if (debouncedSearch) {
        params.set('search', debouncedSearch)
      } else {
        params.delete('search')
      }
      params.delete('page') // Reset to page 1 on search

      router.push(`/users?${params.toString()}`)
    }
  }, [debouncedSearch, searchTerm, router, searchParams])

  const handlePageChange = (page: number) => {
    const params = new URLSearchParams(searchParams)
    params.set('page', page.toString())
    router.push(`/users?${params.toString()}`)
  }

  return (
    <div className='space-y-6'>
      <SearchInput value={localSearch} onChange={setLocalSearch} placeholder='Search users...' />

      <div className='grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4'>
        {users.map(user => (
          <UserCard key={user.id} user={user} />
        ))}
      </div>

      {users.length === 0 && (
        <div className='text-center py-12'>
          <p className='text-muted-foreground'>No users found.</p>
        </div>
      )}

      {totalPages > 1 && (
        <Pagination
          currentPage={currentPage}
          totalPages={totalPages}
          onPageChange={handlePageChange}
        />
      )}
    </div>
  )
}
```

## 🎭 Advanced Patterns

### Error Boundaries

```typescript
// components/error-boundary.tsx
'use client'

import React from 'react'
import { Button } from '@/components/ui/button'

type ErrorBoundaryState = {
  hasError: boolean
  error?: Error
}

type ErrorBoundaryProps = {
  readonly children: React.ReactNode
  readonly fallback?: React.ComponentType<{ error: Error; reset: () => void }>
  readonly onError?: (error: Error) => void
}

export class ErrorBoundary extends React.Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props)
    this.state = { hasError: false }
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error }
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error('ErrorBoundary caught an error:', error, errorInfo)
    this.props.onError?.(error)
  }

  render() {
    if (this.state.hasError && this.state.error) {
      const FallbackComponent = this.props.fallback || DefaultErrorFallback

      return (
        <FallbackComponent
          error={this.state.error}
          reset={() => this.setState({ hasError: false, error: undefined })}
        />
      )
    }

    return this.props.children
  }
}

// Default error fallback component
const DefaultErrorFallback = ({ error, reset }: { error: Error; reset: () => void }) => (
  <div className='flex flex-col items-center justify-center min-h-[400px] p-6'>
    <h2 className='text-xl font-semibold mb-2'>Something went wrong</h2>
    <p className='text-muted-foreground mb-4 text-center'>
      {error.message || 'An unexpected error occurred'}
    </p>
    <Button onClick={reset}>Try again</Button>
  </div>
)
```

### Suspense with Loading States

```typescript
// components/suspense-wrapper.tsx
import { Suspense } from 'react'
import { Skeleton } from '@/components/ui/skeleton'

type SuspenseWrapperProps = {
  readonly children: React.ReactNode
  readonly fallback?: React.ReactNode
  readonly className?: string
}

export function SuspenseWrapper({ children, fallback, className }: SuspenseWrapperProps) {
  return (
    <Suspense fallback={fallback || <DefaultSkeleton className={className} />}>{children}</Suspense>
  )
}

const DefaultSkeleton = ({ className }: { className?: string }) => (
  <div className={cn('space-y-4', className)}>
    <Skeleton className='h-4 w-full' />
    <Skeleton className='h-4 w-3/4' />
    <Skeleton className='h-4 w-1/2' />
  </div>
)

// Usage in pages
export default function DashboardPage() {
  return (
    <div className='space-y-6'>
      <h1>Dashboard</h1>

      <SuspenseWrapper fallback={<DashboardSkeleton />}>
        <DashboardStats />
      </SuspenseWrapper>

      <SuspenseWrapper fallback={<ChartSkeleton />}>
        <DashboardCharts />
      </SuspenseWrapper>
    </div>
  )
}
```

## 🔗 Related Patterns

- **[Fastify Patterns](fastify-patterns.md)** - Backend API patterns that complement React frontend
- **[Frontend Stack](.pair/knowledge/guidelines/technical-standards/tech-stack/frontend-stack.md)** - Technical configuration for React/Next.js
- **[Component Design](component-design.md)** - Design principles for components
- **[Testing Implementation](.pair/knowledge/guidelines/testing/testing-implementation)** - Testing strategies for React components

## 🎯 Implementation Guidelines

1. **Type Safety**: Always use TypeScript for props and state definitions
2. **Component Composition**: Prefer composition over inheritance
3. **Custom Hooks**: Extract reusable logic into custom hooks
4. **Error Handling**: Implement error boundaries for robust UX
5. **Performance**: Use React 18 concurrent features appropriately
6. **Server Components**: Leverage Next.js App Router for optimal performance
7. **State Management**: Use appropriate state management for component scope
8. **Accessibility**: Ensure components are accessible by default

---

_These React/Next.js patterns ensure scalable, maintainable, and performant frontend applications with excellent developer experience._

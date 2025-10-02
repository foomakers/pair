# Framework Implementation Patterns

## Strategic Overview

This framework establishes comprehensive implementation patterns for modern web frameworks, ensuring consistent architecture, optimal performance, and maintainable code across React, Next.js, Node.js, and emerging technologies through systematic application of proven patterns and best practices.

## React Implementation Patterns

### Advanced Component Architecture

#### **Compound Component Pattern**

```tsx
// Context for component communication
interface TabsContextValue {
  activeTab: string
  setActiveTab: (tab: string) => void
  orientation: 'horizontal' | 'vertical'
}

const TabsContext = createContext<TabsContextValue | null>(null)

function useTabs(): TabsContextValue {
  const context = useContext(TabsContext)
  if (!context) {
    throw new Error('useTabs must be used within a Tabs component')
  }
  return context
}

// Main compound component
interface TabsProps {
  defaultTab?: string
  orientation?: 'horizontal' | 'vertical'
  onChange?: (tab: string) => void
  children: React.ReactNode
  className?: string
}

function Tabs({
  defaultTab,
  orientation = 'horizontal',
  onChange,
  children,
  className,
}: TabsProps) {
  const [activeTab, setActiveTab] = useState(defaultTab || '')

  const handleTabChange = useCallback(
    (tab: string) => {
      setActiveTab(tab)
      onChange?.(tab)
    },
    [onChange],
  )

  const contextValue = useMemo(
    () => ({
      activeTab,
      setActiveTab: handleTabChange,
      orientation,
    }),
    [activeTab, handleTabChange, orientation],
  )

  return (
    <TabsContext.Provider value={contextValue}>
      <div className={cn('tabs-container', className)} data-orientation={orientation}>
        {children}
      </div>
    </TabsContext.Provider>
  )
}

// Sub-components
function TabsList({ children, className }: { children: React.ReactNode; className?: string }) {
  const { orientation } = useTabs()

  return (
    <div role='tablist' aria-orientation={orientation} className={cn('tabs-list', className)}>
      {children}
    </div>
  )
}

function TabsTrigger({
  value,
  children,
  disabled = false,
  className,
}: {
  value: string
  children: React.ReactNode
  disabled?: boolean
  className?: string
}) {
  const { activeTab, setActiveTab } = useTabs()
  const isActive = activeTab === value

  return (
    <button
      role='tab'
      aria-selected={isActive}
      aria-controls={`panel-${value}`}
      disabled={disabled}
      className={cn('tabs-trigger', { active: isActive, disabled }, className)}
      onClick={() => setActiveTab(value)}>
      {children}
    </button>
  )
}

function TabsContent({
  value,
  children,
  className,
}: {
  value: string
  children: React.ReactNode
  className?: string
}) {
  const { activeTab } = useTabs()
  const isActive = activeTab === value

  if (!isActive) return null

  return (
    <div
      role='tabpanel'
      id={`panel-${value}`}
      aria-labelledby={`tab-${value}`}
      className={cn('tabs-content', className)}>
      {children}
    </div>
  )
}

// Export compound component with sub-components
Tabs.List = TabsList
Tabs.Trigger = TabsTrigger
Tabs.Content = TabsContent

export { Tabs }

// Usage
function App() {
  return (
    <Tabs defaultTab='overview' onChange={tab => console.log('Tab changed:', tab)}>
      <Tabs.List>
        <Tabs.Trigger value='overview'>Overview</Tabs.Trigger>
        <Tabs.Trigger value='analytics'>Analytics</Tabs.Trigger>
        <Tabs.Trigger value='settings'>Settings</Tabs.Trigger>
      </Tabs.List>

      <Tabs.Content value='overview'>
        <OverviewPanel />
      </Tabs.Content>

      <Tabs.Content value='analytics'>
        <AnalyticsPanel />
      </Tabs.Content>

      <Tabs.Content value='settings'>
        <SettingsPanel />
      </Tabs.Content>
    </Tabs>
  )
}
```

#### **Render Props with Hooks Pattern**

```tsx
// Data fetching hook with render props support
interface UseDataFetchResult<T> {
  data: T | null
  loading: boolean
  error: Error | null
  refetch: () => Promise<void>
  mutate: (newData: T) => void
}

function useDataFetch<T>(
  fetcher: () => Promise<T>,
  options: {
    enabled?: boolean
    refetchInterval?: number
    onSuccess?: (data: T) => void
    onError?: (error: Error) => void
  } = {},
): UseDataFetchResult<T> {
  const [data, setData] = useState<T | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<Error | null>(null)

  const fetchData = useCallback(async () => {
    setLoading(true)
    setError(null)

    try {
      const result = await fetcher()
      setData(result)
      options.onSuccess?.(result)
    } catch (err) {
      const error = err as Error
      setError(error)
      options.onError?.(error)
    } finally {
      setLoading(false)
    }
  }, [fetcher, options.onSuccess, options.onError])

  const mutate = useCallback((newData: T) => {
    setData(newData)
  }, [])

  useEffect(() => {
    if (options.enabled !== false) {
      fetchData()
    }
  }, [fetchData, options.enabled])

  useEffect(() => {
    if (options.refetchInterval && options.enabled !== false) {
      const interval = setInterval(fetchData, options.refetchInterval)
      return () => clearInterval(interval)
    }
  }, [fetchData, options.refetchInterval, options.enabled])

  return {
    data,
    loading,
    error,
    refetch: fetchData,
    mutate,
  }
}

// Render props component
interface DataFetcherProps<T> {
  fetcher: () => Promise<T>
  fallback?: React.ReactNode
  errorFallback?: (error: Error, retry: () => void) => React.ReactNode
  children: (result: UseDataFetchResult<T>) => React.ReactNode
}

function DataFetcher<T>({ fetcher, fallback, errorFallback, children }: DataFetcherProps<T>) {
  const result = useDataFetch(fetcher)

  if (result.loading && !result.data) {
    return <>{fallback || <LoadingSpinner />}</>
  }

  if (result.error && !result.data) {
    return (
      <>
        {errorFallback?.(result.error, result.refetch) || (
          <ErrorDisplay error={result.error} onRetry={result.refetch} />
        )}
      </>
    )
  }

  return <>{children(result)}</>
}

// Usage
function UserProfile({ userId }: { userId: string }) {
  return (
    <DataFetcher
      fetcher={() => fetchUser(userId)}
      fallback={<UserSkeleton />}
      errorFallback={(error, retry) => <ErrorBoundary error={error} onRetry={retry} />}>
      {({ data: user, loading, refetch, mutate }) => (
        <div>
          <UserHeader user={user!} onUpdate={updatedUser => mutate(updatedUser)} />
          <UserDetails user={user!} />
          <RefreshButton onClick={refetch} loading={loading} />
        </div>
      )}
    </DataFetcher>
  )
}
```

#### **Higher-Order Component (HOC) Patterns**

```tsx
// Authentication HOC
interface WithAuthenticationProps {
  user: User | null
  isAuthenticated: boolean
  login: (credentials: LoginCredentials) => Promise<void>
  logout: () => Promise<void>
}

function withAuthentication<P extends WithAuthenticationProps>(
  WrappedComponent: React.ComponentType<P>,
  options: {
    requireAuth?: boolean
    redirectTo?: string
    fallback?: React.ComponentType
  } = {},
) {
  const AuthenticatedComponent = (props: Omit<P, keyof WithAuthenticationProps>) => {
    const { user, isAuthenticated, login, logout } = useAuth()

    // Redirect if authentication is required but user is not authenticated
    if (options.requireAuth && !isAuthenticated) {
      if (options.redirectTo) {
        redirect(options.redirectTo)
        return null
      }

      if (options.fallback) {
        const FallbackComponent = options.fallback
        return <FallbackComponent />
      }

      return <LoginForm onLogin={login} />
    }

    const authProps: WithAuthenticationProps = {
      user,
      isAuthenticated,
      login,
      logout,
    }

    return <WrappedComponent {...(props as P)} {...authProps} />
  }

  AuthenticatedComponent.displayName = `withAuthentication(${
    WrappedComponent.displayName || WrappedComponent.name
  })`

  return AuthenticatedComponent
}

// Performance HOC
function withPerformanceMonitoring<P extends Record<string, any>>(
  WrappedComponent: React.ComponentType<P>,
  componentName: string,
) {
  const PerformanceMonitoredComponent = React.forwardRef<any, P>((props, ref) => {
    const renderStartTime = useRef<number>()
    const [renderTime, setRenderTime] = useState<number>(0)

    useEffect(() => {
      renderStartTime.current = performance.now()
    })

    useLayoutEffect(() => {
      if (renderStartTime.current) {
        const renderDuration = performance.now() - renderStartTime.current
        setRenderTime(renderDuration)

        // Report performance metrics
        if (renderDuration > 16) {
          // > 16ms might cause frame drops
          console.warn(`Slow render detected: ${componentName} took ${renderDuration.toFixed(2)}ms`)
        }

        // Send to analytics
        analytics.track('component_render_performance', {
          component: componentName,
          renderTime: renderDuration,
          props: Object.keys(props),
        })
      }
    })

    return (
      <React.Profiler
        id={componentName}
        onRender={(id, phase, actualDuration) => {
          analytics.track('component_profiler', {
            id,
            phase,
            actualDuration,
          })
        }}>
        <WrappedComponent ref={ref} {...props} />
      </React.Profiler>
    )
  })

  PerformanceMonitoredComponent.displayName = `withPerformanceMonitoring(${
    WrappedComponent.displayName || WrappedComponent.name
  })`

  return PerformanceMonitoredComponent
}

// Usage
const AuthenticatedDashboard = withAuthentication(Dashboard, {
  requireAuth: true,
  fallback: DashboardSkeleton,
})

const MonitoredUserProfile = withPerformanceMonitoring(UserProfile, 'UserProfile')
```

### State Management Patterns

#### **Zustand with TypeScript and DevTools**

```tsx
// Store interface
interface UserStore {
  // State
  user: User | null
  users: User[]
  loading: boolean
  error: string | null

  // Actions
  setUser: (user: User | null) => void
  setUsers: (users: User[]) => void
  addUser: (user: User) => void
  updateUser: (id: string, updates: Partial<User>) => void
  removeUser: (id: string) => void
  setLoading: (loading: boolean) => void
  setError: (error: string | null) => void

  // Async actions
  fetchUsers: () => Promise<void>
  createUser: (userData: CreateUserData) => Promise<User>
  updateUserAsync: (id: string, updates: Partial<User>) => Promise<void>
  deleteUser: (id: string) => Promise<void>

  // Computed values
  getUserById: (id: string) => User | undefined
  getActiveUsers: () => User[]
  getUserCount: () => number
}

// Store implementation
const useUserStore = create<UserStore>()(
  devtools(
    persist(
      (set, get) => ({
        // Initial state
        user: null,
        users: [],
        loading: false,
        error: null,

        // Synchronous actions
        setUser: user => set({ user }, false, 'setUser'),

        setUsers: users => set({ users }, false, 'setUsers'),

        addUser: user => set(state => ({ users: [...state.users, user] }), false, 'addUser'),

        updateUser: (id, updates) =>
          set(
            state => ({
              users: state.users.map(user => (user.id === id ? { ...user, ...updates } : user)),
            }),
            false,
            'updateUser',
          ),

        removeUser: id =>
          set(
            state => ({
              users: state.users.filter(user => user.id !== id),
            }),
            false,
            'removeUser',
          ),

        setLoading: loading => set({ loading }, false, 'setLoading'),

        setError: error => set({ error }, false, 'setError'),

        // Async actions
        fetchUsers: async () => {
          const { setLoading, setError, setUsers } = get()

          setLoading(true)
          setError(null)

          try {
            const users = await userService.getUsers()
            setUsers(users)
          } catch (error) {
            setError((error as Error).message)
          } finally {
            setLoading(false)
          }
        },

        createUser: async userData => {
          const { setLoading, setError, addUser } = get()

          setLoading(true)
          setError(null)

          try {
            const user = await userService.createUser(userData)
            addUser(user)
            return user
          } catch (error) {
            setError((error as Error).message)
            throw error
          } finally {
            setLoading(false)
          }
        },

        updateUserAsync: async (id, updates) => {
          const { setLoading, setError, updateUser } = get()

          setLoading(true)
          setError(null)

          try {
            const updatedUser = await userService.updateUser(id, updates)
            updateUser(id, updatedUser)
          } catch (error) {
            setError((error as Error).message)
            throw error
          } finally {
            setLoading(false)
          }
        },

        deleteUser: async id => {
          const { setLoading, setError, removeUser } = get()

          setLoading(true)
          setError(null)

          try {
            await userService.deleteUser(id)
            removeUser(id)
          } catch (error) {
            setError((error as Error).message)
            throw error
          } finally {
            setLoading(false)
          }
        },

        // Computed values (selectors)
        getUserById: id => {
          const { users } = get()
          return users.find(user => user.id === id)
        },

        getActiveUsers: () => {
          const { users } = get()
          return users.filter(user => user.status === 'active')
        },

        getUserCount: () => {
          const { users } = get()
          return users.length
        },
      }),
      {
        name: 'user-store',
        partialize: state => ({
          user: state.user,
          users: state.users,
        }),
      },
    ),
    {
      name: 'user-store',
    },
  ),
)

// Selectors for optimized re-renders
export const useUser = () => useUserStore(state => state.user)
export const useUsers = () => useUserStore(state => state.users)
export const useUserLoading = () => useUserStore(state => state.loading)
export const useUserError = () => useUserStore(state => state.error)
export const useUserActions = () =>
  useUserStore(state => ({
    fetchUsers: state.fetchUsers,
    createUser: state.createUser,
    updateUserAsync: state.updateUserAsync,
    deleteUser: state.deleteUser,
    setUser: state.setUser,
    setError: state.setError,
  }))

// Custom hooks for specific use cases
export const useUserById = (id: string) => useUserStore(state => state.getUserById(id))

export const useActiveUsers = () => useUserStore(state => state.getActiveUsers())

export const useUserCount = () => useUserStore(state => state.getUserCount())
```

## Next.js Implementation Patterns

### App Router with TypeScript

#### **Advanced Route Handlers**

```typescript
// app/api/users/route.ts - GET and POST handlers
import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { auth } from '@/lib/auth'
import { userService } from '@/lib/services/user-service'
import { ApiError, handleApiError } from '@/lib/api-error'
import { rateLimit } from '@/lib/rate-limit'

// Validation schemas
const CreateUserSchema = z.object({
  email: z.string().email(),
  name: z.string().min(2).max(50),
  role: z.enum(['user', 'admin']).optional().default('user'),
})

const GetUsersQuerySchema = z.object({
  page: z.coerce.number().min(1).default(1),
  limit: z.coerce.number().min(1).max(100).default(20),
  search: z.string().optional(),
  role: z.enum(['user', 'admin']).optional(),
  sortBy: z.enum(['name', 'email', 'createdAt']).default('createdAt'),
  sortOrder: z.enum(['asc', 'desc']).default('desc'),
})

// GET /api/users
export async function GET(request: NextRequest) {
  try {
    // Rate limiting
    const rateLimitResult = await rateLimit.check(request, 'api_users_get', {
      limit: 100,
      window: 60000, // 1 minute
    })

    if (!rateLimitResult.success) {
      return NextResponse.json(
        { error: 'Rate limit exceeded' },
        {
          status: 429,
          headers: {
            'X-RateLimit-Limit': rateLimitResult.limit.toString(),
            'X-RateLimit-Remaining': rateLimitResult.remaining.toString(),
            'X-RateLimit-Reset': rateLimitResult.reset.toString(),
          },
        },
      )
    }

    // Authentication
    const session = await auth.getSession(request)
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Authorization
    if (!auth.hasPermission(session.user, 'users:read')) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    // Parse and validate query parameters
    const url = new URL(request.url)
    const queryParams = Object.fromEntries(url.searchParams)
    const validatedQuery = GetUsersQuerySchema.parse(queryParams)

    // Fetch users with filters
    const result = await userService.getUsers({
      page: validatedQuery.page,
      limit: validatedQuery.limit,
      search: validatedQuery.search,
      role: validatedQuery.role,
      sortBy: validatedQuery.sortBy,
      sortOrder: validatedQuery.sortOrder,
    })

    // Return success response with pagination metadata
    return NextResponse.json({
      data: result.users,
      pagination: {
        page: result.page,
        limit: result.limit,
        total: result.total,
        totalPages: result.totalPages,
        hasMore: result.hasMore,
      },
    })
  } catch (error) {
    return handleApiError(error)
  }
}

// POST /api/users
export async function POST(request: NextRequest) {
  try {
    // Rate limiting for creation (stricter)
    const rateLimitResult = await rateLimit.check(request, 'api_users_post', {
      limit: 10,
      window: 60000, // 1 minute
    })

    if (!rateLimitResult.success) {
      return NextResponse.json({ error: 'Rate limit exceeded' }, { status: 429 })
    }

    // Authentication
    const session = await auth.getSession(request)
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Authorization
    if (!auth.hasPermission(session.user, 'users:create')) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    // Parse and validate request body
    const body = await request.json()
    const validatedData = CreateUserSchema.parse(body)

    // Create user
    const user = await userService.createUser({
      ...validatedData,
      createdBy: session.user.id,
    })

    // Return created user
    return NextResponse.json({ data: user }, { status: 201 })
  } catch (error) {
    return handleApiError(error)
  }
}
```

#### **Dynamic Route Handlers with Validation**

```typescript
// app/api/users/[id]/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'

// Route parameters validation
const RouteParamsSchema = z.object({
  id: z.string().uuid(),
})

const UpdateUserSchema = z
  .object({
    name: z.string().min(2).max(50).optional(),
    email: z.string().email().optional(),
    role: z.enum(['user', 'admin']).optional(),
    status: z.enum(['active', 'inactive', 'suspended']).optional(),
  })
  .refine(data => Object.keys(data).length > 0, {
    message: 'At least one field must be provided for update',
  })

// GET /api/users/[id]
export async function GET(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    // Validate route parameters
    const { id } = RouteParamsSchema.parse(params)

    // Authentication
    const session = await auth.getSession(request)
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Get user
    const user = await userService.getUserById(id)

    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 })
    }

    // Authorization - users can access their own data, admins can access any
    if (user.id !== session.user.id && !auth.hasRole(session.user, 'admin')) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    // Return user data (filtered based on permissions)
    const userData = auth.hasRole(session.user, 'admin')
      ? user
      : userService.filterSensitiveData(user)

    return NextResponse.json({ data: userData })
  } catch (error) {
    return handleApiError(error)
  }
}

// PATCH /api/users/[id]
export async function PATCH(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    // Validate route parameters
    const { id } = RouteParamsSchema.parse(params)

    // Authentication
    const session = await auth.getSession(request)
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Check if user exists
    const existingUser = await userService.getUserById(id)
    if (!existingUser) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 })
    }

    // Authorization
    const canUpdate =
      existingUser.id === session.user.id || auth.hasPermission(session.user, 'users:update')

    if (!canUpdate) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    // Parse and validate request body
    const body = await request.json()
    const validatedData = UpdateUserSchema.parse(body)

    // Additional authorization for role changes
    if (validatedData.role && !auth.hasRole(session.user, 'admin')) {
      return NextResponse.json(
        { error: 'Insufficient permissions to change user role' },
        { status: 403 },
      )
    }

    // Update user
    const updatedUser = await userService.updateUser(id, validatedData)

    return NextResponse.json({ data: updatedUser })
  } catch (error) {
    return handleApiError(error)
  }
}

// DELETE /api/users/[id]
export async function DELETE(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    // Validate route parameters
    const { id } = RouteParamsSchema.parse(params)

    // Authentication
    const session = await auth.getSession(request)
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Authorization
    if (!auth.hasPermission(session.user, 'users:delete')) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    // Check if user exists
    const existingUser = await userService.getUserById(id)
    if (!existingUser) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 })
    }

    // Prevent self-deletion
    if (existingUser.id === session.user.id) {
      return NextResponse.json({ error: 'Cannot delete your own account' }, { status: 400 })
    }

    // Delete user
    await userService.deleteUser(id)

    return NextResponse.json({ message: 'User deleted successfully' }, { status: 200 })
  } catch (error) {
    return handleApiError(error)
  }
}
```

#### **Server Components with Data Fetching**

```tsx
// app/users/page.tsx - Server Component
import { Suspense } from 'react'
import { auth } from '@/lib/auth'
import { userService } from '@/lib/services/user-service'
import { UsersList } from '@/components/users/users-list'
import { UsersFilters } from '@/components/users/users-filters'
import { UsersSkeleton } from '@/components/users/users-skeleton'
import { CreateUserButton } from '@/components/users/create-user-button'
import { redirect } from 'next/navigation'

interface PageProps {
  searchParams: {
    page?: string
    search?: string
    role?: string
    sortBy?: string
    sortOrder?: string
  }
}

export default async function UsersPage({ searchParams }: PageProps) {
  // Server-side authentication
  const session = await auth.getSession()

  if (!session) {
    redirect('/login')
  }

  if (!auth.hasPermission(session.user, 'users:read')) {
    redirect('/unauthorized')
  }

  // Parse search parameters
  const page = parseInt(searchParams.page || '1')
  const search = searchParams.search
  const role = searchParams.role as 'user' | 'admin' | undefined
  const sortBy = searchParams.sortBy || 'createdAt'
  const sortOrder = searchParams.sortOrder || 'desc'

  return (
    <div className='container mx-auto py-8'>
      <div className='flex justify-between items-center mb-6'>
        <h1 className='text-3xl font-bold'>Users Management</h1>
        {auth.hasPermission(session.user, 'users:create') && <CreateUserButton />}
      </div>

      <div className='mb-6'>
        <UsersFilters
          initialSearch={search}
          initialRole={role}
          initialSortBy={sortBy}
          initialSortOrder={sortOrder}
        />
      </div>

      <Suspense fallback={<UsersSkeleton />}>
        <UsersData page={page} search={search} role={role} sortBy={sortBy} sortOrder={sortOrder} />
      </Suspense>
    </div>
  )
}

// Separate data fetching component for better loading states
async function UsersData({
  page,
  search,
  role,
  sortBy,
  sortOrder,
}: {
  page: number
  search?: string
  role?: 'user' | 'admin'
  sortBy: string
  sortOrder: string
}) {
  try {
    const result = await userService.getUsers({
      page,
      limit: 20,
      search,
      role,
      sortBy,
      sortOrder,
    })

    return <UsersList users={result.users} pagination={result.pagination} currentPage={page} />
  } catch (error) {
    console.error('Error fetching users:', error)

    return (
      <div className='text-center py-8'>
        <p className='text-red-600 mb-4'>Failed to load users</p>
        <button
          onClick={() => window.location.reload()}
          className='px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600'>
          Retry
        </button>
      </div>
    )
  }
}
```

#### **Middleware for Authentication and Authorization**

```typescript
// middleware.ts
import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { auth } from '@/lib/auth'
import { rateLimit } from '@/lib/rate-limit'

// Define protected routes and their required permissions
const protectedRoutes = {
  '/admin': ['admin'],
  '/users': ['users:read'],
  '/settings': ['settings:manage'],
  '/api/users': ['users:read'],
  '/api/admin': ['admin'],
}

const publicRoutes = [
  '/login',
  '/register',
  '/forgot-password',
  '/reset-password',
  '/',
  '/about',
  '/contact',
]

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl

  // Skip middleware for static files and internal Next.js routes
  if (
    pathname.startsWith('/_next/') ||
    pathname.startsWith('/api/auth/') ||
    pathname.match(/\.(ico|png|jpg|jpeg|gif|svg|css|js|woff|woff2|ttf|eot)$/)
  ) {
    return NextResponse.next()
  }

  // Rate limiting for API routes
  if (pathname.startsWith('/api/')) {
    const rateLimitResult = await rateLimit.check(request, 'api_general', {
      limit: 200,
      window: 60000, // 1 minute
    })

    if (!rateLimitResult.success) {
      return NextResponse.json(
        { error: 'Rate limit exceeded' },
        {
          status: 429,
          headers: {
            'X-RateLimit-Limit': rateLimitResult.limit.toString(),
            'X-RateLimit-Remaining': rateLimitResult.remaining.toString(),
            'X-RateLimit-Reset': rateLimitResult.reset.toString(),
          },
        },
      )
    }
  }

  // Check if route is public
  if (publicRoutes.includes(pathname)) {
    return NextResponse.next()
  }

  // Get session
  const session = await auth.getSession(request)

  // Redirect to login if no session and route is protected
  if (!session) {
    const loginUrl = new URL('/login', request.url)
    loginUrl.searchParams.set('from', pathname)
    return NextResponse.redirect(loginUrl)
  }

  // Check permissions for protected routes
  for (const [route, permissions] of Object.entries(protectedRoutes)) {
    if (pathname.startsWith(route)) {
      const hasPermission = permissions.some(
        permission =>
          auth.hasPermission(session.user, permission) || auth.hasRole(session.user, permission),
      )

      if (!hasPermission) {
        return NextResponse.redirect(new URL('/unauthorized', request.url))
      }
      break
    }
  }

  // Add security headers
  const response = NextResponse.next()

  response.headers.set('X-Content-Type-Options', 'nosniff')
  response.headers.set('X-Frame-Options', 'DENY')
  response.headers.set('X-XSS-Protection', '1; mode=block')
  response.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin')

  // Add user info to headers for server components
  response.headers.set('x-user-id', session.user.id)
  response.headers.set('x-user-role', session.user.role)

  return response
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
}
```

## Node.js Backend Patterns

### Express.js with TypeScript Architecture

#### **Layered Architecture Implementation**

```typescript
// src/types/express.d.ts - Extend Express types
declare global {
  namespace Express {
    interface Request {
      user?: User
      requestId: string
      startTime: number
    }
  }
}

// src/controllers/user.controller.ts
import { Request, Response, NextFunction } from 'express'
import { inject, injectable } from 'inversify'
import { UserService } from '@/services/user.service'
import { CreateUserDto, UpdateUserDto, GetUsersQueryDto } from '@/dto/user.dto'
import { validateDto } from '@/middleware/validation.middleware'
import { ApiResponse } from '@/types/api-response'
import { PaginatedResponse } from '@/types/pagination'

@injectable()
export class UserController {
  constructor(@inject('UserService') private userService: UserService) {}

  @validateDto(GetUsersQueryDto)
  async getUsers(
    req: Request<{}, PaginatedResponse<User>, {}, GetUsersQueryDto>,
    res: Response<PaginatedResponse<User>>,
    next: NextFunction,
  ): Promise<void> {
    try {
      const query = req.query
      const result = await this.userService.getUsers(query)

      res.status(200).json({
        success: true,
        data: result.users,
        pagination: {
          page: result.page,
          limit: result.limit,
          total: result.total,
          totalPages: result.totalPages,
          hasMore: result.hasMore,
        },
      })
    } catch (error) {
      next(error)
    }
  }

  async getUserById(
    req: Request<{ id: string }>,
    res: Response<ApiResponse<User>>,
    next: NextFunction,
  ): Promise<void> {
    try {
      const { id } = req.params
      const user = await this.userService.getUserById(id)

      if (!user) {
        return res.status(404).json({
          success: false,
          error: {
            code: 'USER_NOT_FOUND',
            message: 'User not found',
          },
        })
      }

      res.status(200).json({
        success: true,
        data: user,
      })
    } catch (error) {
      next(error)
    }
  }

  @validateDto(CreateUserDto)
  async createUser(
    req: Request<{}, ApiResponse<User>, CreateUserDto>,
    res: Response<ApiResponse<User>>,
    next: NextFunction,
  ): Promise<void> {
    try {
      const userData = req.body
      const user = await this.userService.createUser({
        ...userData,
        createdBy: req.user!.id,
      })

      res.status(201).json({
        success: true,
        data: user,
      })
    } catch (error) {
      next(error)
    }
  }

  @validateDto(UpdateUserDto)
  async updateUser(
    req: Request<{ id: string }, ApiResponse<User>, UpdateUserDto>,
    res: Response<ApiResponse<User>>,
    next: NextFunction,
  ): Promise<void> {
    try {
      const { id } = req.params
      const updates = req.body

      const user = await this.userService.updateUser(id, updates)

      res.status(200).json({
        success: true,
        data: user,
      })
    } catch (error) {
      next(error)
    }
  }

  async deleteUser(
    req: Request<{ id: string }>,
    res: Response<ApiResponse<null>>,
    next: NextFunction,
  ): Promise<void> {
    try {
      const { id } = req.params
      await this.userService.deleteUser(id)

      res.status(200).json({
        success: true,
        data: null,
        message: 'User deleted successfully',
      })
    } catch (error) {
      next(error)
    }
  }
}
```

#### **Service Layer with Business Logic**

```typescript
// src/services/user.service.ts
import { inject, injectable } from 'inversify'
import { UserRepository } from '@/repositories/user.repository'
import { EmailService } from '@/services/email.service'
import { PasswordService } from '@/services/password.service'
import { CacheService } from '@/services/cache.service'
import { EventBus } from '@/events/event-bus'
import { CreateUserData, UpdateUserData, GetUsersQuery, GetUsersResult } from '@/types/user.types'
import { UserNotFoundError, UserAlreadyExistsError, ValidationError } from '@/errors/user.errors'

@injectable()
export class UserService {
  constructor(
    @inject('UserRepository') private userRepository: UserRepository,
    @inject('EmailService') private emailService: EmailService,
    @inject('PasswordService') private passwordService: PasswordService,
    @inject('CacheService') private cacheService: CacheService,
    @inject('EventBus') private eventBus: EventBus,
  ) {}

  async getUsers(query: GetUsersQuery): Promise<GetUsersResult> {
    const cacheKey = `users:list:${JSON.stringify(query)}`

    // Try to get from cache first
    const cached = await this.cacheService.get<GetUsersResult>(cacheKey)
    if (cached) {
      return cached
    }

    const result = await this.userRepository.findMany(query)

    // Cache the result for 5 minutes
    await this.cacheService.set(cacheKey, result, 300)

    return result
  }

  async getUserById(id: string): Promise<User | null> {
    const cacheKey = `user:${id}`

    // Try cache first
    const cached = await this.cacheService.get<User>(cacheKey)
    if (cached) {
      return cached
    }

    const user = await this.userRepository.findById(id)

    if (user) {
      // Cache user for 10 minutes
      await this.cacheService.set(cacheKey, user, 600)
    }

    return user
  }

  async createUser(userData: CreateUserData): Promise<User> {
    // Validate business rules
    await this.validateCreateUser(userData)

    // Hash password
    const hashedPassword = await this.passwordService.hash(userData.password)

    // Create user
    const user = await this.userRepository.create({
      ...userData,
      password: hashedPassword,
    })

    // Emit event
    await this.eventBus.emit('user.created', {
      userId: user.id,
      email: user.email,
      createdBy: userData.createdBy,
    })

    // Send welcome email (async)
    this.emailService
      .sendWelcomeEmail(user.email, user.name)
      .catch(error => console.error('Failed to send welcome email:', error))

    // Invalidate relevant caches
    await this.invalidateUserCaches()

    return user
  }

  async updateUser(id: string, updates: UpdateUserData): Promise<User> {
    const existingUser = await this.getUserById(id)

    if (!existingUser) {
      throw new UserNotFoundError(`User with id ${id} not found`)
    }

    // Validate business rules
    await this.validateUpdateUser(id, updates)

    // Hash new password if provided
    if (updates.password) {
      updates.password = await this.passwordService.hash(updates.password)
    }

    // Update user
    const updatedUser = await this.userRepository.update(id, updates)

    // Emit event
    await this.eventBus.emit('user.updated', {
      userId: id,
      changes: updates,
      previousData: existingUser,
    })

    // Invalidate caches
    await this.cacheService.delete(`user:${id}`)
    await this.invalidateUserCaches()

    return updatedUser
  }

  async deleteUser(id: string): Promise<void> {
    const existingUser = await this.getUserById(id)

    if (!existingUser) {
      throw new UserNotFoundError(`User with id ${id} not found`)
    }

    // Delete user
    await this.userRepository.delete(id)

    // Emit event
    await this.eventBus.emit('user.deleted', {
      userId: id,
      userData: existingUser,
    })

    // Invalidate caches
    await this.cacheService.delete(`user:${id}`)
    await this.invalidateUserCaches()
  }

  private async validateCreateUser(userData: CreateUserData): Promise<void> {
    // Check if email already exists
    const existingUser = await this.userRepository.findByEmail(userData.email)
    if (existingUser) {
      throw new UserAlreadyExistsError('User with this email already exists')
    }

    // Additional business rule validations
    if (userData.role === 'admin' && !this.isValidAdminCreator(userData.createdBy)) {
      throw new ValidationError('Insufficient permissions to create admin user')
    }
  }

  private async validateUpdateUser(id: string, updates: UpdateUserData): Promise<void> {
    // Check email uniqueness if email is being updated
    if (updates.email) {
      const existingUser = await this.userRepository.findByEmail(updates.email)
      if (existingUser && existingUser.id !== id) {
        throw new UserAlreadyExistsError('User with this email already exists')
      }
    }
  }

  private async invalidateUserCaches(): Promise<void> {
    const pattern = 'users:list:*'
    await this.cacheService.deleteByPattern(pattern)
  }

  private isValidAdminCreator(creatorId: string): boolean {
    // Implement admin creation validation logic
    return true
  }
}
```

This comprehensive framework implementation patterns guide provides enterprise-grade patterns for React, Next.js, and Node.js development, ensuring scalable, maintainable, and performant applications through systematic application of proven architectural patterns.

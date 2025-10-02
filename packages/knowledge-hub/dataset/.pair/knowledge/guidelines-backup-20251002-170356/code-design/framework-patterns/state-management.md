# 🗂️ State Management

**Focus**: State management patterns, Zustand integration, and data flow architecture

Comprehensive guidelines for managing application state using Zustand, React Query, and modern state management patterns for scalable frontend applications.

## 🎯 State Management Architecture

### State Layer Organization

```typescript
// ✅ State management structure
export interface AppState {
  // User state
  user: UserState
  // UI state
  ui: UIState
  // Feature-specific state
  products: ProductState
  cart: CartState
  notifications: NotificationState
}

interface UserState {
  currentUser: User | null
  preferences: UserPreferences
  isAuthenticated: boolean
  permissions: Permission[]
}

interface UIState {
  theme: 'light' | 'dark' | 'system'
  sidebarOpen: boolean
  modals: Record<string, boolean>
  loading: Record<string, boolean>
}
```

## 🏪 Zustand Store Patterns

### 1. Modular Store Structure

```typescript
// ✅ User store slice
interface UserSlice {
  user: User | null
  isAuthenticated: boolean
  login: (credentials: LoginCredentials) => Promise<void>
  logout: () => Promise<void>
  updateProfile: (profile: Partial<User>) => Promise<void>
  refreshToken: () => Promise<void>
}

export const createUserSlice: StateCreator<AppState, [], [], UserSlice> = (set, get) => ({
  user: null,
  isAuthenticated: false,

  login: async credentials => {
    try {
      set(state => ({ ui: { ...state.ui, loading: { ...state.ui.loading, login: true } } }))

      const { user, token } = await authApi.login(credentials)

      // Store token
      tokenStorage.setToken(token)

      set(state => ({
        user: { ...state.user, user, isAuthenticated: true },
        ui: { ...state.ui, loading: { ...state.ui.loading, login: false } },
      }))
    } catch (error) {
      set(state => ({ ui: { ...state.ui, loading: { ...state.ui.loading, login: false } } }))
      throw error
    }
  },

  logout: async () => {
    try {
      await authApi.logout()
    } finally {
      tokenStorage.removeToken()
      set(state => ({
        user: { ...state.user, user: null, isAuthenticated: false },
      }))
    }
  },

  updateProfile: async profile => {
    const currentUser = get().user.user
    if (!currentUser) throw new Error('No user logged in')

    const optimisticUpdate = { ...currentUser, ...profile }

    // Optimistic update
    set(state => ({
      user: { ...state.user, user: optimisticUpdate },
    }))

    try {
      const updatedUser = await userApi.updateProfile(currentUser.id, profile)
      set(state => ({
        user: { ...state.user, user: updatedUser },
      }))
    } catch (error) {
      // Revert optimistic update
      set(state => ({
        user: { ...state.user, user: currentUser },
      }))
      throw error
    }
  },

  refreshToken: async () => {
    try {
      const token = await authApi.refreshToken()
      tokenStorage.setToken(token)
    } catch (error) {
      // Token refresh failed, logout user
      get().user.logout()
      throw error
    }
  },
})

// ✅ UI store slice
interface UISlice {
  theme: 'light' | 'dark' | 'system'
  sidebarOpen: boolean
  modals: Record<string, boolean>
  loading: Record<string, boolean>
  setTheme: (theme: 'light' | 'dark' | 'system') => void
  toggleSidebar: () => void
  openModal: (modalId: string) => void
  closeModal: (modalId: string) => void
  setLoading: (key: string, loading: boolean) => void
}

export const createUISlice: StateCreator<AppState, [], [], UISlice> = set => ({
  theme: 'system',
  sidebarOpen: true,
  modals: {},
  loading: {},

  setTheme: theme => {
    localStorage.setItem('theme', theme)
    set(state => ({ ui: { ...state.ui, theme } }))
  },

  toggleSidebar: () =>
    set(state => ({
      ui: { ...state.ui, sidebarOpen: !state.ui.sidebarOpen },
    })),

  openModal: modalId =>
    set(state => ({
      ui: { ...state.ui, modals: { ...state.ui.modals, [modalId]: true } },
    })),

  closeModal: modalId =>
    set(state => ({
      ui: { ...state.ui, modals: { ...state.ui.modals, [modalId]: false } },
    })),

  setLoading: (key, loading) =>
    set(state => ({
      ui: { ...state.ui, loading: { ...state.ui.loading, [key]: loading } },
    })),
})
```

### 2. Combined Store

```typescript
// ✅ Main store combining all slices
export const useAppStore = create<AppState>()(
  devtools(
    persist(
      (...args) => ({
        user: createUserSlice(...args),
        ui: createUISlice(...args),
        products: createProductSlice(...args),
        cart: createCartSlice(...args),
        notifications: createNotificationSlice(...args),
      }),
      {
        name: 'app-storage',
        partialize: state => ({
          user: {
            user: state.user.user,
            isAuthenticated: state.user.isAuthenticated,
          },
          ui: {
            theme: state.ui.theme,
            sidebarOpen: state.ui.sidebarOpen,
          },
        }),
      },
    ),
  ),
)

// ✅ Typed selectors
export const useUser = () => useAppStore(state => state.user.user)
export const useIsAuthenticated = () => useAppStore(state => state.user.isAuthenticated)
export const useTheme = () => useAppStore(state => state.ui.theme)
export const useLoading = (key: string) => useAppStore(state => state.ui.loading[key] || false)

// ✅ Actions hooks
export const useUserActions = () =>
  useAppStore(state => ({
    login: state.user.login,
    logout: state.user.logout,
    updateProfile: state.user.updateProfile,
  }))

export const useUIActions = () =>
  useAppStore(state => ({
    setTheme: state.ui.setTheme,
    toggleSidebar: state.ui.toggleSidebar,
    openModal: state.ui.openModal,
    closeModal: state.ui.closeModal,
  }))
```

## 🔄 Server State with TanStack Query

### Query Configuration

```typescript
// ✅ Query client setup
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { ReactQueryDevtools } from '@tanstack/react-query-devtools'

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 5 * 60 * 1000, // 5 minutes
      gcTime: 10 * 60 * 1000, // 10 minutes (formerly cacheTime)
      retry: (failureCount, error) => {
        if (error instanceof Error && error.message.includes('401')) {
          return false // Don't retry unauthorized errors
        }
        return failureCount < 3
      },
      refetchOnWindowFocus: false,
    },
    mutations: {
      retry: 1,
    },
  },
})

export const QueryProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <QueryClientProvider client={queryClient}>
    {children}
    <ReactQueryDevtools initialIsOpen={false} />
  </QueryClientProvider>
)
```

### Custom Query Hooks

```typescript
// ✅ User queries
export const useUserQuery = (userId: string) => {
  return useQuery({
    queryKey: ['user', userId],
    queryFn: () => userApi.getUser(userId),
    enabled: !!userId,
    staleTime: 5 * 60 * 1000,
  })
}

export const useUsersQuery = (filters?: UserFilters) => {
  return useQuery({
    queryKey: ['users', filters],
    queryFn: () => userApi.getUsers(filters),
    keepPreviousData: true,
  })
}

// ✅ Product queries with infinite loading
export const useProductsInfiniteQuery = (category?: string) => {
  return useInfiniteQuery({
    queryKey: ['products', 'infinite', category],
    queryFn: ({ pageParam = 0 }) =>
      productApi.getProducts({
        page: pageParam,
        category,
        limit: 20,
      }),
    getNextPageParam: (lastPage, allPages) => {
      return lastPage.hasMore ? allPages.length : undefined
    },
    initialPageParam: 0,
  })
}

// ✅ Search with debouncing
export const useProductSearchQuery = (searchTerm: string) => {
  const debouncedSearchTerm = useDebounce(searchTerm, 300)

  return useQuery({
    queryKey: ['products', 'search', debouncedSearchTerm],
    queryFn: () => productApi.searchProducts(debouncedSearchTerm),
    enabled: debouncedSearchTerm.length >= 2,
    staleTime: 30 * 1000, // 30 seconds for search results
  })
}
```

### Mutation Patterns

```typescript
// ✅ User mutations with optimistic updates
export const useUpdateUserMutation = () => {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({ userId, updates }: { userId: string; updates: Partial<User> }) =>
      userApi.updateUser(userId, updates),

    onMutate: async ({ userId, updates }) => {
      // Cancel outgoing refetches
      await queryClient.cancelQueries({ queryKey: ['user', userId] })

      // Snapshot previous value
      const previousUser = queryClient.getQueryData<User>(['user', userId])

      // Optimistically update
      if (previousUser) {
        queryClient.setQueryData<User>(['user', userId], {
          ...previousUser,
          ...updates,
        })
      }

      return { previousUser }
    },

    onError: (err, { userId }, context) => {
      // Rollback on error
      if (context?.previousUser) {
        queryClient.setQueryData(['user', userId], context.previousUser)
      }
    },

    onSettled: (data, error, { userId }) => {
      // Always refetch after error or success
      queryClient.invalidateQueries({ queryKey: ['user', userId] })
    },
  })
}

// ✅ Cart mutations
export const useAddToCartMutation = () => {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (item: CartItem) => cartApi.addItem(item),

    onSuccess: () => {
      // Invalidate and refetch cart data
      queryClient.invalidateQueries({ queryKey: ['cart'] })

      // Show success notification
      toast.success('Item added to cart')
    },

    onError: error => {
      toast.error('Failed to add item to cart')
    },
  })
}
```

## 🔄 State Synchronization

### Real-time Updates

```typescript
// ✅ WebSocket integration with React Query
export const useRealtimeSync = () => {
  const queryClient = useQueryClient()

  useEffect(() => {
    const ws = new WebSocket(process.env.NEXT_PUBLIC_WS_URL!)

    ws.onmessage = event => {
      const message = JSON.parse(event.data)

      switch (message.type) {
        case 'USER_UPDATED':
          queryClient.invalidateQueries({
            queryKey: ['user', message.payload.userId],
          })
          break

        case 'PRODUCT_UPDATED':
          queryClient.setQueryData<Product>(
            ['product', message.payload.productId],
            message.payload.product,
          )
          break

        case 'CART_UPDATED':
          queryClient.invalidateQueries({ queryKey: ['cart'] })
          break
      }
    }

    return () => {
      ws.close()
    }
  }, [queryClient])
}

// ✅ Server-sent events for notifications
export const useNotificationStream = () => {
  const addNotification = useAppStore(state => state.notifications.add)

  useEffect(() => {
    const eventSource = new EventSource('/api/notifications/stream')

    eventSource.onmessage = event => {
      const notification = JSON.parse(event.data)
      addNotification(notification)
    }

    return () => {
      eventSource.close()
    }
  }, [addNotification])
}
```

### State Persistence

```typescript
// ✅ Advanced persistence configuration
const persistConfig = {
  name: 'app-storage',
  version: 1,
  migrate: (persistedState: any, version: number) => {
    if (version === 0) {
      // Migration from version 0 to 1
      return {
        ...persistedState,
        user: {
          ...persistedState.user,
          preferences: persistedState.user.settings, // Rename settings to preferences
        },
      }
    }
    return persistedState
  },
  partialize: (state: AppState) => ({
    user: {
      user: state.user.user,
      isAuthenticated: state.user.isAuthenticated,
      preferences: state.user.preferences,
    },
    ui: {
      theme: state.ui.theme,
      sidebarOpen: state.ui.sidebarOpen,
    },
    // Don't persist loading states or temporary data
  }),
  onRehydrateStorage: () => state => {
    if (state?.user.isAuthenticated) {
      // Refresh token on app load if user was authenticated
      state.user.refreshToken().catch(() => {
        state.user.logout()
      })
    }
  },
}
```

## 🧪 Testing State Management

```typescript
// ✅ Testing Zustand stores
import { renderHook, act } from '@testing-library/react'
import { useAppStore } from './store'

describe('User Store', () => {
  beforeEach(() => {
    useAppStore.setState({
      user: { user: null, isAuthenticated: false },
      ui: { loading: {} },
    })
  })

  it('logs in user successfully', async () => {
    const { result } = renderHook(() => useAppStore())

    const mockUser = { id: '1', name: 'John Doe', email: 'john@example.com' }

    // Mock API response
    jest.spyOn(authApi, 'login').mockResolvedValue({
      user: mockUser,
      token: 'mock-token',
    })

    await act(async () => {
      await result.current.user.login({
        email: 'john@example.com',
        password: 'password',
      })
    })

    expect(result.current.user.user).toEqual(mockUser)
    expect(result.current.user.isAuthenticated).toBe(true)
  })
})

// ✅ Testing React Query hooks
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

const createTestQueryClient = () =>
  new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  })

const wrapper = ({ children }: { children: React.ReactNode }) => (
  <QueryClientProvider client={createTestQueryClient()}>{children}</QueryClientProvider>
)

describe('useUserQuery', () => {
  it('fetches user data', async () => {
    const mockUser = { id: '1', name: 'John Doe' }
    jest.spyOn(userApi, 'getUser').mockResolvedValue(mockUser)

    const { result } = renderHook(() => useUserQuery('1'), { wrapper })

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true)
    })

    expect(result.current.data).toEqual(mockUser)
  })
})
```

## 🔗 Related Concepts

- **[React/Next.js Patterns](react-nextjs-patterns.md)** - Framework integration patterns
- **[Component Design](component-design.md)** - Component state management
- **[Performance Patterns](performance-patterns.md)** - State optimization patterns

## 📏 Implementation Guidelines

1. **Separation of Concerns**: Separate client state (Zustand) from server state (React Query)
2. **Modular Design**: Use store slices for different feature domains
3. **Type Safety**: Leverage TypeScript for all state definitions
4. **Optimistic Updates**: Implement optimistic updates for better UX
5. **Error Handling**: Handle state errors gracefully with proper fallbacks
6. **Performance**: Use selectors to prevent unnecessary re-renders
7. **Testing**: Test state logic independently from UI components
8. **Persistence**: Carefully choose what state to persist and migrate properly

---

_State Management provides robust patterns for managing both client and server state in modern React applications, ensuring scalable and maintainable data flow architecture._

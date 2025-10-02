# ⚛️ Frontend Stack

**Focus**: React 18+, Next.js 14+, and modern frontend architecture

Frontend technology stack configuration and standards for building performant, type-safe, and maintainable React applications with Next.js.

## 🏗️ Core Frontend Architecture

### Technology Stack Overview

```typescript
// Frontend Stack Configuration
const frontendStack = {
  framework: 'Next.js 14+',
  react: 'React 18+',
  language: 'TypeScript 5.3+',
  styling: {
    primary: 'Tailwind CSS 3.4+',
    components: 'Radix UI Primitives',
    utilities: 'Class Variance Authority (CVA)',
  },
  stateManagement: {
    server: 'TanStack Query (React Query)',
    client: 'Zustand',
    forms: 'React Hook Form + Zod',
  },
  routing: 'Next.js App Router',
  authentication: 'NextAuth.js v5',
  development: {
    devServer: 'Next.js Dev Server',
    bundler: 'Turbopack (Next.js)',
    testing: 'Vitest + Testing Library',
  },
} as const
```

### Project Structure

```
src/
├── app/                    # Next.js App Router
│   ├── (auth)/            # Route groups
│   ├── api/               # API routes
│   ├── globals.css        # Global styles
│   ├── layout.tsx         # Root layout
│   └── page.tsx          # Home page
├── components/            # Reusable components
│   ├── ui/               # Base UI components
│   ├── forms/            # Form components
│   └── layout/           # Layout components
├── hooks/                # Custom React hooks
├── lib/                  # Utility libraries
├── services/             # API service layer
├── stores/               # State management
├── styles/               # Additional styles
├── types/                # TypeScript types
└── utils/                # Utility functions
```

## ⚛️ React 18+ Configuration

### React Features Usage

```typescript
// ✅ React 18 features implementation
import {
  Suspense,
  lazy,
  startTransition,
  useDeferredValue,
  useId,
  useTransition,
  useSyncExternalStore,
} from 'react'

// ✅ Concurrent features
const DashboardPage = () => {
  const [isPending, startTransition] = useTransition()
  const [query, setQuery] = useState('')
  const deferredQuery = useDeferredValue(query)

  const handleSearch = (newQuery: string) => {
    startTransition(() => {
      setQuery(newQuery)
    })
  }

  return (
    <div>
      <SearchInput onChange={handleSearch} />
      <Suspense fallback={<SearchingSkeleton />}>
        <SearchResults query={deferredQuery} />
      </Suspense>
      {isPending && <SearchingIndicator />}
    </div>
  )
}

// ✅ Custom hooks with React 18 features
const useSearchResults = (query: string) => {
  const deferredQuery = useDeferredValue(query)

  return useQuery({
    queryKey: ['search', deferredQuery],
    queryFn: () => searchService.search(deferredQuery),
    enabled: deferredQuery.length > 0,
  })
}
```

### Component Design Standards

```typescript
// ✅ Component type definitions
type BaseComponentProps = {
  readonly className?: string
  readonly children?: React.ReactNode
}

type ButtonProps = BaseComponentProps & {
  readonly variant?: 'primary' | 'secondary' | 'outline'
  readonly size?: 'sm' | 'md' | 'lg'
  readonly disabled?: boolean
  readonly onClick?: () => void
}

// ✅ Component implementation with forwardRef
const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = 'primary', size = 'md', disabled, onClick, children, ...props }, ref) => {
    return (
      <button
        ref={ref}
        className={cn(buttonVariants({ variant, size }), className)}
        disabled={disabled}
        onClick={onClick}
        {...props}>
        {children}
      </button>
    )
  },
)
Button.displayName = 'Button'

// ✅ Higher-order component patterns
const withErrorBoundary = <P extends object>(Component: React.ComponentType<P>) => {
  const WrappedComponent = (props: P) => (
    <ErrorBoundary>
      <Component {...props} />
    </ErrorBoundary>
  )

  WrappedComponent.displayName = `withErrorBoundary(${Component.displayName || Component.name})`
  return WrappedComponent
}
```

## 🚀 Next.js 14+ Configuration

### App Router Structure

```typescript
// app/layout.tsx - Root layout
import type { Metadata } from 'next'
import { Inter } from 'next/font/google'
import { Providers } from './providers'
import './globals.css'

const inter = Inter({ subsets: ['latin'] })

export const metadata: Metadata = {
  title: 'Application Name',
  description: 'Application description',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang='en'>
      <body className={inter.className}>
        <Providers>{children}</Providers>
      </body>
    </html>
  )
}

// app/providers.tsx - Provider composition
;('use client')

import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { ReactQueryDevtools } from '@tanstack/react-query-devtools'
import { SessionProvider } from 'next-auth/react'
import { ThemeProvider } from 'next-themes'

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 5 * 60 * 1000, // 5 minutes
      gcTime: 10 * 60 * 1000, // 10 minutes
    },
  },
})

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <SessionProvider>
      <QueryClientProvider client={queryClient}>
        <ThemeProvider attribute='class' defaultTheme='system' enableSystem>
          {children}
        </ThemeProvider>
        <ReactQueryDevtools initialIsOpen={false} />
      </QueryClientProvider>
    </SessionProvider>
  )
}
```

### Server and Client Components

```typescript
// ✅ Server component (default)
// app/dashboard/page.tsx
import { getServerSession } from 'next-auth/next'
import { redirect } from 'next/navigation'
import { DashboardContent } from './dashboard-content'

export default async function DashboardPage() {
  const session = await getServerSession()

  if (!session) {
    redirect('/auth/signin')
  }

  // Server-side data fetching
  const initialData = await fetch(`${process.env.API_URL}/dashboard`, {
    headers: {
      Authorization: `Bearer ${session.accessToken}`,
    },
  }).then(res => res.json())

  return (
    <div>
      <h1>Dashboard</h1>
      <DashboardContent initialData={initialData} />
    </div>
  )
}

// ✅ Client component
// app/dashboard/dashboard-content.tsx
;('use client')

import { useQuery } from '@tanstack/react-query'
import { useDashboardStore } from '@/stores/dashboard'

type DashboardContentProps = {
  readonly initialData: DashboardData
}

export function DashboardContent({ initialData }: DashboardContentProps) {
  const { selectedPeriod, setSelectedPeriod } = useDashboardStore()

  const { data } = useQuery({
    queryKey: ['dashboard', selectedPeriod],
    queryFn: () => dashboardService.getData(selectedPeriod),
    initialData: selectedPeriod === 'week' ? initialData : undefined,
  })

  return (
    <div>
      <PeriodSelector value={selectedPeriod} onChange={setSelectedPeriod} />
      <DashboardCharts data={data} />
    </div>
  )
}
```

### API Routes with App Router

```typescript
// app/api/users/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth/next'
import { z } from 'zod'

const CreateUserSchema = z.object({
  name: z.string().min(1).max(100),
  email: z.string().email(),
  age: z.number().int().min(0).max(150).optional(),
})

export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession()
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const page = parseInt(searchParams.get('page') ?? '1')
    const limit = parseInt(searchParams.get('limit') ?? '10')

    const users = await userService.getUsers({ page, limit })

    return NextResponse.json({ users })
  } catch (error) {
    console.error('Error fetching users:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession()
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    const userData = CreateUserSchema.parse(body)

    const result = await userService.createUser(userData)

    if (!result.success) {
      return NextResponse.json({ error: result.error.message }, { status: 400 })
    }

    return NextResponse.json({ user: result.data }, { status: 201 })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Validation error', details: error.errors },
        { status: 400 },
      )
    }

    console.error('Error creating user:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
```

## 🎨 Styling Standards

### Tailwind CSS Configuration

```javascript
// tailwind.config.js
/** @type {import('tailwindcss').Config} */
module.exports = {
  darkMode: ['class'],
  content: [
    './pages/**/*.{ts,tsx}',
    './components/**/*.{ts,tsx}',
    './app/**/*.{ts,tsx}',
    './src/**/*.{ts,tsx}',
  ],
  theme: {
    container: {
      center: true,
      padding: '2rem',
      screens: {
        '2xl': '1400px',
      },
    },
    extend: {
      colors: {
        border: 'hsl(var(--border))',
        input: 'hsl(var(--input))',
        ring: 'hsl(var(--ring))',
        background: 'hsl(var(--background))',
        foreground: 'hsl(var(--foreground))',
        primary: {
          DEFAULT: 'hsl(var(--primary))',
          foreground: 'hsl(var(--primary-foreground))',
        },
        secondary: {
          DEFAULT: 'hsl(var(--secondary))',
          foreground: 'hsl(var(--secondary-foreground))',
        },
        destructive: {
          DEFAULT: 'hsl(var(--destructive))',
          foreground: 'hsl(var(--destructive-foreground))',
        },
        muted: {
          DEFAULT: 'hsl(var(--muted))',
          foreground: 'hsl(var(--muted-foreground))',
        },
        accent: {
          DEFAULT: 'hsl(var(--accent))',
          foreground: 'hsl(var(--accent-foreground))',
        },
        popover: {
          DEFAULT: 'hsl(var(--popover))',
          foreground: 'hsl(var(--popover-foreground))',
        },
        card: {
          DEFAULT: 'hsl(var(--card))',
          foreground: 'hsl(var(--card-foreground))',
        },
      },
      borderRadius: {
        lg: 'var(--radius)',
        md: 'calc(var(--radius) - 2px)',
        sm: 'calc(var(--radius) - 4px)',
      },
      keyframes: {
        'accordion-down': {
          from: { height: 0 },
          to: { height: 'var(--radix-accordion-content-height)' },
        },
        'accordion-up': {
          from: { height: 'var(--radix-accordion-content-height)' },
          to: { height: 0 },
        },
      },
      animation: {
        'accordion-down': 'accordion-down 0.2s ease-out',
        'accordion-up': 'accordion-up 0.2s ease-out',
      },
    },
  },
  plugins: [require('tailwindcss-animate')],
}
```

### Component Styling Patterns

```typescript
// ✅ Class Variance Authority (CVA) for component variants
import { cva, type VariantProps } from 'class-variance-authority'
import { cn } from '@/lib/utils'

const buttonVariants = cva(
  // Base styles
  'inline-flex items-center justify-center rounded-md text-sm font-medium ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50',
  {
    variants: {
      variant: {
        default: 'bg-primary text-primary-foreground hover:bg-primary/90',
        destructive: 'bg-destructive text-destructive-foreground hover:bg-destructive/90',
        outline: 'border border-input bg-background hover:bg-accent hover:text-accent-foreground',
        secondary: 'bg-secondary text-secondary-foreground hover:bg-secondary/80',
        ghost: 'hover:bg-accent hover:text-accent-foreground',
        link: 'text-primary underline-offset-4 hover:underline',
      },
      size: {
        default: 'h-10 px-4 py-2',
        sm: 'h-9 rounded-md px-3',
        lg: 'h-11 rounded-md px-8',
        icon: 'h-10 w-10',
      },
    },
    defaultVariants: {
      variant: 'default',
      size: 'default',
    },
  },
)

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : 'button'
    return (
      <Comp className={cn(buttonVariants({ variant, size, className }))} ref={ref} {...props} />
    )
  },
)
```

## 🔧 State Management

### TanStack Query Configuration

```typescript
// lib/query-client.ts
import { QueryClient } from '@tanstack/react-query'

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 5 * 60 * 1000, // 5 minutes
      gcTime: 10 * 60 * 1000, // 10 minutes (formerly cacheTime)
      retry: (failureCount, error) => {
        // Don't retry on 4xx errors except 408 (timeout)
        if (error instanceof Error && 'status' in error) {
          const status = error.status as number
          if (status >= 400 && status < 500 && status !== 408) {
            return false
          }
        }
        return failureCount < 3
      },
      refetchOnWindowFocus: false,
    },
    mutations: {
      retry: false,
    },
  },
})

// Custom hooks for common patterns
export const useApiQuery = <T>(
  queryKey: readonly unknown[],
  queryFn: () => Promise<T>,
  options?: UseQueryOptions<T>,
) => {
  return useQuery({
    queryKey,
    queryFn,
    ...options,
  })
}

export const useApiMutation = <TData, TVariables>(
  mutationFn: (variables: TVariables) => Promise<TData>,
  options?: UseMutationOptions<TData, Error, TVariables>,
) => {
  return useMutation({
    mutationFn,
    ...options,
  })
}
```

### Zustand Store Patterns

```typescript
// stores/user-store.ts
import { create } from 'zustand'
import { devtools, persist } from 'zustand/middleware'
import { immer } from 'zustand/middleware/immer'

type UserState = {
  readonly currentUser: User | null
  readonly preferences: UserPreferences
  readonly isLoading: boolean
}

type UserActions = {
  readonly setCurrentUser: (user: User | null) => void
  readonly updatePreferences: (preferences: Partial<UserPreferences>) => void
  readonly setLoading: (loading: boolean) => void
  readonly reset: () => void
}

type UserStore = UserState & UserActions

const initialState: UserState = {
  currentUser: null,
  preferences: {
    theme: 'system',
    language: 'en',
    notifications: true,
  },
  isLoading: false,
}

export const useUserStore = create<UserStore>()(
  devtools(
    persist(
      immer(set => ({
        ...initialState,

        setCurrentUser: user =>
          set(state => {
            state.currentUser = user
          }),

        updatePreferences: preferences =>
          set(state => {
            Object.assign(state.preferences, preferences)
          }),

        setLoading: loading =>
          set(state => {
            state.isLoading = loading
          }),

        reset: () =>
          set(state => {
            Object.assign(state, initialState)
          }),
      })),
      {
        name: 'user-store',
        partialize: state => ({
          preferences: state.preferences,
        }),
      },
    ),
    { name: 'UserStore' },
  ),
)
```

## 🔗 Related Configurations

- **[TypeScript Standards](typescript-standards.md)** - TypeScript configuration for frontend
- **[Build Tools](.pair/knowledge/guidelines/technical-standards/development-tools/build-tools.md)** - Next.js build optimization
- **[Testing Strategy](.pair/knowledge/guidelines/testing/testing-strategy)** - Frontend testing approach
- **[Component Design](.pair/knowledge/guidelines/code-design/framework-patterns/react-nextjs-patterns.md)** - React component patterns

## 🎯 Frontend Stack Checklist

- [ ] **Next.js 14+ configured** - App Router with latest features
- [ ] **React 18+ features** - Concurrent features implemented
- [ ] **TypeScript strict mode** - Full type safety enabled
- [ ] **Tailwind CSS setup** - Design system configured
- [ ] **TanStack Query configured** - Server state management
- [ ] **Zustand stores created** - Client state management
- [ ] **Component library** - Radix UI integrated
- [ ] **Authentication setup** - NextAuth.js configured
- [ ] **Testing environment** - Vitest and Testing Library
- [ ] **Development tools** - Hot reload and debugging

---

_This frontend stack provides a modern, performant, and maintainable foundation for React applications with excellent developer experience._

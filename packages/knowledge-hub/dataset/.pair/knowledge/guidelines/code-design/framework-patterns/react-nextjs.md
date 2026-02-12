# React & Next.js Patterns

## Overview

React with Next.js provides a powerful foundation for building modern web applications. This guide focuses on architectural patterns, design principles, and strategic decisions for React and Next.js development, emphasizing performance, scalability, and developer experience.

## Application Architecture Philosophy

### Full-Stack React Strategy

Next.js bridges the gap between frontend and backend development, enabling React developers to build complete applications with a unified technology stack.

**Server-Side Rendering (SSR)**: Improves SEO and initial page load performance
**Static Site Generation (SSG)**: Optimizes performance for content that doesn't change frequently
**API Routes**: Enables backend functionality without separate server infrastructure
**File-Based Routing**: Simplifies navigation structure and reduces configuration

### Component Rendering Strategy

Understanding when and where components render is crucial for optimal performance:

**Server Components**: Execute on the server, ideal for data fetching and static content
**Client Components**: Run in the browser, necessary for interactivity and state management
**Hybrid Approach**: Combine both patterns strategically based on component requirements

## Server vs Client Component Patterns

### Server Component Benefits

Server Components offer significant advantages for many use cases:

**Performance**: Zero JavaScript bundle impact, faster initial loads
**Security**: Direct database access without exposing connection strings
**SEO**: Fully rendered HTML improves search engine indexing
**Caching**: Better caching strategies at the server level

```typescript
// Server Component - Data fetching at the server level
export default async function UserDashboard({ userId }: { userId: string }) {
  const user = await fetchUser(userId)
  const recentActivity = await fetchUserActivity(userId)

  return (
    <div>
      <UserProfile user={user} />
      <ActivityFeed activities={recentActivity} />
    </div>
  )
}
```

**Use Cases**: Data display, static content, authentication checks, initial page rendering

### Client Component Strategy

Client Components provide interactivity but should be used strategically:

**User Interactions**: Forms, buttons, input handling
**State Management**: Dynamic state that changes based on user actions
**Browser APIs**: Access to localStorage, geolocation, device features
**Real-time Updates**: WebSocket connections, live data

```typescript
'use client'

export function InteractiveForm({ onSubmit }: FormProps) {
  const [formData, setFormData] = useState(initialState)

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault()
    await onSubmit(formData)
  }

  return <form onSubmit={handleSubmit}>{/* Interactive form elements */}</form>
}
```

**Use Cases**: Form handling, dynamic UI updates, client-side routing, real-time features

## Data Fetching Patterns

### Server-Side Data Strategy

Leverage server-side data fetching for optimal performance and user experience:

**Page-Level Fetching**: Load data before the page renders
**Component-Level Fetching**: Fetch data specific to individual components
**Parallel Fetching**: Load multiple data sources simultaneously
**Error Boundaries**: Handle data fetching errors gracefully

### Cache Management Strategy

Next.js provides sophisticated caching mechanisms:

**Request Memoization**: Automatic deduplication of identical requests
**Data Cache**: Persistent cache across requests and deployments
**Full Route Cache**: Cache entire routes for static content
**Router Cache**: Client-side cache for visited routes

```typescript
// Strategic cache configuration
async function fetchUserData(userId: string) {
  const response = await fetch(`/api/users/${userId}`, {
    // Cache for 5 minutes, revalidate in background
    next: { revalidate: 300 },
  })

  if (!response.ok) {
    throw new Error('Failed to fetch user data')
  }

  return response.json()
}
```

## Routing and Navigation

### File-Based Routing Philosophy

Next.js file-based routing simplifies application structure:

**Intuitive Structure**: Folder structure directly maps to URL structure
**Automatic Code Splitting**: Each route is automatically split into separate bundles
**Nested Layouts**: Share common UI elements across multiple pages
**Loading States**: Built-in loading UI for better user experience

### Navigation Optimization

Implement navigation patterns that enhance user experience:

**Prefetching**: Automatically prefetch linked pages for faster navigation
**Shallow Routing**: Update URL without triggering data fetching
**Progressive Enhancement**: Ensure navigation works without JavaScript
**Route Guards**: Implement authentication and authorization checks

```typescript
// Strategic link prefetching
import Link from 'next/link'

export function Navigation() {
  return (
    <nav>
      <Link href='/dashboard' prefetch={true}>
        Dashboard
      </Link>
      <Link href='/profile' prefetch={false}>
        Profile
      </Link>
    </nav>
  )
}
```

## Performance Optimization Strategies

### Bundle Optimization

Minimize JavaScript bundle size through strategic code organization:

**Dynamic Imports**: Load components only when needed
**Tree Shaking**: Eliminate unused code from production bundles
**Bundle Analysis**: Regularly analyze and optimize bundle composition
**Third-Party Libraries**: Choose libraries with smaller footprints

```typescript
// Dynamic component loading
import dynamic from 'next/dynamic'

const HeavyChart = dynamic(() => import('@/components/HeavyChart'), {
  loading: () => <ChartSkeleton />,
  ssr: false, // Skip server-side rendering for client-only components
})

export function Dashboard() {
  const [showChart, setShowChart] = useState(false)

  return (
    <div>
      <button onClick={() => setShowChart(true)}>Show Chart</button>
      {showChart && <HeavyChart />}
    </div>
  )
}
```

### Image and Asset Optimization

Leverage Next.js built-in optimizations for media assets:

**Automatic Image Optimization**: Modern formats, responsive sizing, lazy loading
**Static Asset Serving**: Optimized serving of static files
**Font Optimization**: Automatic font optimization and loading
**Critical Resource Prioritization**: Load critical resources first

### Progressive Enhancement

Build applications that work across different capability levels:

**Base Functionality**: Ensure core features work without JavaScript
**Enhanced Experiences**: Layer interactive features progressively
**Graceful Degradation**: Provide fallbacks for unsupported features
**Accessibility First**: Design for diverse abilities and assistive technologies

## State Management Integration

### Client-Side State Strategy

Choose appropriate state management based on application complexity:

**Local State**: useState for component-specific state
**URL State**: Store state in URL parameters for shareable states
**Global State**: Context API or external libraries for shared state
**Server State**: Libraries like SWR or React Query for server data synchronization

### Server State Synchronization

Manage the boundary between server and client state effectively:

**Optimistic Updates**: Update UI immediately, sync with server asynchronously
**Cache Invalidation**: Smart cache invalidation strategies
**Real-time Synchronization**: WebSocket or Server-Sent Events integration
**Offline Support**: Handle offline scenarios gracefully

## API Design Patterns

### API Route Architecture

Design API routes that align with application needs:

**RESTful Conventions**: Follow REST principles for predictable APIs
**Error Handling**: Consistent error response formats
**Authentication**: Secure API endpoints appropriately
**Rate Limiting**: Protect against abuse and excessive usage

```typescript
// API route with proper error handling
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const userId = searchParams.get('userId')

    if (!userId) {
      return NextResponse.json({ error: 'User ID is required' }, { status: 400 })
    }

    const user = await getUserById(userId)

    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 })
    }

    return NextResponse.json({ user })
  } catch (error) {
    console.error('Error fetching user:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
```

### Type-Safe API Integration

Ensure type safety across client-server boundaries:

**Shared Types**: Define interfaces that work on both client and server
**API Contracts**: Establish clear contracts between frontend and backend
**Runtime Validation**: Validate data at API boundaries
**Code Generation**: Generate types from API specifications

## Deployment and Production Considerations

### Build Optimization

Configure builds for optimal production performance:

**Environment Configuration**: Separate development and production settings
**Static Generation**: Pre-generate static pages where possible
**Edge Functions**: Utilize edge computing for global performance
**Monitoring**: Implement performance monitoring and error tracking

### Scalability Patterns

Design applications that scale with user growth:

**Incremental Static Regeneration**: Update static content without full rebuilds
**Database Optimization**: Implement efficient database access patterns
**CDN Integration**: Leverage content delivery networks for global performance
**Microservice Architecture**: Break down monoliths into manageable services

## Best Practices Summary

### Architecture

- **Hybrid Rendering**: Use Server Components by default, Client Components for interactivity
- **Data Fetching**: Fetch data as close to where it's needed as possible
- **Caching Strategy**: Implement appropriate caching at multiple levels

### Performance

- **Bundle Optimization**: Minimize JavaScript sent to the client
- **Image Optimization**: Leverage Next.js image optimization features
- **Progressive Loading**: Load content progressively based on user needs

### Development Experience

- **Type Safety**: Use TypeScript throughout the application stack
- **File Organization**: Follow consistent patterns for file and folder structure
- **Testing Strategy**: Test both server and client functionality appropriately

### Production Readiness

- **Error Handling**: Implement comprehensive error handling and logging
- **Security**: Follow security best practices for web applications
- **Monitoring**: Set up monitoring and analytics for production deployments

Next.js enables full-stack React development with excellent defaults while providing flexibility to customize behavior based on specific application requirements.
});

const [isSubmitting, setIsSubmitting] = useState(false);

const handleSubmit = async (e: React.FormEvent) => {
e.preventDefault();
setIsSubmitting(true);

    try {
      await onSubmit(formData);
      setFormData({ email: '', firstName: '', lastName: '' });
    } finally {
      setIsSubmitting(false);
    }

};

return (
<form onSubmit={handleSubmit}>
<input
type="email"
value={formData.email}
onChange={(e) => setFormData(prev => ({ ...prev, email: e.target.value }))}
placeholder="Email"
required
/>
<input
type="text"
value={formData.firstName}
onChange={(e) => setFormData(prev => ({ ...prev, firstName: e.target.value }))}
placeholder="First Name"
required
/>
<input
type="text"
value={formData.lastName}
onChange={(e) => setFormData(prev => ({ ...prev, lastName: e.target.value }))}
placeholder="Last Name"
required
/>
<Button type="submit" disabled={isSubmitting}>
{isSubmitting ? 'Creating...' : 'Create User'}
</Button>
</form>
);
}

````text

### 2. Hybrid Server/Client Pattern

```typescript

// app/users/[id]/page.tsx - Server Component wrapper
import { UserProfile } from './UserProfile';
import { getUserById } from '@/lib/database';
import { notFound } from 'next/navigation';

interface UserPageProps {
  params: { id: string };
}

export default async function UserPage({ params }: UserPageProps) {
  const user = await getUserById(params.id);

  if (!user) {
    notFound();
  }

  return (
    <div>
      <h1>{user.firstName} {user.lastName}</h1>
      {/* Pass server data to client component */}
      <UserProfile user={user} />
    </div>
  );
}

// UserProfile.tsx - Client Component for interactivity
'use client';

import { useState } from 'react';
import { User } from '@/types/user';

interface UserProfileProps {
  user: User;
}

export function UserProfile({ user }: UserProfileProps) {
  const [isEditing, setIsEditing] = useState(false);

  return (
    <div>
      {isEditing ? (
        <UserEditForm user={user} onCancel={() => setIsEditing(false)} />
      ) : (
        <UserDetails user={user} onEdit={() => setIsEditing(true)} />
      )}
    </div>
  );
}

````

## Data Fetching Patterns

### 1. Server-Side Data Fetching

```typescript

// app/dashboard/page.tsx
import { DashboardStats } from '@/components/DashboardStats'
import { RecentActivity } from '@/components/RecentActivity'
import { getCurrentUser } from '@/lib/auth'
import { getDashboardData } from '@/lib/dashboard'

export default async function DashboardPage() {
  // Parallel data fetching
  const [user, dashboardData] = await Promise.all([getCurrentUser(), getDashboardData()])

  return (
    <div>
      <h1>Welcome back, {user.firstName}!</h1>
      <DashboardStats stats={dashboardData.stats} />
      <RecentActivity activities={dashboardData.recentActivity} />
    </div>
  )
}

// Loading UI (loading.tsx)
export default function Loading() {
  return (
    <div className='animate-pulse'>
      <div className='h-8 bg-gray-200 rounded mb-4'></div>
      <div className='grid grid-cols-3 gap-4'>
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className='h-24 bg-gray-200 rounded'></div>
        ))}
      </div>
    </div>
  )
}

// Error UI (error.tsx)
;('use client')

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  return (
    <div className='text-center py-8'>
      <h2>Something went wrong!</h2>
      <p className='text-gray-600 mb-4'>{error.message}</p>
      <button onClick={reset} className='bg-blue-500 text-white px-4 py-2 rounded'>
        Try again
      </button>
    </div>
  )
}

```

### 2. Client-Side Data Fetching with SWR

```typescript

'use client'

import useSWR from 'swr'
import { User } from '@/types/user'

const fetcher = (url: string) => fetch(url).then(res => res.json())

export function UsersList() {
  const {
    data: users,
    error,
    isLoading,
    mutate,
  } = useSWR<User[]>('/api/users', fetcher, {
    refreshInterval: 30000, // Refresh every 30 seconds
    revalidateOnFocus: false,
  })

  if (error) return <div>Failed to load users</div>
  if (isLoading) return <div>Loading...</div>

  const handleDeleteUser = async (userId: string) => {
    // Optimistic update
    const optimisticUsers = users?.filter(user => user.id !== userId)
    mutate(optimisticUsers, false)

    try {
      await fetch(`/api/users/${userId}`, { method: 'DELETE' })
      mutate() // Revalidate
    } catch (error) {
      mutate() // Revert on error
    }
  }

  return (
    <div>
      {users?.map(user => (
        <UserCard key={user.id} user={user} onDelete={() => handleDeleteUser(user.id)} />
      ))}
    </div>
  )
}

```

### 3. Streaming with Suspense

```typescript

// app/dashboard/page.tsx
import { Suspense } from 'react'
import { DashboardStats } from './DashboardStats'
import { RecentActivity } from './RecentActivity'
import { UserProfile } from './UserProfile'

export default function DashboardPage() {
  return (
    <div>
      <h1>Dashboard</h1>

      {/* Fast loading component */}
      <Suspense fallback={<StatsLoader />}>
        <DashboardStats />
      </Suspense>

      {/* Slower loading component */}
      <Suspense fallback={<ActivityLoader />}>
        <RecentActivity />
      </Suspense>

      {/* Independent loading */}
      <Suspense fallback={<ProfileLoader />}>
        <UserProfile />
      </Suspense>
    </div>
  )
}

// Each component fetches its own data
async function DashboardStats() {
  const stats = await getStats() // Fast query
  return <StatsDisplay stats={stats} />
}

async function RecentActivity() {
  const activities = await getRecentActivity() // Slower query
  return <ActivityList activities={activities} />
}

```

## Routing Patterns

### 1. App Router (Next.js 13+)

```typescript

// File structure:
// app/
//   layout.tsx          -> Root layout
//   page.tsx            -> Home page (/)
//   about/page.tsx      -> About page (/about)
//   dashboard/
//     layout.tsx        -> Dashboard layout
//     page.tsx          -> Dashboard home (/dashboard)
//     users/
//       page.tsx        -> Users list (/dashboard/users)
//       [id]/
//         page.tsx      -> User detail (/dashboard/users/[id])
//         edit/page.tsx -> Edit user (/dashboard/users/[id]/edit)

// app/layout.tsx - Root Layout
import { Inter } from 'next/font/google'
import './globals.css'

const inter = Inter({ subsets: ['latin'] })

export const metadata = {
  title: 'My App',
  description: 'Built with Next.js',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang='en'>
      <body className={inter.className}>
        <nav>
          <Link href='/'>Home</Link>
          <Link href='/dashboard'>Dashboard</Link>
        </nav>
        <main>{children}</main>
      </body>
    </html>
  )
}

// app/dashboard/layout.tsx - Nested Layout
import { DashboardSidebar } from '@/components/DashboardSidebar'

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className='flex'>
      <DashboardSidebar />
      <div className='flex-1 p-6'>{children}</div>
    </div>
  )
}

```

### 2. Dynamic Routes with Type Safety

```typescript

// app/users/[id]/page.tsx
interface UserPageProps {
  params: { id: string }
  searchParams: { tab?: string }
}

export default async function UserPage({ params, searchParams }: UserPageProps) {
  const user = await getUserById(params.id)
  const activeTab = searchParams.tab || 'profile'

  return (
    <div>
      <UserHeader user={user} />
      <UserTabs activeTab={activeTab} userId={params.id} />
    </div>
  )
}

// Generate static params for SSG
export async function generateStaticParams() {
  const users = await getAllUsers()

  return users.map(user => ({
    id: user.id,
  }))
}

// Type-safe navigation
;('use client')

import { useRouter } from 'next/navigation'

export function UserActions({ userId }: { userId: string }) {
  const router = useRouter()

  const navigateToEdit = () => {
    router.push(`/users/${userId}/edit`)
  }

  const navigateToProfile = (tab: string) => {
    router.push(`/users/${userId}?tab=${tab}`)
  }

  return (
    <div>
      <button onClick={navigateToEdit}>Edit User</button>
      <button onClick={() => navigateToProfile('activity')}>View Activity</button>
    </div>
  )
}

```

## API Routes

### 1. RESTful API Pattern

```typescript

// app/api/users/route.ts - GET /api/users, POST /api/users
import { NextRequest, NextResponse } from 'next/server'
import { getUsersFromDB, createUser } from '@/lib/database'
import { validateCreateUserRequest } from '@/lib/validation'

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams
| const page = parseInt(searchParams.get('page')   |  | '1')  |
| const limit = parseInt(searchParams.get('limit') |  | '10') |

    const users = await getUsersFromDB({ page, limit })

    return NextResponse.json({
      data: users,
      success: true,
    })
  } catch (error) {
    return NextResponse.json({ error: 'Failed to fetch users', success: false }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()

    // Validate request
    const validation = validateCreateUserRequest(body)
    if (!validation.isValid) {
      return NextResponse.json(
        { error: 'Validation failed', errors: validation.errors, success: false },
        { status: 400 },
      )
    }

    const user = await createUser(body)

    return NextResponse.json({ data: user, success: true }, { status: 201 })
  } catch (error) {
    return NextResponse.json({ error: 'Failed to create user', success: false }, { status: 500 })
  }
}

// app/api/users/[id]/route.ts - GET /api/users/[id], PUT /api/users/[id], DELETE /api/users/[id]
export async function GET(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const user = await getUserById(params.id)

    if (!user) {
      return NextResponse.json({ error: 'User not found', success: false }, { status: 404 })
    }

    return NextResponse.json({
      data: user,
      success: true,
    })
  } catch (error) {
    return NextResponse.json({ error: 'Failed to fetch user', success: false }, { status: 500 })
  }
}

```

### 2. Middleware Pattern

```typescript

// middleware.ts
import { NextRequest, NextResponse } from 'next/server'
import { verifyAuth } from '@/lib/auth'

export async function middleware(request: NextRequest) {
  // Authentication middleware
  if (request.nextUrl.pathname.startsWith('/dashboard')) {
    const token = request.cookies.get('auth-token')?.value

    if (!token) {
      return NextResponse.redirect(new URL('/login', request.url))
    }

    const isValid = await verifyAuth(token)
    if (!isValid) {
      return NextResponse.redirect(new URL('/login', request.url))
    }
  }

  // API rate limiting
  if (request.nextUrl.pathname.startsWith('/api/')) {
    const ip = request.ip || 'unknown'
    const rateLimit = await checkRateLimit(ip)

    if (rateLimit.exceeded) {
      return NextResponse.json({ error: 'Rate limit exceeded' }, { status: 429 })
    }
  }

  return NextResponse.next()
}

export const config = {
  matcher: ['/dashboard/:path*', '/api/:path*'],
}

```

## Performance Optimization

### 1. Code Splitting and Lazy Loading

```typescript

// Dynamic imports for code splitting
import dynamic from 'next/dynamic'
import { Suspense } from 'react'

// Lazy load heavy components
const HeavyChart = dynamic(() => import('@/components/HeavyChart'), {
  loading: () => <div>Loading chart...</div>,
  ssr: false, // Client-side only
})

const ModalDialog = dynamic(() => import('@/components/ModalDialog'), {
  ssr: false,
})

export function Dashboard() {
  const [showModal, setShowModal] = useState(false)

  return (
    <div>
      <h1>Dashboard</h1>

      {/* Chart loads only when needed */}
      <Suspense fallback={<ChartSkeleton />}>
        <HeavyChart />
      </Suspense>

      {/* Modal loads only when opened */}
      {showModal && <ModalDialog onClose={() => setShowModal(false)} />}
    </div>
  )
}

```

### 2. Image Optimization

```typescript

import Image from 'next/image'

export function UserAvatar({ user }: { user: User }) {
  return (
    <div className='relative w-24 h-24'>
      <Image
        src={user.avatarUrl || '/default-avatar.png'}
        alt={`${user.firstName} ${user.lastName}`}
        fill
        className='rounded-full object-cover'
        sizes='(max-width: 768px) 100vw, (max-width: 1200px) 50vw, 33vw'
        priority={false} // Set to true for above-the-fold images
      />
    </div>
  )
}

// For dynamic images
export function ProductGallery({ images }: { images: string[] }) {
  return (
    <div className='grid grid-cols-2 gap-4'>
      {images.map((src, index) => (
        <div key={index} className='aspect-square relative'>
          <Image
            src={src}
            alt={`Product image ${index + 1}`}
            fill
            className='object-cover rounded-lg'
            sizes='(max-width: 768px) 50vw, 25vw'
            placeholder='blur'
            blurDataURL='data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQ...' // Low quality placeholder
          />
        </div>
      ))}
    </div>
  )
}

```

### 3. Caching Strategies

```typescript

// app/api/users/route.ts
import { NextRequest, NextResponse } from 'next/server'

export async function GET(request: NextRequest) {
  const users = await getUsersFromDB()

  const response = NextResponse.json({ data: users })

  // Cache for 1 hour, revalidate in background
  response.headers.set('Cache-Control', 's-maxage=3600, stale-while-revalidate')

  return response
}

// Page-level caching
// app/users/page.tsx
export const revalidate = 3600 // Revalidate every hour

export default async function UsersPage() {
  const users = await getUsersFromDB()
  return <UsersList users={users} />
}

// Dynamic caching with tags
import { unstable_cache } from 'next/cache'

const getCachedUsers = unstable_cache(async () => getUsersFromDB(), ['users'], {
  revalidate: 3600,
  tags: ['users'],
})

// Revalidate cache when data changes
import { revalidateTag } from 'next/cache'

export async function POST(request: NextRequest) {
  const user = await createUser(await request.json())

  // Invalidate users cache
  revalidateTag('users')

  return NextResponse.json({ data: user })
}

```

## State Management Integration

### 1. Zustand with Next.js

```typescript

// lib/store.ts
import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'

interface AppStore {
| user: User     | null   |
| theme: 'light' | 'dark' |
  sidebarOpen: boolean
| setUser: (user: User      | null) => void   |
| setTheme: (theme: 'light' | 'dark') => void |
  toggleSidebar: () => void
}

export const useAppStore = create<AppStore>()(
  persist(
    set => ({
      user: null,
      theme: 'light',
      sidebarOpen: false,
      setUser: user => set({ user }),
      setTheme: theme => set({ theme }),
      toggleSidebar: () => set(state => ({ sidebarOpen: !state.sidebarOpen })),
    }),
    {
      name: 'app-storage',
      storage: createJSONStorage(() => localStorage),
      partialize: state => ({ theme: state.theme }), // Only persist theme
    },
  ),
)

// components/ThemeProvider.tsx
;('use client')

import { useAppStore } from '@/lib/store'
import { useEffect } from 'react'

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const theme = useAppStore(state => state.theme)

  useEffect(() => {
    document.documentElement.classList.toggle('dark', theme === 'dark')
  }, [theme])

  return <>{children}</>
}

```

## Best Practices

### 1. Component Organization

```typescript

// components/UserCard/index.ts - Barrel export
export { UserCard } from './UserCard'
export { UserCardSkeleton } from './UserCardSkeleton'
export type { UserCardProps } from './UserCard'

// components/UserCard/UserCard.tsx
interface UserCardProps {
  readonly user: User
  readonly onEdit?: (user: User) => void
  readonly onDelete?: (userId: string) => void
  readonly variant?: 'default' | 'compact'
}

export function UserCard({ user, onEdit, onDelete, variant = 'default' }: UserCardProps) {
  // Component implementation
}

```

### 2. Error Handling

```typescript

// Global error boundary
// app/global-error.tsx
'use client'

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  return (
    <html>
      <body>
        <div className='error-page'>
          <h2>Something went wrong!</h2>
          <button onClick={reset}>Try again</button>
        </div>
      </body>
    </html>
  )
}

// Page-specific error handling
// app/dashboard/error.tsx
;('use client')

export default function DashboardError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  return (
    <div className='dashboard-error'>
      <h2>Dashboard Error</h2>
      <p>{error.message}</p>
      <button onClick={reset}>Retry</button>
    </div>
  )
}

```

### 3. TypeScript Integration

```typescript

// Global type definitions
// types/next.d.ts
import type { NextRequest } from 'next/server'

declare global {
  interface CustomNextRequest extends NextRequest {
    user?: User
  }
}

// API route with strong typing
// app/api/users/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'

const CreateUserSchema = z.object({
  email: z.string().email(),
  firstName: z.string().min(1),
  lastName: z.string().min(1),
})

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const userData = CreateUserSchema.parse(body)

    const user = await createUser(userData)
    return NextResponse.json({ data: user, success: true })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Validation failed', errors: error.errors, success: false },
        { status: 400 },
      )
    }

    return NextResponse.json({ error: 'Internal server error', success: false }, { status: 500 })
  }
}

```

This comprehensive guide covers the essential patterns for building scalable React and Next.js applications with modern best practices.

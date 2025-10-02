# Next.js Advanced Patterns

## Strategic Overview

This framework establishes advanced Next.js patterns that optimize full-stack development through App Router, server components, streaming, caching strategies, and performance optimization while ensuring type safety and developer experience.

## App Router Advanced Patterns

### Server Components and Data Fetching

#### **Advanced Server Component Patterns**
```tsx
// app/dashboard/page.tsx - Advanced server component with multiple data sources
import { Suspense } from 'react';
import { auth } from '@/lib/auth';
import { cache } from 'react';
import { notFound, redirect } from 'next/navigation';
import { DashboardHeader } from '@/components/dashboard/header';
import { UserStats } from '@/components/dashboard/user-stats';
import { RecentActivity } from '@/components/dashboard/recent-activity';
import { ProjectsList } from '@/components/dashboard/projects-list';
import { TeamMembers } from '@/components/dashboard/team-members';

// Cached data fetchers - automatically deduped across components
const getUser = cache(async (userId: string) => {
  const response = await fetch(`${process.env.API_URL}/users/${userId}`, {
    headers: { 'Authorization': `Bearer ${process.env.API_TOKEN}` },
    next: { revalidate: 300 } // Cache for 5 minutes
  });
  
  if (!response.ok) {
    throw new Error('Failed to fetch user');
  }
  
  return response.json();
});

const getUserStats = cache(async (userId: string) => {
  const response = await fetch(`${process.env.API_URL}/users/${userId}/stats`, {
    headers: { 'Authorization': `Bearer ${process.env.API_TOKEN}` },
    next: { revalidate: 60 } // Cache for 1 minute
  });
  
  if (!response.ok) {
    throw new Error('Failed to fetch user stats');
  }
  
  return response.json();
});

const getRecentActivity = cache(async (userId: string) => {
  const response = await fetch(`${process.env.API_URL}/users/${userId}/activity`, {
    headers: { 'Authorization': `Bearer ${process.env.API_TOKEN}` },
    next: { revalidate: 30 } // Cache for 30 seconds
  });
  
  if (!response.ok) {
    return []; // Graceful fallback
  }
  
  return response.json();
});

const getUserProjects = cache(async (userId: string) => {
  const response = await fetch(`${process.env.API_URL}/users/${userId}/projects`, {
    headers: { 'Authorization': `Bearer ${process.env.API_TOKEN}` },
    next: { 
      revalidate: 180, // Cache for 3 minutes
      tags: [`user-projects-${userId}`] // For targeted revalidation
    }
  });
  
  if (!response.ok) {
    throw new Error('Failed to fetch projects');
  }
  
  return response.json();
});

const getTeamMembers = cache(async (teamId: string) => {
  const response = await fetch(`${process.env.API_URL}/teams/${teamId}/members`, {
    headers: { 'Authorization': `Bearer ${process.env.API_TOKEN}` },
    next: { revalidate: 600 } // Cache for 10 minutes
  });
  
  if (!response.ok) {
    return []; // Graceful fallback
  }
  
  return response.json();
});

interface PageProps {
  searchParams: {
    tab?: string;
    filter?: string;
  };
}

export default async function DashboardPage({ searchParams }: PageProps) {
  // Server-side authentication
  const session = await auth.getSession();
  
  if (!session) {
    redirect('/login?from=/dashboard');
  }

  // Parallel data fetching
  const [user, userStats, recentActivity] = await Promise.allSettled([
    getUser(session.user.id),
    getUserStats(session.user.id),
    getRecentActivity(session.user.id)
  ]);

  // Handle user fetch failure
  if (user.status === 'rejected') {
    notFound();
  }

  const userData = user.value;
  const currentTab = searchParams.tab || 'overview';

  return (
    <div className="dashboard">
      <DashboardHeader user={userData} />
      
      <div className="dashboard-content">
        {/* Stats section with error boundary */}
        <Suspense fallback={<UserStats.Skeleton />}>
          <UserStatsWrapper 
            userId={session.user.id}
            initialStats={userStats.status === 'fulfilled' ? userStats.value : null}
          />
        </Suspense>

        {/* Activity section with graceful fallback */}
        <Suspense fallback={<RecentActivity.Skeleton />}>
          <RecentActivityWrapper 
            userId={session.user.id}
            initialActivity={recentActivity.status === 'fulfilled' ? recentActivity.value : []}
          />
        </Suspense>

        {/* Tab-based content */}
        {currentTab === 'projects' && (
          <Suspense fallback={<ProjectsList.Skeleton />}>
            <ProjectsWrapper userId={session.user.id} filter={searchParams.filter} />
          </Suspense>
        )}

        {currentTab === 'team' && userData.teamId && (
          <Suspense fallback={<TeamMembers.Skeleton />}>
            <TeamMembersWrapper teamId={userData.teamId} />
          </Suspense>
        )}
      </div>
    </div>
  );
}

// Wrapper components for better error handling and suspense
async function UserStatsWrapper({ 
  userId, 
  initialStats 
}: { 
  userId: string; 
  initialStats: any;
}) {
  try {
    const stats = initialStats || await getUserStats(userId);
    return <UserStats stats={stats} />;
  } catch (error) {
    console.error('Failed to load user stats:', error);
    return <UserStats.Error onRetry={() => window.location.reload()} />;
  }
}

async function RecentActivityWrapper({ 
  userId, 
  initialActivity 
}: { 
  userId: string; 
  initialActivity: any[];
}) {
  try {
    const activity = initialActivity.length > 0 ? initialActivity : await getRecentActivity(userId);
    return <RecentActivity activities={activity} />;
  } catch (error) {
    console.error('Failed to load recent activity:', error);
    return <RecentActivity activities={[]} />;
  }
}

async function ProjectsWrapper({ 
  userId, 
  filter 
}: { 
  userId: string; 
  filter?: string;
}) {
  try {
    const projects = await getUserProjects(userId);
    const filteredProjects = filter 
      ? projects.filter((p: any) => p.status === filter)
      : projects;
    
    return <ProjectsList projects={filteredProjects} />;
  } catch (error) {
    console.error('Failed to load projects:', error);
    return <ProjectsList.Error onRetry={() => window.location.reload()} />;
  }
}

async function TeamMembersWrapper({ teamId }: { teamId: string }) {
  try {
    const members = await getTeamMembers(teamId);
    return <TeamMembers members={members} />;
  } catch (error) {
    console.error('Failed to load team members:', error);
    return <TeamMembers.Error onRetry={() => window.location.reload()} />;
  }
}

// Generate metadata dynamically
export async function generateMetadata({ searchParams }: PageProps) {
  const session = await auth.getSession();
  
  if (!session) {
    return {
      title: 'Dashboard - Login Required',
      robots: 'noindex'
    };
  }

  try {
    const user = await getUser(session.user.id);
    const tab = searchParams.tab || 'overview';
    
    return {
      title: `Dashboard - ${tab.charAt(0).toUpperCase() + tab.slice(1)} | ${user.name}`,
      description: `${user.name}'s dashboard showing ${tab} information`,
      openGraph: {
        title: `${user.name}'s Dashboard`,
        description: `View ${user.name}'s dashboard with projects, stats, and activity`,
        images: [user.avatar || '/default-avatar.png']
      }
    };
  } catch (error) {
    return {
      title: 'Dashboard',
      description: 'User dashboard'
    };
  }
}
```

#### **Streaming with Suspense and Error Boundaries**
```tsx
// app/users/page.tsx - Streaming server component
import { Suspense } from 'react';
import { ErrorBoundary } from 'react-error-boundary';
import { UsersList } from '@/components/users/users-list';
import { UsersFilters } from '@/components/users/users-filters';
import { UsersSearch } from '@/components/users/users-search';

interface PageProps {
  searchParams: {
    page?: string;
    search?: string;
    role?: string;
    department?: string;
    status?: string;
  };
}

export default function UsersPage({ searchParams }: PageProps) {
  const page = parseInt(searchParams.page || '1');
  const search = searchParams.search || '';
  const filters = {
    role: searchParams.role,
    department: searchParams.department,
    status: searchParams.status || 'active'
  };

  return (
    <div className="users-page">
      <div className="users-header">
        <h1>Users Management</h1>
        
        {/* Client component for immediate interactivity */}
        <UsersSearch initialValue={search} />
      </div>

      <div className="users-filters">
        {/* Stream filters independently */}
        <ErrorBoundary fallback={<div>Failed to load filters</div>}>
          <Suspense fallback={<FiltersLoadingSkeleton />}>
            <UsersFiltersServer initialFilters={filters} />
          </Suspense>
        </ErrorBoundary>
      </div>

      <div className="users-content">
        {/* Stream users list with error boundary */}
        <ErrorBoundary 
          fallback={<UsersErrorFallback />}
          onError={(error) => console.error('Users list error:', error)}
        >
          <Suspense fallback={<UsersLoadingSkeleton />}>
            <UsersListServer 
              page={page}
              search={search}
              filters={filters}
            />
          </Suspense>
        </ErrorBoundary>
      </div>
    </div>
  );
}

// Server component for filters with data fetching
async function UsersFiltersServer({ 
  initialFilters 
}: { 
  initialFilters: Record<string, string | undefined>;
}) {
  try {
    // Fetch filter options from API
    const [roles, departments] = await Promise.all([
      fetch(`${process.env.API_URL}/roles`, {
        next: { revalidate: 3600 } // Cache for 1 hour
      }).then(res => res.json()),
      
      fetch(`${process.env.API_URL}/departments`, {
        next: { revalidate: 3600 } // Cache for 1 hour
      }).then(res => res.json())
    ]);

    return (
      <UsersFilters
        roles={roles}
        departments={departments}
        initialFilters={initialFilters}
      />
    );
  } catch (error) {
    console.error('Failed to load filter options:', error);
    
    // Fallback with basic filters
    return (
      <UsersFilters
        roles={[
          { value: 'admin', label: 'Admin' },
          { value: 'user', label: 'User' },
          { value: 'manager', label: 'Manager' }
        ]}
        departments={[
          { value: 'engineering', label: 'Engineering' },
          { value: 'marketing', label: 'Marketing' },
          { value: 'sales', label: 'Sales' }
        ]}
        initialFilters={initialFilters}
      />
    );
  }
}

// Server component for users list
async function UsersListServer({
  page,
  search,
  filters
}: {
  page: number;
  search: string;
  filters: Record<string, string | undefined>;
}) {
  const searchParams = new URLSearchParams();
  searchParams.set('page', page.toString());
  searchParams.set('limit', '20');
  
  if (search) searchParams.set('search', search);
  if (filters.role) searchParams.set('role', filters.role);
  if (filters.department) searchParams.set('department', filters.department);
  if (filters.status) searchParams.set('status', filters.status);

  try {
    const response = await fetch(
      `${process.env.API_URL}/users?${searchParams.toString()}`,
      {
        headers: {
          'Authorization': `Bearer ${process.env.API_TOKEN}`,
          'Content-Type': 'application/json'
        },
        next: {
          revalidate: 60, // Cache for 1 minute
          tags: ['users-list'] // For targeted revalidation
        }
      }
    );

    if (!response.ok) {
      throw new Error(`Failed to fetch users: ${response.status}`);
    }

    const { data: users, pagination } = await response.json();

    return (
      <UsersListWrapper>
        <UsersList 
          users={users} 
          pagination={pagination} 
          currentPage={page}
        />
      </UsersListWrapper>
    );

  } catch (error) {
    console.error('Failed to fetch users:', error);
    throw error; // Let error boundary handle it
  }
}

// Wrapper for additional client-side functionality
function UsersListWrapper({ children }: { children: React.ReactNode }) {
  return (
    <div className="users-list-wrapper">
      {children}
    </div>
  );
}

// Error fallback components
function UsersErrorFallback() {
  return (
    <div className="users-error">
      <h3>Failed to load users</h3>
      <p>There was an error loading the users list. Please try again.</p>
      <button 
        onClick={() => window.location.reload()}
        className="retry-button"
      >
        Retry
      </button>
    </div>
  );
}

// Loading skeletons
function UsersLoadingSkeleton() {
  return (
    <div className="users-loading">
      {Array.from({ length: 10 }, (_, i) => (
        <div key={i} className="user-skeleton">
          <div className="skeleton-avatar"></div>
          <div className="skeleton-content">
            <div className="skeleton-line skeleton-name"></div>
            <div className="skeleton-line skeleton-email"></div>
            <div className="skeleton-line skeleton-role"></div>
          </div>
        </div>
      ))}
    </div>
  );
}

function FiltersLoadingSkeleton() {
  return (
    <div className="filters-loading">
      <div className="skeleton-filter"></div>
      <div className="skeleton-filter"></div>
      <div className="skeleton-filter"></div>
    </div>
  );
}
```

### Advanced API Routes

#### **Middleware and Route Composition**
```typescript
// lib/api/middleware.ts - Reusable API middleware
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { auth } from '@/lib/auth';
import { rateLimit } from '@/lib/rate-limit';

export type ApiHandler = (
  request: NextRequest,
  context: { params?: any }
) => Promise<NextResponse>;

export type Middleware = (
  request: NextRequest,
  context: { params?: any },
  next: () => Promise<NextResponse>
) => Promise<NextResponse>;

// Middleware composition utility
export function withMiddleware(...middlewares: Middleware[]) {
  return function (handler: ApiHandler): ApiHandler {
    return async (request: NextRequest, context: { params?: any }) => {
      let index = 0;

      async function next(): Promise<NextResponse> {
        if (index >= middlewares.length) {
          return handler(request, context);
        }

        const middleware = middlewares[index++];
        return middleware(request, context, next);
      }

      return next();
    };
  };
}

// CORS middleware
export const corsMiddleware: Middleware = async (req, context, next) => {
  const response = await next();
  
  response.headers.set('Access-Control-Allow-Origin', process.env.ALLOWED_ORIGINS || '*');
  response.headers.set('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  response.headers.set('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  response.headers.set('Access-Control-Max-Age', '86400');
  
  return response;
};

// Rate limiting middleware
export function rateLimitMiddleware(
  limit: number = 100,
  window: number = 60000
): Middleware {
  return async (req, context, next) => {
    const identifier = req.ip || 'anonymous';
    const result = await rateLimit.check(identifier, req.url, { limit, window });

    if (!result.success) {
      return NextResponse.json(
        { error: 'Rate limit exceeded' },
        { 
          status: 429,
          headers: {
            'X-RateLimit-Limit': limit.toString(),
            'X-RateLimit-Remaining': result.remaining.toString(),
            'X-RateLimit-Reset': result.reset.toString()
          }
        }
      );
    }

    const response = await next();
    response.headers.set('X-RateLimit-Limit', limit.toString());
    response.headers.set('X-RateLimit-Remaining', result.remaining.toString());
    response.headers.set('X-RateLimit-Reset', result.reset.toString());

    return response;
  };
}

// Authentication middleware
export const authMiddleware: Middleware = async (req, context, next) => {
  const session = await auth.getSession(req);
  
  if (!session) {
    return NextResponse.json(
      { error: 'Unauthorized' },
      { status: 401 }
    );
  }

  // Add user to request context
  (req as any).user = session.user;
  
  return next();
};

// Authorization middleware
export function requirePermissions(...permissions: string[]): Middleware {
  return async (req, context, next) => {
    const user = (req as any).user;
    
    if (!user) {
      return NextResponse.json(
        { error: 'User not found in request context' },
        { status: 500 }
      );
    }

    const hasPermission = permissions.some(permission =>
      auth.hasPermission(user, permission)
    );

    if (!hasPermission) {
      return NextResponse.json(
        { error: 'Insufficient permissions' },
        { status: 403 }
      );
    }

    return next();
  };
}

// Validation middleware
export function validateBody<T>(schema: z.ZodSchema<T>): Middleware {
  return async (req, context, next) => {
    try {
      const body = await req.json();
      const validatedBody = schema.parse(body);
      
      // Add validated body to request
      (req as any).validatedBody = validatedBody;
      
      return next();
    } catch (error) {
      if (error instanceof z.ZodError) {
        return NextResponse.json(
          {
            error: 'Validation failed',
            details: error.errors.map(err => ({
              field: err.path.join('.'),
              message: err.message
            }))
          },
          { status: 422 }
        );
      }

      return NextResponse.json(
        { error: 'Invalid request body' },
        { status: 400 }
      );
    }
  };
}

export function validateQuery<T>(schema: z.ZodSchema<T>): Middleware {
  return async (req, context, next) => {
    try {
      const url = new URL(req.url);
      const query = Object.fromEntries(url.searchParams);
      const validatedQuery = schema.parse(query);
      
      // Add validated query to request
      (req as any).validatedQuery = validatedQuery;
      
      return next();
    } catch (error) {
      if (error instanceof z.ZodError) {
        return NextResponse.json(
          {
            error: 'Invalid query parameters',
            details: error.errors.map(err => ({
              field: err.path.join('.'),
              message: err.message
            }))
          },
          { status: 422 }
        );
      }

      return NextResponse.json(
        { error: 'Invalid query parameters' },
        { status: 400 }
      );
    }
  };
}

// Error handling middleware
export const errorHandlingMiddleware: Middleware = async (req, context, next) => {
  try {
    return await next();
  } catch (error) {
    console.error('API Error:', error);

    if (error instanceof z.ZodError) {
      return NextResponse.json(
        {
          error: 'Validation error',
          details: error.errors
        },
        { status: 422 }
      );
    }

    if (error instanceof Error) {
      // Don't expose internal errors in production
      const message = process.env.NODE_ENV === 'production' 
        ? 'Internal server error' 
        : error.message;

      return NextResponse.json(
        { error: message },
        { status: 500 }
      );
    }

    return NextResponse.json(
      { error: 'Unknown error occurred' },
      { status: 500 }
    );
  }
};

// Logging middleware
export const loggingMiddleware: Middleware = async (req, context, next) => {
  const start = Date.now();
  const method = req.method;
  const url = req.url;
  const userAgent = req.headers.get('user-agent');
  const ip = req.ip || 'unknown';

  console.log(`[API] ${method} ${url} - ${ip} - ${userAgent}`);

  const response = await next();
  
  const duration = Date.now() - start;
  const status = response.status;

  console.log(`[API] ${method} ${url} - ${status} - ${duration}ms`);

  return response;
};
```

#### **Composed API Route Example**
```typescript
// app/api/users/route.ts - Using middleware composition
import { NextRequest } from 'next/server';
import { z } from 'zod';
import { 
  withMiddleware,
  corsMiddleware,
  rateLimitMiddleware,
  authMiddleware,
  requirePermissions,
  validateQuery,
  validateBody,
  errorHandlingMiddleware,
  loggingMiddleware
} from '@/lib/api/middleware';
import { userService } from '@/lib/services/user.service';

// Validation schemas
const GetUsersQuerySchema = z.object({
  page: z.coerce.number().min(1).default(1),
  limit: z.coerce.number().min(1).max(100).default(20),
  search: z.string().optional(),
  role: z.enum(['admin', 'user', 'manager']).optional(),
  status: z.enum(['active', 'inactive', 'pending']).optional(),
  sortBy: z.enum(['name', 'email', 'createdAt']).default('createdAt'),
  sortOrder: z.enum(['asc', 'desc']).default('desc')
});

const CreateUserSchema = z.object({
  email: z.string().email(),
  name: z.string().min(2).max(100),
  role: z.enum(['admin', 'user', 'manager']).default('user'),
  department: z.string().optional()
});

// GET /api/users
export const GET = withMiddleware(
  loggingMiddleware,
  errorHandlingMiddleware,
  corsMiddleware,
  rateLimitMiddleware(200, 60000), // 200 requests per minute
  authMiddleware,
  requirePermissions('users:read'),
  validateQuery(GetUsersQuerySchema)
)(async (req: NextRequest) => {
  const query = (req as any).validatedQuery;
  const user = (req as any).user;

  // Apply user-specific filtering
  const filters = { ...query };
  if (!auth.hasRole(user, 'admin')) {
    // Non-admins can only see users in their department
    filters.department = user.department;
  }

  const result = await userService.getUsers(filters);

  return NextResponse.json({
    success: true,
    data: result.users,
    pagination: {
      page: result.page,
      limit: result.limit,
      total: result.total,
      totalPages: result.totalPages,
      hasMore: result.hasMore
    }
  });
});

// POST /api/users
export const POST = withMiddleware(
  loggingMiddleware,
  errorHandlingMiddleware,
  corsMiddleware,
  rateLimitMiddleware(20, 60000), // 20 creates per minute
  authMiddleware,
  requirePermissions('users:create'),
  validateBody(CreateUserSchema)
)(async (req: NextRequest) => {
  const userData = (req as any).validatedBody;
  const currentUser = (req as any).user;

  // Business logic validation
  if (userData.role === 'admin' && !auth.hasRole(currentUser, 'admin')) {
    return NextResponse.json(
      { error: 'Only admins can create admin users' },
      { status: 403 }
    );
  }

  const user = await userService.createUser({
    ...userData,
    createdBy: currentUser.id
  });

  return NextResponse.json(
    { 
      success: true, 
      data: user 
    },
    { status: 201 }
  );
});

// OPTIONS handler for CORS preflight
export const OPTIONS = withMiddleware(
  corsMiddleware
)(async () => {
  return new NextResponse(null, { status: 200 });
});
```

### Advanced Caching Strategies

#### **Multi-Level Caching Implementation**
```typescript
// lib/cache/cache-manager.ts
import { unstable_cache } from 'next/cache';
import { Redis } from 'ioredis';

interface CacheConfig {
  ttl?: number;
  tags?: string[];
  revalidateOnStale?: boolean;
  staleWhileRevalidate?: number;
}

class CacheManager {
  private redis: Redis;
  private memoryCache: Map<string, { value: any; expires: number }>;

  constructor() {
    this.redis = new Redis(process.env.REDIS_URL!);
    this.memoryCache = new Map();
    
    // Cleanup memory cache periodically
    setInterval(() => this.cleanupMemoryCache(), 60000); // Every minute
  }

  // L1: Memory cache (fastest)
  private getFromMemory(key: string): any | null {
    const cached = this.memoryCache.get(key);
    if (cached && cached.expires > Date.now()) {
      return cached.value;
    }
    
    if (cached) {
      this.memoryCache.delete(key);
    }
    
    return null;
  }

  private setInMemory(key: string, value: any, ttl: number): void {
    const expires = Date.now() + (ttl * 1000);
    this.memoryCache.set(key, { value, expires });
  }

  // L2: Redis cache (fast)
  private async getFromRedis(key: string): Promise<any | null> {
    try {
      const cached = await this.redis.get(key);
      return cached ? JSON.parse(cached) : null;
    } catch (error) {
      console.error('Redis get error:', error);
      return null;
    }
  }

  private async setInRedis(key: string, value: any, ttl: number): Promise<void> {
    try {
      await this.redis.setex(key, ttl, JSON.stringify(value));
    } catch (error) {
      console.error('Redis set error:', error);
    }
  }

  // L3: Next.js cache (persistent across deployments)
  private createNextCache<T>(
    key: string,
    fn: () => Promise<T>,
    config: CacheConfig
  ) {
    return unstable_cache(
      fn,
      [key],
      {
        revalidate: config.ttl || 300,
        tags: config.tags || []
      }
    );
  }

  // Multi-level get
  async get<T>(
    key: string,
    fetcher: () => Promise<T>,
    config: CacheConfig = {}
  ): Promise<T> {
    const { ttl = 300, tags = [], staleWhileRevalidate = 0 } = config;

    // L1: Try memory cache first
    let value = this.getFromMemory(key);
    if (value !== null) {
      return value;
    }

    // L2: Try Redis cache
    value = await this.getFromRedis(key);
    if (value !== null) {
      // Populate memory cache
      this.setInMemory(key, value, Math.min(ttl, 60)); // Max 1 minute in memory
      return value;
    }

    // L3: Try Next.js cache
    const nextCachedFetcher = this.createNextCache(key, fetcher, config);
    
    try {
      value = await nextCachedFetcher();
      
      // Populate both caches
      await this.setInRedis(key, value, ttl);
      this.setInMemory(key, value, Math.min(ttl, 60));
      
      return value;
    } catch (error) {
      // If all caches fail, execute fetcher directly
      console.error('All caches failed, executing fetcher directly:', error);
      value = await fetcher();
      
      // Try to cache the result (best effort)
      try {
        await this.setInRedis(key, value, ttl);
        this.setInMemory(key, value, Math.min(ttl, 60));
      } catch (cacheError) {
        console.error('Failed to cache result:', cacheError);
      }
      
      return value;
    }
  }

  // Invalidate cache by key or tags
  async invalidate(keyOrTags: string | string[]): Promise<void> {
    if (Array.isArray(keyOrTags)) {
      // Invalidate by tags (Next.js cache)
      const { revalidateTag } = await import('next/cache');
      for (const tag of keyOrTags) {
        revalidateTag(tag);
      }
    } else {
      // Invalidate specific key
      this.memoryCache.delete(keyOrTags);
      try {
        await this.redis.del(keyOrTags);
      } catch (error) {
        console.error('Redis delete error:', error);
      }
    }
  }

  // Batch invalidation
  async invalidatePattern(pattern: string): Promise<void> {
    try {
      // Clear memory cache
      for (const key of this.memoryCache.keys()) {
        if (key.includes(pattern)) {
          this.memoryCache.delete(key);
        }
      }

      // Clear Redis cache
      const keys = await this.redis.keys(`*${pattern}*`);
      if (keys.length > 0) {
        await this.redis.del(...keys);
      }
    } catch (error) {
      console.error('Batch invalidation error:', error);
    }
  }

  private cleanupMemoryCache(): void {
    const now = Date.now();
    for (const [key, cached] of this.memoryCache.entries()) {
      if (cached.expires <= now) {
        this.memoryCache.delete(key);
      }
    }
  }
}

export const cacheManager = new CacheManager();

// Usage helpers
export function createCachedFunction<T extends any[], R>(
  fn: (...args: T) => Promise<R>,
  keyGenerator: (...args: T) => string,
  config: CacheConfig = {}
) {
  return async (...args: T): Promise<R> => {
    const key = keyGenerator(...args);
    return cacheManager.get(key, () => fn(...args), config);
  };
}

// Example usage
export const getCachedUser = createCachedFunction(
  async (userId: string) => {
    const response = await fetch(`${process.env.API_URL}/users/${userId}`);
    return response.json();
  },
  (userId: string) => `user:${userId}`,
  { 
    ttl: 300, // 5 minutes
    tags: ['users'],
    staleWhileRevalidate: 60 // Allow stale data for 1 minute while revalidating
  }
);

export const getCachedUserProjects = createCachedFunction(
  async (userId: string, status?: string) => {
    const url = new URL(`${process.env.API_URL}/users/${userId}/projects`);
    if (status) url.searchParams.set('status', status);
    
    const response = await fetch(url.toString());
    return response.json();
  },
  (userId: string, status?: string) => `user:${userId}:projects:${status || 'all'}`,
  { 
    ttl: 180, // 3 minutes
    tags: ['users', 'projects', `user-${userId}`]
  }
);
```

### Performance Optimization Patterns

#### **Image Optimization and Lazy Loading**
```tsx
// components/OptimizedImage.tsx
import Image from 'next/image';
import { useState, useRef, useEffect } from 'react';

interface OptimizedImageProps {
  src: string;
  alt: string;
  width?: number;
  height?: number;
  className?: string;
  priority?: boolean;
  placeholder?: 'blur' | 'empty';
  blurDataURL?: string;
  sizes?: string;
  quality?: number;
  onLoad?: () => void;
  onError?: () => void;
}

export function OptimizedImage({
  src,
  alt,
  width,
  height,
  className,
  priority = false,
  placeholder = 'blur',
  blurDataURL,
  sizes = '(max-width: 768px) 100vw, (max-width: 1200px) 50vw, 33vw',
  quality = 80,
  onLoad,
  onError
}: OptimizedImageProps) {
  const [isLoaded, setIsLoaded] = useState(false);
  const [hasError, setHasError] = useState(false);
  const imgRef = useRef<HTMLImageElement>(null);

  // Generate blur placeholder if not provided
  const defaultBlurDataURL = blurDataURL || `data:image/svg+xml;base64,${Buffer.from(
    `<svg width="${width || 400}" height="${height || 300}" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id="grad" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" style="stop-color:#f0f0f0;stop-opacity:1" />
          <stop offset="100%" style="stop-color:#e0e0e0;stop-opacity:1" />
        </linearGradient>
      </defs>
      <rect width="100%" height="100%" fill="url(#grad)" />
    </svg>`
  ).toString('base64')}`;

  const handleLoad = () => {
    setIsLoaded(true);
    onLoad?.();
  };

  const handleError = () => {
    setHasError(true);
    onError?.();
  };

  if (hasError) {
    return (
      <div 
        className={`image-error ${className || ''}`}
        style={{ width, height }}
      >
        <span>Failed to load image</span>
      </div>
    );
  }

  return (
    <div className={`image-container ${isLoaded ? 'loaded' : 'loading'} ${className || ''}`}>
      <Image
        ref={imgRef}
        src={src}
        alt={alt}
        width={width}
        height={height}
        priority={priority}
        placeholder={placeholder}
        blurDataURL={defaultBlurDataURL}
        sizes={sizes}
        quality={quality}
        onLoad={handleLoad}
        onError={handleError}
        style={{
          objectFit: 'cover',
          transition: 'opacity 0.3s ease-in-out',
          opacity: isLoaded ? 1 : 0
        }}
      />
    </div>
  );
}

// Advanced image gallery with lazy loading
interface ImageGalleryProps {
  images: Array<{
    src: string;
    alt: string;
    width: number;
    height: number;
  }>;
  columns?: number;
  gap?: number;
}

export function ImageGallery({ 
  images, 
  columns = 3, 
  gap = 16 
}: ImageGalleryProps) {
  const [visibleImages, setVisibleImages] = useState<Set<number>>(new Set());
  const observerRef = useRef<IntersectionObserver>();

  useEffect(() => {
    observerRef.current = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            const index = parseInt(entry.target.getAttribute('data-index') || '0');
            setVisibleImages(prev => new Set([...prev, index]));
          }
        });
      },
      { 
        threshold: 0.1,
        rootMargin: '50px'
      }
    );

    return () => observerRef.current?.disconnect();
  }, []);

  const observeElement = (element: HTMLDivElement | null, index: number) => {
    if (element && observerRef.current) {
      observerRef.current.observe(element);
    }
  };

  return (
    <div 
      className="image-gallery"
      style={{
        display: 'grid',
        gridTemplateColumns: `repeat(${columns}, 1fr)`,
        gap: `${gap}px`
      }}
    >
      {images.map((image, index) => (
        <div
          key={index}
          ref={(el) => observeElement(el, index)}
          data-index={index}
          className="gallery-item"
        >
          {visibleImages.has(index) ? (
            <OptimizedImage
              src={image.src}
              alt={image.alt}
              width={image.width}
              height={image.height}
              sizes={`(max-width: 768px) 100vw, ${100 / columns}vw`}
              className="gallery-image"
            />
          ) : (
            <div 
              className="gallery-placeholder"
              style={{
                width: image.width,
                height: image.height,
                backgroundColor: '#f0f0f0'
              }}
            />
          )}
        </div>
      ))}
    </div>
  );
}
```

This comprehensive Next.js patterns guide provides advanced patterns for App Router, server components, API routes, caching, and performance optimization that ensure scalable, high-performance full-stack applications.
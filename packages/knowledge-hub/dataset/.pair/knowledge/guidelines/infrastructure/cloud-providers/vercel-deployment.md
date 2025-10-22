# Vercel Deployment Patterns

## Overview

Comprehensive guide for deploying frontend applications and full-stack projects on Vercel, optimizing for developer experience, performance, and scalability.

## Vercel Platform Overview

### Core Capabilities

- **Zero-Config Deployments**: Automatic build and deployment configuration
- **Global Edge Network**: Worldwide CDN with edge functions
- **Serverless Functions**: Backend API endpoints with automatic scaling
- **Preview Deployments**: Automatic staging environments for every push
- **Framework Optimization**: Built-in optimizations for popular frameworks

### Supported Frameworks

- **React**: Next.js (first-class), Create React App, Vite
- **Vue**: Nuxt.js, Vue CLI, Vite
- **Angular**: Angular CLI with SSR support
- **Svelte**: SvelteKit, Vite
- **Static Sites**: HTML, Jekyll, Hugo, Gatsby

## Deployment Architectures

### 1. JAMstack Architecture

```
Global CDN (Vercel Edge Network)
    ↓
Static Site (Pre-built)
    ↓
Serverless Functions (API Routes)
    ↓
External APIs/Database
```

**Use Cases:** Blogs, marketing sites, e-commerce frontends
**Benefits:** Maximum performance, SEO-friendly, cost-effective
**Vercel Advantages:** Built-in optimization, automatic CDN distribution

### 2. Full-Stack Next.js Application

```
Vercel Edge Network
    ↓
Next.js App (SSR/SSG/ISR)
    ↓
API Routes (Serverless Functions)
    ↓
Database (PlanetScale, Supabase, etc.)
```

**Use Cases:** Dynamic web applications, dashboards, SaaS products
**Benefits:** Unified deployment, optimized performance, developer experience
**Vercel Advantages:** Next.js optimization, automatic API scaling

### 3. Micro-Frontend Architecture

```
Main Shell (Vercel)
    ↓
Feature Modules (Separate Vercel Projects)
    ↓
Shared Components (NPM/Private Registry)
```

**Use Cases:** Large applications, team autonomy, independent deployments
**Benefits:** Team independence, technology diversity, scalable development
**Vercel Advantages:** Independent deployments, team collaboration features

## Configuration and Setup

### Project Configuration (`vercel.json`)

```json
{
  "version": 2,
  "builds": [
    {
      "src": "package.json",
      "use": "@vercel/next"
    }
  ],
  "routes": [
    {
      "src": "/api/(.*)",
      "dest": "/api/$1"
    },
    {
      "src": "/(.*)",
      "dest": "/$1"
    }
  ],
  "env": {
    "DATABASE_URL": "@database-url",
    "JWT_SECRET": "@jwt-secret"
  },
  "build": {
    "env": {
      "NODE_ENV": "production"
    }
  },
  "functions": {
    "app/api/heavy-task.js": {
      "maxDuration": 30
    }
  }
}
```

### Environment Variables

```bash
# Production secrets
vercel env add DATABASE_URL production
vercel env add JWT_SECRET production

# Development variables
vercel env add DATABASE_URL development
vercel env add DEBUG_MODE development

# Preview environment
vercel env add API_BASE_URL preview
```

### Next.js Configuration for Vercel

```javascript
// next.config.js
const nextConfig = {
  // Vercel-specific optimizations
  experimental: {
    serverComponentsExternalPackages: ['@vercel/postgres'],
  },

  // Image optimization
  images: {
    domains: ['example.com', 'cdn.example.com'],
    formats: ['image/webp', 'image/avif'],
  },

  // Headers for security and performance
  async headers() {
    return [
      {
        source: '/(.*)',
        headers: [
          {
            key: 'X-Frame-Options',
            value: 'DENY',
          },
          {
            key: 'X-Content-Type-Options',
            value: 'nosniff',
          },
          {
            key: 'Cache-Control',
            value: 'public, max-age=31536000, immutable',
          },
        ],
      },
    ]
  },

  // Redirects and rewrites
  async redirects() {
    return [
      {
        source: '/old-page',
        destination: '/new-page',
        permanent: true,
      },
    ]
  },
}

module.exports = nextConfig
```

## Serverless Functions Patterns

### API Routes with Next.js

```typescript
// pages/api/users/[id].ts
import type { NextApiRequest, NextApiResponse } from 'next'
import { sql } from '@vercel/postgres'

interface User {
  id: string
  name: string
  email: string
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<User | { error: string }>,
) {
  const { id } = req.query

  if (req.method === 'GET') {
    try {
      const { rows } = await sql`
        SELECT id, name, email 
        FROM users 
        WHERE id = ${id as string}
      `

      if (rows.length === 0) {
        return res.status(404).json({ error: 'User not found' })
      }

      res.status(200).json(rows[0] as User)
    } catch (error) {
      console.error('Database error:', error)
      res.status(500).json({ error: 'Internal server error' })
    }
  } else {
    res.setHeader('Allow', ['GET'])
    res.status(405).json({ error: 'Method not allowed' })
  }
}
```

### Edge Functions

```typescript
// middleware.ts
import { NextRequest, NextResponse } from 'next/server'
import { geolocation } from '@vercel/edge'

export function middleware(request: NextRequest) {
  const { country, region } = geolocation(request)

  // Redirect EU users to GDPR-compliant version
  if (country && ['DE', 'FR', 'IT', 'ES'].includes(country)) {
    const url = request.nextUrl.clone()
    url.pathname = `/eu${url.pathname}`
    return NextResponse.redirect(url)
  }

  // Add geolocation headers
  const response = NextResponse.next()
  response.headers.set('x-user-country', country || 'unknown')
  response.headers.set('x-user-region', region || 'unknown')

  return response
}

export const config = {
  matcher: ['/((?!api|_next/static|_next/image|favicon.ico).*)'],
}
```

### Background Jobs with Vercel Cron

```typescript
// pages/api/cron/cleanup.ts
import type { NextApiRequest, NextApiResponse } from 'next'
import { sql } from '@vercel/postgres'

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  // Verify the request is from Vercel Cron
  if (req.headers.authorization !== `Bearer ${process.env.CRON_SECRET}`) {
    return res.status(401).json({ error: 'Unauthorized' })
  }

  try {
    // Clean up expired sessions
    await sql`
      DELETE FROM sessions 
      WHERE expires_at < NOW()
    `

    // Clean up temporary files
    await sql`
      DELETE FROM temp_files 
      WHERE created_at < NOW() - INTERVAL '24 hours'
    `

    res.status(200).json({ message: 'Cleanup completed' })
  } catch (error) {
    console.error('Cleanup error:', error)
    res.status(500).json({ error: 'Cleanup failed' })
  }
}
```

### Vercel Cron Configuration

```json
{
  "crons": [
    {
      "path": "/api/cron/cleanup",
      "schedule": "0 2 * * *"
    },
    {
      "path": "/api/cron/reports",
      "schedule": "0 9 * * 1"
    }
  ]
}
```

## Performance Optimization

### Image Optimization

```tsx
import Image from 'next/image'

// Optimized image component
export default function OptimizedImage() {
  return (
    <div>
      {/* Automatic optimization with Next.js Image */}
      <Image
        src='/hero-image.jpg'
        alt='Hero image'
        width={1200}
        height={600}
        priority // Load immediately for above-the-fold images
        placeholder='blur'
        blurDataURL='data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQ...'
      />

      {/* Responsive images */}
      <Image
        src='/responsive-image.jpg'
        alt='Responsive image'
        fill
        sizes='(max-width: 768px) 100vw, (max-width: 1200px) 50vw, 33vw'
        style={{ objectFit: 'cover' }}
      />
    </div>
  )
}
```

### Code Splitting and Dynamic Imports

```tsx
import dynamic from 'next/dynamic'
import { Suspense } from 'react'

// Dynamic import with loading state
const HeavyComponent = dynamic(() => import('../components/HeavyComponent'), {
  loading: () => <p>Loading...</p>,
  ssr: false, // Disable SSR for client-only components
})

// Lazy load with Suspense
const LazyChart = dynamic(() => import('../components/Chart'), {
  suspense: true,
})

export default function Dashboard() {
  return (
    <div>
      <h1>Dashboard</h1>

      {/* Load only when needed */}
      <HeavyComponent />

      {/* With Suspense boundary */}
      <Suspense fallback={<div>Loading chart...</div>}>
        <LazyChart />
      </Suspense>
    </div>
  )
}
```

### Bundle Analysis

```json
{
  "scripts": {
    "analyze": "ANALYZE=true next build",
    "build": "next build"
  },
  "devDependencies": {
    "@next/bundle-analyzer": "^13.0.0"
  }
}
```

```javascript
// next.config.js with bundle analyzer
const withBundleAnalyzer = require('@next/bundle-analyzer')({
  enabled: process.env.ANALYZE === 'true',
})

module.exports = withBundleAnalyzer({
  // Next.js config
})
```

## Database Integration Patterns

### Vercel Postgres

```typescript
import { sql } from '@vercel/postgres'

// Simple query
export async function getUsers() {
  try {
    const { rows } = await sql`SELECT * FROM users`
    return rows
  } catch (error) {
    throw new Error('Failed to fetch users')
  }
}

// Parameterized query
export async function getUserById(id: string) {
  try {
    const { rows } = await sql`
      SELECT * FROM users WHERE id = ${id}
    `
    return rows[0]
  } catch (error) {
    throw new Error('Failed to fetch user')
  }
}

// Transaction
export async function createUserWithProfile(userData: any, profileData: any) {
  const client = await sql.connect()

  try {
    await client.sql`BEGIN`

    const userResult = await client.sql`
      INSERT INTO users (name, email) 
      VALUES (${userData.name}, ${userData.email})
      RETURNING id
    `

    await client.sql`
      INSERT INTO profiles (user_id, bio, avatar)
      VALUES (${userResult.rows[0].id}, ${profileData.bio}, ${profileData.avatar})
    `

    await client.sql`COMMIT`
    return userResult.rows[0]
  } catch (error) {
    await client.sql`ROLLBACK`
    throw error
  } finally {
    client.release()
  }
}
```

### External Database Integration

```typescript
// lib/database.ts
import { PrismaClient } from '@prisma/client'

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined
}

export const prisma = globalForPrisma.prisma ?? new PrismaClient()

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma

// API route with Prisma
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method === 'GET') {
    const users = await prisma.user.findMany({
      include: {
        posts: true,
      },
    })
    res.json(users)
  }
}
```

## Security Best Practices

### Environment Variables and Secrets

```bash
# Secure secret management
vercel env add DATABASE_URL production
vercel env add JWT_SECRET production
vercel env add STRIPE_SECRET_KEY production

# Environment-specific configurations
vercel env add NEXT_PUBLIC_API_URL production "https://api.myapp.com"
vercel env add NEXT_PUBLIC_API_URL preview "https://api-staging.myapp.com"
vercel env add NEXT_PUBLIC_API_URL development "http://localhost:3001"
```

### API Security

```typescript
// lib/auth.ts
import jwt from 'jsonwebtoken'

export function verifyToken(token: string) {
  try {
    return jwt.verify(token, process.env.JWT_SECRET!)
  } catch (error) {
    throw new Error('Invalid token')
  }
}

// middleware/auth.ts
export function withAuth(handler: NextApiHandler) {
  return async (req: NextApiRequest, res: NextApiResponse) => {
    const token = req.headers.authorization?.replace('Bearer ', '')

    if (!token) {
      return res.status(401).json({ error: 'No token provided' })
    }

    try {
      const decoded = verifyToken(token)
      req.user = decoded
      return handler(req, res)
    } catch (error) {
      return res.status(401).json({ error: 'Invalid token' })
    }
  }
}

// Usage in API route
export default withAuth(async function handler(req, res) {
  // Protected endpoint logic
  res.json({ user: req.user })
})
```

### Content Security Policy

```javascript
// next.config.js
const nextConfig = {
  async headers() {
    return [
      {
        source: '/(.*)',
        headers: [
          {
            key: 'Content-Security-Policy',
            value: [
              "default-src 'self'",
              "script-src 'self' 'unsafe-eval' 'unsafe-inline' vercel.live",
              "style-src 'self' 'unsafe-inline'",
              "img-src 'self' data: https:",
              "font-src 'self'",
              "connect-src 'self' https://api.vercel.com",
            ].join('; '),
          },
        ],
      },
    ]
  },
}
```

## Cost Optimization Strategies

### Function Optimization

```typescript
// Optimize function memory and execution time
export const config = {
  maxDuration: 10, // Reduce if possible
  memory: 128, // Start small and scale up if needed
}

// Use edge functions for simple operations
export const runtime = 'edge'

export default function handler(req: Request) {
  // Lightweight operations that run on the edge
  return new Response(JSON.stringify({ message: 'Hello from edge' }), {
    headers: { 'content-type': 'application/json' },
  })
}
```

### Bandwidth Optimization

```typescript
// Compress API responses
import { NextApiRequest, NextApiResponse } from 'next'
import { gzip } from 'zlib'
import { promisify } from 'util'

const gzipAsync = promisify(gzip)

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const data = await fetchLargeDataset()

  // Compress large responses
  if (req.headers['accept-encoding']?.includes('gzip')) {
    const compressed = await gzipAsync(JSON.stringify(data))
    res.setHeader('Content-Encoding', 'gzip')
    res.setHeader('Content-Type', 'application/json')
    res.send(compressed)
  } else {
    res.json(data)
  }
}
```

### Static Generation Optimization

```typescript
// Optimize ISR for cost and performance
export async function getStaticProps() {
  const data = await fetchData()

  return {
    props: { data },
    revalidate: 3600, // Revalidate every hour instead of on every request
  }
}

// Use static generation for predictable content
export async function getStaticPaths() {
  // Only pre-generate most popular pages
  const popularPosts = await getPopularPosts(100)

  return {
    paths: popularPosts.map(post => ({ params: { id: post.id } })),
    fallback: 'blocking', // Generate other pages on-demand
  }
}
```

## Monitoring and Analytics

### Vercel Analytics Integration

```tsx
import { Analytics } from '@vercel/analytics/react'

export default function App({ Component, pageProps }) {
  return (
    <>
      <Component {...pageProps} />
      <Analytics />
    </>
  )
}
```

### Custom Monitoring

```typescript
// lib/monitoring.ts
export function trackEvent(event: string, properties?: Record<string, any>) {
  if (typeof window !== 'undefined') {
    // Client-side tracking
    window.gtag?.('event', event, properties)
  } else {
    // Server-side logging
    console.log('Event:', event, properties)
  }
}

// Usage in API routes
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const startTime = Date.now()

  try {
    const result = await processRequest(req)

    // Track successful operations
    trackEvent('api_call_success', {
      endpoint: req.url,
      duration: Date.now() - startTime,
    })

    res.json(result)
  } catch (error) {
    // Track errors
    trackEvent('api_call_error', {
      endpoint: req.url,
      error: error.message,
      duration: Date.now() - startTime,
    })

    res.status(500).json({ error: 'Internal server error' })
  }
}
```

## Deployment Strategies

### Preview Deployments

```yaml
# .github/workflows/preview.yml
name: Preview Deployment
on:
  pull_request:
    branches: [main]

jobs:
  deploy-preview:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3

      - name: Deploy to Vercel
        uses: amondnet/vercel-action@v25
        with:
          vercel-token: ${{ secrets.VERCEL_TOKEN }}
          vercel-org-id: ${{ secrets.ORG_ID }}
          vercel-project-id: ${{ secrets.PROJECT_ID }}
          scope: ${{ secrets.TEAM_ID }}
```

### Production Deployment

```yaml
# .github/workflows/production.yml
name: Production Deployment
on:
  push:
    branches: [main]

jobs:
  deploy-production:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3

      - name: Deploy to Vercel
        uses: amondnet/vercel-action@v25
        with:
          vercel-token: ${{ secrets.VERCEL_TOKEN }}
          vercel-org-id: ${{ secrets.ORG_ID }}
          vercel-project-id: ${{ secrets.PROJECT_ID }}
          vercel-args: '--prod'
          scope: ${{ secrets.TEAM_ID }}
```

## Implementation Checklist

### Pre-Deployment

- [ ] Choose appropriate framework (Next.js recommended)
- [ ] Plan API architecture (serverless functions vs external APIs)
- [ ] Design database integration strategy
- [ ] Plan authentication and security approach
- [ ] Estimate usage and costs

### Deployment Setup

- [ ] Configure `vercel.json` for project needs
- [ ] Set up environment variables and secrets
- [ ] Configure domain and SSL
- [ ] Set up monitoring and analytics
- [ ] Configure CI/CD pipeline

### Optimization

- [ ] Implement image optimization
- [ ] Configure code splitting and lazy loading
- [ ] Set up proper caching headers
- [ ] Optimize bundle size
- [ ] Configure ISR for dynamic content

### Production Readiness

- [ ] Set up error tracking and monitoring
- [ ] Configure security headers
- [ ] Test performance and Core Web Vitals
- [ ] Set up backup and recovery procedures
- [ ] Document deployment and operational procedures

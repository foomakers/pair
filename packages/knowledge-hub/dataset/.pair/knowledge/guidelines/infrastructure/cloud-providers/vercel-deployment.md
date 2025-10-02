# Vercel Deployment Strategy

## 🎯 Overview

**Purpose**: Vercel-specific deployment patterns for frontend applications, fullstack Next.js apps, and serverless functions.

**Scope**: Vercel platform optimization, deployment automation, edge computing, and integration with modern web development workflows.

**Prerequisites**: Vercel account, Git repository, and familiarity with Next.js or static site generation.

---

## 🚀 Quick Start Decision Tree

```
Do you need Vercel deployment?
├─ Yes → What type of application?
│  ├─ Next.js App → Use [Next.js Deployment](#nextjs-deployment)
│  ├─ Static Site → Use [Static Site Deployment](#static-site-deployment)
│  ├─ Fullstack App → Use [Fullstack Deployment](#fullstack-deployment)
│  └─ Serverless Functions → Use [Edge Functions](#edge-functions)
├─ No → Consider [other cloud providers](README.md)
└─ Unsure → Review [Vercel Service Selection](#service-selection)
```

---

## 📋 Service Selection Matrix

| Use Case | Framework | Database | Storage | Deployment Method |
|----------|-----------|----------|---------|-------------------|
| **Static Site** | Next.js/Vite | External | Vercel Blob | Git Integration |
| **Web App** | Next.js | Vercel Postgres | Vercel Blob | Git Integration |
| **API Service** | Next.js API | External DB | External | Git Integration |
| **Edge Computing** | Edge Functions | Edge Config | Vercel KV | Git Integration |

---

## 🔧 Deployment Patterns

### Next.js Deployment

**Best for**: React applications, server-side rendering, static generation, full-stack apps.

**Vercel Configuration**:

```json
// vercel.json
{
  "version": 2,
  "builds": [
    {
      "src": "package.json",
      "use": "@vercel/next"
    }
  ],
  "env": {
    "NODE_ENV": "production",
    "DATABASE_URL": "@database-url",
    "NEXTAUTH_SECRET": "@nextauth-secret",
    "NEXTAUTH_URL": "@nextauth-url"
  },
  "functions": {
    "app/api/**/*.js": {
      "maxDuration": 30
    }
  },
  "headers": [
    {
      "source": "/api/(.*)",
      "headers": [
        {
          "key": "Cache-Control",
          "value": "s-maxage=60, stale-while-revalidate"
        }
      ]
    }
  ],
  "rewrites": [
    {
      "source": "/api/v1/(.*)",
      "destination": "/api/$1"
    }
  ]
}
```

**Next.js Configuration for Vercel**:

```javascript
// next.config.js
/** @type {import('next').NextConfig} */
const nextConfig = {
  // Optimize for Vercel Edge Runtime
  experimental: {
    runtime: 'edge',
    serverComponentsExternalPackages: ['@prisma/client']
  },
  
  // Image optimization
  images: {
    domains: ['example.com'],
    formats: ['image/webp', 'image/avif']
  },
  
  // Environment variables
  env: {
    CUSTOM_KEY: process.env.CUSTOM_KEY,
  },
  
  // Redirects and rewrites
  async redirects() {
    return [
      {
        source: '/old-path',
        destination: '/new-path',
        permanent: true,
      },
    ]
  },
  
  // Headers for security
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
        ],
      },
    ]
  }
}

module.exports = nextConfig
```

### Static Site Deployment

**Best for**: Documentation sites, blogs, marketing pages, JAMstack applications.

```json
// vercel.json
{
  "version": 2,
  "builds": [
    {
      "src": "package.json",
      "use": "@vercel/static-build",
      "config": {
        "distDir": "dist"
      }
    }
  ],
  "routes": [
    {
      "src": "/(.*)",
      "dest": "/$1"
    }
  ],
  "headers": [
    {
      "source": "/(.*)",
      "headers": [
        {
          "key": "Cache-Control",
          "value": "public, max-age=86400"
        }
      ]
    }
  ]
}
```

### Fullstack Deployment

**Best for**: Complete web applications with API routes, database integration, authentication.

**Project Structure**:

```
project/
├── app/                     # Next.js App Router
│   ├── api/                # API routes
│   ├── (auth)/            # Route groups
│   └── globals.css
├── components/             # React components
├── lib/                   # Utilities and database
│   ├── db.ts             # Database connection
│   └── auth.ts           # Authentication setup
├── prisma/               # Database schema
│   └── schema.prisma
├── public/               # Static assets
├── vercel.json          # Vercel configuration
└── package.json
```

**Database Integration**:

```typescript
// lib/db.ts
import { PrismaClient } from '@prisma/client'

declare global {
  var prisma: PrismaClient | undefined
}

const prisma = globalThis.prisma || new PrismaClient()

if (process.env.NODE_ENV === 'development') {
  globalThis.prisma = prisma
}

export default prisma
```

**API Route Example**:

```typescript
// app/api/users/route.ts
import { NextRequest, NextResponse } from 'next/server'
import prisma from '@/lib/db'

export async function GET(request: NextRequest) {
  try {
    const users = await prisma.user.findMany({
      select: {
        id: true,
        name: true,
        email: true,
        createdAt: true
      }
    })

    return NextResponse.json(users)
  } catch (error) {
    console.error('Database error:', error)
    return NextResponse.json(
      { error: 'Failed to fetch users' },
      { status: 500 }
    )
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { name, email } = body

    const user = await prisma.user.create({
      data: { name, email }
    })

    return NextResponse.json(user, { status: 201 })
  } catch (error) {
    console.error('Database error:', error)
    return NextResponse.json(
      { error: 'Failed to create user' },
      { status: 500 }
    )
  }
}
```

### Edge Functions

**Best for**: Global edge computing, API middleware, geo-located responses.

```typescript
// app/api/edge-example/route.ts
import { NextRequest, NextResponse } from 'next/server'

export const runtime = 'edge'

export async function GET(request: NextRequest) {
  const country = request.geo?.country || 'Unknown'
  const city = request.geo?.city || 'Unknown'
  
  return NextResponse.json({
    message: `Hello from ${city}, ${country}!`,
    timestamp: new Date().toISOString(),
    edge: true
  })
}
```

---

## 🛠️ Infrastructure Setup

### Environment Configuration

**Environment Variables Management**:

```bash
# .env.local (development)
DATABASE_URL="postgresql://username:password@localhost:5432/myapp"
NEXTAUTH_SECRET="your-secret-key"
NEXTAUTH_URL="http://localhost:3000"
STRIPE_SECRET_KEY="sk_test_..."

# Production (set via Vercel Dashboard or CLI)
vercel env add DATABASE_URL production
vercel env add NEXTAUTH_SECRET production
vercel env add NEXTAUTH_URL production
```

**Vercel Project Configuration**:

```json
// package.json
{
  "name": "my-app",
  "version": "1.0.0",
  "scripts": {
    "dev": "next dev",
    "build": "next build",
    "start": "next start",
    "lint": "next lint",
    "vercel-build": "prisma generate && next build"
  },
  "dependencies": {
    "next": "^14.0.0",
    "react": "^18.0.0",
    "@prisma/client": "^5.0.0"
  },
  "devDependencies": {
    "prisma": "^5.0.0",
    "@types/node": "^20.0.0",
    "typescript": "^5.0.0"
  }
}
```

### Database Integration

**Vercel Postgres**:

```sql
-- Create database schema
CREATE TABLE users (
  id SERIAL PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  email VARCHAR(255) UNIQUE NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_users_email ON users(email);
```

**Prisma Schema**:

```prisma
// prisma/schema.prisma
generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

model User {
  id        Int      @id @default(autoincrement())
  name      String
  email     String   @unique
  createdAt DateTime @default(now()) @map("created_at")
  updatedAt DateTime @updatedAt @map("updated_at")

  @@map("users")
}
```

---

## 🔄 CI/CD Integration

### Git-based Deployment

**Automatic Deployments**:

```yaml
# .github/workflows/vercel-deployment.yml
name: Vercel Deployment

on:
  push:
    branches: [main, develop]
  pull_request:
    branches: [main]

jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      
      - name: Setup Node.js
        uses: actions/setup-node@v3
        with:
          node-version: '18'
          cache: 'npm'

      - name: Install dependencies
        run: npm ci

      - name: Run tests
        run: npm test

      - name: Build project
        run: npm run build

      - name: Deploy to Vercel
        uses: amondnet/vercel-action@v25
        with:
          vercel-token: ${{ secrets.VERCEL_TOKEN }}
          vercel-org-id: ${{ secrets.ORG_ID }}
          vercel-project-id: ${{ secrets.PROJECT_ID }}
          working-directory: ./
```

**Branch-based Environments**:

- **main branch** → Production deployment
- **develop branch** → Preview deployment
- **feature branches** → Preview deployments
- **Pull requests** → Preview deployments with unique URLs

---

## 💰 Cost Optimization

### Vercel Pricing Strategy

**Usage Optimization**:
- Monitor function execution time and frequency
- Optimize images with Next.js Image component
- Use static generation where possible
- Implement proper caching strategies

**Resource Management**:
- Use Edge Functions for global performance
- Implement incremental static regeneration (ISR)
- Optimize bundle size with proper tree shaking
- Monitor bandwidth usage and optimize assets

**Cost Monitoring**:

```typescript
// app/api/analytics/route.ts
export async function GET() {
  // Track API usage for cost monitoring
  const metrics = {
    timestamp: new Date().toISOString(),
    endpoint: '/api/analytics',
    execution_time: Date.now()
  }
  
  // Log to external analytics service
  await logMetrics(metrics)
  
  return NextResponse.json({ status: 'logged' })
}
```

---

## 📊 Monitoring and Observability

### Vercel Analytics Integration

```typescript
// app/layout.tsx
import { Analytics } from '@vercel/analytics/react'
import { SpeedInsights } from '@vercel/speed-insights/next'

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en">
      <body>
        {children}
        <Analytics />
        <SpeedInsights />
      </body>
    </html>
  )
}
```

**Custom Monitoring**:

```typescript
// lib/monitoring.ts
export function trackEvent(name: string, properties?: Record<string, any>) {
  if (typeof window !== 'undefined' && window.va) {
    window.va('track', name, properties)
  }
}

export function trackError(error: Error, context?: string) {
  console.error(`Error in ${context}:`, error)
  
  // Send to external monitoring service
  if (process.env.NODE_ENV === 'production') {
    trackEvent('error', {
      message: error.message,
      stack: error.stack,
      context
    })
  }
}
```

---

## 🔐 Security Best Practices

### Security Implementation Checklist

- [ ] **Environment Variables**: Use Vercel environment variables for secrets
- [ ] **Authentication**: Implement NextAuth.js or similar
- [ ] **HTTPS**: Automatic SSL/TLS certificates
- [ ] **Headers**: Configure security headers in next.config.js
- [ ] **CORS**: Proper Cross-Origin Resource Sharing configuration
- [ ] **Rate Limiting**: Implement API rate limiting
- [ ] **Input Validation**: Validate all user inputs and API requests

**Security Configuration**:

```typescript
// middleware.ts
import { NextRequest, NextResponse } from 'next/server'
import { getToken } from 'next-auth/jwt'

export async function middleware(request: NextRequest) {
  // Authentication check for protected routes
  if (request.nextUrl.pathname.startsWith('/dashboard')) {
    const token = await getToken({ req: request })
    
    if (!token) {
      return NextResponse.redirect(new URL('/login', request.url))
    }
  }

  // Security headers
  const response = NextResponse.next()
  
  response.headers.set('X-Frame-Options', 'DENY')
  response.headers.set('X-Content-Type-Options', 'nosniff')
  response.headers.set('Referrer-Policy', 'origin-when-cross-origin')
  
  return response
}

export const config = {
  matcher: ['/dashboard/:path*', '/api/:path*']
}
```

---

## 🚀 Next Steps

1. **Setup Project**: Initialize Next.js project with Vercel configuration
2. **Configure Environment**: Set up environment variables and database
3. **Implement Features**: Build application with API routes and components
4. **Deploy**: Connect Git repository for automatic deployments
5. **Monitor**: Set up analytics and monitoring for production

---

## 🔗 Related Resources

- **[Next.js Documentation](https://nextjs.org/docs)**: Framework-specific guidance
- **[Deployment Patterns](../deployment-patterns/README.md)**: General deployment strategies
- **[Cost Optimization](cost-optimization.md)**: Multi-cloud cost management
- **[Infrastructure as Code](../infrastructure-as-code/README.md)**: IaC implementation patterns

---

**Next**: [Cost Optimization](cost-optimization.md) | **Previous**: [GCP Deployment](gcp-deployment.md)
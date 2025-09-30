# 🔨 Build Tools

**Focus**: Turbo, build optimization, and development workflow tooling

Build system configuration using Turbo for monorepo management, with optimized build pipelines and development workflow automation.

## 🏗️ Turbo Configuration

### Root Turbo Configuration

```json
{
  "$schema": "https://turbo.build/schema.json",
  "globalDependencies": ["**/.env.*local"],
  "globalEnv": ["NODE_ENV", "VERCEL_URL", "DATABASE_URL", "NEXTAUTH_SECRET", "NEXTAUTH_URL"],
  "pipeline": {
    "build": {
      "dependsOn": ["^build"],
      "outputs": ["dist/**", ".next/**", "!.next/cache/**"],
      "env": ["NODE_ENV", "DATABASE_URL", "NEXTAUTH_SECRET", "NEXTAUTH_URL"]
    },
    "dev": {
      "cache": false,
      "persistent": true,
      "dependsOn": ["^build"]
    },
    "test": {
      "dependsOn": ["^build"],
      "outputs": ["coverage/**"],
      "inputs": ["src/**/*.tsx", "src/**/*.ts", "test/**/*.ts", "test/**/*.tsx"]
    },
    "test:watch": {
      "cache": false,
      "persistent": true
    },
    "lint": {
      "dependsOn": ["^build"],
      "outputs": []
    },
    "lint:fix": {
      "dependsOn": ["^build"],
      "outputs": []
    },
    "type-check": {
      "dependsOn": ["^build"],
      "outputs": []
    },
    "clean": {
      "cache": false
    }
  }
}
```

### Package-Level Build Scripts

```json
{
  "scripts": {
    "build": "turbo run build",
    "dev": "turbo run dev",
    "test": "turbo run test",
    "test:watch": "turbo run test:watch",
    "lint": "turbo run lint",
    "lint:fix": "turbo run lint:fix",
    "type-check": "turbo run type-check",
    "clean": "turbo run clean",

    // Package-specific
    "build:web": "turbo run build --filter=web",
    "build:api": "turbo run build --filter=api",
    "dev:web": "turbo run dev --filter=web",
    "dev:api": "turbo run dev --filter=api",

    // Deployment
    "build:prod": "NODE_ENV=production turbo run build",
    "start": "turbo run start",

    // Utilities
    "generate": "turbo run generate",
    "db:migrate": "turbo run db:migrate",
    "db:seed": "turbo run db:seed"
  }
}
```

## ⚡ Next.js Build Configuration

### Next.js Configuration

```javascript
/** @type {import('next').NextConfig} */
const nextConfig = {
  // Performance Optimizations
  experimental: {
    turbo: {
      rules: {
        '*.svg': {
          loaders: ['@svgr/webpack'],
          as: '*.js',
        },
      },
    },
    optimizePackageImports: ['@/components', '@/lib', '@/utils'],
  },

  // Build Optimizations
  output: 'standalone',
  poweredByHeader: false,
  compress: true,

  // Image Optimization
  images: {
    formats: ['image/webp', 'image/avif'],
    deviceSizes: [640, 750, 828, 1080, 1200, 1920, 2048, 3840],
    imageSizes: [16, 32, 48, 64, 96, 128, 256, 384],
  },

  // Bundle Analysis
  webpack: (config, { buildId, dev, isServer, defaultLoaders, nextRuntime, webpack }) => {
    // Bundle Analyzer
    if (process.env.ANALYZE === 'true') {
      const BundleAnalyzerPlugin = require('webpack-bundle-analyzer').BundleAnalyzerPlugin
      config.plugins.push(
        new BundleAnalyzerPlugin({
          analyzerMode: 'static',
          reportFilename: isServer ? 'server-bundle-report.html' : 'client-bundle-report.html',
          openAnalyzer: false,
        }),
      )
    }

    // Optimize imports
    config.module.rules.push({
      test: /\.svg$/,
      use: ['@svgr/webpack'],
    })

    return config
  },

  // Environment Variables
  env: {
    CUSTOM_KEY: process.env.CUSTOM_KEY,
  },

  // Headers
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
            key: 'Referrer-Policy',
            value: 'origin-when-cross-origin',
          },
        ],
      },
    ]
  },

  // Redirects
  async redirects() {
    return [
      {
        source: '/old-path',
        destination: '/new-path',
        permanent: true,
      },
    ]
  },
}

module.exports = nextConfig
```

### TypeScript Build Configuration

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "lib": ["dom", "dom.iterable", "es6"],
    "allowJs": true,
    "skipLibCheck": true,
    "strict": true,
    "noEmit": true,
    "esModuleInterop": true,
    "module": "esnext",
    "moduleResolution": "bundler",
    "resolveJsonModule": true,
    "isolatedModules": true,
    "jsx": "preserve",
    "incremental": true,
    "plugins": [
      {
        "name": "next"
      }
    ],
    "baseUrl": ".",
    "paths": {
      "@/*": ["./src/*"],
      "@/components/*": ["./src/components/*"],
      "@/lib/*": ["./src/lib/*"],
      "@/utils/*": ["./src/utils/*"],
      "@/types/*": ["./src/types/*"]
    }
  },
  "include": ["next-env.d.ts", "**/*.ts", "**/*.tsx", ".next/types/**/*.ts"],
  "exclude": ["node_modules", ".next", "dist"]
}
```

## 🔧 Fastify Build Configuration

### Fastify Build Script

```json
{
  "scripts": {
    "build": "tsc -p tsconfig.build.json",
    "build:watch": "tsc -p tsconfig.build.json --watch",
    "start": "node dist/index.js",
    "start:prod": "NODE_ENV=production node dist/index.js",
    "dev": "tsx watch src/index.ts",
    "dev:debug": "tsx watch --inspect src/index.ts"
  }
}
```

### TypeScript Build Configuration for Node.js

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "CommonJS",
    "lib": ["ES2022"],
    "outDir": "./dist",
    "rootDir": "./src",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "declaration": true,
    "declarationMap": true,
    "sourceMap": true,
    "removeComments": true,
    "noImplicitAny": true,
    "noImplicitReturns": true,
    "noImplicitThis": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "exactOptionalPropertyTypes": true,
    "noImplicitOverride": true,
    "noPropertyAccessFromIndexSignature": true,
    "moduleResolution": "node",
    "resolveJsonModule": true,
    "allowSyntheticDefaultImports": true,
    "experimentalDecorators": true,
    "emitDecoratorMetadata": true,
    "baseUrl": ".",
    "paths": {
      "@/*": ["./src/*"],
      "@/config/*": ["./src/config/*"],
      "@/routes/*": ["./src/routes/*"],
      "@/services/*": ["./src/services/*"],
      "@/types/*": ["./src/types/*"]
    }
  },
  "include": ["src/**/*"],
  "exclude": ["node_modules", "dist", "**/*.test.ts", "**/*.spec.ts"]
}
```

## 📦 Package Build Configuration

### Shared Package Configuration

```json
{
  "name": "@repo/shared",
  "private": true,
  "main": "./dist/index.js",
  "types": "./dist/index.d.ts",
  "exports": {
    ".": {
      "types": "./dist/index.d.ts",
      "default": "./dist/index.js"
    },
    "./utils": {
      "types": "./dist/utils/index.d.ts",
      "default": "./dist/utils/index.js"
    }
  },
  "scripts": {
    "build": "tsc -p tsconfig.build.json",
    "build:watch": "tsc -p tsconfig.build.json --watch",
    "clean": "rm -rf dist",
    "type-check": "tsc --noEmit",
    "dev": "tsc -p tsconfig.build.json --watch"
  },
  "devDependencies": {
    "@types/node": "^20.0.0",
    "typescript": "^5.3.0"
  }
}
```

### Build Output Structure

```typescript
// dist/
//   index.js
//   index.d.ts
//   utils/
//     index.js
//     index.d.ts
//   types/
//     index.js
//     index.d.ts

// Package structure for optimal tree-shaking
export { createUserId, type UserId } from './user/id'
export { createUserService, type UserService } from './user/service'
export { validateEmail, type Email } from './validation/email'
export { createLogger, type Logger } from './utils/logger'
```

## 🚀 Build Optimization Strategies

### Code Splitting

```typescript
// Dynamic imports for code splitting
const DynamicComponent = dynamic(() => import('./HeavyComponent'), {
  loading: () => <p>Loading...</p>,
  ssr: false,
})

// Route-based code splitting
const AdminPanel = dynamic(() => import('./AdminPanel'), {
  loading: () => <div>Loading admin panel...</div>,
})

// Conditional loading
const DevTools = dynamic(() => import('./DevTools'), {
  ssr: false,
})

// Component-level splitting
const Chart = dynamic(() => import('react-chartjs-2'), {
  ssr: false,
  loading: () => <div>Loading chart...</div>,
})
```

### Bundle Analysis

```bash
# Next.js bundle analysis
ANALYZE=true pnpm build

# Webpack Bundle Analyzer
pnpm dlx webpack-bundle-analyzer .next/static/chunks/*.js

# Package size analysis
pnpm dlx bundlephobia <package-name>

# Dependency analysis
pnpm dlx depcheck
```

### Build Performance Optimization

```javascript
// next.config.js optimizations
const nextConfig = {
  // Experimental features for performance
  experimental: {
    turbo: {
      loaders: {
        '.svg': ['@svgr/webpack'],
      },
    },
    optimizePackageImports: ['lucide-react', '@radix-ui/react-icons', 'date-fns'],
  },

  // Webpack optimizations
  webpack: (config, { dev, isServer }) => {
    // Only in production
    if (!dev && !isServer) {
      config.optimization.splitChunks.chunks = 'all'
      config.optimization.splitChunks.cacheGroups = {
        vendor: {
          test: /[\\/]node_modules[\\/]/,
          name: 'vendors',
          chunks: 'all',
        },
      }
    }

    return config
  },
}
```

## 🔄 Development Workflow

### Watch Mode Configuration

```json
{
  "scripts": {
    "dev:all": "turbo run dev --parallel",
    "dev:web": "turbo run dev --filter=web...",
    "dev:api": "turbo run dev --filter=api...",
    "dev:packages": "turbo run dev --filter=!web --filter=!api",

    "build:affected": "turbo run build --filter='[HEAD^1]'",
    "test:affected": "turbo run test --filter='[HEAD^1]'",
    "lint:affected": "turbo run lint --filter='[HEAD^1]'"
  }
}
```

### Hot Reload Configuration

```typescript
// Development server configuration
const devConfig = {
  // Next.js hot reload
  reactStrictMode: true,

  // Fastify hot reload
  // Using tsx for TypeScript hot reload
  devDependencies: {
    "tsx": "^4.0.0"
  }
};

// Development script
// package.json
{
  "scripts": {
    "dev": "tsx watch --clear-screen=false src/index.ts"
  }
}
```

## 📊 Build Monitoring

### Build Performance Metrics

```typescript
// Build time tracking
const buildStart = Date.now()

module.exports = {
  webpack: (config, { buildId, dev }) => {
    if (!dev) {
      config.plugins.push({
        apply: compiler => {
          compiler.hooks.done.tap('BuildTimer', stats => {
            const buildTime = Date.now() - buildStart
            console.log(`Build completed in ${buildTime}ms`)
          })
        },
      })
    }

    return config
  },
}
```

### CI/CD Build Configuration

```yaml
# .github/workflows/build.yml
name: Build
on: [push, pull_request]

jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v2
        with:
          version: 8
      - uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: 'pnpm'

      - run: pnpm install --frozen-lockfile
      - run: pnpm run build
      - run: pnpm run test
      - run: pnpm run lint

      # Cache build artifacts
      - uses: actions/cache@v3
        with:
          path: |
            ${{ github.workspace }}/.next/cache
            ${{ github.workspace }}/node_modules/.cache
          key: ${{ runner.os }}-build-${{ hashFiles('**/pnpm-lock.yaml') }}
```

## 🔗 Related Tools

- **Development Environment** - Environment setup and dependencies
- **Code Quality Tools** - Linting and formatting integration
- **[Editor Setup](editor-setup.md)** - VS Code build task configuration
- **[Deployment Workflow](.pair/knowledge/guidelines/technical-standards/deployment-workflow)** - Production build and deployment

## 🎯 Build Checklist

- [ ] Configure Turbo for monorepo builds
- [ ] Set up package-specific build scripts
- [ ] Optimize Next.js build configuration
- [ ] Configure TypeScript build settings
- [ ] Set up bundle analysis tools
- [ ] Implement code splitting strategies
- [ ] Configure development watch modes
- [ ] Set up build performance monitoring
- [ ] Configure CI/CD build pipeline

---

_These build tools ensure fast, optimized, and reliable builds across the entire development workflow._

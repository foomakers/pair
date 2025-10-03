# Docker Implementation

## Scope

Comprehensive Docker implementation guide covering containerization best practices, image optimization, security hardening, and development workflow integration for enterprise applications.

## Content Summary

- **Docker Fundamentals**: Container creation, image management, and optimization strategies
- **Security Practices**: Vulnerability scanning, access control, and runtime security
- **Development Integration**: Local development, testing, and CI/CD pipeline integration
- **Production Readiness**: Performance optimization, monitoring, and operational practices

---

## Docker Implementation Framework

### Development Environment Setup

```bash
# Docker Development Environment
# Install Docker Desktop or Docker Engine
curl -fsSL https://get.docker.com -o get-docker.sh
sudo sh get-docker.sh

# Configure Docker for development
sudo usermod -aG docker $USER
newgrp docker

### Development Environment Setup

**Docker Development Configuration**

Modern Docker development requires optimized configuration for build performance and developer productivity. Key setup considerations include BuildKit enablement, logging configuration, and storage optimization.

**Essential Development Setup:**

- **BuildKit integration**: Enhanced build performance with parallel execution
- **Logging optimization**: Controlled log size and rotation for development
- **Storage configuration**: Optimized overlay2 driver settings
- **Cache management**: Efficient layer caching and build optimization

**Quick Development Setup Process:**

```bash
# Install Docker and enable BuildKit
curl -fsSL https://get.docker.com -o get-docker.sh
sudo sh get-docker.sh
echo 'export DOCKER_BUILDKIT=1' >> ~/.bashrc

# Configure Docker daemon for development
sudo tee /etc/docker/daemon.json > /dev/null <<EOF
{
  "features": { "buildkit": true },
  "log-driver": "json-file",
  "log-opts": { "max-size": "10m" }
}
EOF
```

### Multi-Stage Dockerfile Optimization

**Advanced Build Patterns**

Multi-stage builds separate build-time and runtime concerns, resulting in optimized production images. The pattern includes dependency installation, application building, and minimal runtime image creation.

**Multi-Stage Build Benefits:**

- **Image size reduction**: Exclude build tools from production images
- **Security enhancement**: Minimal runtime attack surface
- **Build performance**: Parallel stage execution and layer caching
- **Dependency isolation**: Separate development and production dependencies

**Optimized Build Example:**

```dockerfile
# Production-optimized multi-stage build
FROM node:18-alpine AS dependencies
WORKDIR /app
COPY package*.json ./
RUN npm ci --production

FROM node:18-alpine AS builder
WORKDIR /app
COPY --from=dependencies /app/node_modules ./node_modules
COPY . .
RUN npm run build

FROM node:18-alpine AS runtime
RUN adduser --system appuser
WORKDIR /app
COPY --from=builder --chown=appuser /app/dist ./
USER appuser
HEALTHCHECK CMD curl -f localhost:3000/health
CMD ["npm", "start"]
```

### Docker Compose for Development

**Development Stack Orchestration**

Docker Compose enables comprehensive development environments with service orchestration, networking, and data persistence. The development configuration prioritizes developer experience with hot reload and debugging capabilities.

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD curl -f http://localhost:3000/api/health || exit 1

EXPOSE 3000

ENV PORT 3000
ENV NODE_ENV production

CMD ["node", "server.js"]
```

### Docker Compose for Development

```yaml
# docker-compose.dev.yml
version: '3.8'

services:
  app:
    build:
      context: .
      dockerfile: Dockerfile.dev
      target: development
    ports:
      - '3000:3000'
    volumes:
      - .:/app
      - /app/node_modules
      - /app/.next
    environment:
      - NODE_ENV=development
      - DATABASE_URL=postgresql://postgres:password@postgres:5432/myapp
      - REDIS_URL=redis://redis:6379
    depends_on:
      postgres:
        condition: service_healthy
      redis:
        condition: service_healthy
    networks:
      - app-network

  postgres:
    image: postgres:15-alpine
    ports:
      - '5432:5432'
    environment:
      POSTGRES_DB: myapp
      POSTGRES_USER: postgres
      POSTGRES_PASSWORD: password
    volumes:
      - postgres_data:/var/lib/postgresql/data
      - ./docker/postgres/init.sql:/docker-entrypoint-initdb.d/init.sql
    healthcheck:
      test: ['CMD-SHELL', 'pg_isready -U postgres']
      interval: 5s
      timeout: 5s
      retries: 5
    networks:
      - app-network

  redis:
    image: redis:7-alpine
    ports:
      - '6379:6379'
    volumes:
      - redis_data:/data
    healthcheck:
      test: ['CMD', 'redis-cli', 'ping']
      interval: 5s
      timeout: 3s
      retries: 5
    networks:
      - app-network

  nginx:
    image: nginx:alpine
    ports:
      - '80:80'
      - '443:443'
    volumes:
      - ./docker/nginx/nginx.conf:/etc/nginx/nginx.conf
      - ./docker/nginx/ssl:/etc/nginx/ssl
    depends_on:
      - app
    networks:
      - app-network

volumes:
  postgres_data:
  redis_data:

networks:
  app-network:
    driver: bridge
```

---

## Image Optimization Strategies

### Build Performance Optimization

```dockerfile
# Optimized Dockerfile with BuildKit features
# syntax=docker/dockerfile:1

FROM node:18-alpine AS base
# Enable BuildKit features
# syntax=docker/dockerfile:1.4

# Install dependencies in a cache-friendly way
RUN --mount=type=cache,target=/var/cache/apk \
    apk add --no-cache libc6-compat

# Set up pnpm with cache
RUN --mount=type=cache,target=/root/.npm \
    npm install -g pnpm

FROM base AS deps
WORKDIR /app

# Cache package.json changes
COPY package.json pnpm-lock.yaml ./
RUN --mount=type=cache,target=/root/.pnpm \
    pnpm install --frozen-lockfile

FROM base AS builder
WORKDIR /app

# Copy dependencies
COPY --from=deps /app/node_modules ./node_modules
COPY . .

# Build with cache mount
RUN --mount=type=cache,target=/app/.next/cache \
    --mount=type=cache,target=/root/.pnpm \
    pnpm build

# Production image
FROM node:18-alpine AS runner
WORKDIR /app

# Security optimizations
RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nextjs

# Copy only necessary files
COPY --from=builder --chown=nextjs:nodejs /app/dist ./dist
COPY --from=builder --chown=nextjs:nodejs /app/package.json ./package.json

USER nextjs

EXPOSE 3000
CMD ["npm", "start"]
```

### Image Size Optimization

```dockerfile
# Minimal Production Image
FROM node:18-alpine AS base

# Install dumb-init for proper signal handling
RUN apk add --no-cache dumb-init

# Create app directory and user
RUN mkdir -p /app && chown -R node:node /app
WORKDIR /app
USER node

# Copy package files
COPY --chown=node:node package*.json ./

# Install only production dependencies
RUN npm ci --only=production && npm cache clean --force

# Copy application code
COPY --chown=node:node . .

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD node healthcheck.js

EXPOSE 3000

# Use dumb-init to handle signals properly
ENTRYPOINT ["dumb-init", "--"]
CMD ["node", "index.js"]
```

### Distroless Images

```dockerfile
# Google Distroless Image
FROM node:18-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production

COPY . .
RUN npm run build

# Distroless runtime
FROM gcr.io/distroless/nodejs18-debian11
WORKDIR /app

# Copy application
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package.json ./

EXPOSE 3000
CMD ["dist/index.js"]
```

---

## Security Implementation

### Security Scanning Pipeline

```bash
#!/bin/bash
# docker-security-scan.sh

set -euo pipefail

IMAGE_NAME="${1:-}"
SEVERITY_THRESHOLD="${2:-HIGH}"

if [ -z "$IMAGE_NAME" ]; then
    echo "Usage: $0 <image-name> [severity-threshold]"
    exit 1
fi

echo "🔍 Starting security scan for: $IMAGE_NAME"

# Trivy vulnerability scan
echo "📊 Running Trivy vulnerability scan..."
trivy image \
    --severity "$SEVERITY_THRESHOLD" \
    --exit-code 1 \
    --format table \
    "$IMAGE_NAME"

# Snyk container scan
if command -v snyk &> /dev/null; then
    echo "🛡️ Running Snyk container scan..."
    snyk container test \
        --severity-threshold=high \
        "$IMAGE_NAME"
fi

# Docker Bench Security (if available)
if command -v docker-bench-security &> /dev/null; then
    echo "🔒 Running Docker Bench Security..."
    docker-bench-security
fi

# Anchore Grype scan
if command -v grype &> /dev/null; then
    echo "⚓ Running Anchore Grype scan..."
    grype "$IMAGE_NAME" \
        --fail-on high
fi

echo "✅ Security scan completed successfully!"
```

### Runtime Security Configuration

```yaml
# docker-compose.security.yml
version: '3.8'

services:
  app:
    image: myapp:latest
    security_opt:
      - no-new-privileges:true
      - apparmor:unconfined
    cap_drop:
      - ALL
    cap_add:
      - NET_BIND_SERVICE
    read_only: true
    tmpfs:
      - /tmp:noexec,nosuid,size=100m
      - /var/tmp:noexec,nosuid,size=50m
    user: '1001:1001'
    ulimits:
      nofile:
        soft: 65536
        hard: 65536
      nproc:
        soft: 4096
        hard: 4096
    sysctls:
      - net.core.somaxconn=1024
    environment:
      - NODE_ENV=production
    healthcheck:
      test: ['CMD', 'curl', '-f', 'http://localhost:3000/health']
      interval: 30s
      timeout: 10s
      retries: 3
      start_period: 40s
```

### Image Signing with Cosign

```bash
#!/bin/bash
# sign-image.sh

set -euo pipefail

IMAGE="${1:-}"
PRIVATE_KEY="${COSIGN_PRIVATE_KEY:-/keys/cosign.key}"

if [ -z "$IMAGE" ]; then
    echo "Usage: $0 <image>"
    exit 1
fi

# Generate key pair (if not exists)
if [ ! -f "$PRIVATE_KEY" ]; then
    echo "🔐 Generating Cosign key pair..."
    cosign generate-key-pair
fi

# Sign the image
echo "✍️ Signing image: $IMAGE"
cosign sign --key "$PRIVATE_KEY" "$IMAGE"

# Verify signature
echo "✅ Verifying signature..."
cosign verify --key "${PRIVATE_KEY}.pub" "$IMAGE"

echo "🎉 Image signed and verified successfully!"
```

---

## Development Workflow Integration

### Development Dockerfile

```dockerfile
# Dockerfile.dev
FROM node:18-alpine

# Install development tools
RUN apk add --no-cache \
    git \
    openssh \
    curl \
    vim \
    htop

# Install global development dependencies
RUN npm install -g \
    nodemon \
    ts-node \
    @types/node

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install all dependencies (including dev)
RUN npm install

# Copy source code
COPY . .

# Development server
CMD ["npm", "run", "dev"]
```

### Docker Development Scripts

```bash
#!/bin/bash
# scripts/docker-dev.sh

set -euo pipefail

COMMAND="${1:-help}"

case "$COMMAND" in
    "start")
        echo "🚀 Starting development environment..."
        docker-compose -f docker-compose.dev.yml up -d
        echo "✅ Development environment started!"
        echo "📱 App: http://localhost:3000"
        echo "🗄️ Database: localhost:5432"
        ;;

    "stop")
        echo "🛑 Stopping development environment..."
        docker-compose -f docker-compose.dev.yml down
        echo "✅ Development environment stopped!"
        ;;

    "restart")
        echo "♻️ Restarting development environment..."
        docker-compose -f docker-compose.dev.yml restart
        echo "✅ Development environment restarted!"
        ;;

    "logs")
        SERVICE="${2:-app}"
        echo "📋 Showing logs for: $SERVICE"
        docker-compose -f docker-compose.dev.yml logs -f "$SERVICE"
        ;;

    "shell")
        SERVICE="${2:-app}"
        echo "🐚 Opening shell in: $SERVICE"
        docker-compose -f docker-compose.dev.yml exec "$SERVICE" sh
        ;;

    "clean")
        echo "🧹 Cleaning up development environment..."
        docker-compose -f docker-compose.dev.yml down -v --remove-orphans
        docker system prune -f
        echo "✅ Cleanup completed!"
        ;;

    "build")
        echo "🏗️ Building development images..."
        docker-compose -f docker-compose.dev.yml build --no-cache
        echo "✅ Build completed!"
        ;;

    "help")
        echo "Docker Development Helper"
        echo ""
        echo "Usage: $0 <command>"
        echo ""
        echo "Commands:"
        echo "  start    Start development environment"
        echo "  stop     Stop development environment"
        echo "  restart  Restart development environment"
        echo "  logs     Show logs [service]"
        echo "  shell    Open shell [service]"
        echo "  clean    Clean up environment and images"
        echo "  build    Rebuild development images"
        echo "  help     Show this help message"
        ;;

    *)
        echo "❌ Unknown command: $COMMAND"
        echo "Run '$0 help' for available commands"
        exit 1
        ;;
esac
```

---

## CI/CD Pipeline Integration

### GitHub Actions Docker Build

```yaml
# .github/workflows/docker-build.yml
name: Docker Build and Push

on:
  push:
    branches: [main, develop]
  pull_request:
    branches: [main]

env:
  REGISTRY: ghcr.io
  IMAGE_NAME: ${{ github.repository }}

jobs:
  build:
    runs-on: ubuntu-latest
    permissions:
      contents: read
      packages: write

    steps:
      - name: Checkout repository
        uses: actions/checkout@v4

      - name: Set up Docker Buildx
        uses: docker/setup-buildx-action@v3

      - name: Log in to Container Registry
        uses: docker/login-action@v3
        with:
          registry: ${{ env.REGISTRY }}
          username: ${{ github.actor }}
          password: ${{ secrets.GITHUB_TOKEN }}

      - name: Extract metadata
        id: meta
        uses: docker/metadata-action@v5
        with:
          images: ${{ env.REGISTRY }}/${{ env.IMAGE_NAME }}
          tags: |
            type=ref,event=branch
            type=ref,event=pr
            type=sha,prefix={{branch}}-
            type=raw,value=latest,enable={{is_default_branch}}

      - name: Build and push Docker image
        uses: docker/build-push-action@v5
        with:
          context: .
          platforms: linux/amd64,linux/arm64
          push: true
          tags: ${{ steps.meta.outputs.tags }}
          labels: ${{ steps.meta.outputs.labels }}
          cache-from: type=gha
          cache-to: type=gha,mode=max

      - name: Run security scan
        uses: aquasecurity/trivy-action@master
        with:
          image-ref: ${{ env.REGISTRY }}/${{ env.IMAGE_NAME }}:${{ github.sha }}
          format: 'sarif'
          output: 'trivy-results.sarif'

      - name: Upload Trivy scan results
        uses: github/codeql-action/upload-sarif@v3
        with:
          sarif_file: 'trivy-results.sarif'
```

### Multi-Stage Build Optimization

```yaml
# .github/workflows/docker-optimized.yml
name: Optimized Docker Build

on:
  push:
    branches: [main]

jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Set up Docker Buildx
        uses: docker/setup-buildx-action@v3
        with:
          driver-opts: |
            image=moby/buildkit:master
            network=host

      - name: Build with cache
        uses: docker/build-push-action@v5
        with:
          context: .
          file: ./Dockerfile
          target: production
          platforms: linux/amd64,linux/arm64
          cache-from: |
            type=registry,ref=ghcr.io/${{ github.repository }}:cache-deps
            type=registry,ref=ghcr.io/${{ github.repository }}:cache-build
          cache-to: |
            type=registry,ref=ghcr.io/${{ github.repository }}:cache-deps,mode=max
            type=registry,ref=ghcr.io/${{ github.repository }}:cache-build,mode=max
          outputs: type=docker,dest=/tmp/image.tar

      - name: Load and test image
        run: |
          docker load -i /tmp/image.tar
          docker run --rm test-image:latest npm test
```

---

## Monitoring and Debugging

### Container Health Monitoring

```bash
#!/bin/bash
# docker-health-check.sh

set -euo pipefail

# Health check script for application
check_http_endpoint() {
    local url="${1:-http://localhost:3000/health}"
    local timeout="${2:-5}"

    if curl -f -s --max-time "$timeout" "$url" > /dev/null; then
        return 0
    else
        return 1
    fi
}

check_database_connection() {
    if [ -n "${DATABASE_URL:-}" ]; then
        node -e "
        const { Pool } = require('pg');
        const pool = new Pool({ connectionString: process.env.DATABASE_URL });
        pool.query('SELECT 1')
            .then(() => { console.log('DB OK'); process.exit(0); })
            .catch(() => { console.log('DB FAIL'); process.exit(1); });
        "
    else
        echo "No database configured"
        return 0
    fi
}

check_redis_connection() {
    if [ -n "${REDIS_URL:-}" ]; then
        redis-cli -u "$REDIS_URL" ping > /dev/null
    else
        echo "No Redis configured"
        return 0
    fi
}

# Run all health checks
echo "Running health checks..."

if check_http_endpoint; then
    echo "✅ HTTP endpoint healthy"
else
    echo "❌ HTTP endpoint unhealthy"
    exit 1
fi

if check_database_connection; then
    echo "✅ Database connection healthy"
else
    echo "❌ Database connection unhealthy"
    exit 1
fi

if check_redis_connection; then
    echo "✅ Redis connection healthy"
else
    echo "❌ Redis connection unhealthy"
    exit 1
fi

echo "🎉 All health checks passed!"
```

### Docker Debugging Tools

```bash
#!/bin/bash
# docker-debug.sh

set -euo pipefail

CONTAINER="${1:-}"
COMMAND="${2:-help}"

if [ -z "$CONTAINER" ] && [ "$COMMAND" != "help" ]; then
    echo "Usage: $0 <container> <command>"
    exit 1
fi

case "$COMMAND" in
    "logs")
        echo "📋 Container logs:"
        docker logs -f --tail=100 "$CONTAINER"
        ;;

    "stats")
        echo "📊 Container statistics:"
        docker stats "$CONTAINER" --no-stream
        ;;

    "inspect")
        echo "🔍 Container inspection:"
        docker inspect "$CONTAINER" | jq '.[0]'
        ;;

    "exec")
        echo "🐚 Executing shell in container:"
        docker exec -it "$CONTAINER" /bin/sh
        ;;

    "top")
        echo "👥 Container processes:"
        docker top "$CONTAINER"
        ;;

    "port")
        echo "🔌 Container ports:"
        docker port "$CONTAINER"
        ;;

    "diff")
        echo "📝 Container filesystem changes:"
        docker diff "$CONTAINER"
        ;;

    "export")
        FILENAME="${3:-${CONTAINER}_$(date +%Y%m%d_%H%M%S).tar}"
        echo "📦 Exporting container to: $FILENAME"
        docker export "$CONTAINER" > "$FILENAME"
        echo "✅ Container exported successfully!"
        ;;

    "help")
        echo "Docker Debugging Helper"
        echo ""
        echo "Usage: $0 <container> <command>"
        echo ""
        echo "Commands:"
        echo "  logs     Show container logs"
        echo "  stats    Show container resource usage"
        echo "  inspect  Show detailed container information"
        echo "  exec     Execute shell in container"
        echo "  top      Show running processes"
        echo "  port     Show port mappings"
        echo "  diff     Show filesystem changes"
        echo "  export   Export container to tar file"
        echo "  help     Show this help message"
        ;;

    *)
        echo "❌ Unknown command: $COMMAND"
        echo "Run '$0 help' for available commands"
        exit 1
        ;;
esac
```

---

## Performance Optimization

### Resource Limits and Constraints

```yaml
# docker-compose.prod.yml
version: '3.8'

services:
  app:
    image: myapp:latest
    deploy:
      resources:
        limits:
          cpus: '2.0'
          memory: 1G
        reservations:
          cpus: '1.0'
          memory: 512M
      restart_policy:
        condition: on-failure
        delay: 5s
        max_attempts: 3
        window: 120s
      replicas: 3
      update_config:
        parallelism: 1
        delay: 10s
        failure_action: rollback
        monitor: 60s
        order: start-first
      rollback_config:
        parallelism: 1
        delay: 0s
        failure_action: pause
        monitor: 60s
        order: stop-first
    networks:
      - app-network
    healthcheck:
      test: ['CMD', 'curl', '-f', 'http://localhost:3000/health']
      interval: 30s
      timeout: 10s
      retries: 3
      start_period: 40s

networks:
  app-network:
    driver: overlay
    attachable: true
```

This comprehensive Docker implementation guide provides enterprise-grade containerization practices with security, performance, and operational excellence built-in.

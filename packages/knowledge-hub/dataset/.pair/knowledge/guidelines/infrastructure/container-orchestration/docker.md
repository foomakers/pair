# Docker Implementation Guide

Comprehensive guide for implementing Docker containerization, including best practices, optimization strategies, multi-stage builds, and enterprise deployment patterns.

## When to Use

**Essential for:**

- Application containerization and packaging
- Development environment standardization
- Microservices deployment and isolation
- Continuous integration and deployment pipelines
- Local development environment replication
- Application portability across environments

**Consider alternatives for:**

- Simple single-file applications without dependencies
- Legacy applications with complex system dependencies
- Applications requiring direct hardware access
- Environments with severe resource constraints

## Docker Architecture and Fundamentals

### 1. Docker Core Concepts and Best Practices

```typescript
interface DockerStrategy {
  containerization: ContainerizationStrategy
  image_management: ImageManagementStrategy
  networking: NetworkingStrategy
  storage: StorageStrategy
  security: SecurityStrategy
}

interface ContainerizationStrategy {
  dockerfile_patterns: DockerfilePattern[]
  multi_stage_builds: MultiStageBuildStrategy
  image_optimization: ImageOptimizationStrategy
  runtime_configuration: RuntimeConfiguration
}

interface ImageManagementStrategy {
  registry_strategy: RegistryStrategy
  versioning: ImageVersioningStrategy
  lifecycle_management: LifecycleManagement
  security_scanning: SecurityScanningStrategy
}

// Example: Enterprise Docker Implementation Strategy
const dockerImplementationStrategy: DockerStrategy = {
  containerization: {
    dockerfile_patterns: [
      {
        pattern_name: 'multi_stage_production',
        use_cases: ['production_applications', 'optimized_images'],
        security_level: 'high',
        optimization_level: 'maximum',
      },
      {
        pattern_name: 'development_friendly',
        use_cases: ['local_development', 'debugging'],
        security_level: 'medium',
        optimization_level: 'moderate',
      },
      {
        pattern_name: 'minimal_runtime',
        use_cases: ['microservices', 'serverless'],
        security_level: 'high',
        optimization_level: 'maximum',
      },
    ],
    multi_stage_builds: {
      build_stages: ['dependencies', 'compilation', 'runtime'],
      optimization_targets: ['image_size', 'build_time', 'security'],
      caching_strategy: 'layer_optimization',
      artifact_management: 'selective_copying',
    },
    image_optimization: {
      base_image_selection: 'distroless_or_alpine',
      layer_minimization: 'combine_run_commands',
      dependency_management: 'minimal_runtime_deps',
      security_hardening: 'non_root_user',
    },
    runtime_configuration: {
      resource_limits: 'memory_and_cpu_constraints',
      health_checks: 'application_specific',
      logging_strategy: 'structured_json_logs',
      monitoring: 'metrics_and_tracing',
    },
  },
  image_management: {
    registry_strategy: {
      primary_registry: 'docker_hub_or_ecr',
      private_registry: 'harbor_or_nexus',
      multi_region: 'cross_region_replication',
      access_control: 'rbac_and_scanning',
    },
    versioning: {
      strategy: 'semantic_versioning',
      tagging_conventions: ['latest', 'git_sha', 'semantic_version'],
      immutable_tags: 'production_images',
      cleanup_policies: 'retention_based',
    },
    lifecycle_management: {
      promotion_pipeline: 'dev_to_staging_to_prod',
      vulnerability_management: 'automated_scanning',
      deprecation_strategy: 'graceful_migration',
      compliance_tracking: 'audit_trails',
    },
    security_scanning: {
      vulnerability_scanning: 'trivy_or_clair',
      policy_enforcement: 'admission_controllers',
      compliance_checks: 'cis_benchmarks',
      runtime_protection: 'falco_or_twistlock',
    },
  },
  networking: {
    network_strategy: 'custom_bridge_networks',
    service_discovery: 'dns_based',
    load_balancing: 'reverse_proxy_containers',
    security_policies: 'network_segmentation',
  },
  storage: {
    volume_strategy: 'named_volumes_and_bind_mounts',
    persistence_patterns: 'database_and_config_separation',
    backup_strategy: 'volume_snapshots',
    performance_optimization: 'ssd_backed_storage',
  },
  security: {
    image_security: 'minimal_base_images',
    runtime_security: 'non_root_containers',
    secrets_management: 'external_secret_stores',
    network_security: 'encrypted_communication',
  },
}
```

### 2. Advanced Dockerfile Patterns

```dockerfile
# Example: Multi-stage Node.js Application Dockerfile
# Build stage - Install dependencies and build application
FROM node:18-alpine AS builder

# Set working directory
WORKDIR /app

# Add non-root user for security
RUN addgroup -g 1001 -S nodejs && \
    adduser -S nextjs -u 1001

# Copy package files for dependency installation
COPY package*.json ./
COPY yarn.lock* ./

# Install dependencies with security optimizations
RUN yarn install --frozen-lockfile --production=false && \
    yarn cache clean

# Copy source code
COPY . .

# Build application
RUN yarn build

# Production dependencies stage - Only install production dependencies
FROM node:18-alpine AS deps

WORKDIR /app

# Copy package files
COPY package*.json ./
COPY yarn.lock* ./

# Install only production dependencies
RUN yarn install --frozen-lockfile --production=true && \
    yarn cache clean

# Runtime stage - Create minimal production image
FROM node:18-alpine AS runner

# Set production environment
ENV NODE_ENV=production

# Disable Next.js telemetry
ENV NEXT_TELEMETRY_DISABLED=1

# Set working directory
WORKDIR /app

# Create non-root user for security
RUN addgroup -g 1001 -S nodejs && \
    adduser -S nextjs -u 1001

# Copy runtime dependencies from deps stage
COPY --from=deps /app/node_modules ./node_modules

# Copy built application from builder stage
COPY --from=builder --chown=nextjs:nodejs /app/.next ./.next
COPY --from=builder --chown=nextjs:nodejs /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/package.json ./package.json

# Switch to non-root user
USER nextjs

# Expose port
EXPOSE 3000

# Configure health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD curl -f http://localhost:3000/api/health || exit 1

# Set entrypoint
ENTRYPOINT ["node", "server.js"]
```

```dockerfile
# Example: Go Application with Distroless Base
# Build stage
FROM golang:1.21-alpine AS builder

# Install git and ca-certificates (needed for fetching dependencies)
RUN apk update && apk add --no-cache git ca-certificates tzdata && update-ca-certificates

# Create non-root user
RUN adduser -D -g '' appuser

# Set working directory
WORKDIR /build

# Copy go mod files
COPY go.mod go.sum ./

# Download dependencies
RUN go mod download
RUN go mod verify

# Copy source code
COPY . .

# Build the binary with optimizations
RUN CGO_ENABLED=0 GOOS=linux GOARCH=amd64 go build \
    -ldflags='-w -s -extldflags "-static"' \
    -a -installsuffix cgo \
    -o app ./cmd/main.go

# Final stage - Use distroless for minimal attack surface
FROM gcr.io/distroless/static:nonroot

# Copy ca-certificates from builder
COPY --from=builder /etc/ssl/certs/ca-certificates.crt /etc/ssl/certs/

# Copy timezone data
COPY --from=builder /usr/share/zoneinfo /usr/share/zoneinfo

# Copy the binary
COPY --from=builder /build/app /app

# Copy non-root user
COPY --from=builder /etc/passwd /etc/passwd

# Use non-root user
USER nonroot:nonroot

# Expose port
EXPOSE 8080

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD ["/app", "-health-check"]

# Run the binary
ENTRYPOINT ["/app"]
```

```dockerfile
# Example: Python FastAPI Application
FROM python:3.11-slim as base

# Set environment variables
ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    PIP_NO_CACHE_DIR=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1

# Install system dependencies
RUN apt-get update && apt-get install -y \
    --no-install-recommends \
    build-essential \
    curl \
    && rm -rf /var/lib/apt/lists/*

# Create non-root user
RUN groupadd -r appuser && useradd -r -g appuser appuser

# Dependencies stage
FROM base as deps

WORKDIR /app

# Copy requirements
COPY requirements*.txt ./

# Install Python dependencies
RUN pip install --no-cache-dir -r requirements.txt

# Development stage (for local development)
FROM deps as development

# Copy source code
COPY . .

# Change ownership to non-root user
RUN chown -R appuser:appuser /app

USER appuser

# Expose port
EXPOSE 8000

# Development command with hot reload
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000", "--reload"]

# Production stage
FROM python:3.11-slim as production

# Set environment variables
ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    PIP_NO_CACHE_DIR=1

# Install only runtime dependencies
RUN apt-get update && apt-get install -y \
    --no-install-recommends \
    curl \
    && rm -rf /var/lib/apt/lists/*

# Create non-root user
RUN groupadd -r appuser && useradd -r -g appuser appuser

WORKDIR /app

# Copy installed packages from deps stage
COPY --from=deps /usr/local/lib/python3.11/site-packages /usr/local/lib/python3.11/site-packages
COPY --from=deps /usr/local/bin /usr/local/bin

# Copy application code
COPY --chown=appuser:appuser . .

# Switch to non-root user
USER appuser

# Expose port
EXPOSE 8000

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD curl -f http://localhost:8000/health || exit 1

# Production command
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000", "--workers", "4"]
```

### 3. Docker Compose for Development and Testing

```typescript
interface DockerComposeStrategy {
  development_environment: DevelopmentEnvironment
  testing_environment: TestingEnvironment
  production_like_environment: ProductionLikeEnvironment
  orchestration_patterns: OrchestrationPattern[]
}

// Example: Comprehensive Docker Compose Configuration
const dockerComposeExample = `
# docker-compose.yml - Production-like environment
version: '3.8'

services:
  # Web application
  web:
    build:
      context: .
      dockerfile: Dockerfile
      target: production
    ports:
      - "3000:3000"
    environment:
      - NODE_ENV=production
      - DATABASE_URL=postgresql://user:password@db:5432/myapp
      - REDIS_URL=redis://redis:6379
      - JWT_SECRET_FILE=/run/secrets/jwt_secret
    depends_on:
      db:
        condition: service_healthy
      redis:
        condition: service_healthy
    secrets:
      - jwt_secret
    networks:
      - app-network
    restart: unless-stopped
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:3000/health"]
      interval: 30s
      timeout: 10s
      retries: 3
      start_period: 40s
    deploy:
      resources:
        limits:
          cpus: '0.5'
          memory: 512M
        reservations:
          cpus: '0.25'
          memory: 256M

  # Database
  db:
    image: postgres:15-alpine
    environment:
      - POSTGRES_DB=myapp
      - POSTGRES_USER=user
      - POSTGRES_PASSWORD_FILE=/run/secrets/db_password
    volumes:
      - postgres_data:/var/lib/postgresql/data
      - ./init.sql:/docker-entrypoint-initdb.d/init.sql:ro
    ports:
      - "5432:5432"
    secrets:
      - db_password
    networks:
      - app-network
    restart: unless-stopped
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U user -d myapp"]
      interval: 30s
      timeout: 10s
      retries: 5
      start_period: 30s
    deploy:
      resources:
        limits:
          cpus: '1.0'
          memory: 1G
        reservations:
          cpus: '0.5'
          memory: 512M

  # Redis cache
  redis:
    image: redis:7-alpine
    ports:
      - "6379:6379"
    volumes:
      - redis_data:/data
      - ./redis.conf:/usr/local/etc/redis/redis.conf:ro
    command: redis-server /usr/local/etc/redis/redis.conf
    networks:
      - app-network
    restart: unless-stopped
    healthcheck:
      test: ["CMD", "redis-cli", "ping"]
      interval: 30s
      timeout: 10s
      retries: 3
    deploy:
      resources:
        limits:
          cpus: '0.25'
          memory: 256M
        reservations:
          cpus: '0.1'
          memory: 128M

  # Background worker
  worker:
    build:
      context: .
      dockerfile: Dockerfile
      target: production
    environment:
      - NODE_ENV=production
      - DATABASE_URL=postgresql://user:password@db:5432/myapp
      - REDIS_URL=redis://redis:6379
      - WORKER_CONCURRENCY=2
    depends_on:
      db:
        condition: service_healthy
      redis:
        condition: service_healthy
    command: ["node", "worker.js"]
    networks:
      - app-network
    restart: unless-stopped
    deploy:
      replicas: 2
      resources:
        limits:
          cpus: '0.5'
          memory: 512M
        reservations:
          cpus: '0.25'
          memory: 256M

  # Nginx reverse proxy
  nginx:
    image: nginx:alpine
    ports:
      - "80:80"
      - "443:443"
    volumes:
      - ./nginx.conf:/etc/nginx/nginx.conf:ro
      - ./ssl:/etc/nginx/ssl:ro
      - static_files:/usr/share/nginx/html:ro
    depends_on:
      - web
    networks:
      - app-network
    restart: unless-stopped
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost/health"]
      interval: 30s
      timeout: 10s
      retries: 3

  # Monitoring stack
  prometheus:
    image: prom/prometheus:latest
    ports:
      - "9090:9090"
    volumes:
      - ./prometheus.yml:/etc/prometheus/prometheus.yml:ro
      - prometheus_data:/prometheus
    command:
      - '--config.file=/etc/prometheus/prometheus.yml'
      - '--storage.tsdb.path=/prometheus'
      - '--web.console.libraries=/etc/prometheus/console_libraries'
      - '--web.console.templates=/etc/prometheus/consoles'
      - '--storage.tsdb.retention.time=200h'
      - '--web.enable-lifecycle'
    networks:
      - monitoring
    restart: unless-stopped

  grafana:
    image: grafana/grafana:latest
    ports:
      - "3001:3000"
    volumes:
      - grafana_data:/var/lib/grafana
      - ./grafana/provisioning:/etc/grafana/provisioning:ro
    environment:
      - GF_SECURITY_ADMIN_PASSWORD_FILE=/run/secrets/grafana_password
      - GF_USERS_ALLOW_SIGN_UP=false
    secrets:
      - grafana_password
    networks:
      - monitoring
    restart: unless-stopped

networks:
  app-network:
    driver: bridge
    ipam:
      config:
        - subnet: 172.20.0.0/16
  monitoring:
    driver: bridge

volumes:
  postgres_data:
    driver: local
  redis_data:
    driver: local
  static_files:
    driver: local
  prometheus_data:
    driver: local
  grafana_data:
    driver: local

secrets:
  jwt_secret:
    file: ./secrets/jwt_secret.txt
  db_password:
    file: ./secrets/db_password.txt
  grafana_password:
    file: ./secrets/grafana_password.txt
`

// Development-specific Docker Compose override
const dockerComposeDevExample = `
# docker-compose.dev.yml - Development overrides
version: '3.8'

services:
  web:
    build:
      target: development
    volumes:
      - .:/app
      - /app/node_modules
    environment:
      - NODE_ENV=development
      - LOG_LEVEL=debug
    ports:
      - "3000:3000"
      - "9229:9229"  # Node.js debugging port
    command: ["npm", "run", "dev"]

  db:
    environment:
      - POSTGRES_DB=myapp_dev
    ports:
      - "5433:5432"  # Different port to avoid conflicts

  redis:
    ports:
      - "6380:6379"  # Different port to avoid conflicts

  # Development tools
  mailhog:
    image: mailhog/mailhog:latest
    ports:
      - "1025:1025"  # SMTP server
      - "8025:8025"  # Web UI
    networks:
      - app-network

  # Database admin tool
  pgadmin:
    image: dpage/pgadmin4:latest
    environment:
      - PGADMIN_DEFAULT_EMAIL=admin@example.com
      - PGADMIN_DEFAULT_PASSWORD=admin
    ports:
      - "5050:80"
    networks:
      - app-network
`

// Testing environment configuration
const dockerComposeTestExample = `
# docker-compose.test.yml - Testing environment
version: '3.8'

services:
  web-test:
    build:
      context: .
      dockerfile: Dockerfile
      target: production
    environment:
      - NODE_ENV=test
      - DATABASE_URL=postgresql://test:test@db-test:5432/myapp_test
      - REDIS_URL=redis://redis-test:6379
    depends_on:
      - db-test
      - redis-test
    command: ["npm", "test"]
    networks:
      - test-network

  db-test:
    image: postgres:15-alpine
    environment:
      - POSTGRES_DB=myapp_test
      - POSTGRES_USER=test
      - POSTGRES_PASSWORD=test
    tmpfs:
      - /var/lib/postgresql/data  # Use tmpfs for faster tests
    networks:
      - test-network

  redis-test:
    image: redis:7-alpine
    tmpfs:
      - /data  # Use tmpfs for faster tests
    networks:
      - test-network

  # Integration test runner
  integration-tests:
    build:
      context: .
      dockerfile: Dockerfile.test
    environment:
      - API_URL=http://web-test:3000
      - DATABASE_URL=postgresql://test:test@db-test:5432/myapp_test
    depends_on:
      - web-test
      - db-test
    command: ["npm", "run", "test:integration"]
    networks:
      - test-network
    volumes:
      - ./test/results:/app/test-results

networks:
  test-network:
    driver: bridge
`
```

### 4. Docker Security and Optimization

```typescript
interface DockerSecurityFramework {
  image_security: ImageSecurity
  runtime_security: RuntimeSecurity
  network_security: NetworkSecurity
  secrets_management: SecretsManagement
}

interface ImageSecurity {
  base_image_selection: BaseImageStrategy
  vulnerability_scanning: VulnerabilityScanning
  image_signing: ImageSigning
  compliance_checks: ComplianceChecks
}

// Example: Comprehensive Security Implementation
class DockerSecurityImplementation {
  // Security-hardened Dockerfile template
  public generateSecureDockerfile(): string {
    return `
# Security-hardened Dockerfile example
FROM node:18-alpine AS base

# Security: Update packages and install security updates
RUN apk update && apk upgrade && \\
    apk add --no-cache dumb-init && \\
    rm -rf /var/cache/apk/*

# Security: Create non-root user with specific UID/GID
RUN addgroup -g 10001 -S appgroup && \\
    adduser -u 10001 -S appuser -G appgroup

# Security: Set secure file permissions
WORKDIR /app
RUN chown appuser:appgroup /app

# Switch to non-root user early
USER appuser

# Copy package files
COPY --chown=appuser:appgroup package*.json ./

# Install dependencies with security audit
RUN npm ci --only=production && \\
    npm audit fix && \\
    npm cache clean --force

# Copy application code with proper ownership
COPY --chown=appuser:appgroup . .

# Security: Remove unnecessary files and packages
RUN rm -rf .git .gitignore .dockerignore \\
           README.md docs/ tests/ \\
           *.md

# Security: Set read-only filesystem
RUN chmod -R 444 /app && \\
    chmod 555 /app/bin/* || true

# Security: Health check as non-root user
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \\
  CMD wget --no-verbose --tries=1 --spider http://localhost:3000/health || exit 1

# Security: Use dumb-init to handle signals properly
ENTRYPOINT ["dumb-init", "--"]

# Security: Drop capabilities and run as non-root
USER 10001:10001

# Run application
CMD ["node", "server.js"]
    `
  }

  // Docker security scanning implementation
  public implementSecurityScanning(): SecurityScanningConfig {
    return {
      vulnerability_scanning: {
        tools: [
          {
            name: 'trivy',
            command: 'trivy image --severity HIGH,CRITICAL myapp:latest',
            integration: 'ci_cd_pipeline',
            fail_on: 'critical_vulnerabilities',
          },
          {
            name: 'grype',
            command: 'grype myapp:latest -o json',
            integration: 'pre_deployment',
            fail_on: 'high_severity_vulnerabilities',
          },
          {
            name: 'clair',
            integration: 'registry_scanning',
            continuous: true,
            reporting: 'dashboard_integration',
          },
        ],
        policies: {
          block_deployment: 'critical_vulnerabilities_found',
          notification: 'security_team_alerts',
          remediation: 'automated_pr_creation',
          reporting: 'weekly_security_reports',
        },
      },

      runtime_security: {
        capabilities: {
          drop_all: true,
          add_required_only: ['CHOWN', 'SETGID', 'SETUID'],
          never_add: ['SYS_ADMIN', 'NET_ADMIN', 'SYS_TIME'],
        },
        security_contexts: {
          run_as_non_root: true,
          run_as_user: 10001,
          run_as_group: 10001,
          read_only_root_filesystem: true,
          allow_privilege_escalation: false,
        },
        resource_limits: {
          memory: '512Mi',
          cpu: '500m',
          ephemeral_storage: '1Gi',
        },
      },

      network_security: {
        network_policies: {
          default_deny: true,
          explicit_allow: 'required_services_only',
          ingress_rules: 'whitelist_based',
          egress_rules: 'application_specific',
        },
        tls_configuration: {
          enforce_tls: true,
          min_version: 'TLSv1.2',
          cipher_suites: 'modern_cipher_suites',
          certificate_management: 'automated_renewal',
        },
      },

      secrets_management: {
        secret_storage: 'external_secret_manager',
        secret_injection: 'init_container_or_csi',
        secret_rotation: 'automated_rotation',
        access_control: 'rbac_based',
      },
    }
  }

  // Container optimization strategies
  public implementOptimization(): OptimizationStrategy {
    return {
      image_optimization: {
        multi_stage_builds: {
          build_stage: 'full_toolchain',
          runtime_stage: 'minimal_runtime',
          artifact_copying: 'selective_files_only',
          layer_caching: 'dependency_layer_optimization',
        },
        base_image_selection: {
          production: 'distroless_or_scratch',
          development: 'alpine_based',
          debugging: 'full_os_with_tools',
          security_priority: 'minimal_attack_surface',
        },
        size_optimization: {
          remove_package_managers: true,
          combine_run_commands: true,
          cleanup_temp_files: true,
          use_dockerignore: true,
        },
      },

      runtime_optimization: {
        resource_management: {
          cpu_limits: 'application_profiled',
          memory_limits: 'heap_plus_overhead',
          io_limits: 'workload_appropriate',
          monitoring: 'resource_usage_tracking',
        },
        performance_tuning: {
          jvm_tuning: 'container_aware_settings',
          node_options: 'production_optimized',
          python_optimization: 'bytecode_caching',
          garbage_collection: 'low_latency_collectors',
        },
      },

      build_optimization: {
        build_cache: {
          registry_cache: 'enable_buildkit_cache',
          local_cache: 'layer_caching',
          dependency_cache: 'package_manager_cache',
          build_context: 'minimal_context',
        },
        parallel_builds: {
          concurrent_stages: 'independent_stages',
          build_matrix: 'platform_specific',
          resource_allocation: 'build_node_optimization',
        },
      },
    }
  }
}

// Example: Production-ready Docker configuration
const productionDockerConfig = `
# Production Docker configuration
# .dockerignore
.git
.gitignore
.dockerignore
Dockerfile*
README.md
node_modules
npm-debug.log*
.nyc_output
coverage/
.coverage
test/
tests/
spec/
*.test.js
*.spec.js
.env.local
.env.development
.vscode/
.idea/

# Docker Compose production override
version: '3.8'

x-logging: &default-logging
  driver: "json-file"
  options:
    max-size: "10m"
    max-file: "3"

x-restart-policy: &restart-policy
  restart: unless-stopped

x-security-opts: &security-opts
  security_opt:
    - no-new-privileges:true
  cap_drop:
    - ALL
  cap_add:
    - CHOWN
    - SETGID
    - SETUID

services:
  app:
    <<: *restart-policy
    <<: *security-opts
    build:
      context: .
      dockerfile: Dockerfile
      target: production
    read_only: true
    tmpfs:
      - /tmp
      - /var/tmp
    volumes:
      - type: tmpfs
        target: /app/tmp
        tmpfs:
          size: 100M
    environment:
      - NODE_ENV=production
      - NODE_OPTIONS=--max-old-space-size=460
    deploy:
      resources:
        limits:
          cpus: '0.5'
          memory: 512M
          pids: 100
        reservations:
          cpus: '0.25'
          memory: 256M
    logging: *default-logging
    healthcheck:
      test: ["CMD-SHELL", "wget --no-verbose --tries=1 --spider http://localhost:3000/health || exit 1"]
      interval: 30s
      timeout: 5s
      retries: 3
      start_period: 30s
`
```

## Implementation Best Practices

### 1. Development Workflow

- **Multi-stage Builds**: Use multi-stage builds for optimized production images
- **Layer Optimization**: Order Dockerfile instructions for optimal layer caching
- **Security by Default**: Run containers as non-root users with minimal privileges
- **Resource Limits**: Set appropriate CPU and memory limits for all containers
- **Health Checks**: Implement comprehensive health checks for all services

### 2. Security and Compliance

- **Base Image Security**: Use minimal, regularly updated base images
- **Vulnerability Scanning**: Integrate security scanning into CI/CD pipelines
- **Secrets Management**: Never embed secrets in images; use external secret management
- **Network Security**: Implement network policies and encrypted communication
- **Runtime Security**: Use security contexts and capability restrictions

### 3. Performance and Optimization

- **Image Size**: Minimize image sizes through careful base image selection
- **Build Performance**: Optimize build times with effective caching strategies
- **Runtime Performance**: Configure applications for container environments
- **Resource Efficiency**: Monitor and optimize resource usage continuously
- **Scaling Strategies**: Design containers for horizontal scaling

### 4. Operations and Monitoring

- **Logging Strategy**: Implement structured logging with appropriate retention
- **Monitoring Integration**: Include monitoring and observability tools
- **Backup and Recovery**: Plan for data persistence and backup strategies
- **Update Management**: Establish processes for regular image updates
- **Disaster Recovery**: Test and document disaster recovery procedures

## Implementation Checklist

### Foundation Phase

- [ ] Design container architecture and deployment strategy
- [ ] Set up Docker development environment
- [ ] Create optimized Dockerfile templates
- [ ] Establish image naming and versioning conventions
- [ ] Configure container registry and access controls

### Security Phase

- [ ] Implement security-hardened Dockerfile patterns
- [ ] Set up vulnerability scanning pipeline
- [ ] Configure secrets management integration
- [ ] Establish security policies and compliance checks
- [ ] Create runtime security monitoring

### Optimization Phase

- [ ] Optimize image sizes and build times
- [ ] Configure resource limits and monitoring
- [ ] Implement caching strategies
- [ ] Set up performance monitoring and alerting
- [ ] Create scaling and deployment automation

### Operations Phase

- [ ] Deploy monitoring and logging infrastructure
- [ ] Configure backup and disaster recovery
- [ ] Establish update and maintenance procedures
- [ ] Create operational runbooks and documentation
- [ ] Train team on Docker best practices

## Related Patterns

- **[Kubernetes Implementation](kubernetes.md)**: Container orchestration at scale
- **[Container Strategy](container-strategy.md)**: High-level container adoption strategy
- **[Docker Compose](docker-compose.md)**: Local development orchestration

## References

- Docker Official Documentation
- Docker Security Best Practices
- Container Security Standards
- Docker Performance Optimization Guide
- Production Container Deployment Patterns

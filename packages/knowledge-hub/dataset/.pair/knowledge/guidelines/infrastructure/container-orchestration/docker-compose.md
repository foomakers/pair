# Docker Compose Implementation

## Scope

Docker Compose implementation for local development, testing environments, and multi-container application orchestration with focus on developer productivity and environment consistency.

## Content Summary

- **Multi-Service Architecture**: Container orchestration for complex applications
- **Development Workflows**: Local development setup and hot-reload configurations
- **Environment Management**: Production-like local environments with proper networking
- **Testing Integration**: Automated testing with isolated test environments

---

## Development Environment Setup

### Complete Application Stack

**Multi-Service Development Architecture**

Docker Compose orchestrates complex development environments with service dependencies, networking, and data persistence. The development stack includes application services, databases, cache layers, and external service emulators.

**Key Development Environment Features:**

- **Hot reload integration**: Real-time code changes with volume mounting
- **Service dependency management**: Ordered startup with health checks
- **Development tooling**: Integrated debugging, logging, and monitoring
- **Data persistence**: Volume management for development data retention

**Standard Development Stack Configuration:**

A typical development environment includes the main application, PostgreSQL database, Redis cache, and supporting services. Each service includes health checks and proper networking configuration.

```yaml
# docker-compose.yml - Development stack
version: '3.8'

services:
  app:
    build:
      context: .
      dockerfile: Dockerfile.dev
    ports:
      - '3000:3000'
    volumes:
      - .:/app
      - /app/node_modules
    environment:
      - NODE_ENV=development
      - DATABASE_URL=postgresql://postgres:password@postgres:5432/myapp_dev
    depends_on:
      postgres:
        condition: service_healthy
    networks:
      - app-network

  postgres:
    image: postgres:15-alpine
    environment:
      POSTGRES_DB: myapp_dev
      POSTGRES_USER: postgres
      POSTGRES_PASSWORD: password
    volumes:
      - postgres_data:/var/lib/postgresql/data
    healthcheck:
      test: ['CMD-SHELL', 'pg_isready -U postgres']
      interval: 5s
    networks:
      - app-network

volumes:
  postgres_data:

networks:
  app-network:
```

### Testing Environment

**Isolated Testing Infrastructure**

Testing environments require isolated services and test-specific configurations. The testing stack provides clean state initialization and optimized performance for test execution.

**Testing Environment Characteristics:**

- **Service isolation**: Separate containers for test execution
- **Fast startup**: Optimized images and minimal service configurations
- **Clean state**: Automated database reset and cache clearing
- **Parallel execution**: Support for concurrent test runs

The testing configuration prioritizes speed and isolation over development convenience, using in-memory databases where appropriate and minimal service configurations.
    ports:
      - '9200:9200'
      - '9300:9300'
    environment:
      - discovery.type=single-node
      - xpack.security.enabled=false
      - 'ES_JAVA_OPTS=-Xms512m -Xmx512m'
    volumes:
      - elasticsearch_data:/usr/share/elasticsearch/data
    healthcheck:
      test: ['CMD-SHELL', 'curl -f http://localhost:9200/_cluster/health || exit 1']
      interval: 30s
      timeout: 10s
      retries: 5
      start_period: 30s
    networks:
      - app-network

  rabbitmq:
    image: rabbitmq:3-management-alpine
    ports:
      - '5672:5672'
      - '15672:15672' # Management UI
    environment:
      RABBITMQ_DEFAULT_USER: guest
      RABBITMQ_DEFAULT_PASS: guest
    volumes:
      - rabbitmq_data:/var/lib/rabbitmq
      - ./docker/rabbitmq/rabbitmq.conf:/etc/rabbitmq/rabbitmq.conf
    healthcheck:
      test: ['CMD', 'rabbitmq-diagnostics', 'ping']
      interval: 30s
      timeout: 10s
      retries: 5
      start_period: 30s
    networks:
      - app-network

  localstack:
    image: localstack/localstack:2.0
    ports:
      - '4566:4566'
    environment:
      - SERVICES=s3,sqs,sns,dynamodb,lambda,apigateway
      - DEBUG=1
      - DATA_DIR=/tmp/localstack/data
      - PERSISTENCE=1
    volumes:
      - localstack_data:/tmp/localstack
      - /var/run/docker.sock:/var/run/docker.sock
      - ./docker/localstack/init-aws.sh:/etc/localstack/init/ready.d/init-aws.sh
    healthcheck:
      test: ['CMD', 'curl', '-f', 'http://localhost:4566/_localstack/health']
      interval: 30s
      timeout: 10s
      retries: 5
      start_period: 30s
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
      - nginx_logs:/var/log/nginx
    depends_on:
      - app
    networks:
      - app-network

  mailcatcher:
    image: sj26/mailcatcher
    ports:
      - '1025:1025' # SMTP
      - '1080:1080' # Web UI
    networks:
      - app-network

volumes:
  postgres_data:
  redis_data:
  elasticsearch_data:
  rabbitmq_data:
  localstack_data:
  nginx_logs:

networks:
  app-network:
    driver: bridge
    ipam:
      config:
        - subnet: 172.20.0.0/16
```

### Testing Environment

```yaml
# docker-compose.test.yml
version: '3.8'

services:
  app-test:
    build:
      context: .
      dockerfile: Dockerfile.test
    environment:
      - NODE_ENV=test
      - DATABASE_URL=postgresql://postgres:password@postgres-test:5432/myapp_test
      - REDIS_URL=redis://redis-test:6379/1
    depends_on:
      postgres-test:
        condition: service_healthy
      redis-test:
        condition: service_healthy
    networks:
      - test-network
    command: npm run test:ci

  postgres-test:
    image: postgres:15-alpine
    environment:
      POSTGRES_DB: myapp_test
      POSTGRES_USER: postgres
      POSTGRES_PASSWORD: password
    tmpfs:
      - /var/lib/postgresql/data:noexec,nosuid,size=1g
    healthcheck:
      test: ['CMD-SHELL', 'pg_isready -U postgres']
      interval: 5s
      timeout: 5s
      retries: 5
    networks:
      - test-network

  redis-test:
    image: redis:7-alpine
    tmpfs:
      - /data:noexec,nosuid,size=100m
    healthcheck:
      test: ['CMD', 'redis-cli', 'ping']
      interval: 5s
      timeout: 3s
      retries: 5
    networks:
      - test-network

  playwright:
    build:
      context: .
      dockerfile: Dockerfile.playwright
    environment:
      - NODE_ENV=test
      - BASE_URL=http://app-test:3000
    depends_on:
      - app-test
    volumes:
      - ./tests/e2e:/app/tests/e2e
      - ./playwright-report:/app/playwright-report
      - ./test-results:/app/test-results
    networks:
      - test-network
    command: npx playwright test

networks:
  test-network:
    driver: bridge
```

---

## Production-like Environment

### Staging Configuration

```yaml
# docker-compose.staging.yml
version: '3.8'

services:
  app:
    build:
      context: .
      dockerfile: Dockerfile
      target: production
    deploy:
      replicas: 2
      resources:
        limits:
          cpus: '1.0'
          memory: 1G
        reservations:
          cpus: '0.5'
          memory: 512M
      restart_policy:
        condition: on-failure
        delay: 5s
        max_attempts: 3
    environment:
      - NODE_ENV=staging
      - DATABASE_URL=postgresql://postgres:${DB_PASSWORD}@postgres:5432/myapp_staging
      - REDIS_URL=redis://redis:6379/0
    depends_on:
      postgres:
        condition: service_healthy
      redis:
        condition: service_healthy
    networks:
      - app-network
    healthcheck:
      test: ['CMD', 'curl', '-f', 'http://localhost:3000/health']
      interval: 30s
      timeout: 10s
      retries: 3
      start_period: 40s

  postgres:
    image: postgres:15-alpine
    environment:
      POSTGRES_DB: myapp_staging
      POSTGRES_USER: postgres
      POSTGRES_PASSWORD: ${DB_PASSWORD}
    volumes:
      - postgres_data:/var/lib/postgresql/data
      - ./docker/postgres/postgresql.conf:/etc/postgresql/postgresql.conf
    command: postgres -c config_file=/etc/postgresql/postgresql.conf
    deploy:
      resources:
        limits:
          cpus: '2.0'
          memory: 2G
        reservations:
          cpus: '1.0'
          memory: 1G
    healthcheck:
      test: ['CMD-SHELL', 'pg_isready -U postgres']
      interval: 10s
      timeout: 5s
      retries: 5
    networks:
      - app-network

  redis:
    image: redis:7-alpine
    volumes:
      - redis_data:/data
      - ./docker/redis/redis.conf:/etc/redis/redis.conf
    command: redis-server /etc/redis/redis.conf
    deploy:
      resources:
        limits:
          cpus: '0.5'
          memory: 512M
        reservations:
          cpus: '0.25'
          memory: 256M
    healthcheck:
      test: ['CMD', 'redis-cli', 'ping']
      interval: 10s
      timeout: 5s
      retries: 5
    networks:
      - app-network

  nginx:
    image: nginx:alpine
    ports:
      - '80:80'
      - '443:443'
    volumes:
      - ./docker/nginx/nginx.staging.conf:/etc/nginx/nginx.conf
      - ./docker/nginx/ssl:/etc/nginx/ssl
      - nginx_logs:/var/log/nginx
    depends_on:
      - app
    deploy:
      resources:
        limits:
          cpus: '0.5'
          memory: 256M
        reservations:
          cpus: '0.25'
          memory: 128M
    networks:
      - app-network

  prometheus:
    image: prom/prometheus:v2.40.0
    ports:
      - '9090:9090'
    volumes:
      - ./docker/prometheus/prometheus.yml:/etc/prometheus/prometheus.yml
      - prometheus_data:/prometheus
    command:
      - '--config.file=/etc/prometheus/prometheus.yml'
      - '--storage.tsdb.path=/prometheus'
      - '--web.console.libraries=/etc/prometheus/console_libraries'
      - '--web.console.templates=/etc/prometheus/consoles'
      - '--storage.tsdb.retention.time=15d'
      - '--web.enable-lifecycle'
    networks:
      - app-network

  grafana:
    image: grafana/grafana:9.0.0
    ports:
      - '3001:3000'
    environment:
      - GF_SECURITY_ADMIN_PASSWORD=${GRAFANA_PASSWORD}
    volumes:
      - grafana_data:/var/lib/grafana
      - ./docker/grafana/dashboards:/etc/grafana/provisioning/dashboards
      - ./docker/grafana/datasources:/etc/grafana/provisioning/datasources
    networks:
      - app-network

volumes:
  postgres_data:
  redis_data:
  nginx_logs:
  prometheus_data:
  grafana_data:

networks:
  app-network:
    driver: overlay
    attachable: true
```

---

## Service Configuration Files

### Nginx Configuration

```nginx
# docker/nginx/nginx.conf
user nginx;
worker_processes auto;
error_log /var/log/nginx/error.log warn;
pid /var/run/nginx.pid;

events {
    worker_connections 1024;
    use epoll;
    multi_accept on;
}

http {
    include /etc/nginx/mime.types;
    default_type application/octet-stream;

    # Logging
    log_format main '$remote_addr - $remote_user [$time_local] "$request" '
                    '$status $body_bytes_sent "$http_referer" '
                    '"$http_user_agent" "$http_x_forwarded_for"';
    access_log /var/log/nginx/access.log main;

    # Performance
    sendfile on;
    tcp_nopush on;
    tcp_nodelay on;
    keepalive_timeout 65;
    types_hash_max_size 2048;

    # Security headers
    add_header X-Frame-Options DENY;
    add_header X-Content-Type-Options nosniff;
    add_header X-XSS-Protection "1; mode=block";
    add_header Strict-Transport-Security "max-age=31536000; includeSubDomains";

    # Gzip compression
    gzip on;
    gzip_vary on;
    gzip_min_length 1024;
    gzip_types text/plain text/css text/xml text/javascript
               application/javascript application/xml+rss application/json;

    # Rate limiting
    limit_req_zone $binary_remote_addr zone=api:10m rate=10r/s;
    limit_req_zone $binary_remote_addr zone=login:10m rate=1r/s;

    upstream app {
        least_conn;
        server app:3000 max_fails=3 fail_timeout=30s;
        keepalive 32;
    }

    server {
        listen 80;
        listen [::]:80;
        server_name localhost *.localhost;

        # Redirect HTTP to HTTPS in production
        # return 301 https://$server_name$request_uri;

        location / {
            proxy_pass http://app;
            proxy_set_header Host $http_host;
            proxy_set_header X-Real-IP $remote_addr;
            proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
            proxy_set_header X-Forwarded-Proto $scheme;
            proxy_redirect off;
            proxy_buffering off;
            proxy_request_buffering off;
        }

        location /api/ {
            limit_req zone=api burst=20 nodelay;
            proxy_pass http://app;
            proxy_set_header Host $http_host;
            proxy_set_header X-Real-IP $remote_addr;
            proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
            proxy_set_header X-Forwarded-Proto $scheme;
        }

        location /auth/login {
            limit_req zone=login burst=5 nodelay;
            proxy_pass http://app;
            proxy_set_header Host $http_host;
            proxy_set_header X-Real-IP $remote_addr;
            proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
            proxy_set_header X-Forwarded-Proto $scheme;
        }

        location /health {
            access_log off;
            proxy_pass http://app;
            proxy_set_header Host $http_host;
        }

        location /metrics {
            allow 172.20.0.0/16;  # Docker network
            deny all;
            proxy_pass http://app;
        }
    }
}
```

### PostgreSQL Configuration

```sql
-- docker/postgres/init.sql
-- Create additional databases and users
CREATE DATABASE myapp_test;
CREATE DATABASE myapp_staging;

-- Create application user with limited privileges
CREATE USER myapp_user WITH ENCRYPTED PASSWORD 'secure_password';
GRANT CONNECT ON DATABASE myapp_dev TO myapp_user;
GRANT CONNECT ON DATABASE myapp_test TO myapp_user;
GRANT CONNECT ON DATABASE myapp_staging TO myapp_user;

-- Connect to each database and grant schema privileges
\c myapp_dev;
GRANT USAGE ON SCHEMA public TO myapp_user;
GRANT CREATE ON SCHEMA public TO myapp_user;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO myapp_user;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO myapp_user;

\c myapp_test;
GRANT USAGE ON SCHEMA public TO myapp_user;
GRANT CREATE ON SCHEMA public TO myapp_user;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO myapp_user;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO myapp_user;

\c myapp_staging;
GRANT USAGE ON SCHEMA public TO myapp_user;
GRANT CREATE ON SCHEMA public TO myapp_user;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO myapp_user;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO myapp_user;
```

---

## Development Tools Integration

### Hot Reload Development

```dockerfile
# Dockerfile.dev
FROM node:18-alpine AS development

# Install development tools
RUN apk add --no-cache \
    git \
    curl \
    vim \
    htop \
    bash

# Install global dev dependencies
RUN npm install -g nodemon ts-node

WORKDIR /app

# Copy package files
COPY package*.json ./
COPY pnpm-lock.yaml ./

# Install all dependencies
RUN npm install -g pnpm && pnpm install

# Copy source (will be overridden by volume in compose)
COPY . .

# Expose ports
EXPOSE 3000 9229

# Development command with debugging
CMD ["pnpm", "dev:debug"]
```

### Package.json Scripts

```json
{
  "scripts": {
    "dev": "next dev",
    "dev:debug": "NODE_OPTIONS='--inspect=0.0.0.0:9229' next dev",
    "build": "next build",
    "start": "next start",
    "test": "jest",
    "test:watch": "jest --watch",
    "test:ci": "jest --ci --coverage",
    "test:e2e": "playwright test",
    "lint": "eslint . --ext .ts,.tsx,.js,.jsx",
    "lint:fix": "eslint . --ext .ts,.tsx,.js,.jsx --fix",
    "type-check": "tsc --noEmit",
    "docker:dev": "docker-compose -f docker-compose.yml up",
    "docker:test": "docker-compose -f docker-compose.test.yml up --abort-on-container-exit",
    "docker:staging": "docker-compose -f docker-compose.staging.yml up -d",
    "docker:clean": "docker-compose down -v --remove-orphans && docker system prune -f"
  }
}
```

---

## Management Scripts

### Development Helper Script

```bash
#!/bin/bash
# scripts/docker-compose-helper.sh

set -euo pipefail

ENVIRONMENT="${1:-dev}"
COMMAND="${2:-up}"

# Environment-specific compose files
declare -A COMPOSE_FILES=(
    ["dev"]="docker-compose.yml"
    ["test"]="docker-compose.test.yml"
    ["staging"]="docker-compose.staging.yml"
    ["prod"]="docker-compose.prod.yml"
)

COMPOSE_FILE="${COMPOSE_FILES[$ENVIRONMENT]}"

if [ ! -f "$COMPOSE_FILE" ]; then
    echo "❌ Compose file not found: $COMPOSE_FILE"
    exit 1
fi

case "$COMMAND" in
    "up")
        echo "🚀 Starting $ENVIRONMENT environment..."
        docker-compose -f "$COMPOSE_FILE" up -d
        echo "✅ Environment started!"
        if [ "$ENVIRONMENT" = "dev" ]; then
            echo "📱 App: http://localhost:3000"
            echo "🗄️ Database: localhost:5432"
            echo "🍯 Redis: localhost:6379"
            echo "📊 Elasticsearch: http://localhost:9200"
            echo "🐰 RabbitMQ: http://localhost:15672"
            echo "📧 MailCatcher: http://localhost:1080"
        fi
        ;;

    "down")
        echo "🛑 Stopping $ENVIRONMENT environment..."
        docker-compose -f "$COMPOSE_FILE" down
        echo "✅ Environment stopped!"
        ;;

    "restart")
        echo "♻️ Restarting $ENVIRONMENT environment..."
        docker-compose -f "$COMPOSE_FILE" restart
        echo "✅ Environment restarted!"
        ;;

    "logs")
        SERVICE="${3:-}"
        if [ -n "$SERVICE" ]; then
            echo "📋 Showing logs for $SERVICE in $ENVIRONMENT..."
            docker-compose -f "$COMPOSE_FILE" logs -f "$SERVICE"
        else
            echo "📋 Showing all logs for $ENVIRONMENT..."
            docker-compose -f "$COMPOSE_FILE" logs -f
        fi
        ;;

    "shell")
        SERVICE="${3:-app}"
        echo "🐚 Opening shell in $SERVICE ($ENVIRONMENT)..."
        docker-compose -f "$COMPOSE_FILE" exec "$SERVICE" sh
        ;;

    "clean")
        echo "🧹 Cleaning up $ENVIRONMENT environment..."
        docker-compose -f "$COMPOSE_FILE" down -v --remove-orphans
        docker system prune -f
        echo "✅ Cleanup completed!"
        ;;

    "build")
        echo "🏗️ Building $ENVIRONMENT images..."
        docker-compose -f "$COMPOSE_FILE" build --no-cache
        echo "✅ Build completed!"
        ;;

    "ps")
        echo "📋 Services status for $ENVIRONMENT:"
        docker-compose -f "$COMPOSE_FILE" ps
        ;;

    "health")
        echo "🏥 Health check for $ENVIRONMENT services:"
        docker-compose -f "$COMPOSE_FILE" ps --format table
        ;;

    *)
        echo "Docker Compose Helper"
        echo ""
        echo "Usage: $0 <environment> <command> [service]"
        echo ""
        echo "Environments: dev, test, staging, prod"
        echo ""
        echo "Commands:"
        echo "  up       Start environment"
        echo "  down     Stop environment"
        echo "  restart  Restart environment"
        echo "  logs     Show logs [service]"
        echo "  shell    Open shell [service]"
        echo "  clean    Clean up environment"
        echo "  build    Build images"
        echo "  ps       Show service status"
        echo "  health   Show health status"
        ;;
esac
```

### Environment Variable Management

```bash
#!/bin/bash
# scripts/env-manager.sh

set -euo pipefail

ENVIRONMENT="${1:-dev}"

# Load environment-specific variables
load_env() {
    local env_file=".env.${ENVIRONMENT}"

    if [ -f "$env_file" ]; then
        echo "📄 Loading environment variables from $env_file"
        export $(cat "$env_file" | grep -v '^#' | xargs)
    else
        echo "⚠️  Environment file not found: $env_file"
        echo "📝 Creating template..."
        create_env_template "$env_file"
    fi
}

create_env_template() {
    local env_file="$1"

    cat > "$env_file" << EOF
# Database Configuration
DB_PASSWORD=secure_password_$(openssl rand -hex 8)
POSTGRES_USER=postgres
POSTGRES_DB=myapp_${ENVIRONMENT}

# Redis Configuration
REDIS_PASSWORD=redis_password_$(openssl rand -hex 8)

# Application Configuration
JWT_SECRET=$(openssl rand -hex 32)
ENCRYPTION_KEY=$(openssl rand -hex 32)

# Monitoring
GRAFANA_PASSWORD=admin_password_$(openssl rand -hex 8)

# External Services
AWS_ACCESS_KEY_ID=test
AWS_SECRET_ACCESS_KEY=test
AWS_DEFAULT_REGION=us-east-1

# Development
DEBUG=true
LOG_LEVEL=debug
EOF

    echo "✅ Template created: $env_file"
    echo "🔒 Please review and update the generated passwords"
}

# Generate secrets
generate_secrets() {
    echo "🔐 Generating new secrets..."

    echo "JWT_SECRET=$(openssl rand -hex 32)"
    echo "ENCRYPTION_KEY=$(openssl rand -hex 32)"
    echo "DB_PASSWORD=$(openssl rand -hex 16)"
    echo "REDIS_PASSWORD=$(openssl rand -hex 16)"
    echo "GRAFANA_PASSWORD=$(openssl rand -hex 12)"
}

case "${2:-load}" in
    "load")
        load_env
        ;;
    "template")
        create_env_template ".env.${ENVIRONMENT}"
        ;;
    "secrets")
        generate_secrets
        ;;
    *)
        echo "Environment Manager"
        echo ""
        echo "Usage: $0 <environment> <command>"
        echo ""
        echo "Commands:"
        echo "  load      Load environment variables"
        echo "  template  Create environment template"
        echo "  secrets   Generate new secrets"
        ;;
esac
```

This comprehensive Docker Compose implementation provides a complete development and testing environment with production-like characteristics for enterprise applications.

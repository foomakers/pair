# 💻 Local Development Environment

## 🎯 Purpose

Local development environment provides developers with consistent, efficient, and production-like development setups that enable rapid iteration, effective debugging, and reliable testing while maintaining environment parity and reducing the friction between local development and production deployment.

## 📋 Scope and Coverage

**In Scope:**

- Local development environment setup and configuration
- Container-based development environments and orchestration
- Development tooling integration and automation
- Local testing and debugging strategies
- Development environment consistency and standardization
- Developer productivity optimization and workflow enhancement

**Out of Scope:**

- Production environment configuration (see Production Environment)
- CI/CD pipeline setup (see CI/CD Strategy)
- Remote development environments (see Cloud Development)
- Team collaboration tools (see Collaboration Guidelines)

## 🏗️ Local Development Architecture

### Container-Based Development Environment

**Consistent Development Setup**

Modern local development environments leverage containerization to provide consistent, reproducible development setups that mirror production environments while optimizing for developer productivity and rapid iteration.

```yaml
Local Development Architecture:
  Container Orchestration:
    - Docker Compose for multi-service development
    - Kubernetes-in-Docker (KIND) for local Kubernetes development
    - Development-optimized container configurations
    - Hot-reload and live development capabilities

  Service Integration:
    - Local service mesh for microservices development
    - Database containers with development data
    - Mock services and test doubles
    - External service integration and testing

  Development Tools:
    - Integrated development environments (IDEs)
    - Debugging and profiling tools
    - Code quality and linting tools
    - Testing frameworks and test runners

  Environment Parity:
    - Production-like configurations with development optimizations
    - Consistent dependency versions and runtime environments
    - Similar infrastructure patterns and service interactions
    - Standardized development workflows and practices
```

**Docker Compose Development Setup**

```yaml
# docker-compose.dev.yml
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
      - DEBUG=app:*
      - DATABASE_URL=postgresql://dev_user:dev_pass@postgres:5432/dev_db
      - REDIS_URL=redis://redis:6379
    depends_on:
      - postgres
      - redis
    command: npm run dev

  postgres:
    image: postgres:14-alpine
    ports:
      - '5432:5432'
    environment:
      - POSTGRES_DB=dev_db
      - POSTGRES_USER=dev_user
      - POSTGRES_PASSWORD=dev_pass
    volumes:
      - postgres_data:/var/lib/postgresql/data
      - ./scripts/db/init:/docker-entrypoint-initdb.d

  redis:
    image: redis:7-alpine
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

**Development-Optimized Container Configuration**

```dockerfile
# Dockerfile.dev - Development optimized
FROM node:18-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --include=dev
COPY . .
RUN npm install -g nodemon
EXPOSE 3000
CMD ["npm", "run", "dev"]
```

### Local Development Orchestration

**Development Environment Manager**

The development environment orchestrator manages complete automated setup of local environments. The process includes prerequisites validation, container orchestration, service configuration, and development tools integration.

**Environment Setup Process:**

- **Prerequisites validation**: Verify required tools (Docker, Node.js, etc.)
- **Container orchestration**: Setup and configuration of service containers
- **Service configuration**: Configure services for development environment
- **Tools integration**: Integration of development and debugging tools
- **Health validation**: Verify environment health and readiness

The system implements intelligent startup with dependency ordering and parallel startup of independent services to minimize setup time.

```typescript
// Development environment orchestrator
class DevelopmentOrchestrator {
  async setupEnvironment(config: ProjectConfig) {
    await this.validatePrerequisites()
    const containers = await this.setupContainers(config.services)
    const tools = await this.initializeTools(config.tools)
    return new DevelopmentEnvironment(containers, tools)
  }
}
```

### Development Workflow Integration

**Automated Development Workflows**

Automated development workflows improve productivity through hot reload, auto-testing, lint-on-save, and format-on-save capabilities. The system uses intelligent file watching with debouncing and workflow dependency management.
            'hot_reload': HotReloadWorkflow(),
            'auto_test': AutoTestWorkflow(),
            'lint_on_save': LintOnSaveWorkflow(),
            'format_on_save': FormatOnSaveWorkflow()
        }

    async def setup_development_workflows(self, project_config):
        """Setup automated development workflows"""

        # Initialize file watching
        watch_config = await self.setup_file_watching(project_config)

        # Configure workflow triggers
        workflow_triggers = await self.configure_workflow_triggers(
            project_config.workflows
        )

        # Start workflow automation
        for workflow_name, workflow in self.workflows.items():
            if workflow_name in project_config.enabled_workflows:
                await workflow.initialize(watch_config, workflow_triggers)

        return DevelopmentWorkflowSetup(watch_config, workflow_triggers)

    async def setup_file_watching(self, project_config):
        """Setup intelligent file watching for development workflows"""

        watch_patterns = {
            'source_code': project_config.source_patterns,
            'tests': project_config.test_patterns,
            'configuration': project_config.config_patterns,
            'static_assets': project_config.asset_patterns
        }

        # Configure file watching with debouncing
        watch_config = await self.watcher.configure_watching(
            watch_patterns,
            debounce_delay=500,  # 500ms debounce
            ignore_patterns=[
                'node_modules/**',
                'dist/**',
                '.git/**',
                '*.log'
            ]
        )

        return watch_config

    async def handle_file_change(self, file_path, change_type):
        """Handle file changes with appropriate workflows"""

        # Determine applicable workflows
        applicable_workflows = await self.determine_applicable_workflows(
            file_path,
            change_type
        )

        # Execute workflows in order of priority
        for workflow_name in applicable_workflows:
            workflow = self.workflows[workflow_name]
            try:
                await workflow.execute(file_path, change_type)
            except WorkflowExecutionError as e:
                await self.handle_workflow_error(workflow_name, e, file_path)
```

## 🔧 Development Tools and Integration

### IDE and Editor Integration

**Development Environment Configuration**

```json
{
  "name": "Development Container Configuration",
  "dockerComposeFile": "docker-compose.dev.yml",
  "service": "app",
  "workspaceFolder": "/app",
  "shutdownAction": "stopCompose",

  "customizations": {
    "vscode": {
      "extensions": [
        "ms-vscode.vscode-typescript-next",
        "esbenp.prettier-vscode",
        "bradlc.vscode-tailwindcss",
        "ms-vscode.vscode-jest",
        "ms-vscode-remote.remote-containers"
      ],

      "settings": {
        "typescript.preferences.importModuleSpecifier": "relative",
        "editor.formatOnSave": true,
        "editor.codeActionsOnSave": {
          "source.fixAll.eslint": true
        },
        "jest.autoRun": "watch",
        "jest.showCoverageOnLoad": true
      }
    }
  },

  "forwardPorts": [3000, 5432, 6379],
  "postCreateCommand": "npm install && npm run setup:dev",
  "postStartCommand": "npm run dev",

  "remoteUser": "node",
  "features": {
    "ghcr.io/devcontainers/features/docker-in-docker": {},
    "ghcr.io/devcontainers/features/kubectl-helm-minikube": {}
  }
}
```

**Debugging Configuration**

```yaml
# .vscode/launch.json
{
  'version': '0.2.0',
  'configurations':
    [
      {
        'name': 'Debug Application',
        'type': 'node',
        'request': 'launch',
        'program': '${workspaceFolder}/src/index.ts',
        'outFiles': ['${workspaceFolder}/dist/**/*.js'],
        'env': { 'NODE_ENV': 'development', 'DEBUG': 'app:*' },
        'runtimeArgs': ['--nolazy', '-r', 'ts-node/register'],
        'sourceMaps': true,
        'restart': true,
        'protocol': 'inspector',
        'console': 'integratedTerminal',
      },
      {
        'name': 'Debug Tests',
        'type': 'node',
        'request': 'launch',
        'program': '${workspaceFolder}/node_modules/.bin/jest',
        'args': ['--runInBand', '--no-cache'],
        'cwd': '${workspaceFolder}',
        'console': 'integratedTerminal',
        'internalConsoleOptions': 'neverOpen',
      },
      {
        'name': 'Attach to Container',
        'type': 'node',
        'request': 'attach',
        'port': 9229,
        'address': 'localhost',
        'localRoot': '${workspaceFolder}',
        'remoteRoot': '/app',
        'protocol': 'inspector',
      },
    ],
}
```

### Testing and Quality Assurance

**Local Testing Framework**

```javascript
class LocalTestingFramework {
  constructor(testRunner, coverageCollector, performanceProfiler) {
    this.runner = testRunner
    this.coverage = coverageCollector
    this.profiler = performanceProfiler

    this.testSuites = new Map([
      ['unit', new UnitTestSuite()],
      ['integration', new IntegrationTestSuite()],
      ['e2e', new EndToEndTestSuite()],
      ['performance', new PerformanceTestSuite()],
    ])
  }

  async runDevelopmentTestSuite(options = {}) {
    const testConfig = {
      watch: options.watch || false,
      coverage: options.coverage || false,
      parallel: options.parallel || true,
      bail: options.bail || false,
      verbose: options.verbose || false,
    }

    // Setup test environment
    await this.setupTestEnvironment(testConfig)

    const testResults = new Map()

    // Run test suites based on configuration
    for (const [suiteName, suite] of this.testSuites) {
      if (this.shouldRunTestSuite(suiteName, options)) {
        try {
          const result = await this.runTestSuite(suite, testConfig)
          testResults.set(suiteName, result)

          // Break early if bail is enabled and tests failed
          if (testConfig.bail && !result.success) {
            break
          }
        } catch (error) {
          testResults.set(suiteName, {
            success: false,
            error: error.message,
          })

          if (testConfig.bail) {
            break
          }
        }
      }
    }

    // Generate test report
    const testReport = await this.generateTestReport(testResults, testConfig)

    // Collect coverage if enabled
    if (testConfig.coverage) {
      const coverageReport = await this.coverage.generateCoverageReport(testResults)
      testReport.coverage = coverageReport
    }

    return testReport
  }

  async setupTestEnvironment(testConfig) {
    // Start test database
    await this.startTestDatabase()

    // Setup test data
    await this.setupTestData()

    // Configure test services
    await this.configureTestServices()

    // Initialize test monitoring
    if (testConfig.coverage) {
      await this.coverage.initialize()
    }
  }
}
```

**Development Quality Gates**

```yaml
# Development quality configuration
development_quality:
  pre_commit_hooks:
    - id: 'format_code'
      tool: 'prettier'
      files: "\\.(js|ts|json|md)$"

    - id: 'lint_code'
      tool: 'eslint'
      files: "\\.(js|ts)$"
      args: ['--fix']

    - id: 'type_check'
      tool: 'typescript'
      files: "\\.ts$"

    - id: 'test_affected'
      tool: 'jest'
      args: ['--onlyChanged', '--passWithNoTests']

  continuous_validation:
    file_watch_testing:
      enabled: true
      test_patterns: ['**/*.test.{js,ts}', '**/*.spec.{js,ts}']
      run_on_save: true

    auto_formatting:
      enabled: true
      format_on_save: true
      format_on_paste: true

    live_linting:
      enabled: true
      show_errors_inline: true
      auto_fix_on_save: true

  performance_monitoring:
    build_time_tracking: true
    test_execution_tracking: true
    hot_reload_performance: true
    memory_usage_monitoring: true
```

## 🛠️ Development Environment Management

### Environment Lifecycle Management

**Development Environment Automation**

```bash
#!/bin/bash
# scripts/dev-environment.sh

set -e

COMMAND=${1:-"help"}
PROJECT_NAME=${2:-"$(basename "$PWD")"}

case $COMMAND in
  "setup")
    echo "🚀 Setting up development environment for $PROJECT_NAME..."

    # Validate prerequisites
    ./scripts/validate-prerequisites.sh

    # Setup environment variables
    if [ ! -f .env.dev ]; then
      cp .env.example .env.dev
      echo "📝 Created .env.dev from template. Please review and update."
    fi

    # Build development containers
    docker-compose -f docker-compose.dev.yml build

    # Setup development database
    docker-compose -f docker-compose.dev.yml up -d postgres redis
    sleep 5

    # Run database migrations
    docker-compose -f docker-compose.dev.yml exec -T postgres \
      psql -U dev_user -d dev_db -f /docker-entrypoint-initdb.d/schema.sql

    # Install dependencies
    docker-compose -f docker-compose.dev.yml run --rm app npm ci

    # Run initial tests
    docker-compose -f docker-compose.dev.yml run --rm app npm test

    echo "✅ Development environment setup complete!"
    echo "Run './scripts/dev-environment.sh start' to start the environment"
    ;;

  "start")
    echo "🏃 Starting development environment..."
    docker-compose -f docker-compose.dev.yml up -d

    # Wait for services to be healthy
    echo "⏳ Waiting for services to be ready..."
    until docker-compose -f docker-compose.dev.yml exec -T app curl -f http://localhost:3000/health > /dev/null 2>&1; do
      sleep 2
    done

    echo "✅ Development environment is ready!"
    echo "Application: http://localhost:3000"
    echo "Database: localhost:5432"
    echo "Redis: localhost:6379"
    ;;

  "stop")
    echo "🛑 Stopping development environment..."
    docker-compose -f docker-compose.dev.yml down
    ;;

  "reset")
    echo "🔄 Resetting development environment..."
    docker-compose -f docker-compose.dev.yml down -v
    docker-compose -f docker-compose.dev.yml build --no-cache
    $0 setup $PROJECT_NAME
    ;;

  "logs")
    SERVICE=${2:-"app"}
    echo "📋 Showing logs for $SERVICE..."
    docker-compose -f docker-compose.dev.yml logs -f $SERVICE
    ;;

  "exec")
    SERVICE=${2:-"app"}
    COMMAND=${3:-"bash"}
    echo "🔧 Executing command in $SERVICE..."
    docker-compose -f docker-compose.dev.yml exec $SERVICE $COMMAND
    ;;

  "test")
    echo "🧪 Running tests..."
    docker-compose -f docker-compose.dev.yml run --rm app npm test
    ;;

  "help")
    echo "Development Environment Manager"
    echo ""
    echo "Usage: $0 <command> [project_name]"
    echo ""
    echo "Commands:"
    echo "  setup     Setup development environment"
    echo "  start     Start development environment"
    echo "  stop      Stop development environment"
    echo "  reset     Reset development environment"
    echo "  logs      Show logs for service"
    echo "  exec      Execute command in service"
    echo "  test      Run tests"
    echo "  help      Show this help"
    ;;

  *)
    echo "❌ Unknown command: $COMMAND"
    $0 help
    exit 1
    ;;
esac
```

### Performance Optimization

**Development Performance Tuning**

```typescript
class DevelopmentPerformanceOptimizer {
  private buildOptimizer: BuildOptimizer
  private fileWatcher: FileWatcher
  private memoryManager: MemoryManager

  async optimizeDevelopmentPerformance(
    projectConfig: ProjectConfiguration,
  ): Promise<PerformanceOptimization> {
    // Optimize build performance
    const buildOptimizations = await this.optimizeBuildPerformance(projectConfig)

    // Optimize file watching and hot reload
    const watchOptimizations = await this.optimizeFileWatching(projectConfig)

    // Optimize memory usage
    const memoryOptimizations = await this.optimizeMemoryUsage(projectConfig)

    // Optimize container performance
    const containerOptimizations = await this.optimizeContainerPerformance(projectConfig)

    return new PerformanceOptimization(
      buildOptimizations,
      watchOptimizations,
      memoryOptimizations,
      containerOptimizations,
    )
  }

  async optimizeBuildPerformance(projectConfig: ProjectConfiguration): Promise<BuildOptimizations> {
    return {
      // Enable incremental compilation
      incrementalCompilation: true,

      // Optimize TypeScript compilation
      typescriptOptimizations: {
        skipLibCheck: true,
        incremental: true,
        tsBuildInfoFile: '.tsbuildinfo',
        composite: true,
      },

      // Enable build caching
      buildCaching: {
        enabled: true,
        cacheDirectory: 'node_modules/.cache',
        persistentCache: true,
      },

      // Optimize bundling
      bundlingOptimizations: {
        devtool: 'eval-cheap-module-source-map',
        optimization: {
          removeAvailableModules: false,
          removeEmptyChunks: false,
          splitChunks: false,
        },
      },
    }
  }

  async optimizeFileWatching(projectConfig: ProjectConfiguration): Promise<WatchOptimizations> {
    return {
      // Optimize file watching patterns
      watchPatterns: {
        include: projectConfig.sourcePatterns,
        exclude: ['node_modules/**', 'dist/**', '.git/**', '*.log', 'coverage/**'],
      },

      // Configure polling optimizations
      polling: {
        enabled: false, // Use native file watching when possible
        interval: 1000, // Fallback polling interval
      },

      // Debounce configuration
      debounce: {
        delay: 300, // Debounce file changes
        maxWait: 1000, // Maximum wait time
      },

      // Hot reload optimizations
      hotReload: {
        enabled: true,
        preserveState: true,
        updateStrategy: 'hmr', // Hot Module Replacement
      },
    }
  }
}
```

## 💡 Best Practices

### Development Environment Strategy

**Environment Design Principles**

- **Production parity**: Maintain close parity with production while optimizing for development speed
- **Reproducible environments**: Ensure development environments are reproducible and consistent across team members
- **Fast feedback loops**: Optimize for rapid iteration and immediate feedback on code changes
- **Comprehensive tooling**: Integrate comprehensive development tools for debugging, testing, and code quality

**Developer Experience Optimization**

- **Minimal setup time**: Minimize time required for new developers to set up and start contributing
- **Automated workflows**: Automate repetitive development tasks and quality checks
- **Clear documentation**: Provide clear documentation for environment setup and development workflows
- **Performance monitoring**: Monitor and optimize development environment performance

### Security and Access Management

**Development Security**

```yaml
development_security:
  container_security:
    - use_non_root_user: true
    - limit_container_capabilities: true
    - secure_default_configurations: true
    - regular_base_image_updates: true

  secret_management:
    - no_production_secrets_in_dev: true
    - use_development_specific_secrets: true
    - secure_secret_injection: true
    - regular_secret_rotation: true

  network_security:
    - isolate_development_networks: true
    - use_development_specific_endpoints: true
    - implement_access_controls: true
    - monitor_network_traffic: true

  data_protection:
    - use_synthetic_test_data: true
    - anonymize_production_data: true
    - implement_data_retention_policies: true
    - secure_data_backup_and_recovery: true
```

**Access Control and Permissions**

- **Principle of least privilege**: Grant minimum necessary permissions for development tasks
- **Secure credential management**: Use secure methods for managing development credentials and secrets
- **Regular access reviews**: Regularly review and update development environment access permissions
- **Audit logging**: Implement audit logging for development environment access and operations

## 🔗 Related Practices

- **[Environment Consistency](./environment-consistency.md)** - Maintaining consistency across environments
- **[Environment Configuration](./environment-config.md)** - Configuration management strategies
- **[CI/CD Strategy](../cicd-strategy/README.md)** - Development workflow integration
- **[Testing Strategy](../../testing/testing-strategy/README.md)** - Local testing approaches and frameworks

---

_Local development environments enable developers to work efficiently and effectively by providing consistent, production-like development setups with optimized tooling, automated workflows, and comprehensive testing capabilities that accelerate development cycles while maintaining quality and reliability._

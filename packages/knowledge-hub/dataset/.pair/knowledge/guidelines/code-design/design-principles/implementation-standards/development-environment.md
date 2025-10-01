# 🛠️ Development Environment

**Focus**: Local development setup, tooling, and developer experience optimization

Guidelines for creating efficient, consistent, and productive development environments with proper tooling, debugging capabilities, and workflow optimization.

## 🎯 Development Environment Principles

### Core Development Setup

```typescript
// ✅ Development environment configuration
interface DevelopmentConfig {
  readonly mode: 'development'
  readonly hotReload: boolean
  readonly sourceMap: boolean
  readonly typeChecking: boolean
  readonly linting: boolean
  readonly debugging: {
    readonly enabled: boolean
    readonly port: number
    readonly breakOnStart: boolean
  }
  readonly logging: {
    readonly level: 'debug' | 'info'
    readonly colorize: boolean
    readonly timestamp: boolean
  }
  readonly devServer: {
    readonly port: number
    readonly host: string
    readonly open: boolean
    readonly cors: boolean
    readonly proxy?: Record<string, string>
  }
  readonly database: {
    readonly autoMigrate: boolean
    readonly seedData: boolean
    readonly resetOnStart: boolean
  }
}

// ✅ Development environment detector
class DevelopmentEnvironment {
  static isDevelopment(): boolean {
    return process.env.NODE_ENV === 'development' || process.env.NODE_ENV === undefined
  }

  static isHotReloadEnabled(): boolean {
    return this.isDevelopment() && process.env.HOT_RELOAD !== 'false'
  }

  static isDebugMode(): boolean {
    return this.isDevelopment() && process.env.DEBUG_MODE === 'true'
  }

  static getDebugPort(): number {
    return parseInt(process.env.DEBUG_PORT || '9229', 10)
  }

  static shouldSeedData(): boolean {
    return this.isDevelopment() && process.env.SEED_DATA !== 'false'
  }

  static getDevConfig(): DevelopmentConfig {
    return {
      mode: 'development',
      hotReload: this.isHotReloadEnabled(),
      sourceMap: true,
      typeChecking: true,
      linting: true,
      debugging: {
        enabled: this.isDebugMode(),
        port: this.getDebugPort(),
        breakOnStart: false,
      },
      logging: {
        level: 'debug',
        colorize: true,
        timestamp: true,
      },
      devServer: {
        port: parseInt(process.env.DEV_PORT || '3000', 10),
        host: process.env.DEV_HOST || 'localhost',
        open: process.env.DEV_OPEN !== 'false',
        cors: true,
        proxy: this.parseProxyConfig(),
      },
      database: {
        autoMigrate: true,
        seedData: this.shouldSeedData(),
        resetOnStart: process.env.DB_RESET === 'true',
      },
    }
  }

  private static parseProxyConfig(): Record<string, string> {
    const proxyConfig = process.env.DEV_PROXY
    if (!proxyConfig) return {}

    try {
      return JSON.parse(proxyConfig)
    } catch {
      console.warn('Invalid DEV_PROXY configuration, ignoring')
      return {}
    }
  }
}

// ✅ Development utilities
class DevUtils {
  static async waitForDatabase(maxAttempts: number = 30): Promise<void> {
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        await DatabaseClient.ping()
        console.log('✅ Database connection established')
        return
      } catch (error) {
        console.log(`⏳ Waiting for database... (${attempt}/${maxAttempts})`)
        await new Promise(resolve => setTimeout(resolve, 1000))
      }
    }

    throw new Error('Failed to connect to database after max attempts')
  }

  static async seedDevelopmentData(): Promise<void> {
    if (!DevelopmentEnvironment.shouldSeedData()) {
      return
    }

    console.log('🌱 Seeding development data...')

    try {
      await this.seedUsers()
      await this.seedProducts()
      await this.seedOrders()

      console.log('✅ Development data seeded successfully')
    } catch (error) {
      console.error('❌ Failed to seed development data:', error)
    }
  }

  private static async seedUsers(): Promise<void> {
    const users = [
      {
        email: 'admin@dev.local',
        name: 'Dev Admin',
        role: 'admin',
        password: 'dev123',
      },
      {
        email: 'user@dev.local',
        name: 'Dev User',
        role: 'user',
        password: 'dev123',
      },
      {
        email: 'test@dev.local',
        name: 'Test User',
        role: 'user',
        password: 'dev123',
      },
    ]

    for (const userData of users) {
      try {
        await UserService.createUser(userData)
      } catch (error) {
        // User might already exist, ignore
        if (!error.message.includes('already exists')) {
          throw error
        }
      }
    }
  }

  private static async seedProducts(): Promise<void> {
    const products = [
      {
        name: 'Development Widget',
        description: 'A sample product for development',
        price: 29.99,
        category: 'widgets',
        inventory: 100,
      },
      {
        name: 'Test Gadget',
        description: 'Another sample product for testing',
        price: 49.99,
        category: 'gadgets',
        inventory: 50,
      },
    ]

    for (const productData of products) {
      try {
        await ProductService.createProduct(productData)
      } catch (error) {
        if (!error.message.includes('already exists')) {
          throw error
        }
      }
    }
  }

  private static async seedOrders(): Promise<void> {
    // Create sample orders for development
    // Implementation would create realistic test orders
  }

  static createDevelopmentLogger(): Logger {
    return new ConsoleLogger({
      level: 'debug',
      format: 'pretty',
      colors: true,
      timestamp: true,
      context: true,
    })
  }

  static startDevelopmentServer(): void {
    const config = DevelopmentEnvironment.getDevConfig()

    console.log('🚀 Starting development server...')
    console.log(`📍 Server: http://${config.devServer.host}:${config.devServer.port}`)
    console.log(`🔧 Hot reload: ${config.hotReload ? 'enabled' : 'disabled'}`)
    console.log(`🐛 Debug mode: ${config.debugging.enabled ? 'enabled' : 'disabled'}`)

    if (config.debugging.enabled) {
      console.log(`🔍 Debug port: ${config.debugging.port}`)
      console.log(`💡 Debug in VS Code: attach to port ${config.debugging.port}`)
    }
  }
}
```

### Local Database Management

```typescript
// ✅ Development database management
class DevelopmentDatabase {
  private static readonly DEV_DB_NAME = 'app_development'
  private static readonly TEST_DB_NAME = 'app_test'

  static async setup(): Promise<void> {
    await this.createDatabaseIfNotExists()
    await this.runMigrations()

    if (DevelopmentEnvironment.shouldSeedData()) {
      await DevUtils.seedDevelopmentData()
    }
  }

  static async reset(): Promise<void> {
    console.log('🔄 Resetting development database...')

    await this.dropDatabase()
    await this.createDatabase()
    await this.runMigrations()
    await DevUtils.seedDevelopmentData()

    console.log('✅ Development database reset complete')
  }

  static async createDatabaseIfNotExists(): Promise<void> {
    try {
      await DatabaseClient.query(`CREATE DATABASE ${this.DEV_DB_NAME}`)
      console.log(`✅ Created database: ${this.DEV_DB_NAME}`)
    } catch (error) {
      if (error.code === '42P04') {
        // Database already exists
        console.log(`📍 Database ${this.DEV_DB_NAME} already exists`)
      } else {
        throw error
      }
    }
  }

  static async runMigrations(): Promise<void> {
    console.log('🔄 Running database migrations...')

    const migrationFiles = await this.getMigrationFiles()
    const appliedMigrations = await this.getAppliedMigrations()

    for (const migrationFile of migrationFiles) {
      if (!appliedMigrations.includes(migrationFile)) {
        await this.runMigration(migrationFile)
        console.log(`✅ Applied migration: ${migrationFile}`)
      }
    }

    console.log('✅ All migrations applied')
  }

  private static async getMigrationFiles(): Promise<string[]> {
    const migrationDir = path.join(process.cwd(), 'migrations')
    const files = await fs.readdir(migrationDir)

    return files.filter(file => file.endsWith('.sql')).sort()
  }

  private static async getAppliedMigrations(): Promise<string[]> {
    try {
      const result = await DatabaseClient.query('SELECT filename FROM migrations ORDER BY filename')
      return result.rows.map(row => row.filename)
    } catch (error) {
      // Migrations table doesn't exist yet
      return []
    }
  }

  private static async runMigration(filename: string): Promise<void> {
    const migrationPath = path.join(process.cwd(), 'migrations', filename)
    const migrationSql = await fs.readFile(migrationPath, 'utf-8')

    await DatabaseClient.transaction(async client => {
      await client.query(migrationSql)
      await client.query('INSERT INTO migrations (filename, applied_at) VALUES ($1, NOW())', [
        filename,
      ])
    })
  }

  private static async dropDatabase(): Promise<void> {
    await DatabaseClient.query(`DROP DATABASE IF EXISTS ${this.DEV_DB_NAME}`)
  }

  private static async createDatabase(): Promise<void> {
    await DatabaseClient.query(`CREATE DATABASE ${this.DEV_DB_NAME}`)
  }
}

// ✅ Development CLI commands
class DevCLI {
  static async runCommand(command: string, args: string[]): Promise<void> {
    switch (command) {
      case 'db:setup':
        await DevelopmentDatabase.setup()
        break

      case 'db:reset':
        await DevelopmentDatabase.reset()
        break

      case 'db:seed':
        await DevUtils.seedDevelopmentData()
        break

      case 'server:start':
        await this.startDevelopmentServer()
        break

      case 'test:watch':
        await this.startTestWatch()
        break

      case 'lint:fix':
        await this.runLintFix()
        break

      case 'type:check':
        await this.runTypeCheck()
        break

      default:
        console.error(`Unknown command: ${command}`)
        this.showHelp()
        process.exit(1)
    }
  }

  private static async startDevelopmentServer(): Promise<void> {
    const config = DevelopmentEnvironment.getDevConfig()

    // Wait for database
    await DevUtils.waitForDatabase()

    // Setup database
    await DevelopmentDatabase.setup()

    // Start server
    DevUtils.startDevelopmentServer()

    const app = await createApp(config)

    app.listen({
      port: config.devServer.port,
      host: config.devServer.host,
    })

    // Open browser if configured
    if (config.devServer.open) {
      const url = `http://${config.devServer.host}:${config.devServer.port}`
      await open(url)
    }
  }

  private static async startTestWatch(): Promise<void> {
    console.log('🧪 Starting test watcher...')

    const watcher = chokidar.watch(['src/**/*.ts', 'src/**/*.test.ts', 'src/**/*.spec.ts'])

    let testRunning = false

    const runTests = async () => {
      if (testRunning) return

      testRunning = true
      console.log('🔄 Running tests...')

      try {
        await this.runTests()
        console.log('✅ Tests passed')
      } catch (error) {
        console.error('❌ Tests failed:', error.message)
      } finally {
        testRunning = false
      }
    }

    watcher.on('change', path => {
      console.log(`📝 File changed: ${path}`)
      runTests()
    })

    // Run tests initially
    await runTests()

    console.log('👀 Watching for changes...')
  }

  private static async runTests(): Promise<void> {
    const { execSync } = require('child_process')
    execSync('npm test', { stdio: 'inherit' })
  }

  private static async runLintFix(): Promise<void> {
    console.log('🔧 Running ESLint with auto-fix...')

    const { execSync } = require('child_process')
    try {
      execSync('npx eslint src --fix --ext .ts,.tsx', { stdio: 'inherit' })
      console.log('✅ Linting completed')
    } catch (error) {
      console.error('❌ Linting failed')
      process.exit(1)
    }
  }

  private static async runTypeCheck(): Promise<void> {
    console.log('🔍 Running TypeScript type check...')

    const { execSync } = require('child_process')
    try {
      execSync('npx tsc --noEmit', { stdio: 'inherit' })
      console.log('✅ Type check passed')
    } catch (error) {
      console.error('❌ Type check failed')
      process.exit(1)
    }
  }

  private static showHelp(): void {
    console.log(`
Development CLI Commands:

Database:
  db:setup     Setup development database
  db:reset     Reset and reseed database
  db:seed      Seed development data

Server:
  server:start Start development server

Testing:
  test:watch   Start test watcher

Code Quality:
  lint:fix     Run ESLint with auto-fix
  type:check   Run TypeScript type check

Usage:
  npm run dev <command>
`)
  }
}
```

## 🔧 Development Tools Integration

### VS Code Configuration

```json
// ✅ .vscode/settings.json
{
  "typescript.preferences.quoteStyle": "single",
  "typescript.preferences.includePackageJsonAutoImports": "on",
  "typescript.suggest.autoImports": true,
  "typescript.updateImportsOnFileMove.enabled": "always",
  "editor.formatOnSave": true,
  "editor.codeActionsOnSave": {
    "source.fixAll.eslint": true,
    "source.organizeImports": true
  },
  "eslint.workingDirectories": [
    "apps/web",
    "apps/api",
    "packages/shared"
  ],
  "jest.jestCommandLine": "npm test",
  "files.exclude": {
    "**/node_modules": true,
    "**/dist": true,
    "**/.next": true,
    "**/coverage": true
  },
  "search.exclude": {
    "**/node_modules": true,
    "**/dist": true,
    "**/.next": true,
    "**/coverage": true,
    "**/pnpm-lock.yaml": true
  },
  "typescript.preferences.includeCompletionsForModuleExports": true,
  "emmet.includeLanguages": {
    "typescript": "html",
    "typescriptreact": "html"
  }
}

// ✅ .vscode/launch.json - Debug configurations
{
  "version": "0.2.0",
  "configurations": [
    {
      "name": "Debug Node.js App",
      "type": "node",
      "request": "launch",
      "program": "${workspaceFolder}/dist/index.js",
      "outFiles": ["${workspaceFolder}/dist/**/*.js"],
      "env": {
        "NODE_ENV": "development",
        "DEBUG_MODE": "true"
      },
      "sourceMaps": true,
      "restart": true,
      "protocol": "inspector"
    },
    {
      "name": "Debug Tests",
      "type": "node",
      "request": "launch",
      "program": "${workspaceFolder}/node_modules/.bin/vitest",
      "args": ["run", "--no-coverage"],
      "outFiles": ["${workspaceFolder}/dist/**/*.js"],
      "env": {
        "NODE_ENV": "test"
      },
      "sourceMaps": true
    },
    {
      "name": "Debug Current Test File",
      "type": "node",
      "request": "launch",
      "program": "${workspaceFolder}/node_modules/.bin/vitest",
      "args": ["run", "${relativeFile}", "--no-coverage"],
      "outFiles": ["${workspaceFolder}/dist/**/*.js"],
      "env": {
        "NODE_ENV": "test"
      },
      "sourceMaps": true
    }
  ]
}

// ✅ .vscode/tasks.json - Development tasks
{
  "version": "2.0.0",
  "tasks": [
    {
      "label": "Start Development Server",
      "type": "shell",
      "command": "npm",
      "args": ["run", "dev"],
      "group": "build",
      "presentation": {
        "echo": true,
        "reveal": "always",
        "focus": false,
        "panel": "new"
      },
      "isBackground": true,
      "problemMatcher": "$tsc-watch"
    },
    {
      "label": "Run Tests",
      "type": "shell",
      "command": "npm",
      "args": ["test"],
      "group": "test",
      "presentation": {
        "echo": true,
        "reveal": "always",
        "focus": false,
        "panel": "new"
      }
    },
    {
      "label": "Reset Database",
      "type": "shell",
      "command": "npm",
      "args": ["run", "dev", "db:reset"],
      "group": "build",
      "presentation": {
        "echo": true,
        "reveal": "always",
        "focus": false,
        "panel": "new"
      }
    },
    {
      "label": "Type Check",
      "type": "shell",
      "command": "npx",
      "args": ["tsc", "--noEmit"],
      "group": "build",
      "presentation": {
        "echo": true,
        "reveal": "always",
        "focus": false,
        "panel": "new"
      },
      "problemMatcher": "$tsc"
    }
  ]
}
```

### Hot Reload and Watch Mode

```typescript
// ✅ Hot reload implementation
class HotReloadServer {
  private watcher: chokidar.FSWatcher
  private clients: Set<WebSocket> = new Set()
  private lastReload = 0

  constructor(private config: DevelopmentConfig) {}

  start(): void {
    if (!this.config.hotReload) {
      return
    }

    console.log('🔥 Starting hot reload server...')

    // Setup file watcher
    this.watcher = chokidar.watch(
      ['src/**/*.ts', 'src/**/*.tsx', 'src/**/*.json', '!src/**/*.test.ts', '!src/**/*.spec.ts'],
      {
        ignoreInitial: true,
        atomic: true,
      },
    )

    this.watcher.on('change', path => {
      this.handleFileChange(path)
    })

    this.watcher.on('add', path => {
      this.handleFileChange(path)
    })

    this.watcher.on('unlink', path => {
      this.handleFileChange(path)
    })

    // Setup WebSocket server for client communication
    this.setupWebSocketServer()

    console.log('✅ Hot reload server started')
  }

  private handleFileChange(path: string): void {
    const now = Date.now()

    // Debounce rapid changes
    if (now - this.lastReload < 100) {
      return
    }

    this.lastReload = now

    console.log(`🔄 File changed: ${path}`)

    // Notify all connected clients
    this.broadcast({
      type: 'file-changed',
      path,
      timestamp: now,
    })

    // Trigger rebuild if needed
    this.triggerRebuild(path)
  }

  private setupWebSocketServer(): void {
    const wss = new WebSocketServer({ port: 3001 })

    wss.on('connection', ws => {
      this.clients.add(ws)

      ws.on('close', () => {
        this.clients.delete(ws)
      })

      // Send welcome message
      ws.send(
        JSON.stringify({
          type: 'connected',
          message: 'Hot reload connected',
        }),
      )
    })
  }

  private broadcast(message: any): void {
    const messageStr = JSON.stringify(message)

    this.clients.forEach(client => {
      if (client.readyState === WebSocket.OPEN) {
        client.send(messageStr)
      }
    })
  }

  private async triggerRebuild(path: string): Promise<void> {
    try {
      // Run TypeScript compilation
      if (path.endsWith('.ts') || path.endsWith('.tsx')) {
        await this.runTypeScriptBuild()
      }

      this.broadcast({
        type: 'rebuild-complete',
        success: true,
      })
    } catch (error) {
      console.error('❌ Rebuild failed:', error)

      this.broadcast({
        type: 'rebuild-complete',
        success: false,
        error: error.message,
      })
    }
  }

  private async runTypeScriptBuild(): Promise<void> {
    const { execSync } = require('child_process')
    execSync('npx tsc --noEmit', { stdio: 'inherit' })
  }

  stop(): void {
    if (this.watcher) {
      this.watcher.close()
    }

    this.clients.forEach(client => {
      client.close()
    })

    console.log('🛑 Hot reload server stopped')
  }
}

// ✅ Development middleware for hot reload
export const hotReloadMiddleware = (config: DevelopmentConfig) => {
  if (!config.hotReload) {
    return (req: Request, res: Response, next: NextFunction) => next()
  }

  return (req: Request, res: Response, next: NextFunction) => {
    // Inject hot reload client script
    if (req.path.endsWith('.html')) {
      const originalSend = res.send

      res.send = function (body: any) {
        if (typeof body === 'string' && body.includes('</body>')) {
          const hotReloadScript = `
            <script>
              (function() {
                const ws = new WebSocket('ws://localhost:3001');
                
                ws.onmessage = function(event) {
                  const message = JSON.parse(event.data);
                  
                  if (message.type === 'file-changed') {
                    console.log('🔄 File changed, reloading...');
                    window.location.reload();
                  } else if (message.type === 'rebuild-complete' && !message.success) {
                    console.error('❌ Build failed:', message.error);
                  }
                };
                
                ws.onopen = function() {
                  console.log('🔥 Hot reload connected');
                };
                
                ws.onclose = function() {
                  console.log('🔌 Hot reload disconnected');
                };
              })();
            </script>
          `

          body = body.replace('</body>', hotReloadScript + '</body>')
        }

        return originalSend.call(this, body)
      }
    }

    next()
  }
}
```

### Development Scripts

```json
// ✅ package.json development scripts
{
  "scripts": {
    "dev": "node scripts/dev-cli.js",
    "dev:server": "tsx watch src/index.ts",
    "dev:db:setup": "npm run dev db:setup",
    "dev:db:reset": "npm run dev db:reset",
    "dev:db:seed": "npm run dev db:seed",
    "dev:test": "vitest watch",
    "dev:test:ui": "vitest --ui",
    "dev:lint": "eslint src --ext .ts,.tsx --fix",
    "dev:type-check": "tsc --noEmit --watch",
    "dev:clean": "rimraf dist coverage .next",
    "dev:deps": "npm-check-updates -i",
    "dev:analyze": "npm run build && npm run analyze:bundle",
    "dev:docs": "typedoc src --out docs",
    "dev:storybook": "storybook dev -p 6006"
  }
}
```

```bash
#!/bin/bash
# ✅ scripts/setup-dev.sh - Development environment setup script

set -e

echo "🚀 Setting up development environment..."

# Check Node.js version
NODE_VERSION=$(node -v | cut -d'v' -f2)
REQUIRED_VERSION="20.0.0"

if [ "$(printf '%s\n' "$REQUIRED_VERSION" "$NODE_VERSION" | sort -V | head -n1)" != "$REQUIRED_VERSION" ]; then
  echo "❌ Node.js $REQUIRED_VERSION or higher is required (current: $NODE_VERSION)"
  exit 1
fi

# Install dependencies
echo "📦 Installing dependencies..."
npm ci

# Setup environment files
if [ ! -f ".env.development" ]; then
  echo "📝 Creating .env.development from template..."
  cp .env.example .env.development
  echo "⚠️  Please update .env.development with your local configuration"
fi

# Setup database
echo "🗄️  Setting up development database..."
npm run dev db:setup

# Run initial build
echo "🔨 Running initial build..."
npm run build

# Setup Git hooks
echo "🪝 Setting up Git hooks..."
npx husky install

echo "✅ Development environment setup complete!"
echo ""
echo "Next steps:"
echo "1. Update .env.development with your configuration"
echo "2. Run 'npm run dev:server' to start the development server"
echo "3. Run 'npm run dev:test' to start the test watcher"
echo ""
echo "Happy coding! 🎉"
```

```javascript
// ✅ scripts/dev-cli.js - Development CLI implementation
#!/usr/bin/env node

const { spawn } = require('child_process');
const path = require('path');

class DevCLI {
  static async run() {
    const [,, command, ...args] = process.argv;

    if (!command) {
      this.showHelp();
      return;
    }

    try {
      switch (command) {
        case 'db:setup':
          await this.runScript('setup-database.ts');
          break;
        case 'db:reset':
          await this.runScript('reset-database.ts');
          break;
        case 'db:seed':
          await this.runScript('seed-database.ts');
          break;
        case 'server:start':
          await this.startServer();
          break;
        case 'test:watch':
          await this.runCommand('vitest', ['watch']);
          break;
        case 'lint:fix':
          await this.runCommand('eslint', ['src', '--ext', '.ts,.tsx', '--fix']);
          break;
        case 'type:check':
          await this.runCommand('tsc', ['--noEmit']);
          break;
        default:
          console.error(`❌ Unknown command: ${command}`);
          this.showHelp();
          process.exit(1);
      }
    } catch (error) {
      console.error(`❌ Command failed:`, error.message);
      process.exit(1);
    }
  }

  static async runScript(scriptName) {
    return this.runCommand('tsx', [path.join('scripts', scriptName)]);
  }

  static async runCommand(command, args = []) {
    return new Promise((resolve, reject) => {
      const child = spawn(command, args, {
        stdio: 'inherit',
        shell: true
      });

      child.on('close', (code) => {
        if (code === 0) {
          resolve();
        } else {
          reject(new Error(`Command failed with exit code ${code}`));
        }
      });

      child.on('error', reject);
    });
  }

  static async startServer() {
    console.log('🚀 Starting development server...');

    // Start TypeScript compiler in watch mode
    const tscProcess = spawn('tsc', ['--watch'], {
      stdio: 'pipe',
      shell: true
    });

    // Start server with tsx watch
    const serverProcess = spawn('tsx', ['watch', 'src/index.ts'], {
      stdio: 'inherit',
      shell: true,
      env: {
        ...process.env,
        NODE_ENV: 'development',
        HOT_RELOAD: 'true'
      }
    });

    // Handle process cleanup
    process.on('SIGINT', () => {
      console.log('\n🛑 Shutting down development server...');
      tscProcess.kill();
      serverProcess.kill();
      process.exit(0);
    });
  }

  static showHelp() {
    console.log(`
🛠️  Development CLI

Database Commands:
  db:setup      Setup development database and run migrations
  db:reset      Reset database and reseed with development data
  db:seed       Seed database with development data

Server Commands:
  server:start  Start development server with hot reload

Testing Commands:
  test:watch    Start test watcher

Code Quality Commands:
  lint:fix      Run ESLint with auto-fix
  type:check    Run TypeScript type checking

Usage:
  npm run dev <command>

Examples:
  npm run dev db:setup
  npm run dev server:start
  npm run dev test:watch
`);
  }
}

DevCLI.run().catch(console.error);
```

## 🔗 Related Concepts

- **[Environment Switching](environment-switching.md)** - Environment-specific configurations
- **[Testing Strategy](.pair/knowledge/guidelines/testing/testing-strategy/README.md)** - Development testing practices
- **[Workspace Structure](.pair/knowledge/guidelines/code-design/organization-patterns/workspace-structure.md)** - Project organization
- **[Code Design Guidelines](.pair/knowledge/guidelines/code-design/design-principles/clear-readable-code.md)** - Code quality standards

## 🎯 Implementation Guidelines

1. **Consistent Setup**: Ensure all developers have the same environment configuration
2. **Automation**: Automate repetitive tasks like database setup and migrations
3. **Hot Reload**: Implement efficient hot reload for rapid development cycles
4. **Debugging**: Provide comprehensive debugging tools and configurations
5. **Testing**: Integrate testing tools into the development workflow
6. **Documentation**: Document setup procedures and troubleshooting steps
7. **Performance**: Optimize development tools for fast feedback loops

## 📏 Benefits

- **Productivity**: Streamlined development workflow with automated tasks
- **Consistency**: Standardized environment across all developers
- **Debugging**: Powerful debugging capabilities with source maps and breakpoints
- **Testing**: Integrated testing with watch mode and instant feedback
- **Code Quality**: Automated linting and type checking
- **Developer Experience**: Hot reload and instant feedback for rapid iteration

---

_A well-configured development environment is essential for productive, efficient, and enjoyable software development._

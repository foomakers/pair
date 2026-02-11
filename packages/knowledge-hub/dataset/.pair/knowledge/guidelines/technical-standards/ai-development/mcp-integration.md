# Model Context Protocol (MCP) Integration

## Overview

The Model Context Protocol (MCP) is an open standard that enables AI assistants to securely access and interact with external data sources and tools. This document provides comprehensive guidance for implementing MCP servers and integrating them with our development ecosystem.

## MCP Architecture

### 1. Core Components

#### MCP Server Structure

```typescript
// Basic MCP server implementation
import { Server } from '@modelcontextprotocol/sdk/server/index.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  ToolSchema,
} from '@modelcontextprotocol/sdk/types.js'

export class CustomMCPServer {
  private server: Server

  constructor() {
    this.server = new Server(
      {
        name: 'custom-mcp-server',
        version: '1.0.0',
      },
      {
        capabilities: {
          tools: {},
          resources: {},
          prompts: {},
        },
      },
    )

    this.setupHandlers()
  }

  private setupHandlers(): void {
    // Tools handler
    this.server.setRequestHandler(ListToolsRequestSchema, async () => {
      return {
        tools: [
          {
            name: 'execute_query',
            description: 'Execute a database query',
            inputSchema: {
              type: 'object',
              properties: {
                query: {
                  type: 'string',
                  description: 'SQL query to execute',
                },
                database: {
                  type: 'string',
                  description: 'Target database name',
                },
              },
              required: ['query'],
            },
          },
        ],
      }
    })

    // Tool execution handler
    this.server.setRequestHandler(CallToolRequestSchema, async request => {
      const { name, arguments: args } = request.params

      switch (name) {
        case 'execute_query':
          return this.executeQuery(args as QueryArgs)
        default:
          throw new Error(`Unknown tool: ${name}`)
      }
    })
  }

  private async executeQuery(args: QueryArgs): Promise<ToolResult> {
    try {
      // Validate query
      this.validateQuery(args.query)

      // Execute with proper permissions
      const result = await this.databaseService.execute(args.query, args.database)

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(result, null, 2),
          },
        ],
      }
    } catch (error) {
      return {
        content: [
          {
            type: 'text',
            text: `Query failed: ${error.message}`,
          },
        ],
        isError: true,
      }
    }
  }

  async start(): Promise<void> {
    const transport = new StdioServerTransport()
    await this.server.connect(transport)
  }
}
```

#### Resource Management

```typescript
// MCP Resource provider
export class ResourceProvider {
  constructor(private server: Server) {
    this.setupResourceHandlers()
  }

  private setupResourceHandlers(): void {
    // List available resources
    this.server.setRequestHandler(ListResourcesRequestSchema, async () => {
      return {
        resources: [
          {
            uri: 'file://project/config',
            name: 'Project Configuration',
            description: 'Current project configuration files',
            mimeType: 'application/json',
          },
          {
            uri: 'file://project/logs',
            name: 'Application Logs',
            description: 'Recent application log entries',
            mimeType: 'text/plain',
          },
        ],
      }
    })

    // Read resource content
    this.server.setRequestHandler(ReadResourceRequestSchema, async request => {
      const { uri } = request.params

      switch (uri) {
        case 'file://project/config':
          return this.getProjectConfig()
        case 'file://project/logs':
          return this.getRecentLogs()
        default:
          throw new Error(`Resource not found: ${uri}`)
      }
    })
  }

  private async getProjectConfig(): Promise<ResourceContent> {
    const config = await this.configService.getConfiguration()

    return {
      contents: [
        {
          uri: 'file://project/config',
          mimeType: 'application/json',
          text: JSON.stringify(config, null, 2),
        },
      ],
    }
  }

  private async getRecentLogs(): Promise<ResourceContent> {
    const logs = await this.logService.getRecentLogs(100)

    return {
      contents: [
        {
          uri: 'file://project/logs',
          mimeType: 'text/plain',
          text: logs.join('\n'),
        },
      ],
    }
  }
}
```

#### Prompt Templates

```typescript
// MCP Prompt management
export class PromptProvider {
  constructor(private server: Server) {
    this.setupPromptHandlers()
  }

  private setupPromptHandlers(): void {
    // List available prompts
    this.server.setRequestHandler(ListPromptsRequestSchema, async () => {
      return {
        prompts: [
          {
            name: 'code_review',
            description: 'Generate a comprehensive code review',
            arguments: [
              {
                name: 'code',
                description: 'Code to review',
                required: true,
              },
              {
                name: 'language',
                description: 'Programming language',
                required: true,
              },
              {
                name: 'focus',
                description: 'Review focus area',
                required: false,
              },
            ],
          },
        ],
      }
    })

    // Get prompt content
    this.server.setRequestHandler(GetPromptRequestSchema, async request => {
      const { name, arguments: args } = request.params

      switch (name) {
        case 'code_review':
          return this.generateCodeReviewPrompt(args)
        default:
          throw new Error(`Unknown prompt: ${name}`)
      }
    })
  }

  private generateCodeReviewPrompt(args: Record<string, string>): PromptResult {
    const { code, language, focus } = args

    const focusSection = focus ? `Focus particularly on: ${focus}\n\n` : ''

    const promptText = `
You are an expert ${language} developer performing a code review.

${focusSection}Please review the following code for:
1. Potential bugs or logical errors
2. Security vulnerabilities
3. Performance issues
4. Code style and best practices
5. Maintainability concerns

Code to review:
\`\`\`${language}
${code}
\`\`\`

Provide specific feedback with:
- Line numbers for issues
- Severity levels (critical, warning, suggestion)
- Proposed solutions or improvements
- Positive aspects worth highlighting
`

    return {
      description: `Code review prompt for ${language} code`,
      messages: [
        {
          role: 'user',
          content: {
            type: 'text',
            text: promptText,
          },
        },
      ],
    }
  }
}
```

### 2. Security and Authentication

#### Secure MCP Server

```typescript
export class SecureMCPServer extends CustomMCPServer {
  private authService: AuthenticationService
  private permissionService: PermissionService

  constructor(authConfig: AuthConfig) {
    super()
    this.authService = new AuthenticationService(authConfig)
    this.permissionService = new PermissionService()
    this.setupSecurity()
  }

  private setupSecurity(): void {
    // Authentication middleware
    this.server.use(async (request, next) => {
      const token = this.extractToken(request)

      if (!token) {
        throw new Error('Authentication required')
      }

      const user = await this.authService.validateToken(token)
      if (!user) {
        throw new Error('Invalid authentication token')
      }

      // Add user context to request
      request.context = { user }

      return next()
    })

    // Permission checking middleware
    this.server.use(async (request, next) => {
      const { user } = request.context
      const permission = this.getRequiredPermission(request)

      if (!(await this.permissionService.hasPermission(user, permission))) {
        throw new Error(`Insufficient permissions for ${permission}`)
      }

      return next()
    })
  }

  private extractToken(request: any): string | null {
    // Extract from request headers or metadata
    return request.meta?.authorization?.replace('Bearer ', '') || null
  }

  private getRequiredPermission(request: any): string {
    const { method, params } = request

    switch (method) {
      case 'tools/call':
        return `tools.${params.name}.execute`
      case 'resources/read':
        return `resources.${params.uri}.read`
      case 'prompts/get':
        return `prompts.${params.name}.access`
      default:
        return 'mcp.basic'
    }
  }
}
```

#### Data Validation and Sanitization

```typescript
export class ValidatedMCPServer extends SecureMCPServer {
  private validator: InputValidator

  constructor(authConfig: AuthConfig, validationConfig: ValidationConfig) {
    super(authConfig)
    this.validator = new InputValidator(validationConfig)
  }

  protected async executeQuery(args: QueryArgs): Promise<ToolResult> {
    // Validate query syntax and safety
    const validation = await this.validator.validateSQLQuery(args.query)

    if (!validation.isValid) {
      return {
        content: [
          {
            type: 'text',
            text: `Query validation failed: ${validation.errors.join(', ')}`,
          },
        ],
        isError: true,
      }
    }

    // Check for dangerous operations
    if (validation.containsDangerousOperations) {
      return {
        content: [
          {
            type: 'text',
            text: 'Query contains potentially dangerous operations and cannot be executed',
          },
        ],
        isError: true,
      }
    }

    return super.executeQuery(args)
  }
}
```

### 3. Advanced Features

#### Streaming Support

```typescript
export class StreamingMCPServer extends ValidatedMCPServer {
  setupStreamingHandlers(): void {
    this.server.setRequestHandler('tools/call', async (request, respond) => {
      const { name, arguments: args } = request.params

      if (name === 'stream_data') {
        return this.handleStreamingTool(args, respond)
      }

      return super.handleToolCall(request)
    })
  }

  private async handleStreamingTool(args: any, respond: ResponseCallback): Promise<void> {
    const stream = this.createDataStream(args)

    for await (const chunk of stream) {
      await respond({
        content: [
          {
            type: 'text',
            text: JSON.stringify(chunk),
          },
        ],
        partial: true,
      })
    }

    // Send final response
    await respond({
      content: [
        {
          type: 'text',
          text: 'Stream completed',
        },
      ],
      partial: false,
    })
  }

  private async *createDataStream(args: any): AsyncGenerator<any> {
    // Implement actual streaming logic
    for (let i = 0; i < 10; i++) {
      yield { chunk: i, data: `Data chunk ${i}` }
      await new Promise(resolve => setTimeout(resolve, 100))
    }
  }
}
```

#### Error Handling and Resilience

```typescript
export class ResilientMCPServer extends StreamingMCPServer {
  private circuitBreaker: CircuitBreaker
  private retryManager: RetryManager

  constructor(config: ServerConfig) {
    super(config.auth, config.validation)

    this.circuitBreaker = new CircuitBreaker({
      failureThreshold: 5,
      recoveryTimeout: 30000,
    })

    this.retryManager = new RetryManager({
      maxRetries: 3,
      backoffStrategy: 'exponential',
    })
  }

  protected async executeWithResilience<T>(
    operation: () => Promise<T>,
    context: string,
  ): Promise<T> {
    return this.circuitBreaker.execute(async () => {
      return this.retryManager.retry(async () => {
        try {
          return await operation()
        } catch (error) {
          this.logger.error(`Operation failed in ${context}`, { error })

          if (this.isRetriableError(error)) {
            throw error // Will be retried
          }

          // Non-retriable error, fail immediately
          throw new NonRetriableError(error.message)
        }
      })
    })
  }

  private isRetriableError(error: Error): boolean {
    // Define which errors should trigger retries
    return (
      error.name === 'NetworkError' ||
      error.name === 'TimeoutError' ||
      error.message.includes('temporarily unavailable')
    )
  }
}
```

## Configuration Management

### 1. Server Configuration

```typescript
// MCP Server configuration
export interface MCPServerConfig {
  server: {
    name: string
    version: string
    description?: string
  }

  capabilities: {
    tools: ToolCapability[]
    resources: ResourceCapability[]
    prompts: PromptCapability[]
  }

  security: {
    authentication: AuthConfig
    permissions: PermissionConfig
    rateLimit: RateLimitConfig
  }

  performance: {
    timeout: number
    maxConcurrentRequests: number
    caching: CacheConfig
  }

  logging: {
    level: LogLevel
    format: LogFormat
    destinations: LogDestination[]
  }
}

// Configuration loader
export class MCPConfigLoader {
  static async loadConfig(configPath: string): Promise<MCPServerConfig> {
    const config = await this.loadFile(configPath)
    const validated = await this.validateConfig(config)
    return this.applyDefaults(validated)
  }

  private static async validateConfig(config: any): Promise<MCPServerConfig> {
    const schema = this.getConfigSchema()
    const result = schema.safeParse(config)

    if (!result.success) {
      throw new ConfigurationError('Invalid MCP server configuration', result.error.errors)
    }

    return result.data
  }
}
```

### 2. Dynamic Configuration

```typescript
export class DynamicMCPServer extends ResilientMCPServer {
  private configWatcher: ConfigWatcher
  private currentConfig: MCPServerConfig

  constructor(configPath: string) {
    const initialConfig = MCPConfigLoader.loadConfig(configPath)
    super(initialConfig)

    this.currentConfig = initialConfig
    this.configWatcher = new ConfigWatcher(configPath)
    this.setupConfigReloading()
  }

  private setupConfigReloading(): void {
    this.configWatcher.on('change', async (newConfig: MCPServerConfig) => {
      try {
        await this.reloadConfiguration(newConfig)
        this.logger.info('Configuration reloaded successfully')
      } catch (error) {
        this.logger.error('Failed to reload configuration', { error })
      }
    })
  }

  private async reloadConfiguration(newConfig: MCPServerConfig): Promise<void> {
    // Validate new configuration
    const validated = await this.validateConfiguration(newConfig)

    // Apply changes incrementally
    await this.applyConfigChanges(this.currentConfig, validated)

    this.currentConfig = validated
  }

  private async applyConfigChanges(
    oldConfig: MCPServerConfig,
    newConfig: MCPServerConfig,
  ): Promise<void> {
    // Update capabilities if changed
    if (!this.configsEqual(oldConfig.capabilities, newConfig.capabilities)) {
      await this.updateCapabilities(newConfig.capabilities)
    }

    // Update security settings if changed
    if (!this.configsEqual(oldConfig.security, newConfig.security)) {
      await this.updateSecurity(newConfig.security)
    }

    // Update performance settings
    if (!this.configsEqual(oldConfig.performance, newConfig.performance)) {
      await this.updatePerformance(newConfig.performance)
    }
  }
}
```

## Testing and Development

### 1. MCP Server Testing

```typescript
// MCP Server test utilities
export class MCPServerTester {
  private server: CustomMCPServer
  private transport: TestTransport

  constructor(serverInstance: CustomMCPServer) {
    this.server = serverInstance
    this.transport = new TestTransport()
  }

  async setup(): Promise<void> {
    await this.server.connect(this.transport)
  }

  async testTool(toolName: string, args: Record<string, any>): Promise<ToolResult> {
    const request = {
      jsonrpc: '2.0',
      id: 1,
      method: 'tools/call',
      params: {
        name: toolName,
        arguments: args,
      },
    }

    const response = await this.transport.send(request)
    return response.result
  }

  async testResource(uri: string): Promise<ResourceContent> {
    const request = {
      jsonrpc: '2.0',
      id: 2,
      method: 'resources/read',
      params: { uri },
    }

    const response = await this.transport.send(request)
    return response.result
  }

  async teardown(): Promise<void> {
    await this.transport.close()
  }
}

// Example test cases
describe('Custom MCP Server', () => {
  let tester: MCPServerTester
  let server: CustomMCPServer

  beforeEach(async () => {
    server = new CustomMCPServer()
    tester = new MCPServerTester(server)
    await tester.setup()
  })

  afterEach(async () => {
    await tester.teardown()
  })

  test('should execute database query tool', async () => {
    const result = await tester.testTool('execute_query', {
      query: 'SELECT COUNT(*) FROM users',
      database: 'test',
    })

    expect(result.content[0].type).toBe('text')
    expect(JSON.parse(result.content[0].text)).toHaveProperty('count')
  })

  test('should handle invalid queries', async () => {
    const result = await tester.testTool('execute_query', {
      query: 'INVALID SQL',
      database: 'test',
    })

    expect(result.isError).toBe(true)
    expect(result.content[0].text).toContain('Query failed')
  })

  test('should provide project configuration resource', async () => {
    const result = await tester.testResource('file://project/config')

    expect(result.contents[0].mimeType).toBe('application/json')
    expect(result.contents[0].text).toBeDefined()
  })
})
```

### 2. Integration Testing

```typescript
// Integration test with actual MCP client
export class MCPIntegrationTester {
  private client: MCPClient
  private server: CustomMCPServer

  async testFullIntegration(): Promise<void> {
    // Start server
    const serverProcess = await this.startServer()

    try {
      // Connect client
      this.client = new MCPClient()
      await this.client.connect()

      // Test tool listing
      const tools = await this.client.listTools()
      expect(tools.tools.length).toBeGreaterThan(0)

      // Test tool execution
      const result = await this.client.callTool('execute_query', {
        query: 'SELECT 1',
      })
      expect(result.content).toBeDefined()

      // Test resource access
      const resources = await this.client.listResources()
      expect(resources.resources.length).toBeGreaterThan(0)
    } finally {
      await this.client.disconnect()
      await this.stopServer(serverProcess)
    }
  }

  private async startServer(): Promise<ChildProcess> {
    return spawn('node', ['dist/server.js'], {
      stdio: ['pipe', 'pipe', 'pipe'],
    })
  }
}
```

## Deployment and Operations

### 1. Production Deployment

```dockerfile
# Dockerfile for MCP Server
FROM node:18-alpine

WORKDIR /app

# Copy package files
COPY package*.json ./
RUN npm ci --only=production

# Copy source code
COPY dist/ ./dist/
COPY config/ ./config/

# Create non-root user
RUN addgroup -g 1001 -S mcp && \
    adduser -S mcp -u 1001

# Set permissions
RUN chown -R mcp:mcp /app
USER mcp

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD node dist/healthcheck.js

EXPOSE 3000

CMD ["node", "dist/server.js"]
```

```yaml
# Kubernetes deployment
apiVersion: apps/v1
kind: Deployment
metadata:
  name: mcp-server
spec:
  replicas: 3
  selector:
    matchLabels:
      app: mcp-server
  template:
    metadata:
      labels:
        app: mcp-server
    spec:
      containers:
        - name: mcp-server
          image: mcp-server:latest
          ports:
            - containerPort: 3000
          env:
            - name: NODE_ENV
              value: 'production'
            - name: CONFIG_PATH
              value: '/app/config/production.json'
          resources:
            requests:
              memory: '256Mi'
              cpu: '250m'
            limits:
              memory: '512Mi'
              cpu: '500m'
          livenessProbe:
            httpGet:
              path: /health
              port: 3000
            initialDelaySeconds: 30
            periodSeconds: 10
          readinessProbe:
            httpGet:
              path: /ready
              port: 3000
            initialDelaySeconds: 5
            periodSeconds: 5
```

### 2. Monitoring and Observability

```typescript
export class MonitoredMCPServer extends DynamicMCPServer {
  private metrics: MetricsCollector
  private tracer: Tracer

  constructor(config: MCPServerConfig) {
    super(config)
    this.metrics = new MetricsCollector()
    this.tracer = new Tracer('mcp-server')
    this.setupMonitoring()
  }

  private setupMonitoring(): void {
    // Request monitoring middleware
    this.server.use(async (request, next) => {
      const span = this.tracer.startSpan(`mcp.${request.method}`)
      const startTime = Date.now()

      try {
        span.setAttributes({
          'mcp.method': request.method,
          'mcp.id': request.id,
        })

        const result = await next()

        // Record success metrics
        this.metrics.recordLatency(request.method, Date.now() - startTime)
        this.metrics.incrementSuccess(request.method)

        return result
      } catch (error) {
        // Record error metrics
        this.metrics.incrementError(request.method, error.type)
        span.recordException(error)
        span.setStatus({ code: SpanStatusCode.ERROR })

        throw error
      } finally {
        span.end()
      }
    })

    // Periodic metrics reporting
    setInterval(() => {
      this.reportMetrics()
    }, 60000) // Every minute
  }

  private reportMetrics(): void {
    const metrics = this.metrics.getSnapshot()

    this.logger.info('MCP Server Metrics', {
      requests: metrics.totalRequests,
      errors: metrics.totalErrors,
      avgLatency: metrics.averageLatency,
      activeConnections: metrics.activeConnections,
    })
  }
}
```

## Best Practices

### 1. Development Guidelines

- **Single Responsibility**: Each MCP server should focus on a specific domain
- **Stateless Design**: Avoid maintaining client-specific state in the server
- **Error Handling**: Provide clear, actionable error messages
- **Documentation**: Document all tools, resources, and prompts thoroughly
- **Versioning**: Use semantic versioning for capability changes

### 2. Security Guidelines

- **Input Validation**: Validate all inputs rigorously
- **Permission Checks**: Implement fine-grained access control
- **Audit Logging**: Log all security-relevant events
- **Secure Defaults**: Configure securely by default
- **Regular Updates**: Keep dependencies updated

### 3. Performance Guidelines

- **Caching**: Cache expensive operations appropriately
- **Connection Pooling**: Reuse connections to external services
- **Rate Limiting**: Protect against abuse and overload
- **Resource Management**: Clean up resources properly
- **Monitoring**: Track performance metrics continuously

## Related Documentation

- [AI Development Tools](ai-tools.md)
- [Documentation Standards](documentation-standards.md)
- [Security Guidelines](../../quality-assurance/security/README.md)
- [Performance Guidelines](../../observability/README.md)
- [Testing Strategy](../../testing/README.md)

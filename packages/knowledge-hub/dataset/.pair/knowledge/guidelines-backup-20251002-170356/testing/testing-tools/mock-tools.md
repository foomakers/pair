# 🎭 Mock Tools

**Focus**: Mocking frameworks, stub generation, and test isolation utilities

Guidelines for implementing comprehensive mocking strategies that enable isolated testing, dependency management, and realistic test scenarios with maintainable mock implementations.

## 🎯 Mock Management System

### Mock Tool Framework

````typescript
// ✅ Comprehensive mocking and stubbing system
class MockToolManager {
  private mockRegistry: MockRegistry
  private stubFactory: StubFactory
  private spyManager: SpyManager
  private fixtureManager: FixtureManager
  private mockValidator: MockValidator
  private resetManager: MockResetManager

  constructor() {
    this.mockRegistry = new MockRegistry()
    this.stubFactory = new StubFactory()
    this.spyManager = new SpyManager()
    this.fixtureManager = new FixtureManager()
    this.mockValidator = new MockValidator()
    this.resetManager = new MockResetManager()
  }

  /**
   * Create comprehensive mock system for testing
   *
   * @example
   * ```typescript
   * const mockManager = new MockToolManager();
   *
   * const mockSystem = await mockManager.createMockSystem({
   *   dependencies: ['database', 'api', 'auth'],
   *   mockStrategy: 'intelligent',
   *   isolation: 'complete',
   *   fixtures: ['users', 'products'],
   *   spying: ['service-calls', 'database-queries']
   * });
   *
   * const userService = mockSystem.mockService('UserService');
   * ```
   */
  async createMockSystem(configuration: MockConfiguration): Promise<MockSystem> {
    try {
      // Analyze dependencies for mocking
      const dependencyAnalysis = await this.analyzeDependencies(configuration.dependencies)

      // Create mock implementations
      const mocks = await this.createMocks(dependencyAnalysis, configuration)

      // Setup stubs and fixtures
      const stubs = await this.setupStubs(configuration.fixtures)
      const fixtures = await this.fixtureManager.loadFixtures(configuration.fixtures)

      // Configure spies and monitors
      const spies = await this.setupSpies(configuration.spying)

      // Create mock providers
      const providers = await this.createMockProviders(mocks, stubs, configuration)

      // Setup reset and cleanup strategies
      const resetStrategy = await this.resetManager.createResetStrategy(configuration)

      return {
        id: `mock-system-${Date.now()}`,
        configuration,
        dependencyAnalysis,
        mocks,
        stubs,
        fixtures,
        spies,
        providers,
        resetStrategy,
        status: 'active',
      }
    } catch (error) {
      throw new MockToolError(`Failed to create mock system: ${error.message}`, {
        configuration,
        error,
      })
    }
  }

  /**
   * Create intelligent mock for service or component
   */
  async createIntelligentMock<T>(
    target: new (...args: any[]) => T,
    options: IntelligentMockOptions = {},
  ): Promise<IntelligentMock<T>> {
    try {
      // Analyze target class/interface
      const targetAnalysis = await this.analyzeTarget(target)

      // Generate mock implementation
      const mockImplementation = await this.generateMockImplementation(targetAnalysis, options)

      // Create spy wrappers
      const spies = await this.createMethodSpies(targetAnalysis.methods)

      // Setup behavior patterns
      const behaviors = await this.setupBehaviorPatterns(targetAnalysis, options)

      // Create validation rules
      const validations = await this.createValidationRules(targetAnalysis, options)

      return {
        target: target.name,
        implementation: mockImplementation,
        spies,
        behaviors,
        validations,
        metadata: targetAnalysis,
        configure: (config: MockBehaviorConfig) =>
          this.configureMockBehavior(mockImplementation, config),
        verify: () => this.verifyMockInteractions(spies, validations),
        reset: () => this.resetMock(mockImplementation, spies),
      }
    } catch (error) {
      throw new MockToolError(`Failed to create intelligent mock: ${error.message}`, {
        target: target.name,
        options,
        error,
      })
    }
  }

  /**
   * Analyze dependencies for optimal mocking strategy
   */
  private async analyzeDependencies(dependencies: string[]): Promise<DependencyAnalysis> {
    const analysis: DependencyAnalysis = {
      external: [],
      internal: [],
      complex: [],
      simple: [],
      recommendations: [],
    }

    for (const dependency of dependencies) {
      const depInfo = await this.analyzeSingleDependency(dependency)

      if (depInfo.isExternal) {
        analysis.external.push(depInfo)
      } else {
        analysis.internal.push(depInfo)
      }

      if (depInfo.complexity > 5) {
        analysis.complex.push(depInfo)
      } else {
        analysis.simple.push(depInfo)
      }

      analysis.recommendations.push(...depInfo.mockingRecommendations)
    }

    return analysis
  }

  /**
   * Create mocks based on dependency analysis
   */
  private async createMocks(
    analysis: DependencyAnalysis,
    configuration: MockConfiguration,
  ): Promise<MockCollection> {
    const mocks: MockCollection = {}

    // Create external dependency mocks
    for (const dependency of analysis.external) {
      mocks[dependency.name] = await this.createExternalMock(dependency, configuration)
    }

    // Create internal dependency mocks
    for (const dependency of analysis.internal) {
      mocks[dependency.name] = await this.createInternalMock(dependency, configuration)
    }

    // Create complex dependency mocks with special handling
    for (const dependency of analysis.complex) {
      if (mocks[dependency.name]) {
        mocks[dependency.name] = await this.enhanceComplexMock(mocks[dependency.name], dependency)
      }
    }

    return mocks
  }

  /**
   * Create external dependency mock (databases, APIs, etc.)
   */
  private async createExternalMock(
    dependency: DependencyInfo,
    configuration: MockConfiguration,
  ): Promise<ExternalMock> {
    switch (dependency.type) {
      case 'database':
        return await this.createDatabaseMock(dependency, configuration)
      case 'api':
        return await this.createApiMock(dependency, configuration)
      case 'filesystem':
        return await this.createFilesystemMock(dependency, configuration)
      case 'network':
        return await this.createNetworkMock(dependency, configuration)
      default:
        return await this.createGenericExternalMock(dependency, configuration)
    }
  }

  /**
   * Create database mock with query simulation
   */
  private async createDatabaseMock(
    dependency: DependencyInfo,
    configuration: MockConfiguration,
  ): Promise<DatabaseMock> {
    const querySimulator = new QuerySimulator()
    const dataStore = new MockDataStore()

    return {
      name: dependency.name,
      type: 'database',

      // Mock database operations
      query: this.spyManager.spy(async (sql: string, params?: any[]) => {
        return querySimulator.simulate(sql, params, dataStore)
      }),

      insert: this.spyManager.spy(async (table: string, data: any) => {
        return dataStore.insert(table, data)
      }),

      update: this.spyManager.spy(async (table: string, id: any, data: any) => {
        return dataStore.update(table, id, data)
      }),

      delete: this.spyManager.spy(async (table: string, id: any) => {
        return dataStore.delete(table, id)
      }),

      // Transaction support
      transaction: this.spyManager.spy(async (callback: (tx: any) => Promise<any>) => {
        const transaction = new MockTransaction(dataStore)
        try {
          const result = await callback(transaction)
          transaction.commit()
          return result
        } catch (error) {
          transaction.rollback()
          throw error
        }
      }),

      // Connection management
      connect: this.spyManager.spy(async () => {
        return { connected: true }
      }),

      disconnect: this.spyManager.spy(async () => {
        return { connected: false }
      }),

      // Mock-specific methods
      seed: async (fixtures: any[]) => {
        for (const fixture of fixtures) {
          await dataStore.insert(fixture.table, fixture.data)
        }
      },

      clear: async () => {
        dataStore.clear()
      },

      getQueryHistory: () => querySimulator.getHistory(),

      reset: () => {
        querySimulator.reset()
        dataStore.clear()
      },
    }
  }

  /**
   * Create API mock with response simulation
   */
  private async createApiMock(
    dependency: DependencyInfo,
    configuration: MockConfiguration,
  ): Promise<ApiMock> {
    const responseSimulator = new ResponseSimulator()
    const requestLogger = new RequestLogger()

    return {
      name: dependency.name,
      type: 'api',

      // HTTP methods
      get: this.spyManager.spy(async (url: string, options?: any) => {
        requestLogger.log('GET', url, options)
        return responseSimulator.simulateGet(url, options)
      }),

      post: this.spyManager.spy(async (url: string, data?: any, options?: any) => {
        requestLogger.log('POST', url, data, options)
        return responseSimulator.simulatePost(url, data, options)
      }),

      put: this.spyManager.spy(async (url: string, data?: any, options?: any) => {
        requestLogger.log('PUT', url, data, options)
        return responseSimulator.simulatePut(url, data, options)
      }),

      delete: this.spyManager.spy(async (url: string, options?: any) => {
        requestLogger.log('DELETE', url, options)
        return responseSimulator.simulateDelete(url, options)
      }),

      // Mock configuration
      mockResponse: (method: string, url: string, response: any) => {
        responseSimulator.addMockResponse(method, url, response)
      },

      mockError: (method: string, url: string, error: any) => {
        responseSimulator.addMockError(method, url, error)
      },

      mockDelay: (method: string, url: string, delay: number) => {
        responseSimulator.addDelay(method, url, delay)
      },

      // Mock inspection
      getRequests: () => requestLogger.getRequests(),
      getRequestCount: (method?: string, url?: string) => requestLogger.getCount(method, url),

      // Reset
      reset: () => {
        responseSimulator.reset()
        requestLogger.reset()
      },
    }
  }
}

/**
 * Specialized Mock Factories
 */

export class ServiceMockFactory {
  /**
   * Create service layer mock with business logic simulation
   */
  static createServiceMock<T>(service: new (...args: any[]) => T): ServiceMock<T> {
    const serviceName = service.name
    const methods = this.extractServiceMethods(service)
    const mockImplementation = {} as T

    for (const method of methods) {
      ;(mockImplementation as any)[method.name] = this.createMethodMock(method)
    }

    return {
      name: serviceName,
      implementation: mockImplementation,
      methods: methods.map(m => m.name),

      // Service-specific mock methods
      mockSuccess: (methodName: string, returnValue: any) => {
        ;(mockImplementation as any)[methodName].mockResolvedValue(returnValue)
      },

      mockError: (methodName: string, error: Error) => {
        ;(mockImplementation as any)[methodName].mockRejectedValue(error)
      },

      mockBusinessRule: (methodName: string, condition: any, result: any) => {
        ;(mockImplementation as any)[methodName].mockImplementation((input: any) => {
          if (this.evaluateCondition(input, condition)) {
            return Promise.resolve(result)
          }
          return Promise.reject(new Error('Business rule not met'))
        })
      },

      verifyBusinessLogic: (methodName: string, expectedCalls: any[]) => {
        const calls = (mockImplementation as any)[methodName].mock.calls
        return this.validateBusinessLogicCalls(calls, expectedCalls)
      },
    }
  }

  private static extractServiceMethods(service: any): MethodInfo[] {
    const prototype = service.prototype
    const methods: MethodInfo[] = []

    for (const propertyName of Object.getOwnPropertyNames(prototype)) {
      if (propertyName !== 'constructor' && typeof prototype[propertyName] === 'function') {
        methods.push({
          name: propertyName,
          parameters: this.extractParameters(prototype[propertyName]),
          returnType: this.inferReturnType(prototype[propertyName]),
          isAsync: this.isAsyncMethod(prototype[propertyName]),
        })
      }
    }

    return methods
  }
}

export class RepositoryMockFactory {
  /**
   * Create repository pattern mock with CRUD operations
   */
  static createRepositoryMock<T>(entityType: string): RepositoryMock<T> {
    const dataStore = new Map<string, T>()
    let idCounter = 1

    return {
      entityType,

      // CRUD operations
      findById: jest.fn(async (id: string): Promise<T | null> => {
        return dataStore.get(id) || null
      }),

      findAll: jest.fn(async (): Promise<T[]> => {
        return Array.from(dataStore.values())
      }),

      findBy: jest.fn(async (criteria: Partial<T>): Promise<T[]> => {
        const results: T[] = []
        for (const entity of dataStore.values()) {
          if (this.matchesCriteria(entity, criteria)) {
            results.push(entity)
          }
        }
        return results
      }),

      create: jest.fn(async (data: Omit<T, 'id'>): Promise<T> => {
        const entity = { ...data, id: (idCounter++).toString() } as T
        dataStore.set((entity as any).id, entity)
        return entity
      }),

      update: jest.fn(async (id: string, data: Partial<T>): Promise<T | null> => {
        const existing = dataStore.get(id)
        if (!existing) return null

        const updated = { ...existing, ...data }
        dataStore.set(id, updated)
        return updated
      }),

      delete: jest.fn(async (id: string): Promise<boolean> => {
        return dataStore.delete(id)
      }),

      // Query builders
      where: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      limit: jest.fn().mockReturnThis(),
      offset: jest.fn().mockReturnThis(),

      // Mock utilities
      seed: (entities: T[]) => {
        entities.forEach(entity => {
          dataStore.set((entity as any).id, entity)
        })
      },

      clear: () => {
        dataStore.clear()
        idCounter = 1
      },

      getDataStore: () => new Map(dataStore),
    }
  }

  private static matchesCriteria<T>(entity: T, criteria: Partial<T>): boolean {
    for (const [key, value] of Object.entries(criteria)) {
      if ((entity as any)[key] !== value) {
        return false
      }
    }
    return true
  }
}

/**
 * Mock Behavior Configuration
 */

export class MockBehaviorManager {
  /**
   * Configure realistic mock behaviors
   */
  static configureRealisticBehaviors<T>(mock: any, behaviors: BehaviorConfiguration): void {
    // Latency simulation
    if (behaviors.latency) {
      this.addLatencyBehavior(mock, behaviors.latency)
    }

    // Error simulation
    if (behaviors.errors) {
      this.addErrorBehavior(mock, behaviors.errors)
    }

    // State management
    if (behaviors.stateful) {
      this.addStateBehavior(mock, behaviors.stateful)
    }

    // Rate limiting
    if (behaviors.rateLimit) {
      this.addRateLimitBehavior(mock, behaviors.rateLimit)
    }
  }

  private static addLatencyBehavior(mock: any, latencyConfig: LatencyConfig): void {
    const originalMethods = { ...mock }

    for (const [methodName, method] of Object.entries(originalMethods)) {
      if (typeof method === 'function') {
        mock[methodName] = async (...args: any[]) => {
          const delay = this.calculateLatency(latencyConfig)
          await this.sleep(delay)
          return (originalMethods as any)[methodName](...args)
        }
      }
    }
  }

  private static addErrorBehavior(mock: any, errorConfig: ErrorConfig): void {
    const originalMethods = { ...mock }

    for (const [methodName, method] of Object.entries(originalMethods)) {
      if (typeof method === 'function') {
        mock[methodName] = async (...args: any[]) => {
          if (this.shouldSimulateError(errorConfig)) {
            throw this.generateError(errorConfig)
          }
          return (originalMethods as any)[methodName](...args)
        }
      }
    }
  }

  private static calculateLatency(config: LatencyConfig): number {
    const { min, max, distribution } = config

    switch (distribution) {
      case 'uniform':
        return Math.random() * (max - min) + min
      case 'normal':
        return this.normalDistribution(min, max)
      case 'exponential':
        return this.exponentialDistribution(min)
      default:
        return min
    }
  }

  private static sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms))
  }
}

// Supporting interfaces and types
type MockStrategy = 'simple' | 'intelligent' | 'realistic' | 'comprehensive'
type IsolationLevel = 'none' | 'partial' | 'complete'

interface MockConfiguration {
  readonly dependencies: string[]
  readonly mockStrategy: MockStrategy
  readonly isolation: IsolationLevel
  readonly fixtures: string[]
  readonly spying: string[]
  readonly behaviors?: BehaviorConfiguration
}

interface IntelligentMockOptions {
  readonly autoSpy?: boolean
  readonly returnDefaults?: boolean
  readonly validateInputs?: boolean
  readonly behaviors?: BehaviorConfiguration
}

interface MockSystem {
  readonly id: string
  readonly configuration: MockConfiguration
  readonly dependencyAnalysis: DependencyAnalysis
  readonly mocks: MockCollection
  readonly stubs: any
  readonly fixtures: any
  readonly spies: any
  readonly providers: any
  readonly resetStrategy: any
  status: 'active' | 'inactive'
}

interface IntelligentMock<T> {
  readonly target: string
  readonly implementation: T
  readonly spies: Map<string, any>
  readonly behaviors: any
  readonly validations: any
  readonly metadata: any
  configure(config: MockBehaviorConfig): void
  verify(): MockVerificationResult
  reset(): void
}

interface DependencyAnalysis {
  readonly external: DependencyInfo[]
  readonly internal: DependencyInfo[]
  readonly complex: DependencyInfo[]
  readonly simple: DependencyInfo[]
  readonly recommendations: string[]
}

interface DependencyInfo {
  readonly name: string
  readonly type: string
  readonly isExternal: boolean
  readonly complexity: number
  readonly mockingRecommendations: string[]
}

interface MockCollection {
  [name: string]: ExternalMock | InternalMock
}

interface ExternalMock {
  readonly name: string
  readonly type: string
  [key: string]: any
}

interface InternalMock {
  readonly name: string
  readonly type: string
  [key: string]: any
}

interface DatabaseMock extends ExternalMock {
  query(sql: string, params?: any[]): Promise<any>
  insert(table: string, data: any): Promise<any>
  update(table: string, id: any, data: any): Promise<any>
  delete(table: string, id: any): Promise<boolean>
  transaction(callback: (tx: any) => Promise<any>): Promise<any>
  connect(): Promise<any>
  disconnect(): Promise<any>
  seed(fixtures: any[]): Promise<void>
  clear(): Promise<void>
  getQueryHistory(): any[]
  reset(): void
}

interface ApiMock extends ExternalMock {
  get(url: string, options?: any): Promise<any>
  post(url: string, data?: any, options?: any): Promise<any>
  put(url: string, data?: any, options?: any): Promise<any>
  delete(url: string, options?: any): Promise<any>
  mockResponse(method: string, url: string, response: any): void
  mockError(method: string, url: string, error: any): void
  mockDelay(method: string, url: string, delay: number): void
  getRequests(): any[]
  getRequestCount(method?: string, url?: string): number
  reset(): void
}

interface ServiceMock<T> {
  readonly name: string
  readonly implementation: T
  readonly methods: string[]
  mockSuccess(methodName: string, returnValue: any): void
  mockError(methodName: string, error: Error): void
  mockBusinessRule(methodName: string, condition: any, result: any): void
  verifyBusinessLogic(methodName: string, expectedCalls: any[]): boolean
}

interface RepositoryMock<T> {
  readonly entityType: string
  findById: jest.Mock<Promise<T | null>, [string]>
  findAll: jest.Mock<Promise<T[]>, []>
  findBy: jest.Mock<Promise<T[]>, [Partial<T>]>
  create: jest.Mock<Promise<T>, [Omit<T, 'id'>]>
  update: jest.Mock<Promise<T | null>, [string, Partial<T>]>
  delete: jest.Mock<Promise<boolean>, [string]>
  where: jest.Mock
  orderBy: jest.Mock
  limit: jest.Mock
  offset: jest.Mock
  seed(entities: T[]): void
  clear(): void
  getDataStore(): Map<string, T>
}

interface BehaviorConfiguration {
  readonly latency?: LatencyConfig
  readonly errors?: ErrorConfig
  readonly stateful?: boolean
  readonly rateLimit?: RateLimitConfig
}

interface LatencyConfig {
  readonly min: number
  readonly max: number
  readonly distribution: 'uniform' | 'normal' | 'exponential'
}

interface ErrorConfig {
  readonly probability: number
  readonly types: string[]
  readonly messages: string[]
}

interface RateLimitConfig {
  readonly requestsPerSecond: number
  readonly burstSize: number
}

interface MockBehaviorConfig {
  [methodName: string]: any
}

interface MockVerificationResult {
  readonly passed: boolean
  readonly violations: string[]
  readonly summary: string
}

interface MethodInfo {
  readonly name: string
  readonly parameters: any[]
  readonly returnType: string
  readonly isAsync: boolean
}

// Placeholder interfaces for external dependencies
interface MockRegistry {
  // Mock registration and management
}

interface StubFactory {
  // Stub creation and management
}

interface SpyManager {
  spy<T extends (...args: any[]) => any>(fn: T): jest.SpyInstance
}

interface FixtureManager {
  loadFixtures(fixtures: string[]): Promise<any>
}

interface MockValidator {
  // Mock validation interface
}

interface MockResetManager {
  createResetStrategy(configuration: MockConfiguration): Promise<any>
}

interface QuerySimulator {
  simulate(sql: string, params: any[] | undefined, dataStore: MockDataStore): any
  getHistory(): any[]
  reset(): void
}

interface MockDataStore {
  insert(table: string, data: any): any
  update(table: string, id: any, data: any): any
  delete(table: string, id: any): boolean
  clear(): void
}

interface MockTransaction {
  commit(): void
  rollback(): void
}

interface ResponseSimulator {
  simulateGet(url: string, options: any): Promise<any>
  simulatePost(url: string, data: any, options: any): Promise<any>
  simulatePut(url: string, data: any, options: any): Promise<any>
  simulateDelete(url: string, options: any): Promise<any>
  addMockResponse(method: string, url: string, response: any): void
  addMockError(method: string, url: string, error: any): void
  addDelay(method: string, url: string, delay: number): void
  reset(): void
}

interface RequestLogger {
  log(method: string, url: string, ...args: any[]): void
  getRequests(): any[]
  getCount(method?: string, url?: string): number
  reset(): void
}

class MockToolError extends Error {
  constructor(message: string, public details?: any) {
    super(message)
    this.name = 'MockToolError'
  }
}
````

## 🔗 Related Concepts

- **[Test Frameworks](test-frameworks.md)** - Framework integration for mocking
- **[Assertion Libraries](assertion-libraries.md)** - Assertion patterns for mocked components
- **[Unit Testing](.pair/knowledge/guidelines/testing/testing-implementation/unit-testing.md)** - Unit testing with mocks
- **[Integration Testing](.pair/knowledge/guidelines/testing/testing-implementation/integration-testing.md)** - Integration testing with partial mocks

## 🎯 Implementation Guidelines

1. **Isolation Strategy**: Choose appropriate isolation levels for different test types
2. **Realistic Behavior**: Configure mocks to behave realistically with latency and errors
3. **Type Safety**: Use TypeScript for type-safe mock implementations
4. **Verification**: Implement comprehensive mock verification and validation
5. **Reset Strategy**: Establish clear mock reset and cleanup strategies
6. **Performance**: Consider mock performance impact on test execution
7. **Maintenance**: Keep mocks in sync with real implementations
8. **Documentation**: Document mock behaviors and usage patterns

## 📏 Benefits

- **Test Isolation**: Enables isolated testing of components and services
- **Dependency Management**: Eliminates external dependencies in unit tests
- **Behavior Simulation**: Simulates realistic behaviors and edge cases
- **Fast Execution**: Reduces test execution time by eliminating I/O operations
- **Reliability**: Provides consistent, predictable test environments
- **Error Testing**: Enables testing of error conditions and edge cases
- **Development Velocity**: Allows development without waiting for external services

---

_Mock Tools provide comprehensive mocking capabilities that enable isolated, fast, and reliable testing with realistic behavior simulation and dependency management._

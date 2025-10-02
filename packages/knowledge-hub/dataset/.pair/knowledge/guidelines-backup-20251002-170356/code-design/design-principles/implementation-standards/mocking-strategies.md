# 🎭 Mocking Strategies

**Focus**: Test doubles, dependency mocking, and test isolation patterns

Guidelines for creating effective mocks, stubs, and test doubles that enable reliable, fast, and maintainable testing strategies.

## 🎯 Mocking Principles

### Types of Test Doubles

```typescript
// ✅ Test double taxonomy with clear purposes
interface UserRepository {
  findById(id: UserId): Promise<User | null>
  findByEmail(email: Email): Promise<User | null>
  save(user: User): Promise<User>
  delete(id: UserId): Promise<void>
}

// ✅ Dummy - Objects passed around but never used
class DummyUserRepository implements UserRepository {
  async findById(id: UserId): Promise<User | null> {
    throw new Error('Method should not be called in this test')
  }

  async findByEmail(email: Email): Promise<User | null> {
    throw new Error('Method should not be called in this test')
  }

  async save(user: User): Promise<User> {
    throw new Error('Method should not be called in this test')
  }

  async delete(id: UserId): Promise<void> {
    throw new Error('Method should not be called in this test')
  }
}

// ✅ Stub - Provides canned responses
class StubUserRepository implements UserRepository {
  private responses: Map<string, any> = new Map()

  setResponse(method: string, response: any): void {
    this.responses.set(method, response)
  }

  async findById(id: UserId): Promise<User | null> {
    return this.responses.get('findById') || null
  }

  async findByEmail(email: Email): Promise<User | null> {
    return this.responses.get('findByEmail') || null
  }

  async save(user: User): Promise<User> {
    return this.responses.get('save') || user
  }

  async delete(id: UserId): Promise<void> {
    return this.responses.get('delete')
  }
}

// ✅ Spy - Records calls and can verify interactions
class SpyUserRepository implements UserRepository {
  private calls: Map<string, any[]> = new Map()
  private responses: Map<string, any> = new Map()

  setResponse(method: string, response: any): void {
    this.responses.set(method, response)
  }

  getCallsFor(method: string): any[] {
    return this.calls.get(method) || []
  }

  wasCalled(method: string): boolean {
    return this.calls.has(method)
  }

  getCallCount(method: string): number {
    return this.getCallsFor(method).length
  }

  async findById(id: UserId): Promise<User | null> {
    this.recordCall('findById', [id])
    return this.responses.get('findById') || null
  }

  async findByEmail(email: Email): Promise<User | null> {
    this.recordCall('findByEmail', [email])
    return this.responses.get('findByEmail') || null
  }

  async save(user: User): Promise<User> {
    this.recordCall('save', [user])
    return this.responses.get('save') || user
  }

  async delete(id: UserId): Promise<void> {
    this.recordCall('delete', [id])
    return this.responses.get('delete')
  }

  private recordCall(method: string, args: any[]): void {
    if (!this.calls.has(method)) {
      this.calls.set(method, [])
    }
    this.calls.get(method)!.push(args)
  }
}

// ✅ Mock - Pre-programmed with expectations
class MockUserRepository implements UserRepository {
  private expectations: Map<string, ExpectationConfig> = new Map()
  private actualCalls: Map<string, any[]> = new Map()

  expect(method: string, config: ExpectationConfig): void {
    this.expectations.set(method, config)
  }

  verify(): void {
    for (const [method, expectation] of this.expectations) {
      const actualCalls = this.actualCalls.get(method) || []

      if (expectation.times !== undefined && actualCalls.length !== expectation.times) {
        throw new Error(
          `Expected ${method} to be called ${expectation.times} times, but was called ${actualCalls.length} times`,
        )
      }

      if (expectation.minTimes !== undefined && actualCalls.length < expectation.minTimes) {
        throw new Error(
          `Expected ${method} to be called at least ${expectation.minTimes} times, but was called ${actualCalls.length} times`,
        )
      }

      if (expectation.maxTimes !== undefined && actualCalls.length > expectation.maxTimes) {
        throw new Error(
          `Expected ${method} to be called at most ${expectation.maxTimes} times, but was called ${actualCalls.length} times`,
        )
      }

      if (expectation.withArgs && actualCalls.length > 0) {
        const lastCall = actualCalls[actualCalls.length - 1]
        if (!this.argsMatch(lastCall, expectation.withArgs)) {
          throw new Error(
            `Expected ${method} to be called with ${JSON.stringify(
              expectation.withArgs,
            )}, but was called with ${JSON.stringify(lastCall)}`,
          )
        }
      }
    }
  }

  async findById(id: UserId): Promise<User | null> {
    this.recordCall('findById', [id])
    const expectation = this.expectations.get('findById')
    return expectation?.returns || null
  }

  async findByEmail(email: Email): Promise<User | null> {
    this.recordCall('findByEmail', [email])
    const expectation = this.expectations.get('findByEmail')
    return expectation?.returns || null
  }

  async save(user: User): Promise<User> {
    this.recordCall('save', [user])
    const expectation = this.expectations.get('save')
    return expectation?.returns || user
  }

  async delete(id: UserId): Promise<void> {
    this.recordCall('delete', [id])
    const expectation = this.expectations.get('delete')
    if (expectation?.throws) {
      throw expectation.throws
    }
  }

  private recordCall(method: string, args: any[]): void {
    if (!this.actualCalls.has(method)) {
      this.actualCalls.set(method, [])
    }
    this.actualCalls.get(method)!.push(args)
  }

  private argsMatch(actual: any[], expected: any[]): boolean {
    if (actual.length !== expected.length) return false
    return actual.every((arg, index) => JSON.stringify(arg) === JSON.stringify(expected[index]))
  }
}

interface ExpectationConfig {
  times?: number
  minTimes?: number
  maxTimes?: number
  withArgs?: any[]
  returns?: any
  throws?: Error
}

// ✅ Fake - Working implementation with limited capabilities
class FakeUserRepository implements UserRepository {
  private users: Map<UserId, User> = new Map()
  private emailIndex: Map<Email, UserId> = new Map()

  async findById(id: UserId): Promise<User | null> {
    return this.users.get(id) || null
  }

  async findByEmail(email: Email): Promise<User | null> {
    const userId = this.emailIndex.get(email)
    return userId ? this.users.get(userId) || null : null
  }

  async save(user: User): Promise<User> {
    this.users.set(user.id, user)
    this.emailIndex.set(user.email, user.id)
    return user
  }

  async delete(id: UserId): Promise<void> {
    const user = this.users.get(id)
    if (user) {
      this.users.delete(id)
      this.emailIndex.delete(user.email)
    }
  }

  // Test utilities
  reset(): void {
    this.users.clear()
    this.emailIndex.clear()
  }

  seedUsers(users: User[]): void {
    users.forEach(user => {
      this.users.set(user.id, user)
      this.emailIndex.set(user.email, user.id)
    })
  }

  getAllUsers(): User[] {
    return Array.from(this.users.values())
  }
}
```

### Framework-Based Mocking with Vitest

```typescript
// ✅ Vitest mocking patterns
import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest'

// ✅ Module mocking
vi.mock('@/services/email-service', () => ({
  EmailService: vi.fn().mockImplementation(() => ({
    sendWelcomeEmail: vi.fn().mockResolvedValue({ success: true }),
    sendPasswordReset: vi.fn().mockResolvedValue({ success: true }),
  })),
}))

// ✅ Partial module mocking
vi.mock('@/utils/crypto', async importOriginal => {
  const actual = await importOriginal<typeof import('@/utils/crypto')>()
  return {
    ...actual,
    generateRandomToken: vi.fn().mockReturnValue('mock-token-123'),
  }
})

// ✅ Class-based service mocking
class MockEmailService {
  sendWelcomeEmail = vi.fn().mockResolvedValue({ success: true })
  sendPasswordReset = vi.fn().mockResolvedValue({ success: true })
  sendNotification = vi.fn().mockResolvedValue({ success: true })

  // Test utilities
  reset(): void {
    this.sendWelcomeEmail.mockReset()
    this.sendPasswordReset.mockReset()
    this.sendNotification.mockReset()
  }

  mockWelcomeEmailFailure(): void {
    this.sendWelcomeEmail.mockResolvedValue({
      success: false,
      error: new Error('Email service unavailable'),
    })
  }

  getWelcomeEmailCalls(): any[] {
    return this.sendWelcomeEmail.mock.calls
  }
}

// ✅ Factory function for creating mock services
class MockServiceFactory {
  static createMockUserRepository(): MockUserRepository & {
    reset: () => void
    seedUser: (user: User) => void
  } {
    const mock = new MockUserRepository()

    return Object.assign(mock, {
      reset: () => {
        // Reset all spy data
        mock.verify = vi.fn()
      },

      seedUser: (user: User) => {
        mock.expect('findById', { returns: user })
        mock.expect('findByEmail', { returns: user })
      },
    })
  }

  static createMockEmailService(): MockEmailService {
    return new MockEmailService()
  }

  static createMockLogger(): Logger {
    return {
      debug: vi.fn(),
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
    }
  }

  static createMockConfig(): AppConfig {
    return {
      environment: {
        name: 'testing',
        tier: 'local',
        isProduction: false,
        isDevelopment: false,
        isTesting: true,
        isLocal: true,
        debugEnabled: true,
        metricsEnabled: false,
      },
      database: {
        url: 'postgresql://test:test@localhost:5433/test_db',
        poolSize: 1,
        ssl: false,
        queryTimeout: 5000,
        migrationPath: './test-migrations',
      },
      email: {
        provider: 'mock',
        fromAddress: 'test@example.com',
        replyToAddress: 'test@example.com',
        templatePath: './test-templates',
      },
      logging: {
        level: 'error',
        format: 'json',
        destination: 'console',
      },
      security: {
        jwtSecret: 'test-secret-key-for-testing-only',
        bcryptRounds: 4,
        sessionTimeout: 3600000,
        corsOrigins: ['http://localhost:3000'],
        rateLimitEnabled: false,
        rateLimitMax: 1000,
        rateLimitWindowMs: 60000,
      },
      features: {
        enableNewFeature: true,
        enableBetaFeatures: true,
        enableAnalytics: false,
        enableProfiling: false,
      },
    } as AppConfig
  }
}

// ✅ Async mocking patterns
describe('UserService async operations', () => {
  let userService: UserService
  let mockRepository: MockUserRepository
  let mockEmailService: MockEmailService

  beforeEach(() => {
    mockRepository = MockServiceFactory.createMockUserRepository()
    mockEmailService = MockServiceFactory.createMockEmailService()

    userService = new UserService(
      mockRepository,
      mockEmailService,
      MockServiceFactory.createMockLogger(),
    )
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  it('should handle repository timeout gracefully', async () => {
    // Mock a timeout scenario
    mockRepository.expect('findById', {
      throws: new Error('Database timeout'),
    })

    const result = await userService.findById('user-123' as UserId)

    expect(result.success).toBe(false)
    expect(result.error?.message).toContain('timeout')
  })

  it('should handle email service failure during user creation', async () => {
    const userData: CreateUserData = {
      email: 'test@example.com' as Email,
      name: 'Test User',
    }

    // Mock successful user creation but email failure
    mockRepository.expect('save', { returns: MockData.createUser() })
    mockEmailService.mockWelcomeEmailFailure()

    const result = await userService.createUser(userData)

    expect(result.success).toBe(true) // User creation should succeed
    expect(mockEmailService.sendWelcomeEmail).toHaveBeenCalledOnce()

    // Verify email failure was logged but didn't fail the operation
    const logger = MockServiceFactory.createMockLogger()
    expect(logger.warn).toHaveBeenCalledWith(expect.stringContaining('email'), expect.any(Object))
  })
})

// ✅ Time-based mocking
describe('Time-sensitive operations', () => {
  beforeEach(() => {
    // Mock Date.now()
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2023-01-01T00:00:00Z'))
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('should expire tokens after specified time', async () => {
    const tokenService = new TokenService()
    const token = tokenService.createToken('user-123', { expiresIn: '1h' })

    // Advance time by 30 minutes
    vi.advanceTimersByTime(30 * 60 * 1000)
    expect(tokenService.isValid(token)).toBe(true)

    // Advance time by another 31 minutes (total 61 minutes)
    vi.advanceTimersByTime(31 * 60 * 1000)
    expect(tokenService.isValid(token)).toBe(false)
  })

  it('should handle rate limiting correctly', async () => {
    const rateLimiter = new RateLimiter({ max: 5, windowMs: 60000 })

    // Make 5 requests (should all succeed)
    for (let i = 0; i < 5; i++) {
      expect(await rateLimiter.check('user-123')).toBe(true)
    }

    // 6th request should fail
    expect(await rateLimiter.check('user-123')).toBe(false)

    // Advance time by 1 minute
    vi.advanceTimersByTime(60 * 1000)

    // Should work again
    expect(await rateLimiter.check('user-123')).toBe(true)
  })
})
```

## 🔄 API and HTTP Mocking

### HTTP Client Mocking

```typescript
// ✅ HTTP client mocking with MSW (Mock Service Worker)
import { rest } from 'msw'
import { setupServer } from 'msw/node'

// ✅ API response mocking
const server = setupServer(
  // User API endpoints
  rest.get('/api/users/:id', (req, res, ctx) => {
    const { id } = req.params

    if (id === 'not-found') {
      return res(ctx.status(404), ctx.json({ error: 'User not found' }))
    }

    return res(
      ctx.status(200),
      ctx.json({
        id,
        email: 'test@example.com',
        name: 'Test User',
        createdAt: '2023-01-01T00:00:00Z',
      }),
    )
  }),

  rest.post('/api/users', async (req, res, ctx) => {
    const userData = await req.json()

    // Simulate validation
    if (!userData.email || !userData.name) {
      return res(ctx.status(400), ctx.json({ error: 'Email and name are required' }))
    }

    // Simulate duplicate email
    if (userData.email === 'duplicate@example.com') {
      return res(ctx.status(409), ctx.json({ error: 'Email already exists' }))
    }

    return res(
      ctx.status(201),
      ctx.json({
        id: 'new-user-id',
        ...userData,
        createdAt: new Date().toISOString(),
      }),
    )
  }),

  // External service endpoints
  rest.post('https://api.sendgrid.com/v3/mail/send', (req, res, ctx) => {
    return res(ctx.status(202))
  }),

  rest.post('https://api.stripe.com/v1/charges', (req, res, ctx) => {
    return res(
      ctx.status(200),
      ctx.json({
        id: 'ch_mock123',
        amount: 2000,
        currency: 'usd',
        status: 'succeeded',
      }),
    )
  }),
)

// ✅ Test setup with MSW
beforeAll(() => server.listen())
afterEach(() => server.resetHandlers())
afterAll(() => server.close())

// ✅ Dynamic response mocking
describe('API error handling', () => {
  it('should handle network errors gracefully', async () => {
    // Mock network error
    server.use(
      rest.get('/api/users/:id', (req, res, ctx) => {
        return res.networkError('Network connection failed')
      }),
    )

    const apiClient = new ApiClient()
    const result = await apiClient.getUser('user-123')

    expect(result.success).toBe(false)
    expect(result.error?.message).toContain('Network')
  })

  it('should handle timeout errors', async () => {
    // Mock slow response
    server.use(
      rest.get('/api/users/:id', (req, res, ctx) => {
        return res(ctx.delay(6000), ctx.json({})) // 6 second delay
      }),
    )

    const apiClient = new ApiClient({ timeout: 5000 })
    const result = await apiClient.getUser('user-123')

    expect(result.success).toBe(false)
    expect(result.error?.message).toContain('timeout')
  })

  it('should handle rate limiting', async () => {
    let requestCount = 0

    server.use(
      rest.get('/api/users/:id', (req, res, ctx) => {
        requestCount++

        if (requestCount > 3) {
          return res(
            ctx.status(429),
            ctx.set('Retry-After', '60'),
            ctx.json({ error: 'Rate limit exceeded' }),
          )
        }

        return res(ctx.status(200), ctx.json({ id: req.params.id }))
      }),
    )

    const apiClient = new ApiClient()

    // First 3 requests should succeed
    for (let i = 0; i < 3; i++) {
      const result = await apiClient.getUser(`user-${i}`)
      expect(result.success).toBe(true)
    }

    // 4th request should be rate limited
    const result = await apiClient.getUser('user-4')
    expect(result.success).toBe(false)
    expect(result.error?.message).toContain('Rate limit')
  })
})

// ✅ Fetch API mocking (alternative to MSW)
class MockFetch {
  private responses: Map<string, MockResponse> = new Map()

  mock(url: string | RegExp, response: MockResponse): void {
    const key = url instanceof RegExp ? url.source : url
    this.responses.set(key, response)
  }

  async fetch(url: string, options?: RequestInit): Promise<Response> {
    for (const [pattern, response] of this.responses) {
      const regex = new RegExp(pattern)
      if (regex.test(url)) {
        return this.createResponse(response)
      }
    }

    throw new Error(`No mock response configured for ${url}`)
  }

  private createResponse(mockResponse: MockResponse): Response {
    return new Response(JSON.stringify(mockResponse.body), {
      status: mockResponse.status,
      statusText: mockResponse.statusText,
      headers: mockResponse.headers,
    })
  }

  reset(): void {
    this.responses.clear()
  }
}

interface MockResponse {
  status: number
  statusText?: string
  body: any
  headers?: Record<string, string>
}

// ✅ Usage in tests
describe('ApiClient with MockFetch', () => {
  let mockFetch: MockFetch
  let apiClient: ApiClient

  beforeEach(() => {
    mockFetch = new MockFetch()
    apiClient = new ApiClient({
      baseUrl: 'https://api.example.com',
      fetchFn: mockFetch.fetch.bind(mockFetch),
    })
  })

  it('should handle successful API calls', async () => {
    mockFetch.mock('/users/123', {
      status: 200,
      body: { id: '123', name: 'Test User' },
    })

    const result = await apiClient.getUser('123')

    expect(result.success).toBe(true)
    expect(result.data.name).toBe('Test User')
  })
})
```

### WebSocket Mocking

```typescript
// ✅ WebSocket mocking for real-time features
class MockWebSocket {
  public readyState: number = WebSocket.CONNECTING
  public onopen: ((event: Event) => void) | null = null
  public onmessage: ((event: MessageEvent) => void) | null = null
  public onclose: ((event: CloseEvent) => void) | null = null
  public onerror: ((event: Event) => void) | null = null

  private messageQueue: string[] = []

  constructor(public url: string) {
    // Simulate connection opening
    setTimeout(() => {
      this.readyState = WebSocket.OPEN
      this.onopen?.(new Event('open'))
      this.processMessageQueue()
    }, 100)
  }

  send(data: string): void {
    if (this.readyState !== WebSocket.OPEN) {
      throw new Error('WebSocket is not open')
    }

    // Echo the message back (for testing)
    setTimeout(() => {
      this.onmessage?.(new MessageEvent('message', { data }))
    }, 10)
  }

  close(code?: number, reason?: string): void {
    this.readyState = WebSocket.CLOSED
    this.onclose?.(new CloseEvent('close', { code, reason }))
  }

  // Test utilities
  simulateMessage(data: string): void {
    if (this.readyState === WebSocket.OPEN) {
      this.onmessage?.(new MessageEvent('message', { data }))
    } else {
      this.messageQueue.push(data)
    }
  }

  simulateError(): void {
    this.onerror?.(new Event('error'))
  }

  simulateClose(code: number = 1000, reason: string = 'Normal closure'): void {
    this.readyState = WebSocket.CLOSED
    this.onclose?.(new CloseEvent('close', { code, reason }))
  }

  private processMessageQueue(): void {
    while (this.messageQueue.length > 0) {
      const message = this.messageQueue.shift()!
      this.simulateMessage(message)
    }
  }
}

// ✅ WebSocket service testing
describe('NotificationService WebSocket', () => {
  let notificationService: NotificationService
  let mockWebSocket: MockWebSocket

  beforeEach(() => {
    // Mock the global WebSocket
    global.WebSocket = MockWebSocket as any

    notificationService = new NotificationService('ws://localhost:8080')
    mockWebSocket = (notificationService as any).socket
  })

  it('should connect and receive notifications', async () => {
    const notifications: Notification[] = []

    notificationService.onNotification(notification => {
      notifications.push(notification)
    })

    // Wait for connection
    await new Promise(resolve => setTimeout(resolve, 150))

    // Simulate incoming notification
    mockWebSocket.simulateMessage(
      JSON.stringify({
        type: 'notification',
        data: {
          id: 'notif-1',
          title: 'Test Notification',
          message: 'This is a test',
        },
      }),
    )

    expect(notifications).toHaveLength(1)
    expect(notifications[0].title).toBe('Test Notification')
  })

  it('should handle connection errors gracefully', async () => {
    let errorOccurred = false

    notificationService.onError(() => {
      errorOccurred = true
    })

    mockWebSocket.simulateError()

    expect(errorOccurred).toBe(true)
  })

  it('should attempt reconnection on close', async () => {
    let reconnectAttempted = false

    // Mock the reconnection logic
    const originalConnect = notificationService.connect
    notificationService.connect = vi.fn().mockImplementation(() => {
      reconnectAttempted = true
      return originalConnect.call(notificationService)
    })

    mockWebSocket.simulateClose(1006, 'Abnormal closure')

    // Wait for reconnection attempt
    await new Promise(resolve => setTimeout(resolve, 1100))

    expect(reconnectAttempted).toBe(true)
  })
})
```

## 🏗️ Integration Testing with Mocks

### Service Integration Testing

```typescript
// ✅ Integration test setup with selective mocking
class IntegrationTestSetup {
  private app: FastifyInstance
  private testDb: Database
  private mockServices: MockServiceRegistry

  constructor() {
    this.mockServices = new MockServiceRegistry()
    this.testDb = new TestDatabase()
  }

  async setup(): Promise<void> {
    // Setup test database
    await this.testDb.migrate()

    // Create app with mock services
    this.app = await createApp({
      database: this.testDb,
      emailService: this.mockServices.emailService,
      paymentService: this.mockServices.paymentService,
      logger: this.mockServices.logger,
    })
  }

  async teardown(): Promise<void> {
    await this.app.close()
    await this.testDb.cleanup()
    this.mockServices.reset()
  }

  getApp(): FastifyInstance {
    return this.app
  }

  getMockServices(): MockServiceRegistry {
    return this.mockServices
  }
}

class MockServiceRegistry {
  public emailService: MockEmailService
  public paymentService: MockPaymentService
  public logger: Logger

  constructor() {
    this.emailService = new MockEmailService()
    this.paymentService = new MockPaymentService()
    this.logger = MockServiceFactory.createMockLogger()
  }

  reset(): void {
    this.emailService.reset()
    this.paymentService.reset()
    vi.clearAllMocks()
  }
}

// ✅ Integration test examples
describe('User Registration Integration', () => {
  let testSetup: IntegrationTestSetup

  beforeEach(async () => {
    testSetup = new IntegrationTestSetup()
    await testSetup.setup()
  })

  afterEach(async () => {
    await testSetup.teardown()
  })

  it('should register user and send welcome email', async () => {
    const app = testSetup.getApp()
    const mockServices = testSetup.getMockServices()

    const response = await app.inject({
      method: 'POST',
      url: '/api/users',
      payload: {
        email: 'test@example.com',
        name: 'Test User',
        password: 'securepassword123',
      },
    })

    expect(response.statusCode).toBe(201)

    const user = JSON.parse(response.payload)
    expect(user.email).toBe('test@example.com')
    expect(user.name).toBe('Test User')
    expect(user.id).toBeDefined()

    // Verify welcome email was sent
    expect(mockServices.emailService.sendWelcomeEmail).toHaveBeenCalledWith(
      'test@example.com',
      'Test User',
    )
  })

  it('should handle email service failure gracefully', async () => {
    const app = testSetup.getApp()
    const mockServices = testSetup.getMockServices()

    // Mock email service failure
    mockServices.emailService.sendWelcomeEmail.mockRejectedValue(
      new Error('Email service unavailable'),
    )

    const response = await app.inject({
      method: 'POST',
      url: '/api/users',
      payload: {
        email: 'test@example.com',
        name: 'Test User',
        password: 'securepassword123',
      },
    })

    // User creation should still succeed
    expect(response.statusCode).toBe(201)

    // But email failure should be logged
    expect(mockServices.logger.warn).toHaveBeenCalledWith(
      expect.stringContaining('welcome email'),
      expect.any(Object),
    )
  })

  it('should prevent duplicate email registration', async () => {
    const app = testSetup.getApp()

    const userData = {
      email: 'test@example.com',
      name: 'Test User',
      password: 'securepassword123',
    }

    // First registration should succeed
    const firstResponse = await app.inject({
      method: 'POST',
      url: '/api/users',
      payload: userData,
    })

    expect(firstResponse.statusCode).toBe(201)

    // Second registration with same email should fail
    const secondResponse = await app.inject({
      method: 'POST',
      url: '/api/users',
      payload: userData,
    })

    expect(secondResponse.statusCode).toBe(409)
    expect(JSON.parse(secondResponse.payload)).toMatchObject({
      error: expect.stringContaining('email'),
    })
  })
})

// ✅ End-to-end workflow testing
describe('Order Processing Workflow', () => {
  let testSetup: IntegrationTestSetup

  beforeEach(async () => {
    testSetup = new IntegrationTestSetup()
    await testSetup.setup()
  })

  afterEach(async () => {
    await testSetup.teardown()
  })

  it('should process complete order workflow', async () => {
    const app = testSetup.getApp()
    const mockServices = testSetup.getMockServices()

    // Setup payment service to succeed
    mockServices.paymentService.processPayment.mockResolvedValue({
      success: true,
      data: { paymentId: 'pay-123', status: 'succeeded' },
    })

    // 1. Create user
    const userResponse = await app.inject({
      method: 'POST',
      url: '/api/users',
      payload: {
        email: 'customer@example.com',
        name: 'Customer',
        password: 'password123',
      },
    })

    const user = JSON.parse(userResponse.payload)

    // 2. Create order
    const orderResponse = await app.inject({
      method: 'POST',
      url: '/api/orders',
      headers: {
        authorization: `Bearer ${user.token}`,
      },
      payload: {
        items: [
          { productId: 'prod-1', quantity: 2, price: 29.99 },
          { productId: 'prod-2', quantity: 1, price: 49.99 },
        ],
        shippingAddress: {
          street: '123 Main St',
          city: 'Anytown',
          country: 'US',
          postalCode: '12345',
        },
      },
    })

    const order = JSON.parse(orderResponse.payload)
    expect(order.status).toBe('pending')
    expect(order.total).toBe(109.97)

    // 3. Process payment
    const paymentResponse = await app.inject({
      method: 'POST',
      url: `/api/orders/${order.id}/payment`,
      headers: {
        authorization: `Bearer ${user.token}`,
      },
      payload: {
        paymentMethod: 'card',
        cardToken: 'tok_visa',
      },
    })

    expect(paymentResponse.statusCode).toBe(200)

    const paidOrder = JSON.parse(paymentResponse.payload)
    expect(paidOrder.status).toBe('paid')
    expect(paidOrder.paymentId).toBe('pay-123')

    // Verify payment service was called correctly
    expect(mockServices.paymentService.processPayment).toHaveBeenCalledWith({
      amount: 109.97,
      currency: 'USD',
      orderId: order.id,
      paymentMethod: 'card',
      token: 'tok_visa',
    })

    // Verify confirmation email was sent
    expect(mockServices.emailService.sendOrderConfirmationEmail).toHaveBeenCalledWith(
      'customer@example.com',
      expect.objectContaining({
        orderId: order.id,
        total: 109.97,
      }),
    )
  })
})
```

## 🔗 Related Concepts

- **[Function Design](function-design.md)** - Designing functions for testability
- **[Service Abstraction](service-abstraction.md)** - Service-level mocking strategies
- **[Testing Strategy](.pair/knowledge/guidelines/testing/testing-strategy/README.md)** - Overall testing approach
- **[Development Environment](development-environment.md)** - Test environment setup

## 🎯 Implementation Guidelines

1. **Test Double Selection**: Choose the right type of test double for your specific testing needs
2. **Mock Minimalism**: Mock only external dependencies and complex collaborators
3. **Realistic Mocks**: Ensure mocks behave similarly to real implementations
4. **Verification Strategy**: Use spies and mocks to verify interactions when behavior matters
5. **Isolation**: Ensure tests are isolated and don't share mock state
6. **Reset Strategy**: Reset mocks between tests to prevent test interference
7. **Integration Balance**: Use integration tests to verify mock assumptions

## 📏 Benefits

- **Test Speed**: Mocks eliminate slow external dependencies
- **Test Reliability**: Consistent mock behavior removes flaky test issues
- **Test Isolation**: Tests focus on specific units without external interference
- **Error Simulation**: Ability to test error conditions that are hard to reproduce
- **Parallel Testing**: Independent tests can run in parallel without conflicts
- **Coverage**: Ability to test edge cases and error scenarios

---

_Effective mocking strategies enable fast, reliable, and comprehensive testing while maintaining confidence in your application's behavior._

# Mocking Strategies

## Mocking Fundamentals

### When to Mock

- **External dependencies** - APIs, databases, file systems
- **Complex objects** - Classes with intricate initialization
- **Time-dependent code** - Date/time functions
- **Random behavior** - Random number generators
- **Side effects** - Network calls, logging, analytics

### When NOT to Mock

- **Simple value objects** - Plain data structures
- **Pure functions** - Functions without side effects
- **Integration points you want to test** - Critical interfaces
- **Your own domain logic** - Core business functionality

## Mocking Techniques

### Function Mocking

```typescript
// Jest
const mockFn = jest.fn()
mockFn.mockReturnValue('mocked value')
mockFn.mockResolvedValue('async value')

// Vitest
import { vi } from 'vitest'
const mockFn = vi.fn()
mockFn.mockReturnValue('mocked value')
mockFn.mockResolvedValue('async value')
```

### Module Mocking

```typescript
// Jest
jest.mock('./api-client', () => ({
  fetchUser: jest.fn().mockResolvedValue({ id: 1, name: 'Test User' }),
  updateUser: jest.fn().mockResolvedValue(true),
}))

// Vitest
vi.mock('./api-client', () => ({
  fetchUser: vi.fn().mockResolvedValue({ id: 1, name: 'Test User' }),
  updateUser: vi.fn().mockResolvedValue(true),
}))
```

### Class Mocking

```typescript
// Manual mock
class MockDatabase {
  connect = vi.fn().mockResolvedValue(true)
  query = vi.fn()
  disconnect = vi.fn().mockResolvedValue(true)
}

// Automatic mock
vi.mock('./database', () => ({
  Database: vi.fn().mockImplementation(() => ({
    connect: vi.fn().mockResolvedValue(true),
    query: vi.fn(),
    disconnect: vi.fn().mockResolvedValue(true),
  })),
}))
```

## Advanced Mocking Patterns

### Conditional Mocking

```typescript
const mockApiCall = vi.fn().mockImplementation(endpoint => {
  switch (endpoint) {
    case '/users':
      return Promise.resolve([{ id: 1, name: 'User 1' }])
    case '/posts':
      return Promise.resolve([{ id: 1, title: 'Post 1' }])
    default:
      return Promise.reject(new Error('Unknown endpoint'))
  }
})
```

### Partial Mocking

```typescript
// Mock only specific methods
vi.mock('./utils', async () => {
  const actual = await vi.importActual('./utils')
  return {
    ...actual,
    generateId: vi.fn().mockReturnValue('test-id'),
    // Keep other functions as original
  }
})
```

### Mock Factories

```typescript
// Reusable mock factory
function createMockUser(overrides = {}) {
  return {
    id: 1,
    name: 'Test User',
    email: 'test@example.com',
    isActive: true,
    ...overrides,
  }
}

// Usage
const user = createMockUser({ name: 'Custom Name' })
```

## Test Isolation Strategies

### Mock Reset and Cleanup

```typescript
describe('UserService', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    // or
    mockApiClient.fetchUser.mockClear()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })
})
```

### Scoped Mocking

```typescript
describe('Feature tests', () => {
  it('should handle success case', async () => {
    // Scope mock to this test only
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ data: 'success' }),
    })

    vi.stubGlobal('fetch', mockFetch)

    // Test implementation
    await testFunction()

    expect(mockFetch).toHaveBeenCalledWith('/api/data')

    // Cleanup
    vi.unstubAllGlobals()
  })
})
```

## Common Mocking Scenarios

### Date/Time Mocking

```typescript
beforeEach(() => {
  vi.useFakeTimers()
  vi.setSystemTime(new Date('2023-01-01'))
})

afterEach(() => {
  vi.useRealTimers()
})

test('time-dependent functionality', () => {
  const result = getDateString()
  expect(result).toBe('2023-01-01')

  // Advance time
  vi.advanceTimersByTime(24 * 60 * 60 * 1000) // 1 day

  const nextResult = getDateString()
  expect(nextResult).toBe('2023-01-02')
})
```

### Environment Variable Mocking

```typescript
beforeEach(() => {
  vi.stubEnv('NODE_ENV', 'test')
  vi.stubEnv('API_URL', 'http://test-api.com')
})

afterEach(() => {
  vi.unstubAllEnvs()
})
```

### Network Request Mocking

```typescript
// Using MSW (Mock Service Worker)
import { rest } from 'msw'
import { setupServer } from 'msw/node'

const server = setupServer(
  rest.get('/api/users/:id', (req, res, ctx) => {
    return res(ctx.json({ id: req.params.id, name: 'Test User' }))
  }),
)

beforeAll(() => server.listen())
afterEach(() => server.resetHandlers())
afterAll(() => server.close())
```

## Best Practices

### Mock Verification

- Verify that mocks are called with expected arguments
- Check call count when it matters
- Avoid over-specifying mock interactions

### Mock Realism

- Make mocks behave like real implementations
- Include realistic error scenarios
- Maintain consistency with actual API responses

### Mock Maintenance

- Keep mocks up-to-date with real implementations
- Use TypeScript for better mock type safety
- Consider using contract testing for critical integrations

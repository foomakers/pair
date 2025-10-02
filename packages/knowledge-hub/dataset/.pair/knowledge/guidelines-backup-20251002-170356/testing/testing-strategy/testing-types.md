# 🧪 Testing Types

**Focus**: Comprehensive testing taxonomy and implementation patterns

Complete taxonomy of testing types with practical implementation patterns for each type, ensuring comprehensive coverage across all levels of the application stack.

## 🎯 Testing Taxonomy

### Testing Categories Overview

```typescript
// ✅ Testing types classification
interface TestingTaxonomy {
  // By scope
  scope: {
    unit: UnitTestingStrategy
    integration: IntegrationTestingStrategy
    e2e: E2ETestingStrategy
    system: SystemTestingStrategy
  }

  // By purpose
  purpose: {
    functional: FunctionalTestingStrategy
    nonFunctional: NonFunctionalTestingStrategy
    regression: RegressionTestingStrategy
    acceptance: AcceptanceTestingStrategy
  }

  // By approach
  approach: {
    blackBox: BlackBoxTestingStrategy
    whiteBox: WhiteBoxTestingStrategy
    grayBox: GrayBoxTestingStrategy
  }

  // By execution
  execution: {
    manual: ManualTestingStrategy
    automated: AutomatedTestingStrategy
    hybrid: HybridTestingStrategy
  }
}

interface TestingStrategy {
  description: string
  tools: string[]
  patterns: TestPattern[]
  coverage: CoverageTarget
  automation: AutomationLevel
  priority: TestPriority
}
```

## 🔬 Unit Testing

### Component Unit Tests

```typescript
// ✅ React component unit testing
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { userEvent } from '@testing-library/user-event'
import { vi } from 'vitest'
import { UserProfile } from '@/components/UserProfile'
import { useUser } from '@/hooks/useUser'

// Mock dependencies
vi.mock('@/hooks/useUser')
const mockUseUser = vi.mocked(useUser)

describe('UserProfile Component', () => {
  const defaultProps = {
    userId: 'user-123',
    onEdit: vi.fn(),
    onDelete: vi.fn(),
  }

  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('Rendering', () => {
    it('renders user information correctly', () => {
      mockUseUser.mockReturnValue({
        user: {
          id: 'user-123',
          name: 'John Doe',
          email: 'john@example.com',
          avatar: 'https://example.com/avatar.jpg',
        },
        isLoading: false,
        error: null,
      })

      render(<UserProfile {...defaultProps} />)

      expect(screen.getByText('John Doe')).toBeInTheDocument()
      expect(screen.getByText('john@example.com')).toBeInTheDocument()
      expect(screen.getByRole('img', { name: /john doe/i })).toHaveAttribute(
        'src',
        'https://example.com/avatar.jpg',
      )
    })

    it('shows loading state when user data is loading', () => {
      mockUseUser.mockReturnValue({
        user: null,
        isLoading: true,
        error: null,
      })

      render(<UserProfile {...defaultProps} />)

      expect(screen.getByRole('progressbar')).toBeInTheDocument()
      expect(screen.getByText(/loading/i)).toBeInTheDocument()
    })

    it('shows error state when user data fails to load', () => {
      mockUseUser.mockReturnValue({
        user: null,
        isLoading: false,
        error: new Error('Failed to load user'),
      })

      render(<UserProfile {...defaultProps} />)

      expect(screen.getByText(/error loading user/i)).toBeInTheDocument()
      expect(screen.getByRole('button', { name: /retry/i })).toBeInTheDocument()
    })
  })

  describe('Interactions', () => {
    it('calls onEdit when edit button is clicked', async () => {
      mockUseUser.mockReturnValue({
        user: {
          id: 'user-123',
          name: 'John Doe',
          email: 'john@example.com',
        },
        isLoading: false,
        error: null,
      })

      const user = userEvent.setup()
      render(<UserProfile {...defaultProps} />)

      const editButton = screen.getByRole('button', { name: /edit/i })
      await user.click(editButton)

      expect(defaultProps.onEdit).toHaveBeenCalledWith('user-123')
    })

    it('calls onDelete when delete button is clicked and confirmed', async () => {
      // Mock window.confirm
      const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true)

      mockUseUser.mockReturnValue({
        user: {
          id: 'user-123',
          name: 'John Doe',
          email: 'john@example.com',
        },
        isLoading: false,
        error: null,
      })

      const user = userEvent.setup()
      render(<UserProfile {...defaultProps} />)

      const deleteButton = screen.getByRole('button', { name: /delete/i })
      await user.click(deleteButton)

      expect(confirmSpy).toHaveBeenCalledWith('Are you sure you want to delete this user?')
      expect(defaultProps.onDelete).toHaveBeenCalledWith('user-123')

      confirmSpy.mockRestore()
    })
  })

  describe('Accessibility', () => {
    it('has proper ARIA labels', () => {
      mockUseUser.mockReturnValue({
        user: {
          id: 'user-123',
          name: 'John Doe',
          email: 'john@example.com',
        },
        isLoading: false,
        error: null,
      })

      render(<UserProfile {...defaultProps} />)

      expect(screen.getByRole('region', { name: /user profile/i })).toBeInTheDocument()
      expect(screen.getByRole('button', { name: /edit john doe/i })).toBeInTheDocument()
    })

    it('supports keyboard navigation', async () => {
      mockUseUser.mockReturnValue({
        user: {
          id: 'user-123',
          name: 'John Doe',
          email: 'john@example.com',
        },
        isLoading: false,
        error: null,
      })

      const user = userEvent.setup()
      render(<UserProfile {...defaultProps} />)

      const editButton = screen.getByRole('button', { name: /edit/i })

      // Tab to the edit button
      await user.tab()
      expect(editButton).toHaveFocus()

      // Press Enter to activate
      await user.keyboard('{Enter}')
      expect(defaultProps.onEdit).toHaveBeenCalled()
    })
  })
})
```

### Business Logic Unit Tests

```typescript
// ✅ Business logic unit testing
import { calculateOrderTotal, validateEmail, formatCurrency } from '@/utils/business'
import { OrderItem, TaxRate } from '@/types'

describe('Business Logic Utils', () => {
  describe('calculateOrderTotal', () => {
    const mockItems: OrderItem[] = [
      { id: '1', name: 'Item 1', price: 10.99, quantity: 2 },
      { id: '2', name: 'Item 2', price: 25.5, quantity: 1 },
    ]

    const mockTaxRate: TaxRate = {
      rate: 0.08,
      type: 'percentage',
    }

    it('calculates total correctly without tax', () => {
      const result = calculateOrderTotal(mockItems)

      expect(result).toEqual({
        subtotal: 47.48,
        tax: 0,
        total: 47.48,
      })
    })

    it('calculates total correctly with tax', () => {
      const result = calculateOrderTotal(mockItems, mockTaxRate)

      expect(result).toEqual({
        subtotal: 47.48,
        tax: 3.8,
        total: 51.28,
      })
    })

    it('handles empty items array', () => {
      const result = calculateOrderTotal([])

      expect(result).toEqual({
        subtotal: 0,
        tax: 0,
        total: 0,
      })
    })

    it('handles decimal precision correctly', () => {
      const items: OrderItem[] = [{ id: '1', name: 'Item', price: 10.996, quantity: 3 }]

      const result = calculateOrderTotal(items)

      // Should round to 2 decimal places
      expect(result.subtotal).toBe(32.99)
    })
  })

  describe('validateEmail', () => {
    it('validates correct email formats', () => {
      const validEmails = [
        'test@example.com',
        'user.name@domain.co.uk',
        'user+tag@example.org',
        'user123@test-domain.com',
      ]

      validEmails.forEach(email => {
        expect(validateEmail(email)).toBe(true)
      })
    })

    it('rejects invalid email formats', () => {
      const invalidEmails = [
        'invalid-email',
        '@example.com',
        'user@',
        'user space@example.com',
        'user..double@example.com',
      ]

      invalidEmails.forEach(email => {
        expect(validateEmail(email)).toBe(false)
      })
    })
  })

  describe('formatCurrency', () => {
    it('formats USD currency correctly', () => {
      expect(formatCurrency(1234.56, 'USD')).toBe('$1,234.56')
      expect(formatCurrency(0, 'USD')).toBe('$0.00')
      expect(formatCurrency(999.999, 'USD')).toBe('$1,000.00')
    })

    it('formats EUR currency correctly', () => {
      expect(formatCurrency(1234.56, 'EUR')).toBe('€1,234.56')
    })

    it('handles different locales', () => {
      expect(formatCurrency(1234.56, 'USD', 'de-DE')).toBe('1.234,56 $')
    })
  })
})
```

## 🔗 Integration Testing

### API Integration Tests

```typescript
// ✅ API integration testing
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import request from 'supertest'
import { app } from '@/app'
import { prisma } from '@/lib/database'
import { createTestUser, cleanupDatabase } from '@/test-utils'

describe('User API Integration', () => {
  let testUser: any
  let authToken: string

  beforeAll(async () => {
    // Setup test database
    await prisma.$connect()
  })

  afterAll(async () => {
    await cleanupDatabase()
    await prisma.$disconnect()
  })

  beforeEach(async () => {
    await cleanupDatabase()
    testUser = await createTestUser()
    authToken = await generateAuthToken(testUser.id)
  })

  describe('POST /api/users', () => {
    it('creates a new user with valid data', async () => {
      const userData = {
        name: 'New User',
        email: 'newuser@example.com',
        password: 'SecurePassword123!',
      }

      const response = await request(app).post('/api/users').send(userData).expect(201)

      expect(response.body).toMatchObject({
        success: true,
        data: {
          id: expect.any(String),
          name: userData.name,
          email: userData.email,
          createdAt: expect.any(String),
        },
      })

      // Verify user was created in database
      const createdUser = await prisma.user.findUnique({
        where: { email: userData.email },
      })
      expect(createdUser).toBeTruthy()
      expect(createdUser?.name).toBe(userData.name)
    })

    it('returns 400 for invalid email', async () => {
      const userData = {
        name: 'Test User',
        email: 'invalid-email',
        password: 'SecurePassword123!',
      }

      const response = await request(app).post('/api/users').send(userData).expect(400)

      expect(response.body).toMatchObject({
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: expect.stringContaining('email'),
        },
      })
    })

    it('returns 409 for duplicate email', async () => {
      const userData = {
        name: 'Duplicate User',
        email: testUser.email,
        password: 'SecurePassword123!',
      }

      const response = await request(app).post('/api/users').send(userData).expect(409)

      expect(response.body).toMatchObject({
        success: false,
        error: {
          code: 'CONFLICT',
          message: expect.stringContaining('already exists'),
        },
      })
    })
  })

  describe('GET /api/users/:id', () => {
    it('returns user data for valid ID', async () => {
      const response = await request(app)
        .get(`/api/users/${testUser.id}`)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200)

      expect(response.body).toMatchObject({
        success: true,
        data: {
          id: testUser.id,
          name: testUser.name,
          email: testUser.email,
          createdAt: expect.any(String),
        },
      })
    })

    it('returns 404 for non-existent user', async () => {
      const response = await request(app)
        .get('/api/users/non-existent-id')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(404)

      expect(response.body).toMatchObject({
        success: false,
        error: {
          code: 'NOT_FOUND',
        },
      })
    })

    it('returns 401 without authentication', async () => {
      await request(app).get(`/api/users/${testUser.id}`).expect(401)
    })
  })
})
```

### Database Integration Tests

```typescript
// ✅ Database integration testing
import { describe, it, expect, beforeEach } from 'vitest'
import { UserRepository } from '@/repositories/UserRepository'
import { prisma } from '@/lib/database'
import { cleanupDatabase, createTestUser } from '@/test-utils'

describe('UserRepository Integration', () => {
  let userRepository: UserRepository

  beforeEach(async () => {
    await cleanupDatabase()
    userRepository = new UserRepository(prisma)
  })

  describe('findByEmail', () => {
    it('finds user by email', async () => {
      const testUser = await createTestUser()

      const foundUser = await userRepository.findByEmail(testUser.email)

      expect(foundUser).toBeTruthy()
      expect(foundUser?.id).toBe(testUser.id)
      expect(foundUser?.email).toBe(testUser.email)
    })

    it('returns null for non-existent email', async () => {
      const foundUser = await userRepository.findByEmail('nonexistent@example.com')

      expect(foundUser).toBeNull()
    })
  })

  describe('create', () => {
    it('creates user with all fields', async () => {
      const userData = {
        name: 'Test User',
        email: 'test@example.com',
        passwordHash: 'hashed-password',
      }

      const createdUser = await userRepository.create(userData)

      expect(createdUser).toMatchObject({
        id: expect.any(String),
        name: userData.name,
        email: userData.email,
        createdAt: expect.any(Date),
        updatedAt: expect.any(Date),
      })

      // Verify in database
      const dbUser = await prisma.user.findUnique({
        where: { id: createdUser.id },
      })
      expect(dbUser).toBeTruthy()
    })

    it('throws error for duplicate email', async () => {
      const userData = {
        name: 'Test User',
        email: 'test@example.com',
        passwordHash: 'hashed-password',
      }

      await userRepository.create(userData)

      await expect(userRepository.create(userData)).rejects.toThrow()
    })
  })

  describe('updateProfile', () => {
    it('updates user profile fields', async () => {
      const testUser = await createTestUser()
      const updateData = {
        name: 'Updated Name',
        bio: 'Updated bio',
      }

      const updatedUser = await userRepository.updateProfile(testUser.id, updateData)

      expect(updatedUser.name).toBe(updateData.name)
      expect(updatedUser.profile?.bio).toBe(updateData.bio)
      expect(updatedUser.updatedAt).not.toEqual(testUser.updatedAt)
    })
  })
})
```

## 🌐 End-to-End Testing

### Complete User Journeys

```typescript
// ✅ E2E testing with Playwright
import { test, expect } from '@playwright/test'
import { createTestUser, cleanupDatabase } from '../utils/test-helpers'

test.describe('User Registration Flow', () => {
  test.beforeEach(async () => {
    await cleanupDatabase()
  })

  test('complete user registration and profile setup', async ({ page }) => {
    // Navigate to registration page
    await page.goto('/register')

    // Fill registration form
    await page.fill('[data-testid="name-input"]', 'John Doe')
    await page.fill('[data-testid="email-input"]', 'john@example.com')
    await page.fill('[data-testid="password-input"]', 'SecurePassword123!')
    await page.fill('[data-testid="confirm-password-input"]', 'SecurePassword123!')

    // Submit form
    await page.click('[data-testid="register-button"]')

    // Verify email verification page
    await expect(page).toHaveURL('/verify-email')
    await expect(page.locator('[data-testid="verification-message"]')).toContainText(
      'Please check your email',
    )

    // Simulate email verification (in real test, you'd check email service)
    await page.goto('/verify-email?token=mock-verification-token')

    // Should redirect to profile setup
    await expect(page).toHaveURL('/profile/setup')

    // Complete profile setup
    await page.fill('[data-testid="bio-input"]', 'Software developer')
    await page.selectOption('[data-testid="country-select"]', 'US')
    await page.check('[data-testid="newsletter-checkbox"]')

    await page.click('[data-testid="complete-setup-button"]')

    // Should redirect to dashboard
    await expect(page).toHaveURL('/dashboard')
    await expect(page.locator('[data-testid="welcome-message"]')).toContainText('Welcome, John Doe')
  })

  test('handles registration validation errors', async ({ page }) => {
    await page.goto('/register')

    // Try to submit with invalid data
    await page.fill('[data-testid="email-input"]', 'invalid-email')
    await page.fill('[data-testid="password-input"]', '123') // Too short
    await page.click('[data-testid="register-button"]')

    // Check validation errors
    await expect(page.locator('[data-testid="email-error"]')).toContainText(
      'Please enter a valid email',
    )
    await expect(page.locator('[data-testid="password-error"]')).toContainText(
      'Password must be at least 8 characters',
    )

    // Form should not submit
    await expect(page).toHaveURL('/register')
  })
})

test.describe('Authentication Flow', () => {
  test('login with valid credentials', async ({ page }) => {
    // Create test user
    const testUser = await createTestUser({
      email: 'test@example.com',
      password: 'SecurePassword123!',
    })

    await page.goto('/login')

    await page.fill('[data-testid="email-input"]', testUser.email)
    await page.fill('[data-testid="password-input"]', 'SecurePassword123!')
    await page.click('[data-testid="login-button"]')

    // Should redirect to dashboard
    await expect(page).toHaveURL('/dashboard')

    // Check authentication state
    await expect(page.locator('[data-testid="user-menu"]')).toBeVisible()
    await expect(page.locator('[data-testid="login-button"]')).not.toBeVisible()
  })

  test('logout functionality', async ({ page }) => {
    // Login first
    const testUser = await createTestUser()
    await page.goto('/login')
    await page.fill('[data-testid="email-input"]', testUser.email)
    await page.fill('[data-testid="password-input"]', 'password')
    await page.click('[data-testid="login-button"]')

    // Logout
    await page.click('[data-testid="user-menu"]')
    await page.click('[data-testid="logout-button"]')

    // Should redirect to home
    await expect(page).toHaveURL('/')
    await expect(page.locator('[data-testid="login-button"]')).toBeVisible()
    await expect(page.locator('[data-testid="user-menu"]')).not.toBeVisible()
  })
})
```

## 🔒 Security Testing

### Authentication & Authorization Tests

```typescript
// ✅ Security testing patterns
import { test, expect } from '@playwright/test'
import request from 'supertest'
import { app } from '@/app'

describe('Security Tests', () => {
  describe('Authentication Security', () => {
    it('prevents SQL injection in login', async () => {
      const maliciousPayload = {
        email: "admin@example.com' OR '1'='1' --",
        password: 'any-password',
      }

      const response = await request(app).post('/api/auth/login').send(maliciousPayload).expect(401)

      expect(response.body.error.code).toBe('INVALID_CREDENTIALS')
    })

    it('prevents brute force attacks', async () => {
      const attempts = Array.from({ length: 6 }, (_, i) =>
        request(app)
          .post('/api/auth/login')
          .send({
            email: 'test@example.com',
            password: `wrong-password-${i}`,
          }),
      )

      const responses = await Promise.all(attempts)

      // First 5 should be 401, 6th should be 429 (rate limited)
      responses.slice(0, 5).forEach(response => {
        expect(response.status).toBe(401)
      })
      expect(responses[5].status).toBe(429)
    })
  })

  describe('Authorization Security', () => {
    it('prevents access to admin endpoints without admin role', async () => {
      const userToken = await createUserToken({ role: 'USER' })

      const response = await request(app)
        .get('/api/admin/users')
        .set('Authorization', `Bearer ${userToken}`)
        .expect(403)

      expect(response.body.error.code).toBe('FORBIDDEN')
    })

    it("prevents users from accessing other users' data", async () => {
      const user1Token = await createUserToken({ userId: 'user-1' })

      const response = await request(app)
        .get('/api/users/user-2/profile')
        .set('Authorization', `Bearer ${user1Token}`)
        .expect(403)
    })
  })

  describe('Input Validation Security', () => {
    it('prevents XSS in user-generated content', async () => {
      const maliciousScript = '<script>alert("xss")</script>'
      const userToken = await createUserToken()

      const response = await request(app)
        .post('/api/posts')
        .set('Authorization', `Bearer ${userToken}`)
        .send({
          title: 'Test Post',
          content: maliciousScript,
        })
        .expect(201)

      // Content should be sanitized
      expect(response.body.data.content).not.toContain('<script>')
      expect(response.body.data.content).toContain('&lt;script&gt;')
    })
  })
})
```

## 📊 Performance Testing

### Load Testing Patterns

```typescript
// ✅ Performance testing with k6
import http from 'k6/http'
import { check, sleep } from 'k6'
import { Rate } from 'k6/metrics'

// Performance test configuration
export const options = {
  stages: [
    { duration: '2m', target: 10 }, // Ramp up
    { duration: '5m', target: 50 }, // Stay at 50 users
    { duration: '2m', target: 100 }, // Ramp up to 100
    { duration: '5m', target: 100 }, // Stay at 100
    { duration: '2m', target: 0 }, // Ramp down
  ],
  thresholds: {
    http_req_duration: ['p(95)<500'], // 95% of requests under 500ms
    http_req_failed: ['rate<0.01'], // Error rate under 1%
  },
}

const errorRate = new Rate('errors')

export default function () {
  // Login
  const loginResponse = http.post('http://localhost:3000/api/auth/login', {
    email: 'test@example.com',
    password: 'password123',
  })

  check(loginResponse, {
    'login status is 200': r => r.status === 200,
    'login response time < 200ms': r => r.timings.duration < 200,
  }) || errorRate.add(1)

  const authToken = loginResponse.json('token')

  // API requests with authentication
  const headers = { Authorization: `Bearer ${authToken}` }

  // Get user profile
  const profileResponse = http.get('http://localhost:3000/api/user/profile', { headers })
  check(profileResponse, {
    'profile status is 200': r => r.status === 200,
    'profile response time < 100ms': r => r.timings.duration < 100,
  }) || errorRate.add(1)

  // Get posts list
  const postsResponse = http.get('http://localhost:3000/api/posts?page=1&limit=20', { headers })
  check(postsResponse, {
    'posts status is 200': r => r.status === 200,
    'posts response time < 300ms': r => r.timings.duration < 300,
  }) || errorRate.add(1)

  sleep(1)
}
```

## 🔗 Related Concepts

- **[Testing Philosophy](testing-philosophy.md)** - Testing principles and mindset
- **[Test Pyramid](test-pyramid.md)** - Testing strategy structure
- **[Coverage Strategy](coverage-strategy.md)** - Code coverage approach

## 📏 Implementation Guidelines

1. **Comprehensive Coverage**: Implement all testing types systematically
2. **Appropriate Tools**: Use the right tool for each testing type
3. **Test Organization**: Structure tests by type and purpose
4. **Automation Priority**: Automate tests based on ROI and criticality
5. **Performance Consideration**: Balance test coverage with execution time
6. **Maintenance**: Keep tests maintainable and up-to-date
7. **Documentation**: Document testing patterns and conventions
8. **Integration**: Integrate all testing types into CI/CD pipeline

---

_Testing Types provide a comprehensive taxonomy and implementation patterns for all types of testing, ensuring thorough coverage and quality assurance across the entire application stack._

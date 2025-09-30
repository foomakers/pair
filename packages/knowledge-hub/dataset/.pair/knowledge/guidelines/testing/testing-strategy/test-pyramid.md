# 🏗️ Test Pyramid

**Focus**: Strategic testing structure for optimal coverage and efficiency

Comprehensive implementation of the test pyramid strategy, balancing test types for maximum confidence with optimal execution time and maintenance overhead.

## 🎯 Test Pyramid Structure

### Pyramid Layers

```typescript
// ✅ Test pyramid architecture
interface TestPyramid {
  // Foundation layer - Fast, isolated, numerous
  unit: {
    percentage: '70%'
    characteristics: [
      'Fast execution (< 1s)',
      'Isolated and independent',
      'High code coverage',
      'Easy to debug',
      'Cheap to maintain',
    ]
    types: [
      'Pure function tests',
      'Component unit tests',
      'Service unit tests',
      'Utility function tests',
    ]
  }

  // Middle layer - Moderate speed, integration focused
  integration: {
    percentage: '20%'
    characteristics: [
      'Moderate execution time (1-10s)',
      'Test component interactions',
      'Realistic data flow',
      'API contract verification',
    ]
    types: [
      'API integration tests',
      'Database integration tests',
      'Service integration tests',
      'Component integration tests',
    ]
  }

  // Top layer - Slow, end-to-end, critical paths
  e2e: {
    percentage: '10%'
    characteristics: [
      'Slower execution (10s+)',
      'Full user journey testing',
      'Real environment testing',
      'High confidence validation',
    ]
    types: [
      'Critical user flows',
      'Cross-browser testing',
      'Mobile responsiveness',
      'Performance validation',
    ]
  }
}

// ✅ Supporting test types (outside pyramid)
interface SupportingTests {
  // Manual testing for human judgment
  manual: {
    exploratory: 'User experience exploration'
    usability: 'Interface and workflow validation'
    accessibility: 'Screen reader and keyboard navigation'
    security: 'Penetration testing and vulnerability assessment'
  }

  // Specialized testing
  specialized: {
    performance: 'Load testing and stress testing'
    security: 'Automated security scanning'
    visual: 'UI regression testing'
    contract: 'API contract testing'
  }
}
```

## 🧪 Unit Testing Layer (70%)

### Implementation Patterns

```typescript
// ✅ Unit testing best practices
export class UnitTestingStrategy {
  /**
   * Pure function testing - Foundation of unit tests
   */
  testPureFunctions(): void {
    // Example: Testing utility functions
    describe('calculateTax', () => {
      it('calculates tax correctly for standard rate', () => {
        const result = calculateTax(100, 0.08)
        expect(result).toBe(8)
      })

      it('handles zero amount', () => {
        const result = calculateTax(0, 0.08)
        expect(result).toBe(0)
      })

      it('handles zero tax rate', () => {
        const result = calculateTax(100, 0)
        expect(result).toBe(0)
      })

      it('rounds to 2 decimal places', () => {
        const result = calculateTax(33.33, 0.08)
        expect(result).toBe(2.67)
      })
    })
  }

  /**
   * Component unit testing with isolation
   */
  testComponentsInIsolation(): void {
    // Example: React component unit test
    describe('UserCard Component', () => {
      const mockUser = {
        id: '1',
        name: 'John Doe',
        email: 'john@example.com',
        avatar: 'https://example.com/avatar.jpg',
      }

      it('renders user information correctly', () => {
        render(<UserCard user={mockUser} />)

        expect(screen.getByText('John Doe')).toBeInTheDocument()
        expect(screen.getByText('john@example.com')).toBeInTheDocument()
        expect(screen.getByRole('img')).toHaveAttribute('src', mockUser.avatar)
      })

      it('calls onEdit when edit button is clicked', async () => {
        const mockOnEdit = vi.fn()
        const user = userEvent.setup()

        render(<UserCard user={mockUser} onEdit={mockOnEdit} />)

        await user.click(screen.getByRole('button', { name: /edit/i }))

        expect(mockOnEdit).toHaveBeenCalledWith(mockUser.id)
      })

      it('handles missing avatar gracefully', () => {
        const userWithoutAvatar = { ...mockUser, avatar: null }

        render(<UserCard user={userWithoutAvatar} />)

        expect(screen.getByRole('img')).toHaveAttribute('src', '/default-avatar.png')
      })
    })
  }

  /**
   * Service layer unit testing with mocking
   */
  testServiceLayerWithMocks(): void {
    // Example: Service unit test
    describe('UserService', () => {
      let userService: UserService
      let mockUserRepository: MockUserRepository

      beforeEach(() => {
        mockUserRepository = createMockUserRepository()
        userService = new UserService(mockUserRepository)
      })

      it('creates user with hashed password', async () => {
        const userData = {
          name: 'John Doe',
          email: 'john@example.com',
          password: 'plaintext-password',
        }

        mockUserRepository.create.mockResolvedValue({
          id: '1',
          ...userData,
          passwordHash: 'hashed-password',
        })

        const result = await userService.createUser(userData)

        expect(mockUserRepository.create).toHaveBeenCalledWith({
          name: userData.name,
          email: userData.email,
          passwordHash: expect.any(String),
        })
        expect(result.password).toBeUndefined() // Ensure password not returned
      })

      it('throws error for duplicate email', async () => {
        const userData = {
          name: 'John Doe',
          email: 'existing@example.com',
          password: 'password',
        }

        mockUserRepository.create.mockRejectedValue(new ConflictError('Email already exists'))

        await expect(userService.createUser(userData)).rejects.toThrow(ConflictError)
      })
    })
  }
}

// ✅ Unit test configuration
const unitTestConfig = {
  // Test execution settings
  timeout: 5000, // 5 seconds max for unit tests
  concurrent: true, // Run tests in parallel
  isolate: true, // Isolate test environment

  // Coverage requirements
  coverage: {
    statements: 90,
    branches: 85,
    functions: 90,
    lines: 90,
  },

  // Mock configuration
  mocking: {
    clearMocks: true, // Clear mocks between tests
    resetMocks: true, // Reset mock state
    restoreMocks: true, // Restore original implementations
  },
}
```

## 🔗 Integration Testing Layer (20%)

### Integration Test Patterns

```typescript
// ✅ Integration testing strategy
export class IntegrationTestingStrategy {
  /**
   * API integration testing
   */
  testAPIIntegration(): void {
    describe('User API Integration', () => {
      let testServer: TestServer
      let testDatabase: TestDatabase

      beforeAll(async () => {
        testDatabase = await createTestDatabase()
        testServer = await createTestServer(testDatabase)
      })

      afterAll(async () => {
        await testServer.close()
        await testDatabase.cleanup()
      })

      beforeEach(async () => {
        await testDatabase.reset()
      })

      it('creates user through complete flow', async () => {
        // Test the complete flow from API to database
        const userData = {
          name: 'Integration Test User',
          email: 'integration@example.com',
          password: 'SecurePassword123!',
        }

        const response = await request(testServer.app).post('/api/users').send(userData).expect(201)

        // Verify API response
        expect(response.body).toMatchObject({
          success: true,
          data: {
            id: expect.any(String),
            name: userData.name,
            email: userData.email,
            createdAt: expect.any(String),
          },
        })

        // Verify data persisted in database
        const savedUser = await testDatabase.users.findById(response.body.data.id)
        expect(savedUser).toBeTruthy()
        expect(savedUser.email).toBe(userData.email)
        expect(savedUser.passwordHash).not.toBe(userData.password) // Hashed
      })

      it('handles validation errors correctly', async () => {
        const invalidUserData = {
          name: '', // Invalid - empty name
          email: 'invalid-email', // Invalid - malformed email
          password: '123', // Invalid - too short
        }

        const response = await request(testServer.app)
          .post('/api/users')
          .send(invalidUserData)
          .expect(400)

        expect(response.body).toMatchObject({
          success: false,
          error: {
            code: 'VALIDATION_ERROR',
            details: expect.arrayContaining([
              expect.objectContaining({ field: 'name' }),
              expect.objectContaining({ field: 'email' }),
              expect.objectContaining({ field: 'password' }),
            ]),
          },
        })
      })
    })
  }

  /**
   * Database integration testing
   */
  testDatabaseIntegration(): void {
    describe('User Repository Integration', () => {
      let repository: UserRepository
      let testDatabase: TestDatabase

      beforeAll(async () => {
        testDatabase = await createTestDatabase()
        repository = new UserRepository(testDatabase.client)
      })

      afterAll(async () => {
        await testDatabase.cleanup()
      })

      beforeEach(async () => {
        await testDatabase.reset()
      })

      it('creates user with profile relationship', async () => {
        const userData = {
          name: 'Test User',
          email: 'test@example.com',
          passwordHash: 'hashed-password',
          profile: {
            bio: 'Test bio',
            website: 'https://example.com',
          },
        }

        const user = await repository.createWithProfile(userData)

        expect(user).toMatchObject({
          id: expect.any(String),
          name: userData.name,
          email: userData.email,
          profile: {
            bio: userData.profile.bio,
            website: userData.profile.website,
          },
        })

        // Verify foreign key relationship
        const profileCount = await testDatabase.query(
          'SELECT COUNT(*) FROM user_profiles WHERE user_id = ?',
          [user.id],
        )
        expect(profileCount[0].count).toBe(1)
      })

      it('handles transaction rollback on error', async () => {
        const userData = {
          name: 'Test User',
          email: 'test@example.com',
          passwordHash: 'hashed-password',
          profile: {
            bio: 'x'.repeat(1001), // Exceeds database limit
          },
        }

        await expect(repository.createWithProfile(userData)).rejects.toThrow()

        // Verify no partial data was saved
        const userCount = await testDatabase.query('SELECT COUNT(*) FROM users WHERE email = ?', [
          userData.email,
        ])
        expect(userCount[0].count).toBe(0)
      })
    })
  }

  /**
   * Service integration testing
   */
  testServiceIntegration(): void {
    describe('User Service Integration', () => {
      let userService: UserService
      let emailService: EmailService
      let testSetup: IntegrationTestSetup

      beforeAll(async () => {
        testSetup = await createIntegrationTestSetup()
        userService = testSetup.services.userService
        emailService = testSetup.services.emailService
      })

      afterAll(async () => {
        await testSetup.cleanup()
      })

      it('completes user registration with email verification', async () => {
        const userData = {
          name: 'Integration User',
          email: 'integration@example.com',
          password: 'SecurePassword123!',
        }

        // Start registration
        const result = await userService.registerUser(userData)

        expect(result).toMatchObject({
          user: {
            id: expect.any(String),
            email: userData.email,
            emailVerified: false,
          },
          verificationToken: expect.any(String),
        })

        // Verify email was sent
        const sentEmails = emailService.getSentEmails()
        expect(sentEmails).toHaveLength(1)
        expect(sentEmails[0]).toMatchObject({
          to: userData.email,
          subject: expect.stringContaining('verification'),
          template: 'email-verification',
        })

        // Complete verification
        const verificationResult = await userService.verifyEmail(result.verificationToken)

        expect(verificationResult.success).toBe(true)
        expect(verificationResult.user.emailVerified).toBe(true)
      })
    })
  }
}
```

## 🌐 E2E Testing Layer (10%)

### End-to-End Test Strategy

```typescript
// ✅ E2E testing approach
export class E2ETestingStrategy {
  /**
   * Critical user journey testing
   */
  testCriticalUserJourneys(): void {
    test.describe('User Registration and Login Journey', () => {
      test('complete user onboarding flow', async ({ page }) => {
        // 1. Navigate to registration
        await page.goto('/register')
        await expect(page.locator('h1')).toContainText('Create Account')

        // 2. Fill registration form
        await page.fill('[data-testid="name-input"]', 'E2E Test User')
        await page.fill('[data-testid="email-input"]', 'e2e-test@example.com')
        await page.fill('[data-testid="password-input"]', 'SecurePassword123!')
        await page.fill('[data-testid="confirm-password-input"]', 'SecurePassword123!')

        // 3. Submit registration
        await page.click('[data-testid="register-button"]')

        // 4. Verify email verification page
        await expect(page).toHaveURL(/verify-email/)
        await expect(page.locator('[data-testid="verification-message"]')).toContainText(
          'Check your email',
        )

        // 5. Simulate email verification (in real test, would check email)
        await page.goto('/verify-email?token=test-verification-token')

        // 6. Complete profile setup
        await expect(page).toHaveURL(/profile\/setup/)
        await page.fill('[data-testid="bio-input"]', 'E2E Test Bio')
        await page.selectOption('[data-testid="country-select"]', 'US')
        await page.click('[data-testid="complete-setup-button"]')

        // 7. Verify successful onboarding
        await expect(page).toHaveURL('/dashboard')
        await expect(page.locator('[data-testid="welcome-message"]')).toContainText(
          'Welcome, E2E Test User',
        )

        // 8. Test logout
        await page.click('[data-testid="user-menu"]')
        await page.click('[data-testid="logout-button"]')
        await expect(page).toHaveURL('/')

        // 9. Test login with created account
        await page.goto('/login')
        await page.fill('[data-testid="email-input"]', 'e2e-test@example.com')
        await page.fill('[data-testid="password-input"]', 'SecurePassword123!')
        await page.click('[data-testid="login-button"]')

        // 10. Verify successful login
        await expect(page).toHaveURL('/dashboard')
        await expect(page.locator('[data-testid="user-menu"]')).toBeVisible()
      })
    })
  }

  /**
   * Cross-browser compatibility testing
   */
  testCrossBrowserCompatibility(): void {
    for (const browserName of ['chromium', 'firefox', 'webkit']) {
      test.describe(`${browserName} compatibility`, () => {
        test(`core functionality works in ${browserName}`, async ({ browser }) => {
          const page = await browser.newPage()

          // Test critical functionality across browsers
          await page.goto('/dashboard')

          // Test responsive design
          await page.setViewportSize({ width: 375, height: 667 }) // Mobile
          await expect(page.locator('[data-testid="mobile-menu"]')).toBeVisible()

          await page.setViewportSize({ width: 1200, height: 800 }) // Desktop
          await expect(page.locator('[data-testid="desktop-nav"]')).toBeVisible()

          await page.close()
        })
      })
    }
  }

  /**
   * Performance and accessibility validation
   */
  testPerformanceAndAccessibility(): void {
    test.describe('Performance and Accessibility', () => {
      test('meets performance benchmarks', async ({ page }) => {
        // Start performance monitoring
        await page.goto('/dashboard', { waitUntil: 'networkidle' })

        // Check Core Web Vitals
        const metrics = await page.evaluate(() => ({
          lcp: performance.getEntriesByType('largest-contentful-paint')[0]?.startTime,
          fid: performance.getEntriesByType('first-input')[0]?.processingStart,
          cls: performance
            .getEntriesByType('layout-shift')
            .reduce((sum, entry) => sum + entry.value, 0),
        }))

        // Verify performance thresholds
        expect(metrics.lcp).toBeLessThan(2500) // LCP < 2.5s
        expect(metrics.cls).toBeLessThan(0.1) // CLS < 0.1
      })

      test('meets accessibility standards', async ({ page }) => {
        await page.goto('/dashboard')

        // Test keyboard navigation
        await page.keyboard.press('Tab')
        const focusedElement = await page.locator(':focus')
        await expect(focusedElement).toBeVisible()

        // Test screen reader compatibility
        const headings = await page.locator('h1, h2, h3, h4, h5, h6').all()
        expect(headings.length).toBeGreaterThan(0)

        // Test color contrast (would need additional tooling)
        const buttons = await page.locator('button').all()
        for (const button of buttons) {
          await expect(button).toHaveCSS('color', /.+/) // Has color
          await expect(button).toHaveCSS('background-color', /.+/) // Has background
        }
      })
    })
  }
}

// ✅ E2E test configuration
const e2eTestConfig = {
  timeout: 30000, // 30 seconds for E2E tests
  retries: 2, // Retry flaky tests
  workers: 4, // Parallel execution

  // Browser configuration
  browsers: ['chromium', 'firefox', 'webkit'],

  // Test environment
  baseURL: process.env.E2E_BASE_URL || 'http://localhost:3000',

  // Visual testing
  screenshot: 'only-on-failure',
  video: 'retain-on-failure',
  trace: 'retain-on-failure',
}
```

## 📊 Test Pyramid Metrics

### Pyramid Health Monitoring

```typescript
// ✅ Test pyramid metrics
export class TestPyramidMetrics {
  /**
   * Analyze current test distribution
   */
  analyzeTestDistribution(): PyramidHealthReport {
    const testCounts = this.getTestCounts()
    const totalTests = testCounts.unit + testCounts.integration + testCounts.e2e

    const distribution = {
      unit: (testCounts.unit / totalTests) * 100,
      integration: (testCounts.integration / totalTests) * 100,
      e2e: (testCounts.e2e / totalTests) * 100,
    }

    const idealDistribution = { unit: 70, integration: 20, e2e: 10 }

    return {
      current: distribution,
      ideal: idealDistribution,
      deviation: this.calculateDeviation(distribution, idealDistribution),
      recommendations: this.generateRecommendations(distribution),
    }
  }

  /**
   * Calculate test execution efficiency
   */
  calculateExecutionEfficiency(): ExecutionMetrics {
    return {
      totalExecutionTime: this.getTotalExecutionTime(),
      averageTestTime: {
        unit: this.getAverageTestTime('unit'),
        integration: this.getAverageTestTime('integration'),
        e2e: this.getAverageTestTime('e2e'),
      },
      feedbackTime: this.calculateFeedbackTime(),
      parallelizationOpportunities: this.identifyParallelizationOpportunities(),
    }
  }

  /**
   * Generate pyramid optimization recommendations
   */
  generateOptimizationRecommendations(): OptimizationRecommendations {
    const metrics = this.analyzeTestDistribution()
    const efficiency = this.calculateExecutionEfficiency()

    const recommendations = []

    if (metrics.current.unit < 60) {
      recommendations.push({
        type: 'increase-unit-tests',
        priority: 'high',
        description: 'Increase unit test coverage to improve pyramid base',
        actions: [
          'Add unit tests for uncovered utility functions',
          'Break down large integration tests into unit tests',
          'Test business logic in isolation',
        ],
      })
    }

    if (metrics.current.e2e > 15) {
      recommendations.push({
        type: 'reduce-e2e-tests',
        priority: 'medium',
        description: 'Too many E2E tests - move some to integration layer',
        actions: [
          'Convert simple E2E tests to integration tests',
          'Focus E2E tests on critical user journeys only',
          'Use contract testing for API validation',
        ],
      })
    }

    if (efficiency.averageTestTime.unit > 1000) {
      recommendations.push({
        type: 'optimize-unit-test-speed',
        priority: 'medium',
        description: 'Unit tests are too slow',
        actions: [
          'Remove unnecessary async operations',
          'Optimize test setup and teardown',
          'Use test doubles instead of real implementations',
        ],
      })
    }

    return recommendations
  }
}
```

## 🔗 Related Concepts

- **[Testing Types](testing-types.md)** - Detailed implementation of each test type
- **[Testing Philosophy](testing-philosophy.md)** - Underlying principles
- **[Coverage Strategy](coverage-strategy.md)** - Coverage measurement approach

## 📏 Implementation Guidelines

1. **Balanced Distribution**: Maintain 70-20-10 distribution (Unit-Integration-E2E)
2. **Fast Feedback**: Prioritize speed at the unit test level
3. **Comprehensive Coverage**: Ensure each layer serves its purpose
4. **Efficient Execution**: Optimize test execution time and parallelization
5. **Clear Boundaries**: Define clear responsibilities for each layer
6. **Continuous Monitoring**: Track pyramid health and adjust accordingly
7. **Tool Optimization**: Use appropriate tools for each test layer
8. **Team Training**: Ensure team understands pyramid principles

---

_Test Pyramid provides a strategic structure for testing that balances comprehensive coverage with execution efficiency, ensuring high confidence in code quality while maintaining fast feedback cycles and manageable maintenance overhead._

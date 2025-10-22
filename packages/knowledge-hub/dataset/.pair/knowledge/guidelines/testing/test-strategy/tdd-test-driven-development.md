# Test Driven Development (TDD)

## TDD Philosophy and Core Principles

Test Driven Development represents a disciplined approach to software development that emphasizes writing tests before implementation code, creating a feedback loop that guides design decisions while ensuring comprehensive test coverage. TDD philosophy centers on the idea that tests serve as both specification and validation, providing clear requirements while building confidence in code correctness.

The fundamental principle of TDD involves the Red-Green-Refactor cycle where failing tests drive implementation decisions, passing tests confirm correctness, and refactoring improves code quality without changing behavior. This cycle creates a rhythm of development that maintains focus on requirements while encouraging incremental progress and continuous design improvement.

TDD methodology emphasizes the importance of writing the simplest code that makes tests pass, avoiding over-engineering while ensuring that design emerges from actual requirements rather than anticipated needs. This approach leads to cleaner, more focused implementations that directly address specified behaviors without unnecessary complexity.

## Red-Green-Refactor Cycle and Implementation

### Red Phase: Writing Failing Tests

The Red phase focuses on creating tests that capture specific behavior requirements in the smallest possible increments, ensuring that each test addresses a single aspect of functionality while providing clear success criteria. Effective Red phase practice involves understanding the desired behavior thoroughly before attempting implementation.

Test creation during the Red phase should focus on expressing requirements clearly through test code, using descriptive names and assertions that communicate intent to future maintainers. Tests should be specific enough to guide implementation while remaining focused on behavior rather than implementation details.

Failure verification ensures that new tests actually fail for the expected reasons, confirming that tests are properly connected to the code under development and will provide meaningful feedback when implementation is correct. This verification prevents false confidence from tests that pass without proper implementation.

Requirement decomposition within the Red phase involves breaking complex behaviors into small, testable increments that can be implemented quickly while maintaining clear progress toward larger objectives. Effective decomposition balances progress visibility with implementation manageability.

### Green Phase: Making Tests Pass

The Green phase emphasizes implementing the minimum code necessary to make failing tests pass, resisting the temptation to add features or complexity beyond what tests require. This discipline ensures that implementation remains focused on actual requirements while avoiding speculative development.

Implementation strategies during the Green phase should prioritize simplicity and directness, choosing the most straightforward approach that satisfies test requirements. Complex or elegant solutions should be deferred to the refactoring phase, maintaining focus on achieving test success quickly.

### Complete TDD Cycle Example: Building a Shopping Cart

```javascript
// RED PHASE: Write failing test
describe('ShoppingCart', () => {
  test('should start empty', () => {
    const cart = new ShoppingCart()
    expect(cart.getItemCount()).toBe(0)
  })
})

// GREEN PHASE: Simplest implementation
class ShoppingCart {
  getItemCount() {
    return 0
  }
}

// RED PHASE: Next failing test
test('should add item to cart', () => {
  const cart = new ShoppingCart()
  const item = { id: 1, name: 'Book', price: 10.99 }

  cart.addItem(item)

  expect(cart.getItemCount()).toBe(1)
  expect(cart.getItems()).toContain(item)
})

// GREEN PHASE: Extend implementation
class ShoppingCart {
  constructor() {
    this.items = []
  }

  getItemCount() {
    return this.items.length
  }

  addItem(item) {
    this.items.push(item)
  }

  getItems() {
    return this.items
  }
}

// RED PHASE: Add total calculation
test('should calculate total price', () => {
  const cart = new ShoppingCart()
  cart.addItem({ id: 1, name: 'Book', price: 10.99 })
  cart.addItem({ id: 2, name: 'Pen', price: 2.5 })

  expect(cart.getTotal()).toBe(13.49)
})

// GREEN PHASE: Implement total calculation
class ShoppingCart {
  constructor() {
    this.items = []
  }

  getItemCount() {
    return this.items.length
  }

  addItem(item) {
    this.items.push(item)
  }

  getItems() {
    return this.items
  }

  getTotal() {
    return this.items.reduce((sum, item) => sum + item.price, 0)
  }
}

// RED PHASE: Handle quantities
test('should handle item quantities', () => {
  const cart = new ShoppingCart()
  const item = { id: 1, name: 'Book', price: 10.99 }

  cart.addItem(item, 3)

  expect(cart.getItemCount()).toBe(3)
  expect(cart.getTotal()).toBe(32.97)
})

// GREEN PHASE: Implement quantities
class ShoppingCart {
  constructor() {
    this.items = []
  }

  addItem(item, quantity = 1) {
    for (let i = 0; i < quantity; i++) {
      this.items.push(item)
    }
  }

  getItemCount() {
    return this.items.length
  }

  getTotal() {
    return this.items.reduce((sum, item) => sum + item.price, 0)
  }
}

// REFACTOR PHASE: Improve design
class ShoppingCart {
  constructor() {
    this.items = new Map() // Better data structure
  }

  addItem(item, quantity = 1) {
    const currentQuantity = this.items.get(item.id) || 0
    this.items.set(item.id, {
      item,
      quantity: currentQuantity + quantity,
    })
  }

  getItemCount() {
    return Array.from(this.items.values()).reduce((sum, entry) => sum + entry.quantity, 0)
  }

  getTotal() {
    return Array.from(this.items.values()).reduce(
      (sum, entry) => sum + entry.item.price * entry.quantity,
      0,
    )
  }
}
```

Behavior verification involves ensuring that implemented code satisfies test requirements while avoiding implementation of untested functionality. The Green phase should result in code that makes tests pass without introducing additional complexity or features.

Progress validation during the Green phase includes running all tests to ensure that new implementation doesn't break existing functionality while confirming that the development increment is complete and ready for refactoring activities.

### Refactor Phase: Improving Design

The Refactor phase focuses on improving code design, readability, and structure while maintaining all existing test coverage, ensuring that improvements don't inadvertently change system behavior. Refactoring activities should enhance code quality without modifying functionality.

Design improvement activities during refactoring include eliminating duplication, improving naming, extracting methods or classes, and enhancing overall code organization. These improvements should make code easier to understand and modify while maintaining the same external behavior.

Continuous testing during refactoring ensures that design changes don't introduce regression issues, providing confidence that improvements maintain system correctness. Comprehensive test coverage enables aggressive refactoring while maintaining behavior guarantees.

Quality metrics consideration during refactoring includes attention to code complexity, maintainability, and adherence to design principles that support long-term system evolution. Refactoring should improve these metrics while preserving functionality.

## TDD Schools and Methodologies

### Classical TDD (Detroit School)

Classical TDD emphasizes testing state and behavior using real objects wherever possible, avoiding mocks except for external dependencies. This approach prioritizes simple, straightforward tests that verify the actual functionality.

#### Example: User Registration Service (Classical Approach)

```javascript
// Classical TDD - testing with real objects
describe('UserRegistrationService', () => {
  test('should register user and send welcome email', () => {
    const userRepository = new InMemoryUserRepository()
    const emailService = new MockEmailService() // Only mock external dependency
    const service = new UserRegistrationService(userRepository, emailService)

    const userData = { email: 'john@example.com', password: 'password123' }

    const user = service.register(userData)

    expect(user.email).toBe('john@example.com')
    expect(userRepository.findByEmail('john@example.com')).toBeDefined()
    expect(emailService.getSentEmails()).toHaveLength(1)
  })
})
```

### London School (Mockist TDD)

London School TDD emphasizes interaction testing using mocks for all collaborators, focusing on how objects communicate rather than their final state. This approach enables testing in isolation and driving design through interface discovery.

#### Example: Order Processing (London School Approach)

```javascript
// London School - testing interactions with mocks
describe('OrderProcessor', () => {
  test('should process order and send confirmation', () => {
    const paymentGateway = jest.fn().mockResolvedValue({ success: true, transactionId: '123' })
    const inventoryService = jest.fn().mockResolvedValue(true)
    const emailService = jest.fn()
    const orderRepository = jest.fn()

    const processor = new OrderProcessor(
      paymentGateway,
      inventoryService,
      emailService,
      orderRepository
    )

    const order = { items: [{ id: 1, quantity: 2 }], total: 99.99 }

    await processor.process(order)

    expect(paymentGateway).toHaveBeenCalledWith(99.99)
    expect(inventoryService).toHaveBeenCalledWith(order.items)
    expect(orderRepository).toHaveBeenCalledWith(expect.objectContaining(order))
    expect(emailService).toHaveBeenCalledWith(expect.any(String))
  })
})
```

### Acceptance Test-Driven Development (ATDD)

ATDD extends TDD by starting with acceptance criteria that define business value, creating a bridge between business requirements and technical implementation through executable specifications.

#### Example: Bank Transfer Feature (ATDD Approach)

```javascript
// ATDD - Start with business acceptance criteria
describe('Bank Transfer Feature', () => {
  describe('Given user has sufficient balance', () => {
    test('When transferring money, Then balance should be updated', async () => {
      // Arrange - Set up business scenario
      const fromAccount = await createAccount({ balance: 1000 })
      const toAccount = await createAccount({ balance: 500 })

      // Act - Execute business operation
      const transfer = await bankingService.transfer({
        from: fromAccount.id,
        to: toAccount.id,
        amount: 200,
      })

      // Assert - Verify business outcome
      expect(transfer.status).toBe('completed')
      expect(await getAccountBalance(fromAccount.id)).toBe(800)
      expect(await getAccountBalance(toAccount.id)).toBe(700)
    })
  })

  describe('Given user has insufficient balance', () => {
    test('When transferring money, Then transfer should be rejected', async () => {
      const fromAccount = await createAccount({ balance: 100 })
      const toAccount = await createAccount({ balance: 500 })

      await expect(
        bankingService.transfer({
          from: fromAccount.id,
          to: toAccount.id,
          amount: 200,
        }),
      ).rejects.toThrow('Insufficient balance')

      expect(await getAccountBalance(fromAccount.id)).toBe(100)
      expect(await getAccountBalance(toAccount.id)).toBe(500)
    })
  })
})
```

## TDD Implementation Patterns and Techniques

### Test Organization and Structure

Test suite architecture involves organizing tests in ways that support both development feedback and maintenance activities, creating hierarchies that reflect system structure while avoiding duplication and maintaining clear test purposes. Effective organization supports both individual developer workflows and team collaboration.

Test naming conventions should clearly communicate test intent and scope, enabling developers to understand test purposes without examining implementation details. Naming strategies should support both test discovery and maintenance activities while providing meaningful feedback when tests fail.

Setup and teardown patterns ensure that tests run in isolated, predictable environments while minimizing performance overhead and complexity. Effective patterns balance test isolation with execution efficiency, creating reliable test environments without excessive setup overhead.

Test data management strategies focus on creating realistic, maintainable test scenarios while avoiding brittleness from hard-coded data dependencies. Data management should support both test clarity and maintenance efficiency while enabling comprehensive scenario coverage.

### Design Feedback and Code Quality

Design pressure from TDD comes through the difficulty of testing complex or tightly coupled code, providing natural feedback about design quality while encouraging refactoring activities that improve testability and maintainability.

Coupling detection through testing difficulty involves recognizing when tests become complex or require extensive setup as indicators of design problems. This feedback mechanism helps identify areas where design improvements would benefit both testability and overall system quality.

Abstraction guidance from TDD emerges through the process of testing interfaces and behaviors, encouraging creation of appropriate abstractions while avoiding over-engineering. TDD naturally guides developers toward creating interfaces that are both testable and usable.

Quality metric improvement through TDD includes natural increases in test coverage, code clarity, and design simplicity that result from the TDD process. These improvements occur as side effects of the development approach rather than explicit optimization activities.

### Legacy Code and TDD Integration

Legacy code TDD strategies focus on gradually introducing testing discipline to existing codebases while avoiding wholesale rewrites that carry significant risk. These strategies emphasize incremental improvement while maintaining system functionality.

Characterization testing involves creating tests that capture existing system behavior before making changes, providing safety nets for refactoring activities while establishing testing foundations for future development.

Seam identification techniques help locate points in legacy systems where testing can be introduced without extensive modification, enabling incremental testing adoption while maintaining system stability.

Refactoring strategies for legacy code under test focus on making minimal changes that enable better testing while preserving existing functionality. These strategies balance improvement objectives with risk management requirements.

## Advanced TDD Patterns and Scaling

### Property-Based Testing Integration

Property-based testing complements traditional TDD by automatically generating test cases that validate general properties of code behavior, discovering edge cases that might not be identified through example-based testing approaches.

Property identification involves recognizing invariants and general rules that should hold across wide ranges of input values, creating property tests that validate these characteristics while maintaining the TDD development rhythm.

Integration strategies for property-based testing within TDD workflows focus on using properties to supplement example-based tests, providing additional validation while maintaining clear development guidance from specific examples.

Shrinking and debugging property-based test failures involves using framework capabilities to identify minimal failing cases, supporting rapid debugging while maintaining the comprehensive coverage benefits of generated test cases.

### Mutation Testing and TDD

Mutation testing provides validation of test suite quality by introducing artificial defects and verifying that tests detect these problems, offering objective feedback about test effectiveness while identifying gaps in test coverage.

Test quality assessment through mutation testing helps identify tests that pass regardless of implementation correctness, indicating areas where additional assertions or different testing approaches might provide better validation.

Integration patterns for mutation testing within TDD workflows focus on using mutation analysis to validate test suites periodically while maintaining development rhythm and avoiding analysis paralysis from excessive quality metrics.

Improvement strategies based on mutation testing results include identifying specific areas where additional tests would improve defect detection while balancing comprehensive coverage with practical development efficiency.

### Team TDD and Collaboration

Pair programming with TDD involves collaborative development practices where two developers work together through the Red-Green-Refactor cycle, sharing keyboard time while maintaining testing discipline and design focus.

Knowledge sharing patterns in team TDD include practices for ensuring that testing approaches and design insights spread throughout development teams while maintaining individual developer autonomy and creativity.

Code review integration with TDD focuses on reviewing both test and implementation code, ensuring that TDD principles are followed while maintaining code quality standards and sharing testing techniques across team members.

Continuous integration patterns for TDD emphasize rapid feedback from comprehensive test suites while maintaining development velocity and providing clear signals about system health and development progress.

## TDD Anti-patterns and Common Pitfalls

### Test Design Anti-patterns

Fragile tests result from testing implementation details rather than behavior, creating maintenance overhead when refactoring activities break tests that should remain valid as long as behavior is preserved.

Over-mocking involves excessive use of test doubles that isolate code so completely that tests no longer validate realistic system behavior, reducing confidence in test results while increasing test complexity.

Assertion roulette occurs when tests include multiple assertions without clear relationships, making it difficult to understand test failures while reducing the diagnostic value of test results.

Test interdependence creates situations where test success depends on execution order or shared state, reducing test reliability while making it difficult to understand and debug test failures.

### Development Process Anti-patterns

Skipping the Red phase eliminates the verification that tests actually validate implementation correctness, potentially creating tests that provide false confidence while missing actual defects.

Long Green phases involve implementing large amounts of functionality before returning to testing, reducing the design feedback benefits of TDD while increasing the risk of over-engineering and requirement drift.

Avoiding refactoring leads to code quality degradation over time, accumulating technical debt while reducing the long-term benefits of TDD for design improvement and maintainability.

Test-after development disguised as TDD involves writing tests after implementation is complete, missing the design guidance benefits while creating tests that may be biased toward existing implementation approaches.

## Practical TDD Examples and Patterns

### Triangulation Pattern in Practice

Triangulation involves writing multiple test cases to force generalization of the implementation, preventing overly specific solutions that only satisfy a single test case.

```javascript
// First test - specific case
test('should calculate discount for single item', () => {
  const calculator = new DiscountCalculator()
  expect(calculator.calculateDiscount(100)).toBe(10) // 10% discount
})

// Implementation starts specific
class DiscountCalculator {
  calculateDiscount(amount) {
    return 10 // Hard-coded for first test
  }
}

// Second test - forces generalization
test('should calculate discount for different amounts', () => {
  const calculator = new DiscountCalculator()
  expect(calculator.calculateDiscount(200)).toBe(20)
  expect(calculator.calculateDiscount(50)).toBe(5)
})

// Implementation becomes general
class DiscountCalculator {
  calculateDiscount(amount) {
    return amount * 0.1 // 10% discount rate
  }
}

// Third test - business rules emerge
test('should apply minimum discount threshold', () => {
  const calculator = new DiscountCalculator()
  expect(calculator.calculateDiscount(20)).toBe(0) // Below $25 threshold
  expect(calculator.calculateDiscount(30)).toBe(3)
})

// Final implementation with business logic
class DiscountCalculator {
  calculateDiscount(amount) {
    if (amount < 25) return 0
    return amount * 0.1
  }
}
```

### Fake It Till You Make It Pattern

Start with the simplest possible implementation, even if it's "fake," then gradually make it more real as more tests are added.

```javascript
// Test 1: Start simple
test('should validate email format', () => {
  const validator = new EmailValidator()
  expect(validator.isValid('test@example.com')).toBe(true)
})

// Fake implementation
class EmailValidator {
  isValid(email) {
    return true // Fake it completely!
  }
}

// Test 2: Force some reality
test('should reject invalid email', () => {
  const validator = new EmailValidator()
  expect(validator.isValid('invalid-email')).toBe(false)
})

// Still mostly fake
class EmailValidator {
  isValid(email) {
    if (email === 'invalid-email') return false
    return true
  }
}

// Test 3: Force pattern recognition
test('should validate basic email patterns', () => {
  const validator = new EmailValidator()
  expect(validator.isValid('user@domain.com')).toBe(true)
  expect(validator.isValid('@domain.com')).toBe(false)
  expect(validator.isValid('user@')).toBe(false)
  expect(validator.isValid('user.domain')).toBe(false)
})

// Real implementation emerges
class EmailValidator {
  isValid(email) {
    return (
      email.includes('@') &&
      email.indexOf('@') > 0 &&
      email.indexOf('@') < email.length - 1 &&
      email.includes('.')
    )
  }
}
```

### Test Data Builders for Complex Scenarios

```javascript
// Builder pattern for complex test data
class OrderBuilder {
  constructor() {
    this.orderData = {
      id: 'ORDER-001',
      customer: { id: 1, name: 'John Doe', email: 'john@example.com' },
      items: [],
      status: 'pending',
      shippingAddress: {
        street: '123 Main St',
        city: 'Anytown',
        country: 'USA',
      },
      paymentMethod: 'credit_card',
    }
  }

  withCustomer(customer) {
    this.orderData.customer = customer
    return this
  }

  withItems(...items) {
    this.orderData.items = items
    return this
  }

  asCompleted() {
    this.orderData.status = 'completed'
    return this
  }

  withInternationalShipping() {
    this.orderData.shippingAddress.country = 'UK'
    return this
  }

  withPayPal() {
    this.orderData.paymentMethod = 'paypal'
    return this
  }

  build() {
    return new Order(this.orderData)
  }
}

// Usage in tests becomes very readable
describe('OrderProcessor', () => {
  test('should calculate international shipping', () => {
    const order = new OrderBuilder()
      .withItems({ id: 1, name: 'Book', price: 19.99 }, { id: 2, name: 'Pen', price: 4.99 })
      .withInternationalShipping()
      .build()

    const processor = new OrderProcessor()
    const total = processor.calculateTotal(order)

    expect(total.shipping).toBe(15.0) // International shipping fee
    expect(total.subtotal).toBe(24.98)
    expect(total.total).toBe(39.98)
  })

  test('should handle PayPal payment processing', () => {
    const order = new OrderBuilder()
      .withPayPal()
      .withItems({ id: 1, name: 'Book', price: 19.99 })
      .build()

    const processor = new OrderProcessor()
    const result = processor.processPayment(order)

    expect(result.paymentGateway).toBe('paypal')
    expect(result.fees).toBe(0.89) // PayPal fee calculation
  })
})
```

### Parameterized Tests for Edge Cases

```javascript
// Testing multiple scenarios efficiently
describe('Password Strength Validator', () => {
  test.each([
    // [password, expectedStrength, expectedScore, reason]
    ['12345678', 'weak', 1, 'only numbers'],
    ['password', 'weak', 1, 'common word, no variety'],
    ['Password', 'weak', 2, 'common word with capitalization'],
    ['Password1', 'medium', 3, 'common word with number'],
    ['Password1!', 'medium', 4, 'good variety but common base'],
    ['Tr0ub4dor&3', 'strong', 5, 'complex with special chars'],
    ['correct horse battery staple', 'strong', 5, 'long passphrase'],
    ['', 'invalid', 0, 'empty password'],
    ['1234', 'weak', 1, 'too short'],
  ])(
    'should rate "%s" as %s (score: %d) - %s',
    (password, expectedStrength, expectedScore, reason) => {
      const validator = new PasswordValidator()

      const result = validator.evaluate(password)

      expect(result.strength).toBe(expectedStrength)
      expect(result.score).toBe(expectedScore)
    },
  )

  // Specific business rule tests
  test('should enforce minimum length for corporate policy', () => {
    const validator = new PasswordValidator({ minLength: 12 })

    const result = validator.evaluate('Strong1!')

    expect(result.strength).toBe('weak')
    expect(result.errors).toContain('Password must be at least 12 characters')
  })
})
```

### Outside-In TDD Example: REST API Endpoint

```javascript
// Start with acceptance test (outside)
describe('User Registration API', () => {
  test('POST /api/users should register new user', async () => {
    const userData = {
      email: 'newuser@example.com',
      password: 'SecurePass123!',
      name: 'New User',
    }

    const response = await request(app).post('/api/users').send(userData).expect(201)

    expect(response.body).toMatchObject({
      id: expect.any(Number),
      email: 'newuser@example.com',
      name: 'New User',
    })
    expect(response.body.password).toBeUndefined()
  })
})

// Drive inward to controller
describe('UserController', () => {
  test('should create user via service', async () => {
    const userService = {
      createUser: jest.fn().mockResolvedValue({
        id: 1,
        email: 'test@example.com',
        name: 'Test User',
      }),
    }

    const controller = new UserController(userService)
    const req = {
      body: {
        email: 'test@example.com',
        password: 'password123',
        name: 'Test User',
      },
    }
    const res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn(),
    }

    await controller.createUser(req, res)

    expect(userService.createUser).toHaveBeenCalledWith(req.body)
    expect(res.status).toHaveBeenCalledWith(201)
  })
})

// Drive inward to service
describe('UserService', () => {
  test('should hash password before saving', async () => {
    const repository = {
      save: jest.fn().mockResolvedValue({ id: 1 }),
    }
    const hasher = {
      hash: jest.fn().mockResolvedValue('hashed_password'),
    }

    const service = new UserService(repository, hasher)

    await service.createUser({
      email: 'test@example.com',
      password: 'plain_password',
      name: 'Test',
    })

    expect(hasher.hash).toHaveBeenCalledWith('plain_password')
    expect(repository.save).toHaveBeenCalledWith({
      email: 'test@example.com',
      password: 'hashed_password',
      name: 'Test',
    })
  })
})
```

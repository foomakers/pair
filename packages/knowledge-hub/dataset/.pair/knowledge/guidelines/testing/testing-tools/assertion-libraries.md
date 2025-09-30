# ✅ Assertion Libraries

**Focus**: Assertion utilities, custom matchers, and expressive test validation

Guidelines for leveraging assertion libraries to create clear, maintainable test assertions with comprehensive validation capabilities and excellent error reporting.

## 🎯 Assertion System Architecture

### Assertion Library Management System

````typescript
// ✅ Comprehensive assertion library and custom matcher system
class AssertionLibraryManager {
  private matcherRegistry: MatcherRegistry
  private assertionEngine: AssertionEngine
  private errorFormatter: ErrorFormatter
  private typeValidator: TypeValidator
  private customMatcherFactory: CustomMatcherFactory
  private reportingSystem: AssertionReportingSystem

  constructor() {
    this.matcherRegistry = new MatcherRegistry()
    this.assertionEngine = new AssertionEngine()
    this.errorFormatter = new ErrorFormatter()
    this.typeValidator = new TypeValidator()
    this.customMatcherFactory = new CustomMatcherFactory()
    this.reportingSystem = new AssertionReportingSystem()
  }

  /**
   * Configure assertion library with custom matchers and utilities
   *
   * @example
   * ```typescript
   * const assertionManager = new AssertionLibraryManager();
   *
   * const config = await assertionManager.configureAssertions({
   *   library: 'vitest',
   *   customMatchers: ['toBeValidEmail', 'toMatchApiResponse'],
   *   domainMatchers: ['user', 'product', 'order'],
   *   errorReporting: 'detailed',
   *   typeChecking: 'strict'
   * });
   *
   * const matcher = await assertionManager.createMatcher('toBeValidUser');
   * ```
   */
  async configureAssertions(configuration: AssertionConfiguration): Promise<AssertionSetup> {
    try {
      // Setup base assertion library
      const baseLibrary = await this.setupBaseLibrary(configuration.library)

      // Register custom matchers
      const customMatchers = await this.registerCustomMatchers(configuration.customMatchers)

      // Create domain-specific matchers
      const domainMatchers = await this.createDomainMatchers(configuration.domainMatchers)

      // Configure error formatting
      const errorFormatting = await this.configureErrorFormatting(configuration.errorReporting)

      // Setup type validation
      const typeValidation = await this.setupTypeValidation(configuration.typeChecking)

      // Create assertion utilities
      const utilities = await this.createAssertionUtilities(configuration)

      return {
        baseLibrary,
        customMatchers,
        domainMatchers,
        errorFormatting,
        typeValidation,
        utilities,
        configuration,
        status: 'configured',
      }
    } catch (error) {
      throw new AssertionError(`Failed to configure assertions: ${error.message}`, {
        configuration,
        error,
      })
    }
  }

  /**
   * Create custom matcher with comprehensive validation
   */
  async createMatcher<T = any>(matcherDefinition: MatcherDefinition<T>): Promise<CustomMatcher<T>> {
    try {
      // Validate matcher definition
      await this.validateMatcherDefinition(matcherDefinition)

      // Create matcher implementation
      const implementation = await this.customMatcherFactory.createImplementation(matcherDefinition)

      // Generate type definitions
      const typeDefinitions = await this.generateTypeDefinitions(matcherDefinition)

      // Create error messages
      const errorMessages = await this.createErrorMessages(matcherDefinition)

      // Register with matcher registry
      await this.matcherRegistry.register(matcherDefinition.name, implementation)

      return {
        name: matcherDefinition.name,
        implementation,
        typeDefinitions,
        errorMessages,
        documentation: await this.generateMatcherDocumentation(matcherDefinition),
        examples: await this.generateMatcherExamples(matcherDefinition),
      }
    } catch (error) {
      throw new AssertionError(`Failed to create matcher: ${error.message}`, {
        matcherDefinition,
        error,
      })
    }
  }

  /**
   * Setup domain-specific assertion patterns
   */
  async createDomainMatchers(domains: string[]): Promise<DomainMatcherCollection> {
    const collections: DomainMatcherCollection = {}

    for (const domain of domains) {
      collections[domain] = await this.createDomainSpecificMatchers(domain)
    }

    return collections
  }

  /**
   * Create domain-specific matchers for a particular domain
   */
  private async createDomainSpecificMatchers(domain: string): Promise<DomainMatcher[]> {
    const matchers: DomainMatcher[] = []

    switch (domain) {
      case 'user':
        matchers.push(...(await this.createUserMatchers()))
        break
      case 'product':
        matchers.push(...(await this.createProductMatchers()))
        break
      case 'order':
        matchers.push(...(await this.createOrderMatchers()))
        break
      case 'api':
        matchers.push(...(await this.createApiMatchers()))
        break
      default:
        matchers.push(...(await this.createGenericDomainMatchers(domain)))
    }

    return matchers
  }

  /**
   * Create user domain matchers
   */
  private async createUserMatchers(): Promise<DomainMatcher[]> {
    return [
      {
        name: 'toBeValidUser',
        domain: 'user',
        description: 'Validates user object structure and properties',
        implementation: (received: any) => {
          const pass = this.validateUserObject(received)
          return {
            pass,
            message: () =>
              pass
                ? `Expected ${received} not to be a valid user`
                : `Expected ${received} to be a valid user with required properties: id, email, name`,
          }
        },
        schema: {
          id: 'string|number',
          email: 'email',
          name: 'string',
          createdAt: 'date',
        },
      },
      {
        name: 'toHaveValidEmail',
        domain: 'user',
        description: 'Validates email format and domain',
        implementation: (received: any) => {
          const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
          const pass = typeof received === 'string' && emailRegex.test(received)
          return {
            pass,
            message: () =>
              pass
                ? `Expected ${received} not to be a valid email`
                : `Expected ${received} to be a valid email format`,
          }
        },
      },
      {
        name: 'toHaveUserPermissions',
        domain: 'user',
        description: 'Validates user permissions array',
        implementation: (received: any, expectedPermissions: string[]) => {
          const userPermissions = received?.permissions || []
          const hasAllPermissions = expectedPermissions.every(permission =>
            userPermissions.includes(permission),
          )
          return {
            pass: hasAllPermissions,
            message: () =>
              hasAllPermissions
                ? `Expected user not to have permissions: ${expectedPermissions.join(', ')}`
                : `Expected user to have permissions: ${expectedPermissions.join(
                    ', ',
                  )}, but missing: ${expectedPermissions
                    .filter(p => !userPermissions.includes(p))
                    .join(', ')}`,
          }
        },
      },
    ]
  }

  /**
   * Create API domain matchers
   */
  private async createApiMatchers(): Promise<DomainMatcher[]> {
    return [
      {
        name: 'toBeSuccessfulResponse',
        domain: 'api',
        description: 'Validates successful API response structure',
        implementation: (received: any) => {
          const pass =
            received?.status >= 200 && received?.status < 300 && received?.data !== undefined
          return {
            pass,
            message: () =>
              pass
                ? `Expected response not to be successful`
                : `Expected response to have status 2xx and data property, got status: ${received?.status}`,
          }
        },
      },
      {
        name: 'toMatchApiSchema',
        domain: 'api',
        description: 'Validates API response against schema',
        implementation: (received: any, schema: object) => {
          const validation = this.typeValidator.validate(received, schema)
          return {
            pass: validation.valid,
            message: () =>
              validation.valid
                ? `Expected response not to match schema`
                : `Expected response to match schema. Errors: ${validation.errors.join(', ')}`,
          }
        },
      },
      {
        name: 'toHaveCorrectPagination',
        domain: 'api',
        description: 'Validates pagination metadata in API response',
        implementation: (received: any) => {
          const pagination = received?.pagination
          const hasRequiredFields =
            pagination &&
            typeof pagination.page === 'number' &&
            typeof pagination.limit === 'number' &&
            typeof pagination.total === 'number'

          return {
            pass: hasRequiredFields,
            message: () =>
              hasRequiredFields
                ? `Expected response not to have correct pagination`
                : `Expected response to have pagination with page, limit, and total properties`,
          }
        },
      },
    ]
  }
}

/**
 * Advanced Assertion Patterns
 */

// Async assertion utilities
export const asyncAssertions = {
  /**
   * Assert that a promise resolves within timeout
   */
  async toResolveWithin<T>(promise: Promise<T>, timeout: number): Promise<T> {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        reject(new AssertionError(`Promise did not resolve within ${timeout}ms`))
      }, timeout)

      promise
        .then(result => {
          clearTimeout(timer)
          resolve(result)
        })
        .catch(error => {
          clearTimeout(timer)
          reject(error)
        })
    })
  },

  /**
   * Assert that a promise rejects with specific error
   */
  async toRejectWith(promise: Promise<any>, expectedError: string | RegExp | Error): Promise<void> {
    try {
      await promise
      throw new AssertionError('Expected promise to reject, but it resolved')
    } catch (error) {
      if (typeof expectedError === 'string') {
        if (!error.message.includes(expectedError)) {
          throw new AssertionError(
            `Expected error message to include "${expectedError}", got: ${error.message}`,
          )
        }
      } else if (expectedError instanceof RegExp) {
        if (!expectedError.test(error.message)) {
          throw new AssertionError(
            `Expected error message to match ${expectedError}, got: ${error.message}`,
          )
        }
      } else if (expectedError instanceof Error) {
        if (error.constructor !== expectedError.constructor) {
          throw new AssertionError(
            `Expected error type ${expectedError.constructor.name}, got: ${error.constructor.name}`,
          )
        }
      }
    }
  },

  /**
   * Assert that multiple promises resolve in order
   */
  async toResolveInOrder(promises: Promise<any>[]): Promise<any[]> {
    const startTimes = promises.map(() => Date.now())
    const results = await Promise.all(promises)
    const endTimes = promises.map(() => Date.now())

    // Verify order by checking completion times
    for (let i = 1; i < endTimes.length; i++) {
      if (endTimes[i] < endTimes[i - 1]) {
        throw new AssertionError(
          `Promise ${i} resolved before promise ${i - 1}, expected sequential resolution`,
        )
      }
    }

    return results
  },
}

// Deep object comparison utilities
export const objectAssertions = {
  /**
   * Deep equality with type checking
   */
  toDeepEqual(received: any, expected: any, options: DeepEqualOptions = {}): boolean {
    return this.deepCompare(received, expected, options, new Set())
  },

  /**
   * Partial object matching
   */
  toMatchObject(received: any, expected: any): boolean {
    if (typeof expected !== 'object' || expected === null) {
      return received === expected
    }

    if (typeof received !== 'object' || received === null) {
      return false
    }

    for (const key in expected) {
      if (!(key in received)) {
        return false
      }

      if (!this.toMatchObject(received[key], expected[key])) {
        return false
      }
    }

    return true
  },

  /**
   * Check if object has nested property path
   */
  toHaveNestedProperty(received: any, path: string, expectedValue?: any): boolean {
    const properties = path.split('.')
    let current = received

    for (const property of properties) {
      if (current === null || current === undefined || !(property in current)) {
        return false
      }
      current = current[property]
    }

    if (expectedValue !== undefined) {
      return current === expectedValue
    }

    return true
  },

  deepCompare(a: any, b: any, options: DeepEqualOptions, visited: Set<any>): boolean {
    // Handle circular references
    if (visited.has(a) || visited.has(b)) {
      return a === b
    }

    if (a === b) return true

    if (a === null || b === null || a === undefined || b === undefined) {
      return a === b
    }

    if (typeof a !== typeof b) return false

    if (typeof a === 'object') {
      visited.add(a)
      visited.add(b)

      if (Array.isArray(a) !== Array.isArray(b)) return false

      if (Array.isArray(a)) {
        if (a.length !== b.length) return false
        for (let i = 0; i < a.length; i++) {
          if (!this.deepCompare(a[i], b[i], options, visited)) return false
        }
      } else {
        const keysA = Object.keys(a)
        const keysB = Object.keys(b)

        if (!options.ignoreExtraKeys && keysA.length !== keysB.length) return false

        for (const key of keysA) {
          if (!(key in b)) return false
          if (!this.deepCompare(a[key], b[key], options, visited)) return false
        }
      }

      visited.delete(a)
      visited.delete(b)
      return true
    }

    return false
  },
}

// Array-specific assertions
export const arrayAssertions = {
  /**
   * Assert array contains all elements
   */
  toContainAllElements<T>(received: T[], expected: T[]): boolean {
    return expected.every(element => received.includes(element))
  },

  /**
   * Assert array contains any of the elements
   */
  toContainAnyElement<T>(received: T[], expected: T[]): boolean {
    return expected.some(element => received.includes(element))
  },

  /**
   * Assert array has specific length range
   */
  toHaveLengthBetween(received: any[], min: number, max: number): boolean {
    return received.length >= min && received.length <= max
  },

  /**
   * Assert array is sorted
   */
  toBeSorted<T>(received: T[], compareFn?: (a: T, b: T) => number): boolean {
    if (received.length <= 1) return true

    for (let i = 1; i < received.length; i++) {
      const comparison = compareFn
        ? compareFn(received[i - 1], received[i])
        : received[i - 1] <= received[i]
        ? -1
        : 1

      if (comparison > 0) return false
    }

    return true
  },

  /**
   * Assert array contains unique elements
   */
  toContainUniqueElements<T>(received: T[]): boolean {
    const unique = new Set(received)
    return unique.size === received.length
  },
}

// String-specific assertions
export const stringAssertions = {
  /**
   * Assert string matches multiple patterns
   */
  toMatchAllPatterns(received: string, patterns: (string | RegExp)[]): boolean {
    return patterns.every(pattern => {
      if (typeof pattern === 'string') {
        return received.includes(pattern)
      } else {
        return pattern.test(received)
      }
    })
  },

  /**
   * Assert string is valid JSON
   */
  toBeValidJSON(received: string): boolean {
    try {
      JSON.parse(received)
      return true
    } catch {
      return false
    }
  },

  /**
   * Assert string has specific word count
   */
  toHaveWordCount(received: string, count: number): boolean {
    const words = received
      .trim()
      .split(/\s+/)
      .filter(word => word.length > 0)
    return words.length === count
  },

  /**
   * Assert string is valid URL
   */
  toBeValidURL(received: string): boolean {
    try {
      new URL(received)
      return true
    } catch {
      return false
    }
  },
}

/**
 * Framework-specific assertion extensions
 */

// Vitest custom matchers
export const vitestMatchers = {
  /**
   * Enhanced toThrow with better error messages
   */
  toThrowWithMessage(received: () => any, expectedMessage: string | RegExp) {
    let error: Error | null = null

    try {
      received()
    } catch (e) {
      error = e as Error
    }

    if (!error) {
      return {
        pass: false,
        message: () => 'Expected function to throw an error, but it did not',
      }
    }

    const messageMatches =
      typeof expectedMessage === 'string'
        ? error.message.includes(expectedMessage)
        : expectedMessage.test(error.message)

    return {
      pass: messageMatches,
      message: () =>
        messageMatches
          ? `Expected function not to throw error with message matching "${expectedMessage}"`
          : `Expected function to throw error with message matching "${expectedMessage}", but got: "${error.message}"`,
    }
  },

  /**
   * Assert function execution time
   */
  async toExecuteWithin(received: () => Promise<any> | any, maxTime: number) {
    const start = Date.now()

    try {
      const result = received()
      if (result instanceof Promise) {
        await result
      }
    } catch (error) {
      // Function threw an error, but we still check timing
    }

    const duration = Date.now() - start
    const pass = duration <= maxTime

    return {
      pass,
      message: () =>
        pass
          ? `Expected function to take more than ${maxTime}ms, but took ${duration}ms`
          : `Expected function to complete within ${maxTime}ms, but took ${duration}ms`,
    }
  },
}

// Jest custom matchers
export const jestMatchers = {
  /**
   * Snapshot testing with custom serialization
   */
  toMatchCustomSnapshot(received: any, serializer: (value: any) => string) {
    const serialized = serializer(received)
    // This would integrate with Jest's snapshot system
    return {
      pass: true, // Placeholder - would use Jest's snapshot matching
      message: () => 'Snapshot matched',
    }
  },

  /**
   * Mock function call verification
   */
  toHaveBeenCalledWithObjectMatching(mockFn: jest.Mock, expectedObject: any) {
    const calls = mockFn.mock.calls
    const matchingCall = calls.find(call =>
      call.some(arg => objectAssertions.toMatchObject(arg, expectedObject)),
    )

    return {
      pass: !!matchingCall,
      message: () =>
        matchingCall
          ? `Expected mock function not to have been called with object matching ${JSON.stringify(
              expectedObject,
            )}`
          : `Expected mock function to have been called with object matching ${JSON.stringify(
              expectedObject,
            )}`,
    }
  },
}

// Supporting interfaces and types
interface AssertionConfiguration {
  readonly library: 'vitest' | 'jest' | 'chai' | 'custom'
  readonly customMatchers: string[]
  readonly domainMatchers: string[]
  readonly errorReporting: 'basic' | 'detailed' | 'verbose'
  readonly typeChecking: 'loose' | 'strict' | 'typescript'
}

interface MatcherDefinition<T = any> {
  readonly name: string
  readonly description: string
  readonly parameters: ParameterDefinition[]
  readonly returnType: string
  readonly implementation: MatcherImplementation<T>
  readonly examples: MatcherExample[]
}

interface ParameterDefinition {
  readonly name: string
  readonly type: string
  readonly optional: boolean
  readonly description: string
}

interface MatcherImplementation<T> {
  (received: T, ...args: any[]): MatcherResult
}

interface MatcherResult {
  readonly pass: boolean
  readonly message: () => string
}

interface CustomMatcher<T> {
  readonly name: string
  readonly implementation: MatcherImplementation<T>
  readonly typeDefinitions: string
  readonly errorMessages: any
  readonly documentation: string
  readonly examples: MatcherExample[]
}

interface MatcherExample {
  readonly description: string
  readonly code: string
  readonly expected: boolean
}

interface DomainMatcher {
  readonly name: string
  readonly domain: string
  readonly description: string
  readonly implementation: MatcherImplementation<any>
  readonly schema?: object
}

interface DomainMatcherCollection {
  [domain: string]: DomainMatcher[]
}

interface AssertionSetup {
  readonly baseLibrary: any
  readonly customMatchers: CustomMatcher<any>[]
  readonly domainMatchers: DomainMatcherCollection
  readonly errorFormatting: any
  readonly typeValidation: any
  readonly utilities: any
  readonly configuration: AssertionConfiguration
  readonly status: 'configured' | 'error'
}

interface DeepEqualOptions {
  readonly ignoreExtraKeys?: boolean
  readonly strict?: boolean
}

// Placeholder interfaces for external dependencies
interface MatcherRegistry {
  register(name: string, implementation: MatcherImplementation<any>): Promise<void>
}

interface AssertionEngine {
  // Assertion execution engine
}

interface ErrorFormatter {
  // Error message formatting
}

interface TypeValidator {
  validate(value: any, schema: object): { valid: boolean; errors: string[] }
}

interface CustomMatcherFactory {
  createImplementation<T>(definition: MatcherDefinition<T>): Promise<MatcherImplementation<T>>
}

interface AssertionReportingSystem {
  // Assertion result reporting
}

class AssertionError extends Error {
  constructor(message: string, public details?: any) {
    super(message)
    this.name = 'AssertionError'
  }
}
````

## 🔗 Related Concepts

- **[Test Frameworks](test-frameworks.md)** - Test framework integration for assertions
- **[Mock Tools](mock-tools.md)** - Assertion patterns for mocked components
- **[Testing Utilities](testing-utilities.md)** - Utility functions for complex assertions
- **[Unit Testing](.pair/knowledge/guidelines/testing/testing-implementation/unit-testing.md)** - Unit test assertion patterns

## 🎯 Implementation Guidelines

1. **Clear Assertions**: Write clear, readable assertions that express intent
2. **Custom Matchers**: Create domain-specific matchers for better test readability
3. **Error Messages**: Provide descriptive error messages for failed assertions
4. **Type Safety**: Use TypeScript for type-safe assertions
5. **Performance**: Consider assertion performance for large test suites
6. **Consistency**: Maintain consistent assertion patterns across the codebase
7. **Documentation**: Document custom matchers and complex assertion patterns
8. **Testing Assertions**: Test custom matchers to ensure reliability

## 📏 Benefits

- **Test Clarity**: Clear assertions make tests easier to understand and maintain
- **Better Debugging**: Descriptive error messages speed up debugging
- **Domain Specificity**: Custom matchers express business logic clearly
- **Type Safety**: TypeScript integration catches assertion errors at compile time
- **Consistency**: Standardized assertion patterns improve code quality
- **Productivity**: Rich assertion libraries reduce boilerplate code
- **Maintainability**: Well-structured assertions are easier to update and refactor

---

_Assertion Libraries provide the foundation for clear, maintainable test validation with comprehensive matching capabilities and excellent error reporting._

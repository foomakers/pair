# Service Abstraction

## Overview

Service abstraction involves creating stable interfaces and contracts that hide implementation details, enabling flexibility, testability, and maintainability. This guide covers designing clean service boundaries, API contracts, and implementation strategies.

## Core Principles

### 1. Interface Segregation

Design focused interfaces that serve specific client needs.

```typescript
// ❌ Fat interface - violates ISP
interface UserService {
  // User management
  createUser(userData: CreateUserRequest): Promise<User>
  updateUser(id: string, updates: UpdateUserRequest): Promise<User>
  deleteUser(id: string): Promise<void>

  // Authentication
  authenticateUser(email: string, password: string): Promise<AuthResult>
  refreshToken(refreshToken: string): Promise<AuthResult>

  // Email operations
  sendWelcomeEmail(userId: string): Promise<void>
  sendPasswordResetEmail(email: string): Promise<void>

  // Analytics
  trackUserActivity(userId: string, activity: UserActivity): Promise<void>
  getUserAnalytics(userId: string): Promise<UserAnalytics>
}

// ✅ Segregated interfaces - each with single responsibility
interface UserRepository {
  findById(id: string): Promise<User | null>
  findByEmail(email: string): Promise<User | null>
  create(userData: CreateUserRequest): Promise<User>
  update(id: string, updates: UpdateUserRequest): Promise<User>
  delete(id: string): Promise<void>
}

interface AuthenticationService {
  authenticate(email: string, password: string): Promise<AuthResult>
  refreshToken(refreshToken: string): Promise<AuthResult>
  validateToken(token: string): Promise<boolean>
}

interface UserNotificationService {
  sendWelcomeEmail(user: User): Promise<void>
  sendPasswordResetEmail(email: string): Promise<void>
  sendAccountUpdateNotification(user: User): Promise<void>
}

interface UserAnalyticsService {
  trackActivity(userId: string, activity: UserActivity): Promise<void>
  getAnalytics(userId: string, dateRange: DateRange): Promise<UserAnalytics>
}
```

### 2. Dependency Inversion

Depend on abstractions, not concrete implementations.

```typescript
// Abstract interfaces
interface EmailProvider {
  sendEmail(to: string, subject: string, content: string): Promise<void>
}

interface UserRepository {
  findById(id: string): Promise<User | null>
  create(userData: CreateUserRequest): Promise<User>
}

interface Logger {
  info(message: string, context?: Record<string, any>): void
  error(message: string, error?: Error, context?: Record<string, any>): void
}

// Service depending on abstractions
class UserRegistrationService {
  constructor(
    private readonly userRepository: UserRepository,
    private readonly emailProvider: EmailProvider,
    private readonly logger: Logger,
  ) {}

  async registerUser(userData: CreateUserRequest): Promise<User> {
    this.logger.info('Starting user registration', { email: userData.email })

    try {
      // Check if user already exists
      const existingUser = await this.userRepository.findByEmail(userData.email)
      if (existingUser) {
        throw new BusinessRuleError('User with this email already exists')
      }

      // Create user
      const user = await this.userRepository.create(userData)

      // Send welcome email
      await this.emailProvider.sendEmail(
        user.email,
        'Welcome to our platform!',
        this.buildWelcomeEmailContent(user),
      )

      this.logger.info('User registration completed', { userId: user.id })
      return user
    } catch (error) {
      this.logger.error('User registration failed', error, { email: userData.email })
      throw error
    }
  }

  private buildWelcomeEmailContent(user: User): string {
    return `Welcome ${user.firstName}! Thanks for joining our platform.`
  }
}
```

## API Contract Design

### 1. Request/Response Contracts

```typescript
// Input contracts with validation
interface CreateUserRequest {
  readonly email: string
  readonly firstName: string
  readonly lastName: string
  readonly password: string
  readonly termsAccepted: boolean
}

interface UpdateUserRequest {
  readonly firstName?: string
  readonly lastName?: string
  readonly preferences?: Partial<UserPreferences>
}

// Response contracts
interface UserResponse {
  readonly id: string
  readonly email: string
  readonly firstName: string
  readonly lastName: string
  readonly createdAt: string
  readonly updatedAt: string
  readonly preferences: UserPreferences
}

interface ApiResponse<T> {
  readonly data: T
  readonly success: boolean
  readonly message?: string
  readonly errors?: ValidationError[]
}

// Service contract
interface UserService {
  createUser(request: CreateUserRequest): Promise<ApiResponse<UserResponse>>
  getUserById(id: string): Promise<ApiResponse<UserResponse>>
  updateUser(id: string, request: UpdateUserRequest): Promise<ApiResponse<UserResponse>>
  deleteUser(id: string): Promise<ApiResponse<void>>
  listUsers(
    filters?: UserFilters,
    pagination?: PaginationRequest,
  ): Promise<ApiResponse<PaginatedResponse<UserResponse>>>
}
```

### 2. Error Contracts

```typescript
// Standardized error responses
interface ServiceError {
  readonly code: string
  readonly message: string
  readonly details?: Record<string, any>
  readonly timestamp: string
}

interface ValidationError extends ServiceError {
  readonly code: 'VALIDATION_ERROR'
  readonly field: string
  readonly value: any
}

interface BusinessRuleError extends ServiceError {
  readonly code: 'BUSINESS_RULE_VIOLATION'
  readonly rule: string
}

// Service contract with explicit error handling
interface UserService {
  createUser(
    request: CreateUserRequest,
  ): Promise<Result<UserResponse, ValidationError | BusinessRuleError>>
  getUserById(id: string): Promise<Result<UserResponse, NotFoundError>>
}

// Result type for explicit error handling
type Result<T, E = ServiceError> = { success: true; data: T } | { success: false; error: E }
```

## Service Layer Patterns

### 1. Application Service Pattern

```typescript
// Application service orchestrates use cases
class UserApplicationService {
  constructor(
    private readonly userRepository: UserRepository,
    private readonly authService: AuthenticationService,
    private readonly notificationService: UserNotificationService,
    private readonly eventBus: EventBus,
  ) {}

  async registerUser(command: RegisterUserCommand): Promise<Result<User>> {
    // Validate command
    const validation = await this.validateRegistrationCommand(command)
    if (!validation.isValid) {
      return { success: false, error: new ValidationError(validation.errors) }
    }

    // Check business rules
    const businessRuleCheck = await this.checkRegistrationRules(command)
    if (!businessRuleCheck.isValid) {
      return { success: false, error: new BusinessRuleError(businessRuleCheck.violation) }
    }

    // Execute use case
    try {
      const user = await this.userRepository.create({
        email: command.email,
        firstName: command.firstName,
        lastName: command.lastName,
        hashedPassword: await this.authService.hashPassword(command.password),
      })

      // Send notifications
      await this.notificationService.sendWelcomeEmail(user)

      // Publish domain event
      await this.eventBus.publish(new UserRegisteredEvent(user.id, user.email))

      return { success: true, data: user }
    } catch (error) {
      return { success: false, error: new InternalServiceError(error.message) }
    }
  }

  private async validateRegistrationCommand(
    command: RegisterUserCommand,
  ): Promise<ValidationResult> {
    // Implementation
  }

  private async checkRegistrationRules(command: RegisterUserCommand): Promise<BusinessRuleResult> {
    // Implementation
  }
}
```

### 2. Domain Service Pattern

```typescript
// Domain service encapsulates business logic that doesn't belong to entities
class UserDomainService {
  constructor(
    private readonly userRepository: UserRepository,
    private readonly passwordPolicy: PasswordPolicy,
  ) {}

  async canUserAccessResource(userId: string, resourceId: string): Promise<boolean> {
    const user = await this.userRepository.findById(userId)
    if (!user) return false

    // Complex business logic for access control
    return this.evaluateAccessRules(user, resourceId)
  }

  async generateSecurePassword(): Promise<string> {
    return this.passwordPolicy.generateSecurePassword()
  }

  async isPasswordCompliant(password: string): Promise<boolean> {
    return this.passwordPolicy.validate(password)
  }

  private evaluateAccessRules(user: User, resourceId: string): boolean {
    // Complex domain logic
    return true // Simplified
  }
}
```

### 3. Infrastructure Service Pattern

```typescript
// Infrastructure services handle technical concerns
interface EmailInfrastructureService {
  sendEmail(to: string, subject: string, content: string): Promise<void>
  sendBulkEmail(recipients: string[], subject: string, content: string): Promise<BulkEmailResult>
}

interface CacheInfrastructureService {
  get<T>(key: string): Promise<T | null>
  set<T>(key: string, value: T, ttl?: number): Promise<void>
  delete(key: string): Promise<void>
  clear(): Promise<void>
}

interface FileStorageInfrastructureService {
  uploadFile(file: Buffer, filename: string, metadata?: FileMetadata): Promise<UploadResult>
  downloadFile(fileId: string): Promise<Buffer>
  deleteFile(fileId: string): Promise<void>
  generatePresignedUrl(fileId: string, expirationTime: number): Promise<string>
}

// Implementation abstraction
class UserProfileService {
  constructor(
    private readonly userRepository: UserRepository,
    private readonly fileStorage: FileStorageInfrastructureService,
    private readonly cache: CacheInfrastructureService,
  ) {}

  async updateProfilePicture(userId: string, imageFile: Buffer): Promise<Result<User>> {
    try {
      // Upload to storage
      const uploadResult = await this.fileStorage.uploadFile(
        imageFile,
        `profile-${userId}-${Date.now()}.jpg`,
        { userId, type: 'profile-picture' },
      )

      // Update user record
      const user = await this.userRepository.update(userId, {
        profilePictureUrl: uploadResult.url,
      })

      // Invalidate cache
      await this.cache.delete(`user:${userId}`)

      return { success: true, data: user }
    } catch (error) {
      return { success: false, error: new InternalServiceError(error.message) }
    }
  }
}
```

## Service Composition

### 1. Facade Pattern

```typescript
// High-level facade that coordinates multiple services
class UserManagementFacade {
  constructor(
    private readonly userService: UserApplicationService,
    private readonly authService: AuthenticationService,
    private readonly profileService: UserProfileService,
    private readonly analyticsService: UserAnalyticsService,
  ) {}

  async completeUserOnboarding(
    registrationData: RegisterUserCommand,
    profileData: UserProfileData,
  ): Promise<Result<OnboardingResult>> {
    try {
      // Step 1: Register user
      const userResult = await this.userService.registerUser(registrationData)
      if (!userResult.success) {
        return { success: false, error: userResult.error }
      }

      // Step 2: Setup profile
      const profileResult = await this.profileService.createProfile(userResult.data.id, profileData)
      if (!profileResult.success) {
        // Rollback user creation
        await this.userService.deleteUser(userResult.data.id)
        return { success: false, error: profileResult.error }
      }

      // Step 3: Initialize analytics
      await this.analyticsService.initializeUserTracking(userResult.data.id)

      return {
        success: true,
        data: {
          user: userResult.data,
          profile: profileResult.data,
          onboardingComplete: true,
        },
      }
    } catch (error) {
      return { success: false, error: new InternalServiceError(error.message) }
    }
  }
}
```

### 2. Service Composition with Event-Driven Architecture

```typescript
// Event-driven service composition
interface DomainEvent {
  readonly eventId: string
  readonly eventType: string
  readonly aggregateId: string
  readonly timestamp: string
  readonly version: number
}

class UserRegisteredEvent implements DomainEvent {
  readonly eventId = generateId()
  readonly eventType = 'UserRegistered'
  readonly timestamp = new Date().toISOString()
  readonly version = 1

  constructor(readonly aggregateId: string, readonly email: string, readonly firstName: string) {}
}

// Event handlers
class UserRegistrationEventHandler {
  constructor(
    private readonly notificationService: UserNotificationService,
    private readonly analyticsService: UserAnalyticsService,
    private readonly subscriptionService: SubscriptionService,
  ) {}

  async handle(event: UserRegisteredEvent): Promise<void> {
    // Parallel execution of independent operations
    await Promise.all([
      this.notificationService.sendWelcomeEmail(event.aggregateId),
      this.analyticsService.trackUserRegistration(event.aggregateId),
      this.subscriptionService.createTrialSubscription(event.aggregateId),
    ])
  }
}

// Event bus abstraction
interface EventBus {
  publish(event: DomainEvent): Promise<void>
  subscribe<T extends DomainEvent>(eventType: string, handler: (event: T) => Promise<void>): void
}
```

## Service Testing Strategies

### 1. Service Interface Testing

```typescript
// Abstract test suite for service contract compliance
abstract class UserServiceContractTest {
  protected abstract createUserService(): UserService;

  describe('UserService Contract', () => {
    let userService: UserService;

    beforeEach(() => {
      userService = this.createUserService();
    });

    it('should create user with valid data', async () => {
      const request: CreateUserRequest = {
        email: 'test@example.com',
        firstName: 'John',
        lastName: 'Doe',
        password: 'SecurePassword123!',
        termsAccepted: true
      };

      const result = await userService.createUser(request);

      expect(result.success).toBe(true);
      expect(result.data.email).toBe(request.email);
      expect(result.data.id).toBeDefined();
    });

    it('should return validation error for invalid email', async () => {
      const request: CreateUserRequest = {
        email: 'invalid-email',
        firstName: 'John',
        lastName: 'Doe',
        password: 'SecurePassword123!',
        termsAccepted: true
      };

      const result = await userService.createUser(request);

      expect(result.success).toBe(false);
      expect(result.error.code).toBe('VALIDATION_ERROR');
    });
  });
}

// Concrete test implementations
class InMemoryUserServiceTest extends UserServiceContractTest {
  protected createUserService(): UserService {
    return new UserApplicationService(
      new InMemoryUserRepository(),
      new MockAuthService(),
      new MockNotificationService(),
      new MockEventBus()
    );
  }
}

class DatabaseUserServiceTest extends UserServiceContractTest {
  protected createUserService(): UserService {
    return new UserApplicationService(
      new DatabaseUserRepository(testDatabase),
      new AuthService(),
      new EmailNotificationService(),
      new EventBus()
    );
  }
}
```

### 2. Service Mock Implementation

```typescript
// Service mocks for testing
class MockUserService implements UserService {
  private users: Map<string, UserResponse> = new Map()

  async createUser(request: CreateUserRequest): Promise<ApiResponse<UserResponse>> {
    const user: UserResponse = {
      id: generateId(),
      email: request.email,
      firstName: request.firstName,
      lastName: request.lastName,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      preferences: { emailNotifications: true, theme: 'light' },
    }

    this.users.set(user.id, user)

    return {
      data: user,
      success: true,
      message: 'User created successfully',
    }
  }

  async getUserById(id: string): Promise<ApiResponse<UserResponse>> {
    const user = this.users.get(id)

    if (!user) {
      return {
        data: null as any,
        success: false,
        errors: [{ code: 'NOT_FOUND', message: 'User not found' }],
      }
    }

    return {
      data: user,
      success: true,
    }
  }

  // Other methods...
}
```

## Best Practices

### 1. Stable Interfaces

- Design interfaces that are unlikely to change frequently
- Version your APIs when breaking changes are necessary
- Use semantic versioning for service contracts

### 2. Clear Boundaries

- Each service should have a well-defined responsibility
- Avoid chatty interfaces with multiple small operations
- Group related operations in the same service

### 3. Error Handling

- Use explicit error types in service contracts
- Provide meaningful error messages and codes
- Handle errors at appropriate abstraction levels

### 4. Documentation

- Document service contracts and expected behaviors
- Provide examples of usage and error scenarios
- Maintain up-to-date API documentation

### 5. Testing

- Test against service interfaces, not implementations
- Use contract testing to ensure compatibility
- Mock external dependencies consistently

Service abstraction enables loose coupling, testability, and maintainable architecture by providing stable interfaces and clear boundaries between components.

# 🏗️ Domain-Driven Design (DDD)

**Focus**: Domain modeling, bounded contexts, and tactical patterns

Domain-Driven Design patterns for TypeScript applications, emphasizing domain modeling, strategic design, and tactical implementation patterns.

## 🎯 Strategic Design Patterns

### Domain and Subdomain Modeling

```typescript
// ✅ Domain definition and modeling
/**
 * User Management Domain
 * Core subdomain responsible for user lifecycle, authentication, and profiles
 */

// Domain Events
type DomainEvent = {
  readonly eventId: string
  readonly eventType: string
  readonly aggregateId: string
  readonly aggregateType: string
  readonly eventData: Record<string, unknown>
  readonly timestamp: Date
  readonly version: number
}

type UserRegisteredEvent = DomainEvent & {
  readonly eventType: 'UserRegistered'
  readonly eventData: {
    readonly userId: string
    readonly email: string
    readonly name: string
    readonly registrationMethod: 'email' | 'social' | 'invite'
  }
}

type UserProfileUpdatedEvent = DomainEvent & {
  readonly eventType: 'UserProfileUpdated'
  readonly eventData: {
    readonly userId: string
    readonly changes: Record<string, { oldValue: unknown; newValue: unknown }>
  }
}

type UserDeactivatedEvent = DomainEvent & {
  readonly eventType: 'UserDeactivated'
  readonly eventData: {
    readonly userId: string
    readonly reason: 'self_requested' | 'admin_action' | 'policy_violation'
    readonly deactivatedBy: string
  }
}

// ✅ Bounded Context definition
namespace UserManagement {
  // Value Objects
  export type UserId = Brand<string, 'UserId'>
  export type Email = Brand<string, 'Email'>
  export type UserName = Brand<string, 'UserName'>

  // Domain Services
  export interface UserDomainService {
    validateUniqueEmail(email: Email): Promise<Result<boolean>>
    generateUserId(): UserId
    validateUserName(name: string): Result<UserName>
  }

  // Repository Interfaces (in domain layer)
  export interface UserRepository {
    findById(id: UserId): Promise<Result<User | null>>
    findByEmail(email: Email): Promise<Result<User | null>>
    save(user: User): Promise<Result<void>>
    delete(id: UserId): Promise<Result<void>>
  }

  // Application Services
  export interface UserApplicationService {
    registerUser(command: RegisterUserCommand): Promise<Result<UserId>>
    updateUserProfile(command: UpdateUserProfileCommand): Promise<Result<void>>
    deactivateUser(command: DeactivateUserCommand): Promise<Result<void>>
  }
}

// ✅ Cross-cutting concerns and shared kernel
namespace SharedKernel {
  export type Money = {
    readonly amount: number
    readonly currency: string
  }

  export type DateRange = {
    readonly start: Date
    readonly end: Date
  }

  export type ContactInfo = {
    readonly email: Email
    readonly phone?: string
    readonly address?: Address
  }

  export type Address = {
    readonly street: string
    readonly city: string
    readonly state: string
    readonly country: string
    readonly postalCode: string
  }
}
```

### Bounded Context Integration

```typescript
// ✅ Anti-Corruption Layer pattern
namespace Integration {
  // External service contracts
  type ExternalUserProfile = {
    user_id: string
    email_address: string
    full_name: string
    created_at: string
    is_active: boolean
    metadata: Record<string, any>
  }

  // ✅ Anti-corruption layer
  export class ExternalUserAdapter {
    static toDomainUser(external: ExternalUserProfile): Result<UserManagement.User> {
      try {
        const userId = external.user_id as UserManagement.UserId
        const email = external.email_address as UserManagement.Email
        const name = external.full_name as UserManagement.UserName

        if (!this.isValidEmail(email)) {
          return err(new Error('Invalid email format from external service'))
        }

        return ok({
          id: userId,
          email,
          name,
          status: external.is_active ? 'active' : 'inactive',
          createdAt: new Date(external.created_at),
          updatedAt: new Date(),
          profile: this.extractProfile(external.metadata),
        })
      } catch (error) {
        return err(error as Error)
      }
    }

    static fromDomainUser(user: UserManagement.User): ExternalUserProfile {
      return {
        user_id: user.id,
        email_address: user.email,
        full_name: user.name,
        created_at: user.createdAt.toISOString(),
        is_active: user.status === 'active',
        metadata: {
          profile: user.profile,
          lastUpdated: user.updatedAt.toISOString(),
        },
      }
    }

    private static isValidEmail(email: string): boolean {
      return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
    }

    private static extractProfile(metadata: Record<string, any>): UserProfile {
      return {
        firstName: metadata.profile?.firstName || '',
        lastName: metadata.profile?.lastName || '',
        bio: metadata.profile?.bio || '',
        avatar: metadata.profile?.avatar || null,
      }
    }
  }

  // ✅ Context mapping - Published Language
  export type UserIntegrationEvent = {
    readonly eventType: 'user.registered' | 'user.updated' | 'user.deactivated'
    readonly payload: {
      readonly userId: string
      readonly timestamp: string
      readonly data: Record<string, unknown>
    }
  }

  export interface UserEventPublisher {
    publish(event: UserIntegrationEvent): Promise<Result<void>>
  }
}
```

## 🧱 Tactical Design Patterns

### Entities and Aggregates

```typescript
// ✅ Entity base class
abstract class Entity<T> {
  protected constructor(protected readonly _id: T, protected _version: number = 0) {}

  get id(): T {
    return this._id
  }

  get version(): number {
    return this._version
  }

  protected incrementVersion(): void {
    this._version++
  }

  equals(other: Entity<T>): boolean {
    return other._id === this._id
  }
}

// ✅ Aggregate Root
class User extends Entity<UserManagement.UserId> {
  private _domainEvents: DomainEvent[] = []

  constructor(
    id: UserManagement.UserId,
    private _email: UserManagement.Email,
    private _name: UserManagement.UserName,
    private _status: UserStatus = 'active',
    private _profile: UserProfile = UserProfile.empty(),
    private _createdAt: Date = new Date(),
    private _updatedAt: Date = new Date(),
    version: number = 0,
  ) {
    super(id, version)
  }

  // ✅ Factory method
  static create(
    email: UserManagement.Email,
    name: UserManagement.UserName,
    userDomainService: UserManagement.UserDomainService,
  ): Result<User> {
    // Domain validation
    const emailValidation = userDomainService.validateUniqueEmail(email)
    if (!emailValidation.success) {
      return err(new Error('Email already exists'))
    }

    const id = userDomainService.generateUserId()
    const user = new User(id, email, name)

    // Domain event
    user.addDomainEvent({
      eventId: crypto.randomUUID(),
      eventType: 'UserRegistered',
      aggregateId: id,
      aggregateType: 'User',
      eventData: {
        userId: id,
        email,
        name,
        registrationMethod: 'email',
      },
      timestamp: new Date(),
      version: 1,
    })

    return ok(user)
  }

  // ✅ Business behavior methods
  updateProfile(updates: Partial<UserProfile>, updatedBy: UserManagement.UserId): Result<void> {
    if (this._status !== 'active') {
      return err(new Error('Cannot update profile of inactive user'))
    }

    const oldProfile = { ...this._profile }
    this._profile = { ...this._profile, ...updates }
    this._updatedAt = new Date()
    this.incrementVersion()

    // Track changes for event
    const changes: Record<string, { oldValue: unknown; newValue: unknown }> = {}
    Object.keys(updates).forEach(key => {
      if (key in oldProfile) {
        changes[key] = {
          oldValue: oldProfile[key as keyof UserProfile],
          newValue: this._profile[key as keyof UserProfile],
        }
      }
    })

    this.addDomainEvent({
      eventId: crypto.randomUUID(),
      eventType: 'UserProfileUpdated',
      aggregateId: this.id,
      aggregateType: 'User',
      eventData: {
        userId: this.id,
        changes,
      },
      timestamp: new Date(),
      version: this.version,
    })

    return ok(undefined)
  }

  deactivate(
    reason: 'self_requested' | 'admin_action' | 'policy_violation',
    deactivatedBy: UserManagement.UserId,
  ): Result<void> {
    if (this._status === 'inactive') {
      return err(new Error('User is already inactive'))
    }

    this._status = 'inactive'
    this._updatedAt = new Date()
    this.incrementVersion()

    this.addDomainEvent({
      eventId: crypto.randomUUID(),
      eventType: 'UserDeactivated',
      aggregateId: this.id,
      aggregateType: 'User',
      eventData: {
        userId: this.id,
        reason,
        deactivatedBy,
      },
      timestamp: new Date(),
      version: this.version,
    })

    return ok(undefined)
  }

  // ✅ Getters
  get email(): UserManagement.Email {
    return this._email
  }
  get name(): UserManagement.UserName {
    return this._name
  }
  get status(): UserStatus {
    return this._status
  }
  get profile(): UserProfile {
    return this._profile
  }
  get createdAt(): Date {
    return this._createdAt
  }
  get updatedAt(): Date {
    return this._updatedAt
  }

  // ✅ Domain events management
  get domainEvents(): readonly DomainEvent[] {
    return [...this._domainEvents]
  }

  clearDomainEvents(): void {
    this._domainEvents = []
  }

  private addDomainEvent(event: DomainEvent): void {
    this._domainEvents.push(event)
  }
}
```

### Value Objects

```typescript
// ✅ Value Object base class
abstract class ValueObject {
  abstract equals(other: ValueObject): boolean

  protected deepEquals(a: unknown, b: unknown): boolean {
    return JSON.stringify(a) === JSON.stringify(b)
  }
}

// ✅ Value Objects implementation
class UserProfile extends ValueObject {
  constructor(
    public readonly firstName: string,
    public readonly lastName: string,
    public readonly bio: string,
    public readonly avatar: string | null,
    public readonly preferences: UserPreferences,
  ) {
    super()
  }

  static empty(): UserProfile {
    return new UserProfile('', '', '', null, UserPreferences.default())
  }

  static create(data: {
    firstName: string
    lastName: string
    bio?: string
    avatar?: string | null
    preferences?: UserPreferences
  }): Result<UserProfile> {
    if (data.firstName.trim().length === 0) {
      return err(new Error('First name cannot be empty'))
    }

    if (data.lastName.trim().length === 0) {
      return err(new Error('Last name cannot be empty'))
    }

    if (data.bio && data.bio.length > 500) {
      return err(new Error('Bio cannot exceed 500 characters'))
    }

    return ok(
      new UserProfile(
        data.firstName.trim(),
        data.lastName.trim(),
        data.bio?.trim() || '',
        data.avatar || null,
        data.preferences || UserPreferences.default(),
      ),
    )
  }

  get fullName(): string {
    return `${this.firstName} ${this.lastName}`.trim()
  }

  equals(other: ValueObject): boolean {
    if (!(other instanceof UserProfile)) {
      return false
    }

    return this.deepEquals(
      {
        firstName: this.firstName,
        lastName: this.lastName,
        bio: this.bio,
        avatar: this.avatar,
        preferences: this.preferences,
      },
      {
        firstName: other.firstName,
        lastName: other.lastName,
        bio: other.bio,
        avatar: other.avatar,
        preferences: other.preferences,
      },
    )
  }
}

class UserPreferences extends ValueObject {
  constructor(
    public readonly theme: 'light' | 'dark' | 'auto',
    public readonly language: string,
    public readonly timezone: string,
    public readonly emailNotifications: boolean,
    public readonly pushNotifications: boolean,
  ) {
    super()
  }

  static default(): UserPreferences {
    return new UserPreferences('auto', 'en', 'UTC', true, false)
  }

  equals(other: ValueObject): boolean {
    if (!(other instanceof UserPreferences)) {
      return false
    }

    return (
      this.theme === other.theme &&
      this.language === other.language &&
      this.timezone === other.timezone &&
      this.emailNotifications === other.emailNotifications &&
      this.pushNotifications === other.pushNotifications
    )
  }
}

// ✅ Money Value Object
class Money extends ValueObject {
  constructor(public readonly amount: number, public readonly currency: string) {
    super()

    if (amount < 0) {
      throw new Error('Amount cannot be negative')
    }

    if (!currency || currency.length !== 3) {
      throw new Error('Invalid currency code')
    }
  }

  add(other: Money): Result<Money> {
    if (this.currency !== other.currency) {
      return err(new Error('Cannot add money with different currencies'))
    }

    return ok(new Money(this.amount + other.amount, this.currency))
  }

  subtract(other: Money): Result<Money> {
    if (this.currency !== other.currency) {
      return err(new Error('Cannot subtract money with different currencies'))
    }

    if (this.amount < other.amount) {
      return err(new Error('Insufficient funds'))
    }

    return ok(new Money(this.amount - other.amount, this.currency))
  }

  multiply(factor: number): Money {
    if (factor < 0) {
      throw new Error('Factor cannot be negative')
    }

    return new Money(this.amount * factor, this.currency)
  }

  equals(other: ValueObject): boolean {
    if (!(other instanceof Money)) {
      return false
    }

    return this.amount === other.amount && this.currency === other.currency
  }

  toString(): string {
    return `${this.amount} ${this.currency}`
  }
}
```

### Domain Services

```typescript
// ✅ Domain Service implementation
class UserDomainService implements UserManagement.UserDomainService {
  constructor(
    private readonly userRepository: UserManagement.UserRepository,
    private readonly idGenerator: IdGenerator,
  ) {}

  async validateUniqueEmail(email: UserManagement.Email): Promise<Result<boolean>> {
    try {
      const existingUser = await this.userRepository.findByEmail(email)

      if (!existingUser.success) {
        return err(existingUser.error)
      }

      return ok(existingUser.data === null)
    } catch (error) {
      return err(error as Error)
    }
  }

  generateUserId(): UserManagement.UserId {
    return this.idGenerator.generate() as UserManagement.UserId
  }

  validateUserName(name: string): Result<UserManagement.UserName> {
    const trimmed = name.trim()

    if (trimmed.length === 0) {
      return err(new Error('User name cannot be empty'))
    }

    if (trimmed.length < 2) {
      return err(new Error('User name must be at least 2 characters'))
    }

    if (trimmed.length > 100) {
      return err(new Error('User name cannot exceed 100 characters'))
    }

    if (!/^[a-zA-Z\s\-']+$/.test(trimmed)) {
      return err(new Error('User name contains invalid characters'))
    }

    return ok(trimmed as UserManagement.UserName)
  }

  // ✅ Complex domain logic
  async canUserPerformAction(
    userId: UserManagement.UserId,
    action: UserAction,
    context: ActionContext,
  ): Promise<Result<boolean>> {
    const userResult = await this.userRepository.findById(userId)

    if (!userResult.success) {
      return err(userResult.error)
    }

    if (!userResult.data) {
      return err(new Error('User not found'))
    }

    const user = userResult.data

    // Business rules
    if (user.status !== 'active') {
      return ok(false)
    }

    if (action === 'delete_account' && context.requestedBy !== userId) {
      return ok(false)
    }

    if (action === 'update_sensitive_data' && !context.isVerified) {
      return ok(false)
    }

    return ok(true)
  }
}

// ✅ Supporting types
type UserAction = 'update_profile' | 'update_sensitive_data' | 'delete_account' | 'change_password'

type ActionContext = {
  readonly requestedBy: UserManagement.UserId
  readonly isVerified: boolean
  readonly ipAddress: string
  readonly userAgent: string
}

interface IdGenerator {
  generate(): string
}
```

### Application Services

```typescript
// ✅ Application Service implementation
class UserApplicationService implements UserManagement.UserApplicationService {
  constructor(
    private readonly userRepository: UserManagement.UserRepository,
    private readonly userDomainService: UserManagement.UserDomainService,
    private readonly eventPublisher: DomainEventPublisher,
    private readonly logger: Logger,
  ) {}

  async registerUser(command: RegisterUserCommand): Promise<Result<UserManagement.UserId>> {
    try {
      this.logger.info('Starting user registration', { email: command.email })

      // Validate command
      const validation = this.validateRegisterUserCommand(command)
      if (!validation.success) {
        return err(validation.error)
      }

      // Validate email format
      const email = command.email as UserManagement.Email
      if (!this.isValidEmailFormat(email)) {
        return err(new Error('Invalid email format'))
      }

      // Validate user name
      const nameValidation = this.userDomainService.validateUserName(command.name)
      if (!nameValidation.success) {
        return err(nameValidation.error)
      }

      // Create user aggregate
      const userResult = User.create(email, nameValidation.data, this.userDomainService)

      if (!userResult.success) {
        return err(userResult.error)
      }

      const user = userResult.data

      // Save user
      const saveResult = await this.userRepository.save(user)
      if (!saveResult.success) {
        return err(saveResult.error)
      }

      // Publish domain events
      await this.publishDomainEvents(user)

      this.logger.info('User registration completed', { userId: user.id })

      return ok(user.id)
    } catch (error) {
      this.logger.error('User registration failed', { error, command })
      return err(error as Error)
    }
  }

  async updateUserProfile(command: UpdateUserProfileCommand): Promise<Result<void>> {
    try {
      // Load user aggregate
      const userResult = await this.userRepository.findById(command.userId)

      if (!userResult.success) {
        return err(userResult.error)
      }

      if (!userResult.data) {
        return err(new Error('User not found'))
      }

      const user = userResult.data

      // Validate profile data
      const profileValidation = UserProfile.create(command.profileUpdates)
      if (!profileValidation.success) {
        return err(profileValidation.error)
      }

      // Update profile
      const updateResult = user.updateProfile(command.profileUpdates, command.updatedBy)

      if (!updateResult.success) {
        return err(updateResult.error)
      }

      // Save user
      const saveResult = await this.userRepository.save(user)
      if (!saveResult.success) {
        return err(saveResult.error)
      }

      // Publish domain events
      await this.publishDomainEvents(user)

      return ok(undefined)
    } catch (error) {
      this.logger.error('Profile update failed', { error, command })
      return err(error as Error)
    }
  }

  async deactivateUser(command: DeactivateUserCommand): Promise<Result<void>> {
    try {
      const userResult = await this.userRepository.findById(command.userId)

      if (!userResult.success) {
        return err(userResult.error)
      }

      if (!userResult.data) {
        return err(new Error('User not found'))
      }

      const user = userResult.data

      // Deactivate user
      const deactivateResult = user.deactivate(command.reason, command.deactivatedBy)

      if (!deactivateResult.success) {
        return err(deactivateResult.error)
      }

      // Save user
      const saveResult = await this.userRepository.save(user)
      if (!saveResult.success) {
        return err(saveResult.error)
      }

      // Publish domain events
      await this.publishDomainEvents(user)

      return ok(undefined)
    } catch (error) {
      this.logger.error('User deactivation failed', { error, command })
      return err(error as Error)
    }
  }

  private validateRegisterUserCommand(command: RegisterUserCommand): Result<void> {
    if (!command.email || command.email.trim().length === 0) {
      return err(new Error('Email is required'))
    }

    if (!command.name || command.name.trim().length === 0) {
      return err(new Error('Name is required'))
    }

    return ok(undefined)
  }

  private isValidEmailFormat(email: string): boolean {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
  }

  private async publishDomainEvents(aggregate: User): Promise<void> {
    const events = aggregate.domainEvents

    for (const event of events) {
      await this.eventPublisher.publish(event)
    }

    aggregate.clearDomainEvents()
  }
}

// ✅ Command types
type RegisterUserCommand = {
  readonly email: string
  readonly name: string
}

type UpdateUserProfileCommand = {
  readonly userId: UserManagement.UserId
  readonly profileUpdates: Partial<UserProfile>
  readonly updatedBy: UserManagement.UserId
}

type DeactivateUserCommand = {
  readonly userId: UserManagement.UserId
  readonly reason: 'self_requested' | 'admin_action' | 'policy_violation'
  readonly deactivatedBy: UserManagement.UserId
}

interface DomainEventPublisher {
  publish(event: DomainEvent): Promise<void>
}

interface Logger {
  info(message: string, meta?: Record<string, unknown>): void
  error(message: string, meta?: Record<string, unknown>): void
}
```

## 🔗 Related Concepts

- **[Clean Architecture](.pair/knowledge/guidelines/code-design/organization-patterns/README.md)** - Architectural foundation for DDD
- **[SOLID Principles](solid-principles.md)** - Object-oriented design principles
- **[Repository Pattern](.pair/knowledge/guidelines/code-design/framework-patterns/database-integration.md)** - Data access abstraction
- **[State Management](.pair/knowledge/guidelines/code-design/framework-patterns/state-management.md)** - Domain state management

## 🎯 Implementation Guidelines

1. **Start with Domain**: Model the domain before technical concerns
2. **Use Ubiquitous Language**: Consistent terminology across code and documentation
3. **Protect Invariants**: Encapsulate business rules within aggregates
4. **Separate Concerns**: Keep domain logic separate from infrastructure
5. **Event-Driven Architecture**: Use domain events for decoupled communication
6. **Bounded Contexts**: Define clear boundaries between different domains

## 📏 Benefits

- **Business Alignment**: Code reflects business concepts and rules
- **Maintainability**: Clear domain boundaries reduce coupling
- **Testability**: Business logic is isolated and easily testable
- **Scalability**: Bounded contexts enable independent scaling
- **Evolution**: Domain model can evolve independently

---

_Domain-Driven Design creates software that closely mirrors business concepts and enables sustainable complexity management._

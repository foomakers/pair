# SOLID Principles

## Overview

SOLID principles are five fundamental design principles that guide the creation of maintainable, flexible, and robust object-oriented software. These principles help developers write code that is easier to understand, test, and modify over time.

## S - Single Responsibility Principle (SRP)

**"A class should have only one reason to change."**

### Core Philosophy

Each class or module should have a single, well-defined responsibility. This principle promotes:

**Clarity**: Code purpose is immediately clear from class/module names
**Maintainability**: Changes to one responsibility don't affect others
**Testability**: Focused responsibilities are easier to test in isolation
**Reusability**: Single-purpose components can be reused in different contexts

### Application Strategy

Identify different responsibilities and separate them into distinct classes:

**Data Validation**: Separate validation logic from business logic
**Persistence**: Isolate database operations from business rules
**Communication**: Extract email/notification logic from core operations
**Formatting**: Separate presentation logic from data processing

```typescript
// Good: Single responsibility - User validation
class UserValidator {
  validateUserData(userData: CreateUserRequest): ValidationResult {
    const errors = []
    if (!userData.email || !this.isValidEmail(userData.email)) {
      errors.push('Valid email is required')
    }
    return { isValid: errors.length === 0, errors }
  }
}

// Good: Single responsibility - User persistence
class UserRepository {
  async save(user: User): Promise<User> {
    return await this.database.users.create(user)
  }
}

// Good: Single responsibility - User business logic
class UserService {
  constructor(
    private validator: UserValidator,
    private repository: UserRepository,
    private notificationService: NotificationService,
  ) {}

  async createUser(userData: CreateUserRequest): Promise<User> {
    const validation = this.validator.validateUserData(userData)
    if (!validation.isValid) {
      throw new ValidationError(validation.errors)
    }

    const user = await this.repository.save(userData)
    await this.notificationService.sendWelcomeEmail(user)
    return user
  }
}
```

**Benefits**: Each class has a clear, single purpose and can evolve independently

## O - Open/Closed Principle (OCP)

**"Software entities should be open for extension but closed for modification."**

### Extension Strategy

Design systems that can be extended with new functionality without modifying existing code:

**Interface Design**: Create stable interfaces that new implementations can follow
**Plugin Architecture**: Allow new behaviors through composition rather than modification
**Strategy Pattern**: Enable different algorithms or behaviors through interchangeable strategies

### Practical Implementation

Use abstraction and dependency injection to enable extension:

```typescript
// Stable interface - closed for modification
interface PaymentProcessor {
  processPayment(amount: number, details: PaymentDetails): Promise<PaymentResult>
}

// Extension through new implementations - open for extension
class StripePaymentProcessor implements PaymentProcessor {
  async processPayment(amount: number, details: PaymentDetails): Promise<PaymentResult> {
    // Stripe-specific implementation
  }
}

class PayPalPaymentProcessor implements PaymentProcessor {
  async processPayment(amount: number, details: PaymentDetails): Promise<PaymentResult> {
    // PayPal-specific implementation
  }
}

// Payment service uses abstraction, no modification needed for new processors
class PaymentService {
  constructor(private processor: PaymentProcessor) {}

  async processOrder(order: Order): Promise<void> {
    await this.processor.processPayment(order.total, order.paymentDetails)
  }
}
```

**Benefits**: New payment methods can be added without changing existing payment processing logic

## L - Liskov Substitution Principle (LSP)

**"Objects of a supertype should be replaceable with objects of their subtypes."**

### Substitutability Rules

Derived classes must be substitutable for their base classes without altering correctness:

**Behavioral Consistency**: Subclasses should maintain the expected behavior of the base class
**Contract Preservation**: Method signatures and expected outcomes should remain consistent
**No Strengthened Preconditions**: Subclasses shouldn't require more restrictive inputs
**No Weakened Postconditions**: Subclasses shouldn't provide less than what's promised

### Design Guidelines

Ensure subclasses honor the contracts established by their parent classes:

```typescript
abstract class Document {
  abstract save(): Promise<void>
  abstract load(id: string): Promise<void>
}

// Good: Maintains contract expectations
class TextDocument extends Document {
  async save(): Promise<void> {
    // Saves text document, fulfills the contract
  }

  async load(id: string): Promise<void> {
    // Loads text document, fulfills the contract
  }
}

// Good: Extends without breaking substitutability
class EncryptedDocument extends Document {
  async save(): Promise<void> {
    // Encrypts then saves - still fulfills save contract
  }

  async load(id: string): Promise<void> {
    // Loads then decrypts - still fulfills load contract
  }
}

// Usage works with any Document subclass
function processDocuments(documents: Document[]) {
  documents.forEach(async doc => {
    await doc.save() // Works with any valid Document subclass
  })
}
```

**Benefits**: Polymorphism works correctly, making code more flexible and maintainable

## I - Interface Segregation Principle (ISP)

**"Clients should not be forced to depend on interfaces they do not use."**

### Interface Design Philosophy

Create focused, cohesive interfaces rather than large, monolithic ones:

**Client-Specific Interfaces**: Design interfaces around client needs, not provider capabilities
**Minimal Dependencies**: Reduce coupling by exposing only what clients actually need
**Role-Based Segregation**: Create interfaces that represent specific roles or capabilities

### Focused Interface Strategy

Break large interfaces into smaller, focused ones:

```typescript
// Too broad - forces implementation of unused methods
interface FileManager {
  read(path: string): Promise<string>
  write(path: string, content: string): Promise<void>
  delete(path: string): Promise<void>
  compress(path: string): Promise<void>
  encrypt(path: string, key: string): Promise<void>
  backup(path: string): Promise<void>
}

// Better: Segregated interfaces
interface FileReader {
  read(path: string): Promise<string>
}

interface FileWriter {
  write(path: string, content: string): Promise<void>
}

interface FileCompressor {
  compress(path: string): Promise<void>
}

// Clients implement only what they need
class ConfigFileHandler implements FileReader, FileWriter {
  async read(path: string): Promise<string> {
    // Implementation for reading config files
  }

  async write(path: string, content: string): Promise<void> {
    // Implementation for writing config files
  }
  // No need to implement compression, encryption, etc.
}

class BackupService implements FileReader, FileCompressor {
  // Only implements methods relevant to backup operations
}
```

**Benefits**: Simpler implementations, clearer dependencies, easier testing

## D - Dependency Inversion Principle (DIP)

**"High-level modules should not depend on low-level modules. Both should depend on abstractions."**

### Dependency Direction Strategy

Invert dependencies so that high-level business logic doesn't depend on low-level implementation details:

**Abstraction Dependency**: Depend on interfaces, not concrete classes
**Dependency Injection**: Provide dependencies from the outside rather than creating them internally
**Inversion of Control**: Let external systems control dependency creation and lifecycle

### Implementation Approach

Use dependency injection to achieve inversion:

```typescript
// Abstraction - stable interface
interface EmailService {
  sendEmail(to: string, subject: string, body: string): Promise<void>
}

interface UserRepository {
  save(user: User): Promise<User>
  findById(id: string): Promise<User | null>
}

// High-level module depends on abstractions
class UserRegistrationService {
  constructor(private userRepository: UserRepository, private emailService: EmailService) {}

  async registerUser(userData: CreateUserRequest): Promise<User> {
    const user = await this.userRepository.save(userData)
    await this.emailService.sendEmail(user.email, 'Welcome!', 'Welcome to our platform')
    return user
  }
}

// Low-level modules implement abstractions
class DatabaseUserRepository implements UserRepository {
  // Database-specific implementation
}

class SendGridEmailService implements EmailService {
  // SendGrid-specific implementation
}

// Dependency injection at application root
const userRepository = new DatabaseUserRepository(database)
const emailService = new SendGridEmailService(config.sendgrid)
const registrationService = new UserRegistrationService(userRepository, emailService)
```

**Benefits**: Business logic is isolated from implementation details, making it easier to test and modify

## SOLID Principles Integration

### Synergistic Application

SOLID principles work together to create robust software architecture:

**SRP + DIP**: Single-responsibility classes with injected dependencies
**OCP + LSP**: Extensible systems where substitutions work correctly
**ISP + DIP**: Focused interfaces that enable clean dependency inversion

### Architectural Impact

Applying SOLID principles collectively results in:

**Testability**: Each component can be tested in isolation with mocked dependencies
**Maintainability**: Changes to one component don't cascade through the system
**Flexibility**: New features can be added through extension rather than modification
**Readability**: Clear responsibilities and dependencies make code easier to understand

## Best Practices Summary

### Design Approach

- **Start with Interfaces**: Define contracts before implementations
- **Identify Responsibilities**: Clearly separate different concerns
- **Plan for Extension**: Design with future changes in mind

### Implementation Strategy

- **Use Dependency Injection**: Inject dependencies rather than creating them
- **Favor Composition**: Build complex behavior from simpler components
- **Create Focused Interfaces**: Design interfaces around client needs

### Testing Benefits

- **Isolated Testing**: Single responsibilities enable focused unit tests
- **Mock Dependencies**: Dependency injection simplifies mocking
- **Behavioral Testing**: Interface contracts enable consistent testing approaches

### Refactoring Guidelines

- **Identify Violations**: Look for classes with multiple responsibilities
- **Extract Interfaces**: Create abstractions for concrete dependencies
- **Inject Dependencies**: Remove direct instantiation of dependencies

SOLID principles provide a foundation for writing maintainable, testable, and flexible object-oriented code that adapts well to changing requirements.
}

    if (!userData.firstName?.trim()) {
      errors.push('First name is required');
    }

    return {
      isValid: errors.length === 0,
      errors
    };

}

private isValidEmail(email: string): boolean {
return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}
}

// Single responsibility: User data persistence
class UserRepository {
async createUser(userData: CreateUserRequest): Promise<User> {
return await database.users.create(userData);
}

async findUserById(id: string): Promise<User | null> {
return await database.users.findById(id);
}
}

// Single responsibility: User-related email operations
class UserEmailService {
async sendWelcomeEmail(user: User): Promise<void> {
const emailContent = this.buildWelcomeEmailContent(user);
await emailService.send(user.email, 'Welcome!', emailContent);
}

private buildWelcomeEmailContent(user: User): string {
return `Welcome ${user.firstName}! Thanks for joining us.`;
}
}

// Orchestrator that uses all single-responsibility classes
class UserService {
constructor(
private readonly userRepository: UserRepository,
private readonly userValidator: UserValidator,
private readonly userEmailService: UserEmailService
) {}

async createUser(userData: CreateUserRequest): Promise<User> {
const validation = this.userValidator.validateUserData(userData);
if (!validation.isValid) {
throw new Error(`Validation failed: ${validation.errors.join(', ')}`);
}

    const user = await this.userRepository.createUser(userData);
    await this.userEmailService.sendWelcomeEmail(user);

    return user;

}
}

````

## O - Open/Closed Principle (OCP)

**"Software entities should be open for extension but closed for modification."**

Classes should be extensible without modifying existing code.

### ❌ Violating OCP
```typescript
class OrderCalculator {
  calculateTotal(order: Order): number {
    let total = 0;

    for (const item of order.items) {
      if (order.customerType === 'regular') {
        total += item.price;
      } else if (order.customerType === 'premium') {
        total += item.price * 0.9; // 10% discount
      } else if (order.customerType === 'vip') {
        total += item.price * 0.8; // 20% discount
      }
      // Adding new customer types requires modifying this method
    }

    return total;
  }
}
````

### ✅ Following OCP

```typescript
// Abstract discount strategy
interface DiscountStrategy {
  calculateDiscount(price: number): number
}

// Concrete discount implementations
class RegularCustomerDiscount implements DiscountStrategy {
  calculateDiscount(price: number): number {
    return price // No discount
  }
}

class PremiumCustomerDiscount implements DiscountStrategy {
  calculateDiscount(price: number): number {
    return price * 0.9 // 10% discount
  }
}

class VipCustomerDiscount implements DiscountStrategy {
  calculateDiscount(price: number): number {
    return price * 0.8 // 20% discount
  }
}

// New customer types can be added without modifying existing code
class CorporateCustomerDiscount implements DiscountStrategy {
  calculateDiscount(price: number): number {
    return price * 0.75 // 25% discount
  }
}

// Calculator is closed for modification, open for extension
class OrderCalculator {
  calculateTotal(order: Order, discountStrategy: DiscountStrategy): number {
    let total = 0

    for (const item of order.items) {
      total += discountStrategy.calculateDiscount(item.price)
    }

    return total
  }
}

// Usage
const calculator = new OrderCalculator()
const regularOrder = calculator.calculateTotal(order, new RegularCustomerDiscount())
const premiumOrder = calculator.calculateTotal(order, new PremiumCustomerDiscount())
```

## L - Liskov Substitution Principle (LSP)

**"Objects of a superclass should be replaceable with objects of a subclass without altering correctness."**

Derived classes must be substitutable for their base classes.

### ❌ Violating LSP

```typescript
class Bird {
  fly(): void {
    console.log('Flying...')
  }
}

class Eagle extends Bird {
  fly(): void {
    console.log('Eagle soaring high...')
  }
}

// Penguin cannot fly, violating LSP
class Penguin extends Bird {
  fly(): void {
    throw new Error('Penguins cannot fly!')
  }
}

// This will break for Penguin
function makeBirdFly(bird: Bird): void {
  bird.fly() // Will throw error for Penguin
}
```

### ✅ Following LSP

```typescript
// Base interface for all birds
interface Bird {
  eat(): void
  sleep(): void
}

// Separate interface for flying capability
interface FlyingBird extends Bird {
  fly(): void
}

// Separate interface for swimming capability
interface SwimmingBird extends Bird {
  swim(): void
}

class Eagle implements FlyingBird {
  eat(): void {
    console.log('Eagle hunting...')
  }

  sleep(): void {
    console.log('Eagle sleeping...')
  }

  fly(): void {
    console.log('Eagle soaring high...')
  }
}

class Penguin implements SwimmingBird {
  eat(): void {
    console.log('Penguin eating fish...')
  }

  sleep(): void {
    console.log('Penguin sleeping...')
  }

  swim(): void {
    console.log('Penguin swimming...')
  }
}

// Functions work with appropriate interfaces
function makeFlyingBirdFly(bird: FlyingBird): void {
  bird.fly() // Safe for all flying birds
}

function makeSwimmingBirdSwim(bird: SwimmingBird): void {
  bird.swim() // Safe for all swimming birds
}
```

## I - Interface Segregation Principle (ISP)

**"Clients should not be forced to depend on interfaces they do not use."**

Create specific, focused interfaces rather than large, monolithic ones.

### ❌ Violating ISP

```typescript
// Large interface with mixed responsibilities
interface Worker {
  work(): void
  eat(): void
  sleep(): void
  code(): void
  design(): void
  test(): void
  deploy(): void
}

// Human worker implements all methods
class Developer implements Worker {
  work(): void {
    console.log('Working...')
  }
  eat(): void {
    console.log('Eating...')
  }
  sleep(): void {
    console.log('Sleeping...')
  }
  code(): void {
    console.log('Coding...')
  }
  design(): void {
    console.log('Designing...')
  }
  test(): void {
    console.log('Testing...')
  }
  deploy(): void {
    console.log('Deploying...')
  }
}

// Robot worker forced to implement human methods
class RobotWorker implements Worker {
  work(): void {
    console.log('Working...')
  }
  eat(): void {
    throw new Error('Robots do not eat!')
  }
  sleep(): void {
    throw new Error('Robots do not sleep!')
  }
  code(): void {
    console.log('Coding...')
  }
  design(): void {
    throw new Error('Robots cannot design!')
  }
  test(): void {
    console.log('Testing...')
  }
  deploy(): void {
    console.log('Deploying...')
  }
}
```

### ✅ Following ISP

```typescript
// Segregated interfaces based on specific capabilities
interface Workable {
  work(): void
}

interface Eatable {
  eat(): void
}

interface Sleepable {
  sleep(): void
}

interface Codeable {
  code(): void
}

interface Designable {
  design(): void
}

interface Testable {
  test(): void
}

interface Deployable {
  deploy(): void
}

// Human developer implements relevant interfaces
class Developer implements Workable, Eatable, Sleepable, Codeable, Designable, Testable {
  work(): void {
    console.log('Working...')
  }
  eat(): void {
    console.log('Eating...')
  }
  sleep(): void {
    console.log('Sleeping...')
  }
  code(): void {
    console.log('Coding...')
  }
  design(): void {
    console.log('Designing...')
  }
  test(): void {
    console.log('Testing...')
  }
}

// Robot only implements what it can do
class RobotWorker implements Workable, Codeable, Testable, Deployable {
  work(): void {
    console.log('Working...')
  }
  code(): void {
    console.log('Coding...')
  }
  test(): void {
    console.log('Testing...')
  }
  deploy(): void {
    console.log('Deploying...')
  }
}

// Specialized interfaces for specific worker types
interface HumanWorker extends Workable, Eatable, Sleepable {}
interface AutomatedWorker extends Workable, Deployable {}
```

## D - Dependency Inversion Principle (DIP)

**"High-level modules should not depend on low-level modules. Both should depend on abstractions."**

Depend on abstractions, not concretions.

### ❌ Violating DIP

```typescript
// Low-level modules (concrete implementations)
class MySQLDatabase {
  save(data: any): void {
    console.log('Saving to MySQL database...')
  }
}

class EmailService {
  sendEmail(to: string, message: string): void {
    console.log(`Sending email to ${to}: ${message}`)
  }
}

// High-level module depending on concrete implementations
class UserService {
  private database = new MySQLDatabase() // Direct dependency
  private emailService = new EmailService() // Direct dependency

  createUser(userData: any): void {
    this.database.save(userData) // Tightly coupled to MySQL
    this.emailService.sendEmail(userData.email, 'Welcome!') // Tightly coupled to EmailService
  }
}
```

### ✅ Following DIP

```typescript
// Abstractions (interfaces)
interface Database {
  save(data: any): Promise<void>
}

interface NotificationService {
  sendNotification(to: string, message: string): Promise<void>
}

// Low-level modules implementing abstractions
class MySQLDatabase implements Database {
  async save(data: any): Promise<void> {
    console.log('Saving to MySQL database...')
  }
}

class PostgreSQLDatabase implements Database {
  async save(data: any): Promise<void> {
    console.log('Saving to PostgreSQL database...')
  }
}

class EmailService implements NotificationService {
  async sendNotification(to: string, message: string): Promise<void> {
    console.log(`Sending email to ${to}: ${message}`)
  }
}

class SMSService implements NotificationService {
  async sendNotification(to: string, message: string): Promise<void> {
    console.log(`Sending SMS to ${to}: ${message}`)
  }
}

// High-level module depending on abstractions
class UserService {
  constructor(
    private readonly database: Database,
    private readonly notificationService: NotificationService,
  ) {}

  async createUser(userData: any): Promise<void> {
    await this.database.save(userData) // Works with any database implementation
    await this.notificationService.sendNotification(userData.email, 'Welcome!') // Works with any notification service
  }
}

// Dependency injection setup
const database = new PostgreSQLDatabase() // Can easily switch implementations
const notificationService = new EmailService() // Can easily switch implementations
const userService = new UserService(database, notificationService)
```

## Practical Applications in TypeScript

### Repository Pattern with SOLID

```typescript
// Abstraction for data access
interface Repository<T, ID> {
  findById(id: ID): Promise<T | null>
  save(entity: T): Promise<T>
  delete(id: ID): Promise<void>
}

// Generic implementation following SOLID principles
abstract class BaseRepository<T, ID> implements Repository<T, ID> {
  constructor(protected readonly dataSource: DataSource) {}

  abstract findById(id: ID): Promise<T | null>
  abstract save(entity: T): Promise<T>
  abstract delete(id: ID): Promise<void>

  // Common functionality
  protected async executeQuery<R>(query: string, params: any[]): Promise<R> {
    return this.dataSource.query(query, params)
  }
}

// Specific implementation
class UserRepository extends BaseRepository<User, string> {
  async findById(id: string): Promise<User | null> {
    const result = await this.executeQuery<User>('SELECT * FROM users WHERE id = ?', [id])
    return result || null
  }

  async save(user: User): Promise<User> {
    await this.executeQuery('INSERT INTO users (id, email, name) VALUES (?, ?, ?)', [
      user.id,
      user.email,
      user.name,
    ])
    return user
  }

  async delete(id: string): Promise<void> {
    await this.executeQuery('DELETE FROM users WHERE id = ?', [id])
  }
}
```

### Service Layer with Dependency Injection

```typescript
// Service abstraction
interface UserService {
  createUser(userData: CreateUserRequest): Promise<User>
  getUserById(id: string): Promise<User | null>
}

// Implementation following SOLID principles
class UserServiceImpl implements UserService {
  constructor(
    private readonly userRepository: Repository<User, string>,
    private readonly validator: Validator<CreateUserRequest>,
    private readonly notificationService: NotificationService,
    private readonly logger: Logger,
  ) {}

  async createUser(userData: CreateUserRequest): Promise<User> {
    // Single responsibility: orchestration
    this.logger.info('Creating new user', { email: userData.email })

    // Delegate validation to validator
    const validation = await this.validator.validate(userData)
    if (!validation.isValid) {
      throw new ValidationError(validation.errors)
    }

    // Delegate persistence to repository
    const user = await this.userRepository.save({
      id: generateId(),
      ...userData,
      createdAt: new Date(),
    })

    // Delegate notification to notification service
    await this.notificationService.sendNotification(user.email, 'Welcome to our platform!')

    this.logger.info('User created successfully', { userId: user.id })
    return user
  }

  async getUserById(id: string): Promise<User | null> {
    return this.userRepository.findById(id)
  }
}
```

## Benefits of SOLID Principles

1. **Maintainability**: Code is easier to understand and modify
2. **Testability**: Classes with single responsibilities are easier to test
3. **Flexibility**: Easy to extend functionality without modifying existing code
4. **Reusability**: Well-designed abstractions can be reused in different contexts
5. **Reduced Coupling**: Classes depend on abstractions, not implementations

## Common SOLID Violations to Avoid

1. **God Classes**: Classes that do too many things
2. **Tight Coupling**: Direct dependencies on concrete implementations
3. **Fat Interfaces**: Interfaces with too many unrelated methods
4. **Violation of Contracts**: Subclasses that don't properly implement parent behavior
5. **Modification Over Extension**: Changing existing code instead of extending it

SOLID principles guide the creation of clean, maintainable, and testable TypeScript code that can evolve with changing requirements.

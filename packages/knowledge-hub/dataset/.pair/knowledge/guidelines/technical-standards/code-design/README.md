# Code Design Standards

## Strategic Overview

This framework establishes comprehensive code design standards that ensure maintainable, scalable, and robust software architecture through systematic application of design patterns, SOLID principles, and best practices across all development activities.

## Design Philosophy

### Core Principles

#### **1. SOLID Principles Integration**
```typescript
// Single Responsibility Principle
class UserAuthenticationService {
  constructor(
    private passwordValidator: PasswordValidator,
    private tokenGenerator: TokenGenerator,
    private userRepository: UserRepository
  ) {}

  async authenticate(credentials: UserCredentials): Promise<AuthenticationResult> {
    // Single responsibility: authenticate users
    const user = await this.userRepository.findByEmail(credentials.email);
    
    if (!user || !await this.passwordValidator.validate(credentials.password, user.hashedPassword)) {
      throw new AuthenticationError('Invalid credentials');
    }

    const token = await this.tokenGenerator.generate(user.id);
    return { user, token };
  }
}

// Open/Closed Principle
abstract class PaymentProcessor {
  abstract process(payment: Payment): Promise<PaymentResult>;
  
  protected validatePayment(payment: Payment): void {
    if (!payment.amount || payment.amount <= 0) {
      throw new PaymentError('Invalid payment amount');
    }
  }
}

class CreditCardProcessor extends PaymentProcessor {
  async process(payment: Payment): Promise<PaymentResult> {
    this.validatePayment(payment);
    // Credit card specific processing
    return await this.processCreditCard(payment);
  }
  
  private async processCreditCard(payment: Payment): Promise<PaymentResult> {
    // Implementation details
  }
}

// Liskov Substitution Principle
interface DatabaseRepository<T> {
  save(entity: T): Promise<T>;
  findById(id: string): Promise<T | null>;
  delete(id: string): Promise<void>;
}

class PostgreSQLUserRepository implements DatabaseRepository<User> {
  async save(user: User): Promise<User> {
    // PostgreSQL specific implementation
  }
  
  async findById(id: string): Promise<User | null> {
    // PostgreSQL specific implementation
  }
  
  async delete(id: string): Promise<void> {
    // PostgreSQL specific implementation
  }
}

// Interface Segregation Principle
interface Readable {
  read(): Promise<string>;
}

interface Writable {
  write(data: string): Promise<void>;
}

interface Cacheable {
  cache(key: string, data: any): Promise<void>;
  getCached(key: string): Promise<any>;
}

class FileManager implements Readable, Writable {
  async read(): Promise<string> {
    // File reading implementation
  }
  
  async write(data: string): Promise<void> {
    // File writing implementation
  }
}

// Dependency Inversion Principle
interface NotificationService {
  send(message: string, recipient: string): Promise<void>;
}

class EmailNotificationService implements NotificationService {
  async send(message: string, recipient: string): Promise<void> {
    // Email implementation
  }
}

class UserService {
  constructor(private notificationService: NotificationService) {}
  
  async createUser(userData: CreateUserData): Promise<User> {
    const user = await this.userRepository.save(new User(userData));
    await this.notificationService.send('Welcome!', user.email);
    return user;
  }
}
```

#### **2. Domain-Driven Design (DDD) Implementation**
```typescript
// Value Objects
class Email {
  private readonly value: string;

  constructor(email: string) {
    if (!this.isValid(email)) {
      throw new InvalidEmailError('Invalid email format');
    }
    this.value = email;
  }

  toString(): string {
    return this.value;
  }

  equals(other: Email): boolean {
    return this.value === other.value;
  }

  private isValid(email: string): boolean {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
  }
}

// Entities
class User {
  private constructor(
    public readonly id: UserId,
    public readonly email: Email,
    private _profile: UserProfile,
    private _createdAt: Date
  ) {}

  static create(email: Email, profile: UserProfile): User {
    return new User(
      UserId.generate(),
      email,
      profile,
      new Date()
    );
  }

  updateProfile(newProfile: UserProfile): void {
    this._profile = newProfile;
    // Emit domain event
    DomainEvents.raise(new UserProfileUpdatedEvent(this.id, newProfile));
  }

  get profile(): UserProfile {
    return this._profile;
  }

  get createdAt(): Date {
    return this._createdAt;
  }
}

// Aggregates
class Order {
  private _items: OrderItem[] = [];
  private _status: OrderStatus = OrderStatus.PENDING;

  constructor(
    public readonly id: OrderId,
    public readonly customerId: CustomerId,
    private readonly _createdAt: Date = new Date()
  ) {}

  addItem(product: Product, quantity: number): void {
    if (this._status !== OrderStatus.PENDING) {
      throw new OrderError('Cannot modify confirmed order');
    }

    const existingItem = this._items.find(item => item.productId.equals(product.id));
    
    if (existingItem) {
      existingItem.updateQuantity(quantity);
    } else {
      this._items.push(new OrderItem(product.id, quantity, product.price));
    }

    DomainEvents.raise(new OrderItemAddedEvent(this.id, product.id, quantity));
  }

  confirm(): void {
    if (this._items.length === 0) {
      throw new OrderError('Cannot confirm empty order');
    }

    this._status = OrderStatus.CONFIRMED;
    DomainEvents.raise(new OrderConfirmedEvent(this.id, this.getTotalAmount()));
  }

  getTotalAmount(): Money {
    return this._items.reduce(
      (total, item) => total.add(item.getSubtotal()),
      Money.zero()
    );
  }

  get items(): readonly OrderItem[] {
    return [...this._items];
  }

  get status(): OrderStatus {
    return this._status;
  }
}

// Domain Services
class OrderPricingService {
  constructor(
    private discountService: DiscountService,
    private taxService: TaxService
  ) {}

  calculateTotalPrice(order: Order, customer: Customer): Money {
    const subtotal = order.getTotalAmount();
    const discount = this.discountService.calculateDiscount(order, customer);
    const tax = this.taxService.calculateTax(subtotal.subtract(discount), customer.location);
    
    return subtotal.subtract(discount).add(tax);
  }
}
```

#### **3. Clean Architecture Implementation**
```typescript
// Domain Layer - Core Business Logic
export namespace Domain {
  export interface UserRepository {
    save(user: User): Promise<void>;
    findById(id: UserId): Promise<User | null>;
    findByEmail(email: Email): Promise<User | null>;
  }

  export class CreateUserUseCase {
    constructor(
      private userRepository: UserRepository,
      private emailService: EmailService,
      private passwordService: PasswordService
    ) {}

    async execute(command: CreateUserCommand): Promise<User> {
      // Validate business rules
      const existingUser = await this.userRepository.findByEmail(command.email);
      if (existingUser) {
        throw new UserAlreadyExistsError();
      }

      // Create user entity
      const hashedPassword = await this.passwordService.hash(command.password);
      const user = User.create(command.email, command.profile, hashedPassword);

      // Persist and notify
      await this.userRepository.save(user);
      await this.emailService.sendWelcomeEmail(user.email);

      return user;
    }
  }
}

// Application Layer - Use Case Orchestration
export namespace Application {
  export class UserController {
    constructor(
      private createUserUseCase: Domain.CreateUserUseCase,
      private getUserUseCase: Domain.GetUserUseCase
    ) {}

    async createUser(request: CreateUserRequest): Promise<CreateUserResponse> {
      try {
        const command = new Domain.CreateUserCommand(
          new Email(request.email),
          new UserProfile(request.name, request.bio),
          request.password
        );

        const user = await this.createUserUseCase.execute(command);

        return {
          id: user.id.toString(),
          email: user.email.toString(),
          profile: {
            name: user.profile.name,
            bio: user.profile.bio
          },
          createdAt: user.createdAt
        };
      } catch (error) {
        if (error instanceof Domain.UserAlreadyExistsError) {
          throw new HttpError(409, 'User already exists');
        }
        throw error;
      }
    }
  }
}

// Infrastructure Layer - External Dependencies
export namespace Infrastructure {
  export class PostgreSQLUserRepository implements Domain.UserRepository {
    constructor(private database: Database) {}

    async save(user: Domain.User): Promise<void> {
      await this.database.query(
        'INSERT INTO users (id, email, name, bio, password_hash, created_at) VALUES ($1, $2, $3, $4, $5, $6)',
        [
          user.id.toString(),
          user.email.toString(),
          user.profile.name,
          user.profile.bio,
          user.passwordHash,
          user.createdAt
        ]
      );
    }

    async findById(id: Domain.UserId): Promise<Domain.User | null> {
      const result = await this.database.query(
        'SELECT * FROM users WHERE id = $1',
        [id.toString()]
      );

      if (result.rows.length === 0) {
        return null;
      }

      return this.mapToUser(result.rows[0]);
    }

    private mapToUser(row: any): Domain.User {
      return Domain.User.fromPersistence({
        id: new Domain.UserId(row.id),
        email: new Email(row.email),
        profile: new Domain.UserProfile(row.name, row.bio),
        passwordHash: row.password_hash,
        createdAt: row.created_at
      });
    }
  }
}
```

## Advanced Design Patterns

### Behavioral Patterns

#### **Command Pattern with Event Sourcing**
```typescript
// Command Infrastructure
abstract class Command {
  abstract execute(): Promise<void>;
  abstract undo(): Promise<void>;
}

class CommandBus {
  private history: Command[] = [];

  async execute(command: Command): Promise<void> {
    await command.execute();
    this.history.push(command);
  }

  async undo(): Promise<void> {
    const lastCommand = this.history.pop();
    if (lastCommand) {
      await lastCommand.undo();
    }
  }
}

// Specific Commands
class CreateOrderCommand extends Command {
  constructor(
    private orderData: CreateOrderData,
    private orderRepository: OrderRepository,
    private eventStore: EventStore
  ) {
    super();
  }

  async execute(): Promise<void> {
    const order = Order.create(this.orderData);
    await this.orderRepository.save(order);
    
    // Store events for event sourcing
    const events = order.getUncommittedEvents();
    await this.eventStore.saveEvents(order.id, events);
    order.markEventsAsCommitted();
  }

  async undo(): Promise<void> {
    // Compensating action
    await this.orderRepository.delete(this.orderData.id);
    
    // Store compensation event
    const compensationEvent = new OrderCreationCompensatedEvent(this.orderData.id);
    await this.eventStore.saveEvents(this.orderData.id, [compensationEvent]);
  }
}

// Event Sourcing Implementation
class EventStore {
  async saveEvents(aggregateId: string, events: DomainEvent[]): Promise<void> {
    for (const event of events) {
      await this.database.query(
        'INSERT INTO events (aggregate_id, event_type, event_data, version, timestamp) VALUES ($1, $2, $3, $4, $5)',
        [
          aggregateId,
          event.constructor.name,
          JSON.stringify(event),
          event.version,
          event.timestamp
        ]
      );
    }
  }

  async getEvents(aggregateId: string): Promise<DomainEvent[]> {
    const result = await this.database.query(
      'SELECT * FROM events WHERE aggregate_id = $1 ORDER BY version',
      [aggregateId]
    );

    return result.rows.map(row => this.deserializeEvent(row));
  }

  private deserializeEvent(row: any): DomainEvent {
    const EventClass = this.getEventClass(row.event_type);
    return new EventClass(JSON.parse(row.event_data));
  }
}
```

#### **Observer Pattern with Domain Events**
```typescript
// Event System
interface DomainEvent {
  readonly aggregateId: string;
  readonly eventId: string;
  readonly timestamp: Date;
  readonly version: number;
}

class DomainEvents {
  private static handlers: Map<string, EventHandler[]> = new Map();
  private static events: DomainEvent[] = [];

  static register<T extends DomainEvent>(
    eventType: new (...args: any[]) => T,
    handler: EventHandler<T>
  ): void {
    const eventName = eventType.name;
    const handlers = this.handlers.get(eventName) || [];
    handlers.push(handler);
    this.handlers.set(eventName, handlers);
  }

  static raise(event: DomainEvent): void {
    this.events.push(event);
  }

  static async dispatchEvents(): Promise<void> {
    for (const event of this.events) {
      const handlers = this.handlers.get(event.constructor.name) || [];
      
      await Promise.all(
        handlers.map(handler => 
          handler.handle(event).catch(error => 
            console.error(`Event handler failed: ${error.message}`, { event, error })
          )
        )
      );
    }
    
    this.events = [];
  }
}

// Event Handlers
interface EventHandler<T extends DomainEvent = DomainEvent> {
  handle(event: T): Promise<void>;
}

class SendWelcomeEmailHandler implements EventHandler<UserCreatedEvent> {
  constructor(private emailService: EmailService) {}

  async handle(event: UserCreatedEvent): Promise<void> {
    await this.emailService.sendWelcomeEmail(event.userEmail);
  }
}

class UpdateUserStatsHandler implements EventHandler<UserCreatedEvent> {
  constructor(private analyticsService: AnalyticsService) {}

  async handle(event: UserCreatedEvent): Promise<void> {
    await this.analyticsService.incrementUserCount();
  }
}

// Event Registration
DomainEvents.register(UserCreatedEvent, new SendWelcomeEmailHandler(emailService));
DomainEvents.register(UserCreatedEvent, new UpdateUserStatsHandler(analyticsService));
```

#### **Strategy Pattern for Business Rules**
```typescript
// Strategy Interface
interface PricingStrategy {
  calculatePrice(order: Order, customer: Customer): Money;
}

// Concrete Strategies
class RegularPricingStrategy implements PricingStrategy {
  calculatePrice(order: Order, customer: Customer): Money {
    return order.getTotalAmount();
  }
}

class VIPPricingStrategy implements PricingStrategy {
  constructor(private discountPercentage: number = 0.1) {}

  calculatePrice(order: Order, customer: Customer): Money {
    const total = order.getTotalAmount();
    const discount = total.multiply(this.discountPercentage);
    return total.subtract(discount);
  }
}

class BulkPricingStrategy implements PricingStrategy {
  constructor(
    private minimumQuantity: number = 10,
    private discountPercentage: number = 0.15
  ) {}

  calculatePrice(order: Order, customer: Customer): Money {
    const total = order.getTotalAmount();
    const totalQuantity = order.items.reduce((sum, item) => sum + item.quantity, 0);
    
    if (totalQuantity >= this.minimumQuantity) {
      const discount = total.multiply(this.discountPercentage);
      return total.subtract(discount);
    }
    
    return total;
  }
}

// Context
class PricingService {
  private strategies: Map<CustomerType, PricingStrategy> = new Map([
    [CustomerType.REGULAR, new RegularPricingStrategy()],
    [CustomerType.VIP, new VIPPricingStrategy()],
    [CustomerType.BULK, new BulkPricingStrategy()]
  ]);

  calculatePrice(order: Order, customer: Customer): Money {
    const strategy = this.strategies.get(customer.type);
    if (!strategy) {
      throw new Error(`No pricing strategy for customer type: ${customer.type}`);
    }
    
    return strategy.calculatePrice(order, customer);
  }

  addStrategy(customerType: CustomerType, strategy: PricingStrategy): void {
    this.strategies.set(customerType, strategy);
  }
}
```

### Structural Patterns

#### **Adapter Pattern for Third-Party Integration**
```typescript
// Target Interface
interface PaymentGateway {
  processPayment(amount: Money, paymentMethod: PaymentMethod): Promise<PaymentResult>;
  refundPayment(transactionId: string, amount: Money): Promise<RefundResult>;
}

// Third-Party Service (Adaptee)
class StripePaymentService {
  async charge(amountInCents: number, cardToken: string): Promise<StripeChargeResult> {
    // Stripe-specific implementation
  }

  async refund(chargeId: string, amountInCents?: number): Promise<StripeRefundResult> {
    // Stripe-specific implementation
  }
}

// Adapter Implementation
class StripePaymentAdapter implements PaymentGateway {
  constructor(private stripeService: StripePaymentService) {}

  async processPayment(amount: Money, paymentMethod: PaymentMethod): Promise<PaymentResult> {
    try {
      const amountInCents = amount.toCents();
      const cardToken = this.extractCardToken(paymentMethod);
      
      const stripeResult = await this.stripeService.charge(amountInCents, cardToken);
      
      return {
        success: true,
        transactionId: stripeResult.id,
        amount: amount,
        timestamp: new Date(stripeResult.created * 1000)
      };
    } catch (error) {
      return {
        success: false,
        error: this.mapStripeError(error),
        timestamp: new Date()
      };
    }
  }

  async refundPayment(transactionId: string, amount: Money): Promise<RefundResult> {
    try {
      const amountInCents = amount.toCents();
      const stripeResult = await this.stripeService.refund(transactionId, amountInCents);
      
      return {
        success: true,
        refundId: stripeResult.id,
        amount: amount,
        timestamp: new Date(stripeResult.created * 1000)
      };
    } catch (error) {
      return {
        success: false,
        error: this.mapStripeError(error),
        timestamp: new Date()
      };
    }
  }

  private extractCardToken(paymentMethod: PaymentMethod): string {
    if (paymentMethod.type !== 'card') {
      throw new Error('Stripe adapter only supports card payments');
    }
    return paymentMethod.token;
  }

  private mapStripeError(error: any): PaymentError {
    // Map Stripe errors to domain errors
    switch (error.type) {
      case 'card_error':
        return new PaymentError('CARD_DECLINED', error.message);
      case 'rate_limit_error':
        return new PaymentError('RATE_LIMIT', 'Too many requests');
      default:
        return new PaymentError('UNKNOWN', 'Payment processing failed');
    }
  }
}

// Usage with Dependency Injection
class PaymentService {
  constructor(private paymentGateway: PaymentGateway) {}

  async processOrderPayment(order: Order, paymentMethod: PaymentMethod): Promise<void> {
    const amount = order.getTotalAmount();
    const result = await this.paymentGateway.processPayment(amount, paymentMethod);
    
    if (result.success) {
      order.markAsPaid(result.transactionId);
    } else {
      throw new PaymentProcessingError(result.error.message);
    }
  }
}
```

#### **Decorator Pattern for Cross-Cutting Concerns**
```typescript
// Base Interface
interface UserService {
  createUser(userData: CreateUserData): Promise<User>;
  updateUser(id: string, userData: UpdateUserData): Promise<User>;
  deleteUser(id: string): Promise<void>;
}

// Base Implementation
class BaseUserService implements UserService {
  constructor(private userRepository: UserRepository) {}

  async createUser(userData: CreateUserData): Promise<User> {
    const user = User.create(userData);
    await this.userRepository.save(user);
    return user;
  }

  async updateUser(id: string, userData: UpdateUserData): Promise<User> {
    const user = await this.userRepository.findById(id);
    if (!user) {
      throw new UserNotFoundError();
    }
    
    user.update(userData);
    await this.userRepository.save(user);
    return user;
  }

  async deleteUser(id: string): Promise<void> {
    await this.userRepository.delete(id);
  }
}

// Decorators
class LoggingUserServiceDecorator implements UserService {
  constructor(
    private userService: UserService,
    private logger: Logger
  ) {}

  async createUser(userData: CreateUserData): Promise<User> {
    this.logger.info('Creating user', { email: userData.email });
    
    try {
      const user = await this.userService.createUser(userData);
      this.logger.info('User created successfully', { userId: user.id });
      return user;
    } catch (error) {
      this.logger.error('Failed to create user', { error: error.message, userData });
      throw error;
    }
  }

  async updateUser(id: string, userData: UpdateUserData): Promise<User> {
    this.logger.info('Updating user', { userId: id });
    
    try {
      const user = await this.userService.updateUser(id, userData);
      this.logger.info('User updated successfully', { userId: id });
      return user;
    } catch (error) {
      this.logger.error('Failed to update user', { error: error.message, userId: id });
      throw error;
    }
  }

  async deleteUser(id: string): Promise<void> {
    this.logger.info('Deleting user', { userId: id });
    
    try {
      await this.userService.deleteUser(id);
      this.logger.info('User deleted successfully', { userId: id });
    } catch (error) {
      this.logger.error('Failed to delete user', { error: error.message, userId: id });
      throw error;
    }
  }
}

class CachingUserServiceDecorator implements UserService {
  constructor(
    private userService: UserService,
    private cache: Cache
  ) {}

  async createUser(userData: CreateUserData): Promise<User> {
    const user = await this.userService.createUser(userData);
    await this.cache.set(`user:${user.id}`, user, 3600); // Cache for 1 hour
    return user;
  }

  async updateUser(id: string, userData: UpdateUserData): Promise<User> {
    const user = await this.userService.updateUser(id, userData);
    await this.cache.set(`user:${user.id}`, user, 3600);
    await this.cache.delete(`user:${id}`); // Clear old cache
    return user;
  }

  async deleteUser(id: string): Promise<void> {
    await this.userService.deleteUser(id);
    await this.cache.delete(`user:${id}`);
  }
}

class ValidationUserServiceDecorator implements UserService {
  constructor(
    private userService: UserService,
    private validator: Validator
  ) {}

  async createUser(userData: CreateUserData): Promise<User> {
    await this.validator.validate(userData, CreateUserSchema);
    return this.userService.createUser(userData);
  }

  async updateUser(id: string, userData: UpdateUserData): Promise<User> {
    await this.validator.validate(userData, UpdateUserSchema);
    return this.userService.updateUser(id, userData);
  }

  async deleteUser(id: string): Promise<void> {
    if (!id || typeof id !== 'string') {
      throw new ValidationError('Invalid user ID');
    }
    return this.userService.deleteUser(id);
  }
}

// Decorator Composition
function createUserService(
  userRepository: UserRepository,
  logger: Logger,
  cache: Cache,
  validator: Validator
): UserService {
  const baseService = new BaseUserService(userRepository);
  const validatedService = new ValidationUserServiceDecorator(baseService, validator);
  const cachedService = new CachingUserServiceDecorator(validatedService, cache);
  const loggedService = new LoggingUserServiceDecorator(cachedService, logger);
  
  return loggedService;
}
```

### Creational Patterns

#### **Factory Pattern with Configuration**
```typescript
// Product Interface
interface Database {
  connect(): Promise<void>;
  query(sql: string, params?: any[]): Promise<QueryResult>;
  disconnect(): Promise<void>;
}

// Concrete Products
class PostgreSQLDatabase implements Database {
  constructor(private config: PostgreSQLConfig) {}

  async connect(): Promise<void> {
    // PostgreSQL connection logic
  }

  async query(sql: string, params?: any[]): Promise<QueryResult> {
    // PostgreSQL query execution
  }

  async disconnect(): Promise<void> {
    // PostgreSQL disconnection logic
  }
}

class MySQLDatabase implements Database {
  constructor(private config: MySQLConfig) {}

  async connect(): Promise<void> {
    // MySQL connection logic
  }

  async query(sql: string, params?: any[]): Promise<QueryResult> {
    // MySQL query execution
  }

  async disconnect(): Promise<void> {
    // MySQL disconnection logic
  }
}

// Abstract Factory
abstract class DatabaseFactory {
  abstract createDatabase(config: DatabaseConfig): Database;
  
  static create(type: DatabaseType): DatabaseFactory {
    switch (type) {
      case DatabaseType.POSTGRESQL:
        return new PostgreSQLDatabaseFactory();
      case DatabaseType.MYSQL:
        return new MySQLDatabaseFactory();
      default:
        throw new Error(`Unsupported database type: ${type}`);
    }
  }
}

// Concrete Factories
class PostgreSQLDatabaseFactory extends DatabaseFactory {
  createDatabase(config: DatabaseConfig): Database {
    const pgConfig = this.validatePostgreSQLConfig(config);
    return new PostgreSQLDatabase(pgConfig);
  }

  private validatePostgreSQLConfig(config: DatabaseConfig): PostgreSQLConfig {
    // Validate and transform config for PostgreSQL
    return {
      host: config.host,
      port: config.port || 5432,
      database: config.database,
      username: config.username,
      password: config.password,
      ssl: config.ssl || false,
      poolSize: config.poolSize || 10
    };
  }
}

class MySQLDatabaseFactory extends DatabaseFactory {
  createDatabase(config: DatabaseConfig): Database {
    const mysqlConfig = this.validateMySQLConfig(config);
    return new MySQLDatabase(mysqlConfig);
  }

  private validateMySQLConfig(config: DatabaseConfig): MySQLConfig {
    // Validate and transform config for MySQL
    return {
      host: config.host,
      port: config.port || 3306,
      database: config.database,
      user: config.username,
      password: config.password,
      ssl: config.ssl || false,
      connectionLimit: config.poolSize || 10
    };
  }
}

// Usage
class DatabaseManager {
  private database: Database;

  async initialize(config: DatabaseConfig): Promise<void> {
    const factory = DatabaseFactory.create(config.type);
    this.database = factory.createDatabase(config);
    await this.database.connect();
  }

  async query(sql: string, params?: any[]): Promise<QueryResult> {
    return this.database.query(sql, params);
  }

  async shutdown(): Promise<void> {
    await this.database.disconnect();
  }
}
```

#### **Builder Pattern for Complex Object Construction**
```typescript
// Complex Product
class ApiEndpoint {
  public readonly path: string;
  public readonly method: HttpMethod;
  public readonly middleware: Middleware[];
  public readonly validation: ValidationSchema;
  public readonly authentication: AuthenticationConfig;
  public readonly rateLimit: RateLimitConfig;
  public readonly caching: CachingConfig;
  public readonly documentation: ApiDocumentation;

  constructor(
    path: string,
    method: HttpMethod,
    middleware: Middleware[],
    validation: ValidationSchema,
    authentication: AuthenticationConfig,
    rateLimit: RateLimitConfig,
    caching: CachingConfig,
    documentation: ApiDocumentation
  ) {
    this.path = path;
    this.method = method;
    this.middleware = middleware;
    this.validation = validation;
    this.authentication = authentication;
    this.rateLimit = rateLimit;
    this.caching = caching;
    this.documentation = documentation;
  }
}

// Builder Interface
interface ApiEndpointBuilder {
  setPath(path: string): ApiEndpointBuilder;
  setMethod(method: HttpMethod): ApiEndpointBuilder;
  addMiddleware(middleware: Middleware): ApiEndpointBuilder;
  setValidation(schema: ValidationSchema): ApiEndpointBuilder;
  setAuthentication(config: AuthenticationConfig): ApiEndpointBuilder;
  setRateLimit(config: RateLimitConfig): ApiEndpointBuilder;
  setCaching(config: CachingConfig): ApiEndpointBuilder;
  setDocumentation(docs: ApiDocumentation): ApiEndpointBuilder;
  build(): ApiEndpoint;
}

// Concrete Builder
class RestApiEndpointBuilder implements ApiEndpointBuilder {
  private path: string = '';
  private method: HttpMethod = HttpMethod.GET;
  private middleware: Middleware[] = [];
  private validation: ValidationSchema = {};
  private authentication: AuthenticationConfig = { required: false };
  private rateLimit: RateLimitConfig = { enabled: false };
  private caching: CachingConfig = { enabled: false };
  private documentation: ApiDocumentation = { summary: '', description: '' };

  setPath(path: string): ApiEndpointBuilder {
    this.path = path;
    return this;
  }

  setMethod(method: HttpMethod): ApiEndpointBuilder {
    this.method = method;
    return this;
  }

  addMiddleware(middleware: Middleware): ApiEndpointBuilder {
    this.middleware.push(middleware);
    return this;
  }

  setValidation(schema: ValidationSchema): ApiEndpointBuilder {
    this.validation = schema;
    return this;
  }

  setAuthentication(config: AuthenticationConfig): ApiEndpointBuilder {
    this.authentication = config;
    return this;
  }

  setRateLimit(config: RateLimitConfig): ApiEndpointBuilder {
    this.rateLimit = config;
    return this;
  }

  setCaching(config: CachingConfig): ApiEndpointBuilder {
    this.caching = config;
    return this;
  }

  setDocumentation(docs: ApiDocumentation): ApiEndpointBuilder {
    this.documentation = docs;
    return this;
  }

  build(): ApiEndpoint {
    this.validate();
    
    return new ApiEndpoint(
      this.path,
      this.method,
      [...this.middleware],
      this.validation,
      this.authentication,
      this.rateLimit,
      this.caching,
      this.documentation
    );
  }

  private validate(): void {
    if (!this.path) {
      throw new Error('Path is required for API endpoint');
    }
    
    if (this.authentication.required && !this.authentication.strategy) {
      throw new Error('Authentication strategy is required when authentication is enabled');
    }
    
    if (this.rateLimit.enabled && !this.rateLimit.maxRequests) {
      throw new Error('Max requests is required when rate limiting is enabled');
    }
  }
}

// Director (Optional)
class ApiEndpointDirector {
  constructor(private builder: ApiEndpointBuilder) {}

  buildPublicGetEndpoint(path: string, docs: ApiDocumentation): ApiEndpoint {
    return this.builder
      .setPath(path)
      .setMethod(HttpMethod.GET)
      .addMiddleware(new LoggingMiddleware())
      .addMiddleware(new CorsMiddleware())
      .setAuthentication({ required: false })
      .setRateLimit({ enabled: true, maxRequests: 100, windowMs: 60000 })
      .setCaching({ enabled: true, ttl: 300 })
      .setDocumentation(docs)
      .build();
  }

  buildProtectedPostEndpoint(
    path: string,
    validation: ValidationSchema,
    docs: ApiDocumentation
  ): ApiEndpoint {
    return this.builder
      .setPath(path)
      .setMethod(HttpMethod.POST)
      .addMiddleware(new LoggingMiddleware())
      .addMiddleware(new CorsMiddleware())
      .addMiddleware(new ValidationMiddleware())
      .setValidation(validation)
      .setAuthentication({ 
        required: true, 
        strategy: AuthStrategy.JWT,
        roles: ['user', 'admin']
      })
      .setRateLimit({ enabled: true, maxRequests: 50, windowMs: 60000 })
      .setCaching({ enabled: false })
      .setDocumentation(docs)
      .build();
  }
}

// Usage
const builder = new RestApiEndpointBuilder();
const director = new ApiEndpointDirector(builder);

// Simple usage
const endpoint = builder
  .setPath('/api/users')
  .setMethod(HttpMethod.GET)
  .addMiddleware(new LoggingMiddleware())
  .setAuthentication({ required: true, strategy: AuthStrategy.JWT })
  .setDocumentation({ summary: 'Get users', description: 'Retrieve all users' })
  .build();

// Director usage
const publicEndpoint = director.buildPublicGetEndpoint('/api/products', {
  summary: 'Get products',
  description: 'Retrieve all products'
});

const protectedEndpoint = director.buildProtectedPostEndpoint(
  '/api/users',
  { body: CreateUserSchema },
  { summary: 'Create user', description: 'Create a new user' }
);
```

## Error Handling and Resilience Patterns

### Exception Hierarchy and Handling

#### **Domain-Specific Exception Hierarchy**
```typescript
// Base Error Classes
abstract class DomainError extends Error {
  abstract readonly code: string;
  abstract readonly statusCode: number;
  
  constructor(message: string, public readonly context?: any) {
    super(message);
    this.name = this.constructor.name;
    Error.captureStackTrace(this, this.constructor);
  }
  
  toJSON() {
    return {
      name: this.name,
      code: this.code,
      message: this.message,
      statusCode: this.statusCode,
      context: this.context
    };
  }
}

// Business Logic Errors
class BusinessRuleViolationError extends DomainError {
  readonly code = 'BUSINESS_RULE_VIOLATION';
  readonly statusCode = 400;
}

class InsufficientFundsError extends BusinessRuleViolationError {
  readonly code = 'INSUFFICIENT_FUNDS';
  
  constructor(requiredAmount: Money, availableAmount: Money) {
    super(`Insufficient funds: required ${requiredAmount}, available ${availableAmount}`);
    this.context = { requiredAmount, availableAmount };
  }
}

class OrderLimitExceededError extends BusinessRuleViolationError {
  readonly code = 'ORDER_LIMIT_EXCEEDED';
  
  constructor(limit: number, attempted: number) {
    super(`Order limit exceeded: limit ${limit}, attempted ${attempted}`);
    this.context = { limit, attempted };
  }
}

// Validation Errors
class ValidationError extends DomainError {
  readonly code = 'VALIDATION_ERROR';
  readonly statusCode = 422;
  
  constructor(message: string, public readonly violations: ValidationViolation[]) {
    super(message);
    this.context = { violations };
  }
}

// Resource Errors
class ResourceError extends DomainError {
  readonly statusCode = 404;
}

class UserNotFoundError extends ResourceError {
  readonly code = 'USER_NOT_FOUND';
  
  constructor(identifier: string) {
    super(`User not found: ${identifier}`);
    this.context = { identifier };
  }
}

class ProductNotFoundError extends ResourceError {
  readonly code = 'PRODUCT_NOT_FOUND';
  
  constructor(productId: string) {
    super(`Product not found: ${productId}`);
    this.context = { productId };
  }
}

// Infrastructure Errors
class InfrastructureError extends DomainError {
  readonly statusCode = 500;
}

class DatabaseConnectionError extends InfrastructureError {
  readonly code = 'DATABASE_CONNECTION_ERROR';
}

class ExternalServiceError extends InfrastructureError {
  readonly code = 'EXTERNAL_SERVICE_ERROR';
  
  constructor(serviceName: string, originalError: Error) {
    super(`External service error: ${serviceName} - ${originalError.message}`);
    this.context = { serviceName, originalError: originalError.message };
  }
}
```

#### **Result Pattern for Error Handling**
```typescript
// Result Type
type Result<T, E = Error> = Success<T> | Failure<E>;

class Success<T> {
  readonly isSuccess = true;
  readonly isFailure = false;
  
  constructor(public readonly value: T) {}
  
  map<U>(fn: (value: T) => U): Result<U, never> {
    return new Success(fn(this.value));
  }
  
  flatMap<U, F>(fn: (value: T) => Result<U, F>): Result<U, F> {
    return fn(this.value);
  }
  
  mapError<F>(fn: (error: never) => F): Result<T, F> {
    return this as any;
  }
}

class Failure<E> {
  readonly isSuccess = false;
  readonly isFailure = true;
  
  constructor(public readonly error: E) {}
  
  map<U>(fn: (value: never) => U): Result<U, E> {
    return this as any;
  }
  
  flatMap<U, F>(fn: (value: never) => Result<U, F>): Result<U, E> {
    return this as any;
  }
  
  mapError<F>(fn: (error: E) => F): Result<never, F> {
    return new Failure(fn(this.error));
  }
}

// Helper Functions
function success<T>(value: T): Success<T> {
  return new Success(value);
}

function failure<E>(error: E): Failure<E> {
  return new Failure(error);
}

// Usage in Domain Services
class UserService {
  constructor(
    private userRepository: UserRepository,
    private emailService: EmailService
  ) {}

  async createUser(userData: CreateUserData): Promise<Result<User, ValidationError | UserAlreadyExistsError | InfrastructureError>> {
    // Validation
    const validationResult = this.validateUserData(userData);
    if (validationResult.isFailure) {
      return validationResult;
    }

    // Check if user exists
    const existingUserResult = await this.userRepository.findByEmail(userData.email);
    if (existingUserResult.isFailure) {
      return failure(new InfrastructureError('Failed to check existing user'));
    }
    
    if (existingUserResult.value !== null) {
      return failure(new UserAlreadyExistsError(userData.email));
    }

    // Create user
    const user = User.create(userData);
    const saveResult = await this.userRepository.save(user);
    if (saveResult.isFailure) {
      return failure(new InfrastructureError('Failed to save user'));
    }

    // Send welcome email (don't fail the operation if this fails)
    this.emailService.sendWelcomeEmail(user.email).catch(error => 
      console.error('Failed to send welcome email:', error)
    );

    return success(user);
  }

  private validateUserData(userData: CreateUserData): Result<CreateUserData, ValidationError> {
    const violations: ValidationViolation[] = [];

    if (!userData.email || !this.isValidEmail(userData.email)) {
      violations.push({ field: 'email', message: 'Invalid email format' });
    }

    if (!userData.password || userData.password.length < 8) {
      violations.push({ field: 'password', message: 'Password must be at least 8 characters' });
    }

    if (violations.length > 0) {
      return failure(new ValidationError('Validation failed', violations));
    }

    return success(userData);
  }
}

// Usage in Controllers
class UserController {
  constructor(private userService: UserService) {}

  async createUser(request: CreateUserRequest): Promise<CreateUserResponse> {
    const result = await this.userService.createUser(request.body);

    if (result.isSuccess) {
      return {
        success: true,
        data: {
          id: result.value.id,
          email: result.value.email,
          createdAt: result.value.createdAt
        }
      };
    }

    // Handle different error types
    if (result.error instanceof ValidationError) {
      throw new HttpError(422, 'Validation failed', result.error.violations);
    }

    if (result.error instanceof UserAlreadyExistsError) {
      throw new HttpError(409, 'User already exists');
    }

    if (result.error instanceof InfrastructureError) {
      console.error('Infrastructure error:', result.error);
      throw new HttpError(500, 'Internal server error');
    }

    // This should never happen, but TypeScript ensures we handle all cases
    throw new HttpError(500, 'Unknown error');
  }
}
```

### Circuit Breaker and Retry Patterns

#### **Circuit Breaker Implementation**
```typescript
// Circuit Breaker States
enum CircuitBreakerState {
  CLOSED = 'CLOSED',
  OPEN = 'OPEN',
  HALF_OPEN = 'HALF_OPEN'
}

interface CircuitBreakerConfig {
  failureThreshold: number;
  recoveryTimeout: number;
  monitoringWindow: number;
  minimumThroughput: number;
}

class CircuitBreaker {
  private state: CircuitBreakerState = CircuitBreakerState.CLOSED;
  private failures: number = 0;
  private lastFailureTime: number = 0;
  private successCount: number = 0;
  private requestCount: number = 0;
  private windowStart: number = Date.now();

  constructor(private config: CircuitBreakerConfig) {}

  async execute<T>(operation: () => Promise<T>): Promise<T> {
    if (this.state === CircuitBreakerState.OPEN) {
      if (this.shouldAttemptRecovery()) {
        this.state = CircuitBreakerState.HALF_OPEN;
      } else {
        throw new CircuitBreakerOpenError('Circuit breaker is open');
      }
    }

    try {
      const result = await operation();
      this.onSuccess();
      return result;
    } catch (error) {
      this.onFailure();
      throw error;
    }
  }

  private onSuccess(): void {
    this.failures = 0;
    this.successCount++;
    this.requestCount++;

    if (this.state === CircuitBreakerState.HALF_OPEN) {
      this.state = CircuitBreakerState.CLOSED;
    }

    this.resetWindowIfNeeded();
  }

  private onFailure(): void {
    this.failures++;
    this.requestCount++;
    this.lastFailureTime = Date.now();

    if (this.shouldOpenCircuit()) {
      this.state = CircuitBreakerState.OPEN;
    }

    this.resetWindowIfNeeded();
  }

  private shouldOpenCircuit(): boolean {
    return (
      this.requestCount >= this.config.minimumThroughput &&
      this.failures >= this.config.failureThreshold
    );
  }

  private shouldAttemptRecovery(): boolean {
    return Date.now() - this.lastFailureTime >= this.config.recoveryTimeout;
  }

  private resetWindowIfNeeded(): void {
    const now = Date.now();
    if (now - this.windowStart >= this.config.monitoringWindow) {
      this.windowStart = now;
      this.requestCount = 0;
      this.successCount = 0;
      this.failures = 0;
    }
  }

  getState(): CircuitBreakerState {
    return this.state;
  }

  getMetrics() {
    return {
      state: this.state,
      failures: this.failures,
      successCount: this.successCount,
      requestCount: this.requestCount,
      failureRate: this.requestCount > 0 ? this.failures / this.requestCount : 0
    };
  }
}

// Service with Circuit Breaker
class ExternalPaymentService {
  private circuitBreaker: CircuitBreaker;

  constructor() {
    this.circuitBreaker = new CircuitBreaker({
      failureThreshold: 5,
      recoveryTimeout: 30000, // 30 seconds
      monitoringWindow: 60000, // 1 minute
      minimumThroughput: 10
    });
  }

  async processPayment(payment: Payment): Promise<PaymentResult> {
    return this.circuitBreaker.execute(async () => {
      // Actual external service call
      const response = await fetch('/external/payment', {
        method: 'POST',
        body: JSON.stringify(payment),
        headers: { 'Content-Type': 'application/json' }
      });

      if (!response.ok) {
        throw new ExternalServiceError('Payment service error');
      }

      return response.json();
    });
  }
}
```

#### **Retry with Exponential Backoff**
```typescript
// Retry Configuration
interface RetryConfig {
  maxAttempts: number;
  initialDelay: number;
  maxDelay: number;
  backoffMultiplier: number;
  jitter: boolean;
  retryableErrors: (error: Error) => boolean;
}

class RetryPolicy {
  constructor(private config: RetryConfig) {}

  async execute<T>(operation: () => Promise<T>): Promise<T> {
    let lastError: Error;
    
    for (let attempt = 1; attempt <= this.config.maxAttempts; attempt++) {
      try {
        return await operation();
      } catch (error) {
        lastError = error as Error;
        
        if (!this.config.retryableErrors(lastError)) {
          throw lastError;
        }
        
        if (attempt === this.config.maxAttempts) {
          throw new MaxRetriesExceededError(
            `Max retries (${this.config.maxAttempts}) exceeded`,
            lastError
          );
        }
        
        const delay = this.calculateDelay(attempt);
        await this.sleep(delay);
      }
    }
    
    throw lastError!;
  }

  private calculateDelay(attempt: number): number {
    const delay = Math.min(
      this.config.initialDelay * Math.pow(this.config.backoffMultiplier, attempt - 1),
      this.config.maxDelay
    );
    
    if (this.config.jitter) {
      return delay * (0.5 + Math.random() * 0.5);
    }
    
    return delay;
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

// Service with Retry Policy
class DatabaseService {
  private retryPolicy: RetryPolicy;

  constructor() {
    this.retryPolicy = new RetryPolicy({
      maxAttempts: 3,
      initialDelay: 1000,
      maxDelay: 10000,
      backoffMultiplier: 2,
      jitter: true,
      retryableErrors: (error) => {
        // Retry on connection errors, timeouts, but not on validation errors
        return error instanceof DatabaseConnectionError ||
               error instanceof TimeoutError ||
               (error.message && error.message.includes('connection'));
      }
    });
  }

  async query(sql: string, params?: any[]): Promise<QueryResult> {
    return this.retryPolicy.execute(async () => {
      // Actual database query
      return this.database.query(sql, params);
    });
  }
}

// Combined Circuit Breaker and Retry
class ResilientExternalService {
  private circuitBreaker: CircuitBreaker;
  private retryPolicy: RetryPolicy;

  constructor() {
    this.circuitBreaker = new CircuitBreaker({
      failureThreshold: 5,
      recoveryTimeout: 30000,
      monitoringWindow: 60000,
      minimumThroughput: 10
    });

    this.retryPolicy = new RetryPolicy({
      maxAttempts: 3,
      initialDelay: 1000,
      maxDelay: 5000,
      backoffMultiplier: 2,
      jitter: true,
      retryableErrors: (error) => {
        return !(error instanceof CircuitBreakerOpenError) &&
               (error instanceof TimeoutError || 
                error instanceof NetworkError);
      }
    });
  }

  async callExternalService<T>(operation: () => Promise<T>): Promise<T> {
    return this.circuitBreaker.execute(async () => {
      return this.retryPolicy.execute(operation);
    });
  }
}
```

This comprehensive code design standards framework establishes enterprise-grade patterns and practices that ensure maintainable, scalable, and robust software architecture through systematic application of proven design principles, patterns, and error handling strategies.
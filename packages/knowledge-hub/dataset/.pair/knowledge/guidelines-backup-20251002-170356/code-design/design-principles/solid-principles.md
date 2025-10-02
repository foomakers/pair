# 🏗️ SOLID Principles

**Focus**: Five fundamental design principles for maintainable object-oriented code

SOLID principles adapted for modern TypeScript development, emphasizing functional programming concepts and type safety in React/Node.js applications.

## 🔤 The SOLID Principles

### S - Single Responsibility Principle (SRP)

**"A class should have only one reason to change"**

```typescript
// ❌ Violates SRP - multiple responsibilities
class UserManager {
  validateUser(user: User): boolean {
    return user.email.includes('@') && user.name.length > 0
  }

  saveUser(user: User): void {
    // Database logic
    database.save('users', user)
  }

  sendWelcomeEmail(user: User): void {
    // Email logic
    emailService.send(user.email, 'Welcome!')
  }

  generateReport(users: User[]): string {
    // Reporting logic
    return users.map(u => `${u.name}: ${u.email}`).join('\n')
  }
}

// ✅ Follows SRP - single responsibility per class/function
class UserValidator {
  validate(user: User): ValidationResult {
    const errors: string[] = []

    if (!user.email.includes('@')) {
      errors.push('Invalid email format')
    }

    if (user.name.length === 0) {
      errors.push('Name is required')
    }

    return {
      isValid: errors.length === 0,
      errors,
    }
  }
}

class UserRepository {
  async save(user: User): Promise<Result<User>> {
    try {
      const savedUser = await this.database.save('users', user)
      return { success: true, data: savedUser }
    } catch (error) {
      return { success: false, error: error as Error }
    }
  }
}

class WelcomeEmailService {
  async sendWelcomeEmail(user: User): Promise<Result<void>> {
    try {
      await this.emailService.send({
        to: user.email,
        subject: 'Welcome!',
        template: 'welcome',
        data: { name: user.name },
      })
      return { success: true, data: undefined }
    } catch (error) {
      return { success: false, error: error as Error }
    }
  }
}

class UserReportGenerator {
  generate(users: User[]): string {
    return users.map(user => `${user.name}: ${user.email}`).join('\n')
  }

  generateCsv(users: User[]): string {
    const headers = 'Name,Email,Created At\n'
    const rows = users.map(user => `${user.name},${user.email},${user.createdAt}`).join('\n')

    return headers + rows
  }
}
```

### O - Open/Closed Principle (OCP)

**"Software entities should be open for extension, but closed for modification"**

```typescript
// ✅ Open/Closed using strategy pattern
interface PaymentProcessor {
  readonly processPayment: (amount: number, details: PaymentDetails) => Promise<Result<Payment>>
}

class CreditCardProcessor implements PaymentProcessor {
  async processPayment(amount: number, details: CreditCardDetails): Promise<Result<Payment>> {
    try {
      // Credit card processing logic
      const payment = await this.creditCardGateway.charge({
        amount,
        cardNumber: details.cardNumber,
        expiryDate: details.expiryDate,
        cvv: details.cvv,
      })

      return { success: true, data: payment }
    } catch (error) {
      return { success: false, error: error as Error }
    }
  }
}

class PayPalProcessor implements PaymentProcessor {
  async processPayment(amount: number, details: PayPalDetails): Promise<Result<Payment>> {
    try {
      // PayPal processing logic
      const payment = await this.paypalGateway.createPayment({
        amount,
        email: details.email,
        token: details.token,
      })

      return { success: true, data: payment }
    } catch (error) {
      return { success: false, error: error as Error }
    }
  }
}

// ✅ PaymentService is closed for modification, open for extension
class PaymentService {
  constructor(private readonly processor: PaymentProcessor) {}

  async processPayment(amount: number, details: PaymentDetails): Promise<Result<Payment>> {
    // Validation logic
    if (amount <= 0) {
      return { success: false, error: new Error('Amount must be positive') }
    }

    // Delegate to processor
    return this.processor.processPayment(amount, details)
  }
}

// ✅ Adding new payment method without modifying existing code
class CryptoProcessor implements PaymentProcessor {
  async processPayment(amount: number, details: CryptoDetails): Promise<Result<Payment>> {
    try {
      const payment = await this.cryptoGateway.transfer({
        amount,
        walletAddress: details.walletAddress,
        currency: details.currency,
      })

      return { success: true, data: payment }
    } catch (error) {
      return { success: false, error: error as Error }
    }
  }
}
```

### L - Liskov Substitution Principle (LSP)

**"Objects of a supertype should be replaceable with objects of their subtypes"**

```typescript
// ✅ Proper LSP implementation with consistent contracts
interface FileStorage {
  readonly upload: (file: File) => Promise<Result<string>>
  readonly download: (url: string) => Promise<Result<Buffer>>
  readonly delete: (url: string) => Promise<Result<void>>
}

class LocalFileStorage implements FileStorage {
  async upload(file: File): Promise<Result<string>> {
    try {
      const fileName = `${Date.now()}-${file.name}`
      const filePath = path.join(this.uploadDir, fileName)

      await fs.writeFile(filePath, file.buffer)

      return { success: true, data: `/uploads/${fileName}` }
    } catch (error) {
      return { success: false, error: error as Error }
    }
  }

  async download(url: string): Promise<Result<Buffer>> {
    try {
      const filePath = path.join(this.uploadDir, path.basename(url))
      const buffer = await fs.readFile(filePath)

      return { success: true, data: buffer }
    } catch (error) {
      return { success: false, error: error as Error }
    }
  }

  async delete(url: string): Promise<Result<void>> {
    try {
      const filePath = path.join(this.uploadDir, path.basename(url))
      await fs.unlink(filePath)

      return { success: true, data: undefined }
    } catch (error) {
      return { success: false, error: error as Error }
    }
  }
}

class S3FileStorage implements FileStorage {
  async upload(file: File): Promise<Result<string>> {
    try {
      const key = `${Date.now()}-${file.name}`

      await this.s3Client
        .upload({
          Bucket: this.bucketName,
          Key: key,
          Body: file.buffer,
          ContentType: file.mimeType,
        })
        .promise()

      return { success: true, data: `https://${this.bucketName}.s3.amazonaws.com/${key}` }
    } catch (error) {
      return { success: false, error: error as Error }
    }
  }

  async download(url: string): Promise<Result<Buffer>> {
    try {
      const key = this.extractKeyFromUrl(url)

      const response = await this.s3Client
        .getObject({
          Bucket: this.bucketName,
          Key: key,
        })
        .promise()

      return { success: true, data: response.Body as Buffer }
    } catch (error) {
      return { success: false, error: error as Error }
    }
  }

  async delete(url: string): Promise<Result<void>> {
    try {
      const key = this.extractKeyFromUrl(url)

      await this.s3Client
        .deleteObject({
          Bucket: this.bucketName,
          Key: key,
        })
        .promise()

      return { success: true, data: undefined }
    } catch (error) {
      return { success: false, error: error as Error }
    }
  }
}

// ✅ Client code works with any FileStorage implementation
class DocumentService {
  constructor(private readonly storage: FileStorage) {}

  async uploadDocument(file: File): Promise<Result<Document>> {
    const uploadResult = await this.storage.upload(file)

    if (!uploadResult.success) {
      return uploadResult
    }

    const document: Document = {
      id: generateId(),
      name: file.name,
      url: uploadResult.data,
      uploadedAt: new Date(),
    }

    return { success: true, data: document }
  }
}
```

### I - Interface Segregation Principle (ISP)

**"Many client-specific interfaces are better than one general-purpose interface"**

```typescript
// ❌ Fat interface violates ISP
interface UserOperations {
  // Basic operations
  createUser(data: CreateUserData): Promise<User>
  updateUser(id: UserId, data: UpdateUserData): Promise<User>
  deleteUser(id: UserId): Promise<void>
  getUser(id: UserId): Promise<User>

  // Admin operations
  suspendUser(id: UserId): Promise<void>
  promoteToAdmin(id: UserId): Promise<void>

  // Analytics operations
  getUserAnalytics(id: UserId): Promise<UserAnalytics>
  generateUserReport(): Promise<UserReport>

  // Notification operations
  sendNotification(id: UserId, message: string): Promise<void>
  getUserPreferences(id: UserId): Promise<UserPreferences>
}

// ✅ Segregated interfaces follow ISP
interface UserRepository {
  readonly create: (data: CreateUserData) => Promise<User>
  readonly update: (id: UserId, data: UpdateUserData) => Promise<User>
  readonly delete: (id: UserId) => Promise<void>
  readonly findById: (id: UserId) => Promise<User | null>
  readonly findMany: (filters: UserFilters) => Promise<User[]>
}

interface UserAdministration {
  readonly suspend: (id: UserId, reason: string) => Promise<void>
  readonly unsuspend: (id: UserId) => Promise<void>
  readonly promoteToAdmin: (id: UserId) => Promise<void>
  readonly revokeAdmin: (id: UserId) => Promise<void>
}

interface UserAnalytics {
  readonly getUserStats: (id: UserId) => Promise<UserStats>
  readonly generateReport: (criteria: ReportCriteria) => Promise<UserReport>
  readonly getActivitySummary: (id: UserId) => Promise<ActivitySummary>
}

interface UserNotificationService {
  readonly sendNotification: (id: UserId, notification: Notification) => Promise<void>
  readonly getPreferences: (id: UserId) => Promise<NotificationPreferences>
  readonly updatePreferences: (id: UserId, preferences: NotificationPreferences) => Promise<void>
}

// ✅ Clients only depend on what they need
class UserController {
  constructor(
    private readonly userRepository: UserRepository,
    private readonly notificationService: UserNotificationService,
  ) {}

  async createUser(data: CreateUserData): Promise<Result<User>> {
    try {
      const user = await this.userRepository.create(data)

      // Send welcome notification
      await this.notificationService.sendNotification(user.id, {
        type: 'welcome',
        message: 'Welcome to our platform!',
      })

      return { success: true, data: user }
    } catch (error) {
      return { success: false, error: error as Error }
    }
  }
}

class AdminController {
  constructor(
    private readonly userRepository: UserRepository,
    private readonly userAdmin: UserAdministration,
    private readonly analytics: UserAnalytics,
  ) {}

  async suspendUser(id: UserId, reason: string): Promise<Result<void>> {
    try {
      // Verify user exists
      const user = await this.userRepository.findById(id)
      if (!user) {
        return { success: false, error: new Error('User not found') }
      }

      await this.userAdmin.suspend(id, reason)

      return { success: true, data: undefined }
    } catch (error) {
      return { success: false, error: error as Error }
    }
  }
}
```

### D - Dependency Inversion Principle (DIP)

**"Depend on abstractions, not concretions"**

```typescript
// ❌ Violates DIP - depends on concrete implementations
class OrderService {
  private emailSender = new EmailSender() // Concrete dependency
  private database = new PostgresDatabase() // Concrete dependency
  private paymentGateway = new StripePayment() // Concrete dependency

  async processOrder(orderData: OrderData): Promise<void> {
    // Tightly coupled to concrete implementations
    const order = await this.database.save('orders', orderData)
    await this.paymentGateway.charge(orderData.amount)
    await this.emailSender.send(orderData.customerEmail, 'Order confirmed')
  }
}

// ✅ Follows DIP - depends on abstractions
interface EmailService {
  readonly send: (to: string, subject: string, body: string) => Promise<void>
}

interface Database {
  readonly save: <T>(table: string, data: T) => Promise<T>
  readonly findById: <T>(table: string, id: string) => Promise<T | null>
}

interface PaymentGateway {
  readonly processPayment: (amount: number, details: PaymentDetails) => Promise<PaymentResult>
}

// ✅ Service depends on abstractions
class OrderService {
  constructor(
    private readonly emailService: EmailService,
    private readonly database: Database,
    private readonly paymentGateway: PaymentGateway,
  ) {}

  async processOrder(orderData: OrderData): Promise<Result<Order>> {
    try {
      // Process payment first
      const paymentResult = await this.paymentGateway.processPayment(
        orderData.amount,
        orderData.paymentDetails,
      )

      if (!paymentResult.success) {
        return { success: false, error: new Error('Payment failed') }
      }

      // Save order
      const order = await this.database.save('orders', {
        ...orderData,
        paymentId: paymentResult.id,
        status: 'confirmed',
      })

      // Send confirmation email
      await this.emailService.send(
        orderData.customerEmail,
        'Order Confirmation',
        `Your order #${order.id} has been confirmed`,
      )

      return { success: true, data: order }
    } catch (error) {
      return { success: false, error: error as Error }
    }
  }
}

// ✅ Concrete implementations
class SMTPEmailService implements EmailService {
  async send(to: string, subject: string, body: string): Promise<void> {
    // SMTP implementation
    await this.smtpClient.sendMail({ to, subject, html: body })
  }
}

class PrismaDatabase implements Database {
  async save<T>(table: string, data: T): Promise<T> {
    // Prisma implementation
    return this.prisma[table].create({ data })
  }

  async findById<T>(table: string, id: string): Promise<T | null> {
    return this.prisma[table].findUnique({ where: { id } })
  }
}

class StripePaymentGateway implements PaymentGateway {
  async processPayment(amount: number, details: PaymentDetails): Promise<PaymentResult> {
    // Stripe implementation
    const charge = await this.stripe.charges.create({
      amount: amount * 100, // Convert to cents
      currency: 'usd',
      source: details.token,
    })

    return {
      success: true,
      id: charge.id,
      amount: charge.amount / 100,
    }
  }
}

// ✅ Dependency injection setup
const createOrderService = (): OrderService => {
  const emailService = new SMTPEmailService()
  const database = new PrismaDatabase()
  const paymentGateway = new StripePaymentGateway()

  return new OrderService(emailService, database, paymentGateway)
}
```

## 🎯 SOLID in Functional Programming

### Functional Approach to SOLID

```typescript
// ✅ SOLID principles with functional programming
type UserValidator = (user: User) => ValidationResult
type UserRepository = {
  readonly save: (user: User) => Promise<Result<User>>
  readonly findById: (id: UserId) => Promise<Result<User>>
}

type EmailService = {
  readonly send: (to: string, subject: string, body: string) => Promise<Result<void>>
}

// ✅ Single Responsibility - pure functions
const validateUserEmail: UserValidator = user => ({
  isValid: user.email.includes('@'),
  errors: user.email.includes('@') ? [] : ['Invalid email format'],
})

const validateUserName: UserValidator = user => ({
  isValid: user.name.length > 0,
  errors: user.name.length > 0 ? [] : ['Name is required'],
})

// ✅ Open/Closed - composable validators
const composeValidators =
  (...validators: UserValidator[]): UserValidator =>
  user => {
    const results = validators.map(validator => validator(user))
    const allErrors = results.flatMap(result => result.errors)

    return {
      isValid: allErrors.length === 0,
      errors: allErrors,
    }
  }

const validateUser = composeValidators(validateUserEmail, validateUserName)

// ✅ Dependency injection with functions
type UserServiceDeps = {
  readonly userRepository: UserRepository
  readonly emailService: EmailService
  readonly validator: UserValidator
}

const createUserService = (deps: UserServiceDeps) => ({
  createUser: async (userData: CreateUserData): Promise<Result<User>> => {
    const validationResult = deps.validator(userData)

    if (!validationResult.isValid) {
      return {
        success: false,
        error: new Error(validationResult.errors.join(', ')),
      }
    }

    const saveResult = await deps.userRepository.save(userData)

    if (!saveResult.success) {
      return saveResult
    }

    // Send welcome email
    await deps.emailService.send(userData.email, 'Welcome!', 'Welcome to our platform!')

    return saveResult
  },
})
```

## 🔗 Related Principles

- **[Domain-Driven Design](.pair/knowledge/guidelines/architecture/domain-driven-design.md)** - Domain modeling with SOLID principles
- **[Functional Programming](functional-programming.md)** - Functional approach to design principles
- **[Clear Readable Code](clear-readable-code.md)** - Code clarity principles
- **[Component Design](.pair/knowledge/guidelines/code-design/framework-patterns/component-design.md)** - SOLID in React components

## 🎯 Implementation Guidelines

1. **Single Responsibility**: Each class/function should have one reason to change
2. **Open/Closed**: Extend behavior through composition, not modification
3. **Liskov Substitution**: Ensure consistent contracts across implementations
4. **Interface Segregation**: Create specific interfaces for specific needs
5. **Dependency Inversion**: Depend on abstractions, inject dependencies

## 📏 Benefits

- **Maintainability**: Easier to understand and modify code
- **Testability**: Dependencies can be easily mocked
- **Flexibility**: New features can be added without breaking existing code
- **Reusability**: Components can be reused in different contexts
- **Reliability**: Changes are isolated and predictable

---

_SOLID principles provide a foundation for writing maintainable, extensible, and testable TypeScript code in modern applications._

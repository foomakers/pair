# 📖 Clear Readable Code

**Focus**: Code clarity, readability, and maintainability principles

Guidelines for writing clear, readable, and maintainable TypeScript code that is easy to understand, debug, and modify.

## 🎯 Fundamental Principles

### Meaningful Names

```typescript
// ❌ Poor naming - unclear, abbreviated, non-descriptive
const d = new Date()
const u = users.filter(x => x.a)
const calc = (p, r, t) => p * r * t

function proc(data: any[]): any {
  const res = []
  for (let i = 0; i < data.length; i++) {
    if (data[i].stat === 'ok') {
      res.push(data[i])
    }
  }
  return res
}

// ✅ Clear naming - descriptive, intention-revealing
const currentDate = new Date()
const activeUsers = users.filter(user => user.isActive)
const calculateSimpleInterest = (principal: number, rate: number, time: number) =>
  principal * rate * time

function filterActiveUsers(users: User[]): User[] {
  const activeUsers: User[] = []

  for (const user of users) {
    if (user.status === 'active') {
      activeUsers.push(user)
    }
  }

  return activeUsers
}

// ✅ Even better - using intention-revealing functions
const getActiveUsers = (users: User[]): User[] => users.filter(isActiveUser)

const isActiveUser = (user: User): boolean => user.status === 'active'

// ✅ Searchable names for important concepts
const MAX_RETRY_ATTEMPTS = 3
const DEFAULT_TIMEOUT_MILLISECONDS = 5000
const USER_SESSION_EXPIRY_HOURS = 24

class UserAuthenticationService {
  private readonly maxLoginAttempts = 5
  private readonly passwordMinLength = 8
  private readonly sessionTokenLength = 32

  async authenticateUser(credentials: LoginCredentials): Promise<Result<AuthSession>> {
    // Implementation with clear variable names
    const validationResult = this.validateCredentials(credentials)
    if (!validationResult.success) {
      return err(validationResult.error)
    }

    const authenticationResult = await this.verifyUserCredentials(credentials)
    if (!authenticationResult.success) {
      return err(authenticationResult.error)
    }

    const sessionToken = this.generateSessionToken()
    const expiryTime = this.calculateSessionExpiry()

    return ok({
      token: sessionToken,
      expiresAt: expiryTime,
      user: authenticationResult.data,
    })
  }
}
```

### Small Functions and Single Responsibility

```typescript
// ❌ Large function doing multiple things
function processUserRegistration(userData: any): any {
  // Validate input
  if (!userData.email || !userData.password || !userData.name) {
    throw new Error('Missing required fields')
  }

  if (userData.password.length < 8) {
    throw new Error('Password too short')
  }

  if (!userData.email.includes('@')) {
    throw new Error('Invalid email')
  }

  // Hash password
  const hashedPassword = crypto.createHash('sha256').update(userData.password).digest('hex')

  // Check if user exists
  const existingUser = database.query('SELECT * FROM users WHERE email = ?', [userData.email])
  if (existingUser.length > 0) {
    throw new Error('User already exists')
  }

  // Create user
  const userId = crypto.randomUUID()
  database.query(
    'INSERT INTO users (id, email, password, name, created_at) VALUES (?, ?, ?, ?, ?)',
    [userId, userData.email, hashedPassword, userData.name, new Date()],
  )

  // Send welcome email
  emailService.send({
    to: userData.email,
    subject: 'Welcome!',
    body: `Hello ${userData.name}, welcome to our platform!`,
  })

  // Log registration
  logger.info(`User registered: ${userData.email}`)

  return { id: userId, email: userData.email, name: userData.name }
}

// ✅ Broken down into focused, single-responsibility functions
type UserRegistrationData = {
  readonly email: string
  readonly password: string
  readonly name: string
}

type RegistrationResult = {
  readonly id: string
  readonly email: string
  readonly name: string
}

async function registerUser(userData: UserRegistrationData): Promise<Result<RegistrationResult>> {
  const validationResult = validateRegistrationData(userData)
  if (!validationResult.success) {
    return err(validationResult.error)
  }

  const userExistsResult = await checkUserExists(userData.email)
  if (!userExistsResult.success) {
    return err(userExistsResult.error)
  }

  if (userExistsResult.data) {
    return err(new Error('User already exists'))
  }

  const createUserResult = await createUser(userData)
  if (!createUserResult.success) {
    return err(createUserResult.error)
  }

  // Side effects - can be done asynchronously
  await sendWelcomeEmail(userData.email, userData.name)
  logUserRegistration(userData.email)

  return ok(createUserResult.data)
}

function validateRegistrationData(userData: UserRegistrationData): Result<void> {
  if (!userData.email || !userData.password || !userData.name) {
    return err(new Error('Missing required fields'))
  }

  const emailValidation = validateEmail(userData.email)
  if (!emailValidation.success) {
    return err(emailValidation.error)
  }

  const passwordValidation = validatePassword(userData.password)
  if (!passwordValidation.success) {
    return err(passwordValidation.error)
  }

  const nameValidation = validateName(userData.name)
  if (!nameValidation.success) {
    return err(nameValidation.error)
  }

  return ok(undefined)
}

function validateEmail(email: string): Result<void> {
  if (!email.includes('@')) {
    return err(new Error('Invalid email format'))
  }

  if (email.length > 254) {
    return err(new Error('Email too long'))
  }

  return ok(undefined)
}

function validatePassword(password: string): Result<void> {
  if (password.length < 8) {
    return err(new Error('Password must be at least 8 characters'))
  }

  if (!/[A-Z]/.test(password)) {
    return err(new Error('Password must contain uppercase letter'))
  }

  if (!/[0-9]/.test(password)) {
    return err(new Error('Password must contain number'))
  }

  return ok(undefined)
}

function validateName(name: string): Result<void> {
  if (name.trim().length === 0) {
    return err(new Error('Name cannot be empty'))
  }

  if (name.length > 100) {
    return err(new Error('Name too long'))
  }

  return ok(undefined)
}

async function checkUserExists(email: string): Promise<Result<boolean>> {
  try {
    const existingUser = await database.query('SELECT id FROM users WHERE email = ? LIMIT 1', [
      email,
    ])

    return ok(existingUser.length > 0)
  } catch (error) {
    return err(error as Error)
  }
}

async function createUser(userData: UserRegistrationData): Promise<Result<RegistrationResult>> {
  try {
    const hashedPassword = await hashPassword(userData.password)
    const userId = generateUserId()

    await database.query(
      'INSERT INTO users (id, email, password, name, created_at) VALUES (?, ?, ?, ?, ?)',
      [userId, userData.email, hashedPassword, userData.name, new Date()],
    )

    return ok({
      id: userId,
      email: userData.email,
      name: userData.name,
    })
  } catch (error) {
    return err(error as Error)
  }
}

async function hashPassword(password: string): Promise<string> {
  return crypto.createHash('sha256').update(password).digest('hex')
}

function generateUserId(): string {
  return crypto.randomUUID()
}

async function sendWelcomeEmail(email: string, name: string): Promise<void> {
  await emailService.send({
    to: email,
    subject: 'Welcome!',
    body: `Hello ${name}, welcome to our platform!`,
  })
}

function logUserRegistration(email: string): void {
  logger.info(`User registered: ${email}`)
}
```

### Clear Code Structure and Organization

```typescript
// ✅ Well-organized module with clear structure
/**
 * User Service
 *
 * Handles user-related business operations including:
 * - User registration and authentication
 * - Profile management
 * - User preferences
 */

// =============================================================================
// Types and Interfaces
// =============================================================================

type UserId = Brand<string, 'UserId'>
type Email = Brand<string, 'Email'>

interface User {
  readonly id: UserId
  readonly email: Email
  readonly name: string
  readonly status: UserStatus
  readonly profile: UserProfile
  readonly createdAt: Date
  readonly updatedAt: Date
}

interface UserProfile {
  readonly firstName: string
  readonly lastName: string
  readonly bio: string
  readonly avatar?: string
  readonly preferences: UserPreferences
}

interface UserPreferences {
  readonly theme: 'light' | 'dark' | 'auto'
  readonly language: string
  readonly emailNotifications: boolean
  readonly pushNotifications: boolean
}

type UserStatus = 'active' | 'inactive' | 'suspended'

// =============================================================================
// Error Types
// =============================================================================

class UserNotFoundError extends Error {
  constructor(userId: UserId) {
    super(`User not found: ${userId}`)
    this.name = 'UserNotFoundError'
  }
}

class InvalidUserDataError extends Error {
  constructor(field: string, reason: string) {
    super(`Invalid ${field}: ${reason}`)
    this.name = 'InvalidUserDataError'
  }
}

class UserAlreadyExistsError extends Error {
  constructor(email: Email) {
    super(`User already exists with email: ${email}`)
    this.name = 'UserAlreadyExistsError'
  }
}

// =============================================================================
// Service Interface
// =============================================================================

interface UserService {
  findById(id: UserId): Promise<Result<User>>
  findByEmail(email: Email): Promise<Result<User>>
  createUser(data: CreateUserData): Promise<Result<User>>
  updateUser(id: UserId, updates: UpdateUserData): Promise<Result<User>>
  deactivateUser(id: UserId): Promise<Result<void>>
  updatePreferences(id: UserId, preferences: Partial<UserPreferences>): Promise<Result<void>>
}

// =============================================================================
// Data Transfer Objects
// =============================================================================

type CreateUserData = {
  readonly email: string
  readonly name: string
  readonly password: string
  readonly profile?: Partial<UserProfile>
}

type UpdateUserData = {
  readonly name?: string
  readonly profile?: Partial<UserProfile>
  readonly status?: UserStatus
}

// =============================================================================
// Implementation
// =============================================================================

class UserServiceImpl implements UserService {
  constructor(
    private readonly userRepository: UserRepository,
    private readonly emailService: EmailService,
    private readonly logger: Logger,
  ) {}

  async findById(id: UserId): Promise<Result<User>> {
    this.logger.debug('Finding user by ID', { userId: id })

    try {
      const user = await this.userRepository.findById(id)

      if (!user) {
        return err(new UserNotFoundError(id))
      }

      return ok(user)
    } catch (error) {
      this.logger.error('Failed to find user by ID', { userId: id, error })
      return err(error as Error)
    }
  }

  async findByEmail(email: Email): Promise<Result<User>> {
    this.logger.debug('Finding user by email', { email })

    try {
      const user = await this.userRepository.findByEmail(email)

      if (!user) {
        return err(new UserNotFoundError(email as unknown as UserId))
      }

      return ok(user)
    } catch (error) {
      this.logger.error('Failed to find user by email', { email, error })
      return err(error as Error)
    }
  }

  async createUser(data: CreateUserData): Promise<Result<User>> {
    this.logger.info('Creating new user', { email: data.email })

    // Validate input data
    const validationResult = this.validateCreateUserData(data)
    if (!validationResult.success) {
      return err(validationResult.error)
    }

    // Check if user already exists
    const existingUserResult = await this.findByEmail(data.email as Email)
    if (existingUserResult.success) {
      return err(new UserAlreadyExistsError(data.email as Email))
    }

    try {
      // Create user entity
      const user = await this.buildUserFromData(data)

      // Save to repository
      const savedUser = await this.userRepository.save(user)

      // Send welcome email (async, don't wait)
      this.sendWelcomeEmailAsync(savedUser.email, savedUser.name)

      this.logger.info('User created successfully', { userId: savedUser.id })

      return ok(savedUser)
    } catch (error) {
      this.logger.error('Failed to create user', { email: data.email, error })
      return err(error as Error)
    }
  }

  // ==========================================================================
  // Private Helper Methods
  // ==========================================================================

  private validateCreateUserData(data: CreateUserData): Result<void> {
    if (!this.isValidEmail(data.email)) {
      return err(new InvalidUserDataError('email', 'Invalid format'))
    }

    if (!this.isValidName(data.name)) {
      return err(new InvalidUserDataError('name', 'Must be 2-100 characters'))
    }

    if (!this.isValidPassword(data.password)) {
      return err(new InvalidUserDataError('password', 'Must be at least 8 characters'))
    }

    return ok(undefined)
  }

  private isValidEmail(email: string): boolean {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
  }

  private isValidName(name: string): boolean {
    return name.trim().length >= 2 && name.trim().length <= 100
  }

  private isValidPassword(password: string): boolean {
    return password.length >= 8
  }

  private async buildUserFromData(data: CreateUserData): Promise<User> {
    const userId = this.generateUserId()
    const hashedPassword = await this.hashPassword(data.password)
    const now = new Date()

    return {
      id: userId,
      email: data.email as Email,
      name: data.name.trim(),
      status: 'active',
      profile: {
        firstName: data.profile?.firstName || '',
        lastName: data.profile?.lastName || '',
        bio: data.profile?.bio || '',
        avatar: data.profile?.avatar,
        preferences: {
          theme: 'auto',
          language: 'en',
          emailNotifications: true,
          pushNotifications: false,
        },
      },
      createdAt: now,
      updatedAt: now,
    }
  }

  private generateUserId(): UserId {
    return crypto.randomUUID() as UserId
  }

  private async hashPassword(password: string): Promise<string> {
    // Implementation would use proper hashing library
    return crypto.createHash('sha256').update(password).digest('hex')
  }

  private async sendWelcomeEmailAsync(email: Email, name: string): Promise<void> {
    try {
      await this.emailService.send({
        to: email,
        subject: 'Welcome to our platform!',
        template: 'welcome',
        data: { name },
      })
    } catch (error) {
      this.logger.error('Failed to send welcome email', { email, error })
      // Don't throw - this is a side effect
    }
  }
}
```

### Clear Comments and Documentation

```typescript
// ✅ Good comments - explain why, not what
/**
 * Calculates compound interest with quarterly compounding.
 *
 * Uses the formula: A = P(1 + r/n)^(nt) where:
 * - P = principal amount
 * - r = annual interest rate (as decimal)
 * - n = number of times interest compounds per year (4 for quarterly)
 * - t = time in years
 *
 * @param principal Initial investment amount in dollars
 * @param annualRate Annual interest rate (e.g., 0.05 for 5%)
 * @param years Number of years to compound
 * @returns Final amount after compound interest
 */
function calculateCompoundInterest(principal: number, annualRate: number, years: number): number {
  const compoundingPeriodsPerYear = 4 // Quarterly compounding
  const ratePerPeriod = annualRate / compoundingPeriodsPerYear
  const totalPeriods = compoundingPeriodsPerYear * years

  return principal * Math.pow(1 + ratePerPeriod, totalPeriods)
}

/**
 * Retries a function with exponential backoff.
 *
 * Implements retry logic for unreliable operations like network calls.
 * Each retry waits longer than the previous attempt to avoid overwhelming
 * the target system during temporary outages.
 */
async function withRetry<T>(
  operation: () => Promise<T>,
  maxAttempts: number = 3,
  baseDelayMs: number = 1000,
): Promise<T> {
  let lastError: Error

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await operation()
    } catch (error) {
      lastError = error as Error

      // Don't wait after the last attempt
      if (attempt === maxAttempts) {
        break
      }

      // Exponential backoff: 1s, 2s, 4s, 8s...
      const delayMs = baseDelayMs * Math.pow(2, attempt - 1)
      await sleep(delayMs)
    }
  }

  throw lastError!
}

// ✅ Explaining business logic and edge cases
class PriceCalculator {
  /**
   * Calculates the final price including taxes and discounts.
   *
   * Business rules:
   * - Discounts are applied before tax calculation
   * - Tax is calculated on the discounted price
   * - Minimum order amount for discount is $50
   * - Maximum discount is 50% of the item price
   */
  calculateFinalPrice(basePrice: number, discountPercentage: number, taxRate: number): number {
    // Validate discount bounds to prevent pricing errors
    const validDiscountPercentage = Math.max(0, Math.min(discountPercentage, 50))

    // Apply minimum order requirement for discounts
    const discountAmount = basePrice >= 50 ? basePrice * (validDiscountPercentage / 100) : 0

    const discountedPrice = basePrice - discountAmount

    // Tax is calculated on the discounted price per business requirements
    const taxAmount = discountedPrice * taxRate

    return discountedPrice + taxAmount
  }

  /**
   * Calculates bulk pricing tiers.
   *
   * IMPORTANT: These tiers are contractually defined and cannot be changed
   * without legal approval. Any modifications require updating customer
   * contracts and providing 30-day notice.
   */
  calculateBulkPrice(unitPrice: number, quantity: number): number {
    // Contractual bulk pricing tiers - DO NOT MODIFY without legal review
    if (quantity >= 1000) {
      return unitPrice * 0.7 // 30% discount for 1000+ units
    } else if (quantity >= 100) {
      return unitPrice * 0.85 // 15% discount for 100+ units
    } else if (quantity >= 10) {
      return unitPrice * 0.95 // 5% discount for 10+ units
    }

    return unitPrice // No discount for quantities under 10
  }
}

// ✅ Warning about tricky or non-obvious code
class DateUtils {
  /**
   * Adds business days to a date, excluding weekends and holidays.
   *
   * WARNING: This function modifies the input date. Pass a copy if you
   * need to preserve the original date.
   *
   * NOTE: Holiday calculation uses a simplified US federal holiday list.
   * For international deployments, this needs to be configurable.
   */
  static addBusinessDays(date: Date, days: number, holidays: Date[] = []): Date {
    let currentDate = new Date(date)
    let remainingDays = days

    while (remainingDays > 0) {
      currentDate.setDate(currentDate.getDate() + 1)

      // Skip weekends (Saturday = 6, Sunday = 0)
      const dayOfWeek = currentDate.getDay()
      if (dayOfWeek === 0 || dayOfWeek === 6) {
        continue
      }

      // Skip holidays
      const isHoliday = holidays.some(holiday => this.isSameDay(currentDate, holiday))

      if (!isHoliday) {
        remainingDays--
      }
    }

    return currentDate
  }

  private static isSameDay(date1: Date, date2: Date): boolean {
    return (
      date1.getFullYear() === date2.getFullYear() &&
      date1.getMonth() === date2.getMonth() &&
      date1.getDate() === date2.getDate()
    )
  }
}

// ❌ Bad comments - explaining obvious code
function addNumbers(a: number, b: number): number {
  // Add a and b together
  const result = a + b

  // Return the result
  return result
}

// ❌ Misleading or outdated comments
function calculateTax(amount: number): number {
  // Tax rate is 8% - THIS COMMENT IS WRONG!
  return amount * 0.1 // Actually 10%
}

// ❌ Too many comments explaining simple code
function isEven(number: number): boolean {
  // Check if the number is even
  // We use modulo operator to check remainder
  // If remainder is 0, the number is even
  // Otherwise it's odd
  const remainder = number % 2
  // Compare remainder to 0
  const isNumberEven = remainder === 0
  // Return the result
  return isNumberEven
}
```

## 🎯 Readability Best Practices

### Consistent Formatting and Style

```typescript
// ✅ Consistent formatting and indentation
class UserController {
  constructor(
    private readonly userService: UserService,
    private readonly validator: RequestValidator,
    private readonly logger: Logger,
  ) {}

  async createUser(request: CreateUserRequest): Promise<ApiResponse<User>> {
    const validationResult = this.validator.validate(request)
    if (!validationResult.success) {
      return {
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Invalid request data',
          details: validationResult.errors,
        },
      }
    }

    const userResult = await this.userService.createUser({
      email: request.email,
      name: request.name,
      password: request.password,
    })

    if (!userResult.success) {
      this.logger.error('User creation failed', {
        email: request.email,
        error: userResult.error,
      })

      return {
        success: false,
        error: {
          code: 'USER_CREATION_FAILED',
          message: 'Failed to create user',
        },
      }
    }

    return {
      success: true,
      data: userResult.data,
    }
  }
}

// ✅ Consistent object and array formatting
const userConfig = {
  authentication: {
    tokenExpiry: '24h',
    refreshTokenExpiry: '7d',
    maxLoginAttempts: 5,
  },
  validation: {
    emailRequired: true,
    passwordMinLength: 8,
    nameMaxLength: 100,
  },
  features: {
    emailVerification: true,
    twoFactorAuth: false,
    socialLogin: ['google', 'github'],
  },
}

const validationRules = [
  { field: 'email', type: 'email', required: true },
  { field: 'password', type: 'string', minLength: 8 },
  { field: 'name', type: 'string', maxLength: 100 },
  { field: 'age', type: 'number', min: 0, max: 120 },
]
```

### Error Handling and Edge Cases

```typescript
// ✅ Clear error handling with specific error types
class FileProcessor {
  async processFile(filePath: string): Promise<Result<ProcessedFile>> {
    // Validate input
    if (!filePath || filePath.trim().length === 0) {
      return err(new Error('File path cannot be empty'))
    }

    // Check file existence
    const fileExists = await this.fileExists(filePath)
    if (!fileExists) {
      return err(new Error(`File not found: ${filePath}`))
    }

    // Check file permissions
    const hasReadPermission = await this.hasReadPermission(filePath)
    if (!hasReadPermission) {
      return err(new Error(`No read permission for file: ${filePath}`))
    }

    try {
      // Read file content
      const content = await this.readFile(filePath)

      // Validate file content
      if (content.length === 0) {
        return err(new Error('File is empty'))
      }

      if (content.length > this.maxFileSize) {
        return err(new Error(`File too large: ${content.length} bytes`))
      }

      // Process content
      const processedContent = await this.processContent(content)

      return ok({
        originalPath: filePath,
        content: processedContent,
        size: content.length,
        processedAt: new Date(),
      })
    } catch (error) {
      // Handle specific error types
      if (error instanceof SyntaxError) {
        return err(new Error(`Invalid file format: ${error.message}`))
      }

      if (error instanceof RangeError) {
        return err(new Error(`File content out of range: ${error.message}`))
      }

      // Handle unexpected errors
      this.logger.error('Unexpected error during file processing', {
        filePath,
        error: error.message,
        stack: error.stack,
      })

      return err(new Error('File processing failed due to unexpected error'))
    }
  }

  private async fileExists(filePath: string): Promise<boolean> {
    try {
      await fs.access(filePath)
      return true
    } catch {
      return false
    }
  }

  private async hasReadPermission(filePath: string): Promise<boolean> {
    try {
      await fs.access(filePath, fs.constants.R_OK)
      return true
    } catch {
      return false
    }
  }
}
```

## 🔗 Related Concepts

- **[SOLID Principles](solid-principles.md)** - Design principles for maintainable code
- **[Functional Programming](functional-programming.md)** - Pure functions and clarity
- **[Function Design](.pair/knowledge/guidelines/code-design/implementation-standards/function-design.md)** - Function-specific clarity guidelines
- **[Code Review Standards](.pair/knowledge/guidelines/code-design/quality-standards/code-review.md)** - Review criteria for readable code

## 🎯 Implementation Guidelines

1. **Descriptive Names**: Use clear, intention-revealing names for variables, functions, and classes
2. **Small Functions**: Keep functions focused on a single responsibility
3. **Consistent Style**: Follow consistent formatting and naming conventions
4. **Clear Structure**: Organize code logically with clear separation of concerns
5. **Meaningful Comments**: Explain why, not what - focus on business logic and edge cases
6. **Error Handling**: Handle errors explicitly with clear error messages
7. **Avoid Cleverness**: Prefer clear, straightforward solutions over clever tricks

## 📏 Benefits

- **Maintainability**: Easy to understand and modify code
- **Debugging**: Clear code is easier to debug and troubleshoot
- **Collaboration**: Team members can quickly understand and work with the code
- **Onboarding**: New team members can get up to speed faster
- **Quality**: Readable code tends to have fewer bugs
- **Documentation**: Self-documenting code reduces documentation burden

---

_Clear, readable code is the foundation of maintainable software that teams can work with effectively over time._

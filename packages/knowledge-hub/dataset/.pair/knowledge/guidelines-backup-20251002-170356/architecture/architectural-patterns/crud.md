# CRUD Architecture Pattern

Simple architecture pattern for applications dominated by Create, Read, Update, Delete operations with minimal business logic.

## When to Use

**Ideal for:**

- Simple data operations
- Minimal business logic
- Rapid prototyping
- Small applications (< 10 entities)
- MVPs and proof of concepts

**Avoid when:**

- Complex business rules exist
- Domain logic is significant
- High scalability required
- Multiple contexts needed

## Implementation Structure

```typescript
src/
├── controllers/     # HTTP/API layer
├── services/       # Business logic
├── repositories/   # Data access
├── models/        # Data models
├── dto/           # Data transfer objects
└── utilities/     # Shared utilities
```

## Core Implementation

### Entity Model

```typescript
// User Entity
export class User {
  id: string
  email: string
  name: string
  createdAt: Date
  updatedAt: Date

  constructor(data: Partial<User>) {
    Object.assign(this, data)
    this.createdAt = this.createdAt || new Date()
    this.updatedAt = new Date()
  }
}
```

### Repository Pattern

```typescript
export interface UserRepository {
  create(user: User): Promise<User>
  findById(id: string): Promise<User | null>
  findAll(filters?: UserFilters): Promise<User[]>
  update(id: string, updates: Partial<User>): Promise<User>
  delete(id: string): Promise<void>
}

export class PostgresUserRepository implements UserRepository {
  constructor(private db: Database) {}

  async create(user: User): Promise<User> {
    const query = `
      INSERT INTO users (id, email, name, created_at, updated_at)
      VALUES ($1, $2, $3, $4, $5)
      RETURNING *
    `
    const result = await this.db.query(query, [
      user.id,
      user.email,
      user.name,
      user.createdAt,
      user.updatedAt,
    ])
    return new User(result.rows[0])
  }

  async findById(id: string): Promise<User | null> {
    const query = 'SELECT * FROM users WHERE id = $1'
    const result = await this.db.query(query, [id])
    return result.rows[0] ? new User(result.rows[0]) : null
  }

  async update(id: string, updates: Partial<User>): Promise<User> {
    const setClause = Object.keys(updates)
      .map((key, index) => `${key} = $${index + 2}`)
      .join(', ')

    const query = `
      UPDATE users 
      SET ${setClause}, updated_at = NOW()
      WHERE id = $1
      RETURNING *
    `
    const values = [id, ...Object.values(updates)]
    const result = await this.db.query(query, values)
    return new User(result.rows[0])
  }
}
```

### Service Layer

```typescript
export class UserService {
  constructor(private userRepository: UserRepository, private emailService: EmailService) {}

  async createUser(userData: CreateUserDto): Promise<User> {
    // Simple validation
    if (!userData.email || !userData.name) {
      throw new ValidationError('Email and name are required')
    }

    // Check for duplicates
    const existingUser = await this.userRepository.findByEmail(userData.email)
    if (existingUser) {
      throw new ConflictError('User with this email already exists')
    }

    const user = new User({
      id: uuidv4(),
      ...userData,
    })

    const savedUser = await this.userRepository.create(user)

    // Side effects
    await this.emailService.sendWelcomeEmail(savedUser.email)

    return savedUser
  }

  async getUserById(id: string): Promise<User> {
    const user = await this.userRepository.findById(id)
    if (!user) {
      throw new NotFoundError('User not found')
    }
    return user
  }

  async updateUser(id: string, updates: UpdateUserDto): Promise<User> {
    const user = await this.getUserById(id) // Ensures user exists

    // Simple business rules
    if (updates.email && updates.email !== user.email) {
      const existingUser = await this.userRepository.findByEmail(updates.email)
      if (existingUser) {
        throw new ConflictError('Email already in use')
      }
    }

    return await this.userRepository.update(id, updates)
  }

  async deleteUser(id: string): Promise<void> {
    await this.getUserById(id) // Ensures user exists
    await this.userRepository.delete(id)
  }
}
```

### Controller Layer

```typescript
@Controller('/api/users')
export class UserController {
  constructor(private userService: UserService) {}

  @Post('/')
  async createUser(@Body() userData: CreateUserDto): Promise<UserResponseDto> {
    const user = await this.userService.createUser(userData)
    return this.toResponseDto(user)
  }

  @Get('/:id')
  async getUser(@Param('id') id: string): Promise<UserResponseDto> {
    const user = await this.userService.getUserById(id)
    return this.toResponseDto(user)
  }

  @Put('/:id')
  async updateUser(
    @Param('id') id: string,
    @Body() updates: UpdateUserDto,
  ): Promise<UserResponseDto> {
    const user = await this.userService.updateUser(id, updates)
    return this.toResponseDto(user)
  }

  @Delete('/:id')
  async deleteUser(@Param('id') id: string): Promise<void> {
    await this.userService.deleteUser(id)
  }

  private toResponseDto(user: User): UserResponseDto {
    return {
      id: user.id,
      email: user.email,
      name: user.name,
      createdAt: user.createdAt,
    }
  }
}
```

## Testing Strategy

```typescript
describe('UserService', () => {
  let userService: UserService
  let mockRepository: jest.Mocked<UserRepository>

  beforeEach(() => {
    mockRepository = {
      create: jest.fn(),
      findById: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    } as any

    userService = new UserService(mockRepository, mockEmailService)
  })

  it('should create user successfully', async () => {
    const userData = { email: 'test@example.com', name: 'Test User' }
    const expectedUser = new User({ id: '123', ...userData })

    mockRepository.create.mockResolvedValue(expectedUser)

    const result = await userService.createUser(userData)

    expect(result).toEqual(expectedUser)
    expect(mockRepository.create).toHaveBeenCalledWith(expect.objectContaining(userData))
  })
})
```

## Pros and Cons

### Advantages

- **Fast Development**: Quick to implement and iterate
- **Simple to Understand**: Easy for junior developers
- **Low Overhead**: Minimal abstraction layers
- **Direct Mapping**: Clear mapping between database and API

### Disadvantages

- **Limited Scalability**: Difficult to scale complex logic
- **Tight Coupling**: Database structure affects API
- **Poor Testability**: Business logic mixed with data access
- **Hard to Evolve**: Difficult to add complex features later

## Evolution Path

When CRUD becomes insufficient:

1. **Add Service Layer** → Better business logic organization
2. **Introduce Domain Models** → Richer object models
3. **Apply Layered Architecture** → Better separation of concerns
4. **Consider Hexagonal** → Better testability and flexibility

## Related Patterns

- **[Layered Architecture](layered.md)** - Natural evolution
- **[Hexagonal Architecture](hexagonal.md)** - Better testability approach
- **[Clean Architecture](clean.md)** - Dependency inversion approach

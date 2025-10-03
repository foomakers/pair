# Repository Pattern

## Overview

The Repository pattern provides a consistent interface for data access operations, abstracting the underlying data storage implementation. This pattern creates a uniform API for data operations while enabling flexibility in storage solutions and improving testability.

## Repository Philosophy

### Data Access Abstraction

Repository pattern serves as a bridge between domain logic and data access technology:

**Storage Independence**: Business logic doesn't depend on specific database technologies
**Consistent Interface**: Uniform API regardless of underlying storage mechanism
**Testability**: Easy mocking and testing of data operations
**Centralized Queries**: Complex queries are encapsulated within repository methods

### Domain-Driven Approach

Repositories should reflect domain concepts rather than database structure:

**Entity-Focused**: Each aggregate root typically has one repository
**Business Operations**: Methods should represent business concepts, not CRUD operations
**Query Abstraction**: Hide complex query logic behind meaningful method names
**Consistency Boundaries**: Maintain data consistency within aggregate boundaries

## Repository Implementation Patterns

### Basic Repository Interface

Define clear contracts for data operations:

```typescript
interface UserRepository {
  findById(id: string): Promise<User | null>
  findByEmail(email: string): Promise<User | null>
  findActiveUsers(): Promise<User[]>
  save(user: User): Promise<User>
  delete(id: string): Promise<void>
  exists(id: string): Promise<boolean>
}

class DatabaseUserRepository implements UserRepository {
  constructor(private db: Database) {}

  async findById(id: string): Promise<User | null> {
    const result = await this.db.query('SELECT * FROM users WHERE id = $1 AND deleted_at IS NULL', [
      id,
    ])
    return result.rows[0] ? this.mapToUser(result.rows[0]) : null
  }

  async findByEmail(email: string): Promise<User | null> {
    const result = await this.db.query(
      'SELECT * FROM users WHERE email = $1 AND deleted_at IS NULL',
      [email],
    )
    return result.rows[0] ? this.mapToUser(result.rows[0]) : null
  }

  async save(user: User): Promise<User> {
    if (user.id) {
      return this.update(user)
    } else {
      return this.create(user)
    }
  }

  private mapToUser(row: any): User {
    return {
      id: row.id,
      email: row.email,
      firstName: row.first_name,
      lastName: row.last_name,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    }
  }
}
```

**Benefits**: Clear separation of concerns, consistent interface, easy testing
**Use Cases**: CRUD operations, simple domain models, straightforward data access

### Generic Repository Pattern

Create reusable repository infrastructure:

```typescript
interface Repository<T, ID> {
  findById(id: ID): Promise<T | null>
  findAll(): Promise<T[]>
  save(entity: T): Promise<T>
  delete(id: ID): Promise<void>
  exists(id: ID): Promise<boolean>
}

abstract class BaseRepository<T, ID> implements Repository<T, ID> {
  constructor(protected db: Database, protected tableName: string) {}

  abstract mapToEntity(row: any): T
  abstract mapToRow(entity: T): any
  abstract getEntityId(entity: T): ID

  async findById(id: ID): Promise<T | null> {
    const result = await this.db.query(`SELECT * FROM ${this.tableName} WHERE id = $1`, [id])
    return result.rows[0] ? this.mapToEntity(result.rows[0]) : null
  }

  async save(entity: T): Promise<T> {
    const id = this.getEntityId(entity)
    const row = this.mapToRow(entity)

    if (id) {
      await this.update(id, row)
    } else {
      const newRow = await this.create(row)
      return this.mapToEntity(newRow)
    }

    return entity
  }

  protected async create(row: any): Promise<any> {
    const columns = Object.keys(row)
    const values = Object.values(row)
    const placeholders = columns.map((_, i) => `$${i + 1}`)

    const result = await this.db.query(
      `INSERT INTO ${this.tableName} (${columns.join(', ')}) 
       VALUES (${placeholders.join(', ')}) 
       RETURNING *`,
      values,
    )

    return result.rows[0]
  }
}
```

**Benefits**: Reduced boilerplate, consistent behavior, type safety
**Use Cases**: Large applications, multiple entities, standardized data access patterns

### Query Object Pattern

Encapsulate complex queries as objects:

```typescript
interface UserQuery {
  execute(): Promise<User[]>
}

class ActiveUsersQuery implements UserQuery {
  constructor(private db: Database) {}

  async execute(): Promise<User[]> {
    const result = await this.db.query(`
      SELECT * FROM users 
      WHERE is_active = true 
        AND deleted_at IS NULL 
      ORDER BY last_login_at DESC
    `)

    return result.rows.map(row => mapToUser(row))
  }
}

class UsersByRoleQuery implements UserQuery {
  constructor(private db: Database, private role: UserRole) {}

  async execute(): Promise<User[]> {
    const result = await this.db.query(
      `
      SELECT u.* FROM users u
      JOIN user_roles ur ON u.id = ur.user_id
      JOIN roles r ON ur.role_id = r.id
      WHERE r.name = $1
        AND u.deleted_at IS NULL
    `,
      [this.role],
    )

    return result.rows.map(row => mapToUser(row))
  }
}

// Repository uses query objects
class UserRepository {
  constructor(private db: Database) {}

  async findActiveUsers(): Promise<User[]> {
    return new ActiveUsersQuery(this.db).execute()
  }

  async findByRole(role: UserRole): Promise<User[]> {
    return new UsersByRoleQuery(this.db, role).execute()
  }
}
```

**Benefits**: Reusable queries, complex query encapsulation, testable query logic
**Use Cases**: Complex queries, reporting, data analytics, query optimization

## Repository Testing Strategies

### Mock Repository Implementation

Create test doubles for unit testing:

```typescript
class MockUserRepository implements UserRepository {
  private users = new Map<string, User>()

  async findById(id: string): Promise<User | null> {
    return this.users.get(id) || null
  }

  async findByEmail(email: string): Promise<User | null> {
    for (const user of this.users.values()) {
      if (user.email === email) {
        return user
      }
    }
    return null
  }

  async save(user: User): Promise<User> {
    const id = user.id || this.generateId()
    const savedUser = { ...user, id }
    this.users.set(id, savedUser)
    return savedUser
  }

  async delete(id: string): Promise<void> {
    this.users.delete(id)
  }

  // Test helper methods
  clear(): void {
    this.users.clear()
  }

  seed(users: User[]): void {
    users.forEach(user => this.users.set(user.id, user))
  }

  private generateId(): string {
    return Math.random().toString(36).substr(2, 9)
  }
}
```

### Integration Testing

Test repositories against real databases:

```typescript
describe('DatabaseUserRepository Integration', () => {
  let repository: UserRepository
  let database: Database

  beforeAll(async () => {
    database = await createTestDatabase()
    repository = new DatabaseUserRepository(database)
  })

  afterAll(async () => {
    await database.close()
  })

  beforeEach(async () => {
    await database.clear()
  })

  it('saves and retrieves users correctly', async () => {
    const userData = {
      email: 'test@example.com',
      firstName: 'John',
      lastName: 'Doe',
    }

    const savedUser = await repository.save(userData)
    expect(savedUser.id).toBeDefined()

    const retrievedUser = await repository.findById(savedUser.id)
    expect(retrievedUser).toEqual(savedUser)
  })

  it('handles non-existent users gracefully', async () => {
    const user = await repository.findById('non-existent-id')
    expect(user).toBeNull()
  })
})
```

## Repository Performance Patterns

### Caching Strategy

Implement caching to improve performance:

```typescript
class CachedUserRepository implements UserRepository {
  private cache = new Map<string, User>()
  private cacheExpiry = new Map<string, number>()

  constructor(
    private baseRepository: UserRepository,
    private ttlMs: number = 300000, // 5 minutes
  ) {}

  async findById(id: string): Promise<User | null> {
    // Check cache first
    if (this.isValidCacheEntry(id)) {
      return this.cache.get(id) || null
    }

    // Fetch from base repository
    const user = await this.baseRepository.findById(id)

    // Cache the result
    if (user) {
      this.cache.set(id, user)
      this.cacheExpiry.set(id, Date.now() + this.ttlMs)
    }

    return user
  }

  async save(user: User): Promise<User> {
    const savedUser = await this.baseRepository.save(user)

    // Update cache
    this.cache.set(savedUser.id, savedUser)
    this.cacheExpiry.set(savedUser.id, Date.now() + this.ttlMs)

    return savedUser
  }

  private isValidCacheEntry(id: string): boolean {
    const expiry = this.cacheExpiry.get(id)
    if (!expiry || Date.now() > expiry) {
      this.cache.delete(id)
      this.cacheExpiry.delete(id)
      return false
    }
    return this.cache.has(id)
  }
}
```

### Pagination Support

Handle large datasets efficiently:

```typescript
interface PaginationOptions {
  page: number
  limit: number
  sortBy?: string
  sortOrder?: 'ASC' | 'DESC'
}

interface PaginatedResult<T> {
  items: T[]
  totalItems: number
  totalPages: number
  currentPage: number
  hasNext: boolean
  hasPrevious: boolean
}

class PaginatedUserRepository extends BaseRepository<User, string> {
  async findPaginated(options: PaginationOptions): Promise<PaginatedResult<User>> {
    const { page, limit, sortBy = 'created_at', sortOrder = 'DESC' } = options
    const offset = (page - 1) * limit

    // Get total count
    const countResult = await this.db.query(
      `SELECT COUNT(*) FROM ${this.tableName} WHERE deleted_at IS NULL`,
    )
    const totalItems = parseInt(countResult.rows[0].count)

    // Get paginated results
    const result = await this.db.query(
      `
      SELECT * FROM ${this.tableName} 
      WHERE deleted_at IS NULL 
      ORDER BY ${sortBy} ${sortOrder}
      LIMIT $1 OFFSET $2
    `,
      [limit, offset],
    )

    const items = result.rows.map(row => this.mapToEntity(row))
    const totalPages = Math.ceil(totalItems / limit)

    return {
      items,
      totalItems,
      totalPages,
      currentPage: page,
      hasNext: page < totalPages,
      hasPrevious: page > 1,
    }
  }
}
```

## Repository Anti-Patterns

### Common Pitfalls to Avoid

**Leaky Abstractions**: Don't expose database-specific details through repository interfaces

```typescript
// ❌ Bad: Exposes SQL details
interface UserRepository {
  findBySQL(sql: string, params: any[]): Promise<User[]>
}

// ✅ Good: Business-focused methods
interface UserRepository {
  findActiveUsersByRole(role: UserRole): Promise<User[]>
}
```

**Generic Overkill**: Don't create overly generic repositories that lose domain meaning

```typescript
// ❌ Bad: Too generic
interface GenericRepository<T> {
  query(criteria: any): Promise<T[]>
}

// ✅ Good: Domain-specific
interface UserRepository {
  findByEmailDomain(domain: string): Promise<User[]>
  findRecentlyActive(days: number): Promise<User[]>
}
```

**Transaction Leakage**: Don't manage transactions within individual repositories

```typescript
// ❌ Bad: Transaction management in repository
class UserRepository {
  async createUserWithProfile(userData: any, profileData: any): Promise<User> {
    const transaction = await this.db.beginTransaction()
    try {
      const user = await this.createUser(userData, transaction)
      await this.createProfile(user.id, profileData, transaction)
      await transaction.commit()
      return user
    } catch (error) {
      await transaction.rollback()
      throw error
    }
  }
}

// ✅ Good: Transaction management in service layer
class UserService {
  async createUserWithProfile(userData: any, profileData: any): Promise<User> {
    return this.transactionManager.execute(async tx => {
      const user = await this.userRepository.save(userData, tx)
      await this.profileRepository.save({ ...profileData, userId: user.id }, tx)
      return user
    })
  }
}
```

## Best Practices Summary

### Repository Design

- **Domain Focus**: Design repositories around domain concepts, not database tables
- **Interface Consistency**: Maintain consistent method naming and behavior patterns
- **Single Responsibility**: Each repository should focus on one aggregate root

### Performance Considerations

- **Query Optimization**: Optimize database queries and use appropriate indexes
- **Caching Strategy**: Implement caching for frequently accessed data
- **Pagination**: Support pagination for large datasets

### Testing Strategy

- **Mock Implementations**: Create mock repositories for unit testing
- **Integration Tests**: Test against real databases for repository verification
- **Test Data Management**: Use factories and builders for consistent test data

### Error Handling

- **Consistent Exceptions**: Use consistent exception types across repositories
- **Resource Cleanup**: Ensure proper cleanup of database connections and transactions
- **Graceful Degradation**: Handle database failures gracefully

The Repository pattern enables clean separation between domain logic and data access concerns while providing a consistent, testable interface for data operations.

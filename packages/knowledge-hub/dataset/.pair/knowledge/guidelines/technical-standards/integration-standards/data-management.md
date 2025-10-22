# Data Management Standards

Comprehensive framework for data architecture, storage, processing, and lifecycle management that ensures data integrity, security, performance, and compliance across all systems.

## Purpose

Establish systematic standards for data management that ensure consistency, reliability, security, and scalability in data storage, processing, and integration patterns.

## Data Architecture Standards

### Data Layer Design

```typescript
interface DataArchitecture {
  persistenceLayer: PersistenceStrategy
  cachingLayer: CachingStrategy
  replicationStrategy: ReplicationConfig
  backupStrategy: BackupConfig
  migrationStrategy: MigrationConfig
}

enum PersistenceStrategy {
  RELATIONAL = 'relational',
  DOCUMENT = 'document',
  KEY_VALUE = 'key-value',
  GRAPH = 'graph',
  TIMESERIES = 'timeseries',
  POLYGLOT = 'polyglot',
}

interface DataStore {
  type: PersistenceStrategy
  connectionConfig: ConnectionConfig
  schema: SchemaDefinition
  indexes: IndexDefinition[]
  constraints: ConstraintDefinition[]
}
```

### Database Design Patterns

```typescript
// Entity-Relationship Design
interface EntitySchema {
  tableName: string
  columns: ColumnDefinition[]
  primaryKey: string[]
  foreignKeys: ForeignKeyDefinition[]
  indexes: IndexDefinition[]
  constraints: ConstraintDefinition[]
}

class DatabaseSchemaBuilder {
  private schemas: Map<string, EntitySchema> = new Map()

  defineEntity(name: string, definition: EntityDefinition): EntitySchema {
    const schema: EntitySchema = {
      tableName: definition.tableName || this.toSnakeCase(name),
      columns: this.buildColumns(definition.fields),
      primaryKey: definition.primaryKey || ['id'],
      foreignKeys: definition.relationships?.map(rel => this.buildForeignKey(rel)) || [],
      indexes: this.buildIndexes(definition.indexes || []),
      constraints: this.buildConstraints(definition.constraints || []),
    }

    this.schemas.set(name, schema)
    return schema
  }

  generateMigration(entityName: string, changes: SchemaChange[]): Migration {
    const schema = this.schemas.get(entityName)
    if (!schema) {
      throw new Error(`Entity ${entityName} not found`)
    }

    return {
      id: `${Date.now()}_${entityName}_${changes.map(c => c.type).join('_')}`,
      description: `Update ${entityName} schema`,
      up: this.generateUpMigration(schema, changes),
      down: this.generateDownMigration(schema, changes),
      timestamp: new Date(),
    }
  }

  private buildColumns(fields: FieldDefinition[]): ColumnDefinition[] {
    return fields.map(field => ({
      name: this.toSnakeCase(field.name),
      type: this.mapFieldType(field.type),
      nullable: field.optional || false,
      defaultValue: field.default,
      unique: field.unique || false,
      length: field.length,
      precision: field.precision,
      scale: field.scale,
    }))
  }
}

// Example entity definitions
const userEntityDefinition: EntityDefinition = {
  tableName: 'users',
  fields: [
    { name: 'id', type: 'uuid', primaryKey: true },
    { name: 'email', type: 'string', unique: true, length: 255 },
    { name: 'password', type: 'string', length: 255 },
    { name: 'firstName', type: 'string', length: 100 },
    { name: 'lastName', type: 'string', length: 100 },
    { name: 'dateOfBirth', type: 'date', optional: true },
    { name: 'createdAt', type: 'timestamp', default: 'CURRENT_TIMESTAMP' },
    { name: 'updatedAt', type: 'timestamp', default: 'CURRENT_TIMESTAMP' },
  ],
  indexes: [
    { name: 'idx_users_email', columns: ['email'], unique: true },
    { name: 'idx_users_name', columns: ['firstName', 'lastName'] },
  ],
  constraints: [
    {
      name: 'chk_email_format',
      type: 'check',
      condition: "email ~ '^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+.[A-Za-z]{2,}$'",
    },
  ],
}
```

## Data Access Layer Standards

### Repository Pattern Implementation

```typescript
interface Repository<T, ID> {
  findById(id: ID): Promise<T | null>
  findAll(criteria?: SearchCriteria): Promise<T[]>
  save(entity: T): Promise<T>
  update(id: ID, updates: Partial<T>): Promise<T>
  delete(id: ID): Promise<boolean>
  count(criteria?: SearchCriteria): Promise<number>
}

interface SearchCriteria {
  filters: FilterCriterion[]
  sorting: SortCriterion[]
  pagination: PaginationCriterion
}

abstract class BaseRepository<T, ID> implements Repository<T, ID> {
  protected abstract tableName: string
  protected abstract primaryKey: keyof T

  constructor(protected db: DatabaseConnection) {}

  async findById(id: ID): Promise<T | null> {
    try {
      const query = `SELECT * FROM ${this.tableName} WHERE ${String(this.primaryKey)} = $1`
      const result = await this.db.query(query, [id])

      return result.rows.length > 0 ? this.mapRowToEntity(result.rows[0]) : null
    } catch (error) {
      this.handleError('findById', error, { id })
      throw error
    }
  }

  async findAll(criteria?: SearchCriteria): Promise<T[]> {
    try {
      const queryBuilder = new QueryBuilder(this.tableName)

      if (criteria?.filters) {
        criteria.filters.forEach(filter => queryBuilder.addFilter(filter))
      }

      if (criteria?.sorting) {
        criteria.sorting.forEach(sort => queryBuilder.addSort(sort))
      }

      if (criteria?.pagination) {
        queryBuilder.addPagination(criteria.pagination)
      }

      const { query, params } = queryBuilder.build()
      const result = await this.db.query(query, params)

      return result.rows.map(row => this.mapRowToEntity(row))
    } catch (error) {
      this.handleError('findAll', error, { criteria })
      throw error
    }
  }

  async save(entity: T): Promise<T> {
    try {
      const insertData = this.mapEntityToRow(entity)
      const columns = Object.keys(insertData)
      const values = Object.values(insertData)
      const placeholders = values.map((_, index) => `$${index + 1}`)

      const query = `
        INSERT INTO ${this.tableName} (${columns.join(', ')})
        VALUES (${placeholders.join(', ')})
        RETURNING *
      `

      const result = await this.db.query(query, values)
      return this.mapRowToEntity(result.rows[0])
    } catch (error) {
      this.handleError('save', error, { entity })
      throw error
    }
  }

  protected abstract mapRowToEntity(row: any): T
  protected abstract mapEntityToRow(entity: T): any

  protected handleError(operation: string, error: any, context: any): void {
    console.error(`Repository ${operation} error:`, {
      table: this.tableName,
      error: error.message,
      context,
      timestamp: new Date().toISOString(),
    })
  }
}

// Example repository implementation
class UserRepository extends BaseRepository<User, string> {
  protected tableName = 'users'
  protected primaryKey: keyof User = 'id'

  protected mapRowToEntity(row: any): User {
    return {
      id: row.id,
      email: row.email,
      firstName: row.first_name,
      lastName: row.last_name,
      dateOfBirth: row.date_of_birth ? new Date(row.date_of_birth) : null,
      createdAt: new Date(row.created_at),
      updatedAt: new Date(row.updated_at),
    }
  }

  protected mapEntityToRow(entity: User): any {
    return {
      id: entity.id,
      email: entity.email,
      first_name: entity.firstName,
      last_name: entity.lastName,
      date_of_birth: entity.dateOfBirth?.toISOString().split('T')[0],
      created_at: entity.createdAt?.toISOString(),
      updated_at: entity.updatedAt?.toISOString(),
    }
  }

  async findByEmail(email: string): Promise<User | null> {
    const query = `SELECT * FROM ${this.tableName} WHERE email = $1`
    const result = await this.db.query(query, [email])

    return result.rows.length > 0 ? this.mapRowToEntity(result.rows[0]) : null
  }
}
```

### Query Optimization Standards

```typescript
interface QueryPerformanceConfig {
  slowQueryThreshold: number // milliseconds
  explainAnalyze: boolean
  indexSuggestions: boolean
  queryCache: CacheConfig
}

class QueryOptimizer {
  constructor(private config: QueryPerformanceConfig) {}

  async executeOptimizedQuery<T>(
    query: string,
    params: any[],
    options?: QueryOptions,
  ): Promise<QueryResult<T>> {
    const startTime = Date.now()

    try {
      // Check query cache first
      if (this.config.queryCache.enabled && this.shouldCache(query, options)) {
        const cacheKey = this.generateCacheKey(query, params)
        const cachedResult = await this.getCachedResult<T>(cacheKey)

        if (cachedResult) {
          return {
            ...cachedResult,
            fromCache: true,
            executionTime: 0,
          }
        }
      }

      // Execute query with performance monitoring
      const result = await this.executeWithMonitoring(query, params)
      const executionTime = Date.now() - startTime

      // Log slow queries
      if (executionTime > this.config.slowQueryThreshold) {
        await this.logSlowQuery(query, params, executionTime)

        if (this.config.explainAnalyze) {
          await this.analyzeQuery(query, params)
        }
      }

      // Cache successful results
      if (this.shouldCache(query, options)) {
        const cacheKey = this.generateCacheKey(query, params)
        await this.cacheResult(cacheKey, result, this.config.queryCache.ttl)
      }

      return {
        rows: result.rows,
        rowCount: result.rowCount,
        executionTime,
        fromCache: false,
      }
    } catch (error) {
      const executionTime = Date.now() - startTime
      await this.logQueryError(query, params, error, executionTime)
      throw error
    }
  }

  private async analyzeQuery(query: string, params: any[]): Promise<void> {
    try {
      const explainQuery = `EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON) ${query}`
      const result = await this.db.query(explainQuery, params)

      const analysis = this.parseExplainResult(result.rows[0])

      if (analysis.suggestions.length > 0) {
        console.warn('Query optimization suggestions:', {
          query: query.substring(0, 100) + '...',
          suggestions: analysis.suggestions,
          executionStats: analysis.stats,
        })
      }
    } catch (error) {
      console.error('Query analysis failed:', error)
    }
  }

  private parseExplainResult(explainData: any): QueryAnalysis {
    const plan = explainData[0].Plan
    const suggestions: OptimizationSuggestion[] = []

    // Check for missing indexes
    if (this.hasSequentialScan(plan)) {
      suggestions.push({
        type: 'MISSING_INDEX',
        description: 'Consider adding an index to avoid sequential scan',
        impact: 'HIGH',
      })
    }

    // Check for expensive operations
    if (plan['Total Cost'] > 1000) {
      suggestions.push({
        type: 'EXPENSIVE_OPERATION',
        description: 'Query has high cost, consider optimization',
        impact: 'MEDIUM',
      })
    }

    return {
      stats: {
        totalCost: plan['Total Cost'],
        actualTime: plan['Actual Total Time'],
        rowsReturned: plan['Actual Rows'],
        buffers: plan['Shared Hit Blocks'] || 0,
      },
      suggestions,
    }
  }
}
```

## Data Validation and Integrity

### Schema Validation Framework

```typescript
interface ValidationRule {
  field: string
  validator: ValidatorFunction
  message: string
  severity: ValidationSeverity
}

enum ValidationSeverity {
  ERROR = 'error',
  WARNING = 'warning',
  INFO = 'info',
}

class DataValidator {
  private rules: Map<string, ValidationRule[]> = new Map()

  addRule(entity: string, rule: ValidationRule): void {
    if (!this.rules.has(entity)) {
      this.rules.set(entity, [])
    }
    this.rules.get(entity)!.push(rule)
  }

  async validate(entity: string, data: any): Promise<ValidationResult> {
    const rules = this.rules.get(entity) || []
    const errors: ValidationError[] = []
    const warnings: ValidationWarning[] = []

    for (const rule of rules) {
      try {
        const isValid = await rule.validator(data[rule.field], data)

        if (!isValid) {
          const violation = {
            field: rule.field,
            message: rule.message,
            value: data[rule.field],
            severity: rule.severity,
          }

          if (rule.severity === ValidationSeverity.ERROR) {
            errors.push(violation)
          } else if (rule.severity === ValidationSeverity.WARNING) {
            warnings.push(violation)
          }
        }
      } catch (error) {
        errors.push({
          field: rule.field,
          message: `Validation error: ${error.message}`,
          value: data[rule.field],
          severity: ValidationSeverity.ERROR,
        })
      }
    }

    return {
      isValid: errors.length === 0,
      errors,
      warnings,
    }
  }
}

// Built-in validators
const commonValidators = {
  required: (value: any) => value !== null && value !== undefined && value !== '',

  email: (value: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value),

  minLength: (min: number) => (value: string) => value && value.length >= min,

  maxLength: (max: number) => (value: string) => !value || value.length <= max,

  range: (min: number, max: number) => (value: number) => value >= min && value <= max,

  uniqueAsync:
    (repository: Repository<any, any>, field: string) => async (value: any, entity: any) => {
      const existing = await repository.findByField(field, value)
      return !existing || existing.id === entity.id
    },

  foreignKeyExists: (repository: Repository<any, any>) => async (value: any) => {
    if (!value) return true // Allow null foreign keys
    const referenced = await repository.findById(value)
    return !!referenced
  },
}

// Example validation setup
const userValidationRules: ValidationRule[] = [
  {
    field: 'email',
    validator: commonValidators.required,
    message: 'Email is required',
    severity: ValidationSeverity.ERROR,
  },
  {
    field: 'email',
    validator: commonValidators.email,
    message: 'Invalid email format',
    severity: ValidationSeverity.ERROR,
  },
  {
    field: 'firstName',
    validator: commonValidators.minLength(2),
    message: 'First name must be at least 2 characters',
    severity: ValidationSeverity.ERROR,
  },
  {
    field: 'age',
    validator: commonValidators.range(0, 150),
    message: 'Age must be between 0 and 150',
    severity: ValidationSeverity.WARNING,
  },
]
```

## Data Migration and Versioning

### Migration Management System

```typescript
interface Migration {
  id: string
  description: string
  version: string
  up: () => Promise<void>
  down: () => Promise<void>
  dependencies: string[]
  timestamp: Date
}

class MigrationManager {
  private migrations: Map<string, Migration> = new Map()
  private appliedMigrations: Set<string> = new Set()

  async loadMigrations(migrationPath: string): Promise<void> {
    const migrationFiles = await this.getMigrationFiles(migrationPath)

    for (const file of migrationFiles) {
      const migration = await this.loadMigration(file)
      this.migrations.set(migration.id, migration)
    }

    await this.loadAppliedMigrations()
  }

  async migrate(targetVersion?: string): Promise<MigrationResult> {
    const pendingMigrations = this.getPendingMigrations(targetVersion)
    const results: MigrationStepResult[] = []

    try {
      await this.db.beginTransaction()

      for (const migration of pendingMigrations) {
        const stepResult = await this.executeMigration(migration)
        results.push(stepResult)

        if (!stepResult.success) {
          throw new Error(`Migration ${migration.id} failed: ${stepResult.error}`)
        }
      }

      await this.db.commitTransaction()

      return {
        success: true,
        migrationsApplied: results.length,
        results,
      }
    } catch (error) {
      await this.db.rollbackTransaction()

      return {
        success: false,
        error: error.message,
        migrationsApplied: results.filter(r => r.success).length,
        results,
      }
    }
  }

  async rollback(steps: number = 1): Promise<MigrationResult> {
    const migrationsToRollback = this.getLastAppliedMigrations(steps)
    const results: MigrationStepResult[] = []

    try {
      await this.db.beginTransaction()

      for (const migration of migrationsToRollback.reverse()) {
        const stepResult = await this.rollbackMigration(migration)
        results.push(stepResult)

        if (!stepResult.success) {
          throw new Error(`Rollback ${migration.id} failed: ${stepResult.error}`)
        }
      }

      await this.db.commitTransaction()

      return {
        success: true,
        migrationsApplied: results.length,
        results,
      }
    } catch (error) {
      await this.db.rollbackTransaction()
      throw error
    }
  }

  private async executeMigration(migration: Migration): Promise<MigrationStepResult> {
    const startTime = Date.now()

    try {
      await migration.up()
      await this.recordMigrationApplied(migration)

      this.appliedMigrations.add(migration.id)

      return {
        migrationId: migration.id,
        success: true,
        executionTime: Date.now() - startTime,
      }
    } catch (error) {
      return {
        migrationId: migration.id,
        success: false,
        error: error.message,
        executionTime: Date.now() - startTime,
      }
    }
  }
}

// Example migration
const createUsersTableMigration: Migration = {
  id: '20240101000001_create_users_table',
  description: 'Create users table with basic fields',
  version: '1.0.0',
  dependencies: [],
  timestamp: new Date('2024-01-01'),

  up: async () => {
    await db.query(`
      CREATE TABLE users (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        email VARCHAR(255) UNIQUE NOT NULL,
        password VARCHAR(255) NOT NULL,
        first_name VARCHAR(100) NOT NULL,
        last_name VARCHAR(100) NOT NULL,
        date_of_birth DATE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `)

    await db.query(`
      CREATE INDEX idx_users_email ON users(email);
      CREATE INDEX idx_users_name ON users(first_name, last_name);
    `)
  },

  down: async () => {
    await db.query('DROP TABLE IF EXISTS users CASCADE')
  },
}
```

## Data Security and Privacy

### Data Encryption Standards

```typescript
interface EncryptionConfig {
  algorithm: string
  keyDerivation: KeyDerivationConfig
  encryptionAtRest: boolean
  encryptionInTransit: boolean
  fieldLevelEncryption: FieldEncryptionConfig[]
}

class DataEncryptionService {
  private encryptionKey: Buffer
  private fieldEncryption: Map<string, FieldEncryptionConfig> = new Map()

  constructor(private config: EncryptionConfig) {
    this.initializeEncryption()
  }

  async encryptSensitiveFields(entity: string, data: any): Promise<any> {
    const encryptedData = { ...data }

    for (const [field, value] of Object.entries(data)) {
      const encryptionConfig = this.fieldEncryption.get(`${entity}.${field}`)

      if (encryptionConfig && value) {
        encryptedData[field] = await this.encryptField(value, encryptionConfig)
      }
    }

    return encryptedData
  }

  async decryptSensitiveFields(entity: string, data: any): Promise<any> {
    const decryptedData = { ...data }

    for (const [field, value] of Object.entries(data)) {
      const encryptionConfig = this.fieldEncryption.get(`${entity}.${field}`)

      if (encryptionConfig && value && this.isEncrypted(value)) {
        decryptedData[field] = await this.decryptField(value, encryptionConfig)
      }
    }

    return decryptedData
  }

  private async encryptField(value: any, config: FieldEncryptionConfig): Promise<string> {
    const plaintext = typeof value === 'string' ? value : JSON.stringify(value)

    switch (config.method) {
      case EncryptionMethod.AES_256_GCM:
        return this.encryptAES256GCM(plaintext)
      case EncryptionMethod.BCRYPT:
        return this.hashBcrypt(plaintext, config.rounds || 12)
      default:
        throw new Error(`Unsupported encryption method: ${config.method}`)
    }
  }

  private async encryptAES256GCM(plaintext: string): Promise<string> {
    const iv = crypto.randomBytes(16)
    const cipher = crypto.createCipher('aes-256-gcm', this.encryptionKey, { iv })

    let encrypted = cipher.update(plaintext, 'utf8', 'hex')
    encrypted += cipher.final('hex')

    const tag = cipher.getAuthTag()

    return JSON.stringify({
      encrypted,
      iv: iv.toString('hex'),
      tag: tag.toString('hex'),
      method: 'aes-256-gcm',
    })
  }
}

// Data masking for non-production environments
class DataMaskingService {
  private maskingRules: Map<string, MaskingRule> = new Map()

  addMaskingRule(field: string, rule: MaskingRule): void {
    this.maskingRules.set(field, rule)
  }

  maskSensitiveData(entity: string, data: any): any {
    const maskedData = { ...data }

    for (const [field, value] of Object.entries(data)) {
      const maskingRule = this.maskingRules.get(`${entity}.${field}`)

      if (maskingRule && value) {
        maskedData[field] = this.applyMasking(value, maskingRule)
      }
    }

    return maskedData
  }

  private applyMasking(value: any, rule: MaskingRule): any {
    switch (rule.type) {
      case MaskingType.REPLACE:
        return rule.replacement
      case MaskingType.PARTIAL:
        return this.partialMask(value.toString(), rule.visibleChars || 4)
      case MaskingType.SCRAMBLE:
        return this.scrambleValue(value.toString())
      case MaskingType.ANONYMIZE:
        return this.generateAnonymousValue(rule.format)
      default:
        return value
    }
  }

  private partialMask(value: string, visibleChars: number): string {
    if (value.length <= visibleChars) return '*'.repeat(value.length)

    const masked = '*'.repeat(value.length - visibleChars)
    return value.substring(0, visibleChars) + masked
  }
}
```

This comprehensive data management framework ensures robust, secure, and scalable data handling across all application layers while maintaining performance and compliance with data protection standards.

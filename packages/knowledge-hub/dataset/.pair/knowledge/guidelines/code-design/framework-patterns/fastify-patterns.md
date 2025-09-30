# ⚡ Fastify Patterns

**Focus**: Service architecture, route handling, and API design patterns

Fastify implementation patterns for building high-performance Node.js APIs with TypeScript, focusing on service architecture, dependency injection, and error handling patterns.

## 🛣️ Route Structure Standards

### Route Handler Definition

```typescript
// ✅ Route handlers always async with proper typing
type CreateUserRequest = {
  readonly Body: {
    readonly name: string
    readonly email: string
    readonly age: number
  }
}

type CreateUserResponse = {
  readonly user: User
  readonly created: true
}

const createUserRoute = async (
  request: FastifyRequest<CreateUserRequest>,
  reply: FastifyReply,
): Promise<CreateUserResponse> => {
  // Validate at boundary
  const userData = CreateUserSchema.parse(request.body)

  const result = await userService.createUser(userData)

  return match(result, {
    success: user => {
      reply.status(201)
      return { user, created: true }
    },
    error: error => {
      reply.status(400)
      throw new Error(error.message)
    },
  })
}

// ✅ Schema validation with Zod
const CreateUserSchema = z.object({
  name: z.string().min(1),
  email: z.string().email(),
})
```

### Route Registration Patterns

```typescript
// ✅ Feature-based route organization
const registerUserRoutes = async (fastify: FastifyInstance) => {
  // Group related routes with common prefix
  await fastify.register(async userRoutes => {
    userRoutes.post('/users', createUserRoute)
    userRoutes.get('/users/:id', getUserRoute)
    userRoutes.put('/users/:id', updateUserRoute)
    userRoutes.delete('/users/:id', deleteUserRoute)
  })
}

// ✅ Plugin-based route organization
const userPlugin: FastifyPluginAsync = async fastify => {
  // Register schemas
  fastify.addSchema(CreateUserSchema)
  fastify.addSchema(UpdateUserSchema)

  // Register routes with schema validation
  fastify.post('/users', {
    schema: {
      body: CreateUserSchema,
      response: {
        201: CreateUserResponseSchema,
      },
    },
    handler: createUserRoute,
  })
}
```

## 🏗️ Service Layer Pattern

### Service Definition

```typescript
// ✅ Result pattern for error handling
type Result<T, E = Error> = { success: true; data: T } | { success: false; error: E }

type UserService = {
  readonly createUser: (data: CreateUserData) => Promise<Result<User>>
  readonly getUser: (id: UserId) => Promise<Result<User>>
  readonly updateUser: (id: UserId, data: Partial<CreateUserData>) => Promise<Result<User>>
  readonly deleteUser: (id: UserId) => Promise<Result<void>>
}

const createUserService = (repository: UserRepository): UserService => ({
  createUser: async data => {
    try {
      // Business logic validation
      const existingUser = await repository.findByEmail(data.email)
      if (existingUser) {
        return {
          success: false,
          error: new Error('User with this email already exists'),
        }
      }

      // Create user
      const user = await repository.create(data)
      return { success: true, data: user }
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error : new Error('Unknown error'),
      }
    }
  },

  getUser: async id => {
    try {
      const user = await repository.findById(id)
      if (!user) {
        return {
          success: false,
          error: new Error('User not found'),
        }
      }
      return { success: true, data: user }
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error : new Error('Unknown error'),
      }
    }
  },
})
```

## 📊 Repository Pattern

### Repository Definition

```typescript
// ✅ Pure functions for data access
type UserRepository = {
  readonly create: (data: CreateUserData) => Promise<User>
  readonly findById: (id: UserId) => Promise<User | null>
  readonly findByEmail: (email: Email) => Promise<User | null>
  readonly update: (id: UserId, data: Partial<CreateUserData>) => Promise<User>
  readonly delete: (id: UserId) => Promise<void>
  readonly findMany: (filters: UserFilters) => Promise<User[]>
}

const createUserRepository = (db: Database): UserRepository => ({
  create: async data => {
    return await db.user.create({
      data: {
        id: createUserId(),
        name: data.name,
        email: data.email,
        age: data.age,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    })
  },

  findById: async id => {
    return await db.user.findUnique({
      where: { id },
    })
  },

  findByEmail: async email => {
    return await db.user.findUnique({
      where: { email },
    })
  },

  update: async (id, data) => {
    return await db.user.update({
      where: { id },
      data: {
        ...data,
        updatedAt: new Date(),
      },
    })
  },

  delete: async id => {
    await db.user.delete({
      where: { id },
    })
  },

  findMany: async filters => {
    return await db.user.findMany({
      where: buildWhereClause(filters),
      orderBy: { createdAt: 'desc' },
    })
  },
})
```

## ❌ Error Handling Pattern

### Functional Error Handling

```typescript
// ✅ Functional error handling with match utility
const match = <T, E, R>(
  result: Result<T, E>,
  handlers: {
    success: (data: T) => R
    error: (error: E) => R
  },
): R => {
  return result.success ? handlers.success(result.data) : handlers.error(result.error)
}

// ✅ Usage in route handlers
const getUserRoute = async (
  request: FastifyRequest<{ Params: { id: string } }>,
  reply: FastifyReply,
) => {
  const userId = createUserId(request.params.id)
  const result = await userService.getUser(userId)

  return match(result, {
    success: user => {
      reply.status(200)
      return { user }
    },
    error: error => {
      reply.status(404)
      return { error: error.message }
    },
  })
}
```

### Error Types and Domain Errors

```typescript
// ✅ Domain-specific error types
abstract class UserError extends Error {
  abstract readonly code: string
  abstract readonly statusCode: number
}

class UserNotFoundError extends UserError {
  readonly code = 'USER_NOT_FOUND'
  readonly statusCode = 404

  constructor(userId: UserId) {
    super(`User with id ${userId} not found`)
  }
}

class UserAlreadyExistsError extends UserError {
  readonly code = 'USER_ALREADY_EXISTS'
  readonly statusCode = 409

  constructor(email: string) {
    super(`User with email ${email} already exists`)
  }
}

// ✅ Error handling middleware
const errorHandler = (error: Error, request: FastifyRequest, reply: FastifyReply) => {
  if (error instanceof UserError) {
    reply.status(error.statusCode).send({
      error: {
        code: error.code,
        message: error.message,
      },
    })
    return
  }

  // Generic error handling
  reply.status(500).send({
    error: {
      code: 'INTERNAL_SERVER_ERROR',
      message: 'An unexpected error occurred',
    },
  })
}
```

## 🔧 Dependency Injection

### Functional Dependency Injection

```typescript
// ✅ Functional dependency injection
type Dependencies = {
  readonly userRepository: UserRepository
  readonly emailService: EmailService
  readonly logger: Logger
}

const createApp = (deps: Dependencies) => {
  const userService = createUserService(deps.userRepository)
  const emailService = deps.emailService

  const fastify = Fastify({
    logger: deps.logger,
  })

  // Register error handler
  fastify.setErrorHandler(errorHandler)

  // Register routes with dependency injection
  fastify.register(createUserRoutes(userService, emailService))

  return fastify
}

// ✅ Route factory with dependencies
const createUserRoutes =
  (userService: UserService, emailService: EmailService) => async (fastify: FastifyInstance) => {
    fastify.post('/users', async (request, reply) => {
      const userData = CreateUserSchema.parse(request.body)
      const result = await userService.createUser(userData)

      return match(result, {
        success: async user => {
          // Send welcome email
          await emailService.sendWelcomeEmail(user.email, user.name)
          reply.status(201)
          return { user, created: true }
        },
        error: error => {
          reply.status(400)
          throw error
        },
      })
    })
  }

// ✅ Bootstrap with real dependencies
const bootstrap = async () => {
  const db = await createDatabase()
  const logger = createLogger()

  const deps: Dependencies = {
    userRepository: createUserRepository(db),
    emailService: createEmailService({ provider: 'smtp' }),
    logger,
  }

  return createApp(deps)
}
```

### Service Container Pattern

```typescript
// ✅ Service container for complex applications
type ServiceContainer = {
  readonly userService: UserService
  readonly emailService: EmailService
  readonly authService: AuthService
  readonly logger: Logger
}

const createServiceContainer = async (): Promise<ServiceContainer> => {
  // Initialize infrastructure
  const db = await createDatabase()
  const logger = createLogger()

  // Create repositories
  const userRepository = createUserRepository(db)
  const authRepository = createAuthRepository(db)

  // Create services
  const emailService = createEmailService({ provider: 'smtp' })
  const userService = createUserService(userRepository)
  const authService = createAuthService(authRepository, userRepository)

  return {
    userService,
    emailService,
    authService,
    logger,
  }
}

// ✅ Plugin registration with container
const registerApiRoutes = (container: ServiceContainer) => async (fastify: FastifyInstance) => {
  // Register all route plugins with access to container
  await fastify.register(createUserRoutes(container.userService, container.emailService))
  await fastify.register(createAuthRoutes(container.authService))
}
```

## 🔌 Plugin Architecture

### Custom Plugin Development

```typescript
// ✅ Custom Fastify plugin
const userManagementPlugin: FastifyPluginAsync<{
  prefix?: string
}> = async (fastify, options) => {
  // Plugin-scoped dependencies
  const userService = fastify.diContainer.resolve('userService')

  // Add plugin-specific decorators
  fastify.decorate('userUtils', {
    validateUserId: (id: string): UserId => {
      if (!id.startsWith('user_')) {
        throw new Error('Invalid user ID format')
      }
      return id as UserId
    },
  })

  // Register routes
  fastify.post('/users', {
    schema: {
      body: CreateUserSchema,
      response: {
        201: CreateUserResponseSchema,
      },
    },
    handler: async (request, reply) => {
      const userData = request.body
      const result = await userService.createUser(userData)

      return match(result, {
        success: user => {
          reply.status(201)
          return { user, created: true }
        },
        error: error => {
          reply.status(400)
          throw error
        },
      })
    },
  })
}
```

## 🔗 Related Patterns

- **[React/Next.js Patterns](react-nextjs-patterns.md)** - Frontend patterns that complement Fastify APIs
- **[Component Design](component-design.md)** - Service composition strategies
- **[API Standards](.pair/knowledge/guidelines/technical-standards/integration-standards/api-standards.md)** - API design standards for Fastify
- **[Error Handling](.pair/knowledge/guidelines/technical-standards/integration-standards/error-handling.md)** - Comprehensive error handling strategies

## 🎯 Implementation Guidelines

1. **Type Safety**: Always use TypeScript for route handlers and service definitions
2. **Error Handling**: Use Result patterns for predictable error handling
3. **Dependency Injection**: Use functional dependency injection for testability
4. **Repository Pattern**: Separate data access from business logic
5. **Plugin Architecture**: Organize features as Fastify plugins for modularity

---

_These Fastify patterns ensure high-performance, type-safe, and maintainable API development with clear separation of concerns._

# Dependency Injection Patterns

## Overview

Dependency injection enables loose coupling, testability, and maintainable code by managing dependencies through external configuration rather than hard-coded instantiation. This guide covers dependency injection patterns for frontend and backend TypeScript applications.

## Dependency Injection Philosophy

### Inversion of Control

Dependency injection implements inversion of control principle by removing direct dependencies:

**Loose Coupling**: Components depend on abstractions, not concrete implementations
**Testability**: Easy to inject mock dependencies for testing
**Flexibility**: Change implementations without modifying dependent code
**Single Responsibility**: Components focus on business logic, not dependency management

### DI Design Principles

Structure dependency injection for clarity and maintainability:

**Interface-Based Design**: Define clear contracts between components
**Lifecycle Management**: Control object creation and destruction appropriately
**Configuration Separation**: Keep dependency configuration separate from business logic
**Minimal Container**: Use the lightest DI approach that meets your needs

## Frontend Dependency Injection

### React Context-Based DI

Implement dependency injection using React Context for frontend applications:

```typescript
// Service definitions
interface UserService {
  getCurrentUser(): Promise<User | null>
  updateUser(id: string, updates: Partial<User>): Promise<User>
}

interface NotificationService {
  showSuccess(message: string): void
  showError(message: string): void
}

// Service implementations
class ApiUserService implements UserService {
  constructor(private httpClient: HttpClient) {}

  async getCurrentUser(): Promise<User | null> {
    const response = await this.httpClient.get('/api/user/current')
    return response.data
  }

  async updateUser(id: string, updates: Partial<User>): Promise<User> {
    const response = await this.httpClient.put(`/api/users/${id}`, updates)
    return response.data
  }
}

class ToastNotificationService implements NotificationService {
  showSuccess(message: string): void {
    toast.success(message)
  }

  showError(message: string): void {
    toast.error(message)
  }
}
```

### Service Container Context

Create a service container using React Context:

```typescript
// Service container
interface ServiceContainer {
  userService: UserService
  notificationService: NotificationService
}

const ServiceContext = createContext<ServiceContainer | null>(null)

// Service provider
export function ServiceProvider({ children }: { children: ReactNode }) {
  const services = useMemo(() => {
    const httpClient = new HttpClient(process.env.NEXT_PUBLIC_API_URL!)
    
    return {
      userService: new ApiUserService(httpClient),
      notificationService: new ToastNotificationService()
    }
  }, [])

  return (
    <ServiceContext.Provider value={services}>
      {children}
    </ServiceContext.Provider>
  )
}

// Service consumption hook
export function useServices(): ServiceContainer {
  const services = useContext(ServiceContext)
  if (!services) {
    throw new Error('useServices must be used within ServiceProvider')
  }
  return services
}
```

### Component Integration

Use dependency injection in React components:

```typescript
// Component using injected services
function UserProfile() {
  const { userService, notificationService } = useServices()
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const loadUser = async () => {
      try {
        const currentUser = await userService.getCurrentUser()
        setUser(currentUser)
      } catch (error) {
        notificationService.showError('Failed to load user profile')
      } finally {
        setLoading(false)
      }
    }

    loadUser()
  }, [userService, notificationService])

  const handleUpdateUser = async (updates: Partial<User>) => {
    if (!user) return

    try {
      const updatedUser = await userService.updateUser(user.id, updates)
      setUser(updatedUser)
      notificationService.showSuccess('Profile updated successfully')
    } catch (error) {
      notificationService.showError('Failed to update profile')
    }
  }

  if (loading) return <div>Loading...</div>

  return (
    <div>
      {user && (
        <UserForm user={user} onSubmit={handleUpdateUser} />
      )}
    </div>
  )
}
```

## Backend Dependency Injection

### Fastify DI Container

Implement dependency injection for Fastify applications:

```typescript
// Service registry
interface ServiceRegistry {
  userRepository: UserRepository
  userService: UserService
  authService: AuthService
  emailService: EmailService
}

// DI container
class DIContainer {
  private services: Map<string, any> = new Map()
  private singletons: Map<string, any> = new Map()

  register<T>(name: string, factory: () => T, singleton = true): void {
    if (singleton) {
      this.services.set(name, () => {
        if (!this.singletons.has(name)) {
          this.singletons.set(name, factory())
        }
        return this.singletons.get(name)
      })
    } else {
      this.services.set(name, factory)
    }
  }

  resolve<T>(name: string): T {
    const factory = this.services.get(name)
    if (!factory) {
      throw new Error(`Service '${name}' not registered`)
    }
    return factory()
  }
}
```

### Service Registration

Configure services in the DI container:

```typescript
// Service setup
function setupServices(container: DIContainer, db: Database) {
  // Register repositories
  container.register('userRepository', () => new UserRepository(db))
  container.register('roleRepository', () => new RoleRepository(db))

  // Register services with dependencies
  container.register('userService', () => {
    const userRepo = container.resolve<UserRepository>('userRepository')
    const roleRepo = container.resolve<RoleRepository>('roleRepository')
    return new UserService(userRepo, roleRepo)
  })

  container.register('authService', () => {
    const userService = container.resolve<UserService>('userService')
    return new AuthService(userService)
  })

  container.register('emailService', () => {
    return new EmailService({
      host: process.env.SMTP_HOST!,
      port: parseInt(process.env.SMTP_PORT!),
      secure: process.env.SMTP_SECURE === 'true'
    })
  })
}
```

### Fastify Plugin Integration

Integrate DI container with Fastify:

```typescript
// DI plugin for Fastify
const diPlugin: FastifyPluginAsync = async (fastify) => {
  const container = new DIContainer()
  
  // Setup services
  setupServices(container, fastify.db)
  
  // Add container to Fastify instance
  fastify.decorate('services', container)
}

// Type declarations
declare module 'fastify' {
  interface FastifyInstance {
    services: DIContainer
  }
}

// Route handlers using DI
fastify.get('/api/users/:id', async (request, reply) => {
  const userService = request.server.services.resolve<UserService>('userService')
  const { id } = request.params as { id: string }
  
  try {
    const user = await userService.getUserById(id)
    if (!user) {
      return reply.status(404).send({ error: 'User not found' })
    }
    return { user }
  } catch (error) {
    request.log.error(error, 'Failed to get user')
    return reply.status(500).send({ error: 'Internal server error' })
  }
})
```

## Testing with Dependency Injection

### Mock Service Creation

Create mock services for testing:

```typescript
// Mock implementations
class MockUserService implements UserService {
  private users: Map<string, User> = new Map()

  async getCurrentUser(): Promise<User | null> {
    return this.users.get('current') || null
  }

  async updateUser(id: string, updates: Partial<User>): Promise<User> {
    const existing = this.users.get(id)
    if (!existing) {
      throw new Error('User not found')
    }
    
    const updated = { ...existing, ...updates }
    this.users.set(id, updated)
    return updated
  }

  // Test helper methods
  setCurrentUser(user: User): void {
    this.users.set('current', user)
    this.users.set(user.id, user)
  }
}

class MockNotificationService implements NotificationService {
  messages: Array<{ type: 'success' | 'error', message: string }> = []

  showSuccess(message: string): void {
    this.messages.push({ type: 'success', message })
  }

  showError(message: string): void {
    this.messages.push({ type: 'error', message })
  }

  // Test helper methods
  getLastMessage(): { type: 'success' | 'error', message: string } | undefined {
    return this.messages[this.messages.length - 1]
  }

  clearMessages(): void {
    this.messages = []
  }
}
```

### Test Service Provider

Create test utilities for dependency injection:

```typescript
// Test service provider
function createTestServices(): ServiceContainer {
  return {
    userService: new MockUserService(),
    notificationService: new MockNotificationService()
  }
}

function TestServiceProvider({ 
  children, 
  services = createTestServices() 
}: { 
  children: ReactNode
  services?: ServiceContainer 
}) {
  return (
    <ServiceContext.Provider value={services}>
      {children}
    </ServiceContext.Provider>
  )
}

// Component test with DI
describe('UserProfile', () => {
  it('should display user information', async () => {
    const mockServices = createTestServices()
    const mockUser = { id: '1', name: 'John Doe', email: 'john@example.com' }
    
    ;(mockServices.userService as MockUserService).setCurrentUser(mockUser)

    render(
      <TestServiceProvider services={mockServices}>
        <UserProfile />
      </TestServiceProvider>
    )

    await waitFor(() => {
      expect(screen.getByText('John Doe')).toBeInTheDocument()
      expect(screen.getByText('john@example.com')).toBeInTheDocument()
    })
  })

  it('should show error notification on update failure', async () => {
    const mockServices = createTestServices()
    const mockUser = { id: '1', name: 'John Doe', email: 'john@example.com' }
    
    ;(mockServices.userService as MockUserService).setCurrentUser(mockUser)
    
    // Mock update to fail
    jest.spyOn(mockServices.userService, 'updateUser')
       .mockRejectedValue(new Error('Network error'))

    render(
      <TestServiceProvider services={mockServices}>
        <UserProfile />
      </TestServiceProvider>
    )

    // Trigger update and verify error handling
    const updateButton = await screen.findByText('Update Profile')
    fireEvent.click(updateButton)

    await waitFor(() => {
      const notificationService = mockServices.notificationService as MockNotificationService
      const lastMessage = notificationService.getLastMessage()
      expect(lastMessage?.type).toBe('error')
      expect(lastMessage?.message).toBe('Failed to update profile')
    })
  })
})
```

## Best Practices Summary

### Container Design
- **Minimal Dependencies**: Keep DI container simple and focused on essential services
- **Interface-First**: Design service interfaces before implementations
- **Lifecycle Management**: Choose appropriate singleton vs transient lifecycles
- **Configuration Separation**: Keep service configuration separate from business logic

### Service Architecture
- **Single Responsibility**: Each service should have a clear, focused purpose
- **Dependency Hierarchy**: Avoid circular dependencies between services
- **Error Handling**: Implement consistent error handling across all services
- **Resource Management**: Properly manage database connections and external resources

### Testing Strategy
- **Mock Services**: Create comprehensive mock implementations for testing
- **Test Utilities**: Build reusable test helpers for service injection
- **Integration Testing**: Test service interactions and dependency resolution
- **Boundary Testing**: Verify service contracts and error conditions

### Performance Considerations
- **Lazy Loading**: Initialize expensive services only when needed
- **Connection Pooling**: Share database connections and HTTP clients
- **Caching Strategy**: Implement appropriate caching at service boundaries
- **Memory Management**: Monitor service lifecycles and prevent memory leaks

Dependency injection provides a foundation for maintainable, testable applications by managing component relationships through configuration rather than hard-coded dependencies, enabling flexibility and clean separation of concerns.
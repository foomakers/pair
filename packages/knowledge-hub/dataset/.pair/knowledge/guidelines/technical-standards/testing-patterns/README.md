# Testing Patterns and Strategies

## Strategic Overview

This framework establishes comprehensive testing patterns that ensure code quality, reliability, and maintainability through systematic testing strategies, automated test suites, and performance validation across unit, integration, and end-to-end testing levels.

## Testing Philosophy and Architecture

### Testing Pyramid Implementation

#### **Unit Testing Foundation**

```typescript
// tests/unit/services/user.service.test.ts
import { describe, it, expect, beforeEach, afterEach, vi, Mock } from 'vitest'
import { UserService } from '@/services/user.service'
import { UserRepository } from '@/repositories/user.repository'
import { EmailService } from '@/services/email.service'
import { PasswordService } from '@/services/password.service'
import { EventBus } from '@/events/event-bus'
import { CacheService } from '@/services/cache.service'
import { UserNotFoundError, UserAlreadyExistsError, ValidationError } from '@/errors/user.errors'
import { createMockUser, createMockUserData } from '../mocks/user.mocks'

// Mock dependencies
vi.mock('@/repositories/user.repository')
vi.mock('@/services/email.service')
vi.mock('@/services/password.service')
vi.mock('@/events/event-bus')
vi.mock('@/services/cache.service')

describe('UserService', () => {
  let userService: UserService
  let mockUserRepository: vi.Mocked<UserRepository>
  let mockEmailService: vi.Mocked<EmailService>
  let mockPasswordService: vi.Mocked<PasswordService>
  let mockEventBus: vi.Mocked<EventBus>
  let mockCacheService: vi.Mocked<CacheService>

  beforeEach(() => {
    // Create mocked instances
    mockUserRepository = {
      findById: vi.fn(),
      findByEmail: vi.fn(),
      findMany: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    } as any

    mockEmailService = {
      sendWelcomeEmail: vi.fn(),
      sendPasswordResetEmail: vi.fn(),
    } as any

    mockPasswordService = {
      hash: vi.fn(),
      verify: vi.fn(),
    } as any

    mockEventBus = {
      emit: vi.fn(),
    } as any

    mockCacheService = {
      get: vi.fn(),
      set: vi.fn(),
      delete: vi.fn(),
      deleteByPattern: vi.fn(),
    } as any

    // Create service instance with mocked dependencies
    userService = new UserService(
      mockUserRepository,
      mockEmailService,
      mockPasswordService,
      mockCacheService,
      mockEventBus,
    )
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  describe('getUserById', () => {
    it('should return user when found', async () => {
      // Arrange
      const userId = 'user-123'
      const expectedUser = createMockUser({ id: userId })

      mockCacheService.get.mockResolvedValue(null)
      mockUserRepository.findById.mockResolvedValue(expectedUser)

      // Act
      const result = await userService.getUserById(userId)

      // Assert
      expect(result).toEqual(expectedUser)
      expect(mockUserRepository.findById).toHaveBeenCalledWith(userId)
      expect(mockCacheService.set).toHaveBeenCalledWith(`user:${userId}`, expectedUser, 600)
    })

    it('should return cached user when available', async () => {
      // Arrange
      const userId = 'user-123'
      const cachedUser = createMockUser({ id: userId })

      mockCacheService.get.mockResolvedValue(cachedUser)

      // Act
      const result = await userService.getUserById(userId)

      // Assert
      expect(result).toEqual(cachedUser)
      expect(mockUserRepository.findById).not.toHaveBeenCalled()
    })

    it('should return null when user not found', async () => {
      // Arrange
      const userId = 'nonexistent-user'

      mockCacheService.get.mockResolvedValue(null)
      mockUserRepository.findById.mockResolvedValue(null)

      // Act
      const result = await userService.getUserById(userId)

      // Assert
      expect(result).toBeNull()
      expect(mockCacheService.set).not.toHaveBeenCalled()
    })
  })

  describe('createUser', () => {
    it('should create user successfully', async () => {
      // Arrange
      const userData = createMockUserData()
      const hashedPassword = 'hashed-password-123'
      const createdUser = createMockUser(userData)

      mockUserRepository.findByEmail.mockResolvedValue(null)
      mockPasswordService.hash.mockResolvedValue(hashedPassword)
      mockUserRepository.create.mockResolvedValue(createdUser)
      mockEventBus.emit.mockResolvedValue(undefined)
      mockEmailService.sendWelcomeEmail.mockResolvedValue(undefined)

      // Act
      const result = await userService.createUser(userData)

      // Assert
      expect(result).toEqual(createdUser)
      expect(mockPasswordService.hash).toHaveBeenCalledWith(userData.password)
      expect(mockUserRepository.create).toHaveBeenCalledWith({
        ...userData,
        password: hashedPassword,
      })
      expect(mockEventBus.emit).toHaveBeenCalledWith('user.created', {
        userId: createdUser.id,
        email: createdUser.email,
        createdBy: userData.createdBy,
      })
    })

    it('should throw UserAlreadyExistsError when email exists', async () => {
      // Arrange
      const userData = createMockUserData()
      const existingUser = createMockUser({ email: userData.email })

      mockUserRepository.findByEmail.mockResolvedValue(existingUser)

      // Act & Assert
      await expect(userService.createUser(userData)).rejects.toThrow(UserAlreadyExistsError)

      expect(mockPasswordService.hash).not.toHaveBeenCalled()
      expect(mockUserRepository.create).not.toHaveBeenCalled()
    })

    it('should handle email service failure gracefully', async () => {
      // Arrange
      const userData = createMockUserData()
      const hashedPassword = 'hashed-password-123'
      const createdUser = createMockUser(userData)

      mockUserRepository.findByEmail.mockResolvedValue(null)
      mockPasswordService.hash.mockResolvedValue(hashedPassword)
      mockUserRepository.create.mockResolvedValue(createdUser)
      mockEventBus.emit.mockResolvedValue(undefined)
      mockEmailService.sendWelcomeEmail.mockRejectedValue(new Error('Email service down'))

      // Spy on console.error to verify error handling
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

      // Act
      const result = await userService.createUser(userData)

      // Assert
      expect(result).toEqual(createdUser)
      // Email failure shouldn't prevent user creation
      expect(consoleSpy).toHaveBeenCalledWith('Failed to send welcome email:', expect.any(Error))

      consoleSpy.mockRestore()
    })
  })

  describe('updateUser', () => {
    it('should update user successfully', async () => {
      // Arrange
      const userId = 'user-123'
      const existingUser = createMockUser({ id: userId })
      const updates = { name: 'Updated Name' }
      const updatedUser = { ...existingUser, ...updates }

      mockCacheService.get.mockResolvedValue(existingUser)
      mockUserRepository.update.mockResolvedValue(updatedUser)
      mockEventBus.emit.mockResolvedValue(undefined)
      mockCacheService.delete.mockResolvedValue(undefined)
      mockCacheService.deleteByPattern.mockResolvedValue(undefined)

      // Act
      const result = await userService.updateUser(userId, updates)

      // Assert
      expect(result).toEqual(updatedUser)
      expect(mockUserRepository.update).toHaveBeenCalledWith(userId, updates)
      expect(mockEventBus.emit).toHaveBeenCalledWith('user.updated', {
        userId,
        changes: updates,
        previousData: existingUser,
      })
      expect(mockCacheService.delete).toHaveBeenCalledWith(`user:${userId}`)
    })

    it('should throw UserNotFoundError when user does not exist', async () => {
      // Arrange
      const userId = 'nonexistent-user'
      const updates = { name: 'Updated Name' }

      mockCacheService.get.mockResolvedValue(null)
      mockUserRepository.findById.mockResolvedValue(null)

      // Act & Assert
      await expect(userService.updateUser(userId, updates)).rejects.toThrow(UserNotFoundError)

      expect(mockUserRepository.update).not.toHaveBeenCalled()
    })

    it('should hash password when password is updated', async () => {
      // Arrange
      const userId = 'user-123'
      const existingUser = createMockUser({ id: userId })
      const newPassword = 'new-password-123'
      const hashedPassword = 'hashed-new-password-123'
      const updates = { password: newPassword }
      const updatedUser = { ...existingUser, password: hashedPassword }

      mockCacheService.get.mockResolvedValue(existingUser)
      mockPasswordService.hash.mockResolvedValue(hashedPassword)
      mockUserRepository.update.mockResolvedValue(updatedUser)
      mockEventBus.emit.mockResolvedValue(undefined)

      // Act
      const result = await userService.updateUser(userId, updates)

      // Assert
      expect(mockPasswordService.hash).toHaveBeenCalledWith(newPassword)
      expect(mockUserRepository.update).toHaveBeenCalledWith(userId, {
        password: hashedPassword,
      })
    })
  })

  describe('deleteUser', () => {
    it('should delete user successfully', async () => {
      // Arrange
      const userId = 'user-123'
      const existingUser = createMockUser({ id: userId })

      mockCacheService.get.mockResolvedValue(existingUser)
      mockUserRepository.delete.mockResolvedValue(undefined)
      mockEventBus.emit.mockResolvedValue(undefined)
      mockCacheService.delete.mockResolvedValue(undefined)

      // Act
      await userService.deleteUser(userId)

      // Assert
      expect(mockUserRepository.delete).toHaveBeenCalledWith(userId)
      expect(mockEventBus.emit).toHaveBeenCalledWith('user.deleted', {
        userId,
        userData: existingUser,
      })
      expect(mockCacheService.delete).toHaveBeenCalledWith(`user:${userId}`)
    })

    it('should throw UserNotFoundError when user does not exist', async () => {
      // Arrange
      const userId = 'nonexistent-user'

      mockCacheService.get.mockResolvedValue(null)
      mockUserRepository.findById.mockResolvedValue(null)

      // Act & Assert
      await expect(userService.deleteUser(userId)).rejects.toThrow(UserNotFoundError)

      expect(mockUserRepository.delete).not.toHaveBeenCalled()
    })
  })
})
```

#### **Integration Testing Patterns**

```typescript
// tests/integration/api/users.test.ts
import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach } from 'vitest'
import request from 'supertest'
import { app } from '@/app'
import { database } from '@/lib/database'
import { redis } from '@/lib/redis'
import { createTestUser, createTestToken, cleanupTestData } from '../helpers/test-helpers'

describe('User API Integration Tests', () => {
  let testUser: any
  let authToken: string
  let adminUser: any
  let adminToken: string

  beforeAll(async () => {
    // Setup database connection
    await database.connect()

    // Create test users
    testUser = await createTestUser({
      email: 'test@example.com',
      name: 'Test User',
      role: 'user',
    })

    adminUser = await createTestUser({
      email: 'admin@example.com',
      name: 'Admin User',
      role: 'admin',
    })

    // Generate auth tokens
    authToken = createTestToken(testUser)
    adminToken = createTestToken(adminUser)
  })

  afterAll(async () => {
    // Cleanup test data
    await cleanupTestData()

    // Close connections
    await database.disconnect()
    await redis.disconnect()
  })

  beforeEach(async () => {
    // Clear cache before each test
    await redis.flushdb()
  })

  afterEach(async () => {
    // Reset any test-specific data
  })

  describe('GET /api/users', () => {
    it('should return paginated users list for authenticated user', async () => {
      const response = await request(app)
        .get('/api/users')
        .set('Authorization', `Bearer ${authToken}`)
        .query({
          page: '1',
          limit: '10',
        })
        .expect(200)

      expect(response.body).toMatchObject({
        success: true,
        data: expect.any(Array),
        pagination: {
          page: 1,
          limit: 10,
          total: expect.any(Number),
          totalPages: expect.any(Number),
          hasMore: expect.any(Boolean),
        },
      })

      // Verify pagination metadata
      expect(response.body.pagination.total).toBeGreaterThan(0)
      expect(response.body.data.length).toBeLessThanOrEqual(10)
    })

    it('should return 401 for unauthenticated requests', async () => {
      const response = await request(app).get('/api/users').expect(401)

      expect(response.body).toMatchObject({
        error: 'Unauthorized',
      })
    })

    it('should filter users by role when specified', async () => {
      const response = await request(app)
        .get('/api/users')
        .set('Authorization', `Bearer ${adminToken}`)
        .query({
          role: 'admin',
        })
        .expect(200)

      expect(response.body.success).toBe(true)
      expect(response.body.data.every((user: any) => user.role === 'admin')).toBe(true)
    })

    it('should search users by name and email', async () => {
      const response = await request(app)
        .get('/api/users')
        .set('Authorization', `Bearer ${adminToken}`)
        .query({
          search: 'test',
        })
        .expect(200)

      expect(response.body.success).toBe(true)
      expect(
        response.body.data.some(
          (user: any) =>
            user.name.toLowerCase().includes('test') || user.email.toLowerCase().includes('test'),
        ),
      ).toBe(true)
    })

    it('should respect rate limiting', async () => {
      // Make multiple requests quickly
      const requests = Array.from({ length: 210 }, () =>
        request(app).get('/api/users').set('Authorization', `Bearer ${authToken}`),
      )

      const responses = await Promise.all(requests)

      // Some requests should be rate limited
      const rateLimitedResponses = responses.filter(res => res.status === 429)
      expect(rateLimitedResponses.length).toBeGreaterThan(0)
    })
  })

  describe('POST /api/users', () => {
    it('should create user successfully with valid data', async () => {
      const userData = {
        email: 'newuser@example.com',
        name: 'New User',
        role: 'user',
      }

      const response = await request(app)
        .post('/api/users')
        .set('Authorization', `Bearer ${adminToken}`)
        .send(userData)
        .expect(201)

      expect(response.body).toMatchObject({
        success: true,
        data: {
          id: expect.any(String),
          email: userData.email,
          name: userData.name,
          role: userData.role,
          createdAt: expect.any(String),
        },
      })

      // Verify user was actually created in database
      const createdUser = await database.user.findByEmail(userData.email)
      expect(createdUser).toBeTruthy()
      expect(createdUser.name).toBe(userData.name)
    })

    it('should return 422 for invalid email format', async () => {
      const userData = {
        email: 'invalid-email',
        name: 'Test User',
        role: 'user',
      }

      const response = await request(app)
        .post('/api/users')
        .set('Authorization', `Bearer ${adminToken}`)
        .send(userData)
        .expect(422)

      expect(response.body).toMatchObject({
        error: 'Validation failed',
        details: expect.arrayContaining([
          expect.objectContaining({
            field: 'email',
            message: expect.stringContaining('Invalid email'),
          }),
        ]),
      })
    })

    it('should return 409 for duplicate email', async () => {
      const userData = {
        email: testUser.email, // Use existing user's email
        name: 'Duplicate User',
        role: 'user',
      }

      const response = await request(app)
        .post('/api/users')
        .set('Authorization', `Bearer ${adminToken}`)
        .send(userData)
        .expect(409)

      expect(response.body).toMatchObject({
        error: expect.stringContaining('already exists'),
      })
    })

    it('should return 403 when non-admin tries to create admin user', async () => {
      const userData = {
        email: 'newadmin@example.com',
        name: 'New Admin',
        role: 'admin',
      }

      const response = await request(app)
        .post('/api/users')
        .set('Authorization', `Bearer ${authToken}`) // Regular user token
        .send(userData)
        .expect(403)

      expect(response.body).toMatchObject({
        error: expect.stringContaining('admin'),
      })
    })
  })

  describe('GET /api/users/:id', () => {
    it('should return user details for authorized request', async () => {
      const response = await request(app)
        .get(`/api/users/${testUser.id}`)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200)

      expect(response.body).toMatchObject({
        success: true,
        data: {
          id: testUser.id,
          email: testUser.email,
          name: testUser.name,
          role: testUser.role,
        },
      })
    })

    it('should return 404 for non-existent user', async () => {
      const nonExistentId = 'non-existent-id'

      const response = await request(app)
        .get(`/api/users/${nonExistentId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(404)

      expect(response.body).toMatchObject({
        error: 'User not found',
      })
    })

    it('should return 403 when user tries to access other user data', async () => {
      const response = await request(app)
        .get(`/api/users/${adminUser.id}`)
        .set('Authorization', `Bearer ${authToken}`) // Regular user trying to access admin
        .expect(403)

      expect(response.body).toMatchObject({
        error: 'Forbidden',
      })
    })
  })

  describe('PATCH /api/users/:id', () => {
    it('should update user successfully', async () => {
      const updates = {
        name: 'Updated Name',
      }

      const response = await request(app)
        .patch(`/api/users/${testUser.id}`)
        .set('Authorization', `Bearer ${authToken}`)
        .send(updates)
        .expect(200)

      expect(response.body).toMatchObject({
        success: true,
        data: {
          id: testUser.id,
          name: updates.name,
        },
      })

      // Verify update in database
      const updatedUser = await database.user.findById(testUser.id)
      expect(updatedUser.name).toBe(updates.name)
    })

    it('should return 400 for empty update payload', async () => {
      const response = await request(app)
        .patch(`/api/users/${testUser.id}`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({})
        .expect(422)

      expect(response.body).toMatchObject({
        error: expect.stringContaining('at least one field'),
      })
    })
  })

  describe('DELETE /api/users/:id', () => {
    it('should delete user successfully by admin', async () => {
      // Create a user to delete
      const userToDelete = await createTestUser({
        email: 'delete@example.com',
        name: 'Delete Me',
        role: 'user',
      })

      const response = await request(app)
        .delete(`/api/users/${userToDelete.id}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200)

      expect(response.body).toMatchObject({
        success: true,
        message: 'User deleted successfully',
      })

      // Verify user was deleted
      const deletedUser = await database.user.findById(userToDelete.id)
      expect(deletedUser).toBeNull()
    })

    it('should return 403 for non-admin user', async () => {
      const response = await request(app)
        .delete(`/api/users/${adminUser.id}`)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(403)

      expect(response.body).toMatchObject({
        error: 'Forbidden',
      })
    })

    it('should return 400 when trying to delete own account', async () => {
      const response = await request(app)
        .delete(`/api/users/${adminUser.id}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(400)

      expect(response.body).toMatchObject({
        error: expect.stringContaining('own account'),
      })
    })
  })
})
```

### Component Testing Patterns

#### **React Component Testing with Testing Library**

```typescript
// tests/components/UserProfile.test.tsx
import { describe, it, expect, beforeEach, vi, Mock } from 'vitest'
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { UserProfile } from '@/components/UserProfile'
import { useUserProfile } from '@/hooks/useUserProfile'
import { useAuth } from '@/hooks/useAuth'
import { TestProvider } from '../helpers/TestProvider'

// Mock hooks
vi.mock('@/hooks/useUserProfile')
vi.mock('@/hooks/useAuth')

const mockUseUserProfile = useUserProfile as Mock
const mockUseAuth = useAuth as Mock

// Mock data
const mockUser = {
  id: 'user-123',
  name: 'John Doe',
  email: 'john@example.com',
  role: 'user',
  avatar: 'https://example.com/avatar.jpg',
  department: 'Engineering',
  status: 'active',
}

const mockCurrentUser = {
  id: 'current-user',
  name: 'Current User',
  role: 'admin',
}

describe('UserProfile', () => {
  const mockOnUpdate = vi.fn()
  const mockOnDelete = vi.fn()

  beforeEach(() => {
    vi.clearAllMocks()

    // Default mock implementations
    mockUseAuth.mockReturnValue({
      user: mockCurrentUser,
      isAuthenticated: true,
    })

    mockUseUserProfile.mockReturnValue({
      user: mockUser,
      isLoading: false,
      error: null,
      updateUser: mockOnUpdate,
      deleteUser: mockOnDelete,
    })
  })

  const renderUserProfile = (props = {}) => {
    return render(
      <TestProvider>
        <UserProfile userId={mockUser.id} {...props} />
      </TestProvider>,
    )
  }

  describe('Loading State', () => {
    it('should show loading skeleton when data is loading', () => {
      mockUseUserProfile.mockReturnValue({
        user: null,
        isLoading: true,
        error: null,
        updateUser: mockOnUpdate,
        deleteUser: mockOnDelete,
      })

      renderUserProfile()

      expect(screen.getByTestId('user-profile-skeleton')).toBeInTheDocument()
      expect(screen.queryByText(mockUser.name)).not.toBeInTheDocument()
    })
  })

  describe('Error State', () => {
    it('should show error message when loading fails', () => {
      const errorMessage = 'Failed to load user'
      mockUseUserProfile.mockReturnValue({
        user: null,
        isLoading: false,
        error: new Error(errorMessage),
        updateUser: mockOnUpdate,
        deleteUser: mockOnDelete,
      })

      renderUserProfile()

      expect(screen.getByText(/failed to load user/i)).toBeInTheDocument()
      expect(screen.getByRole('button', { name: /retry/i })).toBeInTheDocument()
    })

    it('should retry loading when retry button is clicked', async () => {
      const mockRetry = vi.fn()
      mockUseUserProfile.mockReturnValue({
        user: null,
        isLoading: false,
        error: new Error('Failed to load'),
        updateUser: mockOnUpdate,
        deleteUser: mockOnDelete,
        retry: mockRetry,
      })

      renderUserProfile()

      const retryButton = screen.getByRole('button', { name: /retry/i })
      await userEvent.click(retryButton)

      expect(mockRetry).toHaveBeenCalledOnce()
    })
  })

  describe('User Display', () => {
    it('should display user information correctly', () => {
      renderUserProfile()

      expect(screen.getByText(mockUser.name)).toBeInTheDocument()
      expect(screen.getByText(mockUser.email)).toBeInTheDocument()
      expect(screen.getByText(mockUser.department)).toBeInTheDocument()
      expect(screen.getByText(mockUser.role)).toBeInTheDocument()

      const avatar = screen.getByRole('img', { name: mockUser.name })
      expect(avatar).toHaveAttribute('src', mockUser.avatar)
    })

    it('should show status badge with correct styling', () => {
      renderUserProfile()

      const statusBadge = screen.getByText(mockUser.status)
      expect(statusBadge).toBeInTheDocument()
      expect(statusBadge).toHaveClass('status-active')
    })

    it('should show fallback avatar when avatar is not available', () => {
      mockUseUserProfile.mockReturnValue({
        user: { ...mockUser, avatar: null },
        isLoading: false,
        error: null,
        updateUser: mockOnUpdate,
        deleteUser: mockOnDelete,
      })

      renderUserProfile()

      const avatar = screen.getByTestId('avatar-fallback')
      expect(avatar).toBeInTheDocument()
      expect(avatar).toHaveTextContent('JD') // Initials
    })
  })

  describe('User Actions', () => {
    it('should show edit button for authorized users', () => {
      renderUserProfile()

      expect(screen.getByRole('button', { name: /edit/i })).toBeInTheDocument()
    })

    it('should not show edit button for unauthorized users', () => {
      mockUseAuth.mockReturnValue({
        user: { ...mockCurrentUser, role: 'user' },
        isAuthenticated: true,
      })

      renderUserProfile()

      expect(screen.queryByRole('button', { name: /edit/i })).not.toBeInTheDocument()
    })

    it('should open edit modal when edit button is clicked', async () => {
      renderUserProfile()

      const editButton = screen.getByRole('button', { name: /edit/i })
      await userEvent.click(editButton)

      expect(screen.getByRole('dialog', { name: /edit user/i })).toBeInTheDocument()
    })

    it('should show delete button for admin users only', () => {
      renderUserProfile()

      expect(screen.getByRole('button', { name: /delete/i })).toBeInTheDocument()
    })

    it('should not show delete button for non-admin users', () => {
      mockUseAuth.mockReturnValue({
        user: { ...mockCurrentUser, role: 'user' },
        isAuthenticated: true,
      })

      renderUserProfile()

      expect(screen.queryByRole('button', { name: /delete/i })).not.toBeInTheDocument()
    })
  })

  describe('Edit Functionality', () => {
    it('should submit form with updated data', async () => {
      renderUserProfile()

      // Open edit modal
      const editButton = screen.getByRole('button', { name: /edit/i })
      await userEvent.click(editButton)

      // Fill form
      const nameInput = screen.getByLabelText(/name/i)
      const departmentInput = screen.getByLabelText(/department/i)

      await userEvent.clear(nameInput)
      await userEvent.type(nameInput, 'Updated Name')

      await userEvent.clear(departmentInput)
      await userEvent.type(departmentInput, 'Updated Department')

      // Submit form
      const saveButton = screen.getByRole('button', { name: /save/i })
      await userEvent.click(saveButton)

      expect(mockOnUpdate).toHaveBeenCalledWith(mockUser.id, {
        name: 'Updated Name',
        department: 'Updated Department',
      })
    })

    it('should show validation errors for invalid form data', async () => {
      renderUserProfile()

      // Open edit modal
      const editButton = screen.getByRole('button', { name: /edit/i })
      await userEvent.click(editButton)

      // Submit empty form
      const nameInput = screen.getByLabelText(/name/i)
      await userEvent.clear(nameInput)

      const saveButton = screen.getByRole('button', { name: /save/i })
      await userEvent.click(saveButton)

      expect(screen.getByText(/name is required/i)).toBeInTheDocument()
      expect(mockOnUpdate).not.toHaveBeenCalled()
    })

    it('should close modal when cancel is clicked', async () => {
      renderUserProfile()

      // Open edit modal
      const editButton = screen.getByRole('button', { name: /edit/i })
      await userEvent.click(editButton)

      expect(screen.getByRole('dialog')).toBeInTheDocument()

      // Click cancel
      const cancelButton = screen.getByRole('button', { name: /cancel/i })
      await userEvent.click(cancelButton)

      expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    })
  })

  describe('Delete Functionality', () => {
    it('should show confirmation dialog when delete is clicked', async () => {
      renderUserProfile()

      const deleteButton = screen.getByRole('button', { name: /delete/i })
      await userEvent.click(deleteButton)

      expect(screen.getByRole('dialog', { name: /confirm deletion/i })).toBeInTheDocument()
      expect(screen.getByText(/are you sure/i)).toBeInTheDocument()
    })

    it('should call delete function when confirmed', async () => {
      renderUserProfile()

      const deleteButton = screen.getByRole('button', { name: /delete/i })
      await userEvent.click(deleteButton)

      const confirmButton = screen.getByRole('button', { name: /confirm/i })
      await userEvent.click(confirmButton)

      expect(mockOnDelete).toHaveBeenCalledWith(mockUser.id)
    })

    it('should close confirmation dialog when cancelled', async () => {
      renderUserProfile()

      const deleteButton = screen.getByRole('button', { name: /delete/i })
      await userEvent.click(deleteButton)

      const cancelButton = screen.getByRole('button', { name: /cancel/i })
      await userEvent.click(cancelButton)

      expect(screen.queryByRole('dialog', { name: /confirm deletion/i })).not.toBeInTheDocument()
      expect(mockOnDelete).not.toHaveBeenCalled()
    })
  })

  describe('Accessibility', () => {
    it('should have proper ARIA labels and roles', () => {
      renderUserProfile()

      expect(screen.getByRole('img', { name: mockUser.name })).toBeInTheDocument()
      expect(screen.getByRole('button', { name: /edit/i })).toBeInTheDocument()
      expect(screen.getByRole('button', { name: /delete/i })).toBeInTheDocument()
    })

    it('should support keyboard navigation', async () => {
      renderUserProfile()

      const editButton = screen.getByRole('button', { name: /edit/i })

      // Focus should work with Tab
      editButton.focus()
      expect(document.activeElement).toBe(editButton)

      // Enter should trigger click
      fireEvent.keyDown(editButton, { key: 'Enter', code: 'Enter' })

      await waitFor(() => {
        expect(screen.getByRole('dialog')).toBeInTheDocument()
      })
    })

    it('should announce status changes to screen readers', async () => {
      renderUserProfile()

      // Mock status update
      mockUseUserProfile.mockReturnValue({
        user: { ...mockUser, status: 'inactive' },
        isLoading: false,
        error: null,
        updateUser: mockOnUpdate,
        deleteUser: mockOnDelete,
      })

      // Re-render with updated status
      renderUserProfile()

      const statusElement = screen.getByText('inactive')
      expect(statusElement).toHaveAttribute('aria-live', 'polite')
    })
  })

  describe('Performance', () => {
    it('should not re-render unnecessarily', () => {
      const renderSpy = vi.fn()

      const TestComponent = () => {
        renderSpy()
        return <UserProfile userId={mockUser.id} />
      }

      const { rerender } = render(
        <TestProvider>
          <TestComponent />
        </TestProvider>,
      )

      expect(renderSpy).toHaveBeenCalledTimes(1)

      // Re-render with same props
      rerender(
        <TestProvider>
          <TestComponent />
        </TestProvider>,
      )

      // Should use memoization to prevent unnecessary re-renders
      expect(renderSpy).toHaveBeenCalledTimes(1)
    })
  })
})
```

## Test Utilities and Helpers

### Mock Factories and Test Data

#### **Comprehensive Mock Factory Pattern**

```typescript
// tests/mocks/user.mocks.ts
import { faker } from '@faker-js/faker'
import { User, CreateUserData, UpdateUserData } from '@/types/user.types'

// Base mock data factory
export function createMockUser(overrides: Partial<User> = {}): User {
  const baseUser: User = {
    id: faker.string.uuid(),
    email: faker.internet.email(),
    name: faker.person.fullName(),
    firstName: faker.person.firstName(),
    lastName: faker.person.lastName(),
    role: faker.helpers.arrayElement(['user', 'admin', 'manager']),
    department: faker.helpers.arrayElement(['Engineering', 'Marketing', 'Sales', 'HR']),
    status: faker.helpers.arrayElement(['active', 'inactive', 'pending']),
    avatar: faker.image.avatar(),
    phone: faker.phone.number(),
    address: {
      street: faker.location.streetAddress(),
      city: faker.location.city(),
      state: faker.location.state(),
      zipCode: faker.location.zipCode(),
      country: faker.location.country(),
    },
    preferences: {
      theme: faker.helpers.arrayElement(['light', 'dark', 'system']),
      language: faker.helpers.arrayElement(['en', 'es', 'fr', 'de']),
      notifications: {
        email: faker.datatype.boolean(),
        push: faker.datatype.boolean(),
        sms: faker.datatype.boolean(),
      },
    },
    metadata: {
      lastLoginAt: faker.date.recent(),
      createdAt: faker.date.past(),
      updatedAt: faker.date.recent(),
      loginCount: faker.number.int({ min: 0, max: 1000 }),
      isEmailVerified: faker.datatype.boolean(),
      isPhoneVerified: faker.datatype.boolean(),
    },
    permissions: faker.helpers.arrayElements(
      [
        'users:read',
        'users:create',
        'users:update',
        'users:delete',
        'projects:read',
        'projects:create',
        'settings:read',
      ],
      { min: 1, max: 5 },
    ),
  }

  return { ...baseUser, ...overrides }
}

// Specific user type factories
export function createAdminUser(overrides: Partial<User> = {}): User {
  return createMockUser({
    role: 'admin',
    permissions: [
      'users:read',
      'users:create',
      'users:update',
      'users:delete',
      'projects:read',
      'projects:create',
      'projects:update',
      'projects:delete',
      'settings:read',
      'settings:update',
      'admin:all',
    ],
    ...overrides,
  })
}

export function createRegularUser(overrides: Partial<User> = {}): User {
  return createMockUser({
    role: 'user',
    permissions: ['users:read', 'projects:read'],
    ...overrides,
  })
}

export function createInactiveUser(overrides: Partial<User> = {}): User {
  return createMockUser({
    status: 'inactive',
    metadata: {
      ...createMockUser().metadata,
      lastLoginAt: faker.date.past({ years: 1 }),
    },
    ...overrides,
  })
}

// Create user data factories
export function createMockUserData(overrides: Partial<CreateUserData> = {}): CreateUserData {
  return {
    email: faker.internet.email(),
    name: faker.person.fullName(),
    password: faker.internet.password({ length: 12 }),
    role: 'user',
    department: faker.helpers.arrayElement(['Engineering', 'Marketing', 'Sales']),
    createdBy: faker.string.uuid(),
    ...overrides,
  }
}

// Batch creation utilities
export function createMockUsers(count: number, overrides: Partial<User> = {}): User[] {
  return Array.from({ length: count }, () => createMockUser(overrides))
}

export function createUsersByRole(roles: string[]): User[] {
  return roles.map(role => createMockUser({ role }))
}

export function createUsersByDepartment(departments: string[]): User[] {
  return departments.map(department => createMockUser({ department }))
}

// Response mock factories
export function createMockUserResponse(user: User = createMockUser()) {
  return {
    success: true,
    data: user,
  }
}

export function createMockUsersListResponse(
  users: User[] = createMockUsers(5),
  pagination = {
    page: 1,
    limit: 20,
    total: users.length,
    totalPages: Math.ceil(users.length / 20),
    hasMore: false,
  },
) {
  return {
    success: true,
    data: users,
    pagination,
  }
}

// Error response factories
export function createMockErrorResponse(
  message: string = 'An error occurred',
  code: string = 'INTERNAL_ERROR',
  statusCode: number = 500,
) {
  return {
    success: false,
    error: {
      code,
      message,
      statusCode,
    },
  }
}

export function createMockValidationErrorResponse(
  violations: Array<{ field: string; message: string }> = [
    { field: 'email', message: 'Email is required' },
  ],
) {
  return {
    success: false,
    error: {
      code: 'VALIDATION_ERROR',
      message: 'Validation failed',
      statusCode: 422,
      details: violations,
    },
  }
}

// API mock helpers
export function mockUserAPI() {
  const users = new Map<string, User>()

  // Seed with initial data
  const initialUsers = createMockUsers(10)
  initialUsers.forEach(user => users.set(user.id, user))

  return {
    getUser: vi.fn((id: string) => {
      const user = users.get(id)
      return user
        ? createMockUserResponse(user)
        : createMockErrorResponse('User not found', 'USER_NOT_FOUND', 404)
    }),

    getUsers: vi.fn((filters: any = {}) => {
      let filteredUsers = Array.from(users.values())

      if (filters.role) {
        filteredUsers = filteredUsers.filter(u => u.role === filters.role)
      }

      if (filters.department) {
        filteredUsers = filteredUsers.filter(u => u.department === filters.department)
      }

      if (filters.search) {
        const search = filters.search.toLowerCase()
        filteredUsers = filteredUsers.filter(
          u => u.name.toLowerCase().includes(search) || u.email.toLowerCase().includes(search),
        )
      }

      const page = filters.page || 1
      const limit = filters.limit || 20
      const startIndex = (page - 1) * limit
      const endIndex = startIndex + limit

      const paginatedUsers = filteredUsers.slice(startIndex, endIndex)

      return createMockUsersListResponse(paginatedUsers, {
        page,
        limit,
        total: filteredUsers.length,
        totalPages: Math.ceil(filteredUsers.length / limit),
        hasMore: endIndex < filteredUsers.length,
      })
    }),

    createUser: vi.fn((userData: CreateUserData) => {
      const newUser = createMockUser({
        email: userData.email,
        name: userData.name,
        role: userData.role,
        department: userData.department,
      })

      users.set(newUser.id, newUser)
      return createMockUserResponse(newUser)
    }),

    updateUser: vi.fn((id: string, updates: UpdateUserData) => {
      const user = users.get(id)
      if (!user) {
        return createMockErrorResponse('User not found', 'USER_NOT_FOUND', 404)
      }

      const updatedUser = { ...user, ...updates }
      users.set(id, updatedUser)
      return createMockUserResponse(updatedUser)
    }),

    deleteUser: vi.fn((id: string) => {
      const user = users.get(id)
      if (!user) {
        return createMockErrorResponse('User not found', 'USER_NOT_FOUND', 404)
      }

      users.delete(id)
      return { success: true, message: 'User deleted successfully' }
    }),

    // Utility methods for tests
    getUsersMap: () => users,
    resetUsers: () => {
      users.clear()
      initialUsers.forEach(user => users.set(user.id, user))
    },
    addUser: (user: User) => users.set(user.id, user),
    removeUser: (id: string) => users.delete(id),
  }
}
```

This comprehensive testing patterns framework provides enterprise-grade testing strategies, mock factories, and test utilities that ensure robust code quality through systematic unit, integration, and component testing approaches.

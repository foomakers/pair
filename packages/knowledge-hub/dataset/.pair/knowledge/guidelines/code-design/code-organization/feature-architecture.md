# Feature Architecture

## Overview

Feature-based architecture organizes code around business capabilities rather than technical layers. Each feature is a self-contained module with clear boundaries, public APIs, and comprehensive testing.

## Core Principles

1. **Business-Centric**: Features map to business domains and user capabilities
2. **Self-Contained**: Each feature contains all its code (components, logic, tests)
3. **Clear Boundaries**: Features have explicit public APIs and dependencies
4. **Independent**: Features can be developed, tested, and deployed independently

## Feature Structure

### Standard Feature Layout

```text
src/features/user-management/
├── components/                # Feature-specific UI components
│   ├── UserList/
│   │   ├── UserList.tsx
│   │   ├── UserList.test.tsx
│   │   └── index.ts
│   ├── UserForm/
│   └── index.ts              # Export feature components
├── hooks/                    # Feature-specific custom hooks
│   ├── useUserData.ts
│   ├── useUserData.test.ts
│   ├── useUserValidation.ts
│   └── index.ts
├── services/                 # Business logic and API integration
│   ├── UserService.ts
│   ├── UserService.test.ts
│   ├── userApi.ts
│   └── index.ts
├── types/                    # Feature-specific type definitions
│   ├── user.types.ts
│   ├── api.types.ts
│   └── index.ts
├── utils/                    # Feature-specific utilities
│   ├── userValidation.ts
│   ├── userValidation.test.ts
│   └── index.ts
├── __tests__/               # Integration tests for the feature
│   ├── userManagement.integration.test.tsx
│   └── fixtures/
└── index.ts                 # Public API of the feature
```

## Public API Design

### Feature Index File

Each feature exposes a clean public API through its index file:

```typescript
// src/features/user-management/index.ts

// Export main components
export { UserList } from './components/UserList'
export { UserForm } from './components/UserForm'
export { UserProfile } from './components/UserProfile'

// Export custom hooks
export { useUserData } from './hooks/useUserData'
export { useUserValidation } from './hooks/useUserValidation'

// Export services (if needed externally)
export { UserService } from './services/UserService'

// Export types
export type { User, CreateUserRequest, UpdateUserRequest } from './types'

// Re-export specific utilities if they're part of the public API
export { validateUserEmail } from './utils/userValidation'
```

### Consumer Usage

```typescript
// Other features or apps consume via public API
import { UserList, UserForm, useUserData, type User } from '@/features/user-management'
```

## Component Organization

### Feature Components

Components within a feature are organized by purpose:

```typescript
// src/features/user-management/components/UserList/UserList.tsx
import { useUserData } from '../../hooks/useUserData'
import { UserService } from '../../services/UserService'

interface UserListProps {
  readonly onUserSelect?: (user: User) => void
  readonly filters?: UserFilters
}

export const UserList = ({ onUserSelect, filters }: UserListProps) => {
  const { users, loading, error } = useUserData(filters)

  // Component implementation
  return <div>{/* User list UI */}</div>
}
```

### Component Types

- **Containers**: Handle data fetching and business logic
- **Presentational**: Pure UI components with props
- **Form components**: Handle user input and validation
- **Layout components**: Structure and organize other components

## Service Layer

### Service Implementation

```typescript
// src/features/user-management/services/UserService.ts
import { userApi } from './userApi'
import type { User, CreateUserRequest, UpdateUserRequest } from '../types'

export class UserService {
  static async createUser(userData: CreateUserRequest): Promise<User> {
    try {
      const response = await userApi.createUser(userData)
      return response.data
    } catch (error) {
      throw new Error(`Failed to create user: ${error.message}`)
    }
  }

  static async updateUser(id: string, updates: UpdateUserRequest): Promise<User> {
    try {
      const response = await userApi.updateUser(id, updates)
      return response.data
    } catch (error) {
      throw new Error(`Failed to update user: ${error.message}`)
    }
  }

  static async deleteUser(id: string): Promise<void> {
    try {
      await userApi.deleteUser(id)
    } catch (error) {
      throw new Error(`Failed to delete user: ${error.message}`)
    }
  }
}
```

### API Layer

```typescript
// src/features/user-management/services/userApi.ts
import { apiClient } from '@/shared/lib/apiClient'
import type { User, CreateUserRequest, UpdateUserRequest } from '../types'

export const userApi = {
  async getUsers(filters?: UserFilters): Promise<ApiResponse<User[]>> {
    return apiClient.get('/users', { params: filters })
  },

  async getUserById(id: string): Promise<ApiResponse<User>> {
    return apiClient.get(`/users/${id}`)
  },

  async createUser(userData: CreateUserRequest): Promise<ApiResponse<User>> {
    return apiClient.post('/users', userData)
  },

  async updateUser(id: string, updates: UpdateUserRequest): Promise<ApiResponse<User>> {
    return apiClient.patch(`/users/${id}`, updates)
  },

  async deleteUser(id: string): Promise<ApiResponse<void>> {
    return apiClient.delete(`/users/${id}`)
  },
}
```

## Custom Hooks

### Data Fetching Hooks

```typescript
// src/features/user-management/hooks/useUserData.ts
import { useState, useEffect } from 'react'
import { UserService } from '../services/UserService'
import type { User, UserFilters } from '../types'

interface UseUserDataResult {
  readonly users: User[]
  readonly loading: boolean
  readonly error: string | null
  readonly refetch: () => Promise<void>
}

export const useUserData = (filters?: UserFilters): UseUserDataResult => {
  const [users, setUsers] = useState<User[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const fetchUsers = async (): Promise<void> => {
    try {
      setLoading(true)
      setError(null)
      const fetchedUsers = await UserService.getUsers(filters)
      setUsers(fetchedUsers)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchUsers()
  }, [filters])

  return {
    users,
    loading,
    error,
    refetch: fetchUsers,
  }
}
```

### Form Management Hooks

```typescript
// src/features/user-management/hooks/useUserForm.ts
import { useState } from 'react'
import { UserService } from '../services/UserService'
import { validateUserData } from '../utils/userValidation'
import type { CreateUserRequest, ValidationErrors } from '../types'

interface UseUserFormResult {
  readonly formData: CreateUserRequest
  readonly errors: ValidationErrors
  readonly isSubmitting: boolean
  readonly updateField: (field: keyof CreateUserRequest, value: string) => void
  readonly submitForm: () => Promise<boolean>
  readonly resetForm: () => void
}

export const useUserForm = (initialData?: Partial<CreateUserRequest>): UseUserFormResult => {
  const [formData, setFormData] = useState<CreateUserRequest>({
    email: '',
    firstName: '',
    lastName: '',
    ...initialData,
  })

  const [errors, setErrors] = useState<ValidationErrors>({})
  const [isSubmitting, setIsSubmitting] = useState(false)

  const updateField = (field: keyof CreateUserRequest, value: string): void => {
    setFormData(prev => ({ ...prev, [field]: value }))
    // Clear field error when user starts typing
    if (errors[field]) {
      setErrors(prev => ({ ...prev, [field]: undefined }))
    }
  }

  const submitForm = async (): Promise<boolean> => {
    const validationErrors = validateUserData(formData)
    setErrors(validationErrors)

    if (Object.keys(validationErrors).length > 0) {
      return false
    }

    try {
      setIsSubmitting(true)
      await UserService.createUser(formData)
      return true
    } catch (error) {
      setErrors({ general: error.message })
      return false
    } finally {
      setIsSubmitting(false)
    }
  }

  const resetForm = (): void => {
    setFormData({ email: '', firstName: '', lastName: '' })
    setErrors({})
  }

  return {
    formData,
    errors,
    isSubmitting,
    updateField,
    submitForm,
    resetForm,
  }
}
```

## Type Definitions

### Feature Types

```typescript
// src/features/user-management/types/user.types.ts
export interface User {
  readonly id: string
  readonly email: string
  readonly firstName: string
  readonly lastName: string
  readonly role: UserRole
  readonly createdAt: string
  readonly updatedAt: string
}

export interface CreateUserRequest {
  readonly email: string
  readonly firstName: string
  readonly lastName: string
  readonly role?: UserRole
}

export interface UpdateUserRequest {
  readonly firstName?: string
  readonly lastName?: string
  readonly role?: UserRole
}

export interface UserFilters {
  readonly role?: UserRole
  readonly search?: string
  readonly isActive?: boolean
}

export type UserRole = 'admin' | 'user' | 'guest'

export interface ValidationErrors {
  readonly [key: string]: string | undefined
}
```

## Testing Strategy

### Unit Tests

```typescript
// src/features/user-management/services/UserService.test.ts
import { UserService } from './UserService'
import { userApi } from './userApi'

// Mock the API
jest.mock('./userApi')
const mockedUserApi = userApi as jest.Mocked<typeof userApi>

describe('UserService', () => {
  describe('createUser', () => {
    it('should create user successfully', async () => {
      const userData = {
        email: 'test@example.com',
        firstName: 'John',
        lastName: 'Doe',
      }

      const mockUser = { id: '1', ...userData, createdAt: '2023-01-01' }
      mockedUserApi.createUser.mockResolvedValue({ data: mockUser })

      const result = await UserService.createUser(userData)

      expect(result).toEqual(mockUser)
      expect(mockedUserApi.createUser).toHaveBeenCalledWith(userData)
    })

    it('should handle API errors', async () => {
      const userData = {
        email: 'test@example.com',
        firstName: 'John',
        lastName: 'Doe',
      }

      mockedUserApi.createUser.mockRejectedValue(new Error('API Error'))

      await expect(UserService.createUser(userData)).rejects.toThrow(
        'Failed to create user: API Error',
      )
    })
  })
})
```

### Integration Tests

```typescript
// src/features/user-management/__tests__/userManagement.integration.test.tsx
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { UserList, UserForm } from '../index'
import { UserService } from '../services/UserService'

// Mock the service
jest.mock('../services/UserService')
const mockedUserService = UserService as jest.Mocked<typeof UserService>

describe('User Management Integration', () => {
  it('should display users and handle user creation', async () => {
    const mockUsers = [{ id: '1', email: 'john@example.com', firstName: 'John', lastName: 'Doe' }]

    mockedUserService.getUsers.mockResolvedValue(mockUsers)
    mockedUserService.createUser.mockResolvedValue({
      id: '2',
      email: 'jane@example.com',
      firstName: 'Jane',
      lastName: 'Smith',
    })

    render(
      <div>
        <UserForm onUserCreated={() => {}} />
        <UserList />
      </div>,
    )

    // Verify users are displayed
    await waitFor(() => {
      expect(screen.getByText('John Doe')).toBeInTheDocument()
    })

    // Test user creation
    fireEvent.change(screen.getByLabelText('Email'), {
      target: { value: 'jane@example.com' },
    })
    fireEvent.change(screen.getByLabelText('First Name'), {
      target: { value: 'Jane' },
    })
    fireEvent.change(screen.getByLabelText('Last Name'), {
      target: { value: 'Smith' },
    })

    fireEvent.click(screen.getByText('Create User'))

    await waitFor(() => {
      expect(mockedUserService.createUser).toHaveBeenCalledWith({
        email: 'jane@example.com',
        firstName: 'Jane',
        lastName: 'Smith',
      })
    })
  })
})
```

## Feature Dependencies

### Internal Dependencies

Features should minimize dependencies on other features:

```typescript
// ✅ Good: Using shared utilities
import { formatDate } from '@/shared/lib/utils'
import { ApiResponse } from '@/shared/types/api'

// ✅ Good: Using well-defined feature APIs
import { type User } from '@/features/user-management'

// ❌ Bad: Reaching into another feature's internals
import { UserService } from '@/features/user-management/services/UserService'
```

### Dependency Injection

For complex dependencies, use dependency injection:

```typescript
// src/features/user-management/services/UserService.ts
interface ApiClient {
  get<T>(url: string, config?: any): Promise<ApiResponse<T>>
  post<T>(url: string, data: any): Promise<ApiResponse<T>>
}

export class UserService {
  constructor(private readonly apiClient: ApiClient) {}

  async createUser(userData: CreateUserRequest): Promise<User> {
    const response = await this.apiClient.post<User>('/users', userData)
    return response.data
  }
}

// Usage with dependency injection
const userService = new UserService(apiClient)
```

## Best Practices

### 1. Clear Feature Boundaries

- Features should solve specific business problems
- Avoid technical features (e.g., "components", "utilities")
- Features should be independently testable

### 2. Minimal Public APIs

- Expose only what other features need
- Keep internal implementation details private
- Use barrel exports (index.ts files) consistently

### 3. Self-Contained Testing

- Each feature should test its own functionality
- Mock external dependencies
- Include both unit and integration tests

### 4. Documentation

- Document the feature's purpose and scope
- Provide usage examples for public APIs
- Maintain clear README for complex features

### 5. Consistent Structure

- Follow the same folder structure across features
- Use consistent naming conventions
- Apply the same patterns for similar functionality

## Common Patterns

### Feature Factory Pattern

```typescript
// src/features/user-management/userManagementFactory.ts
import { ApiClient } from '@/shared/lib/ApiClient'
import { UserService } from './services/UserService'

export const createUserManagementFeature = (apiClient: ApiClient) => {
  const userService = new UserService(apiClient)

  return {
    UserService: userService,
    // Export other feature services/utilities
  }
}
```

### Feature Provider Pattern

```typescript
// src/features/user-management/UserManagementProvider.tsx
import React, { createContext, useContext } from 'react'
import { UserService } from './services/UserService'

interface UserManagementContextValue {
  readonly userService: UserService
}

const UserManagementContext = createContext<UserManagementContextValue | null>(null)

export const UserManagementProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const userService = new UserService()

  return (
    <UserManagementContext.Provider value={{ userService }}>
      {children}
    </UserManagementContext.Provider>
  )
}

export const useUserManagement = (): UserManagementContextValue => {
  const context = useContext(UserManagementContext)
  if (!context) {
    throw new Error('useUserManagement must be used within UserManagementProvider')
  }
  return context
}
```

This feature architecture promotes maintainable, testable, and scalable code organization that aligns with business domains.

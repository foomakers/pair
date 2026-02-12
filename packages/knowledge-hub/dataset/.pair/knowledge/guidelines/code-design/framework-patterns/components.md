# React Components

## Overview

React components are the building blocks of user interfaces, encapsulating logic, state, and presentation. This guide focuses on architectural patterns, design principles, and best practices for creating maintainable and scalable component systems.

# React Components

## Overview

React components are the building blocks of user interfaces, encapsulating logic, state, and presentation. This guide focuses on architectural patterns, design principles, and best practices for creating maintainable and scalable component systems.

## Component Architecture Philosophy

### Composition Over Inheritance

React's component model favors composition over class inheritance. This approach creates more flexible and reusable components by combining simple components into complex interfaces.

**Single Responsibility**: Each component should have one clear purpose
**Composability**: Components should work well when combined with others
**Reusability**: Design components to be used in multiple contexts

### Component Hierarchy Strategy

Design component hierarchies that reflect your application's information architecture:

**Presentational Components**: Handle rendering and user interactions
**Container Components**: Manage state and data fetching
**Layout Components**: Control positioning and visual structure
**Provider Components**: Share context and state across component trees

This separation creates clear boundaries and makes testing easier.

## Design Patterns

### Compound Components

Compound components work together to form a complete interface while maintaining flexibility:

```typescript
// Flexible tab component that allows custom composition
const Tabs = ({ children, defaultValue }) => {
  const [activeTab, setActiveTab] = useState(defaultValue)

  return <TabsContext.Provider value={{ activeTab, setActiveTab }}>{children}</TabsContext.Provider>
}

// Usage allows flexible arrangement
;<Tabs defaultValue='profile'>
  <TabsList>
    <TabsTrigger value='profile'>Profile</TabsTrigger>
    <TabsTrigger value='settings'>Settings</TabsTrigger>
  </TabsList>
  <TabsContent value='profile'>Profile content</TabsContent>
  <TabsContent value='settings'>Settings content</TabsContent>
</Tabs>
```

**Benefits**: Flexible API, clear relationships between components, maintains context isolation
**Use Cases**: Complex UI patterns like tabs, accordions, dropdowns, form builders

### Render Props Pattern

Enable component logic sharing without imposing specific UI structure:

```typescript
interface DataFetcherProps<T> {
  url: string
  children: (state: { data: T | null; loading: boolean; error: Error | null }) => ReactElement
}

function DataFetcher<T>({ url, children }: DataFetcherProps<T>) {
  const [state, setState] = useState({ data: null, loading: true, error: null })

  // ... fetch logic

  return children(state)
}

// Usage with different UI presentations
;<DataFetcher url='/api/users'>
  {({ data, loading, error }) =>
    loading ? <Spinner /> : error ? <ErrorDisplay error={error} /> : <UserList users={data} />
  }
</DataFetcher>
```

**Benefits**: Logic reuse without UI constraints, type safety with generics
**Use Cases**: Data fetching, form validation, state management

### Higher-Order Components (HOCs)

Enhance components with additional capabilities:

```typescript
function withErrorBoundary<P extends object>(
  Component: ComponentType<P>,
  fallback: ComponentType<{ error: Error }>,
) {
  return function WithErrorBoundaryComponent(props: P) {
    return (
      <ErrorBoundary fallback={fallback}>
        <Component {...props} />
      </ErrorBoundary>
    )
  }
}

// Apply error handling to any component
const SafeUserProfile = withErrorBoundary(UserProfile, ErrorFallback)
```

**Benefits**: Cross-cutting concerns, reusable enhancements, backwards compatibility
**Use Cases**: Authentication, logging, error boundaries, performance monitoring

## State Management Patterns

### Local State Strategy

Keep state as local as possible, lifting it up only when necessary:

**Component State**: For UI-specific state (form inputs, toggles, local preferences)
**Parent State**: When multiple children need to share state
**Context State**: For state shared across distant components
**Global State**: For application-wide state that persists across navigation

### Controlled vs Uncontrolled Components

**Controlled Components**: React controls the input value through props and callbacks

```typescript
function ControlledInput({ value, onChange, label }) {
  return (
    <div>
      <label>{label}</label>
      <input value={value} onChange={onChange} />
    </div>
  )
}
```

**Uncontrolled Components**: Form elements manage their own internal state

```typescript
function UncontrolledInput({ defaultValue, label, onSubmit }) {
  const inputRef = useRef()

  const handleSubmit = () => {
    onSubmit(inputRef.current.value)
  }

  return (
    <div>
      <label>{label}</label>
      <input ref={inputRef} defaultValue={defaultValue} />
      <button onClick={handleSubmit}>Submit</button>
    </div>
  )
}
```

**Decision Criteria**: Use controlled for validation and dynamic behavior, uncontrolled for simple forms and performance

## Performance Optimization

### Memoization Strategy

Use memoization techniques strategically to prevent unnecessary re-renders:

**React.memo**: Memoize entire components when props don't change frequently
**useMemo**: Memoize expensive calculations
**useCallback**: Memoize event handlers passed to child components

```typescript
const ExpensiveComponent = React.memo(({ data, onAction }) => {
  const processedData = useMemo(() => data.map(item => complexCalculation(item)), [data])

  const handleAction = useCallback(
    id => {
      onAction(id)
    },
    [onAction],
  )

  return (
    <div>
      {processedData.map(item => (
        <Item key={item.id} data={item} onAction={handleAction} />
      ))}
    </div>
  )
})
```

**Guidelines**: Profile before optimizing, memoize expensive operations, avoid over-memoization

### Component Splitting

Split components strategically to improve performance and maintainability:

**Code Splitting**: Use React.lazy for route-based or feature-based splitting
**Logical Splitting**: Separate concerns into focused components
**Performance Splitting**: Isolate expensive operations into separate components

```typescript
// Lazy loading for route components
const UserDashboard = React.lazy(() => import('./UserDashboard'))

function App() {
  return (
    <Suspense fallback={<LoadingSpinner />}>
      <Routes>
        <Route path='/dashboard' element={<UserDashboard />} />
      </Routes>
    </Suspense>
  )
}
```

## Component Testing Strategy

### Testing Hierarchy

Test components at different levels for comprehensive coverage:

**Unit Tests**: Individual component behavior and props handling
**Integration Tests**: Component interactions and data flow
**Visual Tests**: UI appearance and responsive behavior
**End-to-End Tests**: Complete user workflows

### Testing Patterns

**Arrange-Act-Assert**: Structure tests clearly with setup, action, and verification phases

```typescript
describe('UserProfile', () => {
  it('displays user information correctly', () => {
    // Arrange
    const mockUser = { id: '1', name: 'John Doe', email: 'john@example.com' }

    // Act
    render(<UserProfile user={mockUser} />)

    // Assert
    expect(screen.getByText('John Doe')).toBeInTheDocument()
    expect(screen.getByText('john@example.com')).toBeInTheDocument()
  })
})
```

**Test Behavior, Not Implementation**: Focus on what the component does, not how it does it
**Mock External Dependencies**: Isolate components from external services and APIs
**Test Error States**: Verify components handle errors gracefully

## Accessibility Patterns

### Semantic HTML Foundation

Use semantic HTML elements as the foundation for accessible components:

**Proper Elements**: Use buttons for actions, links for navigation, forms for data input
**ARIA Attributes**: Enhance semantics when HTML elements aren't sufficient
**Focus Management**: Ensure logical tab order and focus visibility

### Accessibility Patterns

```typescript
function AccessibleButton({ children, onClick, disabled = false, ariaLabel, ...props }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      aria-label={ariaLabel}
      className={`btn ${disabled ? 'btn-disabled' : ''}`}
      {...props}>
      {children}
    </button>
  )
}
```

**Focus Management**: Handle focus for dynamic content and modal dialogs
**Screen Reader Support**: Provide meaningful labels and descriptions
**Keyboard Navigation**: Ensure all interactive elements are keyboard accessible

## Component API Design

### Props Interface Design

Design component props for clarity and flexibility:

**Required vs Optional**: Make intent clear through TypeScript interfaces
**Flexible APIs**: Support multiple usage patterns without complexity
**Consistent Naming**: Use consistent prop naming across similar components

```typescript
interface ButtonProps {
  children: ReactNode
  onClick: (event: MouseEvent<HTMLButtonElement>) => void
  variant?: 'primary' | 'secondary' | 'danger'
  size?: 'small' | 'medium' | 'large'
  disabled?: boolean
  loading?: boolean
  icon?: ReactElement
}
```

**Design Principles**: Predictable behavior, clear naming, sensible defaults, extensibility

### Event Handling Patterns

Design consistent event handling across components:

**Naming Convention**: Use `onAction` pattern for event handlers
**Event Objects**: Pass relevant data in event callbacks
**Bubbling Control**: Allow consumers to control event propagation

```typescript
interface FormFieldProps {
  value: string
  onChange: (value: string, event: ChangeEvent<HTMLInputElement>) => void
  onBlur?: (value: string, event: FocusEvent<HTMLInputElement>) => void
  onFocus?: (value: string, event: FocusEvent<HTMLInputElement>) => void
}
```

## Best Practices Summary

### Component Design

- **Single Purpose**: Each component should have one clear responsibility
- **Composition**: Prefer composition over complex prop configurations
- **Immutability**: Treat props and state as immutable

### Performance

- **Measure First**: Profile before optimizing for performance
- **Strategic Memoization**: Use memoization for expensive operations, not everywhere
- **Code Splitting**: Split at route and feature boundaries

### Maintainability

- **Clear Interfaces**: Design predictable and well-documented APIs
- **Error Boundaries**: Implement error handling at appropriate levels
- **Testing**: Test behavior and user interactions, not implementation details

### Accessibility

- **Semantic Foundation**: Start with semantic HTML elements
- **Progressive Enhancement**: Layer on interactive behavior thoughtfully
- **Universal Design**: Design for diverse abilities and assistive technologies

Effective React components balance simplicity with flexibility, performance with maintainability, and developer experience with user experience.

function TabPanel({ children, value }: TabPanelProps) {
const { activeTab } = useTabs();
const isActive = activeTab === value;

if (!isActive) return null;

return (
<div
role="tabpanel"
id={`panel-${value}`}
aria-labelledby={`tab-${value}`}
className="tab-panel" >
{children}
</div>
);
}

// Attach sub-components to main component
Tabs.List = TabList;
Tabs.Tab = Tab;
Tabs.Panel = TabPanel;

// Usage
function App() {
return (
<Tabs defaultTab="profile" onTabChange={(tab) => console.log(tab)}>
<Tabs.List aria-label="Account settings">
<Tabs.Tab value="profile">Profile</Tabs.Tab>
<Tabs.Tab value="security">Security</Tabs.Tab>
<Tabs.Tab value="notifications">Notifications</Tabs.Tab>
</Tabs.List>

      <Tabs.Panel value="profile">
        <ProfileSettings />
      </Tabs.Panel>

      <Tabs.Panel value="security">
        <SecuritySettings />
      </Tabs.Panel>

      <Tabs.Panel value="notifications">
        <NotificationSettings />
      </Tabs.Panel>
    </Tabs>

);
}

````text

### 2. Render Props Pattern

```typescript

// Generic render props component
interface RenderPropsState<T> {
  data: T | null;
  loading: boolean;
  error: Error | null;
}

interface DataFetcherProps<T> {
  url: string;
  children: (state: RenderPropsState<T>) => React.ReactNode;
  refetchInterval?: number;
}

function DataFetcher<T>({ url, children, refetchInterval }: DataFetcherProps<T>) {
  const [state, setState] = useState<RenderPropsState<T>>({
    data: null,
    loading: true,
    error: null
  });

  const fetchData = useCallback(async () => {
    setState(prev => ({ ...prev, loading: true, error: null }));

    try {
      const response = await fetch(url);
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      const data = await response.json();
      setState({ data, loading: false, error: null });
    } catch (error) {
      setState({
        data: null,
        loading: false,
        error: error instanceof Error ? error : new Error('Unknown error')
      });
    }
  }, [url]);

  useEffect(() => {
    fetchData();

    if (refetchInterval) {
      const interval = setInterval(fetchData, refetchInterval);
      return () => clearInterval(interval);
    }
  }, [fetchData, refetchInterval]);

  return <>{children(state)}</>;
}

// Usage
function UserProfile({ userId }: { userId: string }) {
  return (
    <DataFetcher<User> url={`/api/users/${userId}`}>
      {({ data: user, loading, error }) => {
        if (loading) return <LoadingSpinner />;
        if (error) return <ErrorMessage error={error} />;
        if (!user) return <div>No user found</div>;

        return (
          <div className="user-profile">
            <h1>{user.firstName} {user.lastName}</h1>
            <p>{user.email}</p>
          </div>
        );
      }}
    </DataFetcher>
  );
}

````

### 3. Higher-Order Components (HOCs)

```typescript

// Generic HOC for loading states
interface WithLoadingProps {
  loading?: boolean
}

function withLoading<P extends object>(
  Component: React.ComponentType<P>,
): React.ComponentType<P & WithLoadingProps> {
  function WrappedComponent({ loading, ...props }: P & WithLoadingProps) {
    if (loading) {
      return <LoadingSpinner />
    }

    return <Component {...(props as P)} />
  }

  WrappedComponent.displayName = `withLoading(${Component.displayName || Component.name})`

  return WrappedComponent
}

// HOC for error boundaries
interface WithErrorBoundaryProps {
  fallback?: React.ComponentType<{ error: Error }>
  onError?: (error: Error, errorInfo: React.ErrorInfo) => void
}

function withErrorBoundary<P extends object>(
  Component: React.ComponentType<P>,
  options: WithErrorBoundaryProps = {},
): React.ComponentType<P> {
  const { fallback: Fallback = DefaultErrorFallback, onError } = options

  class ErrorBoundaryWrapper extends React.Component<
    P,
    { hasError: boolean; error: Error | null }
  > {
    constructor(props: P) {
      super(props)
      this.state = { hasError: false, error: null }
    }

    static getDerivedStateFromError(error: Error) {
      return { hasError: true, error }
    }

    componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
      onError?.(error, errorInfo)
    }

    render() {
      if (this.state.hasError && this.state.error) {
        return <Fallback error={this.state.error} />
      }

      return <Component {...this.props} />
    }
  }

  ErrorBoundaryWrapper.displayName = `withErrorBoundary(${Component.displayName || Component.name})`

  return ErrorBoundaryWrapper
}

// Usage
const SafeUserProfile = withErrorBoundary(withLoading(UserProfile), {
  onError: (error, errorInfo) => {
    console.error('User profile error:', error, errorInfo)
  },
})

```

## Accessibility Patterns

### 1. ARIA and Semantic HTML

```typescript

// Accessible button component
interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
| variant?: 'primary' | 'secondary' | 'danger' |
| size?: 'small'      | 'medium'    | 'large'  |
  loading?: boolean
  icon?: React.ReactNode
  'aria-label'?: string
  'aria-describedby'?: string
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  {
    children,
    variant = 'primary',
    size = 'medium',
    loading = false,
    disabled,
    icon,
    'aria-label': ariaLabel,
    'aria-describedby': ariaDescribedBy,
    className,
    ...props
  },
  ref,
) {
  const isDisabled = disabled || loading

  return (
    <button
      ref={ref}
      type='button'
      disabled={isDisabled}
      aria-label={ariaLabel}
      aria-describedby={ariaDescribedBy}
      aria-busy={loading}
      className={`
          btn 
          btn--${variant} 
          btn--${size}
          ${loading ? 'btn--loading' : ''}
          ${className || ''}
        `.trim()}
      {...props}>
      {loading && (
        <span className='btn__spinner' aria-hidden='true'>
          <LoadingSpinner size='small' />
        </span>
      )}

      {icon && !loading && (
        <span className='btn__icon' aria-hidden='true'>
          {icon}
        </span>
      )}

      <span className={loading ? 'btn__text--hidden' : ''}>{children}</span>
    </button>
  )
})

// Accessible form input
interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label: string
  error?: string
  helperText?: string
  required?: boolean
}

export const Input = React.forwardRef<HTMLInputElement, InputProps>(function Input(
  {
    label,
    error,
    helperText,
    required,
    id,
    className,
    'aria-describedby': ariaDescribedBy,
    ...props
  },
  ref,
) {
  const inputId = id || `input-${Math.random().toString(36).slice(2)}`
  const errorId = error ? `${inputId}-error` : undefined
  const helperId = helperText ? `${inputId}-helper` : undefined

  const describedBy = [ariaDescribedBy, errorId, helperId].filter(Boolean).join(' ') || undefined

  return (
    <div className={`input-group ${error ? 'input-group--error' : ''}`}>
      <label htmlFor={inputId} className='input-label'>
        {label}
        {required && (
          <span className='input-label__required' aria-label='required'>
            *
          </span>
        )}
      </label>

      <input
        ref={ref}
        id={inputId}
        required={required}
        aria-invalid={!!error}
        aria-describedby={describedBy}
        className={`input ${className || ''}`}
        {...props}
      />

      {error && (
        <div id={errorId} className='input-error' role='alert' aria-live='polite'>
          {error}
        </div>
      )}

      {helperText && !error && (
        <div id={helperId} className='input-helper'>
          {helperText}
        </div>
      )}
    </div>
  )
})

```

### 2. Focus Management

```typescript

// Focus trap hook
export function useFocusTrap(isActive: boolean) {
  const containerRef = useRef<HTMLElement>(null)

  useEffect(() => {
    if (!isActive || !containerRef.current) return

    const container = containerRef.current
    const focusableElements = container.querySelectorAll(
      'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
    )

    const firstElement = focusableElements[0] as HTMLElement
    const lastElement = focusableElements[focusableElements.length - 1] as HTMLElement

    function handleTabKey(e: KeyboardEvent) {
      if (e.key !== 'Tab') return

      if (e.shiftKey) {
        if (document.activeElement === firstElement) {
          e.preventDefault()
          lastElement?.focus()
        }
      } else {
        if (document.activeElement === lastElement) {
          e.preventDefault()
          firstElement?.focus()
        }
      }
    }

    function handleEscapeKey(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        // Handle escape - close modal, etc.
      }
    }

    container.addEventListener('keydown', handleTabKey)
    container.addEventListener('keydown', handleEscapeKey)

    // Focus first element when trap becomes active
    firstElement?.focus()

    return () => {
      container.removeEventListener('keydown', handleTabKey)
      container.removeEventListener('keydown', handleEscapeKey)
    }
  }, [isActive])

  return containerRef
}

// Accessible modal
interface ModalProps {
  isOpen: boolean
  onClose: () => void
  title: string
  children: React.ReactNode
}

export function Modal({ isOpen, onClose, title, children }: ModalProps) {
  const focusTrapRef = useFocusTrap(isOpen)
  const previousActiveElement = useRef<Element | null>(null)

  useEffect(() => {
    if (isOpen) {
      previousActiveElement.current = document.activeElement
    } else if (previousActiveElement.current instanceof HTMLElement) {
      previousActiveElement.current.focus()
    }
  }, [isOpen])

  useEffect(() => {
    function handleEscape(e: KeyboardEvent) {
      if (e.key === 'Escape' && isOpen) {
        onClose()
      }
    }

    document.addEventListener('keydown', handleEscape)
    return () => document.removeEventListener('keydown', handleEscape)
  }, [isOpen, onClose])

  if (!isOpen) return null

  return createPortal(
    <div className='modal-overlay' onClick={onClose}>
      <div
        ref={focusTrapRef}
        className='modal'
        role='dialog'
        aria-modal='true'
        aria-labelledby='modal-title'
        onClick={e => e.stopPropagation()}>
        <header className='modal-header'>
          <h2 id='modal-title' className='modal-title'>
            {title}
          </h2>
          <Button onClick={onClose} variant='secondary' size='small' aria-label='Close modal'>
            ×
          </Button>
        </header>

        <div className='modal-content'>{children}</div>
      </div>
    </div>,
    document.body,
  )
}

```

## Styling Approaches

### 1. CSS-in-JS with Styled Components

```typescript

import styled, { css } from 'styled-components'

// Theme-aware styled components
interface Theme {
  colors: {
    primary: string
    secondary: string
    danger: string
    background: string
    text: string
  }
  spacing: {
    xs: string
    sm: string
    md: string
    lg: string
    xl: string
  }
  borderRadius: string
}

interface ButtonStyledProps {
| $variant: 'primary' | 'secondary' | 'danger' |
| $size: 'small'      | 'medium'    | 'large'  |
  $fullWidth?: boolean
}

const StyledButton = styled.button<ButtonStyledProps>`
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border: none;
  border-radius: ${({ theme }) => theme.borderRadius};
  font-weight: 500;
  cursor: pointer;
  transition: all 0.2s ease-in-out;

  &:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }

  ${({ $variant, theme }) => {
    switch ($variant) {
      case 'primary':
        return css`
          background-color: ${theme.colors.primary};
          color: white;

          &:hover:not(:disabled) {
            background-color: ${theme.colors.primary}dd;
          }
        `
      case 'secondary':
        return css`
          background-color: transparent;
          color: ${theme.colors.primary};
          border: 1px solid ${theme.colors.primary};

          &:hover:not(:disabled) {
            background-color: ${theme.colors.primary}1a;
          }
        `
      case 'danger':
        return css`
          background-color: ${theme.colors.danger};
          color: white;

          &:hover:not(:disabled) {
            background-color: ${theme.colors.danger}dd;
          }
        `
    }
  }}

  ${({ $size, theme }) => {
    switch ($size) {
      case 'small':
        return css`
          padding: ${theme.spacing.xs} ${theme.spacing.sm};
          font-size: 0.875rem;
        `
      case 'medium':
        return css`
          padding: ${theme.spacing.sm} ${theme.spacing.md};
          font-size: 1rem;
        `
      case 'large':
        return css`
          padding: ${theme.spacing.md} ${theme.spacing.lg};
          font-size: 1.125rem;
        `
    }
  }}
  
  ${({ $fullWidth }) =>
    $fullWidth &&
    css`
      width: 100%;
    `}
`

```

### 2. CSS Modules with TypeScript

```typescript

// Button.module.css
.button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border: none;
  border-radius: var(--border-radius);
  font-weight: 500;
  cursor: pointer;
  transition: all 0.2s ease-in-out;
}

.button:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.primary {
  background-color: var(--color-primary);
  color: white;
}

.primary:hover:not(:disabled) {
  background-color: var(--color-primary-hover);
}

.secondary {
  background-color: transparent;
  color: var(--color-primary);
  border: 1px solid var(--color-primary);
}

.small {
  padding: var(--spacing-xs) var(--spacing-sm);
  font-size: 0.875rem;
}

.fullWidth {
  width: 100%;
}

// Button.module.css.d.ts (generated or manual)
declare const styles: {
  readonly button: string;
  readonly primary: string;
  readonly secondary: string;
  readonly danger: string;
  readonly small: string;
  readonly medium: string;
  readonly large: string;
  readonly fullWidth: string;
};

export default styles;

// Button component
import styles from './Button.module.css';

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
| variant?: 'primary' | 'secondary' | 'danger'; |
| size?: 'small'      | 'medium'    | 'large';  |
  fullWidth?: boolean;
}

export function Button({
  variant = 'primary',
  size = 'medium',
  fullWidth = false,
  className,
  ...props
}: ButtonProps) {
  const classes = [
    styles.button,
    styles[variant],
    styles[size],
    fullWidth && styles.fullWidth,
    className
  ].filter(Boolean).join(' ');

  return <button className={classes} {...props} />;
}

```

## Testing Strategies

### 1. Component Testing with Testing Library

```typescript

import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { vi } from 'vitest'
import { Button } from './Button'

describe('Button', () => {
  it('renders with correct text', () => {
    render(<Button>Click me</Button>)

    expect(screen.getByRole('button', { name: 'Click me' })).toBeInTheDocument()
  })

  it('calls onClick when clicked', async () => {
    const handleClick = vi.fn()
    const user = userEvent.setup()

    render(<Button onClick={handleClick}>Click me</Button>)

    await user.click(screen.getByRole('button'))

    expect(handleClick).toHaveBeenCalledTimes(1)
  })

  it('shows loading state correctly', () => {
    render(<Button loading>Loading</Button>)

    const button = screen.getByRole('button')
    expect(button).toHaveAttribute('aria-busy', 'true')
    expect(button).toBeDisabled()
  })

  it('is accessible with screen reader', () => {
    render(
      <Button aria-label='Save document' aria-describedby='save-help'>
        Save
      </Button>,
    )

    const button = screen.getByRole('button')
    expect(button).toHaveAttribute('aria-label', 'Save document')
    expect(button).toHaveAttribute('aria-describedby', 'save-help')
  })
})

// Complex component testing
describe('Tabs', () => {
  const renderTabs = () => {
    const onTabChange = vi.fn()

    render(
      <Tabs defaultTab='tab1' onTabChange={onTabChange}>
        <Tabs.List aria-label='Settings'>
          <Tabs.Tab value='tab1'>Profile</Tabs.Tab>
          <Tabs.Tab value='tab2'>Security</Tabs.Tab>
        </Tabs.List>

        <Tabs.Panel value='tab1'>
          <div>Profile content</div>
        </Tabs.Panel>

        <Tabs.Panel value='tab2'>
          <div>Security content</div>
        </Tabs.Panel>
      </Tabs>,
    )

    return { onTabChange }
  }

  it('renders with correct ARIA attributes', () => {
    renderTabs()

    const tablist = screen.getByRole('tablist')
    expect(tablist).toHaveAttribute('aria-label', 'Settings')

    const tabs = screen.getAllByRole('tab')
    expect(tabs[0]).toHaveAttribute('aria-selected', 'true')
    expect(tabs[1]).toHaveAttribute('aria-selected', 'false')
  })

  it('switches tabs when clicked', async () => {
    const { onTabChange } = renderTabs()
    const user = userEvent.setup()

    expect(screen.getByText('Profile content')).toBeInTheDocument()
    expect(screen.queryByText('Security content')).not.toBeInTheDocument()

    await user.click(screen.getByRole('tab', { name: 'Security' }))

    expect(screen.queryByText('Profile content')).not.toBeInTheDocument()
    expect(screen.getByText('Security content')).toBeInTheDocument()
    expect(onTabChange).toHaveBeenCalledWith('tab2')
  })

  it('supports keyboard navigation', async () => {
    renderTabs()
    const user = userEvent.setup()

    const firstTab = screen.getByRole('tab', { name: 'Profile' })
    const secondTab = screen.getByRole('tab', { name: 'Security' })

    firstTab.focus()

    await user.keyboard('{ArrowRight}')
    expect(secondTab).toHaveFocus()

    await user.keyboard('{ArrowLeft}')
    expect(firstTab).toHaveFocus()
  })
})

```

### 2. Visual Testing

```typescript

// Visual regression testing with Storybook
import type { Meta, StoryObj } from '@storybook/react'
import { Button } from './Button'

const meta: Meta<typeof Button> = {
  title: 'Components/Button',
  component: Button,
  parameters: {
    layout: 'centered',
  },
  tags: ['autodocs'],
  argTypes: {
    variant: {
      control: { type: 'select' },
      options: ['primary', 'secondary', 'danger'],
    },
    size: {
      control: { type: 'select' },
      options: ['small', 'medium', 'large'],
    },
  },
}

export default meta
type Story = StoryObj<typeof meta>

export const Primary: Story = {
  args: {
    children: 'Button',
    variant: 'primary',
  },
}

export const Secondary: Story = {
  args: {
    children: 'Button',
    variant: 'secondary',
  },
}

export const Loading: Story = {
  args: {
    children: 'Loading...',
    loading: true,
  },
}

export const AllVariants: Story = {
  render: () => (
    <div style={{ display: 'flex', gap: '1rem', flexDirection: 'column' }}>
      <div style={{ display: 'flex', gap: '1rem' }}>
        <Button variant='primary'>Primary</Button>
        <Button variant='secondary'>Secondary</Button>
        <Button variant='danger'>Danger</Button>
      </div>

      <div style={{ display: 'flex', gap: '1rem' }}>
        <Button size='small'>Small</Button>
        <Button size='medium'>Medium</Button>
        <Button size='large'>Large</Button>
      </div>

      <div style={{ display: 'flex', gap: '1rem' }}>
        <Button loading>Loading</Button>
        <Button disabled>Disabled</Button>
      </div>
    </div>
  ),
}

```

## Best Practices

1. **Composition over Inheritance**: Use composition patterns for flexibility
2. **Accessibility First**: Build with ARIA and semantic HTML from the start
3. **Type Safety**: Use TypeScript for props and ref forwarding
4. **Performance**: Optimize re-renders with React.memo and useMemo
5. **Testing**: Write comprehensive tests for behavior and accessibility
6. **Styling**: Choose consistent styling approach (CSS modules, styled-components, etc.)
7. **Error Boundaries**: Wrap components in error boundaries for resilience
8. **Documentation**: Use Storybook for component documentation and testing
9. **Reusability**: Design components for multiple use cases
10. **Focus Management**: Handle focus states properly for keyboard users

Component design should prioritize user experience, developer experience, and maintainability through clear patterns and consistent practices.

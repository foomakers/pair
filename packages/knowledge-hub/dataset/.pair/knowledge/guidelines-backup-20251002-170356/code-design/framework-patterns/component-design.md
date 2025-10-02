# 🧩 Component Design

**Focus**: React component architecture, design patterns, and best practices

Comprehensive guidelines for designing scalable, reusable, and maintainable React components following modern patterns and TypeScript best practices.

## 🎯 Component Design Framework

### Component Architecture Principles

```typescript
// ✅ Well-designed component structure
interface ComponentProps {
  // Props interface with clear typing
  readonly id?: string
  readonly className?: string
  readonly children?: React.ReactNode
  readonly variant?: 'primary' | 'secondary' | 'ghost'
  readonly size?: 'sm' | 'md' | 'lg'
  readonly disabled?: boolean
  readonly loading?: boolean
  readonly onClick?: (event: React.MouseEvent<HTMLButtonElement>) => void
}

const Button = React.forwardRef<HTMLButtonElement, ComponentProps>(
  (
    {
      id,
      className,
      children,
      variant = 'primary',
      size = 'md',
      disabled = false,
      loading = false,
      onClick,
      ...rest
    },
    ref,
  ) => {
    const handleClick = useCallback(
      (event: React.MouseEvent<HTMLButtonElement>) => {
        if (disabled || loading) return
        onClick?.(event)
      },
      [disabled, loading, onClick],
    )

    return (
      <button
        ref={ref}
        id={id}
        className={cn(buttonVariants({ variant, size }), className)}
        disabled={disabled || loading}
        onClick={handleClick}
        {...rest}>
        {loading && <Spinner className='mr-2 h-4 w-4' />}
        {children}
      </button>
    )
  },
)

Button.displayName = 'Button'
```

## 🏗️ Component Patterns

### 1. Compound Components

```typescript
// ✅ Compound component pattern
interface TabsContextValue {
  selectedTab: string
  onTabChange: (tab: string) => void
}

const TabsContext = React.createContext<TabsContextValue | null>(null)

interface TabsProps {
  defaultTab?: string
  onTabChange?: (tab: string) => void
  children: React.ReactNode
  className?: string
}

const Tabs: React.FC<TabsProps> & {
  List: typeof TabsList
  Tab: typeof Tab
  Panel: typeof TabPanel
} = ({ defaultTab, onTabChange, children, className }) => {
  const [selectedTab, setSelectedTab] = useState(defaultTab || '')

  const handleTabChange = useCallback(
    (tab: string) => {
      setSelectedTab(tab)
      onTabChange?.(tab)
    },
    [onTabChange],
  )

  const contextValue = useMemo(
    () => ({
      selectedTab,
      onTabChange: handleTabChange,
    }),
    [selectedTab, handleTabChange],
  )

  return (
    <TabsContext.Provider value={contextValue}>
      <div className={cn('tabs', className)}>{children}</div>
    </TabsContext.Provider>
  )
}

const TabsList: React.FC<{ children: React.ReactNode; className?: string }> = ({
  children,
  className,
}) => (
  <div className={cn('tabs-list', className)} role='tablist'>
    {children}
  </div>
)

const Tab: React.FC<{
  value: string
  children: React.ReactNode
  disabled?: boolean
  className?: string
}> = ({ value, children, disabled, className }) => {
  const context = useContext(TabsContext)
  if (!context) throw new Error('Tab must be used within Tabs')

  const isSelected = context.selectedTab === value

  return (
    <button
      className={cn('tab', isSelected && 'tab-selected', disabled && 'tab-disabled', className)}
      onClick={() => !disabled && context.onTabChange(value)}
      disabled={disabled}
      role='tab'
      aria-selected={isSelected}>
      {children}
    </button>
  )
}

const TabPanel: React.FC<{
  value: string
  children: React.ReactNode
  className?: string
}> = ({ value, children, className }) => {
  const context = useContext(TabsContext)
  if (!context) throw new Error('TabPanel must be used within Tabs')

  if (context.selectedTab !== value) return null

  return (
    <div className={cn('tab-panel', className)} role='tabpanel'>
      {children}
    </div>
  )
}

// Attach sub-components
Tabs.List = TabsList
Tabs.Tab = Tab
Tabs.Panel = TabPanel

// Usage
const ExampleTabs = () => (
  <Tabs defaultTab='overview'>
    <Tabs.List>
      <Tabs.Tab value='overview'>Overview</Tabs.Tab>
      <Tabs.Tab value='details'>Details</Tabs.Tab>
      <Tabs.Tab value='settings'>Settings</Tabs.Tab>
    </Tabs.List>
    <Tabs.Panel value='overview'>Overview content</Tabs.Panel>
    <Tabs.Panel value='details'>Details content</Tabs.Panel>
    <Tabs.Panel value='settings'>Settings content</Tabs.Panel>
  </Tabs>
)
```

### 2. Render Props Pattern

```typescript
// ✅ Render props for data fetching
interface DataFetcherProps<T> {
  url: string
  children: (data: {
    data: T | null
    loading: boolean
    error: Error | null
    refetch: () => void
  }) => React.ReactNode
}

function DataFetcher<T>({ url, children }: DataFetcherProps<T>) {
  const [data, setData] = useState<T | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<Error | null>(null)

  const fetchData = useCallback(async () => {
    try {
      setLoading(true)
      setError(null)
      const response = await fetch(url)
      if (!response.ok) throw new Error('Failed to fetch')
      const result = await response.json()
      setData(result)
    } catch (err) {
      setError(err instanceof Error ? err : new Error('Unknown error'))
    } finally {
      setLoading(false)
    }
  }, [url])

  useEffect(() => {
    fetchData()
  }, [fetchData])

  return children({ data, loading, error, refetch: fetchData })
}

// Usage
const UserProfile = ({ userId }: { userId: string }) => (
  <DataFetcher<User> url={`/api/users/${userId}`}>
    {({ data, loading, error, refetch }) => {
      if (loading) return <UserSkeleton />
      if (error) return <ErrorMessage error={error} onRetry={refetch} />
      if (!data) return <NotFound />

      return <UserCard user={data} />
    }}
  </DataFetcher>
)
```

### 3. Custom Hooks Pattern

```typescript
// ✅ Custom hooks for component logic
interface UseToggleReturn {
  isOn: boolean
  toggle: () => void
  turnOn: () => void
  turnOff: () => void
}

const useToggle = (initialState: boolean = false): UseToggleReturn => {
  const [isOn, setIsOn] = useState(initialState)

  const toggle = useCallback(() => setIsOn(prev => !prev), [])
  const turnOn = useCallback(() => setIsOn(true), [])
  const turnOff = useCallback(() => setIsOn(false), [])

  return { isOn, toggle, turnOn, turnOff }
}

interface UseFormReturn<T> {
  values: T
  errors: Partial<Record<keyof T, string>>
  touched: Partial<Record<keyof T, boolean>>
  setValue: <K extends keyof T>(key: K, value: T[K]) => void
  setError: <K extends keyof T>(key: K, error: string) => void
  reset: () => void
  handleSubmit: (
    onSubmit: (values: T) => void | Promise<void>,
  ) => (e: React.FormEvent) => Promise<void>
}

function useForm<T extends Record<string, any>>(
  initialValues: T,
  validation?: (values: T) => Partial<Record<keyof T, string>>,
): UseFormReturn<T> {
  const [values, setValues] = useState<T>(initialValues)
  const [errors, setErrors] = useState<Partial<Record<keyof T, string>>>({})
  const [touched, setTouched] = useState<Partial<Record<keyof T, boolean>>>({})

  const setValue = useCallback(
    <K extends keyof T>(key: K, value: T[K]) => {
      setValues(prev => ({ ...prev, [key]: value }))
      setTouched(prev => ({ ...prev, [key]: true }))

      if (validation) {
        const newErrors = validation({ ...values, [key]: value })
        setErrors(prev => ({ ...prev, [key]: newErrors[key] }))
      }
    },
    [values, validation],
  )

  const setError = useCallback(<K extends keyof T>(key: K, error: string) => {
    setErrors(prev => ({ ...prev, [key]: error }))
  }, [])

  const reset = useCallback(() => {
    setValues(initialValues)
    setErrors({})
    setTouched({})
  }, [initialValues])

  const handleSubmit = useCallback(
    (onSubmit: (values: T) => void | Promise<void>) => async (e: React.FormEvent) => {
      e.preventDefault()

      if (validation) {
        const newErrors = validation(values)
        setErrors(newErrors)
        if (Object.keys(newErrors).length > 0) return
      }

      await onSubmit(values)
    },
    [values, validation],
  )

  return { values, errors, touched, setValue, setError, reset, handleSubmit }
}

// Usage in component
const LoginForm = () => {
  const { values, errors, setValue, handleSubmit } = useForm(
    { email: '', password: '' },
    values => {
      const errors: Partial<Record<keyof typeof values, string>> = {}
      if (!values.email) errors.email = 'Email is required'
      if (!values.password) errors.password = 'Password is required'
      return errors
    },
  )

  const onSubmit = async (data: typeof values) => {
    await login(data)
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)}>
      <Input
        value={values.email}
        onChange={e => setValue('email', e.target.value)}
        error={errors.email}
        placeholder='Email'
      />
      <Input
        type='password'
        value={values.password}
        onChange={e => setValue('password', e.target.value)}
        error={errors.password}
        placeholder='Password'
      />
      <Button type='submit'>Login</Button>
    </form>
  )
}
```

## 🎨 Style and Theming

### CSS-in-JS with Styled Components

```typescript
// ✅ Styled components with theme
interface Theme {
  colors: {
    primary: string
    secondary: string
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
  breakpoints: {
    sm: string
    md: string
    lg: string
    xl: string
  }
}

const StyledButton = styled.button<{
  variant: 'primary' | 'secondary'
  size: 'sm' | 'md' | 'lg'
}>`
  padding: ${({ theme, size }) =>
    size === 'sm' ? theme.spacing.xs : size === 'md' ? theme.spacing.sm : theme.spacing.md};

  background-color: ${({ theme, variant }) =>
    variant === 'primary' ? theme.colors.primary : theme.colors.secondary};

  color: ${({ theme }) => theme.colors.text};
  border: none;
  border-radius: 4px;
  cursor: pointer;
  transition: all 0.2s ease;

  &:hover {
    opacity: 0.9;
    transform: translateY(-1px);
  }

  &:disabled {
    opacity: 0.5;
    cursor: not-allowed;
    transform: none;
  }

  @media (max-width: ${({ theme }) => theme.breakpoints.sm}) {
    padding: ${({ theme }) => theme.spacing.xs};
    font-size: 0.875rem;
  }
`
```

### Tailwind CSS Variants

```typescript
// ✅ Tailwind CSS with variants
import { cva, type VariantProps } from 'class-variance-authority'

const buttonVariants = cva(
  'inline-flex items-center justify-center rounded-md text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:opacity-50 disabled:pointer-events-none ring-offset-background',
  {
    variants: {
      variant: {
        default: 'bg-primary text-primary-foreground hover:bg-primary/90',
        destructive: 'bg-destructive text-destructive-foreground hover:bg-destructive/90',
        outline: 'border border-input hover:bg-accent hover:text-accent-foreground',
        secondary: 'bg-secondary text-secondary-foreground hover:bg-secondary/80',
        ghost: 'hover:bg-accent hover:text-accent-foreground',
        link: 'underline-offset-4 hover:underline text-primary',
      },
      size: {
        default: 'h-10 py-2 px-4',
        sm: 'h-9 px-3 rounded-md',
        lg: 'h-11 px-8 rounded-md',
        icon: 'h-10 w-10',
      },
    },
    defaultVariants: {
      variant: 'default',
      size: 'default',
    },
  },
)

interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : 'button'
    return (
      <Comp className={cn(buttonVariants({ variant, size, className }))} ref={ref} {...props} />
    )
  },
)
```

## 🧪 Component Testing

```typescript
// ✅ Component testing with React Testing Library
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Button } from './Button'

describe('Button Component', () => {
  it('renders with correct text', () => {
    render(<Button>Click me</Button>)
    expect(screen.getByRole('button', { name: 'Click me' })).toBeInTheDocument()
  })

  it('handles click events', async () => {
    const handleClick = jest.fn()
    const user = userEvent.setup()

    render(<Button onClick={handleClick}>Click me</Button>)

    await user.click(screen.getByRole('button'))
    expect(handleClick).toHaveBeenCalledTimes(1)
  })

  it('shows loading state', () => {
    render(<Button loading>Submit</Button>)

    expect(screen.getByRole('button')).toBeDisabled()
    expect(screen.getByTestId('spinner')).toBeInTheDocument()
  })

  it('applies correct variant styles', () => {
    render(<Button variant='destructive'>Delete</Button>)

    expect(screen.getByRole('button')).toHaveClass('bg-destructive')
  })
})
```

## 🔗 Related Concepts

- **[React/Next.js Patterns](react-nextjs-patterns.md)** - Framework-specific patterns
- **[State Management](state-management.md)** - Component state management
- **[Performance Patterns](performance-patterns.md)** - Component optimization

## 📏 Implementation Guidelines

1. **Type Safety**: Use TypeScript for all component props and state
2. **Composition**: Prefer composition over inheritance
3. **Single Responsibility**: Each component should have one clear purpose
4. **Prop Drilling**: Avoid excessive prop drilling, use context when needed
5. **Performance**: Use React.memo, useMemo, useCallback appropriately
6. **Accessibility**: Include proper ARIA attributes and keyboard navigation
7. **Testing**: Write tests for component behavior, not implementation
8. **Documentation**: Document complex components with Storybook

---

_Component Design provides patterns and practices for creating maintainable, reusable, and performant React components following modern development standards._

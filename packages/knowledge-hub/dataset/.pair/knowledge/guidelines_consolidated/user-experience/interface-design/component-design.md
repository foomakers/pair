# Component Design

## Overview

Component design establishes systematic approaches for creating reusable, scalable, and maintainable interface components that form the building blocks of digital experiences. This framework encompasses atomic design principles, component architecture patterns, API design strategies, and lifecycle management approaches that ensure consistent and efficient component development across teams and projects.

## Component Design Principles

### 1. Atomic Design Methodology

**Atomic Level Components**

- **Purpose**: Foundational interface elements that cannot be broken down further
- **Examples**: Buttons, inputs, icons, labels, badges, avatars
- **Characteristics**: Single responsibility, minimal props, highly reusable
- **Implementation**: Focus on visual consistency and accessibility compliance

**Molecular Level Components**

- **Purpose**: Combinations of atoms that function together as a unit
- **Examples**: Search bars, form groups, navigation items, card headers
- **Characteristics**: Composed behavior, specific functionality, moderate complexity
- **Implementation**: Clear prop interfaces, internal state management

**Organism Level Components**

- **Purpose**: Complex components combining molecules and atoms
- **Examples**: Headers, footers, product cards, data tables, forms
- **Characteristics**: Rich functionality, complex state, context-aware
- **Implementation**: Comprehensive APIs, performance optimization

### 2. Component Architecture Patterns

**Container-Presentation Pattern**

```typescript
// Container Component (Logic)
const UserProfileContainer = () => {
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(true)

  return <UserProfilePresentation user={user} loading={loading} onUpdate={handleUpdate} />
}

// Presentation Component (UI)
interface UserProfileProps {
  user: User | null
  loading: boolean
  onUpdate: (user: User) => void
}

const UserProfilePresentation: React.FC<UserProfileProps> = ({ user, loading, onUpdate }) => {
  // Pure UI rendering logic
}
```

**Compound Component Pattern**

```typescript
const Select = {
  Root: SelectRoot,
  Trigger: SelectTrigger,
  Content: SelectContent,
  Item: SelectItem,
  Label: SelectLabel,
}

// Usage
;<Select.Root>
  <Select.Trigger>
    <Select.Label>Choose option</Select.Label>
  </Select.Trigger>
  <Select.Content>
    <Select.Item value='option1'>Option 1</Select.Item>
    <Select.Item value='option2'>Option 2</Select.Item>
  </Select.Content>
</Select.Root>
```

**Render Props Pattern**

```typescript
interface DataFetcherProps<T> {
  url: string
  children: (data: T | null, loading: boolean, error: Error | null) => React.ReactNode
}

const DataFetcher = <T>({ url, children }: DataFetcherProps<T>) => {
  const [data, setData] = useState<T | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<Error | null>(null)

  return children(data, loading, error)
}
```

### 3. Component API Design

**Props Interface Design**

```typescript
interface ButtonProps {
  // Visual variants
  variant?: 'primary' | 'secondary' | 'outline' | 'ghost'
  size?: 'sm' | 'md' | 'lg'

  // State management
  loading?: boolean
  disabled?: boolean

  // Interaction handlers
  onClick?: (event: React.MouseEvent<HTMLButtonElement>) => void

  // Accessibility
  'aria-label'?: string
  'aria-describedby'?: string

  // Styling
  className?: string
  style?: React.CSSProperties

  // Content
  children: React.ReactNode
  icon?: React.ReactNode
}
```

**Polymorphic Component Design**

```typescript
type PolymorphicRef<C extends React.ElementType> = React.ComponentPropsWithRef<C>['ref']

type PolymorphicComponentProp<C extends React.ElementType, Props = {}> = React.PropsWithChildren<
  Props & AsProp<C>
> &
  Omit<React.ComponentPropsWithoutRef<C>, PropsToOmit<C, Props>>

interface BoxOwnProps {
  variant?: 'primary' | 'secondary'
  size?: 'sm' | 'md' | 'lg'
}

type BoxComponent = <C extends React.ElementType = 'div'>(
  props: PolymorphicComponentProp<C, BoxOwnProps>,
) => React.ReactElement | null
```

### 4. Component State Management

**Local State Patterns**

```typescript
const useComponentState = (initialValue: string) => {
  const [value, setValue] = useState(initialValue)
  const [isDirty, setIsDirty] = useState(false)
  const [errors, setErrors] = useState<string[]>([])

  const handleChange = useCallback((newValue: string) => {
    setValue(newValue)
    setIsDirty(true)
    setErrors(validate(newValue))
  }, [])

  const reset = useCallback(() => {
    setValue(initialValue)
    setIsDirty(false)
    setErrors([])
  }, [initialValue])

  return {
    value,
    isDirty,
    errors,
    isValid: errors.length === 0,
    onChange: handleChange,
    reset,
  }
}
```

**Context-Based State Sharing**

```typescript
interface FormContextType {
  values: Record<string, any>
  errors: Record<string, string[]>
  touched: Record<string, boolean>
  setFieldValue: (field: string, value: any) => void
  setFieldError: (field: string, error: string) => void
  setFieldTouched: (field: string, touched: boolean) => void
}

const FormContext = createContext<FormContextType | null>(null)

const useFormField = (name: string) => {
  const context = useContext(FormContext)
  if (!context) {
    throw new Error('useFormField must be used within FormProvider')
  }

  return {
    value: context.values[name],
    error: context.errors[name],
    touched: context.touched[name],
    onChange: (value: any) => context.setFieldValue(name, value),
    onBlur: () => context.setFieldTouched(name, true),
  }
}
```

## Component Performance Optimization

### 1. Memoization Strategies

**React.memo Implementation**

```typescript
interface ProductCardProps {
  product: Product
  onAddToCart: (productId: string) => void
  isInCart: boolean
}

const ProductCard = React.memo<ProductCardProps>(
  ({ product, onAddToCart, isInCart }) => {
    const handleAddToCart = useCallback(() => {
      onAddToCart(product.id)
    }, [onAddToCart, product.id])

    return (
      <Card>
        <CardImage src={product.image} alt={product.name} />
        <CardContent>
          <CardTitle>{product.name}</CardTitle>
          <CardPrice>{product.price}</CardPrice>
          <Button onClick={handleAddToCart} disabled={isInCart}>
            {isInCart ? 'In Cart' : 'Add to Cart'}
          </Button>
        </CardContent>
      </Card>
    )
  },
  (prevProps, nextProps) => {
    return (
      prevProps.product.id === nextProps.product.id &&
      prevProps.product.name === nextProps.product.name &&
      prevProps.product.price === nextProps.product.price &&
      prevProps.isInCart === nextProps.isInCart
    )
  },
)
```

**useMemo for Expensive Calculations**

```typescript
const DataVisualization: React.FC<{ data: DataPoint[] }> = ({ data }) => {
  const processedData = useMemo(() => {
    return data
      .filter(point => point.value > 0)
      .map(point => ({
        ...point,
        normalizedValue: point.value / Math.max(...data.map(d => d.value)),
      }))
      .sort((a, b) => b.value - a.value)
  }, [data])

  const chartConfig = useMemo(
    () => ({
      type: 'bar',
      data: processedData,
      options: {
        responsive: true,
        plugins: {
          legend: { position: 'top' },
        },
      },
    }),
    [processedData],
  )

  return <Chart config={chartConfig} />
}
```

### 2. Lazy Loading and Code Splitting

**Component-Level Code Splitting**

```typescript
const LazyModal = lazy(() =>
  import('./Modal').then(module => ({
    default: module.Modal,
  })),
)

const LazyDataTable = lazy(() =>
  import('./DataTable').then(module => ({
    default: module.DataTable,
  })),
)

const Dashboard: React.FC = () => {
  const [showModal, setShowModal] = useState(false)

  return (
    <div>
      <h1>Dashboard</h1>
      <Suspense fallback={<Skeleton className='h-96' />}>
        <LazyDataTable data={data} />
      </Suspense>

      {showModal && (
        <Suspense fallback={<div>Loading modal...</div>}>
          <LazyModal onClose={() => setShowModal(false)} />
        </Suspense>
      )}
    </div>
  )
}
```

**Dynamic Imports with Loading States**

```typescript
const useDynamicComponent = <T extends React.ComponentType<any>>(
  importFn: () => Promise<{ default: T }>,
) => {
  const [Component, setComponent] = useState<T | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<Error | null>(null)

  const loadComponent = useCallback(async () => {
    setLoading(true)
    setError(null)

    try {
      const module = await importFn()
      setComponent(() => module.default)
    } catch (err) {
      setError(err as Error)
    } finally {
      setLoading(false)
    }
  }, [importFn])

  return { Component, loading, error, loadComponent }
}
```

## Component Testing Strategies

### 1. Unit Testing Patterns

**Component Behavior Testing**

```typescript
describe('Button Component', () => {
  it('should render with correct variant class', () => {
    render(<Button variant='primary'>Click me</Button>)

    expect(screen.getByRole('button')).toHaveClass('btn-primary')
  })

  it('should handle click events', () => {
    const handleClick = jest.fn()
    render(<Button onClick={handleClick}>Click me</Button>)

    fireEvent.click(screen.getByRole('button'))
    expect(handleClick).toHaveBeenCalledTimes(1)
  })

  it('should be disabled when loading', () => {
    render(<Button loading>Loading...</Button>)

    expect(screen.getByRole('button')).toBeDisabled()
    expect(screen.getByRole('button')).toHaveAttribute('aria-busy', 'true')
  })
})
```

**Custom Hook Testing**

```typescript
describe('useComponentState', () => {
  it('should initialize with provided value', () => {
    const { result } = renderHook(() => useComponentState('initial'))

    expect(result.current.value).toBe('initial')
    expect(result.current.isDirty).toBe(false)
    expect(result.current.isValid).toBe(true)
  })

  it('should update value and mark as dirty', () => {
    const { result } = renderHook(() => useComponentState('initial'))

    act(() => {
      result.current.onChange('updated')
    })

    expect(result.current.value).toBe('updated')
    expect(result.current.isDirty).toBe(true)
  })
})
```

### 2. Integration Testing

**Component Integration Tests**

```typescript
describe('SearchForm Integration', () => {
  it('should submit search with correct parameters', async () => {
    const mockOnSearch = jest.fn()
    render(<SearchForm onSearch={mockOnSearch} />)

    // Fill search input
    await user.type(screen.getByLabelText(/search/i), 'test query')

    // Select category
    await user.selectOptions(screen.getByLabelText(/category/i), 'products')

    // Submit form
    await user.click(screen.getByRole('button', { name: /search/i }))

    expect(mockOnSearch).toHaveBeenCalledWith({
      query: 'test query',
      category: 'products',
    })
  })
})
```

## Accessibility in Component Design

### 1. ARIA Implementation

**Accessible Form Components**

```typescript
interface FormFieldProps {
  label: string
  error?: string
  description?: string
  required?: boolean
  children: React.ReactElement
}

const FormField: React.FC<FormFieldProps> = ({ label, error, description, required, children }) => {
  const fieldId = useId()
  const errorId = error ? `${fieldId}-error` : undefined
  const descriptionId = description ? `${fieldId}-description` : undefined

  const childProps = {
    id: fieldId,
    'aria-describedby': [descriptionId, errorId].filter(Boolean).join(' '),
    'aria-invalid': !!error,
    'aria-required': required,
  }

  return (
    <div className='form-field'>
      <label htmlFor={fieldId} className='form-label'>
        {label}
        {required && <span aria-label='required'>*</span>}
      </label>

      {description && (
        <div id={descriptionId} className='form-description'>
          {description}
        </div>
      )}

      {React.cloneElement(children, childProps)}

      {error && (
        <div id={errorId} className='form-error' role='alert'>
          {error}
        </div>
      )}
    </div>
  )
}
```

**Keyboard Navigation Support**

```typescript
const useKeyboardNavigation = (items: HTMLElement[]) => {
  const [activeIndex, setActiveIndex] = useState(-1)

  const handleKeyDown = useCallback(
    (event: KeyboardEvent) => {
      switch (event.key) {
        case 'ArrowDown':
          event.preventDefault()
          setActiveIndex(prev => (prev < items.length - 1 ? prev + 1 : 0))
          break

        case 'ArrowUp':
          event.preventDefault()
          setActiveIndex(prev => (prev > 0 ? prev - 1 : items.length - 1))
          break

        case 'Home':
          event.preventDefault()
          setActiveIndex(0)
          break

        case 'End':
          event.preventDefault()
          setActiveIndex(items.length - 1)
          break

        case 'Enter':
        case ' ':
          event.preventDefault()
          items[activeIndex]?.click()
          break
      }
    },
    [items, activeIndex],
  )

  useEffect(() => {
    if (activeIndex >= 0 && items[activeIndex]) {
      items[activeIndex].focus()
    }
  }, [activeIndex, items])

  return { activeIndex, handleKeyDown }
}
```

## Component Documentation Standards

### 1. Storybook Integration

**Component Stories**

```typescript
import type { Meta, StoryObj } from '@storybook/react'
import { Button } from './Button'

const meta: Meta<typeof Button> = {
  title: 'Components/Button',
  component: Button,
  parameters: {
    layout: 'centered',
    docs: {
      description: {
        component: 'A versatile button component with multiple variants and states.',
      },
    },
  },
  argTypes: {
    variant: {
      control: { type: 'select' },
      options: ['primary', 'secondary', 'outline', 'ghost'],
    },
    size: {
      control: { type: 'select' },
      options: ['sm', 'md', 'lg'],
    },
  },
  tags: ['autodocs'],
}

export default meta
type Story = StoryObj<typeof meta>

export const Primary: Story = {
  args: {
    variant: 'primary',
    children: 'Button',
  },
}

export const WithIcon: Story = {
  args: {
    variant: 'primary',
    children: 'Download',
    icon: <DownloadIcon />,
  },
}

export const Loading: Story = {
  args: {
    variant: 'primary',
    loading: true,
    children: 'Processing...',
  },
}
```

### 2. API Documentation

**TypeScript Documentation**

````typescript
/**
 * A flexible card component for displaying content with consistent styling.
 *
 * @example
 * ```tsx
 * <Card>
 *   <CardHeader>
 *     <CardTitle>Product Name</CardTitle>
 *     <CardDescription>Product description here</CardDescription>
 *   </CardHeader>
 *   <CardContent>
 *     <p>Card content goes here</p>
 *   </CardContent>
 *   <CardFooter>
 *     <Button>Action</Button>
 *   </CardFooter>
 * </Card>
 * ```
 */
interface CardProps {
  /** Additional CSS classes to apply to the card */
  className?: string

  /** Card variant affecting visual styling */
  variant?: 'default' | 'outlined' | 'elevated'

  /** Content to be rendered inside the card */
  children: React.ReactNode

  /** Click handler for the entire card */
  onClick?: (event: React.MouseEvent<HTMLDivElement>) => void
}
````

## Implementation Guidelines

### 1. Component Development Workflow

**Development Process**

1. **Requirements Analysis**: Define component purpose, props, and behavior
2. **Design Review**: Ensure alignment with design system and brand guidelines
3. **API Design**: Define props interface and component composition
4. **Implementation**: Build component with accessibility and performance in mind
5. **Testing**: Unit tests, integration tests, and accessibility testing
6. **Documentation**: Storybook stories, API docs, and usage examples
7. **Review**: Code review focusing on reusability and maintainability

**Quality Checklist**

- [ ] Component follows atomic design principles
- [ ] Props interface is well-defined and documented
- [ ] Accessibility requirements are met (ARIA, keyboard navigation)
- [ ] Performance optimizations are implemented where needed
- [ ] Component is tested with unit and integration tests
- [ ] Storybook stories cover all variants and states
- [ ] Component integrates with design system tokens
- [ ] Error boundaries are implemented for error handling

### 2. Maintenance and Evolution

**Component Lifecycle Management**

- **Version Control**: Semantic versioning for component library releases
- **Deprecation Strategy**: Clear migration paths for deprecated components
- **Breaking Changes**: Comprehensive communication and migration guides
- **Performance Monitoring**: Regular performance audits and optimizations

**Continuous Improvement**

- **Usage Analytics**: Track component adoption and usage patterns
- **User Feedback**: Collect feedback from component consumers
- **Design System Integration**: Regular alignment with design system updates
- **Technology Updates**: Keep components updated with latest React patterns

This framework ensures that component design creates maintainable, accessible, and performant building blocks that scale effectively across large applications and development teams.

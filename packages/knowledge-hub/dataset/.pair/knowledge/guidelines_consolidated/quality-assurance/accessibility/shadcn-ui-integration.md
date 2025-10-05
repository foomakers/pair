# ShadCN UI Accessibility Integration Guide

## 🎯 **PURPOSE**

Comprehensive guide for implementing and enhancing accessibility features in ShadCN UI components, ensuring WCAG compliance and inclusive user experiences through systematic accessibility integration and customization.

## 🧩 **SHADCN UI ACCESSIBILITY FOUNDATIONS**

### **Component Accessibility Architecture**

ShadCN UI provides a solid foundation for accessible component development with built-in accessibility features and customizable accessibility enhancements.

**Built-in Accessibility Features**

ShadCN UI components include fundamental accessibility features including semantic HTML, keyboard navigation, and basic ARIA implementation.

**Accessibility Customization Points**

Component architecture allows for extensive accessibility customization including ARIA enhancements, keyboard behavior modification, and screen reader optimization.

**TypeScript Accessibility Support**

Strong TypeScript integration ensures type-safe accessibility implementation and provides IntelliSense for accessibility properties.

### **Accessibility Integration Strategy**

**Progressive Accessibility Enhancement**

Systematic approach to enhancing ShadCN UI components with advanced accessibility features while maintaining component integrity.

**Accessibility Wrapper Components**

Custom wrapper components that add accessibility features to ShadCN UI components without modifying core component code.

**Accessibility Context Integration**

Context-based accessibility configuration enabling global accessibility settings and component-specific customization.

```typescript
// Enhanced ShadCN UI accessibility integration
import * as React from 'react'
import { cn } from '@/lib/utils'
import { Button as ShadcnButton } from '@/components/ui/button'
import { Label as ShadcnLabel } from '@/components/ui/label'
import { Input as ShadcnInput } from '@/components/ui/input'

// Accessibility enhancement context
interface AccessibilityContextValue {
  announceChanges: boolean
  reducedMotion: boolean
  highContrast: boolean
  screenReaderOptimized: boolean
  keyboardNavigationMode: boolean
}

const AccessibilityContext = React.createContext<AccessibilityContextValue>({
  announceChanges: true,
  reducedMotion: false,
  highContrast: false,
  screenReaderOptimized: false,
  keyboardNavigationMode: false,
})

export const useAccessibility = () => React.useContext(AccessibilityContext)

// Enhanced Button component with accessibility features
interface AccessibleButtonProps extends React.ComponentProps<typeof ShadcnButton> {
  loadingText?: string
  successText?: string
  errorText?: string
  announceStateChanges?: boolean
  skipToContentTarget?: string
}

export const AccessibleButton = React.forwardRef<HTMLButtonElement, AccessibleButtonProps>(
  (
    {
      children,
      loadingText = 'Loading...',
      successText,
      errorText,
      announceStateChanges = true,
      skipToContentTarget,
      disabled,
      onClick,
      className,
      ...props
    },
    ref,
  ) => {
    const [state, setState] = React.useState<'idle' | 'loading' | 'success' | 'error'>('idle')
    const [announcement, setAnnouncement] = React.useState('')
    const { announceChanges, keyboardNavigationMode } = useAccessibility()

    // Live region for announcements
    const liveRegionRef = React.useRef<HTMLDivElement>(null)

    const announce = React.useCallback(
      (message: string, priority: 'polite' | 'assertive' = 'polite') => {
        if (announceStateChanges && announceChanges) {
          setAnnouncement(message)

          // Clear announcement after screen reader processes it
          setTimeout(() => setAnnouncement(''), 1000)
        }
      },
      [announceStateChanges, announceChanges],
    )

    React.useEffect(() => {
      switch (state) {
        case 'loading':
          announce(loadingText, 'polite')
          break
        case 'success':
          if (successText) announce(successText, 'polite')
          break
        case 'error':
          if (errorText) announce(errorText, 'assertive')
          break
      }
    }, [state, loadingText, successText, errorText, announce])

    const handleClick = async (event: React.MouseEvent<HTMLButtonElement>) => {
      if (disabled || state === 'loading') return

      // Handle skip-to-content functionality
      if (skipToContentTarget) {
        const target = document.getElementById(skipToContentTarget)
        if (target) {
          target.focus()
          target.scrollIntoView({ behavior: 'smooth' })
          return
        }
      }

      setState('loading')

      try {
        await onClick?.(event)
        setState('success')
        setTimeout(() => setState('idle'), 2000)
      } catch (error) {
        setState('error')
        setTimeout(() => setState('idle'), 3000)
      }
    }

    const isLoading = state === 'loading'
    const buttonText = isLoading ? loadingText : children

    return (
      <>
        <ShadcnButton
          ref={ref}
          onClick={handleClick}
          disabled={disabled || isLoading}
          aria-busy={isLoading}
          aria-live={announceStateChanges ? 'polite' : undefined}
          aria-atomic='true'
          className={cn(
            className,
            keyboardNavigationMode && 'focus:ring-2 focus:ring-offset-2',
            state === 'error' && 'border-destructive',
          )}
          {...props}>
          {isLoading && (
            <span
              className='mr-2 h-4 w-4 animate-spin'
              aria-hidden='true'
              role='img'
              aria-label='Loading'>
              ⟳
            </span>
          )}
          {buttonText}
        </ShadcnButton>

        {announcement && (
          <div
            ref={liveRegionRef}
            className='sr-only'
            aria-live='polite'
            aria-atomic='true'
            role='status'>
            {announcement}
          </div>
        )}
      </>
    )
  },
)

AccessibleButton.displayName = 'AccessibleButton'

// Enhanced Form Field with accessibility
interface AccessibleFormFieldProps {
  id: string
  label: string
  description?: string
  error?: string
  required?: boolean
  children: React.ReactNode
}

export const AccessibleFormField: React.FC<AccessibleFormFieldProps> = ({
  id,
  label,
  description,
  error,
  required = false,
  children,
}) => {
  const descriptionId = description ? `${id}-description` : undefined
  const errorId = error ? `${id}-error` : undefined
  const describedBy = [descriptionId, errorId].filter(Boolean).join(' ') || undefined

  return (
    <div className='space-y-2'>
      <ShadcnLabel
        htmlFor={id}
        className={cn(
          'text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70',
          error && 'text-destructive',
        )}>
        {label}
        {required && (
          <span className='ml-1 text-destructive' aria-label='required' role='img'>
            *
          </span>
        )}
      </ShadcnLabel>

      {React.cloneElement(children as React.ReactElement, {
        id,
        'aria-describedby': describedBy,
        'aria-invalid': !!error,
        'aria-required': required,
        required,
      })}

      {description && (
        <p id={descriptionId} className='text-sm text-muted-foreground'>
          {description}
        </p>
      )}

      {error && (
        <p id={errorId} role='alert' className='text-sm font-medium text-destructive'>
          {error}
        </p>
      )}
    </div>
  )
}

// Enhanced Input with accessibility features
interface AccessibleInputProps extends React.ComponentProps<typeof ShadcnInput> {
  label?: string
  description?: string
  error?: string
  showValidation?: boolean
}

export const AccessibleInput = React.forwardRef<HTMLInputElement, AccessibleInputProps>(
  ({ label, description, error, showValidation = true, className, id, ...props }, ref) => {
    const inputId = id || React.useId()
    const [hasInteracted, setHasInteracted] = React.useState(false)

    const showError = error && hasInteracted && showValidation

    if (label) {
      return (
        <AccessibleFormField
          id={inputId}
          label={label}
          description={description}
          error={showError ? error : undefined}
          required={props.required}>
          <ShadcnInput
            ref={ref}
            className={cn(
              className,
              showError && 'border-destructive focus-visible:ring-destructive',
            )}
            onBlur={() => setHasInteracted(true)}
            {...props}
          />
        </AccessibleFormField>
      )
    }

    return (
      <ShadcnInput
        ref={ref}
        id={inputId}
        className={cn(className, showError && 'border-destructive focus-visible:ring-destructive')}
        aria-invalid={showError}
        onBlur={() => setHasInteracted(true)}
        {...props}
      />
    )
  },
)

AccessibleInput.displayName = 'AccessibleInput'
```

## 🎛️ **ENHANCED COMPONENT IMPLEMENTATIONS**

### **Accessible Dialog Components**

**Modal Dialog Enhancement**

Enhanced modal implementation with focus management, keyboard navigation, and screen reader optimization.

**Alert Dialog Accessibility**

Accessible alert dialog implementation with proper ARIA labeling and focus management.

**Confirmation Dialog Patterns**

Comprehensive confirmation dialog patterns with clear action labeling and cancellation support.

```typescript
// Enhanced Dialog with accessibility features
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog'

interface AccessibleDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: string
  description?: string
  children: React.ReactNode
  size?: 'sm' | 'md' | 'lg' | 'xl'
  closeOnEscape?: boolean
  closeOnOverlayClick?: boolean
  initialFocus?: string
}

export const AccessibleDialog: React.FC<AccessibleDialogProps> = ({
  open,
  onOpenChange,
  title,
  description,
  children,
  size = 'md',
  closeOnEscape = true,
  closeOnOverlayClick = true,
  initialFocus,
}) => {
  const titleId = React.useId()
  const descriptionId = React.useId()

  React.useEffect(() => {
    if (open && initialFocus) {
      const element = document.getElementById(initialFocus)
      if (element) {
        // Delay to ensure dialog is rendered
        setTimeout(() => element.focus(), 100)
      }
    }
  }, [open, initialFocus])

  React.useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && closeOnEscape && open) {
        onOpenChange(false)
      }
    }

    if (open) {
      document.addEventListener('keydown', handleKeyDown)
      // Prevent body scroll
      document.body.style.overflow = 'hidden'
    }

    return () => {
      document.removeEventListener('keydown', handleKeyDown)
      document.body.style.overflow = ''
    }
  }, [open, closeOnEscape, onOpenChange])

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className={cn(
          size === 'sm' && 'max-w-sm',
          size === 'md' && 'max-w-md',
          size === 'lg' && 'max-w-lg',
          size === 'xl' && 'max-w-xl',
        )}
        aria-labelledby={titleId}
        aria-describedby={description ? descriptionId : undefined}
        onPointerDownOutside={closeOnOverlayClick ? undefined : e => e.preventDefault()}>
        <DialogHeader>
          <DialogTitle id={titleId}>{title}</DialogTitle>
          {description && <DialogDescription id={descriptionId}>{description}</DialogDescription>}
        </DialogHeader>
        {children}
      </DialogContent>
    </Dialog>
  )
}
```

### **Accessible Navigation Components**

**Tab Navigation Enhancement**

Enhanced tab component with full keyboard navigation and ARIA implementation.

**Dropdown Menu Accessibility**

Accessible dropdown menu with keyboard navigation and screen reader support.

**Breadcrumb Navigation**

Accessible breadcrumb implementation with proper landmarks and navigation structure.

### **Accessible Data Display**

**Table Accessibility Enhancement**

Enhanced table components with sorting, filtering, and screen reader optimization.

**Card Component Accessibility**

Accessible card patterns with proper heading structure and interactive elements.

**List Component Enhancement**

Enhanced list components with keyboard navigation and selection management.

## 🎨 **STYLING AND THEMING INTEGRATION**

### **Accessible Theming**

**Color Contrast Optimization**

Theme configuration ensuring WCAG AA/AAA color contrast compliance across all component states.

**Focus Indicator Theming**

Comprehensive focus indicator styling that meets accessibility requirements and visual design standards.

**Motion and Animation Control**

Theme-based motion control respecting user preferences for reduced motion.

```typescript
// Accessible theme configuration
export const accessibleTheme = {
  colors: {
    // Ensure WCAG AA contrast ratios
    primary: {
      DEFAULT: 'hsl(221.2 83.2% 53.3%)', // 4.5:1 contrast
      foreground: 'hsl(210 40% 98%)',
      muted: 'hsl(221.2 39% 11%)',
      'muted-foreground': 'hsl(215.4 16.3% 46.9%)', // 4.6:1 contrast
    },
    destructive: {
      DEFAULT: 'hsl(0 84.2% 60.2%)', // 4.5:1 contrast
      foreground: 'hsl(210 40% 98%)',
    },
    // High contrast mode colors
    'high-contrast': {
      background: 'hsl(0 0% 0%)',
      foreground: 'hsl(0 0% 100%)',
      border: 'hsl(0 0% 100%)',
    },
  },

  // Focus indicators
  focusRing: {
    width: '2px',
    style: 'solid',
    color: 'hsl(221.2 83.2% 53.3%)',
    offset: '2px',
  },

  // Animation preferences
  animation: {
    duration: {
      fast: '150ms',
      normal: '200ms',
      slow: '300ms',
      none: '0ms', // For reduced motion
    },
    easing: {
      DEFAULT: 'cubic-bezier(0.4, 0, 0.2, 1)',
      reduced: 'linear', // For reduced motion
    },
  },
}

// CSS custom properties for accessibility
export const accessibilityCSS = `
  :root {
    --focus-ring-width: 2px;
    --focus-ring-color: hsl(221.2 83.2% 53.3%);
    --focus-ring-offset: 2px;
    --animation-duration: 200ms;
  }

  @media (prefers-reduced-motion: reduce) {
    :root {
      --animation-duration: 0ms;
    }
    
    *, *::before, *::after {
      animation-duration: 0.01ms !important;
      animation-iteration-count: 1 !important;
      transition-duration: 0.01ms !important;
    }
  }

  @media (prefers-contrast: high) {
    :root {
      --background: 0 0% 0%;
      --foreground: 0 0% 100%;
      --border: 0 0% 100%;
      --focus-ring-width: 3px;
    }
  }

  .focus-visible {
    outline: var(--focus-ring-width) solid var(--focus-ring-color);
    outline-offset: var(--focus-ring-offset);
  }
`
```

### **Responsive Accessibility**

**Breakpoint-Aware Accessibility**

Accessibility features that adapt to different screen sizes and device capabilities.

**Touch Target Optimization**

Touch target sizing that meets accessibility guidelines across different device types.

**Viewport Accessibility**

Viewport configuration and zoom support for accessibility compliance.

## 🧪 **TESTING INTEGRATION**

### **Accessibility Testing Setup**

**Jest Accessibility Testing**

Integration of accessibility testing with Jest and React Testing Library.

**Automated Accessibility Audits**

Automated accessibility testing integration with axe-core and other testing tools.

**Visual Regression Testing**

Visual regression testing for accessibility features including focus indicators and high contrast modes.

```typescript
// Accessibility testing utilities
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { axe, toHaveNoViolations } from 'jest-axe'

expect.extend(toHaveNoViolations)

// Accessibility test helper
export const renderWithAccessibility = (component: React.ReactElement) => {
  const result = render(component)

  return {
    ...result,
    async checkAccessibility() {
      const results = await axe(result.container)
      expect(results).toHaveNoViolations()
    },
  }
}

// Common accessibility tests
export const testKeyboardNavigation = async (component: React.ReactElement) => {
  const user = userEvent.setup()
  const { checkAccessibility } = renderWithAccessibility(component)

  // Test tab navigation
  await user.tab()

  // Test enter/space activation
  const focusedElement = document.activeElement
  if (focusedElement) {
    await user.keyboard('{Enter}')
    await user.keyboard(' ')
  }

  await checkAccessibility()
}

export const testScreenReaderSupport = (component: React.ReactElement) => {
  const { checkAccessibility } = renderWithAccessibility(component)

  // Check for proper labeling
  const elements = screen.getAllByRole(/button|link|textbox|checkbox|radio/)
  elements.forEach(element => {
    expect(
      element.getAttribute('aria-label') ||
        element.getAttribute('aria-labelledby') ||
        element.textContent,
    ).toBeTruthy()
  })

  return checkAccessibility()
}
```

### **Component Accessibility Validation**

**Custom Accessibility Rules**

Custom ESLint rules for ShadCN UI accessibility validation.

**Accessibility Checklist Integration**

Automated checklist validation for component accessibility requirements.

**Documentation Integration**

Accessibility documentation generation and validation for component libraries.

## 📚 **MIGRATION AND ADOPTION**

### **ShadCN UI Migration Strategy**

**Gradual Accessibility Enhancement**

Strategy for gradually enhancing existing ShadCN UI implementations with accessibility features.

**Component Replacement Planning**

Planning for replacing basic ShadCN UI components with accessibility-enhanced versions.

**Team Training and Adoption**

Training programs for teams adopting accessible ShadCN UI patterns.

### **Quality Assurance Integration**

**Accessibility Review Process**

Review process integration for accessibility validation of ShadCN UI component usage.

**Automated Accessibility Checks**

CI/CD integration of accessibility validation for ShadCN UI components.

**Performance Impact Assessment**

Assessment of accessibility enhancement impact on component performance and bundle size.

---

_ShadCN UI accessibility integration provides a systematic approach to building inclusive user interfaces with modern component libraries while maintaining design consistency and development efficiency._

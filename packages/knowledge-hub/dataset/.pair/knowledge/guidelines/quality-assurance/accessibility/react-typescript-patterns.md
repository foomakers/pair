# React TypeScript Accessibility Patterns

## 🎯 **PURPOSE**

Comprehensive guide to implementing accessible React applications using TypeScript, providing type-safe accessibility patterns, component design strategies, and implementation best practices for inclusive user experiences.

## ⚛️ **TYPESCRIPT ACCESSIBILITY FOUNDATIONS**

### **Accessibility Type Definitions**

TypeScript provides powerful type safety for accessibility implementation, enabling compile-time validation of accessibility requirements and reducing runtime accessibility errors.

**ARIA Attribute Types**

TypeScript includes comprehensive ARIA attribute types that ensure correct usage of accessibility attributes with proper value validation and IntelliSense support.

**Accessibility Interface Design**

Custom TypeScript interfaces for accessibility ensure consistent implementation across components and enable reusable accessibility patterns.

**Accessibility Prop Types**

Strongly typed accessibility props prevent common accessibility implementation errors and provide clear documentation of accessibility requirements.

```typescript
// Comprehensive accessibility type definitions
interface AccessibilityProps {
  // ARIA attributes with proper typing
  'aria-label'?: string
  'aria-labelledby'?: string
  'aria-describedby'?: string
  'aria-expanded'?: boolean
  'aria-hidden'?: boolean
  'aria-live'?: 'polite' | 'assertive' | 'off'
  'aria-atomic'?: boolean
  'aria-relevant'?: 'additions' | 'removals' | 'text' | 'all'

  // Role definitions
  role?:
    | 'button'
    | 'link'
    | 'menuitem'
    | 'tab'
    | 'tabpanel'
    | 'dialog'
    | 'alertdialog'
    | 'tooltip'
    | 'combobox'
    | 'listbox'
    | 'option'
    | 'tree'
    | 'treeitem'
    | 'grid'
    | 'gridcell'
    | 'columnheader'
    | 'rowheader'

  // Keyboard navigation
  tabIndex?: number
  onKeyDown?: (event: React.KeyboardEvent) => void

  // Focus management
  autoFocus?: boolean
  id?: string
}

interface FocusManagementProps {
  focusOnMount?: boolean
  restoreFocus?: boolean
  focusTrap?: boolean
  initialFocus?: string | HTMLElement
}

interface ScreenReaderProps {
  announceChanges?: boolean
  liveRegion?: 'polite' | 'assertive'
  skipToContent?: boolean
  screenReaderOnly?: boolean
}

// Comprehensive accessibility component props
interface AccessibleComponentProps
  extends AccessibilityProps,
    FocusManagementProps,
    ScreenReaderProps {
  className?: string
  children?: React.ReactNode
  disabled?: boolean
  required?: boolean
  invalid?: boolean
  readonly?: boolean
}

// Button accessibility patterns
interface AccessibleButtonProps extends AccessibleComponentProps {
  variant?: 'primary' | 'secondary' | 'danger' | 'ghost'
  size?: 'small' | 'medium' | 'large'
  loading?: boolean
  loadingText?: string
  icon?: React.ReactNode
  iconPosition?: 'left' | 'right'
  fullWidth?: boolean
  href?: string // For button that acts as link
  target?: '_blank' | '_self' | '_parent' | '_top'
  download?: string | boolean
}

// Form accessibility patterns
interface AccessibleFormFieldProps extends AccessibleComponentProps {
  label: string
  helperText?: string
  errorMessage?: string
  placeholder?: string
  value?: string
  defaultValue?: string
  onChange?: (value: string) => void
  onBlur?: () => void
  onFocus?: () => void
  validation?: {
    required?: boolean
    pattern?: RegExp
    minLength?: number
    maxLength?: number
    validator?: (value: string) => string | null
  }
}

// Modal/Dialog accessibility patterns
interface AccessibleModalProps extends AccessibleComponentProps {
  isOpen: boolean
  onClose: () => void
  title: string
  description?: string
  closeOnEscape?: boolean
  closeOnOverlayClick?: boolean
  preventScroll?: boolean
  size?: 'small' | 'medium' | 'large' | 'fullscreen'
}
```

### **React Accessibility Hooks**

**Custom Accessibility Hooks**

TypeScript-enabled custom hooks encapsulate accessibility logic and provide reusable accessibility patterns across components.

**Focus Management Hooks**

Specialized hooks for focus management including focus trapping, focus restoration, and keyboard navigation.

**Screen Reader Hooks**

Hooks for screen reader optimization including live region announcements and screen reader-specific content management.

## 🧩 **ACCESSIBLE COMPONENT PATTERNS**

### **Button Component Patterns**

**Accessible Button Implementation**

Comprehensive button component with full accessibility support including keyboard navigation, screen reader optimization, and state management.

**Button State Management**

Proper state management for button accessibility including loading states, disabled states, and pressed states with appropriate ARIA attributes.

**Icon Button Accessibility**

Specialized patterns for icon buttons ensuring proper labeling and screen reader support.

```typescript
// Accessible Button Component
import React, { forwardRef, useState, useEffect } from 'react'
import { AccessibleButtonProps } from './types'
import { useAnnouncement, useFocusManagement } from './hooks'

const AccessibleButton = forwardRef<HTMLButtonElement, AccessibleButtonProps>(
  (
    {
      children,
      variant = 'primary',
      size = 'medium',
      loading = false,
      loadingText = 'Loading...',
      disabled = false,
      icon,
      iconPosition = 'left',
      href,
      target,
      download,
      onClick,
      onKeyDown,
      'aria-label': ariaLabel,
      'aria-describedby': ariaDescribedby,
      className,
      ...rest
    },
    ref,
  ) => {
    const [isPressed, setIsPressed] = useState(false)
    const { announce } = useAnnouncement()
    const { handleFocus, handleBlur } = useFocusManagement()

    // Handle loading state announcements
    useEffect(() => {
      if (loading) {
        announce(loadingText, 'polite')
      }
    }, [loading, loadingText, announce])

    const handleClick = (event: React.MouseEvent<HTMLButtonElement>) => {
      if (disabled || loading) return
      onClick?.(event)
    }

    const handleKeyDown = (event: React.KeyboardEvent<HTMLButtonElement>) => {
      // Handle space and enter key presses
      if (event.key === ' ' || event.key === 'Enter') {
        if (!disabled && !loading) {
          setIsPressed(true)
          onClick?.(event as any)
        }
        event.preventDefault()
      }
      onKeyDown?.(event)
    }

    const handleKeyUp = (event: React.KeyboardEvent<HTMLButtonElement>) => {
      if (event.key === ' ' || event.key === 'Enter') {
        setIsPressed(false)
      }
    }

    // Determine if this should be a link or button
    const isLink = href && !disabled && !loading
    const Component = isLink ? 'a' : 'button'

    const buttonProps = {
      ref,
      className: `accessible-button ${variant} ${size} ${className || ''}`,
      disabled: disabled || loading,
      'aria-label': ariaLabel || (typeof children === 'string' ? undefined : 'Button'),
      'aria-describedby': ariaDescribedby,
      'aria-pressed': isPressed,
      'aria-busy': loading,
      'aria-disabled': disabled,
      onClick: isLink ? undefined : handleClick,
      onKeyDown: handleKeyDown,
      onKeyUp: handleKeyUp,
      onFocus: handleFocus,
      onBlur: handleBlur,
      ...(isLink && {
        href,
        target,
        download,
        role: 'button',
        tabIndex: 0,
      }),
      ...rest,
    }

    const content = (
      <>
        {loading ? (
          <>
            <span aria-hidden='true' className='spinner' />
            <span className='sr-only'>{loadingText}</span>
          </>
        ) : (
          <>
            {icon && iconPosition === 'left' && (
              <span aria-hidden='true' className='icon icon-left'>
                {icon}
              </span>
            )}
            <span>{children}</span>
            {icon && iconPosition === 'right' && (
              <span aria-hidden='true' className='icon icon-right'>
                {icon}
              </span>
            )}
          </>
        )}
      </>
    )

    return <Component {...buttonProps}>{content}</Component>
  },
)

AccessibleButton.displayName = 'AccessibleButton'
export default AccessibleButton
```

### **Form Component Patterns**

**Accessible Form Fields**

Comprehensive form field components with proper labeling, error handling, and validation messaging.

**Form Validation Accessibility**

Accessible form validation patterns including real-time validation feedback and error announcement.

**Complex Form Patterns**

Advanced form patterns including multi-step forms, conditional fields, and dynamic form generation with accessibility.

```typescript
// Accessible Form Field Component
import React, { useId, forwardRef, useState } from 'react'
import { AccessibleFormFieldProps } from './types'
import { useValidation, useAnnouncement } from './hooks'

const AccessibleFormField = forwardRef<HTMLInputElement, AccessibleFormFieldProps>(
  (
    {
      label,
      helperText,
      errorMessage,
      placeholder,
      value,
      defaultValue,
      onChange,
      onBlur,
      onFocus,
      validation,
      required = false,
      disabled = false,
      invalid = false,
      readonly = false,
      type = 'text',
      className,
      ...rest
    },
    ref,
  ) => {
    const fieldId = useId()
    const helperId = useId()
    const errorId = useId()

    const [isFocused, setIsFocused] = useState(false)
    const [hasBlurred, setHasBlurred] = useState(false)

    const { announce } = useAnnouncement()
    const { validateField, isValid, validationError } = useValidation(validation)

    const showError = (invalid || (validationError && hasBlurred)) && !isFocused
    const displayError = errorMessage || validationError

    const handleChange = (event: React.ChangeEvent<HTMLInputElement>) => {
      const newValue = event.target.value
      onChange?.(newValue)

      if (hasBlurred) {
        validateField(newValue)
      }
    }

    const handleBlur = (event: React.FocusEvent<HTMLInputElement>) => {
      setIsFocused(false)
      setHasBlurred(true)

      const currentValue = event.target.value
      validateField(currentValue)

      if (validationError) {
        announce(`Error: ${validationError}`, 'assertive')
      }

      onBlur?.()
    }

    const handleFocus = (event: React.FocusEvent<HTMLInputElement>) => {
      setIsFocused(true)
      onFocus?.()
    }

    const describedBy =
      [helperText ? helperId : null, showError ? errorId : null].filter(Boolean).join(' ') ||
      undefined

    return (
      <div className={`form-field ${showError ? 'error' : ''} ${className || ''}`}>
        <label htmlFor={fieldId} className='form-label'>
          {label}
          {required && (
            <span aria-label='required' className='required-indicator'>
              *
            </span>
          )}
        </label>

        <input
          ref={ref}
          id={fieldId}
          type={type}
          value={value}
          defaultValue={defaultValue}
          placeholder={placeholder}
          onChange={handleChange}
          onBlur={handleBlur}
          onFocus={handleFocus}
          required={required}
          disabled={disabled}
          readOnly={readonly}
          aria-invalid={showError}
          aria-describedby={describedBy}
          aria-required={required}
          className='form-input'
          {...rest}
        />

        {helperText && (
          <div id={helperId} className='helper-text'>
            {helperText}
          </div>
        )}

        {showError && displayError && (
          <div id={errorId} className='error-message' role='alert' aria-live='polite'>
            {displayError}
          </div>
        )}
      </div>
    )
  },
)

AccessibleFormField.displayName = 'AccessibleFormField'
export default AccessibleFormField
```

### **Modal and Dialog Patterns**

**Accessible Modal Implementation**

Complete modal/dialog component with focus trapping, keyboard navigation, and proper ARIA implementation.

**Focus Management in Modals**

Comprehensive focus management including focus trapping, initial focus, and focus restoration.

**Modal Accessibility Best Practices**

Advanced modal patterns including nested modals, confirmation dialogs, and complex modal content.

## 🎣 **ACCESSIBILITY HOOKS**

### **Focus Management Hooks**

**useFocusTrap Hook**

Reusable hook for implementing focus trapping in modal dialogs and other contained interfaces.

**useFocusManagement Hook**

Comprehensive focus management including focus restoration, keyboard navigation, and focus indicators.

**useAutoFocus Hook**

Smart auto-focus hook that respects user preferences and accessibility guidelines.

```typescript
// Focus Management Hooks
import { useEffect, useRef, useCallback, useState } from 'react'

// Focus trap hook for modals and dialogs
export const useFocusTrap = (isActive: boolean = true) => {
  const containerRef = useRef<HTMLElement>(null)
  const lastFocusedElement = useRef<HTMLElement | null>(null)

  useEffect(() => {
    if (!isActive || !containerRef.current) return

    // Store the currently focused element
    lastFocusedElement.current = document.activeElement as HTMLElement

    const container = containerRef.current
    const focusableElements = container.querySelectorAll(
      'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
    ) as NodeListOf<HTMLElement>

    const firstElement = focusableElements[0]
    const lastElement = focusableElements[focusableElements.length - 1]

    const handleTabKey = (event: KeyboardEvent) => {
      if (event.key !== 'Tab') return

      if (event.shiftKey) {
        if (document.activeElement === firstElement) {
          lastElement?.focus()
          event.preventDefault()
        }
      } else {
        if (document.activeElement === lastElement) {
          firstElement?.focus()
          event.preventDefault()
        }
      }
    }

    // Set initial focus
    firstElement?.focus()

    // Add event listener
    container.addEventListener('keydown', handleTabKey)

    return () => {
      container.removeEventListener('keydown', handleTabKey)

      // Restore focus when the trap is deactivated
      if (lastFocusedElement.current) {
        lastFocusedElement.current.focus()
      }
    }
  }, [isActive])

  return containerRef
}

// Announcement hook for screen readers
export const useAnnouncement = () => {
  const announcementRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    // Create announcement region if it doesn't exist
    if (!announcementRef.current) {
      const element = document.createElement('div')
      element.setAttribute('aria-live', 'polite')
      element.setAttribute('aria-atomic', 'true')
      element.className = 'sr-only'
      document.body.appendChild(element)
      announcementRef.current = element
    }

    return () => {
      if (announcementRef.current) {
        document.body.removeChild(announcementRef.current)
      }
    }
  }, [])

  const announce = useCallback((message: string, priority: 'polite' | 'assertive' = 'polite') => {
    if (announcementRef.current) {
      announcementRef.current.setAttribute('aria-live', priority)
      announcementRef.current.textContent = message

      // Clear the message after announcement
      setTimeout(() => {
        if (announcementRef.current) {
          announcementRef.current.textContent = ''
        }
      }, 1000)
    }
  }, [])

  return { announce }
}

// Keyboard navigation hook
export const useKeyboardNavigation = (
  items: HTMLElement[],
  options: {
    loop?: boolean
    orientation?: 'horizontal' | 'vertical'
    onSelect?: (index: number) => void
  } = {},
) => {
  const [currentIndex, setCurrentIndex] = useState(0)
  const { loop = true, orientation = 'vertical', onSelect } = options

  const handleKeyDown = useCallback(
    (event: React.KeyboardEvent) => {
      const { key } = event
      let newIndex = currentIndex

      switch (key) {
        case 'ArrowDown':
          if (orientation === 'vertical') {
            newIndex = loop
              ? (currentIndex + 1) % items.length
              : Math.min(currentIndex + 1, items.length - 1)
            event.preventDefault()
          }
          break
        case 'ArrowUp':
          if (orientation === 'vertical') {
            newIndex = loop
              ? (currentIndex - 1 + items.length) % items.length
              : Math.max(currentIndex - 1, 0)
            event.preventDefault()
          }
          break
        case 'ArrowRight':
          if (orientation === 'horizontal') {
            newIndex = loop
              ? (currentIndex + 1) % items.length
              : Math.min(currentIndex + 1, items.length - 1)
            event.preventDefault()
          }
          break
        case 'ArrowLeft':
          if (orientation === 'horizontal') {
            newIndex = loop
              ? (currentIndex - 1 + items.length) % items.length
              : Math.max(currentIndex - 1, 0)
            event.preventDefault()
          }
          break
        case 'Home':
          newIndex = 0
          event.preventDefault()
          break
        case 'End':
          newIndex = items.length - 1
          event.preventDefault()
          break
        case 'Enter':
        case ' ':
          onSelect?.(currentIndex)
          event.preventDefault()
          break
      }

      if (newIndex !== currentIndex) {
        setCurrentIndex(newIndex)
        items[newIndex]?.focus()
      }
    },
    [currentIndex, items, loop, orientation, onSelect],
  )

  return {
    currentIndex,
    setCurrentIndex,
    handleKeyDown,
  }
}

// Screen reader detection hook
export const useScreenReader = () => {
  const [isScreenReaderActive, setIsScreenReaderActive] = useState(false)

  useEffect(() => {
    // Check for screen reader indicators
    const checkScreenReader = () => {
      // Check for high contrast mode (often indicates screen reader use)
      const highContrast = window.matchMedia('(prefers-contrast: high)').matches

      // Check for reduced motion preference
      const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches

      // Check for focus-visible support
      const focusVisible = CSS.supports('selector(:focus-visible)')

      setIsScreenReaderActive(highContrast || !focusVisible)
    }

    checkScreenReader()

    // Listen for changes
    const contrastQuery = window.matchMedia('(prefers-contrast: high)')
    const motionQuery = window.matchMedia('(prefers-reduced-motion: reduce)')

    contrastQuery.addListener(checkScreenReader)
    motionQuery.addListener(checkScreenReader)

    return () => {
      contrastQuery.removeListener(checkScreenReader)
      motionQuery.removeListener(checkScreenReader)
    }
  }, [])

  return isScreenReaderActive
}
```

### **ARIA Hooks**

**useARIA Hook**

Comprehensive ARIA management hook for dynamic ARIA attribute management and state synchronization.

**useLiveRegion Hook**

Specialized hook for managing live regions and screen reader announcements.

**useARIAControls Hook**

Hook for managing ARIA relationships including controls, owns, and describedby relationships.

## 🔧 **ACCESSIBILITY UTILITIES**

### **TypeScript Utility Functions**

**Accessibility Validation Utilities**

TypeScript utility functions for validating accessibility implementation and ensuring compliance.

**ARIA Helper Functions**

Utility functions for generating ARIA attributes and managing ARIA relationships.

**Keyboard Event Utilities**

Utility functions for handling keyboard events and implementing keyboard navigation patterns.

### **Testing Utilities**

**Accessibility Testing Helpers**

TypeScript utilities for testing accessibility implementation in Jest and React Testing Library.

**Mock Accessibility APIs**

Mock implementations of accessibility APIs for testing purposes.

**Accessibility Assertion Utilities**

Custom assertion utilities for verifying accessibility implementation in tests.

## 🎨 **STYLING AND DESIGN INTEGRATION**

### **Accessible CSS-in-JS Patterns**

**TypeScript Styled Components**

Accessible styling patterns using TypeScript with styled-components or emotion.

**Theme Integration**

Accessibility-focused theme integration including color contrast, focus indicators, and motion preferences.

**Responsive Accessibility**

Responsive design patterns that maintain accessibility across different screen sizes and orientations.

### **Design System Integration**

**Accessible Design Tokens**

TypeScript-defined design tokens that ensure accessibility compliance across the design system.

**Component Accessibility Documentation**

Comprehensive documentation of accessibility features and usage guidelines for design system components.

**Accessibility Testing Integration**

Integration of accessibility testing into the design system development workflow.

---

_React TypeScript accessibility patterns provide type-safe, reusable solutions for building inclusive user interfaces that work for all users._

# Design Systems Practice (Level 2)

Design system architecture, component libraries, design tokens, and brand integration for consistent and scalable user interface design.

## Purpose

Define design system standards and patterns that ensure consistent visual language, reusable component libraries, and scalable design architecture across all digital products and platforms.

## Scope

**In Scope:**

- Design system architecture and governance
- Component library development and maintenance
- Design token systems and theming
- Brand integration and visual identity
- Component documentation and guidelines

**Out of Scope:**

- Technical implementation details (see [Code Design](../code-design/README.md))
- Component performance optimization (see [Quality/Performance](../quality/performance.md))
- Accessibility implementation (see [Quality/Accessibility](../quality/accessibility.md))
- User interface testing (see [User Research](user-research.md))

## Topics Covered

### Design System Architecture

Foundational architecture and governance for design systems

- Design system principles and philosophy
- Component hierarchy and organization
- Design system governance and decision-making
- Versioning and release management

### Component Libraries

Component development, maintenance, and evolution

- Component design and specification
- Component variants and states
- Component composition patterns
- Component lifecycle management

### Design Tokens

Design token systems for consistent theming and branding

- Color systems and semantic naming
- Typography scales and hierarchies
- Spacing and layout systems
- Animation and interaction tokens

### Brand Integration

Brand identity integration and visual consistency

- Brand guidelines integration process
- Visual identity implementation
- Brand voice and personality in design
- Multi-brand and white-label support

## 🛠️ Level 3: Tool-Specific Implementations

### Design Tools

- **[Figma](../figma/)** - Design system creation and collaboration
- **[Sketch](../sketch/)** - Design system libraries and symbols
- **[Adobe XD](../adobe-xd/)** - Design system assets and components

### Component Libraries

- **[Storybook](../storybook/)** - Component documentation and development
- **[shadcn/ui](../shadcn-ui/)** - Tailwind-based component library

## 🎨 Design System Architecture

### Design System Principles

**Consistency First**:

- Unified visual language across all touchpoints
- Standardized interaction patterns and behaviors
- Consistent spacing, typography, and color usage
- Predictable component behavior and appearance

**Accessibility by Design**:

- WCAG 2.1 AA compliance built into all components
- Keyboard navigation and screen reader support
- High contrast and focus management
- Inclusive design considerations

**Scalability and Flexibility**:

- Modular component architecture
- Themeable and customizable components
- Responsive design patterns
- Platform-agnostic design decisions

**Developer Experience**:

- Clear documentation and usage guidelines
- Easy integration and implementation
- Consistent API patterns across components
- Comprehensive testing and validation

### Component Hierarchy

**Atomic Design Structure**:

```
Design System
├── Tokens (Design Decisions)
│   ├── Colors
│   ├── Typography
│   ├── Spacing
│   └── Animation
├── Atoms (Basic Elements)
│   ├── Button
│   ├── Input
│   ├── Icon
│   └── Typography
├── Molecules (Simple Components)
│   ├── Form Field
│   ├── Search Box
│   ├── Navigation Item
│   └── Card Header
├── Organisms (Complex Components)
│   ├── Navigation
│   ├── Form
│   ├── Data Table
│   └── Modal
└── Templates (Layout Patterns)
    ├── Page Layout
    ├── Dashboard Layout
    └── Form Layout
```

### Design System Governance

**Design System Team Structure**:

- **Design System Lead**: Overall strategy and vision
- **Designer**: Visual design and user experience
- **Frontend Developer**: Component implementation
- **Documentation Specialist**: Guidelines and documentation

**Decision-Making Process**:

1. **Proposal**: New component or change request
2. **Review**: Design and technical feasibility assessment
3. **Design**: Visual design and interaction specification
4. **Development**: Component implementation and testing
5. **Documentation**: Usage guidelines and examples
6. **Release**: Version management and communication

## 🧩 Component Libraries

### Component Design Specifications

**Button Component Example**:

```typescript
interface ButtonProps {
  variant: 'primary' | 'secondary' | 'outline' | 'ghost' | 'destructive';
  size: 'small' | 'medium' | 'large';
  isLoading?: boolean;
  disabled?: boolean;
  leftIcon?: React.ReactNode;
  rightIcon?: React.ReactNode;
  children: React.ReactNode;
  onClick?: () => void;
}

// Usage examples
<Button variant="primary" size="medium">Primary Action</Button>
<Button variant="outline" size="small" leftIcon={<PlusIcon />}>Add Item</Button>
<Button variant="destructive" isLoading>Delete</Button>
```

**Component States**:

- **Default**: Normal component appearance
- **Hover**: Visual feedback on hover interaction
- **Active**: Visual feedback during click/press
- **Focus**: Keyboard focus indication
- **Disabled**: Non-interactive state
- **Loading**: Processing state with appropriate feedback

### Component Composition Patterns

**Compound Components**:

```typescript
// Modal compound component pattern
<Modal>
  <Modal.Header>
    <Modal.Title>Edit Profile</Modal.Title>
    <Modal.CloseButton />
  </Modal.Header>
  <Modal.Body>
    <Form>
      <Form.Field>
        <Form.Label>Name</Form.Label>
        <Form.Input />
      </Form.Field>
    </Form>
  </Modal.Body>
  <Modal.Footer>
    <Button variant='outline'>Cancel</Button>
    <Button variant='primary'>Save</Button>
  </Modal.Footer>
</Modal>
```

**Polymorphic Components**:

```typescript
// Flexible component that can render as different elements
<Button as="a" href="/dashboard">Go to Dashboard</Button>
<Button as={Link} to="/profile">View Profile</Button>
<Button as="button" type="submit">Submit Form</Button>
```

### Component Documentation Standards

**Component Documentation Template**:

````markdown
# Button Component

## Overview

Brief description of the component purpose and use cases.

## Variants

- **Primary**: Main call-to-action buttons
- **Secondary**: Secondary actions and navigation
- **Outline**: Subtle actions with emphasis
- **Ghost**: Minimal visual weight actions
- **Destructive**: Delete or destructive actions

## Props

| Prop     | Type          | Default   | Description          |
| -------- | ------------- | --------- | -------------------- |
| variant  | ButtonVariant | 'primary' | Visual style variant |
| size     | ButtonSize    | 'medium'  | Component size       |
| disabled | boolean       | false     | Disable interaction  |

## Examples

```jsx
// Basic usage
<Button>Click me</Button>

// With icon
<Button leftIcon={<PlusIcon />}>Add Item</Button>

// Loading state
<Button isLoading>Processing...</Button>
```
````

## Accessibility

- Keyboard navigation support
- Screen reader compatibility
- Focus management
- ARIA attributes

## Design Tokens

- Colors: Uses semantic color tokens
- Typography: Uses text scale tokens
- Spacing: Uses spacing scale tokens

````

## 🎯 Design Tokens

### Color System

**Semantic Color Structure**:
```css
/* Primary color palette */
--color-primary-50: #eff6ff;
--color-primary-100: #dbeafe;
--color-primary-500: #3b82f6;
--color-primary-600: #2563eb;
--color-primary-900: #1e3a8a;

/* Semantic color assignments */
--color-background: var(--color-neutral-50);
--color-foreground: var(--color-neutral-900);
--color-primary: var(--color-primary-600);
--color-secondary: var(--color-neutral-600);
--color-success: var(--color-green-600);
--color-warning: var(--color-amber-600);
--color-error: var(--color-red-600);
--color-info: var(--color-blue-600);
````

**Color Token Usage**:

```typescript
// Design token configuration
export const colorTokens = {
  colors: {
    // Primitive colors (brand palette)
    brand: {
      50: '#f0f9ff',
      500: '#0ea5e9',
      900: '#0c4a6e',
    },

    // Semantic colors (functional usage)
    primary: 'var(--color-primary)',
    secondary: 'var(--color-secondary)',
    background: 'var(--color-background)',
    foreground: 'var(--color-foreground)',

    // Component-specific colors
    button: {
      primary: 'var(--color-primary)',
      primaryHover: 'var(--color-primary-700)',
      secondary: 'var(--color-secondary)',
      secondaryHover: 'var(--color-secondary-700)',
    },
  },
}
```

### Typography System

**Typography Scale**:

```css
/* Typography tokens */
--font-family-sans: 'Inter', system-ui, sans-serif;
--font-family-mono: 'JetBrains Mono', monospace;

/* Font size scale */
--text-xs: 0.75rem; /* 12px */
--text-sm: 0.875rem; /* 14px */
--text-base: 1rem; /* 16px */
--text-lg: 1.125rem; /* 18px */
--text-xl: 1.25rem; /* 20px */
--text-2xl: 1.5rem; /* 24px */
--text-3xl: 1.875rem; /* 30px */
--text-4xl: 2.25rem; /* 36px */

/* Line height scale */
--leading-tight: 1.25;
--leading-normal: 1.5;
--leading-relaxed: 1.625;

/* Font weight scale */
--font-normal: 400;
--font-medium: 500;
--font-semibold: 600;
--font-bold: 700;
```

### Spacing System

**Spacing Scale**:

```css
/* Spacing tokens based on 4px grid */
--space-1: 0.25rem; /* 4px */
--space-2: 0.5rem; /* 8px */
--space-3: 0.75rem; /* 12px */
--space-4: 1rem; /* 16px */
--space-6: 1.5rem; /* 24px */
--space-8: 2rem; /* 32px */
--space-12: 3rem; /* 48px */
--space-16: 4rem; /* 64px */
--space-20: 5rem; /* 80px */
--space-24: 6rem; /* 96px */
```

## 🏢 Brand Integration

### Brand Guidelines Integration Process

**Phase 1: Asset Collection**

```typescript
interface BrandAssets {
  logo: {
    primary: string // Main logo file (SVG)
    secondary?: string // Alternative logo variant
    icon: string // Icon/mark only version
    wordmark?: string // Text-only version
  }

  colors: {
    primary: string // Primary brand color
    secondary?: string // Secondary brand color
    accent?: string // Accent color
    neutral: string[] // Neutral color palette
  }

  typography: {
    primary: {
      family: string // Primary font family
      weights: number[] // Available font weights
      fallback: string[] // Fallback font stack
    }
    secondary?: {
      family: string // Secondary font family
      weights: number[]
      fallback: string[]
    }
  }

  spacing?: {
    unit: number // Base spacing unit
    scale: number[] // Spacing scale multipliers
  }

  borderRadius?: {
    small: string // Small border radius
    medium: string // Medium border radius
    large: string // Large border radius
  }
}
```

**Phase 2: Token Mapping**:

```typescript
// Brand token mapping configuration
export const createBrandTokens = (brandAssets: BrandAssets) => ({
  colors: {
    // Map brand colors to semantic tokens
    primary: brandAssets.colors.primary,
    secondary: brandAssets.colors.secondary || brandAssets.colors.primary,

    // Extend with generated color scales
    brand: generateColorScale(brandAssets.colors.primary),

    // Maintain system colors for functionality
    success: '#10b981',
    warning: '#f59e0b',
    error: '#ef4444',
    info: '#3b82f6',
  },

  typography: {
    fontFamily: {
      sans: [brandAssets.typography.primary.family, ...brandAssets.typography.primary.fallback],
      heading: brandAssets.typography.secondary?.family
        ? [brandAssets.typography.secondary.family, ...brandAssets.typography.secondary.fallback]
        : [brandAssets.typography.primary.family, ...brandAssets.typography.primary.fallback],
    },
  },

  spacing: brandAssets.spacing
    ? generateSpacingScale(brandAssets.spacing.unit, brandAssets.spacing.scale)
    : defaultSpacingScale,
})
```

### Multi-Brand Support

**Brand Theme Configuration**:

```typescript
// Support for multiple brand themes
export const brandThemes = {
  default: createBrandTokens(defaultBrandAssets),
  client1: createBrandTokens(client1BrandAssets),
  client2: createBrandTokens(client2BrandAssets),
}

// Theme provider for brand switching
export const BrandThemeProvider = ({ brand = 'default', children }: BrandThemeProviderProps) => {
  const theme = brandThemes[brand]

  return (
    <ThemeProvider theme={theme}>
      <GlobalStyles />
      {children}
    </ThemeProvider>
  )
}

// Usage in application
;<BrandThemeProvider brand='client1'>
  <App />
</BrandThemeProvider>
```

## 🔗 Related Practices

- **[Interface Design](interface-design.md)** - UI patterns and visual design implementation
- **[User Research](user-research.md)** - Component testing and validation
- **[Content Strategy](content-strategy.md)** - Content integration in design systems
- **[Code Design](../code-design/README.md)** - Technical implementation patterns

---

_Focus on systematic design architecture, reusable component libraries, and scalable brand integration._

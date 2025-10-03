```markdown
# File Structure

## Overview

File and directory organization patterns that promote maintainability, discoverability, and logical grouping. Focus on co-location, clear module boundaries, and consistent naming.

## Directory Structure Patterns

### Feature-First Organization

Organize code by features/domains rather than technical layers:
```

src/
├── components/
│ ├── ui/ # Reusable UI components
│ │ ├── Button/
│ │ │ ├── Button.tsx
│ │ │ ├── Button.test.tsx
│ │ │ ├── Button.stories.tsx
│ │ │ └── index.ts
│ │ └── index.ts # Barrel exports
│ └── layout/ # Layout components
├── features/
│ ├── auth/
│ │ ├── components/
│ │ ├── hooks/
│ │ ├── services/
│ │ ├── types/
│ │ └── index.ts
│ └── dashboard/
└── shared/
├── lib/ # Utilities
├── types/ # Global types
└── constants/

```

### Co-location Rules

**Tests**: Always co-locate test files with implementation:
```

UserProfile.tsx
UserProfile.test.tsx
UserProfile.stories.tsx (if using Storybook)

```

**Types**: Co-locate types when feature-specific:
```

auth/
├── components/
├── types/
│ ├── user.types.ts
│ └── auth.types.ts
└── services/

```

**Styles**: Keep styles close to components:
```

Button/
├── Button.tsx
├── Button.module.css
├── Button.test.tsx
└── index.ts

````

## File Naming Conventions

### Components
- **React Components**: PascalCase `UserProfile.tsx`
- **Component folders**: PascalCase `UserProfile/`
- **Hooks**: camelCase with `use` prefix `useAuth.ts`
- **Utilities**: camelCase `formatDate.ts`

### Files and Directories
- **Directories**: kebab-case `user-management/`
- **Config files**: kebab-case `eslint.config.js`
- **Constants**: SCREAMING_SNAKE_CASE `API_ENDPOINTS.ts`
- **Types**: camelCase with `.types.ts` suffix

## Index Files (Barrel Exports)

Use index files to create clean public APIs:

```typescript
// components/ui/index.ts
export { Button } from './Button';
export { Input } from './Input';
export { Modal } from './Modal';

// Re-export types
export type { ButtonProps } from './Button';
export type { InputProps } from './Input';
````

### Index File Rules

1. **One per directory** that needs external access
2. **Export only public API** - hide internal implementation
3. **Re-export types** alongside components
4. **Avoid deep barrel exports** - max 2 levels

## Module Boundaries

### Clear Boundaries

- Each feature should be self-contained
- Dependencies should flow in one direction
- Shared code goes in `shared/` or `lib/`

### Import Rules

```typescript
// ✅ Good: Relative imports within feature
import { UserService } from './services/UserService'

// ✅ Good: Absolute imports for shared code
import { formatDate } from '@/shared/lib/utils'

// ❌ Bad: Cross-feature imports
import { AuthService } from '../auth/services/AuthService'
```

## Special Files

### Configuration Co-location

Keep configuration close to where it's used:

```
features/auth/
├── components/
├── __tests__/
│   └── auth.config.ts     # Auth-specific test config
└── auth.constants.ts      # Auth constants
```

### Asset Organization

```
public/
├── images/
│   ├── icons/
│   ├── logos/
│   └── illustrations/
└── fonts/

src/assets/
├── icons/             # React icon components
└── styles/
    ├── globals.css
    └── components/    # Component-specific styles
```

## Examples

### React Component Structure

```
components/UserProfile/
├── UserProfile.tsx           # Main component
├── UserProfile.test.tsx      # Unit tests
├── UserProfile.stories.tsx   # Storybook stories
├── UserProfile.module.css    # Styles
├── hooks/
│   ├── useUserProfile.ts     # Component-specific hooks
│   └── useUserProfile.test.ts
├── types/
│   └── UserProfile.types.ts  # Component types
└── index.ts                  # Public API
```

### Service Structure

```
services/
├── api/
│   ├── userApi.ts
│   ├── userApi.test.ts
│   └── types.ts
├── auth/
│   ├── AuthService.ts
│   ├── AuthService.test.ts
│   └── auth.types.ts
└── index.ts
```

## Best Practices

1. **Consistent depth**: Avoid deeply nested folders (max 4-5 levels)
2. **Logical grouping**: Group related files together
3. **Clear naming**: File names should indicate purpose
4. **Test proximity**: Keep tests next to implementation
5. **Public APIs**: Use index files to control what's exposed
6. **Dependencies**: Keep feature dependencies explicit and minimal

## Anti-patterns

❌ **Technical layering**:

```
src/
├── components/     # All components mixed together
├── services/       # All services mixed together
└── utils/          # All utilities mixed together
```

❌ **Deep nesting**:

```
src/features/auth/components/forms/login/validation/rules/email/
```

❌ **Mixed concerns**:

```
UserProfile.tsx     # Component + business logic + API calls
```

❌ **Unclear boundaries**:

```
// In auth feature importing from user feature
import { UserService } from '../../user/services/UserService';
```

```

```

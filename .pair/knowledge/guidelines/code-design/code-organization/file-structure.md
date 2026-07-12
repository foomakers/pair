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

```text

### Co-location Rules

**Tests**: Always co-locate test files with implementation:
```

UserProfile.tsx
UserProfile.test.tsx
UserProfile.stories.tsx (if using Storybook)

```text

**Tests spanning multiple modules**: when a test exercises more than one implementation file together (e.g. an integration test driving two collaborating functions end-to-end), it does not get its own standalone file — it goes in the test file already co-located with the *root* module of that call chain, the one whose exported entry point the test is actually verifying. A test that seeds its fixture through module B but asserts on module A's behavior belongs in `A.test.ts`, not a new `A-and-b-integration.test.ts`. This keeps the co-location rule intact (one root module → one test file) instead of a proliferation of ad hoc integration-test files that duplicate coverage or drift out of sync with the modules they actually exercise.

This does not apply to two other, already-common test categories that are correctly named after what they validate rather than a source module: end-to-end/page-level tests (e.g. `cli.e2e.test.ts`, testing a real flow across many files by design) and content/asset-validation tests (e.g. asserting on a generated markdown file's content, where there is no single source module to co-locate against).

**Amendment (2026-07-12, #199 test reorg)**: an earlier version of this rule set out three "checkable criteria" under which an application entry point's e2e coverage could be split into several `*.e2e.test.ts` files (one per command/flow). That split was applied to `apps/pair-cli` and looked compliant against the letter of those criteria, but a subsequent per-test classification of all 51 tests across the resulting 7 files found only 1 was genuinely e2e — depending on a real hand-off of state between independently invoked commands. The other 50 were single-module tests wearing e2e clothing: each exercised exactly one command's handler, with no real cross-command interaction, and would have been (and, per this reorg, now are) equally at home as regular tests in that handler's own co-located test file. The three-criteria version of the rule was too easy to satisfy on paper without the underlying flows actually being cross-module.

The rule is corrected to this, tighter form:

- **e2e tests default to one file per application entry point** (e.g. `cli.e2e.test.ts` for `apps/pair-cli`, `app.e2e.test.ts` for a web app). Do not split it by module or command as a matter of course.
- **Splitting an entry point's e2e file is valid only when the production code itself has been genuinely refactored into isolated modules, and the corresponding tests for those modules have become true unit tests** (asserting a single module's behavior, not staying e2e-shaped with a full command/flow setup). If the production code was not restructured, the tests should not be either — that's a signal the "split" is just moving tests around, not truly isolating them.
- A test belongs in the one e2e file if it depends on real, observable hand-off of state between independently invoked units (e.g. command A's output becoming command B's input against the same target). If a test only exercises one command/module — even if named `*.e2e.test.ts` — it is a unit test for that module and belongs in its co-located `*.test.ts` file instead.

Concrete precedent: `apps/pair-cli`'s prior 7-file e2e split (`cli-errors`, `cli-install`, `cli-kb-validate`, `cli-link`, `cli-packaging`, `cli-update`, `cli-validate-config` — all `.e2e.test.ts`) was consolidated back into a single `cli.e2e.test.ts` containing only the one test with a genuine cross-command dependency (install → update → update-link against the same disjoint target). Duplicates of existing unit tests were deleted; the remaining genuine coverage gaps were moved into the relevant handler/module `*.test.ts` files (e.g. `commands/install/handler.test.ts`, `commands/update/handler.test.ts`, `registry/validation.test.ts`).

**Types**: Co-locate types when feature-specific:
```

auth/
├── components/
├── types/
│ ├── user.types.ts
│ └── auth.types.ts
└── services/

```text

**Styles**: Keep styles close to components:
```

Button/
├── Button.tsx
├── Button.module.css
├── Button.test.tsx
└── index.ts

````text

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

```text

features/auth/
├── components/
├── __tests__/
│   └── auth.config.ts     # Auth-specific test config
└── auth.constants.ts      # Auth constants

```

### Asset Organization

```text

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

```text

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

```text

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

```text

src/
├── components/     # All components mixed together
├── services/       # All services mixed together
└── utils/          # All utilities mixed together

```

❌ **Deep nesting**:

```text

src/features/auth/components/forms/login/validation/rules/email/

```

❌ **Mixed concerns**:

```text

UserProfile.tsx     # Component + business logic + API calls

```

❌ **Unclear boundaries**:

```text

// In auth feature importing from user feature
import { UserService } from '../../user/services/UserService';

```

```text

```

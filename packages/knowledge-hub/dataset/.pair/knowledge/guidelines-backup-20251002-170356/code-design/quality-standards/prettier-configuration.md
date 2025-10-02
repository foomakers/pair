# 🎨 Prettier Configuration

**Focus**: Code formatting standards, Prettier setup, and automated code styling

Comprehensive Prettier configuration for consistent code formatting across TypeScript/JavaScript projects, ensuring readable and maintainable code.

## 🎯 Prettier Setup Framework

### Core Configuration

```json
{
  "printWidth": 100,
  "tabWidth": 2,
  "useTabs": false,
  "semi": true,
  "singleQuote": true,
  "quoteProps": "as-needed",
  "jsxSingleQuote": true,
  "trailingComma": "es5",
  "bracketSpacing": true,
  "bracketSameLine": false,
  "arrowParens": "avoid",
  "endOfLine": "lf",
  "embeddedLanguageFormatting": "auto",
  "singleAttributePerLine": false,
  "overrides": [
    {
      "files": "*.md",
      "options": {
        "printWidth": 80,
        "proseWrap": "always"
      }
    },
    {
      "files": "*.json",
      "options": {
        "printWidth": 120,
        "tabWidth": 2
      }
    },
    {
      "files": "*.yml",
      "options": {
        "tabWidth": 2,
        "singleQuote": false
      }
    }
  ]
}
```

### EditorConfig Integration

```ini
# .editorconfig
root = true

[*]
charset = utf-8
end_of_line = lf
indent_style = space
indent_size = 2
insert_final_newline = true
trim_trailing_whitespace = true

[*.md]
trim_trailing_whitespace = false
max_line_length = 80

[*.{json,yml,yaml}]
indent_size = 2

[Makefile]
indent_style = tab
```

## 🛠️ Dependencies and Scripts

```json
{
  "devDependencies": {
    "prettier": "^3.0.0",
    "@trivago/prettier-plugin-sort-imports": "^4.2.0",
    "prettier-plugin-packagejson": "^2.4.0",
    "prettier-plugin-tailwindcss": "^0.5.0"
  },
  "scripts": {
    "format": "prettier --write .",
    "format:check": "prettier --check .",
    "format:staged": "prettier --write $(git diff --cached --name-only --diff-filter=ACMR | grep -E '\\.(js|jsx|ts|tsx|json|md|yml|yaml)$')"
  }
}
```

## 🔧 IDE Configuration

### VS Code Settings

```json
{
  "editor.formatOnSave": true,
  "editor.defaultFormatter": "esbenp.prettier-vscode",
  "editor.codeActionsOnSave": {
    "source.fixAll.eslint": true,
    "source.organizeImports": true
  },
  "[typescript]": {
    "editor.defaultFormatter": "esbenp.prettier-vscode"
  },
  "[typescriptreact]": {
    "editor.defaultFormatter": "esbenp.prettier-vscode"
  },
  "[javascript]": {
    "editor.defaultFormatter": "esbenp.prettier-vscode"
  },
  "[javascriptreact]": {
    "editor.defaultFormatter": "esbenp.prettier-vscode"
  },
  "[json]": {
    "editor.defaultFormatter": "esbenp.prettier-vscode"
  },
  "[markdown]": {
    "editor.defaultFormatter": "esbenp.prettier-vscode",
    "editor.wordWrap": "on"
  }
}
```

### Pre-commit Integration

```bash
#!/bin/sh
# .husky/pre-commit

npm run lint:staged
npm run format:staged
npm run type-check
```

## 📋 Formatting Rules

### TypeScript/JavaScript

```typescript
// ✅ Preferred formatting examples

// Function declarations
const handleSubmit = async (data: FormData): Promise<void> => {
  try {
    await submitForm(data)
  } catch (error) {
    handleError(error)
  }
}

// Object formatting
const config = {
  apiUrl: process.env.API_URL,
  timeout: 5000,
  retries: 3,
}

// Array formatting
const items = ['item1', 'item2', 'item3']

// Import formatting (with plugin)
import { useCallback, useEffect, useState } from 'react'
import { z } from 'zod'

import { Button } from '@/components/ui/button'
import { Form } from '@/components/ui/form'

import { api } from '@/lib/api'
import { cn } from '@/lib/utils'
```

### React/JSX

```tsx
// ✅ Component formatting
const UserProfile: React.FC<UserProfileProps> = ({ user, onUpdate, className }) => {
  return (
    <div className={cn('user-profile', className)}>
      <img src={user.avatar} alt={`${user.name} avatar`} className='h-16 w-16 rounded-full' />
      <div className='user-details'>
        <h3 className='text-lg font-semibold'>{user.name}</h3>
        <p className='text-gray-600'>{user.email}</p>
      </div>
    </div>
  )
}
```

### CSS/Tailwind

```css
/* ✅ CSS formatting */
.component {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 1rem;
  background-color: white;
  border-radius: 0.5rem;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
}

.component:hover {
  background-color: #f9fafb;
}
```

## 🔄 Git Integration

### Pre-commit Hooks

```json
{
  "husky": {
    "hooks": {
      "pre-commit": "lint-staged"
    }
  },
  "lint-staged": {
    "*.{ts,tsx,js,jsx}": ["eslint --fix", "prettier --write"],
    "*.{json,md,yml,yaml}": ["prettier --write"]
  }
}
```

### GitHub Actions

```yaml
name: Code Quality
on: [push, pull_request]

jobs:
  format-check:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: 'npm'

      - run: npm ci
      - run: npm run format:check
      - run: npm run lint:check
```

## 🎯 Best Practices

### Configuration Management

1. **Single Source**: One `.prettierrc.json` per repository root
2. **Consistent Rules**: Same configuration across all projects
3. **Team Agreement**: Discuss and agree on formatting preferences
4. **Documentation**: Document any custom overrides

### Integration Strategy

1. **IDE Setup**: Configure all team IDEs consistently
2. **Pre-commit**: Enforce formatting before commits
3. **CI Validation**: Validate formatting in CI pipeline
4. **Gradual Adoption**: Introduce to existing projects incrementally

### Common Overrides

```json
{
  "overrides": [
    {
      "files": "*.test.{ts,tsx,js,jsx}",
      "options": {
        "printWidth": 120
      }
    },
    {
      "files": "*.config.{ts,js}",
      "options": {
        "singleQuote": false
      }
    },
    {
      "files": "package.json",
      "options": {
        "tabWidth": 2,
        "printWidth": 1000
      }
    }
  ]
}
```

## 🔗 Related Concepts

- **[ESLint Configuration](eslint-configuration.md)** - Code quality rules companion
- **[Code Review](code-review.md)** - Review process integration
- **[Quality Metrics](quality-metrics.md)** - Code quality measurement

## 📏 Implementation Guidelines

1. **Team Consensus**: Agree on formatting rules before implementation
2. **Automated Setup**: Use automated formatting in development workflow
3. **Consistent Application**: Apply same rules across all project files
4. **Regular Updates**: Keep Prettier and plugins updated
5. **Documentation**: Document any project-specific overrides
6. **Training**: Ensure team understands formatting standards
7. **CI Integration**: Include format checks in continuous integration

---

_Prettier Configuration ensures consistent, readable code formatting across all TypeScript/JavaScript projects, reducing cognitive load and improving code maintainability._

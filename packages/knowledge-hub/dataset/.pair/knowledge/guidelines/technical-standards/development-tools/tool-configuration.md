# Tool Configuration

Comprehensive framework for standardizing tool configurations across development environments to ensure consistency, maintainability, and team collaboration effectiveness.

## Purpose

Establish standardized configuration approaches for development tools that enable seamless team collaboration, reduce setup friction, and maintain consistent development experiences across all environments.

## Configuration Management Strategy

### Configuration Hierarchy

```typescript
interface ConfigurationHierarchy {
  global: GlobalConfig // System-wide settings
  organization: OrgConfig // Company/team standards
  project: ProjectConfig // Project-specific settings
  personal: PersonalConfig // Individual preferences
}

// Configuration precedence (highest to lowest)
const precedenceOrder = ['personal', 'project', 'organization', 'global']
```

### Configuration Storage Structure

```text
.config/
├── global/              # Global tool configurations
│   ├── git/
│   ├── shell/
│   └── system/
├── organization/        # Team/company standards
│   ├── eslint/
│   ├── prettier/
│   ├── typescript/
│   └── vscode/
├── project/            # Project-specific configs
│   ├── .vscode/
│   ├── .eslintrc.js
│   ├── prettier.config.js
│   └── tsconfig.json
└── templates/          # Configuration templates
    ├── new-project/
    ├── component/
    └── service/
```

## IDE Configuration Standards

### Cursor/VS Code Configuration

#### Workspace Settings Template

```json
// .vscode/settings.json
{
  "editor.formatOnSave": true,
  "editor.codeActionsOnSave": {
    "source.fixAll.eslint": true,
    "source.organizeImports": true,
    "source.removeUnusedImports": true
  },
  "editor.rulers": [80, 120],
  "editor.tabSize": 2,
  "editor.insertSpaces": true,
  "editor.trimAutoWhitespace": true,
  "files.trimTrailingWhitespace": true,
  "files.insertFinalNewline": true,
  "files.eol": "\n",

  "typescript.preferences.importModuleSpecifier": "relative",
  "typescript.suggest.autoImports": true,
  "typescript.updateImportsOnFileMove.enabled": "always",

  "eslint.workingDirectories": ["./"],
  "eslint.validate": ["javascript", "typescript", "javascriptreact", "typescriptreact"],

  "prettier.requireConfig": true,
  "prettier.configPath": "./prettier.config.js",

  "search.exclude": {
    "**/node_modules": true,
    "**/dist": true,
    "**/build": true,
    "**/.next": true,
    "**/coverage": true
  },

  "files.watcherExclude": {
    "**/node_modules/**": true,
    "**/dist/**": true,
    "**/build/**": true,
    "**/.next/**": true
  }
}
```

#### Extensions Configuration

```json
// .vscode/extensions.json
{
  "recommendations": [
    "bradlc.vscode-tailwindcss",
    "esbenp.prettier-vscode",
    "dbaeumer.vscode-eslint",
    "ms-vscode.vscode-typescript-next",
    "vitest.explorer",
    "ms-playwright.playwright",
    "bradlc.vscode-tailwindcss",
    "unifiedjs.vscode-mdx",
    "ms-vscode.vscode-json"
  ],
  "unwantedRecommendations": ["ms-vscode.vscode-typescript", "hookyqr.beautify"]
}
```

#### Launch Configuration

```json
// .vscode/launch.json
{
  "version": "0.2.0",
  "configurations": [
    {
      "name": "Debug Next.js",
      "type": "node",
      "request": "launch",
      "program": "${workspaceFolder}/node_modules/.bin/next",
      "args": ["dev"],
      "env": {
        "NODE_OPTIONS": "--inspect"
      },
      "console": "integratedTerminal",
      "serverReadyAction": {
        "pattern": "ready - started server on .+, url: (https?://.+)",
        "uriFormat": "%s",
        "action": "debugWithChrome"
      }
    },
    {
      "name": "Debug Vitest",
      "type": "node",
      "request": "launch",
      "program": "${workspaceFolder}/node_modules/.bin/vitest",
      "args": ["run", "--reporter=verbose"],
      "console": "integratedTerminal",
      "env": {
        "NODE_ENV": "test"
      }
    }
  ]
}
```

### Tasks Configuration

```json
// .vscode/tasks.json
{
  "version": "2.0.0",
  "tasks": [
    {
      "label": "dev",
      "type": "shell",
      "command": "pnpm",
      "args": ["dev"],
      "group": {
        "kind": "build",
        "isDefault": true
      },
      "presentation": {
        "echo": true,
        "reveal": "always",
        "focus": false,
        "panel": "shared"
      },
      "isBackground": true,
      "problemMatcher": ["$tsc-watch"]
    },
    {
      "label": "build",
      "type": "shell",
      "command": "pnpm",
      "args": ["build"],
      "group": "build",
      "presentation": {
        "echo": true,
        "reveal": "always",
        "focus": false,
        "panel": "shared"
      },
      "problemMatcher": ["$tsc"]
    },
    {
      "label": "test",
      "type": "shell",
      "command": "pnpm",
      "args": ["test"],
      "group": "test",
      "presentation": {
        "echo": true,
        "reveal": "always",
        "focus": false,
        "panel": "shared"
      }
    }
  ]
}
```

## Code Quality Tool Configuration

### ESLint Configuration

```javascript
// eslint.config.js
import { defineConfig } from 'eslint-define-config'

export default defineConfig([
  {
    ignores: ['dist/**', 'build/**', '.next/**', 'node_modules/**'],
  },
  {
    files: ['**/*.{js,jsx,ts,tsx}'],
    languageOptions: {
      ecmaVersion: 2023,
      sourceType: 'module',
      parser: '@typescript-eslint/parser',
      parserOptions: {
        ecmaFeatures: { jsx: true },
        project: './tsconfig.json',
      },
    },
    plugins: {
      '@typescript-eslint': require('@typescript-eslint/eslint-plugin'),
      react: require('eslint-plugin-react'),
      'react-hooks': require('eslint-plugin-react-hooks'),
      import: require('eslint-plugin-import'),
    },
    rules: {
      // TypeScript specific rules
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
      '@typescript-eslint/explicit-function-return-type': 'warn',
      '@typescript-eslint/no-explicit-any': 'warn',
      '@typescript-eslint/prefer-nullish-coalescing': 'error',
      '@typescript-eslint/prefer-optional-chain': 'error',

      // React specific rules
      'react/react-in-jsx-scope': 'off',
      'react/prop-types': 'off',
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'warn',

      // Import rules
      'import/order': [
        'error',
        {
          groups: ['builtin', 'external', 'internal', 'parent', 'sibling', 'index'],
          'newlines-between': 'always',
          alphabetize: { order: 'asc', caseInsensitive: true },
        },
      ],

      // General rules
      'prefer-const': 'error',
      'no-var': 'error',
      'no-console': 'warn',
      eqeqeq: 'error',
    },
    settings: {
      react: { version: 'detect' },
      'import/resolver': {
        typescript: { project: './tsconfig.json' },
      },
    },
  },
])
```

### Prettier Configuration

```javascript
// prettier.config.js
/** @type {import('prettier').Config} */
module.exports = {
  // Basic formatting
  semi: true,
  trailingComma: 'es5',
  singleQuote: true,
  printWidth: 80,
  tabWidth: 2,
  useTabs: false,

  // JSX specific
  jsxSingleQuote: true,
  bracketSameLine: false,

  // Other languages
  overrides: [
    {
      files: '*.md',
      options: {
        printWidth: 120,
        proseWrap: 'always',
      },
    },
    {
      files: '*.json',
      options: {
        printWidth: 120,
      },
    },
  ],
}
```

### TypeScript Configuration

```json
// tsconfig.json
{
  "compilerOptions": {
    "target": "ES2022",
    "lib": ["dom", "dom.iterable", "es6"],
    "allowJs": true,
    "skipLibCheck": true,
    "strict": true,
    "forceConsistentCasingInFileNames": true,
    "noEmit": true,
    "esModuleInterop": true,
    "module": "esnext",
    "moduleResolution": "bundler",
    "resolveJsonModule": true,
    "isolatedModules": true,
    "jsx": "preserve",
    "incremental": true,

    // Path mapping
    "baseUrl": ".",
    "paths": {
      "@/*": ["./src/*"],
      "@/components/*": ["./src/components/*"],
      "@/utils/*": ["./src/utils/*"],
      "@/types/*": ["./src/types/*"]
    },

    // Additional checks
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "exactOptionalPropertyTypes": true,
    "noImplicitReturns": true,
    "noFallthroughCasesInSwitch": true,
    "noUncheckedIndexedAccess": true
  },
  "include": ["next-env.d.ts", "**/*.ts", "**/*.tsx", ".next/types/**/*.ts"],
  "exclude": ["node_modules", "dist", "build", ".next"]
}
```

## Git Configuration Standards

### Global Git Configuration

```bash
#!/bin/bash
# scripts/setup-git-config.sh

# User information
git config --global user.name "Your Name"
git config --global user.email "your.email@company.com"

# Core settings
git config --global init.defaultBranch main
git config --global core.editor "cursor --wait"
git config --global core.autocrlf input
git config --global core.safecrlf warn

# Pull and push behavior
git config --global pull.rebase true
git config --global push.autoSetupRemote true
git config --global push.default simple

# Merge and diff tools
git config --global merge.tool "cursor"
git config --global diff.tool "cursor"

# Aliases
git config --global alias.co checkout
git config --global alias.br branch
git config --global alias.ci commit
git config --global alias.st status
git config --global alias.unstage "reset HEAD --"
git config --global alias.last "log -1 HEAD"
git config --global alias.visual "!gitk"

# Advanced settings
git config --global commit.gpgsign true
git config --global rerere.enabled true
git config --global rebase.autoStash true
```

### Project Git Configuration

```gitignore
# .gitignore template
# Dependencies
node_modules/
npm-debug.log*
yarn-debug.log*
yarn-error.log*
pnpm-debug.log*

# Build outputs
dist/
build/
.next/
out/

# Environment files
.env
.env.local
.env.development.local
.env.test.local
.env.production.local

# IDE and editor files
.vscode/settings.json
.idea/
*.swp
*.swo
*~

# OS generated files
.DS_Store
.DS_Store?
._*
.Spotlight-V100
.Trashes
ehthumbs.db
Thumbs.db

# Testing
coverage/
.nyc_output/
test-results/

# Logs
logs/
*.log

# Runtime data
pids/
*.pid
*.seed
*.pid.lock

# Optional npm cache directory
.npm/

# Optional eslint cache
.eslintcache

# Temporary folders
tmp/
temp/
```

## Package Manager Configuration

### pnpm Configuration

```yaml
# .npmrc
# Registry configuration
registry=https://registry.npmjs.org/

# Package installation
save-exact=true
fund=false
audit-level=moderate

# pnpm specific
auto-install-peers=true
dedupe-peer-dependents=true
strict-peer-dependencies=false

# Cache and storage
store-dir=~/.pnpm-store
cache-dir=~/.pnpm-cache

# Publishing
publish-branch=main
git-tag-version=true
```

### Package.json Scripts Template

```json
{
  "scripts": {
    "dev": "next dev",
    "build": "next build",
    "start": "next start",
    "lint": "eslint . --ext .ts,.tsx,.js,.jsx",
    "lint:fix": "eslint . --ext .ts,.tsx,.js,.jsx --fix",
    "type-check": "tsc --noEmit",
    "test": "vitest",
    "test:watch": "vitest --watch",
    "test:ui": "vitest --ui",
    "test:coverage": "vitest --coverage",
    "format": "prettier --write .",
    "format:check": "prettier --check .",
    "clean": "rm -rf .next dist build",
    "reset": "rm -rf node_modules && pnpm install",
    "prepare": "husky install"
  }
}
```

## Configuration Management Automation

### Configuration Sync Script

```typescript
// scripts/sync-config.ts
interface ConfigSync {
  source: string
  target: string
  type: 'copy' | 'merge' | 'template'
}

class ConfigurationManager {
  private configs: ConfigSync[] = [
    { source: 'templates/.vscode', target: '.vscode', type: 'merge' },
    { source: 'templates/eslint.config.js', target: 'eslint.config.js', type: 'copy' },
    { source: 'templates/prettier.config.js', target: 'prettier.config.js', type: 'copy' },
    { source: 'templates/tsconfig.json', target: 'tsconfig.json', type: 'merge' },
  ]

  async syncConfigurations(): Promise<void> {
    for (const config of this.configs) {
      await this.syncConfig(config)
    }
  }

  private async syncConfig(config: ConfigSync): Promise<void> {
    switch (config.type) {
      case 'copy':
        await this.copyConfig(config.source, config.target)
        break
      case 'merge':
        await this.mergeConfig(config.source, config.target)
        break
      case 'template':
        await this.applyTemplate(config.source, config.target)
        break
    }
  }

  private async mergeConfig(source: string, target: string): Promise<void> {
    // Implementation for merging JSON configurations
    const sourceConfig = await this.readJsonConfig(source)
    const targetConfig = await this.readJsonConfig(target)
    const merged = this.deepMerge(sourceConfig, targetConfig)
    await this.writeJsonConfig(target, merged)
  }
}
```

### Configuration Validation

```typescript
// scripts/validate-config.ts
interface ValidationRule {
  path: string
  required: boolean
  validator: (content: any) => boolean
  message: string
}

class ConfigValidator {
  private rules: ValidationRule[] = [
    {
      path: '.vscode/settings.json',
      required: true,
      validator: config => config['editor.formatOnSave'] === true,
      message: 'Format on save must be enabled',
    },
    {
      path: 'eslint.config.js',
      required: true,
      validator: config => config.rules['@typescript-eslint/no-unused-vars'] !== undefined,
      message: 'TypeScript unused vars rule must be configured',
    },
  ]

  async validateProject(): Promise<ValidationResult> {
    const results = await Promise.all(this.rules.map(rule => this.validateRule(rule)))

    return {
      valid: results.every(r => r.valid),
      results,
    }
  }
}
```

This comprehensive configuration framework ensures consistent, maintainable tool setups across all development environments.

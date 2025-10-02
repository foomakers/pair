# ⚙️ ESLint Configuration

**Focus**: ESLint setup, rules, and configuration for consistent code quality

Comprehensive ESLint configuration ensuring code quality, consistency, and adherence to project standards across TypeScript/JavaScript codebases.

## 🎯 ESLint Setup Framework

### Core Configuration

```javascript
// ✅ Complete ESLint configuration
module.exports = {
  root: true,
  parser: '@typescript-eslint/parser',
  parserOptions: {
    ecmaVersion: 2022,
    sourceType: 'module',
    project: './tsconfig.json',
    ecmaFeatures: {
      jsx: true,
    },
  },
  env: {
    browser: true,
    node: true,
    es2022: true,
    jest: true,
  },
  extends: [
    'eslint:recommended',
    '@typescript-eslint/recommended',
    '@typescript-eslint/recommended-requiring-type-checking',
    'plugin:react/recommended',
    'plugin:react-hooks/recommended',
    'plugin:jsx-a11y/recommended',
    'plugin:import/recommended',
    'plugin:import/typescript',
    'prettier',
  ],
  plugins: ['@typescript-eslint', 'react', 'react-hooks', 'jsx-a11y', 'import', 'unused-imports'],
  rules: {
    // TypeScript specific rules
    '@typescript-eslint/no-unused-vars': 'error',
    '@typescript-eslint/no-explicit-any': 'warn',
    '@typescript-eslint/explicit-function-return-type': 'off',
    '@typescript-eslint/explicit-module-boundary-types': 'off',
    '@typescript-eslint/no-non-null-assertion': 'warn',
    '@typescript-eslint/prefer-const': 'error',
    '@typescript-eslint/no-var-requires': 'error',

    // Import/Export rules
    'import/order': [
      'error',
      {
        groups: ['builtin', 'external', 'internal', 'parent', 'sibling', 'index'],
        'newlines-between': 'always',
        alphabetize: { order: 'asc', caseInsensitive: true },
      },
    ],
    'import/no-duplicates': 'error',
    'import/no-unresolved': 'error',
    'unused-imports/no-unused-imports': 'error',

    // React specific rules
    'react/react-in-jsx-scope': 'off',
    'react/prop-types': 'off',
    'react-hooks/rules-of-hooks': 'error',
    'react-hooks/exhaustive-deps': 'warn',

    // General code quality
    'no-console': ['warn', { allow: ['warn', 'error'] }],
    'no-debugger': 'error',
    'prefer-const': 'error',
    'no-var': 'error',
  },
  settings: {
    react: {
      version: 'detect',
    },
    'import/resolver': {
      typescript: {
        alwaysTryTypes: true,
        project: './tsconfig.json',
      },
    },
  },
  overrides: [
    {
      files: ['**/*.test.ts', '**/*.test.tsx', '**/*.spec.ts', '**/*.spec.tsx'],
      env: {
        jest: true,
      },
      rules: {
        '@typescript-eslint/no-explicit-any': 'off',
        '@typescript-eslint/no-non-null-assertion': 'off',
      },
    },
    {
      files: ['**/*.config.js', '**/*.config.ts'],
      rules: {
        '@typescript-eslint/no-var-requires': 'off',
      },
    },
  ],
}
```

## 📦 Dependencies

```json
{
  "devDependencies": {
    "eslint": "^8.50.0",
    "@typescript-eslint/parser": "^6.7.0",
    "@typescript-eslint/eslint-plugin": "^6.7.0",
    "eslint-plugin-react": "^7.33.0",
    "eslint-plugin-react-hooks": "^4.6.0",
    "eslint-plugin-jsx-a11y": "^6.7.0",
    "eslint-plugin-import": "^2.28.0",
    "eslint-plugin-unused-imports": "^3.0.0",
    "eslint-import-resolver-typescript": "^3.6.0",
    "eslint-config-prettier": "^9.0.0"
  }
}
```

## 🛠️ Scripts

```json
{
  "scripts": {
    "lint": "eslint . --ext .ts,.tsx,.js,.jsx",
    "lint:fix": "eslint . --ext .ts,.tsx,.js,.jsx --fix",
    "lint:check": "eslint . --ext .ts,.tsx,.js,.jsx --max-warnings 0"
  }
}
```

## 🔗 Related Concepts

- **[Prettier Configuration](prettier-configuration.md)** - Code formatting companion
- **[Quality Metrics](quality-metrics.md)** - Code quality measurement
- **[Code Review](code-review.md)** - Review process integration

## 📏 Implementation Guidelines

1. **Consistent Setup**: Use same configuration across all projects
2. **Gradual Adoption**: Introduce rules progressively for existing codebases
3. **Team Agreement**: Ensure team consensus on rule severity
4. **IDE Integration**: Configure IDE for real-time feedback
5. **CI Integration**: Include lint checks in continuous integration
6. **Regular Updates**: Keep ESLint and plugins updated
7. **Rule Documentation**: Document custom rules and exceptions

---

_ESLint Configuration ensures consistent code quality and style across TypeScript/JavaScript projects._

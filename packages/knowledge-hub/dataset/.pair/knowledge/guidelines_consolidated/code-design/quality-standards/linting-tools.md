# Linting Tools

## Overview

Linting tools analyze code for potential errors, style issues, and maintainability problems. This guide covers modern linting strategies, tool selection criteria, and integration patterns for maintaining consistent code quality.

## Linting Philosophy

### Code Quality Strategy

Linting serves multiple quality objectives:

**Error Prevention**: Catch potential bugs before runtime
**Style Consistency**: Enforce uniform coding patterns across team
**Best Practice Enforcement**: Guide developers toward proven patterns
**Maintainability**: Identify code smells and complex constructs

### Progressive Enhancement Approach

Implement linting in stages for gradual adoption:

**Basic Setup**: Start with essential error-catching rules
**Style Integration**: Add formatting and consistency rules
**Advanced Analysis**: Include complexity and architectural rules
**Custom Rules**: Develop project-specific linting requirements

## Tool Selection Matrix

### Primary Linting Tools

**ESLint**: JavaScript/TypeScript ecosystem standard

```json
// .eslintrc.json - Modern ESLint configuration
{
  "extends": [
    "eslint:recommended",
    "@typescript-eslint/recommended",
    "@typescript-eslint/recommended-requiring-type-checking"
  ],
  "parser": "@typescript-eslint/parser",
  "parserOptions": {
    "ecmaVersion": 2023,
    "sourceType": "module",
    "project": "./tsconfig.json"
  },
  "plugins": ["@typescript-eslint", "import", "unused-imports", "prefer-arrow"],
  "rules": {
    // Error prevention
    "@typescript-eslint/no-unused-vars": "error",
    "@typescript-eslint/no-explicit-any": "warn",
    "@typescript-eslint/prefer-nullish-coalescing": "error",

    // Code quality
    "complexity": ["warn", 10],
    "max-depth": ["warn", 4],
    "max-lines-per-function": ["warn", 50],

    // Import organization
    "import/order": [
      "error",
      {
        "groups": ["builtin", "external", "internal"],
        "newlines-between": "always"
      }
    ],
    "unused-imports/no-unused-imports": "error"
  }
}
```

**Benefits**: Comprehensive ecosystem, TypeScript integration, extensive plugin support
**Use Cases**: JavaScript/TypeScript projects, React applications, Node.js services

**Biome**: Modern alternative focusing on performance

```json
// biome.json - High-performance linting and formatting
{
  "linter": {
    "enabled": true,
    "rules": {
      "recommended": true,
      "complexity": {
        "noExcessiveCognitiveComplexity": "error",
        "noMultipleSpacesInRegularExpressionLiterals": "error"
      },
      "correctness": {
        "noUndeclaredVariables": "error",
        "noUnusedVariables": "error"
      },
      "style": {
        "noNegationElse": "warn",
        "useConst": "error"
      },
      "suspicious": {
        "noDoubleEquals": "error",
        "noGlobalAssign": "error"
      }
    }
  },
  "formatter": {
    "enabled": true,
    "indentStyle": "space",
    "indentWidth": 2,
    "lineWidth": 100
  }
}
```

**Benefits**: Fast performance, unified linting and formatting, minimal configuration
**Use Cases**: Performance-critical environments, new projects, TypeScript focus

### Language-Specific Tools

**Rust**: Clippy for comprehensive analysis

```toml
# Cargo.toml - Clippy configuration
[lints.clippy]
all = { level = "warn", priority = -1 }
pedantic = { level = "warn", priority = -1 }
nursery = { level = "warn", priority = -1 }
cargo = { level = "warn", priority = -1 }

# Specific rule adjustments
missing_docs_in_private_items = "allow"
module_name_repetitions = "allow"
```

**Python**: Ruff for modern Python linting

```toml
# pyproject.toml - Ruff configuration
[tool.ruff]
target-version = "py311"
line-length = 100
select = [
    "E",   # pycodestyle errors
    "W",   # pycodestyle warnings
    "F",   # Pyflakes
    "UP",  # pyupgrade
    "B",   # flake8-bugbear
    "SIM", # flake8-simplify
    "I",   # isort
]
ignore = [
    "E501",  # line too long (handled by formatter)
    "B008",  # do not perform function calls in argument defaults
]

[tool.ruff.per-file-ignores]
"__init__.py" = ["F401"]
"tests/**/*.py" = ["S101", "D"]
```

**Go**: Golangci-lint for comprehensive Go analysis

```yaml
# .golangci.yml - Go linting configuration
run:
  timeout: 5m
  issues-exit-code: 1

linters-settings:
  cyclop:
    max-complexity: 10
  gocognit:
    min-complexity: 10
  gocyclo:
    min-complexity: 10
  revive:
    rules:
      - name: exported
        arguments: [checkPrivateReceivers, sayRepetitiveInsteadOfStutters]

linters:
  enable:
    - cyclop
    - gocognit
    - gocyclo
    - revive
    - gosimple
    - govet
    - ineffassign
    - staticcheck
    - unused
  disable:
    - errcheck # Handled by other tools
```

## Multi-Language Integration

### Unified Linting Strategy

Create consistent linting experience across languages:

```javascript
// scripts/lint-all.js - Cross-language linting orchestration
const { execSync } = require('child_process')
const fs = require('fs')
const path = require('path')

class UnifiedLinter {
  constructor() {
    this.linters = new Map([
      ['typescript', { command: 'eslint', extensions: ['.ts', '.tsx', '.js', '.jsx'] }],
      ['rust', { command: 'cargo clippy', extensions: ['.rs'] }],
      ['python', { command: 'ruff check', extensions: ['.py'] }],
      ['go', { command: 'golangci-lint run', extensions: ['.go'] }],
    ])

    this.results = {
      passed: [],
      failed: [],
      warnings: [],
    }
  }

  detectProjectLanguages() {
    const languages = []

    // TypeScript/JavaScript detection
    if (fs.existsSync('package.json') || fs.existsSync('tsconfig.json')) {
      languages.push('typescript')
    }

    // Rust detection
    if (fs.existsSync('Cargo.toml')) {
      languages.push('rust')
    }

    // Python detection
    if (fs.existsSync('pyproject.toml') || fs.existsSync('requirements.txt')) {
      languages.push('python')
    }

    // Go detection
    if (fs.existsSync('go.mod')) {
      languages.push('go')
    }

    return languages
  }

  async lintLanguage(language) {
    const linter = this.linters.get(language)
    if (!linter) {
      console.warn(`No linter configured for ${language}`)
      return
    }

    console.log(`🔍 Linting ${language} files...`)

    try {
      const output = execSync(linter.command, {
        encoding: 'utf8',
        stdio: 'pipe',
      })

      this.results.passed.push({
        language,
        message: `${language} linting passed`,
      })

      if (output.trim()) {
        console.log(`📋 ${language} linting output:`)
        console.log(output)
      }
    } catch (error) {
      const hasWarnings = error.status === 1 // Many linters use exit code 1 for warnings
      const hasErrors = error.status > 1

      if (hasWarnings && !hasErrors) {
        this.results.warnings.push({
          language,
          message: `${language} linting warnings`,
          output: error.stdout || error.stderr,
        })
      } else {
        this.results.failed.push({
          language,
          message: `${language} linting failed`,
          output: error.stdout || error.stderr,
        })
      }
    }
  }

  async lintAll() {
    const languages = this.detectProjectLanguages()

    if (languages.length === 0) {
      console.log('No supported languages detected')
      return
    }

    console.log(`🚀 Running linters for: ${languages.join(', ')}`)

    for (const language of languages) {
      await this.lintLanguage(language)
    }

    this.generateReport()
  }

  generateReport() {
    console.log('\n📊 Linting Report')
    console.log('==================')

    if (this.results.passed.length > 0) {
      console.log('\n✅ Passed:')
      this.results.passed.forEach(result => {
        console.log(`  ${result.message}`)
      })
    }

    if (this.results.warnings.length > 0) {
      console.log('\n⚠️ Warnings:')
      this.results.warnings.forEach(result => {
        console.log(`  ${result.message}`)
        if (result.output) {
          console.log(`    Output: ${result.output.substring(0, 200)}...`)
        }
      })
    }

    if (this.results.failed.length > 0) {
      console.log('\n❌ Failed:')
      this.results.failed.forEach(result => {
        console.log(`  ${result.message}`)
        if (result.output) {
          console.log(`    Output: ${result.output.substring(0, 200)}...`)
        }
      })

      process.exit(1)
    }

    console.log('\n🎉 All linting checks completed successfully!')
  }
}

// Execute if run directly
if (require.main === module) {
  const linter = new UnifiedLinter()
  linter.lintAll().catch(console.error)
}

module.exports = UnifiedLinter
```

### IDE Integration

Configure consistent IDE linting across languages:

```json
// .vscode/settings.json - Multi-language linting setup
{
  "eslint.enable": true,
  "eslint.workingDirectories": ["packages/*", "apps/*"],
  "eslint.format.enable": true,
  "eslint.codeActionsOnSave.mode": "problems",

  "rust-analyzer.checkOnSave.command": "clippy",
  "rust-analyzer.checkOnSave.extraArgs": ["--all-targets"],

  "python.linting.enabled": true,
  "python.linting.ruffEnabled": true,
  "python.linting.pylintEnabled": false,

  "go.lintTool": "golangci-lint",
  "go.lintOnSave": "package",

  "editor.codeActionsOnSave": {
    "source.fixAll.eslint": true,
    "source.fixAll.ruff": true,
    "source.organizeImports": true
  },

  "[typescript]": {
    "editor.defaultFormatter": "esbenp.prettier-vscode"
  },
  "[rust]": {
    "editor.defaultFormatter": "rust-lang.rust-analyzer"
  },
  "[python]": {
    "editor.defaultFormatter": "charliermarsh.ruff"
  },
  "[go]": {
    "editor.defaultFormatter": "golang.go"
  }
}
```

## Custom Rule Development

### ESLint Custom Rules

Create project-specific linting rules:

```javascript
// eslint-rules/prefer-explicit-return-type.js
module.exports = {
  meta: {
    type: 'suggestion',
    docs: {
      description: 'Enforce explicit return types for exported functions',
      recommended: false,
    },
    schema: [],
  },

  create(context) {
    return {
      FunctionDeclaration(node) {
        // Check if function is exported
        const parent = node.parent
        const isExported = parent && parent.type === 'ExportNamedDeclaration'

        if (isExported && !node.returnType) {
          context.report({
            node,
            message: 'Exported functions must have explicit return types',
          })
        }
      },

      ArrowFunctionExpression(node) {
        // Check if arrow function is exported
        const grandParent = node.parent?.parent
        const isExported = grandParent && grandParent.type === 'ExportNamedDeclaration'

        if (isExported && !node.returnType) {
          context.report({
            node,
            message: 'Exported arrow functions must have explicit return types',
          })
        }
      },
    }
  },
}

// Usage in .eslintrc.js
module.exports = {
  extends: ['@typescript-eslint/recommended'],
  plugins: ['local'],
  rules: {
    'local/prefer-explicit-return-type': 'error',
  },
}
```

### Advanced Rule Configuration

Configure complex linting scenarios:

```javascript
// .eslintrc.js - Advanced configuration patterns
module.exports = {
  overrides: [
    // Strict rules for core business logic
    {
      files: ['src/domain/**/*.ts', 'src/application/**/*.ts'],
      rules: {
        '@typescript-eslint/explicit-function-return-type': 'error',
        '@typescript-eslint/no-explicit-any': 'error',
        complexity: ['error', 8],
        'max-lines-per-function': ['error', 30],
      },
    },

    // Relaxed rules for tests
    {
      files: ['**/*.test.ts', '**/*.spec.ts'],
      rules: {
        '@typescript-eslint/no-explicit-any': 'off',
        '@typescript-eslint/no-non-null-assertion': 'off',
        'max-lines-per-function': 'off',
      },
    },

    // Configuration files
    {
      files: ['*.config.js', '*.config.ts'],
      rules: {
        '@typescript-eslint/no-var-requires': 'off',
        'import/no-default-export': 'off',
      },
    },

    // React-specific rules
    {
      files: ['src/components/**/*.tsx', 'src/pages/**/*.tsx'],
      extends: ['plugin:react/recommended', 'plugin:react-hooks/recommended'],
      rules: {
        'react/prop-types': 'off', // Using TypeScript
        'react-hooks/exhaustive-deps': 'error',
        'react/jsx-key': 'error',
      },
    },
  ],

  // Environment-specific configurations
  env: {
    browser: true,
    node: true,
    es2023: true,
    jest: true,
  },

  // Parser options for TypeScript
  parserOptions: {
    ecmaVersion: 2023,
    sourceType: 'module',
    ecmaFeatures: {
      jsx: true,
    },
    project: ['./tsconfig.json', './packages/*/tsconfig.json'],
  },
}
```

## Performance Optimization

### Linting Performance Strategies

Optimize linting for large codebases:

```javascript
// scripts/parallel-lint.js - Parallel linting execution
const { Worker, isMainThread, parentPort, workerData } = require('worker_threads')
const { execSync } = require('child_process')
const path = require('path')
const fs = require('fs')

class ParallelLinter {
  constructor() {
    this.maxWorkers = require('os').cpus().length
    this.workers = []
    this.results = []
  }

  async lintInParallel(fileBatches) {
    return new Promise((resolve, reject) => {
      let completedWorkers = 0
      const allResults = []

      for (let i = 0; i < fileBatches.length; i++) {
        const worker = new Worker(__filename, {
          workerData: { batch: fileBatches[i], workerId: i },
        })

        worker.on('message', result => {
          allResults.push(result)
          completedWorkers++

          if (completedWorkers === fileBatches.length) {
            resolve(allResults)
          }
        })

        worker.on('error', reject)
      }
    })
  }

  splitFilesIntoBatches(files) {
    const batchSize = Math.ceil(files.length / this.maxWorkers)
    const batches = []

    for (let i = 0; i < files.length; i += batchSize) {
      batches.push(files.slice(i, i + batchSize))
    }

    return batches
  }

  async run() {
    // Get list of TypeScript files
    const files = this.getTypeScriptFiles()
    const batches = this.splitFilesIntoBatches(files)

    console.log(`🚀 Linting ${files.length} files across ${batches.length} workers`)

    const results = await this.lintInParallel(batches)
    this.consolidateResults(results)
  }

  getTypeScriptFiles() {
    const files = []
    const walkDir = dir => {
      const entries = fs.readdirSync(dir, { withFileTypes: true })

      for (const entry of entries) {
        const fullPath = path.join(dir, entry.name)

        if (entry.isDirectory() && !entry.name.startsWith('.') && entry.name !== 'node_modules') {
          walkDir(fullPath)
        } else if (entry.isFile() && /\.(ts|tsx)$/.test(entry.name)) {
          files.push(fullPath)
        }
      }
    }

    walkDir('./src')
    return files
  }

  consolidateResults(results) {
    const allErrors = results.flatMap(r => r.errors)
    const allWarnings = results.flatMap(r => r.warnings)

    console.log(`\n📊 Linting Results:`)
    console.log(`   Errors: ${allErrors.length}`)
    console.log(`   Warnings: ${allWarnings.length}`)

    if (allErrors.length > 0) {
      console.log('\n❌ Errors:')
      allErrors.forEach(error => console.log(`   ${error}`))
      process.exit(1)
    }

    if (allWarnings.length > 0) {
      console.log('\n⚠️ Warnings:')
      allWarnings.forEach(warning => console.log(`   ${warning}`))
    }

    console.log('\n✅ Linting completed successfully!')
  }
}

// Worker thread execution
if (!isMainThread) {
  const { batch, workerId } = workerData

  try {
    const filesArg = batch.join(' ')
    const output = execSync(`npx eslint ${filesArg} --format json`, {
      encoding: 'utf8',
      stdio: 'pipe',
    })

    const results = JSON.parse(output)
    const errors = results.flatMap(r => r.messages.filter(m => m.severity === 2))
    const warnings = results.flatMap(r => r.messages.filter(m => m.severity === 1))

    parentPort.postMessage({
      workerId,
      errors: errors.map(e => `${e.ruleId}: ${e.message} (${e.line}:${e.column})`),
      warnings: warnings.map(w => `${w.ruleId}: ${w.message} (${w.line}:${w.column})`),
    })
  } catch (error) {
    parentPort.postMessage({
      workerId,
      errors: [error.message],
      warnings: [],
    })
  }
}

// Execute if run directly
if (require.main === module && isMainThread) {
  const linter = new ParallelLinter()
  linter.run().catch(console.error)
}
```

### Incremental Linting

Implement change-based linting for faster feedback:

```bash
#!/bin/bash
# scripts/incremental-lint.sh

echo "🔄 Running incremental linting..."

# Get changed files
CHANGED_FILES=$(git diff --name-only --cached --diff-filter=ACMR | grep -E '\.(ts|tsx|js|jsx)$' || true)

if [ -z "$CHANGED_FILES" ]; then
  echo "📭 No JavaScript/TypeScript files changed"
  exit 0
fi

echo "📁 Changed files:"
echo "$CHANGED_FILES" | sed 's/^/  /'

# Run ESLint only on changed files
echo "🔍 Linting changed files..."
echo "$CHANGED_FILES" | xargs npx eslint --fix

# Check for remaining issues
if echo "$CHANGED_FILES" | xargs npx eslint --quiet; then
  echo "✅ All changed files pass linting"
else
  echo "❌ Linting issues found in changed files"
  exit 1
fi
```

## Best Practices Summary

### Tool Selection Strategy

- **Language Ecosystem**: Choose tools native to your primary language ecosystem
- **Performance Needs**: Consider tool performance for large codebases
- **Team Familiarity**: Balance power with team learning curve
- **Integration Requirements**: Ensure tools integrate well with existing workflow

### Configuration Management

- **Gradual Adoption**: Implement rules progressively to avoid overwhelming teams
- **Context-Specific Rules**: Use different rule sets for different code areas
- **Regular Review**: Periodically assess and update linting configurations
- **Documentation**: Maintain clear documentation of rule choices and rationales

### Workflow Integration

- **Early Feedback**: Integrate linting into editor and pre-commit hooks
- **CI/CD Integration**: Include linting in automated build processes
- **Performance Optimization**: Use parallel processing and incremental linting for speed
- **Error Handling**: Distinguish between blocking errors and informational warnings

### Team Adoption

- **Training**: Provide team training on tool usage and configuration
- **Consistent Setup**: Use shared configurations to ensure consistency
- **Feedback Loop**: Create mechanisms for team feedback on linting rules
- **Continuous Improvement**: Regularly refine rules based on team experience

Effective linting tools create a foundation for code quality that scales with team size and project complexity, providing automated guidance that frees developers to focus on business logic and architecture.

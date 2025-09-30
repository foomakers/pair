# 🛠️ Editor Setup

**Focus**: VS Code configuration, extensions, and development environment optimization

VS Code setup and configuration standards for consistent development experience across team members, with essential extensions and workspace settings.

## 📝 VS Code Configuration

### Essential Extensions

```json
{
  "recommendations": [
    // Language Support
    "bradlc.vscode-tailwindcss",
    "esbenp.prettier-vscode",
    "dbaeumer.vscode-eslint",
    "ms-vscode.vscode-typescript-next",

    // Framework Support
    "Prisma.prisma",
    "GraphQL.vscode-graphql",
    "ms-vscode.vscode-json",

    // Development Experience
    "GitHub.copilot",
    "GitHub.copilot-chat",
    "ms-vscode.vscode-docker",
    "ms-azuretools.vscode-docker",

    // Testing
    "hbenl.vscode-test-explorer",
    "ZixuanChen.vitest-explorer",

    // Git & Version Control
    "mhutchie.git-graph",
    "eamodio.gitlens",

    // Code Quality
    "streetsidesoftware.code-spell-checker",
    "usernamehw.errorlens",
    "redhat.vscode-yaml"
  ]
}
```

### Workspace Settings

```json
{
  // Editor Behavior
  "editor.formatOnSave": true,
  "editor.formatOnPaste": true,
  "editor.codeActionsOnSave": {
    "source.fixAll.eslint": true,
    "source.organizeImports": true
  },
  "editor.rulers": [80, 120],
  "editor.tabSize": 2,
  "editor.insertSpaces": true,
  "editor.trimAutoWhitespace": true,

  // File Handling
  "files.trimTrailingWhitespace": true,
  "files.insertFinalNewline": true,
  "files.trimFinalNewlines": true,
  "files.exclude": {
    "**/node_modules": true,
    "**/dist": true,
    "**/.next": true,
    "**/coverage": true,
    "**/.turbo": true
  },

  // TypeScript
  "typescript.preferences.importModuleSpecifier": "relative",
  "typescript.suggest.autoImports": true,
  "typescript.updateImportsOnFileMove.enabled": "always",

  // Prettier
  "prettier.configPath": ".prettierrc",
  "prettier.requireConfig": true,

  // ESLint
  "eslint.workingDirectories": ["apps/*", "packages/*"],
  "eslint.validate": ["javascript", "javascriptreact", "typescript", "typescriptreact"],

  // Git
  "git.autofetch": true,
  "git.enableSmartCommit": true,
  "git.confirmSync": false,

  // Search
  "search.exclude": {
    "**/node_modules": true,
    "**/dist": true,
    "**/.next": true,
    "**/coverage": true,
    "**/.turbo": true,
    "**/package-lock.json": true,
    "**/yarn.lock": true,
    "**/pnpm-lock.yaml": true
  }
}
```

## 🎨 Code Formatting Standards

### Prettier Configuration

```json
{
  "printWidth": 80,
  "tabWidth": 2,
  "useTabs": false,
  "semi": true,
  "singleQuote": true,
  "quoteProps": "as-needed",
  "trailingComma": "es5",
  "bracketSpacing": true,
  "bracketSameLine": false,
  "arrowParens": "always",
  "endOfLine": "lf",
  "overrides": [
    {
      "files": ["*.json", "*.md"],
      "options": {
        "tabWidth": 2
      }
    },
    {
      "files": ["*.yml", "*.yaml"],
      "options": {
        "tabWidth": 2,
        "singleQuote": false
      }
    }
  ]
}
```

### ESLint Configuration

```json
{
  "extends": ["next/core-web-vitals", "@typescript-eslint/recommended", "prettier"],
  "plugins": ["@typescript-eslint", "import"],
  "rules": {
    // TypeScript Rules
    "@typescript-eslint/no-unused-vars": "error",
    "@typescript-eslint/no-explicit-any": "warn",
    "@typescript-eslint/explicit-function-return-type": "off",
    "@typescript-eslint/explicit-module-boundary-types": "off",
    "@typescript-eslint/no-non-null-assertion": "warn",

    // Import Rules
    "import/order": [
      "error",
      {
        "groups": ["builtin", "external", "internal", "parent", "sibling", "index"],
        "newlines-between": "always",
        "alphabetize": {
          "order": "asc",
          "caseInsensitive": true
        }
      }
    ],
    "import/no-duplicates": "error",
    "import/no-unresolved": "off",

    // General Rules
    "prefer-const": "error",
    "no-var": "error",
    "no-console": "warn",
    "eqeqeq": "error",
    "curly": "error"
  },
  "overrides": [
    {
      "files": ["*.test.ts", "*.test.tsx"],
      "rules": {
        "@typescript-eslint/no-explicit-any": "off",
        "no-console": "off"
      }
    }
  ]
}
```

## 🔧 Development Tasks

### VS Code Tasks Configuration

```json
{
  "version": "2.0.0",
  "tasks": [
    {
      "label": "dev:start",
      "type": "shell",
      "command": "pnpm",
      "args": ["dev"],
      "group": "build",
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
      "label": "test:unit",
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
    },
    {
      "label": "test:watch",
      "type": "shell",
      "command": "pnpm",
      "args": ["test:watch"],
      "group": "test",
      "isBackground": true,
      "presentation": {
        "echo": true,
        "reveal": "always",
        "focus": false,
        "panel": "shared"
      }
    },
    {
      "label": "lint:fix",
      "type": "shell",
      "command": "pnpm",
      "args": ["lint:fix"],
      "group": "build",
      "presentation": {
        "echo": true,
        "reveal": "silent",
        "focus": false,
        "panel": "shared"
      }
    },
    {
      "label": "build",
      "type": "shell",
      "command": "pnpm",
      "args": ["build"],
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
      "problemMatcher": ["$tsc"]
    }
  ]
}
```

### Launch Configuration for Debugging

```json
{
  "version": "0.2.0",
  "configurations": [
    {
      "name": "Debug Next.js",
      "type": "node",
      "request": "launch",
      "program": "${workspaceFolder}/node_modules/.bin/next",
      "args": ["dev"],
      "console": "integratedTerminal",
      "env": {
        "NODE_OPTIONS": "--inspect"
      }
    },
    {
      "name": "Debug Node.js",
      "type": "node",
      "request": "launch",
      "program": "${workspaceFolder}/src/index.ts",
      "outFiles": ["${workspaceFolder}/dist/**/*.js"],
      "console": "integratedTerminal",
      "runtimeArgs": ["-r", "ts-node/register"]
    },
    {
      "name": "Debug Vitest",
      "type": "node",
      "request": "launch",
      "program": "${workspaceFolder}/node_modules/.bin/vitest",
      "args": ["run", "--reporter=verbose"],
      "console": "integratedTerminal",
      "env": {
        "NODE_OPTIONS": "--inspect-brk"
      }
    }
  ]
}
```

## 🎯 Snippets Configuration

### TypeScript React Snippets

```json
{
  "React Functional Component": {
    "prefix": "rfc",
    "body": [
      "type ${1:ComponentName}Props = {",
      "  readonly ${2:prop}: ${3:string};",
      "};",
      "",
      "const ${1:ComponentName} = ({ ${2:prop} }: ${1:ComponentName}Props) => {",
      "  return (",
      "    <div>",
      "      $0",
      "    </div>",
      "  );",
      "};",
      "",
      "export { ${1:ComponentName} };"
    ],
    "description": "Create a React functional component"
  },

  "Async Handler": {
    "prefix": "handler",
    "body": [
      "const ${1:handlerName} = async (",
      "  ${2:params}: ${3:ParamsType}",
      "): Promise<${4:ReturnType}> => {",
      "  try {",
      "    $0",
      "  } catch (error) {",
      "    console.error('Error in ${1:handlerName}:', error);",
      "    throw error;",
      "  }",
      "};"
    ],
    "description": "Create an async handler function"
  },

  "Type Definition": {
    "prefix": "type",
    "body": ["type ${1:TypeName} = {", "  readonly ${2:property}: ${3:string};", "};"],
    "description": "Create a type definition"
  }
}
```

## 🔍 Extension-Specific Settings

### GitHub Copilot Configuration

```json
{
  "github.copilot.enable": {
    "*": true,
    "yaml": false,
    "plaintext": false
  },
  "github.copilot.inlineSuggest.enable": true,
  "github.copilot.advanced": {
    "listCount": 10,
    "inlineSuggestCount": 3
  }
}
```

### GitLens Configuration

```json
{
  "gitlens.codeLens.authors.enabled": false,
  "gitlens.codeLens.recentChange.enabled": false,
  "gitlens.currentLine.enabled": false,
  "gitlens.hovers.currentLine.over": "line",
  "gitlens.statusBar.enabled": false,
  "gitlens.blame.highlight.locations": ["gutter", "line", "overview"],
  "gitlens.blame.avatars": false
}
```

### Error Lens Configuration

```json
{
  "errorLens.enabledDiagnosticLevels": ["error", "warning"],
  "errorLens.excludeBySource": ["cspell"],
  "errorLens.delay": 500
}
```

## 📱 Multi-root Workspace Setup

### Workspace Configuration

```json
{
  "folders": [
    {
      "name": "Root",
      "path": "."
    },
    {
      "name": "Frontend",
      "path": "./apps/web"
    },
    {
      "name": "Backend",
      "path": "./apps/api"
    },
    {
      "name": "Shared",
      "path": "./packages/shared"
    }
  ],
  "settings": {
    "typescript.preferences.includePackageJsonAutoImports": "on",
    "typescript.workspaceSymbols.scope": "currentProject"
  },
  "extensions": {
    "recommendations": [
      "bradlc.vscode-tailwindcss",
      "esbenp.prettier-vscode",
      "dbaeumer.vscode-eslint"
    ]
  }
}
```

## 🔗 Related Configurations

- **Development Environment** - Environment setup and dependencies
- **[Build Tools](build-tools.md)** - Build configuration and tooling
- **Code Quality Tools** - Linting and formatting tools
- **Git Configuration** - Version control standards

## 🎯 Setup Checklist

- [ ] Install recommended VS Code extensions
- [ ] Configure workspace settings
- [ ] Set up Prettier and ESLint configurations
- [ ] Configure debugging launch settings
- [ ] Set up custom snippets
- [ ] Configure extension-specific settings
- [ ] Set up multi-root workspace (if applicable)
- [ ] Test development workflow

---

_These editor configurations ensure consistent development experience and code quality across all team members._

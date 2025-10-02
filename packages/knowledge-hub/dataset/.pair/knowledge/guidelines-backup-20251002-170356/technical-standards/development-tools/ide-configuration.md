# ⚙️ IDE Configuration

**Focus**: Standardized IDE setup for consistent development experience

Comprehensive IDE configuration for Visual Studio Code and other development environments, ensuring consistent development experience, productivity enhancements, and team collaboration.

## 🎯 VS Code Configuration

### Essential Extensions

```json
// ✅ .vscode/extensions.json
{
  "recommendations": [
    // Language Support
    "ms-vscode.vscode-typescript-next",
    "bradlc.vscode-tailwindcss",
    "ms-vscode.vscode-json",

    // Framework Support
    "ms-vscode.vscode-react",
    "ms-vscode.vscode-next",
    "Prisma.prisma",

    // Code Quality
    "esbenp.prettier-vscode",
    "dbaeumer.vscode-eslint",
    "ms-vscode.vscode-eslint",
    "streetsidesoftware.code-spell-checker",

    // Testing
    "vitest.explorer",
    "ms-playwright.playwright",
    "ms-vscode.test-adapter-converter",

    // Git & Collaboration
    "eamodio.gitlens",
    "GitHub.vscode-pull-request-github",
    "GitHub.copilot",
    "GitHub.copilot-chat",

    // Productivity
    "ms-vscode.vscode-workspace-trust",
    "ms-vscode-remote.remote-containers",
    "ms-vscode.remote-explorer",
    "ms-vscode.live-server",

    // Documentation
    "yzhang.markdown-all-in-one",
    "davidanson.vscode-markdownlint",
    "bierner.markdown-mermaid",

    // Database
    "ms-mssql.mssql",
    "cweijan.vscode-postgresql-client2",

    // DevOps
    "ms-azuretools.vscode-docker",
    "redhat.vscode-yaml",
    "hashicorp.terraform"
  ],
  "unwantedRecommendations": ["ms-vscode.vscode-typescript", "hookyqr.beautify"]
}
```

### Workspace Settings

```json
// ✅ .vscode/settings.json
{
  // Editor Configuration
  "editor.tabSize": 2,
  "editor.insertSpaces": true,
  "editor.detectIndentation": false,
  "editor.trimAutoWhitespace": true,
  "editor.formatOnSave": true,
  "editor.formatOnPaste": true,
  "editor.codeActionsOnSave": {
    "source.fixAll.eslint": true,
    "source.organizeImports": true,
    "source.removeUnusedImports": true
  },

  // File Management
  "files.autoSave": "onFocusChange",
  "files.trimTrailingWhitespace": true,
  "files.insertFinalNewline": true,
  "files.trimFinalNewlines": true,
  "files.exclude": {
    "**/node_modules": true,
    "**/dist": true,
    "**/build": true,
    "**/.next": true,
    "**/coverage": true,
    "**/.nyc_output": true
  },

  // Language Specific
  "[typescript]": {
    "editor.defaultFormatter": "esbenp.prettier-vscode",
    "editor.formatOnSave": true
  },
  "[typescriptreact]": {
    "editor.defaultFormatter": "esbenp.prettier-vscode",
    "editor.formatOnSave": true
  },
  "[javascript]": {
    "editor.defaultFormatter": "esbenp.prettier-vscode"
  },
  "[json]": {
    "editor.defaultFormatter": "esbenp.prettier-vscode"
  },
  "[jsonc]": {
    "editor.defaultFormatter": "esbenp.prettier-vscode"
  },
  "[markdown]": {
    "editor.defaultFormatter": "esbenp.prettier-vscode",
    "editor.wordWrap": "on"
  },

  // TypeScript Configuration
  "typescript.preferences.useAliasesForRenames": false,
  "typescript.preferences.includePackageJsonAutoImports": "auto",
  "typescript.suggest.autoImports": true,
  "typescript.suggest.completeJSDocs": true,
  "typescript.suggest.completeFunctionCalls": true,
  "typescript.updateImportsOnFileMove.enabled": "always",
  "typescript.inlayHints.enumMemberValues.enabled": true,
  "typescript.inlayHints.functionLikeReturnTypes.enabled": true,
  "typescript.inlayHints.parameterNames.enabled": "all",
  "typescript.inlayHints.parameterTypes.enabled": true,
  "typescript.inlayHints.propertyDeclarationTypes.enabled": true,
  "typescript.inlayHints.variableTypes.enabled": true,

  // ESLint Configuration
  "eslint.workingDirectories": ["./"],
  "eslint.validate": ["javascript", "javascriptreact", "typescript", "typescriptreact"],
  "eslint.codeActionsOnSave.mode": "all",

  // Prettier Configuration
  "prettier.requireConfig": true,
  "prettier.useEditorConfig": false,

  // Git Configuration
  "git.enableSmartCommit": true,
  "git.confirmSync": false,
  "git.autofetch": true,
  "git.defaultCloneDirectory": "~/Projects",
  "gitlens.codeLens.enabled": true,
  "gitlens.currentLine.enabled": true,
  "gitlens.hovers.enabled": true,

  // Testing Configuration
  "vitest.enable": true,
  "vitest.commandLine": "pnpm vitest",
  "playwright.reuseBrowser": true,
  "playwright.showTrace": true,

  // Terminal Configuration
  "terminal.integrated.defaultProfile.osx": "zsh",
  "terminal.integrated.fontSize": 14,
  "terminal.integrated.fontFamily": "MesloLGS NF",

  // Search Configuration
  "search.exclude": {
    "**/node_modules": true,
    "**/dist": true,
    "**/build": true,
    "**/.next": true,
    "**/coverage": true,
    "**/.git": true
  },

  // Workspace Trust
  "security.workspace.trust.untrustedFiles": "prompt",
  "security.workspace.trust.banner": "always",

  // Performance
  "extensions.experimental.affinity": {
    "esbenp.prettier-vscode": 1,
    "dbaeumer.vscode-eslint": 1
  },

  // UI Customization
  "workbench.colorTheme": "GitHub Dark Default",
  "workbench.iconTheme": "material-icon-theme",
  "workbench.editor.enablePreview": false,
  "workbench.editor.enablePreviewFromQuickOpen": false,
  "workbench.startupEditor": "welcomePage",

  // Emmet Configuration
  "emmet.includeLanguages": {
    "typescript": "html",
    "typescriptreact": "html"
  },
  "emmet.triggerExpansionOnTab": true,

  // Spell Checker Configuration
  "cSpell.words": [
    "pnpm",
    "turbo",
    "vitest",
    "tailwindcss",
    "prisma",
    "nextjs",
    "fastify",
    "zustand",
    "tanstack"
  ],

  // Path Intellisense
  "path-intellisense.mappings": {
    "@": "${workspaceRoot}/src",
    "@/components": "${workspaceRoot}/src/components",
    "@/pages": "${workspaceRoot}/src/pages",
    "@/utils": "${workspaceRoot}/src/utils",
    "@/lib": "${workspaceRoot}/src/lib",
    "@/types": "${workspaceRoot}/src/types"
  }
}
```

### Tasks Configuration

```json
// ✅ .vscode/tasks.json
{
  "version": "2.0.0",
  "tasks": [
    {
      "label": "Install Dependencies",
      "type": "shell",
      "command": "pnpm",
      "args": ["install"],
      "group": "build",
      "presentation": {
        "echo": true,
        "reveal": "always",
        "focus": false,
        "panel": "shared"
      },
      "problemMatcher": []
    },
    {
      "label": "Dev Server",
      "type": "shell",
      "command": "pnpm",
      "args": ["dev"],
      "group": "build",
      "isBackground": true,
      "presentation": {
        "echo": true,
        "reveal": "always",
        "focus": false,
        "panel": "shared"
      },
      "problemMatcher": {
        "pattern": {
          "regexp": "."
        },
        "background": {
          "activeOnStart": true,
          "beginsPattern": ".*",
          "endsPattern": ".*Local:.*"
        }
      }
    },
    {
      "label": "Build",
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
    },
    {
      "label": "Test",
      "type": "shell",
      "command": "pnpm",
      "args": ["test"],
      "group": {
        "kind": "test",
        "isDefault": true
      },
      "presentation": {
        "echo": true,
        "reveal": "always",
        "focus": false,
        "panel": "shared"
      },
      "problemMatcher": []
    },
    {
      "label": "Test Watch",
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
      },
      "problemMatcher": []
    },
    {
      "label": "Lint",
      "type": "shell",
      "command": "pnpm",
      "args": ["lint"],
      "group": "build",
      "presentation": {
        "echo": true,
        "reveal": "always",
        "focus": false,
        "panel": "shared"
      },
      "problemMatcher": ["$eslint-stylish"]
    },
    {
      "label": "Lint Fix",
      "type": "shell",
      "command": "pnpm",
      "args": ["lint:fix"],
      "group": "build",
      "presentation": {
        "echo": true,
        "reveal": "always",
        "focus": false,
        "panel": "shared"
      },
      "problemMatcher": ["$eslint-stylish"]
    },
    {
      "label": "Type Check",
      "type": "shell",
      "command": "pnpm",
      "args": ["type-check"],
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
      "label": "Format",
      "type": "shell",
      "command": "pnpm",
      "args": ["format"],
      "group": "build",
      "presentation": {
        "echo": true,
        "reveal": "always",
        "focus": false,
        "panel": "shared"
      },
      "problemMatcher": []
    },
    {
      "label": "Database Generate",
      "type": "shell",
      "command": "pnpm",
      "args": ["db:generate"],
      "group": "build",
      "presentation": {
        "echo": true,
        "reveal": "always",
        "focus": false,
        "panel": "shared"
      },
      "problemMatcher": []
    },
    {
      "label": "Database Migrate",
      "type": "shell",
      "command": "pnpm",
      "args": ["db:migrate"],
      "group": "build",
      "presentation": {
        "echo": true,
        "reveal": "always",
        "focus": false,
        "panel": "shared"
      },
      "problemMatcher": []
    }
  ]
}
```

### Launch Configuration

```json
// ✅ .vscode/launch.json
{
  "version": "0.2.0",
  "configurations": [
    {
      "name": "Debug Next.js App",
      "type": "node",
      "request": "launch",
      "program": "${workspaceFolder}/node_modules/.bin/next",
      "args": ["dev"],
      "env": {
        "NODE_OPTIONS": "--inspect"
      },
      "console": "integratedTerminal",
      "serverReadyAction": {
        "pattern": "started server on .+, url: (https?://.+)",
        "uriFormat": "%s",
        "action": "debugWithChrome"
      }
    },
    {
      "name": "Debug Node.js API",
      "type": "node",
      "request": "launch",
      "program": "${workspaceFolder}/src/server.ts",
      "outFiles": ["${workspaceFolder}/dist/**/*.js"],
      "env": {
        "NODE_ENV": "development"
      },
      "console": "integratedTerminal",
      "restart": true,
      "runtimeArgs": ["--nolazy", "-r", "ts-node/register"]
    },
    {
      "name": "Debug Vitest Tests",
      "type": "node",
      "request": "launch",
      "program": "${workspaceFolder}/node_modules/.bin/vitest",
      "args": ["run", "--reporter=verbose"],
      "env": {
        "NODE_ENV": "test"
      },
      "console": "integratedTerminal"
    },
    {
      "name": "Debug Current Test File",
      "type": "node",
      "request": "launch",
      "program": "${workspaceFolder}/node_modules/.bin/vitest",
      "args": ["run", "${relativeFile}"],
      "env": {
        "NODE_ENV": "test"
      },
      "console": "integratedTerminal"
    },
    {
      "name": "Debug Playwright Tests",
      "type": "node",
      "request": "launch",
      "program": "${workspaceFolder}/node_modules/.bin/playwright",
      "args": ["test", "--debug"],
      "env": {
        "NODE_ENV": "test"
      },
      "console": "integratedTerminal"
    }
  ]
}
```

## 🛠️ Development Tools Integration

### Git Integration

```json
// ✅ Git configuration in VS Code
{
  // Git settings
  "git.enableSmartCommit": true,
  "git.confirmSync": false,
  "git.autofetch": true,
  "git.defaultCloneDirectory": "~/Projects",

  // GitLens settings
  "gitlens.codeLens.enabled": true,
  "gitlens.codeLens.authors.enabled": true,
  "gitlens.codeLens.recentChange.enabled": true,
  "gitlens.currentLine.enabled": true,
  "gitlens.currentLine.pullRequests.enabled": true,
  "gitlens.hovers.enabled": true,
  "gitlens.blame.heatmap.enabled": true,
  "gitlens.blame.avatars": true,
  "gitlens.statusBar.enabled": true,

  // GitHub Pull Requests
  "githubPullRequests.pullBranch": "never",
  "githubPullRequests.createOnPublishBranch": "never",
  "githubPullRequests.defaultMergeMethod": "squash",

  // GitHub Copilot
  "github.copilot.enable": {
    "*": true,
    "yaml": false,
    "plaintext": false
  },
  "github.copilot.editor.enableAutoCompletions": true
}
```

### Docker Integration

```json
// ✅ Docker configuration
{
  "docker.showStartPage": false,
  "docker.defaultRegistryPath": "",
  "docker.dockerPath": "docker",
  "docker.machineNaming": "default",

  // Remote Containers
  "remote.containers.defaultExtensions": [
    "esbenp.prettier-vscode",
    "dbaeumer.vscode-eslint",
    "ms-vscode.vscode-typescript-next"
  ],
  "remote.containers.copyGitConfig": true,
  "remote.containers.gitCredentialHelperConfigLocation": "system"
}

// ✅ .devcontainer/devcontainer.json
{
  "name": "Development Container",
  "dockerComposeFile": "../docker-compose.dev.yml",
  "service": "app",
  "workspaceFolder": "/workspace",

  "customizations": {
    "vscode": {
      "extensions": [
        "esbenp.prettier-vscode",
        "dbaeumer.vscode-eslint",
        "ms-vscode.vscode-typescript-next",
        "Prisma.prisma",
        "vitest.explorer"
      ],
      "settings": {
        "terminal.integrated.defaultProfile.linux": "bash"
      }
    }
  },

  "forwardPorts": [3000, 5432],
  "postCreateCommand": "pnpm install",
  "remoteUser": "node"
}
```

## 🚀 Productivity Features

### Code Snippets

```json
// ✅ .vscode/typescript.json (User Snippets)
{
  "React Functional Component": {
    "prefix": "rfc",
    "body": [
      "interface ${1:Component}Props {",
      "  $2",
      "}",
      "",
      "export const ${1:Component}: React.FC<${1:Component}Props> = ({",
      "  $3",
      "}) => {",
      "  return (",
      "    <div>",
      "      $4",
      "    </div>",
      "  )",
      "}",
      "",
      "export default ${1:Component}"
    ],
    "description": "Create a React functional component with TypeScript"
  },

  "Vitest Test Suite": {
    "prefix": "vtest",
    "body": [
      "import { describe, it, expect, beforeEach, afterEach } from 'vitest'",
      "import { $1 } from '$2'",
      "",
      "describe('${3:Test Suite}', () => {",
      "  beforeEach(() => {",
      "    $4",
      "  })",
      "",
      "  afterEach(() => {",
      "    $5",
      "  })",
      "",
      "  it('should $6', () => {",
      "    // Arrange",
      "    $7",
      "",
      "    // Act",
      "    $8",
      "",
      "    // Assert",
      "    expect($9).toBe($10)",
      "  })",
      "})"
    ],
    "description": "Create a Vitest test suite"
  },

  "API Route Handler": {
    "prefix": "apihandler",
    "body": [
      "import { NextRequest, NextResponse } from 'next/server'",
      "import { z } from 'zod'",
      "",
      "const ${1:requestSchema} = z.object({",
      "  $2",
      "})",
      "",
      "export async function ${3:GET}(request: NextRequest) {",
      "  try {",
      "    $4",
      "",
      "    return NextResponse.json({",
      "      success: true,",
      "      data: $5",
      "    })",
      "  } catch (error) {",
      "    console.error('${6:API Error}:', error)",
      "    return NextResponse.json(",
      "      { success: false, error: 'Internal server error' },",
      "      { status: 500 }",
      "    )",
      "  }",
      "}"
    ],
    "description": "Create a Next.js API route handler"
  },

  "Prisma Model": {
    "prefix": "prismamodel",
    "body": [
      "model ${1:ModelName} {",
      "  id        String   @id @default(cuid())",
      "  ${2:field}    ${3:String}",
      "  createdAt DateTime @default(now())",
      "  updatedAt DateTime @updatedAt",
      "",
      "  @@map(\"${4:table_name}\")",
      "}"
    ],
    "description": "Create a Prisma model"
  }
}
```

### Keybindings

```json
// ✅ .vscode/keybindings.json
[
  {
    "key": "cmd+shift+r",
    "command": "workbench.action.tasks.runTask",
    "args": "Dev Server"
  },
  {
    "key": "cmd+shift+t",
    "command": "workbench.action.tasks.runTask",
    "args": "Test"
  },
  {
    "key": "cmd+shift+l",
    "command": "workbench.action.tasks.runTask",
    "args": "Lint"
  },
  {
    "key": "cmd+shift+f",
    "command": "workbench.action.tasks.runTask",
    "args": "Format"
  },
  {
    "key": "cmd+shift+b",
    "command": "workbench.action.tasks.runTask",
    "args": "Build"
  },
  {
    "key": "ctrl+`",
    "command": "workbench.action.terminal.toggleTerminal"
  },
  {
    "key": "cmd+k cmd+t",
    "command": "workbench.action.selectTheme"
  },
  {
    "key": "cmd+shift+p",
    "command": "workbench.action.showCommands"
  }
]
```

## 🔧 Alternative IDEs

### WebStorm Configuration

```typescript
// ✅ WebStorm configuration highlights
interface WebStormConfig {
  codeStyle: {
    typescript: {
      tabSize: 2
      useTabCharacter: false
      smartTabs: false
      indentSize: 2
    }

    prettier: {
      enabled: true
      runOnSave: true
      runOnReformat: true
    }
  }

  tools: {
    eslint: {
      enabled: true
      runOnSave: true
      automaticConfiguration: true
    }

    nodeJS: {
      codingAssistanceForNodeJS: true
      nodeInterpreter: '/usr/local/bin/node'
      packageManager: 'pnpm'
    }
  }

  plugins: ['NodeJS', 'Prettier', 'ESLint', 'GitToolBox', 'Rainbow Brackets', 'Material Theme UI']
}
```

### Vim/Neovim Configuration

```lua
-- ✅ Neovim configuration for TypeScript development
return {
  -- LSP Configuration
  {
    'neovim/nvim-lspconfig',
    config = function()
      require('lspconfig').tsserver.setup({
        on_attach = function(client, bufnr)
          -- Enable completion triggered by <c-x><c-o>
          vim.api.nvim_buf_set_option(bufnr, 'omnifunc', 'v:lua.vim.lsp.omnifunc')
        end,
        flags = {
          debounce_text_changes = 150,
        }
      })
    end
  },

  -- Treesitter for syntax highlighting
  {
    'nvim-treesitter/nvim-treesitter',
    config = function()
      require('nvim-treesitter.configs').setup({
        ensure_installed = { 'typescript', 'tsx', 'javascript', 'json', 'html', 'css' },
        highlight = { enable = true },
        indent = { enable = true }
      })
    end
  },

  -- Auto-completion
  {
    'hrsh7th/nvim-cmp',
    dependencies = {
      'hrsh7th/cmp-nvim-lsp',
      'hrsh7th/cmp-buffer',
      'hrsh7th/cmp-path'
    }
  }
}
```

## 📊 Team Configuration

### Shared Configuration Management

```typescript
// ✅ Team configuration synchronization
export class TeamConfigManager {
  /**
   * Synchronize team IDE settings
   */
  async syncTeamSettings(): Promise<void> {
    const teamSettings = {
      // Common settings across all team members
      common: {
        'editor.tabSize': 2,
        'editor.insertSpaces': true,
        'editor.formatOnSave': true,
        'files.trimTrailingWhitespace': true,
      },

      // Optional settings that team members can override
      optional: {
        'workbench.colorTheme': 'GitHub Dark Default',
        'editor.fontSize': 14,
        'terminal.integrated.fontSize': 14,
      },

      // Required extensions for the project
      requiredExtensions: [
        'esbenp.prettier-vscode',
        'dbaeumer.vscode-eslint',
        'ms-vscode.vscode-typescript-next',
      ],
    }

    // Save to .vscode/settings.json
    await this.writeTeamSettings(teamSettings)
  }

  /**
   * Validate team member setup
   */
  async validateSetup(): Promise<ValidationResult> {
    const checks = [
      this.checkNodeVersion(),
      this.checkPnpmInstallation(),
      this.checkRequiredExtensions(),
      this.checkFormattingSettings(),
      this.checkLintingSettings(),
    ]

    const results = await Promise.all(checks)

    return {
      passed: results.every(r => r.passed),
      checks: results,
    }
  }
}
```

## 🔗 Related Concepts

- **[Required Tools](required-tools.md)** - Essential development tools
- **[Recommended Tools](recommended-tools.md)** - Additional productivity tools
- **[ESLint Configuration](.pair/knowledge/guidelines/code-design/quality-standards/eslint-configuration.md)** - Code quality setup

## 📏 Implementation Guidelines

1. **Standardization**: Use consistent settings across team members
2. **Automation**: Automate formatting and code quality checks
3. **Productivity**: Configure shortcuts and snippets for common tasks
4. **Collaboration**: Enable effective code review and Git integration
5. **Performance**: Optimize IDE performance for large projects
6. **Customization**: Allow personal preferences while maintaining standards
7. **Documentation**: Document IDE setup and troubleshooting
8. **Onboarding**: Provide clear setup instructions for new team members

---

_IDE Configuration ensures consistent development experience across team members through standardized settings, extensions, and productivity enhancements that support the development workflow and coding standards._

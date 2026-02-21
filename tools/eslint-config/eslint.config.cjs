// eslint.config.js
const js = require('@eslint/js')
const typescript = require('@typescript-eslint/eslint-plugin')
const typescriptParser = require('@typescript-eslint/parser')

module.exports = [
  {
    files: ['**/*.{js,mjs,cjs,ts,tsx}'],
    languageOptions: {
      parser: typescriptParser,
      parserOptions: {
        ecmaVersion: 2021,
        sourceType: 'module',
      },
      globals: {
        // Node.js essentials
        __dirname: 'readonly',
        __filename: 'readonly',
        process: 'readonly',
        console: 'readonly',
        Buffer: 'readonly',
        global: 'readonly',
        require: 'readonly',
        module: 'readonly',
        exports: 'readonly',
        // Timers
        setTimeout: 'readonly',
        clearTimeout: 'readonly',
        setInterval: 'readonly',
        clearInterval: 'readonly',
        setImmediate: 'readonly',
        clearImmediate: 'readonly',
      },
    },
    plugins: {
      '@typescript-eslint': typescript,
    },
    rules: {
      // Regole base di ESLint
      ...js.configs.recommended.rules,

      // Regole TypeScript raccomandate (solo quelle che non richiedono type info)
      ...typescript.configs.recommended.rules,

      // Configurazioni custom
      'no-console': 'off',
      'no-process-env': 'off',
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],

      // Code quality standards from guidelines
      complexity: ['error', 10],
      'max-depth': ['error', 4],
      'max-lines-per-function': ['error', 50],
      'max-params': ['error', 4],

      // TypeScript-specific rules that enforce our guidelines
      '@typescript-eslint/no-explicit-any': 'error',

      // Functional programming preferences
      'prefer-const': 'error',
      'no-var': 'error',

      // Prevent runtime errors that should be compile-time
      'no-throw-literal': 'error',

      // Disable no-undef for TypeScript files - TypeScript handles this better
      'no-undef': 'off',
    },
  },
  {
    // Configurazione specifica per i file di test
    files: ['**/*.test.{js,ts,tsx}', '**/*.spec.{js,ts,tsx}'],
    languageOptions: {
      globals: {
        // Include tutte le globals di sopra
        __dirname: 'readonly',
        __filename: 'readonly',
        process: 'readonly',
        console: 'readonly',
        Buffer: 'readonly',
        global: 'readonly',
        require: 'readonly',
        module: 'readonly',
        exports: 'readonly',
        setTimeout: 'readonly',
        clearTimeout: 'readonly',
        setInterval: 'readonly',
        clearInterval: 'readonly',
        setImmediate: 'readonly',
        clearImmediate: 'readonly',
        // Globals per Vitest
        describe: 'readonly',
        it: 'readonly',
        test: 'readonly',
        expect: 'readonly',
        beforeEach: 'readonly',
        afterEach: 'readonly',
        beforeAll: 'readonly',
        afterAll: 'readonly',
        vi: 'readonly',
        // Browser globals for React component tests
        window: 'readonly',
        document: 'readonly',
        HTMLElement: 'readonly',
        HTMLButtonElement: 'readonly',
        HTMLDivElement: 'readonly',
        Element: 'readonly',
      },
    },
    rules: {
      'max-lines-per-function': 'off',
    },
  },
  {
    files: ['**/*.cjs', '**/scripts/**/*.js'],
    rules: {
      '@typescript-eslint/no-require-imports': 'off',
    },
  },
  {
    ignores: ['dist/', 'build/', 'node_modules/', '*.config.js', '*.config.ts', 'playwright/', 'test-results/'],
  },
]

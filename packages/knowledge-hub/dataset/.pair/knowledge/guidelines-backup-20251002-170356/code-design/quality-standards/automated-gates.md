# Automated Gates

This document defines our automated quality gates and continuous integration checks that ensure code quality, security, and performance standards before code reaches production.

## Overview

Automated gates provide immediate feedback on code quality, enforce standards consistently, and prevent problematic code from advancing through our deployment pipeline while maintaining development velocity.

## Gate Categories

### Quality Gate Classification

```typescript
enum GateType {
  BLOCKER = 'blocker', // Must pass to proceed
  WARNING = 'warning', // Should pass but not blocking
  INFO = 'info', // Informational only
}

enum GateStage {
  PRE_COMMIT = 'pre_commit', // Local development
  PRE_PUSH = 'pre_push', // Before pushing changes
  PR_VALIDATION = 'pr_validation', // Pull request checks
  PRE_MERGE = 'pre_merge', // Before merging to main
  PRE_DEPLOY = 'pre_deploy', // Before deployment
  POST_DEPLOY = 'post_deploy', // After deployment validation
}

interface QualityGate {
  id: string
  name: string
  type: GateType
  stage: GateStage
  timeout: string
  retry_attempts: number
  checks: QualityCheck[]
  conditions: GateCondition[]
  notifications: NotificationConfig
}

interface QualityCheck {
  id: string
  name: string
  command: string
  working_directory?: string
  environment_variables?: Record<string, string>
  artifacts?: string[]
  timeout: string
  success_criteria: SuccessCriteria
}

interface SuccessCriteria {
  exit_code: number | number[]
  output_patterns?: {
    required?: string[]
    forbidden?: string[]
  }
  thresholds?: Record<string, number>
  files_required?: string[]
}
```

## Pre-commit Gates

### Local Development Checks

```typescript
// husky pre-commit configuration
interface PreCommitConfig {
  enabled: boolean
  checks: PreCommitCheck[]
  parallel_execution: boolean
  fail_fast: boolean
  auto_fix: boolean
}

interface PreCommitCheck {
  name: string
  command: string
  file_patterns: string[]
  auto_fix_command?: string
  skip_on_merge?: boolean
}

const preCommitConfig: PreCommitConfig = {
  enabled: true,
  parallel_execution: true,
  fail_fast: false,
  auto_fix: true,
  checks: [
    {
      name: 'eslint',
      command: 'pnpm run lint:fix',
      file_patterns: ['*.ts', '*.tsx', '*.js', '*.jsx'],
      auto_fix_command: 'pnpm run lint:fix',
      skip_on_merge: false,
    },
    {
      name: 'prettier',
      command: 'pnpm run format:check',
      file_patterns: ['*.ts', '*.tsx', '*.js', '*.jsx', '*.json', '*.md'],
      auto_fix_command: 'pnpm run format:fix',
      skip_on_merge: false,
    },
    {
      name: 'type_check',
      command: 'pnpm run type-check',
      file_patterns: ['*.ts', '*.tsx'],
      skip_on_merge: false,
    },
    {
      name: 'test_related',
      command: 'pnpm run test:related',
      file_patterns: ['*.ts', '*.tsx'],
      skip_on_merge: true,
    },
    {
      name: 'secret_scan',
      command: 'pnpm run security:scan-secrets',
      file_patterns: ['*'],
      skip_on_merge: false,
    },
  ],
}
```

### Lint-staged Configuration

```json
{
  "lint-staged": {
    "*.{ts,tsx,js,jsx}": ["eslint --fix", "prettier --write", "git add"],
    "*.{json,md,yaml,yml}": ["prettier --write", "git add"],
    "*.{ts,tsx}": ["tsc --noEmit --skipLibCheck"],
    "package.json": ["pnpm audit --audit-level moderate"]
  }
}
```

## Continuous Integration Gates

### GitHub Actions Workflow

```yaml
# .github/workflows/quality-gates.yml
name: Quality Gates

on:
  pull_request:
    branches: [main, develop]
  push:
    branches: [main, develop]

concurrency:
  group: ${{ github.workflow }}-${{ github.ref }}
  cancel-in-progress: true

jobs:
  code-quality:
    name: Code Quality
    runs-on: ubuntu-latest
    timeout-minutes: 15

    steps:
      - uses: actions/checkout@v4
        with:
          fetch-depth: 0 # Full history for better analysis

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: 'pnpm'

      - name: Install dependencies
        run: pnpm install --frozen-lockfile

      - name: Lint check
        run: pnpm run lint:ci

      - name: Format check
        run: pnpm run format:check

      - name: Type check
        run: pnpm run type-check

      - name: Upload lint results
        if: always()
        uses: actions/upload-artifact@v4
        with:
          name: lint-results
          path: reports/lint-results.json

  security-scan:
    name: Security Scan
    runs-on: ubuntu-latest
    timeout-minutes: 10

    steps:
      - uses: actions/checkout@v4

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: 'pnpm'

      - name: Install dependencies
        run: pnpm install --frozen-lockfile

      - name: Audit dependencies
        run: pnpm audit --audit-level moderate

      - name: Secret scan
        uses: trufflesecurity/trufflehog@v3.63.2
        with:
          path: ./
          base: ${{ github.event.repository.default_branch }}
          head: HEAD
          extra_args: --debug --only-verified

      - name: SAST scan
        run: pnpm run security:sast

  test-suite:
    name: Test Suite
    runs-on: ubuntu-latest
    timeout-minutes: 20

    strategy:
      matrix:
        test-type: [unit, integration, e2e]

    steps:
      - uses: actions/checkout@v4

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: 'pnpm'

      - name: Install dependencies
        run: pnpm install --frozen-lockfile

      - name: Run ${{ matrix.test-type }} tests
        run: pnpm run test:${{ matrix.test-type }}:ci
        env:
          CI: true

      - name: Upload coverage
        if: matrix.test-type == 'unit'
        uses: codecov/codecov-action@v3
        with:
          file: coverage/lcov.info
          flags: unittests

      - name: Upload test results
        if: always()
        uses: actions/upload-artifact@v4
        with:
          name: test-results-${{ matrix.test-type }}
          path: reports/test-results-${{ matrix.test-type }}.xml

  build-validation:
    name: Build Validation
    runs-on: ubuntu-latest
    timeout-minutes: 15

    steps:
      - uses: actions/checkout@v4

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: 'pnpm'

      - name: Install dependencies
        run: pnpm install --frozen-lockfile

      - name: Build packages
        run: pnpm run build

      - name: Validate build artifacts
        run: pnpm run validate:build

      - name: Bundle size check
        run: pnpm run analyze:bundle-size

      - name: Upload build artifacts
        uses: actions/upload-artifact@v4
        with:
          name: build-artifacts
          path: dist/

  quality-gate-summary:
    name: Quality Gate Summary
    runs-on: ubuntu-latest
    needs: [code-quality, security-scan, test-suite, build-validation]
    if: always()

    steps:
      - name: Download all artifacts
        uses: actions/download-artifact@v4

      - name: Generate quality report
        run: |
          echo "## Quality Gate Results" > quality-report.md
          echo "- Code Quality: ${{ needs.code-quality.result }}" >> quality-report.md
          echo "- Security Scan: ${{ needs.security-scan.result }}" >> quality-report.md
          echo "- Test Suite: ${{ needs.test-suite.result }}" >> quality-report.md
          echo "- Build Validation: ${{ needs.build-validation.result }}" >> quality-report.md

      - name: Comment PR
        if: github.event_name == 'pull_request'
        uses: actions/github-script@v7
        with:
          script: |
            const fs = require('fs');
            const report = fs.readFileSync('quality-report.md', 'utf8');

            github.rest.issues.createComment({
              issue_number: context.issue.number,
              owner: context.repo.owner,
              repo: context.repo.repo,
              body: report
            });
```

## Quality Metrics and Thresholds

### Code Quality Thresholds

```typescript
interface QualityThresholds {
  code_coverage: CoverageThresholds
  code_complexity: ComplexityThresholds
  code_duplication: DuplicationThresholds
  technical_debt: TechnicalDebtThresholds
  performance: PerformanceThresholds
}

interface CoverageThresholds {
  statements: {
    minimum: number // 90%
    target: number // 95%
    warning: number // 85%
  }
  branches: {
    minimum: number // 85%
    target: number // 90%
    warning: number // 80%
  }
  functions: {
    minimum: number // 95%
    target: number // 100%
    warning: number // 90%
  }
  lines: {
    minimum: number // 90%
    target: number // 95%
    warning: number // 85%
  }
}

interface ComplexityThresholds {
  cyclomatic_complexity: {
    function_max: number // 10
    class_max: number // 50
    file_max: number // 100
  }
  cognitive_complexity: {
    function_max: number // 15
    class_max: number // 75
  }
  nesting_depth: {
    max_depth: number // 4
  }
}

interface DuplicationThresholds {
  duplicate_lines: {
    max_percentage: number // 3%
    max_absolute: number // 50 lines
  }
  duplicate_blocks: {
    max_count: number // 5
    min_block_size: number // 6 lines
  }
}

const qualityThresholds: QualityThresholds = {
  code_coverage: {
    statements: { minimum: 90, target: 95, warning: 85 },
    branches: { minimum: 85, target: 90, warning: 80 },
    functions: { minimum: 95, target: 100, warning: 90 },
    lines: { minimum: 90, target: 95, warning: 85 },
  },
  code_complexity: {
    cyclomatic_complexity: {
      function_max: 10,
      class_max: 50,
      file_max: 100,
    },
    cognitive_complexity: {
      function_max: 15,
      class_max: 75,
    },
    nesting_depth: {
      max_depth: 4,
    },
  },
  code_duplication: {
    duplicate_lines: {
      max_percentage: 3,
      max_absolute: 50,
    },
    duplicate_blocks: {
      max_count: 5,
      min_block_size: 6,
    },
  },
  technical_debt: {
    debt_ratio: { max_percentage: 5 },
    maintainability_index: { min_score: 70 },
    code_smells: { max_count: 10 },
  },
  performance: {
    bundle_size: {
      main_bundle_max: '250KB',
      total_size_max: '1MB',
      chunk_size_max: '100KB',
    },
    build_time: {
      max_duration: '10m',
      warning_duration: '5m',
    },
  },
}
```

### Automated Quality Checks

```typescript
// Custom quality gate checker
class QualityGateChecker {
  private thresholds: QualityThresholds
  private metrics: QualityMetrics

  constructor(thresholds: QualityThresholds) {
    this.thresholds = thresholds
  }

  async checkCoverageGate(coverageReport: CoverageReport): Promise<GateResult> {
    const results: CheckResult[] = []

    // Check statement coverage
    results.push(
      this.checkThreshold(
        'statement_coverage',
        coverageReport.statements.percentage,
        this.thresholds.code_coverage.statements.minimum,
        'Statement coverage below threshold',
      ),
    )

    // Check branch coverage
    results.push(
      this.checkThreshold(
        'branch_coverage',
        coverageReport.branches.percentage,
        this.thresholds.code_coverage.branches.minimum,
        'Branch coverage below threshold',
      ),
    )

    // Check function coverage
    results.push(
      this.checkThreshold(
        'function_coverage',
        coverageReport.functions.percentage,
        this.thresholds.code_coverage.functions.minimum,
        'Function coverage below threshold',
      ),
    )

    return this.aggregateResults('coverage_gate', results)
  }

  async checkComplexityGate(complexityReport: ComplexityReport): Promise<GateResult> {
    const results: CheckResult[] = []

    // Check cyclomatic complexity
    for (const file of complexityReport.files) {
      for (const func of file.functions) {
        if (
          func.cyclomatic_complexity >
          this.thresholds.code_complexity.cyclomatic_complexity.function_max
        ) {
          results.push({
            check_id: 'cyclomatic_complexity',
            status: 'failed',
            message: `Function ${func.name} has high cyclomatic complexity: ${func.cyclomatic_complexity}`,
            file: file.path,
            line: func.line,
          })
        }
      }
    }

    return this.aggregateResults('complexity_gate', results)
  }

  async checkSecurityGate(securityReport: SecurityReport): Promise<GateResult> {
    const results: CheckResult[] = []

    // Check for high/critical vulnerabilities
    const highVulns = securityReport.vulnerabilities.filter(
      v => v.severity === 'high' || v.severity === 'critical',
    )

    if (highVulns.length > 0) {
      results.push({
        check_id: 'security_vulnerabilities',
        status: 'failed',
        message: `Found ${highVulns.length} high/critical vulnerabilities`,
        details: highVulns,
      })
    }

    // Check for exposed secrets
    if (securityReport.secrets.length > 0) {
      results.push({
        check_id: 'exposed_secrets',
        status: 'failed',
        message: `Found ${securityReport.secrets.length} exposed secrets`,
        details: securityReport.secrets,
      })
    }

    return this.aggregateResults('security_gate', results)
  }

  private checkThreshold(
    checkId: string,
    actual: number,
    threshold: number,
    message: string,
  ): CheckResult {
    return {
      check_id: checkId,
      status: actual >= threshold ? 'passed' : 'failed',
      message: actual >= threshold ? 'Threshold met' : `${message}: ${actual}% < ${threshold}%`,
      actual_value: actual,
      threshold_value: threshold,
    }
  }

  private aggregateResults(gateId: string, results: CheckResult[]): GateResult {
    const failed = results.filter(r => r.status === 'failed')
    const warnings = results.filter(r => r.status === 'warning')

    return {
      gate_id: gateId,
      status: failed.length > 0 ? 'failed' : warnings.length > 0 ? 'warning' : 'passed',
      checks: results,
      summary: {
        total: results.length,
        passed: results.filter(r => r.status === 'passed').length,
        failed: failed.length,
        warnings: warnings.length,
      },
      blocking: failed.length > 0,
    }
  }
}
```

## Performance Gates

### Bundle Size Monitoring

```typescript
interface BundleAnalysis {
  bundles: Bundle[]
  total_size: number
  gzip_size: number
  duplicated_packages: DuplicatedPackage[]
  recommendations: string[]
}

interface Bundle {
  name: string
  size: number
  gzip_size: number
  chunks: Chunk[]
  tree_shaking_effectiveness: number
}

class BundleSizeGate {
  private thresholds: PerformanceThresholds

  constructor(thresholds: PerformanceThresholds) {
    this.thresholds = thresholds
  }

  async checkBundleSize(analysis: BundleAnalysis): Promise<GateResult> {
    const results: CheckResult[] = []

    // Check total bundle size
    const totalSizeKB = analysis.total_size / 1024
    const maxSizeKB = this.parseSize(this.thresholds.bundle_size.total_size_max)

    results.push({
      check_id: 'total_bundle_size',
      status: totalSizeKB <= maxSizeKB ? 'passed' : 'failed',
      message: `Total bundle size: ${totalSizeKB.toFixed(2)}KB`,
      actual_value: totalSizeKB,
      threshold_value: maxSizeKB,
    })

    // Check individual bundle sizes
    for (const bundle of analysis.bundles) {
      const bundleSizeKB = bundle.size / 1024
      const maxBundleKB = this.parseSize(this.thresholds.bundle_size.main_bundle_max)

      if (bundleSizeKB > maxBundleKB) {
        results.push({
          check_id: 'individual_bundle_size',
          status: 'failed',
          message: `Bundle ${bundle.name} exceeds size limit: ${bundleSizeKB.toFixed(
            2,
          )}KB > ${maxBundleKB}KB`,
          file: bundle.name,
        })
      }
    }

    // Check for duplicated packages
    if (analysis.duplicated_packages.length > 0) {
      results.push({
        check_id: 'duplicated_packages',
        status: 'warning',
        message: `Found ${analysis.duplicated_packages.length} duplicated packages`,
        details: analysis.duplicated_packages,
      })
    }

    return {
      gate_id: 'bundle_size_gate',
      status: results.some(r => r.status === 'failed')
        ? 'failed'
        : results.some(r => r.status === 'warning')
        ? 'warning'
        : 'passed',
      checks: results,
      summary: {
        total: results.length,
        passed: results.filter(r => r.status === 'passed').length,
        failed: results.filter(r => r.status === 'failed').length,
        warnings: results.filter(r => r.status === 'warning').length,
      },
      blocking: results.some(r => r.status === 'failed'),
    }
  }

  private parseSize(sizeStr: string): number {
    const match = sizeStr.match(/^(\d+(?:\.\d+)?)(KB|MB)$/i)
    if (!match) return 0

    const value = parseFloat(match[1])
    const unit = match[2].toUpperCase()

    return unit === 'MB' ? value * 1024 : value
  }
}
```

## Gate Configuration Management

### Dynamic Gate Configuration

```typescript
interface GateConfiguration {
  version: string
  environments: Record<string, EnvironmentGates>
  global_settings: GlobalGateSettings
  overrides: GateOverride[]
}

interface EnvironmentGates {
  enabled_gates: string[]
  disabled_gates: string[]
  threshold_overrides: Record<string, any>
  notification_settings: NotificationConfig
}

interface GateOverride {
  condition: OverrideCondition
  action: OverrideAction
  expiry?: string
  reason: string
  approved_by: string
}

interface OverrideCondition {
  branch_pattern?: string
  file_pattern?: string
  author?: string
  pr_labels?: string[]
  emergency?: boolean
}

const gateConfiguration: GateConfiguration = {
  version: '2.0.0',
  environments: {
    development: {
      enabled_gates: ['lint', 'type_check', 'unit_tests'],
      disabled_gates: ['security_scan', 'performance_tests'],
      threshold_overrides: {
        code_coverage: { minimum: 80 }, // Lower threshold for dev
      },
      notification_settings: {
        slack: false,
        email: false,
      },
    },
    staging: {
      enabled_gates: ['lint', 'type_check', 'unit_tests', 'integration_tests', 'security_scan'],
      disabled_gates: ['performance_tests'],
      threshold_overrides: {},
      notification_settings: {
        slack: true,
        email: false,
      },
    },
    production: {
      enabled_gates: [
        'lint',
        'type_check',
        'unit_tests',
        'integration_tests',
        'e2e_tests',
        'security_scan',
        'performance_tests',
        'bundle_size',
      ],
      disabled_gates: [],
      threshold_overrides: {},
      notification_settings: {
        slack: true,
        email: true,
      },
    },
  },
  global_settings: {
    parallel_execution: true,
    fail_fast: false,
    timeout_default: '10m',
    retry_attempts: 2,
  },
  overrides: [
    {
      condition: {
        branch_pattern: 'hotfix/*',
        emergency: true,
      },
      action: {
        skip_gates: ['performance_tests', 'e2e_tests'],
        reduce_thresholds: { code_coverage: 70 },
      },
      expiry: '2024-12-31T23:59:59Z',
      reason: 'Emergency hotfix deployment',
      approved_by: 'tech-lead',
    },
  ],
}

// Gate configuration manager
class GateConfigurationManager {
  private config: GateConfiguration

  constructor(config: GateConfiguration) {
    this.config = config
  }

  getGatesForEnvironment(environment: string): string[] {
    const envConfig = this.config.environments[environment]
    if (!envConfig) {
      throw new Error(`Unknown environment: ${environment}`)
    }

    return envConfig.enabled_gates.filter(gate => !envConfig.disabled_gates.includes(gate))
  }

  getThresholdsForEnvironment(environment: string): Record<string, any> {
    const envConfig = this.config.environments[environment]
    return {
      ...qualityThresholds,
      ...envConfig?.threshold_overrides,
    }
  }

  checkOverrides(context: GateContext): GateOverride[] {
    return this.config.overrides.filter(
      override =>
        this.matchesCondition(override.condition, context) && this.isNotExpired(override.expiry),
    )
  }

  private matchesCondition(condition: OverrideCondition, context: GateContext): boolean {
    if (condition.branch_pattern && !context.branch.match(condition.branch_pattern)) {
      return false
    }

    if (condition.author && context.author !== condition.author) {
      return false
    }

    if (
      condition.pr_labels &&
      !condition.pr_labels.every(label => context.pr_labels.includes(label))
    ) {
      return false
    }

    return true
  }

  private isNotExpired(expiry?: string): boolean {
    if (!expiry) return true
    return new Date(expiry) > new Date()
  }
}
```

## Notification and Reporting

### Gate Result Notifications

```typescript
interface NotificationService {
  sendGateResult(result: GateResult, context: GateContext): Promise<void>
  sendGateSummary(results: GateResult[], context: GateContext): Promise<void>
}

class SlackNotificationService implements NotificationService {
  private webhookUrl: string

  constructor(webhookUrl: string) {
    this.webhookUrl = webhookUrl
  }

  async sendGateResult(result: GateResult, context: GateContext): Promise<void> {
    if (result.status === 'passed') return // Only notify on failures/warnings

    const color = result.status === 'failed' ? 'danger' : 'warning'
    const emoji = result.status === 'failed' ? '❌' : '⚠️'

    const message = {
      attachments: [
        {
          color,
          title: `${emoji} Quality Gate: ${result.gate_id}`,
          fields: [
            {
              title: 'Status',
              value: result.status.toUpperCase(),
              short: true,
            },
            {
              title: 'Repository',
              value: context.repository,
              short: true,
            },
            {
              title: 'Branch',
              value: context.branch,
              short: true,
            },
            {
              title: 'Author',
              value: context.author,
              short: true,
            },
            {
              title: 'Failed Checks',
              value: result.summary.failed.toString(),
              short: true,
            },
            {
              title: 'Total Checks',
              value: result.summary.total.toString(),
              short: true,
            },
          ],
          footer: 'Quality Gates',
          ts: Math.floor(Date.now() / 1000),
        },
      ],
    }

    await fetch(this.webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(message),
    })
  }

  async sendGateSummary(results: GateResult[], context: GateContext): Promise<void> {
    const failedGates = results.filter(r => r.status === 'failed')
    const warningGates = results.filter(r => r.status === 'warning')

    if (failedGates.length === 0 && warningGates.length === 0) return

    const overallStatus = failedGates.length > 0 ? 'failed' : 'warning'
    const color = overallStatus === 'failed' ? 'danger' : 'warning'
    const emoji = overallStatus === 'failed' ? '🚫' : '⚠️'

    const message = {
      text: `${emoji} Quality Gate Summary`,
      attachments: [
        {
          color,
          title: 'Quality Gate Results',
          fields: [
            {
              title: 'Overall Status',
              value: overallStatus.toUpperCase(),
              short: true,
            },
            {
              title: 'Failed Gates',
              value: failedGates.length.toString(),
              short: true,
            },
            {
              title: 'Warning Gates',
              value: warningGates.length.toString(),
              short: true,
            },
            {
              title: 'Repository',
              value: `${context.repository}#${context.branch}`,
              short: false,
            },
          ],
        },
      ],
    }

    await fetch(this.webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(message),
    })
  }
}
```

## Related Concepts

- **Quality Standards**: Overall code quality framework and metrics
- **Testing Strategy**: Test automation and coverage requirements
- **Security Guidelines**: Security scanning and vulnerability management
- **Performance Patterns**: Performance testing and monitoring
- **Build Release**: Deployment pipeline and release automation

## Tools Integration

- **GitHub Actions**: CI/CD pipeline automation
- **ESLint**: JavaScript/TypeScript linting
- **Prettier**: Code formatting enforcement
- **Jest/Vitest**: Test execution and coverage
- **SonarQube**: Advanced code quality analysis
- **Snyk**: Security vulnerability scanning

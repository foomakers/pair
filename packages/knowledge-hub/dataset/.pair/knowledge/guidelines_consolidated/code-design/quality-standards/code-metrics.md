# Code Metrics

## Overview

Code metrics provide objective measurements of code quality, complexity, and maintainability. This guide covers essential metrics, their interpretation, and how to use them for continuous code quality improvement.

## Metrics Philosophy

### Measurement Strategy

Code metrics serve as health indicators, not absolute quality measures:

**Leading Indicators**: Metrics that predict future maintenance challenges
**Diagnostic Tools**: Help identify areas needing attention or refactoring
**Trend Analysis**: Track quality evolution over time
**Team Communication**: Provide common vocabulary for discussing code quality

### Context-Aware Interpretation

Metrics must be interpreted within context:

**Domain Complexity**: Business logic naturally has higher complexity
**Framework Constraints**: Some patterns increase metrics but improve maintainability
**Team Experience**: Metric targets should align with team capabilities
**Legacy Evolution**: Gradual improvement is more valuable than perfect scores

## Essential Code Metrics

### Complexity Metrics

**Cyclomatic Complexity**: Measures decision points and branching logic

```javascript
// Example: Calculating complexity
function processOrder(order, user, inventory) {
  // Complexity: 1 (base)

  if (!order.isValid()) {
    // +1
    throw new Error('Invalid order')
  }

  if (user.isPremium()) {
    // +1
    order.applyDiscount(0.1)
  }

  for (const item of order.items) {
    // +1
    if (!inventory.isAvailable(item)) {
      // +1
      throw new Error(`Item ${item.id} not available`)
    }
  }

  // Total complexity: 4
  return order.process()
}
```

**Cognitive Complexity**: Measures how difficult code is to understand

**Nesting Depth**: Indicates structural complexity and readability challenges

### Size Metrics

**Lines of Code (LOC)**: Basic size measurement with context considerations
**Function Length**: Indicates single responsibility adherence
**Class Size**: Suggests cohesion and responsibility distribution
**File Size**: Affects comprehensibility and module organization

### Quality Metrics

**Test Coverage**: Percentage of code exercised by tests

```bash
# Coverage reporting example
npm run test:coverage

# Output interpretation:
# Lines: 85.7% (214/249)     - Good coverage
# Functions: 90.2% (46/51)   - Excellent function coverage
# Branches: 78.3% (47/60)    - Moderate branch coverage
# Statements: 85.1% (212/249) - Good statement coverage
```

**Code Duplication**: Identifies repetitive code patterns
**Technical Debt Ratio**: Estimated time to fix issues vs. development time
**Maintainability Index**: Composite score of code maintainability

## Metric Implementation

### Automated Measurement

Configure automated metric collection in CI/CD pipeline:

```yaml
# .github/workflows/metrics.yml
name: Code Quality Metrics

on:
  push:
    branches: [main, develop]
  pull_request:
    branches: [main, develop]

jobs:
  metrics:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
        with:
          fetch-depth: 0 # Full history for trend analysis

      - name: Setup Node.js
        uses: actions/setup-node@v3
        with:
          node-version: '18'
          cache: 'npm'

      - name: Install dependencies
        run: npm ci

      # Complexity analysis
      - name: Complexity Analysis
        run: |
          npx plato -r -d metrics/complexity src/
          npx complexity-report -o metrics/complexity.json src/

      # Test coverage
      - name: Test Coverage
        run: |
          npm run test:coverage
          npx nyc report --reporter=json --report-dir=metrics/

      # Code duplication
      - name: Duplication Analysis
        run: |
          npx jscpd --output metrics/duplication/ src/

      # Technical debt
      - name: Technical Debt Analysis
        run: |
          npx sonarjs -o metrics/sonar.json src/

      # Aggregate metrics
      - name: Generate Metrics Report
        run: node scripts/aggregate-metrics.js

      - name: Upload Metrics Artifacts
        uses: actions/upload-artifact@v3
        with:
          name: code-metrics
          path: metrics/
```

### Metric Collection Script

Create comprehensive metric aggregation:

```javascript
// scripts/aggregate-metrics.js
const fs = require('fs')
const path = require('path')

class MetricsAggregator {
  constructor() {
    this.metricsDir = path.join(__dirname, '../metrics')
    this.report = {
      timestamp: new Date().toISOString(),
      commit: process.env.GITHUB_SHA || 'local',
      branch: process.env.GITHUB_REF_NAME || 'unknown',
      metrics: {},
    }
  }

  async aggregateComplexityMetrics() {
    try {
      const complexityFile = path.join(this.metricsDir, 'complexity.json')
      if (fs.existsSync(complexityFile)) {
        const complexity = JSON.parse(fs.readFileSync(complexityFile, 'utf8'))

        this.report.metrics.complexity = {
          average: this.calculateAverage(complexity.reports, 'complexity.cyclomatic'),
          maximum: Math.max(...complexity.reports.map(r => r.complexity.cyclomatic)),
          filesOverThreshold: complexity.reports.filter(r => r.complexity.cyclomatic > 10).length,
          totalFiles: complexity.reports.length,
        }
      }
    } catch (error) {
      console.warn('Complexity metrics not available:', error.message)
    }
  }

  async aggregateCoverageMetrics() {
    try {
      const coverageFile = path.join(this.metricsDir, 'coverage-summary.json')
      if (fs.existsExists(coverageFile)) {
        const coverage = JSON.parse(fs.readFileSync(coverageFile, 'utf8'))

        this.report.metrics.coverage = {
          lines: coverage.total.lines.pct,
          functions: coverage.total.functions.pct,
          branches: coverage.total.branches.pct,
          statements: coverage.total.statements.pct,
          uncoveredLines: coverage.total.lines.total - coverage.total.lines.covered,
        }
      }
    } catch (error) {
      console.warn('Coverage metrics not available:', error.message)
    }
  }

  // ... (additional methods for size, duplication metrics)

  generateQualityScore() {
    const metrics = this.report.metrics
    let score = 100

    // Coverage impact (30% weight)
    if (metrics.coverage) {
      const coverageScore = (metrics.coverage.lines + metrics.coverage.branches) / 2
      score = score * 0.7 + coverageScore * 0.3
    }

    // Complexity impact (25% weight)
    if (metrics.complexity) {
      const complexityPenalty = Math.min(metrics.complexity.average * 2, 30)
      score -= complexityPenalty * 0.25
    }

    this.report.qualityScore = Math.max(0, Math.round(score))
  }
}
```

## Metric Targets and Thresholds

### Coverage Targets

**Unit Test Coverage**:

- Minimum: 70% line coverage
- Target: 85% line coverage
- Aspirational: 90%+ line coverage

**Branch Coverage**:

- Minimum: 60% branch coverage
- Target: 75% branch coverage

**Function Coverage**:

- Minimum: 80% function coverage
- Target: 90% function coverage

### Complexity Thresholds

**Cyclomatic Complexity**:

- Simple: 1-5 (easy to understand and test)
- Moderate: 6-10 (more complex but manageable)
- Complex: 11-15 (should be refactored)
- Very Complex: 16+ (immediate refactoring needed)

**Function Length**:

- Ideal: < 20 lines
- Acceptable: 20-50 lines
- Review needed: 50-100 lines
- Refactor: > 100 lines

### Quality Gates

Set up automated quality gates based on metrics:

```javascript
// Quality gate evaluation example
class QualityGates {
  evaluateMetrics(metrics) {
    const results = { passed: [], failed: [], warnings: [] }

    // Coverage gates
    if (metrics.coverage.lines >= 70) {
      results.passed.push(`✅ Line coverage: ${metrics.coverage.lines}%`)
    } else {
      results.failed.push(`❌ Coverage too low: ${metrics.coverage.lines}%`)
    }

    // Complexity gates
    if (metrics.complexity.average <= 8) {
      results.passed.push(`✅ Average complexity: ${metrics.complexity.average}`)
    } else {
      results.warnings.push(`⚠️ High complexity: ${metrics.complexity.average}`)
    }

    return results
  }
}
```

## Metric Visualization

### Dashboard Creation

Create visual dashboards for metric trends:

```javascript
// Generate metric trends and dashboard
class MetricsDashboard {
  generateTrendChart(metric) {
    const data = this.historicalData.map(entry => ({
      date: new Date(entry.timestamp).toISOString().split('T')[0],
      value: this.extractMetricValue(entry.metrics, metric),
    }))

    return {
      metric,
      data,
      trend: this.calculateTrend(data),
      sparkline: this.generateSparkline(data),
    }
  }

  calculateTrend(data) {
    if (data.length < 2) return 'insufficient-data'

    const recent = data.slice(-5)
    const older = data.slice(-10, -5)

    const recentAvg = recent.reduce((sum, item) => sum + item.value, 0) / recent.length
    const olderAvg = older.reduce((sum, item) => sum + item.value, 0) / older.length

    if (recentAvg > olderAvg * 1.05) return 'improving'
    if (recentAvg < olderAvg * 0.95) return 'declining'
    return 'stable'
  }
}
```

## Best Practices Summary

### Metric Selection

- **Actionable Metrics**: Choose metrics that drive specific improvements
- **Context Awareness**: Interpret metrics within project and team context
- **Balanced Scorecard**: Use multiple metrics to avoid optimization paradoxes

### Implementation Strategy

- **Gradual Introduction**: Start with basic metrics and add sophistication over time
- **Team Training**: Ensure team understands metric meanings and implications
- **Regular Review**: Periodically assess metric relevance and thresholds

### Quality Culture

- **Continuous Improvement**: Use metrics to guide refactoring efforts
- **Shared Responsibility**: Make metrics visible and discuss in team meetings
- **Learning Focus**: Treat metrics as learning tools, not performance evaluations

### Tool Integration

- **Automation**: Integrate metric collection into CI/CD pipelines
- **Visualization**: Create dashboards for easy metric consumption
- **Alerting**: Set up notifications for significant metric changes

Code metrics provide objective insights into code quality, enabling teams to make data-driven decisions about refactoring, testing, and architectural improvements.

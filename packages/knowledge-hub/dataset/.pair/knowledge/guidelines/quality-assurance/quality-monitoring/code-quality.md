# Code Quality Monitoring

## 🎯 **PURPOSE**

Comprehensive framework for monitoring and maintaining code quality through automated metrics collection, continuous assessment, and proactive quality management across development teams and project lifecycles.

## 🔧 **CODE QUALITY METRICS FRAMEWORK**

### **Core Quality Dimensions**

#### Maintainability Metrics

- **Cyclomatic Complexity**: Measures code paths and decision points
- **Technical Debt Ratio**: Percentage of effort needed to fix quality issues
- **Code Duplication**: Percentage of duplicated code blocks
- **Documentation Coverage**: Ratio of documented functions/classes

#### Reliability Metrics

- **Bug Density**: Number of defects per lines of code
- **Test Coverage**: Percentage of code covered by tests
- **Defect Escape Rate**: Bugs found in production vs. total bugs
- **Mean Time to Recovery**: Average time to fix critical issues

#### Security Metrics

- **Security Vulnerabilities**: Number of security issues by severity
- **Dependency Vulnerabilities**: Third-party security risks
- **Security Test Coverage**: Percentage of security-critical code tested
- **Time to Security Fix**: Average resolution time for security issues

## 📊 **QUALITY MONITORING IMPLEMENTATION**

### **SonarQube Integration**

#### SonarQube Configuration

```json
{
  "sonar.projectKey": "my-project",
  "sonar.organization": "my-org",
  "sonar.sources": "src",
  "sonar.tests": "src",
  "sonar.test.inclusions": "**/*.test.ts,**/*.test.js,**/*.spec.ts,**/*.spec.js",
  "sonar.coverage.exclusions": "**/node_modules/**,**/dist/**,**/*.test.*,**/*.spec.*",
  "sonar.typescript.lcov.reportPaths": "coverage/lcov.info",
  "sonar.javascript.lcov.reportPaths": "coverage/lcov.info",
  "sonar.qualitygate.wait": true
}
```

#### Quality Gates Configuration

```javascript
// sonar-quality-gate.js
class SonarQualityGate {
  constructor(config) {
    this.sonarUrl = config.sonarUrl
    this.projectKey = config.projectKey
    this.token = config.token
    this.thresholds = {
      coverage: 80,
      duplicatedLinesDensity: 3,
      maintainabilityRating: 'A',
      reliabilityRating: 'A',
      securityRating: 'A',
      technicalDebt: '30min',
    }
  }

  async checkQualityGate() {
    try {
      const qualityGateStatus = await this.getQualityGateStatus()
      const metrics = await this.getProjectMetrics()

      const result = {
        status: qualityGateStatus.projectStatus.status,
        metrics: this.parseMetrics(metrics),
        conditions: qualityGateStatus.projectStatus.conditions || [],
        passed: qualityGateStatus.projectStatus.status === 'OK',
      }

      this.logResults(result)
      return result
    } catch (error) {
      console.error('Quality gate check failed:', error)
      throw error
    }
  }

  async getQualityGateStatus() {
    const response = await fetch(
      `${this.sonarUrl}/api/qualitygates/project_status?projectKey=${this.projectKey}`,
      {
        headers: {
          Authorization: `Bearer ${this.token}`,
        },
      },
    )
    return await response.json()
  }

  async getProjectMetrics() {
    const metricKeys = [
      'coverage',
      'duplicated_lines_density',
      'sqale_rating',
      'reliability_rating',
      'security_rating',
      'sqale_index',
      'bugs',
      'vulnerabilities',
      'code_smells',
    ].join(',')

    const response = await fetch(
      `${this.sonarUrl}/api/measures/component?component=${this.projectKey}&metricKeys=${metricKeys}`,
      {
        headers: {
          Authorization: `Bearer ${this.token}`,
        },
      },
    )
    return await response.json()
  }

  parseMetrics(metricsResponse) {
    const measures = metricsResponse.component.measures
    const metrics = {}

    measures.forEach(measure => {
      metrics[measure.metric] = measure.value
    })

    return {
      coverage: parseFloat(metrics.coverage || 0),
      duplication: parseFloat(metrics.duplicated_lines_density || 0),
      maintainability: metrics.sqale_rating,
      reliability: metrics.reliability_rating,
      security: metrics.security_rating,
      technicalDebt: metrics.sqale_index,
      bugs: parseInt(metrics.bugs || 0),
      vulnerabilities: parseInt(metrics.vulnerabilities || 0),
      codeSmells: parseInt(metrics.code_smells || 0),
    }
  }

  logResults(result) {
    console.log('Code Quality Assessment')
    console.log('======================')
    console.log(`Status: ${result.status}`)
    console.log(`Coverage: ${result.metrics.coverage}%`)
    console.log(`Duplication: ${result.metrics.duplication}%`)
    console.log(`Maintainability: ${result.metrics.maintainability}`)
    console.log(`Reliability: ${result.metrics.reliability}`)
    console.log(`Security: ${result.metrics.security}`)
    console.log(`Bugs: ${result.metrics.bugs}`)
    console.log(`Vulnerabilities: ${result.metrics.vulnerabilities}`)
    console.log(`Code Smells: ${result.metrics.codeSmells}`)

    if (!result.passed) {
      console.log('\nFailed Conditions:')
      result.conditions.forEach(condition => {
        if (condition.status === 'ERROR') {
          console.log(
            `❌ ${condition.metricKey}: ${condition.actualValue} (threshold: ${condition.operator} ${condition.errorThreshold})`,
          )
        }
      })
    }
  }
}

// Usage in CI/CD
const qualityGate = new SonarQualityGate({
  sonarUrl: process.env.SONAR_HOST_URL,
  projectKey: process.env.SONAR_PROJECT_KEY,
  token: process.env.SONAR_TOKEN,
})

qualityGate.checkQualityGate().then(result => {
  if (!result.passed) {
    process.exit(1)
  }
})
```

### **ESLint Quality Monitoring**

#### Advanced ESLint Configuration

```javascript
// eslint-quality-reporter.js
class ESLintQualityReporter {
  constructor() {
    this.severityWeights = {
      error: 10,
      warn: 5,
      info: 1,
    }
    this.qualityThresholds = {
      maxErrors: 0,
      maxWarnings: 10,
      maxQualityScore: 80, // Lower is better
    }
  }

  analyzeResults(results) {
    const analysis = {
      totalFiles: results.length,
      filesWithIssues: 0,
      totalIssues: 0,
      errorCount: 0,
      warningCount: 0,
      infoCount: 0,
      qualityScore: 0,
      ruleBreakdown: {},
      fileIssues: [],
    }

    results.forEach(result => {
      if (result.messages.length > 0) {
        analysis.filesWithIssues++

        const fileAnalysis = {
          filePath: result.filePath,
          errorCount: 0,
          warningCount: 0,
          issues: result.messages,
        }

        result.messages.forEach(message => {
          analysis.totalIssues++

          // Count by severity
          switch (message.severity) {
            case 2: // error
              analysis.errorCount++
              fileAnalysis.errorCount++
              break
            case 1: // warning
              analysis.warningCount++
              fileAnalysis.warningCount++
              break
            default:
              analysis.infoCount++
          }

          // Track rule breakdown
          const ruleId = message.ruleId || 'unknown'
          if (!analysis.ruleBreakdown[ruleId]) {
            analysis.ruleBreakdown[ruleId] = {
              count: 0,
              severity: message.severity === 2 ? 'error' : 'warning',
            }
          }
          analysis.ruleBreakdown[ruleId].count++
        })

        analysis.fileIssues.push(fileAnalysis)
      }
    })

    // Calculate quality score
    analysis.qualityScore =
      analysis.errorCount * this.severityWeights.error +
      analysis.warningCount * this.severityWeights.warn +
      analysis.infoCount * this.severityWeights.info

    analysis.passed = this.evaluateQuality(analysis)

    return analysis
  }

  evaluateQuality(analysis) {
    return (
      analysis.errorCount <= this.qualityThresholds.maxErrors &&
      analysis.warningCount <= this.qualityThresholds.maxWarnings &&
      analysis.qualityScore <= this.qualityThresholds.maxQualityScore
    )
  }

  generateReport(analysis) {
    console.log('ESLint Quality Report')
    console.log('====================')
    console.log(`Status: ${analysis.passed ? '✅ PASSED' : '❌ FAILED'}`)
    console.log(`Files analyzed: ${analysis.totalFiles}`)
    console.log(`Files with issues: ${analysis.filesWithIssues}`)
    console.log(`Total issues: ${analysis.totalIssues}`)
    console.log(`Errors: ${analysis.errorCount}`)
    console.log(`Warnings: ${analysis.warningCount}`)
    console.log(`Quality Score: ${analysis.qualityScore}`)

    if (Object.keys(analysis.ruleBreakdown).length > 0) {
      console.log('\nTop Rule Violations:')
      const sortedRules = Object.entries(analysis.ruleBreakdown)
        .sort(([, a], [, b]) => b.count - a.count)
        .slice(0, 10)

      sortedRules.forEach(([rule, data]) => {
        const emoji = data.severity === 'error' ? '🔴' : '🟡'
        console.log(`${emoji} ${rule}: ${data.count} violations`)
      })
    }

    if (analysis.fileIssues.length > 0) {
      console.log('\nFiles needing attention:')
      analysis.fileIssues
        .sort((a, b) => b.errorCount + b.warningCount - (a.errorCount + a.warningCount))
        .slice(0, 5)
        .forEach(file => {
          console.log(
            `📄 ${file.filePath}: ${file.errorCount} errors, ${file.warningCount} warnings`,
          )
        })
    }

    return analysis
  }

  trackTrends(currentAnalysis) {
    const historyFile = './quality-history.json'
    let history = []

    try {
      if (require('fs').existsSync(historyFile)) {
        history = JSON.parse(require('fs').readFileSync(historyFile, 'utf8'))
      }
    } catch (error) {
      console.warn('Could not read quality history:', error.message)
    }

    const entry = {
      timestamp: new Date().toISOString(),
      qualityScore: currentAnalysis.qualityScore,
      errorCount: currentAnalysis.errorCount,
      warningCount: currentAnalysis.warningCount,
      totalIssues: currentAnalysis.totalIssues,
      filesWithIssues: currentAnalysis.filesWithIssues,
    }

    history.push(entry)

    // Keep only last 100 entries
    if (history.length > 100) {
      history = history.slice(-100)
    }

    try {
      require('fs').writeFileSync(historyFile, JSON.stringify(history, null, 2))
    } catch (error) {
      console.warn('Could not write quality history:', error.message)
    }

    return this.analyzeTrends(history)
  }

  analyzeTrends(history) {
    if (history.length < 2) {
      return { trend: 'insufficient-data' }
    }

    const recent = history.slice(-10)
    const current = recent[recent.length - 1]
    const previous = recent[recent.length - 2]

    const qualityTrend = current.qualityScore - previous.qualityScore
    const errorTrend = current.errorCount - previous.errorCount

    return {
      trend: qualityTrend < 0 ? 'improving' : qualityTrend > 0 ? 'declining' : 'stable',
      qualityChange: qualityTrend,
      errorChange: errorTrend,
      averageQuality: recent.reduce((sum, entry) => sum + entry.qualityScore, 0) / recent.length,
    }
  }
}

// Integration with ESLint
const { ESLint } = require('eslint')

async function runQualityCheck() {
  const eslint = new ESLint()
  const results = await eslint.lintFiles(['src/**/*.{js,ts,jsx,tsx}'])

  const reporter = new ESLintQualityReporter()
  const analysis = reporter.analyzeResults(results)
  const report = reporter.generateReport(analysis)
  const trends = reporter.trackTrends(analysis)

  console.log(`\nTrend: ${trends.trend}`)
  if (trends.qualityChange !== 0) {
    console.log(`Quality change: ${trends.qualityChange > 0 ? '+' : ''}${trends.qualityChange}`)
  }

  return analysis.passed
}

if (require.main === module) {
  runQualityCheck().then(passed => {
    process.exit(passed ? 0 : 1)
  })
}
```

### **TypeScript Quality Monitoring**

#### TypeScript Compiler Metrics

```javascript
// typescript-quality-monitor.js
class TypeScriptQualityMonitor {
  constructor() {
    this.ts = require('typescript')
    this.qualityMetrics = {
      totalFiles: 0,
      typedFiles: 0,
      anyUsage: 0,
      strictViolations: 0,
      compilerErrors: 0,
      compilerWarnings: 0,
    }
  }

  analyzeProject(configPath = './tsconfig.json') {
    const configFile = this.ts.readConfigFile(configPath, this.ts.sys.readFile)
    const parsedConfig = this.ts.parseJsonConfigFileContent(
      configFile.config,
      this.ts.sys,
      require('path').dirname(configPath),
    )

    const program = this.ts.createProgram(parsedConfig.fileNames, parsedConfig.options)
    const typeChecker = program.getTypeChecker()

    this.qualityMetrics.totalFiles = program.getSourceFiles().length

    // Analyze each source file
    program.getSourceFiles().forEach(sourceFile => {
      if (!sourceFile.isDeclarationFile) {
        this.analyzeSourceFile(sourceFile, typeChecker)
      }
    })

    // Get compiler diagnostics
    const diagnostics = this.ts.getPreEmitDiagnostics(program)
    this.analyzeDiagnostics(diagnostics)

    return this.generateQualityReport()
  }

  analyzeSourceFile(sourceFile, typeChecker) {
    this.qualityMetrics.typedFiles++

    const analyzeNode = node => {
      // Check for 'any' usage
      if (this.ts.isTypeReferenceNode(node) && node.typeName.getText() === 'any') {
        this.qualityMetrics.anyUsage++
      }

      // Check for type assertions (potential type safety issues)
      if (this.ts.isTypeAssertionExpression(node) || this.ts.isAsExpression(node)) {
        this.qualityMetrics.strictViolations++
      }

      // Check for non-null assertions
      if (this.ts.isNonNullExpression(node)) {
        this.qualityMetrics.strictViolations++
      }

      this.ts.forEachChild(node, analyzeNode)
    }

    this.ts.forEachChild(sourceFile, analyzeNode)
  }

  analyzeDiagnostics(diagnostics) {
    diagnostics.forEach(diagnostic => {
      switch (diagnostic.category) {
        case this.ts.DiagnosticCategory.Error:
          this.qualityMetrics.compilerErrors++
          break
        case this.ts.DiagnosticCategory.Warning:
          this.qualityMetrics.compilerWarnings++
          break
      }
    })
  }

  generateQualityReport() {
    const typeStrength = this.calculateTypeStrength()
    const qualityScore = this.calculateQualityScore()

    const report = {
      ...this.qualityMetrics,
      typeStrength,
      qualityScore,
      passed: qualityScore >= 80,
      recommendations: this.generateRecommendations(),
    }

    this.logReport(report)
    return report
  }

  calculateTypeStrength() {
    if (this.qualityMetrics.typedFiles === 0) return 0

    const anyPenalty = (this.qualityMetrics.anyUsage / this.qualityMetrics.typedFiles) * 20
    const strictnessPenalty =
      (this.qualityMetrics.strictViolations / this.qualityMetrics.typedFiles) * 10

    return Math.max(0, 100 - anyPenalty - strictnessPenalty)
  }

  calculateQualityScore() {
    const typeStrength = this.calculateTypeStrength()
    const errorPenalty = this.qualityMetrics.compilerErrors * 5
    const warningPenalty = this.qualityMetrics.compilerWarnings * 2

    return Math.max(0, typeStrength - errorPenalty - warningPenalty)
  }

  generateRecommendations() {
    const recommendations = []

    if (this.qualityMetrics.anyUsage > 0) {
      recommendations.push({
        type: 'type-safety',
        message: `Reduce 'any' usage (${this.qualityMetrics.anyUsage} instances found)`,
        priority: 'high',
      })
    }

    if (this.qualityMetrics.strictViolations > 0) {
      recommendations.push({
        type: 'type-safety',
        message: `Review type assertions and non-null assertions (${this.qualityMetrics.strictViolations} found)`,
        priority: 'medium',
      })
    }

    if (this.qualityMetrics.compilerErrors > 0) {
      recommendations.push({
        type: 'compiler',
        message: `Fix TypeScript compiler errors (${this.qualityMetrics.compilerErrors} errors)`,
        priority: 'critical',
      })
    }

    return recommendations
  }

  logReport(report) {
    console.log('TypeScript Quality Report')
    console.log('========================')
    console.log(`Status: ${report.passed ? '✅ PASSED' : '❌ FAILED'}`)
    console.log(`Quality Score: ${report.qualityScore.toFixed(1)}/100`)
    console.log(`Type Strength: ${report.typeStrength.toFixed(1)}/100`)
    console.log(`Files Analyzed: ${report.typedFiles}`)
    console.log(`'any' Usage: ${report.anyUsage}`)
    console.log(`Strict Violations: ${report.strictViolations}`)
    console.log(`Compiler Errors: ${report.compilerErrors}`)
    console.log(`Compiler Warnings: ${report.compilerWarnings}`)

    if (report.recommendations.length > 0) {
      console.log('\nRecommendations:')
      report.recommendations.forEach(rec => {
        const priority =
          rec.priority === 'critical'
            ? '🔴'
            : rec.priority === 'high'
            ? '🟠'
            : rec.priority === 'medium'
            ? '🟡'
            : '🟢'
        console.log(`${priority} ${rec.message}`)
      })
    }
  }
}

// Usage
const monitor = new TypeScriptQualityMonitor()
const report = monitor.analyzeProject('./tsconfig.json')

if (!report.passed) {
  process.exit(1)
}
```

## 🔄 **CONTINUOUS QUALITY MONITORING**

### **Quality Dashboard Implementation**

#### Real-time Quality Metrics Dashboard

```javascript
// quality-dashboard.js
class QualityDashboard {
  constructor() {
    this.metrics = new Map()
    this.thresholds = {
      coverage: 80,
      duplication: 5,
      complexity: 10,
      maintainability: 'A',
      security: 'A',
    }
    this.setupRealTimeUpdates()
  }

  async updateMetrics() {
    try {
      // Collect metrics from various sources
      const metrics = await Promise.all([
        this.getCoverageMetrics(),
        this.getComplexityMetrics(),
        this.getDuplicationMetrics(),
        this.getSecurityMetrics(),
        this.getPerformanceMetrics(),
      ])

      const consolidatedMetrics = this.consolidateMetrics(metrics)
      this.updateDashboard(consolidatedMetrics)
      this.checkAlerts(consolidatedMetrics)

      return consolidatedMetrics
    } catch (error) {
      console.error('Failed to update quality metrics:', error)
    }
  }

  async getCoverageMetrics() {
    // Parse coverage reports
    const coverage = require('./coverage/coverage-summary.json')
    return {
      type: 'coverage',
      lines: coverage.total.lines.pct,
      statements: coverage.total.statements.pct,
      functions: coverage.total.functions.pct,
      branches: coverage.total.branches.pct,
    }
  }

  async getComplexityMetrics() {
    // Calculate cyclomatic complexity
    const complexity = await this.analyzeComplexity()
    return {
      type: 'complexity',
      average: complexity.average,
      max: complexity.max,
      violations: complexity.violations,
    }
  }

  consolidateMetrics(metricsArray) {
    const consolidated = {
      timestamp: new Date().toISOString(),
      overall: { score: 0, status: 'unknown' },
    }

    metricsArray.forEach(metric => {
      consolidated[metric.type] = metric
    })

    consolidated.overall = this.calculateOverallScore(consolidated)
    return consolidated
  }

  calculateOverallScore(metrics) {
    let totalScore = 0
    let weights = 0

    // Coverage score (weight: 30%)
    if (metrics.coverage) {
      const coverageScore = (metrics.coverage.lines / 100) * 100
      totalScore += coverageScore * 0.3
      weights += 0.3
    }

    // Complexity score (weight: 25%)
    if (metrics.complexity) {
      const complexityScore = Math.max(0, 100 - (metrics.complexity.average - 5) * 10)
      totalScore += complexityScore * 0.25
      weights += 0.25
    }

    // Additional metrics...

    const finalScore = weights > 0 ? totalScore / weights : 0

    return {
      score: Math.round(finalScore),
      status:
        finalScore >= 80
          ? 'excellent'
          : finalScore >= 60
          ? 'good'
          : finalScore >= 40
          ? 'needs-improvement'
          : 'poor',
    }
  }

  updateDashboard(metrics) {
    // Update dashboard UI or send to monitoring service
    console.log('Quality Metrics Updated:', {
      timestamp: metrics.timestamp,
      score: metrics.overall.score,
      status: metrics.overall.status,
    })

    // Send to monitoring service
    this.sendToMonitoring(metrics)
  }

  checkAlerts(metrics) {
    const alerts = []

    if (metrics.coverage && metrics.coverage.lines < this.thresholds.coverage) {
      alerts.push({
        type: 'coverage',
        severity: 'warning',
        message: `Code coverage below threshold: ${metrics.coverage.lines}% < ${this.thresholds.coverage}%`,
      })
    }

    if (metrics.complexity && metrics.complexity.average > this.thresholds.complexity) {
      alerts.push({
        type: 'complexity',
        severity: 'warning',
        message: `Average complexity too high: ${metrics.complexity.average} > ${this.thresholds.complexity}`,
      })
    }

    if (alerts.length > 0) {
      this.triggerAlerts(alerts)
    }
  }

  triggerAlerts(alerts) {
    alerts.forEach(alert => {
      console.warn(`Quality Alert [${alert.type}]: ${alert.message}`)

      // Send to alerting system
      if (process.env.SLACK_WEBHOOK) {
        this.sendSlackAlert(alert)
      }
    })
  }

  sendToMonitoring(metrics) {
    // Send metrics to monitoring service (e.g., DataDog, New Relic)
    if (process.env.MONITORING_ENDPOINT) {
      fetch(process.env.MONITORING_ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          metric: 'code.quality',
          value: metrics.overall.score,
          tags: [`status:${metrics.overall.status}`],
          timestamp: Date.now(),
        }),
      }).catch(console.error)
    }
  }

  setupRealTimeUpdates() {
    // Update metrics every 5 minutes
    setInterval(() => {
      this.updateMetrics()
    }, 5 * 60 * 1000)

    // Initial update
    this.updateMetrics()
  }
}

// Initialize dashboard
const dashboard = new QualityDashboard()
```

### **Quality Trend Analysis**

#### Historical Quality Tracking

```javascript
class QualityTrendAnalysis {
  constructor() {
    this.dataPoints = []
    this.trendWindow = 30 // days
  }

  addDataPoint(metrics) {
    this.dataPoints.push({
      timestamp: new Date(),
      ...metrics,
    })

    // Keep only recent data
    const cutoff = new Date(Date.now() - this.trendWindow * 24 * 60 * 60 * 1000)
    this.dataPoints = this.dataPoints.filter(point => point.timestamp > cutoff)
  }

  analyzeTrends() {
    if (this.dataPoints.length < 2) {
      return { status: 'insufficient-data' }
    }

    const trends = {
      overall: this.calculateTrend('overall.score'),
      coverage: this.calculateTrend('coverage.lines'),
      complexity: this.calculateTrend('complexity.average', true), // inverse trend
      security: this.calculateTrend('security.violations', true),
    }

    return {
      trends,
      summary: this.generateTrendSummary(trends),
      recommendations: this.generateTrendRecommendations(trends),
    }
  }

  calculateTrend(path, inverse = false) {
    const values = this.dataPoints.map(point => this.getNestedValue(point, path))
    const validValues = values.filter(v => v !== undefined && v !== null)

    if (validValues.length < 2) return { trend: 'unknown' }

    const slope = this.calculateSlope(validValues)
    const direction = inverse ? -slope : slope

    return {
      trend: direction > 0.1 ? 'improving' : direction < -0.1 ? 'declining' : 'stable',
      slope: direction,
      current: validValues[validValues.length - 1],
      average: validValues.reduce((a, b) => a + b, 0) / validValues.length,
    }
  }

  calculateSlope(values) {
    const n = values.length
    const x = Array.from({ length: n }, (_, i) => i)
    const xMean = x.reduce((a, b) => a + b, 0) / n
    const yMean = values.reduce((a, b) => a + b, 0) / n

    const numerator = x.reduce((sum, xi, i) => sum + (xi - xMean) * (values[i] - yMean), 0)
    const denominator = x.reduce((sum, xi) => sum + Math.pow(xi - xMean, 2), 0)

    return denominator === 0 ? 0 : numerator / denominator
  }

  getNestedValue(obj, path) {
    return path.split('.').reduce((current, key) => current?.[key], obj)
  }

  generateTrendSummary(trends) {
    const improving = Object.values(trends).filter(t => t.trend === 'improving').length
    const declining = Object.values(trends).filter(t => t.trend === 'declining').length
    const stable = Object.values(trends).filter(t => t.trend === 'stable').length

    if (improving > declining) return 'Quality is improving overall'
    if (declining > improving) return 'Quality needs attention - declining trend detected'
    return 'Quality metrics are stable'
  }

  generateTrendRecommendations(trends) {
    const recommendations = []

    if (trends.coverage.trend === 'declining') {
      recommendations.push({
        area: 'testing',
        priority: 'high',
        message:
          'Test coverage is declining. Consider adding more tests or reviewing uncovered code.',
      })
    }

    if (trends.complexity.trend === 'declining') {
      recommendations.push({
        area: 'refactoring',
        priority: 'medium',
        message: 'Code complexity is increasing. Consider refactoring complex functions.',
      })
    }

    return recommendations
  }
}
```

---

_Code quality monitoring provides continuous insight into codebase health, enabling proactive quality management and data-driven improvement decisions._

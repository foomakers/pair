# 📊 Test Reporting

**Focus**: Comprehensive test reporting, metrics, and analytics for automated testing

Guidelines for creating meaningful, actionable, and comprehensive test reports that provide insights into test results, quality metrics, and system health.

## 🎯 Test Reporting Framework

### Comprehensive Reporting System

````typescript
// ✅ Test reporting and analytics framework
class TestReportingFramework {
  private reportGenerator: ReportGenerator
  private metricsAnalyzer: MetricsAnalyzer
  private visualizationEngine: VisualizationEngine
  private notificationService: NotificationService

  constructor() {
    this.reportGenerator = new ReportGenerator()
    this.metricsAnalyzer = new MetricsAnalyzer()
    this.visualizationEngine = new VisualizationEngine()
    this.notificationService = new NotificationService()
  }

  /**
   * Generate comprehensive test report
   *
   * @example
   * ```typescript
   * const reporting = new TestReportingFramework();
   *
   * const report = await reporting.generateReport({
   *   executionResults: testResults,
   *   includeMetrics: true,
   *   includeVisualization: true,
   *   format: ['html', 'json', 'junit'],
   *   distribution: ['team', 'stakeholders']
   * });
   * ```
   */
  async generateReport(config: ReportConfig): Promise<TestReport> {
    try {
      // Analyze test results
      const analysis = await this.metricsAnalyzer.analyze(config.executionResults)

      // Generate base report
      const baseReport = await this.reportGenerator.generate(config.executionResults, analysis)

      // Add visualizations
      const visualizations = config.includeVisualization
        ? await this.visualizationEngine.create(analysis)
        : null

      // Create final report
      const report: TestReport = {
        metadata: {
          generated: new Date(),
          executionId: config.executionResults.executionId,
          version: '1.0.0',
          generator: 'TestReportingFramework',
        },
        summary: baseReport.summary,
        details: baseReport.details,
        metrics: analysis.metrics,
        visualizations,
        recommendations: analysis.recommendations,
      }

      // Generate output formats
      const outputs = await this.generateOutputs(report, config.format)

      // Distribute reports
      if (config.distribution) {
        await this.distributeReports(outputs, config.distribution)
      }

      return report
    } catch (error) {
      throw new TestReportingError(`Report generation failed: ${error.message}`, { config, error })
    }
  }
}

/**
 * HTML Report Generator
 */

export class HTMLReportGenerator {
  /**
   * Generate comprehensive HTML test report
   */
  static generateHTML(report: TestReport): string {
    return `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Test Report - ${report.metadata.executionId}</title>
    <style>
        ${this.getStyles()}
    </style>
    <script src="https://cdn.jsdelivr.net/npm/chart.js"></script>
</head>
<body>
    <header class="report-header">
        <h1>Test Execution Report</h1>
        <div class="metadata">
            <span>Execution ID: ${report.metadata.executionId}</span>
            <span>Generated: ${report.metadata.generated.toISOString()}</span>
            <span>Version: ${report.metadata.version}</span>
        </div>
    </header>

    <main class="report-content">
        <!-- Executive Summary -->
        <section class="summary">
            <h2>Executive Summary</h2>
            <div class="summary-grid">
                <div class="metric-card ${this.getStatusClass(report.summary.overallStatus)}">
                    <h3>Overall Status</h3>
                    <div class="metric-value">${report.summary.overallStatus}</div>
                </div>
                <div class="metric-card">
                    <h3>Total Tests</h3>
                    <div class="metric-value">${report.summary.totalTests}</div>
                </div>
                <div class="metric-card success">
                    <h3>Passed</h3>
                    <div class="metric-value">${report.summary.passed}</div>
                    <div class="metric-percentage">${(
                      (report.summary.passed / report.summary.totalTests) *
                      100
                    ).toFixed(1)}%</div>
                </div>
                <div class="metric-card ${report.summary.failed > 0 ? 'failure' : 'neutral'}">
                    <h3>Failed</h3>
                    <div class="metric-value">${report.summary.failed}</div>
                    <div class="metric-percentage">${(
                      (report.summary.failed / report.summary.totalTests) *
                      100
                    ).toFixed(1)}%</div>
                </div>
                <div class="metric-card">
                    <h3>Duration</h3>
                    <div class="metric-value">${this.formatDuration(report.summary.duration)}</div>
                </div>
                <div class="metric-card">
                    <h3>Coverage</h3>
                    <div class="metric-value">${report.metrics.coverage?.percentage || 'N/A'}%</div>
                </div>
            </div>
        </section>

        <!-- Test Results Charts -->
        <section class="charts">
            <h2>Test Results Overview</h2>
            <div class="charts-grid">
                <div class="chart-container">
                    <canvas id="resultsChart"></canvas>
                </div>
                <div class="chart-container">
                    <canvas id="durationChart"></canvas>
                </div>
            </div>
        </section>

        <!-- Detailed Results -->
        <section class="detailed-results">
            <h2>Detailed Test Results</h2>
            ${this.generateTestResultsTable(report.details.testResults)}
        </section>

        <!-- Coverage Report -->
        ${report.metrics.coverage ? this.generateCoverageSection(report.metrics.coverage) : ''}

        <!-- Performance Metrics -->
        ${
          report.metrics.performance
            ? this.generatePerformanceSection(report.metrics.performance)
            : ''
        }

        <!-- Failed Tests Analysis -->
        ${
          report.summary.failed > 0
            ? this.generateFailedTestsSection(report.details.failedTests)
            : ''
        }

        <!-- Trends and History -->
        ${report.metrics.trends ? this.generateTrendsSection(report.metrics.trends) : ''}

        <!-- Recommendations -->
        ${
          report.recommendations.length > 0
            ? this.generateRecommendationsSection(report.recommendations)
            : ''
        }
    </main>

    <footer class="report-footer">
        <p>Generated by ${
          report.metadata.generator
        } at ${report.metadata.generated.toISOString()}</p>
    </footer>

    <script>
        ${this.getJavaScript(report)}
    </script>
</body>
</html>`
  }

  private static getStyles(): string {
    return `
        * { margin: 0; padding: 0; box-sizing: border-box; }
        
        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            line-height: 1.6;
            color: #333;
            background: #f5f5f5;
        }
        
        .report-header {
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            color: white;
            padding: 2rem;
            text-align: center;
        }
        
        .report-header h1 { font-size: 2.5rem; margin-bottom: 1rem; }
        .metadata { display: flex; justify-content: center; gap: 2rem; font-size: 0.9rem; }
        
        .report-content {
            max-width: 1200px;
            margin: 0 auto;
            padding: 2rem;
            background: white;
            box-shadow: 0 0 20px rgba(0,0,0,0.1);
        }
        
        section { margin-bottom: 3rem; }
        h2 { color: #2c3e50; border-bottom: 2px solid #3498db; padding-bottom: 0.5rem; margin-bottom: 1.5rem; }
        
        .summary-grid {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
            gap: 1rem;
            margin-bottom: 2rem;
        }
        
        .metric-card {
            background: white;
            border: 1px solid #ddd;
            border-radius: 8px;
            padding: 1.5rem;
            text-align: center;
            box-shadow: 0 2px 10px rgba(0,0,0,0.1);
        }
        
        .metric-card h3 { color: #7f8c8d; font-size: 0.9rem; margin-bottom: 0.5rem; }
        .metric-value { font-size: 2rem; font-weight: bold; margin-bottom: 0.25rem; }
        .metric-percentage { font-size: 0.9rem; color: #7f8c8d; }
        
        .metric-card.success { border-left: 4px solid #27ae60; }
        .metric-card.success .metric-value { color: #27ae60; }
        
        .metric-card.failure { border-left: 4px solid #e74c3c; }
        .metric-card.failure .metric-value { color: #e74c3c; }
        
        .metric-card.warning { border-left: 4px solid #f39c12; }
        .metric-card.warning .metric-value { color: #f39c12; }
        
        .charts-grid {
            display: grid;
            grid-template-columns: 1fr 1fr;
            gap: 2rem;
        }
        
        .chart-container {
            background: white;
            padding: 1rem;
            border-radius: 8px;
            box-shadow: 0 2px 10px rgba(0,0,0,0.1);
        }
        
        .test-results-table {
            width: 100%;
            border-collapse: collapse;
            margin: 1rem 0;
        }
        
        .test-results-table th,
        .test-results-table td {
            padding: 0.75rem;
            text-align: left;
            border-bottom: 1px solid #ddd;
        }
        
        .test-results-table th {
            background: #f8f9fa;
            font-weight: 600;
        }
        
        .status-passed { color: #27ae60; font-weight: bold; }
        .status-failed { color: #e74c3c; font-weight: bold; }
        .status-skipped { color: #f39c12; font-weight: bold; }
        
        .report-footer {
            background: #2c3e50;
            color: white;
            text-align: center;
            padding: 1rem;
            font-size: 0.9rem;
        }
        
        .collapsible {
            cursor: pointer;
            padding: 1rem;
            background: #f8f9fa;
            border: none;
            text-align: left;
            width: 100%;
            font-size: 1rem;
        }
        
        .collapsible:hover { background: #e9ecef; }
        
        .content {
            padding: 0 1rem;
            display: none;
            background: white;
        }
        
        .content.active { display: block; }
    `
  }

  private static generateTestResultsTable(testResults: TestResult[]): string {
    return `
    <div class="table-container">
        <table class="test-results-table">
            <thead>
                <tr>
                    <th>Test Name</th>
                    <th>Suite</th>
                    <th>Status</th>
                    <th>Duration</th>
                    <th>Error</th>
                </tr>
            </thead>
            <tbody>
                ${testResults
                  .map(
                    test => `
                <tr>
                    <td>${test.name}</td>
                    <td>${test.suite}</td>
                    <td><span class="status-${test.status}">${test.status.toUpperCase()}</span></td>
                    <td>${this.formatDuration(test.duration)}</td>
                    <td>${
                      test.error
                        ? `<details><summary>View Error</summary><pre>${test.error}</pre></details>`
                        : '-'
                    }</td>
                </tr>
                `,
                  )
                  .join('')}
            </tbody>
        </table>
    </div>`
  }

  private static getJavaScript(report: TestReport): string {
    return `
        // Results Chart
        const resultsCtx = document.getElementById('resultsChart').getContext('2d');
        new Chart(resultsCtx, {
            type: 'doughnut',
            data: {
                labels: ['Passed', 'Failed', 'Skipped'],
                datasets: [{
                    data: [${report.summary.passed}, ${report.summary.failed}, ${
      report.summary.skipped || 0
    }],
                    backgroundColor: ['#27ae60', '#e74c3c', '#f39c12']
                }]
            },
            options: {
                responsive: true,
                plugins: {
                    title: { display: true, text: 'Test Results Distribution' }
                }
            }
        });
        
        // Collapsible sections
        document.querySelectorAll('.collapsible').forEach(button => {
            button.addEventListener('click', function() {
                this.classList.toggle('active');
                const content = this.nextElementSibling;
                content.classList.toggle('active');
            });
        });
    `
  }

  private static formatDuration(ms: number): string {
    if (ms < 1000) return `${ms}ms`
    if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`
    return `${Math.floor(ms / 60000)}m ${Math.floor((ms % 60000) / 1000)}s`
  }

  private static getStatusClass(status: string): string {
    switch (status.toLowerCase()) {
      case 'passed':
        return 'success'
      case 'failed':
        return 'failure'
      case 'warning':
        return 'warning'
      default:
        return 'neutral'
    }
  }

  private static generateCoverageSection(coverage: CoverageMetrics): string {
    return `
    <section class="coverage-section">
        <h2>Code Coverage</h2>
        <div class="coverage-grid">
            <div class="coverage-item">
                <h3>Lines</h3>
                <div class="coverage-bar">
                    <div class="coverage-fill" style="width: ${coverage.lines.percentage}%"></div>
                </div>
                <span>${coverage.lines.covered}/${coverage.lines.total} (${coverage.lines.percentage}%)</span>
            </div>
            <div class="coverage-item">
                <h3>Functions</h3>
                <div class="coverage-bar">
                    <div class="coverage-fill" style="width: ${coverage.functions.percentage}%"></div>
                </div>
                <span>${coverage.functions.covered}/${coverage.functions.total} (${coverage.functions.percentage}%)</span>
            </div>
            <div class="coverage-item">
                <h3>Branches</h3>
                <div class="coverage-bar">
                    <div class="coverage-fill" style="width: ${coverage.branches.percentage}%"></div>
                </div>
                <span>${coverage.branches.covered}/${coverage.branches.total} (${coverage.branches.percentage}%)</span>
            </div>
        </div>
    </section>`
  }

  private static generatePerformanceSection(performance: PerformanceMetrics): string {
    return `
    <section class="performance-section">
        <h2>Performance Metrics</h2>
        <div class="performance-grid">
            <div class="metric-card">
                <h3>Average Response Time</h3>
                <div class="metric-value">${performance.averageResponseTime}ms</div>
            </div>
            <div class="metric-card">
                <h3>95th Percentile</h3>
                <div class="metric-value">${performance.p95ResponseTime}ms</div>
            </div>
            <div class="metric-card">
                <h3>Throughput</h3>
                <div class="metric-value">${performance.throughput} req/s</div>
            </div>
            <div class="metric-card">
                <h3>Error Rate</h3>
                <div class="metric-value">${performance.errorRate}%</div>
            </div>
        </div>
    </section>`
  }

  private static generateFailedTestsSection(failedTests: FailedTest[]): string {
    return `
    <section class="failed-tests-section">
        <h2>Failed Tests Analysis</h2>
        ${failedTests
          .map(
            test => `
        <div class="failed-test">
            <button class="collapsible">${test.name} - ${test.error.type}</button>
            <div class="content">
                <p><strong>Error Message:</strong> ${test.error.message}</p>
                <p><strong>Stack Trace:</strong></p>
                <pre>${test.error.stackTrace}</pre>
                ${
                  test.screenshots
                    ? `<p><strong>Screenshots:</strong> ${test.screenshots.length} captured</p>`
                    : ''
                }
            </div>
        </div>
        `,
          )
          .join('')}
    </section>`
  }

  private static generateTrendsSection(trends: TrendMetrics): string {
    return `
    <section class="trends-section">
        <h2>Trends & History</h2>
        <div class="trends-grid">
            <div class="trend-item">
                <h3>Success Rate Trend</h3>
                <div class="trend-value ${trends.successRate.direction}">${
      trends.successRate.current
    }%</div>
                <span class="trend-change">${trends.successRate.change > 0 ? '+' : ''}${
      trends.successRate.change
    }% from last run</span>
            </div>
            <div class="trend-item">
                <h3>Execution Time Trend</h3>
                <div class="trend-value ${trends.executionTime.direction}">${this.formatDuration(
      trends.executionTime.current,
    )}</div>
                <span class="trend-change">${trends.executionTime.change > 0 ? '+' : ''}${
      trends.executionTime.change
    }% from last run</span>
            </div>
        </div>
    </section>`
  }

  private static generateRecommendationsSection(recommendations: Recommendation[]): string {
    return `
    <section class="recommendations-section">
        <h2>Recommendations</h2>
        ${recommendations
          .map(
            rec => `
        <div class="recommendation ${rec.priority}">
            <h3>${rec.title}</h3>
            <p>${rec.description}</p>
            ${
              rec.actions.length > 0
                ? `
            <ul>
                ${rec.actions.map(action => `<li>${action}</li>`).join('')}
            </ul>
            `
                : ''
            }
        </div>
        `,
          )
          .join('')}
    </section>`
  }
}

/**
 * JUnit XML Report Generator
 */

export class JUnitReportGenerator {
  /**
   * Generate JUnit XML format report
   */
  static generateXML(testResults: TestResult[]): string {
    const totalTests = testResults.length
    const failures = testResults.filter(t => t.status === 'failed').length
    const errors = testResults.filter(t => t.status === 'error').length
    const skipped = testResults.filter(t => t.status === 'skipped').length
    const time = testResults.reduce((sum, t) => sum + t.duration, 0) / 1000 // Convert to seconds

    return `<?xml version="1.0" encoding="UTF-8"?>
<testsuites tests="${totalTests}" failures="${failures}" errors="${errors}" time="${time}">
  ${this.groupBySuite(testResults)
    .map(suite => this.generateTestSuite(suite))
    .join('\n  ')}
</testsuites>`
  }

  private static groupBySuite(testResults: TestResult[]): TestSuite[] {
    const suites = new Map<string, TestResult[]>()

    testResults.forEach(test => {
      const suiteName = test.suite || 'default'
      if (!suites.has(suiteName)) {
        suites.set(suiteName, [])
      }
      suites.get(suiteName)!.push(test)
    })

    return Array.from(suites.entries()).map(([name, tests]) => ({
      name,
      tests,
    }))
  }

  private static generateTestSuite(suite: TestSuite): string {
    const tests = suite.tests.length
    const failures = suite.tests.filter(t => t.status === 'failed').length
    const errors = suite.tests.filter(t => t.status === 'error').length
    const skipped = suite.tests.filter(t => t.status === 'skipped').length
    const time = suite.tests.reduce((sum, t) => sum + t.duration, 0) / 1000

    return `<testsuite name="${
      suite.name
    }" tests="${tests}" failures="${failures}" errors="${errors}" skipped="${skipped}" time="${time}">
    ${suite.tests.map(test => this.generateTestCase(test)).join('\n    ')}
  </testsuite>`
  }

  private static generateTestCase(test: TestResult): string {
    const time = test.duration / 1000
    let testCase = `<testcase name="${this.escapeXML(test.name)}" classname="${this.escapeXML(
      test.suite || 'default',
    )}" time="${time}">`

    if (test.status === 'failed') {
      testCase += `\n      <failure message="${this.escapeXML(
        test.error || 'Test failed',
      )}">${this.escapeXML(test.output || '')}</failure>`
    } else if (test.status === 'error') {
      testCase += `\n      <error message="${this.escapeXML(
        test.error || 'Test error',
      )}">${this.escapeXML(test.output || '')}</error>`
    } else if (test.status === 'skipped') {
      testCase += `\n      <skipped message="Test skipped"/>`
    }

    testCase += '\n    </testcase>'
    return testCase
  }

  private static escapeXML(str: string): string {
    return str
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;')
  }
}

/**
 * Metrics Analysis Engine
 */

export class MetricsAnalyzer {
  /**
   * Analyze test execution results and generate insights
   */
  async analyze(executionResults: ExecutionResults): Promise<MetricsAnalysis> {
    const basicMetrics = this.calculateBasicMetrics(executionResults)
    const performance = this.analyzePerformance(executionResults)
    const coverage = this.analyzeCoverage(executionResults)
    const trends = await this.analyzeTrends(executionResults)
    const recommendations = this.generateRecommendations(
      basicMetrics,
      performance,
      coverage,
      trends,
    )

    return {
      metrics: {
        basic: basicMetrics,
        performance,
        coverage,
        trends,
      },
      recommendations,
      insights: this.generateInsights(basicMetrics, performance, coverage, trends),
    }
  }

  private calculateBasicMetrics(results: ExecutionResults): BasicMetrics {
    const totalTests = results.testResults.length
    const passed = results.testResults.filter(t => t.status === 'passed').length
    const failed = results.testResults.filter(t => t.status === 'failed').length
    const skipped = results.testResults.filter(t => t.status === 'skipped').length
    const errors = results.testResults.filter(t => t.status === 'error').length

    return {
      totalTests,
      passed,
      failed,
      skipped,
      errors,
      passRate: (passed / totalTests) * 100,
      failRate: (failed / totalTests) * 100,
      duration: results.totalDuration,
      averageTestDuration: results.totalDuration / totalTests,
    }
  }

  private analyzePerformance(results: ExecutionResults): PerformanceAnalysis {
    const durations = results.testResults.map(t => t.duration)
    durations.sort((a, b) => a - b)

    return {
      averageDuration: durations.reduce((sum, d) => sum + d, 0) / durations.length,
      medianDuration: durations[Math.floor(durations.length / 2)],
      p95Duration: durations[Math.floor(durations.length * 0.95)],
      minDuration: Math.min(...durations),
      maxDuration: Math.max(...durations),
      slowestTests: results.testResults.sort((a, b) => b.duration - a.duration).slice(0, 10),
      flakyTests: this.identifyFlakyTests(results.testResults),
    }
  }

  private analyzeCoverage(results: ExecutionResults): CoverageAnalysis {
    if (!results.coverage) {
      return null
    }

    return {
      overall: results.coverage.percentage,
      lines: results.coverage.lines,
      functions: results.coverage.functions,
      branches: results.coverage.branches,
      statements: results.coverage.statements,
      uncoveredFiles: results.coverage.uncoveredFiles || [],
      coverageByFile: results.coverage.filesCoverage || {},
    }
  }

  private async analyzeTrends(results: ExecutionResults): Promise<TrendAnalysis> {
    // This would typically fetch historical data from a database
    // For now, returning mock trend data
    return {
      successRate: {
        current: 85.5,
        previous: 82.3,
        change: 3.2,
        direction: 'up',
        trend: 'improving',
      },
      executionTime: {
        current: results.totalDuration,
        previous: results.totalDuration * 1.1,
        change: -9.1,
        direction: 'down',
        trend: 'improving',
      },
      testCount: {
        current: results.testResults.length,
        previous: results.testResults.length - 5,
        change: 5,
        direction: 'up',
        trend: 'stable',
      },
    }
  }

  private generateRecommendations(
    basic: BasicMetrics,
    performance: PerformanceAnalysis,
    coverage: CoverageAnalysis,
    trends: TrendAnalysis,
  ): Recommendation[] {
    const recommendations: Recommendation[] = []

    // Coverage recommendations
    if (coverage && coverage.overall < 80) {
      recommendations.push({
        type: 'coverage',
        priority: 'high',
        title: 'Improve Code Coverage',
        description: `Current coverage is ${coverage.overall}%. Consider adding tests for uncovered code paths.`,
        actions: [
          'Review uncovered files and add unit tests',
          'Focus on critical business logic coverage',
          'Set up coverage gates in CI/CD pipeline',
        ],
      })
    }

    // Performance recommendations
    if (performance.p95Duration > 30000) {
      // 30 seconds
      recommendations.push({
        type: 'performance',
        priority: 'medium',
        title: 'Optimize Slow Tests',
        description: 'Some tests are taking longer than 30 seconds. Consider optimization.',
        actions: [
          'Review and optimize the slowest tests',
          'Consider test parallelization',
          'Mock external dependencies to reduce execution time',
        ],
      })
    }

    // Flaky test recommendations
    if (performance.flakyTests.length > 0) {
      recommendations.push({
        type: 'reliability',
        priority: 'high',
        title: 'Fix Flaky Tests',
        description: `${performance.flakyTests.length} flaky tests detected. These reduce confidence in the test suite.`,
        actions: [
          'Investigate and fix flaky test root causes',
          'Add proper waits and assertions',
          'Consider test isolation improvements',
        ],
      })
    }

    // Trend-based recommendations
    if (trends.successRate.trend === 'declining') {
      recommendations.push({
        type: 'quality',
        priority: 'high',
        title: 'Address Declining Success Rate',
        description: 'Test success rate has been declining. Investigate recent changes.',
        actions: [
          'Review recent commits for potential issues',
          'Check for environmental factors affecting tests',
          'Consider test maintenance and updates',
        ],
      })
    }

    return recommendations
  }

  private generateInsights(
    basic: BasicMetrics,
    performance: PerformanceAnalysis,
    coverage: CoverageAnalysis,
    trends: TrendAnalysis,
  ): TestInsight[] {
    const insights: TestInsight[] = []

    // Success rate insight
    insights.push({
      type: 'success-rate',
      title: 'Test Success Rate',
      value: `${basic.passRate.toFixed(1)}%`,
      status: basic.passRate >= 95 ? 'good' : basic.passRate >= 80 ? 'warning' : 'poor',
      description: `${basic.passed} out of ${basic.totalTests} tests passed`,
    })

    // Performance insight
    insights.push({
      type: 'performance',
      title: 'Average Test Duration',
      value: this.formatDuration(performance.averageDuration),
      status:
        performance.averageDuration < 5000
          ? 'good'
          : performance.averageDuration < 10000
          ? 'warning'
          : 'poor',
      description: `Tests are running ${
        performance.averageDuration < 5000 ? 'quickly' : 'slowly'
      } on average`,
    })

    // Coverage insight
    if (coverage) {
      insights.push({
        type: 'coverage',
        title: 'Code Coverage',
        value: `${coverage.overall}%`,
        status: coverage.overall >= 80 ? 'good' : coverage.overall >= 60 ? 'warning' : 'poor',
        description: `Code coverage is ${
          coverage.overall >= 80 ? 'adequate' : 'below recommended levels'
        }`,
      })
    }

    return insights
  }

  private identifyFlakyTests(testResults: TestResult[]): FlakyTest[] {
    // In a real implementation, this would analyze historical data
    // For now, return tests that have inconsistent results
    return testResults
      .filter(test => test.metadata?.flaky === true)
      .map(test => ({
        name: test.name,
        suite: test.suite,
        flakyScore: test.metadata?.flakyScore || 0.5,
        lastFailures: test.metadata?.lastFailures || [],
      }))
  }

  private formatDuration(ms: number): string {
    if (ms < 1000) return `${ms}ms`
    if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`
    return `${Math.floor(ms / 60000)}m ${Math.floor((ms % 60000) / 1000)}s`
  }
}

/**
 * Real-time Dashboard Generator
 */

export class RealtimeDashboard {
  private websocketServer: WebSocketServer
  private metricsCollector: RealtimeMetricsCollector

  constructor() {
    this.websocketServer = new WebSocketServer()
    this.metricsCollector = new RealtimeMetricsCollector()
  }

  /**
   * Generate real-time dashboard for live test execution
   */
  generateDashboard(): string {
    return `
<!DOCTYPE html>
<html>
<head>
    <title>Real-time Test Dashboard</title>
    <style>
        ${this.getDashboardStyles()}
    </style>
</head>
<body>
    <div class="dashboard">
        <header class="dashboard-header">
            <h1>Live Test Execution</h1>
            <div class="status-indicator" id="connectionStatus">
                <span class="status-dot"></span>
                <span>Connected</span>
            </div>
        </header>
        
        <div class="metrics-grid">
            <div class="metric-tile" id="overallProgress">
                <h3>Overall Progress</h3>
                <div class="progress-bar">
                    <div class="progress-fill" id="progressFill"></div>
                </div>
                <div class="progress-text" id="progressText">0 / 0</div>
            </div>
            
            <div class="metric-tile" id="currentTest">
                <h3>Current Test</h3>
                <div class="current-test-name" id="currentTestName">Waiting...</div>
                <div class="current-test-suite" id="currentTestSuite"></div>
            </div>
            
            <div class="metric-tile success" id="passedTests">
                <h3>Passed</h3>
                <div class="metric-value" id="passedCount">0</div>
            </div>
            
            <div class="metric-tile failure" id="failedTests">
                <h3>Failed</h3>
                <div class="metric-value" id="failedCount">0</div>
            </div>
            
            <div class="metric-tile" id="duration">
                <h3>Duration</h3>
                <div class="metric-value" id="durationValue">00:00</div>
            </div>
            
            <div class="metric-tile" id="eta">
                <h3>ETA</h3>
                <div class="metric-value" id="etaValue">--:--</div>
            </div>
        </div>
        
        <div class="test-stream">
            <h2>Test Results Stream</h2>
            <div class="stream-container" id="testStream">
                <!-- Real-time test results will appear here -->
            </div>
        </div>
    </div>
    
    <script>
        ${this.getDashboardJavaScript()}
    </script>
</body>
</html>`
  }

  private getDashboardStyles(): string {
    return `
        * { margin: 0; padding: 0; box-sizing: border-box; }
        
        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            background: #1a1a1a;
            color: white;
            line-height: 1.6;
        }
        
        .dashboard {
            max-width: 1400px;
            margin: 0 auto;
            padding: 2rem;
        }
        
        .dashboard-header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            margin-bottom: 2rem;
            padding-bottom: 1rem;
            border-bottom: 1px solid #333;
        }
        
        .status-indicator {
            display: flex;
            align-items: center;
            gap: 0.5rem;
        }
        
        .status-dot {
            width: 12px;
            height: 12px;
            border-radius: 50%;
            background: #27ae60;
            animation: pulse 2s infinite;
        }
        
        @keyframes pulse {
            0% { opacity: 1; }
            50% { opacity: 0.5; }
            100% { opacity: 1; }
        }
        
        .metrics-grid {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
            gap: 1.5rem;
            margin-bottom: 2rem;
        }
        
        .metric-tile {
            background: #2a2a2a;
            border: 1px solid #333;
            border-radius: 12px;
            padding: 1.5rem;
            text-align: center;
        }
        
        .metric-tile h3 {
            color: #888;
            font-size: 0.9rem;
            margin-bottom: 1rem;
        }
        
        .metric-value {
            font-size: 2.5rem;
            font-weight: bold;
        }
        
        .metric-tile.success { border-color: #27ae60; }
        .metric-tile.success .metric-value { color: #27ae60; }
        
        .metric-tile.failure { border-color: #e74c3c; }
        .metric-tile.failure .metric-value { color: #e74c3c; }
        
        .progress-bar {
            width: 100%;
            height: 8px;
            background: #333;
            border-radius: 4px;
            overflow: hidden;
            margin-bottom: 0.5rem;
        }
        
        .progress-fill {
            height: 100%;
            background: linear-gradient(90deg, #3498db, #2ecc71);
            width: 0%;
            transition: width 0.3s ease;
        }
        
        .test-stream {
            background: #2a2a2a;
            border: 1px solid #333;
            border-radius: 12px;
            padding: 1.5rem;
        }
        
        .stream-container {
            max-height: 400px;
            overflow-y: auto;
            margin-top: 1rem;
        }
        
        .test-result-item {
            display: flex;
            justify-content: space-between;
            align-items: center;
            padding: 0.75rem;
            border-bottom: 1px solid #333;
            animation: slideIn 0.3s ease;
        }
        
        @keyframes slideIn {
            from { opacity: 0; transform: translateX(-20px); }
            to { opacity: 1; transform: translateX(0); }
        }
        
        .test-name { flex: 1; }
        .test-status { 
            padding: 0.25rem 0.75rem;
            border-radius: 4px;
            font-size: 0.8rem;
            font-weight: bold;
        }
        
        .test-status.passed { background: #27ae60; }
        .test-status.failed { background: #e74c3c; }
        .test-status.running { background: #3498db; }
    `
  }

  private getDashboardJavaScript(): string {
    return `
        class RealtimeDashboard {
            constructor() {
                this.ws = null;
                this.startTime = Date.now();
                this.connect();
            }
            
            connect() {
                this.ws = new WebSocket('ws://localhost:8080/dashboard');
                
                this.ws.onopen = () => {
                    console.log('Connected to test dashboard');
                };
                
                this.ws.onmessage = (event) => {
                    const data = JSON.parse(event.data);
                    this.updateDashboard(data);
                };
                
                this.ws.onclose = () => {
                    console.log('Disconnected from test dashboard');
                    setTimeout(() => this.connect(), 5000);
                };
            }
            
            updateDashboard(data) {
                // Update progress
                if (data.progress) {
                    const progressFill = document.getElementById('progressFill');
                    const progressText = document.getElementById('progressText');
                    const percentage = (data.progress.completed / data.progress.total) * 100;
                    
                    progressFill.style.width = percentage + '%';
                    progressText.textContent = \`\${data.progress.completed} / \${data.progress.total}\`;
                }
                
                // Update current test
                if (data.currentTest) {
                    document.getElementById('currentTestName').textContent = data.currentTest.name;
                    document.getElementById('currentTestSuite').textContent = data.currentTest.suite;
                }
                
                // Update counters
                if (data.results) {
                    document.getElementById('passedCount').textContent = data.results.passed;
                    document.getElementById('failedCount').textContent = data.results.failed;
                }
                
                // Update duration
                const duration = Date.now() - this.startTime;
                document.getElementById('durationValue').textContent = this.formatDuration(duration);
                
                // Add test result to stream
                if (data.testResult) {
                    this.addTestResult(data.testResult);
                }
            }
            
            addTestResult(testResult) {
                const stream = document.getElementById('testStream');
                const item = document.createElement('div');
                item.className = 'test-result-item';
                
                item.innerHTML = \`
                    <span class="test-name">\${testResult.name}</span>
                    <span class="test-status \${testResult.status}">\${testResult.status.toUpperCase()}</span>
                \`;
                
                stream.insertBefore(item, stream.firstChild);
                
                // Keep only last 50 results
                while (stream.children.length > 50) {
                    stream.removeChild(stream.lastChild);
                }
            }
            
            formatDuration(ms) {
                const seconds = Math.floor(ms / 1000);
                const minutes = Math.floor(seconds / 60);
                const remainingSeconds = seconds % 60;
                return \`\${minutes.toString().padStart(2, '0')}:\${remainingSeconds.toString().padStart(2, '0')}\`;
            }
        }
        
        new RealtimeDashboard();
    `
  }
}

// Supporting interfaces and types
interface ReportConfig {
  readonly executionResults: ExecutionResults
  readonly includeMetrics?: boolean
  readonly includeVisualization?: boolean
  readonly format: ('html' | 'json' | 'junit' | 'pdf')[]
  readonly distribution?: string[]
}

interface TestReport {
  readonly metadata: ReportMetadata
  readonly summary: TestSummary
  readonly details: TestDetails
  readonly metrics: ReportMetrics
  readonly visualizations?: Visualization[]
  readonly recommendations: Recommendation[]
}

interface ReportMetadata {
  readonly generated: Date
  readonly executionId: string
  readonly version: string
  readonly generator: string
}

interface TestSummary {
  readonly totalTests: number
  readonly passed: number
  readonly failed: number
  readonly skipped?: number
  readonly duration: number
  readonly overallStatus: 'passed' | 'failed' | 'warning'
}

interface TestDetails {
  readonly testResults: TestResult[]
  readonly failedTests?: FailedTest[]
  readonly slowestTests?: TestResult[]
}

interface TestResult {
  readonly name: string
  readonly suite: string
  readonly status: 'passed' | 'failed' | 'skipped' | 'error'
  readonly duration: number
  readonly error?: string
  readonly output?: string
  readonly screenshots?: string[]
  readonly metadata?: any
}

interface FailedTest {
  readonly name: string
  readonly suite: string
  readonly error: {
    type: string
    message: string
    stackTrace: string
  }
  readonly screenshots?: string[]
}

interface ReportMetrics {
  readonly coverage?: CoverageMetrics
  readonly performance?: PerformanceMetrics
  readonly trends?: TrendMetrics
}

interface CoverageMetrics {
  readonly percentage: number
  readonly lines: { covered: number; total: number; percentage: number }
  readonly functions: { covered: number; total: number; percentage: number }
  readonly branches: { covered: number; total: number; percentage: number }
  readonly statements: { covered: number; total: number; percentage: number }
}

interface PerformanceMetrics {
  readonly averageResponseTime: number
  readonly p95ResponseTime: number
  readonly throughput: number
  readonly errorRate: number
}

interface TrendMetrics {
  readonly successRate: {
    current: number
    change: number
    direction: 'up' | 'down' | 'stable'
  }
  readonly executionTime: {
    current: number
    change: number
    direction: 'up' | 'down' | 'stable'
  }
}

interface Recommendation {
  readonly type: string
  readonly priority: 'low' | 'medium' | 'high'
  readonly title: string
  readonly description: string
  readonly actions: string[]
}

interface Visualization {
  readonly type: 'chart' | 'graph' | 'table'
  readonly title: string
  readonly data: any
  readonly config: any
}

interface ExecutionResults {
  readonly executionId: string
  readonly testResults: TestResult[]
  readonly totalDuration: number
  readonly coverage?: any
}

interface MetricsAnalysis {
  readonly metrics: {
    basic: BasicMetrics
    performance: PerformanceAnalysis
    coverage: CoverageAnalysis
    trends: TrendAnalysis
  }
  readonly recommendations: Recommendation[]
  readonly insights: TestInsight[]
}

interface BasicMetrics {
  readonly totalTests: number
  readonly passed: number
  readonly failed: number
  readonly skipped: number
  readonly errors: number
  readonly passRate: number
  readonly failRate: number
  readonly duration: number
  readonly averageTestDuration: number
}

interface PerformanceAnalysis {
  readonly averageDuration: number
  readonly medianDuration: number
  readonly p95Duration: number
  readonly minDuration: number
  readonly maxDuration: number
  readonly slowestTests: TestResult[]
  readonly flakyTests: FlakyTest[]
}

interface CoverageAnalysis {
  readonly overall: number
  readonly lines: any
  readonly functions: any
  readonly branches: any
  readonly statements: any
  readonly uncoveredFiles: string[]
  readonly coverageByFile: { [file: string]: number }
}

interface TrendAnalysis {
  readonly successRate: TrendData
  readonly executionTime: TrendData
  readonly testCount: TrendData
}

interface TrendData {
  readonly current: number
  readonly previous: number
  readonly change: number
  readonly direction: 'up' | 'down' | 'stable'
  readonly trend: 'improving' | 'declining' | 'stable'
}

interface TestInsight {
  readonly type: string
  readonly title: string
  readonly value: string
  readonly status: 'good' | 'warning' | 'poor'
  readonly description: string
}

interface FlakyTest {
  readonly name: string
  readonly suite: string
  readonly flakyScore: number
  readonly lastFailures: string[]
}

interface TestSuite {
  readonly name: string
  readonly tests: TestResult[]
}

// Placeholder interfaces for external dependencies
interface ReportGenerator {
  generate(results: ExecutionResults, analysis: MetricsAnalysis): Promise<any>
}

interface VisualizationEngine {
  create(analysis: MetricsAnalysis): Promise<Visualization[]>
}

interface NotificationService {
  // Notification service interface
}

interface WebSocketServer {
  // WebSocket server interface
}

interface RealtimeMetricsCollector {
  // Real-time metrics collection interface
}

class TestReportingError extends Error {
  constructor(message: string, public details?: any) {
    super(message)
    this.name = 'TestReportingError'
  }
}
````

## 🔗 Related Concepts

- **[Automation Framework](automation-framework.md)** - Framework supporting comprehensive reporting
- **[Test Execution](test-execution.md)** - Execution data feeding into reports
- **[CI/CD Integration](ci-cd-integration.md)** - Reports in CI/CD pipelines
- **[Automation Patterns](automation-patterns.md)** - Patterns for reporting automation

## 🎯 Implementation Guidelines

1. **Comprehensive Coverage**: Include all relevant metrics and insights
2. **Multiple Formats**: Support various report formats for different audiences
3. **Real-time Updates**: Provide live dashboards for ongoing executions
4. **Actionable Insights**: Focus on actionable recommendations and insights
5. **Visual Clarity**: Use clear visualizations and intuitive layouts
6. **Historical Context**: Include trends and historical comparisons
7. **Distribution**: Automate report distribution to stakeholders
8. **Customization**: Allow customization for different team needs

## 📏 Benefits

- **Visibility**: Clear visibility into test results and quality metrics
- **Decision Making**: Data-driven decisions based on comprehensive insights
- **Continuous Improvement**: Trends and recommendations drive improvement
- **Stakeholder Communication**: Effective communication with different audiences
- **Quality Tracking**: Track quality metrics over time
- **Issue Identification**: Quick identification of problems and bottlenecks
- **Process Optimization**: Data to optimize testing processes
- **Compliance**: Documentation for audit and compliance requirements

---

_Test Reporting provides comprehensive, actionable insights into test execution results, enabling data-driven decisions and continuous improvement of testing processes and software quality._

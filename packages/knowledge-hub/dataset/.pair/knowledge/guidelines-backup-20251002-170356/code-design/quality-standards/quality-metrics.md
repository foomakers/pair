# 📊 Quality Metrics

**Focus**: Code quality measurement, monitoring, and continuous improvement

Comprehensive framework for measuring, tracking, and improving code quality through automated metrics, analysis tools, and quality gates.

## 🎯 Quality Metrics Framework

### Core Quality Indicators

```typescript
// ✅ Quality metrics structure
interface QualityMetrics {
  // Code Coverage
  coverage: CoverageMetrics

  // Code Complexity
  complexity: ComplexityMetrics

  // Code Quality
  quality: CodeQualityMetrics

  // Performance
  performance: PerformanceMetrics

  // Security
  security: SecurityMetrics

  // Maintainability
  maintainability: MaintainabilityMetrics
}

interface CoverageMetrics {
  lines: {
    total: number
    covered: number
    percentage: number
  }
  functions: {
    total: number
    covered: number
    percentage: number
  }
  branches: {
    total: number
    covered: number
    percentage: number
  }
  statements: {
    total: number
    covered: number
    percentage: number
  }
}

interface ComplexityMetrics {
  cyclomaticComplexity: {
    average: number
    max: number
    distribution: ComplexityDistribution
  }
  cognitiveComplexity: {
    average: number
    max: number
    hotspots: ComplexityHotspot[]
  }
  nestingDepth: {
    average: number
    max: number
    violations: NestingViolation[]
  }
}

interface CodeQualityMetrics {
  linting: {
    errors: number
    warnings: number
    rules: LintRuleMetrics[]
  }
  typeScript: {
    errors: number
    strictness: number // 0-100 scale
    anyUsage: number
  }
  duplication: {
    percentage: number
    blocks: DuplicationBlock[]
  }
  smells: {
    count: number
    types: CodeSmellMetrics[]
  }
}
```

## 📈 Coverage Analysis

### Coverage Tracking System

```typescript
// ✅ Coverage analysis and reporting
export class CoverageAnalyzer {
  private coverageData: CoverageData

  constructor(coverageData: CoverageData) {
    this.coverageData = coverageData
  }

  /**
   * Analyze coverage metrics and generate insights
   */
  analyzeCoverage(): CoverageAnalysis {
    const overall = this.calculateOverallCoverage()
    const fileAnalysis = this.analyzeFilesCoverage()
    const trends = this.analyzeCoverageTrends()
    const recommendations = this.generateCoverageRecommendations()

    return {
      overall,
      fileAnalysis,
      trends,
      recommendations,
      qualityGate: this.evaluateCoverageQualityGate(overall),
    }
  }

  private calculateOverallCoverage(): OverallCoverage {
    const { lines, functions, branches, statements } = this.coverageData

    return {
      lines: {
        percentage: (lines.covered / lines.total) * 100,
        covered: lines.covered,
        total: lines.total,
      },
      functions: {
        percentage: (functions.covered / functions.total) * 100,
        covered: functions.covered,
        total: functions.total,
      },
      branches: {
        percentage: (branches.covered / branches.total) * 100,
        covered: branches.covered,
        total: branches.total,
      },
      statements: {
        percentage: (statements.covered / statements.total) * 100,
        covered: statements.covered,
        total: statements.total,
      },
      combined: this.calculateCombinedCoverage(),
    }
  }

  private analyzeFilesCoverage(): FileCoverageAnalysis[] {
    return this.coverageData.files.map(file => ({
      path: file.path,
      coverage: (file.coveredLines / file.totalLines) * 100,
      uncoveredLines: file.uncoveredLines,
      complexity: file.complexity,
      priority: this.calculateFilePriority(file),
      recommendations: this.generateFileRecommendations(file),
    }))
  }

  private evaluateCoverageQualityGate(coverage: OverallCoverage): QualityGateResult {
    const thresholds = {
      lines: 80,
      functions: 85,
      branches: 75,
      statements: 80,
    }

    const violations = []

    if (coverage.lines.percentage < thresholds.lines) {
      violations.push({
        metric: 'lines',
        actual: coverage.lines.percentage,
        threshold: thresholds.lines,
        severity: 'high',
      })
    }

    if (coverage.functions.percentage < thresholds.functions) {
      violations.push({
        metric: 'functions',
        actual: coverage.functions.percentage,
        threshold: thresholds.functions,
        severity: 'high',
      })
    }

    if (coverage.branches.percentage < thresholds.branches) {
      violations.push({
        metric: 'branches',
        actual: coverage.branches.percentage,
        threshold: thresholds.branches,
        severity: 'medium',
      })
    }

    return {
      passed: violations.length === 0,
      violations,
      score: this.calculateQualityScore(coverage, violations),
    }
  }
}

// ✅ Coverage configuration
const coverageConfig = {
  // Coverage thresholds
  thresholds: {
    global: {
      lines: 80,
      functions: 85,
      branches: 75,
      statements: 80,
    },
    individual: {
      lines: 70,
      functions: 75,
      branches: 65,
      statements: 70,
    },
  },

  // Files to exclude from coverage
  coveragePathIgnorePatterns: [
    '/node_modules/',
    '/dist/',
    '/build/',
    '/.next/',
    '/coverage/',
    '\\.test\\.',
    '\\.spec\\.',
    '\\.stories\\.',
    '/test-utils/',
    '/mocks/',
  ],

  // Collect coverage from
  collectCoverageFrom: [
    'src/**/*.{ts,tsx}',
    '!src/**/*.d.ts',
    '!src/**/*.stories.{ts,tsx}',
    '!src/**/*.test.{ts,tsx}',
    '!src/**/index.ts',
  ],
}
```

## 🔄 Complexity Analysis

### Complexity Monitoring

```typescript
// ✅ Complexity analysis system
export class ComplexityAnalyzer {
  /**
   * Analyze code complexity metrics
   */
  analyzeComplexity(sourceFiles: SourceFile[]): ComplexityAnalysis {
    const cyclomaticComplexity = this.analyzeCyclomaticComplexity(sourceFiles)
    const cognitiveComplexity = this.analyzeCognitiveComplexity(sourceFiles)
    const maintainabilityIndex = this.calculateMaintainabilityIndex(sourceFiles)

    return {
      cyclomatic: cyclomaticComplexity,
      cognitive: cognitiveComplexity,
      maintainability: maintainabilityIndex,
      hotspots: this.identifyComplexityHotspots(sourceFiles),
      recommendations: this.generateComplexityRecommendations(sourceFiles),
    }
  }

  private analyzeCyclomaticComplexity(files: SourceFile[]): CyclomaticComplexityMetrics {
    const functionComplexities = files.flatMap(file =>
      file.functions.map(func => ({
        file: file.path,
        function: func.name,
        complexity: this.calculateCyclomaticComplexity(func.ast),
        lineCount: func.lineCount,
      })),
    )

    const complexities = functionComplexities.map(f => f.complexity)

    return {
      average: complexities.reduce((sum, c) => sum + c, 0) / complexities.length,
      median: this.calculateMedian(complexities),
      max: Math.max(...complexities),
      distribution: this.calculateComplexityDistribution(complexities),
      violations: functionComplexities.filter(f => f.complexity > 10), // Threshold: 10
      trend: this.calculateComplexityTrend(),
    }
  }

  private identifyComplexityHotspots(files: SourceFile[]): ComplexityHotspot[] {
    const hotspots: ComplexityHotspot[] = []

    files.forEach(file => {
      file.functions.forEach(func => {
        const cyclomaticComplexity = this.calculateCyclomaticComplexity(func.ast)
        const cognitiveComplexity = this.calculateCognitiveComplexity(func.ast)
        const nestingDepth = this.calculateNestingDepth(func.ast)

        if (cyclomaticComplexity > 15 || cognitiveComplexity > 25 || nestingDepth > 4) {
          hotspots.push({
            file: file.path,
            function: func.name,
            line: func.startLine,
            cyclomatic: cyclomaticComplexity,
            cognitive: cognitiveComplexity,
            nesting: nestingDepth,
            severity: this.calculateHotspotSeverity(cyclomaticComplexity, cognitiveComplexity),
            suggestions: this.generateRefactoringTSuggestions(func),
          })
        }
      })
    })

    return hotspots.sort((a, b) => b.severity - a.severity)
  }
}

// ✅ ESLint complexity rules configuration
const complexityRules = {
  complexity: ['error', { max: 10 }],
  'max-depth': ['error', { max: 4 }],
  'max-lines': ['error', { max: 300, skipBlankLines: true, skipComments: true }],
  'max-lines-per-function': ['error', { max: 50, skipBlankLines: true, skipComments: true }],
  'max-nested-callbacks': ['error', { max: 3 }],
  'max-params': ['error', { max: 4 }],
  'max-statements': ['error', { max: 20 }],
  'max-statements-per-line': ['error', { max: 1 }],
}
```

## 🏥 Code Health Monitoring

### Technical Debt Tracking

```typescript
// ✅ Technical debt analysis
export class TechnicalDebtAnalyzer {
  private codeSmellDetectors: CodeSmellDetector[]

  constructor() {
    this.codeSmellDetectors = [
      new LongMethodDetector(),
      new LargeClassDetector(),
      new DuplicatedCodeDetector(),
      new DeadCodeDetector(),
      new UnusedImportDetector(),
      new MagicNumberDetector(),
      new LongParameterListDetector(),
    ]
  }

  /**
   * Analyze technical debt across the codebase
   */
  analyzeTechnicalDebt(sourceFiles: SourceFile[]): TechnicalDebtAnalysis {
    const codeSmells = this.detectCodeSmells(sourceFiles)
    const duplication = this.analyzeDuplication(sourceFiles)
    const maintenance = this.calculateMaintenanceCost(codeSmells)

    return {
      totalDebt: maintenance.totalHours,
      debtRatio: maintenance.debtRatio,
      smells: codeSmells,
      duplication,
      hotspots: this.identifyDebtHotspots(codeSmells),
      trends: this.analyzeDebtTrends(),
      actionItems: this.prioritizeDebtReduction(codeSmells),
    }
  }

  private detectCodeSmells(files: SourceFile[]): CodeSmell[] {
    const allSmells: CodeSmell[] = []

    files.forEach(file => {
      this.codeSmellDetectors.forEach(detector => {
        const smells = detector.detect(file)
        allSmells.push(...smells)
      })
    })

    return allSmells.sort((a, b) => b.severity - a.severity)
  }

  private calculateMaintenanceCost(smells: CodeSmell[]): MaintenanceCost {
    const estimatedHours = smells.reduce((total, smell) => {
      return total + this.getRefactoringTime(smell.type, smell.severity)
    }, 0)

    const linesOfCode = this.getTotalLinesOfCode()
    const debtRatio = (estimatedHours / (linesOfCode / 1000)) * 100 // Hours per 1K LOC

    return {
      totalHours: estimatedHours,
      debtRatio,
      costByType: this.groupCostBySmellType(smells),
      prioritizedActions: this.prioritizeByROI(smells),
    }
  }
}

// ✅ SonarQube integration for comprehensive analysis
interface SonarQubeMetrics {
  bugs: number
  vulnerabilities: number
  codeSmells: number
  coverage: number
  duplicatedLines: number
  duplicatedBlocks: number
  technicalDebt: string // e.g., "2d 3h"
  maintainabilityRating: 'A' | 'B' | 'C' | 'D' | 'E'
  reliabilityRating: 'A' | 'B' | 'C' | 'D' | 'E'
  securityRating: 'A' | 'B' | 'C' | 'D' | 'E'
}

const sonarQubeQualityGate = {
  conditions: [
    { metric: 'new_coverage', operator: 'LT', threshold: '80' },
    { metric: 'new_duplicated_lines_density', operator: 'GT', threshold: '3' },
    { metric: 'new_bugs', operator: 'GT', threshold: '0' },
    { metric: 'new_vulnerabilities', operator: 'GT', threshold: '0' },
    { metric: 'new_code_smells', operator: 'GT', threshold: '0' },
    { metric: 'new_security_hotspots_reviewed', operator: 'LT', threshold: '100' },
  ],
}
```

## 📊 Quality Dashboard

### Metrics Visualization

```typescript
// ✅ Quality dashboard component
interface QualityDashboardProps {
  projectId: string
  timeRange: 'week' | 'month' | 'quarter'
}

const QualityDashboard: React.FC<QualityDashboardProps> = ({ projectId, timeRange }) => {
  const { data: metrics, isLoading } = useQualityMetrics(projectId, timeRange)

  if (isLoading) return <DashboardSkeleton />

  return (
    <div className='quality-dashboard'>
      {/* Overview Cards */}
      <div className='metrics-overview'>
        <MetricCard
          title='Code Coverage'
          value={`${metrics.coverage.overall}%`}
          trend={metrics.coverage.trend}
          status={getQualityStatus(metrics.coverage.overall, 80)}
          target={80}
        />

        <MetricCard
          title='Technical Debt'
          value={metrics.technicalDebt.ratio}
          trend={metrics.technicalDebt.trend}
          status={getQualityStatus(metrics.technicalDebt.ratio, 5, 'lower')}
          unit='hours/KLOC'
        />

        <MetricCard
          title='Code Complexity'
          value={metrics.complexity.average.toFixed(1)}
          trend={metrics.complexity.trend}
          status={getQualityStatus(metrics.complexity.average, 10, 'lower')}
        />

        <MetricCard
          title='Quality Score'
          value={metrics.qualityScore}
          trend={metrics.qualityScoreTrend}
          status={getQualityStatus(metrics.qualityScore, 85)}
        />
      </div>

      {/* Detailed Charts */}
      <div className='metrics-charts'>
        <CoverageChart data={metrics.coverage.history} />
        <ComplexityDistributionChart data={metrics.complexity.distribution} />
        <TechnicalDebtChart data={metrics.technicalDebt.history} />
        <QualityTrendsChart data={metrics.trends} />
      </div>

      {/* Action Items */}
      <div className='action-items'>
        <QualityActionItems items={metrics.actionItems} onItemComplete={handleActionItemComplete} />
      </div>

      {/* Hotspots */}
      <div className='complexity-hotspots'>
        <ComplexityHotspots hotspots={metrics.hotspots} onRefactorPlan={handleRefactorPlan} />
      </div>
    </div>
  )
}

// ✅ Quality gates automation
const qualityGatesConfig = {
  // Coverage gates
  coverage: {
    lines: { threshold: 80, blocking: true },
    functions: { threshold: 85, blocking: true },
    branches: { threshold: 75, blocking: false },
    statements: { threshold: 80, blocking: true },
  },

  // Complexity gates
  complexity: {
    cyclomatic: { threshold: 10, blocking: true },
    cognitive: { threshold: 25, blocking: true },
    nesting: { threshold: 4, blocking: true },
  },

  // Quality gates
  quality: {
    duplicatedLines: { threshold: 3, blocking: true },
    codeSmells: { threshold: 0, blocking: false },
    bugs: { threshold: 0, blocking: true },
    vulnerabilities: { threshold: 0, blocking: true },
  },

  // Performance gates
  performance: {
    buildTime: { threshold: 300, blocking: false }, // seconds
    bundleSize: { threshold: 250, blocking: true }, // KB
    testDuration: { threshold: 120, blocking: false }, // seconds
  },
}
```

## 🔗 Related Concepts

- **[ESLint Configuration](eslint-configuration.md)** - Automated code quality rules
- **[Code Review](code-review.md)** - Manual quality assurance
- **[Performance Optimization](performance-optimization.md)** - Performance quality metrics

## 📏 Implementation Guidelines

1. **Comprehensive Measurement**: Track multiple quality dimensions
2. **Automated Collection**: Integrate metrics into CI/CD pipeline
3. **Trend Analysis**: Monitor quality trends over time
4. **Actionable Insights**: Provide clear improvement recommendations
5. **Quality Gates**: Implement automated quality gates
6. **Team Visibility**: Make quality metrics visible to entire team
7. **Continuous Improvement**: Use metrics to drive improvement initiatives
8. **Baseline Establishment**: Establish quality baselines for comparison

---

_Quality Metrics provide comprehensive measurement and monitoring of code quality, enabling data-driven decisions for continuous improvement and maintaining high development standards._

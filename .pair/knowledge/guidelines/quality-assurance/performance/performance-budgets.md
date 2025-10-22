# Performance Budgets Framework

## 🎯 **PURPOSE**

Comprehensive performance budget system establishing measurable performance targets across metrics, resources, and user experience indicators to maintain optimal application performance and prevent performance regression during development.

## 📊 **PERFORMANCE BUDGET CATEGORIES**

### **Core Web Vitals Budgets**

**Largest Contentful Paint (LCP)**:

- **Target**: ≤ 2.5 seconds
- **Warning**: 2.5 - 4.0 seconds
- **Critical**: > 4.0 seconds

**First Input Delay (FID)**:

- **Target**: ≤ 100 milliseconds
- **Warning**: 100 - 300 milliseconds
- **Critical**: > 300 milliseconds

**Cumulative Layout Shift (CLS)**:

- **Target**: ≤ 0.1
- **Warning**: 0.1 - 0.25
- **Critical**: > 0.25

**Implementation Configuration**:

```javascript
// performance-budgets.config.js
export const CORE_WEB_VITALS_BUDGETS = {
  lcp: {
    target: 2500, // 2.5 seconds
    warning: 4000, // 4.0 seconds
    critical: 6000, // 6.0 seconds
  },
  fid: {
    target: 100, // 100ms
    warning: 300, // 300ms
    critical: 500, // 500ms
  },
  cls: {
    target: 0.1, // 0.1
    warning: 0.25, // 0.25
    critical: 0.5, // 0.5
  },
  inp: {
    target: 200, // 200ms (Interaction to Next Paint)
    warning: 500, // 500ms
    critical: 1000, // 1000ms
  },
}
```

### **Resource Budgets**

**JavaScript Bundle Size**:

- **Initial Bundle**: ≤ 200 KB (gzipped)
- **Total JavaScript**: ≤ 500 KB (gzipped)
- **Third-party Scripts**: ≤ 100 KB (gzipped)

**CSS Bundle Size**:

- **Critical CSS**: ≤ 14 KB (inlined)
- **Total CSS**: ≤ 100 KB (gzipped)
- **Unused CSS**: ≤ 10%

**Image Resources**:

- **Hero Images**: ≤ 200 KB
- **Content Images**: ≤ 100 KB
- **Thumbnails**: ≤ 20 KB
- **Total Images per Page**: ≤ 1 MB

**Resource Budget Configuration**:

```javascript
// Resource budgets configuration
export const RESOURCE_BUDGETS = {
  javascript: {
    initial: 200 * 1024, // 200 KB
    total: 500 * 1024, // 500 KB
    thirdParty: 100 * 1024, // 100 KB
  },
  css: {
    critical: 14 * 1024, // 14 KB
    total: 100 * 1024, // 100 KB
    unusedThreshold: 0.1, // 10%
  },
  images: {
    hero: 200 * 1024, // 200 KB
    content: 100 * 1024, // 100 KB
    thumbnail: 20 * 1024, // 20 KB
    totalPerPage: 1024 * 1024, // 1 MB
  },
  fonts: {
    total: 150 * 1024, // 150 KB
    perFont: 30 * 1024, // 30 KB per font file
  },
}
```

### **Loading Performance Budgets**

**Time-based Metrics**:

- **Time to First Byte (TTFB)**: ≤ 600 ms
- **First Contentful Paint (FCP)**: ≤ 1.8 seconds
- **Speed Index**: ≤ 3.4 seconds
- **Time to Interactive (TTI)**: ≤ 5.0 seconds

**Network Performance**:

- **3G Network**: All budgets must be met
- **Slow 3G**: Critical functionality available
- **Offline**: Core features cached

```javascript
// Loading performance budgets
export const LOADING_BUDGETS = {
  ttfb: {
    target: 600, // 600ms
    warning: 1000, // 1 second
    critical: 1500, // 1.5 seconds
  },
  fcp: {
    target: 1800, // 1.8 seconds
    warning: 3000, // 3 seconds
    critical: 4000, // 4 seconds
  },
  speedIndex: {
    target: 3400, // 3.4 seconds
    warning: 5800, // 5.8 seconds
    critical: 8000, // 8 seconds
  },
  tti: {
    target: 5000, // 5 seconds
    warning: 7300, // 7.3 seconds
    critical: 10000, // 10 seconds
  },
}
```

## 🏗️ **BUDGET IMPLEMENTATION**

### **Webpack Bundle Analysis**

**Bundle Size Monitoring**:

```javascript
// webpack.config.js - Performance budgets
const path = require('path')
const BundleAnalyzerPlugin = require('webpack-bundle-analyzer').BundleAnalyzerPlugin

module.exports = {
  // ... other config
  performance: {
    maxAssetSize: 200000, // 200 KB
    maxEntrypointSize: 200000, // 200 KB
    hints: 'error',
    assetFilter: function (assetFilename) {
      return assetFilename.endsWith('.js') || assetFilename.endsWith('.css')
    },
  },
  plugins: [
    new BundleAnalyzerPlugin({
      analyzerMode: process.env.ANALYZE ? 'server' : 'disabled',
      openAnalyzer: false,
      generateStatsFile: true,
      statsFilename: 'bundle-stats.json',
    }),
  ],
}
```

**Budget Enforcement Script**:

```javascript
// scripts/check-bundle-size.js
const fs = require('fs')
const path = require('path')
const gzipSize = require('gzip-size')

class BundleSizeChecker {
  constructor(budgets) {
    this.budgets = budgets
    this.violations = []
  }

  async checkBundleSizes(buildDir) {
    const files = this.getAllFiles(buildDir)

    for (const file of files) {
      const filePath = path.join(buildDir, file)
      const stats = fs.statSync(filePath)
      const gzippedSize = await gzipSize.file(filePath)

      if (file.endsWith('.js')) {
        await this.checkJavaScriptBudget(file, stats.size, gzippedSize)
      } else if (file.endsWith('.css')) {
        await this.checkCSSBudget(file, stats.size, gzippedSize)
      }
    }

    return this.generateReport()
  }

  async checkJavaScriptBudget(filename, size, gzippedSize) {
    const isMainBundle = filename.includes('main') || filename.includes('app')
    const budget = isMainBundle ? this.budgets.javascript.initial : this.budgets.javascript.total

    if (gzippedSize > budget) {
      this.violations.push({
        type: 'javascript',
        file: filename,
        size: gzippedSize,
        budget: budget,
        exceeded: gzippedSize - budget,
        severity: this.calculateSeverity(gzippedSize, budget),
      })
    }
  }

  generateReport() {
    const passed = this.violations.length === 0

    return {
      passed,
      violations: this.violations,
      summary: {
        totalViolations: this.violations.length,
        criticalViolations: this.violations.filter(v => v.severity === 'critical').length,
        totalExceeded: this.violations.reduce((sum, v) => sum + v.exceeded, 0),
      },
    }
  }
}

// Usage in CI/CD
async function checkBudgets() {
  const checker = new BundleSizeChecker(RESOURCE_BUDGETS)
  const result = await checker.checkBundleSizes('./dist')

  if (!result.passed) {
    console.error('❌ Performance budget violations detected:')
    result.violations.forEach(violation => {
      console.error(
        `  ${violation.file}: ${violation.size} bytes (exceeded by ${violation.exceeded} bytes)`,
      )
    })
    process.exit(1)
  }

  console.log('✅ All performance budgets met')
}
```

### **Lighthouse CI Integration**

**Performance Budget Configuration**:

```json
{
  "ci": {
    "collect": {
      "url": ["http://localhost:3000"],
      "numberOfRuns": 3
    },
    "assert": {
      "assertions": {
        "categories:performance": ["error", { "minScore": 0.8 }],
        "first-contentful-paint": ["error", { "maxNumericValue": 1800 }],
        "largest-contentful-paint": ["error", { "maxNumericValue": 2500 }],
        "cumulative-layout-shift": ["error", { "maxNumericValue": 0.1 }],
        "total-blocking-time": ["error", { "maxNumericValue": 300 }],
        "speed-index": ["error", { "maxNumericValue": 3400 }]
      }
    },
    "upload": {
      "target": "temporary-public-storage"
    }
  }
}
```

**GitHub Actions Integration**:

```yaml
# .github/workflows/performance-budget.yml
name: Performance Budget Check

on:
  pull_request:
    branches: [main]

jobs:
  performance-budget:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3

      - name: Setup Node.js
        uses: actions/setup-node@v3
        with:
          node-version: '20'
          cache: 'npm'

      - name: Install dependencies
        run: npm ci

      - name: Build application
        run: npm run build

      - name: Check bundle sizes
        run: npm run check:bundle-size

      - name: Start application
        run: |
          npm start &
          npx wait-on http://localhost:3000

      - name: Run Lighthouse CI
        uses: treosh/lighthouse-ci-action@v9
        with:
          configPath: './lighthouserc.json'
          uploadArtifacts: true
          temporaryPublicStorage: true

      - name: Comment PR with results
        uses: actions/github-script@v6
        with:
          script: |
            const fs = require('fs');
            const results = JSON.parse(fs.readFileSync('.lighthouseci/assertion-results.json'));

            let comment = '## 📊 Performance Budget Results\n\n';

            if (results.failed.length === 0) {
              comment += '✅ All performance budgets met!\n\n';
            } else {
              comment += '❌ Performance budget violations detected:\n\n';
              results.failed.forEach(failure => {
                comment += `- **${failure.auditId}**: ${failure.actual} (budget: ${failure.expected})\n`;
              });
            }

            github.rest.issues.createComment({
              issue_number: context.issue.number,
              owner: context.repo.owner,
              repo: context.repo.repo,
              body: comment
            });
```

## 📈 **BUDGET MONITORING AND ALERTING**

### **Real-time Performance Monitoring**

**Performance Budget Tracking**:

```javascript
// Performance monitoring service
class PerformanceBudgetMonitor {
  constructor() {
    this.metrics = new Map()
    this.budgets = {
      ...CORE_WEB_VITALS_BUDGETS,
      ...RESOURCE_BUDGETS,
      ...LOADING_BUDGETS,
    }
  }

  async collectMetrics() {
    const metrics = await this.gatherPerformanceMetrics()

    // Check Core Web Vitals
    await this.checkCoreWebVitals(metrics)

    // Check resource budgets
    await this.checkResourceBudgets(metrics)

    // Check loading performance
    await this.checkLoadingPerformance(metrics)

    return this.generateBudgetReport()
  }

  async checkCoreWebVitals(metrics) {
    const violations = []

    // Check LCP
    if (metrics.lcp > this.budgets.lcp.critical) {
      violations.push({
        metric: 'LCP',
        value: metrics.lcp,
        budget: this.budgets.lcp.target,
        severity: 'critical',
      })
    }

    // Check FID
    if (metrics.fid > this.budgets.fid.critical) {
      violations.push({
        metric: 'FID',
        value: metrics.fid,
        budget: this.budgets.fid.target,
        severity: 'critical',
      })
    }

    // Check CLS
    if (metrics.cls > this.budgets.cls.critical) {
      violations.push({
        metric: 'CLS',
        value: metrics.cls,
        budget: this.budgets.cls.target,
        severity: 'critical',
      })
    }

    if (violations.length > 0) {
      await this.alertPerformanceTeam(violations)
    }
  }

  async alertPerformanceTeam(violations) {
    const criticalViolations = violations.filter(v => v.severity === 'critical')

    if (criticalViolations.length > 0) {
      // Send immediate alert for critical violations
      await this.sendSlackAlert({
        channel: '#performance-alerts',
        message: `🚨 Critical performance budget violations detected:`,
        violations: criticalViolations,
      })
    }

    // Log all violations for tracking
    violations.forEach(violation => {
      console.error(
        `Performance budget violation: ${violation.metric} = ${violation.value} (budget: ${violation.budget})`,
      )
    })
  }
}
```

### **Performance Regression Detection**

**Trend Analysis**:

```javascript
class PerformanceRegressionDetector {
  constructor() {
    this.baselineMetrics = new Map()
    this.regressionThresholds = {
      lcp: 0.2, // 20% regression threshold
      fid: 0.5, // 50% regression threshold
      cls: 0.1, // 10% regression threshold
      bundleSize: 0.1, // 10% size increase threshold
    }
  }

  async detectRegressions(currentMetrics, baselineMetrics) {
    const regressions = []

    for (const [metric, currentValue] of Object.entries(currentMetrics)) {
      const baselineValue = baselineMetrics[metric]

      if (baselineValue && this.regressionThresholds[metric]) {
        const regressionPercent = (currentValue - baselineValue) / baselineValue

        if (regressionPercent > this.regressionThresholds[metric]) {
          regressions.push({
            metric,
            currentValue,
            baselineValue,
            regressionPercent: regressionPercent * 100,
            severity: this.calculateRegressionSeverity(regressionPercent),
          })
        }
      }
    }

    return regressions
  }

  async generateRegressionReport(regressions) {
    return {
      hasRegressions: regressions.length > 0,
      regressions: regressions,
      summary: {
        totalRegressions: regressions.length,
        criticalRegressions: regressions.filter(r => r.severity === 'critical').length,
        averageRegression:
          regressions.reduce((sum, r) => sum + r.regressionPercent, 0) / regressions.length,
      },
      recommendations: this.generateRegressionRecommendations(regressions),
    }
  }
}
```

## 🎯 **PERFORMANCE BUDGET CHECKLIST**

### **Budget Definition**

- [ ] **Core Web Vitals budgets defined (LCP, FID, CLS)**
- [ ] **Resource budgets set for JS, CSS, images**
- [ ] **Loading performance budgets established**
- [ ] **Network condition budgets specified**
- [ ] **Third-party script budgets allocated**
- [ ] **Font loading budgets configured**

### **Implementation**

- [ ] **Webpack performance budgets configured**
- [ ] **Lighthouse CI integration implemented**
- [ ] **Bundle analysis automation setup**
- [ ] **CI/CD budget enforcement active**
- [ ] **Performance monitoring dashboard deployed**
- [ ] **Alert system for budget violations configured**

### **Monitoring**

- [ ] **Real-time performance tracking implemented**
- [ ] **Regression detection system active**
- [ ] **Performance trends tracked over time**
- [ ] **Budget compliance reporting automated**
- [ ] **Team notification system configured**
- [ ] **Performance impact analysis for deployments**

### **Governance**

- [ ] **Budget review process established**
- [ ] **Team training on performance budgets completed**
- [ ] **Budget violation response procedures defined**
- [ ] **Regular budget assessment schedule set**
- [ ] **Performance culture established in team**
- [ ] **Business impact of budgets communicated**

## 🎯 **SUCCESS CRITERIA**

- **95%+ Budget Compliance** across all performance metrics
- **Zero Critical Budget Violations** in production deployments
- **<5% Performance Regression** tolerance between releases
- **Monthly Budget Review** with stakeholder alignment
- **Real-time Monitoring** with automated alerting
- **Team Performance Awareness** with regular training and updates

# Performance Tools and Measurement

## 🎯 **PURPOSE**

Comprehensive guide to performance measurement tools, monitoring solutions, and analysis techniques for identifying bottlenecks, tracking metrics, and optimizing web application performance across development, testing, and production environments.

## 🔧 **PERFORMANCE MEASUREMENT TOOLS**

### **Browser Developer Tools**

#### Chrome DevTools Performance Panel

```javascript
// Programmatic performance measurement
class ChromeDevToolsIntegration {
  constructor() {
    this.setupPerfObserver()
    this.enableUserTimingAPI()
  }

  setupPerfObserver() {
    if ('PerformanceObserver' in window) {
      const observer = new PerformanceObserver(list => {
        const entries = list.getEntries()
        entries.forEach(entry => {
          console.log(`${entry.name}: ${entry.duration}ms`)
        })
      })

      observer.observe({ entryTypes: ['measure', 'navigation', 'paint'] })
    }
  }

  // Mark performance points
  markStart(name) {
    performance.mark(`${name}-start`)
  }

  markEnd(name) {
    performance.mark(`${name}-end`)
    performance.measure(name, `${name}-start`, `${name}-end`)
  }

  // Measure custom operations
  measureOperation(name, operation) {
    this.markStart(name)
    const result = operation()
    this.markEnd(name)
    return result
  }

  // Get navigation timing
  getNavigationTiming() {
    const navigation = performance.getEntriesByType('navigation')[0]
    return {
      dnsLookup: navigation.domainLookupEnd - navigation.domainLookupStart,
      tcpConnect: navigation.connectEnd - navigation.connectStart,
      request: navigation.responseStart - navigation.requestStart,
      response: navigation.responseEnd - navigation.responseStart,
      domProcessing: navigation.domContentLoadedEventStart - navigation.responseEnd,
      totalTime: navigation.loadEventEnd - navigation.navigationStart,
    }
  }
}
```

#### Firefox Developer Tools

```javascript
// Firefox-specific performance API usage
class FirefoxPerfTools {
  constructor() {
    this.setupFirefoxObserver()
  }

  setupFirefoxObserver() {
    // Firefox-specific performance monitoring
    if (navigator.userAgent.includes('Firefox')) {
      this.enableMozPerfTools()
    }
  }

  enableMozPerfTools() {
    // Firefox performance profiler integration
    if ('PerformanceObserver' in window) {
      const observer = new PerformanceObserver(list => {
        const entries = list.getEntries()
        entries.forEach(entry => {
          if (entry.entryType === 'longtask') {
            console.warn('Long task detected:', entry)
          }
        })
      })

      observer.observe({ entryTypes: ['longtask'] })
    }
  }

  // Firefox-specific memory measurement
  getMemoryUsage() {
    if ('memory' in performance) {
      return {
        used: performance.memory.usedJSHeapSize,
        total: performance.memory.totalJSHeapSize,
        limit: performance.memory.jsHeapSizeLimit,
      }
    }
    return null
  }
}
```

### **Lighthouse Automation**

#### Lighthouse CI Configuration

```json
{
  "ci": {
    "collect": {
      "url": [
        "http://localhost:3000/",
        "http://localhost:3000/products",
        "http://localhost:3000/checkout"
      ],
      "numberOfRuns": 5,
      "settings": {
        "chromeFlags": "--no-sandbox --disable-dev-shm-usage",
        "preset": "desktop",
        "onlyCategories": ["performance"],
        "skipAudits": ["screenshot-thumbnails", "final-screenshot"]
      }
    },
    "assert": {
      "assertions": {
        "categories:performance": ["error", { "minScore": 0.8 }],
        "first-contentful-paint": ["error", { "maxNumericValue": 2000 }],
        "largest-contentful-paint": ["error", { "maxNumericValue": 2500 }],
        "cumulative-layout-shift": ["error", { "maxNumericValue": 0.1 }],
        "total-blocking-time": ["error", { "maxNumericValue": 300 }],
        "speed-index": ["error", { "maxNumericValue": 3000 }]
      }
    },
    "upload": {
      "target": "temporary-public-storage"
    }
  }
}
```

#### Programmatic Lighthouse Usage

```javascript
const lighthouse = require('lighthouse')
const chromeLauncher = require('chrome-launcher')

class LighthouseAutomation {
  constructor() {
    this.config = {
      extends: 'lighthouse:default',
      settings: {
        onlyCategories: ['performance'],
        chromeFlags: ['--headless', '--no-sandbox'],
        formFactor: 'desktop',
        throttling: {
          rttMs: 40,
          throughputKbps: 10240,
          cpuSlowdownMultiplier: 1,
          requestLatencyMs: 0,
          downloadThroughputKbps: 0,
          uploadThroughputKbps: 0,
        },
      },
    }
  }

  async auditURL(url) {
    const chrome = await chromeLauncher.launch({
      chromeFlags: ['--headless', '--no-sandbox'],
    })

    const options = {
      ...this.config.settings,
      port: chrome.port,
    }

    try {
      const runnerResult = await lighthouse(url, options, this.config)

      const performance = runnerResult.lhr.categories.performance
      const metrics = this.extractMetrics(runnerResult.lhr.audits)

      await chrome.kill()

      return {
        score: performance.score,
        metrics,
        opportunities: this.extractOpportunities(runnerResult.lhr.audits),
      }
    } catch (error) {
      await chrome.kill()
      throw error
    }
  }

  extractMetrics(audits) {
    return {
      fcp: audits['first-contentful-paint'].numericValue,
      lcp: audits['largest-contentful-paint'].numericValue,
      cls: audits['cumulative-layout-shift'].numericValue,
      tbt: audits['total-blocking-time'].numericValue,
      si: audits['speed-index'].numericValue,
      fid: audits['max-potential-fid']?.numericValue || null,
    }
  }

  extractOpportunities(audits) {
    const opportunities = []

    Object.entries(audits).forEach(([key, audit]) => {
      if (audit.details && audit.details.type === 'opportunity') {
        opportunities.push({
          audit: key,
          title: audit.title,
          description: audit.description,
          savings: audit.details.overallSavingsMs || 0,
        })
      }
    })

    return opportunities.sort((a, b) => b.savings - a.savings)
  }

  async batchAudit(urls) {
    const results = []

    for (const url of urls) {
      try {
        console.log(`Auditing: ${url}`)
        const result = await this.auditURL(url)
        results.push({ url, ...result })
      } catch (error) {
        console.error(`Failed to audit ${url}:`, error)
        results.push({ url, error: error.message })
      }
    }

    return results
  }

  generateReport(results) {
    console.log('Performance Audit Report')
    console.log('========================')

    results.forEach(result => {
      if (result.error) {
        console.log(`❌ ${result.url}: ${result.error}`)
        return
      }

      const score = Math.round(result.score * 100)
      const status = score >= 90 ? '🟢' : score >= 50 ? '🟡' : '🔴'

      console.log(`${status} ${result.url}: ${score}/100`)
      console.log(`   FCP: ${result.metrics.fcp}ms`)
      console.log(`   LCP: ${result.metrics.lcp}ms`)
      console.log(`   CLS: ${result.metrics.cls}`)
      console.log(`   TBT: ${result.metrics.tbt}ms`)

      if (result.opportunities.length > 0) {
        console.log('   Top opportunities:')
        result.opportunities.slice(0, 3).forEach(opp => {
          console.log(`   - ${opp.title}: ${opp.savings}ms savings`)
        })
      }
      console.log('')
    })
  }
}

// Usage
const audit = new LighthouseAutomation()
audit
  .batchAudit(['https://example.com', 'https://example.com/products', 'https://example.com/about'])
  .then(results => {
    audit.generateReport(results)
  })
```

### **WebPageTest Integration**

#### WebPageTest API Client

```javascript
class WebPageTestClient {
  constructor(apiKey) {
    this.apiKey = apiKey
    this.baseURL = 'https://www.webpagetest.org'
  }

  async runTest(url, options = {}) {
    const testParams = {
      url,
      k: this.apiKey,
      f: 'json',
      runs: options.runs || 3,
      location: options.location || 'Dulles:Chrome',
      connectivity: options.connectivity || '3G',
      fvonly: options.firstViewOnly ? 1 : 0,
      video: 1,
      lighthouse: 1,
    }

    const params = new URLSearchParams(testParams)
    const response = await fetch(`${this.baseURL}/runtest.php?${params}`)
    const result = await response.json()

    if (result.statusCode !== 200) {
      throw new Error(`Test failed: ${result.statusText}`)
    }

    return this.pollForResults(result.data.testId)
  }

  async pollForResults(testId, maxAttempts = 60) {
    for (let i = 0; i < maxAttempts; i++) {
      const result = await this.getTestResults(testId)

      if (result.statusCode === 200) {
        return this.parseResults(result.data)
      }

      if (result.statusCode >= 400) {
        throw new Error(`Test failed: ${result.statusText}`)
      }

      // Wait 30 seconds before next poll
      await new Promise(resolve => setTimeout(resolve, 30000))
    }

    throw new Error('Test timeout: Results not available')
  }

  async getTestResults(testId) {
    const response = await fetch(`${this.baseURL}/jsonResult.php?test=${testId}&f=json`)
    return await response.json()
  }

  parseResults(data) {
    const run = data.runs['1'].firstView

    return {
      url: data.url,
      summary: {
        loadTime: run.loadTime,
        firstByte: run.TTFB,
        startRender: run.render,
        fcp: run.firstContentfulPaint,
        lcp: run.largestContentfulPaint,
        cls: run.cumulativeLayoutShift,
        speedIndex: run.SpeedIndex,
        bytes: run.bytesIn,
        requests: run.requests,
      },
      waterfall: data.runs['1'].firstView.images.waterfall,
      lighthouse: data.lighthouse,
      opportunities: this.extractWPTOpportunities(run),
    }
  }

  extractWPTOpportunities(run) {
    const opportunities = []

    // Identify optimization opportunities
    if (run.gzip_savings > 1000) {
      opportunities.push({
        type: 'compression',
        description: 'Enable text compression',
        savings: `${Math.round(run.gzip_savings / 1024)}KB`,
      })
    }

    if (run.image_savings > 5000) {
      opportunities.push({
        type: 'images',
        description: 'Optimize images',
        savings: `${Math.round(run.image_savings / 1024)}KB`,
      })
    }

    if (run.requests > 100) {
      opportunities.push({
        type: 'requests',
        description: 'Reduce HTTP requests',
        current: run.requests,
        recommendation: 'Combine files, use CSS sprites',
      })
    }

    return opportunities
  }
}

// Usage
const wpt = new WebPageTestClient('YOUR_API_KEY')

wpt
  .runTest('https://example.com', {
    runs: 3,
    location: 'Dulles:Chrome',
    connectivity: '3G',
  })
  .then(results => {
    console.log('WebPageTest Results:', results)
  })
```

### **Real User Monitoring (RUM)**

#### Custom RUM Implementation

```javascript
class RealUserMonitoring {
  constructor(config = {}) {
    this.config = {
      endpoint: config.endpoint || '/api/rum',
      sampleRate: config.sampleRate || 0.1,
      bufferSize: config.bufferSize || 50,
      flushInterval: config.flushInterval || 30000,
    }

    this.buffer = []
    this.sessionId = this.generateSessionId()
    this.userId = this.getUserId()

    this.initialize()
  }

  initialize() {
    this.setupPerformanceObserver()
    this.setupErrorTracking()
    this.setupUserInteractionTracking()
    this.setupPeriodicFlush()
    this.trackPageLoad()
  }

  setupPerformanceObserver() {
    if ('PerformanceObserver' in window) {
      // Web Vitals tracking
      const observer = new PerformanceObserver(list => {
        const entries = list.getEntries()
        entries.forEach(entry => {
          this.recordMetric({
            type: 'web-vital',
            name: entry.name,
            value: entry.value || entry.startTime,
            timestamp: Date.now(),
            url: window.location.href,
          })
        })
      })

      observer.observe({ entryTypes: ['paint', 'largest-contentful-paint', 'layout-shift'] })
    }

    // Track Web Vitals using web-vitals library
    if (typeof window.webVitals !== 'undefined') {
      ;['CLS', 'FID', 'FCP', 'LCP', 'TTFB'].forEach(metric => {
        window.webVitals[`on${metric}`](data => {
          this.recordMetric({
            type: 'web-vital',
            name: metric,
            value: data.value,
            delta: data.delta,
            id: data.id,
            timestamp: Date.now(),
          })
        })
      })
    }
  }

  setupErrorTracking() {
    // JavaScript errors
    window.addEventListener('error', event => {
      this.recordError({
        type: 'javascript-error',
        message: event.message,
        filename: event.filename,
        line: event.lineno,
        column: event.colno,
        stack: event.error?.stack,
      })
    })

    // Unhandled promise rejections
    window.addEventListener('unhandledrejection', event => {
      this.recordError({
        type: 'unhandled-rejection',
        reason: event.reason?.toString(),
        stack: event.reason?.stack,
      })
    })

    // Resource loading errors
    window.addEventListener(
      'error',
      event => {
        if (event.target !== window) {
          this.recordError({
            type: 'resource-error',
            element: event.target.tagName,
            source: event.target.src || event.target.href,
            message: 'Failed to load resource',
          })
        }
      },
      true,
    )
  }

  setupUserInteractionTracking() {
    // Track important user interactions
    ;['click', 'input', 'scroll'].forEach(eventType => {
      document.addEventListener(
        eventType,
        event => {
          this.recordInteraction({
            type: eventType,
            target: this.getElementSelector(event.target),
            timestamp: Date.now(),
          })
        },
        { passive: true },
      )
    })
  }

  trackPageLoad() {
    window.addEventListener('load', () => {
      const navigation = performance.getEntriesByType('navigation')[0]

      this.recordMetric({
        type: 'navigation',
        metrics: {
          dnsLookup: navigation.domainLookupEnd - navigation.domainLookupStart,
          tcpConnect: navigation.connectEnd - navigation.connectStart,
          serverResponse: navigation.responseEnd - navigation.requestStart,
          domProcessing: navigation.domContentLoadedEventStart - navigation.responseEnd,
          totalTime: navigation.loadEventEnd - navigation.navigationStart,
        },
        timestamp: Date.now(),
      })
    })
  }

  recordMetric(data) {
    if (Math.random() > this.config.sampleRate) return

    this.buffer.push({
      ...data,
      sessionId: this.sessionId,
      userId: this.userId,
      userAgent: navigator.userAgent,
      url: window.location.href,
      timestamp: data.timestamp || Date.now(),
    })

    if (this.buffer.length >= this.config.bufferSize) {
      this.flush()
    }
  }

  recordError(error) {
    this.recordMetric({
      type: 'error',
      ...error,
    })
  }

  recordInteraction(interaction) {
    this.recordMetric({
      type: 'interaction',
      ...interaction,
    })
  }

  async flush() {
    if (this.buffer.length === 0) return

    const data = [...this.buffer]
    this.buffer = []

    try {
      await fetch(this.config.endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(data),
      })
    } catch (error) {
      console.error('Failed to send RUM data:', error)
      // Re-add data to buffer for retry
      this.buffer.unshift(...data)
    }
  }

  setupPeriodicFlush() {
    setInterval(() => {
      this.flush()
    }, this.config.flushInterval)

    // Flush on page unload
    window.addEventListener('beforeunload', () => {
      if (this.buffer.length > 0) {
        navigator.sendBeacon(this.config.endpoint, JSON.stringify(this.buffer))
      }
    })
  }

  generateSessionId() {
    return 'session_' + Math.random().toString(36).substr(2, 9) + Date.now()
  }

  getUserId() {
    return (
      localStorage.getItem('userId') ||
      sessionStorage.getItem('userId') ||
      'anonymous_' + Math.random().toString(36).substr(2, 9)
    )
  }

  getElementSelector(element) {
    if (element.id) return `#${element.id}`
    if (element.className) return `.${element.className.split(' ')[0]}`
    return element.tagName.toLowerCase()
  }
}

// Initialize RUM
const rum = new RealUserMonitoring({
  endpoint: '/api/performance-data',
  sampleRate: 0.1,
  flushInterval: 30000,
})
```

## 📊 **PERFORMANCE ANALYSIS TOOLS**

### **Performance Budgets**

#### Budget Definition and Monitoring

```javascript
class PerformanceBudget {
  constructor() {
    this.budgets = {
      // Core Web Vitals budgets
      fcp: { target: 1800, warning: 1500 },
      lcp: { target: 2500, warning: 2000 },
      cls: { target: 0.1, warning: 0.05 },
      fid: { target: 100, warning: 50 },

      // Resource budgets
      totalSize: { target: 1024 * 1024 * 2, warning: 1024 * 1024 * 1.5 }, // 2MB
      jsSize: { target: 1024 * 512, warning: 1024 * 400 }, // 512KB
      cssSize: { target: 1024 * 100, warning: 1024 * 80 }, // 100KB
      imageSize: { target: 1024 * 1024, warning: 1024 * 800 }, // 1MB
      requests: { target: 50, warning: 40 },
    }

    this.violations = []
  }

  checkBudget(metrics) {
    this.violations = []

    Object.entries(this.budgets).forEach(([metric, budget]) => {
      const value = metrics[metric]

      if (value === undefined) return

      if (value > budget.target) {
        this.violations.push({
          metric,
          value,
          target: budget.target,
          severity: 'error',
          overage: value - budget.target,
        })
      } else if (value > budget.warning) {
        this.violations.push({
          metric,
          value,
          target: budget.warning,
          severity: 'warning',
          overage: value - budget.warning,
        })
      }
    })

    return {
      passed: this.violations.filter(v => v.severity === 'error').length === 0,
      violations: this.violations,
      score: this.calculateScore(),
    }
  }

  calculateScore() {
    const totalMetrics = Object.keys(this.budgets).length
    const violations = this.violations.filter(v => v.severity === 'error').length
    return Math.max(0, ((totalMetrics - violations) / totalMetrics) * 100)
  }

  generateReport() {
    console.log('Performance Budget Report')
    console.log('========================')

    if (this.violations.length === 0) {
      console.log('✅ All performance budgets passed!')
      return
    }

    this.violations.forEach(violation => {
      const emoji = violation.severity === 'error' ? '❌' : '⚠️'
      console.log(`${emoji} ${violation.metric}: ${violation.value} (target: ${violation.target})`)
    })

    console.log(`\nOverall Score: ${this.calculateScore().toFixed(1)}/100`)
  }
}
```

### **Continuous Performance Monitoring**

#### CI/CD Integration

```yaml
# GitHub Actions workflow for performance monitoring
name: Performance Monitoring

on:
  push:
    branches: [main]
  pull_request:
    branches: [main]

jobs:
  performance-test:
    runs-on: ubuntu-latest

    steps:
      - uses: actions/checkout@v3

      - name: Setup Node.js
        uses: actions/setup-node@v3
        with:
          node-version: '18'
          cache: 'npm'

      - name: Install dependencies
        run: npm ci

      - name: Build application
        run: npm run build

      - name: Start application
        run: |
          npm start &
          sleep 30

      - name: Run Lighthouse CI
        uses: treosh/lighthouse-ci-action@v9
        with:
          configPath: './lighthouserc.json'
          uploadArtifacts: true
          temporaryPublicStorage: true

      - name: Run WebPageTest
        run: |
          npm install -g webpagetest
          wpt test http://localhost:3000 --key ${{ secrets.WPT_API_KEY }} --location Dulles:Chrome --connectivity 3G

      - name: Performance Budget Check
        run: npm run perf:budget

      - name: Comment PR with results
        if: github.event_name == 'pull_request'
        uses: actions/github-script@v6
        with:
          script: |
            const fs = require('fs');
            const results = JSON.parse(fs.readFileSync('./performance-results.json'));

            github.rest.issues.createComment({
              issue_number: context.issue.number,
              owner: context.repo.owner,
              repo: context.repo.repo,
              body: `## Performance Test Results\\n\\n${results.summary}`
            });
```

---

_Performance tools provide the foundation for measuring, monitoring, and optimizing web application performance across the entire development lifecycle, from local development to production monitoring._

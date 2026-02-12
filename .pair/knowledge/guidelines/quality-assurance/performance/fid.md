# First Input Delay (FID) Optimization

## 🎯 **PURPOSE**

Comprehensive guide to understanding, measuring, and optimizing First Input Delay (FID), a critical Core Web Vital that measures interactivity and user experience responsiveness in web applications.

## 🔧 **UNDERSTANDING FIRST INPUT DELAY**

### **What is FID?**

First Input Delay measures the time from when a user first interacts with your page (clicks a link, taps a button, or uses a custom JavaScript-powered control) to the time when the browser is actually able to begin processing event handlers in response to that interaction.

#### Key Characteristics:

- **Real User Metric**: FID can only be measured in the field with real user interactions
- **Interaction-Dependent**: Only triggered by discrete user actions (clicks, taps, key presses)
- **Main Thread Blocking**: Reflects how long the main thread is blocked during page load
- **User Perception**: Directly correlates with perceived responsiveness

### **FID Scoring Thresholds**

#### Google's Core Web Vitals Thresholds:

- **Good**: ≤ 100ms (75th percentile of users)
- **Needs Improvement**: 100ms - 300ms
- **Poor**: > 300ms

#### Performance Targets:

- **Excellent**: < 50ms
- **Good**: 50ms - 100ms
- **Acceptable**: 100ms - 300ms
- **Unacceptable**: > 300ms

## 📊 **FID MEASUREMENT STRATEGIES**

### **Real User Monitoring (RUM)**

#### Web Vitals Library Implementation

```javascript
import { onFID } from 'web-vitals'

// Measure FID in production
onFID(
  metric => {
    // Send metric to analytics
    gtag('event', 'FID', {
      value: Math.round(metric.value),
      event_category: 'Web Vitals',
      event_label: metric.id,
      non_interaction: true,
    })

    // Log for debugging
    console.log('FID:', metric)
  },
  {
    reportAllChanges: true, // Report all FID measurements
  },
)
```

#### Custom FID Measurement

```javascript
class FIDMeasurement {
  constructor() {
    this.isFirstInput = true
    this.observer = null
    this.setupObserver()
  }

  setupObserver() {
    // Use PerformanceEventTiming API
    if ('PerformanceEventTiming' in window) {
      this.observer = new PerformanceObserver(entryList => {
        for (const entry of entryList.getEntries()) {
          if (entry.processingStart && this.isFirstInput) {
            const fid = entry.processingStart - entry.startTime
            this.recordFID(fid, entry)
            this.isFirstInput = false
          }
        }
      })

      this.observer.observe({
        type: 'first-input',
        buffered: true,
      })
    } else {
      // Fallback for older browsers
      this.setupLegacyMeasurement()
    }
  }

  setupLegacyMeasurement() {
    let startTime

    const inputHandler = event => {
      if (this.isFirstInput) {
        startTime = performance.now()

        // Use setTimeout to measure processing delay
        setTimeout(() => {
          const fid = performance.now() - startTime
          this.recordFID(fid, {
            name: event.type,
            target: event.target.tagName,
          })
          this.isFirstInput = false
        }, 0)

        // Remove listeners after first input
        document.removeEventListener('mousedown', inputHandler, true)
        document.removeEventListener('keydown', inputHandler, true)
        document.removeEventListener('touchstart', inputHandler, true)
      }
    }

    document.addEventListener('mousedown', inputHandler, true)
    document.addEventListener('keydown', inputHandler, true)
    document.addEventListener('touchstart', inputHandler, true)
  }

  recordFID(fid, entry) {
    // Send to analytics
    this.sendToAnalytics('FID', fid, {
      elementType: entry.target?.tagName || entry.name,
      url: window.location.pathname,
      timestamp: Date.now(),
    })

    // Trigger performance alerts if FID is poor
    if (fid > 100) {
      this.alertPerformanceIssue('FID', fid)
    }
  }

  sendToAnalytics(metric, value, metadata) {
    // Implementation depends on your analytics provider
    if (window.gtag) {
      gtag('event', metric, {
        value: Math.round(value),
        custom_map: metadata,
      })
    }
  }

  alertPerformanceIssue(metric, value) {
    console.warn(`Performance issue detected: ${metric} = ${value}ms`)

    // Optional: Send to error tracking
    if (window.Sentry) {
      Sentry.addBreadcrumb({
        message: `Poor ${metric} performance`,
        level: 'warning',
        data: { value },
      })
    }
  }
}

// Initialize FID measurement
new FIDMeasurement()
```

### **Lab Testing Alternatives**

Since FID requires real user interaction, use these alternatives for lab testing:

#### Total Blocking Time (TBT)

```javascript
// Measure TBT as a lab proxy for FID
function measureTBT() {
  if ('PerformanceObserver' in window) {
    const observer = new PerformanceObserver(list => {
      let totalBlockingTime = 0

      for (const entry of list.getEntries()) {
        if (entry.duration > 50) {
          totalBlockingTime += entry.duration - 50
        }
      }

      console.log('Total Blocking Time:', totalBlockingTime, 'ms')

      // TBT to FID correlation (approximate)
      const estimatedFID = totalBlockingTime * 0.3
      console.log('Estimated FID:', estimatedFID, 'ms')
    })

    observer.observe({ entryTypes: ['longtask'] })
  }
}
```

#### Max Potential FID

```javascript
function measureMaxPotentialFID() {
  const observer = new PerformanceObserver(list => {
    let maxTaskDuration = 0

    for (const entry of list.getEntries()) {
      if (entry.duration > maxTaskDuration) {
        maxTaskDuration = entry.duration
      }
    }

    console.log('Max Potential FID:', maxTaskDuration, 'ms')
  })

  observer.observe({ entryTypes: ['longtask'] })
}
```

## 🚀 **FID OPTIMIZATION TECHNIQUES**

### **JavaScript Execution Optimization**

#### Code Splitting and Lazy Loading

```javascript
// Split large bundles to reduce initial parsing time
import('./heavy-component.js').then(module => {
  const HeavyComponent = module.default
  // Initialize only when needed
})

// Lazy load non-critical JavaScript
const loadNonCriticalJS = () => {
  const script = document.createElement('script')
  script.src = '/js/non-critical.js'
  script.defer = true
  document.head.appendChild(script)
}

// Load after first interaction or on idle
if ('requestIdleCallback' in window) {
  requestIdleCallback(loadNonCriticalJS)
} else {
  setTimeout(loadNonCriticalJS, 2000)
}
```

#### Task Chunking and Yielding

```javascript
// Break up long-running tasks
async function processLargeDataset(data) {
  const chunkSize = 100
  const chunks = []

  // Split data into chunks
  for (let i = 0; i < data.length; i += chunkSize) {
    chunks.push(data.slice(i, i + chunkSize))
  }

  // Process chunks with yielding
  for (const chunk of chunks) {
    await processChunk(chunk)

    // Yield to browser for other tasks
    await new Promise(resolve => {
      if ('scheduler' in window && 'postTask' in scheduler) {
        scheduler.postTask(resolve, { priority: 'user-blocking' })
      } else {
        setTimeout(resolve, 0)
      }
    })
  }
}

function processChunk(chunk) {
  return new Promise(resolve => {
    // Process chunk
    chunk.forEach(item => {
      // Heavy processing
    })
    resolve()
  })
}
```

#### Web Workers for Heavy Tasks

```javascript
// main.js - Offload heavy computation
class WorkerTaskManager {
  constructor() {
    this.worker = new Worker('/js/heavy-computation-worker.js')
    this.setupWorkerHandlers()
  }

  setupWorkerHandlers() {
    this.worker.onmessage = event => {
      const { taskId, result, error } = event.data

      if (error) {
        console.error('Worker error:', error)
        return
      }

      // Update UI with result
      this.updateUI(taskId, result)
    }
  }

  processHeavyTask(data, taskId) {
    // Send to worker instead of blocking main thread
    this.worker.postMessage({
      taskId,
      data,
      type: 'HEAVY_COMPUTATION',
    })
  }

  updateUI(taskId, result) {
    // Non-blocking UI update
    requestAnimationFrame(() => {
      const element = document.getElementById(taskId)
      if (element) {
        element.textContent = result
      }
    })
  }
}

// heavy-computation-worker.js
self.onmessage = function (event) {
  const { taskId, data, type } = event.data

  try {
    let result

    switch (type) {
      case 'HEAVY_COMPUTATION':
        result = performHeavyComputation(data)
        break
      default:
        throw new Error('Unknown task type')
    }

    self.postMessage({ taskId, result })
  } catch (error) {
    self.postMessage({ taskId, error: error.message })
  }
}

function performHeavyComputation(data) {
  // Heavy computation that would block main thread
  let result = 0
  for (let i = 0; i < data.length; i++) {
    result += Math.sqrt(data[i]) * Math.random()
  }
  return result
}
```

### **Third-Party Script Optimization**

#### Async and Defer Loading

```html
<!-- Defer non-critical scripts -->
<script src="/js/analytics.js" defer></script>

<!-- Async for independent scripts -->
<script src="/js/chat-widget.js" async></script>

<!-- Critical scripts only -->
<script src="/js/critical-functionality.js"></script>
```

#### Dynamic Loading with Performance Budget

```javascript
class ThirdPartyLoader {
  constructor() {
    this.performanceBudget = 100 // 100ms FID budget
    this.loadedScripts = new Set()
  }

  async loadScript(src, priority = 'low') {
    if (this.loadedScripts.has(src)) {
      return
    }

    // Check performance before loading
    const currentFID = await this.getCurrentFID()
    if (currentFID > this.performanceBudget && priority === 'low') {
      console.log(`Delaying ${src} due to performance budget`)
      this.delayedLoad(src)
      return
    }

    return this.loadScriptImmediately(src)
  }

  loadScriptImmediately(src) {
    return new Promise((resolve, reject) => {
      const script = document.createElement('script')
      script.src = src
      script.onload = () => {
        this.loadedScripts.add(src)
        resolve()
      }
      script.onerror = reject
      document.head.appendChild(script)
    })
  }

  delayedLoad(src) {
    // Load when page becomes idle
    if ('requestIdleCallback' in window) {
      requestIdleCallback(() => this.loadScriptImmediately(src))
    } else {
      setTimeout(() => this.loadScriptImmediately(src), 5000)
    }
  }

  async getCurrentFID() {
    // Estimate current main thread blocking
    return new Promise(resolve => {
      const start = performance.now()
      setTimeout(() => {
        const delay = performance.now() - start
        resolve(delay)
      }, 0)
    })
  }
}
```

### **Event Handler Optimization**

#### Passive Event Listeners

```javascript
// Use passive listeners for scroll/touch events
document.addEventListener('touchstart', handleTouch, { passive: true })
document.addEventListener('scroll', handleScroll, { passive: true })

// Debounce expensive event handlers
function debounce(func, wait) {
  let timeout
  return function executedFunction(...args) {
    const later = () => {
      clearTimeout(timeout)
      func(...args)
    }
    clearTimeout(timeout)
    timeout = setTimeout(later, wait)
  }
}

const debouncedResize = debounce(() => {
  // Expensive resize handler
}, 100)

window.addEventListener('resize', debouncedResize)
```

#### Efficient DOM Manipulation

```javascript
// Batch DOM operations
class EfficientDOMUpdater {
  constructor() {
    this.pendingUpdates = []
    this.isUpdateScheduled = false
  }

  scheduleUpdate(updateFunction) {
    this.pendingUpdates.push(updateFunction)

    if (!this.isUpdateScheduled) {
      this.isUpdateScheduled = true
      requestAnimationFrame(() => this.flushUpdates())
    }
  }

  flushUpdates() {
    // Batch all DOM updates in single frame
    const fragment = document.createDocumentFragment()

    this.pendingUpdates.forEach(update => {
      update(fragment)
    })

    // Single DOM append
    document.body.appendChild(fragment)

    this.pendingUpdates = []
    this.isUpdateScheduled = false
  }

  addElement(tag, content) {
    this.scheduleUpdate(fragment => {
      const element = document.createElement(tag)
      element.textContent = content
      fragment.appendChild(element)
    })
  }
}
```

## 📊 **FID MONITORING AND ALERTING**

### **Real-Time Monitoring Setup**

#### Performance Dashboard

```javascript
class FIDMonitor {
  constructor() {
    this.measurements = []
    this.thresholds = {
      good: 100,
      poor: 300,
    }
    this.setupDashboard()
  }

  recordMeasurement(fid, metadata) {
    const measurement = {
      value: fid,
      timestamp: Date.now(),
      ...metadata,
    }

    this.measurements.push(measurement)
    this.updateDashboard()
    this.checkThresholds(measurement)
  }

  updateDashboard() {
    const recent = this.measurements.slice(-100)
    const average = recent.reduce((sum, m) => sum + m.value, 0) / recent.length
    const p75 = this.getPercentile(
      recent.map(m => m.value),
      75,
    )

    document.getElementById('fid-average').textContent = `${average.toFixed(2)}ms`
    document.getElementById('fid-p75').textContent = `${p75.toFixed(2)}ms`

    // Update status indicator
    const status =
      p75 <= this.thresholds.good
        ? 'good'
        : p75 <= this.thresholds.poor
        ? 'needs-improvement'
        : 'poor'
    document.getElementById('fid-status').className = `status-${status}`
  }

  getPercentile(values, percentile) {
    const sorted = values.sort((a, b) => a - b)
    const index = Math.ceil((percentile / 100) * sorted.length) - 1
    return sorted[index]
  }

  checkThresholds(measurement) {
    if (measurement.value > this.thresholds.poor) {
      this.triggerAlert('Poor FID detected', measurement)
    }
  }

  triggerAlert(message, data) {
    console.warn(message, data)

    // Send to monitoring service
    if (window.monitoring) {
      window.monitoring.alert({
        type: 'performance',
        metric: 'FID',
        severity: 'high',
        value: data.value,
        threshold: this.thresholds.poor,
      })
    }
  }
}
```

### **Performance Budgets and CI Integration**

#### Lighthouse CI Configuration

```json
{
  "ci": {
    "collect": {
      "numberOfRuns": 3,
      "settings": {
        "chromeFlags": "--no-sandbox --disable-dev-shm-usage"
      }
    },
    "assert": {
      "assertions": {
        "total-blocking-time": ["error", { "maxNumericValue": 300 }],
        "max-potential-fid": ["error", { "maxNumericValue": 130 }],
        "first-meaningful-paint": ["error", { "maxNumericValue": 2000 }]
      }
    },
    "upload": {
      "target": "temporary-public-storage"
    }
  }
}
```

#### GitHub Actions Performance Check

```yaml
name: Performance Budget Check

on:
  pull_request:
    branches: [main]

jobs:
  performance-budget:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3

      - name: Use Node.js
        uses: actions/setup-node@v3
        with:
          node-version: '18'

      - name: Install dependencies
        run: npm ci

      - name: Build project
        run: npm run build

      - name: Audit URLs using Lighthouse CI
        uses: treosh/lighthouse-ci-action@v9
        with:
          configPath: './lighthouserc.json'
          uploadArtifacts: true
          temporaryPublicStorage: true
        env:
          LHCI_GITHUB_APP_TOKEN: ${{ secrets.LHCI_GITHUB_APP_TOKEN }}
```

---

_Optimizing First Input Delay requires a holistic approach focusing on JavaScript execution efficiency, main thread management, and continuous monitoring to ensure responsive user interactions._

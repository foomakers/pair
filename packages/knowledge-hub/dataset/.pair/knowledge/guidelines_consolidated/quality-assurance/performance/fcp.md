# First Contentful Paint (FCP) Optimization

## 🎯 **PURPOSE**

Comprehensive guide to understanding, measuring, and optimizing First Contentful Paint (FCP), a crucial performance metric that indicates when users first see meaningful content on the page, significantly impacting perceived loading performance.

## 🔧 **UNDERSTANDING FIRST CONTENTFUL PAINT**

### **What is FCP?**

First Contentful Paint measures the time from when the page starts loading to when any part of the page's content is rendered on the screen. Content includes text, images, SVG elements, or non-white canvas elements.

**Key Characteristics:**

- **Visual Feedback**: First visual indicator that the page is loading
- **User Perception**: Critical for perceived performance
- **Loading Signal**: Shows progress to users during page load
- **Engagement Impact**: Faster FCP reduces bounce rates

### **FCP Scoring Thresholds**

**Google's Core Web Vitals Thresholds:**

- **Good**: ≤ 1.8s (75th percentile of users)
- **Needs Improvement**: 1.8s - 3.0s
- **Poor**: > 3.0s

**Performance Targets:**

- **Excellent**: < 1.0s
- **Good**: 1.0s - 1.8s
- **Acceptable**: 1.8s - 3.0s
- **Unacceptable**: > 3.0s

## 📊 **FCP MEASUREMENT STRATEGIES**

### **Web Vitals Library Implementation**

```javascript
import { onFCP } from 'web-vitals'

// Measure FCP in production
onFCP(
  metric => {
    // Send to analytics
    gtag('event', 'FCP', {
      value: Math.round(metric.value),
      event_category: 'Web Vitals',
      event_label: metric.id,
      non_interaction: true,
    })

    console.log('FCP:', metric)
  },
  {
    reportAllChanges: true,
  },
)
```

### **Custom FCP Measurement**

```javascript
class FCPMeasurement {
  constructor() {
    this.setupObserver()
    this.setupFallback()
  }

  setupObserver() {
    if ('PerformanceObserver' in window) {
      const observer = new PerformanceObserver(entryList => {
        const entries = entryList.getEntries()
        const fcpEntry = entries.find(entry => entry.name === 'first-contentful-paint')

        if (fcpEntry) {
          this.recordFCP(fcpEntry.startTime)
          observer.disconnect()
        }
      })

      observer.observe({ type: 'paint', buffered: true })
    }
  }

  setupFallback() {
    // Fallback measurement using Performance Timeline API
    if ('performance' in window && 'getEntriesByType' in performance) {
      const paintEntries = performance.getEntriesByType('paint')
      const fcpEntry = paintEntries.find(entry => entry.name === 'first-contentful-paint')

      if (fcpEntry) {
        this.recordFCP(fcpEntry.startTime)
      } else {
        // Wait for paint entries
        setTimeout(() => this.setupFallback(), 100)
      }
    }
  }

  recordFCP(value) {
    const fcp = Math.round(value)

    // Send to analytics
    this.sendToAnalytics('FCP', fcp)

    // Performance monitoring
    this.evaluatePerformance(fcp)

    // Update user interface
    this.updatePerformanceIndicator(fcp)
  }

  sendToAnalytics(metric, value) {
    // Analytics implementation
    if (window.gtag) {
      gtag('event', metric, {
        value: value,
        custom_map: {
          url: window.location.pathname,
          connection: this.getConnectionType(),
          device: this.getDeviceType(),
        },
      })
    }
  }

  getConnectionType() {
    if ('connection' in navigator) {
      return navigator.connection.effectiveType || 'unknown'
    }
    return 'unknown'
  }

  getDeviceType() {
    const userAgent = navigator.userAgent
    if (/Mobile|Android|iPhone|iPad/.test(userAgent)) {
      return 'mobile'
    }
    return 'desktop'
  }

  evaluatePerformance(fcp) {
    let status, message

    if (fcp <= 1000) {
      status = 'excellent'
      message = 'Excellent FCP performance'
    } else if (fcp <= 1800) {
      status = 'good'
      message = 'Good FCP performance'
    } else if (fcp <= 3000) {
      status = 'needs-improvement'
      message = 'FCP needs improvement'
    } else {
      status = 'poor'
      message = 'Poor FCP performance - investigation needed'
    }

    console.log(`${message}: ${fcp}ms`)

    // Trigger alerts for poor performance
    if (status === 'poor') {
      this.triggerPerformanceAlert(fcp)
    }
  }

  triggerPerformanceAlert(fcp) {
    // Send to monitoring service
    if (window.monitoring) {
      window.monitoring.alert({
        type: 'performance',
        metric: 'FCP',
        value: fcp,
        threshold: 3000,
        severity: 'high',
      })
    }
  }

  updatePerformanceIndicator(fcp) {
    // Update UI performance indicator
    const indicator = document.getElementById('performance-indicator')
    if (indicator) {
      indicator.textContent = `FCP: ${fcp}ms`
      indicator.className = `performance-${this.getPerformanceClass(fcp)}`
    }
  }

  getPerformanceClass(fcp) {
    if (fcp <= 1000) return 'excellent'
    if (fcp <= 1800) return 'good'
    if (fcp <= 3000) return 'needs-improvement'
    return 'poor'
  }
}

// Initialize FCP measurement
new FCPMeasurement()
```

### **Lighthouse Integration**

```javascript
// Automated FCP testing with Lighthouse
const lighthouse = require('lighthouse')
const chromeLauncher = require('chrome-launcher')

async function auditFCP(url) {
  const chrome = await chromeLauncher.launch({ chromeFlags: ['--headless'] })
  const options = {
    logLevel: 'info',
    output: 'json',
    onlyCategories: ['performance'],
    port: chrome.port,
  }

  const runnerResult = await lighthouse(url, options)

  // Extract FCP metric
  const fcp = runnerResult.lhr.audits['first-contentful-paint']

  console.log('FCP Score:', fcp.score)
  console.log('FCP Value:', fcp.displayValue)
  console.log('FCP Numeric Value:', fcp.numericValue)

  await chrome.kill()

  return {
    score: fcp.score,
    value: fcp.numericValue,
    displayValue: fcp.displayValue,
  }
}

// Usage
auditFCP('https://example.com').then(result => {
  console.log('FCP Audit Result:', result)
})
```

## 🚀 **FCP OPTIMIZATION TECHNIQUES**

### **Critical Resource Optimization**

**Critical CSS Inlining**

```html
<!DOCTYPE html>
<html>
  <head>
    <meta charset="UTF-8" />
    <title>Optimized Page</title>

    <!-- Inline critical CSS -->
    <style>
      /* Above-the-fold styles only */
      body {
        margin: 0;
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
      }
      .header {
        background: #fff;
        padding: 1rem;
        border-bottom: 1px solid #ddd;
      }
      .hero {
        padding: 2rem;
        text-align: center;
      }
      .hero h1 {
        font-size: 2.5rem;
        margin-bottom: 1rem;
      }
    </style>

    <!-- Preload critical fonts -->
    <link rel="preload" href="/fonts/primary.woff2" as="font" type="font/woff2" crossorigin />

    <!-- Load non-critical CSS asynchronously -->
    <link
      rel="preload"
      href="/css/non-critical.css"
      as="style"
      onload="this.onload=null;this.rel='stylesheet'" />
    <noscript><link rel="stylesheet" href="/css/non-critical.css" /></noscript>
  </head>
  <body>
    <header class="header">
      <!-- Critical content -->
    </header>

    <main>
      <section class="hero">
        <h1>Welcome to Our Service</h1>
        <p>Fast loading content for better user experience</p>
      </section>
    </main>
  </body>
</html>
```

**Critical CSS Extraction Tool**

```javascript
// Node.js script to extract critical CSS
const puppeteer = require('puppeteer')
const critical = require('critical')

async function extractCriticalCSS(url, cssPath) {
  try {
    const result = await critical.generate({
      inline: false,
      base: './public/',
      src: 'index.html',
      css: [cssPath],
      dimensions: [
        {
          height: 900,
          width: 1300,
        },
        {
          height: 720,
          width: 480,
        },
      ],
      penthouse: {
        blockJSRequests: false,
      },
    })

    console.log('Critical CSS generated:', result)
    return result
  } catch (error) {
    console.error('Error generating critical CSS:', error)
  }
}

// Usage
extractCriticalCSS('https://example.com', './public/css/styles.css')
```

### **Font Loading Optimization**

**Font Display Strategies**

```css
/* Optimized font declarations */
@font-face {
  font-family: 'Primary';
  src: url('/fonts/primary.woff2') format('woff2'), url('/fonts/primary.woff') format('woff');
  font-display: swap; /* Show fallback, then swap when loaded */
  font-weight: 400;
  font-style: normal;
}

@font-face {
  font-family: 'PrimaryBold';
  src: url('/fonts/primary-bold.woff2') format('woff2');
  font-display: optional; /* Only use if loaded quickly */
  font-weight: 700;
  font-style: normal;
}

/* Fallback font stack */
body {
  font-family: 'Primary', -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', 'Helvetica Neue',
    Arial, sans-serif;
}
```

**Font Loading API**

```javascript
class FontLoader {
  constructor() {
    this.fontFaces = new Map()
    this.loadCriticalFonts()
  }

  async loadCriticalFonts() {
    const criticalFonts = [
      {
        family: 'Primary',
        url: '/fonts/primary.woff2',
        weight: '400',
        display: 'swap',
      },
    ]

    const loadPromises = criticalFonts.map(font => this.loadFont(font))

    try {
      await Promise.all(loadPromises)
      console.log('Critical fonts loaded')
      this.updateLoadingState('fonts-loaded')
    } catch (error) {
      console.error('Font loading failed:', error)
      this.updateLoadingState('fonts-fallback')
    }
  }

  async loadFont({ family, url, weight, display }) {
    if ('FontFace' in window) {
      const fontFace = new FontFace(family, `url(${url})`, {
        weight,
        display,
      })

      try {
        const loadedFont = await fontFace.load()
        document.fonts.add(loadedFont)
        this.fontFaces.set(family, loadedFont)
        return loadedFont
      } catch (error) {
        console.error(`Failed to load font ${family}:`, error)
        throw error
      }
    } else {
      // Fallback for older browsers
      return this.loadFontLegacy(family, url)
    }
  }

  loadFontLegacy(family, url) {
    return new Promise((resolve, reject) => {
      const link = document.createElement('link')
      link.rel = 'stylesheet'
      link.href = url
      link.onload = resolve
      link.onerror = reject
      document.head.appendChild(link)
    })
  }

  updateLoadingState(state) {
    document.documentElement.classList.add(state)

    // Trigger layout recalculation if needed
    if (state === 'fonts-loaded') {
      this.triggerReflow()
    }
  }

  triggerReflow() {
    // Force reflow to apply font changes
    document.body.offsetHeight
  }
}

// Initialize font loading
new FontLoader()
```

### **Image Optimization**

**Next-Gen Image Formats**

```html
<!-- Responsive images with modern formats -->
<picture>
  <source
    srcset="
      /images/hero-small.avif   480w,
      /images/hero-medium.avif  768w,
      /images/hero-large.avif  1200w
    "
    type="image/avif"
    sizes="(max-width: 768px) 100vw, (max-width: 1200px) 50vw, 33vw" />

  <source
    srcset="
      /images/hero-small.webp   480w,
      /images/hero-medium.webp  768w,
      /images/hero-large.webp  1200w
    "
    type="image/webp"
    sizes="(max-width: 768px) 100vw, (max-width: 1200px) 50vw, 33vw" />

  <img
    src="/images/hero-medium.jpg"
    srcset="/images/hero-small.jpg 480w, /images/hero-medium.jpg 768w, /images/hero-large.jpg 1200w"
    sizes="(max-width: 768px) 100vw, (max-width: 1200px) 50vw, 33vw"
    alt="Hero image description"
    loading="eager"
    fetchpriority="high" />
</picture>
```

**Image Loading Strategies**

```javascript
class ImageOptimizer {
  constructor() {
    this.observeImages()
    this.preloadCriticalImages()
  }

  preloadCriticalImages() {
    const criticalImages = ['/images/hero.webp', '/images/logo.svg']

    criticalImages.forEach(src => {
      const link = document.createElement('link')
      link.rel = 'preload'
      link.as = 'image'
      link.href = src
      document.head.appendChild(link)
    })
  }

  observeImages() {
    if ('IntersectionObserver' in window) {
      const imageObserver = new IntersectionObserver(
        (entries, observer) => {
          entries.forEach(entry => {
            if (entry.isIntersecting) {
              const img = entry.target
              this.loadImage(img)
              observer.unobserve(img)
            }
          })
        },
        {
          rootMargin: '50px 0px', // Load 50px before entering viewport
        },
      )

      // Observe all images with data-src
      document.querySelectorAll('img[data-src]').forEach(img => {
        imageObserver.observe(img)
      })
    } else {
      // Fallback: load all images
      this.loadAllImages()
    }
  }

  loadImage(img) {
    const src = img.getAttribute('data-src')
    const srcset = img.getAttribute('data-srcset')

    if (src) {
      img.src = src
    }
    if (srcset) {
      img.srcset = srcset
    }

    img.removeAttribute('data-src')
    img.removeAttribute('data-srcset')

    img.onload = () => {
      img.classList.add('loaded')
    }
  }

  loadAllImages() {
    document.querySelectorAll('img[data-src]').forEach(img => {
      this.loadImage(img)
    })
  }
}

// Initialize image optimization
new ImageOptimizer()
```

### **JavaScript and CSS Optimization**

**Resource Prioritization**

```html
<head>
  <!-- Critical resources -->
  <link rel="preload" href="/css/critical.css" as="style" />
  <link rel="preload" href="/js/critical.js" as="script" />

  <!-- DNS prefetch for external resources -->
  <link rel="dns-prefetch" href="//fonts.googleapis.com" />
  <link rel="dns-prefetch" href="//analytics.google.com" />

  <!-- Preconnect to critical origins -->
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />

  <!-- Critical CSS -->
  <link rel="stylesheet" href="/css/critical.css" />
</head>
<body>
  <!-- Content -->

  <!-- Non-critical JavaScript at end of body -->
  <script src="/js/critical.js"></script>
  <script defer src="/js/non-critical.js"></script>
</body>
```

**Module Loading Strategy**

```javascript
// Critical module loader
class ModuleLoader {
  constructor() {
    this.loadCriticalModules()
    this.scheduleNonCriticalModules()
  }

  async loadCriticalModules() {
    try {
      // Load critical functionality immediately
      const [ui, utils] = await Promise.all([
        import('./modules/ui.js'),
        import('./modules/utils.js'),
      ])

      this.initializeCriticalFeatures(ui, utils)
    } catch (error) {
      console.error('Critical module loading failed:', error)
    }
  }

  scheduleNonCriticalModules() {
    // Load non-critical modules when idle
    if ('requestIdleCallback' in window) {
      requestIdleCallback(() => this.loadNonCriticalModules())
    } else {
      setTimeout(() => this.loadNonCriticalModules(), 3000)
    }
  }

  async loadNonCriticalModules() {
    try {
      const modules = await Promise.all([
        import('./modules/analytics.js'),
        import('./modules/chat.js'),
        import('./modules/recommendations.js'),
      ])

      this.initializeNonCriticalFeatures(modules)
    } catch (error) {
      console.error('Non-critical module loading failed:', error)
    }
  }

  initializeCriticalFeatures(ui, utils) {
    // Initialize essential functionality
    ui.renderMainInterface()
    utils.setupEventHandlers()
  }

  initializeNonCriticalFeatures(modules) {
    // Initialize enhancement features
    modules.forEach(module => {
      if (module.initialize) {
        module.initialize()
      }
    })
  }
}

// Initialize module loading
new ModuleLoader()
```

## 📊 **FCP MONITORING AND OPTIMIZATION**

### **Continuous Monitoring Setup**

**Performance Monitoring Dashboard**

```javascript
class FCPMonitor {
  constructor() {
    this.measurements = []
    this.target = 1800 // 1.8s target
    this.setupReporting()
  }

  recordMeasurement(fcp, metadata = {}) {
    const measurement = {
      value: fcp,
      timestamp: Date.now(),
      url: window.location.pathname,
      userAgent: navigator.userAgent,
      connection: this.getConnectionInfo(),
      ...metadata,
    }

    this.measurements.push(measurement)
    this.analyzePerformance()
    this.reportToService(measurement)
  }

  analyzePerformance() {
    const recent = this.measurements.slice(-50)
    const average = recent.reduce((sum, m) => sum + m.value, 0) / recent.length
    const p75 = this.getPercentile(
      recent.map(m => m.value),
      75,
    )
    const p95 = this.getPercentile(
      recent.map(m => m.value),
      95,
    )

    console.log('FCP Performance Analysis:')
    console.log(`Average: ${average.toFixed(2)}ms`)
    console.log(`75th percentile: ${p75.toFixed(2)}ms`)
    console.log(`95th percentile: ${p95.toFixed(2)}ms`)

    // Check if performance is degrading
    if (p75 > this.target) {
      this.triggerAlert('FCP performance degradation detected', {
        p75,
        target: this.target,
      })
    }
  }

  getPercentile(values, percentile) {
    const sorted = values.sort((a, b) => a - b)
    const index = Math.ceil((percentile / 100) * sorted.length) - 1
    return sorted[index] || 0
  }

  getConnectionInfo() {
    if ('connection' in navigator) {
      return {
        effectiveType: navigator.connection.effectiveType,
        downlink: navigator.connection.downlink,
        rtt: navigator.connection.rtt,
      }
    }
    return { effectiveType: 'unknown' }
  }

  reportToService(measurement) {
    // Send to analytics service
    if (window.analytics) {
      window.analytics.track('FCP Measurement', measurement)
    }
  }

  triggerAlert(message, data) {
    console.warn(message, data)

    // Send alert to monitoring service
    if (window.monitoring) {
      window.monitoring.alert({
        type: 'performance',
        metric: 'FCP',
        message,
        data,
        severity: 'medium',
      })
    }
  }
}
```

### **A/B Testing for FCP Optimization**

```javascript
class FCPOptimizationTest {
  constructor() {
    this.variant = this.getTestVariant()
    this.applyOptimizations()
  }

  getTestVariant() {
    // Simple A/B test assignment
    const userId = this.getUserId()
    const hash = this.simpleHash(userId)
    return hash % 2 === 0 ? 'control' : 'optimized'
  }

  getUserId() {
    return localStorage.getItem('userId') || 'anonymous_' + Math.random().toString(36)
  }

  simpleHash(str) {
    let hash = 0
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i)
      hash = (hash << 5) - hash + char
      hash = hash & hash // Convert to 32-bit integer
    }
    return Math.abs(hash)
  }

  applyOptimizations() {
    switch (this.variant) {
      case 'optimized':
        this.applyOptimizedStrategy()
        break
      case 'control':
        this.applyControlStrategy()
        break
    }

    // Track variant assignment
    this.trackVariant()
  }

  applyOptimizedStrategy() {
    // Apply FCP optimizations
    this.inlineCriticalCSS()
    this.preloadCriticalFonts()
    this.optimizeImageLoading()
  }

  applyControlStrategy() {
    // Standard loading strategy
    this.standardResourceLoading()
  }

  trackVariant() {
    if (window.analytics) {
      window.analytics.track('FCP Optimization Test', {
        variant: this.variant,
        timestamp: Date.now(),
      })
    }
  }
}
```

---

_Optimizing First Contentful Paint requires a systematic approach to critical resource loading, with continuous monitoring and iterative improvements based on real user data and performance analysis._

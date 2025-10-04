# Core Web Vitals Optimization

## 🎯 **PURPOSE**

Comprehensive Core Web Vitals optimization framework ensuring optimal user experience through systematic measurement and optimization of Google's user-centric performance metrics: LCP, FID, CLS, and FCP.

## 📊 **CORE WEB VITALS OVERVIEW**

### **Largest Contentful Paint (LCP)**
- **Measures**: Loading performance
- **Good**: ≤ 2.5 seconds
- **Needs Improvement**: 2.5 - 4.0 seconds  
- **Poor**: > 4.0 seconds
- **Focus**: Time until largest content element is rendered

### **First Input Delay (FID) / Interaction to Next Paint (INP)**
- **Measures**: Interactivity and responsiveness
- **FID Good**: ≤ 100 milliseconds
- **INP Good**: ≤ 200 milliseconds
- **Focus**: Time from user interaction to browser response

### **Cumulative Layout Shift (CLS)**
- **Measures**: Visual stability
- **Good**: ≤ 0.1
- **Needs Improvement**: 0.1 - 0.25
- **Poor**: > 0.25
- **Focus**: Unexpected layout shifts during page load

### **First Contentful Paint (FCP)**
- **Measures**: Perceived loading speed
- **Good**: ≤ 1.8 seconds
- **Needs Improvement**: 1.8 - 3.0 seconds
- **Poor**: > 3.0 seconds
- **Focus**: Time until first content appears

## 🚀 **LCP OPTIMIZATION STRATEGIES**

### **Server Response Time Optimization**
```typescript
// Next.js server-side optimization
export async function getServerSideProps(context) {
  // Optimize data fetching
  const [userData, contentData] = await Promise.all([
    fetchUserData(context.params.id),
    fetchContentData(context.query.category)
  ]);
  
  return {
    props: {
      userData,
      contentData,
      // Add cache headers
      headers: {
        'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=300'
      }
    }
  };
}

// Resource optimization
export const resourceOptimization = {
  // Preload critical resources
  preloadCritical: `
    <link rel="preload" href="/fonts/main.woff2" as="font" type="font/woff2" crossorigin>
    <link rel="preload" href="/images/hero.webp" as="image">
    <link rel="preconnect" href="https://api.example.com">
  `,
  
  // Optimize images
  imageOptimization: {
    format: 'WebP with JPEG fallback',
    sizing: 'Responsive images with srcset',
    compression: 'Optimal quality vs. file size balance',
    lazy: 'Above-the-fold images loaded immediately'
  }
}
```

### **Resource Loading Optimization**
```typescript
// Critical resource prioritization
export const resourcePriority = {
  // Critical CSS inlined
  criticalCSS: `
    <style>
      /* Critical above-the-fold styles */
      .header { /* ... */ }
      .hero { /* ... */ }
      .main-content { /* ... */ }
    </style>
  `,
  
  // Non-critical CSS deferred
  deferredCSS: `
    <link rel="preload" href="/styles/non-critical.css" as="style" onload="this.onload=null;this.rel='stylesheet'">
    <noscript><link rel="stylesheet" href="/styles/non-critical.css"></noscript>
  `,
  
  // JavaScript optimization
  jsOptimization: {
    splitting: 'Code splitting with dynamic imports',
    bundling: 'Efficient bundling strategies',
    deferral: 'Non-critical JS deferred or async'
  }
}

// Image optimization implementation
function OptimizedImage({ src, alt, priority = false }) {
  return (
    <Image
      src={src}
      alt={alt}
      priority={priority}
      sizes="(max-width: 768px) 100vw, (max-width: 1200px) 50vw, 33vw"
      style={{
        width: '100%',
        height: 'auto',
      }}
    />
  );
}
```

## ⚡ **FID/INP OPTIMIZATION STRATEGIES**

### **JavaScript Execution Optimization**
```typescript
// Input delay minimization
export const interactivityOptimization = {
  // Break up long tasks
  breakUpTasks: async function(largeDataSet) {
    const chunks = chunkArray(largeDataSet, 100);
    
    for (const chunk of chunks) {
      await new Promise(resolve => {
        processChunk(chunk);
        // Yield to browser
        setTimeout(resolve, 0);
      });
    }
  },
  
  // Use web workers for heavy computations
  webWorkerExample: `
    // main.js
    const worker = new Worker('/workers/data-processor.js');
    worker.postMessage(largeDataSet);
    worker.onmessage = (event) => {
      updateUI(event.data);
    };
    
    // workers/data-processor.js
    self.onmessage = function(event) {
      const processedData = processLargeDataSet(event.data);
      self.postMessage(processedData);
    };
  `,
  
  // Optimize event handlers
  optimizedEventHandlers: `
    // Use event delegation
    document.addEventListener('click', (event) => {
      if (event.target.matches('.button')) {
        handleButtonClick(event);
      }
    });
    
    // Debounce expensive operations
    const debouncedSearch = debounce((query) => {
      performSearch(query);
    }, 300);
  `
}

// React optimization for interactivity
function OptimizedComponent() {
  // Use React.memo for expensive renders
  const MemoizedChild = React.memo(({ data }) => {
    return <ExpensiveComponent data={data} />;
  });
  
  // Use useMemo for expensive calculations
  const expensiveValue = useMemo(() => {
    return computeExpensiveValue(data);
  }, [data]);
  
  // Use useCallback for stable function references
  const handleClick = useCallback((id) => {
    onItemClick(id);
  }, [onItemClick]);
  
  return (
    <div>
      <MemoizedChild data={data} />
    </div>
  );
}
```

### **Bundle Size Optimization**
```typescript
// Code splitting and lazy loading
export const bundleOptimization = {
  // Dynamic imports for route-based splitting
  routeSplitting: `
    const HomePage = lazy(() => import('./pages/Home'));
    const ProfilePage = lazy(() => import('./pages/Profile'));
    
    function App() {
      return (
        <Suspense fallback={<Loading />}>
          <Routes>
            <Route path="/" element={<HomePage />} />
            <Route path="/profile" element={<ProfilePage />} />
          </Routes>
        </Suspense>
      );
    }
  `,
  
  // Component-level splitting
  componentSplitting: `
    const HeavyModal = lazy(() => import('./HeavyModal'));
    
    function App() {
      const [showModal, setShowModal] = useState(false);
      
      return (
        <div>
          {showModal && (
            <Suspense fallback={<ModalSkeleton />}>
              <HeavyModal onClose={() => setShowModal(false)} />
            </Suspense>
          )}
        </div>
      );
    }
  `,
  
  // Library optimization
  libraryOptimization: {
    treeshaking: 'Import only needed functions',
    alternatives: 'Use lighter alternative libraries',
    polyfills: 'Load polyfills only when needed'
  }
}
```

## 🎭 **CLS OPTIMIZATION STRATEGIES**

### **Layout Stability Implementation**
```typescript
// Prevent layout shifts
export const layoutStabilityTechniques = {
  // Reserve space for images
  imageStability: `
    .image-container {
      /* Reserve space with aspect ratio */
      aspect-ratio: 16 / 9;
      width: 100%;
    }
    
    .image-container img {
      width: 100%;
      height: 100%;
      object-fit: cover;
    }
  `,
  
  // Font loading optimization
  fontStability: `
    @font-face {
      font-family: 'CustomFont';
      src: url('/fonts/custom.woff2') format('woff2');
      font-display: swap; /* Use fallback until custom font loads */
    }
    
    .text {
      font-family: 'CustomFont', Arial, sans-serif;
      /* Ensure similar metrics */
      font-size: 16px;
      line-height: 1.4;
    }
  `,
  
  // Dynamic content handling
  dynamicContentStability: `
    // Reserve space for dynamic content
    .ad-container {
      min-height: 250px; /* Reserve space for ads */
      display: flex;
      align-items: center;
      justify-content: center;
    }
    
    .loading-skeleton {
      height: 200px; /* Match expected content height */
      background: linear-gradient(90deg, #f0f0f0 25%, #e0e0e0 50%, #f0f0f0 75%);
    }
  `
}

// React implementation for layout stability
function StableLayout({ children }) {
  return (
    <div className="stable-layout">
      {/* Fixed header height */}
      <header style={{ height: '64px' }}>
        <Navigation />
      </header>
      
      {/* Main content with reserved space */}
      <main style={{ minHeight: 'calc(100vh - 64px - 100px)' }}>
        {children}
      </main>
      
      {/* Fixed footer height */}
      <footer style={{ height: '100px' }}>
        <Footer />
      </footer>
    </div>
  );
}

function StableImageComponent({ src, alt, width, height }) {
  return (
    <div 
      style={{ 
        width: width, 
        height: height,
        backgroundColor: '#f0f0f0' // Placeholder color
      }}
    >
      <img
        src={src}
        alt={alt}
        style={{
          width: '100%',
          height: '100%',
          objectFit: 'cover'
        }}
        onLoad={(e) => {
          // Image loaded, remove placeholder
          e.target.parentElement.style.backgroundColor = 'transparent';
        }}
      />
    </div>
  );
}
```

## 📱 **FCP OPTIMIZATION STRATEGIES**

### **Critical Rendering Path Optimization**
```typescript
// Optimize first paint
export const firstPaintOptimization = {
  // Inline critical CSS
  criticalCSS: `
    <style>
      /* Only styles for above-the-fold content */
      body { margin: 0; font-family: system-ui; }
      .header { height: 64px; background: #fff; }
      .hero { height: 400px; background: #f8f9fa; }
    </style>
  `,
  
  // Preload key resources
  resourcePreloading: `
    <link rel="preload" href="/fonts/primary.woff2" as="font" type="font/woff2" crossorigin>
    <link rel="preload" href="/images/hero.webp" as="image">
    <link rel="dns-prefetch" href="//fonts.googleapis.com">
  `,
  
  // Optimize server response
  serverOptimization: {
    compression: 'Enable gzip/brotli compression',
    http2: 'Use HTTP/2 for multiplexed requests',
    cdn: 'Serve static assets from CDN'
  }
}

// Service Worker for performance
const performanceServiceWorker = `
  // sw.js
  const CACHE_NAME = 'performance-cache-v1';
  const CRITICAL_RESOURCES = [
    '/',
    '/styles/critical.css',
    '/scripts/critical.js',
    '/fonts/primary.woff2'
  ];
  
  self.addEventListener('install', (event) => {
    event.waitUntil(
      caches.open(CACHE_NAME)
        .then(cache => cache.addAll(CRITICAL_RESOURCES))
    );
  });
  
  self.addEventListener('fetch', (event) => {
    event.respondWith(
      caches.match(event.request)
        .then(response => response || fetch(event.request))
    );
  });
`;
```

## 📊 **MEASUREMENT & MONITORING**

### **Core Web Vitals Monitoring Setup**
```typescript
// Real User Monitoring (RUM)
export const coreWebVitalsMonitoring = {
  // Web Vitals library implementation
  webVitalsSetup: `
    import { getCLS, getFID, getFCP, getLCP, getTTFB } from 'web-vitals';
    
    function sendToAnalytics(metric) {
      // Send to your analytics service
      gtag('event', metric.name, {
        value: Math.round(metric.name === 'CLS' ? metric.value * 1000 : metric.value),
        metric_id: metric.id,
        metric_value: metric.value,
        metric_delta: metric.delta,
      });
    }
    
    getCLS(sendToAnalytics);
    getFID(sendToAnalytics);
    getFCP(sendToAnalytics);
    getLCP(sendToAnalytics);
    getTTFB(sendToAnalytics);
  `,
  
  // Custom performance tracking
  customTracking: `
    // Track custom metrics
    function trackCustomMetric(name, value) {
      // Send to monitoring service
      if ('sendBeacon' in navigator) {
        navigator.sendBeacon('/analytics', JSON.stringify({
          metric: name,
          value: value,
          timestamp: Date.now(),
          url: window.location.href
        }));
      }
    }
    
    // Track component render times
    function withPerformanceTracking(Component) {
      return function TrackedComponent(props) {
        const startTime = performance.now();
        
        useEffect(() => {
          const endTime = performance.now();
          trackCustomMetric('component-render-time', endTime - startTime);
        }, []);
        
        return <Component {...props} />;
      };
    }
  `
}

// Performance budget enforcement
export const performanceBudgets = {
  lighthouse: {
    performance: 90,
    'largest-contentful-paint': 2500,
    'first-input-delay': 100,
    'cumulative-layout-shift': 0.1,
    'first-contentful-paint': 1800
  },
  
  webpack: {
    budgets: [
      {
        type: 'initial',
        maximumWarning: '500kb',
        maximumError: '1mb'
      },
      {
        type: 'anyComponentStyle',
        maximumWarning: '2kb',
        maximumError: '4kb'
      }
    ]
  }
}
```

## 🎯 **SUCCESS METRICS & TARGETS**

### **Performance Targets**
- **LCP**: < 2.5s for 75% of page loads
- **FID**: < 100ms for 75% of interactions  
- **CLS**: < 0.1 for 75% of page loads
- **FCP**: < 1.8s for 75% of page loads

### **Monitoring & Alerting**
- **Real-time monitoring** of Core Web Vitals
- **Performance regression alerts** for threshold breaches
- **Monthly performance reports** with trend analysis
- **A/B testing** for performance optimization impact

### **Continuous Improvement**
- **Weekly performance reviews** and optimization planning
- **Performance culture** within development team
- **Performance-first development** practices
- **Regular performance audits** and assessments
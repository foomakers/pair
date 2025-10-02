# Performance Monitoring and Optimization

## Strategic Overview

This framework establishes comprehensive performance monitoring, measurement, and optimization strategies that ensure applications deliver exceptional user experiences through systematic performance analysis, real-time monitoring, and proactive optimization techniques.

## Core Performance Architecture

### Performance Monitoring Stack

#### **Application Performance Monitoring (APM)**
```typescript
// lib/monitoring/performance-monitor.ts
import { performance, PerformanceObserver } from 'perf_hooks';
import { EventEmitter } from 'events';
import { Logger } from '@/lib/logger';
import { MetricsCollector } from '@/lib/metrics';

export interface PerformanceMetric {
  name: string;
  value: number;
  unit: string;
  timestamp: number;
  labels: Record<string, string>;
  threshold?: {
    warning: number;
    critical: number;
  };
}

export interface PerformanceAlert {
  metric: string;
  value: number;
  threshold: number;
  severity: 'warning' | 'critical';
  timestamp: number;
  context: Record<string, any>;
}

export class PerformanceMonitor extends EventEmitter {
  private observers: Map<string, PerformanceObserver> = new Map();
  private metrics: Map<string, PerformanceMetric[]> = new Map();
  private thresholds: Map<string, { warning: number; critical: number }> = new Map();
  private isMonitoring = false;

  constructor(
    private logger: Logger,
    private metricsCollector: MetricsCollector,
    private config: {
      sampleRate: number;
      bufferSize: number;
      flushInterval: number;
      alertThresholds: Record<string, { warning: number; critical: number }>;
    }
  ) {
    super();
    this.setupThresholds();
  }

  private setupThresholds(): void {
    Object.entries(this.config.alertThresholds).forEach(([metric, threshold]) => {
      this.thresholds.set(metric, threshold);
    });
  }

  public startMonitoring(): void {
    if (this.isMonitoring) {
      this.logger.warn('Performance monitoring already started');
      return;
    }

    this.setupWebVitalsObserver();
    this.setupNavigationTimingObserver();
    this.setupResourceTimingObserver();
    this.setupLongTaskObserver();
    this.setupLayoutShiftObserver();
    this.setupCustomMetricsObserver();

    this.isMonitoring = true;
    this.logger.info('Performance monitoring started');

    // Start periodic metrics flush
    this.startMetricsFlush();
  }

  public stopMonitoring(): void {
    this.observers.forEach(observer => observer.disconnect());
    this.observers.clear();
    this.isMonitoring = false;
    this.logger.info('Performance monitoring stopped');
  }

  private setupWebVitalsObserver(): void {
    // First Contentful Paint (FCP)
    const fcpObserver = new PerformanceObserver((list) => {
      const entries = list.getEntriesByType('paint');
      entries.forEach(entry => {
        if (entry.name === 'first-contentful-paint') {
          this.recordMetric({
            name: 'fcp',
            value: entry.startTime,
            unit: 'ms',
            timestamp: Date.now(),
            labels: { type: 'web-vital' }
          });
        }
      });
    });
    fcpObserver.observe({ entryTypes: ['paint'] });
    this.observers.set('fcp', fcpObserver);

    // Largest Contentful Paint (LCP)
    const lcpObserver = new PerformanceObserver((list) => {
      const entries = list.getEntries();
      const lastEntry = entries[entries.length - 1];
      if (lastEntry) {
        this.recordMetric({
          name: 'lcp',
          value: lastEntry.startTime,
          unit: 'ms',
          timestamp: Date.now(),
          labels: { type: 'web-vital' }
        });
      }
    });
    lcpObserver.observe({ entryTypes: ['largest-contentful-paint'] });
    this.observers.set('lcp', lcpObserver);

    // First Input Delay (FID) - requires user interaction
    const fidObserver = new PerformanceObserver((list) => {
      const entries = list.getEntries();
      entries.forEach(entry => {
        this.recordMetric({
          name: 'fid',
          value: entry.processingStart - entry.startTime,
          unit: 'ms',
          timestamp: Date.now(),
          labels: { type: 'web-vital', inputType: entry.name }
        });
      });
    });
    fidObserver.observe({ entryTypes: ['first-input'] });
    this.observers.set('fid', fidObserver);
  }

  private setupNavigationTimingObserver(): void {
    const observer = new PerformanceObserver((list) => {
      const entries = list.getEntriesByType('navigation');
      entries.forEach((entry: any) => {
        // DNS lookup time
        this.recordMetric({
          name: 'dns_lookup_time',
          value: entry.domainLookupEnd - entry.domainLookupStart,
          unit: 'ms',
          timestamp: Date.now(),
          labels: { type: 'navigation-timing' }
        });

        // TCP connection time
        this.recordMetric({
          name: 'tcp_connect_time',
          value: entry.connectEnd - entry.connectStart,
          unit: 'ms',
          timestamp: Date.now(),
          labels: { type: 'navigation-timing' }
        });

        // Request time
        this.recordMetric({
          name: 'request_time',
          value: entry.responseStart - entry.requestStart,
          unit: 'ms',
          timestamp: Date.now(),
          labels: { type: 'navigation-timing' }
        });

        // Response time
        this.recordMetric({
          name: 'response_time',
          value: entry.responseEnd - entry.responseStart,
          unit: 'ms',
          timestamp: Date.now(),
          labels: { type: 'navigation-timing' }
        });

        // DOM processing time
        this.recordMetric({
          name: 'dom_processing_time',
          value: entry.domComplete - entry.domLoading,
          unit: 'ms',
          timestamp: Date.now(),
          labels: { type: 'navigation-timing' }
        });

        // Load event time
        this.recordMetric({
          name: 'load_event_time',
          value: entry.loadEventEnd - entry.loadEventStart,
          unit: 'ms',
          timestamp: Date.now(),
          labels: { type: 'navigation-timing' }
        });
      });
    });

    observer.observe({ entryTypes: ['navigation'] });
    this.observers.set('navigation', observer);
  }

  private setupResourceTimingObserver(): void {
    const observer = new PerformanceObserver((list) => {
      const entries = list.getEntriesByType('resource');
      entries.forEach((entry: any) => {
        // Skip if sampling rate doesn't match
        if (Math.random() > this.config.sampleRate) return;

        const resourceType = this.getResourceType(entry.name);
        const duration = entry.responseEnd - entry.startTime;

        this.recordMetric({
          name: 'resource_load_time',
          value: duration,
          unit: 'ms',
          timestamp: Date.now(),
          labels: {
            type: 'resource-timing',
            resourceType,
            url: entry.name,
            protocol: entry.nextHopProtocol || 'unknown'
          }
        });

        // Record resource size if available
        if (entry.transferSize) {
          this.recordMetric({
            name: 'resource_size',
            value: entry.transferSize,
            unit: 'bytes',
            timestamp: Date.now(),
            labels: {
              type: 'resource-timing',
              resourceType,
              url: entry.name
            }
          });
        }
      });
    });

    observer.observe({ entryTypes: ['resource'] });
    this.observers.set('resource', observer);
  }

  private setupLongTaskObserver(): void {
    const observer = new PerformanceObserver((list) => {
      const entries = list.getEntries();
      entries.forEach(entry => {
        this.recordMetric({
          name: 'long_task_duration',
          value: entry.duration,
          unit: 'ms',
          timestamp: Date.now(),
          labels: { type: 'long-task' }
        });

        // Alert for long tasks
        if (entry.duration > 50) {
          this.emitAlert({
            metric: 'long_task_duration',
            value: entry.duration,
            threshold: 50,
            severity: entry.duration > 100 ? 'critical' : 'warning',
            timestamp: Date.now(),
            context: { entry: entry.toJSON() }
          });
        }
      });
    });

    observer.observe({ entryTypes: ['longtask'] });
    this.observers.set('longtask', observer);
  }

  private setupLayoutShiftObserver(): void {
    let clsScore = 0;
    const observer = new PerformanceObserver((list) => {
      const entries = list.getEntries();
      entries.forEach((entry: any) => {
        if (!entry.hadRecentInput) {
          clsScore += entry.value;
        }
      });

      this.recordMetric({
        name: 'cls',
        value: clsScore,
        unit: 'score',
        timestamp: Date.now(),
        labels: { type: 'web-vital' }
      });
    });

    observer.observe({ entryTypes: ['layout-shift'] });
    this.observers.set('layout-shift', observer);
  }

  private setupCustomMetricsObserver(): void {
    const observer = new PerformanceObserver((list) => {
      const entries = list.getEntriesByType('measure');
      entries.forEach(entry => {
        this.recordMetric({
          name: entry.name,
          value: entry.duration,
          unit: 'ms',
          timestamp: Date.now(),
          labels: { type: 'custom-metric' }
        });
      });
    });

    observer.observe({ entryTypes: ['measure'] });
    this.observers.set('custom', observer);
  }

  private recordMetric(metric: PerformanceMetric): void {
    // Add to in-memory buffer
    if (!this.metrics.has(metric.name)) {
      this.metrics.set(metric.name, []);
    }

    const metricArray = this.metrics.get(metric.name)!;
    metricArray.push(metric);

    // Limit buffer size
    if (metricArray.length > this.config.bufferSize) {
      metricArray.shift();
    }

    // Check thresholds
    this.checkThresholds(metric);

    // Emit metric event
    this.emit('metric', metric);
  }

  private checkThresholds(metric: PerformanceMetric): void {
    const threshold = this.thresholds.get(metric.name);
    if (!threshold) return;

    if (metric.value >= threshold.critical) {
      this.emitAlert({
        metric: metric.name,
        value: metric.value,
        threshold: threshold.critical,
        severity: 'critical',
        timestamp: metric.timestamp,
        context: { metric }
      });
    } else if (metric.value >= threshold.warning) {
      this.emitAlert({
        metric: metric.name,
        value: metric.value,
        threshold: threshold.warning,
        severity: 'warning',
        timestamp: metric.timestamp,
        context: { metric }
      });
    }
  }

  private emitAlert(alert: PerformanceAlert): void {
    this.emit('alert', alert);
    this.logger.warn('Performance alert', alert);
  }

  private getResourceType(url: string): string {
    if (url.includes('.js')) return 'script';
    if (url.includes('.css')) return 'stylesheet';
    if (url.match(/\.(jpg|jpeg|png|gif|webp|svg)$/)) return 'image';
    if (url.match(/\.(woff|woff2|ttf|eot)$/)) return 'font';
    if (url.includes('api/')) return 'api';
    return 'other';
  }

  private startMetricsFlush(): void {
    setInterval(() => {
      this.flushMetrics();
    }, this.config.flushInterval);
  }

  private async flushMetrics(): Promise<void> {
    try {
      for (const [metricName, metricArray] of this.metrics.entries()) {
        if (metricArray.length > 0) {
          await this.metricsCollector.sendMetrics(metricName, metricArray);
          metricArray.length = 0; // Clear the array
        }
      }
    } catch (error) {
      this.logger.error('Failed to flush metrics', error);
    }
  }

  // Public API for custom metrics
  public measureFunction<T>(name: string, fn: () => T): T {
    const start = performance.now();
    try {
      const result = fn();
      const duration = performance.now() - start;
      
      this.recordMetric({
        name,
        value: duration,
        unit: 'ms',
        timestamp: Date.now(),
        labels: { type: 'function-timing' }
      });
      
      return result;
    } catch (error) {
      const duration = performance.now() - start;
      
      this.recordMetric({
        name: `${name}_error`,
        value: duration,
        unit: 'ms',
        timestamp: Date.now(),
        labels: { type: 'function-timing', status: 'error' }
      });
      
      throw error;
    }
  }

  public async measureAsyncFunction<T>(name: string, fn: () => Promise<T>): Promise<T> {
    const start = performance.now();
    try {
      const result = await fn();
      const duration = performance.now() - start;
      
      this.recordMetric({
        name,
        value: duration,
        unit: 'ms',
        timestamp: Date.now(),
        labels: { type: 'async-function-timing' }
      });
      
      return result;
    } catch (error) {
      const duration = performance.now() - start;
      
      this.recordMetric({
        name: `${name}_error`,
        value: duration,
        unit: 'ms',
        timestamp: Date.now(),
        labels: { type: 'async-function-timing', status: 'error' }
      });
      
      throw error;
    }
  }

  public markCustomMetric(name: string, value: number, unit: string = 'count'): void {
    this.recordMetric({
      name,
      value,
      unit,
      timestamp: Date.now(),
      labels: { type: 'custom' }
    });
  }

  public getMetrics(metricName?: string): PerformanceMetric[] {
    if (metricName) {
      return this.metrics.get(metricName) || [];
    }
    
    const allMetrics: PerformanceMetric[] = [];
    this.metrics.forEach(metrics => allMetrics.push(...metrics));
    return allMetrics;
  }

  public getMetricsSummary(): Record<string, {
    count: number;
    avg: number;
    min: number;
    max: number;
    p95: number;
    p99: number;
  }> {
    const summary: Record<string, any> = {};
    
    this.metrics.forEach((metrics, name) => {
      if (metrics.length === 0) return;
      
      const values = metrics.map(m => m.value).sort((a, b) => a - b);
      const count = values.length;
      const sum = values.reduce((a, b) => a + b, 0);
      
      summary[name] = {
        count,
        avg: sum / count,
        min: values[0],
        max: values[count - 1],
        p95: values[Math.floor(count * 0.95)],
        p99: values[Math.floor(count * 0.99)]
      };
    });
    
    return summary;
  }
}

// Usage example
export function setupPerformanceMonitoring() {
  const performanceMonitor = new PerformanceMonitor(
    logger,
    metricsCollector,
    {
      sampleRate: 0.1, // Sample 10% of events
      bufferSize: 1000,
      flushInterval: 30000, // 30 seconds
      alertThresholds: {
        fcp: { warning: 1500, critical: 3000 },
        lcp: { warning: 2500, critical: 4000 },
        fid: { warning: 100, critical: 300 },
        cls: { warning: 0.1, critical: 0.25 },
        long_task_duration: { warning: 50, critical: 100 }
      }
    }
  );

  performanceMonitor.on('alert', (alert) => {
    // Handle performance alerts
    console.warn('Performance Alert:', alert);
    
    // Send to monitoring service
    if (alert.severity === 'critical') {
      // Trigger immediate notification
      notificationService.sendCriticalAlert(alert);
    }
  });

  performanceMonitor.startMonitoring();

  return performanceMonitor;
}
```

#### **React Performance Monitoring**
```typescript
// hooks/usePerformanceMonitoring.ts
import { useEffect, useRef, useCallback } from 'react';
import { usePerformanceMonitor } from '@/contexts/PerformanceContext';

export interface ComponentPerformanceMetrics {
  renderTime: number;
  mountTime: number;
  updateCount: number;
  lastRenderProps: any;
  propsChanges: Array<{
    timestamp: number;
    changedProps: string[];
    renderTime: number;
  }>;
}

export function usePerformanceMonitoring(componentName: string, props?: any) {
  const performanceMonitor = usePerformanceMonitor();
  const metricsRef = useRef<ComponentPerformanceMetrics>({
    renderTime: 0,
    mountTime: 0,
    updateCount: 0,
    lastRenderProps: null,
    propsChanges: []
  });
  const renderStartTime = useRef<number>(0);
  const mountStartTime = useRef<number>(0);

  // Track component mount
  useEffect(() => {
    mountStartTime.current = performance.now();
    
    return () => {
      const mountTime = performance.now() - mountStartTime.current;
      metricsRef.current.mountTime = mountTime;
      
      performanceMonitor.markCustomMetric(
        `component_mount_time_${componentName}`,
        mountTime,
        'ms'
      );
    };
  }, [componentName, performanceMonitor]);

  // Track renders
  useEffect(() => {
    const renderTime = performance.now() - renderStartTime.current;
    metricsRef.current.renderTime = renderTime;
    metricsRef.current.updateCount++;

    // Track prop changes
    if (props && metricsRef.current.lastRenderProps) {
      const changedProps = Object.keys(props).filter(
        key => props[key] !== metricsRef.current.lastRenderProps[key]
      );

      if (changedProps.length > 0) {
        metricsRef.current.propsChanges.push({
          timestamp: Date.now(),
          changedProps,
          renderTime
        });

        performanceMonitor.markCustomMetric(
          `component_prop_changes_${componentName}`,
          changedProps.length,
          'count'
        );
      }
    }

    metricsRef.current.lastRenderProps = props;

    performanceMonitor.markCustomMetric(
      `component_render_time_${componentName}`,
      renderTime,
      'ms'
    );

    // Alert for slow renders
    if (renderTime > 16) {
      console.warn(`Slow render detected in ${componentName}: ${renderTime.toFixed(2)}ms`);
    }
  });

  // Start render timing before render
  renderStartTime.current = performance.now();

  const measureOperation = useCallback(
    (operationName: string, operation: () => any) => {
      return performanceMonitor.measureFunction(
        `${componentName}_${operationName}`,
        operation
      );
    },
    [componentName, performanceMonitor]
  );

  const measureAsyncOperation = useCallback(
    (operationName: string, operation: () => Promise<any>) => {
      return performanceMonitor.measureAsyncFunction(
        `${componentName}_${operationName}`,
        operation
      );
    },
    [componentName, performanceMonitor]
  );

  return {
    metrics: metricsRef.current,
    measureOperation,
    measureAsyncOperation
  };
}

// React Performance Profiler Component
export function PerformanceProfiler({ 
  children, 
  componentName,
  onRender 
}: {
  children: React.ReactNode;
  componentName: string;
  onRender?: (metrics: any) => void;
}) {
  const performanceMonitor = usePerformanceMonitor();

  const handleRender = useCallback(
    (id: string, phase: 'mount' | 'update', actualDuration: number, baseDuration: number) => {
      const metrics = {
        id,
        phase,
        actualDuration,
        baseDuration,
        timestamp: Date.now()
      };

      performanceMonitor.markCustomMetric(
        `profiler_${componentName}_${phase}_duration`,
        actualDuration,
        'ms'
      );

      onRender?.(metrics);
    },
    [componentName, performanceMonitor, onRender]
  );

  return (
    <React.Profiler id={componentName} onRender={handleRender}>
      {children}
    </React.Profiler>
  );
}
```

### Performance Optimization Strategies

#### **Code Splitting and Lazy Loading**
```typescript
// utils/performance/code-splitting.ts
import { lazy, ComponentType, LazyExoticComponent } from 'react';
import { performanceMonitor } from '@/lib/monitoring';

interface LazyLoadOptions {
  fallback?: ComponentType;
  retryCount?: number;
  timeout?: number;
  preload?: boolean;
}

export function createLazyComponent<T extends ComponentType<any>>(
  importFn: () => Promise<{ default: T }>,
  options: LazyLoadOptions = {}
): LazyExoticComponent<T> {
  const {
    retryCount = 3,
    timeout = 10000,
    preload = false
  } = options;

  let importPromise: Promise<{ default: T }> | null = null;

  const loadComponent = async (): Promise<{ default: T }> => {
    if (importPromise) {
      return importPromise;
    }

    const startTime = performance.now();
    
    importPromise = Promise.race([
      importFn(),
      new Promise<never>((_, reject) => {
        setTimeout(() => reject(new Error('Component load timeout')), timeout);
      })
    ]);

    try {
      const module = await importPromise;
      const loadTime = performance.now() - startTime;
      
      performanceMonitor.markCustomMetric(
        'component_lazy_load_time',
        loadTime,
        'ms'
      );

      return module;
    } catch (error) {
      importPromise = null; // Reset for retry
      
      performanceMonitor.markCustomMetric(
        'component_lazy_load_error',
        1,
        'count'
      );

      if (retryCount > 0) {
        console.warn(`Failed to load component, retrying... (${retryCount} attempts left)`);
        return createLazyComponent(importFn, { ...options, retryCount: retryCount - 1 })();
      }
      
      throw error;
    }
  };

  const LazyComponent = lazy(loadComponent);

  // Preload if requested
  if (preload) {
    loadComponent().catch(console.error);
  }

  return LazyComponent;
}

// Enhanced Suspense wrapper with performance tracking
export function PerformanceSuspense({
  children,
  fallback,
  suspenseId
}: {
  children: React.ReactNode;
  fallback: React.ReactNode;
  suspenseId: string;
}) {
  const startTimeRef = useRef<number>(0);

  useEffect(() => {
    startTimeRef.current = performance.now();
  }, []);

  useEffect(() => {
    const suspenseTime = performance.now() - startTimeRef.current;
    
    performanceMonitor.markCustomMetric(
      `suspense_time_${suspenseId}`,
      suspenseTime,
      'ms'
    );
  });

  return (
    <Suspense fallback={fallback}>
      {children}
    </Suspense>
  );
}
```

#### **Memory Leak Detection and Prevention**
```typescript
// utils/performance/memory-monitoring.ts
export class MemoryMonitor {
  private memoryCheckInterval: NodeJS.Timeout | null = null;
  private isMonitoring = false;

  constructor(
    private checkInterval: number = 30000, // 30 seconds
    private thresholds = {
      warning: 50 * 1024 * 1024, // 50MB
      critical: 100 * 1024 * 1024 // 100MB
    }
  ) {}

  public startMonitoring(): void {
    if (this.isMonitoring) return;

    this.isMonitoring = true;
    this.memoryCheckInterval = setInterval(() => {
      this.checkMemoryUsage();
    }, this.checkInterval);

    // Also check on visibility change
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') {
        this.checkMemoryUsage();
      }
    });
  }

  public stopMonitoring(): void {
    if (this.memoryCheckInterval) {
      clearInterval(this.memoryCheckInterval);
      this.memoryCheckInterval = null;
    }
    this.isMonitoring = false;
  }

  private checkMemoryUsage(): void {
    if (!('memory' in performance)) return;

    const memory = (performance as any).memory;
    const used = memory.usedJSHeapSize;
    const total = memory.totalJSHeapSize;
    const limit = memory.jsHeapSizeLimit;

    const usagePercentage = (used / limit) * 100;

    performanceMonitor.markCustomMetric('memory_used_heap', used, 'bytes');
    performanceMonitor.markCustomMetric('memory_total_heap', total, 'bytes');
    performanceMonitor.markCustomMetric('memory_usage_percentage', usagePercentage, 'percent');

    // Check thresholds
    if (used > this.thresholds.critical) {
      console.error(`Critical memory usage: ${this.formatBytes(used)} (${usagePercentage.toFixed(1)}%)`);
      this.triggerGarbageCollection();
    } else if (used > this.thresholds.warning) {
      console.warn(`High memory usage: ${this.formatBytes(used)} (${usagePercentage.toFixed(1)}%)`);
    }
  }

  private triggerGarbageCollection(): void {
    // Force garbage collection if available (Chrome DevTools)
    if ('gc' in window) {
      (window as any).gc();
    }

    // Suggest cleanup actions
    this.suggestCleanupActions();
  }

  private suggestCleanupActions(): void {
    console.group('Memory Cleanup Suggestions');
    console.log('1. Clear large data structures');
    console.log('2. Remove event listeners');
    console.log('3. Cancel pending requests');
    console.log('4. Clear timers and intervals');
    console.groupEnd();
  }

  private formatBytes(bytes: number): string {
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    if (bytes === 0) return '0 Bytes';
    const i = Math.floor(Math.log(bytes) / Math.log(1024));
    return Math.round(bytes / Math.pow(1024, i) * 100) / 100 + ' ' + sizes[i];
  }

  public getMemorySnapshot(): any {
    if (!('memory' in performance)) return null;

    const memory = (performance as any).memory;
    return {
      used: memory.usedJSHeapSize,
      total: memory.totalJSHeapSize,
      limit: memory.jsHeapSizeLimit,
      timestamp: Date.now()
    };
  }
}

// React hook for memory leak detection
export function useMemoryLeakDetection(componentName: string) {
  const subscriptionsRef = useRef<Set<() => void>>(new Set());
  const timersRef = useRef<Set<NodeJS.Timeout>>(new Set());
  const intervalsRef = useRef<Set<NodeJS.Timeout>>(new Set());

  const addSubscription = useCallback((cleanup: () => void) => {
    subscriptionsRef.current.add(cleanup);
    return () => subscriptionsRef.current.delete(cleanup);
  }, []);

  const addTimer = useCallback((timer: NodeJS.Timeout) => {
    timersRef.current.add(timer);
    return () => {
      clearTimeout(timer);
      timersRef.current.delete(timer);
    };
  }, []);

  const addInterval = useCallback((interval: NodeJS.Timeout) => {
    intervalsRef.current.add(interval);
    return () => {
      clearInterval(interval);
      intervalsRef.current.delete(interval);
    };
  }, []);

  useEffect(() => {
    return () => {
      // Cleanup all subscriptions
      subscriptionsRef.current.forEach(cleanup => {
        try {
          cleanup();
        } catch (error) {
          console.error(`Failed to cleanup subscription in ${componentName}:`, error);
        }
      });

      // Clear all timers
      timersRef.current.forEach(timer => {
        clearTimeout(timer);
      });

      // Clear all intervals
      intervalsRef.current.forEach(interval => {
        clearInterval(interval);
      });

      const totalCleanups = 
        subscriptionsRef.current.size + 
        timersRef.current.size + 
        intervalsRef.current.size;

      if (totalCleanups > 0) {
        performanceMonitor.markCustomMetric(
          `component_cleanup_count_${componentName}`,
          totalCleanups,
          'count'
        );
      }
    };
  }, [componentName]);

  return {
    addSubscription,
    addTimer,
    addInterval
  };
}
```

This comprehensive performance monitoring framework provides enterprise-grade performance tracking, optimization strategies, and memory management that ensures applications maintain optimal performance through systematic monitoring and proactive optimization techniques.
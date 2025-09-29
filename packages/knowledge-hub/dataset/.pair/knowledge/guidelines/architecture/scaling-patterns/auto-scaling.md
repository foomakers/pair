# Auto-Scaling Patterns

Dynamic resource adjustment based on demand and performance metrics.

## When to Use

- **Variable traffic patterns**
- **Cost optimization** needs
- **Automatic resource management**
- **Peak load handling**

## Kubernetes HPA Configuration

```yaml
# kubernetes-hpa.yaml
apiVersion: autoscaling/v2
kind: HorizontalPodAutoscaler
metadata:
  name: order-service-hpa
spec:
  scaleTargetRef:
    apiVersion: apps/v1
    kind: Deployment
    name: order-service
  minReplicas: 2
  maxReplicas: 10
  metrics:
  - type: Resource
    resource:
      name: cpu
      target:
        type: Utilization
        averageUtilization: 70
  - type: Resource
    resource:
      name: memory
      target:
        type: Utilization
        averageUtilization: 80
  behavior:
    scaleUp:
      stabilizationWindowSeconds: 60
      policies:
      - type: Percent
        value: 100
        periodSeconds: 15
    scaleDown:
      stabilizationWindowSeconds: 300
      policies:
      - type: Percent
        value: 10
        periodSeconds: 60
```

## Application-Level Auto-scaling

```typescript
export class ApplicationAutoScaler {
  private currentInstances = 1
  private readonly minInstances = 2
  private readonly maxInstances = 10
  
  constructor(
    private metricsCollector: MetricsCollector,
    private instanceManager: InstanceManager
  ) {
    this.startMonitoring()
  }
  
  private startMonitoring(): void {
    setInterval(async () => {
      const metrics = await this.metricsCollector.getCurrentMetrics()
      await this.evaluateScaling(metrics)
    }, 30000) // Check every 30 seconds
  }
  
  private async evaluateScaling(metrics: ApplicationMetrics): Promise<void> {
    const cpuUsage = metrics.averageCpuUsage
    const memoryUsage = metrics.averageMemoryUsage
    const responseTime = metrics.averageResponseTime
    const queueLength = metrics.messageQueueLength
    
    // Scale up conditions
    if (
      (cpuUsage > 75 || memoryUsage > 80 || responseTime > 1000 || queueLength > 100) &&
      this.currentInstances < this.maxInstances
    ) {
      await this.scaleUp()
    }
    
    // Scale down conditions
    else if (
      cpuUsage < 25 && memoryUsage < 30 && responseTime < 200 && queueLength < 10 &&
      this.currentInstances > this.minInstances
    ) {
      await this.scaleDown()
    }
  }
  
  private async scaleUp(): Promise<void> {
    const newInstanceCount = Math.min(this.currentInstances + 1, this.maxInstances)
    await this.instanceManager.setInstanceCount(newInstanceCount)
    this.currentInstances = newInstanceCount
  }
  
  private async scaleDown(): Promise<void> {
    const newInstanceCount = Math.max(this.currentInstances - 1, this.minInstances)
    await this.instanceManager.setInstanceCount(newInstanceCount)
    this.currentInstances = newInstanceCount
  }
}
```

## Scaling Metrics

**CPU Utilization:** Target 60-80% for optimal efficiency
**Memory Usage:** Target 70-85% to avoid OOM
**Response Time:** Keep under SLA thresholds
**Queue Length:** Monitor request backlog

## Auto-scaling Types

**Reactive Scaling:** Based on current metrics
**Predictive Scaling:** Based on historical patterns
**Scheduled Scaling:** Based on known patterns

## Pros and Cons

**Pros:**
- **Cost efficiency** - Pay only for needed resources
- **Performance** - Automatic response to load
- **Availability** - Scale up during peaks
- **Hands-off operation** - Reduced manual intervention

**Cons:**
- **Cold start delays** - Time to provision new instances
- **Oscillation** - Rapid scaling up/down
- **Complexity** - Requires careful configuration
- **Monitoring dependency** - Relies on good metrics

## Best Practices

- **Conservative scaling down** - Slower scale-down than scale-up
- **Stabilization windows** - Prevent oscillation
- **Multiple metrics** - Don't rely on single metric
- **Testing** - Test scaling behavior under load

## Related Patterns

- [Load Balancing](scaling-patterns-load-balancing.md) - Traffic distribution
- [Circuit Breaker](scaling-patterns-circuit-breaker.md) - Failure resilience
- [Performance Monitoring](performance-patterns-monitoring.md) - Metrics collection

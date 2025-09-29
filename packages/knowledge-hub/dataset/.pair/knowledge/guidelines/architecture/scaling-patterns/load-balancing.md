# Load Balancing Patterns

Traffic distribution strategies for service scaling and high availability.

## When to Use

- **Multiple service instances**
- **High availability** requirements
- **Traffic distribution** needs
- **Fault tolerance** for services

## Load Balancing Strategies

### Round Robin Load Balancing

```typescript
export class RoundRobinLoadBalancer {
  private currentIndex = 0
  
  constructor(private servers: Server[]) {}
  
  getNextServer(): Server {
    const server = this.servers[this.currentIndex]
    this.currentIndex = (this.currentIndex + 1) % this.servers.length
    return server
  }
}
```

### Weighted Load Balancing

```typescript
export class WeightedLoadBalancer {
  private weightedServers: WeightedServer[]
  
  constructor(servers: Array<{server: Server, weight: number}>) {
    this.weightedServers = this.buildWeightedList(servers)
  }
  
  getNextServer(): Server {
    const totalWeight = this.weightedServers.reduce((sum, ws) => sum + ws.weight, 0)
    const random = Math.random() * totalWeight
    
    let weightSum = 0
    for (const weightedServer of this.weightedServers) {
      weightSum += weightedServer.weight
      if (random <= weightSum) {
        return weightedServer.server
      }
    }
    
    return this.weightedServers[0].server
  }
}
```

### Health Check Integration

```typescript
export class HealthAwareLoadBalancer {
  constructor(
    private servers: Server[],
    private healthChecker: HealthChecker
  ) {
    this.startHealthMonitoring()
  }
  
  getHealthyServer(): Server {
    const healthyServers = this.servers.filter(server => 
      this.healthChecker.isHealthy(server)
    )
    
    if (healthyServers.length === 0) {
      throw new NoHealthyServersError()
    }
    
    return this.selectFromHealthy(healthyServers)
  }
  
  private startHealthMonitoring(): void {
    setInterval(async () => {
      for (const server of this.servers) {
        try {
          await this.healthChecker.check(server)
        } catch (error) {
          this.markUnhealthy(server)
        }
      }
    }, 30000) // Check every 30 seconds
  }
}
```

## Algorithm Comparison

| Algorithm | Use Case | Pros | Cons |
|-----------|----------|------|------|
| Round Robin | Equal capacity servers | Simple, fair distribution | No server capacity awareness |
| Weighted | Different capacity servers | Capacity-aware distribution | Requires capacity tuning |
| Least Connections | Variable request duration | Balances active load | Higher overhead |
| Random | Stateless applications | Simple, good distribution | Not predictable |

## Pros and Cons

**Pros:**
- **High availability** - Automatic failover
- **Scalability** - Easy to add instances
- **Performance** - Distributes load efficiently
- **Flexibility** - Multiple algorithms available

**Cons:**
- **Single point of failure** - Load balancer itself
- **Session affinity** - Sticky sessions can be complex
- **Health monitoring** - Requires robust health checks

## Best Practices

- **Multiple load balancers** - Avoid single point of failure
- **Health checks** - Monitor service health
- **Graceful shutdown** - Drain connections before stopping
- **SSL termination** - Handle encryption at load balancer

## Related Patterns

- [Circuit Breaker](scaling-patterns-circuit-breaker.md) - Failure resilience
- [Auto-Scaling](scaling-patterns-auto-scaling.md) - Dynamic scaling
- [Service Mesh](integration-patterns.md) - Advanced traffic management

# Database Sharding Pattern

Horizontal database partitioning for large-scale data distribution.

## When to Use

- **Very large datasets** (TB+ range)
- **Write-heavy workloads**
- **Horizontal scaling** needed
- **Geographic data distribution**

## Implementation

```typescript
// Sharding Strategy
export interface ShardingStrategy {
  getShardKey(data: any): string
  getShardForKey(key: string): string
}

export class HashShardingStrategy implements ShardingStrategy {
  constructor(private shardCount: number) {}
  
  getShardKey(user: User): string {
    return user.id
  }
  
  getShardForKey(key: string): string {
    const hash = this.hashFunction(key)
    const shardIndex = hash % this.shardCount
    return `shard_${shardIndex}`
  }
  
  private hashFunction(key: string): number {
    let hash = 0
    for (let i = 0; i < key.length; i++) {
      const char = key.charCodeAt(i)
      hash = ((hash << 5) - hash) + char
      hash = hash & hash // Convert to 32-bit integer
    }
    return Math.abs(hash)
  }
}

// Sharded Repository
export class ShardedUserRepository {
  constructor(
    private shardingStrategy: ShardingStrategy,
    private shardConnections: Map<string, Connection>
  ) {}
  
  async createUser(user: User): Promise<User> {
    const shardKey = this.shardingStrategy.getShardKey(user)
    const shard = this.shardingStrategy.getShardForKey(shardKey)
    const connection = this.shardConnections.get(shard)
    
    return await connection.query('INSERT INTO users ...', user)
  }
  
  async findUserById(id: string): Promise<User | null> {
    const shard = this.shardingStrategy.getShardForKey(id)
    const connection = this.shardConnections.get(shard)
    
    return await connection.query('SELECT * FROM users WHERE id = ?', [id])
  }
  
  // Cross-shard queries require scatter-gather
  async findUsersByEmail(email: string): Promise<User[]> {
    const queries = Array.from(this.shardConnections.entries()).map(
      async ([shardName, connection]) => {
        return await connection.query('SELECT * FROM users WHERE email = ?', [email])
      }
    )
    
    const results = await Promise.all(queries)
    return results.flat()
  }
}
```

## Sharding Strategies

**Hash-based Sharding:** Even distribution but no range queries
**Range-based Sharding:** Range queries but potential hot spots
**Directory-based Sharding:** Flexible but adds complexity

## Pros and Cons

**Pros:**
- **Massive scale** - Handle TB+ datasets
- **Write performance** - Distributes write load
- **Independent scaling** - Scale shards independently

**Cons:**
- **High complexity** - Complex implementation
- **Cross-shard queries** - Expensive scatter-gather operations
- **Rebalancing difficulty** - Hard to redistribute data

## Best Practices

- **Choose shard key carefully** - Even distribution, minimal cross-shard queries
- **Avoid hot shards** - Monitor shard utilization
- **Plan for growth** - Consider future rebalancing needs

## Related Patterns

- [Read Replicas](scaling-patterns-database-read-replicas.md) - For read-heavy workloads
- [CQRS Scaling](scaling-patterns-cqrs.md) - Command-query separation

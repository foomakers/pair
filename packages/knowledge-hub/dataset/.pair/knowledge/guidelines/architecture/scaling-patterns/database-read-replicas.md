# Database Read Replicas Pattern

Read-heavy workload optimization through read replica scaling strategies.

## When to Use

- **Read-heavy workloads** (80% reads, 20% writes)
- **Geographical distribution** needed
- **Reporting and analytics** queries
- **Reduce primary database load**

## Implementation

```typescript
// Database Configuration
export class DatabaseConfig {
  private readonly writeConnection: Connection
  private readonly readConnections: Connection[]
  private currentReadIndex = 0
  
  constructor(
    writeConfig: ConnectionConfig,
    readConfigs: ConnectionConfig[]
  ) {
    this.writeConnection = new Connection(writeConfig)
    this.readConnections = readConfigs.map(config => new Connection(config))
  }
  
  getWriteConnection(): Connection {
    return this.writeConnection
  }
  
  getReadConnection(): Connection {
    // Round-robin load balancing for read replicas
    const connection = this.readConnections[this.currentReadIndex]
    this.currentReadIndex = (this.currentReadIndex + 1) % this.readConnections.length
    return connection
  }
}

// Repository Implementation
export class UserRepository {
  constructor(private dbConfig: DatabaseConfig) {}
  
  // Write operations go to primary
  async createUser(user: User): Promise<User> {
    const connection = this.dbConfig.getWriteConnection()
    return await connection.query('INSERT INTO users ...', user)
  }
  
  // Read operations go to replicas
  async findUserById(id: string): Promise<User | null> {
    const connection = this.dbConfig.getReadConnection()
    return await connection.query('SELECT * FROM users WHERE id = ?', [id])
  }
  
  // Complex queries go to read replicas
  async searchUsers(criteria: SearchCriteria): Promise<User[]> {
    const connection = this.dbConfig.getReadConnection()
    return await connection.query(this.buildSearchQuery(criteria))
  }
}
```

## Pros and Cons

**Pros:**
- **High read performance** - Distributes read load
- **Low complexity** - Simple to implement
- **Geographic distribution** - Place replicas near users
- **Backup benefits** - Replicas can serve as backups

**Cons:**
- **Eventual consistency** - Replication lag
- **Write bottleneck** - Primary still handles all writes
- **Storage costs** - Multiple database instances

## Best Practices

- **Monitor replication lag** - Keep under 100ms for most use cases
- **Health checks** - Automatic failover for failed replicas
- **Query routing** - Separate read/write connection logic
- **Connection pooling** - Optimize connections per replica

## Related Patterns

- [Database Sharding](scaling-patterns-database-sharding.md) - For write-heavy workloads
- [CQRS Scaling](scaling-patterns-cqrs.md) - Command-query separation
- [Load Balancing](scaling-patterns-load-balancing.md) - Traffic distribution

# Database Optimization Patterns

Strategies for optimizing database performance and scalability.

## When to Use

- **Slow query performance** - Queries taking > 100ms
- **High database load** - CPU/memory pressure on database
- **Scalability bottlenecks** - Database becoming the limiting factor
- **Complex queries** - Multi-table joins, aggregations, searches

## Query Optimization Patterns

### Query Analysis and Optimization

```typescript
// Query performance monitoring
export class QueryPerformanceMonitor {
  private slowQueryThreshold = 100 // milliseconds
  
  async executeQuery<T>(
    query: string,
    params: any[] = []
  ): Promise<T[]> {
    const startTime = Date.now()
    
    try {
      const result = await this.database.query<T>(query, params)
      const executionTime = Date.now() - startTime
      
      // Log slow queries
      if (executionTime > this.slowQueryThreshold) {
        await this.logSlowQuery({
          query,
          params,
          executionTime,
          timestamp: new Date(),
          explain: await this.getQueryPlan(query, params)
        })
      }
      
      return result
    } catch (error) {
      await this.logQueryError(query, params, error)
      throw error
    }
  }
  
  private async getQueryPlan(query: string, params: any[]): Promise<any> {
    const explainQuery = `EXPLAIN ANALYZE ${query}`
    return await this.database.query(explainQuery, params)
  }
}
```

### Index Strategy

```typescript
// Intelligent index management
export class IndexManager {
  private indexUsageStats = new Map<string, IndexUsage>()
  
  async analyzeQueryForIndexes(query: string): Promise<IndexRecommendation[]> {
    const ast = this.parseQuery(query)
    const recommendations: IndexRecommendation[] = []
    
    // Analyze WHERE clauses
    for (const condition of ast.whereConditions) {
      if (condition.type === 'equality' || condition.type === 'range') {
        recommendations.push({
          table: condition.table,
          columns: [condition.column],
          type: 'btree',
          reason: `${condition.type} condition on ${condition.column}`
        })
      }
    }
    
    // Analyze JOIN conditions
    for (const join of ast.joins) {
      recommendations.push({
        table: join.table,
        columns: [join.onColumn],
        type: 'btree',
        reason: `JOIN condition on ${join.onColumn}`
      })
    }
    
    // Analyze ORDER BY clauses
    if (ast.orderBy.length > 0) {
      recommendations.push({
        table: ast.from,
        columns: ast.orderBy,
        type: 'btree',
        reason: 'ORDER BY optimization'
      })
    }
    
    return recommendations
  }
  
  async createCompositeIndex(
    table: string,
    columns: string[],
    options: IndexOptions = {}
  ): Promise<void> {
    const indexName = `idx_${table}_${columns.join('_')}`
    
    const createIndexSQL = `
      CREATE INDEX CONCURRENTLY ${indexName}
      ON ${table} (${columns.join(', ')})
      ${options.partial ? `WHERE ${options.partial}` : ''}
    `
    
    await this.database.execute(createIndexSQL)
    
    // Track index creation
    this.indexUsageStats.set(indexName, {
      table,
      columns,
      createdAt: new Date(),
      usageCount: 0,
      lastUsed: null
    })
  }
}
```

### Query Batching

```typescript
// Batch multiple queries for efficiency
export class QueryBatcher {
  private batchSize = 100
  private batchTimeout = 50 // milliseconds
  private pendingQueries: BatchedQuery[] = []
  private batchTimer: NodeJS.Timeout | null = null
  
  async batchQuery<T>(
    query: string,
    params: any[]
  ): Promise<T[]> {
    return new Promise((resolve, reject) => {
      this.pendingQueries.push({
        query,
        params,
        resolve,
        reject
      })
      
      if (this.pendingQueries.length >= this.batchSize) {
        this.executeBatch()
      } else if (!this.batchTimer) {
        this.batchTimer = setTimeout(() => this.executeBatch(), this.batchTimeout)
      }
    })
  }
  
  private async executeBatch(): Promise<void> {
    if (this.batchTimer) {
      clearTimeout(this.batchTimer)
      this.batchTimer = null
    }
    
    const queries = this.pendingQueries.splice(0)
    if (queries.length === 0) return
    
    try {
      // Group similar queries
      const groupedQueries = this.groupSimilarQueries(queries)
      
      // Execute each group
      for (const [queryTemplate, queryGroup] of groupedQueries) {
        await this.executeSimilarQueries(queryTemplate, queryGroup)
      }
    } catch (error) {
      // Reject all pending queries
      queries.forEach(q => q.reject(error))
    }
  }
  
  private async executeSimilarQueries(
    template: string,
    queries: BatchedQuery[]
  ): Promise<void> {
    if (template.includes('SELECT') && template.includes('WHERE id = ?')) {
      // Batch SELECT by ID queries
      await this.executeBatchSelect(queries)
    } else if (template.includes('INSERT INTO')) {
      // Batch INSERT queries
      await this.executeBatchInsert(queries)
    } else {
      // Execute individually
      await this.executeIndividually(queries)
    }
  }
  
  private async executeBatchSelect(queries: BatchedQuery[]): Promise<void> {
    const ids = queries.map(q => q.params[0])
    const tableName = this.extractTableName(queries[0].query)
    
    const batchQuery = `
      SELECT * FROM ${tableName} 
      WHERE id IN (${ids.map(() => '?').join(', ')})
    `
    
    const results = await this.database.query(batchQuery, ids)
    
    // Map results back to individual queries
    const resultMap = new Map(results.map(r => [r.id, r]))
    
    queries.forEach((query, index) => {
      const id = ids[index]
      const result = resultMap.get(id)
      query.resolve(result ? [result] : [])
    })
  }
}
```

## Connection Pool Optimization

### Adaptive Connection Pooling

```typescript
// Dynamic connection pool sizing
export class AdaptiveConnectionPool {
  private minConnections = 5
  private maxConnections = 50
  private currentConnections = this.minConnections
  private connectionQueue: Connection[] = []
  private waitingQueries: Array<{
    resolve: (conn: Connection) => void
    reject: (error: Error) => void
    timestamp: number
  }> = []
  
  constructor(private connectionFactory: ConnectionFactory) {
    this.initializePool()
    this.startMonitoring()
  }
  
  async getConnection(): Promise<Connection> {
    // Try to get available connection
    const connection = this.connectionQueue.pop()
    if (connection && connection.isValid()) {
      return connection
    }
    
    // No available connections - can we create more?
    if (this.currentConnections < this.maxConnections) {
      return await this.createConnection()
    }
    
    // Wait for connection to become available
    return new Promise((resolve, reject) => {
      this.waitingQueries.push({
        resolve,
        reject,
        timestamp: Date.now()
      })
      
      // Timeout after 30 seconds
      setTimeout(() => {
        const index = this.waitingQueries.findIndex(w => w.resolve === resolve)
        if (index >= 0) {
          this.waitingQueries.splice(index, 1)
          reject(new Error('Connection timeout'))
        }
      }, 30000)
    })
  }
  
  async releaseConnection(connection: Connection): Promise<void> {
    // Serve waiting query if any
    const waiting = this.waitingQueries.shift()
    if (waiting) {
      waiting.resolve(connection)
      return
    }
    
    // Return to pool
    this.connectionQueue.push(connection)
  }
  
  private startMonitoring(): void {
    setInterval(() => {
      this.adjustPoolSize()
    }, 10000) // Check every 10 seconds
  }
  
  private adjustPoolSize(): void {
    const utilization = this.calculateUtilization()
    
    if (utilization > 0.8 && this.currentConnections < this.maxConnections) {
      // High utilization - add connections
      this.scaleUp()
    } else if (utilization < 0.3 && this.currentConnections > this.minConnections) {
      // Low utilization - remove connections
      this.scaleDown()
    }
  }
}
```

## Data Access Patterns

### Repository Pattern with Caching

```typescript
// Optimized repository with multiple strategies
export class OptimizedRepository<T extends Entity> {
  constructor(
    private database: Database,
    private cache: Cache,
    private searchIndex: SearchIndex
  ) {}
  
  async findById(id: string): Promise<T | null> {
    // Try cache first
    const cacheKey = `${this.entityName}:${id}`
    let entity = await this.cache.get<T>(cacheKey)
    
    if (!entity) {
      // Database lookup with optimized query
      const query = `
        SELECT * FROM ${this.tableName} 
        WHERE id = ? AND deleted_at IS NULL
      `
      const results = await this.database.query<T>(query, [id])
      entity = results[0] || null
      
      if (entity) {
        await this.cache.set(cacheKey, entity, { ttl: 3600 })
      }
    }
    
    return entity
  }
  
  async findByIds(ids: string[]): Promise<T[]> {
    if (ids.length === 0) return []
    
    // Check cache for each ID
    const cacheKeys = ids.map(id => `${this.entityName}:${id}`)
    const cachedResults = await this.cache.getMultiple<T>(cacheKeys)
    
    // Find which IDs are missing from cache
    const missingIds = ids.filter((id, index) => !cachedResults[index])
    
    if (missingIds.length === 0) {
      return cachedResults.filter(Boolean)
    }
    
    // Fetch missing entities in batch
    const query = `
      SELECT * FROM ${this.tableName} 
      WHERE id IN (${missingIds.map(() => '?').join(', ')})
      AND deleted_at IS NULL
    `
    const dbResults = await this.database.query<T>(query, missingIds)
    
    // Cache the results
    await Promise.all(
      dbResults.map(entity => 
        this.cache.set(`${this.entityName}:${entity.id}`, entity, { ttl: 3600 })
      )
    )
    
    // Combine cached and DB results
    return [...cachedResults.filter(Boolean), ...dbResults]
  }
  
  async search(criteria: SearchCriteria): Promise<SearchResult<T>> {
    // Use search index for complex queries
    if (this.isComplexSearch(criteria)) {
      return await this.searchIndex.search<T>(this.entityName, criteria)
    }
    
    // Use database for simple queries with proper indexing
    const { query, params } = this.buildOptimizedQuery(criteria)
    const results = await this.database.query<T>(query, params)
    
    return {
      items: results,
      total: results.length,
      hasMore: false
    }
  }
  
  private buildOptimizedQuery(criteria: SearchCriteria): { query: string, params: any[] } {
    let query = `SELECT * FROM ${this.tableName} WHERE deleted_at IS NULL`
    const params: any[] = []
    
    // Add indexed conditions first (most selective)
    if (criteria.status) {
      query += ` AND status = ?`
      params.push(criteria.status)
    }
    
    if (criteria.categoryId) {
      query += ` AND category_id = ?`
      params.push(criteria.categoryId)
    }
    
    // Add range conditions
    if (criteria.createdAfter) {
      query += ` AND created_at > ?`
      params.push(criteria.createdAfter)
    }
    
    // Add ordering (use indexed columns)
    query += ` ORDER BY created_at DESC`
    
    // Add pagination
    if (criteria.limit) {
      query += ` LIMIT ?`
      params.push(criteria.limit)
      
      if (criteria.offset) {
        query += ` OFFSET ?`
        params.push(criteria.offset)
      }
    }
    
    return { query, params }
  }
}
```

## Best Practices

- **Index strategy** - Create indexes for WHERE, JOIN, and ORDER BY columns
- **Query optimization** - Use EXPLAIN ANALYZE to understand query performance
- **Connection pooling** - Size pools based on workload characteristics
- **Batch operations** - Group similar operations together
- **Data pagination** - Use cursor-based pagination for large datasets
- **Read replicas** - Distribute read load across multiple replicas
- **Query caching** - Cache expensive query results appropriately

## Common Pitfalls

- **N+1 queries** - Loading related data in loops
- **Missing indexes** - Forgetting to index filtered/joined columns
- **Over-indexing** - Too many indexes slow down writes
- **Large result sets** - Fetching too much data at once
- **Connection leaks** - Not properly releasing database connections
- **Unnecessary joins** - Including tables that aren't needed

## Related Patterns

- [Caching Patterns](performance-patterns-caching.md) - Cache database results
- [Database Read Replicas](scaling-patterns-database-read-replicas.md) - Scale reads
- [Database Sharding](scaling-patterns-sharding.md) - Scale writes
- [CQRS](scaling-patterns-cqrs.md) - Separate read/write models

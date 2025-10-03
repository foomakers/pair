# Cloud Database Services

## Overview

Comprehensive guide for selecting, implementing, and managing cloud database services across different providers, covering relational, NoSQL, and specialized database solutions.

## Database Service Categories

### Relational Databases (SQL)

**Use Cases**: ACID transactions, complex queries, structured data, traditional applications
**Characteristics**: Strong consistency, SQL interface, ACID compliance, relational integrity

### NoSQL Databases

**Document Stores**: Flexible schema, JSON-like documents, horizontal scaling
**Key-Value Stores**: Simple key-value pairs, high performance, caching, session storage
**Wide-Column**: Column-family storage, time-series data, analytical workloads
**Graph Databases**: Relationship-focused, social networks, recommendation engines

### Specialized Databases

**Time-Series**: IoT data, metrics, monitoring, financial data
**Search Engines**: Full-text search, log analysis, content discovery
**In-Memory**: Caching, session storage, real-time analytics

## Provider Comparison Matrix

| Service Type       | AWS            | GCP            | Azure                         | Managed Options       |
| ------------------ | -------------- | -------------- | ----------------------------- | --------------------- |
| **PostgreSQL**     | RDS PostgreSQL | Cloud SQL      | Azure Database for PostgreSQL | Supabase, PlanetScale |
| **MySQL**          | RDS MySQL      | Cloud SQL      | Azure Database for MySQL      | PlanetScale, Aiven    |
| **NoSQL Document** | DocumentDB     | Firestore      | Cosmos DB                     | MongoDB Atlas         |
| **Key-Value**      | DynamoDB       | Firestore      | Cosmos DB                     | Redis Cloud, Upstash  |
| **Time-Series**    | Timestream     | Cloud Bigtable | Time Series Insights          | InfluxDB Cloud        |
| **Data Warehouse** | Redshift       | BigQuery       | Synapse Analytics             | Snowflake             |
| **Search**         | OpenSearch     | -              | Cognitive Search              | Elasticsearch Cloud   |

## Decision Matrix: Database Selection

| Criteria                 | PostgreSQL | MySQL | DynamoDB | Firestore | MongoDB | Weight |
| ------------------------ | ---------- | ----- | -------- | --------- | ------- | ------ |
| **ACID Compliance**      | 10/10      | 9/10  | 7/10     | 8/10      | 8/10    | 25%    |
| **Scalability**          | 7/10       | 7/10  | 10/10    | 9/10      | 8/10    | 20%    |
| **Query Flexibility**    | 10/10      | 9/10  | 6/10     | 7/10      | 8/10    | 20%    |
| **Operational Overhead** | 6/10       | 6/10  | 9/10     | 9/10      | 7/10    | 15%    |
| **Cost Efficiency**      | 8/10       | 8/10  | 7/10     | 8/10      | 7/10    | 10%    |
| **Ecosystem Support**    | 9/10       | 9/10  | 8/10     | 7/10      | 8/10    | 10%    |

## Decision Tree: Database Selection

```
Start: What type of data and access patterns?
├── Structured Data with Complex Queries
│   ├── High consistency required? → PostgreSQL/MySQL (RDS/Cloud SQL)
│   ├── Analytics workload? → BigQuery/Redshift/Snowflake
│   └── Traditional application? → PostgreSQL (managed service)
├── Semi-Structured/Flexible Schema
│   ├── Real-time features needed? → Firestore
│   ├── Global scale required? → DynamoDB/Cosmos DB
│   └── Rich queries needed? → MongoDB Atlas
├── Key-Value/Session Data
│   ├── In-memory performance? → Redis/Elasticache
│   ├── Serverless preferred? → DynamoDB/Firestore
│   └── Cost optimization? → Redis Cloud/Upstash
├── Time-Series Data
│   ├── IoT/Metrics data? → InfluxDB/Timestream
│   ├── Analytics focus? → BigQuery/Redshift
│   └── Real-time processing? → Apache Kafka + Time-series DB
└── Search/Full-Text
    ├── Simple search? → Database full-text features
    ├── Complex search? → Elasticsearch/OpenSearch
    └── AI-powered search? → Pinecone/Weaviate
```

## AWS Database Services

### Amazon RDS

```typescript
// RDS PostgreSQL with connection pooling
import { Pool } from 'pg'

const pool = new Pool({
  host: process.env.RDS_ENDPOINT,
  port: 5432,
  database: process.env.RDS_DATABASE,
  user: process.env.RDS_USERNAME,
  password: process.env.RDS_PASSWORD,
  ssl: {
    rejectUnauthorized: false,
  },
  max: 20, // Maximum number of clients in the pool
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 2000,
})

export async function queryDatabase(text: string, params?: any[]) {
  const client = await pool.connect()
  try {
    const result = await client.query(text, params)
    return result.rows
  } finally {
    client.release()
  }
}
```

### DynamoDB

```typescript
import { DynamoDBClient } from '@aws-sdk/client-dynamodb'
import { DynamoDBDocumentClient, GetCommand, PutCommand, QueryCommand } from '@aws-sdk/lib-dynamodb'

const client = new DynamoDBClient({ region: 'us-east-1' })
const docClient = DynamoDBDocumentClient.from(client)

// Single item operations
export async function getUser(userId: string) {
  const command = new GetCommand({
    TableName: 'Users',
    Key: { userId },
  })

  const response = await docClient.send(command)
  return response.Item
}

export async function createUser(user: any) {
  const command = new PutCommand({
    TableName: 'Users',
    Item: {
      ...user,
      createdAt: new Date().toISOString(),
    },
    ConditionExpression: 'attribute_not_exists(userId)',
  })

  await docClient.send(command)
}

// Query with pagination
export async function getUserPosts(userId: string, limit = 20, exclusiveStartKey?: any) {
  const command = new QueryCommand({
    TableName: 'Posts',
    IndexName: 'UserIdIndex',
    KeyConditionExpression: 'userId = :userId',
    ExpressionAttributeValues: {
      ':userId': userId,
    },
    Limit: limit,
    ExclusiveStartKey: exclusiveStartKey,
    ScanIndexForward: false, // Sort by sort key in descending order
  })

  const response = await docClient.send(command)
  return {
    items: response.Items,
    lastEvaluatedKey: response.LastEvaluatedKey,
  }
}
```

## GCP Database Services

### Cloud SQL

```typescript
import { Pool } from 'pg'

// Cloud SQL with connection pooling
const pool = new Pool({
  host: '/cloudsql/PROJECT_ID:REGION:INSTANCE_ID', // Unix socket for App Engine
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  max: 5, // Cloud SQL has connection limits
})

export async function executeTransaction(queries: Array<{ text: string; params?: any[] }>) {
  const client = await pool.connect()

  try {
    await client.query('BEGIN')

    const results = []
    for (const query of queries) {
      const result = await client.query(query.text, query.params)
      results.push(result.rows)
    }

    await client.query('COMMIT')
    return results
  } catch (error) {
    await client.query('ROLLBACK')
    throw error
  } finally {
    client.release()
  }
}
```

### Firestore

```typescript
import { initializeApp } from 'firebase-admin/app'
import { getFirestore } from 'firebase-admin/firestore'

const app = initializeApp()
const db = getFirestore(app)

// Document operations
export async function createUser(userId: string, userData: any) {
  const userRef = db.collection('users').doc(userId)
  await userRef.set({
    ...userData,
    createdAt: new Date(),
    updatedAt: new Date(),
  })
}

export async function getUser(userId: string) {
  const userRef = db.collection('users').doc(userId)
  const doc = await userRef.get()

  if (!doc.exists) {
    return null
  }

  return { id: doc.id, ...doc.data() }
}

// Real-time subscriptions
export function subscribeToUserPosts(userId: string, callback: (posts: any[]) => void) {
  return db
    .collection('posts')
    .where('userId', '==', userId)
    .orderBy('createdAt', 'desc')
    .limit(50)
    .onSnapshot(snapshot => {
      const posts = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data(),
      }))
      callback(posts)
    })
}

// Batch operations
export async function updateMultipleDocuments(
  updates: Array<{ collection: string; id: string; data: any }>,
) {
  const batch = db.batch()

  updates.forEach(update => {
    const ref = db.collection(update.collection).doc(update.id)
    batch.update(ref, {
      ...update.data,
      updatedAt: new Date(),
    })
  })

  await batch.commit()
}
```

## Managed Database Services

### Supabase (PostgreSQL)

```typescript
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_ANON_KEY!)

// Type-safe database operations
interface User {
  id: string
  name: string
  email: string
  created_at: string
}

export async function getUsers(): Promise<User[]> {
  const { data, error } = await supabase
    .from('users')
    .select('*')
    .order('created_at', { ascending: false })

  if (error) throw error
  return data
}

export async function createUser(user: Omit<User, 'id' | 'created_at'>) {
  const { data, error } = await supabase.from('users').insert([user]).select().single()

  if (error) throw error
  return data
}

// Real-time subscriptions
export function subscribeToUsers(callback: (users: User[]) => void) {
  return supabase
    .channel('users')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'users' }, () => {
      // Refetch users when changes occur
      getUsers().then(callback)
    })
    .subscribe()
}
```

### PlanetScale (MySQL)

```typescript
import { Client } from '@planetscale/database'

const client = new Client({
  host: process.env.DATABASE_HOST,
  username: process.env.DATABASE_USERNAME,
  password: process.env.DATABASE_PASSWORD,
})

// Prepared statements for security
export async function getUserById(id: string) {
  const result = await client.execute('SELECT * FROM users WHERE id = ?', [id])
  return result.rows[0]
}

export async function createPost(post: any) {
  const result = await client.execute(
    'INSERT INTO posts (title, content, user_id, created_at) VALUES (?, ?, ?, NOW())',
    [post.title, post.content, post.userId],
  )
  return result.insertId
}

// Transactions
export async function transferPoints(fromUserId: string, toUserId: string, points: number) {
  const txn = client.transaction()

  try {
    await txn.execute('UPDATE users SET points = points - ? WHERE id = ? AND points >= ?', [
      points,
      fromUserId,
      points,
    ])

    await txn.execute('UPDATE users SET points = points + ? WHERE id = ?', [points, toUserId])

    await txn.commit()
  } catch (error) {
    await txn.rollback()
    throw error
  }
}
```

## Performance Optimization Strategies

### Connection Pooling

```typescript
// PostgreSQL connection pooling
import { Pool } from 'pg'

const pool = new Pool({
  // Connection configuration
  max: 20, // Maximum number of clients
  idleTimeoutMillis: 30000, // Close idle clients after 30 seconds
  connectionTimeoutMillis: 2000, // Return error after 2 seconds if connection cannot be established
  maxUses: 7500, // Close (and replace) a connection after it has been used 7500 times
})

// Graceful shutdown
process.on('SIGINT', () => {
  pool.end(() => {
    console.log('Pool has ended')
    process.exit(0)
  })
})
```

### Caching Strategies

```typescript
import Redis from 'ioredis'

const redis = new Redis(process.env.REDIS_URL)

// Cache-aside pattern
export async function getCachedUser(userId: string) {
  const cacheKey = `user:${userId}`

  // Try cache first
  const cached = await redis.get(cacheKey)
  if (cached) {
    return JSON.parse(cached)
  }

  // Fetch from database
  const user = await getUserFromDatabase(userId)

  // Cache for 1 hour
  await redis.setex(cacheKey, 3600, JSON.stringify(user))

  return user
}

// Write-through cache
export async function updateUser(userId: string, updates: any) {
  const user = await updateUserInDatabase(userId, updates)

  // Update cache
  const cacheKey = `user:${userId}`
  await redis.setex(cacheKey, 3600, JSON.stringify(user))

  return user
}
```

### Database Indexing

```sql
-- PostgreSQL indexing strategies

-- Single column index for frequent lookups
CREATE INDEX idx_users_email ON users (email);

-- Composite index for multi-column queries
CREATE INDEX idx_posts_user_created ON posts (user_id, created_at DESC);

-- Partial index for conditional queries
CREATE INDEX idx_active_users ON users (id) WHERE active = true;

-- Index for text search
CREATE INDEX idx_posts_content_gin ON posts USING gin(to_tsvector('english', content));

-- Index monitoring
SELECT
    schemaname,
    tablename,
    indexname,
    idx_scan,
    idx_tup_read,
    idx_tup_fetch
FROM pg_stat_user_indexes
ORDER BY idx_scan DESC;
```

## Security Best Practices

### Authentication and Authorization

```typescript
// Row Level Security with Supabase
export async function getUserPosts(userId: string, requestingUserId: string) {
  // RLS automatically filters results based on authenticated user
  const { data, error } = await supabase
    .from('posts')
    .select('*')
    .eq('user_id', userId)
    .eq('visibility', 'public') // Additional application-level filtering
    .order('created_at', { ascending: false })

  if (error) throw error
  return data
}

// Application-level authorization
export async function updatePost(postId: string, updates: any, userId: string) {
  // Check ownership
  const post = await supabase.from('posts').select('user_id').eq('id', postId).single()

  if (post.data?.user_id !== userId) {
    throw new Error('Unauthorized')
  }

  // Perform update
  const { data, error } = await supabase
    .from('posts')
    .update(updates)
    .eq('id', postId)
    .select()
    .single()

  if (error) throw error
  return data
}
```

### Data Encryption

```typescript
// Application-level encryption for sensitive data
import crypto from 'crypto'

const algorithm = 'aes-256-gcm'
const key = Buffer.from(process.env.ENCRYPTION_KEY!, 'hex')

export function encrypt(text: string): string {
  const iv = crypto.randomBytes(16)
  const cipher = crypto.createCipher(algorithm, key)
  cipher.setAAD(Buffer.from('additional_data'))

  let encrypted = cipher.update(text, 'utf8', 'hex')
  encrypted += cipher.final('hex')

  const authTag = cipher.getAuthTag()

  return iv.toString('hex') + ':' + authTag.toString('hex') + ':' + encrypted
}

export function decrypt(encryptedData: string): string {
  const parts = encryptedData.split(':')
  const iv = Buffer.from(parts[0], 'hex')
  const authTag = Buffer.from(parts[1], 'hex')
  const encrypted = parts[2]

  const decipher = crypto.createDecipher(algorithm, key)
  decipher.setAAD(Buffer.from('additional_data'))
  decipher.setAuthTag(authTag)

  let decrypted = decipher.update(encrypted, 'hex', 'utf8')
  decrypted += decipher.final('utf8')

  return decrypted
}
```

## Cost Optimization Strategies

### Database Resource Optimization

```typescript
// Connection pooling for cost efficiency
const poolConfig = {
  // Minimize connections for cost optimization
  min: 2,
  max: process.env.NODE_ENV === 'production' ? 20 : 5,

  // Aggressive cleanup for development
  idleTimeoutMillis: process.env.NODE_ENV === 'production' ? 30000 : 10000,

  // Monitoring and logging
  log: (message: string, level: string) => {
    if (level === 'error') {
      console.error('Pool error:', message)
    }
  },
}
```

### Query Optimization

```sql
-- Cost-effective query patterns

-- Use LIMIT to control data transfer costs
SELECT * FROM posts
ORDER BY created_at DESC
LIMIT 50;

-- Efficient pagination
SELECT * FROM posts
WHERE created_at < '2023-01-01'
ORDER BY created_at DESC
LIMIT 50;

-- Avoid SELECT * in production
SELECT id, title, created_at FROM posts;

-- Use covering indexes to avoid table lookups
CREATE INDEX idx_posts_covering ON posts (user_id) INCLUDE (title, created_at);
```

## Backup and Disaster Recovery

### Automated Backup Strategies

```typescript
// Backup automation with AWS Lambda
export const backupDatabase = async (event: any) => {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-')
  const backupName = `backup-${timestamp}`

  try {
    // Create RDS snapshot
    await rdsClient.createDBSnapshot({
      DBInstanceIdentifier: process.env.DB_INSTANCE_ID!,
      DBSnapshotIdentifier: backupName,
    })

    // Export to S3 for long-term storage
    await rdsClient.startExportTask({
      ExportTaskIdentifier: `export-${timestamp}`,
      SourceArn: `arn:aws:rds:region:account:snapshot:${backupName}`,
      S3BucketName: process.env.BACKUP_BUCKET!,
      IamRoleArn: process.env.EXPORT_ROLE_ARN!,
      KmsKeyId: process.env.KMS_KEY_ID!,
    })
  } catch (error) {
    console.error('Backup failed:', error)
    throw error
  }
}
```

## Monitoring and Observability

### Database Performance Monitoring

```typescript
import { CloudWatch } from '@aws-sdk/client-cloudwatch'

const cloudwatch = new CloudWatch({ region: 'us-east-1' })

export async function createDatabaseAlarms() {
  // CPU utilization alarm
  await cloudwatch.putMetricAlarm({
    AlarmName: 'DatabaseHighCPU',
    ComparisonOperator: 'GreaterThanThreshold',
    EvaluationPeriods: 2,
    MetricName: 'CPUUtilization',
    Namespace: 'AWS/RDS',
    Period: 300,
    Statistic: 'Average',
    Threshold: 80,
    ActionsEnabled: true,
    AlarmActions: [process.env.SNS_TOPIC_ARN!],
    AlarmDescription: 'Database CPU usage is too high',
    Dimensions: [
      {
        Name: 'DBInstanceIdentifier',
        Value: process.env.DB_INSTANCE_ID!,
      },
    ],
  })

  // Connection count alarm
  await cloudwatch.putMetricAlarm({
    AlarmName: 'DatabaseHighConnections',
    ComparisonOperator: 'GreaterThanThreshold',
    EvaluationPeriods: 2,
    MetricName: 'DatabaseConnections',
    Namespace: 'AWS/RDS',
    Period: 300,
    Statistic: 'Average',
    Threshold: 50,
    ActionsEnabled: true,
    AlarmActions: [process.env.SNS_TOPIC_ARN!],
    AlarmDescription: 'Database connection count is too high',
    Dimensions: [
      {
        Name: 'DBInstanceIdentifier',
        Value: process.env.DB_INSTANCE_ID!,
      },
    ],
  })
}
```

## Implementation Checklist

### Pre-Implementation

- [ ] Define data access patterns and query requirements
- [ ] Evaluate consistency and ACID requirements
- [ ] Estimate data volume and growth projections
- [ ] Plan for backup and disaster recovery requirements
- [ ] Consider compliance and regulatory requirements

### Implementation Phase

- [ ] Set up database instances with appropriate configuration
- [ ] Implement connection pooling and error handling
- [ ] Configure monitoring and alerting
- [ ] Implement backup and recovery procedures
- [ ] Set up security policies and access controls

### Post-Implementation

- [ ] Monitor performance and optimize queries
- [ ] Review and optimize costs regularly
- [ ] Test backup and recovery procedures
- [ ] Plan for scaling and capacity management
- [ ] Maintain documentation and operational procedures

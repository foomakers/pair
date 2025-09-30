# Data Architecture for LLM Integration

Data storage schemas, management patterns, and synchronization strategies for LLM and RAG systems.

## Vector Storage Schema

### Database Design

#### Core Tables Schema
```sql
-- Documents table for source content
CREATE TABLE documents (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    title TEXT NOT NULL,
    content TEXT NOT NULL,
    content_hash TEXT NOT NULL UNIQUE, -- For change detection
    metadata JSONB DEFAULT '{}',
    source_type TEXT NOT NULL, -- 'file', 'url', 'api', 'manual'
    source_path TEXT, -- File path or URL
    source_metadata JSONB DEFAULT '{}',
    word_count INTEGER DEFAULT 0,
    char_count INTEGER DEFAULT 0,
    language TEXT DEFAULT 'en',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    indexed_at TIMESTAMP WITH TIME ZONE,
    is_active BOOLEAN DEFAULT true
);

-- Embeddings table for vector storage
CREATE TABLE embeddings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    document_id UUID REFERENCES documents(id) ON DELETE CASCADE,
    chunk_index INTEGER NOT NULL,
    content TEXT NOT NULL,
    content_hash TEXT NOT NULL, -- For deduplication
    vector VECTOR(1536), -- OpenAI ada-002 dimension
    token_count INTEGER DEFAULT 0,
    metadata JSONB DEFAULT '{}',
    embedding_model TEXT NOT NULL DEFAULT 'text-embedding-ada-002',
    embedding_version INTEGER DEFAULT 1,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(document_id, chunk_index)
);

-- Document relationships
CREATE TABLE document_relationships (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    source_doc_id UUID REFERENCES documents(id) ON DELETE CASCADE,
    target_doc_id UUID REFERENCES documents(id) ON DELETE CASCADE,
    relationship_type TEXT NOT NULL, -- 'reference', 'parent', 'child', 'related'
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(source_doc_id, target_doc_id, relationship_type)
);

-- Search and usage analytics
CREATE TABLE search_queries (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    query_text TEXT NOT NULL,
    query_embedding VECTOR(1536),
    user_id TEXT,
    session_id TEXT,
    result_count INTEGER DEFAULT 0,
    execution_time_ms INTEGER,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE search_results (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    query_id UUID REFERENCES search_queries(id) ON DELETE CASCADE,
    document_id UUID REFERENCES documents(id) ON DELETE CASCADE,
    embedding_id UUID REFERENCES embeddings(id) ON DELETE CASCADE,
    similarity_score REAL NOT NULL,
    rank_position INTEGER NOT NULL,
    was_clicked BOOLEAN DEFAULT false,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
```

#### Indexes for Performance
```sql
-- Vector similarity search indexes
CREATE INDEX ON embeddings USING ivfflat (vector vector_cosine_ops) WITH (lists = 100);
CREATE INDEX ON search_queries USING ivfflat (query_embedding vector_cosine_ops) WITH (lists = 50);

-- Traditional indexes
CREATE INDEX idx_documents_source_type ON documents(source_type);
CREATE INDEX idx_documents_active ON documents(is_active) WHERE is_active = true;
CREATE INDEX idx_documents_updated ON documents(updated_at DESC);
CREATE INDEX idx_documents_hash ON documents(content_hash);

CREATE INDEX idx_embeddings_document ON embeddings(document_id);
CREATE INDEX idx_embeddings_model ON embeddings(embedding_model);
CREATE INDEX idx_embeddings_hash ON embeddings(content_hash);

CREATE INDEX idx_search_queries_created ON search_queries(created_at DESC);
CREATE INDEX idx_search_results_similarity ON search_results(similarity_score DESC);

-- GIN indexes for JSONB
CREATE INDEX idx_documents_metadata ON documents USING GIN(metadata);
CREATE INDEX idx_embeddings_metadata ON embeddings USING GIN(metadata);
```

### Metadata Schema Patterns

#### Document Metadata
```typescript
interface DocumentMetadata {
  // Source information
  author?: string
  createdDate?: string
  modifiedDate?: string
  version?: string
  
  // Content classification
  tags: string[]
  categories: string[]
  topics: string[]
  entities: string[]
  
  // Quality metrics
  qualityScore?: number
  readabilityScore?: number
  factualityScore?: number
  
  // Processing information
  extractionMethod: string
  processingErrors?: string[]
  chunkingStrategy: string
  
  // Business context
  department?: string
  project?: string
  confidentialityLevel?: 'public' | 'internal' | 'confidential'
  
  // Usage analytics
  viewCount?: number
  searchCount?: number
  lastAccessed?: string
}
```

#### Embedding Metadata
```typescript
interface EmbeddingMetadata {
  // Chunk information
  chunkType: 'paragraph' | 'section' | 'code' | 'table' | 'list'
  startPosition: number
  endPosition: number
  parentSection?: string
  
  // Content features
  hasCode: boolean
  hasTable: boolean
  hasMath: boolean
  hasLinks: boolean
  
  // Quality indicators
  coherenceScore?: number
  completenessScore?: number
  
  // Processing context
  preprocessingSteps: string[]
  extractedEntities: string[]
  keywords: string[]
}
```

## Local Data Management

### File System Organization

#### Directory Structure
```
data/
├── documents/           # Original source documents
│   ├── by-type/        # Organized by document type
│   ├── by-date/        # Organized by creation date
│   └── by-project/     # Organized by project
├── processed/          # Processed document content
│   ├── content/        # Extracted text content
│   ├── metadata/       # Document metadata files
│   └── chunks/         # Chunked content for embedding
├── embeddings/         # Local embedding cache
│   ├── by-model/       # Organized by embedding model
│   └── batch-cache/    # Batch processing cache
├── indexes/            # Local search indexes
│   ├── vector/         # Local vector indexes
│   ├── text/           # Full-text search indexes
│   └── metadata/       # Metadata indexes
└── sync/               # Synchronization state
    ├── checksums/      # File checksums for change detection
    ├── sync-log/       # Synchronization logs
    └── conflicts/      # Conflict resolution data
```

#### Local Storage Patterns
```typescript
interface LocalStorageManager {
  // Document storage
  storeDocument(doc: Document): Promise<string> // Returns local path
  retrieveDocument(id: string): Promise<Document>
  deleteDocument(id: string): Promise<void>
  
  // Embedding cache
  cacheEmbedding(docId: string, chunkIndex: number, embedding: number[]): Promise<void>
  retrieveEmbedding(docId: string, chunkIndex: number): Promise<number[]>
  
  // Metadata management
  storeMetadata(docId: string, metadata: any): Promise<void>
  retrieveMetadata(docId: string): Promise<any>
  
  // Synchronization
  getLocalChecksum(path: string): Promise<string>
  markForSync(docId: string): Promise<void>
  getSyncStatus(): Promise<SyncStatus>
}
```

### Cache Management

#### LRU Cache Implementation
```typescript
interface CacheManager {
  // Embedding cache
  getEmbedding(key: string): Promise<number[] | null>
  setEmbedding(key: string, embedding: number[]): Promise<void>
  
  // Query result cache
  getQueryResult(queryHash: string): Promise<SearchResult[] | null>
  setQueryResult(queryHash: string, results: SearchResult[]): Promise<void>
  
  // Document content cache
  getDocumentContent(docId: string): Promise<string | null>
  setDocumentContent(docId: string, content: string): Promise<void>
  
  // Cache management
  evictExpired(): Promise<void>
  clearCache(): Promise<void>
  getCacheStats(): Promise<CacheStats>
}

interface CacheConfig {
  maxMemoryMB: number
  maxItems: number
  ttlSeconds: number
  evictionPolicy: 'lru' | 'lfu' | 'ttl'
}
```

#### Smart Caching Strategies
```typescript
class SmartCache {
  // Cache based on access patterns
  async cacheByAccessPattern(docId: string, accessCount: number): Promise<void> {
    if (accessCount > this.config.hotThreshold) {
      await this.cache.promote(docId) // Move to hot cache
    } else if (accessCount < this.config.coldThreshold) {
      await this.cache.demote(docId) // Move to cold storage
    }
  }
  
  // Predictive caching
  async predictiveCache(query: string): Promise<void> {
    const relatedQueries = await this.getRelatedQueries(query)
    for (const relatedQuery of relatedQueries) {
      await this.preloadQueryResults(relatedQuery)
    }
  }
  
  // Batch cache warming
  async warmCache(docIds: string[]): Promise<void> {
    const batches = this.batchArray(docIds, this.config.batchSize)
    for (const batch of batches) {
      await Promise.all(batch.map(id => this.preloadDocument(id)))
    }
  }
}
```

## Synchronization Strategies

### Two-Way Sync Implementation

#### Sync State Management
```typescript
interface SyncManager {
  // Sync operations
  syncToRemote(): Promise<SyncResult>
  syncFromRemote(): Promise<SyncResult>
  bidirectionalSync(): Promise<SyncResult>
  
  // Conflict resolution
  detectConflicts(): Promise<Conflict[]>
  resolveConflict(conflict: Conflict, resolution: ConflictResolution): Promise<void>
  
  // Change tracking
  trackLocalChanges(): Promise<void>
  getChangesSince(timestamp: Date): Promise<Change[]>
  markSynced(changeId: string): Promise<void>
}

interface SyncResult {
  success: boolean
  conflicts: Conflict[]
  localChanges: number
  remoteChanges: number
  errors: SyncError[]
}

interface Conflict {
  id: string
  type: 'content' | 'metadata' | 'deletion'
  localVersion: any
  remoteVersion: any
  timestamp: Date
}
```

#### Change Detection
```typescript
class ChangeDetector {
  // File-based change detection
  async detectFileChanges(directory: string): Promise<FileChange[]> {
    const currentHashes = await this.calculateFileHashes(directory)
    const previousHashes = await this.getStoredHashes()
    
    const changes: FileChange[] = []
    
    // Check for modifications and additions
    for (const [file, hash] of currentHashes) {
      if (!previousHashes.has(file)) {
        changes.push({ type: 'added', file, hash })
      } else if (previousHashes.get(file) !== hash) {
        changes.push({ type: 'modified', file, hash })
      }
    }
    
    // Check for deletions
    for (const [file] of previousHashes) {
      if (!currentHashes.has(file)) {
        changes.push({ type: 'deleted', file })
      }
    }
    
    return changes
  }
  
  // Content-based change detection
  async detectContentChanges(docId: string): Promise<ContentChange[]> {
    const current = await this.getDocumentContent(docId)
    const previous = await this.getStoredContent(docId)
    
    return this.diffContent(previous, current)
  }
}
```

### Incremental Update Patterns

#### Delta Synchronization
```typescript
interface DeltaSyncManager {
  // Generate deltas
  generateDelta(fromVersion: string, toVersion: string): Promise<Delta>
  applyDelta(delta: Delta): Promise<void>
  
  // Batch operations
  batchDeltas(deltas: Delta[]): Promise<BatchDelta>
  applyBatchDelta(batchDelta: BatchDelta): Promise<BatchResult>
  
  // Verification
  verifyDelta(delta: Delta): Promise<boolean>
  rollbackDelta(deltaId: string): Promise<void>
}

interface Delta {
  id: string
  fromVersion: string
  toVersion: string
  operations: DeltaOperation[]
  checksum: string
}

interface DeltaOperation {
  type: 'insert' | 'update' | 'delete'
  target: string // document ID or path
  data?: any
  position?: number
}
```

## Backup and Recovery

### Backup Strategies

#### Automated Backup System
```bash
#!/bin/bash
# backup-manager.sh

# Backup configuration
BACKUP_DIR="${BACKUP_DIR:-backups}"
RETENTION_DAYS="${RETENTION_DAYS:-30}"
BACKUP_FREQUENCY="${BACKUP_FREQUENCY:-daily}"

# Create incremental backup
create_incremental_backup() {
    local backup_name="backup_$(date +%Y%m%d_%H%M%S)"
    local backup_path="$BACKUP_DIR/$backup_name"
    
    mkdir -p "$backup_path"
    
    # Backup database
    pg_dump "$DATABASE_URL" > "$backup_path/database.sql"
    
    # Backup local files
    tar -czf "$backup_path/files.tar.gz" data/
    
    # Create manifest
    create_backup_manifest "$backup_path"
    
    # Verify backup
    verify_backup "$backup_path"
    
    echo "Backup created: $backup_path"
}

# Verify backup integrity
verify_backup() {
    local backup_path="$1"
    
    # Check database backup
    if pg_restore --list "$backup_path/database.sql" >/dev/null 2>&1; then
        echo "Database backup verified"
    else
        echo "Database backup verification failed"
        return 1
    fi
    
    # Check file backup
    if tar -tzf "$backup_path/files.tar.gz" >/dev/null 2>&1; then
        echo "File backup verified"
    else
        echo "File backup verification failed"
        return 1
    fi
}

# Cleanup old backups
cleanup_old_backups() {
    find "$BACKUP_DIR" -type d -mtime +$RETENTION_DAYS -exec rm -rf {} \;
    echo "Cleaned up backups older than $RETENTION_DAYS days"
}
```

#### Recovery Procedures
```typescript
interface RecoveryManager {
  // Backup operations
  createBackup(type: 'full' | 'incremental'): Promise<BackupInfo>
  listBackups(): Promise<BackupInfo[]>
  
  // Recovery operations
  restoreFromBackup(backupId: string): Promise<void>
  partialRestore(backupId: string, items: string[]): Promise<void>
  
  // Verification
  verifyBackup(backupId: string): Promise<VerificationResult>
  testRestore(backupId: string): Promise<TestResult>
}

interface BackupInfo {
  id: string
  type: 'full' | 'incremental'
  size: number
  createdAt: Date
  documentCount: number
  embeddingCount: number
  checksum: string
}
```

## Performance Optimization

### Database Optimization

#### Query Optimization
```sql
-- Optimized similarity search with filtering
EXPLAIN ANALYZE
SELECT 
    d.id,
    d.title,
    e.content,
    (e.vector <=> $1::vector) as similarity
FROM embeddings e
JOIN documents d ON e.document_id = d.id
WHERE 
    d.is_active = true
    AND d.source_type = ANY($2)
    AND (e.vector <=> $1::vector) < $3
ORDER BY similarity
LIMIT $4;

-- Optimized batch embedding insert
INSERT INTO embeddings (document_id, chunk_index, content, vector, metadata)
SELECT * FROM unnest($1::uuid[], $2::integer[], $3::text[], $4::vector[], $5::jsonb[])
ON CONFLICT (document_id, chunk_index) 
DO UPDATE SET 
    content = EXCLUDED.content,
    vector = EXCLUDED.vector,
    metadata = EXCLUDED.metadata,
    updated_at = NOW();
```

#### Connection Pooling
```typescript
interface ConnectionPool {
  // Pool management
  getConnection(): Promise<DatabaseConnection>
  releaseConnection(conn: DatabaseConnection): Promise<void>
  
  // Pool monitoring
  getPoolStats(): PoolStats
  healthCheck(): Promise<boolean>
  
  // Configuration
  setPoolSize(min: number, max: number): Promise<void>
  setConnectionTimeout(timeoutMs: number): Promise<void>
}

interface PoolStats {
  activeConnections: number
  idleConnections: number
  totalConnections: number
  waitingRequests: number
  averageResponseTime: number
}
```

## Cross-References

- **[RAG Architecture](rag-architecture.md)** - RAG implementation using data architecture
- **[LLM Services](llm-services.md)** - LLM service integration with data storage
- **[Performance & Security](performance-security.md)** - Performance optimization and security
- **[Script Coordination](script-coordination.md)** - Data management in scripts

## Scope Boundaries

**Includes**: Data schemas, storage patterns, synchronization, backup/recovery, performance optimization
**Excludes**: Specific database administration, UI data binding, business logic implementation
**Overlaps**: RAG architecture (vector storage), Performance & Security (optimization patterns)
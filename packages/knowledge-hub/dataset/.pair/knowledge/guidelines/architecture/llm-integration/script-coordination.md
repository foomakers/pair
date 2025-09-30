# Script Coordination for AI Workflows

Bash script orchestration patterns for AI assistant processes and LLM workflow automation.

## AI Process Orchestration

### Script Architecture Principles

#### Modular Design
- **Single Responsibility**: Each script handles one specific AI workflow step
- **Composable**: Scripts can be combined to create complex workflows
- **Reusable**: Scripts are generic enough for multiple use cases
- **Testable**: Each script can be tested independently
- **Configurable**: Scripts accept configuration through environment variables

#### Workflow Patterns
```bash
# Document processing pipeline
./scripts/ai/ingest-documents.sh --source /path/to/docs --format markdown
./scripts/ai/generate-embeddings.sh --batch-size 100 --model ada-002
./scripts/ai/update-vector-db.sh --incremental --verify

# AI assistant workflows
./scripts/ai/query-processor.sh --query "user question" --context-limit 5
./scripts/ai/context-retriever.sh --similarity-threshold 0.8
./scripts/ai/response-generator.sh --model gpt-4 --temperature 0.7
```

### Pipeline Management

#### Step-by-Step Processing
```bash
#!/bin/bash
# ai-pipeline.sh - Master AI workflow orchestrator

set -euo pipefail

# Configuration
PIPELINE_CONFIG="${PIPELINE_CONFIG:-config/ai-pipeline.env}"
PIPELINE_LOG_DIR="${PIPELINE_LOG_DIR:-logs/ai-pipeline}"
PIPELINE_TMP_DIR="${PIPELINE_TMP_DIR:-tmp/ai-pipeline}"

# Source configuration
source "$PIPELINE_CONFIG"

# Pipeline steps
run_step() {
    local step_name="$1"
    local step_script="$2"
    shift 2
    
    echo "Starting step: $step_name"
    mkdir -p "$PIPELINE_LOG_DIR"
    
    if "$step_script" "$@" 2>&1 | tee "$PIPELINE_LOG_DIR/${step_name}.log"; then
        echo "Step completed: $step_name"
        return 0
    else
        echo "Step failed: $step_name"
        return 1
    fi
}

# Execute pipeline
main() {
    echo "Starting AI pipeline: $(date)"
    
    run_step "document-ingestion" "./scripts/ai/ingest-documents.sh" \
        --source "$DOCUMENT_SOURCE" \
        --format "$DOCUMENT_FORMAT"
    
    run_step "embedding-generation" "./scripts/ai/generate-embeddings.sh" \
        --batch-size "$EMBEDDING_BATCH_SIZE" \
        --model "$EMBEDDING_MODEL"
    
    run_step "vector-db-update" "./scripts/ai/update-vector-db.sh" \
        --incremental \
        --verify
    
    echo "AI pipeline completed: $(date)"
}

main "$@"
```

#### Parallel Processing
```bash
#!/bin/bash
# parallel-processor.sh - Parallel AI task processing

process_batch() {
    local batch_id="$1"
    local input_file="$2"
    
    echo "Processing batch $batch_id from $input_file"
    
    # Process each item in the batch
    while IFS= read -r item; do
        ./scripts/ai/process-item.sh "$item" "$batch_id" &
    done < "$input_file"
    
    # Wait for all background jobs to complete
    wait
    echo "Batch $batch_id completed"
}

# Split large input into batches and process in parallel
split_and_process() {
    local input_file="$1"
    local batch_size="$2"
    local max_parallel="$3"
    
    # Split input into batches
    split -l "$batch_size" "$input_file" "batch_"
    
    # Process batches with limited parallelism
    local active_jobs=0
    for batch_file in batch_*; do
        if [ "$active_jobs" -ge "$max_parallel" ]; then
            wait -n  # Wait for any job to complete
            ((active_jobs--))
        fi
        
        process_batch "${batch_file#batch_}" "$batch_file" &
        ((active_jobs++))
    done
    
    wait  # Wait for all remaining jobs
}
```

### Error Handling and Recovery

#### Robust Error Handling
```bash
#!/bin/bash
# ai-workflow-with-recovery.sh

set -euo pipefail

# Error handling
handle_error() {
    local exit_code=$?
    local line_number=$1
    echo "Error on line $line_number: exit code $exit_code"
    
    # Log error details
    log_error "$exit_code" "$line_number" "${BASH_COMMAND}"
    
    # Attempt recovery
    if attempt_recovery "$exit_code"; then
        echo "Recovery successful, continuing..."
        return 0
    else
        echo "Recovery failed, exiting..."
        exit $exit_code
    fi
}

trap 'handle_error $LINENO' ERR

# Recovery strategies
attempt_recovery() {
    local exit_code="$1"
    
    case $exit_code in
        2)  # API rate limit
            echo "Rate limit hit, waiting and retrying..."
            sleep 60
            return 0
            ;;
        3)  # Network error
            echo "Network error, checking connection and retrying..."
            if check_network_connectivity; then
                sleep 10
                return 0
            fi
            ;;
        4)  # Temporary file error
            echo "Temporary file error, cleaning up and retrying..."
            cleanup_temp_files
            return 0
            ;;
        *)
            echo "Unrecoverable error: $exit_code"
            return 1
            ;;
    esac
}

# Retry logic with exponential backoff
retry_with_backoff() {
    local max_attempts="$1"
    local delay="$2"
    shift 2
    
    local attempt=1
    while [ $attempt -le $max_attempts ]; do
        if "$@"; then
            return 0
        fi
        
        echo "Attempt $attempt failed, waiting ${delay}s before retry..."
        sleep $delay
        delay=$((delay * 2))
        ((attempt++))
    done
    
    echo "All retry attempts failed"
    return 1
}
```

### Logging and Monitoring

#### Comprehensive Logging
```bash
#!/bin/bash
# logging-utils.sh

# Logging configuration
LOG_LEVEL="${LOG_LEVEL:-INFO}"
LOG_FORMAT="${LOG_FORMAT:-json}"
LOG_FILE="${LOG_FILE:-logs/ai-workflow.log}"

# Logging functions
log_message() {
    local level="$1"
    local message="$2"
    local timestamp=$(date -u +"%Y-%m-%dT%H:%M:%SZ")
    local script_name=$(basename "$0")
    
    case "$LOG_FORMAT" in
        json)
            echo "{\"timestamp\":\"$timestamp\",\"level\":\"$level\",\"script\":\"$script_name\",\"message\":\"$message\"}" >> "$LOG_FILE"
            ;;
        plain)
            echo "[$timestamp] [$level] [$script_name] $message" >> "$LOG_FILE"
            ;;
    esac
    
    # Also output to console based on log level
    case "$level" in
        ERROR|WARN)
            echo "[$level] $message" >&2
            ;;
        INFO)
            if [[ "$LOG_LEVEL" != "ERROR" && "$LOG_LEVEL" != "WARN" ]]; then
                echo "[$level] $message"
            fi
            ;;
        DEBUG)
            if [[ "$LOG_LEVEL" == "DEBUG" ]]; then
                echo "[$level] $message"
            fi
            ;;
    esac
}

log_error() {
    log_message "ERROR" "$1"
}

log_warn() {
    log_message "WARN" "$1"
}

log_info() {
    log_message "INFO" "$1"
}

log_debug() {
    log_message "DEBUG" "$1"
}

# Performance monitoring
monitor_performance() {
    local operation="$1"
    local start_time=$(date +%s.%N)
    
    # Execute the operation
    "$@"
    local exit_code=$?
    
    local end_time=$(date +%s.%N)
    local duration=$(echo "$end_time - $start_time" | bc)
    
    log_info "Operation '$operation' completed in ${duration}s with exit code $exit_code"
    
    return $exit_code
}
```

## Configuration Management

### Environment-Based Configuration

#### Configuration Structure
```bash
# config/ai-pipeline.env - Main configuration file

# LLM Service Configuration
OPENAI_API_KEY="${OPENAI_API_KEY}"
ANTHROPIC_API_KEY="${ANTHROPIC_API_KEY}"
DEFAULT_LLM_PROVIDER="openai"
DEFAULT_LLM_MODEL="gpt-4"

# RAG Configuration
VECTOR_DB_URL="${SUPABASE_URL}"
VECTOR_DB_KEY="${SUPABASE_ANON_KEY}"
EMBEDDING_MODEL="text-embedding-ada-002"
EMBEDDING_BATCH_SIZE=100
SIMILARITY_THRESHOLD=0.8

# Document Processing
DOCUMENT_SOURCE_DIR="docs"
SUPPORTED_FORMATS="md,txt,pdf"
CHUNK_SIZE=512
CHUNK_OVERLAP=50

# Performance Configuration
MAX_PARALLEL_JOBS=4
REQUEST_TIMEOUT=30
RETRY_ATTEMPTS=3
BACKOFF_MULTIPLIER=2

# Logging Configuration
LOG_LEVEL="INFO"
LOG_FORMAT="json"
LOG_RETENTION_DAYS=30
```

#### Configuration Loading
```bash
#!/bin/bash
# config-loader.sh

load_config() {
    local config_file="$1"
    local env_prefix="${2:-AI_}"
    
    # Load from file if exists
    if [[ -f "$config_file" ]]; then
        source "$config_file"
        log_info "Loaded configuration from $config_file"
    fi
    
    # Override with environment variables
    while IFS='=' read -r key value; do
        if [[ $key =~ ^${env_prefix} ]]; then
            export "$key"="$value"
            log_debug "Set $key from environment"
        fi
    done < <(env)
    
    # Validate required configuration
    validate_config
}

validate_config() {
    local required_vars=("OPENAI_API_KEY" "VECTOR_DB_URL")
    local missing_vars=()
    
    for var in "${required_vars[@]}"; do
        if [[ -z "${!var:-}" ]]; then
            missing_vars+=("$var")
        fi
    done
    
    if [[ ${#missing_vars[@]} -gt 0 ]]; then
        log_error "Missing required configuration: ${missing_vars[*]}"
        exit 1
    fi
}
```

### Dynamic Configuration

#### Runtime Configuration Updates
```bash
#!/bin/bash
# dynamic-config.sh

update_config() {
    local key="$1"
    local value="$2"
    local config_file="$3"
    
    # Update in-memory configuration
    export "$key"="$value"
    
    # Update configuration file
    if grep -q "^$key=" "$config_file"; then
        sed -i "s/^$key=.*/$key=\"$value\"/" "$config_file"
    else
        echo "$key=\"$value\"" >> "$config_file"
    fi
    
    log_info "Updated configuration: $key"
}

# Configuration hot-reload
reload_config() {
    local config_file="$1"
    
    log_info "Reloading configuration from $config_file"
    source "$config_file"
    
    # Notify other processes of configuration change
    pkill -USR1 -f "ai-pipeline"
}

# Signal handler for configuration reload
handle_config_reload() {
    log_info "Received configuration reload signal"
    reload_config "$CONFIG_FILE"
}

trap 'handle_config_reload' USR1
```

## Common Script Patterns

### Document Processing Scripts

#### Document Ingestion
```bash
#!/bin/bash
# ingest-documents.sh

ingest_documents() {
    local source_dir="$1"
    local format_filter="$2"
    local output_dir="$3"
    
    log_info "Starting document ingestion from $source_dir"
    
    # Find and process documents
    find "$source_dir" -name "*.$format_filter" -type f | while read -r file; do
        log_debug "Processing file: $file"
        
        # Extract content and metadata
        if extract_document_content "$file" "$output_dir"; then
            log_info "Successfully processed: $file"
        else
            log_error "Failed to process: $file"
        fi
    done
    
    log_info "Document ingestion completed"
}

extract_document_content() {
    local input_file="$1"
    local output_dir="$2"
    local basename=$(basename "$input_file" .md)
    
    # Create output structure
    mkdir -p "$output_dir/content"
    mkdir -p "$output_dir/metadata"
    
    # Extract content based on file type
    case "${input_file##*.}" in
        md)
            extract_markdown "$input_file" "$output_dir/content/$basename.txt"
            extract_markdown_metadata "$input_file" "$output_dir/metadata/$basename.json"
            ;;
        pdf)
            extract_pdf "$input_file" "$output_dir/content/$basename.txt"
            extract_pdf_metadata "$input_file" "$output_dir/metadata/$basename.json"
            ;;
        *)
            log_warn "Unsupported file format: $input_file"
            return 1
            ;;
    esac
}
```

#### Embedding Generation
```bash
#!/bin/bash
# generate-embeddings.sh

generate_embeddings() {
    local content_dir="$1"
    local batch_size="$2"
    local model="$3"
    
    log_info "Generating embeddings for content in $content_dir"
    
    # Process files in batches
    find "$content_dir" -name "*.txt" | split -l "$batch_size" - batch_
    
    for batch_file in batch_*; do
        process_embedding_batch "$batch_file" "$model"
    done
    
    # Cleanup temporary files
    rm -f batch_*
    
    log_info "Embedding generation completed"
}

process_embedding_batch() {
    local batch_file="$1"
    local model="$2"
    local batch_id=$(basename "$batch_file")
    
    log_info "Processing embedding batch: $batch_id"
    
    # Prepare batch request
    local batch_request=$(create_embedding_batch_request "$batch_file" "$model")
    
    # Call embedding API
    if call_embedding_api "$batch_request" > "embeddings_$batch_id.json"; then
        log_info "Successfully generated embeddings for batch: $batch_id"
    else
        log_error "Failed to generate embeddings for batch: $batch_id"
        return 1
    fi
}
```

### Query Processing Scripts

#### Context Retrieval
```bash
#!/bin/bash
# context-retriever.sh

retrieve_context() {
    local query="$1"
    local similarity_threshold="$2"
    local max_results="$3"
    
    log_info "Retrieving context for query: $query"
    
    # Generate query embedding
    local query_embedding=$(generate_query_embedding "$query")
    
    # Search vector database
    local search_results=$(search_vector_db "$query_embedding" "$similarity_threshold" "$max_results")
    
    # Assemble context
    assemble_context "$search_results" > "context.json"
    
    log_info "Context retrieval completed"
}

search_vector_db() {
    local query_embedding="$1"
    local threshold="$2"
    local limit="$3"
    
    # SQL query for vector similarity search
    local sql_query="
        SELECT 
            e.content,
            e.metadata,
            d.title,
            d.source_url,
            (e.vector <=> '$query_embedding'::vector) as similarity
        FROM embeddings e
        JOIN documents d ON e.document_id = d.id
        WHERE (e.vector <=> '$query_embedding'::vector) < $threshold
        ORDER BY similarity
        LIMIT $limit
    "
    
    # Execute query using psql or database client
    execute_db_query "$sql_query"
}
```

## Cross-References

- **[LLM Services](llm-services.md)** - LLM service integration for scripts
- **[RAG Architecture](rag-architecture.md)** - RAG pipeline implementation
- **[Data Architecture](data-architecture.md)** - Data management in scripts
- **[Performance & Security](performance-security.md)** - Script optimization and security

## Scope Boundaries

**Includes**: Bash script orchestration, pipeline management, error handling, configuration, logging
**Excludes**: Specific LLM API implementations, GUI interfaces, complex business logic
**Overlaps**: LLM services (API integration), RAG architecture (pipeline implementation)
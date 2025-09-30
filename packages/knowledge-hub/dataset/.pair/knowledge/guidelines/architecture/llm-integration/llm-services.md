# LLM Service Integration

Patterns for integrating external and local Large Language Model services.

## External LLM Services

### Primary Providers

#### OpenAI Integration

- **Models**: GPT-4, GPT-3.5-turbo for text generation and analysis
- **API Access**: REST API with HTTP client integration
- **Authentication**: API key authentication with secure storage
- **Rate Limiting**: Respect OpenAI rate limits and quotas
- **Cost Management**: Track tokens and usage for cost control

#### Anthropic Integration

- **Models**: Claude 3 series for specialized reasoning tasks
- **API Access**: REST API with HTTP client integration
- **Authentication**: API key authentication with secure storage
- **Rate Limiting**: Respect Anthropic rate limits and quotas
- **Use Cases**: Complex reasoning, analysis, and safety-critical tasks

#### Google AI Integration

- **Models**: Gemini models for multimodal capabilities
- **API Access**: REST API with HTTP client integration
- **Authentication**: API key or OAuth authentication
- **Rate Limiting**: Respect Google AI rate limits and quotas
- **Capabilities**: Text, image, and multimodal processing

### API Integration Patterns

#### Unified LLM Client

```typescript
interface LLMClient {
  generateText(prompt: string, options?: GenerationOptions): Promise<string>
  generateStream(prompt: string, options?: GenerationOptions): AsyncIterable<string>
  getModels(): Promise<Model[]>
  getUsage(): Promise<UsageStats>
}

interface GenerationOptions {
  maxTokens?: number
  temperature?: number
  model?: string
  stopSequences?: string[]
}
```

#### Provider Abstraction

- **Common Interface**: Unified interface across all providers
- **Provider Selection**: Dynamic provider selection based on task
- **Fallback Chain**: Automatic fallback to alternative providers
- **Configuration**: Environment-based provider configuration
- **Monitoring**: Track performance and reliability per provider

### Authentication & Security

#### API Key Management

- **Secure Storage**: Store API keys in secure configuration
- **Environment Variables**: Use environment variables for API keys
- **Key Rotation**: Support for API key rotation
- **Access Control**: Limit API key access to authorized components
- **Audit Logging**: Log API key usage and access

#### Request Security

- **HTTPS Only**: All API communication over HTTPS
- **Request Signing**: Use request signing where available
- **Input Validation**: Validate all inputs before sending to LLM
- **Output Sanitization**: Sanitize LLM outputs before use
- **Error Handling**: Secure error handling without exposing sensitive data

## Local LLM Integration (Ollama)

### Ollama Setup and Management

#### Model Management

- **Automatic Installation**: Automatically download required models
- **Model Updates**: Check for and update models periodically
- **Model Selection**: Choose appropriate model based on task
- **Storage Management**: Manage local storage for models
- **Model Catalog**: Maintain catalog of available models

#### Resource Management

- **CPU Allocation**: Manage CPU resources for local inference
- **Memory Management**: Monitor and limit memory usage
- **GPU Support**: Utilize GPU when available for faster inference
- **Performance Monitoring**: Track local inference performance
- **Resource Limits**: Set limits to prevent system resource exhaustion

### Hybrid LLM Strategy

#### Task-Based Selection

```typescript
interface TaskRouter {
  routeTask(task: LLMTask): Promise<LLMProvider>
}

enum TaskType {
  SIMPLE_GENERATION = 'simple',
  COMPLEX_REASONING = 'complex',
  SENSITIVE_DATA = 'sensitive',
  CREATIVE_WRITING = 'creative',
}

const routingRules = {
  [TaskType.SIMPLE_GENERATION]: 'local',
  [TaskType.COMPLEX_REASONING]: 'external',
  [TaskType.SENSITIVE_DATA]: 'local',
  [TaskType.CREATIVE_WRITING]: 'external',
}
```

#### Decision Criteria

- **Privacy Requirements**: Use local for sensitive/private data
- **Complexity**: Use external for complex reasoning tasks
- **Speed Requirements**: Consider latency differences
- **Cost Considerations**: Balance cost vs. performance
- **Offline Requirements**: Use local when offline capability needed

### Offline Capability

#### Local Processing

- **Core Functions**: Ensure core AI features work offline
- **Model Availability**: Maintain essential models locally
- **Fallback Logic**: Graceful degradation when external services unavailable
- **Sync Strategy**: Sync results when connection restored
- **User Feedback**: Clear indication of offline/online mode

#### Caching Strategy

- **Response Caching**: Cache LLM responses for repeated queries
- **Model Caching**: Cache model outputs for similar inputs
- **Embedding Caching**: Cache embeddings for documents
- **Invalidation**: Smart cache invalidation strategies
- **Persistence**: Persist cache across application restarts

## Rate Limiting and Cost Control

### Rate Limiting Implementation

#### Request Throttling

- **Provider Limits**: Respect each provider's rate limits
- **Adaptive Throttling**: Adjust request rate based on responses
- **Queue Management**: Queue requests when approaching limits
- **Priority System**: Prioritize critical requests
- **Backoff Strategy**: Exponential backoff for rate limit hits

#### Usage Monitoring

```typescript
interface UsageTracker {
  trackRequest(provider: string, tokens: number, cost: number): void
  getCurrentUsage(provider: string): UsageStats
  checkLimits(provider: string): boolean
  resetUsage(period: 'daily' | 'monthly'): void
}

interface UsageStats {
  totalRequests: number
  totalTokens: number
  totalCost: number
  rateLimit: number
  remaining: number
}
```

### Cost Management

#### Budget Controls

- **Usage Limits**: Set spending limits per provider
- **Budget Alerts**: Alert when approaching budget limits
- **Cost Tracking**: Track costs per feature/user
- **Optimization**: Identify and optimize expensive operations
- **Reporting**: Regular cost reporting and analysis

#### Cost Optimization

- **Model Selection**: Choose cost-effective models for tasks
- **Prompt Optimization**: Optimize prompts to reduce token usage
- **Caching**: Aggressive caching to reduce API calls
- **Batch Processing**: Batch requests when possible
- **Local Alternatives**: Use local models for cost-sensitive operations

## Error Handling and Resilience

### Error Handling Patterns

#### Provider-Specific Errors

- **Rate Limit Errors**: Automatic retry with backoff
- **Authentication Errors**: Clear error messages and recovery
- **Model Errors**: Fallback to alternative models
- **Network Errors**: Retry with exponential backoff
- **Service Errors**: Graceful degradation to local models

#### Recovery Strategies

- **Circuit Breaker**: Prevent cascading failures
- **Fallback Chain**: Multiple fallback options
- **Health Checks**: Monitor provider health
- **Service Discovery**: Automatic discovery of available services
- **Manual Override**: Allow manual provider selection

### Monitoring and Observability

#### Performance Metrics

- **Response Time**: Track response times per provider
- **Success Rate**: Monitor success/failure rates
- **Token Usage**: Track token consumption patterns
- **Cost Metrics**: Monitor costs per provider and feature
- **Error Rates**: Track error patterns and types

#### Logging and Debugging

- **Request Logging**: Log all LLM requests and responses
- **Error Logging**: Detailed error logging with context
- **Performance Logging**: Track performance metrics
- **Debug Mode**: Enhanced logging for development
- **Audit Trail**: Maintain audit trail for compliance

## Cross-References

- **[RAG Architecture](rag-architecture.md)** - Integration with RAG systems
- **[Script Coordination](script-coordination.md)** - Bash script orchestration
- **[Performance & Security](performance-security.md)** - Optimization and security
- **[Project Constraints](.pair/knowledge/guidelines/architecture/project-constraints.md)** - External service policies

## Scope Boundaries

**Includes**: LLM service integration, authentication, rate limiting, cost control, error handling
**Excludes**: Specific prompt engineering, UI integration, business logic implementation
**Overlaps**: RAG architecture (LLM usage), Performance & Security (optimization strategies)

# Platform & Deployment Constraints

Constraints related to platform targeting and deployment preferences for the project.

## Desktop-Only Architecture

### Platform Targeting
- **Target Platform**: Desktop applications exclusively
- **No Mobile**: No responsive or mobile considerations needed
- **No Web**: No browser compatibility requirements
- **Native Installation**: Desktop-native installation preferred
- **System Integration**: Deep OS integration acceptable and encouraged

### Desktop Platform Benefits
- **Rich APIs**: Access to full desktop APIs and capabilities
- **Performance**: No browser sandbox performance limitations
- **Storage**: Direct file system access and manipulation
- **Security**: Native security model and permissions
- **User Experience**: Native desktop UX patterns and conventions

### Platform-Specific Considerations
- **Cross-Platform**: Target Windows, macOS, and Linux
- **Native Feel**: Each platform should feel native to that OS
- **File Associations**: Register appropriate file type associations
- **System Tray**: Utilize system tray/menu bar integration
- **Notifications**: Use native notification systems

## Self-Hosted Preference

### Default Self-Hosting Choice
- **Primary Option**: Self-hosted solutions preferred by default
- **Data Control**: All business data remains local or controlled
- **Privacy**: Enhanced privacy through local data processing
- **Dependencies**: Minimize external service dependencies
- **Vendor Independence**: Avoid vendor lock-in situations

### Self-Hosting Benefits
- **Cost Control**: Predictable hosting costs
- **Data Sovereignty**: Complete control over data location and access
- **Customization**: Full control over configuration and customization
- **Reliability**: No dependency on external service availability
- **Compliance**: Easier compliance with data protection requirements

### Self-Hosting Requirements
- **Simple Deployment**: Easy to deploy and maintain
- **Minimal Infrastructure**: Run on basic server infrastructure
- **Documentation**: Clear deployment and maintenance documentation
- **Backup Strategy**: Simple backup and recovery procedures
- **Monitoring**: Basic monitoring and health check capabilities

## External Service Exceptions

### Acceptable External Services

#### LLM Services
- **OpenAI API**: GPT models for text generation
- **Anthropic API**: Claude models for specialized tasks
- **Google AI**: Gemini models for additional capabilities
- **Justification**: Local LLM infrastructure too complex for small team

#### Vector Databases
- **Supabase Vector**: pgvector for RAG functionality
- **Justification**: Vector search complexity outweighs self-hosting benefits

#### Development Infrastructure
- **GitHub Actions**: CI/CD pipeline automation
- **GitHub**: Code repository and project management
- **Justification**: Development efficiency and team collaboration

#### Optional Monitoring
- **Basic Monitoring**: Simple external monitoring tools
- **Justification**: When internal monitoring insufficient

### External Service Evaluation Criteria
- **Essential Function**: Service provides essential, hard-to-replicate functionality
- **Complexity**: Self-hosting would add significant complexity
- **Maintenance**: External service reduces maintenance burden
- **Cost Benefit**: External service provides clear cost/benefit advantage
- **Risk Assessment**: Acceptable risk of vendor dependency

## Offline Capability Requirements

### Core Offline Features
- **Basic Functions**: Core application features work without internet
- **Data Access**: Local data accessible offline
- **Fallback Modes**: Graceful degradation when services unavailable
- **Sync Capability**: Sync when connection restored
- **User Experience**: Clear offline/online status indication

### Online-Only Acceptable Features
- **LLM Integration**: AI features require internet connection
- **Cloud Sync**: Optional cloud synchronization features
- **External Data**: Features requiring external data sources
- **Collaboration**: Real-time collaboration features
- **Updates**: Application updates and check for updates

## Data Storage Constraints

### Local Data Priority
- **Primary Storage**: Local file system for core data
- **Database**: Local database (SQLite) for structured data
- **Cache**: Local caching for performance optimization
- **Configuration**: Local configuration files
- **User Data**: All user-generated content stored locally

### External Data Exceptions
- **RAG Vectors**: Vector embeddings in Supabase
- **Shared Content**: Optional shared/collaborative content
- **Backups**: Optional cloud backup for user data
- **Templates**: Shared templates and resources
- **Updates**: Application and content updates

## Security Considerations

### Local Security Model
- **File Permissions**: Appropriate file system permissions
- **Encryption**: Encrypt sensitive data at rest
- **API Keys**: Secure storage of API keys and credentials
- **Network Security**: Secure communication with external services
- **User Privacy**: Protect user data and activity

### External Service Security
- **API Authentication**: Secure authentication with external APIs
- **Data Transmission**: Encrypted communication channels
- **Credential Management**: Secure credential storage and rotation
- **Access Control**: Principle of least privilege for external access
- **Audit Logging**: Log external service interactions

## Cross-References

- **[Team Constraints](team-constraints.md)** - Small team deployment considerations
- **[Technology Constraints](technology-constraints.md)** - Technology selection criteria
- **[Deployment Architectures](../deployment-architectures/README.md)** - Specific deployment patterns

## Scope Boundaries

**Includes**: Platform targeting, deployment preferences, external service policies, offline requirements
**Excludes**: Specific deployment configurations, detailed security implementations, platform-specific code
**Overlaps**: Technology constraints (simplicity requirements), Deployment architectures (self-hosting patterns)
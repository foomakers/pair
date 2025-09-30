# Project Architecture Constraints

Project-specific architectural constraints and design decisions for small team development and rapid deployment.

## Purpose

Define and document the specific architectural constraints that guide all system design decisions for this project, ensuring consistency with adopted standards and team capabilities.

## Team & Development Constraints

### Small Team Architecture
- **Team Size**: Designed for 2-4 developers maximum
- **Skill Focus**: Full-stack generalists over specialists
- **Maintenance**: Single-person maintainability requirement
- **Knowledge Sharing**: Minimal documentation overhead
- **Decision Speed**: Rapid architectural decisions over extensive analysis

### Rapid Development Priorities
- **Time to Market**: Favor simple, proven solutions
- **Technical Debt**: Acceptable for early iterations
- **Flexibility**: Easy to change and refactor
- **Iteration Speed**: Weekly deployment cycles
- **Scope Creep**: Minimal initial feature set

## Platform & Deployment Constraints

### Desktop-Only Architecture
- **Target Platform**: Desktop applications exclusively
- **No Mobile**: No responsive or mobile considerations
- **Local Installation**: Desktop-native installation preferred
- **Offline Capability**: Core features work without internet
- **System Integration**: Deep OS integration acceptable

### Self-Hosted Preference
- **Default Choice**: Self-hosted solutions over SaaS
- **External Services**: Only when absolutely necessary
- **Data Control**: All business data remains local/controlled
- **Dependencies**: Minimize external service dependencies
- **Vendor Lock-in**: Avoid proprietary cloud services

### Exceptions for External Services
- **LLM Services**: External LLM APIs (OpenAI, Anthropic) accepted
- **Vector Databases**: Supabase for RAG functionality
- **CI/CD**: GitHub Actions for development workflow
- **Monitoring**: Basic external monitoring tools if needed

## Technology & Complexity Constraints

### Lightweight Processing
- **Data Volume**: No big data or heavy processing requirements
- **Memory Usage**: Reasonable desktop memory constraints
- **CPU Intensive**: Avoid complex computational algorithms
- **Storage**: Local file system sufficient
- **Concurrency**: Simple threading models preferred

### No Formal Requirements
- **Compliance**: No regulatory or compliance requirements
- **Security**: Basic security practices sufficient
- **Scalability**: No formal performance benchmarks
- **Availability**: No SLA or uptime requirements
- **Integration**: No enterprise integration requirements

## Implementation Guidelines

### Architecture Decision Priority
1. **Simplicity** over sophistication
2. **Speed** over optimization
3. **Flexibility** over performance
4. **Maintainability** over features
5. **Local control** over cloud benefits

### Technology Selection Criteria
- **Learning Curve**: Prefer familiar technologies
- **Documentation**: Well-documented and stable
- **Community**: Active community support
- **Ecosystem**: Rich ecosystem and tooling
- **Migration Path**: Easy to migrate away from if needed

## Cross-References

- **[Deployment Architectures](deployment-architectures/README.md)** - Self-hosted deployment patterns
- **[Tech Stack](../development/technical-standards/tech-stack.md)** - Specific technology choices
- **[Way of Working](../../adoption/tech/README.md)** - Process constraints and decisions

## Scope Boundaries

**Includes**: Project-specific constraints, team limitations, platform choices
**Excludes**: General architectural patterns (covered in other files), specific technology configurations
**Overlaps**: Deployment strategies (shared self-hosting preference), Performance patterns (shared lightweight approach)

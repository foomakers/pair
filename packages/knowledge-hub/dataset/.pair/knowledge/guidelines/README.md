# 📚 Technical Guidelines Knowledge Base

This directory contains the complete technical guidelines knowledge base for the project, organized for optimal discoverability and RAG performance.

## 📋 Optimized Organization Structure

This knowledge base follows an **optimized hybrid structure**:

- **Folders**: For multi-file topics with complex sub-components
- **Standalone Files**: For consolidated topics that work well as single documents
- **Clear Navigation**: Direct paths with minimal folder nesting

This approach reduces folder pollution while maintaining logical organization and cross-referencing.

### 🏗️ Architecture Guidelines

- **[Architecture](architecture/README.md)** - System architecture, patterns, and design decisions
  - **[Architectural Patterns](architecture/architectural-patterns/README.md)** - Core architecture patterns (CRUD, Layered, Hexagonal, Clean, CQRS, Event Sourcing)
  - **[Deployment Architectures](architecture/deployment-architectures/README.md)** - Deployment patterns and strategies
  - **[Design Patterns](architecture/design-patterns/README.md)** - Domain-driven design, bounded contexts, and integration patterns
  - **[Decision Frameworks](architecture/decision-frameworks/README.md)** - ADR process, templates, decision frameworks
  - **[LLM Integration](architecture/llm-integration/README.md)** - AI/ML integration patterns and architectures
  - **[Project Constraints](architecture/project-constraints/README.md)** - Platform, deployment, and team constraints

### ☁️ Infrastructure Guidelines

- **[Infrastructure](infrastructure/README.md)** - Cloud strategy, tools, and infrastructure automation
  - **[Cloud Providers](infrastructure/cloud-providers/README.md)** - Provider selection, service comparison, and multi-cloud strategies
  - **[Infrastructure as Code](infrastructure/infrastructure-as-code/README.md)** - IaC tools, state management, and automation practices
  - **[Container Orchestration](infrastructure/container-orchestration/README.md)** - Docker, Kubernetes, and cloud-native deployment
  - **[Cloud Services](infrastructure/cloud-services/README.md)** - Managed databases, storage services, and data migration
  - **[CI/CD Strategy](infrastructure/cicd-strategy/README.md)** - CI/CD pipelines, monitoring, and cost optimization
  - **[Deployment Patterns](infrastructure/deployment-patterns/README.md)** - Deployment strategies and patterns
  - **[Environments](infrastructure/environments/README.md)** - Environment management and configuration
  - **[Testing Infrastructure](infrastructure/testing-infrastructure/README.md)** - Testing infrastructure and databases

### 💻 Development Guidelines

Development guidelines are organized into three specialized practice areas:

- **[Code Design](code-design/README.md)** - How to write high-quality, maintainable code

  - **[Design Principles](code-design/design-principles/README.md)** - Core design principles and code quality fundamentals
  - **[Framework Patterns](code-design/framework-patterns/README.md)** - Framework-specific implementation patterns and standards
  - **[Code Organization](code-design/code-organization/README.md)** - Code and workspace organization strategies
  - **[Package Management](code-design/package-management/README.md)** - Dependency management and workspace configuration
  - **[Quality Standards](code-design/quality-standards/README.md)** - Code quality metrics, linting, and technical debt management

- **[Technical Standards](technical-standards/README.md)** - What technologies to use and how to configure them

  - **[Technology Stack](./technical-standards/technology-stack/README.md)** - Core technology decisions and framework selection standards
  - **[Development Tools](technical-standards/development-tools/README.md)** - Development environment and tooling standards
  - **[Integration Standards](technical-standards/integration-standards/README.md)** - API design, data management, and external service integration
  - **[Deployment Workflow](technical-standards/deployment-workflow/README.md)** - Release management, workflow, and deployment standards
  - **[Coding Standards](technical-standards/coding-standards/README.md)** - Coding conventions and standards
  - **[Git Workflow](technical-standards/git-workflow/README.md)** - Version control and development process
  - **[AI Development](technical-standards/ai-development/README.md)** - AI/ML development standards and practices

- **[Testing](testing/README.md)** - How to verify that software works correctly
  - **[Test Strategy](testing/test-strategy/README.md)** - Testing philosophy, pyramid strategy, and comprehensive approaches
  - **[Test Automation](testing/test-automation/README.md)** - Automation frameworks, CI/CD integration, and execution strategies
  - **[Unit Testing](testing/unit-testing/README.md)** - Unit testing patterns and implementation
  - **[Integration Testing](testing/integration-testing/README.md)** - Integration testing strategies
  - **[E2E Testing](testing/e2e-testing/README.md)** - End-to-end testing approaches
  - **[Performance Testing](testing/performance-testing/README.md)** - Performance testing methodologies
  - **[Accessibility Testing](testing/accessibility-testing/README.md)** - Accessibility testing practices

### 🤝 Collaboration Guidelines

- **[Collaboration](collaboration/README.md)** - Process workflows and project management
  - **[Project Management Tool](collaboration/project-management-tool/README.md)** - PM frameworks with tool-specific guides (GitHub, Filesystem, etc.)
  - **[Issue Management](collaboration/issue-management/README.md)** - Issue tracking and management practices
  - **[Team Practices](collaboration/team/README.md)** - Team collaboration and communication practices

### ✨ Quality Assurance Guidelines

- **[Quality Assurance](quality-assurance/README.md)** - Quality criteria, accessibility, performance, and security
  - **[Quality Standards](./quality-assurance/quality-standards/README.md)** - Definition of Done, quality criteria, completion standards
  - **[Manual Verification](quality-assurance/manual-verification.md)** - Manual testing and quality validation
  - **[Automated Verification](quality-assurance/automated-verification.md)** - Automated testing and quality validation
  - **[Security](quality-assurance/security/README.md)** - Secure development, vulnerability assessment, practices

### 🏗️ Infrastructure Guidelines

- **[Infrastructure](infrastructure/README.md)** - Infrastructure management, deployment, and observability
  - **[Cloud Providers](infrastructure/cloud-providers/README.md)** - Infrastructure architecture, IaC, and container orchestration
  - **[Deployment Patterns](infrastructure/deployment-patterns/README.md)** - Deployment strategies, CI/CD pipelines, and release management
  - **[CI/CD Strategy](infrastructure/cicd-strategy/README.md)** - Continuous integration and deployment strategies

### 📊 Observability Guidelines

- **[Observability](observability/README.md)** - Monitoring, logging, alerting, and system visibility
  - **[Observability Principles](observability/observability-principles/README.md)** - Core observability principles and practices
  - **[Structured Logging](observability/structured-logging/README.md)** - Logging standards and practices
  - **[Metrics](observability/metrics/README.md)** - Metrics collection and monitoring
  - **[Distributed Tracing](observability/distributed-tracing.md)** - Distributed tracing implementation

### 🎨 User Experience Guidelines

- **[User Experience](user-experience/README.md)** - UX design, interface patterns, and content strategy
  - **[Design Systems](user-experience/design-systems/README.md)** - Design system architecture, component libraries, and design tokens
  - **[Interface Design](user-experience/interface-design/README.md)** - UI patterns, layout principles, and visual standards
  - **[User Research](user-experience/user-research/README.md)** - User research methods, testing, and validation strategies
  - **[Content Strategy](user-experience/content-strategy/README.md)** - Content guidelines, information architecture, and communication design
  - **[UX Performance](user-experience/ux-performance.md)** - Performance optimization for user experience

## 🔗 Cross-References

All documents are designed to work together and contain extensive cross-references. Key integration points:

- **Architecture** ↔ **Platform Operations**: Architectural decisions inform infrastructure and deployment strategies
- **Code Design** ↔ **Technical Standards**: Implementation patterns align with technology choices
- **Testing** ↔ **Code Design**: Quality validation supports design principles
- **Technical Standards** ↔ **Platform Operations**: Technology choices inform infrastructure requirements
- **Quality Standards** ↔ **All Development**: Quality criteria integrate across all development practices
- **User Experience** ↔ **Quality/Accessibility**: UX design aligned with accessibility standards
- **Platform Operations** ↔ **User Experience**: Operations supporting UX infrastructure and performance
- **Design Systems** ↔ **Code Design**: Component implementation patterns and design token integration
- **Content Strategy** ↔ **User Research**: Content optimization based on user research insights
- **Definition of Done** ↔ **All Guidelines**: Quality criteria reference all technical standards
- **Collaboration & Process** ↔ **All Guidelines**: Workflow and artifact management practices integrate with all technical standards

## 📝 Usage Guidelines

1. **Start with Architecture**: Begin with `../architecture/README.md` for system design
2. **Follow Cross-References**: Use embedded links to navigate between related topics
3. **Maintain Consistency**: When updating any document, check cross-references for consistency
4. **Review Regularly**: These are living documents that should evolve with the project

## 🎯 Customization Notes

These documents contain **opinionated technical choices** that should be customized for your specific project needs. Review and adapt the recommendations based on your:

- Project requirements and constraints
- Team skills and preferences
- Technical infrastructure and platforms
- Business domain and use cases

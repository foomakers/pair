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
  - **[Scaling Patterns](architecture/scaling-patterns/README.md)** - Horizontal and vertical scaling strategies
  - **[Deployment Architectures](architecture/deployment-architectures/README.md)** - Deployment patterns and strategies
  - **[Performance Patterns](architecture/performance-patterns/README.md)** - Performance optimization techniques
  - **[Decision Records](architecture/decision-records.md)** - ADR process, templates, decision frameworks

### 💻 Development Guidelines

Development guidelines are organized into three specialized practice areas:

- **[Code Design](code-design/README.md)** - How to write high-quality, maintainable code

  - **[Design Principles](code-design/design-principles/README.md)** - Core design principles and code quality fundamentals
  - **[Framework Patterns](code-design/framework-patterns/README.md)** - Framework-specific implementation patterns and standards
  - **[Implementation Standards](code-design/implementation-standards/README.md)** - Development environment and service implementation standards
  - **[Organization Patterns](code-design/organization-patterns/README.md)** - Code and workspace organization strategies
  - **[Quality Standards](code-design/quality-standards/README.md)** - Code quality metrics, linting, and technical debt management

- **[Technical Standards](technical-standards/README.md)** - What technologies to use and how to configure them

  - **[Tech Stack](technical-standards/tech-stack/README.md)** - Core technology decisions and framework selection standards
  - **[Development Tools](technical-standards/development-tools/README.md)** - Development environment and tooling standards
  - **[Integration Standards](technical-standards/integration-standards/README.md)** - API design, data management, and external service integration
  - **[Deployment Workflow](technical-standards/deployment-workflow/README.md)** - Release management, workflow, and deployment standards

- **[Testing](testing/README.md)** - How to verify that software works correctly
  - **[Testing Strategy](testing/testing-strategy/README.md)** - Testing philosophy, pyramid strategy, and comprehensive approaches
  - **[Test Automation](testing/test-automation/README.md)** - Automation frameworks, CI/CD integration, and execution strategies
  - **[Testing Implementation](testing/testing-implementation/README.md)** - Practical testing implementation across different test types
  - **[Testing Tools](testing/testing-tools/README.md)** - Testing frameworks, utilities, and tool configuration

### 🤝 Collaboration Guidelines

- **[Collaboration](collaboration/README.md)** - Process workflows and project management
  - **[Project Management](collaboration/project-management-tool/README.md)** - PM frameworks with tool-specific guides (GitHub, Filesystem, etc.)

### ✨ Quality Guidelines

- **[Quality](quality/README.md)** - Quality criteria, accessibility, performance, and security
  - **[Standards](quality/standards/README.md)** - Definition of Done, quality criteria, completion standards
  - **[Accessibility](quality/accessibility.md)** - WCAG compliance, inclusive design, testing tools
  - **[Performance](quality/performance.md)** - Optimization strategies, monitoring, benchmarking
  - **[Security](quality/security.md)** - Secure development, vulnerability assessment, practices

### 🚀 Operations Guidelines

- **[Operations](operations/README.md)** - Infrastructure, UX standards, and observability
  - **[Infrastructure](operations/infrastructure.md)** - Deployment strategies, environment management, CI/CD
  - **[UX Design](operations/ux-design.md)** - User experience standards, design principles, systems
  - **[Observability](operations/observability.md)** - Monitoring, logging, tracing, alerting

## 🔗 Cross-References

All documents are designed to work together and contain extensive cross-references. Key integration points:

- **Architecture** ↔ **Infrastructure**: Architectural decisions inform deployment strategies
- **Code Design** ↔ **Technical Standards**: Implementation patterns align with technology choices
- **Testing** ↔ **Code Design**: Quality validation supports design principles
- **Technical Standards** ↔ **Operations**: Technology choices inform infrastructure requirements
- **Quality Standards** ↔ **All Development**: Quality criteria integrate across all development practices
- **UX** ↔ **Accessibility**: User experience aligned with accessibility standards
- **Definition of Done** ↔ **All Guidelines**: Quality criteria reference all technical standards
- **Collaboration & Process** ↔ **All Guidelines**: Workflow and artifact management practices integrate with all technical standards

## 📝 Usage Guidelines

1. **Start with Architecture**: Begin with `../01-architectural-guidelines.md` for system design
2. **Follow Cross-References**: Use embedded links to navigate between related topics
3. **Maintain Consistency**: When updating any document, check cross-references for consistency
4. **Review Regularly**: These are living documents that should evolve with the project

## 🎯 Customization Notes

These documents contain **opinionated technical choices** that should be customized for your specific project needs. Review and adapt the recommendations based on your:

- Project requirements and constraints
- Team skills and preferences
- Technical infrastructure and platforms
- Business domain and use cases

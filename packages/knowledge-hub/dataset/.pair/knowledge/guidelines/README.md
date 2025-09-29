# 📚 Technical Guidelines Knowledge Base

This directory contains the complete technical guidelines knowledge base for the project, organized into themed categories with Level 2 navigation READMEs for easy discovery and cross-linking.

## 📋 3-Level Organization Structure

This knowledge base follows a **3-level hierarchical structure**:

- **Level 1**: Theme folders (main categories)
- **Level 2**: Practice folders (specific practices within each theme)
- **Level 3**: Tool/solution-specific implementations (how to use specific tools)

### 🏗️ Architecture Guidelines (Level 1)

- **[Architecture](architecture/README.md)** - System architecture, patterns, and design decisions
  - **[Architectural Patterns](architecture/architectural-patterns/README.md)** - Core architecture patterns (CRUD, Layered, Hexagonal, Clean, CQRS, Event Sourcing)
  - **[Scaling Patterns](architecture/scaling-patterns/README.md)** - Horizontal and vertical scaling strategies
  - **[Deployment Architectures](architecture/deployment-architectures/README.md)** - Deployment patterns and strategies
  - **[Performance Patterns](architecture/performance-patterns/README.md)** - Performance optimization techniques
  - **[Decision Records](architecture/decision-records/README.md)** - ADR process, templates, decision frameworks

### 💻 Development Guidelines (Level 1)

- **[Development](development/README.md)** - Code design, technical standards, and testing strategies
  - **[Code Design](development/code-design/README.md)** - Organization patterns, design principles, code structure
  - **[Technical Standards](development/technical-standards/README.md)** - Tech stack decisions, tool configuration
  - **[Testing](development/testing/README.md)** - Testing strategies, frameworks, quality gates

### 🤝 Collaboration Guidelines (Level 1)

- **[Collaboration](collaboration/README.md)** - Process workflows and project management
  - **[Project Management](collaboration/project-management/README.md)** - PM frameworks with tool-specific guides (Jira, GitHub, etc.)

### ✨ Quality Guidelines (Level 1)

- **[Quality](quality/README.md)** - Quality criteria, accessibility, performance, and security
  - **[Standards](quality/standards/README.md)** - Definition of Done, quality criteria, completion standards
  - **[Accessibility](quality/accessibility.md)** - WCAG compliance, inclusive design, testing tools
  - **[Performance](quality/performance.md)** - Optimization strategies, monitoring, benchmarking
  - **[Security](quality/security.md)** - Secure development, vulnerability assessment, practices

### 🚀 Operations Guidelines (Level 1)

- **[Operations](operations/README.md)** - Infrastructure, UX standards, and observability
  - **[Infrastructure](operations/infrastructure.md)** - Deployment strategies, environment management, CI/CD
  - **[UX Design](operations/ux-design.md)** - User experience standards, design principles, systems
  - **[Observability](operations/observability.md)** - Monitoring, logging, tracing, alerting

## 🔗 Cross-References

All documents are designed to work together and contain extensive cross-references. Key integration points:

- **Architecture** ↔ **Infrastructure**: Architectural decisions inform deployment strategies
- **Testing** ↔ **Performance/Security**: Quality gates integrate across all domains
- **UX** ↔ **Accessibility**: User experience aligned with accessibility standards
- **Definition of Done** ↔ **All Guidelines**: Quality criteria reference all technical standards
- **Way of Working** ↔ **All Guidelines**: Collaboration, workflow, and artifact management practices integrate with all technical standards
- **Collaboration & Process** ↔ **All Guidelines**: Collaboration, workflow, and artifact management practices integrate with all technical standards

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

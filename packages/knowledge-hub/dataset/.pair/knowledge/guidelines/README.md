# 📚 Technical Guidelines Knowledge Base

This directory contains the complete technical guidelines knowledge base for the project, organized into themed categories with Level 2 navigation READMEs for easy discovery and cross-linking.

## 📋 Themed Categories

### 🏗️ Architecture Guidelines

- **[Architecture](architecture)** - System architecture patterns, bounded contexts, and ADR processes
  - [Architectural Guidelines](architecture/architectural-guidelines.md) - Core architectural principles and patterns

### 💻 Development Guidelines

- **[Development](development)** - Code design, technical standards, and testing strategies
  - [Code Design Guidelines](development/code-design-guidelines.md) - Code organization and design patterns
  - [Technical Guidelines](development/technical-guidelines.md) - Tech stack and development tools
  - [Testing Strategy](development/testing-strategy.md) - Testing frameworks and quality gates

### 🤝 Collaboration Guidelines

- **[Collaboration](collaboration)** - Process workflows and project management
  - [Project Management](collaboration/project-management) - Comprehensive collaboration and process guidelines

### ✨ Quality Guidelines

- **[Quality](quality)** - Quality criteria, accessibility, performance, and security
  - [Definition of Done](quality/definition-of-done.md) - Quality criteria and completion standards
  - [Accessibility Guidelines](quality/accessibility-guidelines.md) - Accessibility standards and compliance
  - [Performance Guidelines](quality/performance-guidelines.md) - Performance optimization strategies
  - [Security Guidelines](quality/security-guidelines.md) - Security implementation and best practices

### 🚀 Operations Guidelines

- **[Operations](operations)** - Infrastructure, UX standards, and observability
  - [Infrastructure Guidelines](operations/infrastructure-guidelines.md) - Deployment and environment management
  - [UX Guidelines](operations/ux-guidelines.md) - User experience standards and design principles
  - [Observability Guidelines](operations/observability-guidelines.md) - Monitoring, logging, and tracing

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

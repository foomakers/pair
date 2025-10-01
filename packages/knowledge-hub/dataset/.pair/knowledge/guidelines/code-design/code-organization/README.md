# 📁 Organization Patterns (Level 2)

**Focus**: Code and workspace organization strategies

Define patterns for organizing code, files, and workspace structure to ensure maintainability, scalability, and team collaboration across monorepo and feature-based architectures.

## 📚 Organization Patterns (Level 3)

### File Structure

- **[File Structure](file-structure.md)** - File and directory organization standards
  - Standard directory structure for applications and packages
  - Feature-based organization vs technical layer organization
  - Component, service, and utility file organization patterns
  - Test file co-location and organization strategies
  - Configuration file placement and naming conventions

### Naming Conventions

- **[Naming Conventions](naming-conventions.md)** - Consistent naming patterns for files, functions, and components
  - File naming conventions (kebab-case for files)
  - Function and variable naming (camelCase standards)
  - Class and interface naming (PascalCase patterns)
  - Constant naming (UPPER_SNAKE_CASE standards)
  - Component and module naming conventions

### Workspace Structure

- **[Workspace Structure](workspace-structure.md)** - Feature-based architecture and workspace organization
  - Feature-based architecture principles and benefits
  - Feature module structure and organization patterns
  - Cross-feature communication and dependency management
  - Public API design for feature modules
  - Feature isolation and boundary definition

### Monorepo Organization

- **[Monorepo Organization](monorepo-organization.md)** - Monorepo structure and package organization
  - Top-level workspace structure (apps, packages, tools)
  - Application entry points and shared package organization
  - Package boundaries and dependency management
  - Development tools and configuration sharing
  - Build orchestration and workspace coordination

### Dependency Management

- **[Dependency Management](dependency-management.md)** - Package and dependency organization patterns
  - PNPM workspace configuration and management
  - Version catalog strategy for consistent library versions
  - Shared dependencies and package boundaries
  - Library version consistency across workspaces
  - Dependency resolution and conflict management

## 🔗 Related Practices

- **[Implementation Standards](.pair/knowledge/guidelines/code-design/implementation-standards/README.md)** - Development patterns that support organization
- **[Tech Stack](.pair/knowledge/guidelines/technical-standards/tech-stack/README.md)** - Technologies that enable organization patterns
- **[Quality Standards](.pair/knowledge/guidelines/code-design/quality-standards/README.md)** - Quality validation for organization standards

## 🎯 Quick Start

1. **Structure Foundation**: Establish [File Structure](file-structure.md) standards for your projects
2. **Naming Consistency**: Implement [Naming Conventions](naming-conventions.md) across the codebase
3. **Feature Organization**: Apply [Workspace Structure](workspace-structure.md) for feature-based development
4. **Package Management**: Configure [Monorepo Organization](monorepo-organization.md) for multi-package projects
5. **Dependency Control**: Set up [Dependency Management](dependency-management.md) for version consistency

---

_Organization Patterns ensure that code is structured in a way that scales with team size and project complexity._

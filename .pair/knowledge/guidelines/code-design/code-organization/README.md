# Code Organization

Strategic patterns for organizing code, files, and workspace structure to maximize maintainability, scalability, and team collaboration.

## Purpose

Define clear organizational patterns that support efficient development, reduce cognitive load, and enable effective team collaboration across projects of varying sizes and complexity.

## Available Organization Patterns

### Project Structure and Layout

#### [Workspace Structure](workspace-structure.md)

- Monorepo organization with clear separation of concerns
- Application and package boundaries and responsibilities
- Shared code and utility organization strategies
- Cross-project dependency management and versioning

#### [File Structure](file-structure.md)

- Feature-based vs. technical layer organization approaches
- Directory naming and hierarchy conventions
- Component, service, and utility file organization
- Test file co-location and organization strategies

### Naming and Conventions

#### [Naming Conventions](naming-conventions.md)

- Consistent naming patterns across files, functions, and components
- File and directory naming standards (kebab-case, camelCase, PascalCase)
- Variable, function, and class naming conventions
- Interface and type naming patterns for TypeScript

#### [Feature Architecture](feature-architecture.md)

- Feature-based architecture principles and implementation
- Feature module boundaries and public API design
- Cross-feature communication and dependency patterns

```markdown
# Code Organization

## Introduction

Patterns and recommendations for organizing code, files and workspace to improve maintainability, scalability and team collaboration.

## In Scope

- Monorepo and workspace structure
- File and folder organization strategies
- Naming conventions and feature architecture
- Advanced organization patterns (layer-based, service/repository)

## Out of Scope

- Framework-specific implementation details (see `framework-patterns/`)
- Quality tool deep-config (see `quality-standards/`)

## Files (this directory)

- `workspace-structure.md` - monorepo and workspace layout
- `file-structure.md` - file/directory conventions
- `naming-conventions.md` - naming rules
- `feature-architecture.md` - feature-module patterns
- `code-organization.md` - advanced patterns and examples

## How to use

Start with `workspace-structure.md` to define repo boundaries, then apply `file-structure.md` and `naming-conventions.md` for consistent implementation. Use `feature-architecture.md` for domain-aligned patterns and `code-organization.md` for complex app strategies.
```

- Organization patterns that scale with team and project size

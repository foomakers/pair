# Project Architecture Constraints

Project-specific architectural constraints and design decisions for small team development and rapid deployment.

## Purpose

Define and document the specific architectural constraints that guide all system design decisions for this project, ensuring consistency with adopted standards and team capabilities.

## Available Constraint Categories

- **[Team Constraints](project-constraints/team-constraints.md)** - Small team architecture and development priorities
- **[Platform Constraints](project-constraints/platform-constraints.md)** - Desktop-only and self-hosted requirements
- **[Technology Constraints](project-constraints/technology-constraints.md)** - Lightweight processing and technology selection
- **[Implementation Guidelines](project-constraints/implementation-guidelines.md)** - Decision priorities and selection criteria

## Project Constraint Overview

### Core Principles

- **Small Team Focus**: Designed for 2-4 developers maximum
- **Desktop-Only**: No mobile or web responsive requirements
- **Self-Hosted Preference**: Local/controlled data over SaaS
- **Lightweight Processing**: No big data or complex algorithms
- **Rapid Development**: Simple solutions over sophisticated ones

### Exception Areas

- **LLM Services**: External APIs accepted for AI functionality
- **Vector Databases**: Supabase for RAG capabilities
- **CI/CD**: GitHub Actions for development workflow
- **Basic Monitoring**: External tools when necessary

## Architecture Decision Priority

1. **Simplicity** over sophistication
2. **Speed** over optimization
3. **Flexibility** over performance
4. **Maintainability** over features
5. **Local control** over cloud benefits

## Cross-References

- **[Deployment Architectures](deployment-architectures/README.md)** - Self-hosted deployment patterns
- **[Tech Stack](.pair/adoption/tech/tech-stack.md)** - Specific technology choices
- **[Way of Working](.pair/adoption/tech/way-of-working.md)** - Process constraints and decisions

## Scope Boundaries

**Includes**: Project-specific constraints, team limitations, platform choices
**Excludes**: General architectural patterns (covered in other files), specific technology configurations
**Overlaps**: Deployment strategies (shared self-hosting preference), Performance patterns (shared lightweight approach)

# Development Collaboration Context

## Subdomains Covered

- Collaborative Workflow
- Code & Documentation Generation

## Business Scope and Purpose

This context orchestrates the collaboration between developers and AI assistants, ensuring that workflow changes are immediately reflected in code and documentation generation. It maximizes business cohesion by grouping all activities that directly impact the development process and output quality.

## Relationships Between Bounded Context and Sub Domains

- **Collaborative Workflow** provides coordination logic, triggers, and context for development activities.
- **Code & Documentation Generation** consumes workflow events and standards, producing consistent code and documentation aligned with team practices.
- Changes in workflow directly affect code generation, ensuring synchronized evolution.

## Integration Patterns

- Consumes standards and best practices from the Knowledge & Standards Context.
- Publishes workflow and code generation events to Integration & Infrastructure Context for storage and UI management.

## Data Ownership

- Owns workflow definitions, code artifacts, and documentation entities.

## Team Alignment

- Managed by the core development team for maximum autonomy and rapid iteration.

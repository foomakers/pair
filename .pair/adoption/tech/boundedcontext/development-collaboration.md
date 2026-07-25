# Development Collaboration Context

> Type: **Core**

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
- Publishes workflow and code generation events to Integration & Process Standardization Context for packaging and distribution.

## Data Ownership

- Owns workflow definitions, code artifacts, and documentation entities.

## Team Alignment

- Managed by the core development team for maximum autonomy and rapid iteration.

## Ubiquitous Language

| Term | Definition |
| ---- | ---------- |
| Workflow | A sequence of collaborative phases (requirements → design → implementation → review) between developer and AI assistant |
| Skill | An atomic, invocable unit of operational knowledge that an AI assistant executes |
| Adoption *(consumed)* | A project's committed choice of a practice, tool, or process, recorded as a delta over KB defaults. **Owned by Knowledge & Standards** (subdomain Adoption & Guidelines); workflows and skills here *read* adoptions, they do not define or own them. |

**Borrowed-term convention.** A term this context consumes but does not own is marked *(consumed)* and names its owning context, reusing that context's definition verbatim in substance. A term appears as owned in exactly one bounded context — an unmarked duplicate across two UL tables is a boundary defect, not a synonym.

## Quality Attributes

- **Performance:** Sub-second response for skill invocation and workflow state transitions
- **Scalability:** Single-team usage; no multi-tenant requirements
- **Reliability:** Idempotent skill execution — re-invocation produces consistent results

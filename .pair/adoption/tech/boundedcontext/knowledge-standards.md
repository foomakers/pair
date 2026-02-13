# Knowledge & Standards Context

> Type: **Supporting**

## Subdomains Covered

- How To Knowledge
- Adoption & Guidelines

## Business Scope and Purpose

This context captures, manages, and disseminates operational instructions, best practices, and process guidelines. It ensures that standards are consistently applied and that knowledge is easily accessible to all team members.

## Relationships Between Bounded Context and Sub Domains

- **How To Knowledge** stores operational instructions and best practices, referenced by other contexts.
- **Adoption & Guidelines** defines and evolves standards, which inform the capture and application of knowledge.
- Standards changes trigger updates in operational knowledge, ensuring alignment.

## Integration Patterns

- Provides standards and best practices to Development Collaboration Context.
- Shares guidelines and instructions with Integration & Infrastructure Context for technical implementation and UI display.

## Data Ownership

- Owns knowledge base articles, guidelines, and operational standards.

## Team Alignment

- Managed by the core development team, ensuring standards and knowledge evolve with project needs.

## Ubiquitous Language

| Term | Definition |
| ---- | ---------- |
| Guideline | A reusable standard or best practice documented in the knowledge base |
| How-to | An orchestration document that composes skills into a phase-driven workflow |
| Adoption file | A project-specific record of a decision (architecture, tech-stack, way-of-working) |

## Quality Attributes

- **Performance:** No runtime constraints — consumed at development time by AI assistants
- **Scalability:** Grows with project complexity; file-based storage scales linearly
- **Reliability:** Content must be self-consistent — no broken internal references

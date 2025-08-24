# Subdomain Catalog Index

This folder contains the strategic subdomain definitions for the "pair" product. Each file provides a detailed specification for a business subdomain, supporting Domain-Driven Design and team organization.

## Subdomain List

### Core Subdomains

- [Collaborative Workflow](./collaborative-workflow.md): Enables seamless coordination between development teams and AI assistants throughout all phases of product development.
- [Code & Documentation Generation](./code-documentation-generation.md): Produces consistent, high-quality code and documentation aligned with team standards and project context.

### Supporting Subdomains

- [How To Knowledge](./how-to-knowledge.md): Captures and applies operational instructions and best practices derived from team experience.
- [Adoption & Guidelines](./adoption-guidelines.md): Manages the adoption of practices, tools, and processes, and defines operational and technical guidelines for the team.
- [Integration & Process Standardization](./integration-process-standardization.md): Connects with external tools and standardizes team processes for consistent operations.

## Subdomain Relationship Matrix

| From                                  | To                                    | Relationship Type         | Data/Knowledge Flow                | Coordination Level |
| ------------------------------------- | ------------------------------------- | ------------------------- | ---------------------------------- | ------------------ |
| Collaborative Workflow                | Adoption & Guidelines                 | Operational dependency    | Practices and tools flow           | High               |
| Collaborative Workflow                | Integration & Process Standardization | Bidirectional integration | Data and command exchange          | Medium             |
| Collaborative Workflow                | How To Knowledge                      | Resource consumption      | Use of operational instructions    | High               |
| Code & Documentation Generation       | Adoption & Guidelines                 | Technical dependency      | Application of standards           | High               |
| Code & Documentation Generation       | How To Knowledge                      | Resource consumption      | Use of best practices              | High               |
| Adoption & Guidelines                 | How To Knowledge                      | Resource consumption      | Application of procedures          | Medium             |
| Integration & Process Standardization | All subdomains                        | Shared service            | Process standards and integrations | Low/Transversal    |
| How To Knowledge                      | All subdomains                        | Shared resource           | Operational instructions           | Low/Transversal    |

---

For details on each subdomain, see the linked files above. This catalog is the foundation for bounded context definition and team alignment.

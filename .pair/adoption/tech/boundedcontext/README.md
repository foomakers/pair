# Bounded Context Catalog (Grouped)

This catalog adopts a grouped approach to bounded context definition, tailored for a small team working on the "pair" project. The grouping is based on business and technical cohesion, minimizing overhead and maximizing collaboration.

## Why This Grouping?

With only one team of two people, managing many separate bounded contexts would create unnecessary complexity and coordination overhead. By grouping related subdomains into broader bounded contexts, we keep coordination low and collaboration high. As the project or team expands, contexts can be refined for greater autonomy.

## Bounded Contexts and Subdomain Mapping

### 1. Development Collaboration Context

- **Type:** Core
- **Subdomains:** Collaborative Workflow, Code & Documentation Generation
- **Description:** Coordinates development teams and AI assistants across all phases, and produces consistent code and documentation aligned with team standards and project context.
- [See details](./development-collaboration.md)

### 2. Knowledge & Standards Context

- **Type:** Supporting
- **Subdomains:** Adoption & Guidelines, How-To Knowledge
- **Description:** Manages adoption of practices, tools, and processes; defines operational and technical guidelines; captures and applies operational instructions and best practices.
- [See details](./knowledge-standards.md)

### 3. Integration & Process Standardization Context

- **Type:** Supporting
- **Subdomains:** Integration & Process Standardization
- **Description:** Manages integration logic and process standardization (APIs, external/internal tool connections, automation standards), and packages/distributes the knowledge base (dataset, content distribution, cache) that the knowledge subdomains produce. Absorbs the former Knowledge Base Management context (see DDR `decision-log/2026-07-19-merge-kb-management-into-integration.md`).
- [See details](./integration-process-standardization.md)

---

This catalog is designed for simplicity and effectiveness in a small team environment. For more details, see the individual context files linked above.

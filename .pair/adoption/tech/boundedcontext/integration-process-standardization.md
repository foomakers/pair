# Integration & Process Standardization Context

> Type: **Supporting**

## Subdomains Covered

- Integration & Process Standardization

## Business Scope and Purpose

This context manages all integration logic and process standardization for the project, and it packages and distributes the knowledge base. It exposes APIs, coordinates connections with external/internal tools, enforces common workflows and automation standards, and owns the pipeline that builds, distributes, and caches the KB that the knowledge subdomains produce.

## Relationships Between Bounded Context and Sub Domains

- **Integration** provides adapters and APIs for external services (e.g., CI/CD, code repositories, notifications).
- **Process Standardization** defines and enforces workflows, automation scripts, and operational standards for development and deployment.
- **KB packaging & distribution** builds the KB dataset, flattens/prefixes/symlinks skills to AI-tool directories, and manages the local versioned KB cache — distributing what the knowledge subdomains (Code & Documentation Generation, Adoption & Guidelines, How-To Knowledge) produce. It owns no business subdomain of its own; it is infrastructure absorbed here (see DDR `decision-log/2026-07-19-merge-kb-management-into-integration.md`).
- All other contexts consume the shared services, integration endpoints, and KB access provided by this context.

## Integration Patterns

- Exposes unified APIs for builds, deployments, and notifications.
- Manages adapters for external tools and ensures technical interoperability.
- Standardizes automation and operational processes across the project.
- Publishes and serves KB content (dataset release, content distribution, cache) to the other contexts.

## Data Ownership

- Owns integration configurations, process definitions, and automation scripts.
- Owns the KB dataset, its distribution artifacts/metadata, and the local KB cache.

## Team Alignment

- Managed by the core development team; may expand as integration and knowledge-distribution needs grow.

## Ubiquitous Language

| Term | Definition |
| ---- | ---------- |
| Quality gate | A configured check command (e.g., `pnpm quality-gate`) that must pass before commits |
| Bridge pattern | The mechanism that links AI tool directories (AGENTS.md, .github/) to the canonical .pair/ KB |
| Smoke test | End-to-end CLI release process validation (`pnpm smoke-tests`) |
| KB dataset | The packaged collection of knowledge files distributed as a release artifact |
| Content distribution | The pipeline that flattens, prefixes, and symlinks skills to AI tool directories |
| KB cache | Local versioned storage at `~/.pair/kb/{version}/` for downloaded KB artifacts |

## Quality Attributes

- **Performance:** Quality gate execution under 30 seconds for cached builds; KB download with resume support; sub-second local cache hits
- **Scalability:** Pipeline supports multiple AI tool targets via symlink distribution; version-isolated KB cache prevents cross-version conflicts
- **Reliability:** Pre-commit hooks enforce gate compliance (no bypass without explicit override); SHA256 checksum validation on all downloaded KB artifacts

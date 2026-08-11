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
- **Ownership splits by concern, not by path.** This context owns the *packaging & distribution* of KB content — the dataset as a release artifact, the flatten/prefix/symlink transform, the `pair update` mirror, and the cache. It does **not** own the content's *authoring*: guidelines and conventions are authored and owned by **Knowledge & Standards**, skills and workflows by **Development Collaboration**. A file under `packages/knowledge-hub/dataset/.pair/knowledge/**` is therefore *authored-by* its content subdomain and *distributed-by* this context — its co-location in the dataset directory is packaging, not content ownership. (Resolves the recurring "same edit lands in two bounded contexts" attribution ambiguity.)
- **The docs site is dissemination, and the same split applies.** `apps/website/**` is a separate deployable owned by this context as a *distribution channel*: its build/deploy pipeline, its routing/IA, and the `docs-staleness` gate. It maps to no business subdomain of its own. The **facts** it renders — skill catalog rows, `N skills` / `N capabilities` counts, guideline prose — are *authored-by* the content contexts (**Knowledge & Standards** for guidelines/how-to, **Development Collaboration** for skills/workflows) and only *disseminated-by* this context. Corollary, load-bearing: those facts MUST be derived from the dataset (single source of truth), never hand-copied into `.mdx`; the derivation checks in `apps/website/lib/docs-staleness-check.ts` are the contract test of that derivation. Hand-maintained duplication of dataset facts in the site is a CRITICAL coupling defect (see the `$scope: full` dogfood triage in story #263).

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
| KB cache | Local storage for downloaded KB artifacts, one slot per source identity: `~/.pair/kb/{version}/` for the official KB, `~/.pair/kb/external/{kind}-{label}-{hash}/` for every other source (see the [2026-08-11 ADL](../../decision-log/2026-08-11-kb-cache-slots-keyed-by-source-identity.md)) |

## Quality Attributes

- **Performance:** Quality gate execution under 30 seconds for cached builds; KB download with resume support; sub-second local cache hits
- **Scalability:** Pipeline supports multiple AI tool targets via symlink distribution; source-keyed KB cache prevents cross-version AND cross-source conflicts
- **Reliability:** Pre-commit hooks enforce gate compliance (no bypass without explicit override); SHA256 checksum validation on all downloaded KB artifacts

# DDR: Merge Knowledge Base Management into the Integration & Process Standardization bounded context

## Status

Accepted

## Date

2026-07-19

## Context

- Concerns the bounded-context grouping in `adoption/tech/boundedcontext/`. The former **Knowledge Base Management** context declared `Subdomains Covered: RAG Infrastructure, UI Management (for KB)` — neither is a registered subdomain (the catalog has exactly five: Collaborative Workflow, Code & Documentation Generation, Adoption & Guidelines, How-To Knowledge, Integration & Process Standardization), and "RAG Infrastructure" does not exist anywhere in Pair. Its real content is purely technical: KB dataset, content distribution (flatten/prefix/symlink), and the local KB cache.
- **Hard to reverse**: re-splitting the merged context later means re-establishing separate boundaries, data ownership, and ubiquitous-language tables for KB distribution versus integration.
- **Surprising without context**: a newcomer seeing KB packaging/distribution under "Integration & Process Standardization" would not infer it was a deliberate merge of a former standalone context.
- **Real trade-off**: the rejected alternative kept Knowledge Base Management as a distinct Infrastructure context with an explicit "no business subdomain" note. Rejected because the two overlap heavily (Integration already owned the "Bridge pattern to the canonical .pair/ KB" and "UI management" wording) and a two-person team benefits from fewer contexts (the catalog's stated grouping philosophy).

## Decision

The **Knowledge Base Management** bounded context is merged into the **Integration & Process Standardization** bounded context. The merged context:

- covers exactly one registered subdomain, **Integration & Process Standardization** (classification **Supporting** per the subdomain catalog) — its `Type` is therefore **Supporting**, not "Infrastructure" (which is not a subdomain classification and is dropped as a `Type` value);
- absorbs KB packaging/distribution (KB dataset, content distribution, KB cache) into its Business Scope, Data Ownership, Ubiquitous Language, and Quality Attributes, explicitly as infrastructure that distributes what the knowledge subdomains (Code & Documentation Generation, Adoption & Guidelines, How-To Knowledge) produce — owning no business subdomain of its own for that concern.

The invented subdomains "RAG Infrastructure" and "UI Management (for KB)" are removed. `knowledge-base-management.md` is deleted; the catalog goes from four context files to three.

## Consequences

### Benefits

- Every bounded context now maps only to registered subdomains — no invented terms; classification/`Type` is consistent (Core/Supporting, mirroring the subdomain catalog) across all three contexts.
- Removes the KB-distribution vs integration overlap that previously spanned two contexts.
- README and context files are internally consistent (no dangling `integration-infrastructure.md` link, no phantom subdomains, populated entries).

### Trade-offs and Limitations

- The merged context is broad: it mixes external-tool integration, process standardization, and KB distribution. If KB distribution grows into its own concern (e.g., the Knowledge Service backend — #64/#66/#67/#68), it may warrant re-splitting into a dedicated context; this DDR would then be superseded.

## Context Map Impact

- No change to `adoption/product/context-map.md` (it indexes the five subdomains, not bounded contexts, and did not reference the removed context).
- `adoption/tech/boundedcontext/integration-process-standardization.md`: `Type` Infrastructure → Supporting; absorbs KB packaging/distribution content (scope, ownership, ubiquitous language, quality attributes).
- `adoption/tech/boundedcontext/knowledge-base-management.md`: deleted.
- `adoption/tech/boundedcontext/README.md`: three contexts, populated entries, phantom `integration-infrastructure.md` link removed.

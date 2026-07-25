# DDR: Borrowed-term marking in UL tables + the docs site as a dissemination channel

## Status

Accepted

## Date

2026-07-25

## Context

Two attribution defects surfaced while analysing PR #381 (story #263, coupling-balance guideline + `assess-coupling`). Both are boundary-documentation defects in `adoption/tech/boundedcontext/`, not code:

1. **Duplicate owned term.** `development-collaboration.md` declared `Adoption` in its own Ubiquitous Language table ("a recorded decision about which practice, tool, or pattern the project follows"), while `adoption/product/context-map.md` assigns `Adoption` to the **Adoption & Guidelines** subdomain and `knowledge-standards.md` owns `Adoption file`. The same term appeared as *owned* in two bounded contexts with two definitions — the classic ubiquitous-language collision. Development Collaboration does legitimately touch adoptions (skills read them), so deleting the row would lose real information.
2. **Unattributed deployable.** `apps/website/**` maps to no registered subdomain, and the existing "ownership splits by concern, not by path" rule was scoped explicitly to `packages/knowledge-hub/dataset/.pair/knowledge/**` — it said nothing about the site. Every PR touching the docs site therefore had to re-invent an attribution. The same PR's `$scope: full` dogfood independently found *website ↔ knowledge-hub dataset* to be the repo's single **CRITICAL** coupling: skill-catalog rows and `N skills` counts hand-copied across ~10 `.mdx` files. The missing ownership rule and the CRITICAL coupling are the same defect seen from two sides — nothing declared the site's facts to be derived rather than authored.

**Hard to reverse / surprising without context:** ownership rules are cited by every subsequent PR's bounded-context analysis and by `/pair-capability-assess-coupling`; changing them later invalidates prior attributions.

**Real trade-off considered:** the rejected alternative for (2) was to register a new subdomain (e.g. "Documentation & Dissemination"). Rejected — the site produces no knowledge of its own, it renders facts other subdomains author; a new subdomain would legitimise the duplication instead of forbidding it, and the catalog's stated philosophy favours fewer contexts for a two-person team.

## Decision

1. **Borrowed-term convention.** A term a context consumes but does not own is marked *(consumed)* in its UL table and names its owning context, reusing the owner's definition in substance. A term is *owned* in exactly one bounded context; an unmarked duplicate across two UL tables is a boundary defect, not a synonym. Applied: `development-collaboration.md` now lists `Adoption *(consumed)* — owned by Knowledge & Standards (Adoption & Guidelines)`.
2. **The docs site is a dissemination channel, and "splits by concern" extends to it.** `apps/website/**` is owned by **Integration & Process Standardization** as a distribution channel (build/deploy pipeline, routing/IA, the `docs-staleness` gate) and maps to no business subdomain. The facts it renders — catalog rows, skill/capability counts, guideline prose — are *authored-by* the content contexts (Knowledge & Standards for guidelines/how-to, Development Collaboration for skills/workflows) and only *disseminated-by* Integration.
3. **Load-bearing corollary.** Those facts MUST be derived from the dataset, never hand-copied into `.mdx`. The derivation checks in `apps/website/lib/docs-staleness-check.ts` are the contract test of that derivation; hand-maintained duplication of dataset facts in the site is a CRITICAL coupling defect. This makes the rebalance already shipped in PR #381 (Check 2c — catalog row *content* single-sourced from dataset SKILL.md frontmatter) the enforced norm rather than a one-off cleanup.

## Consequences

### Benefits

- Bounded-context attribution for a docs-site PR is now deterministic — no per-PR re-derivation, no silent double-attribution.
- UL collisions become detectable by inspection: an unmarked duplicate term is, by definition, a defect.
- The CRITICAL coupling cannot silently regress: the rule names the derivation contract that forbids re-introducing hand-copied dataset facts.

### Trade-offs and Limitations

- The convention is prose-enforced, not gate-enforced: no test asserts that `(consumed)` markers stay accurate or that a new `.mdx` fact is derived. Nothing reads `boundedcontext/*.md` programmatically today; adding a conformance check is a candidate follow-up if drift appears.
- Integration & Process Standardization grows broader still (integration + process + KB distribution + site dissemination). Same limitation already recorded in DDR `2026-07-19-merge-kb-management-into-integration.md`; if dissemination grows its own concern it may warrant re-splitting, superseding both DDRs.

## Context Map Impact

- No change to `adoption/product/context-map.md` — it indexes the five registered subdomains, and no subdomain is added or removed.
- `adoption/tech/boundedcontext/development-collaboration.md`: `Adoption` re-marked as a consumed term + borrowed-term convention stated under the UL table.
- `adoption/tech/boundedcontext/integration-process-standardization.md`: Data Ownership gains the docs-site dissemination bullet and the derivation corollary.

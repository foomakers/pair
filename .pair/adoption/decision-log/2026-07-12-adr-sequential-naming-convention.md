# Decision: ADR naming converges on sequential `adr-NNN-<topic>.md`

## Date

2026-07-12

## Status

Active

## Category

Convention Adoption

## Context

Two ADR naming conventions coexisted in this repo: sequential `adr-NNN-<topic>.md` (`adr-001` through `adr-008`, the majority) and date-based `YYYY-MM-DD-<topic>.md` (3 legacy ADRs: canonical-states, map-subdomains, quality-model). `record-decision`'s `SKILL.md` on `main` still documents ADR naming as date-based (`YYYY-MM-DD-<topic>.md`, with the stated rationale "avoids numbering conflicts") — that documentation is stale relative to the repo's actual dominant practice and is being corrected by the in-flight, unmerged story #224 (branch `refactor/#224-assess-output-only`, PR #310), which also creates the next sequential ADR, `adr-009`. A second in-flight, unmerged branch (`docs/#313-authoring-standard`, story #313 task T2) independently creates `adr-010`. This chore renames the 3 legacy date-based ADRs to close the gap with the dominant convention, without waiting for either of those branches to merge first.

## Decision

Standardize ADR filenames on sequential `adr-NNN-<topic>.md` (matching the majority convention and the direction record-decision's documentation is being corrected toward by #224/#310). The 3 legacy date-based ADRs are renamed, in their real chronological creation order, to **`adr-011`**, **`adr-012`**, **`adr-013`** — deliberately skipping `009`/`010`, which are already claimed by the two open, unmerged branches above, to avoid a numbering collision when they land. ADL filenames are unaffected by this decision — they remain date-based (`YYYY-MM-DD-<topic>.md`), which is uniform across 100% of existing ADLs and not in dispute.

This decision does not itself change `record-decision`'s `SKILL.md` (out of scope for a pure-rename chore) — that correction ships with #224/#310, which is why the resulting ADR sequence will have a gap at `009`-`010` from this branch's perspective until #310 and #313-T2 merge.

## Alternatives Considered

- **Renumber immediately to `adr-009`/`adr-010`/`adr-011`** (no gap): rejected — `adr-009` and `adr-010` already exist with different content on the two open branches; taking those numbers now would guarantee a collision (two different ADRs claiming the same number) the moment either branch merges.
- **Wait for #224/#310 to merge before renaming**: rejected — the rename is independent, low-risk, and merge order between this chore and #224/#313 is not otherwise constrained; waiting adds no value and blocks an easy hygiene fix on an unrelated dependency.
- **Leave the 3 legacy ADRs date-based**: rejected — perpetuates two coexisting conventions with no clear rule for which new ADRs should use, the exact confusion record-decision's own (corrected) documentation is meant to resolve.

## Consequences

- All 11 pre-existing ADRs (post-merge of this chore) use sequential naming; only ADLs remain date-based, which is now the single, unambiguous rule going forward (sequential for ADR/DDR, date-based for ADL — matching `record-decision`'s corrected documentation once #224/#310 lands).
- A visible numbering gap (`009`-`010` reserved, not present on this branch) persists until #224/#310 and #313's `docs/#313-authoring-standard` branch merge — expected and intentional, not a defect.
- The 3 renamed files' internal H1 titles (`# ADR: <Title>`, no number) remain unchanged by this chore (a pure `git mv`, no content edits) — inconsistent with numbered peers' `# ADR-NNN: <Title>` headers. Tracked as a fast-follow content-only commit once numbering is final across all three in-flight branches, so the header edit isn't done twice.

## Adoption Impact

None — this is a repo-internal file-naming hygiene decision, not a change to any `adoption/tech/*` adoption file's content or schema.

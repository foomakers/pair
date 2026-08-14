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

## Addendum (2026-07-18)

**Numbering is now final for `adr-001`–`adr-014`** (all merged, no gaps). The H1 fast-follow this ADL deferred is now due for those; completed as part of this addendum: `adr-011` through `adr-014` (4 files, all still `# ADR: <Title>` with no number) got their H1s corrected to `# ADR-NNN: <Title>`, matching `adr-001`–`adr-010`.

**A numbering collision caught in flight**: while preparing a 5th drifted file (below) for renaming to the next sequential number, found that two independent, still-unmerged branches had each picked `adr-015` for a different file — this branch's rename, and story #227's own new `adr-015-security-deterministic-layer-not-a-skill.md` (created against the same `adr-014`-tipped `main`). Resolved by bumping this branch's rename to `adr-016` instead (cheaper to renumber here than to edit #227's already-posted, multi-round review history that cites "adr-015" by name). `adr-015-security-deterministic-layer-not-a-skill.md`'s own missing H1 number prefix is #227's own fast-follow to apply in its own branch, not duplicated here.

**Scope extended to DDR/ADL/Analysis-Log** — this ADL originally only reconciled ADR's own two coexisting conventions. Re-raised while investigating whether the now-broader split (ADR/DDR sequential vs. ADL/Analysis-Log date-based) was worth unifying to one format: **keep the dual convention, do not unify**. Sequential numbering (`adr-NNN`/`ddr-NNN`) serves record kinds that form supersede chains and are cited by number elsewhere (brainstorm/refine conflict flags, cross-references like "adr-012") — a chain reads naturally as "adr-003 supersedes adr-001," which a date delta does not. Date-based naming (`YYYY-MM-DD`) serves ADL/Analysis-Log, which behave as a chronological log rather than a citable chain: ADL is referenced by topic not by number, and Analysis-Log is explicitly never superseded (every analysis is an independent, additive record) — recency-sortability is the useful property for both, not a citable sequence.

Alternatives considered for unifying (both rejected): (a) *all sequential* — ADL/Analysis-Log would need a single shared counter inside `decision-log/` across two distinct categories, more fragile under concurrent additions than independent dated filenames, for no citability benefit (neither kind is cited by number today); (b) *all date-based* — would require renaming all 14+ existing ADR files and rewriting every cross-reference that cites one by number, a disruptive migration to fix a documentation bug rather than a real design flaw.

**A second, independent documentation bug found and fixed while verifying the above**: `decision-records.md` (root `.pair/knowledge/guidelines/collaboration/` and its `packages/knowledge-hub/dataset/` mirror) — the KB guideline that documents ADR/ADL/DDR/Analysis-Log — had drifted to state "ADR and ADL use date-based naming," contradicting both `record-decision`'s own `SKILL.md` algorithm (`adr-NNN`, sequential — already correct, unaffected) and this very ADL's decision. Corrected the table's "File naming" row for ADR and the "File Naming Convention" section in both copies to state ADR uses sequential naming, matching DDR's row/rationale; ADL's row/section was already correct and is now no longer conflated with ADR's.

**A 5th drifted file found**: `adr/2026-07-12-ai-generated-template-contracts.md`, created by story #292 in 2026-07-12 — after this ADL's own renaming pass closed at `adr-013`, and evidently matching `decision-records.md`'s wrong documentation instead of the real convention. Renamed to `adr-016-ai-generated-template-contracts.md` (see the numbering-collision note above for why `016` and not `015`), H1 corrected to `# ADR-016: ...`. A repo-wide grep did find 3 code comments still citing the old slug by name (`.claude/workflows/contracts/ensure-contract.mjs`, `.claude/workflows/contracts/.gitignore`, `.claude/workflows/implement-batch.js` — those three paths as of this date; #219 later renamed them to `pair-contracts/…` and `pair-implement-batch.js`) — corrected to cite `adr-016-ai-generated-template-contracts.md` instead (2026-07-18 fast-follow, caught in PR #342 review).

# Decision: Keep dual decision-record naming (sequential for ADR/DDR, date-based for ADL/Analysis-Log) — do not unify

## Date

2026-07-18

## Status

Active

## Category

Convention Adoption

## Context

Decision records use two different file-naming schemes: ADR (`adr-NNN-<topic>.md`) and DDR (`ddr-NNN-<topic>.md`) are sequentially numbered; ADL and Analysis-Log (which share `adoption/decision-log/`) use `YYYY-MM-DD-<topic>.md`. Raised during PR analysis: is the split worth aligning to one format?

While verifying the actual rationale, found the guideline documenting it was **wrong**: `decision-records.md`'s "ADR vs ADL vs DDR vs Analysis-Log" table and its "File Naming Convention" section both stated "ADR and ADL use date-based naming" — contradicting the actual `pair-capability-record-decision` `SKILL.md` algorithm (`adr-NNN-<topic>.md`, sequential) and all 14 real ADR files in `adoption/tech/adr/` (13 of which are `adr-NNN-*`). One real file had drifted to match the wrong documentation instead of the actual convention: `adr/2026-07-12-ai-generated-template-contracts.md`, created by story #292 months after the sequential convention (`adr-001`, 2025-12/2026-02) was already established — an isolated naming violation, not evidence the convention had changed.

## Decision

**Keep the dual convention as-is; do not unify.** Sequential numbering (`adr-NNN`/`ddr-NNN`) is used for record kinds that form supersede chains and are cited by number elsewhere (brainstorm/refine conflict flags, cross-references like "adr-012") — a chain reads naturally as "ddr-003 supersedes ddr-001," which a date delta does not. Date-based naming (`YYYY-MM-DD`) is used for the two kinds that behave as a chronological log rather than a citable, superseding chain: ADL is referenced by topic not by number, and Analysis-Log is explicitly never superseded (every analysis is an independent, additive record) — for both, recency-sortability is the useful property, not a citable sequence.

Fixed as part of this decision (documentation bug, not a design change):

- `decision-records.md` (root `.pair/knowledge/guidelines/collaboration/` and its `packages/knowledge-hub/dataset/` mirror): corrected the table's "File naming" row for ADR and the "File Naming Convention" section's opening sentence to state ADR uses sequential `adr-NNN-<topic>.md` (matching DDR's row/rationale), not date-based; ADL's row/section is unchanged (it was already correct) and now no longer conflated with ADR's.
- Renamed the one drifted file: `adr/2026-07-12-ai-generated-template-contracts.md` → `adr/adr-015-ai-generated-template-contracts.md` (next sequential number after `adr-014`). No other file referenced it by its old name (verified via repo-wide grep).

## Alternatives Considered

- **Unify everything to sequential numbering**: Rejected. ADL/Analysis-Log would need a single shared counter inside `decision-log/` across two distinct categories, more fragile under concurrent additions than independent dated filenames, and would sacrifice the log's natural recency-sortability for no citability benefit (neither kind is cited by number today).
- **Unify everything to date-based naming**: Rejected. Would require renaming all 14 existing ADR files and rewriting every existing cross-reference that cites one by number (e.g. `adr-012`, `adr-014`), a disruptive migration to fix a documentation bug rather than a real design flaw — the sequential convention was deliberate and already load-bearing.

## Consequences

- The dual convention is now explicitly load-bearing (not accidental drift) — a future contributor proposing to "clean up" the naming split should be pointed at this ADL first.
- `decision-records.md`'s ADR row/section no longer contradicts `pair-capability-record-decision/SKILL.md` or the real `adr/` directory contents.
- `adr-015-ai-generated-template-contracts.md` is now discoverable via the sequential-numbering convention like every other ADR.

## Adoption Impact

- No adoption file update beyond the guideline fix itself — this decision documents/corrects an existing KB convention rather than adopting a new project-level fact. `decision-records.md` is a KB guideline (shipped in `packages/knowledge-hub/dataset/` and materialized at root), not an adoption file; both copies were corrected directly as part of this decision.

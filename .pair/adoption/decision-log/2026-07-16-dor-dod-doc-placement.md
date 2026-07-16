# Decision: DoR/DoD doc placement — `collaboration/project-management-tool/`, not `quality-assurance/`

## Date

2026-07-16

## Status

Active

## Category

Convention Adoption

## Context

Story #241 added the canonical DoR/DoD guideline (R3.8/R3.9) at `.pair/knowledge/guidelines/collaboration/project-management-tool/definition-of-ready-and-done.md` (root + dataset mirror), alongside `canonical-states.md` — the directory #240 established for that sibling doc (formalized in [adr-011-canonical-states-state-mapping.md](../tech/adr/adr-011-canonical-states-state-mapping.md)).

At implementation time this was treated as executing an already-decided placement pattern, not a new choice: epic #202's addendum calls the DoR/DoD doc "the companion DoR/DoD guideline" to `canonical-states.md`, and the PR description (#340) flagged the call explicitly for reviewer attention rather than asserting it silently.

PR #340 review (round 2) confirmed the placement is sound but noted, correctly, that epic #202 doesn't itself pin the doc's exact directory — so choosing `project-management-tool/` over `quality-assurance/` (DoR/DoD's more obvious home by name, since it gates the QA-adjacent "is this ready/done" question) was in fact a fresh structural decision, made by inference from the sibling doc's directory rather than from an explicit prior ruling. The finding was Minor/non-blocking and proposed its own right-sized fix: record it as a light ADL for traceability, per the PR description's own stated fallback ("If review disagrees, the fix is a light ADL recording 'DoR/DoD doc placement,' not a design change").

## Decision

Canonical process/workflow-state definitions decided at the epic #202 level — `canonical-states.md`, `definition-of-ready-and-done.md`, and any future doc in that family — live together in `.pair/knowledge/guidelines/collaboration/project-management-tool/`, not `.pair/knowledge/guidelines/collaboration/quality-assurance/`.

Rationale: these docs' primary consumers are the PM-tool-facing, state-machine-adjacent capabilities (`/pair-capability-verify-done`, `/pair-process-refine-story`, `/pair-next`'s state resolution) that read board/item state and macrostate semantics — the same consumers as `canonical-states.md`. DoD's per-tier hooks reference QA concerns (code standards, security, a11y) but the doc itself is a state-readiness gate, not QA process guidance; grouping it with its sibling state doc keeps one directory as the single place skills look for "what does Ready/Done mean," rather than splitting a tightly coupled pair (DoR/DoD is explicitly the companion to canonical-states' Draft/Ready boundary) across two directories.

## Alternatives Considered

- **`quality-assurance/`**: Rejected. DoD's per-tier hooks are QA-adjacent, but the doc's core content (readiness/done criteria and the state-resolution fallback) is consumed by the same PM-tool-facing capabilities as `canonical-states.md`, not by QA-process guidance consumers. Splitting the DoR/DoD pair from canonical-states across two directories would make the "companion guideline" relationship (epic #202's own framing) invisible from directory structure alone.
- **A new shared directory (e.g. `state-definitions/`)**: Rejected as unnecessary churn — `project-management-tool/` already exists, already holds the sibling doc, and no other content currently justifies a new subdirectory split.

## Consequences

- Future canonical process-state docs decided at the epic #202 level (or docs explicitly framed as companions to `canonical-states.md`) default to `collaboration/project-management-tool/` without needing a fresh placement decision each time.
- A doc that is primarily QA-process guidance (e.g., how to run a manual test suite, code-review checklist mechanics) still belongs in `quality-assurance/`; this ADL narrows only the "canonical state/readiness definition" category, it does not move QA content wholesale.
- No file moves required — `definition-of-ready-and-done.md` (root + dataset) and its docs-site mdx already live at the decided location; this ADL only records the rationale post-hoc, per the PR #340 review finding.

## Adoption Impact

- No adoption file changes required — this decision governs KB *content organization* (a directory-placement convention for future docs in this family), not a technical/process adoption fact tracked in `adoption/tech/*.md` or `adoption/product/*.md`. The KB doc itself (`collaboration/project-management-tool/definition-of-ready-and-done.md`) already exists at the decided path; no further file needs updating to reflect "what we use now."

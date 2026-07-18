# ADR-012: map-subdomains / map-contexts — Process Skill → Capability (D24)

## Status

Accepted

## Date

2026-07-07

## Context

- `/map-subdomains` and `/map-contexts` were `.skills/process/` skills, invoked as standalone lifecycle steps (how-to 04 "Define Subdomains", how-to 05 "Define Bounded Contexts") run once, upfront, after bootstrap and before epic breakdown.
- In practice, domain modeling is not a one-time upfront phase: new capability areas and bounded contexts surface continuously as `/plan-initiatives`, `/plan-epics`, `/refine-story`, and `/plan-tasks` touch new parts of the product and the system. A standalone process step has no natural re-entry point for "just the delta this caller touched" — it either re-runs the full catalog (wasteful, and drifts from what the caller actually needs validated) or is skipped entirely once the initial pass is done (the catalog silently goes stale).
- Skipped-entirely is what happened in practice: the how-to 04/05 workflow was never wired as a composed step into any of `/plan-initiatives`, `/plan-epics`, `/refine-story`, `/plan-tasks`, or `/bootstrap` — each would have had to remember to invoke it manually. Epic #203 (context map, DDR, analysis log) and story #246 exist specifically because this gap was identified.

## Options Considered

### Option 1: Keep as process skills, invoked manually when domain changes

- **Description**: No reclassification. Developers manually re-invoke `/map-subdomains`/`/map-contexts` whenever they judge the domain has shifted.
- **Pros**: No migration, no new invocation contract.
- **Cons**: No formal composition by any caller — exactly the gap this decision exists to close. Catalogs drift silently; there is no grep-verifiable claim that any skill keeps them current.

### Option 2: Inline the DDD/BC algorithm into each caller skill

- **Description**: Duplicate the classification/placement logic directly inside `/plan-initiatives`, `/plan-epics`, `/refine-story`, `/plan-tasks`, `/bootstrap`.
- **Pros**: No separate skill to compose or install.
- **Cons**: Duplicates a non-trivial algorithm (DDD classification, Volatility defaults, per-relationship strength/distance/volatility assessment) across 5+ skills; any future change to the algorithm requires editing all of them in lockstep; breaks the composition pattern already established by the `assess-*` capabilities.

### Option 3: Reclassify as capabilities, invoked scoped by each caller (chosen)

- **Description**: Move both skills to `.skills/capability/`. `$scope` becomes a **required** argument meaning "the items/areas the caller just touched" — never a full re-map by default. `$scope: all` (full-catalog) is permitted only when composed by `/bootstrap`, since it is the only caller with no prior touched-items context to scope to. Every other real caller (`/plan-initiatives`, `/plan-epics`, `/plan-tasks`; `/refine-story` planned — #242) composes the capability with its own scope, following the same pattern as `/bootstrap`'s composition of `/assess-stack`, `/assess-architecture`, etc.
- **Pros**: Single source of truth for the algorithm; catalogs update incrementally as a side effect of normal process-skill usage instead of a separate manual pass; consistent with the existing capability-composition pattern; idempotent partial catalogs (only `$scope` entries are touched) instead of forcing an all-or-nothing full re-map.
- **Cons**: Requires wiring every real caller explicitly — the wiring itself is separate work from the reclassification (this is the gap the #246 review found: the how-to text described callers that had no actual composition in their `SKILL.md`). `/refine-story`'s wiring is deferred to #242 rather than done here, to avoid colliding with that story's broader Draft→Ready rework.

## Decision

Adopt Option 3. `/map-subdomains` and `/map-contexts` are capabilities under `.skills/capability/`. `$scope` is required; `all` is permitted only when composed by `/bootstrap`. How-to guides 04 and 05 are removed — they described a standalone process step that no longer exists. Each real caller's own how-to (02 bootstrap, 03 initiatives, 06 epics, 09 tasks) now references the capability inline, at the point in its own algorithm where it composes it; `/refine-story`'s how-to (08) documents the wiring as planned (#242) rather than claiming it exists. The [Callers Matrix](../../../.pair/knowledge/skills-guide.md#callers-matrix-scoped-capabilities) in `skills-guide.md` is the single source of truth for which callers compose which capability, at what scope — every row that is not explicitly marked `(planned — #NNN)` is a verified composition, not an aspirational claim.

## Consequences

### Benefits

- Single source of truth for DDD/BC classification, Volatility defaults, and per-relationship strength/distance/volatility assessment — no caller re-implements it.
- Domain/context catalogs update incrementally as a side effect of `/plan-initiatives`, `/plan-epics`, `/plan-tasks`, and `/bootstrap` running normally — no separate manual pass to remember.
- Grep-verifiable claims: the Callers Matrix can be (and was) checked against each caller's `Composed Skills` table instead of trusted on faith.
- Graceful degradation (capability not installed) never blocks the composing process skill — domain modeling failures are non-fatal by design.

### Trade-offs and Limitations

- The reclassification alone does not wire anything — three real callers (`/bootstrap`, `/plan-epics`, `/plan-tasks`) had zero composition despite how-to 04/05 already describing them as callers before this decision's remediation; this ADR's Adoption Impact section lists the wiring done to close that gap as part of the same story.
- `/refine-story` wiring is intentionally deferred to #242, not done here — the Callers Matrix marks those two rows `(planned — #242)` rather than silently leaving them wrong.
- Full-catalog `$scope: all` at `/bootstrap` time uses whatever PRD/initiative context exists at that point in the bootstrap sequence; for `/map-contexts` this is after architecture.md and tech-stack.md are adopted (Phase 3.5, post Phase 3), since both are prerequisites.

## Adoption Impact

- `packages/knowledge-hub/dataset/.skills/process/map-subdomains/` → `packages/knowledge-hub/dataset/.skills/capability/map-subdomains/`; same rename for `map-contexts`.
- `packages/knowledge-hub/dataset/.skills/process/bootstrap/SKILL.md` — new Phase 3.5 composing `/map-subdomains` then `/map-contexts` with `$scope: all`.
- `packages/knowledge-hub/dataset/.skills/process/plan-epics/SKILL.md` — new Step 3.5 composing `/map-subdomains` scoped to the approved epic breakdown.
- `packages/knowledge-hub/dataset/.skills/process/plan-tasks/SKILL.md` — new Step 2.5 composing `/map-contexts` scoped to the story's touched bounded contexts.
- `packages/knowledge-hub/dataset/.pair/knowledge/how-to/04-how-to-define-subdomains.md`, `05-how-to-define-bounded-contexts.md` — removed.
- `packages/knowledge-hub/dataset/.pair/knowledge/how-to/02-*.md`, `03-*.md`, `06-*.md`, `08-*.md`, `09-*.md` — updated to reference the capability inline at the point their composing skill invokes it.
- `packages/knowledge-hub/dataset/.pair/knowledge/skills-guide.md` — Callers Matrix corrected to mark only genuinely unwired rows as `(planned — #NNN)`.
- `packages/knowledge-hub/dataset/.github/agents/product-manager.agent.md`, `staff-engineer.agent.md`, `AGENTS.md` — task tables no longer point to the removed how-to files.

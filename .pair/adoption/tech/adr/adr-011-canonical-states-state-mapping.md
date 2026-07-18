# ADR-011: Canonical States + n-m State-Mapping Schema

## Status

Accepted

## Date

2026-07-07

## Context

- pair skills (`/write-issue`, `/next`, and eventually the whole catalog) read and write work-item state on whatever PM tool board a project uses. Prior to this decision, skills embedded literal board-state labels directly (e.g., `/write-issue`'s `$status` examples listed `Refined`; `/next`'s cascade table matched on `"ready"`/`"todo"`/`"review"` string literals).
- Board vocabularies vary per project and per PM tool: GitHub Projects, Jira, Linear, and filesystem boards all use different column names. pair's own recommended GitHub Projects board itself deviates from generic naming (`Todo`, `Refined`, `In Progress`, `Review`, `Done`).
- Hardcoding board-state names in skill logic means every skill breaks (or silently misbehaves) the moment a project's board vocabulary differs — and makes skills unverifiable by grep for "does this skill assume a specific board".
- Epic #202 (Canonical states, n-m mapping, DoR/DoD) requires a single place where state semantics are defined and a resolution convention that all skills compose, so that minimal boards (e.g., `Todo`/`In Progress`/`Done`, no dedicated "Refined"/"Ready" column) work without extra configuration.

## Options Considered

### Option 1: Per-project skill customization

- **Description**: Projects fork or locally patch skill markdown to reference their own board-state names.
- **Pros**: No new schema to design or learn.
- **Cons**: Defeats the framework's update mechanism (adoption files are protected, but skills are knowledge-base content that gets overwritten on `pair update`); every project re-solves the same problem; violates the "skills never contain board state names" business rule outright.

### Option 2: 1-1 canonical renaming (projects must rename their board columns)

- **Description**: Require every project's board to use the 5 canonical names literally (`Draft`, `Ready`, `In Progress`, `Review`, `Done`); no mapping layer.
- **Pros**: Simplest possible resolution — no map to parse.
- **Cons**: Forces board renames on existing projects (migration cost, disruptive to established team habits), and can't represent legitimate n-m realities (e.g., two backlog columns that both mean "not yet refined", or a minimal 3-column board that has no dedicated "Ready" column at all).

### Option 3: Canonical macrostates + optional n-m state-mapping schema (chosen)

- **Description**: Define 5 canonical macrostates (`Draft`, `Ready`, `In Progress`, `Review`, `Done`) with their semantics in one KB guideline doc. Skills resolve state exclusively through an n-m map (`board-state → macrostate`) declared in an optional `## State Mapping` section of `way-of-working.md`. Omitted section ⇒ canonical names assumed (convention over configuration). Many board states may map to one macrostate; a board state never maps to more than one macrostate. Draft/Ready ambiguity on boards without a dedicated Ready column falls back to Definition-of-Ready criteria evaluated on the item.
- **Pros**: Zero configuration for projects that already use pair's names; existing/idiosyncratic boards (including pair's own GitHub Projects setup) keep their names and just add a small mapping table; skills become grep-verifiable for board-name hardcoding; minimal boards without a "Refined"/"Ready" column are supported via the readiness fallback instead of forcing every board to grow a column it doesn't need.
- **Cons**: Introduces a schema every skill author must learn and every skill that reads/writes state must adopt; adds one resolution step to `/write-issue`'s and `/next`'s algorithms; the Draft/Ready readiness fallback needs a Definition-of-Ready criteria set to be fully precise (tracked as a dependent story).

## Decision

Adopt Option 3. The KB guideline `packages/knowledge-hub/dataset/.pair/knowledge/guidelines/collaboration/project-management-tool/canonical-states.md` is the single source of truth for the 5 macrostates, their semantics, the state-mapping schema, and the read/write resolution rules (including first-mapped-wins for write targets and the readiness fallback for the Draft/Ready boundary). `way-of-working.md` gains an optional `## State Mapping` section, documented but left empty by default. `/write-issue` and `/next` are the first two skills to adopt the resolution convention; the rest of the skill catalog adopts it organically in the stories that touch each skill.

## Consequences

### Benefits

- Single source of truth for state semantics — no skill re-describes what "Ready" means.
- Zero-configuration default for projects using pair's own names; existing boards with different vocabularies (including pair's own) add a small table instead of renaming columns.
- `/write-issue` and `/next` no longer contain hardcoded board-state literals — grep-verifiable.
- Minimal boards (no dedicated Ready column) are explicitly supported via the readiness fallback rather than being an unsupported edge case.

### Trade-offs and Limitations

- `/write-issue`'s algorithm grew one step (state resolution before the board write); `/next`'s cascade table now requires readers to understand macrostate resolution instead of reading literal board-state strings.
- The readiness fallback currently relies on a minimal signal (acceptance criteria + technical analysis present); full Definition-of-Ready criteria are deferred to the dependent DoR/DoD story.
- pair's own GitHub Projects board (`Todo`/`Refined`/`In Progress`/`Review`/`Done`) now technically deviates from the canonical names and needs its own `state-mapping` entry in this repo's adoption `way-of-working.md` — tracked as a separate migration story, not applied here.

## Adoption Impact

- `packages/knowledge-hub/dataset/.pair/knowledge/guidelines/collaboration/project-management-tool/canonical-states.md` (new) — schema, semantics, resolution rules, examples.
- `packages/knowledge-hub/dataset/.pair/adoption/tech/way-of-working.md` — new optional `## State Mapping` section (documented, empty by default).
- `packages/knowledge-hub/dataset/.skills/capability/write-issue/SKILL.md` and `packages/knowledge-hub/dataset/.skills/next/SKILL.md` (+ distributed copies under `.claude/`, `.github/`, `.cursor/`, `.agent/`, `.agents/`, `.windsurf/skills/`) — adopt the resolution convention.
- This repo's own `.pair/adoption/tech/way-of-working.md` is **not** updated by this decision — migrating pair's own board (`Refined` → `Ready`) is deferred to the dependent migration-note story.

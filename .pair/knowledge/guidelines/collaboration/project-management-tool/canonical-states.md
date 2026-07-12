# Canonical States & State Mapping

## Overview

pair skills reason about work-item state using **5 canonical macrostates** — never board-specific labels. Every board (GitHub Projects, Jira, Linear, a 3-column Kanban) maps its own column/status names onto these 5 macrostates through an **n-m mapping** that lives in `way-of-working.md`. Skills read and write state exclusively through this map (or, when the section is absent, through the canonical names themselves).

This is the **one place** the macrostates and their semantics are defined. Skills, templates, and how-to guides reference this doc instead of re-describing state semantics.

## The 5 Canonical Macrostates

```text
Draft → Ready → In Progress → Review → Done
```

| Macrostate      | Meaning                                                             | Produced by                          |
| --------------- | -------------------------------------------------------------------- | ------------------------------------- |
| **Draft**       | Item exists but is not yet refined — missing AC, technical analysis, or estimate | `/plan-stories`, `/plan-epics`, `/plan-initiatives` (creation) |
| **Ready**       | Item meets the Definition of Ready — refined, estimated, eligible for sprint/WIP | `/refine-story` (Draft → Ready)       |
| **In Progress** | Item is actively being implemented                                   | `/implement`                          |
| **Review**      | Implementation is complete, awaiting code review / PR approval       | `/implement` (PR opened)              |
| **Done**        | Delivered and accepted — PR merged, issue closed                     | `/review` (merge step)                |

### Phase Semantics

- **Backlog** = `Draft` \| `Ready` — both refined and unrefined items live in the backlog.
- **Sprint / WIP** = `Ready` only — nothing enters a sprint or WIP column while still `Draft`.
- **Refinement produces `Ready`** — `/refine-story` is the single Draft→Ready transition; no separate "make-ready" skill exists.
- **Planning may promote `Draft` → `Ready` directly** — trivial items can skip full refinement when planning already satisfies the Definition of Ready.

## State-Mapping Schema

The mapping is **n-m**: many board states may map to one macrostate; a board state **never** maps to more than one macrostate (the inverse is not allowed — see Edge Cases).

### Section Format

An optional `## State Mapping` section in `way-of-working.md`, containing a two-column table:

```markdown
## State Mapping

| Board State | Macrostate  |
| ------------ | ----------- |
| <board-state-1> | <one of: Draft, Ready, In Progress, Review, Done> |
| <board-state-2> | <macrostate> |
```

- **Order matters for writes**: when a macrostate has multiple mapped board states, the **first listed wins** as the write target (see Resolution Rules).
- **Case-insensitive** matching of board-state literals.
- **Convention over configuration**: omit the section entirely when the board already uses the canonical names — a project using pair's own names writes nothing.

## Resolution Rules

These are the rules every skill follows when it needs to read or write item state — see `/write-issue` and `/next` for the concrete adoption (Integration with Skills, below).

### Reading state (board-state → macrostate)

1. Read the `## State Mapping` section in `way-of-working.md`, if present.
2. Look up the item's literal board-state value in the map (case-insensitive).
   - **Found** → use the mapped macrostate.
3. If the section is absent, or the board-state has no entry in it, fall back to **canonical-name matching**: treat the board-state literal as the macrostate if it case-insensitively equals one of the 5 canonical names.
4. If still unresolved, the board state is **unmapped** — ignore it for pair semantics. The skill proceeds without error; the item is simply out of scope for macrostate-based logic.

### Writing state (macrostate → board-state)

1. Determine the target macrostate for the transition (e.g., `/refine-story` targets `Ready`).
2. Find all board states mapped to that macrostate, in the order listed in the `## State Mapping` section.
3. Write to the **first mapped board state** (first-mapped-wins). To target a different board state, list it first in the map — map order is the override mechanism, not a separate config.
4. If the section is absent, write the macrostate name itself (canonical convention).
5. If **no board state maps to the target macrostate** (and the canonical name isn't a plausible board column either) → **HALT** and report the gap (e.g., "cannot move to Review — no board state mapped to Review") instead of guessing.

### Readiness Fallback (Draft vs. Ready ambiguity)

Some boards don't distinguish "not yet refined" from "refined" with a dedicated column (see Example 3) — structurally, no board state anywhere in the map is mapped to `Ready` at all. When a board can't distinguish `Draft` from `Ready` this way (no dedicated Ready column), skills needing readiness fall back to evaluating **Definition of Ready criteria** against the item's content (acceptance criteria present, technical analysis complete, etc.) instead of guessing from the board-state name.

- The **mapped state is always the primary signal** — DoR criteria are a fallback only for the Draft/Ready boundary, and only when no board state in the map resolves to `Ready`.
- Full DoR/DoD criteria are defined in the companion DoR/DoD guideline (tracked as a dependent story to this one) — until adopted, a minimal readiness signal (acceptance criteria present + technical analysis present) applies.

## Examples

### Example 1 — Omitted (canonical names)

Board columns are literally named `Draft`, `Ready`, `In Progress`, `Review`, `Done`.

No `## State Mapping` section needed — resolves 1:1 by the canonical-name convention. This is the zero-configuration default.

### Example 2 — GitHub Projects default (n-m, deviating names)

pair's own recommended GitHub Projects board uses `Todo` and `Refined` instead of the canonical `Draft`/`Ready`:

```markdown
## State Mapping

| Board State | Macrostate  |
| ------------ | ----------- |
| Todo         | Draft       |
| Refined      | Ready       |
| In Progress  | In Progress |
| Review       | Review      |
| Done         | Done        |
```

### Example 3 — Minimal board (no dedicated Ready column)

A 3-column Kanban board with no way to distinguish refined from unrefined backlog items:

```markdown
## State Mapping

| Board State | Macrostate  |
| ------------ | ----------- |
| Todo         | Draft       |
| In Progress  | In Progress |
| Done         | Done        |
```

`Ready` has no mapped board state. Items sitting in `Todo` that satisfy the Definition of Ready are treated as effectively `Ready` via the **Readiness Fallback** above — no dedicated board column is required for pair semantics to work.

### Example 4 — Custom n-m board

```markdown
## State Mapping

| Board State | Macrostate  |
| ------------ | ----------- |
| Icebox       | Draft       |
| Backlog      | Draft       |
| Up Next      | Ready       |
| Doing        | In Progress |
| Blocked      | In Progress |
| In Review    | Review      |
| Shipped      | Done        |
| Archived     | Done        |
```

Two board states map to `Draft` (`Icebox`, `Backlog`) and two to `In Progress` (`Doing`, `Blocked`) — valid n-m mapping. A write targeting `Draft` goes to `Icebox` (first listed); targeting `In Progress` goes to `Doing` (first listed).

### Example 5 — Azure Boards (Scrum process)

Azure Boards' default Scrum **states** for Product Backlog Items are `New`, `Approved`, `Committed`, `Done`, `Removed` — none of them is a "Review" state out of the box, and a board **column** alone cannot create one: `System.BoardColumn` only labels a visual bucket inside an existing state and is not something `az boards work-item update --state` can target (see [azure-devops-implementation.md](azure-devops-implementation.md)). Resolving a `Review` macrostate on this process takes one of three routes:

- **(a) Custom state** — add a state to the PBI work item type via an **inherited process** and map it below (this example assumes route (a): a state literally named `In Review` was added);
- **(b) Reuse an existing state** — map `Review` to `Committed` (or another existing state); the board column can still visually split that state into sub-columns for the team, but only one state — `Committed` — is actually written;
- **(c) Accept the gap** — leave `Review` unmapped and accept the HALT behavior described below.

```markdown
## State Mapping

| Board State | Macrostate  |
| ------------ | ----------- |
| New          | Draft       |
| Approved     | Ready       |
| Committed    | In Progress |
| In Review    | Review      |
| Done         | Done        |
```

The `Removed` state is deliberately **unmapped** — removed items are out of scope for pair semantics and ignored (partial mapping is allowed by the n-m schema). Without a state mapped to `Review` (route (a) or (b) above), `Review` would have no mapped board state and a write targeting it would HALT per the write rules (route (c)).

## Edge Cases and Error Handling

| Case                                                     | Behavior                                                                 |
| --------------------------------------------------------- | ------------------------------------------------------------------------ |
| Board state not present in the map                        | Ignored for pair semantics — skill proceeds without error                |
| Macrostate with no mapped board state, on a write request | Skill **HALTs** and reports the gap instead of guessing                  |
| Malformed mapping (unparseable table, or one board state listed under two macrostates) | Skill **HALTs** with a pointer to this doc's [State-Mapping Schema](#state-mapping-schema) |

## Integration with Skills

| Skill           | Interaction                                                                                          |
| ---------------- | ----------------------------------------------------------------------------------------------------- |
| `/write-issue`   | Resolves a target macrostate (`$status`) to a board state before writing the board field (Writing rule above) |
| `/next`          | Resolves each item's board state to a macrostate before evaluating its cascade conditions (Reading rule above); applies the Readiness Fallback for Draft vs. Ready |
| `/refine-story`  | Produces `Ready` — writes it through `/write-issue`                                                  |
| `/implement`     | Produces `In Progress` / `Review` — writes through `/write-issue`                                    |
| `/review`        | Produces `Done` on merge — writes through `/write-issue`                                             |

Rollout across the rest of the skill catalog happens organically in the stories that touch each skill — `/write-issue` and `/next` are the first adopters.

## Related

- [way-of-working.md](../../../../adoption/tech/way-of-working.md) — hosts the optional `## State Mapping` section
- [github-implementation.md](github-implementation.md) · [azure-devops-implementation.md](azure-devops-implementation.md) · [filesystem-implementation.md](filesystem-implementation.md) — PM tool status-field mechanics
- [decision-records.md](../decision-records.md) — ADR/ADL process (this schema was adopted via ADR)

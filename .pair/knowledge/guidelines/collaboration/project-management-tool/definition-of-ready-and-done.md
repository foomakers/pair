# Definition of Ready & Definition of Done

Companion to [canonical-states.md](canonical-states.md): that document defines the 5 macrostates (Draft → Ready → In Progress → Review → Done); this one defines the **criteria** that decide when an item earns `Ready` (Definition of Ready, R3.8) and when work on it counts as `Done` (Definition of Done, R3.9). Skills read this doc, not team habit, to answer "is it ready?" / "is it done?".

**Mapped state is always the primary signal** (see canonical-states.md's Readiness Fallback). The criteria below are the **fallback** — used only when no board state resolves to `Ready`, or when a skill needs to verify readiness directly from an item's body (e.g. a story predating this template). Never require both signals to agree: a mapped `Ready` state wins outright even if a DoR criterion below is technically unmet — report the gap as a warning, don't block (see Conflicting Signals below).

## Definition of Ready (R3.8)

Six criteria, each independently verifiable from one section of the [refined user-story template](../templates/user-story-template.md#refined-user-story-template):

| # | Criterion | Verifiable via (template section) |
| - | --- | --- |
| 1 | Clear title | Issue title — not a template placeholder |
| 2 | Problem/goal | `Story Statement` — As a / I want / So that filled in |
| 3 | Verifiable AC | `Acceptance Criteria` → at least one Given-When-Then scenario |
| 4 | Estimate | `Story Sizing and Sprint Readiness` → `Final Story Points` has a value |
| 5 | Dependencies | `Dependencies and Coordination` → `Story Dependencies` present (may state "None") |
| 6 | Design flag | `Technical Analysis` → `Implementation Approach` → `Design:` line, set to `not required` or `required — reference: <link>` |

A criterion is **unmet** when its section is missing, empty, or still holds template placeholder text (e.g. `[X points]`). On a partial DoR, list every unmet criterion by name — never guess readiness from a subset (see Edge Cases in the parent epic).

### Inline task-breakdown signal

A `## Task Breakdown` section with at least one checklist item (produced by `/pair-process-plan-tasks`, e.g. `- [ ] **T-1**: [Task title]` — the format in [task-template.md](../templates/task-template.md#task-breakdown-format-for-story-body)) is a first-class readiness signal in its own right (epic #202 addendum) — it shows the item has already been scoped and decomposed. When present, it independently satisfies criteria 3–5 above (AC, estimate, dependencies) even if their dedicated sections are missing or predate this template. It never substitutes for criterion 1 (title) or 2 (problem/goal) — every item needs those regardless of format.

### Legacy stories (predate this template)

An item written before this template exists (no `Design:` line, no inline Task Breakdown) degrades gracefully: report the *specific* missing criteria as not-ready reasons rather than a blanket failure. A refinement pass (`/pair-process-refine-story`) closes the gap; this document never requires a retroactive rewrite of old items just to keep working.

## Definition of Done (R3.9)

Four universal criteria. **Deployment is explicitly excluded** — a project may still gate deploys separately, but that gate is not part of this DoD:

| # | Criterion | Source |
| - | --- | --- |
| 1 | AC satisfied | every Acceptance Criteria scenario on the story verified against the diff |
| 2 | PR approved per risk tier | [quality-model.md § 4](../../quality-assurance/quality-model.md#4-per-tier-requirements) — 🟢 self-merge (0 reviewers), 🟡 1 reviewer, 🔴 1 reviewer + explicit approval |
| 3 | CI green | all automated gates passing on the merge commit |
| 4 | No critical bugs | no open critical/blocker defect tied to this change |

Per-tier reviewer counts, SLAs, and gate depth are **not duplicated here** — they live in [quality-model.md § 4](../../quality-assurance/quality-model.md#4-per-tier-requirements) and resolve through the same `Argument > Adoption > KB default` cascade as the rest of that model. Quality model unavailable (no risk tier computed) → criterion 2 degrades to the KB default tier (🔴, fail-safe per ADR-013), never to "unchecked."

**Skip already-passing criteria.** A checker (e.g. `/pair-capability-verify-done`) evaluates each of the 4 criteria once per session and never re-checks one already confirmed — e.g. it reuses `/pair-capability-verify-quality`'s CI result instead of re-running it.

## Readiness Fallback Walkthrough (board without a Ready state)

A 3-column board (`Todo` / `In Progress` / `Done`) has no state mapped to `Ready` (canonical-states.md's Minimal Boards example). An item sitting in `Todo`:

| Item state | DoR check result | Treated as |
| --- | --- | --- |
| All 6 criteria met | PASS | `Ready` (fallback applies) |
| 5/6 met, missing criterion 6 (Design flag) | FAIL — lists "Design flag" as the only gap | `Draft` — never guessed into `Ready` |
| No dedicated sections for criteria 3–5, but title/goal present and `## Task Breakdown` has items | PASS via inline-breakdown signal for 3–5 (criteria 1–2 still checked independently) | `Ready` |
| No dedicated sections, no Task Breakdown | FAIL — lists all missing criteria | `Draft` |

This is the mandatory D4 fallback scenario: a board with no dedicated "Refined"/Ready column still works, because readiness comes from the item's content instead of a column name. Note row 3: the inline-breakdown signal only ever covers criteria 3–5 — criteria 1 (title) and 2 (problem/goal) are always evaluated on their own, never inferred from the signal (see "Inline task-breakdown signal" above).

## Conflicting Signals

A board **does** map the item to `Ready`, but the DoR check on its body would otherwise fail: the mapped state wins outright — the item is `Ready`. The unmet criteria are reported as a warning (visibility for the team), never as a block. This case only matters when a skill inspects both signals in the same pass — normally the mapped state alone is sufficient (canonical-states.md's Reading rule).

## Related

- [canonical-states.md](canonical-states.md) — macrostates + n-m state-mapping this document is a companion to
- [user-story-template.md](../templates/user-story-template.md) — the 6 DoR criteria map 1:1 to its sections
- [quality-model.md](../../quality-assurance/quality-model.md) — per-tier DoD requirements (§4), risk tier resolution
- `/pair-capability-verify-done` — reads this document's DoD criteria plus per-tier requirements
- `/pair-process-plan-tasks` — produces the inline `## Task Breakdown` readiness signal

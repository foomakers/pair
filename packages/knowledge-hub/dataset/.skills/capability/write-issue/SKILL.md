---
name: write-issue
description: "Creates or updates an issue in the adopted PM tool from a type-specific template (bug, story, epic, etc.), including topical labels (e.g. tech-debt) for deliberate promotion. Invoke directly to create/update one issue on demand. Composed by /refine-story, /plan-tasks, /plan-initiatives, /plan-epics, /plan-stories."
version: 0.5.0
author: Foomakers
---

# /write-issue — PM Tool Issue Writer

Create or update issues in the adopted PM tool. Template-driven: reads the type-specific template, formats the issue body accordingly, and creates or updates via the PM tool API.

## Arguments

| Argument   | Required | Description                                                                                                                                                     |
| ---------- | -------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `$type`    | Yes      | Issue type: `story`, `task`, `epic`, or `initiative`. Determines which template is used. |
| `$content` | Yes      | Structured content to fill the template — fields map to template sections.                                                                                      |
| `$id`      | No       | Existing issue identifier. If provided → **update**; if absent → **create**.                                                                                    |
| `$parent`  | No       | Parent issue identifier for hierarchy linking (e.g., epic → story, story → task).                                                                               |
| `$status`  | No       | Target **macrostate** — one of `Draft`, `Ready`, `In Progress`, `Review`, `Done` (never a board-specific label). Resolved to the actual board state via the `state-mapping` resolution rule ([canonical-states.md](../../../.pair/knowledge/guidelines/collaboration/project-management-tool/canonical-states.md)) before the board field is updated. |
| `$labels`  | No       | Additional **topical** labels to apply alongside the type label, e.g. `tech-debt` when a debt or quality finding is promoted to the backlog deliberately. A list of label names (created if the PM tool supports it). |

## Algorithm

### Step 1: Validate Arguments

1. **Check**: Is `$type` one of the supported types (`story`, `task`, `epic`, `initiative`)?
2. **Skip**: If valid, proceed to Step 2.
3. **Act**: If unsupported type → **HALT**:

   > Unsupported issue type: `$type`. Supported: `story`, `task`, `epic`, `initiative`.

4. **Verify**: `$type` is valid.

### Step 2: Detect PM Tool

1. **Check**: Read [way-of-working.md](../../../.pair/adoption/tech/way-of-working.md) and identify the adopted PM tool.
2. **Skip**: If PM tool is identified, proceed to Step 3.
3. **Act**: If no PM tool configured → **HALT**:

   > No PM tool configured in `way-of-working.md`. Configure via `/setup-pm` or manually set the PM tool in [way-of-working.md](../../../.pair/adoption/tech/way-of-working.md).

4. **Verify**: PM tool identified (e.g., `github-projects`, `jira`, `linear`, `filesystem`).

### Step 3: Load Template

1. **Check**: Resolve template path based on `$type`:
   - `story` → [user-story-template.md](../../../.pair/knowledge/guidelines/collaboration/templates/user-story-template.md)
   - `task` → [task-template.md](../../../.pair/knowledge/guidelines/collaboration/templates/task-template.md)
   - `epic` → [epic-template.md](../../../.pair/knowledge/guidelines/collaboration/templates/epic-template.md)
   - `initiative` → [initiative-template.md](../../../.pair/knowledge/guidelines/collaboration/templates/initiative-template.md)
2. **Skip**: If template file found, proceed to Step 4.
3. **Act**: If template not found → **HALT**:

   > Template not found: `[template path]`. Ensure the knowledge base is installed.

4. **Verify**: The template file's section list is extracted and available to Step 4 — every section name in it has a corresponding slot to fill or omit.

### Step 4: Format Issue Body

1. **Check**: Does `$content` contain all required fields for the template?
2. **Act**: Fill the template sections with `$content` data:
   - Match `$content` fields to template sections.
   - Preserve template structure and section ordering.
   - Omit optional sections that have no content (do not leave empty placeholders).
3. **Verify**: Issue body is formatted following the template structure.

### Step 5: Load PM Tool Implementation Guide

1. **Check**: Resolve the PM tool implementation guide based on the adopted tool:
   - `github-projects` → [github-implementation.md](../../../.pair/knowledge/guidelines/collaboration/project-management-tool/github-implementation.md)
   - `filesystem` → [filesystem-implementation.md](../../../.pair/knowledge/guidelines/collaboration/project-management-tool/filesystem-implementation.md)
   - Other tools → use the tool-specific guide if available.
2. **Skip**: If guide found, proceed to Step 6.
3. **Act**: If guide not found, warn and proceed with best-effort PM tool interaction:

   > PM tool implementation guide not found for `[tool]`. Proceeding with default behavior.

4. **Verify**: Either the guide's steps for Step 7 are in hand, or the warning above was issued — one of the two always happened before proceeding.

### Step 6: Resolve `$status` to a Board State

Skills never write board-specific labels — `$status` is always a canonical macrostate (`Draft`, `Ready`, `In Progress`, `Review`, `Done`). Resolve it to a board state before touching the board field.

1. **Check**: Is `$status` provided?
2. **Skip**: If `$status` is absent, proceed to Step 7 — no board field update is requested.
3. **Act**: Resolve `$status` per [canonical-states.md](../../../.pair/knowledge/guidelines/collaboration/project-management-tool/canonical-states.md):
   - Read the `## State Mapping` section in [way-of-working.md](../../../.pair/adoption/tech/way-of-working.md), if present.
   - **Mapped**: find all board states mapped to the `$status` macrostate, in the order listed; target the **first listed** one.
   - **Omitted, or macrostate absent from the map**: target the macrostate name itself (canonical convention — no configuration needed).
4. **Act**: If the target macrostate has no mapped board state and the canonical name isn't a plausible board column either → **HALT**:

   > Cannot transition to `$status` — no board state is mapped to this macrostate. Add it to the `state-mapping` section or use a supported macrostate.

5. **Act**: If the `state-mapping` section is unparseable, or a board state is listed under more than one macrostate → **HALT**:

   > Malformed `state-mapping` in way-of-working.md. See [canonical-states.md](../../../.pair/knowledge/guidelines/collaboration/project-management-tool/canonical-states.md) for the schema.

6. **Verify**: A single resolved board state is available, or Step 7 proceeds with no board update.

### Step 7: Create or Update Issue

1. **Check**: Is `$id` provided?
   - **`$id` absent → Create mode**: Create a new issue in the PM tool.
   - **`$id` present → Update mode**: Verify the issue exists, then update it.
2. **Act (Create)**:
   - Create issue with the formatted body.
   - Apply labels based on `$type` (e.g., `user story`, `task`, `epic`, `initiative`), plus any topical labels in `$labels` (e.g. `tech-debt`).
   - If `$parent` is provided, link to parent issue (hierarchy: epic → story → task).
   - Configure project field settings (priority, type, status) per the implementation guide.
   - Record the new issue identifier for return.
3. **Act (Update)**:
   - Read the existing issue to confirm it exists.
   - If not found → **HALT**: `Issue #$id not found.`
   - Update the issue body with the formatted content — a **full-body overwrite**, not a merge/append: the body is replaced with what `$content` renders to. Callers that add to an existing body (EXTEND triage, plan-tasks Task Breakdown) must therefore pass the **already-merged full body**, not just the delta (see the Composition Interface below).
   - Preserve existing labels and hierarchy links unless explicitly changed.
   - If `$status` was provided, update the project board status field to the board state resolved in Step 6, per the implementation guide (e.g., GraphQL mutation for GitHub Projects). This is the **board field**, not the body text.
4. **Verify**: Issue created or updated successfully. If `$status` was provided, confirm the board field reflects the resolved board state.

### Step 8: Handle Errors

1. **Check**: Did the PM tool return an error during Step 7?
2. **Skip**: If no error, proceed to output.
3. **Act**: **HALT** with descriptive error:

   > PM tool error: `[error description]`. No fallback to alternative tools — resolve the issue with the adopted PM tool and re-invoke.

4. **Verify**: Error reported to developer.

## Output Format

```text
ISSUE WRITTEN:
├── Mode:     [Created | Updated]
├── Type:     [story | task | epic | initiative]
├── ID:       [issue identifier — e.g., #42]
├── PM Tool:  [adopted tool name]
├── Template: [template file used]
├── Parent:   [parent issue ID or "none"]
└── Status:   [Success | HALT — reason]
```

**Return value**: The issue identifier (e.g., `#42`) — used by composing skills in chain operations.

## Example: Creating a Task Issue

Input — `/plan-tasks` composes this skill with:

```text
$type: task
$content:
  title: "T3 — Sharpen Verify beats across the 8 assess-* skills"
  bounded_context: "Adoption & Guidelines"
  description: "Rewrite the shared 'Guidelines and context loaded' Verify beat into a checkable condition, per T2's completion-criteria principle."
  acceptance_criteria: "Every assess-* Step 2 Verify beat references the specific files read and the Graceful Degradation fallback."
$parent: #313
```

Output — since `$id` is absent, Step 7 creates a new issue from [task-template.md](../../../.pair/knowledge/guidelines/collaboration/templates/task-template.md) with `$content` mapped into the template's sections, linked to parent `#313`, labeled `task`:

```text
ISSUE WRITTEN:
├── Mode:     Created
├── Type:     task
├── ID:       #341
├── PM Tool:  github-projects
├── Template: task-template.md
├── Parent:   #313
└── Status:   Success
```

Return value: `#341`, which `/plan-tasks` records in the story's Task Breakdown checklist.

## Composition Interface

When composed by `/refine-story`:

- **Input**: `/refine-story` invokes `/write-issue` with `$type: story`, `$content` containing the refined story data, `$id` when updating an existing story, and `$status: Ready` to transition the board field.
- **Output**: Returns the issue identifier. `/refine-story` uses it for linking.

When composed by `/plan-tasks`:

- **Input**: `/plan-tasks` invokes `/write-issue` with `$type: story`, `$id: [story-id]`, and `$content` = the story's current full body with the Task Breakdown section merged in by the caller (`/write-issue` overwrites the body as-is, it does not append). Tasks are documented inline in the story body — no separate task issues are created.
- **Output**: Returns the story issue identifier. `/plan-tasks` confirms the update.

When composed by `/plan-initiatives`:

- **Input**: `/plan-initiatives` invokes `/write-issue` with `$type: initiative` and `$content` containing the initiative data. Passes `$id` when updating an existing initiative.
- **Output**: Returns the issue identifier. `/plan-initiatives` uses it for linking and status tracking.

When composed by `/plan-epics`:

- **Input**: `/plan-epics` invokes `/write-issue` with `$type: epic`, `$content` containing the epic data, and `$parent` linking to the parent initiative. For an `EXTEND` triage outcome (see [to-issues-triage.md](../../../.pair/knowledge/skill-conventions/to-issues-triage.md)), it instead passes `$id` of the matched epic and `$content` as the matched epic's current full body with the additional scope already merged in by the caller — `/write-issue` overwrites the body as-is, it does not merge.
- **Output**: Returns the issue identifier. `/plan-epics` uses it for linking stories.

When composed by `/plan-stories`:

- **Input**: `/plan-stories` invokes `/write-issue` with `$type: story`, `$content` containing the story data, and `$parent` linking to the parent epic. For an `EXTEND` triage outcome (see [to-issues-triage.md](../../../.pair/knowledge/skill-conventions/to-issues-triage.md)), it instead passes `$id` of the matched story and `$content` as the matched story's current full body with the additional scope already merged in by the caller — `/write-issue` overwrites the body as-is, it does not merge.
- **Output**: Returns the issue identifier. `/plan-stories` uses it for status tracking.

When invoked **independently**:

- Interactive: create or update an issue directly in the adopted PM tool.
- All arguments must be provided (or prompted interactively).
- Returns the issue identifier.

## HALT Conditions

- **Unsupported `$type`** (Step 1) — lists currently supported types.
- **No PM tool configured** (Step 2) — directs to configuration.
- **Template not found** (Step 3) — missing knowledge base file.
- **Target macrostate has no mapped board state** (Step 6) — reports the gap instead of guessing.
- **Malformed `state-mapping` section** (Step 6) — points to canonical-states.md.
- **`$id` provided but issue not found** (Step 7) — issue does not exist.
- **PM tool error** (Step 8) — no fallback, descriptive error reported.

## Extensibility

This skill supports `story`, `task`, `epic`, and `initiative` types. Adding a new type requires: (1) a new template file in `collaboration/templates/`, (2) a new entry in Step 1 validation, (3) a new entry in Step 3 template resolution, (4) a new entry in the Composition Interface section.

## Graceful Degradation

See [graceful degradation](../../../.pair/knowledge/skill-conventions/graceful-degradation.md) for the standard scenarios — this skill deliberately **overrides the default degrade behavior with a HALT** for its two load-bearing dependencies:

- PM tool not configured/accessible, or the template file missing → **HALT** (no fallback — this skill's entire job is writing to the PM tool via a template).
- If the PM tool implementation guide is not found, warn and proceed with default behavior (a genuine degrade, not a HALT).
- If `way-of-working.md` has no `## State Mapping` section, canonical macrostate names are assumed for board writes — this is the zero-configuration default, not a degradation.

## Notes

- This skill **modifies PM tool state** — it creates and updates issues.
- No PM tool fallback: if the adopted tool fails, the skill HALTs. **Idempotent** — see [idempotency convention](../../../.pair/knowledge/skill-conventions/idempotency.md): `$id` prevents duplicate creation on re-invocation.
- Template = source of truth for issue body format. Changes to template structure automatically affect all future issue creation.
- Labels and hierarchy linking follow the PM tool implementation guide conventions.
- **Deliberate tech-debt promotion**: assess-* skills are output-only and never auto-create backlog items. When a debt or quality finding is worth scheduling, a human/agent promotes it here **deliberately** by passing `tech-debt` in `$labels` — a manual, selective act, never a 100% auto-conversion.

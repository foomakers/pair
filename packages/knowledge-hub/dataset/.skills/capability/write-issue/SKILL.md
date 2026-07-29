---
name: write-issue
description: "Creates or updates an issue in the adopted PM tool from a type-specific template (bug, story, epic, etc.), including topical labels (e.g. tech-debt) for deliberate promotion; `$mode: comment` posts a comment on an existing item without touching its body (the non-destructive cross-link path). Invoke directly to create/update one issue on demand. Composed by /refine-story, /plan-tasks, /plan-initiatives, /plan-epics, /plan-stories, /publish-pr."
version: 0.6.1
author: Foomakers
---

# /write-issue — PM Tool Issue Writer

Create or update issues in the adopted PM tool. Template-driven: reads the type-specific template, formats the issue body accordingly, and creates or updates via the PM tool API.

**PM tool only — never the code host.** Every write here is a backlog-item write (body, labels, hierarchy, board state, comments), so this skill reads `pm-tool` and nothing else. Pull requests, reviews and merges belong to the code host and are **never** written from here; when a project declares a separate `code-host`, the only thing that crosses over is the cross-link — `/publish-pr` composes this skill in **comment mode** (`$mode: comment`) to post the **PR URL back onto the PM item**. See the [routing table](../../../.pair/knowledge/guidelines/technical-standards/ai-development/skill-conventions/way-of-working-pm-resolution.md).

## Arguments

| Argument   | Required | Description                                                                                                                                                     |
| ---------- | -------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `$mode`    | No       | `write` (default) — create/update the item **body** from a template. `comment` — post a **comment** on an existing item and touch nothing else (the non-destructive path used for cross-links). |
| `$type`    | Yes (write mode) | Issue type: `story`, `task`, `epic`, or `initiative`. Determines which template is used. Not required — and ignored — in `comment` mode. |
| `$content` | Yes (write mode) | Structured content to fill the template — fields map to template sections. Not used in `comment` mode. |
| `$comment` | Yes (comment mode) | Verbatim comment text to post on the item (e.g. `PR: https://github.com/acme/platform/pull/412`). Never template-rendered, never merged into the body. |
| `$id`      | No       | Existing issue identifier. If provided → **update**; if absent → **create**. **Required in `comment` mode** (there is nothing to comment on otherwise). |
| `$parent`  | No       | Parent issue identifier for hierarchy linking (e.g., epic → story, story → task).                                                                               |
| `$status`  | No       | Target **macrostate** — one of `Draft`, `Ready`, `In Progress`, `Review`, `Done` (never a board-specific label). Resolved to the actual board state via the `state-mapping` resolution rule ([canonical-states.md](../../../.pair/knowledge/guidelines/collaboration/project-management-tool/canonical-states.md)) before the board field is updated. |
| `$labels`  | No       | Additional **topical** labels to apply alongside the type label, e.g. `tech-debt` when a debt or quality finding is promoted to the backlog deliberately. A list of label names (created if the PM tool supports it). |

## Algorithm

### Step 1: Validate Arguments

1. **Check**: Which mode is this? `$mode` defaults to `write`.
2. **Act (`$mode: comment`)**: `$type` and `$content` are **not** required and are ignored. Require `$id` and `$comment`; if either is missing → **HALT**: `comment mode requires $id and $comment.` Then go to Step 2 and continue at **Step 7c** (Steps 3, 4 and 6 do not run — no template, no body render, no board write).
3. **Check (`$mode: write`)**: Is `$type` one of the supported types (`story`, `task`, `epic`, `initiative`)?
4. **Skip**: If valid, proceed to Step 2.
5. **Act**: If unsupported type → **HALT**:

   > Unsupported issue type: `$type`. Supported: `story`, `task`, `epic`, `initiative`.

6. **Verify**: The mode is resolved, and either `$type` is valid (write mode) or `$id` + `$comment` are present (comment mode).

### Step 2: Detect PM Tool

1. **Check**: Read [way-of-working.md](../../../.pair/adoption/tech/way-of-working.md) and identify the adopted PM tool.
2. **Skip**: If PM tool is identified, proceed to Step 3.
3. **Act**: If no PM tool configured → **HALT**:

   > No PM tool configured in `way-of-working.md`. Configure via `/setup-pm` or manually set the PM tool in [way-of-working.md](../../../.pair/adoption/tech/way-of-working.md).

4. **Verify**: PM tool identified (e.g., `github-projects`, `jira`, `linear`, `filesystem`).

### Step 3: Load Template (write mode only)

1. **Check**: Resolve the template path for `$type` **override-first** — see [template resolution](../../../.pair/knowledge/guidelines/technical-standards/ai-development/skill-conventions/template-resolution.md) (adoption `.pair/adoption/tech/templates/<name>-template.md` wins over the KB default below):
   - `story` → [user-story-template.md](../../../.pair/knowledge/guidelines/collaboration/templates/user-story-template.md)
   - `task` → [task-template.md](../../../.pair/knowledge/guidelines/collaboration/templates/task-template.md)
   - `epic` → [epic-template.md](../../../.pair/knowledge/guidelines/collaboration/templates/epic-template.md)
   - `initiative` → [initiative-template.md](../../../.pair/knowledge/guidelines/collaboration/templates/initiative-template.md)
2. **Skip**: If template file found, proceed to Step 4.
3. **Act**: If template not found → **HALT**:

   > Template not found: `[template path]`. Ensure the knowledge base is installed.

4. **Verify**: The template file's section list is extracted and available to Step 4 — every section name in it has a corresponding slot to fill or omit.

### Step 4: Format Issue Body (write mode only)

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
   - `azure-devops` → [azure-devops-implementation.md](../../../.pair/knowledge/guidelines/collaboration/project-management-tool/azure-devops-implementation.md)
   - `linear` → [linear-implementation.md](../../../.pair/knowledge/guidelines/collaboration/project-management-tool/linear-implementation.md)
   - Other tools → use the tool-specific guide if available.
2. **Skip**: If guide found, proceed to Step 6.
3. **Act**: If guide not found, warn and proceed with best-effort PM tool interaction:

   > PM tool implementation guide not found for `[tool]`. Proceeding with default behavior.

4. **Verify**: Either the guide's steps for Step 7 are in hand, or the warning above was issued — one of the two always happened before proceeding.

### Step 6: Resolve `$status` to a Board State (write mode only)

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
   - Update the issue body with the formatted content — in **write mode** (`$mode: write`) this is a **full-body overwrite**, not a merge/append: the body is replaced with what `$content` renders to. Callers that add to an existing body (EXTEND triage, plan-tasks Task Breakdown) must therefore pass the **already-merged full body**, not just the delta (see the Composition Interface below). Comment mode (Step 7c) never reaches here and never writes the body.
   - Preserve existing labels and hierarchy links unless explicitly changed.
   - If `$status` was provided, update the project board status field to the board state resolved in Step 6, per the implementation guide (e.g., GraphQL mutation for GitHub Projects). This is the **board field**, not the body text.
4. **Verify**: Issue created or updated successfully. If `$status` was provided, confirm the board field reflects the resolved board state.

### Step 7c: Post a Comment (`$mode: comment`)

The **non-destructive** path: it appends a comment to the item and writes nothing else — no template is loaded, no body is rendered, the existing body and labels are left byte-identical, and no board field is touched. This is how a cross-link (the PR URL) reaches a PM item without overwriting the story's AC/DoD/task breakdown.

**Comment mode is append-only, therefore NOT self-deduplicating**: unlike write mode (where `$id` makes a re-run an update), a comment has no identity, so every invocation appends one. A caller that can legitimately re-run — the fix→re-publish loop, or a HALT recovery — must therefore do the **Check** itself (does the item already carry a comment with this content?) before composing this mode; `/publish-pr` Phase 4 step 5 is the reference implementation.

1. **Act**: Post `$comment` verbatim on item `$id`, using the comment mechanism **documented by** the implementation guide resolved in Step 5 (each guide below carries the call; never invent an API):
   - `linear` → `commentCreate` GraphQL mutation ([linear-implementation.md](../../../.pair/knowledge/guidelines/collaboration/project-management-tool/linear-implementation.md#comment-on-an-issue-cross-link-back-link))
   - `github-projects` → `gh issue comment <id> --body "<comment>"` ([github-implementation.md](../../../.pair/knowledge/guidelines/collaboration/project-management-tool/github-implementation.md#comment-on-an-issue-cross-link-back-link))
   - `azure-devops` → the work-item comments endpoint ([azure-devops-implementation.md](../../../.pair/knowledge/guidelines/collaboration/project-management-tool/azure-devops-implementation.md#comment-on-a-work-item-cross-link-back-link))
   - `filesystem` → append a dated bullet under the item file's `## Activity Log` section, creating that section at the end of the file when absent ([filesystem-implementation.md](../../../.pair/knowledge/guidelines/collaboration/project-management-tool/filesystem-implementation.md#comments-on-an-item-activity-log)). This is the one tool where the item **is** a file, so how the guarantee reads here: the append touches `## Activity Log` and nothing else — every other section (statement, AC, DoD, task breakdown), the file name and the file's **directory** (which is its board state) are left exactly as they were.
   - A tool whose guide documents **no comment mechanism** but does document a link/URL field → write the value into that field instead. **No supported tool needs this branch today** (all four above document a comment call); it exists for a tracker adopted through a project's own override guide, and only when that guide documents such a field. Neither documented → warn (next step) rather than improvising a write.
2. **Act — exceptions to this skill's HALTs (comment mode only):** a comment is an **additive annotation, never load-bearing work**, so failures here **warn, they do not HALT** — the caller's own artifact (the PR) is already valid and must not be invalidated by a missing annotation:
   - `$id` **not found** ⇒ **warn** (`Item $id not found — post the link manually: <comment>`) and return a `warned` result. Step 7's `Issue #$id not found.` HALT does **not** apply in comment mode.
   - Any **PM tool error** ⇒ **warn** with the same manual-link instruction and return `warned`. Step 8's HALT does **not** apply in comment mode.
3. **Verify**: Either the comment exists on the item, or the warning + manual instruction was surfaced — and in both cases the item body, labels and board state are unchanged.

### Step 8: Handle Errors

1. **Check**: Did the PM tool return an error during Step 7?
2. **Skip**: If no error, proceed to output. **Comment mode is exempt** — its failures were already handled as warnings in Step 7c.2 and never reach here.
3. **Act**: **HALT** with descriptive error:

   > PM tool error: `[error description]`. No fallback to alternative tools — resolve the issue with the adopted PM tool and re-invoke.

4. **Verify**: Error reported to developer.

## Output Format

```text
ISSUE WRITTEN:
├── Mode:     [Created | Updated | Commented | Comment warned — manual link needed]
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

- **Input**: `/refine-story` invokes `/write-issue` with `$type: story`, `$content` containing the refined story data, `$id` when updating an existing story, and `$status: Ready` to transition the board field **when a board state maps to the `Ready` macrostate**; when none does (a minimal board, D4), `/refine-story` omits `$status` — the DoR-on-body readiness signal applies and no board field is written (this skill's Step 6.2 no-ops on absent `$status`).
- **Output**: Returns the issue identifier. `/refine-story` uses it for linking.

When composed by `/plan-tasks`:

- **Input**: `/plan-tasks` invokes `/write-issue` with `$type: story`, `$id: [story-id]`, and `$content` = the story's current full body with the Task Breakdown section merged in by the caller (`/write-issue` overwrites the body as-is, it does not append). Tasks are documented inline in the story body — no separate task issues are created.
- **Output**: Returns the story issue identifier. `/plan-tasks` confirms the update.

When composed by `/plan-initiatives`:

- **Input**: `/plan-initiatives` invokes `/write-issue` with `$type: initiative` and `$content` containing the initiative data. Passes `$id` when updating an existing initiative.
- **Output**: Returns the issue identifier. `/plan-initiatives` uses it for linking and status tracking.

When composed by `/plan-epics`:

- **Input**: `/plan-epics` invokes `/write-issue` with `$type: epic`, `$content` containing the epic data, and `$parent` linking to the parent initiative. For an `EXTEND` triage outcome (see [to-issues-triage.md](../../../.pair/knowledge/guidelines/technical-standards/ai-development/skill-conventions/to-issues-triage.md)), it instead passes `$id` of the matched epic and `$content` as the matched epic's current full body with the additional scope already merged in by the caller — `/write-issue` overwrites the body as-is, it does not merge.
- **Output**: Returns the issue identifier. `/plan-epics` uses it for linking stories.

When composed by `/plan-stories`:

- **Input**: `/plan-stories` invokes `/write-issue` with `$type: story`, `$content` containing the story data, and `$parent` linking to the parent epic. For an `EXTEND` triage outcome (see [to-issues-triage.md](../../../.pair/knowledge/guidelines/technical-standards/ai-development/skill-conventions/to-issues-triage.md)), it instead passes `$id` of the matched story and `$content` as the matched story's current full body with the additional scope already merged in by the caller — `/write-issue` overwrites the body as-is, it does not merge.
- **Output**: Returns the issue identifier. `/plan-stories` uses it for status tracking.

When composed by `/publish-pr` (the cross-link back-link, split PM-tool/code-host projects):

- **Input**: `/publish-pr` invokes `/write-issue` with `$mode: comment`, `$id: <issue-id>` (the PM tool's own item id, verbatim) and `$comment: "PR: <pr-url>"` — no `$type`, no `$content`, no `$status`. Only the comment is written: the story body (AC, DoD, task breakdown) is never re-rendered or overwritten.
- **Output**: `Commented`, or `Comment warned` with the manual-link instruction when the id doesn't resolve or the PM tool errors (Step 7c.2). Either way `/publish-pr` keeps the PR — a back-link failure never fails the publish, which is why comment mode warns instead of HALTing.
- Only invoked when `code-host` differs from `pm-tool`; on a single-tool project the host links PR and item natively, so `/publish-pr` skips this composition.
- **Dedup is the caller's**: `/publish-pr` first checks whether the item already carries a comment holding this PR URL and skips the composition if so, because comment mode cannot dedupe itself (Step 7c). Without that check a re-publish would accrete one `PR: <url>` comment per round.

When invoked **independently**:

- Interactive: create or update an issue directly in the adopted PM tool.
- All arguments must be provided (or prompted interactively).
- Returns the issue identifier.

## HALT Conditions

- **Unsupported `$type`** (Step 1, write mode) — lists currently supported types.
- **`comment` mode without `$id` or `$comment`** (Step 1) — nothing to comment on.
- **No PM tool configured** (Step 2) — directs to configuration.
- **Template not found** (Step 3) — missing knowledge base file.
- **Target macrostate has no mapped board state** (Step 6) — reports the gap instead of guessing.
- **Malformed `state-mapping` section** (Step 6) — points to canonical-states.md.
- **`$id` provided but issue not found** (Step 7) — issue does not exist. **Not a HALT in `comment` mode** — warn with the manual-link instruction (Step 7c.2).
- **PM tool error** (Step 8) — no fallback, descriptive error reported. **Not a HALT in `comment` mode** — warn (Step 7c.2).

## Extensibility

This skill supports `story`, `task`, `epic`, and `initiative` types. Adding a new type requires: (1) a new template file in `collaboration/templates/`, (2) a new entry in Step 1 validation, (3) a new entry in Step 3 template resolution, (4) a new entry in the Composition Interface section.

## Graceful Degradation

See [graceful degradation](../../../.pair/knowledge/guidelines/technical-standards/ai-development/skill-conventions/graceful-degradation.md) for the standard scenarios — this skill deliberately **overrides the default degrade behavior with a HALT** for its two load-bearing dependencies:

- PM tool not configured/accessible, or the template file missing → **HALT** (no fallback — this skill's entire job is writing to the PM tool via a template).
- If the PM tool implementation guide is not found, warn and proceed with default behavior (a genuine degrade, not a HALT).
- If `way-of-working.md` has no `## State Mapping` section, canonical macrostate names are assumed for board writes — this is the zero-configuration default, not a degradation.

## Notes

- This skill **modifies PM tool state** — it creates and updates issues, and posts comments on them. It never touches code-host state (branches, PRs, reviews).
- **Comment mode is deliberately narrow**: one verbatim comment on one existing item, no template, no body write, no board write, warn-not-HALT on failure. It exists so a cross-link (or any additive annotation) never risks the item's body — the destructive full-body overwrite is write mode's contract alone.
- No PM tool fallback: if the adopted tool fails, the skill HALTs. **Idempotent in write mode** — see [idempotency convention](../../../.pair/knowledge/guidelines/technical-standards/ai-development/skill-conventions/idempotency.md): `$id` prevents duplicate creation on re-invocation. **Comment mode is the documented exception**: a comment carries no `$id` of its own, so nothing here can dedupe it — re-invocation appends another comment, and the duplicate-check belongs to the caller (Step 7c).
- Template = source of truth for issue body format. Changes to template structure automatically affect all future issue creation.
- Labels and hierarchy linking follow the PM tool implementation guide conventions.
- **Deliberate tech-debt promotion**: assess-* skills are output-only and never auto-create backlog items. When a debt or quality finding is worth scheduling, a human/agent promotes it here **deliberately** by passing `tech-debt` in `$labels` — a manual, selective act, never a 100% auto-conversion.

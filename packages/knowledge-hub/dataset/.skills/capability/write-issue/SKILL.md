---
name: write-issue
description: >-
  Creates or updates issues in the adopted PM tool using template-driven
  formatting. Reads way-of-working for tool choice and type-specific templates
  for body structure. Invocable independently or composed by /refine-story and
  /plan-tasks.
---

# /write-issue — PM Tool Issue Writer

Create or update issues in the adopted PM tool. Template-driven: reads the type-specific template, formats the issue body accordingly, and creates or updates via the PM tool API.

## Arguments

| Argument   | Required | Description                                                                                                                                                     |
| ---------- | -------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `$type`    | Yes      | Issue type: `story` or `task`. Determines which template is used. (Future: `epic`, `initiative` added in [#103](https://github.com/foomakers/pair/issues/103).) |
| `$content` | Yes      | Structured content to fill the template — fields map to template sections.                                                                                      |
| `$id`      | No       | Existing issue identifier. If provided → **update**; if absent → **create**.                                                                                    |
| `$parent`  | No       | Parent issue identifier for hierarchy linking (e.g., epic → story, story → task).                                                                               |

## Algorithm

### Step 1: Validate Arguments

1. **Check**: Is `$type` one of the supported types (`story`, `task`)?
2. **Skip**: If valid, proceed to Step 2.
3. **Act**: If unsupported type → **HALT**:

   > Unsupported issue type: `$type`. Currently supported: `story`, `task`. Types `epic` and `initiative` are added in [#103](https://github.com/foomakers/pair/issues/103).

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
2. **Skip**: If template file found, proceed to Step 4.
3. **Act**: If template not found → **HALT**:

   > Template not found: `[template path]`. Ensure the knowledge base is installed.

4. **Verify**: Template loaded and parsed.

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

4. **Verify**: Implementation guide loaded (or warning issued).

### Step 6: Create or Update Issue

1. **Check**: Is `$id` provided?
   - **`$id` absent → Create mode**: Create a new issue in the PM tool.
   - **`$id` present → Update mode**: Verify the issue exists, then update it.
2. **Act (Create)**:
   - Create issue with the formatted body.
   - Apply labels based on `$type` (e.g., `user story`, `task`).
   - If `$parent` is provided, link to parent issue (hierarchy: epic → story → task).
   - Configure project field settings (priority, type, status) per the implementation guide.
   - Record the new issue identifier for return.
3. **Act (Update)**:
   - Read the existing issue to confirm it exists.
   - If not found → **HALT**: `Issue #$id not found.`
   - Update the issue body with the formatted content.
   - Preserve existing labels and hierarchy links unless explicitly changed.
4. **Verify**: Issue created or updated successfully.

### Step 7: Handle Errors

1. **Check**: Did the PM tool return an error during Step 6?
2. **Skip**: If no error, proceed to output.
3. **Act**: **HALT** with descriptive error:

   > PM tool error: `[error description]`. No fallback to alternative tools — resolve the issue with the adopted PM tool and re-invoke.

4. **Verify**: Error reported to developer.

## Output Format

```text
ISSUE WRITTEN:
├── Mode:     [Created | Updated]
├── Type:     [story | task]
├── ID:       [issue identifier — e.g., #42]
├── PM Tool:  [adopted tool name]
├── Template: [template file used]
├── Parent:   [parent issue ID or "none"]
└── Status:   [Success | HALT — reason]
```

**Return value**: The issue identifier (e.g., `#42`) — used by composing skills in chain operations.

## Composition Interface

When composed by `/refine-story`:

- **Input**: `/refine-story` invokes `/write-issue` with `$type: story` and `$content` containing the refined story data. Passes `$id` when updating an existing story.
- **Output**: Returns the issue identifier. `/refine-story` uses it for status updates and linking.

When composed by `/plan-tasks`:

- **Input**: `/plan-tasks` invokes `/write-issue` with `$type: story`, `$id: [story-id]`, and `$content` containing the Task Breakdown section to append. Tasks are documented inline in the story body — no separate task issues are created.
- **Output**: Returns the story issue identifier. `/plan-tasks` confirms the update.

When invoked **independently**:

- Interactive: create or update an issue directly in the adopted PM tool.
- All arguments must be provided (or prompted interactively).
- Returns the issue identifier.

## HALT Conditions

- **Unsupported `$type`** (Step 1) — lists currently supported types.
- **No PM tool configured** (Step 2) — directs to configuration.
- **Template not found** (Step 3) — missing knowledge base file.
- **`$id` provided but issue not found** (Step 6) — issue does not exist.
- **PM tool error** (Step 7) — no fallback, descriptive error reported.

## Extensibility

This skill currently supports `story` and `task` types. Additional types are planned:

- `epic` and `initiative` types added in [#103](https://github.com/foomakers/pair/issues/103) when strategic planning skills need them.
- Adding a new type requires: (1) a new template file, (2) a new entry in Step 1 validation, (3) a new entry in Step 3 template resolution.

## Graceful Degradation

- If [way-of-working.md](../../../.pair/adoption/tech/way-of-working.md) is not found, HALT — PM tool is required.
- If the template file is not found, HALT — template-driven formatting is mandatory.
- If the PM tool implementation guide is not found, warn and proceed with default behavior.
- If the PM tool is not accessible (auth failure, rate limit, network), HALT with descriptive error — no fallback.

## Notes

- This skill **modifies PM tool state** — it creates and updates issues.
- No PM tool fallback: if the adopted tool fails, the skill HALTs. The developer resolves the issue, then re-invokes (idempotent by design — `$id` prevents duplicate creation).
- Template = source of truth for issue body format. Changes to template structure automatically affect all future issue creation.
- Labels and hierarchy linking follow the PM tool implementation guide conventions.

---
name: write-issue
description: "Creates or updates an issue in the adopted PM tool from a type-specific template (bug, story, epic, etc.), including topical labels (e.g. tech-debt) for deliberate promotion; `$mode: comment` posts a comment on an existing item without touching its body (the non-destructive cross-link path). Invoke directly to create/update one issue on demand. Composed by /refine-story, /plan-tasks, /plan-initiatives, /plan-epics, /plan-stories, /publish-pr."
version: 0.10.0
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
| `$status`  | No       | Target **macrostate** — one of `Draft`, `Ready`, `In Progress`, `Review`, `Done` (never a board-specific label). Resolved to the actual board state via the `state-mapping` resolution rule ([canonical-states.md](../../../.pair/knowledge/guidelines/collaboration/project-management-tool/canonical-states.md)) before the board field is updated. **Ignored in `comment` mode** (Step 6 and the board write never run — comment mode touches no board field). |
| `$labels`  | No       | Additional **topical** labels to apply alongside the type label, e.g. `tech-debt` when a debt or quality finding is promoted to the backlog deliberately. A list of label names (created if the PM tool supports it). **Ignored in `comment` mode** (Step 7.2 never runs — labels are left byte-identical). |
| `$assignee` | No      | Who the item is **assigned to** — a login/identifier the PM tool accepts. Resolved through the cascade in Step 6b (the argument first, then the adoption default, then none) and written **as part of the create and of the update, never as a follow-up step**. Absent or unresolvable ⇒ the item is still written, unassigned, with a warning. **Ignored in `comment` mode** (an existing item's assignee is never touched by a comment). |

**In `comment` mode only `$id` and `$comment` are read**; `$type`, `$content`, `$status`, `$labels`, `$assignee` and `$parent` are ignored — passing one is a caller mistake, never a partial write.

## Algorithm

### Step 1: Validate Arguments

1. **Check**: Which mode is this? `$mode` defaults to `write`.
2. **Act (`$mode: comment`)**: `$type` and `$content` are **not** required and are ignored. Require `$id` and `$comment`; if either is missing → **HALT**: `comment mode requires $id and $comment.` Then go to Step 2 and continue at **Step 7c** (Steps 3, 4, 6, 6b and 7b do not run — no template, no body render, no assignee resolution, no board write).
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

**Two different outcomes, deliberately** — the HALT in 4 is *not* the minimal-board case, and conflating them makes one of the two wrong:

- **`$status` was requested and no board state can express it** ⇒ the **HALT** above (route (c) in [canonical-states.md](../../../.pair/knowledge/guidelines/collaboration/project-management-tool/canonical-states.md)). The caller asked for a transition this board cannot represent; doing nothing quietly would be exactly the silent success this skill must never report.
- **The board simply has no state for that macrostate** (a minimal board, D4 — e.g. no `Ready` column) ⇒ the caller **omits `$status`**, and the **state field** write is **skipped as documented behaviour, not an error**: no board field is written and **readiness falls back to the item body** (the Readiness Fallback in canonical-states.md — Definition-of-Ready criteria evaluated against the item). Reported as the membership Step 7b confirmed with no state written, or as `Board: n-a` where there is no tracked view to be a member of — never as a state that was written.

**Membership is not part of this choice.** Both outcomes above are about the **state field**; whether the item is *on the board at all* is resolved in Step 7b independently of `$status` (see its preamble). Omitting `$status` never means "leave the item off the board".

### Step 6b: Resolve the Assignee (write mode only)

The board is read **filtered by assignee**, so an item with no assignee is invisible there even when it is open, green and carries a PR (the Assignment rule in [way-of-working.md](../../../.pair/adoption/tech/way-of-working.md)). This step resolves **who**; the field or flag that actually writes it belongs to the implementation guide resolved in Step 5 — **never invent one**: one rule stated here, every mechanic in its adapter.

1. **Check**: Resolve the assignee in one order — **the argument first, then the adoption default, then none**:
   - `$assignee`, when the caller passed one;
   - else the adoption's `default-assignee` — [way-of-working.md](../../../.pair/adoption/tech/way-of-working.md) → `## Assignment` (schema and cascade: [way-of-working / PM-tool + code-host resolution](../../../.pair/knowledge/guidelines/technical-standards/ai-development/skill-conventions/way-of-working-pm-resolution.md)). This is a **PM-tool** write, so it reads that key and never `code-host-assignee` — the split-configuration key belongs to the code-host branch of the same cascade (`/publish-pr`, the PR assignee). **An empty value is absent, not an empty-string assignee.**
   - else none.
2. **Act (resolved)**: carry it into Step 7 and write it **as part of the create and of the update, never as a follow-up step**.
3. **Act (nothing resolved, or the tool rejects what was resolved)**: **write the item without an assignee and warn** — **never a HALT**:

   > Item written without an assignee — it will be **invisible in an assignee-filtered view**. Pass `$assignee`, or declare `default-assignee` under `## Assignment` in way-of-working.md.

   An item created and half-visible beats an item not created, so this bookkeeping field **never sinks the item**. A **rejected** assignee (not a collaborator, typo, deactivated account) takes this same branch: report what the tool answered and **never drop it silently**.
4. **Act — never the authenticated user.** The default comes from the declared adoption field, not from whoever is running the command: an agent running under a **bot token** would assign every item to the bot, satisfying the letter of the Assignment rule while defeating its purpose.
5. **Verify**: either an assignee is resolved and carried into Step 7, or the warning above was surfaced — and in both cases the item is still written.

### Step 7: Create or Update Issue

**Two invariants govern every write from here on**, stated once and never restated per tool:

- **Membership precedes state.** A board state field only exists on an item the tracked view actually holds, so the order is always membership → confirmation → state (Step 7b), never state first. Whether membership is a separate call *at all* is per-tool — each adapter declares it in its `### Item Visibility: Membership and Assignee` section (`Board membership is explicit` on GitHub Projects, `implicit` on Azure Boards, Linear and a filesystem backlog) — so the invariant lives here and **the mechanics stay in the adapters**.
- **No write is assumed.** A tracker can report success for a write that never happened: `gh project item-add` **exits 0 without creating the item** (observed three times on the real tracker, 2026-08-04 — a second, identical invocation created it). So **every write is re-read back**, and what this skill reports is what the read observed, never what the call returned. **A write that cannot be confirmed by a read is a failure or a finding, never a silent success.**

1. **Check**: Is `$id` provided?
   - **`$id` absent → Create mode**: Create a new issue in the PM tool.
   - **`$id` present → Update mode**: Verify the issue exists, then update it.
2. **Act (Create)**:
   - Create issue with the formatted body.
   - Apply labels based on `$type` (e.g., `user story`, `task`, `epic`, `initiative`), plus any topical labels in `$labels` (e.g. `tech-debt`).
   - If `$parent` is provided, link to parent issue (hierarchy: epic → story → task).
   - Configure project field settings — priority, type, assignee (status via Step 7b) — per the implementation guide: the assignee is the one resolved in Step 6b, set on the create call itself, and the board state is **never** written here.
   - **Creating does not imply membership**: on an explicit-membership tool the new issue is not a board item yet. **Step 7b therefore runs on every create** — membership first, confirmed by a read — and it is what puts the item on the board; the state field is written there too, but only when Step 6 resolved one. A create never writes the state field here.
   - Record the new issue identifier for return, then **re-read the created item** and report the assignee and labels the read observed (a create is a write, so the invariant above applies to it too).
3. **Act (Update)**:
   - Read the existing issue to confirm it exists.
   - If not found → **HALT**: `Issue #$id not found.`
   - Update the issue body with the formatted content — in **write mode** (`$mode: write`) this is a **full-body overwrite**, not a merge/append: the body is replaced with what `$content` renders to. Callers that add to an existing body (EXTEND triage, plan-tasks Task Breakdown) must therefore pass the **already-merged full body**, not just the delta (see the Composition Interface below). That contract is also what makes a comment durable where the item **is** a file: on `filesystem` the back-link lives in the body's `## Activity Log` section, so a later write-mode render preserves it only because the caller read-merges the current body first — dropping the section is a caller bug, not an accepted behavior. Comment mode (Step 7c) never reaches here and never writes the body.
   - Preserve existing labels and hierarchy links unless explicitly changed.
   - Apply the assignee resolved in Step 6b **conditionally**: write it when the caller passed `$assignee` **explicitly**, or when the read above shows the item currently has **no** assignee. Otherwise **leave the existing assignee untouched** — an item deliberately assigned to someone else must not be reassigned as a side effect of a body update (the adoption default would otherwise silently pull every updated item back to the maintainer and out of that person's filtered view — the same invisibility failure, inverted). Resolved to none ⇒ leave whatever assignee the item already has; never clear one. Whether the adapter's call **adds** to or **replaces** the assignee set is the adapter's concern, documented in its guide — this skill states only which value applies and when.
   - **Step 7b runs on every update too**, **not only when `$status` was provided**: an item that already exists may still never have been added to the tracked view (it was filed before the board, or an earlier add exited 0 having done nothing), so membership is established and confirmed there on this path as well. The board field itself — when Step 6 resolved a state — is written in **Step 7b** (membership → confirm → state), never here: this step writes the item, not the board.
4. **Verify**: The item was created or updated **and re-read**: the read shows the body, the labels and the assignee now in effect. Report the labels the read observed on the `Labels` output row — a label the tracker dropped or refused is a **finding**, never an assumed success. Step 7b runs next and owns the board — membership on **every** write-mode write, the state field only when Step 6 resolved one.

### Step 7b: Board Membership, then the Board State (write mode)

The order is **membership, then a read that confirms it, then the state field**. A state field cannot be written on an item the tracked view does not hold, and the add that puts it there cannot be trusted to have worked.

**Membership is not a consequence of `$status`.** The membership beats (1 to 4) **run on every write-mode write** when the adoption names a tracked view for the PM tool — **always on a create** (an issue is not a board item yet) and **equally on an update**, because an existing item may never have been added — whether or not a board state was requested; the state-field beats (5 to 6) run **only when Step 6 resolved a board state**. The reason is the shape of the failure: on an explicit-membership tool an issue and a board item are distinct objects, so an item filed with **no** `$status` — a follow-up task, a promoted tech-debt finding, a story planned ahead of its sprint — would be open, assigned, green and **absent from the board**. That is the most common path of all, and it is the invisibility this contract exists to remove. The update path is not the safe half: `/refine-story` writes `Draft → Ready` on a story that already exists and may have been filed before the board existed, and an update with **no** `$status` is precisely the repair path for an item found off the board — scoping these beats to creates would leave both uncovered. On an **implicit**-membership tool there is nothing to add and the membership beats collapse to the read in 1.

1. **Check — is the item already in the tracked view?** Read it per the implementation guide resolved in Step 5. On an implicit-membership tool there is nothing to add and this collapses to that read; on an explicit-membership tool (GitHub Projects — an issue and a project item are distinct objects) a missing item takes the next step. **No tracked view is named in the adoption** ⇒ there is no membership to establish and no state to write: report `Board: n-a (no tracked view)` and return.
2. **Act — add the membership.** The adapters document the add as idempotent, so it is safe to run unconditionally: an item that is already a member is a no-op, never a duplicate.
3. **Act — re-read to confirm it exists.** The add's **exit status is not evidence**: `gh project item-add` was observed exiting 0 with nothing created, and the identical second invocation created it. So confirm by reading the item back out of the view, and retry the add **once** when that read is negative.
4. **Act — the read is still negative** ⇒ **HALT**:

   > Board membership not established — item `$id` **could not be confirmed** as a member of `[view]` after adding it (`[tool's last response]`); no board state was written either. The item itself exists and is off the board: add it to the view manually, or re-invoke. A skipped board write is **never reported as success**.

5. **Act — write the state field**, **only when Step 6 resolved one**, to the board state it resolved, per the implementation guide (e.g. the GraphQL mutation for GitHub Projects). This is the **board field**, never body text. **No board state was resolved** (no `$status` was passed) ⇒ stop here and report the membership the read in 3 confirmed, with **no state written** — the item is on the board, its column is whatever the tool's own default is, and nothing claims otherwise.
6. **Act — read the field back** and report the value the read returned. **A read-back that does not match the target is a failure**, not a success: report it as one rather than trusting the mutation's own response.
7. **Verify**: the board field, read back, equals the board state resolved in Step 6; or — when no state was requested — membership is confirmed by the read in 3 and reported as such; or one of the two failure paths above was reported.

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
3. **Verify — by a read, like every other write here**: **read the item's comments back** (the `## Activity Log` section on `filesystem`) and confirm the posted text is there. A post is a write, so its exit status is not evidence: a call that exits 0 having posted nothing must be reported as `Comment warned — manual link needed`, **never as `Commented`** (the caller's own dedup read would otherwise find no comment and post again next round, which is the symptom, not the fix). Either the read shows the comment, or the warning + manual instruction was surfaced — and in both cases the item body, labels and board state are unchanged.

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
├── Type:     [story | task | epic | initiative | n-a (comment mode)]
├── ID:       [issue identifier — e.g., #42]
├── PM Tool:  [adopted tool name]
├── Template: [template file used | n-a (comment mode)]
├── Parent:   [parent issue ID | "none" | n-a (comment mode)]
├── Labels:   [type label + topical labels — confirmed by read | dropped by tracker: label — finding | n-a (comment mode)]
├── Assignee: [login — confirmed by read | unchanged: login — confirmed by read | none — WARNING: invisible in an assignee-filtered view | n-a (comment mode)]
├── Board:    [board state — confirmed by read | member of <view> — confirmed by read; no state written (no $status) | n-a (no tracked view) | n-a (implicit membership; no $status, or no board state maps to the macrostate — readiness falls back to the item body) | HALT — reason]
└── Status:   [Success | HALT — reason]
```

The `Board` row reports **membership and state separately** on purpose: an item can be a confirmed member of the tracked view with no state written (the create path, no `$status`), and a row that could only say "state" or `n-a` would render that item as absent from a board it is on.

Every value on the `Labels`, `Assignee` and `Board` rows is what a **read** returned, not what a call reported — the three rows exist in this shape because a write reported as done and never confirmed is how items ended up open, green and off the board. `/publish-pr` reports its own PR-side writes on the same shape (its `Tags:` row), so the two writers stay symmetric on one invariant.

In **comment mode** the five `n-a (comment mode)` values are the specified rendering, not an omission — one reason per row: no `$type` is taken, no template is resolved, no hierarchy is touched, no label is written and no assignee is touched, so there is nothing to report on those rows (`Status: Success` on a posted comment, or the warning text from Step 7c.2).

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

Output — since `$id` is absent, Step 7 creates a new issue from [task-template.md](../../../.pair/knowledge/guidelines/collaboration/templates/task-template.md) with `$content` mapped into the template's sections, linked to parent `#313`, labeled `task`, and assigned to the adoption's `default-assignee` (no `$assignee` was passed — Step 6b). No `$status` was passed, so Step 7b still runs its **membership** beats — GitHub Projects is an explicit-membership tool, and a create that stopped here would file an issue that is not a board item — and stops before the state field, which nothing requested:

```text
ISSUE WRITTEN:
├── Mode:     Created
├── Type:     task
├── ID:       #341
├── PM Tool:  github-projects
├── Template: task-template.md
├── Parent:   #313
├── Labels:   task — confirmed by read
├── Assignee: rucka — confirmed by read
├── Board:    member of Pair Backlog — confirmed by read; no state written (no $status)
└── Status:   Success
```

Return value: `#341`, which `/plan-tasks` records in the story's Task Breakdown checklist.

## Composition Interface

When composed by `/refine-story`:

- **Input**: `/refine-story` invokes `/write-issue` with `$type: story`, `$content` containing the refined story data, `$id` when updating an existing story, and `$status: Ready` to transition the board field **when a board state maps to the `Ready` macrostate**; when none does (a minimal board, D4), `/refine-story` omits `$status` — the DoR-on-body readiness signal applies and no board field is written (this skill's Step 6.2 no-ops on absent `$status`). This is the composition `$status` exists for: the same call renders the **full body**, so write mode is the right route for it. **Omitting is the caller's job, not this skill's**: once `$status` arrives here it has been *requested*, and Step 6.4 can only HALT (route (c)) — this skill cannot tell "requested and unmappable" from "never requested" after the fact, which is exactly why the D4 minimal-board skip is expressed as an omission by the caller.
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

When composed by `/implement` (the task-progress feedback loop, [task-progress-feedback.md](../../../.pair/knowledge/guidelines/collaboration/project-management-tool/task-progress-feedback.md)):

- **Input, per task (the tick)**: `$type: story`, `$id: [story-id]`, `$content` = the story's **current full body with exactly one checklist line patched** (`[ ]` → `[x]`) by the caller. The same read-merge contract `/plan-tasks` is held to, applied to a single line: this skill overwrites the body with what it is given, so a caller that re-renders instead of patching destroys the story's AC/DoD/task breakdown. `/implement` diff-checks its own patch before composing here, and abandons a write whose diff is not one checkbox-only line.
- **Input, once per invocation (the batch)**: `$mode: comment`, `$id: [story-id]`, `$comment` = the rendered progress batch. No `$type`, no `$content`, no `$status` — the body is not touched by the flush.
- **Output**: the issue identifier (tick) / `Commented` or `Comment warned` (batch). **Neither failure is load-bearing**: `/implement` records the outcome in its batch and continues the story. Comment mode already warns instead of HALTing; a failed tick is likewise never a HALT for this caller.
- **Dedup is the caller's**, as for every comment-mode composition: the tick is naturally idempotent (an already-`[x]` item is not re-written at all), and the batch is posted exactly once per invocation by construction.

When composed by `/publish-pr` (the cross-link back-link, split PM-tool/code-host projects):

- **Input**: `/publish-pr` invokes `/write-issue` with `$mode: comment`, `$id: <issue-id>` (the PM tool's own item id, verbatim) and `$comment: "PR: <pr-url>"` — no `$type`, no `$content`, no `$status`. Only the comment is written: the story body (AC, DoD, task breakdown) is never re-rendered or overwritten.
- **Output**: `Commented`, or `Comment warned` with the manual-link instruction when the id doesn't resolve or the PM tool errors (Step 7c.2). Either way `/publish-pr` keeps the PR — a back-link failure never fails the publish, which is why comment mode warns instead of HALTing.
- Only invoked when `code-host` differs from `pm-tool`; on a single-tool project the host links PR and item natively, so `/publish-pr` skips this composition.
- **Dedup is the caller's**: `/publish-pr` first checks whether the item already carries a comment holding this PR URL and skips the composition if so, because comment mode cannot dedupe itself (Step 7c). Without that check a re-publish would accrete one `PR: <url>` comment per round.
- **The board state is not a composition of this skill** — the comment above is `/publish-pr`'s **only** one. Its Phase 4 step 7 **writes the board field directly**, applying Step 7b **by reference** (membership → a read that confirms it → the state field) and resolving `## State Mapping` itself; when no board state maps to `Review` it writes no state field at all. The reason it must not come through here: write mode is a **full-body overwrite**, so routing a state-only change through it would replace the story's AC/DoD/task breakdown — and a caller reaching for write mode with no `$content` HALTs on the missing `$type` instead, reporting a board that is never updated. A state-only change is never this skill's write mode, whoever the caller is.

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
- **Board membership could not be confirmed** by the re-read after adding it (Step 7b) — the item is off the board, and a skipped board write is never reported as success. Fires whenever a tracked view is named, `$status` or not (membership does not depend on a requested state). **Not** the minimal-board case (Step 6), which is a documented skip of the **state field** only.
- **`$id` provided but issue not found** (Step 7) — issue does not exist. **Not a HALT in `comment` mode** — warn with the manual-link instruction (Step 7c.2).
- **PM tool error** (Step 8) — no fallback, descriptive error reported. **Not a HALT in `comment` mode** — warn (Step 7c.2).

## Extensibility

This skill supports `story`, `task`, `epic`, and `initiative` types. Adding a new type requires: (1) a new template file in `collaboration/templates/`, (2) a new entry in Step 1 validation, (3) a new entry in Step 3 template resolution, (4) a new entry in the Composition Interface section.

## Graceful Degradation

See [graceful degradation](../../../.pair/knowledge/guidelines/technical-standards/ai-development/skill-conventions/graceful-degradation.md) for the standard scenarios — this skill deliberately **overrides the default degrade behavior with a HALT** for its two load-bearing dependencies:

- PM tool not configured/accessible, or the template file missing → **HALT** (no fallback — this skill's entire job is writing to the PM tool via a template).
- If the PM tool implementation guide is not found, warn and proceed with default behavior (a genuine degrade, not a HALT).
- **No assignee resolvable** (no `$assignee`, no `default-assignee`, or the tool rejects the one resolved) → write the item **unassigned** and warn (Step 6b) — a genuine degrade, never a HALT. The item is then invisible in an assignee-filtered view, which is why the warning names that consequence rather than reporting a bare success.
- If `way-of-working.md` has no `## State Mapping` section, canonical macrostate names are assumed for board writes — this is the zero-configuration default, not a degradation.

## Notes

- This skill **modifies PM tool state** — it creates and updates issues, and posts comments on them. It never touches code-host state (branches, PRs, reviews).
- **No write is assumed** (Step 7): every write here is re-read back, because a tracker can return success for a write that did not happen. The rule is general on purpose — the concrete bug was `gh project item-add` exiting 0 with nothing created, but the class is "trusted the exit status", and only the read closes it.
- **Comment mode is deliberately narrow**: one verbatim comment on one existing item, no template, no body write, no board write, warn-not-HALT on failure. It exists so a cross-link (or any additive annotation) never risks the item's body — the destructive full-body overwrite is write mode's contract alone.
- No PM tool fallback: if the adopted tool fails, the skill HALTs. **Idempotent in write mode** — see [idempotency convention](../../../.pair/knowledge/guidelines/technical-standards/ai-development/skill-conventions/idempotency.md): `$id` prevents duplicate creation on re-invocation. **Comment mode is the documented exception**: a comment carries no `$id` of its own, so nothing here can dedupe it — re-invocation appends another comment, and the duplicate-check belongs to the caller (Step 7c).
- Template = source of truth for issue body format. Changes to template structure automatically affect all future issue creation.
- Labels and hierarchy linking follow the PM tool implementation guide conventions.
- **Deliberate tech-debt promotion**: assess-* skills are output-only and never auto-create backlog items. When a debt or quality finding is worth scheduling, a human/agent promotes it here **deliberately** by passing `tech-debt` in `$labels` — a manual, selective act, never a 100% auto-conversion.

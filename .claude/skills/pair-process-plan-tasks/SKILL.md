---
name: pair-process-plan-tasks
description: "Breaks a refined user story into implementation tasks — checklist, dependency graph, AC-coverage table — added to the story body; no separate task issues are created. Composes /pair-capability-write-issue."
version: 0.4.1
author: Foomakers
---

# /pair-process-plan-tasks — Task Breakdown

Transform a refined user story into specific, actionable implementation tasks. Task-level idempotency: detects existing tasks in the story body and creates only missing ones. Adds an integrated Technical Analysis + Task Breakdown section to the story issue body (the skill composes the full updated body; write-issue overwrites it, it does not append). Tasks live inside the story — no separate task issues are created in the PM tool.

## Composed Skills

| Skill          | Type       | Required                                                   |
| -------------- | ---------- | ---------------------------------------------------------- |
| `/pair-capability-write-issue` | Capability | Yes — updates the story issue body with the Task Breakdown section |
| `/pair-capability-map-contexts` | Capability | Optional — scoped context mapping for the story's touched bounded contexts. Graceful degradation if absent. |

## Arguments

| Argument | Required | Description                                                                                              |
| -------- | -------- | -------------------------------------------------------------------------------------------------------- |
| `$story` | No       | Story identifier (e.g., `#42`). If omitted, selects the highest-priority Refined story from the backlog. |

## Algorithm

### Step 0: Story Selection

1. **Check**: Is `$story` provided?
2. **Skip**: If provided, load the story from the PM tool and proceed to Step 1.
3. **Act**: If not provided, query the PM tool for stories in Refined state. Apply selection criteria:
   - **Priority**: P0 > P1 > P2
   - **Sprint need**: stories required for upcoming sprint
   - **Dependency chain**: stories unblocking other work
4. **Act**: Present recommendation and ask developer to confirm:

   > Recommend task breakdown for Story `#[ID]: [Title]` (Priority: [P0/P1/P2]).
   > Reason: [business value / sprint urgency / unblocks other work].
   > Proceed?

5. **Verify**: A story is identified (from `$story` or developer confirmation) and its full body is available for Step 1's task-state detection.

### Step 1: Detect Existing Tasks

1. **Check**: Read the story body. Look for a `## Task Breakdown` section with task entries (`- [ ] **T-N**:` or `- [x] **T-N**:`).
2. **Act**: Classify the state:
   - **No Task Breakdown section** → full breakdown needed (Steps 2–6).
   - **Partial tasks** (some T-N entries but gaps in AC coverage) → resume from first missing task (Steps 3–6).
   - **All tasks present with full AC coverage** → already complete. Offer selective update (Step 7).
3. **Verify**: Task state determined. Report:

   > Task state: [N existing tasks covering M/K ACs]. [Full breakdown | Resume from T-X | Already complete — offering update].

### Step 2: Technical Context Analysis

**Skip if**: Story body already contains Technical Analysis section.

1. **Act**: Analyze the story requirements against adoption files:
   - Read [architecture.md](../../../.pair/adoption/tech/architecture.md) for architectural patterns.
   - Read [tech-stack.md](../../../.pair/adoption/tech/tech-stack.md) for implementation choices.
   - Map story to [bounded contexts](../../../.pair/adoption/tech/boundedcontext).
2. **Act**: Present technical context summary to developer for validation.
3. **Verify**: Developer approves. Context established.

### Step 2.5: Context Mapping (scoped)

1. **Check**: Is `/pair-capability-map-contexts` installed?
2. **Skip**: If not installed → warn and proceed to Step 3 without context mapping.
3. **Act**: Compose `/pair-capability-map-contexts` with `$scope` set to the bounded contexts/services touched by this story (from Step 2's mapping) — not `all` — full-catalog remapping stays `/pair-process-bootstrap`-only.
4. **Verify**: Bounded context catalog delta (if any) approved by developer. Task breakdown always proceeds to Step 3 regardless of the context-mapping outcome.

### Step 3: Task Identification

1. **Act**: Decompose the story into tasks by mapping acceptance criteria to implementation work:
   - Map each AC to one or more tasks.
   - Group tasks by bounded context.
   - Identify task types: Development, Documentation, Configuration, Research.
   - Ensure every AC is covered by at least one task.
2. **Act**: Identify dependencies between tasks and determine execution order.
3. **Act**: Present task list to developer:

   > Proposed [N] tasks for `#[ID]`:
   > [Numbered list with task title, type, bounded context, estimated hours]
   > AC coverage: [all ACs mapped]
   > Approve or adjust?

4. **Verify**: Developer approves. Task list finalized.

### Step 4: Task Definition

For each task (skipping tasks that already exist in the story body):

1. **Act**: Define the task following the [task-template.md](../../../.pair/knowledge/guidelines/collaboration/templates/task-template.md) (resolve override-first — [template resolution](../../../.pair/knowledge/guidelines/technical-standards/ai-development/skill-conventions/template-resolution.md)):
   - Task Information (ID, priority, hours, bounded context)
   - Summary and type
   - Description with implementation context
   - Acceptance criteria (deliverable, quality, integration, verification)
   - Implementation approach (design, modules, files, standards)
   - Dependencies (technical, task, resource)
   - Implementation steps
   - Testing strategy
2. **Verify**: Each task is complete and self-contained.

### Step 5: Assemble Task Breakdown Section

1. **Act**: Build the complete Task Breakdown section for the story body:
   - **Condensed Technical Analysis**: Keep strategy summary, data flow/pipeline order, key risks. Remove verbose detail.
   - **Task checklist**: `- [ ] **T-N**: [Title]` for each task.
   - **Dependency Graph**: ASCII block showing task dependencies (see [task-template.md](../../../.pair/knowledge/guidelines/collaboration/templates/task-template.md) Task Breakdown Format).
   - **AC Coverage table**: Maps each AC to covering tasks.
   - **Detailed tasks**: Full task definition per task (from Step 4).

   Section ordering in the story body: Technical Analysis and Task Breakdown are the last content sections (after Notes, before footer).

2. **Verify**: All ACs covered. Dependency graph consistent with task dependencies. No orphan tasks.

### Step 6: PM Tool Update

1. **Act**: Compose `/pair-capability-write-issue` with `$type: story`, `$id: [story-id]`, and `$content` = the story's current full body with the Task Breakdown section merged in (`/pair-capability-write-issue` overwrites the body as-is, it does not append). Tasks are always documented inline in the story body.
2. **Verify**: Story body updated with Task Breakdown section.

### Step 7: Already-Complete Update (optional path)

Reached only when Step 1 detects all tasks are present with full AC coverage.

1. **Act**: Ask the developer what to update:

   > Story `#[ID]` already has a complete task breakdown. What needs updating?
   > 1. Add new tasks (new AC or scope change)
   > 2. Modify existing task definitions
   > 3. Update dependency graph
   > 4. Full re-breakdown

2. **Act**: For selected option, re-execute the corresponding steps.
3. **Act**: Compose `/pair-capability-write-issue` with `$type: story`, `$id: [story-id]`, and updated content.
4. **Verify**: Story updated.

## Output Format

```text
TASK BREAKDOWN COMPLETE:
├── Story:      [#ID: Title]
├── Tasks:      [N tasks created]
├── Types:      [Development: N, Documentation: N, Configuration: N]
├── AC Coverage:[K/K ACs covered]
├── PM Tool:    [Story updated with Task Breakdown section]
└── Next:       /implement to start task execution
```

## HALT Conditions

- **No Refined stories in backlog** (Step 0) — nothing to break down.
- **Story not found or not Refined** (Step 0) — must be refined first (suggest `/pair-process-refine-story`).
- **PM tool not accessible** — cannot read or update stories.
- **Developer rejects task list** (Step 3) — must resolve before proceeding.
- **AC coverage gap** (Step 5) — every AC must be covered by at least one task.

## Graceful Degradation

See [graceful degradation](../../../.pair/knowledge/guidelines/technical-standards/ai-development/skill-conventions/graceful-degradation.md) (optional skill `/pair-capability-write-issue` not installed / PM tool not accessible → produce the task breakdown content, ask developer to update manually) for the standard scenarios. Additional cases:

- If adoption files (architecture, tech-stack, bounded contexts) are not found, skip technical context alignment and warn.

## Notes

- This skill **modifies PM tool state** — it updates the story body with the Task Breakdown section. No separate task issues are created.
- **Idempotent (task-level)** — see [idempotency convention](../../../.pair/knowledge/guidelines/technical-standards/ai-development/skill-conventions/idempotency.md). This skill's check: re-invoking on a story with partial tasks adds only the missing ones (the caller composes the full updated body; write-issue overwrites it).
- Condensed TA removes verbose implementation detail that belongs in individual tasks (retained items: see Step 5).
- Story template reference: [user-story-template.md](../../../.pair/knowledge/guidelines/collaboration/templates/user-story-template.md).

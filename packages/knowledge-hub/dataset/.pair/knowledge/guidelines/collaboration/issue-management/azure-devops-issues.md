# Azure DevOps Work Items

Azure Boards work item workflow and configuration for comprehensive issue management integrated with project tracking.

## Overview

This guide covers Azure Boards work item management for initiatives, epics, user stories, tasks, and bugs within the pair development framework. Tool setup and authentication live in [azure-devops-implementation.md](../project-management-tool/azure-devops-implementation.md).

## Work Item Types

pair item types map to Azure Boards work item types:

| pair Type  | Scrum Process        | Agile Process | Notes                              |
| ---------- | -------------------- | ------------- | ---------------------------------- |
| Initiative | Epic                 | Epic          | Strategic objective                |
| Epic       | Feature              | Feature       | Feature set under an initiative    |
| User Story | Product Backlog Item | User Story    | Deliverable increment              |
| Task       | Task                 | Task          | Implementation step under a story  |
| Bug        | Bug                  | Bug           | Defect — test-first workflow applies |

Inherited processes with custom type names override this table in `way-of-working.md` — see [Custom Work Item Types](../project-management-tool/azure-devops-implementation.md#custom-work-item-types-inherited-process).

## Creating Work Items

> **The authoritative create recipe is the adapter's.** Every create below carries `--assigned-to`, because a work item without an assignee is open, green — and invisible in the assignee-filtered board view the team reads. The full mechanics (membership is implicit here, but the **area path** still decides whether the team's board shows the item; what to do when the assignee cannot be resolved) live in [azure-devops-implementation.md → Item Visibility: Membership and Assignee](../project-management-tool/azure-devops-implementation.md#item-visibility-membership-and-assignee). The snippets here are abbreviations of it, never an alternative to it.

### User Story (PBI)

```bash
az boards work-item create \
  --type "Product Backlog Item" \
  --title "[Story title]" \
  --description "[Body following the user-story-template]" \
  --assigned-to "[user@example.com]" \
  --area "[team area path]" \
  --project <project>
```

The description accepts the same template-driven body pair uses everywhere — story statement, acceptance criteria, DoD checklist per [user-story-template.md](../templates/user-story-template.md).

### Task

```bash
az boards work-item create \
  --type "Task" \
  --title "[Task title]" \
  --description "[Body following the task-template]" \
  --assigned-to "[user@example.com]" \
  --area "[team area path]" \
  --project <project>
```

### Bug

```bash
az boards work-item create \
  --type "Bug" \
  --title "[Bug title]" \
  --description "[Reproduction steps, expected vs actual]" \
  --assigned-to "[user@example.com]" \
  --area "[team area path]" \
  --project <project>
```

## Hierarchy: Parent-Child Relations

Relations are explicit links, created after the item exists:

```bash
# Story under its feature (epic in pair terms)
az boards work-item relation add \
  --id [story_id] \
  --relation-type parent \
  --target-id [feature_id]

# Task under its story
az boards work-item relation add \
  --id [task_id] \
  --relation-type parent \
  --target-id [story_id]
```

```bash
# Inspect relations
az boards work-item show --id [id] --expand relations
```

Full chain: Epic (initiative) → Feature (epic) → PBI (story) → Task.

## Priority Mapping

pair priorities map to the numeric `Microsoft.VSTS.Common.Priority` field:

| pair Priority    | Azure Boards Priority |
| ---------------- | --------------------- |
| P0 (Must-Have)   | 1                     |
| P1 (Should-Have) | 2                     |
| P2 (Could-Have)  | 3                     |

```bash
az boards work-item update --id [id] --fields "Microsoft.VSTS.Common.Priority=2"
```

## Tags

Tags carry cross-cutting labels (pair type markers, sprint themes, `blocked`):

```bash
# Add tags (semicolon-separated)
az boards work-item update --id [id] --fields "System.Tags=user story; refined"
```

Tags are free-form — keep the set small and documented in `way-of-working.md` if the team relies on them.

## Work Item Lifecycle

### States

State names depend on process and board configuration. Skills never hardcode them — they resolve canonical macrostates through the `## State Mapping` section in `way-of-working.md`. Schema and the Azure Boards example: [canonical-states.md](../project-management-tool/canonical-states.md).

```bash
# Move an item (target literal resolved via state mapping)
az boards work-item update --id [id] --state "Committed"
```

### Typical Story Flow

1. **Creation** — `/plan-stories` creates the PBI in the Draft-mapped state
2. **Refinement** — `/refine-story` completes AC + analysis, moves to the Ready-mapped state
3. **Implementation** — `/implement` moves to the In Progress-mapped state
4. **PR opened** — PR linked via `--work-items`; item moves to the Review-mapped state
5. **Merge** — `az repos pr update --transition-work-items true` moves it to the Done-mapped state

### Assignment

```bash
az boards work-item update --id [id] --assigned-to "[user@<org-domain>]"
```

## Search and Filtering (WIQL)

```bash
# Open stories ready for development (Ready-mapped state)
az boards query --wiql \
  "SELECT [System.Id], [System.Title] FROM WorkItems \
   WHERE [System.WorkItemType] = 'Product Backlog Item' \
     AND [System.State] = 'Approved'"

# High priority items assigned to me
az boards query --wiql \
  "SELECT [System.Id], [System.Title] FROM WorkItems \
   WHERE [Microsoft.VSTS.Common.Priority] = 1 \
     AND [System.AssignedTo] = @Me \
     AND [System.State] <> 'Done'"

# Blocked items (by tag)
az boards query --wiql \
  "SELECT [System.Id], [System.Title] FROM WorkItems \
   WHERE [System.Tags] CONTAINS 'blocked'"

# Items in current sprint — @CurrentIteration needs a team context to resolve;
# a plain project-scoped query can't tell which team's current iteration is meant.
# Pass '<project>\<team>' explicitly, or use a literal iteration path instead.
az boards query --wiql \
  "SELECT [System.Id], [System.Title] FROM WorkItems \
   WHERE [System.IterationPath] = @CurrentIteration('<project>\\<team>')"
```

## Best Practices

### Work Item Creation

- Clear, actionable titles with pair ID conventions where adopted
- Template-driven bodies (acceptance criteria for stories, reproduction steps for bugs)
- Parent relation set at creation time — orphan items break hierarchy queries
- Priority field set explicitly (defaults hide triage decisions)

### Work Item Management

- Keep state transitions flowing through the state mapping — never bypass with ad-hoc states
- Link PRs via `--work-items` for traceability and board automation
- Close items promptly via PR completion (`--transition-work-items`)
- Regular backlog triage: priority review, stale item cleanup

## Troubleshooting

### Common Issues

- **`Work item type not found`**: project uses Agile or inherited process — check the type mapping table
- **`The field 'State' contains the value X that is not in the list`**: state literal invalid for the type — inspect board columns and fix the State Mapping section
- **Relation add fails**: verify both IDs exist in the same project and the relation direction (child runs the command with `--relation-type parent`)

## Related Topics

- **[../project-management-tool/azure-devops-implementation.md](../project-management-tool/azure-devops-implementation.md)** - Overall Azure DevOps setup
- **[../project-tracking/azure-devops-tracking.md](../project-tracking/azure-devops-tracking.md)** - Board and metrics integration
- **[../automation/azure-devops-automation.md](../automation/azure-devops-automation.md)** - Automated workflows
- **[../project-management-tool/canonical-states.md](../project-management-tool/canonical-states.md)** - State mapping schema and Azure example

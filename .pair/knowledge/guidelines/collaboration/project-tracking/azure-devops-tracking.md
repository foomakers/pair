# Azure DevOps Project Tracking

Azure Boards configuration and hierarchical project tracking for comprehensive project management.

## Overview

This guide covers Azure Boards setup for tracking initiatives, epics, user stories, and tasks with progress monitoring and reporting via WIQL queries and Analytics. Tool setup and authentication live in [azure-devops-implementation.md](../project-management-tool/azure-devops-implementation.md).

## Board Setup

### Backlog Levels

Azure Boards ships three backlog levels that host pair's hierarchy:

| Backlog Level | Work Item Type (Scrum) | pair Concept |
| ------------- | ---------------------- | ------------ |
| Epics         | Epic                   | Initiative   |
| Features      | Feature                | Epic         |
| Backlog items | Product Backlog Item   | User Story   |

Tasks appear on the sprint Taskboard, nested under their story. Enable all levels: Project Settings → Team configuration → Backlogs.

### Board Columns

Each backlog level has its own board. Columns are team-configurable and typically differ from pair's canonical states — but a column only relabels an existing **state** visually, it does not create one. Resolve states through the `## State Mapping` section in `way-of-working.md` ([canonical-states.md](../project-management-tool/canonical-states.md) documents the schema, the Azure Boards example, and the routes to a `Review` state).

#### Recommended Story Board Columns

- `New` - Items not yet refined (→ Draft)
- `Approved` - Stories ready for development (→ Ready)
- `Committed` - Active work items (→ In Progress)
- `In Review` - Items in code review (→ Review; requires either an inherited-process custom state, or reusing `Committed` and only splitting the column visually — see canonical-states.md Example 5)
- `Done` - Completed items (→ Done)

#### Column Limits (WIP)

- Committed: 3-5 items per team member
- In Review: no more than 2x team size (whichever state is actually mapped to Review, per the note above)

Configure via board settings → Columns (WIP limit per column).

### Swimlanes

Optional horizontal lanes for expedite/blocked flows: board settings → Swimlanes.

## Custom Fields Configuration

Custom fields require an **inherited process** (Organization Settings → Process → create inherited → change the project's process).

### Effort / Story Points

Built-in: `Microsoft.VSTS.Scheduling.Effort` (Scrum) or `Microsoft.VSTS.Scheduling.StoryPoints` (Agile) — no custom field needed.

```bash
az boards work-item update --id [id] --fields "Microsoft.VSTS.Scheduling.Effort=5"
```

### Priority

Built-in: `Microsoft.VSTS.Common.Priority` (1-4). pair mapping: P0→1, P1→2, P2→3.

### Sprint / Iteration

Built-in: `System.IterationPath`.

```bash
# Assign to a sprint
az boards work-item update --id [id] --iteration "<project>\\Sprint 1"

# Manage iterations
az boards iteration project list --project <project>
```

### Additional Custom Fields

Add via the inherited process UI when needed (e.g., `Team`, `Confidence`). Reference them in CLI updates by full name:

```bash
az boards work-item update --id [id] --fields "Custom.Team=Backend"
```

## Hierarchical Tracking

### Tree Queries (WIQL)

```bash
# Full tree under an initiative (epic work item)
az boards query --wiql \
  "SELECT [System.Id], [System.WorkItemType], [System.Title], [System.State] \
   FROM WorkItemLinks \
   WHERE [Source].[System.Id] = [initiative_id] \
     AND [System.Links.LinkType] = 'System.LinkTypes.Hierarchy-Forward' \
   MODE (Recursive)"
```

### Progress Rollup

Boards shows child-completion rollup on Features and Epics natively (Rollup column on backlog views). For scripted rollup, count children by state:

```bash
# Stories under a feature, grouped by state (parse client-side)
az boards query --wiql \
  "SELECT [System.Id], [System.State] \
   FROM WorkItemLinks \
   WHERE [Source].[System.Id] = [feature_id] \
     AND [System.Links.LinkType] = 'System.LinkTypes.Hierarchy-Forward' \
   MODE (MustContain)"
```

## Metrics and Reporting

### WIQL Metric Queries

```bash
# Throughput: items closed in the last 14 days
az boards query --wiql \
  "SELECT [System.Id] FROM WorkItems \
   WHERE [System.WorkItemType] = 'Product Backlog Item' \
     AND [Microsoft.VSTS.Common.ClosedDate] >= @Today - 14"

# Current WIP
az boards query --wiql \
  "SELECT [System.Id] FROM WorkItems \
   WHERE [System.State] = 'Committed'"

# Aging: open items untouched for 7+ days
az boards query --wiql \
  "SELECT [System.Id], [System.ChangedDate] FROM WorkItems \
   WHERE [System.State] <> 'Done' \
     AND [System.ChangedDate] <= @Today - 7"
```

### Built-in Analytics

- **Velocity chart** — per-team, per-iteration Effort delivered (Boards → Backlogs → Analytics)
- **Cumulative Flow Diagram** — column-level flow and bottlenecks (Boards → board → Analytics)
- **Sprint Burndown** — remaining work within the iteration
- **Dashboards** — Project → Dashboards; add Velocity, CFD, Burndown, and query-tile widgets

### Cycle and Lead Time

Cycle Time and Lead Time widgets are available on dashboards (backed by Analytics). They align with pair metrics:

- **Cycle time** — In Progress-mapped state → Done-mapped state
- **Lead time** — creation → Done-mapped state

## Best Practices

### Data Quality

- One state transition path: skills write states only through the state mapping
- Effort filled at refinement (`/pair-process-refine-story`), not retroactively
- Iteration assigned at sprint planning, kept current on carry-over

### Workflow Integration

- Track at the level you plan: initiatives quarterly, features per release, stories per sprint
- Use rollup columns instead of manual progress fields
- Keep queries under version control (documented WIQL in team docs) for repeatable reporting

## Troubleshooting

### Common Issues

- **Empty tree queries**: parent links missing — verify relations with `az boards work-item show --id [id] --expand relations`
- **Velocity chart empty**: Effort field not populated, or team not associated with the backlog level
- **Custom field not found**: field exists only in the inherited process of another project — check the project's process

## Related Topics

- **[../issue-management/azure-devops-issues.md](../issue-management/azure-devops-issues.md)** - Work item creation and lifecycle
- **[../automation/azure-devops-automation.md](../automation/azure-devops-automation.md)** - Automated status updates and board rules
- **[../project-management-tool/azure-devops-implementation.md](../project-management-tool/azure-devops-implementation.md)** - Overall Azure DevOps setup
- **[../project-management-tool/canonical-states.md](../project-management-tool/canonical-states.md)** - State mapping schema and Azure example
- **[../estimation/](../estimation/README.md)** - Estimation methodology feeding Effort

# Azure DevOps - Complete Implementation Guide

_Comprehensive setup and usage guide for Azure DevOps (Boards + Repos) integration with pair_

Complete guide for implementing Azure DevOps as your project management tool, including Azure CLI setup, work item hierarchy mapping, state mapping, pull request management, and cross-topic integration with other collaboration areas.

## Quick Setup

### Prerequisites

- Azure DevOps organization and project (`https://dev.azure.com/<org>/<project>`)
- Azure CLI (`az`) with the `azure-devops` extension
- Contributor access to the project's Boards and Repos

### Essential Setup Steps

1. **Azure CLI and Extension Installation**

```bash
# Install Azure CLI (see https://learn.microsoft.com/cli/azure/install-azure-cli)
# Then add the Azure DevOps extension
az extension add --name azure-devops
```

1. **Authentication Setup**

```bash
# Interactive login
az login

# Or with a Personal Access Token (PAT) — scope: Work Items (Read & Write), Code (Read & Write)
az devops login --organization https://dev.azure.com/<org>
```

1. **Set Defaults (avoids repeating --organization/--project)**

```bash
az devops configure --defaults organization=https://dev.azure.com/<org> project=<project>
```

1. **Verify Access**

```bash
az boards query --wiql "SELECT [System.Id] FROM WorkItems" --output table
```

### Detection and HALT Behavior

pair skills resolve tool access from this guideline. Before any Boards operation, skills verify the prerequisites:

1. `az` binary available (`az version`) — **missing** → HALT with pointer to the installation step above
2. `azure-devops` extension installed (`az extension show --name azure-devops`) — **missing** → HALT with pointer to the extension step
3. Authenticated session (`az account show` or a configured PAT) — **missing** → HALT with pointer to the authentication step

Skills never attempt to install or authenticate on their own — setup is a human decision.

### Adoption Configuration

Declare the tool in `way-of-working.md`:

```markdown
- Azure DevOps is adopted for project management.
  Organization: <org>. Project: <project>.
  See `.pair/knowledge/guidelines/collaboration/project-management-tool/azure-devops-implementation.md` for usage.
```

## Work Item Hierarchy Mapping

pair's hierarchy maps to Azure Boards work item types (Scrum process, the default):

| pair Concept | Azure Boards Type (Scrum) | Azure Boards Type (Agile) |
| ------------ | ------------------------- | ------------------------- |
| Initiative   | Epic                      | Epic                      |
| Epic         | Feature                   | Feature                   |
| User Story   | Product Backlog Item      | User Story                |
| Task         | Task                      | Task                      |
| Bug          | Bug                       | Bug                       |

### Custom Work Item Types (Inherited Process)

Projects using an inherited process may rename or replace types. Override the mapping in the `way-of-working.md` PM section with an explicit table:

```markdown
## Work Item Type Mapping

| pair Concept | Work Item Type |
| ------------ | -------------- |
| Initiative   | <custom-type>  |
| Epic         | <custom-type>  |
| User Story   | <custom-type>  |
| Task         | <custom-type>  |
```

When this section is present, skills use it instead of the default table above.

## State Mapping

Azure Boards states differ per process and per team board columns. Skills resolve board states to the 5 canonical macrostates via the `## State Mapping` section in `way-of-working.md` — schema and the Azure Boards example live in [canonical-states.md](canonical-states.md).

## Azure DevOps Tool Usage Across Topics

### Issue Management

#### → See [../issue-management/azure-devops-issues.md](../issue-management/azure-devops-issues.md)

- Work item types, creation, and lifecycle
- Parent-child relations, priority, and tags
- WIQL-based search and filtering

### Project Tracking

#### → See [../project-tracking/azure-devops-tracking.md](../project-tracking/azure-devops-tracking.md)

- Board and backlog-level configuration
- Custom fields and Analytics
- WIQL queries and delivery metrics

### Automation

#### → See [../automation/azure-devops-automation.md](../automation/azure-devops-automation.md)

- Board rules and branch policies
- Service hooks
- Minimal pipeline example (quality gates linked, not duplicated)

### Estimation Integration

#### → See [../estimation/](../estimation/README.md)

- Effort field for story points
- Velocity widgets and forecasting

### Methodology Integration

#### → See [../methodology/](../methodology/README.md)

- Sprints (iterations) for Scrum
- Kanban board with WIP limits

## Working with Work Items

### Create

```bash
# Create a user story (PBI in Scrum process)
az boards work-item create \
  --type "Product Backlog Item" \
  --title "[Story title]" \
  --description "[Story body — markdown per user-story-template]" \
  --project <project>
```

### Link Parent-Child

```bash
# Link a story to its parent feature
az boards work-item relation add \
  --id [story_id] \
  --relation-type parent \
  --target-id [feature_id]
```

### Update State

```bash
az boards work-item update --id [id] --state "[target board state]"
```

The target state literal comes from the State Mapping resolution (write rule: first-mapped-wins) — see [canonical-states.md](canonical-states.md).

### Query

```bash
# All open stories in the project
az boards query --wiql \
  "SELECT [System.Id], [System.Title], [System.State] \
   FROM WorkItems \
   WHERE [System.TeamProject] = '<project>' \
     AND [System.WorkItemType] = 'Product Backlog Item' \
     AND [System.State] <> 'Done'"
```

## Code Review & PR Management

### Create a Pull Request

```bash
az repos pr create \
  --repository <repository> \
  --source-branch [feature-branch] \
  --target-branch <base-branch> \
  --title "[#story-id] [type]: [description]" \
  --description "[PR body per pr-template]" \
  --work-items [story_id]
```

`--work-items` links the PR to the work item — enables board automation (state transition on PR completion) and traceability.

### Review Actions

Azure Repos uses reviewer votes. The `/review` skill uses these through a tool-agnostic interface — this section documents the Azure-specific implementation.

| Action          | Vote Value | When to Use                                           |
| --------------- | ---------- | ----------------------------------------------------- |
| Approve         | `approve`  | All review checks pass, no blocking issues            |
| Request Changes | `reject`   | Blocking issues found that must be fixed before merge |
| Comment         | (no vote)  | Non-blocking feedback via PR threads                  |

```bash
# Vote on a PR
az repos pr set-vote --id [pr_id] --vote approve
az repos pr set-vote --id [pr_id] --vote reject

# Comment via REST (no az subcommand for threads)
az devops invoke --area git --resource pullRequestThreads \
  --route-parameters project=<project> repositoryId=[repo_id] pullRequestId=[pr_id] \
  --http-method POST --in-file thread.json --api-version 7.1
```

### Merge (Complete) a PR

```bash
# Squash merge with work item transition
az repos pr update --id [pr_id] \
  --status completed \
  --squash true \
  --merge-commit-message "[#story-id] [type]: [description]" \
  --transition-work-items true
```

| Method | Flag                          | Commit History                 |
| ------ | ----------------------------- | ------------------------------ |
| Squash | `--squash true`               | Single commit on target branch |
| Merge  | `--squash false` (default)    | Merge commit preserving all    |

`--transition-work-items true` moves linked work items to the state configured in the board's completion rule.

### Hierarchy Queries

```bash
# Get a work item with its relations (parent/children)
az boards work-item show --id [id] --expand relations

# All children of a feature (tree query)
az boards query --wiql \
  "SELECT [System.Id], [System.State] \
   FROM WorkItemLinks \
   WHERE [Source].[System.Id] = [feature_id] \
     AND [System.Links.LinkType] = 'System.LinkTypes.Hierarchy-Forward' \
   MODE (Recursive)"
```

#### Recursive Parent Cascade Logic

When closing a story after merge, evaluate the parent hierarchy:

1. **Get parent feature** — read the story's parent relation
2. **Get all siblings** — tree query on the parent feature
3. **Check completion** — if ALL sibling stories are in a Done-mapped state, move the feature to Done
4. **Recurse** — repeat for the feature's parent (epic)

## Troubleshooting

### Common Issues

- **`az: command not found`**: install Azure CLI, then `az extension add --name azure-devops`
- **`TF401019` / auth errors**: re-run `az login` or refresh the PAT; verify PAT scopes
- **Wrong work item type names**: project uses Agile or an inherited process — apply the type override table above
- **State rejected on update**: state literal not valid for the type — check the board's states and the State Mapping section

### Getting Help

- `az boards --help` and `az repos --help`
- Verify defaults: `az devops configure --list`
- Azure DevOps service status and REST API reference

## Related Resources

- **[canonical-states.md](canonical-states.md)** — macrostates and the Azure Boards state-mapping example
- **[Azure Boards Documentation](https://learn.microsoft.com/azure/devops/boards/)**
- **[Azure DevOps CLI Reference](https://learn.microsoft.com/cli/azure/boards)**
- **[Azure DevOps REST API](https://learn.microsoft.com/rest/api/azure/devops/)**

_Verified against Azure CLI `azure-devops` extension 1.0.x, API version 7.1 (2026-07)._

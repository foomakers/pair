# Azure DevOps Automation

## Overview

Automation strategies for Azure DevOps project management workflows using board rules, branch policies, and service hooks. Scope: collaboration automation only — pipeline quality gates are defined in the [quality-assurance guidelines](../../quality-assurance/automated-verification.md) and linked here, not duplicated.

## Board Rules

Azure Boards supports per-column and per-state automation configured in board settings (Boards → board → gear icon → Automation or Rules, depending on process customization level).

### Recommended Rules

- **PR opened → Review-mapped column** — when a linked PR is created, move the work item to the column mapped to `Review`
- **PR completed → Done-mapped column** — `az repos pr update --transition-work-items true` performs this transition on merge
- **Child activation → parent activation** — when a Task moves to an In Progress-mapped state, activate the parent story
- **All children closed → resolve parent** — optional; pair's `/review` skill also performs the parent cascade explicitly

### State Transition Consistency

Board rules must stay consistent with the `## State Mapping` section in `way-of-working.md` — a rule that moves items to a column outside the map makes those items invisible to pair macrostate logic (unmapped columns are ignored, per [canonical-states.md](../project-management-tool/canonical-states.md)).

## Branch Policies

Branch policies on `<base-branch>` enforce the PR workflow:

```bash
# Require pull requests (no direct pushes) — minimum 1 reviewer
az repos policy approver-count create \
  --repository-id [repo_id] \
  --branch <base-branch> \
  --minimum-approver-count 1 \
  --creator-vote-counts false \
  --allow-downvotes false \
  --reset-on-source-push true \
  --blocking true --enabled true

# Require linked work items on every PR
az repos policy work-item-linking create \
  --repository-id [repo_id] \
  --branch <base-branch> \
  --blocking true --enabled true

# Require a passing build (build validation policy)
az repos policy build create \
  --repository-id [repo_id] \
  --branch <base-branch> \
  --build-definition-id [pipeline_id] \
  --display-name "CI" \
  --manual-queue-only false \
  --queue-on-source-update-only true \
  --valid-duration 720 \
  --blocking true --enabled true
```

The work-item-linking policy is what makes traceability automatic: every merged PR carries its story, and `--transition-work-items` can close it.

## Branch Workflow Automation

Branch naming follows the pair [branch-template](../templates/branch-template.md), parametrized on `<base-branch>`:

```bash
# Create a branch from a work item (does not auto-link by name — see below)
git checkout -b feature/#[story_id]-[short-description] <base-branch>
```

Azure DevOps does **not** parse branch names for work-item IDs — naming a branch `feature/#123-...` does not, by itself, link it. Real linking mechanisms:

- **"Create a branch" action on the work item** (UI or API) — links the created branch automatically
- **Commit-message mentions** — `#[id]` (or `AB#[id]`) in a commit message, when the repository's "link commits to work items" setting is enabled
- **PR description/title mentions** — `#[id]` links the same way
- **Explicit linking on PR creation** — the reliable, scriptable path:

```bash
az repos pr create ... --work-items [story_id]
```

## Service Hooks

Service hooks push Azure DevOps events to external systems (chat, incident tooling, custom endpoints): Project Settings → Service hooks.

### Useful Subscriptions

- **Work item updated** → team chat channel (state changes on P0 items)
- **Pull request created / updated** → reviewer notification channel
- **Build completed (failed)** → escalation channel

Service hooks are configured per project in the web UI or via the [Service Hooks REST API](https://learn.microsoft.com/rest/api/azure/devops/hooks/) — no `az` subcommand exists.

## Minimal Pipeline Example

A minimal `azure-pipelines.yml` sufficient for the build-validation branch policy above. It is intentionally a placeholder — tier-aware quality gates (lint depth, coverage thresholds, security scans) are defined in the [quality-assurance guidelines](../../quality-assurance/automated-verification.md), not here.

```yaml
trigger:
  branches:
    include:
      - <base-branch>

pr:
  branches:
    include:
      - <base-branch>

pool:
  vmImage: ubuntu-latest

steps:
  - checkout: self

  - script: |
      # install dependencies (adapt to your stack)
      echo "install placeholder"
    displayName: Install

  - script: |
      # lint / type-check / build — replace with the adopted quality gate commands
      echo "quality gate placeholder"
    displayName: Quality gates (see quality-assurance guidelines)
```

Register it once, then wire it to the branch policy:

```bash
az pipelines create --name "CI" --repository <repository> \
  --branch <base-branch> --yml-path azure-pipelines.yml
```

## Automation Principles

- **Board rules mirror the state mapping** — never automate into unmapped columns
- **Policies over conventions** — branch policies enforce what documentation only suggests
- **Fallback to manual** — every automation must have a manual override path (`az boards work-item update`)
- **Version control** — `azure-pipelines.yml` and policy definitions live in the repository

## Troubleshooting

### Common Issues

- **PR completes but work item stays open**: `--transition-work-items` not passed, or the work item is not linked
- **Build validation never triggers**: pipeline not registered on the right repository/branch, or `pr:` trigger missing in YAML
- **Policy commands fail with 403**: PAT lacks Code (Read & Write) or project administration scope

## Related Topics

- **[../issue-management/azure-devops-issues.md](../issue-management/azure-devops-issues.md)** - Work item workflows being automated
- **[../project-tracking/azure-devops-tracking.md](../project-tracking/azure-devops-tracking.md)** - Tracking and reporting on automated flows
- **[../project-management-tool/azure-devops-implementation.md](../project-management-tool/azure-devops-implementation.md)** - Tool setup and CLI prerequisites
- **[../../quality-assurance/automated-verification.md](../../quality-assurance/automated-verification.md)** - Quality gate definitions (linked, not duplicated here)

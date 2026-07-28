# Linear Issues

Linear issue workflow and configuration for comprehensive issue management integrated with project tracking.

## Overview

This guide covers Linear issue management for initiatives, epics, user stories, tasks, and bugs within the pair development framework. Tool setup, authentication and the access paths (MCP or GraphQL) live in [linear-implementation.md](../project-management-tool/linear-implementation.md).

Linear has **one** issue type. pair's item types are expressed through **labels** plus the parent/sub-issue relation — that is the single structural difference from tools with native work item types.

## Item Types

| pair Type  | Linear Representation                       | Notes                                                          |
| ---------- | ------------------------------------------- | -------------------------------------------------------------- |
| Initiative | Initiative (or Project)                     | Project when the workspace plan has no Initiatives             |
| Epic       | Issue labelled `epic`, no parent            | Holds stories as sub-issues                                    |
| User Story | Issue labelled `user story`, `parentId` set | Deliverable increment                                          |
| Task       | Checklist item in the story description     | **Never** a separate issue                                     |
| Bug        | Issue labelled `bug`                        | Defect — test-first workflow applies                           |
| Tech debt  | Any issue additionally labelled `tech-debt` | Deliberate promotion only, never auto-created                   |

Labels are **per team**: resolve label ids for the adopted team before using them; an id from another team is silently unusable.

## Creating Issues

All examples use the GraphQL API (`POST https://api.linear.app/graphql`, `Authorization: $LINEAR_API_KEY`). With MCP, call the server's equivalent tool with the same arguments.

### User Story

```bash
-d '{"query":"mutation($i:IssueCreateInput!){ issueCreate(input:$i){ success issue { id identifier url } } }",
     "variables":{"i":{"teamId":"<team-id>","title":"[Story title]",
     "description":"[Story body — markdown per user-story-template]",
     "parentId":"<epic-id>","labelIds":["<user-story-label-id>"],
     "estimate":5,"priority":2}}}'
```

`issue.identifier` (e.g. `ENG-412`) is the item id pair uses in commits, branch names, and the PR's `Refs:` line.

### Epic

Same mutation without `parentId`, labelled `epic`. Attach it to a Project via `projectId` when initiatives are tracked as Projects.

### Bug

Same mutation labelled `bug`, with the reproduction steps in `description` per the bug template. The test-first workflow applies: the reproducing test precedes the fix.

### Tasks

Tasks are **checklist items inside the story description** (`- [ ] T1 — …`), updated with `issueUpdate` on the `description` field as each task completes. No task issues are created.

## Hierarchy: Parent and Sub-issues

```bash
# Attach an existing story to its epic
-d '{"query":"mutation($id:String!,$i:IssueUpdateInput!){ issueUpdate(id:$id,input:$i){ success } }",
     "variables":{"id":"<story-id>","i":{"parentId":"<epic-id>"}}}'

# Inspect the relation both ways
-d '{"query":"{ issue(id:\"<id>\"){ identifier parent { identifier } children { nodes { identifier state { type } } } } }"}'
```

Set the parent **at creation time** where possible — orphan issues break the parent-cascade queries `/pair-process-review` runs on merge.

## Priority Mapping

Linear's priority field is a fixed 0-4 scale:

| pair Priority | Linear `priority` | Linear Label |
| ------------- | ----------------- | ------------ |
| P0            | `1`               | Urgent       |
| P1            | `2`               | High         |
| P2            | `3`               | Medium       |
| _(unset)_     | `0`               | No priority  |

`4` (Low) stays available for below-P2 triage. Set priority explicitly — `0` hides the triage decision.

## Estimates

Linear carries story points in the native `estimate` field:

- The **scale** is a team setting (Fibonacci, linear, t-shirt, exponential) and must match the project's adopted estimation methodology; a value outside the scale is rejected.
- Estimates are set on stories only — epics aggregate their children in Linear's own views.
- `Estimate is not enabled` on write means the team has estimates turned off.

## Issue Lifecycle

### States

Workflow states are per-team and freely renamed, so they are resolved through the `## State Mapping` section in `way-of-working.md` (schema: [canonical-states.md](../project-management-tool/canonical-states.md); Linear's default mapping: [linear-implementation.md](../project-management-tool/linear-implementation.md#state-mapping)).

```bash
# Resolve the target state id (names are per-team, ids are stable), then write it
-d '{"query":"{ team(id:\"<team-id>\"){ states { nodes { id name type } } } }"}'
-d '{"query":"mutation($id:String!,$i:IssueUpdateInput!){ issueUpdate(id:$id,input:$i){ success } }",
     "variables":{"id":"<issue-id>","i":{"stateId":"<state-id>"}}}'
```

Always write the **state id**, never the name.

### Typical Story Flow

1. Created in the `Draft`-mapped state (Linear default: `Backlog`)
2. Refinement completes → the `Ready`-mapped state (default: `Todo`)
3. Implementation starts → `In Progress`
4. PR opened on the **code host** → the `Review`-mapped state (default: `In Review`), and the PR URL is posted as a comment on the issue
5. PR merged → `Done`, then the parent cascade runs

State transitions **always** happen on Linear; PR states live on the code host and are never mirrored here. Linear hosts no pull requests — see [Code Review & PR Management](../project-management-tool/linear-implementation.md#code-review--pr-management).

### Assignment

```bash
-d '{"query":"mutation($id:String!,$i:IssueUpdateInput!){ issueUpdate(id:$id,input:$i){ success } }",
     "variables":{"id":"<issue-id>","i":{"assigneeId":"<user-id>"}}}'
```

## Search and Filtering

```bash
# Stories ready for development (Ready-mapped state), highest priority first
-d '{"query":"{ issues(filter:{team:{key:{eq:\"<TEAM-KEY>\"}}, state:{name:{eq:\"Todo\"}}, labels:{name:{eq:\"user story\"}}}, orderBy:updatedAt){ nodes { identifier title estimate priority } } }"}'

# Open items assigned to me
-d '{"query":"{ viewer { assignedIssues(filter:{state:{type:{nin:[\"completed\",\"canceled\"]}}}){ nodes { identifier title state { name } } } } }"}'

# Items in the current cycle
-d '{"query":"{ issues(filter:{team:{key:{eq:\"<TEAM-KEY>\"}}, cycle:{isActive:{eq:true}}}){ nodes { identifier title state { name } } } }"}'
```

## Best Practices

### Issue Creation

- Clear, actionable titles; the Linear identifier (`ENG-412`) is the id used everywhere else
- Template-driven bodies (acceptance criteria for stories, reproduction steps for bugs)
- Parent relation and type label set at creation time
- Priority and estimate set explicitly

### Issue Management

- Keep state transitions flowing through the state mapping — never bypass it with an ad-hoc state
- Cross-link to the code host by convention: `Refs: <issue-id>` in the PR body, PR URL as a comment on the issue
- Close items on merge, then run the parent cascade (all sub-issues `completed` ⇒ close the parent)
- Regular backlog triage: priority review, stale-issue cleanup

## Troubleshooting

### Common Issues

- **`Entity not found: Team`**: the team key in `way-of-working.md` doesn't exist in this workspace
- **State update rejected**: a state name was sent instead of a `stateId`, or the state belongs to another team
- **Label not applied**: `labelIds` are per team — resolve them for the adopted team
- **`Estimate is not enabled`**: team estimates are off, or the value is outside the team's scale
- **Sub-issue not appearing under its epic**: `parentId` was never set (orphan) — set it and re-run the hierarchy query
- **PR operations attempted here**: Linear hosts no PRs — those route to `code-host` (a routing bug, not a Linear limitation)

## Related Topics

- **[../project-management-tool/linear-implementation.md](../project-management-tool/linear-implementation.md)** - Overall Linear setup, access paths, and the code-host split
- **[../project-management-tool/canonical-states.md](../project-management-tool/canonical-states.md)** - State mapping schema
- **[../project-tracking/README.md](../project-tracking/README.md)** - Cycles, Projects, and metrics
- **[../automation/README.md](../automation/README.md)** - Webhooks and workflow automations

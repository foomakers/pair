# Linear - Complete Implementation Guide

_Comprehensive setup and usage guide for Linear integration with pair_

Complete guide for implementing Linear as your project management tool, including access setup (MCP or GraphQL API), issue hierarchy mapping, state mapping, estimates, and cross-topic integration with other collaboration areas.

**Linear is the reference case for a split configuration.** Linear hosts the backlog but hosts **no code**: it has no repositories, no branches and no pull requests. A project on Linear therefore always declares a separate `code-host` (GitHub, GitLab, Azure Repos, …) in `way-of-working.md` → `## Git Workflow`, and every PR/review operation routes there while every item/state operation stays here. The routing rule and the cross-linking convention live in one place — [way-of-working / PM-tool + code-host resolution](../../technical-standards/ai-development/skill-conventions/way-of-working-pm-resolution.md). See [Code Review & PR Management](#code-review--pr-management) below.

## Quick Setup

### Prerequisites

- Linear workspace with a **team** created (the team key, e.g. `ENG`, prefixes every issue id)
- A Linear API key — Settings → Account → Security & access → Personal API keys
- One access path configured (pick one, see below): the **Linear MCP Server**, or direct **GraphQL API** access
- A **code host** for the repositories (Linear hosts none) — declared as `code-host` in `way-of-working.md`

### Essential Setup Steps

1. **Choose the access path**

   | Path            | Best for                                       | Trade-off                                                             |
   | --------------- | ---------------------------------------------- | --------------------------------------------------------------------- |
   | **MCP Server**  | AI assistants that support MCP (the default)    | Tool surface is whatever the server exposes; no hand-written queries   |
   | **GraphQL API** | Scripting, CI, assistants without MCP           | Every operation is an explicit query/mutation you write and maintain   |

   Both reach the same data. Record the chosen path in `way-of-working.md` so skills don't guess.

1. **MCP Server setup (path A)**

   Configure the Linear MCP Server in your AI tool's MCP configuration with the API key from the prerequisites, then restart the assistant so the tools register.

1. **GraphQL API setup (path B)**

   ```bash
   export LINEAR_API_KEY="lin_api_..."   # never commit this; use your secret store
   ```

   All calls are `POST https://api.linear.app/graphql` with the key in an `Authorization` header.

   **Keep the key out of `ps` and shell history.** Passing it inline (`-H "Authorization: $LINEAR_API_KEY"`) puts a full read/write workspace token in the process argument list — readable by any other user on the host via `ps aux` — and in your shell history. Read it from a mode-0600 header file instead (curl also accepts `--netrc`), and wrap endpoint + headers in one helper that every example below reuses:

   ```bash
   # subshell, so the caller's umask is not left at 077 for the rest of the session
   ( umask 077 && printf 'Authorization: %s\n' "$LINEAR_API_KEY" > "$HOME/.linear-headers" )

   # usage: linear_gql '<json body>'
   linear_gql() {
     curl -s https://api.linear.app/graphql \
       -H @"$HOME/.linear-headers" \
       -H 'Content-Type: application/json' \
       -d "$1"
   }

   # delete it when done — it is a plaintext long-lived token, not a session secret
   rm -f "$HOME/.linear-headers"
   ```

   Three caveats on that file, because it trades an argv exposure for an at-rest one: `curl -H @file` needs **curl ≥ 7.55** (`curl --version`; on older curl use `--netrc` with a `machine api.linear.app` entry instead); `$HOME` is frequently cloud-synced or backed up, so prefer a keychain read (`security find-generic-password -w …` / `secret-tool lookup …`) piped into the header file when that is true of your machine; and **rotate the key** in Linear (Settings → Account → Security & access) on any suspicion — a personal API key carries your full workspace read/write scope.

1. **Verify access**

   ```bash
   # Resolve the team id + key (needed by every create mutation)
   linear_gql '{"query":"{ teams { nodes { id key name } } }"}'
   ```

   With MCP, the equivalent is listing teams through the server's team tool.

### Detection and HALT Behavior

pair skills resolve tool access from this guideline. Before any Linear operation, skills verify the prerequisites:

1. An access path is declared in `way-of-working.md` (MCP or GraphQL) — **absent** → HALT with a pointer to the access-path step above
2. The path is live — MCP server registered, or `LINEAR_API_KEY` present — **missing** → HALT with a pointer to the corresponding setup step
3. The team key resolves to a team in the workspace — **missing** → HALT with a pointer to the verification step
4. A `code-host` is declared (Linear hosts no code) — **absent** → HALT before any PR operation, with a pointer to `## Git Workflow`

Skills never create API keys, register MCP servers, or pick a team on their own — setup is a human decision.

### Adoption Configuration

Declare the tool — and, because Linear hosts no code, the code host — in `way-of-working.md`:

```markdown
- Linear is adopted for project management.
  Team: <TEAM-KEY>. Project: <project-name>. Access: Linear MCP Server (fallback: GraphQL API).
  See `.pair/knowledge/guidelines/collaboration/project-management-tool/linear-implementation.md` for usage.

## Git Workflow

- `code-host`: `github` — repository `<org>/<repo>`.
- `base-branch`: `main`.
```

## Work Item Hierarchy Mapping

pair's hierarchy maps to Linear concepts:

| pair Concept | Linear Concept                          | Notes                                                              |
| ------------ | --------------------------------------- | ------------------------------------------------------------------ |
| Initiative   | Initiative (or Project)                 | Use Projects when the workspace plan has no Initiatives            |
| Epic         | Issue (parent)                          | A top-level issue with sub-issues                                  |
| User Story   | Sub-issue of the epic issue             | Linked via `parentId`                                              |
| Task         | Checklist item in the story description | **Never** a separate issue — same rule as every other PM tool      |
| Bug          | Issue with the `bug` label              | Linear has no separate issue type; the label carries the type      |

Linear has **one** issue type, so pair's item types are expressed through **labels** (`user story`, `epic`, `bug`, `tech-debt`) plus the parent/child relation. Labels are created once per team and reused.

## State Mapping

Linear workflow states are per-team and freely renamed, so a mapping is normally required. Skills resolve board states to the 5 canonical macrostates via the `## State Mapping` section in `way-of-working.md` — schema and examples live in [canonical-states.md](canonical-states.md).

Linear's default team states map as:

| Linear Workflow State | Type        | Macrostate    |
| --------------------- | ----------- | ------------- |
| Backlog               | `backlog`   | `Draft`       |
| Todo                  | `unstarted` | `Ready`       |
| In Progress           | `started`   | `In Progress` |
| In Review             | `started`   | `Review`      |
| Done                  | `completed` | `Done`        |
| Canceled              | `canceled`  | _(out of scope — not a macrostate)_ |

- A team **without** an `In Review` state has no board state mapped to `Review`: skills asked to write `Review` report the gap instead of guessing (see [canonical-states.md](canonical-states.md)).
- A team **without** a `Todo` state can't distinguish `Draft` from `Ready` — apply the **Readiness Fallback** (evaluate [Definition of Ready criteria](definition-of-ready-and-done.md) against the item) rather than reading it off the state name.
- Writes target the **state id**, not the name; resolve `id` from the team's `states` query before updating.

## Linear Tool Usage Across Topics

### Issue Management

#### → See [../issue-management/linear-issues.md](../issue-management/linear-issues.md)

- Issue creation, labels-as-types, and lifecycle
- Parent/sub-issue relations, priority, and estimates
- Filter-based search

### Project Tracking

#### → See [../project-tracking/README.md](../project-tracking/README.md)

- Cycles for iteration tracking, Projects for initiative grouping
- Progress and velocity via Linear Insights

### Automation

#### → See [../automation/README.md](../automation/README.md)

- Linear's native code-host integration (branch/PR autolinking) — **optional**: pair's cross-link is text-convention based and never depends on it
- Webhooks and workflow automations

### Communication

#### → See [../team/README.md](../team/README.md)

- Issue comment threads (where the PR URL back-link lands)
- Notification and subscription management

### Estimation Integration

#### → See [../estimation/](../estimation/README.md)

- Linear's `estimate` field carries pair's story points
- Per-team estimation scale (Fibonacci, linear, t-shirt, exponential) — set in team settings; the scale must match the project's adopted estimation methodology

### Methodology Integration

#### → See [../methodology/](../methodology/README.md)

- Cycles for Scrum sprints
- Board view with WIP limits for Kanban

## Working with Issues

GraphQL examples below; with MCP, use the server's equivalent tool with the same arguments.

**Every snippet in this section (and in Code Review & PR Management) calls the `linear_gql` helper defined under [Verify access](#quick-setup) above** — same endpoint, same headers, defined once. Define it first (or inline `curl -s https://api.linear.app/graphql -H @"$HOME/.linear-headers" -H 'Content-Type: application/json' -d '<body>'`).

### Create

```bash
linear_gql '{"query":"mutation($i:IssueCreateInput!){ issueCreate(input:$i){ success issue { id identifier url } } }",
       "variables":{"i":{"teamId":"<team-id>","title":"[Story title]",
       "description":"[Story body — markdown per user-story-template]",
       "labelIds":["<user-story-label-id>"],"estimate":5,"priority":2}}}'
```

`issue.identifier` (e.g. `ENG-412`) is the **item id** pair uses everywhere — in commits, branch names, and the PR's `Refs:` line.

### Link Parent-Child

```bash
# Attach a story to its epic issue
linear_gql '{"query":"mutation($id:String!,$i:IssueUpdateInput!){ issueUpdate(id:$id,input:$i){ success } }",
     "variables":{"id":"<story-id>","i":{"parentId":"<epic-id>"}}}'
```

### Update State

```bash
# 1. Resolve the target state id for the team (names are per-team, ids are stable)
linear_gql '{"query":"{ team(id:\"<team-id>\"){ states { nodes { id name type } } } }"}'

# 2. Write it
linear_gql '{"query":"mutation($id:String!,$i:IssueUpdateInput!){ issueUpdate(id:$id,input:$i){ success } }",
     "variables":{"id":"<issue-id>","i":{"stateId":"<state-id>"}}}'
```

The target state comes from the State Mapping resolution (write rule: first-mapped-wins) — see [canonical-states.md](canonical-states.md).

### Query

```bash
# Open stories in the team, excluding completed/canceled states
linear_gql '{"query":"{ issues(filter:{team:{key:{eq:\"<TEAM-KEY>\"}}, state:{type:{nin:[\"completed\",\"canceled\"]}}}){ nodes { identifier title estimate state { name } } } }"}'
```

### Comment on an Issue (cross-link back-link)

The comment mechanism `/write-issue $mode: comment` resolves for Linear. It is the **only** Linear write a cross-link performs: the issue description, labels and workflow state are untouched.

```bash
linear_gql '{"query":"mutation($i:CommentCreateInput!){ commentCreate(input:$i){ success } }",
     "variables":{"i":{"issueId":"<issue-id>","body":"PR: https://github.com/<org>/<repo>/pull/<n>"}}}'
```

Comments carry no caller-supplied id, so this mutation is **not** idempotent — posting twice leaves two comments. Read the issue's comments first when the caller may re-run (`{ issue(id:"<issue-id>"){ comments { nodes { body } } } }`) and skip if the URL is already there.

### Hierarchy Queries

```bash
# An epic with its sub-issues and their states (parent cascade input)
linear_gql '{"query":"{ issue(id:\"<epic-id>\"){ identifier children { nodes { identifier state { type } } } } }"}'
```

#### Recursive Parent Cascade Logic

When closing a story after merge, evaluate the parent hierarchy:

1. **Get the parent** — read the story's `parent`
2. **Get all siblings** — the parent's `children`
3. **Check completion** — if ALL sibling issues sit in a `completed`-type state, move the parent to its Done-mapped state
4. **Recurse** — repeat for the parent's own parent (and the Project/Initiative when one exists)

## Code Review & PR Management

**Linear hosts no pull requests.** Everything in this section happens on the declared `code-host`; Linear's role is limited to the item side of the cross-link. Use the code host's own implementation guide for the concrete commands — e.g. [github-implementation.md](github-implementation.md) for GitHub or [azure-devops-implementation.md](azure-devops-implementation.md) for Azure Repos.

The split works through two text conventions and nothing else — no native integration is required (Linear's own GitHub/GitLab integration may be enabled, but no skill depends on it):

1. **PR → item**: the PR body carries `Refs: <issue-id>` with Linear's identifier verbatim, e.g. `Refs: ENG-412`. This is what `/review` reads to find the story from a PR.
2. **Item → PR**: the PR URL is posted back as a **comment on the Linear issue** right after the PR exists, completing the bidirectional link. `/publish-pr` does this through `/write-issue $mode: comment` — a comment, never an issue-body update, so the story's description is untouched. The mutation (and the re-run check that keeps it from duplicating) is [Comment on an Issue](#comment-on-an-issue-cross-link-back-link) above.

Two invariants follow, and skills rely on them:

- **State transitions always happen on Linear** — the item's workflow state is written here (`In Progress` when implementation starts, `Review` when the PR opens, `Done` on merge). PR states (draft/ready/approved/merged) live on the code host and are **never mirrored** onto Linear.
- **The pair review check registers on the code host only** — that is where it gates the merge. Linear sees the outcome through the linked PR reference, so no review state is duplicated.

If the Linear identifier can't be resolved when writing the back-link, the PR is still valid: warn with a manual-link instruction rather than failing the publish.

## Troubleshooting

### Common Issues

- **`Authentication failed`**: the API key is missing, revoked, or not sent as the raw `Authorization` value (Linear personal keys are **not** `Bearer`-prefixed)
- **`Entity not found: Team`**: the team key in `way-of-working.md` doesn't exist in this workspace — re-run the verification query
- **State update rejected**: a state **name** was sent instead of a `stateId`, or the state belongs to a different team
- **`Estimate is not enabled`**: the team has estimates turned off, or the value is outside the team's scale — enable estimates and match the adopted scale
- **Label not applied**: `labelIds` are per-team; a label id from another team is silently unusable — resolve labels per team
- **No `Review` state on the board**: expected on default Linear teams without `In Review`; skills report the gap instead of guessing (see State Mapping above)
- **PR operations attempted on Linear**: a routing bug, not a Linear limitation — PR/review operations must resolve `code-host`

### Getting Help

- Linear API reference: <https://developers.linear.app/docs>
- GraphQL schema exploration: <https://studio.apollographql.com/public/Linear-API/>
- Verify the access path end to end with the team query in **Verify access** above

## Related Resources

- **[canonical-states.md](canonical-states.md)** — macrostates and the state-mapping schema
- **[definition-of-ready-and-done.md](definition-of-ready-and-done.md)** — the criteria the Readiness Fallback evaluates
- **[way-of-working / PM-tool + code-host resolution](../../technical-standards/ai-development/skill-conventions/way-of-working-pm-resolution.md)** — the routing table and the `Refs:` cross-linking convention
- **[github-implementation.md](github-implementation.md)** — the usual code host in a Linear setup
- **[../issue-management/linear-issues.md](../issue-management/linear-issues.md)** — issue lifecycle detail
- **[Linear Documentation](https://linear.app/docs)**

_Written against the Linear GraphQL API as documented at 2026-07 — not live-verified against a running Linear workspace._

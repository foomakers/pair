# Linear - Complete Implementation Guide

_Comprehensive setup and usage guide for Linear integration with pair_

Complete guide for implementing Linear as your project management tool, including access setup (MCP or GraphQL API), issue hierarchy mapping, state mapping, estimates, and cross-topic integration with other collaboration areas.

**Linear is the reference case for a split configuration.** Linear hosts the backlog but hosts **no code**: it has no repositories, no branches and no pull requests. A project on Linear therefore always declares a separate `code-host` (GitHub, GitLab, Azure Repos, …) in `way-of-working.md` → `## Git Workflow`, and every PR/review operation routes there while every item/state operation stays here. The KB ships a code-host implementation guide for **GitHub and Azure DevOps**; any other reachable host (GitLab, Bitbucket, self-hosted) is warn-once-and-best-effort through its own CLI/API — a missing guide is never a HALT, an unreachable host is. The routing rule and the cross-linking convention live in one place — [way-of-working / PM-tool + code-host resolution](../../technical-standards/ai-development/skill-conventions/way-of-working-pm-resolution.md). See [Code Review & PR Management](#code-review--pr-management) below.

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
   # read the key FROM your secret store — never type the literal into the shell
   export LINEAR_API_KEY="$(security find-generic-password -s linear-api-key -w)"   # macOS
   # export LINEAR_API_KEY="$(secret-tool lookup service linear-api-key)"          # Linux (libsecret)
   ```

   All calls are `POST https://api.linear.app/graphql` with the key in an `Authorization` header.

   **Keep the key out of `ps` and shell history.** Typing `export LINEAR_API_KEY="lin_api_..."` with the literal value writes a full read/write workspace token into your shell-history file, which is why the assignment above reads it from the secret store instead (store it there once, interactively — `security add-generic-password -s linear-api-key -a "$USER" -w`, prompted, so the value never reaches argv either). Passing it inline (`-H "Authorization: $LINEAR_API_KEY"`) has the same class of problem at call time: the token lands in the process argument list, readable by any other user on the host via `ps aux`. Read it from a mode-0600 header file instead, and wrap endpoint + headers in one helper that every example below reuses:

   ```bash
   # subshell, so the caller's umask is not left at 077 for the rest of the session;
   # rm -f first — umask constrains mode at CREATION, so `>` onto a pre-existing
   # world-readable file would truncate it and keep its old permissions
   ( umask 077 && rm -f "$HOME/.linear-headers" &&
     printf 'Authorization: %s\n' "$LINEAR_API_KEY" > "$HOME/.linear-headers" )

   # usage: linear_gql '<json body>'
   linear_gql() {
     curl -s https://api.linear.app/graphql \
       -H @"$HOME/.linear-headers" \
       -H 'Content-Type: application/json' \
       -d "$1"
   }

   # cleanup helper — DEFINED here, CALLED when you are finished (see the note below)
   linear_gql_cleanup() { rm -f "$HOME/.linear-headers"; }
   ```

   **Delete the header file when you're finished, not here.** Every snippet in this guide goes through `linear_gql`, so removing the file inside the setup block makes the very next call — starting with **Verify access** below — fail with a curl file-read error. Run `linear_gql_cleanup` at the end of the session: this is a plaintext long-lived token, not a session secret.

   Three caveats on that file, because it trades an argv exposure for an at-rest one:

   - `curl -H @file` needs **curl ≥ 7.55** (`curl --version`). On older curl, carry the header through a **config file on stdin** — `-K -` predates the `@file` header syntax and keeps the key off both argv and disk:

     ```bash
     linear_gql() {
       printf 'url = "https://api.linear.app/graphql"\nheader = "Authorization: %s"\nheader = "Content-Type: application/json"\n' \
         "$LINEAR_API_KEY" | curl -s -K - -d "$1"
     }
     ```

     Do **not** use `--netrc`: it makes curl send `Authorization: Basic base64(user:password)`, while Linear requires the raw, non-`Bearer` key (Troubleshooting's first entry is exactly that failure).

   - `$HOME` is frequently cloud-synced or backed up, and the header file is an at-rest copy of the token: when that is true of your machine, skip the file entirely and use the `-K -` variant above — the key stays in the environment (from the secret store) and never touches disk.
   - **Rotate the key** in Linear (Settings → Account → Security & access) on any suspicion — a personal API key carries your full workspace read/write scope.

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

**Classification labels are provisioned the same way.** When the project's adoption declares the matrix→tag projection (`tech/risk-matrix.md`, D17), the chromatic labels `/pair-capability-classify` applies (`risk:green|yellow|red`, `cost:green|yellow|orange|red`) must exist on the team **before** the first classified issue, exactly like the type labels above — Linear's `issueUpdate` takes label **ids**, it does not create labels on the fly. Create them once (`issueLabelCreate` per label, or in the team's Settings → Labels). If a label is missing, `/pair-capability-classify` reports the tagging gap and does **not** invent it (tagging failure is non-blocking): the matrix stays in the issue body, but the label-based tier read is unavailable — and on a split project the PR-side gate resolution (`/pair-capability-verify-quality`) then falls back to its fail-safe red. Same rule on the code host: the mirrored `risk:*`/`cost:*` PR labels are created once on the repository.

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

**Every snippet in this section (and in Code Review & PR Management) calls the `linear_gql` helper defined under [Essential Setup Steps → GraphQL API setup (path B)](#essential-setup-steps) above** — same endpoint, same headers, defined once. Define it first (or inline `curl -s https://api.linear.app/graphql -H @"$HOME/.linear-headers" -H 'Content-Type: application/json' -d '<body>'`).

### Create

```bash
linear_gql '{"query":"mutation($i:IssueCreateInput!){ issueCreate(input:$i){ success issue { id identifier url } } }",
       "variables":{"i":{"teamId":"<team-id>","title":"[Story title]",
       "description":"[Story body — markdown per user-story-template]",
       "labelIds":["<user-story-label-id>"],"estimate":5,"priority":2}}}'
```

`issue.identifier` (e.g. `ENG-412`) is the **item id** pair uses everywhere — in commits, branch names, and the PR's `Refs:` line.

### Item Visibility: Membership and Assignee

**Visibility takes two independent writes, and neither substitutes for the other.**

| Missing            | Symptom                                                                            |
| ------------------ | ---------------------------------------------------------------------------------- |
| Assignee           | Open, in the team's view, green — and absent from the assignee-filtered view teams read |
| Board membership   | not possible here — see below                                                      |

**Board membership is implicit on Linear — an issue always belongs to a team.** `issueCreate` requires `teamId`, so an issue cannot exist without membership; there is **no separate add-to-board step**. Do not invent one: unlike GitHub Projects, where an issue and a project item are distinct objects requiring an explicit `addProjectV2ItemById`, a Linear issue is a member of its team the moment it exists. Consequently a state write can never fail for "not a member yet". Optional `projectId` narrows _which_ project view shows it, but it is a grouping within the team, never the thing that makes the issue visible **in the team view**.

**Implicit membership is not the same as "cannot be invisible."** When [way-of-working.md](../../../../adoption/tech/way-of-working.md) names a **project** view rather than the team view as the board the team reads, `projectId` becomes part of visibility and must be set on the create — an issue with the right `teamId` and no `projectId` is then created, assigned, and absent from the view the team actually reads, exactly as on GitHub. Read the adopted board from `way-of-working.md`; only when it is the team view is `projectId` genuinely optional.

**The assignee is not implicit** and is still required — the board is read filtered by assignee (Assignment rule in [way-of-working.md](../../../../adoption/tech/way-of-working.md)). Set it **as part of the create**, never as a follow-up step:

```bash
# Create with the assignee — resolve the user id first
linear_gql '{"query":"{ users(filter:{isMe:{eq:true}}) { nodes { id name } } }"}'

linear_gql '{"query":"mutation($i:IssueCreateInput!){ issueCreate(input:$i){ success issue { identifier } } }",
       "variables":{"i":{"teamId":"<team-id>","title":"[title]","assigneeId":"<user-id>"}}}'

# Existing issue — assigning is idempotent, so it is safe to run unconditionally
linear_gql '{"query":"mutation($id:String!,$i:IssueUpdateInput!){ issueUpdate(id:$id,input:$i){ success } }",
     "variables":{"id":"<issue-id>","i":{"assigneeId":"<user-id>"}}}'
```

A pull request needs the same write on the code host — a PR's `author` is **not** its `assignees`, so an author-only PR is invisible in an assignee-filtered view. On Linear the code host is separate from the PM tool (see the way-of-working override), so that write belongs to the host's own adapter.

**If the assignee cannot be resolved** (not a workspace member, SSO restriction): **report it** — never drop it silently, which reproduces the invisibility this recipe exists to prevent.

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

The comment mechanism `/pair-capability-write-issue $mode: comment` resolves for Linear. It is the **only** Linear write a cross-link performs: the issue description, labels and workflow state are untouched.

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

1. **PR → item**: the PR body carries `Refs: <issue-id>` with Linear's identifier verbatim, e.g. `Refs: ENG-412`. This is what `/pair-process-review` reads to find the story from a PR.
2. **Item → PR**: the PR URL is posted back as a **comment on the Linear issue** right after the PR exists, completing the bidirectional link. `/pair-capability-publish-pr` does this through `/pair-capability-write-issue $mode: comment` — a comment, never an issue-body update, so the story's description is untouched. The mutation (and the re-run check that keeps it from duplicating) is [Comment on an Issue](#comment-on-an-issue-cross-link-back-link) above.

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

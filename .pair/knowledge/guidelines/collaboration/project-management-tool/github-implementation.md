# GitHub Projects - Complete Implementation Guide

_Comprehensive setup and usage guide for GitHub Projects integration with pair_

Complete guide for implementing GitHub Projects as your project management tool, including MCP integration, automation setup, workflow configuration, and cross-topic integration with other collaboration areas.

## Quick Setup

### Prerequisites

- GitHub account with repository access
- MCP GitHub Server for AI-assisted management
- Basic Git/GitHub knowledge

### Essential Setup Steps

1. **MCP GitHub Server Installation**

```bash
# Install via npm
npm install -g @github/github-mcp-server
```

1. **Authentication Setup**

- Configure MCP client for GitHub access
- Verify connection through pair assistant

1. **Basic Project Structure**

- Create GitHub Project board
- Configure custom fields (Priority, Type, Status)
- Set up automation rules

## GitHub Tool Usage Across Topics

### Issue Management

#### → See [../issue-management/](../issue-management/README.md)

- GitHub Issues setup and configuration
- Label management and templates
- Issue workflow automation
- Integration with project boards

**Creating an issue?** The create recipe — assignee **and** project membership, which are two independent writes — lives in [Item Visibility: Membership and Assignee](#item-visibility-membership-and-assignee) further down this file. It sits next to the board-status mechanics it depends on rather than here.

### Project Tracking

#### → See [../project-tracking/](../project-tracking/README.md)

- GitHub Projects board configuration
- Custom fields setup (Priority, Type, Status)
- Progress tracking and reporting
- Hierarchical item management (Initiative → Epic → Story → Task)

### Automation

#### → See [../automation/](../automation/README.md)

- GitHub Actions workflows
- MCP integration for AI-assisted management
- Status synchronization rules
- Automated project board updates

### Board Management

#### → See [.pair/knowledge/guidelines/collaboration/project-tracking/README.md](../project-tracking/README.md)

- Board layout and column configuration
- Workflow optimization
- Team productivity patterns
- Board performance monitoring

### Communication

#### → See [.pair/knowledge/guidelines/collaboration/team/README.md](../team/README.md)

- Pull request workflows and reviews
- GitHub Discussions integration
- Notification management
- Team collaboration patterns

### Estimation Integration

#### → See [../estimation/](../estimation/README.md)

- GitHub-compatible estimation approaches
- Story point tracking in custom fields
- Velocity calculation and forecasting
- Integration with planning tools

### Methodology Integration

#### → See [../methodology/](../methodology/README.md)

- Scrum integration with GitHub Projects
- Kanban workflow implementation
- Sprint planning and tracking
- Retrospective action items management
- Custom fields setup (Priority, Type, Status)
- Progress tracking and reporting
- Hierarchical item management (Initiative → Epic → Story → Task)

### Automation

#### → See [.pair/knowledge/guidelines/collaboration/automation/github-automation.md](../automation/github-automation.md)

- GitHub Actions workflows
- MCP integration for AI-assisted management
- Status synchronization rules
- Automated project board updates

### Board Management

#### → See [board-management.md](../project-tracking/README.md)

- Board layout and column configuration
- Workflow optimization
- Team productivity patterns
- Board performance monitoring

### Communication

#### → See [../communication-protocols/](../team/README.md)

- Pull request workflows and reviews
- GitHub Discussions integration
- Notification management
- Team collaboration patterns

### Estimation Integration

#### → See [../estimation/](../estimation/README.md)

- GitHub-compatible estimation approaches
- Story point tracking in custom fields
- Velocity calculation and forecasting
- Integration with planning tools

## GitHub Projects Configuration

### Recommended Board Setup

#### Status Columns:

- 📋 Todo - Items not yet started
- 🔍 Refined - User stories ready for development
- 🔧 In Progress - Active work items
- 👀 Review - Items in code review
- ✅ Done - Completed items

#### Custom Fields:

- **Priority**: P0 (Must-Have), P1 (Should-Have), P2 (Could-Have)
- **Type**: Initiative, Epic, User Story, Task
- **Effort**: Estimation field (Story Points or Hours)
- **Sprint**: Sprint assignment field

### Automation Rules

- Move to "In Progress" when assigned
- Move to "Review" when PR opened
- Move to "Done" when PR merged
- Update parent status based on children progress

## Integration with Methodologies

#### → See [../methodology/](../methodology/README.md)

### Scrum Integration

- Sprint planning using GitHub milestones
- Daily standup tracking via board updates
- Sprint review using project insights
- Retrospective action items as GitHub issues

### Kanban Integration

- Continuous flow using GitHub Projects board
- WIP limits via board configuration
- Flow metrics tracking
- Bottleneck identification

## Troubleshooting

### Common Issues

- **MCP Connection**: Verify authentication and server status
- **Permissions**: Ensure proper repository and project access
- **Automation**: Check GitHub Actions permissions
- **Sync Issues**: Verify webhook configurations

### Getting Help

- Check MCP server logs for connection issues
- Verify GitHub API rate limits
- Review project permissions and access rights
- Consult GitHub Projects documentation for advanced features

## Advanced Features

### GitHub CLI Integration

```bash
# Fallback commands when MCP unavailable
gh project list --owner [ORG]

# --project takes the project's TITLE, never its node ID and never its number
# (gh 2.97 documents "-p, --project title"; numbers belong to `gh project`).
# Both flags need the `project` OAuth scope: gh auth refresh -s project
# Passing it at create time is what makes the item a board member —
# see "Item Visibility: Membership and Assignee" below for why that matters
# and for the Step 2b path when this flag is not used.
gh issue create --assignee "[login]" --project "[project title]"
gh pr create --assignee "[login]" --project "[project title]"
```

### API Integration

- Custom automation via GitHub API
- Integration with external tools
- Reporting and analytics workflows
- Custom dashboard creation

### Comment on an Issue (cross-link back-link)

The **issue**-comment mechanism (distinct from the PR-review comments documented under Code Review below) — what `/pair-capability-write-issue $mode: comment` resolves for `github-projects`. It writes nothing but the comment: body, labels and project-board fields are untouched.

```bash
gh issue comment <issue-number> --body "PR: https://github.com/<org>/<repo>/pull/<n>"

# re-run check: comments carry no caller id, so posting twice leaves two comments
gh issue view <issue-number> --json comments --jq '.comments[].body'
```

## Code Review & PR Management

### PR Review States

GitHub supports three review actions. The `/pair-process-review` skill uses these through a tool-agnostic interface — this section documents the GitHub-specific implementation.

#### Review Actions

| Action             | GitHub API Value    | When to Use                                                |
| ------------------ | ------------------- | ---------------------------------------------------------- |
| Approve            | `APPROVE`           | All review checks pass, no blocking issues                 |
| Request Changes    | `REQUEST_CHANGES`   | Blocking issues found that must be fixed before merge      |
| Comment            | `COMMENT`           | Non-blocking feedback, questions, or suggestions           |

#### MCP-First Approach

```text
# Submit a review (preferred — uses MCP GitHub server)
mcp__github__pull_request_review_write:
  method: create
  owner: [org]
  repo: [repo]
  pullNumber: [N]
  event: APPROVE | REQUEST_CHANGES | COMMENT
  body: "Review summary"
```

#### CLI Fallback

```bash
# When MCP is unavailable
gh pr review [PR_NUMBER] --approve --body "Review summary"
gh pr review [PR_NUMBER] --request-changes --body "Changes needed: ..."
gh pr review [PR_NUMBER] --comment --body "Feedback: ..."
```

#### Pending Review Workflow (Multi-Comment Reviews)

For reviews with line-specific comments, use the pending review pattern:

```text
# Step 1: Create pending review (no event = pending)
mcp__github__pull_request_review_write:
  method: create
  owner: [org]
  repo: [repo]
  pullNumber: [N]

# Step 2: Add line comments to pending review
mcp__github__add_comment_to_pending_review:
  owner: [org]
  repo: [repo]
  pullNumber: [N]
  path: "src/file.ts"
  line: 42
  body: "Comment on this line"
  subjectType: LINE
  side: RIGHT

# Step 3: Submit the pending review
mcp__github__pull_request_review_write:
  method: submit_pending
  owner: [org]
  repo: [repo]
  pullNumber: [N]
  event: REQUEST_CHANGES
  body: "Overall review summary"
```

#### CLI Coverage Gap — Multi-Comment / Inline-Line-Comment Reviews

**The MCP-First path above has no CLI-only equivalent today.** `gh pr review` (the CLI fallback used elsewhere in this section) only ever produces a single summary-body review — it accepts no per-line, per-file comment. On a CLI-first harness (see the [agent-harness framework](../../technical-standards/ai-development/agent-harness/README.md)), `/pair-process-review` therefore cannot produce inline comments through `gh pr review` the way the MCP path does.

**Remedy — the GitHub REST reviews endpoint accepts inline comments directly**, and `gh api` can drive it without MCP:

```bash
gh api \
  --method POST \
  -H "Accept: application/vnd.github+json" \
  /repos/{owner}/{repo}/pulls/{pull_number}/reviews \
  -f event='REQUEST_CHANGES' \
  -f body='Overall review summary' \
  -F 'comments[][path]=src/file.ts' \
  -F 'comments[][line]=42' \
  -F 'comments[][side]=RIGHT' \
  -F 'comments[][body]=Comment on this line'
```

Repeat the `comments[][...]` group (same index across the four fields) for each additional line comment in the same call — the endpoint accepts the full array in one request, matching the MCP path's single-submit shape rather than the pending-review's step-by-step one. `pull_number`, `path`, `line` and `side` (`LEFT`/`RIGHT`) follow the same semantics as the MCP `add_comment_to_pending_review` call above.

This closes the gap: a CLI-first harness (pi, or any harness without the GitHub MCP server configured) can produce a genuinely multi-comment, inline-line review through `gh api` alone. **Verified against a real PR**: [PR #457](https://github.com/foomakers/pair/pull/457) (story #450's own pull request), [review #5001891333](https://github.com/foomakers/pair/pull/457#pullrequestreview-5001891333) — the exact command above, run unmodified, produced a real inline comment attached to a real diff line. GitHub's REST response echoes `position`/`original_position` rather than `line` for this endpoint (a response-shape quirk, not a failure) — the comment still renders at the intended line.

### Merge Strategy

GitHub supports three merge methods. The adopted strategy is configured in [way-of-working.md](../../../../adoption/tech/way-of-working.md) under the Merge Strategy section.

#### Merge Methods

| Method | GitHub API Value | Commit History                        | Best For                          |
| ------ | ---------------- | ------------------------------------- | --------------------------------- |
| Squash | `squash`         | Single commit on target branch        | Feature branches, clean history   |
| Merge  | `merge`          | Merge commit preserving all commits   | Long-lived branches, audit trail  |
| Rebase | `rebase`         | Linear history, no merge commit       | Small PRs, linear history fans    |

#### MCP-First Approach

```text
# Merge a PR (preferred)
mcp__github__merge_pull_request:
  owner: [org]
  repo: [repo]
  pullNumber: [N]
  merge_method: squash | merge | rebase
  commit_title: "[#story-id] feat: description"
  commit_message: "Detailed commit message"
```

#### CLI Fallback

```bash
# When MCP is unavailable
gh pr merge [PR_NUMBER] --squash --subject "[#ID] feat: description" --body "Details"
gh pr merge [PR_NUMBER] --merge
gh pr merge [PR_NUMBER] --rebase
```

### Hierarchy Queries

GitHub Projects supports hierarchical work items (Initiative → Epic → Story). Use these patterns to query parent-child relationships.

#### Check Sub-Issues of a Parent

```text
# Get sub-issues of an epic or initiative (MCP)
mcp__github__issue_read:
  method: get_sub_issues
  owner: [org]
  repo: [repo]
  issue_number: [parent_issue_number]
```

#### CLI Fallback for Hierarchy

```bash
# List sub-issues of a parent issue
gh api repos/[org]/[repo]/issues/[number]/sub_issues

# Check if all children of an epic are done
# Parse the response and check state of each sub-issue
```

#### Recursive Parent Cascade Logic

When closing a story after merge, evaluate the parent hierarchy:

1. **Get parent epic** — read the story's parent issue reference
2. **Get all siblings** — query all sub-issues of the parent epic
3. **Check completion** — if ALL sibling stories have `state: closed`, close the parent epic
4. **Recurse** — repeat for the epic's parent (initiative)

```text
# Step 1: Get epic's sub-issues
mcp__github__issue_read:
  method: get_sub_issues
  owner: [org]
  repo: [repo]
  issue_number: [epic_number]

# Step 2: Check if all sub-issues are closed
# If all closed → close the epic
mcp__github__issue_write:
  method: update
  owner: [org]
  repo: [repo]
  issue_number: [epic_number]
  state: closed
  state_reason: completed

# Step 3: Repeat for initiative (epic's parent)
```

### Item Visibility: Membership and Assignee

**Visibility takes two independent writes, and neither substitutes for the other.**

| Missing            | Symptom                                                                            |
| ------------------ | ---------------------------------------------------------------------------------- |
| Assignee           | Open, on the board, green — and absent from the assignee-filtered view teams read   |
| Project membership | Open, assigned, green — and absent from the board entirely                          |

**Board membership is explicit on GitHub**: an issue and a project item are **distinct objects**. `mcp__github__issue_write` has **no project field at all**, and `gh issue create` produces only the issue **unless you pass `--project`**. Either way membership is a separate decision, made by `--project` at create time or by `addProjectV2ItemById` afterwards (Step 2b below). This is tool-specific — on tools where membership is implicit, the guide says so; never assume the GitHub shape elsewhere.

**Both membership writes need the `project` OAuth scope.** `--project` (on `gh issue create`, `gh pr create`, `gh issue edit --add-project`) and the `addProjectV2ItemById` mutation are both refused by a default `gh auth login` token: `your authentication token is missing required scopes [project]`. Grant it once with `gh auth refresh -s project` — the same scope the `projectV2` queries in Steps 1-3 need, and the same one the token the MCP server runs with must carry. `gh` resolves the project **before** it creates the issue, so a missing scope fails the whole command and **no issue is created**: nothing is half-written, and re-running after the refresh is safe.

**A missing-scope error is reported, never worked around by dropping `--project`.** Retrying without the flag succeeds and lands on exactly the defect this section exists to remove — open, assigned, green, off the board. Same discipline as the status write below: report it, never silently degrade to a create that skips membership.

The assignee is required by the Assignment rule in [way-of-working.md](../../../../adoption/tech/way-of-working.md): the board is read filtered by assignee. Set it **as part of the create**, never as a follow-up step.

#### Create an Issue with its Assignee and its Membership

**Creating does not imply membership.** Both writes belong to the create, because the two failure modes above are independent: an issue created with an assignee and no membership is open, assigned, green and absent from the board — which is the exact defect this section exists to prevent, and it is reachable through the **most common** path, a follow-up issue filed with no status transition.

```text
# MCP-first — NOTE: issue_write has no project field.
# This call creates the issue and its assignee ONLY.
# Step 2b is REQUIRED after it, not optional.
mcp__github__issue_write:
  method: create
  owner: [org]
  repo: [repo]
  title: "[item title]"
  body: "[body — markdown per the item's template]"
  labels: ["[type label]", "[classification labels]"]
  assignees: ["[login]"]
```

```bash
# CLI fallback — one shot: --project takes the project's TITLE, never its node
# ID and never its number, and the project is the one named in way-of-working.md.
# Needs the `project` OAuth scope (gh auth refresh -s project); without it the
# command fails and creates NOTHING — report that, never retry without --project.
gh issue create --title "[title]" --body-file [file] --assignee "[login]" --project "[project title]"

# Without --project (or after any MCP create): membership is still missing.
# Run Step 2b below — it is idempotent, so it is safe to run unconditionally.
#
# No project named in way-of-working.md at all: omit --project AND skip Step 2b.
# That is the Step 1 no-project outcome, not a workaround — there is no board to
# be absent from, so the item is not invisible.

# Existing issue — --add-assignee adds without replacing, so it is safe to run unconditionally
gh issue edit [NUMBER] --add-assignee "[login]"
```

A pull request needs the same write: `gh pr create --assignee "[login]"`. A PR's `author` is **not** its `assignees`, so an author-only PR is invisible in an assignee-filtered view.

**If the assignee cannot be resolved** (not a repository collaborator, org/SSO restriction): **report it** — never drop it silently, which reproduces the invisibility this recipe exists to prevent.

### Project Board Status Transitions

Update the project board status field for intermediate transitions (Todo → Refined, Refined → In Progress) and final transitions (→ Done).

**Important**: The project board status field is separate from the issue state (open/closed). Updating the issue body text `**Status**: Refined` is **not** the same as updating the board field. Always update the board field via GraphQL mutation.

#### Step 1: Discover Project and Field IDs

```bash
# Find project ID, status field ID, and option IDs
gh api graphql -f query='{
  organization(login: "[ORG]") {
    projectV2(number: [PROJECT_NUMBER]) {
      id
      fields(first: 20) {
        nodes {
          ... on ProjectV2SingleSelectField {
            id name
            options { id name }
          }
        }
      }
    }
  }
}'
```

**Branch on the discovery outcome — this is where "there is no board" is observed, before any item lookup:**

| Discovery outcome                                    | Meaning                                                           | Next                                                      |
| ---------------------------------------------------- | ----------------------------------------------------------------- | --------------------------------------------------------- |
| A project id + status field id                       | The board exists                                                  | Step 2                                                    |
| The query **succeeded** and returned **no project**  | No project is configured — there is no board field to write at all | **Skip Steps 2-3** — there is no board field to write; the membership step **no-ops** (see Step 2b) |
| The query **failed** (error, 404, permission denied) | Unknown — not evidence of absence                                 | **Report it.** Never a no-op, never "board write skipped" |

Keep the last two apart: "no project configured" is a **successful** query with an empty result; an error or a permission denial says nothing about whether the project exists, and treating it as absence is how a failed board write disappears into a green report.

#### Step 2: Find the Item ID for the Issue

```bash
# Paginate project items to find the issue
gh api graphql -f query='{
  organization(login: "[ORG]") {
    projectV2(number: [PROJECT_NUMBER]) {
      items(first: 50) {
        pageInfo { hasNextPage endCursor }
        nodes {
          id
          content { ... on Issue { number } }
        }
      }
    }
  }
}'
# Use pageInfo.endCursor for pagination if needed
```

**Branch on the result — an empty id is a state, not an error to ignore:**

| Lookup result                | Meaning                                    | Next                                        |
| ---------------------------- | ------------------------------------------ | ------------------------------------------- |
| An item id                   | The issue is already a project item        | Step 3                                      |
| No match after the last page | The issue is **not a project item yet**    | **Step 2b**, then Step 3 on the returned id |

(The "no project configured at all" outcome is not reachable here — it is observed in **Step 1**, whose table above owns it.)

Never carry an empty id into Step 3: `updateProjectV2ItemFieldValue` fails with `gh: Could not resolve to a node with the global id of ''`. **And never treat the empty id as "board write skipped" and report success** — a silently skipped board write is exactly how an item ends up open, assigned, green, and absent from the board. Paginate to the last page before concluding "not an item": a match on page 3 that was never fetched looks identical to no match.

**When the issue belongs to more than one project**: target the project named in [way-of-working.md](../../../../adoption/tech/way-of-working.md). Never take the first project found.

#### Step 2b: Add the Issue as a Project Item (idempotent — safe as an unconditional precondition)

Reached whenever Step 2 found nothing, and safe to run even when it found something (see **Idempotent** below) — so the conditional shape is an optimisation, never a requirement. Membership must exist before the status field can be written — the field lives on the **item**, not on the issue.

`[PROJECT_ID]` below comes from **Step 1**: run it first when you arrive here straight from the create recipe rather than through Step 2.

```bash
# Get the issue's node id, then add it to the project
ISSUE_NODE_ID=$(gh api graphql -f query='{
  repository(owner: "[ORG]", name: "[REPO]") {
    issue(number: [ISSUE_NUMBER]) { id }
  }
}' --jq '.data.repository.issue.id')

# Abort if the lookup yielded nothing — same empty-id discipline as Step 3.
# An empty value would send contentId: "" and corrupt the mutation instead of failing.
[ -n "$ISSUE_NODE_ID" ] || { echo "issue node id lookup failed — aborting" >&2; exit 1; }

# Parameterised, never interpolated into the query document: values travel as
# GraphQL variables (-F), so an unexpected value fails cleanly rather than
# rewriting the query. Returns the item id — feed it straight into Step 3.
# Needs the `project` OAuth scope, exactly like --project on the create:
# gh auth refresh -s project. A missing scope is reported, never skipped.
gh api graphql \
  -f query='mutation($project: ID!, $content: ID!) {
    addProjectV2ItemById(input: { projectId: $project, contentId: $content }) {
      item { id }
    }
  }' \
  -F project="[PROJECT_ID]" \
  -F content="$ISSUE_NODE_ID" \
  --jq '.data.addProjectV2ItemById.item.id'
```

**Idempotent**: `addProjectV2ItemById` on an issue that is already an item returns that existing item instead of duplicating it, so this step is safe to run unconditionally — including as a precondition of every status write, without a preceding existence check. Prefer that unconditional shape: a Step 2 that returned a stale or partially-paginated result otherwise reaches Step 3 with no membership.

**No project configured at all**: a project with **no board at all** has no field to write, so the membership step **no-ops** — it is **never a HALT** for a project that legitimately has no board. This is its own degradation, and it is **not** the one in [canonical-states.md](canonical-states.md): that document's write rule 5 **HALTs** when a board _exists_ but no board state maps to the target macrostate. Nor is it the D4 readiness fallback ([definition-of-ready-and-done.md](definition-of-ready-and-done.md)), which is a board that exists and lacks a _Ready column_.

The no-op applies **only** to the Step 1 outcome "discovery succeeded and returned no project". A discovery that **failed** — error, 404, permission denied — is **reported**, never absorbed as a no-op; otherwise this branch launders an error into a success and reproduces the very defect the empty-id rule above forbids.

#### Step 3: Update the Status Field

Requires an item id from Step 2 or Step 2b — the item exists by this point, by construction.

```bash
# Transition to any status (e.g., Ready, In Progress, Done)
gh api graphql -f query='mutation {
  updateProjectV2ItemFieldValue(input: {
    projectId: "[PROJECT_ID]"
    itemId: "[ITEM_ID]"
    fieldId: "[STATUS_FIELD_ID]"
    value: { singleSelectOptionId: "[TARGET_STATUS_OPTION_ID]" }
  }) { projectV2Item { id } }
}'
```

#### Common Transitions

| Transition | When | Triggered by |
|-----------|------|-------------|
| Todo → Refined | Story refinement complete | `/pair-process-refine-story` via `/pair-capability-write-issue $status: Ready` |
| Refined → In Progress | Implementation starts | `/pair-process-implement` — **writes the board field directly** (`/pair-capability-write-issue` Step 7b applied **by reference**: membership → a read that confirms it → the status mutation above) |
| In Progress → Done | PR merged + issue closed | `/pair-process-review` merge step |

### Issue Close (Post-Merge)

Close the issue after merge. The board status transition to Done should happen via the mutation above; closing the issue updates only the issue state.

#### MCP-First Approach

```text
# Close the story issue
mcp__github__issue_write:
  method: update
  owner: [org]
  repo: [repo]
  issue_number: [story_number]
  state: closed
  state_reason: completed
```

#### CLI Fallback

```bash
# Close issue
gh issue close [NUMBER] --reason completed
```

## PR state flow — required checks & branch protection

GitHub mechanics for the two pair checks the [PR state flow](pr-states.md) requires. The **model** (states, synthesis, tier requirements, edge cases) lives in that document; only host specifics live here (R2.12).

### The two pair checks

| Check | Published by | Semantics |
| --- | --- | --- |
| `pair-review` | `/pair-process-review`, as a **commit status** (registered `pending` at PR creation by `/pair-capability-publish-pr`) | `success` on APPROVED, `failure` on CHANGES-REQUESTED, `pending` when the review has not produced a decision (never ran, crashed, timed out) |
| `pair-explicit-approval` | a workflow job (below), also as a **commit status pinned to the PR head SHA** | `success` when the tier does not require explicit approval, or when a **human** approving review exists on the current head; `failure` at 🔴 without one |

Both are **required status checks** — a `pending` or absent required check blocks the merge on GitHub exactly like a failing one, which is what makes the review unskippable (R5.7).

#### What each context proves — and what it does not

A commit status is written by `POST /repos/{owner}/{repo}/statuses/{sha}`, which **any principal with push access can call, for any context name**, and branch protection evaluates the **most recent** status per context. There is no producer-identity restriction on a status context unless one is pinned in the protection payload. Read the two checks accordingly:

| Context | What it guarantees | What it does **not** guarantee |
| --- | --- | --- |
| `pair-review` | **Anti-accident**: an absent or `pending` context blocks, so a review that never ran, crashed, or was skipped can never leave the PR mergeable. Verified on a live host. | **Unforgeability.** It is published with the ordinary agent token, so by construction anyone with push access — including the authoring agent — can `POST` `state=success` for the context. It is **not** an authorization control; treat it as "the review cannot be silently skipped", never as "someone independent approved". |
| `pair-explicit-approval` | **Authorization**, to the extent the producer is pinned: the payload below pins the context to the **GitHub Actions app id**, so a status posted by a user token or PAT does not satisfy it, and the job that does post it runs from a trusted ref (property 1 below). | Absolute unforgeability — see the residual immediately below. The only form with no residual is a **GitHub App check-run** whose `app_id` is pinned to an App the repository's own workflows cannot present (Option 4 in ADR-018 — deferred, [#398](https://github.com/foomakers/pair/issues/398)). |

**Residual on the app pin, and the companion repository settings that shrink it.** A status posted by _any_ workflow using the default `GITHUB_TOKEN` is attributed to the GitHub Actions app, so a pull request that **adds** a `pull_request` workflow declaring `permissions: statuses: write` can post the pinned context itself. Two settings close that in practice — apply both when the flow is used as an authorization control:

- **Settings → Actions → General → Workflow permissions: _Read repository contents and packages permissions_.** This removes the implicit write token, so any workflow needing `statuses: write` must request it explicitly in its own YAML — visible in the diff instead of ambient. (It does not _prevent_ an explicit request; that is what the next setting is for.)
- **Require review on workflow changes**: a `CODEOWNERS` entry for `/.github/workflows/**` plus `"required_pull_request_reviews": { "require_code_owner_reviews": true }`, so a PR that edits or adds a workflow needs a human code-owner approval before it can merge — the same human signal the 🔴 gate is asking for.

Stated plainly rather than assumed away: with neither setting applied, `pair-explicit-approval` is hardened (no PAT/user-token path) but not unforgeable, and `pair-review` is forgeable by design. The unforgeable form is the App/check-run path.

**Variables used by every snippet in this section** — defined once, and every call below uses the **same single-variable form** `repos/$REPO/…` (never a two-variable owner+name form, which is what produces `repos/owner/owner/repo/…` and a 404 when `REPO` already holds `owner/repo`):

```bash
REPO="$(gh repo view --json nameWithOwner -q .nameWithOwner)"   # owner/repo — matches `github.repository`
PR=<pr-number>
HEAD_SHA="$(gh pr view "$PR" --json headRefOid -q .headRefOid)"
```

**Token prerequisite (why a commit status, not a check run).** The Checks API (`POST /repos/{owner}/{repo}/check-runs`) is writable **only by a GitHub App installation token**: with an ordinary user token or PAT it answers `403 You must authenticate via a GitHub App`. The skills that publish the verdict (`/pair-capability-publish-pr` Phase 5, `/pair-process-review` Step 5.4) run agent-side with exactly that ordinary token, so a check run is not an option for them. The **commit-statuses API** accepts the same token and branch protection treats a status **context** as a required check identically. The token needs `repo:status` (classic PAT) / `Commit statuses: write` (fine-grained); inside a workflow that is `permissions: statuses: write`. If a project does publish through a GitHub App instead, keep the check-run form — but then the publication must happen inside a workflow holding `checks: write`, plus a relay that carries the agent's verdict there.

### Dedicated review identity

**Optional, and off by default.** With nothing configured the flow runs exactly as documented above: the session token writes, the verdict is a `--comment` review, `pair-review` is a commit status. That is `Review identity: none` in [way-of-working.md](../../../../adoption/tech/way-of-working.md) and it is **not a degradation** — it is the zero-configuration mode.

A **dedicated review identity** is a second principal — a GitHub App installation, or a bot user account — whose credential the review flow uses for its code-host writes instead of the session token. Provisioning it is **project infrastructure**: a registration/seat and a secret, which no skill can create for you. What the flow does is _consume_ it, through the host-agnostic adapter [`review-identity.sh`](../../../assets/review-identity.sh) (`resolve_identity_mode`, `identity_verdict_event`, `pair_review_publication_mode`, `identity_audit_comment`). The model is in [pr-states.md](pr-states.md); only the GitHub specifics live here (R2.12).

**What it buys:**

| | `Review identity: none` (default) | `bot-user` | `app` (recommended) |
| --- | --- | --- | --- |
| Verdict | `--comment` review — the host rejects a self-authored APPROVE | native **APPROVE / REQUEST_CHANGES** | native **APPROVE / REQUEST_CHANGES** |
| `pair-review` | commit status | commit status | **check run** (the Checks API needs an App token) |
| Audit | "who reviewed" is a token in the review body | per-identity in the host's review events | per-identity in review events **and** check runs |
| 🔴 explicit approval | still a second **human** | still a second **human** | still a second **human** |

**The last row is the point, and it does not move.** `pair-explicit-approval` counts approvals matching `human_approval_jq_filter`, which requires `user.type == "User"` — a bot user and an App installation are `"Bot"` on that API. So the identity's approval is excluded **by construction**: adopting it never relaxes the 🔴 rule, and a `risk:red` pull request still needs a second human account (ADR-018, amendment 2026-08-28). Two mechanisms live side by side deliberately — the identity signs the ordinary review, a human signs the 🔴 one.

#### GitHub App (recommended)

Recommended because it is the only form that unlocks the Checks API, and because an App installation token is scoped to the repository rather than to a person's whole account.

1. **Register** the App (Settings → Developer settings → GitHub Apps → New). Repository permissions, and nothing more:
   - `pull_requests: write` — submit the native review, post the audit comment
   - `checks: write` — publish `pair-review` as a check run
   - `contents: read` — read the branch under review
   - `metadata: read` (mandatory for every App)
   - Do **not** grant `administration` — the identity must not be able to edit branch protection.
2. **Install** it on the repository (Settings → GitHub Apps → Install), and note the installation id.
3. **Store the credential** per the [security guidelines](../../quality-assurance/security/security-guidelines.md): the App's private key is a secret and **never enters the repository** — no `.pem` committed, no key in an adoption file, no key in a skill argument. Put it in the project's secret store (GitHub Actions secret, or the local secret manager the project already uses) and reference it by name. The repository's deterministic secret scan (D24) is the backstop, not the policy.
4. **Verify**, before relying on it — this is what `resolve_identity_mode`'s health input means in practice:

   ```bash
   # `GH_TOKEN` here is the App INSTALLATION token, minted from the private key.
   REPO="$(gh repo view --json nameWithOwner -q .nameWithOwner)"
   gh api user --jq '.login, .type'                 # expect the app slug and "Bot"
   gh api "repos/$REPO/check-runs" -X POST -f name=pair-identity-probe \
     -f head_sha="$HEAD_SHA" -f status=completed -f conclusion=neutral  # 201 ⇒ checks: write
   gh api "repos/$REPO/pulls/$PR/reviews" --jq 'length'                 # 200 ⇒ pull_requests read
   ```

   A `403` on the check-run probe means `checks: write` was not granted or the App is not installed on this repository — that is a **configured-but-broken** identity, and the flow HALTs on it rather than falling back to the session user.

5. **Publish `pair-review` as a check run** on the App path (the commit-status form stays exactly as documented above for every other path):

   ```bash
   source .pair/knowledge/assets/review-identity.sh
   source .pair/knowledge/assets/pr-state.sh
   MODE="$(resolve_identity_mode "$IDENTITY_CONFIGURED" "$IDENTITY_HEALTHY")"
   [ "$MODE" = halt ] && exit 1
   STATE="$(review_check_conclusion "$VERDICT")"
   [ "$STATE" = pending ] && { echo "no decision yet — leaving the pending check in place"; exit 0; }
   if [ "$(pair_review_publication_mode "$MODE" "$IDENTITY_KIND")" = checks-api ]; then
     gh api "repos/$REPO/check-runs" -X POST \
       -f name='pair-review' -f head_sha="$HEAD_SHA" \
       -f status=completed -f conclusion="$STATE" \
       -f 'output[title]=pair review' -f "output[summary]=$VERDICT_SUMMARY"
   fi
   ```

   The same `pending`-first discipline applies: the pending check is registered at PR creation, and only a real decision resolves it.

#### Bot user (alternative)

A second GitHub **user** account, invited to the repository with **write** access (never admin), authenticated with its own fine-grained PAT:

- `Pull requests: write` (`pull_requests: write`) — the native review and the audit comment
- `Commit statuses: write` (`repo:status` on a classic PAT) — publish `pair-review` as a commit status
- `Contents: read`

Same secret rule: the PAT lives in the secret store, never in the repository. It costs a seat on paid plans and it does **not** unlock the Checks API (that is App-only), so `pair_review_publication_mode` keeps it on the commit-status form. Verify with `gh api user --jq '.login, .type'` (expect `"User"` for a bot _user_ — which is why a bot user must never be used as the second human approver at 🔴: it would satisfy the predicate while being a machine. **If you run a bot user, keep it out of the repository's human-reviewer set** and treat 🔴 approvals as belonging to real people; the App form has no such footgun because it types as `"Bot"`.)

#### Failure modes, and what each one does

| Situation | `resolve_identity_mode` | Behavior |
| --- | --- | --- |
| Nothing configured (`Review identity: none`) | `session` | Today's mode, in full. Not an error, not reported as a degradation. |
| Configured and the probes pass | `identity` | Native verdict; check run on the App path. |
| Configured, credential invalid / expired | `halt` | **HALT** with a pointer back to this section. Never a session-user fallback. |
| Configured, a permission missing (`403` on a probe) | `halt` | Same — the setup is incomplete, and acting as the human whose token is loaded would misattribute the review. |
| Configured, health unknown (probe not run, network error) | `halt` | Fail-safe: unknown is not healthy. |

Do not "fall back to the session token so the review still runs". A review recorded against the maintainer's account, that the maintainer did not perform, is a worse outcome than a stopped review — and it is exactly the misattribution a dedicated identity exists to prevent.

#### Adoption-gated light auto-approval (off unless declared)

When a repository declares the `light` family in `## Tag Projection` (`tech/risk-matrix.md`), the identity may submit a **native approving review** on a PR that carries the `light` tag, is **below 🔴**, and has already synthesized `ready-to-merge` — so a light PR becomes mergeable with no human action. On a repository that sets `"required_approving_review_count": 1` or more (the payload below ships `0`, so this only bites where a project raised it), that review is what satisfies the host's approvals rule. All four conditions are evaluated by `light_auto_approve_allowed` in [`pr-state.sh`](../../../assets/pr-state.sh); every approval writes the audit comment `identity_audit_comment` renders. **Nothing here reads the change**: the row consumes a tag and a declaration (D18).

Two containments are worth stating on the host page, because this is where someone will try to shortcut them:

- **The declaration is the gate, not the label.** A hand-applied `light` label on a repository that declares no `light` projection triggers nothing. Do not add the label family to the repository "so the flow can use it" — provisioning a label is not declaring a projection.
- **It never touches 🔴.** `required_approving_review_count` is a _host_ rule; `pair-explicit-approval` is the pair rule, and it still demands a human. A `light` label on a `risk:red` PR is inert.

### Provision the `pr-state:*` labels (once per repository)

Labels are never auto-created: `gh pr edit --add-label pr-state:to-be-reviewed` fails with `not found` until they exist.

```bash
gh label create "pr-state:to-be-reviewed" --color "fbca04" --description "PR open, not yet cleared" --force
gh label create "pr-state:ready-to-merge" --color "0e8a16" --description "Gates green + review approved (+ explicit human approval at red)" --force
gh label create "pr-state:not-approved"   --color "d73a4a" --description "Review verdict: CHANGES-REQUESTED" --force
```

Run this before the first `/pair-capability-publish-pr`. **Non-blocking**: if the labels are absent or the label API is unavailable, the flow reports the gap and continues — the label is only a view, and the required checks remain the merge authority.

### Publish the `pair-review` status on the head commit

```bash
# Register it pending at PR creation (merge is blocked from t0, even if the review crashes)
gh api "repos/$REPO/statuses/$HEAD_SHA" -X POST \
  -f state='pending' -f context='pair-review' \
  -f description='Review dispatched — merge blocked until the verdict lands'

# Publish the verdict (success | failure), mapped by review_check_conclusion
source .pair/knowledge/assets/pr-state.sh
STATE="$(review_check_conclusion "$VERDICT")"   # approved|tech-debt ⇒ success · changes-requested ⇒ failure
[ "$STATE" = pending ] && { echo "no decision yet — leaving the pending status in place"; exit 0; }
gh api "repos/$REPO/statuses/$HEAD_SHA" -X POST \
  -f state="$STATE" -f context='pair-review' \
  -f description="$(printf '%.140s' "$VERDICT_SUMMARY")" \
  -f target_url="$REVIEW_URL"
```

`review_check_conclusion` returns `pending` when the review produced no decision — the guard above is mandatory: never overwrite the pending status with a resolved one, so the required context stays unsatisfied and the merge stays blocked. (`description` is capped at 140 characters by the API; the full report lives in the native review that `target_url` points at.)

If the POST is refused (`403`/`404` — token without `repo:status`), enforcement degrades to **advisory**: the verdict is still recorded in the native review and the `pr-state:*` label is still computed, and the skill reports `pair-review: NOT PUBLISHED — advisory` instead of claiming the merge is blocked.

### `pair-explicit-approval` job (🔴 only, auto-passes below)

Reads the `risk:*` label only (D18, fail-safe red) and asserts a **human** approval — the pair review's own submission never satisfies it, and `dismiss_stale_reviews` keeps it from surviving a force-push.

Five properties are load-bearing and easy to get wrong; all five are encoded in the template below, and the first four were **verified on a live repository** (§ Verified on a throwaway repository).

1. **The job must run from a trusted ref.** This job is an **authorization control**, so its code must not come from the change it authorizes. On a `pull_request` event GitHub runs the **PR's own** version of the workflow file, and `actions/checkout` with the default ref checks out the PR's tree — so a PR could **tamper** with the job body or with the sourced `explicit_approval_required()` and make the required context report `success` with no human approval, i.e. **self-grant** the 🔴 gate. That is not theoretical: it was reproduced (a `risk:red` PR shipping a neutered `explicit_approval_required` published `pair-explicit-approval=success — tier red — explicit approval not required` on its own head). `pull_request_target` runs the **base** version of the workflow, and pinning the checkout to `github.event.pull_request.base.sha` makes the sourced assets base versions too. The pin matters for the review trigger as well: on `pull_request_review` the workflow _file_ comes from the default branch, but `GITHUB_REF` is `refs/pull/<n>/merge`, so a **default checkout there also lands on the PR's merged tree**. Distinguish this from workflows whose job body only _narrows_ what is tested — there tampering weakens a check; here it would remove an authorization control.
2. **The verdict must be pinned to the PR head commit.** Branch protection evaluates required contexts **on the head SHA**, and `$GITHUB_SHA` is _not_ that commit for either trigger — measured: `pull_request_target` ⇒ the base branch tip, `pull_request_review` ⇒ the ephemeral `refs/pull/<n>/merge` commit. A job that published against `$GITHUB_SHA` would report on a commit the PR's protection never reads, leaving a 🔴 PR blocked _after_ the human approves. The job therefore `POST`s a **commit status** pinned to `github.event.pull_request.head.sha`, which is deterministic and independent of any event-to-SHA association (that is why the workflow needs `statuses: write`). GitHub _does_ currently attach a run's own check-run to the PR head for both triggers (measured), but that association is incidental where this one is explicit.
3. **One producer per required context.** The job is therefore named `explicit-approval-gate`, **not** `pair-explicit-approval`: the required context is the commit status it posts, and giving a check-run the same name would leave two independent producers writing one context. The job's own check-run stays as unrequired, human-readable detail.
4. **Only the newest evaluation may publish.** Two label mutations seconds apart (e.g. `--remove-label risk:yellow --add-label risk:red`) fire two events, and without a concurrency guard a slower older run can overwrite the newer verdict — observed: a stale run re-published the previous tier's result _after_ the current one. A `concurrency` group with `cancel-in-progress` plus a **fresh label read** (the event payload's label list is a snapshot; the API's is current) makes the verdict of the last **completed** evaluation the one that stands. Runs that never complete are property 5's job.
5. **An interrupted evaluation must leave the context blocking.** A job that publishes only at the end leaves the **previous** status standing when it dies mid-flight — and the previous status can be a `success` from a lower tier, so a 🟡 → 🔴 raise whose evaluation is cancelled (`cancel-in-progress`) or aborted (`set -euo pipefail` on a transient `gh` failure, or the base branch not yet carrying `tier-resolve.sh`/`pr-state.sh`) would silently keep the merge enabled at 🔴 with no human approval. Nothing required reports red in that state, because the job's own check-run is deliberately not a required context (property 3). The job therefore posts **`state=pending` on the head SHA as its very first step**, before resolving anything: an interrupted evaluation leaves a pending — i.e. merge-blocking — context, and only a completed one resolves it. Same pending-first pattern `pair-review` already uses. (An `if: ${{ failure() }}` publish step is weaker: it does not run on hard cancellation.)

```yaml
name: pair-explicit-approval
on:
  # `pull_request_target`, NOT `pull_request`: the workflow file and the sourced
  # assets must come from the BASE branch (property 1 above).
  pull_request_target:
    # `labeled`/`unlabeled` are REQUIRED: a tier raised mid-review (🟡 → 🔴) must
    # re-evaluate and re-block until a human approval is recorded.
    types: [opened, synchronize, reopened, labeled, unlabeled]
  pull_request_review:
    types: [submitted, dismissed]

# Only the NEWEST evaluation may publish (property 4): two label mutations seconds
# apart race, and a stale run must never overwrite the current verdict.
concurrency:
  group: pair-explicit-approval-${{ github.event.pull_request.number }}
  cancel-in-progress: true

# Least privilege. `statuses: write` is what lets the job pin its verdict to the PR
# head commit (property 2); nothing here ever checks out or executes PR code.
permissions:
  contents: read
  pull-requests: read
  statuses: write

jobs:
  # NOT named `pair-explicit-approval` (property 3): the required context is the
  # head-pinned commit status this job posts, and one context = one producer.
  explicit-approval-gate:
    runs-on: ubuntu-latest
    steps:
      # PENDING FIRST (property 5), before anything that can fail or be cancelled:
      # a run that dies later must not leave a previous `success` standing. No
      # checkout needed — this step only writes the blocking placeholder.
      - env:
          GH_TOKEN: ${{ secrets.GITHUB_TOKEN }}
          REPO: ${{ github.repository }}
          HEAD_SHA: ${{ github.event.pull_request.head.sha }}
        run: |
          gh api "repos/$REPO/statuses/$HEAD_SHA" -X POST \
            -f state='pending' -f context='pair-explicit-approval' \
            -f description='evaluating tier + human approval on this head'
      - uses: actions/checkout@v4
        with:
          # TRUSTED REF — the base commit, never the PR head. This is what makes the
          # two sourced functions untamperable from the pull request's side.
          ref: ${{ github.event.pull_request.base.sha }}
          persist-credentials: false
      - env:
          GH_TOKEN: ${{ secrets.GITHUB_TOKEN }}
          REPO: ${{ github.repository }}
          PR: ${{ github.event.pull_request.number }}
          PR_AUTHOR: ${{ github.event.pull_request.user.login }}
          HEAD_SHA: ${{ github.event.pull_request.head.sha }}
        run: |
          set -euo pipefail
          source .pair/knowledge/assets/tier-resolve.sh   # tags only, no criteria
          source .pair/knowledge/assets/pr-state.sh
          # Labels read FRESH from the API (property 4), not from the event payload:
          # a payload snapshot is stale the moment a second label event lands.
          PR_LABELS="$(gh pr view "$PR" --repo "$REPO" --json labels --jq '[.labels[].name] | join(" ")')"
          TIER="$(resolve_tier "$PR_LABELS")"
          STATE=success
          DESC="tier $TIER — explicit approval not required"
          if explicit_approval_required "$TIER"; then
            # A HUMAN approval on the CURRENT head: exclude bots and the PR author.
            # The predicate is NOT written out here — it is `human_approval_jq_filter`
            # from the sourced pr-state.sh, so this job and the tests that verify it
            # read one text and cannot drift (it rejects non-APPROVED, another commit,
            # `user.type != "User"`, and the author's own approval).
            # Use the REST reviews endpoint — it is the only one carrying BOTH the
            # account type and the reviewed commit. `gh pr view --json reviews` exposes
            # `author.login` and NO bot flag whatsoever, so filtering there on a
            # bot-exclusion field matches nothing and silently yields 0 approvals.
            # `--paginate` (no per_page cap): reviews accumulate over a PR's life, so
            # the approval can sit on page 2 — a single page would read it as zero and
            # block the PR forever. Aggregate by counting the paginated stream.
            APPROVALS="$(gh api --paginate "repos/$REPO/pulls/$PR/reviews" \
              --jq "$(human_approval_jq_filter)" | grep -c . || true)"
            if [ "${APPROVALS:-0}" -ge 1 ]; then
              DESC="explicit human approval recorded on the current head"
            else
              STATE=failure
              DESC="risk:red — needs an explicit human approval on the current head (D10)"
            fi
          fi
          # Pin the context to the PR head commit (property 2). Publish BEFORE failing
          # the job, so the required context always reports.
          gh api "repos/$REPO/statuses/$HEAD_SHA" -X POST \
            -f state="$STATE" -f context='pair-explicit-approval' \
            -f description="$(printf '%.140s' "$DESC")"
          [ "$STATE" = success ] || { echo "::error::$DESC"; exit 1; }
```

**Residual caveats of the trusted-ref form**, stated explicitly rather than assumed away:

- **Forks.** With `pull_request_target` the workflow runs in the **base** repository's context with a write-capable `GITHUB_TOKEN`, which is only safe because this job **never checks out or executes head-ref code** — the checkout is pinned to `base.sha` and no step runs anything from the PR. Never add a step here that builds, installs, or runs the PR's code; put that in the ordinary `pull_request` gate pipeline, which has a read-only token on forks. Conversely, a plain `pull_request` run from a fork gets a **read-only** token and could not `POST` the status at all — another reason for the target trigger.
- **Base-branch assets.** `tier-resolve.sh` and `pr-state.sh` are sourced from the base commit, so they must already exist on the base branch: the workflow is added and observed **before** protection is applied (ordering below), and a PR that only _introduces_ those assets cannot satisfy the context on its own.
- **Projects that refuse `pull_request_target` entirely** (a common blanket policy) get the same guarantee by keeping the plain `pull_request` trigger and writing the projections **inline** in the job body — `resolve_tier` / `explicit_approval_required` are a handful of `case` lines and `human_approval_jq_filter` is one string — with no checkout step at all, so there is nothing from the PR's tree to tamper with. The cost is a second copy of the projection, which must then be kept in sync with the shipped assets (a conformance grep is the usual mitigation).

### Branch protection payload

Use the **`checks` form**, not the legacy `contexts` array: `contexts` accepts a status from _any_ source, while each `checks[]` entry may pin an `app_id` — which is what keeps a user/PAT-posted status from satisfying the authorization gate (see § What each context proves).

```bash
# The producer of `pair-explicit-approval` is the GitHub Actions app (the job posts the
# status with the default GITHUB_TOKEN). Resolve its id rather than hardcoding it:
ACTIONS_APP_ID="$(gh api /apps/github-actions --jq .id)"   # 15368 on github.com

gh api "repos/$REPO/branches/main/protection" -X PUT --input - <<JSON
{
  "required_status_checks": {
    "strict": false,
    "checks": [
      { "context": "base" },
      { "context": "secret-scan" },
      { "context": "pair-review" },
      { "context": "pair-explicit-approval", "app_id": $ACTIONS_APP_ID }
    ]
  },
  "required_pull_request_reviews": {
    "dismiss_stale_reviews": true,
    "required_approving_review_count": 0,
    "require_code_owner_reviews": true
  },
  "enforce_admins": false,
  "allow_force_pushes": false,
  "restrictions": null
}
JSON
```

`"enforce_admins": false` is **deliberate in this payload** — copy-paste as written. It is flipped to `true` only in ordering step 4 below, once one PR has actually merged through the rule; shipping `true` here walks straight into the "every PR blocked with no escape hatch" trap described in the next bullets.

- **`app_id` on `pair-explicit-approval` is the producer pin.** Without it (or with the legacy `contexts` array) the required context is satisfied by _whoever posts it last_, including `gh api …/statuses/$HEAD_SHA -f state=success -f context='pair-explicit-approval'` run with the agent's own token — the 🔴 human gate self-granted in one command. With the pin, only a status from the GitHub Actions app counts. `pair-review` is deliberately left **unpinned**: it is published by the agent's ordinary token, i.e. not by an app, so pinning it would make it unsatisfiable. That check is an anti-accident control, not an authorization control (§ What each context proves).
- **`require_code_owner_reviews: true` + a `CODEOWNERS` entry for `/.github/workflows/**`** is the companion that keeps a PR from shipping its own status-writing workflow. It bites only on PRs touching owned paths, and it needs a code owner **other than the author** to be effective — the same second-account prerequisite as 🔴 itself. Omit it (and accept the residual, recorded) on a single-maintainer repository.
- **`required_approving_review_count: 0` is explicit on purpose.** The approval authority is the tier-scoped `pair-explicit-approval` job, not a blanket host rule. Leaving the field unset lets an unstated API default decide, and a default of ≥1 would demand a human approving review on **every** PR — contradicting quality-model §4's 🟢 "self-merge once gate checks are green" row and making the tier-scoped job redundant.
- **`"strict": false`** — the branch does not have to be up to date with the base. With `strict: true` every base update rewrites the head, and `pair-review` is published **per head commit**, so each base update voids the verdict and demands a fresh agent review: churn bordering on livelock on a busy `main`. Enable `strict` only if the project accepts re-earning the review check on every base update (and pair with an auto-update bot).
- `dismiss_stale_reviews: true` invalidates a human approval after a force-push. It is belt-and-braces: `pair-explicit-approval` already pins the approval to the current head (`commit_id == HEAD_SHA`), so the 🔴 requirement is head-scoped even without it (edge case in [pr-states.md](pr-states.md)).
- `enforce_admins: true` removes the admin bypass — flip it on only **after** both contexts have been observed reporting on a real PR and one PR has merged through the rule (ordering below); a required context that never reports leaves every PR blocked with no escape hatch.
- Add the tier-scoped suite contexts (`unit`, `integration`, `e2e`) when the project runs them — on GitHub a job skipped via `if:` reports its required check as successful, so lower-tier PRs stay mergeable.

### Ordering: add the job, observe the contexts, then protect

Applying branch protection **before** the two contexts ever report makes every PR permanently unmergeable — a required context that has never reported stays pending forever, and `enforce_admins: true` removes the bypass. Apply in this order:

1. **Provision** the `pr-state:*` labels and add the `pair-explicit-approval` workflow to the repository (neither needs admin scope). The workflow must be on the **base** branch — that is where `pull_request_target` reads it from. If the flow is meant as an authorization control, apply the two companion settings now as well (workflow permissions → read-only, `CODEOWNERS` on `/.github/workflows/**`) — see § What each context proves.
2. **Observe at PR open** on a real PR — both contexts must appear on the **head commit**, which is the only commit protection evaluates:

   ```bash
   gh api "repos/$REPO/commits/$HEAD_SHA/status" --jq '.statuses[].context'
   # expect: pair-review  AND  pair-explicit-approval
   ```

3. **Observe the approval-time re-run** — this is the failure mode the head-pinned status exists for. Submit a review on that PR (any `pull_request_review` submission triggers the job), then re-run the same command and confirm the `pair-explicit-approval` context re-reports **on the same head SHA** with an updated timestamp. If it were left to the workflow run's own check, the re-run would land on the base branch's commit and the PR would stay blocked _after_ the human approval — the same "permanently unmergeable" trap, one step later. Also confirm the `pair-review` context still reflects the latest verdict on that head.
4. **Protect**: `PUT` the payload above with those contexts, keeping `enforce_admins: false`; flip it to `true` only after one PR has merged through the new rule.

**Second human account prerequisite.** At 🔴 the job demands a **non-author** human approving review, and GitHub rejects an approving review from the PR author. On a **single-maintainer** repository no 🔴 PR can therefore satisfy it: either keep the `pair-explicit-approval` context out of the required list there, or add a second human reviewer account. See [pr-states.md](pr-states.md) § Edge cases.

### Verified on a throwaway repository (2026-07-30)

The recipe above is not a design sketch: every branch of it was executed end-to-end on a disposable repository (labels → workflow → contexts observed → protection `PUT` with `enforce_admins: true` → one PR per tier). What the host actually did:

| Scenario | Merge attempt result (`gh pr merge --admin`) |
| --- | --- |
| 🟢, `pair-review` **pending** | blocked — `Required status check "pair-review" is pending.` |
| 🟢, `pair-review` **failure** (CHANGES-REQUESTED) | blocked — `Required status check "pair-review" is failing.` |
| 🟢, `pair-review` **success**, approval context success | **merged** (self-merge at 🟢 with `required_approving_review_count: 0`) |
| 🔴, no `pair-review` published at all | blocked — `2 of 2 required status checks have not succeeded: 1 expected and 1 failing.` (a never-reported context blocks exactly like a red one) |
| 🔴, no human approval | `pair-explicit-approval=failure`, merge blocked |
| 🟡 → 🔴 raise via `labeled`/`unlabeled` | context flipped `success` → `failure` within one run, merge re-blocked |
| review submitted (`pull_request_review`) | the context **re-reported on the same head SHA** (timestamp advanced) — the approval-time re-run lands where protection reads it |
| PR shipping a neutered `explicit_approval_required` **and** an `exit 0` in the job body | context still `failure`, merge still blocked — the base-pinned checkout ignores the PR's version. With the pre-fix `pull_request` + default-checkout form the same tamper published `pair-explicit-approval=success — tier red — explicit approval not required` |
| direct push to the protected branch | rejected — `Changes must be made through a pull request` |

Two things remain **unverified by construction** and stay documented rather than claimed: a _successful_ 🔴 path (it needs a second human account to approve — see below), and any fork-specific behaviour (the sandbox had no forks). The producer pin (`checks[].app_id`), the companion workflow-permission settings and the pending-first step were added **after** that session and are likewise **not** in the table.

**What this table is.** A **point-in-time observation** on a disposable repository, retained as prose: the sandbox was deleted, so no run URL, PR number or API dump is re-checkable, and the table is not evidence a reader can audit. It is re-verified the only durable way — by **re-running the ordering steps above on the adopting repository** (steps 2 and 3 reproduce the two rows that matter most: both contexts on the head SHA, and the approval-time re-run). Treat any row that contradicts what your own repository does as stale, not as authority.

### Degraded mode

Three independent degradations — each **reported**, never assumed away:

| What is refused | Effect | Reported as |
| --- | --- | --- |
| **Status publication** (`403`/`404` — token without `repo:status`) | the verdict lives only in the native review; nothing mechanical blocks the merge | `pair-review: NOT PUBLISHED — advisory` |
| **Label API** (no permission, labels absent) | the `pr-state:*` view is missing; the required checks stay the authority | `pr-state label: not applied` (non-blocking) |
| **Branch protection** (no admin token, or a host/plan lacking the API) | checks are published but nothing blocks the merge button | `/pair-capability-setup-gates`: `DEGRADED — enforcement advisory` |

For the last one, apply the same contexts manually — repository **Settings → Branches → Branch protection rules → Require status checks to pass** — and record the gap until then; `/pair-capability-setup-gates` reports it rather than pretending the flow is enforced.

## Related Resources

- **[PR state flow (gate ≠ review)](pr-states.md)** — the state model these checks enforce
- **[GitHub Projects Documentation](https://docs.github.com/en/issues/planning-and-tracking-with-projects)**
- **[GitHub Actions Documentation](https://docs.github.com/en/actions)**
- **[MCP GitHub Server Guide](https://github.com/github/github-mcp-server)**

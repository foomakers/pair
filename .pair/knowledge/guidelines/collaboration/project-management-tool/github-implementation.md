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
| Refined → In Progress | Implementation starts | `/pair-process-implement` via `/pair-capability-write-issue $status: In Progress` |
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
| `pair-review` | `/pair-process-review`, as a **commit status** (registered `pending` at PR creation by `/pair-capability-publish-pr`) | `success` on APPROVED/TECH-DEBT, `failure` on CHANGES-REQUESTED, `pending` when the review has not produced a decision (never ran, crashed, timed out) |
| `pair-explicit-approval` | a workflow job (below) | `success` when the tier does not require explicit approval, or when a **human** approving review exists on the current head; `failure` at 🔴 without one |

Both are **required status checks** — a `pending` or absent required check blocks the merge on GitHub exactly like a failing one, which is what makes the review unskippable (R5.7).

**Token prerequisite (why a commit status, not a check run).** The Checks API (`POST /repos/{owner}/{repo}/check-runs`) is writable **only by a GitHub App installation token**: with an ordinary user token or PAT it answers `403 You must authenticate via a GitHub App`. The skills that publish the verdict (`/pair-capability-publish-pr` Phase 5, `/pair-process-review` Step 5.4) run agent-side with exactly that ordinary token, so a check run is not an option for them. The **commit-statuses API** accepts the same token and branch protection treats a status **context** as a required check identically. The token needs `repo:status` (classic PAT) / `Commit statuses: write` (fine-grained); inside a workflow that is `permissions: statuses: write`. If a project does publish through a GitHub App instead, keep the check-run form — but then the publication must happen inside a workflow holding `checks: write`, plus a relay that carries the agent's verdict there.

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
HEAD_SHA="$(gh pr view "$PR" --json headRefOid -q .headRefOid)"

# Register it pending at PR creation (merge is blocked from t0, even if the review crashes)
gh api "repos/$OWNER/$REPO/statuses/$HEAD_SHA" -X POST \
  -f state='pending' -f context='pair-review' \
  -f description='Review dispatched — merge blocked until the verdict lands'

# Publish the verdict (success | failure), mapped by review_check_conclusion
source .pair/knowledge/assets/pr-state.sh
STATE="$(review_check_conclusion "$VERDICT")"   # approved|tech-debt ⇒ success · changes-requested ⇒ failure
[ "$STATE" = pending ] && { echo "no decision yet — leaving the pending status in place"; exit 0; }
gh api "repos/$OWNER/$REPO/statuses/$HEAD_SHA" -X POST \
  -f state="$STATE" -f context='pair-review' \
  -f description="$(printf '%.140s' "$VERDICT_SUMMARY")" \
  -f target_url="$REVIEW_URL"
```

`review_check_conclusion` returns `pending` when the review produced no decision — the guard above is mandatory: never overwrite the pending status with a resolved one, so the required context stays unsatisfied and the merge stays blocked. (`description` is capped at 140 characters by the API; the full report lives in the native review that `target_url` points at.)

If the POST is refused (`403`/`404` — token without `repo:status`), enforcement degrades to **advisory**: the verdict is still recorded in the native review and the `pr-state:*` label is still computed, and the skill reports `pair-review: NOT PUBLISHED — advisory` instead of claiming the merge is blocked.

### `pair-explicit-approval` job (🔴 only, auto-passes below)

Reads the `risk:*` label only (D18, fail-safe red) and asserts a **human** approval — the pair review's own submission never satisfies it, and `dismiss_stale_reviews` keeps it from surviving a force-push.

```yaml
name: pair-explicit-approval
on:
  pull_request:
    # `labeled`/`unlabeled` are REQUIRED: a tier raised mid-review (🟡 → 🔴) must
    # re-evaluate and re-block until a human approval is recorded.
    types: [opened, synchronize, reopened, labeled, unlabeled]
  pull_request_review:
    types: [submitted, dismissed]

# Least privilege: read the PR's reviews, nothing more. (Add `statuses: write` only
# if this same workflow is also made responsible for publishing `pair-review`.)
permissions:
  contents: read
  pull-requests: read

jobs:
  pair-explicit-approval:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - env:
          GH_TOKEN: ${{ secrets.GITHUB_TOKEN }}
          REPO: ${{ github.repository }}
          PR_LABELS: ${{ join(github.event.pull_request.labels.*.name, ' ') }}
          PR: ${{ github.event.pull_request.number }}
          PR_AUTHOR: ${{ github.event.pull_request.user.login }}
          HEAD_SHA: ${{ github.event.pull_request.head.sha }}
        run: |
          set -euo pipefail
          source .pair/knowledge/assets/tier-resolve.sh   # tags only, no criteria
          source .pair/knowledge/assets/pr-state.sh
          TIER="$(resolve_tier "$PR_LABELS")"
          if ! explicit_approval_required "$TIER"; then
            echo "tier $TIER — explicit approval not required"; exit 0
          fi
          # A HUMAN approval on the CURRENT head: exclude bots and the PR author.
          # Use the REST reviews endpoint — it is the only one carrying BOTH the
          # account type and the reviewed commit. `gh pr view --json reviews` exposes
          # `author.login` and NO bot flag whatsoever, so filtering there on a
          # bot-exclusion field matches nothing and silently yields 0 approvals.
          APPROVALS="$(gh api "repos/$REPO/pulls/$PR/reviews?per_page=100" \
            --jq '[.[] | select(.state=="APPROVED" and .commit_id==env.HEAD_SHA
                   and .user.type=="User" and .user.login!=env.PR_AUTHOR)] | length')"
          [ "${APPROVALS:-0}" -ge 1 ] || {
            echo "::error::risk:red PR requires an explicit human approval on the current head (D10)"
            exit 1
          }
```

### Branch protection payload

```bash
gh api "repos/$OWNER/$REPO/branches/main/protection" -X PUT --input - <<'JSON'
{
  "required_status_checks": {
    "strict": false,
    "contexts": ["base", "secret-scan", "pair-review", "pair-explicit-approval"]
  },
  "required_pull_request_reviews": {
    "dismiss_stale_reviews": true,
    "required_approving_review_count": 0
  },
  "enforce_admins": true,
  "allow_force_pushes": false,
  "restrictions": null
}
JSON
```

- **`required_approving_review_count: 0` is explicit on purpose.** The approval authority is the tier-scoped `pair-explicit-approval` job, not a blanket host rule. Leaving the field unset lets an unstated API default decide, and a default of ≥1 would demand a human approving review on **every** PR — contradicting quality-model §4's 🟢 "self-merge once gate checks are green" row and making the tier-scoped job redundant.
- **`"strict": false`** — the branch does not have to be up to date with the base. With `strict: true` every base update rewrites the head, and `pair-review` is published **per head commit**, so each base update voids the verdict and demands a fresh agent review: churn bordering on livelock on a busy `main`. Enable `strict` only if the project accepts re-earning the review check on every base update (and pair with an auto-update bot).
- `dismiss_stale_reviews: true` invalidates a human approval after a force-push. It is belt-and-braces: `pair-explicit-approval` already pins the approval to the current head (`commit_id == HEAD_SHA`), so the 🔴 requirement is head-scoped even without it (edge case in [pr-states.md](pr-states.md)).
- `enforce_admins: true` removes the admin bypass — apply it only **after** both contexts have been observed reporting on a real PR (ordering below); a required context that never reports leaves every PR blocked with no escape hatch.
- Add the tier-scoped suite contexts (`unit`, `integration`, `e2e`) when the project runs them — on GitHub a job skipped via `if:` reports its required check as successful, so lower-tier PRs stay mergeable.

### Ordering: add the job, observe the contexts, then protect

Applying branch protection **before** the two contexts ever report makes every PR permanently unmergeable — a required context that has never reported stays pending forever, and `enforce_admins: true` removes the bypass. Apply in this order:

1. **Provision** the `pr-state:*` labels and add the `pair-explicit-approval` workflow to the repository (neither needs admin scope).
2. **Observe** on a real PR: `gh api "repos/$OWNER/$REPO/commits/$HEAD_SHA/status" --jq '.statuses[].context'` must list `pair-review`, and the Checks tab must show `pair-explicit-approval`. Publishing the status and querying the reviews need no admin scope — only the protection `PUT` does.
3. **Protect**: `PUT` the payload above with those contexts, keeping `enforce_admins: false` until one PR has merged through the new rule.

**Second human account prerequisite.** At 🔴 the job demands a **non-author** human approving review, and GitHub rejects an approving review from the PR author. On a **single-maintainer** repository no 🔴 PR can therefore satisfy it: either keep the `pair-explicit-approval` context out of the required list there, or add a second human reviewer account. See [pr-states.md](pr-states.md) § Edge cases.

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

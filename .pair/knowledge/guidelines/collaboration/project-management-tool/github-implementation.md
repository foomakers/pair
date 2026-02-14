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
gh issue create --project [PROJECT_ID]
gh pr create --project [PROJECT_ID]
```

### API Integration

- Custom automation via GitHub API
- Integration with external tools
- Reporting and analytics workflows
- Custom dashboard creation

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

GitHub supports three merge methods. The adopted strategy is configured in [way-of-working.md](../../../adoption/tech/way-of-working.md) under the Merge Strategy section.

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

### Story Status Update

Update issue status in GitHub Projects board after merge.

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

# Update project board status (if automation doesn't handle it)
gh project item-edit --project-id [ID] --id [ITEM_ID] --field-id [STATUS_FIELD_ID] --single-select-option-id [DONE_OPTION_ID]
```

## Related Resources

- **[GitHub Projects Documentation](https://docs.github.com/en/issues/planning-and-tracking-with-projects)**
- **[GitHub Actions Documentation](https://docs.github.com/en/actions)**
- **[MCP GitHub Server Guide](https://github.com/github/github-mcp-server)**

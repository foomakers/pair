# GitHub Issues

GitHub Issues workflow and configuration for comprehensive issue management integrated with project tracking.

## Overview

This guide covers GitHub Issues setup and workflows for managing user stories, tasks, bugs, and feature requests within the pair development framework.

## Issue Types and Labels

### Type Labels (Always Recommended)

- `user story` (color: `#1d76db`) - User Story
- `task` (color: `#0e8a16`) - Development Task
- `bug` (color: `#d73a4a`) - Bug Report
- `feature` (color: `#a2eeef`) - Feature Request
- `epic` (color: `#7057ff`) - Epic (for epic breakdown)

> **Note**: Priority and status management have multiple options. See [Status and Priority Management Options](#status-and-priority-management-options) section below to choose the best approach for your team.

## Basic Label Creation

**Primary Method (via MCP GitHub Server):**

```bash
pair "Create GitHub repository labels for issue types: user story, task, bug, feature, epic"
```

**Fallback Method (GitHub CLI):**

```bash
# Create type labels (always needed)
gh label create "user story" --color "1d76db" --description "User Story"
gh label create "task" --color "0e8a16" --description "Development Task"
gh label create "bug" --color "d73a4a" --description "Bug Report"
gh label create "feature" --color "a2eeef" --description "Feature Request"
gh label create "epic" --color "7057ff" --description "Epic"

```

## Working with User Stories

### Creating User Stories

**Via MCP GitHub Server:**

```bash
pair "Create a new user story: 'As a user, I want to [functionality] so that [benefit]' with priority P1 and add to project board"
```

**Via GitHub CLI:**

```bash
gh issue create --title "User Story: [Title]" --body "[Description]" --label "user story,P1"
```

### User Story Template

```markdown
# User Story: [Title]

## Description

As a [user type], I want [functionality] so that [benefit].

## Acceptance Criteria

- [ ] Criterion 1
- [ ] Criterion 2
- [ ] Criterion 3

## Definition of Done

- [ ] Code implemented and tested
- [ ] Documentation updated
- [ ] Peer review completed
- [ ] Product owner acceptance

## Related Items

- Epic: #[epic_number]
- Related Stories: #[story_number]

## Notes

[Additional context or requirements]
```

## Working with Tasks

### Task Creation from User Stories

**Via MCP GitHub Server:**

```bash
pair "Break down user story #[story_number] into development tasks and create GitHub issues for each task"
```

**Manual Task Creation:**

```bash
gh issue create --title "Task: [Title]" --body "[Description]" --label "task,P1" --milestone "[Sprint]"
```

### Task Template

```markdown
# Task: [Title]

## Description

[Technical description of what needs to be implemented]

## Acceptance Criteria

- [ ] Technical requirement 1
- [ ] Technical requirement 2
- [ ] Testing completed

## Implementation Notes

- [Technical considerations]
- [Dependencies or blockers]
- [Estimated effort]

## Parent User Story

Related to: #[user_story_number]

## Definition of Done

- [ ] Code implemented
- [ ] Unit tests written
- [ ] Code review completed
- [ ] Integration testing passed
```

## Status and Priority Management Options

> **🎯 Important Decision Point**: GitHub Issues offers multiple approaches for managing status and priority. There is no single "correct" way - choose the approach that best fits your team's workflow, size, and GitHub Projects usage.

GitHub Issues provides multiple approaches for managing status and priority. Choose the approach that best fits your team's workflow and GitHub Projects setup.

### Option 1: Label-Based Management (Simple)

**Best For**: Small teams, simple workflows, teams not using GitHub Projects

**Status via Labels:**

```bash
# Create status labels
gh label create "todo" --color "fbca04" --description "Ready to start"
gh label create "in-progress" --color "0e8a16" --description "Currently being worked on"
gh label create "in-review" --color "d4c5f9" --description "Under code review"
gh label create "done" --color "0075ca" --description "Completed work"
```

**Priority via Labels:**

```bash
# Priority labels (only if using label-based approach)
gh label create "P0" --color "d73a4a" --description "Must-Have priority"
gh label create "P1" --color "fbca04" --description "Should-Have priority"
gh label create "P2" --color "0075ca" --description "Could-Have priority"
```

**Advantages:**

- Simple to implement and understand
- Works with any GitHub plan
- Visible in issue lists and searches
- Easy filtering with GitHub's label filters

**Disadvantages:**

- Manual label management required
- Less visual workflow representation
- No automatic status transitions
- Can lead to label proliferation

### Option 2: GitHub Projects Board Columns (Visual)

**Best For**: Teams using GitHub Projects, visual workflow preference

**Status via Board Columns:**

```markdown
Board Columns:

- **Backlog** - New issues, not yet prioritized
- **Todo** - Prioritized and ready to start
- **In Progress** - Currently being worked on
- **In Review** - Under code review or testing
- **Done** - Completed and accepted work
```

**Priority via Board Position:**

- Higher priority items placed at top of columns
- Use GitHub Projects sorting and filtering
- Manual drag-and-drop prioritization

**Example Priority Management:**

```bash
# Via GitHub Projects (recommended for visual teams)
pair "Set issue #123 to high priority by moving to top of Todo column"
pair "Organize backlog by priority with P0 items at top"

# Via labels (if using label-based approach)
gh issue edit 123 --add-label "P0"
```

**Advantages:**

- Visual workflow representation
- Drag-and-drop status management
- Integrated with GitHub Projects
- Clear workflow visualization

**Disadvantages:**

- Requires GitHub Projects setup
- Status not visible in issue lists
- Manual board management required
- Less searchable than labels

### Option 3: GitHub Projects Custom Fields (Advanced)

**Best For**: Teams needing detailed metadata, complex workflows, GitHub Projects users

**Status via Custom Fields:**

```bash
# Create Status custom field via GitHub Projects
Field Name: Status
Type: Single Select
Options:
- Todo (🔵)
- In Progress (🟡)
- In Review (🟠)
- Done (🟢)
- Blocked (🔴)
```

**Priority via Custom Fields:**

```bash
# Create Priority custom field
Field Name: Priority
Type: Single Select
Options:
- P0 - Critical (🔴)
- P1 - High (🟡)
- P2 - Medium (🔵)
- P3 - Low (⚪)

# Or use Number field for numeric priority
Field Name: Priority Score
Type: Number
Range: 1-10 (10 = highest priority)
```

**Additional Custom Fields:**

```bash
# Story Points for estimation
Field Name: Story Points
Type: Single Select
Options: 1, 2, 3, 5, 8, 13, 21

# Sprint assignment
Field Name: Sprint
Type: Single Select
Options: Sprint 1, Sprint 2, etc.

# Team assignment
Field Name: Team
Type: Single Select
Options: Frontend, Backend, DevOps, QA
```

**Advantages:**

- Rich metadata and filtering capabilities
- Professional project management features
- Automated workflows possible
- Detailed reporting and analytics

**Disadvantages:**

- Requires GitHub Projects (paid feature for organizations)
- More complex setup and maintenance
- Learning curve for team members
- Potential over-engineering for simple workflows

### Option 4: Hybrid Approach (Recommended)

**Best For**: Most teams, balanced approach with flexibility

**Recommended Setup:**

```markdown
**Labels for Core Information:**

- Type: user story, task, bug, feature, epic
- Priority: P0, P1, P2 (for GitHub Issues search/filter)
- State: refined, blocked (for special states)

**GitHub Projects for Workflow:**

- Board columns for visual status management
- Custom fields for detailed metadata (if needed)
- Automation rules for status transitions

**Custom Fields for Project Data:**

- Story Points (estimation)
- Sprint (iteration planning)
- Team (if multiple teams)
```

**Implementation Strategy:**

1. Start with labels for essential categorization
2. Use GitHub Projects board for workflow management
3. Add custom fields gradually as needs emerge
4. Implement automation to keep both in sync

## Choosing Your Approach

### Decision Matrix

| Factor               | Labels Only | Board Only | Custom Fields | Hybrid    |
| -------------------- | ----------- | ---------- | ------------- | --------- |
| **Setup Complexity** | Low         | Medium     | High          | Medium    |
| **Visual Workflow**  | Poor        | Excellent  | Excellent     | Excellent |
| **Search/Filter**    | Excellent   | Poor       | Good          | Excellent |
| **Automation**       | Limited     | Good       | Excellent     | Excellent |
| **Cost**             | Free        | Free\*     | Paid\*\*      | Mixed     |
| **Team Size**        | 1-5         | 3-10       | 5+            | Any       |

\*Free for public repos, paid for private org repos
\*\*Requires GitHub Projects which is paid for organizations

### Context-Based Recommendations

#### Small Team (1-5 people), Simple Workflow

```bash
# Option A: Use labels for everything (simple)
pair "Set up GitHub repository with comprehensive labeling system for status and priority management"

# Option B: Use basic GitHub Projects board
pair "Set up simple GitHub Projects board with Todo, In Progress, Done columns"
```

#### Medium Team (5-15 people), Active Development

```bash
# Recommended: Use hybrid approach
pair "Set up GitHub Projects board with status columns and priority labels for comprehensive issue management"

# Alternative: Use board columns for status, custom fields for metadata
pair "Configure GitHub Projects with status columns and priority/estimation custom fields"
```

#### Large Team (15+ people), Complex Projects

```bash
# Recommended: Use full custom fields approach
pair "Configure GitHub Projects with custom fields for status, priority, estimation, and team assignment"

# Include automation for coordination
pair "Set up GitHub Projects automation rules for status transitions and notifications"
```

## Implementation Examples

### Setting Up Hybrid Approach

**Step 1: Create Essential Labels**

```bash
pair "Create GitHub repository labels for issue types and priorities: user story, task, bug, feature, P0, P1, P2"
```

**Step 2: Configure GitHub Projects Board**

```bash
pair "Set up GitHub Projects board with columns: Backlog, Todo, In Progress, In Review, Done"
```

**Step 3: Add Custom Fields (Optional)**

```bash
pair "Add custom fields to GitHub Projects: Story Points (1,2,3,5,8), Sprint (text), Team (Frontend/Backend)"
```

**Step 4: Create Automation Rules**

```bash
# Example automation
When: Issue is assigned
Then: Move to "In Progress" column

When: Pull request is opened and linked to issue
Then: Move issue to "In Review" column

When: Pull request is merged
Then: Move issue to "Done" column
```

### Workflow Examples

#### Using Labels for Status

```bash
# Developer workflow
gh issue edit 123 --add-label "in-progress" --assignee "@me"
gh issue edit 123 --remove-label "in-progress" --add-label "in-review"
gh issue edit 123 --remove-label "in-review" --add-label "done"
```

#### Using Board for Status

```bash
# AI-assisted workflow
pair "Move GitHub issue #123 to In Progress column and assign to current developer"
pair "Update issue #123 status to In Review when pull request is ready"
pair "Complete issue #123 and move to Done when pull request is merged"
```

#### Using Custom Fields for Metadata

```bash
# Project manager workflow
pair "Set issue #123 priority to P1, assign 5 story points, and schedule for Sprint 3"
pair "Update all P0 issues in current sprint and generate status report"
pair "Filter issues by team and sprint for capacity planning"
```

## Status Management

### Legacy Status Updates (when using labels)

**Via MCP GitHub Server:**

```bash
pair "Update GitHub issue #[issue_number] status to 'In Progress' and assign to current developer"
```

**Via Labels:**

```bash
# Move to refinement
gh issue edit [issue_number] --add-label "refined"

# Mark as in progress
gh issue edit [issue_number] --remove-label "refined" --assignee "@me"

# Mark for review
gh issue edit [issue_number] --add-label "needs-review"
```

### GitHub Projects Status Updates (when using board columns)

**Via MCP GitHub Server:**

```bash
pair "Move GitHub issue #[issue_number] to In Progress column in project board"
pair "Update issue status to Done and close when work is completed"
```

**Manual Board Updates:**

- Drag and drop issues between columns
- Use automation rules for status transitions
- Bulk updates via project views and filters

## Integration with Project Boards

### Adding Issues to Projects

**Via MCP GitHub Server:**

```bash
pair "Add GitHub issue #[issue_number] to project board and set status to Todo"
```

**Via GitHub CLI:**

```bash
gh project item-add [project_number] --item [issue_url]
```

### Automated Board Integration

Issues automatically appear on project boards when:

- Created with appropriate labels
- Assigned to team members
- Linked to milestones or projects

## Search and Filtering

### Useful Issue Searches

```bash
# Open user stories ready for development
gh issue list --label "user story,refined" --state open

# High priority tasks assigned to me
gh issue list --label "task,P0" --assignee "@me"

# All blocked items
gh issue list --label "blocked" --state open

# Issues in current sprint
gh issue list --milestone "[Sprint Name]"
```

## Best Practices

### Issue Creation

- Use clear, actionable titles
- Include acceptance criteria for user stories
- Add appropriate labels at creation
- Link to related issues and epics
- Assign to appropriate team members

### Issue Management

- Regular triage and priority review
- Keep issues updated with progress
- Close issues promptly when completed
- Use templates for consistency
- Link pull requests to issues

### Team Coordination

- Use assignees for ownership clarity
- Comment for status updates and questions
- Use @mentions for notifications
- Regular review in team meetings
- Archive or close stale issues

## Troubleshooting

### Common Issues

- **Missing Labels**: Ensure labels are created before use
- **Project Integration**: Verify project permissions and configuration
- **MCP Connection**: Check MCP server status and authentication
- **Automation**: Verify webhook and action configurations

### Getting Help

- GitHub Issues documentation
- MCP server troubleshooting guide
- Team process documentation
- GitHub support resources

## Related Topics

- **[.pair/knowledge/guidelines/collaboration/project-tracking/github-tracking.md](.pair/knowledge/guidelines/collaboration/project-tracking/github-tracking.md)** - Project board integration
- **[.pair/knowledge/guidelines/collaboration/automation/github-automation.md](.pair/knowledge/guidelines/collaboration/automation/github-automation.md)** - Automated workflows
- **[.pair/knowledge/guidelines/collaboration/project-management-tool/github-implementation.md](.pair/knowledge/guidelines/collaboration/project-management-tool/github-implementation.md)** - Overall GitHub setup
- **[.pair/knowledge/guidelines/collaboration/board-management.md](.pair/knowledge/guidelines/collaboration/board-management.md)** - Board setup and optimization strategies

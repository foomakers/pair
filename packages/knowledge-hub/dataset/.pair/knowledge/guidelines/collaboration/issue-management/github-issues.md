# GitHub Issues

GitHub Issues workflow and configuration for comprehensive issue management integrated with project tracking.

## Overview

This guide covers GitHub Issues setup and workflows for managing user stories, tasks, bugs, and feature requests within the pair development framework.

## Issue Types and Labels

### Type Labels
- `user story` (color: `#1d76db`) - User Story
- `task` (color: `#0e8a16`) - Development Task  
- `bug` (color: `#d73a4a`) - Bug Report
- `feature` (color: `#a2eeef`) - Feature Request
- `epic` (color: `#7057ff`) - Epic (for epic breakdown)

### Priority Labels
- `P0` (color: `#d73a4a`) - Must-Have
- `P1` (color: `#fbca04`) - Should-Have  
- `P2` (color: `#0075ca`) - Could-Have

### State Labels
- `refined` (color: `#d4c5f9`) - Ready for Development
- `blocked` (color: `#e4e669`) - Blocked/Waiting
- `needs-review` (color: `#fbca04`) - Needs Review

## Label Creation

**Primary Method (via MCP GitHub Server):**
```bash
pair "Create GitHub repository labels for project management: P0 (red), P1 (yellow), P2 (blue) priorities, and type labels for user story, task, bug, feature"
```

**Fallback Method (GitHub CLI):**
```bash
# Create priority labels
gh label create "P0" --color "d73a4a" --description "Must-Have priority"
gh label create "P1" --color "fbca04" --description "Should-Have priority" 
gh label create "P2" --color "0075ca" --description "Could-Have priority"

# Create type labels
gh label create "user story" --color "1d76db" --description "User Story"
gh label create "task" --color "0e8a16" --description "Development Task"
gh label create "bug" --color "d73a4a" --description "Bug Report"
gh label create "feature" --color "a2eeef" --description "Feature Request"

# Create state labels
gh label create "refined" --color "d4c5f9" --description "Ready for Development"
gh label create "blocked" --color "e4e669" --description "Blocked/Waiting"
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

## Status Management

### Issue Lifecycle
1. **Created** - Initial issue creation
2. **Refined** - Detailed with acceptance criteria (user stories only)
3. **In Progress** - Active development
4. **Review** - Code review and validation
5. **Done** - Completed and accepted

### Manual Status Updates

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

## Priority Management

### Setting Priority

**Via MCP GitHub Server:**
```bash
pair "Set priority P0 for GitHub issue #[issue_number]"
```

**Via GitHub CLI:**
```bash
# Set high priority
gh issue edit [issue_number] --add-label "P0"

# Change priority
gh issue edit [issue_number] --remove-label "P1" --add-label "P0"
```

### Priority Guidelines
- **P0**: Critical bugs, blocking issues, must-have features
- **P1**: Important features, significant bugs, should-have items  
- **P2**: Nice-to-have features, minor bugs, could-have items

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

- **[../project-tracking/github-tracking.md](../project-tracking/github-tracking.md)** - Project board integration
- **[../automation/github-automation.md](../automation/github-automation.md)** - Automated workflows
- **[../project-management-tool/github-tool.md](../project-management-tool/github-tool.md)** - Overall GitHub setup
# GitHub Project Tracking

GitHub Projects board configuration and hierarchical project tracking for comprehensive project management.

## Overview

This guide covers GitHub Projects setup for tracking initiatives, epics, user stories, and tasks with comprehensive progress monitoring and reporting capabilities.

## Project Board Setup

### Initial Project Creation

1. **Access GitHub Projects**: Go to `https://github.com/orgs/[ORG]/projects`
2. **Create New Project**: Click "New project" → "Board"
3. **Configure Basic Settings**: Set project name and description

### Recommended Board Configuration

**Status Columns:**

- `📋 Todo` - Items not yet started
- `🔍 Refined` - User stories ready for development
- `🔧 In Progress` - Active work items
- `👀 Review` - Items in code review
- `✅ Done` - Completed items

**Column Limits (Optional):**

- In Progress: 3-5 items per team member
- Review: No more than 2x team size

## Custom Fields Configuration

### Priority Field

1. **Field Name**: "Priority"
2. **Field Type**: Single select
3. **Options**:
   - `P0` (color: `#d73a4a`) - Must-Have
   - `P1` (color: `#fbca04`) - Should-Have
   - `P2` (color: `#0075ca`) - Could-Have

### Type Field

1. **Field Name**: "Type"
2. **Field Type**: Single select
3. **Options**:
   - `Initiative` (color: `#7057ff`) - Strategic Initiative
   - `Epic` (color: `#a2eeef`) - Epic
   - `User Story` (color: `#1d76db`) - User Story
   - `Task` (color: `#0e8a16`) - Development Task

### Effort Field

1. **Field Name**: "Effort"
2. **Field Type**: Number
3. **Purpose**: Story points or hour estimates

### Sprint Field

1. **Field Name**: "Sprint"
2. **Field Type**: Single select
3. **Options**: Sprint 1, Sprint 2, etc. (update as needed)

## Working with Initiatives

### Creating Initiatives

**Via MCP GitHub Server:**

```bash
pair "Create a strategic initiative: '[Initiative Name]' with description '[Description]' and priority P1 in GitHub project"
```

**Manual Creation:**

1. Create GitHub issue with title: "Initiative: [Name]"
2. Add to project board
3. Set Type field to "Initiative"
4. Set appropriate priority (typically P0 or P1)
5. Add detailed description with business context

### Initiative Template

```markdown
# Initiative: [Name]

## Business Objective

[Strategic goal this initiative supports]

## Success Criteria

- [ ] Measurable outcome 1
- [ ] Measurable outcome 2
- [ ] Measurable outcome 3

## Timeline

- Start Date: [Date]
- Target Completion: [Date]
- Key Milestones: [List]

## Epics

- [ ] Epic 1: #[epic_number]
- [ ] Epic 2: #[epic_number]
- [ ] Epic 3: #[epic_number]

## Dependencies

- [Internal/external dependencies]

## Resources

- Team: [Team assignments]
- Budget: [If applicable]
- Tools: [Required tools/services]
```

## Working with Epics

### Creating Epics

**Via MCP GitHub Server:**

```bash
pair "Create an epic: '[Epic Name]' under initiative #[initiative_number] with priority P1"
```

### Epic Breakdown Process

1. **Create Epic Issue**: With clear scope and acceptance criteria
2. **Link to Initiative**: Reference parent initiative
3. **Set Project Fields**: Type=Epic, appropriate Priority
4. **Break Down into Stories**: Create related user stories
5. **Track Progress**: Monitor story completion

### Epic Template

```markdown
# Epic: [Name]

## Description

[What this epic delivers and why it's valuable]

## Parent Initiative

Related to: #[initiative_number]

## User Value

- [Value proposition 1]
- [Value proposition 2]
- [Value proposition 3]

## Acceptance Criteria

- [ ] Functional requirement 1
- [ ] Functional requirement 2
- [ ] Performance requirement
- [ ] User experience requirement

## User Stories

- [ ] Story 1: #[story_number]
- [ ] Story 2: #[story_number]
- [ ] Story 3: #[story_number]

## Definition of Done

- [ ] All user stories completed
- [ ] Integration testing passed
- [ ] User acceptance testing completed
- [ ] Documentation updated
- [ ] Performance requirements met
```

## Progress Tracking

### Project Field Management

**Set Priority via MCP:**

```bash
pair "Set priority P0 for GitHub issue #[issue_number] in project board"
```

**Set Status via Board:**

1. Drag items between columns for status updates
2. Status automatically syncs with issue state
3. Parent items update based on children progress

### Hierarchy Tracking

**Initiative Progress:**

- Calculated based on completed epics
- Visual progress bars in project views
- Automatic status updates

**Epic Progress:**

- Based on user story completion
- Story point aggregation (if using effort field)
- Timeline tracking against milestones

### Velocity Tracking

**Story Points Method:**

1. Assign effort field to user stories
2. Track completion per sprint
3. Calculate team velocity over time
4. Use for sprint planning and forecasting

**Throughput Method:**

1. Count completed stories per sprint
2. Track cycle time (start to done)
3. Monitor lead time (creation to done)
4. Identify bottlenecks and improvements

## Reporting and Insights

### Project Insights

- **Progress Charts**: Built-in GitHub Projects insights
- **Velocity Trends**: Historical completion rates
- **Burndown Charts**: Sprint and release progress
- **Cycle Time**: Time in each status

### Custom Views

- **By Priority**: Filter high-priority items
- **By Type**: Separate views for different item types
- **By Sprint**: Current sprint focus
- **By Assignee**: Individual workload views

### Export and Analytics

```bash
# Export project data for analysis
gh project item-list [project_number] --format json > project_data.json
```

## Automation Rules

### Status Synchronization

- **Assigned → In Progress**: Auto-move when assigned
- **PR Created → Review**: Auto-move when pull request opened
- **PR Merged → Done**: Auto-move when pull request merged

### Parent-Child Updates

- **Child Completed**: Update parent progress
- **All Children Done**: Move parent to Done
- **Child Blocked**: Flag parent for attention

### Sprint Automation

- **Sprint Start**: Auto-assign sprint field
- **Sprint End**: Move incomplete items to next sprint
- **Velocity Calculation**: Auto-update team metrics

## Best Practices

### Board Management

- Regular board cleanup and organization
- Consistent use of custom fields
- Clear column definitions and limits
- Regular review and optimization

### Tracking Hygiene

- Keep items updated and current
- Use consistent sizing/estimation
- Regular velocity reviews
- Archive completed items periodically

### Team Coordination

- Daily board reviews
- Sprint planning using board data
- Retrospectives with board insights
- Stakeholder updates from board reports

## Integration Points

### With Issue Management

**→ See [.pair/knowledge/guidelines/collaboration/issue-management/github-issues.md](.pair/knowledge/guidelines/collaboration/issue-management/github-issues.md)**

- Automatic issue addition to boards
- Label synchronization with custom fields
- Status consistency between issues and board

### With Automation

**→ See [.pair/knowledge/guidelines/collaboration/automation/github-automation.md](.pair/knowledge/guidelines/collaboration/automation/github-automation.md)**

- Automated board updates
- Status synchronization rules
- Progress reporting automation

## Troubleshooting

### Common Issues

- **Field Updates**: Ensure proper permissions for custom fields
- **Automation**: Check project automation settings
- **Performance**: Large projects may need view optimization
- **Sync Issues**: Verify webhook configurations

### Performance Optimization

- Use filters and views for large projects
- Archive completed items regularly
- Limit automation rules to essential updates
- Use project templates for consistency

## Related Topics

- **[.pair/knowledge/guidelines/collaboration/issue-management/github-issues.md](.pair/knowledge/guidelines/collaboration/issue-management/github-issues.md)** - Issue creation and management
- **[.pair/knowledge/guidelines/collaboration/automation/github-automation.md](.pair/knowledge/guidelines/collaboration/automation/github-automation.md)** - Automation setup
- **[.pair/knowledge/guidelines/collaboration/project-management-tool/github-tool.md](.pair/knowledge/guidelines/collaboration/project-management-tool/github-tool.md)** - Overall GitHub configuration

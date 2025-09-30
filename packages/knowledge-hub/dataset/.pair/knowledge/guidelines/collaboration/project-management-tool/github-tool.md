# GitHub Tool Setup and Navigation

Complete setup guide for GitHub-based project management tool and cross-topic navigation hub.

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

2. **Authentication Setup**
- Configure MCP client for GitHub access
- Verify connection through pair assistant

3. **Basic Project Structure**
- Create GitHub Project board
- Configure custom fields (Priority, Type, Status)
- Set up automation rules

## GitHub Tool Usage Across Topics

### Issue Management
**→ See [../issue-management/github-issues.md](../issue-management/github-issues.md)**
- GitHub Issues setup and configuration
- Label management and templates
- Issue workflow automation
- Integration with project boards

### Project Tracking  
**→ See [../project-tracking/github-tracking.md](../project-tracking/github-tracking.md)**
- GitHub Projects board configuration
- Custom fields setup (Priority, Type, Status)
- Progress tracking and reporting
- Hierarchical item management (Initiative → Epic → Story → Task)

### Automation
**→ See [../automation/github-automation.md](../automation/github-automation.md)**
- GitHub Actions workflows
- MCP integration for AI-assisted management
- Status synchronization rules
- Automated project board updates

### Board Management
**→ See [../board-management/github-boards.md](../board-management/github-boards.md)**
- Board layout and column configuration
- Workflow optimization
- Team productivity patterns
- Board performance monitoring

### Communication
**→ See [../communication-protocols/](../communication-protocols/README.md)**
- Pull request workflows and reviews
- GitHub Discussions integration
- Notification management
- Team collaboration patterns

### Estimation Integration
**→ See [../estimation/](../estimation/README.md)**
- GitHub-compatible estimation approaches
- Story point tracking in custom fields
- Velocity calculation and forecasting
- Integration with planning tools

## GitHub Projects Configuration

### Recommended Board Setup

**Status Columns:**
- 📋 Todo - Items not yet started
- 🔍 Refined - User stories ready for development  
- 🔧 In Progress - Active work items
- 👀 Review - Items in code review
- ✅ Done - Completed items

**Custom Fields:**
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

**→ See [../methodology/](../methodology/README.md)**

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

## Related Resources

- **[GitHub Projects Documentation](https://docs.github.com/en/issues/planning-and-tracking-with-projects)**
- **[GitHub Actions Documentation](https://docs.github.com/en/actions)**
- **[MCP GitHub Server Guide](https://github.com/github/github-mcp-server)**
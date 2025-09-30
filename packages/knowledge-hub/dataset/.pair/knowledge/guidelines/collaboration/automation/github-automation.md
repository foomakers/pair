# GitHub Automation

GitHub Actions workflows, MCP integration, and automated project management for streamlined development processes.

## Overview

This guide covers comprehensive automation for GitHub-based project management, including GitHub Actions, MCP server integration, and automated workflows for issues, pull requests, and project boards.

## MCP Server Integration

### Installation and Setup

**Install GitHub MCP Server:**

```bash
# Install via npm
npm install -g @github/github-mcp-server
```

**Configure Authentication:**

- MCP server handles authentication automatically when configured properly
- Ensure MCP client is configured to use GitHub server
- Verify connection through pair assistant

**Test MCP Connection:**

```bash
pair "Check GitHub repository access and verify MCP connection"
```

### MCP-Powered Automation

**Automated Issue Management:**

```bash
# AI-assisted issue creation
pair "Create a user story for [feature] with acceptance criteria and add to project board"

# Smart issue assignment
pair "Assign issue #[number] to the most appropriate team member based on expertise"

# Automated status updates
pair "Update all issues in 'Review' status that have merged PRs to 'Done'"
```

**Project Board Automation:**

```bash
# Bulk board operations
pair "Move all completed user stories from Sprint 1 to Done column"

# Smart prioritization
pair "Analyze current sprint and recommend priority adjustments for overloaded team members"
```

## GitHub Actions Workflows

### Project Management Workflows

**Issue to Project Board Sync:**

```yaml
name: Sync Issue to Project Board
on:
  issues:
    types: [opened, edited, labeled]

jobs:
  sync-to-board:
    runs-on: ubuntu-latest
    steps:
      - name: Add issue to project
        uses: actions/add-to-project@v0.5.0
        with:
          project-url: ${{ vars.PROJECT_URL }}
          github-token: ${{ secrets.PROJECT_TOKEN }}
```

**PR Status Automation:**

```yaml
name: PR Status Automation
on:
  pull_request:
    types: [opened, closed, merged]

jobs:
  update-issue-status:
    runs-on: ubuntu-latest
    steps:
      - name: Move linked issues to Review
        if: github.event.action == 'opened'
        uses: actions/github-script@v7
        with:
          script: |
            // Move linked issues to "Review" status
            const { data: linkedIssues } = await github.rest.issues.listForRepo({
              owner: context.repo.owner,
              repo: context.repo.repo,
              state: 'open'
            });

            // Update project board status for linked issues
```

**Sprint Automation:**

```yaml
name: Sprint Management
on:
  schedule:
    - cron: '0 9 * * MON' # Monday at 9 AM

jobs:
  sprint-planning:
    runs-on: ubuntu-latest
    steps:
      - name: Create new sprint milestone
        uses: actions/github-script@v7
        with:
          script: |
            const sprintNumber = Math.ceil(new Date().getWeek());
            await github.rest.issues.createMilestone({
              owner: context.repo.owner,
              repo: context.repo.repo,
              title: `Sprint ${sprintNumber}`,
              description: `Sprint ${sprintNumber} - Auto-created`,
              due_on: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString()
            });
```

### Branch and Development Automation

**Automated Branch Creation:**

```yaml
name: Create Feature Branch
on:
  issues:
    types: [assigned]

jobs:
  create-branch:
    runs-on: ubuntu-latest
    if: contains(github.event.issue.labels.*.name, 'user story') || contains(github.event.issue.labels.*.name, 'task')
    steps:
      - name: Create branch
        uses: actions/github-script@v7
        with:
          script: |
            const issueNumber = context.issue.number;
            const branchName = `feature/issue-${issueNumber}`;

            await github.rest.git.createRef({
              owner: context.repo.owner,
              repo: context.repo.repo,
              ref: `refs/heads/${branchName}`,
              sha: context.sha
            });
```

**PR Template Automation:**

```yaml
name: Auto PR Template
on:
  pull_request:
    types: [opened]

jobs:
  apply-template:
    runs-on: ubuntu-latest
    steps:
      - name: Apply PR template
        uses: actions/github-script@v7
        with:
          script: |
            const template = `
            ## Description
            Brief description of changes

            ## Related Issues
            Closes #${context.issue.number}

            ## Testing
            - [ ] Unit tests added/updated
            - [ ] Integration tests passed
            - [ ] Manual testing completed

            ## Checklist
            - [ ] Code follows style guidelines
            - [ ] Self-review completed
            - [ ] Documentation updated
            `;

            await github.rest.pulls.update({
              owner: context.repo.owner,
              repo: context.repo.repo,
              pull_number: context.issue.number,
              body: template
            });
```

## Project Board Automation Rules

### Status Synchronization

**Built-in GitHub Project Automation:**

1. **Move to In Progress** when issue is assigned
2. **Move to Review** when pull request is opened
3. **Move to Done** when pull request is merged
4. **Set priority** based on labels

**Custom Automation Rules:**

```yaml
# .github/workflows/project-automation.yml
name: Project Board Automation
on:
  issues:
    types: [opened, closed, assigned, labeled]
  pull_request:
    types: [opened, closed, merged]

jobs:
  update-project:
    runs-on: ubuntu-latest
    steps:
      - name: Update project status
        uses: actions/add-to-project@v0.5.0
        with:
          project-url: ${{ vars.PROJECT_URL }}
          github-token: ${{ secrets.PROJECT_TOKEN }}
          labeled: P0,P1,P2
          label-operator: OR
```

### Parent-Child Status Updates

**Epic Progress Tracking:**

```yaml
name: Epic Progress Update
on:
  issues:
    types: [closed, reopened]

jobs:
  update-epic:
    runs-on: ubuntu-latest
    steps:
      - name: Update parent epic
        uses: actions/github-script@v7
        with:
          script: |
            // Find parent epic from issue body or comments
            // Calculate completion percentage
            // Update epic description with progress
```

## Code Review Automation

### Automated Reviewer Assignment

**Smart Reviewer Assignment:**

```yaml
name: Auto Assign Reviewers
on:
  pull_request:
    types: [opened]

jobs:
  assign-reviewers:
    runs-on: ubuntu-latest
    steps:
      - name: Assign reviewers based on files changed
        uses: actions/github-script@v7
        with:
          script: |
            const { data: files } = await github.rest.pulls.listFiles({
              owner: context.repo.owner,
              repo: context.repo.repo,
              pull_number: context.issue.number
            });

            // Logic to assign reviewers based on file paths
            // Frontend files → frontend team
            // Backend files → backend team
            // Tests → QA team
```

**Review Reminder Automation:**

```yaml
name: Review Reminders
on:
  schedule:
    - cron: '0 10,15 * * MON-FRI' # 10 AM and 3 PM weekdays

jobs:
  remind-reviewers:
    runs-on: ubuntu-latest
    steps:
      - name: Send review reminders
        uses: actions/github-script@v7
        with:
          script: |
            // Find PRs pending review for > 24 hours
            // Send reminder comments to assigned reviewers
```

### Code Quality Automation

**Automated Quality Checks:**

```yaml
name: Code Quality Gate
on:
  pull_request:
    types: [opened, synchronize]

jobs:
  quality-check:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Run linting
        run: npm run lint

      - name: Run tests
        run: npm test

      - name: Check coverage
        run: npm run coverage

      - name: Update PR status
        uses: actions/github-script@v7
        with:
          script: |
            // Update PR status based on quality checks
            // Add quality labels to PR
            // Comment with quality metrics
```

## Notification and Communication Automation

### Smart Notifications

**Stakeholder Updates:**

```yaml
name: Stakeholder Notifications
on:
  issues:
    types: [closed]
  pull_request:
    types: [merged]

jobs:
  notify-stakeholders:
    runs-on: ubuntu-latest
    if: contains(github.event.issue.labels.*.name, 'P0') || contains(github.event.issue.labels.*.name, 'epic')
    steps:
      - name: Notify stakeholders
        uses: actions/github-script@v7
        with:
          script: |
            // Send notifications for high-priority completions
            // Update project status dashboard
            // Generate progress reports
```

**Team Communication:**

```yaml
name: Team Communication
on:
  schedule:
    - cron: '0 9 * * MON' # Monday morning standup prep

jobs:
  standup-prep:
    runs-on: ubuntu-latest
    steps:
      - name: Generate standup report
        uses: actions/github-script@v7
        with:
          script: |
            // Generate weekly progress summary
            // List completed items
            // Identify blockers and upcoming work
            // Post to team communication channel
```

## Metrics and Reporting Automation

### Automated Dashboards

**Velocity Tracking:**

```yaml
name: Velocity Metrics
on:
  schedule:
    - cron: '0 0 * * SUN' # Weekly on Sunday

jobs:
  update-metrics:
    runs-on: ubuntu-latest
    steps:
      - name: Calculate team velocity
        uses: actions/github-script@v7
        with:
          script: |
            // Calculate story points completed
            // Track cycle time and lead time
            // Update metrics dashboard
            // Generate velocity report
```

**Health Monitoring:**

```yaml
name: Project Health Check
on:
  schedule:
    - cron: '0 8 * * MON-FRI' # Daily weekday mornings

jobs:
  health-check:
    runs-on: ubuntu-latest
    steps:
      - name: Analyze project health
        uses: actions/github-script@v7
        with:
          script: |
            // Check for stale issues
            // Identify overdue items
            // Monitor team workload balance
            // Alert on potential risks
```

## Best Practices

### Automation Strategy

- **Start Simple** - Begin with basic status synchronization
- **Iterative Enhancement** - Gradually add more sophisticated automation
- **Team Feedback** - Regular review and adjustment based on team needs
- **Performance Monitoring** - Track automation effectiveness and performance

### Error Handling

- **Graceful Degradation** - Ensure automation failures don't break workflows
- **Logging and Monitoring** - Comprehensive logging for troubleshooting
- **Manual Override** - Always provide manual alternatives
- **Regular Health Checks** - Automated monitoring of automation systems

### Security Considerations

- **Token Management** - Secure storage and rotation of GitHub tokens
- **Permission Scoping** - Minimal necessary permissions for automation
- **Audit Logging** - Track all automated actions for compliance
- **Secret Management** - Proper handling of sensitive configuration

## Troubleshooting

### Common Issues

- **Rate Limiting** - GitHub API rate limits affecting automation
- **Permission Errors** - Insufficient permissions for automation actions
- **Webhook Failures** - Missed or failed webhook deliveries
- **Token Expiration** - Expired or invalid authentication tokens

### Debugging Automation

- **Action Logs** - GitHub Actions logs for workflow debugging
- **Webhook Deliveries** - GitHub webhook delivery logs
- **MCP Diagnostics** - MCP server connection and operation logs
- **Performance Metrics** - Automation execution time and success rates

## Related Topics

- **[.pair/knowledge/guidelines/collaboration/issue-management/github-issues.md](.pair/knowledge/guidelines/collaboration/issue-management/github-issues.md)** - Issue workflows and automation
- **[.pair/knowledge/guidelines/collaboration/project-tracking/github-tracking.md](.pair/knowledge/guidelines/collaboration/project-tracking/github-tracking.md)** - Project board automation
- **[.pair/knowledge/guidelines/collaboration/project-management-tool/github-tool.md](.pair/knowledge/guidelines/collaboration/project-management-tool/github-tool.md)** - Overall GitHub setup and configuration

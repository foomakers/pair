# Project Tracking

Project progress tracking, monitoring, and reporting workflows across different project management tools.

## Overview

This section covers approaches for tracking project progress, monitoring team velocity, and generating insights for project management and stakeholder communication.

## Tool-Specific Implementations

### GitHub Project Tracking

- **[github-tracking.md](github-tracking.md)** - GitHub Projects board and tracking
  - Project board setup and configuration
  - Custom fields for tracking (Priority, Type, Status, Effort)
  - Progress visualization and reporting
  - Hierarchical tracking (Initiative → Epic → Story → Task)
  - Automation rules for status updates

### Filesystem Project Tracking

- **[filesystem-tracking.md](filesystem-tracking.md)** - Local file-based project tracking
  - Directory-based progress tracking
  - File movement for status management
  - Simple reporting with shell scripts
  - Local metrics and velocity calculations

## Core Tracking Concepts

### Hierarchy Management

- **Initiative Tracking** - Strategic objective progress
- **Epic Tracking** - Feature delivery progress
- **Story Tracking** - Sprint and iteration progress
- **Task Tracking** - Individual work item progress

### Progress Metrics

- **Velocity Tracking** - Team delivery rate over time
- **Burndown/Burnup** - Sprint and release progress
- **Cycle Time** - Time from start to completion
- **Lead Time** - Time from request to delivery
- **Throughput** - Items completed per time period

### Status Management

- **Universal States** - Todo, Refined, In Progress, Review, Done
- **Status Synchronization** - Automatic updates based on development activity
- **Parent-Child Status** - Hierarchical status propagation
- **Blocking Identification** - Dependency and impediment tracking

## Reporting and Insights

### Progress Reports

- Sprint/iteration summaries
- Release progress tracking
- Team velocity trends
- Blocking issues and impediments

### Stakeholder Communication

- Executive dashboards
- Team performance metrics
- Project health indicators
- Delivery forecasting

### Continuous Improvement

- Retrospective data analysis
- Process optimization insights
- Team productivity patterns
- Quality and delivery trends

## Integration Points

### With Issue Management

**→ See [../issue-management/](../issue-management/README.md)**

- Issue status integration
- Priority and type tracking
- Work item relationships

### With Estimation

**→ See [../estimation/](../estimation/README.md)**

- Effort tracking and comparison
- Velocity calculation inputs
- Forecasting data integration

### With Board Management

**→ See [../board-management/](../board-management/README.md)**

- Board configuration for tracking
- Workflow optimization
- Visual progress management

### With Automation

**→ See [../automation/](../automation/README.md)**

- Automated progress updates
- Status synchronization
- Reporting automation

## Best Practices

### Data Quality

- Consistent status updates
- Accurate effort tracking
- Regular data validation
- Historical data preservation

### Workflow Integration

- Seamless development integration
- Minimal manual overhead
- Real-time progress updates
- Automated reporting where possible

### Team Adoption

- Clear tracking guidelines
- Training on tracking tools
- Regular review and improvement
- Feedback-driven optimization

## Related Topics

- **[../methodology/](../methodology/README.md)** - Methodology-specific tracking approaches
- **[../project-management-tool/](../project-management-tool/README.md)** - Tool setup and configuration
- **[../board-management.md](../board-management.md)** - Board and backlog management practices

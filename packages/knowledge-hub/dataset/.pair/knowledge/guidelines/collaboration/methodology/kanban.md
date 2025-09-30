# Kanban Method

Visual workflow management system emphasizing continuous flow, work-in-progress limits, and evolutionary improvement through metrics-driven optimization.

## Overview

Kanban is a lean method for managing knowledge work with emphasis on just-in-time delivery and continuous improvement. Teams visualize work on a board, limit work-in-progress to optimize flow, and measure key metrics to drive evolutionary change.

## Core Principles

### Visualize Work

- Make all work visible on a shared board
- Show work items, workflow stages, and current status
- Include work types, priorities, and blockers
- Provide transparency for stakeholders and team members

### Limit Work in Progress (WIP)

- Set explicit limits on concurrent work
- Prevent overloading team members
- Focus on finishing work before starting new items
- Optimize flow and reduce cycle time

### Manage Flow

- Monitor work movement through the system
- Identify and address bottlenecks quickly
- Measure lead time and cycle time
- Optimize for smooth, predictable delivery

### Make Policies Explicit

- Document workflow rules and definitions
- Share quality criteria and acceptance standards
- Clarify role responsibilities and handoff procedures
- Enable informed decision-making across the team

### Feedback Loops

- Regular review of metrics and performance
- Stakeholder feedback on delivered work
- Team retrospectives on process effectiveness
- Continuous adaptation based on learnings

### Evolutionary Change

- Incremental improvements over revolutionary changes
- Respect current processes and roles initially
- Encourage experimentation and adaptation
- Drive change through data and collaboration

## Board Setup

### Basic Kanban Board

```markdown
# Standard Columns

| Backlog  | Selected | In Progress | Review | Done |
| -------- | -------- | ----------- | ------ | ---- |
| Ideas    | Ready    | Doing       | Test   | ✓    |
| Requests | To Do    | Development | Deploy | Ship |
```

### Advanced Board Design

- **Expedite Lane**: Critical/urgent work with special handling
- **Blocked Column**: Items waiting for external dependencies
- **WIP Limits**: Numerical limits shown on each column
- **Swimlanes**: Horizontal divisions by work type or team member

### GitHub Projects Implementation

```markdown
# Kanban Board Configuration

## Custom Fields

- Priority: Blocker/High/Medium/Low
- Type: Feature/Bug/Debt/Spike
- Size: XS/S/M/L/XL
- Assignee: Team member responsible

## Automation Rules

- Auto-move to "In Progress" when PR created
- Auto-move to "Review" when PR ready for review
- Auto-move to "Done" when PR merged
```

## Workflow Management

### Work Item Types

**Features**

- New functionality or user-facing improvements
- Estimated using story points or t-shirt sizing
- Include acceptance criteria and definition of done
- Progress tracked through development stages

**Bugs**

- Defects or issues in existing functionality
- Prioritized based on severity and impact
- Include reproduction steps and acceptance criteria
- Fast-tracked through expedite lane when critical

**Technical Debt**

- Refactoring, architecture improvements, or code cleanup
- Balanced with feature delivery (typically 20-30% of capacity)
- Clear description of problem and proposed solution
- Measured impact on team velocity and code quality

### WIP Limits Guidelines

**Determining WIP Limits**

- Start with team size as initial limit
- Monitor flow and adjust based on metrics
- Set column-specific limits based on workflow bottlenecks
- Review and adjust limits during retrospectives

**Typical WIP Limits**

```markdown
# Example for 5-person team

| Backlog | Selected (5) | In Progress (3) | Review (2) | Done |
| ------- | ------------ | --------------- | ---------- | ---- |
| ∞       | 5 items max  | 3 items max     | 2 items    | ∞    |
```

## Metrics and Measurement

### Key Flow Metrics

**Lead Time**

- Time from work item creation to completion
- Includes waiting time and active work time
- Primary metric for customer value delivery
- Target: Reduce and stabilize lead time

**Cycle Time**

- Time from start of active work to completion
- Excludes backlog waiting time
- Measures team efficiency and productivity
- Target: Optimize for consistent cycle time

**Throughput**

- Number of work items completed per time period
- Measure of team delivery capacity
- Used for forecasting and capacity planning
- Target: Sustainable, predictable throughput

**Flow Efficiency**

- Ratio of active work time to total lead time
- Identifies waste and optimization opportunities
- Typical range: 15-40% in knowledge work
- Target: Improve efficiency through flow optimization

### Cumulative Flow Diagram

**CFD Analysis**

- Visual representation of work flow over time
- Shows work distribution across workflow stages
- Identifies trends, bottlenecks, and flow issues
- Enables data-driven process improvement decisions

**CFD Interpretation**

- Flat areas indicate bottlenecks
- Growing gaps show accumulating work
- Stable bands indicate healthy flow
- Sudden changes require investigation

## Continuous Improvement

### Regular Reviews

**Weekly Flow Review**

- Analyze metrics and flow patterns
- Identify impediments and bottlenecks
- Discuss WIP limit effectiveness
- Plan flow optimization experiments

**Monthly Service Delivery Review**

- Review customer satisfaction and delivery performance
- Analyze trends in lead time and throughput
- Assess process improvement impact
- Plan strategic improvements

### Kaizen Events

**Process Improvement Workshops**

- Focused improvement sessions on specific issues
- Cross-functional participation and perspective
- Rapid experimentation and implementation
- Measurement of improvement impact

**Retrospective Techniques**

- Start-Stop-Continue format for process changes
- Fishbone analysis for root cause identification
- Dot voting for prioritizing improvement opportunities
- Action item tracking and follow-up

## Integration Patterns

### Hybrid Approaches

**Kanban + Scrum (Scrumban)**

- Sprint planning with continuous flow execution
- Regular retrospectives with flow-based metrics
- Story point estimation with cycle time tracking
- Sprint goals with WIP-limited execution

**Kanban + SAFe**

- Program increment planning with continuous delivery
- Epic breakdown with flow-based execution
- Portfolio metrics with team-level flow optimization
- Lean portfolio management with Kanban boards

### Tool Integration

**GitHub Integration**

- Project boards for visual workflow management
- Issue labels for work type and priority
- Automation rules for flow progression
- API integration for metrics collection

**Metrics Dashboard**

```markdown
# Kanban Metrics Tracking

## Weekly Reports

- Lead time trend analysis
- Throughput measurement
- WIP limit compliance
- Blocker frequency and resolution time

## Monthly Analysis

- Flow efficiency calculation
- Customer satisfaction correlation
- Process improvement impact assessment
- Capacity planning and forecasting
```

## Best Practices

### Team Adoption

**Getting Started**

1. **Map current workflow**: Document existing process
2. **Create initial board**: Simple three-column start
3. **Set conservative WIP limits**: Adjust based on experience
4. **Measure baseline metrics**: Establish improvement targets
5. **Iterate and improve**: Regular adjustment and optimization

**Cultural Considerations**

- Emphasize collaboration over individual performance
- Focus on flow optimization over individual productivity
- Encourage experimentation and learning from failures
- Celebrate system improvements and team achievements

### Common Pitfalls

**Avoiding Anti-Patterns**

- **Kanban as task board**: Ensure focus on flow and continuous improvement
- **Ignoring WIP limits**: Enforce limits to optimize flow
- **Metrics without action**: Use data to drive improvement decisions
- **One-size-fits-all**: Adapt Kanban to team context and needs

## Related Documents

- **[../estimation/](../estimation/README.md)** - Flow-based estimation techniques
- **[../project-tracking/](../project-tracking/README.md)** - Metrics collection and analysis
- **[lean.md](lean.md)** - Lean principles underlying Kanban method
- **[methodology-selection-guide.md](methodology-selection-guide.md)** - When to choose Kanban vs other frameworks

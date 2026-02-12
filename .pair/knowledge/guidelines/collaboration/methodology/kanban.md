# Kanban Methodology

## Overview

Visual workflow management system that optimizes flow and delivery through work-in-progress limits, continuous delivery, and evolutionary change while providing maximum flexibility and adaptability to changing requirements.

## Core Principles

### Kanban Principles

#### Start With What You Do Now

- Understand current workflow and process
- Map existing states and handoffs
- Identify current roles and responsibilities
- Begin improvement from current state rather than dramatic change

#### Agree to Pursue Incremental, Evolutionary Change

- Small, continuous improvements rather than revolutionary changes
- Reduce resistance through gradual adaptation
- Test changes and adapt based on results
- Build consensus for change through demonstration of value

#### Respect Current Process, Roles & Responsibilities

- Work within existing organizational structure initially
- Preserve what works while improving what doesn't
- Evolve roles naturally as process improves
- Minimize disruption while maximizing improvement

#### Encourage Acts of Leadership at All Levels

- Empower team members to identify and implement improvements
- Support initiative and experimentation
- Recognize and reward improvement efforts
- Build culture of continuous improvement ownership

### Kanban Practices

#### Visualize Workflow

- Make work and workflow visible through visual management
- Use boards, cards, and swim lanes to represent work states
- Show work items, priorities, and dependencies
- Enable quick understanding of current status and bottlenecks

#### Limit Work in Progress (WIP)

- Set explicit limits on work in each workflow state
- Force completion before starting new work
- Expose bottlenecks and capacity constraints
- Improve focus and reduce multitasking waste

#### Manage Flow

- Monitor and optimize work movement through system
- Identify and eliminate bottlenecks and wait states
- Balance capacity across workflow stages
- Optimize for continuous delivery rather than resource utilization

#### Make Process Policies Explicit

- Define clear criteria for work progression between states
- Document quality standards and definition of done
- Establish escalation and exception handling procedures
- Ensure shared understanding of workflow rules

#### Implement Feedback Loops

- Regular reviews of metrics and flow
- Retrospectives and improvement discussions
- Customer feedback integration
- Continuous measurement and adaptation

#### Improve Collaboratively, Evolve Experimentally

- Data-driven improvement decisions
- Scientific approach to change with hypothesis testing
- Collaborative identification of improvement opportunities
- Safe-to-fail experimentation and learning

## Kanban Board Design

### Basic Board Structure

#### Simple Three-Column Board

```text
| To Do  | Doing  | Done   |
| ------ | ------ | ------ |
| Item 1 | Item 4 | Item 7 |
| Item 2 | Item 5 | Item 8 |
| Item 3 | Item 6 |        |
WIP:  ∞    2      ∞
```

#### Extended Workflow Board

```text
| Backlog | Ready  | Analysis | Development | Review  | Testing | Deploy | Done    |
| ------- | ------ | -------- | ----------- | ------- | ------- | ------ | ------- |
| Item 1  | Item 4 | Item 7   | Item 10     | Item 13 | Item 16 |        | Item 19 |
| Item 2  | Item 5 | Item 8   | Item 11     | Item 14 |         |        | Item 20 |
| Item 3  | Item 6 | Item 9   | Item 12     | Item 15 |         |        |         |
WIP:   ∞     3       2          3           2         1         1        ∞
```

### Advanced Board Features

#### Swim Lanes

```text
Board Organization by:
- Priority (Expedite, High, Standard, Low)
- Work Type (Feature, Bug, Technical Debt)
- Team/Component (Frontend, Backend, API)
- Customer/Project (Client A, Client B, Internal)

Example:
| Ready                 | Dev | Review | Done |
| --------------------- | --- | ------ | ---- |
| [Expedite Swim Lane]  |     |        |      |
| [Feature Swim Lane]   |     |        |      |
| [Bug Fix Swim Lane]   |     |        |      |
| [Tech Debt Swim Lane] |     |        |      |
```

#### Card Information

```text
Kanban Card Contents:
- Title: Brief description of work item
- ID: Unique identifier for tracking
- Type: Category of work (feature, bug, etc.)
- Priority: Relative importance
- Assignee: Person responsible for current work
- Size/Effort: Relative sizing or time estimate
- Due Date: Target completion date if applicable
- Blockers: Dependencies or impediments
- Definition of Done: Completion criteria
```

## Work in Progress (WIP) Limits

### Setting WIP Limits

#### Initial WIP Limit Guidelines

```text
Column Type | Initial WIP Limit
------------|------------------
Input Queue | 1.5 × team size
Active Work | 1 × number of people working in column
Review/Wait | 0.5 × team size
Buffer      | 2-3 items maximum
Output      | Unlimited (or limited by downstream capacity)
```

#### WIP Limit Calculation Example

```text
Team: 5 developers
Board columns: Ready (3) | Development (5) | Review (3) | Testing (2) | Done (∞)

Reasoning:
- Ready: Small queue to prevent work starvation
- Development: One item per developer maximum
- Review: Queue for completed development work
- Testing: Limited to force development completion
- Done: Unlimited to show completed value
```

### WIP Limit Management

#### When WIP Limits Are Reached

```text
Options when column is at WIP limit:
1. Help complete work in downstream columns
2. Pull work from upstream if possible
3. Swarm on blocked items to unblock flow
4. Work on process improvement activities
5. Skill development and cross-training
6. DO NOT: Start new work or increase WIP limits
```

#### WIP Limit Violations

```text
Acceptable violations:
- Expedite/critical items requiring immediate attention
- Discovered defects that must be fixed
- Production issues requiring immediate resolution

Process:
1. Mark violation clearly on board
2. Document reason for violation
3. Prioritize resolving violation
4. Review violation in next retrospective
5. Adjust process to prevent similar violations
```

## Flow Metrics

### Key Kanban Metrics

#### Lead Time

```text
Definition: Time from when work item enters system until it exits
Measurement: Entry date to completion date
Purpose: Customer-facing delivery time
Improvement: Reduce total time in system

Example: Story enters "Ready" on Monday, completes on Friday = 5 days lead time
```

#### Cycle Time

```text
Definition: Time from when work on item begins until work is complete
Measurement: Start of active work to completion
Purpose: Team performance and predictability
Improvement: Reduce time in active work states

Example: Development starts Tuesday, testing completes Thursday = 3 days cycle time
```

#### Throughput

```text
Definition: Number of work items completed per time period
Measurement: Count of items moved to "Done" per week/month
Purpose: Team capacity and delivery rate
Improvement: Increase items completed per period

Example: Team completes 12 stories per week average
```

#### Work in Progress

```text
Definition: Number of items being actively worked on
Measurement: Count of items in active work columns
Purpose: System load and efficiency
Improvement: Minimize WIP while maintaining flow

Example: 8 items currently in Development, Review, and Testing columns
```

### Flow Analytics

#### Cumulative Flow Diagram (CFD)

```text
Chart showing:
- X-axis: Time (days/weeks)
- Y-axis: Cumulative count of work items
- Stacked areas for each workflow state
- Identifies bottlenecks and flow issues

Reading CFD:
- Vertical distance = WIP in that state
- Horizontal distance = Lead time
- Parallel lines = steady flow
- Diverging lines = bottleneck forming
- Flat areas = no flow in that state
```

#### Control Charts

```text
Lead Time Control Chart:
- Plot lead time for each completed item
- Calculate average and control limits
- Identify outliers and trends
- Predict future performance ranges

Cycle Time Control Chart:
- Plot cycle time for each completed item
- Monitor process stability and capability
- Identify special cause variations
- Guide process improvement efforts
```

## Implementation Guidelines

### Getting Started with Kanban

#### Phase 1: Visualization (Week 1-2)

```text
1. Map Current Workflow:
   - Identify all workflow states/stages
   - Document handoffs and dependencies
   - Map roles and responsibilities
   - Understand current pain points

2. Create Initial Board:
   - Start with simple 3-column board (To Do, Doing, Done)
   - Add work items currently in progress
   - Make board visible to entire team
   - Begin daily board updates

3. Establish Baseline:
   - Begin measuring lead time and throughput
   - Document current performance levels
   - Identify initial improvement opportunities
```

#### Phase 2: WIP Limits (Week 3-4)

```text
1. Set Initial WIP Limits:
   - Start with generous limits to avoid resistance
   - Focus on "Doing" column initially
   - Monitor impact on flow and quality
   - Adjust based on observation and data

2. Train Team on WIP Management:
   - Explain rationale for WIP limits
   - Practice limit management scenarios
   - Establish escalation procedures
   - Celebrate successful limit adherence
```

#### Phase 3: Flow Optimization (Month 2-3)

```text
1. Expand Board Detail:
   - Add more workflow columns as needed
   - Implement swim lanes for different work types
   - Add card information and tracking
   - Enhance visual management

2. Implement Flow Metrics:
   - Begin systematic lead time and cycle time tracking
   - Create cumulative flow diagrams
   - Establish regular metrics reviews
   - Use data to guide improvement decisions
```

### Kanban for Different Contexts

#### Software Development Team

```text
Board Design:
Backlog | Ready | Development | Code Review | Testing | Deployment | Done

WIP Limits: ∞ | 3 | 4 | 2 | 2 | 1 | ∞

Policies:
- Items must have acceptance criteria before entering Ready
- Code review required before Testing
- All tests must pass before Deployment
- Definition of Done includes production deployment
```

#### Support Team

```text
Board Design:
New Tickets | Triage | Investigation | Resolution | Verification | Closed

WIP Limits: ∞ | 5 | 3 | 4 | 2 | ∞

Policies:
- Tickets triaged within 4 hours
- High priority issues expedited through system
- Resolution requires customer validation
- Knowledge base updated for recurring issues
```

#### Marketing Team

```text
Board Design:
Ideas | Planned | Creation | Review | Approval | Publishing | Live

WIP Limits: ∞ | 5 | 3 | 2 | 2 | 1 | ∞

Policies:
- Ideas require business case before planning
- Creative work has defined completion criteria
- All content requires review and approval
- Published content tracked for performance
```

## Advanced Kanban Practices

### Service Level Expectations (SLE)

#### SLE Definition

```text
Service Level Expectation: "We will complete 85% of work items in 10 days or less"

Components:
- Probability: 85% (reliability target)
- Duration: 10 days (lead time target)
- Work Item Type: All standard items (scope)

Measurement:
- Track actual lead times for all completed items
- Calculate percentage meeting SLE target
- Report SLE performance regularly to stakeholders
```

#### SLE Management

```text
When SLE is not met:
1. Analyze root causes of longer lead times
2. Identify process improvements to reduce variation
3. Consider adjusting SLE based on realistic capability
4. Communicate performance and improvement plans

When SLE is consistently exceeded:
1. Consider tightening SLE target
2. Take on additional work or scope
3. Invest in process improvement
4. Share successful practices with other teams
```

### Class of Service

#### Service Classes

```text
Expedite:
- Highest priority, bypass normal flow
- No WIP limit, immediate attention
- Examples: Production outages, security issues
- SLE: Complete within 24 hours

Fixed Date:
- Specific deadline requirements
- Planned timing with buffer for uncertainty
- Examples: Regulatory compliance, events
- SLE: Complete by committed date

Standard:
- Normal priority work items
- Regular flow through kanban system
- Examples: Features, improvements
- SLE: 85% in 10 days

Intangible:
- Lower priority, filler work
- Worked on when capacity available
- Examples: Research, learning, debt reduction
- SLE: Best effort, no commitment
```

### Continuous Improvement

#### Kanban Cadences

```text
Daily Standup:
- Focus on flow and impediments
- Identify blocked items and aging work
- Coordinate work and assistance needs
- Brief, 15 minutes maximum

Weekly Flow Review:
- Review metrics and flow health
- Identify bottlenecks and improvement opportunities
- Adjust WIP limits if needed
- Celebrate achievements and learnings

Monthly Service Delivery Review:
- Review SLE performance and trends
- Analyze customer satisfaction and feedback
- Discuss capacity and demand management
- Plan service improvements

Quarterly Retrospective:
- Comprehensive process review
- Major improvement planning
- Tool and practice evolution
- Team development and skills assessment
```

#### Improvement Kata

```text
Scientific Improvement Process:
1. Define Target Condition: What do we want to achieve?
2. Understand Current Condition: Where are we now?
3. Identify Next Steps: What should we try next?
4. Experiment: Test the hypothesis
5. Learn: What did we learn from the experiment?
6. Adapt: How do we adjust based on learning?

Example:
Target: Reduce lead time to 7 days (from current 12 days)
Hypothesis: Reducing WIP in Development will improve flow
Experiment: Reduce Development WIP from 5 to 3 for 2 weeks
Result: Lead time reduced to 9 days, but throughput decreased slightly
Learning: Some WIP reduction helps, but too aggressive reduces throughput
Next: Try WIP limit of 4 and focus on bottleneck in Review column
```

## Tools and Technology

### Digital Kanban Tools

#### Tool Selection Criteria

```text
Essential Features:
- Visual board with customizable columns
- WIP limit enforcement and warnings
- Card detail and attachment support
- Basic flow metrics (lead time, cycle time)
- Team collaboration features

Advanced Features:
- Cumulative flow diagrams
- Control charts and analytics
- Service level expectation tracking
- Integration with development tools
- Automated workflow rules

Popular Tools:
- Jira with Kanban board
- Azure DevOps Boards
- Trello with power-ups
- GitHub Projects
- Lean Kit, Kanbanize, SwiftKanban
```

#### Physical vs. Digital Boards

```text
Physical Board Advantages:
- High visibility and team awareness
- Tactile interaction and engagement
- No technology dependencies
- Easy for co-located teams

Digital Board Advantages:
- Remote team accessibility
- Automated metrics and reporting
- Integration with other tools
- Historical data and analytics
- Scalability for large teams

Hybrid Approach:
- Physical board for daily team interaction
- Digital board for metrics and remote access
- Regular synchronization between boards
- Best of both approaches
```

Kanban provides a flexible, evolutionary approach to workflow management that emphasizes continuous improvement, flow optimization, and customer value delivery through visual management and empirical process control.
